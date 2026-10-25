import { Platform } from "react-native";
import * as Application from "expo-application";
import { File, Paths } from "expo-file-system";
import { logger } from "./log";
import { runningLabel } from "./updates";
import type { TodoDraft } from "./todo";

const log = logger("api");

export const DEFAULT_SERVER = "https://voice.gugenzzz.top";

let server = DEFAULT_SERVER;
let token = "";
export function configureApi(opts: { server: string; token: string }) {
  server = opts.server.replace(/\/+$/, "") || DEFAULT_SERVER;
  token = opts.token.trim();
}
export function hasToken() {
  return token.length > 0;
}

export const appVersion = `${Application.nativeApplicationVersion ?? "dev"}(${Application.nativeBuildVersion ?? "0"}) ${runningLabel()}`;

export class ApiError extends Error {
  status: number;
  code: string;
  rid: string;
  constructor(status: number, code: string, message: string, rid: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.rid = rid;
  }
}

function rid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// Human-readable message for UI; the raw details go to the log.
export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return "访问令牌无效，请在设置中检查";
    if (e.code === "timeout") return "请求超时，请检查网络";
    if (e.status === 0) return `无法连接服务器：${e.message}`;
    if (e.status === 429) return "请求过于频繁，请稍后重试";
    if (e.code === "groq_error") return "语音识别服务暂时不可用";
    if (e.code.startsWith("claude")) return "AI 服务暂时不可用";
    return `服务器错误（${e.status} ${e.code}）`;
  }
  return e instanceof Error ? e.message : String(e);
}

async function request<T>(path: string, init: { method?: string; json?: unknown; form?: FormData; timeoutMs?: number; tag?: string; quiet?: boolean }): Promise<T> {
  const id = rid();
  const url = `${server}${path}`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 60_000);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "x-request-id": id,
    "x-app-version": `${appVersion} ${Platform.OS} ${Platform.Version}`,
  };
  if (init.json !== undefined) headers["content-type"] = "application/json";
  if (!init.quiet) log.info(`→ ${init.method ?? "GET"} ${path}`, { rid: id, tag: init.tag });
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers,
      body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = controller.signal.aborted;
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    (init.quiet ? log.warn : log.error)(`✗ ${path} failed before response`, { rid: id, ms: Date.now() - started, aborted, err: e });
    throw new ApiError(0, aborted ? "timeout" : "network", aborted ? "请求超时" : detail, id);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  const ms = Date.now() - started;
  if (!res.ok) {
    let code = "http_error";
    try {
      code = (JSON.parse(text) as { error?: string }).error ?? code;
    } catch {}
    (init.quiet ? log.warn : log.error)(`✗ ${path} ${res.status}`, { rid: id, ms, body: text.slice(0, 500) });
    throw new ApiError(res.status, code, text.slice(0, 200), id);
  }
  if (!init.quiet) log.info(`← ${path} ${res.status}`, { rid: id, ms, bytes: text.length });
  return JSON.parse(text) as T;
}

// ---------- endpoints ----------

export interface Transcript {
  text: string;
  language: string | null;
  duration: number | null;
  droppedSegments: number;
}

export async function transcribe(fileUri: string, language: string): Promise<Transcript> {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(fileUri)).blob();
    form.append("audio", blob, "audio.webm");
  } else {
    // Expo's global fetch (expo/fetch) can't send RN-style {uri} parts; an
    // expo-file-system File implements bytes() and is encoded as a file part.
    form.append("audio", new File(fileUri) as unknown as Blob, "audio.m4a");
  }
  form.append("language", language);
  return request<Transcript>("/v1/transcribe", { method: "POST", form, timeoutMs: 180_000, tag: "transcribe" });
}

export interface Analysis {
  title: string;
  summary: string;
  cleaned_text: string;
  mood: string;
  mood_label: string;
  themes: string[];
  follow_up: string;
  insight: string;
  insight_title?: string;
  reflection?: string;
  action?: string;
  quote?: string;
}

export function analyze(body: { text: string; prompt?: string; recent: { date: string; title: string; summary: string }[] }) {
  return request<Analysis>("/v1/analyze", { method: "POST", json: body, timeoutMs: 120_000, tag: "analyze" });
}

export interface EntryContext {
  date: string;
  title: string;
  summary: string;
  mood?: string;
  themes?: string[];
  text?: string;
}

export interface Insights {
  headline: string;
  body: string;
  patterns: { title: string; detail: string }[];
  people?: { name: string; detail: string }[];
  recurring?: { title: string; detail: string; count: number }[];
  suggestion: string;
}

export function insights(entries: EntryContext[]) {
  return request<Insights>("/v1/insights", { method: "POST", json: { entries }, timeoutMs: 180_000, tag: "insights" });
}

export function search(query: string, entries: (EntryContext & { index: number })[]) {
  return request<{ results: { index: number; reason: string }[] }>("/v1/search", { method: "POST", json: { query, entries }, timeoutMs: 60_000, tag: "search" });
}

export function chat(messages: { role: "user" | "assistant"; content: string }[], entries: EntryContext[]) {
  return request<{ reply: string }>("/v1/chat", { method: "POST", json: { messages, entries }, timeoutMs: 180_000, tag: "chat" });
}

export interface Intent {
  kind: "note" | "todo" | "mixed";
  todos: TodoDraft[];
  completes: { index: number; reason: string }[];
  reply: string;
}

export interface IntentRequest {
  text: string;
  now: string;
  tz: string;
  hint: "auto" | "todo";
  openTodos: { index: number; title: string; due?: string }[];
  defaults: { morning: string; evening: string };
}

export function intent(body: IntentRequest) {
  return request<Intent>("/v1/intent", { method: "POST", json: body, timeoutMs: 60_000, tag: "intent" });
}

export interface Brief {
  headline: string;
  body: string;
  focus: { index: number; why: string }[];
  nudges: { index: number; text: string; action: "tomorrow" | "done" | "open" | "split" }[];
}

export interface BriefRequest {
  now: string;
  name?: string;
  todos: { index: number; title: string; due?: string; overdueDays?: number; ageDays: number; postponed?: number }[];
  done: { title: string; when: string }[];
  entries: { date: string; title: string; summary: string; mood?: string }[];
}

export function brief(body: BriefRequest) {
  return request<Brief>("/v1/brief", { method: "POST", json: body, timeoutMs: 60_000, tag: "brief" });
}

// ---------- agent (streamed) ----------

export type AgentRoute = "journal" | "todo" | "chat" | "pending";
export type AgentRepeat = "none" | "daily" | "weekdays" | "weekly" | "monthly";

export interface AgentTodoFields {
  title: string;
  note: string;
  date: string;
  time: string;
  repeat: AgentRepeat;
  priority: "normal" | "high";
  lead?: number;
}

export type AgentOp =
  | { op: "todo.create"; ref: string; todo: AgentTodoFields; ask?: { question: string; options: { label: string; date: string; time: string }[] } }
  | { op: "todo.update"; id: string; patch: Partial<AgentTodoFields> }
  | { op: "todo.complete"; id: string }
  | { op: "todo.reopen"; id: string }
  | { op: "todo.delete"; id: string }
  | { op: "entry.create"; text: string };

export interface AgentResult {
  route?: AgentRoute;
  continues?: string;
  title?: string;
  pending?: { title: string; reason: string };
  reply: string;
  ops: AgentOp[];
  analysis?: Analysis;
}

export type AgentEvent =
  | { t: "step"; id: string; label: string; state: "run" | "done" | "fail" }
  | { t: "route"; route: AgentRoute; continues: string; title: string }
  | { t: "text"; delta: string }
  | { t: "done"; result: AgentResult }
  | { t: "error"; code: string; message: string };

export interface AgentRequest {
  mode: "capture" | "chat";
  now: string;
  tz: string;
  name?: string;
  defaults: { morning: string; evening: string };
  todos: { id: string; title: string; note?: string; date?: string; time?: string; repeat: AgentRepeat; priority: "normal" | "high"; lead?: number; done: boolean }[];
  entries: { id: string; date: string; title: string; summary: string; mood?: string; themes?: string[]; text?: string }[];
  transcript?: string;
  source?: "voice" | "text";
  hint?: "auto" | "todo" | "journal";
  prompt?: string;
  threadId?: string;
  messages?: { role: "user" | "assistant"; content: string }[];
}

// Streaming UTF-8 decode; Hermes normally has TextDecoder, this covers it if not.
function utf8Decoder(): { decode: (b: Uint8Array, o?: { stream: boolean }) => string } {
  if (typeof TextDecoder !== "undefined") return new TextDecoder();
  let carry: number[] = [];
  return {
    decode(bytes) {
      const all = [...carry, ...bytes];
      let end = all.length;
      // Hold back an incomplete trailing sequence for the next chunk.
      for (let i = Math.max(0, all.length - 3); i < all.length; i++) {
        const b = all[i];
        const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
        if (need > 1 && i + need > all.length) {
          end = i;
          break;
        }
      }
      carry = all.slice(end);
      let out = "";
      for (let i = 0; i < end; ) {
        const b = all[i];
        const len = b < 0x80 ? 1 : b < 0xe0 ? 2 : b < 0xf0 ? 3 : 4;
        let cp = len === 1 ? b : b & (0xff >> (len + 1));
        for (let k = 1; k < len; k++) cp = (cp << 6) | (all[i + k] & 0x3f);
        i += len;
        out += String.fromCodePoint(cp);
      }
      return out;
    },
  };
}

// POST /v1/agent and feed each NDJSON event to `onEvent` as it arrives. Resolves with
// the final result; a server-side `error` event becomes an ApiError.
export async function agent(body: AgentRequest, onEvent: (ev: AgentEvent) => void): Promise<AgentResult> {
  const id = rid();
  const path = "/v1/agent";
  const started = Date.now();
  const controller = new AbortController();
  // Long, because a chat turn can search the web; reset on every event received.
  let timer = setTimeout(() => controller.abort(), 90_000);
  const bump = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), 90_000);
  };
  log.info(`→ POST ${path}`, { rid: id, mode: body.mode, hint: body.hint });
  let result: AgentResult | null = null;
  let failure: ApiError | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    let ev: AgentEvent;
    try {
      ev = JSON.parse(line) as AgentEvent;
    } catch {
      return;
    }
    if (ev.t === "done") result = ev.result;
    else if (ev.t === "error") failure = new ApiError(502, ev.code, ev.message, id);
    else onEvent(ev);
  };
  try {
    const res = await fetch(`${server}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "x-request-id": id, "x-app-version": `${appVersion} ${Platform.OS} ${Platform.Version}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      let code = "http_error";
      try {
        code = (JSON.parse(text) as { error?: string }).error ?? code;
      } catch {}
      log.error(`✗ ${path} ${res.status}`, { rid: id, ms: Date.now() - started, body: text.slice(0, 500) });
      throw new ApiError(res.status, code, text.slice(0, 200), id);
    }
    const reader = res.body?.getReader();
    if (reader) {
      const decoder = utf8Decoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bump();
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          handle(buf.slice(0, nl));
          buf = buf.slice(nl + 1);
        }
      }
      handle(buf);
    } else {
      // No streaming body (shouldn't happen with expo/fetch): parse it all at the end.
      for (const line of (await res.text()).split("\n")) handle(line);
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const aborted = controller.signal.aborted;
    log.error(`✗ ${path} failed`, { rid: id, ms: Date.now() - started, aborted, err: e });
    throw new ApiError(0, aborted ? "timeout" : "network", aborted ? "请求超时" : e instanceof Error ? e.message : String(e), id);
  } finally {
    clearTimeout(timer);
  }
  if (failure) {
    log.error(`✗ ${path} agent error`, { rid: id, ms: Date.now() - started, code: (failure as ApiError).code });
    throw failure;
  }
  if (!result) throw new ApiError(0, "network", "连接已中断", id);
  const r = result as AgentResult;
  log.info(`← ${path}`, { rid: id, ms: Date.now() - started, route: r.route, ops: r.ops.length });
  return r;
}

export interface TrackEvent {
  e: string;
  t: string;
  s: string;
  p?: Record<string, string | number | boolean | null>;
}

export function sendEvents(events: TrackEvent[]) {
  return request<{ ok: boolean }>("/v1/events", { method: "POST", json: { events }, timeoutMs: 20_000, tag: "events", quiet: true });
}

export function ping() {
  return request<{ ok: boolean; time: string }>("/v1/ping", { timeoutMs: 15_000, tag: "ping" });
}

export async function uploadLogs(log: string, fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (Platform.OS === "web") {
    form.append("log", new Blob([log], { type: "text/plain" }), "app.log");
  } else {
    // RN FormData uploads files by uri, so stage the text in the cache dir first.
    const file = new File(Paths.cache, "upload.log");
    if (file.exists) file.delete();
    file.create();
    await file.write(log);
    form.append("log", file as unknown as Blob, "app.log");
  }
  return request<{ id: string }>("/v1/logs", { method: "POST", form, timeoutMs: 60_000, tag: "logs" });
}
