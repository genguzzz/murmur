// Local-first store: entries, chats and settings live in one JSON file in the
// app's documents dir (localStorage on web). Audio files sit next to it in audio/.
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as api from "./api";
import { logger } from "./log";
import { setTrackingEnabled, timed, track } from "./track";
import { nowWall, setAppZone } from "./zone";
import { countWords, dayKey } from "./format";
import { scheduleRemember, syncTodoReminders, type CheckinPrefs } from "./notify";
import { addDays, dueLabel, isOverdue, localNow, nextOccurrence, overdueDays, sortTodos, timeZone, today, type Todo, type TodoDraft } from "./todo";
import { endRun, isWatched, notify, registerUndo, runUndo, startRun, stepRun, updateRun, type NoticeAction } from "./runs";

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
  waveform?: number[]; // 0..1 loudness bars for the player (from recording, or learned on first play)
  prompt?: string; // question the user was answering
  followUpOf?: string; // entry id whose follow-up this answers
  threadId?: string; // root entry this one adds to ("补充" / follow-up answers)
  routed?: boolean; // the agent already decided where this memo goes
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
  insightTitle?: string;
  reflection?: string;
  action?: string;
  quote?: string;
  words?: number;
  keepOnHome?: boolean; // pinned to Home's "回头再看"
  returnAt?: string; // resurfaces on Home from this time
  mode?: "todo"; // recorded from the to-do tab: lean towards making tasks
  intentChecked?: boolean; // legacy (pre-agent): note-vs-todo detection already ran
  skipIntent?: boolean; // legacy: user said "this is a note"
}

// Waiting on the user. "unclear": the agent couldn't tell what a memo was for (a test,
// a fragment) and parked it with `title`/`reason`. "todo"/"mixed": legacy to-do drafts
// from before the agent, confirmed on /confirm/[id].
export interface PendingIntent {
  id: string;
  createdAt: string;
  kind: "todo" | "mixed" | "unclear";
  title?: string;
  reason?: string;
  source: "voice" | "text";
  text: string;
  reply: string;
  drafts: TodoDraft[];
  completes: { todoId: string; title: string; reason: string }[];
  journalId?: string;
  audioFile?: string;
  durationSec?: number;
  prompt?: string;
}

export interface BriefCache {
  key: string;
  at: string;
  data: api.Brief;
  ids: string[]; // brief index → todo id
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  at: string;
  error?: boolean;
  pending?: boolean; // reply still streaming in
  voice?: boolean; // question spoken from Home
  ops?: string[]; // what the agent changed this turn, one line each
  undoId?: string; // in-memory undo handle for those changes
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
  lockEnabled: boolean;
  lockBiometrics: boolean;
  lockDelaySec: number;
  theme: "system" | "light" | "dark";
  look: "original" | "glasses" | "beret";
  checkins: CheckinPrefs;
  todoAllDayTime: string; // reminder time for to-dos with a date but no time
  analytics: boolean; // upload usage events (no content) to the server
  playbackRate: number; // last speed chosen in the player
  timeZone: string | null; // pinned IANA zone for dates/reminders; null = follow the phone
  memberSince?: string;
}

export interface InsightsCache {
  at: string;
  entryCount: number;
  sig?: string; // insightsSignature() when generated
  data: api.Insights;
}

interface State {
  entries: Entry[];
  chats: Chat[];
  settings: Settings;
  insights?: InsightsCache;
  todos: Todo[];
  inbox: PendingIntent[];
  brief?: BriefCache;
}

const DEFAULT_STATE: State = {
  entries: [],
  chats: [],
  todos: [],
  inbox: [],
  settings: { server: api.DEFAULT_SERVER, token: "", language: "auto", name: "", lockEnabled: false,
    lockBiometrics: false,
    lockDelaySec: 60,
    theme: "system",
    look: "original",
    checkins: { morning: { enabled: false, time: "08:30" }, evening: { enabled: false, time: "21:30" }, remember: false },
    todoAllDayTime: "09:00",
    analytics: true,
    playbackRate: 1,
    timeZone: null,
  },
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

// `beforeReady` runs after the state is read but before screens render (used to lock first).
// Idempotent: a background task may call it while the UI launch is already loading.
let loading: Promise<void> | null = null;
export function loadState(beforeReady?: () => void): Promise<void> {
  loading ??= readState(beforeReady);
  return loading;
}

async function readState(beforeReady?: () => void): Promise<void> {
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
      // A reply that was streaming when the app died won't finish now.
      state.chats = state.chats.map((c) => (c.messages.some((m) => m.pending) ? { ...c, messages: c.messages.map((m) => (m.pending ? { ...m, pending: false, error: !m.content, content: m.content || "上次回答未完成，请重新提问" } : m)) } : c));
    }
    log.info("state loaded", { entries: state.entries.length, chats: state.chats.length, todos: state.todos.length, inbox: state.inbox.length, hasToken: !!state.settings.token });
  } catch (e) {
    log.error("state load failed", e);
  }
  if (!state.settings.memberSince) {
    const first = state.entries.reduce<string | undefined>((m, e) => (!m || e.createdAt < m ? e.createdAt : m), undefined);
    state = { ...state, settings: { ...state.settings, memberSince: first ?? new Date().toISOString() } };
    scheduleSave();
  }
  api.configureApi(state.settings);
  setTrackingEnabled(state.settings.analytics);
  setAppZone(state.settings.timeZone);
  beforeReady?.();
  loaded = true;
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
      tmp.moveSync(dataFile(), { overwrite: true });
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
  setTrackingEnabled(state.settings.analytics);
  setAppZone(state.settings.timeZone);
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

// The thread an entry belongs to is named after its first entry.
export function rootOf(id: string): string {
  return getEntry(id)?.threadId ?? id;
}

export function createVoiceEntry(opts: { id: string; audioFile: string; durationSec: number; waveform?: number[]; prompt?: string; followUpOf?: string; threadId?: string; mode?: "todo" }): Entry {
  const threadId = opts.threadId ? rootOf(opts.threadId) : opts.followUpOf ? rootOf(opts.followUpOf) : undefined;
  const entry: Entry = { ...opts, threadId, createdAt: new Date().toISOString(), kind: "voice", status: "transcribing" };
  setState((s) => ({ ...s, entries: [entry, ...s.entries] }));
  log.info("voice entry created", { id: entry.id, durationSec: opts.durationSec, prompt: !!opts.prompt });
  track("entry_created", { kind: "voice", sec: Math.round(opts.durationSec), mode: opts.mode ?? "note", prompt: !!opts.prompt });
  if (opts.followUpOf) patchEntry(opts.followUpOf, { followUpDone: true });
  void processEntry(entry.id);
  return entry;
}

export function createTextEntry(text: string, opts: { prompt?: string; followUpOf?: string; threadId?: string; routed?: boolean } = {}): Entry {
  const threadId = opts.threadId ? rootOf(opts.threadId) : opts.followUpOf ? rootOf(opts.followUpOf) : undefined;
  const entry: Entry = { id: newId(), createdAt: new Date().toISOString(), kind: "text", status: "analyzing", rawText: text, ...opts, threadId };
  setState((s) => ({ ...s, entries: [entry, ...s.entries] }));
  log.info("text entry created", { id: entry.id, chars: text.length });
  track("entry_created", { kind: "text", chars: text.length, prompt: !!opts.prompt });
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

export function setWaveform(id: string, waveform: number[]) {
  patchEntry(id, { waveform });
  log.info("waveform saved", { id, bars: waveform.length });
}

export function markFollowUpDone(id: string) {
  patchEntry(id, { followUpDone: true });
}

export function setKeepOnHome(id: string, keep: boolean) {
  patchEntry(id, { keepOnHome: keep, ...(keep ? {} : { returnAt: undefined }) });
  log.info("keep on home", { id, keep });
}

export function setReturnAt(id: string, at: string | undefined) {
  patchEntry(id, { returnAt: at });
  log.info("return at", { id, at });
}

export function editEntry(id: string, patch: { title?: string; text?: string }) {
  patchEntry(id, { ...patch, ...(patch.text !== undefined ? { words: countWords(patch.text) } : {}) });
  log.info("entry edited", { id, fields: Object.keys(patch) });
}

// Re-run the AI pass on the existing transcript.
export function reanalyze(id: string) {
  // Only the journal pass: never re-route an entry the user already has.
  patchEntry(id, { status: "analyzing", error: undefined, routed: true });
  void processEntry(id);
}

// Entries Home should bring back: pinned ones and those whose return time has come.
export function comeBackEntries(entries: Entry[], now = Date.now()): Entry[] {
  return sortedEntries(entries).filter((e) => e.keepOnHome || (e.returnAt && new Date(e.returnAt).getTime() <= now));
}

export async function semanticSearch(query: string): Promise<{ entry: Entry; reason: string }[]> {
  const done = sortedEntries(state.entries).filter((e) => e.status === "done");
  if (!done.length) return [];
  const { results } = await api.search(
    query,
    done.map((e, index) => ({ index, date: dayKey(e.createdAt), title: e.title ?? "", summary: e.summary ?? "", themes: e.themes })),
  );
  return results.filter((r) => done[r.index]).map((r) => ({ entry: done[r.index], reason: r.reason }));
}

const running = new Set<string>();

// Transcribe (voice only), then let the agent decide where the memo goes (journal /
// to-do / chat / pending) and do it. Memos it already routed, and re-runs, only get the
// journal analysis. Safe to call again for retry/resume.
export async function processEntry(id: string): Promise<void> {
  if (running.has(id)) return;
  running.add(id);
  const t0 = Date.now();
  let e = getEntry(id);
  const routed = !!(e && (e.routed || e.intentChecked || e.skipIntent));
  if (e && !routed) startRun(id, "capture");
  try {
    if (!e) return;
    if (e.kind === "voice" && !e.rawText) {
      if (!isWeb && !audioFile(e.audioFile!).exists) {
        log.error("audio file missing", { id, file: e.audioFile });
        patchEntry(id, { status: "failed", error: "录音文件已丢失（旧版本问题），这条记录只能删除" });
        if (!routed) endRun(id, { status: "failed", error: "录音文件已丢失" });
        return;
      }
      patchEntry(id, { status: "transcribing", error: undefined });
      stepRun(id, { id: "asr", label: "转写录音", state: "run" });
      const uri = isWeb ? e.audioFile! : audioFile(e.audioFile!).uri;
      const t = await api.transcribe(uri, state.settings.language);
      log.info("transcribed", { id, chars: t.text.length, lang: t.language, dropped: t.droppedSegments, audioSec: t.duration });
      if (!t.text.trim()) {
        patchEntry(id, { status: "failed", error: "未识别到语音内容" });
        if (!routed) endRun(id, { status: "failed", error: "未识别到语音内容" });
        return;
      }
      stepRun(id, { id: "asr", label: `转写录音 · ${t.text.length} 字`, state: "done" });
      patchEntry(id, { rawText: t.text });
    }
    e = getEntry(id)!;
    patchEntry(id, { status: "analyzing", error: undefined });
    if (!routed) {
      await captureEntry(e, t0);
      return;
    }
    const a = await analyzeOnly(e);
    log.info("entry processed", { id, ms: Date.now() - t0, mood: a.mood });
    track("entry_processed", { kind: e.kind, ms: Date.now() - t0, mood: a.mood });
  } catch (err) {
    log.error("entry processing failed", { id, ms: Date.now() - t0, err });
    track("entry_failed", { ms: Date.now() - t0, error: api.describeError(err).slice(0, 60) });
    patchEntry(id, { status: "failed", error: api.describeError(err) });
    if (!routed) endRun(id, { status: "failed", error: api.describeError(err) });
  } finally {
    running.delete(id);
  }
}

function saveAnalysis(e: Entry, a: api.Analysis, extra: Partial<Entry> = {}) {
  patchEntry(e.id, {
    status: "done",
    title: a.title,
    summary: a.summary,
    text: a.cleaned_text || e.rawText,
    mood: a.mood,
    moodLabel: a.mood_label,
    themes: a.themes,
    followUp: a.follow_up,
    insight: a.insight,
    insightTitle: a.insight_title,
    reflection: a.reflection,
    action: a.action,
    quote: a.quote,
    words: countWords(a.cleaned_text || e.rawText || ""),
    ...extra,
  });
  void scheduleRemember(state.settings.checkins, { id: e.id, title: a.title, followUp: a.follow_up });
  refreshInsightsSoon();
}

async function analyzeOnly(e: Entry): Promise<api.Analysis> {
  const recent = sortedEntries(state.entries)
    .filter((x) => x.id !== e.id && x.status === "done")
    .slice(0, 8)
    .map((x) => ({ date: dayKey(x.createdAt), title: x.title ?? "", summary: x.summary ?? "" }));
  const a = await api.analyze({ text: e.rawText!, prompt: e.prompt, recent });
  saveAnalysis(e, a);
  return a;
}

// What the agent sees: to-dos (open + recently done) and the journal, newest first,
// with full text for the newest entries up to a budget.
function agentBase(excludeEntry?: string): Omit<api.AgentRequest, "mode"> {
  const s = state;
  const done = s.todos.filter((t) => t.doneAt).sort((a, b) => b.doneAt!.localeCompare(a.doneAt!)).slice(0, 15);
  const todos = [...openTodos().slice(0, 250), ...done].map((t) => ({
    id: t.id,
    title: t.title,
    ...(t.note ? { note: t.note } : {}),
    ...(t.date ? { date: t.date } : {}),
    ...(t.time ? { time: t.time } : {}),
    repeat: t.repeat,
    priority: t.priority,
    done: !!t.doneAt,
  }));
  let budget = 120_000;
  const entries = sortedEntries(s.entries)
    .filter((e) => e.status === "done" && e.id !== excludeEntry)
    .slice(0, 400)
    .map((e) => {
      const text = e.text ?? e.rawText ?? "";
      const withText = budget > 0 && text ? text : "";
      budget -= withText.length;
      return {
        id: e.id,
        date: dayKey(e.createdAt),
        title: e.title ?? "",
        summary: e.summary ?? "",
        ...(e.moodLabel ? { mood: e.moodLabel } : {}),
        ...(e.themes?.length ? { themes: e.themes } : {}),
        ...(withText ? { text: withText } : {}),
      };
    });
  return {
    now: localNow(),
    tz: timeZone(),
    ...(s.settings.name ? { name: s.settings.name } : {}),
    defaults: { morning: s.settings.todoAllDayTime, evening: "20:00" },
    todos,
    entries,
  };
}

async function captureEntry(e: Entry, t0: number) {
  const id = e.id;
  const hint = e.mode === "todo" ? "todo" : e.prompt || e.threadId || e.kind === "text" ? "journal" : "auto";
  let chatId: string | undefined;
  const res = await api.agent(
    { mode: "capture", ...agentBase(id), transcript: e.rawText!, source: e.kind, hint, ...(e.prompt ? { prompt: e.prompt } : {}), ...(e.threadId ? { threadId: e.threadId } : {}) },
    (ev) => {
      if (ev.t === "step") {
        stepRun(id, ev);
        if (chatId) stepRun(chatId, ev);
      } else if (ev.t === "route") {
        updateRun(id, { route: ev.route });
        if (ev.route === "chat") {
          chatId = startChatFromCapture(e, ev.title);
          startRun(chatId, "chat");
          updateRun(id, { chatId });
        }
      } else if (ev.t === "text" && chatId) appendChatDelta(chatId, ev.delta);
    },
  );
  const route = res.route ?? "journal";
  const steps = { route, ops: res.ops.length, ms: Date.now() - t0, hint };
  log.info("captured", { id, ...steps, continues: !!res.continues });
  track("agent_capture", { ...steps, kind: e.kind, thread: !!(res.continues || e.threadId) });

  if (route === "chat" && chatId) {
    deleteEntry(id);
    finishChatTurn(chatId, res);
    endRun(id, { route, chatId });
    if (!isWatched(id)) notify({ title: "这段内容是提问，已转到对话", body: res.title || undefined, actions: [{ label: "查看对话", path: `/chats/${chatId}` }] });
    return;
  }

  if (route === "pending") {
    const p = res.pending ?? { title: "未能判断用途", reason: "未能判断这段内容是记录还是提问。" };
    setState((s) => ({ ...s, entries: s.entries.filter((x) => x.id !== id) }));
    addUnclear({ id, createdAt: e.createdAt, source: e.kind, text: e.rawText!, title: p.title, reason: p.reason, audioFile: e.audioFile, durationSec: e.durationSec, prompt: e.prompt });
    endRun(id, { route });
    notify({ title: "已放入待确认", body: p.reason, actions: [{ label: "查看", path: "/pending" }] });
    return;
  }

  const applied = applyOps(res.ops, e.kind);
  if (route === "todo") {
    deleteEntry(id);
    // Undo also keeps the words, parked in 待确认, so nothing said is lost.
    const undo = applied.undoId
      ? registerUndo(() => {
          runUndo(applied.undoId!);
          addUnclear({ id: newId(), createdAt: e.createdAt, source: e.kind, text: e.rawText!, title: "已撤销的待办", reason: "待办改动已撤销，原始内容保留在这里。", prompt: e.prompt });
        })
      : undefined;
    endRun(id, { route });
    notify({
      title: res.reply || applied.lines[0] || "待办已更新",
      body: res.reply && applied.lines.length > 1 ? applied.lines.join("\n") : undefined,
      actions: [...(undo ? [{ label: "撤销", undo }] : []), { label: "查看", path: "/todos" }],
      remind: applied.created.some((t) => t.date),
    });
    return;
  }

  // journal (possibly with to-do changes, possibly continuing an earlier entry)
  const threadId = res.continues && getEntry(res.continues) ? rootOf(res.continues) : e.threadId;
  const a = res.analysis ?? (await api.analyze({ text: e.rawText!, prompt: e.prompt, recent: [] }));
  saveAnalysis(e, a, { routed: true, threadId });
  endRun(id, { route });
  if (!isWatched(id) || applied.lines.length) {
    const actions: NoticeAction[] = [{ label: "查看", path: `/entry/${id}` }];
    if (applied.undoId) actions.unshift({ label: "撤销改动", undo: applied.undoId });
    notify({
      title: threadId ? "后续记录已整理完成" : "已保存为记录",
      body: [a.title, ...applied.lines].join("\n"),
      actions,
      remind: applied.created.some((t) => t.date),
    });
  }
}

// ---------- applying agent changes ----------

function patchTodo(t: Todo, p: Partial<api.AgentTodoFields>): Todo {
  let next: Todo = { ...t };
  if (p.title?.trim()) next.title = p.title.trim();
  if (p.note !== undefined) next = p.note.trim() ? { ...next, note: p.note.trim() } : (({ note: _n, ...rest }) => rest)(next);
  if (p.priority) next.priority = p.priority;
  if (p.date !== undefined) {
    if (p.date) next.date = p.date;
    else {
      const { date: _d, time: _t, ...rest } = next;
      next = { ...rest, repeat: "none" };
    }
  }
  if (p.time !== undefined) {
    if (p.time && next.date) next.time = p.time;
    else next = (({ time: _t, ...rest }) => rest)(next);
  }
  if (p.repeat) next.repeat = next.date ? p.repeat : "none";
  if (p.date !== undefined || p.time !== undefined) next = (({ ask: _a, ...rest }) => rest)(next);
  return next;
}

interface Applied {
  lines: string[]; // human summary, one per change
  undoId?: string;
  created: Todo[];
}

// Applies a run's ops in one go and registers a single undo that puts every touched
// to-do back the way it was (and removes entries it saved).
function applyOps(ops: api.AgentOp[], source: Todo["source"]): Applied {
  const before = new Map<string, Todo | null>(); // null = didn't exist before
  const lines: string[] = [];
  const created: Todo[] = [];
  const notes: string[] = [];
  const at = new Date().toISOString();
  let list = [...state.todos];
  const find = (id: string) => list.find((t) => t.id === id);
  const put = (t: Todo) => (list = list.map((x) => (x.id === t.id ? t : x)));
  const snap = (t: Todo) => !before.has(t.id) && before.set(t.id, t);
  for (const o of ops) {
    if (o.op === "todo.create") {
      const d = o.todo;
      if (!d.title.trim()) continue;
      const t: Todo = {
        id: newId(),
        title: d.title.trim(),
        ...(d.note.trim() ? { note: d.note.trim() } : {}),
        ...(d.date ? { date: d.date } : {}),
        ...(d.date && d.time ? { time: d.time } : {}),
        repeat: d.date ? d.repeat : "none",
        priority: d.priority,
        createdAt: at,
        source,
        ...(o.ask ? { ask: o.ask } : {}),
      };
      list = [t, ...list];
      before.set(t.id, null);
      created.push(t);
      lines.push(`新建「${t.title}」${t.date ? ` · ${dueLabel(t)}` : ""}`);
    } else if (o.op === "todo.update") {
      const t = find(o.id);
      if (!t) continue;
      snap(t);
      const next = patchTodo(t, o.patch);
      put(next);
      const timed = o.patch.date !== undefined || o.patch.time !== undefined;
      lines.push(`修改「${next.title}」${timed ? ` → ${next.date ? dueLabel(next) : "不设时间"}` : ""}`);
    } else if (o.op === "todo.complete") {
      const t = find(o.id);
      if (!t || t.doneAt) continue;
      snap(t);
      put(t.repeat !== "none" && t.date ? { ...t, date: nextOccurrence(t), lastDoneAt: at } : { ...t, doneAt: at });
      lines.push(`完成「${t.title}」`);
    } else if (o.op === "todo.reopen") {
      const t = find(o.id);
      if (!t || !t.doneAt) continue;
      snap(t);
      put({ ...t, doneAt: undefined });
      lines.push(`重新打开「${t.title}」`);
    } else if (o.op === "todo.delete") {
      const t = find(o.id);
      if (!t) continue;
      snap(t);
      list = list.filter((x) => x.id !== o.id);
      lines.push(`删除「${t.title}」`);
    } else if (o.op === "entry.create") {
      notes.push(o.text);
    }
  }
  if (before.size) setTodos(() => list);
  const entryIds = notes.map((text) => createTextEntry(text, { routed: true }).id);
  if (entryIds.length) lines.push(entryIds.length > 1 ? `已保存 ${entryIds.length} 条记录` : "已保存 1 条记录");
  const count = (k: string) => ops.filter((o) => o.op === k).length;
  if (ops.length) track("agent_ops", { create: count("todo.create"), update: count("todo.update"), complete: count("todo.complete"), remove: count("todo.delete"), entries: entryIds.length });
  const undoId =
    before.size || entryIds.length
      ? registerUndo(() => {
          setTodos((cur) => {
            let out = cur;
            for (const [id, prev] of before) {
              if (prev === null) out = out.filter((t) => t.id !== id);
              else out = out.some((t) => t.id === id) ? out.map((t) => (t.id === id ? prev : t)) : [prev, ...out];
            }
            return out;
          });
          for (const id of entryIds) deleteEntry(id);
          log.info("agent changes undone", { todos: before.size, entries: entryIds.length });
          track("agent_undo", { todos: before.size, entries: entryIds.length });
        })
      : undefined;
  return { lines, undoId, created };
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

// Changes whenever a finished entry is added, removed or re-titled.
export function insightsSignature(entries: Entry[] = state.entries): string {
  const done = entries.filter((e) => e.status === "done");
  const latest = done.reduce((m, e) => (e.createdAt > m ? e.createdAt : m), "");
  return `${done.length}|${latest}|${done.reduce((n, e) => n + (e.title?.length ?? 0), 0)}`;
}

export function insightsStale(): boolean {
  const c = state.insights;
  return !c || (c.sig ? c.sig !== insightsSignature() : c.entryCount !== state.entries.filter((e) => e.status === "done").length);
}

let insightsInflight: Promise<void> | null = null;

// One request at a time; callers arriving meanwhile share it.
export function refreshInsights(): Promise<void> {
  insightsInflight ??= (async () => {
    try {
      const ctx = entriesContext(false);
      const sig = insightsSignature();
      const data = await timed("insights", () => api.insights(ctx), { entries: ctx.length });
      setState((s) => ({ ...s, insights: { at: new Date().toISOString(), entryCount: ctx.length, sig, data } }));
      log.info("insights refreshed", { entries: ctx.length });
    } finally {
      insightsInflight = null;
      emit();
    }
  })();
  emit();
  return insightsInflight;
}

export function useInsightsRefreshing(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => insightsInflight !== null,
  );
}

// After new entries, keep the cross-entry patterns current without anyone asking.
let lastAutoInsights = 0;
function refreshInsightsSoon() {
  if (!state.insights || !insightsStale() || Date.now() - lastAutoInsights < 10 * 60_000) return;
  lastAutoInsights = Date.now();
  refreshInsights().catch((e) => log.warn("auto insights failed", e));
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

// Undo for deleteChat: put the conversation back as it was.
export function restoreChat(chat: Chat) {
  setState((s) => (s.chats.some((c) => c.id === chat.id) ? s : { ...s, chats: [chat, ...s.chats] }));
}

function patchChat(id: string, fn: (c: Chat) => Chat) {
  setState((s) => ({ ...s, chats: s.chats.map((c) => (c.id === id ? fn(c) : c)) }));
}

// Streaming text arrives in tiny deltas; buffer and patch the reply ~12×/s.
const deltas = new Map<string, string>();
let deltaTimer: ReturnType<typeof setTimeout> | null = null;

function flushDeltas() {
  deltaTimer = null;
  if (!deltas.size) return;
  const pendingText = new Map(deltas);
  deltas.clear();
  setState((s) => ({
    ...s,
    chats: s.chats.map((c) => {
      const add = pendingText.get(c.id);
      if (!add) return c;
      return { ...c, messages: c.messages.map((m, i) => (i === c.messages.length - 1 && m.pending ? { ...m, content: m.content + add } : m)) };
    }),
  }));
}

function appendChatDelta(chatId: string, delta: string) {
  deltas.set(chatId, (deltas.get(chatId) ?? "") + delta);
  deltaTimer ??= setTimeout(flushDeltas, 80);
}

function startChatFromCapture(e: Entry, title: string): string {
  const now = new Date().toISOString();
  const text = e.rawText ?? "";
  const chat: Chat = {
    id: newId(),
    title: title || text.slice(0, 18),
    createdAt: now,
    updatedAt: now,
    messages: [
      { role: "user", content: text, at: e.createdAt, ...(e.kind === "voice" ? { voice: true } : {}) },
      { role: "assistant", content: "", at: now, pending: true },
    ],
  };
  setState((s) => ({ ...s, chats: [chat, ...s.chats] }));
  return chat.id;
}

// Settle the streaming reply with the final text and apply what the agent changed.
function finishChatTurn(chatId: string, res: api.AgentResult) {
  flushDeltas();
  const applied = applyOps(res.ops, "text");
  patchChat(chatId, (c) => ({
    ...c,
    updatedAt: new Date().toISOString(),
    messages: c.messages.map((m, i) =>
      i === c.messages.length - 1 && m.pending
        ? { role: "assistant", content: res.reply, at: new Date().toISOString(), ...(applied.lines.length ? { ops: applied.lines } : {}), ...(applied.undoId ? { undoId: applied.undoId } : {}) }
        : m,
    ),
  }));
  endRun(chatId);
  if (applied.lines.length) {
    notify({ title: applied.lines.length > 1 ? `已更新 ${applied.lines.length} 项` : applied.lines[0], body: applied.lines.length > 1 ? applied.lines.join("\n") : undefined, actions: applied.undoId ? [{ label: "撤销", undo: applied.undoId }] : [], remind: applied.created.some((t) => t.date) });
  }
}

// One chat turn with the agent: it can read the journal, search the web, change
// to-dos and save notes. Progress shows as run steps; the reply streams in.
export async function sendChat(chatId: string, content: string, opts: { voice?: boolean } = {}): Promise<void> {
  const now = new Date().toISOString();
  patchChat(chatId, (c) => ({
    ...c,
    title: c.messages.length === 0 ? content.slice(0, 18) : c.title,
    updatedAt: now,
    messages: [...c.messages.filter((m) => !m.error && !m.pending), { role: "user", content, at: now, ...(opts.voice ? { voice: true } : {}) }, { role: "assistant", content: "", at: now, pending: true }],
  }));
  const chat = state.chats.find((c) => c.id === chatId)!;
  const history = chat.messages
    .filter((m) => !m.pending && !m.error && m.content)
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.ops?.length ? `${m.content}\n[已执行：${m.ops.join("；")}]` : m.content }));
  startRun(chatId, "chat");
  const t0 = Date.now();
  try {
    track("chat_sent", { turns: history.length });
    const res = await api.agent({ mode: "chat", ...agentBase(), messages: history }, (ev) => {
      if (ev.t === "step") stepRun(chatId, ev);
      else if (ev.t === "text") appendChatDelta(chatId, ev.delta);
    });
    finishChatTurn(chatId, res);
    track("chat_replied", { ms: Date.now() - t0, ops: res.ops.length });
  } catch (err) {
    log.error("chat failed", { chatId, err });
    flushDeltas();
    endRun(chatId, { status: "failed", error: api.describeError(err) });
    patchChat(chatId, (c) => ({
      ...c,
      messages: c.messages.map((m, i) => (i === c.messages.length - 1 && m.pending ? { role: "assistant", content: m.content ? `${m.content}\n\n（${api.describeError(err)}）` : api.describeError(err), at: new Date().toISOString(), error: !m.content } : m)),
    }));
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
    todos: { open: state.todos.filter((t) => !t.doneAt).length, done: state.todos.filter((t) => t.doneAt).length },
    inbox: state.inbox.length,
    server: state.settings.server,
    hasToken: !!state.settings.token,
    language: state.settings.language,
  };
}

// ---------- to-dos ----------

export function openTodos(): Todo[] {
  return sortTodos(state.todos.filter((t) => !t.doneAt), state.settings.todoAllDayTime);
}

function setTodos(fn: (todos: Todo[]) => Todo[]) {
  setState((s) => ({ ...s, todos: fn(s.todos) }));
  syncTodoReminders(state.todos, state.settings.todoAllDayTime);
}

export function resyncTodoReminders() {
  syncTodoReminders(state.todos, state.settings.todoAllDayTime);
}

export function addTodos(drafts: Pick<TodoDraft, "title" | "note" | "date" | "time" | "repeat" | "priority">[], source: Todo["source"]): Todo[] {
  const now = new Date().toISOString();
  const created: Todo[] = drafts
    .filter((d) => d.title.trim())
    .map((d) => ({
      id: newId(),
      title: d.title.trim(),
      ...(d.note.trim() ? { note: d.note.trim() } : {}),
      ...(d.date ? { date: d.date } : {}),
      ...(d.date && d.time ? { time: d.time } : {}),
      repeat: d.date ? d.repeat : "none",
      priority: d.priority,
      createdAt: now,
      source,
    }));
  setTodos((list) => [...created, ...list]);
  log.info("todos added", { n: created.length, dated: created.filter((t) => t.date).length, source });
  track("todo_created", { n: created.length, dated: created.filter((t) => t.date).length, repeat: created.filter((t) => t.repeat !== "none").length, source: source ?? "manual" });
  return created;
}

export function updateTodo(id: string, patch: Partial<Todo>) {
  // Setting a time answers the agent's question about it.
  const answered = "date" in patch || "time" in patch;
  setTodos((list) => list.map((t) => (t.id === id ? { ...t, ...patch, ...(answered ? { ask: undefined } : {}) } : t)));
  log.info("todo updated", { id, fields: Object.keys(patch) });
}

export function deleteTodo(id: string) {
  setTodos((list) => list.filter((t) => t.id !== id));
  log.info("todo deleted", { id });
}

// Returns the next date for a repeating to-do (which stays open), else undefined.
export function completeTodo(id: string): string | undefined {
  const t = state.todos.find((x) => x.id === id);
  if (!t) return;
  const now = new Date().toISOString();
  track("todo_completed", { repeat: t.repeat, overdue: isOverdue(t), postponed: t.postponed ?? 0, ageDays: Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400_000) });
  if (t.repeat !== "none" && t.date) {
    const next = nextOccurrence(t);
    updateTodo(id, { date: next, lastDoneAt: now });
    return next;
  }
  updateTodo(id, { doneAt: now });
}

export function reopenTodo(id: string) {
  updateTodo(id, { doneAt: undefined });
}

export function postponeTodo(id: string) {
  const t = state.todos.find((x) => x.id === id);
  if (!t) return;
  const base = t.date && t.date > today() ? t.date : today();
  updateTodo(id, { date: addDays(base, 1), postponed: (t.postponed ?? 0) + 1 });
  track("todo_postponed", { times: (t.postponed ?? 0) + 1 });
}

export function clearDoneTodos() {
  setTodos((list) => list.filter((t) => !t.doneAt));
}

// ---------- pending intents (inbox) ----------

function addUnclear(p: Omit<PendingIntent, "kind" | "drafts" | "completes" | "reply">) {
  const item: PendingIntent = { ...p, kind: "unclear", drafts: [], completes: [], reply: "" };
  setState((s) => ({ ...s, inbox: [item, ...s.inbox.filter((x) => x.id !== p.id)] }));
}

// "Ask this instead": a parked memo becomes the first question of a new conversation.
export function pendingAsChat(id: string): string | undefined {
  const p = state.inbox.find((x) => x.id === id);
  if (!p) return;
  const chat = createChat();
  dropPending(id, true);
  track("pending_as_chat");
  void sendChat(chat.id, p.text, { voice: p.source === "voice" });
  return chat.id;
}

export function getPending(id: string): PendingIntent | undefined {
  return state.inbox.find((p) => p.id === id || p.journalId === id);
}

function dropPending(id: string, deleteAudio: boolean) {
  const p = state.inbox.find((x) => x.id === id);
  if (deleteAudio && p?.audioFile && !p.journalId && !isWeb) {
    try {
      const f = audioFile(p.audioFile);
      if (f.exists) f.delete();
    } catch (err) {
      log.warn("pending audio delete failed", { id, err });
    }
  }
  setState((s) => ({ ...s, inbox: s.inbox.filter((x) => x.id !== id) }));
}

export function confirmPending(id: string, drafts: TodoDraft[], completeIds: string[]): Todo[] {
  const p = state.inbox.find((x) => x.id === id);
  if (!p) return [];
  const created = addTodos(drafts, p.source);
  for (const tid of completeIds) completeTodo(tid);
  dropPending(id, true);
  log.info("pending confirmed", { id, created: created.length, completed: completeIds.length });
  track("pending_confirmed", { proposed: p.drafts.length, created: created.length, completed: completeIds.length, kind: p.kind });
  return created;
}

export function dismissPending(id: string) {
  dropPending(id, true);
  log.info("pending dismissed", { id });
  track("pending_dismissed");
}

// "This was a note after all": turn the memo back into a journal entry.
export function pendingAsNote(id: string): string | undefined {
  const p = state.inbox.find((x) => x.id === id);
  if (!p) return;
  if (p.journalId) {
    dropPending(id, false);
    return p.journalId;
  }
  const entry: Entry = {
    id: p.id,
    createdAt: p.createdAt,
    kind: p.source,
    status: "analyzing",
    rawText: p.text,
    audioFile: p.audioFile,
    durationSec: p.durationSec,
    prompt: p.prompt,
    routed: true,
  };
  setState((s) => ({ ...s, entries: [entry, ...s.entries.filter((e) => e.id !== p.id)], inbox: s.inbox.filter((x) => x.id !== id) }));
  log.info("pending kept as note", { id });
  track("pending_as_note");
  void processEntry(entry.id);
  return entry.id;
}

// Typed quick-add on the to-do tab: the agent creates or changes to-dos straight away
// (the caller offers undo). If it finds nothing to do, the words become the task.
export async function quickAddTodo(text: string): Promise<{ reply: string; lines: string[]; undoId?: string; remind: boolean }> {
  const res = await timed("todo_quick_add", () => api.agent({ mode: "capture", ...agentBase(), transcript: text, source: "text", hint: "todo" }, () => {}));
  const ops = res.ops.filter((o) => o.op !== "entry.create");
  if (ops.length) {
    const applied = applyOps(ops, "text");
    return { reply: res.reply || applied.lines[0] || "已更新", lines: applied.lines, undoId: applied.undoId, remind: applied.created.some((t) => t.date) };
  }
  const created = addTodos([{ title: text.trim(), note: "", date: "", time: "", repeat: "none", priority: "normal" }], "text");
  return { reply: "已添加", lines: [], undoId: registerUndo(() => created.forEach((t) => deleteTodo(t.id))), remind: false };
}

// ---------- Home brief ----------

// Changes when the inputs that matter change: day, open to-dos, journal size.
export function briefKey(): string {
  const open = openTodos().map((t) => `${t.id}:${t.date ?? ""}:${t.time ?? ""}`).join(",");
  const doneCount = state.todos.filter((t) => t.doneAt || t.lastDoneAt).length;
  return `${today()}|${open}|${state.entries.length}|${doneCount}`;
}

export async function refreshBrief(): Promise<void> {
  const key = briefKey();
  const now = nowWall();
  const open = openTodos().slice(0, 30);
  const dayMs = 86400_000;
  const recentDone = state.todos
    .map((t) => ({ t, at: t.doneAt ?? t.lastDoneAt }))
    .filter((x): x is { t: Todo; at: string } => !!x.at && Date.now() - new Date(x.at).getTime() < 3 * dayMs)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);
  const data = await timed("brief", () => api.brief({
    now: localNow(now),
    ...(state.settings.name ? { name: state.settings.name } : {}),
    todos: open.map((t, index) => ({
      index,
      title: t.title,
      ...(t.date ? { due: dueLabel(t, now) } : {}),
      ...(isOverdue(t, now) ? { overdueDays: Math.max(1, overdueDays(t, now)) } : {}),
      ageDays: Math.floor((Date.now() - new Date(t.createdAt).getTime()) / dayMs),
      ...(t.postponed ? { postponed: t.postponed } : {}),
    })),
    done: recentDone.map((x) => ({ title: x.t.title, when: dayKey(x.at) === today(now) ? "今天" : dayKey(x.at) })),
    entries: sortedEntries(state.entries)
      .filter((e) => e.status === "done")
      .slice(0, 6)
      .map((e) => ({ date: dayKey(e.createdAt), title: e.title ?? "", summary: e.summary ?? "", ...(e.moodLabel ? { mood: e.moodLabel } : {}) })),
  }), { todos: open.length });
  setState((s) => ({ ...s, brief: { key, at: new Date().toISOString(), data, ids: open.map((t) => t.id) } }));
  log.info("brief refreshed", { todos: open.length, focus: data.focus.length, nudges: data.nudges.length });
}
