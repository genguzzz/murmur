// Local-first store: entries, chats and settings live in one JSON file in the
// app's documents dir (localStorage on web). Audio files sit next to it in audio/.
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as api from "./api";
import { logger } from "./log";
import { countWords, dayKey } from "./format";

const log = logger("store");

export type EntryStatus = "transcribing" | "analyzing" | "done" | "failed";

export interface Entry {
  id: string;
  createdAt: string;
  kind: "voice" | "text";
  status: EntryStatus;
  error?: string;
  audioFile?: string; // file name inside audio/
  durationSec?: number;
  prompt?: string; // question the user was answering
  followUpOf?: string; // entry id whose follow-up this answers
  rawText?: string;
  text?: string;
  title?: string;
  summary?: string;
  mood?: string;
  moodLabel?: string;
  themes?: string[];
  followUp?: string;
  followUpDone?: boolean;
  insight?: string;
  words?: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  at: string;
  error?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface Settings {
  server: string;
  token: string;
  language: "auto" | "zh" | "en";
  name: string;
}

export interface InsightsCache {
  at: string;
  entryCount: number;
  data: api.Insights;
}

interface State {
  entries: Entry[];
  chats: Chat[];
  settings: Settings;
  insights?: InsightsCache;
}

const DEFAULT_STATE: State = {
  entries: [],
  chats: [],
  settings: { server: api.DEFAULT_SERVER, token: "", language: "auto", name: "" },
};

let state: State = DEFAULT_STATE;
let loaded = false;
const listeners = new Set<() => void>();

const isWeb = Platform.OS === "web";
const STORAGE_KEY = "murmur-state-v1";

function dataFile(): File {
  return new File(Paths.document, "murmur.json");
}

export function audioDir(): Directory {
  const d = new Directory(Paths.document, "audio");
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

export function audioFile(name: string): File {
  return new File(audioDir(), name);
}

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ---------- persistence ----------

export async function loadState(): Promise<void> {
  try {
    let raw: string | null = null;
    if (isWeb) raw = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    else if (dataFile().exists) raw = await dataFile().text();
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<State>;
      state = {
        ...DEFAULT_STATE,
        ...parsed,
        settings: { ...DEFAULT_STATE.settings, ...parsed.settings },
      };
    }
    log.info("state loaded", { entries: state.entries.length, chats: state.chats.length, hasToken: !!state.settings.token });
  } catch (e) {
    log.error("state load failed", e);
  }
  loaded = true;
  api.configureApi(state.settings);
  emit();
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void save(), 300);
}

async function save() {
  saveTimer = null;
  const raw = JSON.stringify(state);
  try {
    if (isWeb) globalThis.localStorage?.setItem(STORAGE_KEY, raw);
    else {
      // Write to a temp file then swap, so a crash mid-write can't corrupt the journal.
      const tmp = new File(Paths.document, "murmur.json.tmp");
      if (tmp.exists) tmp.delete();
      tmp.create();
      await tmp.write(raw);
      const f = dataFile();
      if (f.exists) f.delete();
      tmp.move(f);
    }
  } catch (e) {
    log.error("state save failed", e);
  }
}

function emit() {
  for (const l of listeners) l();
}

function setState(fn: (s: State) => State) {
  state = fn(state);
  emit();
  scheduleSave();
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

export function useLoaded(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => loaded,
  );
}

export function getState(): State {
  return state;
}

// ---------- settings ----------

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  api.configureApi(state.settings);
  log.info("settings updated", { keys: Object.keys(patch), hasToken: !!state.settings.token, server: state.settings.server });
}

// ---------- entries ----------

function patchEntry(id: string, patch: Partial<Entry>) {
  setState((s) => ({ ...s, entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
}

export function getEntry(id: string): Entry | undefined {
  return state.entries.find((e) => e.id === id);
}

export function sortedEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createVoiceEntry(opts: { id: string; audioFile: string; durationSec: number; prompt?: string; followUpOf?: string }): Entry {
  const entry: Entry = { ...opts, createdAt: new Date().toISOString(), kind: "voice", status: "transcribing" };
  setState((s) => ({ ...s, entries: [entry, ...s.entries] }));
  log.info("voice entry created", { id: entry.id, durationSec: opts.durationSec, prompt: !!opts.prompt });
  if (opts.followUpOf) patchEntry(opts.followUpOf, { followUpDone: true });
  void processEntry(entry.id);
  return entry;
}

export function createTextEntry(text: string, opts: { prompt?: string; followUpOf?: string } = {}): Entry {
  const entry: Entry = { id: newId(), createdAt: new Date().toISOString(), kind: "text", status: "analyzing", rawText: text, ...opts };
  setState((s) => ({ ...s, entries: [entry, ...s.entries] }));
  log.info("text entry created", { id: entry.id, chars: text.length });
  if (opts.followUpOf) patchEntry(opts.followUpOf, { followUpDone: true });
  void processEntry(entry.id);
  return entry;
}

export function deleteEntry(id: string) {
  const e = getEntry(id);
  if (e?.audioFile && !isWeb) {
    try {
      const f = audioFile(e.audioFile);
      if (f.exists) f.delete();
    } catch (err) {
      log.warn("audio delete failed", { id, err });
    }
  }
  setState((s) => ({ ...s, entries: s.entries.filter((x) => x.id !== id) }));
  log.info("entry deleted", { id });
}

export function markFollowUpDone(id: string) {
  patchEntry(id, { followUpDone: true });
}

const running = new Set<string>();

// Transcribe (voice only) then analyze. Safe to call again for retry/resume.
export async function processEntry(id: string): Promise<void> {
  if (running.has(id)) return;
  running.add(id);
  const t0 = Date.now();
  try {
    let e = getEntry(id);
    if (!e) return;
    if (e.kind === "voice" && !e.rawText) {
      patchEntry(id, { status: "transcribing", error: undefined });
      const uri = isWeb ? e.audioFile! : audioFile(e.audioFile!).uri;
      const t = await api.transcribe(uri, state.settings.language);
      log.info("transcribed", { id, chars: t.text.length, lang: t.language, dropped: t.droppedSegments, audioSec: t.duration });
      if (!t.text.trim()) {
        patchEntry(id, { status: "failed", error: "没有识别到说话内容" });
        return;
      }
      patchEntry(id, { rawText: t.text });
    }
    e = getEntry(id)!;
    patchEntry(id, { status: "analyzing", error: undefined });
    const recent = sortedEntries(state.entries)
      .filter((x) => x.id !== id && x.status === "done")
      .slice(0, 8)
      .map((x) => ({ date: dayKey(x.createdAt), title: x.title ?? "", summary: x.summary ?? "" }));
    const a = await api.analyze({ text: e.rawText!, prompt: e.prompt, recent });
    patchEntry(id, {
      status: "done",
      title: a.title,
      summary: a.summary,
      text: a.cleaned_text || e.rawText,
      mood: a.mood,
      moodLabel: a.mood_label,
      themes: a.themes,
      followUp: a.follow_up,
      insight: a.insight,
      words: countWords(a.cleaned_text || e.rawText || ""),
    });
    log.info("entry processed", { id, ms: Date.now() - t0, mood: a.mood });
  } catch (err) {
    log.error("entry processing failed", { id, ms: Date.now() - t0, err });
    patchEntry(id, { status: "failed", error: api.describeError(err) });
  } finally {
    running.delete(id);
  }
}

// On launch, finish anything that was interrupted (app killed mid-request).
export function resumePending() {
  const stuck = state.entries.filter((e) => e.status === "transcribing" || e.status === "analyzing");
  if (stuck.length) log.info("resuming entries", { ids: stuck.map((e) => e.id) });
  for (const e of stuck) void processEntry(e.id);
}

// ---------- insights ----------

export function entriesContext(withText: boolean): api.EntryContext[] {
  return sortedEntries(state.entries)
    .filter((e) => e.status === "done")
    .reverse()
    .map((e) => ({
      date: dayKey(e.createdAt),
      title: e.title ?? "",
      summary: e.summary ?? "",
      mood: e.moodLabel,
      themes: e.themes,
      ...(withText ? { text: e.text } : {}),
    }));
}

export async function refreshInsights(): Promise<void> {
  const ctx = entriesContext(false);
  const data = await api.insights(ctx);
  setState((s) => ({ ...s, insights: { at: new Date().toISOString(), entryCount: ctx.length, data } }));
}

// ---------- chats ----------

export function createChat(): Chat {
  const now = new Date().toISOString();
  const chat: Chat = { id: newId(), title: "新对话", createdAt: now, updatedAt: now, messages: [] };
  setState((s) => ({ ...s, chats: [chat, ...s.chats] }));
  return chat;
}

export function deleteChat(id: string) {
  setState((s) => ({ ...s, chats: s.chats.filter((c) => c.id !== id) }));
}

function patchChat(id: string, fn: (c: Chat) => Chat) {
  setState((s) => ({ ...s, chats: s.chats.map((c) => (c.id === id ? fn(c) : c)) }));
}

export async function sendChat(chatId: string, content: string): Promise<void> {
  const now = new Date().toISOString();
  patchChat(chatId, (c) => ({
    ...c,
    title: c.messages.length === 0 ? content.slice(0, 18) : c.title,
    updatedAt: now,
    messages: [...c.messages.filter((m) => !m.error), { role: "user", content, at: now }],
  }));
  const chat = state.chats.find((c) => c.id === chatId)!;
  try {
    const { reply } = await api.chat(
      chat.messages.map((m) => ({ role: m.role, content: m.content })),
      entriesContext(true),
    );
    patchChat(chatId, (c) => ({ ...c, updatedAt: new Date().toISOString(), messages: [...c.messages, { role: "assistant", content: reply, at: new Date().toISOString() }] }));
  } catch (err) {
    log.error("chat failed", { chatId, err });
    patchChat(chatId, (c) => ({ ...c, messages: [...c.messages, { role: "assistant", content: api.describeError(err), at: new Date().toISOString(), error: true }] }));
  }
}

// ---------- export / wipe ----------

export function exportJson(): string {
  const { settings, ...rest } = state;
  return JSON.stringify({ exportedAt: new Date().toISOString(), ...rest, settings: { ...settings, token: undefined } }, null, 2);
}

export function wipeAll() {
  if (!isWeb) {
    try {
      const d = new Directory(Paths.document, "audio");
      if (d.exists) d.delete();
    } catch (e) {
      log.warn("audio wipe failed", e);
    }
  }
  setState((s) => ({ ...DEFAULT_STATE, settings: s.settings }));
  log.warn("all data wiped");
}

// Short summary for log uploads (no journal content).
export function debugSummary() {
  const byStatus: Record<string, number> = {};
  for (const e of state.entries) byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
  return {
    entries: state.entries.length,
    byStatus,
    failed: state.entries.filter((e) => e.status === "failed").slice(0, 10).map((e) => ({ id: e.id, error: e.error, kind: e.kind })),
    chats: state.chats.length,
    server: state.settings.server,
    hasToken: !!state.settings.token,
    language: state.settings.language,
  };
}
