import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config } from "./config.ts";
import { transcribe, UpstreamError } from "./groq.ts";
import { analyzeEntry, chat, insightsFor, RefusalError, semanticSearch } from "./claude.ts";
import { briefFor, detectIntent } from "./todos.ts";
import { AgentRequest, runAgent, type AgentEvent } from "./agent.ts";
import { publishIpa, PublishConflict } from "./publish.ts";
import { listUpdates, manifestResponse, storeUpdate } from "./updates.ts";

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
  if (err instanceof PublishConflict) {
    req.log.warn({ err: err.message }, "publish rejected");
    return reply.code(409).send({ error: "version_conflict", detail: err.message });
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

app.post("/v1/search", async (req) => {
  const body = z.object({ query: z.string().min(1), entries: z.array(EntryCtx.extend({ index: z.number() })).min(1) }).parse(req.body);
  const { results, meta } = await semanticSearch(body.query, body.entries);
  req.log.info({ claude: meta, entries: body.entries.length, hits: results.length }, "search");
  return { results };
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

app.post("/v1/intent", async (req) => {
  const body = z
    .object({
      text: z.string().min(1),
      now: z.string().min(1),
      tz: z.string().default(""),
      hint: z.enum(["auto", "todo"]).default("auto"),
      openTodos: z.array(z.object({ index: z.number(), title: z.string(), due: z.string().optional() })).default([]),
      defaults: z.object({ morning: z.string(), evening: z.string() }).default({ morning: "09:00", evening: "20:00" }),
    })
    .parse(req.body);
  const { intent, meta } = await detectIntent(body);
  req.log.info({ claude: meta, chars: body.text.length, hint: body.hint, kind: intent.kind, todos: intent.todos.length, completes: intent.completes.length }, "intent");
  return intent;
});

app.post("/v1/brief", async (req) => {
  const body = z
    .object({
      now: z.string().min(1),
      name: z.string().optional(),
      todos: z.array(z.object({ index: z.number(), title: z.string(), due: z.string().optional(), overdueDays: z.number().optional(), ageDays: z.number(), postponed: z.number().optional() })).default([]),
      done: z.array(z.object({ title: z.string(), when: z.string() })).default([]),
      entries: z.array(z.object({ date: z.string(), title: z.string(), summary: z.string(), mood: z.string().optional() })).default([]),
    })
    .parse(req.body);
  const { brief, meta } = await briefFor(body);
  req.log.info({ claude: meta, todos: body.todos.length, entries: body.entries.length }, "brief");
  return brief;
});

// The agent (capture from Home, or a chat turn). Streams NDJSON: step/route/text events,
// then one done (or error) line. Errors after the stream starts can't change the status,
// so they're sent as an error event.
app.post("/v1/agent", async (req, reply) => {
  const body = AgentRequest.parse(req.body);
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache", "x-accel-buffering": "no", "x-request-id": req.id });
  const send = (ev: AgentEvent) => {
    if (!res.writableEnded) res.write(`${JSON.stringify(ev)}\n`);
  };
  // Keep proxies from closing a quiet connection while the model thinks.
  const ping = setInterval(() => res.write("\n"), 15_000);
  try {
    const { result, meta } = await runAgent(body, send);
    send({ t: "done", result: { ...result } });
    req.log.info({ agent: meta, mode: body.mode, hint: body.hint, route: result.route, ops: result.ops.map((o) => o.op), todos: body.todos.length, entries: body.entries.length, turns: body.messages.length }, "agent");
  } catch (err) {
    const e = err as { message?: string; status?: number };
    const code = err instanceof RefusalError ? "refused" : err instanceof Anthropic.RateLimitError ? "claude_rate_limited" : err instanceof Anthropic.APIError ? "claude_error" : "internal";
    req.log.error({ err: e.message, status: e.status, mode: body.mode }, "agent failed");
    send({ t: "error", code, message: String(e.message ?? err).slice(0, 300) });
  } finally {
    clearInterval(ping);
    res.end();
  }
});

// Usage events (埋点) from the app: content-free names + small props, one JSONL file per day.
const EventProp = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);
app.post("/v1/events", async (req) => {
  const body = z
    .object({ events: z.array(z.object({ e: z.string().max(80), t: z.string().max(40), s: z.string().max(20), p: z.record(z.string().max(40), EventProp).optional() })).max(500) })
    .parse(req.body);
  if (!body.events.length) return { ok: true };
  const dir = path.join(config.dataDir, "events");
  await mkdir(dir, { recursive: true });
  const app_ = String(req.headers["x-app-version"] ?? "").slice(0, 60);
  const lines = body.events.map((ev) => JSON.stringify({ ...ev, v: app_ })).join("\n") + "\n";
  await appendFile(path.join(dir, `${new Date().toISOString().slice(0, 10)}.jsonl`), lines);
  return { ok: true };
});

// Quick look at a day's events: counts per name, failures, and the latest few.
app.get("/admin/events", async (req) => {
  const q = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), name: z.string().optional() }).parse(req.query);
  const day = q.day ?? new Date().toISOString().slice(0, 10);
  const raw = await readFile(path.join(config.dataDir, "events", `${day}.jsonl`), "utf8").catch(() => "");
  const events = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as { e: string; p?: Record<string, unknown> });
  const counts: Record<string, { n: number; failed: number }> = {};
  for (const ev of events) {
    const c = (counts[ev.e] ??= { n: 0, failed: 0 });
    c.n += 1;
    if (ev.p?.ok === false) c.failed += 1;
  }
  return { day, total: events.length, counts, latest: (q.name ? events.filter((e) => e.e === q.name) : events).slice(-30) };
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
      build: z.string().default("0"),
      name: z.string(),
      minIos: z.string().default("15.1"),
      notes: z.string().default(""),
      force: z.string().optional(),
    })
    .parse(fields);
  if (!ipa) throw Object.assign(new Error("missing ipa"), { statusCode: 400 });
  const out = await publishIpa({ ...meta, force: meta.force === "1", ipa, icon });
  req.log.info({ ...meta, bytes: ipa.length, ...out }, "published");
  return out;
});

// ---------- Expo Updates (OTA) ----------

// Public: the app's expo-updates client polls this on launch.
app.get("/updates/manifest", async (req, reply) => {
  const h = req.headers;
  const platform = String(h["expo-platform"] ?? "");
  const runtimeVersion = String(h["expo-runtime-version"] ?? "");
  const current = typeof h["expo-current-update-id"] === "string" ? h["expo-current-update-id"] : undefined;
  reply.header("expo-protocol-version", "1").header("expo-sfv-version", "0").header("cache-control", "private, max-age=0");
  if (platform !== "ios" && platform !== "android") return reply.code(400).send({ error: "bad expo-platform" });
  if (String(h["expo-protocol-version"] ?? "0") !== "1") return reply.code(406).send({ error: "protocol v1 only" });
  const res = await manifestResponse({ platform, runtimeVersion, currentUpdateId: current, accept: String(h.accept ?? "") });
  req.log.info({ platform, runtimeVersion, current, served: res?.updateId ?? null, embedded: h["expo-embedded-update-id"] }, "updates manifest");
  if (!res) return reply.code(204).send();
  return reply.type(res.contentType).send(res.body);
});

// CI/tutu → publish an OTA update (tar.gz of `expo export` + expoConfig.json).
app.post("/admin/updates", async (req) => {
  const fields: Record<string, string> = {};
  let tarball: Buffer | null = null;
  for await (const part of req.parts()) {
    if (part.type === "file") tarball = await part.toBuffer();
    else fields[part.fieldname] = String(part.value);
  }
  const meta = z.object({ runtimeVersion: z.string(), message: z.string().default(""), commit: z.string().default("") }).parse(fields);
  if (!tarball) throw Object.assign(new Error("missing bundle"), { statusCode: 400 });
  const rec = await storeUpdate({ ...meta, tarball });
  req.log.info({ id: rec.id, runtimeVersion: rec.runtimeVersion, platforms: Object.keys(rec.manifests), bytes: tarball.length, message: rec.message }, "update published");
  return { id: rec.id, createdAt: rec.createdAt, platforms: Object.keys(rec.manifests) };
});

app.get("/admin/updates", async (req) => {
  const { runtimeVersion } = z.object({ runtimeVersion: z.string() }).parse(req.query);
  return (await listUpdates(runtimeVersion)).map((u) => ({ id: u.id, createdAt: u.createdAt, message: u.message, commit: u.commit, platforms: Object.keys(u.manifests) }));
});

app.get("/", async (_req: FastifyRequest, reply: FastifyReply) => reply.send("murmur"));

await app.listen({ port: config.port, host: config.host });
