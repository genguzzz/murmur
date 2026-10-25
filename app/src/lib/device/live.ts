// Live Activity (Dynamic Island + Lock Screen) for recording and playback. The
// widget ticks the clock itself; we only push state changes (start, pause, resume,
// seek, end). Every call is best-effort: a missing module or disabled Live
// Activities must never break recording.
import { Platform } from "react-native";
import MurmurLive, { type LiveState } from "../../../modules/murmur-live";
import { log } from "./core";
import { track } from "../track";

type Kind = "record" | "play";
const current: Record<Kind, string | null> = { record: null, play: null };
const lastState: Record<Kind, LiveState | null> = { record: null, play: null };

export function liveSupported(): boolean {
  if (Platform.OS !== "ios" || !MurmurLive) return false;
  try {
    return MurmurLive.isSupported();
  } catch {
    return false;
  }
}

const nowSec = () => Date.now() / 1000;

async function push(kind: Kind, state: LiveState) {
  if (!liveSupported()) return;
  lastState[kind] = state;
  try {
    if (current[kind]) await MurmurLive!.update(current[kind]!, state);
    else {
      current[kind] = await MurmurLive!.start(kind, state);
      track("live_activity", { kind, action: "start" });
    }
  } catch (e) {
    log.warn("live activity failed", { kind, err: e });
    track("live_activity", { kind, action: "error" });
  }
}

async function finish(kind: Kind, final: LiveState | null, immediate: boolean) {
  const id = current[kind];
  current[kind] = null;
  lastState[kind] = null;
  if (!id || !MurmurLive) return;
  try {
    await MurmurLive.end(id, final, immediate);
  } catch (e) {
    log.warn("live activity end failed", { kind, err: e });
  }
}

// ---------- recording ----------

export function liveRecording(opts: { elapsedSec: number; paused: boolean; prompt?: string; todo?: boolean }) {
  return push("record", {
    mode: opts.paused ? "recordingPaused" : "recording",
    title: opts.paused ? "录音已暂停" : opts.todo ? "正在录制待办" : "正在录音",
    subtitle: opts.prompt ?? "Murmur",
    anchor: nowSec() - opts.elapsedSec,
    elapsed: opts.elapsedSec,
    duration: 0,
  });
}

export function endLiveRecording(saved: boolean) {
  const s = lastState.record;
  return finish("record", saved && s ? { ...s, mode: "recordingPaused", title: "已保存", subtitle: "正在整理录音…" } : null, !saved);
}

// ---------- playback ----------

// The widget's clock runs in wall time, so at 1.5× the timeline is scaled to match.
export function livePlayback(opts: { title: string; subtitle: string; positionSec: number; durationSec: number; playing: boolean; rate?: number }) {
  const rate = opts.rate && opts.rate > 0 ? opts.rate : 1;
  return push("play", {
    mode: opts.playing ? "playing" : "playbackPaused",
    title: opts.title,
    subtitle: rate === 1 ? opts.subtitle : `${opts.subtitle} · ${rate}×`,
    anchor: nowSec() - opts.positionSec / rate,
    elapsed: opts.positionSec / rate,
    duration: opts.durationSec / rate,
  });
}

export function endLivePlayback() {
  return finish("play", null, true);
}

// On launch: drop activities a crash or force-quit left on screen.
export function clearStaleLiveActivities() {
  if (Platform.OS === "ios" && MurmurLive) MurmurLive.endAll().catch(() => {});
}
