import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config } from "./config.ts";
import { transcribe, UpstreamError } from "./groq.ts";
import { analyzeEntry, chat, insightsFor, RefusalError } from "./claude.ts";
import { publishIpa } from "./publish.ts";

const app = Fastify({
  // JSON lines to journald: `journalctl -u murmur -o cat | grep <reqId>`
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  bodyLimit: 8 * 1024 * 1024,
  // The app sends its own X-Request-Id so client and server logs line up.
  genReqId: (req) => {
    const h = req.headers["x-request-id"];
    return typeof h === "string" && /^[\w-]{6,64}$/.test(h) ? h : randomUUID().slice(0, 12);
  },
  requestIdLogLabel: "rid",
  disableRequestLogging: true,
});

await app.register(multipart, { limits: { fileSize: 200 * 1024 * 1024, files: 2 } });

app.addHook("onRequest", async (req, reply) => {
  reply.header("x-request-id", req.id);
  req.log.info({ method: req.method, url: req.url, ua: req.headers["user-agent"], appVersion: req.headers["x-app-version"] }, "req");
});
app.addHook("onResponse", async (req, reply) => {
  req.log.info({ status: reply.statusCode, ms: Math.round(reply.elapsedTime) }, "res");
});

function tokenOk(req: FastifyRequest, expected: string): boolean {
  const auth = req.headers.authorization ?? "";
  const got = Buffer.from(auth.startsWith("Bearer ") ? auth.slice(7) : "");
  const want = Buffer.from(expected);
  return got.length === want.length && timingSafeEqual(got, want);
}

// Per-token fixed-window limiter: keeps a leaked app token from burning the API keys.
const windows = new Map<string, { start: number; n: number }>();
function rateLimited(key: string, perMinute: number): boolean {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start > 60_000) {
    windows.set(key, { start: now, n: 1 });
    return false;
  }
  w.n += 1;
  return w.n > perMinute;
}

app.addHook("preHandler", async (req, reply) => {
  if (req.url.startsWith("/v1/")) {
    if (!tokenOk(req, config.appToken)) return reply.code(401).send({ error: "unauthorized" });
    if (rateLimited("app", 40)) return reply.code(429).send({ error: "rate_limited" });
  } else if (req.url.startsWith("/admin/")) {
    if (!tokenOk(req, config.adminToken)) return reply.code(401).send({ error: "unauthorized" });
  }
});

app.setErrorHandler((err: unknown, req, reply) => {
  if (err instanceof z.ZodError) {
    req.log.warn({ issues: err.issues }, "bad request body");
    return reply.code(400).send({ error: "bad_request", detail: err.issues.slice(0, 5) });
  }
  if (err instanceof RefusalError) {
    req.log.warn({ err: err.message }, "claude refusal");
    return reply.code(422).send({ error: "refused", detail: err.message });
  }
  if (err instanceof UpstreamError) {
    req.log.error({ upstream: err.upstream, status: err.status, err: err.message }, "upstream error");
    return reply.code(502).send({ error: `${err.upstream}_error`, status: err.status, detail: err.message.slice(0, 300) });
  }
  if (err instanceof Anthropic.RateLimitError) {
    req.log.error({ err: err.message }, "claude rate limited");
    return reply.code(503).send({ error: "claude_rate_limited" });
  }
  if (err instanceof Anthropic.APIError) {
    req.log.error({ status: err.status, err: err.message, claudeRid: err.requestID }, "claude api error");
    return reply.code(502).send({ error: "claude_error", status: err.status, detail: err.message.slice(0, 300) });
  }
  if (err instanceof SyntaxError) {
    req.log.error({ err: err.message }, "unparseable model output");
    return reply.code(502).send({ error: "bad_model_output" });
  }
  const e = err as { statusCode?: number; message?: string; stack?: string };
  req.log.error({ err: e.message, stack: e.stack }, "unhandled");
  return reply.code(e.statusCode ?? 500).send({ error: "internal", detail: e.message });
});

// ---------- routes ----------

app.get("/health", async () => ({ ok: true, model: config.claudeModel, asr: config.groqModel }));
app.get("/v1/ping", async () => ({ ok: true, time: new Date().toISOString() }));

app.post("/v1/transcribe", async (req) => {
  let audio: Buffer | null = null;
  let filename = "audio.m4a";
  let mime = "audio/m4a";
  let language: string | undefined;
  for await (const part of req.parts()) {
    if (part.type === "file" && part.fieldname === "audio") {
      audio = await part.toBuffer();
      filename = part.filename || filename;
      mime = part.mimetype || mime;
    } else if (part.type === "field" && part.fieldname === "language") {
      language = String(part.value);
    }
  }
  if (!audio || audio.length === 0) throw Object.assign(new Error("missing audio"), { statusCode: 400 });
  const started = Date.now();
  const t = await transcribe(audio, filename, mime, language);
  req.log.info({ bytes: audio.length, mime, language, chars: t.text.length, audioSec: t.duration, dropped: t.droppedSegments, ms: Date.now() - started }, "transcribed");
  return t;
});

const EntryCtx = z.object({
  date: z.string(),
  title: z.string(),
  summary: z.string(),
  mood: z.string().optional(),
  themes: z.array(z.string()).optional(),
  text: z.string().optional(),
});

app.post("/v1/analyze", async (req) => {
  const body = z
    .object({
      text: z.string().min(1),
      prompt: z.string().optional(),
      recent: z.array(EntryCtx.pick({ date: true, title: true, summary: true })).default([]),
    })
    .parse(req.body);
  const { analysis, meta } = await analyzeEntry(body);
  req.log.info({ claude: meta, chars: body.text.length }, "analyzed");
  return analysis;
});

app.post("/v1/insights", async (req) => {
  const body = z.object({ entries: z.array(EntryCtx).min(1) }).parse(req.body);
  const { insights, meta } = await insightsFor(body.entries);
  req.log.info({ claude: meta, entries: body.entries.length }, "insights");
  return insights;
});

app.post("/v1/chat", async (req) => {
  const body = z
    .object({
      messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) })).min(1),
      entries: z.array(EntryCtx).default([]),
    })
    .parse(req.body);
  const { reply, meta } = await chat(body);
  req.log.info({ claude: meta, turns: body.messages.length, entries: body.entries.length }, "chat");
  return { reply };
});

// Debug log upload from Settings → 上传日志. Stored as <id>.log + <id>.json.
app.post("/v1/logs", async (req) => {
  const fields: Record<string, string> = {};
  let log: Buffer | null = null;
  for await (const part of req.parts()) {
    if (part.type === "file") log = await part.toBuffer();
    else fields[part.fieldname] = String(part.value);
  }
  if (!log) throw Object.assign(new Error("missing log file"), { statusCode: 400 });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const id = `${stamp}-${randomUUID().slice(0, 6)}`;
  const dir = path.join(config.dataDir, "logs");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${id}.log`), log);
  await writeFile(path.join(dir, `${id}.json`), JSON.stringify({ id, receivedAt: new Date().toISOString(), rid: req.id, ...fields }, null, 2));
  req.log.info({ logId: id, bytes: log.length, note: fields.note }, "log uploaded");
  return { id };
});

// CI → publish an unsigned IPA into the software source.
app.post("/admin/publish", async (req) => {
  const fields: Record<string, string> = {};
  let ipa: Buffer | null = null;
  let icon: Buffer | null = null;
  for await (const part of req.parts()) {
    if (part.type === "file" && part.fieldname === "ipa") ipa = await part.toBuffer();
    else if (part.type === "file" && part.fieldname === "icon") icon = await part.toBuffer();
    else if (part.type === "field") fields[part.fieldname] = String(part.value);
  }
  const meta = z
    .object({
      bundleId: z.string(),
      version: z.string(),
      name: z.string(),
      minIos: z.string().default("15.1"),
      notes: z.string().default(""),
    })
    .parse(fields);
  if (!ipa) throw Object.assign(new Error("missing ipa"), { statusCode: 400 });
  const out = await publishIpa({ ...meta, ipa, icon });
  req.log.info({ ...meta, bytes: ipa.length, ...out }, "published");
  return out;
});

app.get("/", async (_req: FastifyRequest, reply: FastifyReply) => reply.send("murmur"));

await app.listen({ port: config.port, host: config.host });
