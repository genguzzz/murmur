// Sync to a folder the user picks in the Files app — normally in their iCloud Drive, so
// iCloud carries it to their other devices. Layout inside the folder:
//   Murmur/journal.json   entries, chats, to-dos, pending items, deletions (SyncSnapshot)
//   Murmur/audio/<file>   recordings, copied once
// Every sync reads the remote journal, merges it into local state (newer edits win,
// deletions stick), writes the merged result back, then moves missing audio both ways.
// No iCloud entitlement: it's plain file access through a security-scoped bookmark
// (modules/murmur-cloud), so re-signing the IPA doesn't break it.
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import Cloud from "../../modules/murmur-cloud";
import { logger } from "./log";
import { track } from "./track";
import { allIds, audioFile, buildSnapshot, getState, mergeSnapshot, newId, updateSettings, type CloudPrefs, type SyncSnapshot } from "./store";

const log = logger("cloud");
const DIR = "Murmur/";
const KEEP_DELETIONS_DAYS = 180;

export function cloudAvailable(): boolean {
  return Platform.OS === "ios" && !!Cloud;
}

// ---------- status (in memory) ----------

export type CloudStatus = { phase: "idle" | "syncing" | "error"; detail?: string };
let status: CloudStatus = { phase: "idle" };
const listeners = new Set<() => void>();
function setStatus(s: CloudStatus) {
  status = s;
  listeners.forEach((l) => l());
}
export function useCloudStatus(): CloudStatus {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => status);
}

// ---------- folder ----------

let openedFor: string | null = null;

function prefs(): CloudPrefs | undefined {
  return getState().settings.cloud;
}

function patchPrefs(p: Partial<CloudPrefs>) {
  const cur = prefs();
  if (cur) updateSettings({ cloud: { ...cur, ...p } });
}

async function ensureOpen(p: CloudPrefs) {
  if (openedFor === p.bookmark) return;
  const r = await Cloud!.open(p.bookmark);
  openedFor = r.bookmark ?? p.bookmark;
  if (r.bookmark) patchPrefs({ bookmark: r.bookmark });
}

async function readRemote(): Promise<SyncSnapshot | null> {
  const text = await Cloud!.readText(`${DIR}journal.json`);
  if (!text) return null;
  const snap = JSON.parse(text) as SyncSnapshot;
  if (snap.format !== 1) throw new Error("同步文件夹里的数据格式不受支持，请更新 App");
  return snap;
}

export interface FolderInfo {
  name: string;
  iCloud: boolean;
  remote: { at: string; entries: number; todos: number; chats: number; fromThisDevice: boolean } | null;
}

// Pick (or re-pick) the folder. Returns what's already in it so the UI can say
// "found N records from another device, they'll be merged".
export async function connectFolder(): Promise<FolderInfo | null> {
  const picked = await Cloud!.pickFolder();
  if (!picked) return null;
  const device = prefs()?.device ?? newId();
  updateSettings({ cloud: { bookmark: picked.bookmark, name: picked.name, iCloud: picked.iCloud, device, known: [] } });
  openedFor = picked.bookmark;
  track("cloud_connect", { iCloud: picked.iCloud });
  log.info("folder connected", { iCloud: picked.iCloud });
  const remote = await readRemote().catch(() => null);
  return {
    name: picked.name,
    iCloud: picked.iCloud,
    remote: remote ? { at: remote.at, entries: remote.entries.length, todos: remote.todos.length, chats: remote.chats.length, fromThisDevice: remote.device === device } : null,
  };
}

export async function disconnectFolder() {
  await Cloud?.close().catch(() => {});
  openedFor = null;
  updateSettings({ cloud: undefined });
  setStatus({ phase: "idle" });
  track("cloud_disconnect");
}

// ---------- sync ----------

let running: Promise<void> | null = null;
let again = false;

// Single flight: a request during a sync runs once more after it.
export function syncNow(reason: string): Promise<void> {
  if (!cloudAvailable() || !prefs()) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce(reason);
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncOnce(reason: string) {
  const p = prefs();
  if (!p) return;
  const started = Date.now();
  setStatus({ phase: "syncing", detail: "正在同步…" });
  try {
    await ensureOpen(p);

    // 1. Merge what other devices wrote.
    const remote = await readRemote();
    let deleted: Record<string, string> = {};
    let merged = { added: 0, updated: 0, removed: 0 };
    if (remote) {
      const r = mergeSnapshot(remote, new Set(p.known));
      deleted = r.deleted;
      merged = r;
    }
    const cutoff = new Date(Date.now() - KEEP_DELETIONS_DAYS * 86400_000).toISOString();
    deleted = Object.fromEntries(Object.entries(deleted).filter(([, at]) => at > cutoff));

    // 2. Write the merged journal back.
    await Cloud!.writeText(`${DIR}journal.json`, JSON.stringify(buildSnapshot(p.device, deleted)));

    // 3. Recordings: upload new ones, fetch ones this device lacks, drop orphans.
    const s = getState();
    const wanted = new Set([...s.entries, ...s.inbox].map((x) => x.audioFile).filter((f): f is string => !!f));
    const there = new Map((await Cloud!.list(`${DIR}audio`)).map((f) => [f.name, f.size]));
    let up = 0;
    let down = 0;
    for (const name of wanted) {
      const local = audioFile(name);
      if (local.exists && !there.has(name)) {
        setStatus({ phase: "syncing", detail: `正在上传录音（${up + 1}）…` });
        await Cloud!.copyIn(local.uri, `${DIR}audio/${name}`);
        up += 1;
      } else if (!local.exists && there.has(name)) {
        setStatus({ phase: "syncing", detail: `正在下载录音（${down + 1}）…` });
        await Cloud!.copyOut(`${DIR}audio/${name}`, local.uri);
        down += 1;
      }
    }
    for (const name of there.keys()) if (!wanted.has(name)) await Cloud!.remove(`${DIR}audio/${name}`);

    patchPrefs({ known: allIds(), lastSyncAt: new Date().toISOString(), lastError: undefined });
    setStatus({ phase: "idle" });
    log.info("synced", { reason, ms: Date.now() - started, ...merged, up, down });
    track("cloud_sync", { reason, ms: Date.now() - started, added: merged.added, updated: merged.updated, removed: merged.removed, up, down, ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    openedFor = null; // re-open next time; the folder may have moved or lost access
    patchPrefs({ lastError: message });
    setStatus({ phase: "error", detail: message });
    log.error("sync failed", { reason, err: e });
    track("cloud_sync", { reason, ok: false, error: message.slice(0, 60) });
  }
}
