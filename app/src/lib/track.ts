// Usage events (埋点): small, content-free counters about what was used and how it
// went, batched to the server's /v1/events so behaviour can be checked without
// asking for a log upload. Never put journal text, transcripts or titles in props.
import { AppState } from "react-native";
import * as api from "./api";
import { logger, onLogError, sessionId } from "./log";

const log = logger("track");

type Props = Record<string, string | number | boolean | null | undefined>;

const MAX_QUEUE = 500;
const BATCH = 200;
let queue: api.TrackEvent[] = [];
let enabled = true;
let timer: ReturnType<typeof setTimeout> | null = null;
let sending = false;

export function setTrackingEnabled(v: boolean) {
  enabled = v;
  if (!v) queue = [];
}

export function track(event: string, props?: Props) {
  if (!enabled) return;
  const p: api.TrackEvent["p"] = {};
  if (props) for (const [k, v] of Object.entries(props)) if (v !== undefined) p[k] = typeof v === "string" ? v.slice(0, 120) : v;
  queue.push({ e: event, t: new Date().toISOString(), s: sessionId, ...(props ? { p } : {}) });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  if (!timer) timer = setTimeout(() => void flushEvents(), 30_000);
}

// Times an async operation and records `${event}` with ok/ms (and the error code on failure).
export async function timed<T>(event: string, fn: () => Promise<T>, props?: Props): Promise<T> {
  const t0 = Date.now();
  try {
    const r = await fn();
    track(event, { ...props, ok: true, ms: Date.now() - t0 });
    return r;
  } catch (e) {
    const code = (e as { code?: string })?.code ?? (e as Error)?.name ?? "error";
    track(event, { ...props, ok: false, ms: Date.now() - t0, code: String(code) });
    throw e;
  }
}

export async function flushEvents(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!enabled || sending || !queue.length || !api.hasToken()) return;
  sending = true;
  const batch = queue.slice(0, BATCH);
  try {
    await api.sendEvents(batch);
    queue = queue.slice(batch.length);
  } catch (e) {
    log.debug("event upload failed, will retry", { n: batch.length, err: api.describeError(e) });
  } finally {
    sending = false;
    if (queue.length && !timer) timer = setTimeout(() => void flushEvents(), 60_000);
  }
}

let installed = false;

export function installTracking() {
  if (installed) return;
  installed = true;
  onLogError((tag) => track("error", { area: tag }));
  AppState.addEventListener("change", (s) => {
    track("app_state", { state: s });
    if (s === "background") void flushEvents();
  });
}
