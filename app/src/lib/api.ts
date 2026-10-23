import { Platform } from "react-native";
import * as Application from "expo-application";
import { File, Paths } from "expo-file-system";
import { logger } from "./log";

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

export const appVersion = `${Application.nativeApplicationVersion ?? "dev"}(${Application.nativeBuildVersion ?? "0"})`;

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
    if (e.status === 401) return "访问令牌不对，请到设置里检查";
    if (e.code === "timeout") return "请求超时，请检查网络";
    if (e.status === 0) return `请求没发出去：${e.message}`;
    if (e.status === 429) return "请求太频繁，稍后再试";
    if (e.code === "groq_error") return "语音识别服务出错了";
    if (e.code.startsWith("claude")) return "AI 服务暂时出错了";
    return `服务器出错（${e.status} ${e.code}）`;
  }
  return e instanceof Error ? e.message : String(e);
}

async function request<T>(path: string, init: { method?: string; json?: unknown; form?: FormData; timeoutMs?: number; tag?: string }): Promise<T> {
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
  log.info(`→ ${init.method ?? "GET"} ${path}`, { rid: id, tag: init.tag });
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
    log.error(`✗ ${path} failed before response`, { rid: id, ms: Date.now() - started, aborted, err: e });
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
    log.error(`✗ ${path} ${res.status}`, { rid: id, ms, body: text.slice(0, 500) });
    throw new ApiError(res.status, code, text.slice(0, 200), id);
  }
  log.info(`← ${path} ${res.status}`, { rid: id, ms, bytes: text.length });
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
  suggestion: string;
}

export function insights(entries: EntryContext[]) {
  return request<Insights>("/v1/insights", { method: "POST", json: { entries }, timeoutMs: 180_000, tag: "insights" });
}

export function chat(messages: { role: "user" | "assistant"; content: string }[], entries: EntryContext[]) {
  return request<{ reply: string }>("/v1/chat", { method: "POST", json: { messages, entries }, timeoutMs: 180_000, tag: "chat" });
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
