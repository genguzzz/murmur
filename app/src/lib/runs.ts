// Live state of agent runs (in memory only): the step list the processing screen and
// the bottom activity pill show, plus undo handles for what a run changed.
import { useSyncExternalStore } from "react";
import type { AgentRoute } from "./api";

export interface RunStep {
  id: string;
  label: string;
  state: "run" | "done" | "fail";
}

export interface Run {
  id: string; // entry id for captures, chat id for chat turns
  kind: "capture" | "chat";
  status: "running" | "done" | "failed";
  steps: RunStep[];
  route?: AgentRoute;
  chatId?: string; // capture that turned into a conversation
  error?: string;
}

let runs: Run[] = [];
const listeners = new Set<() => void>();
const watched = new Map<string, number>();

function emit() {
  for (const l of listeners) l();
}

function patch(id: string, fn: (r: Run) => Run) {
  runs = runs.map((r) => (r.id === id ? fn(r) : r));
  emit();
}

export function startRun(id: string, kind: Run["kind"], first?: string) {
  runs = [...runs.filter((r) => r.id !== id), { id, kind, status: "running", steps: first ? [{ id: "start", label: first, state: "run" }] : [] }];
  emit();
}

// Adds a step, or updates the one with the same id.
export function stepRun(id: string, step: RunStep) {
  patch(id, (r) => {
    const i = r.steps.findIndex((s) => s.id === step.id);
    return { ...r, steps: i >= 0 ? r.steps.map((s, j) => (j === i ? step : s)) : [...r.steps, step] };
  });
}

export function updateRun(id: string, p: Partial<Run>) {
  patch(id, (r) => ({ ...r, ...p }));
}

export function endRun(id: string, p: Partial<Run> = {}) {
  patch(id, (r) => ({ ...r, ...p, status: p.status ?? "done", steps: r.steps.map((s) => (s.state === "run" ? { ...s, state: p.status === "failed" ? ("fail" as const) : ("done" as const) } : s)) }));
  // Finished runs linger briefly so screens can read the outcome, then go.
  setTimeout(() => {
    runs = runs.filter((r) => r.id !== id || r.status === "running");
    emit();
  }, 60_000);
}

export function getRun(id: string): Run | undefined {
  return runs.find((r) => r.id === id);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useRun(id: string | undefined): Run | undefined {
  return useSyncExternalStore(subscribe, () => (id ? runs.find((r) => r.id === id) : undefined));
}

export function useRuns(): Run[] {
  return useSyncExternalStore(subscribe, () => runs);
}

// A screen showing a run's progress (processing, chat) marks it watched, so the store
// knows to leave navigation to that screen instead of raising a toast.
export function watchRun(id: string): () => void {
  watched.set(id, (watched.get(id) ?? 0) + 1);
  emit();
  return () => {
    const n = (watched.get(id) ?? 1) - 1;
    if (n <= 0) watched.delete(id);
    else watched.set(id, n);
    emit();
  };
}

export function isWatched(id: string): boolean {
  return watched.has(id);
}

export function useWatched(id: string): boolean {
  return useSyncExternalStore(subscribe, () => watched.has(id));
}

// ---------- undo ----------

const undos = new Map<string, () => void>();
let undoSeq = 0;

export function registerUndo(fn: () => void): string {
  const id = `u${++undoSeq}`;
  undos.set(id, fn);
  return id;
}

export function canUndo(id: string | undefined): boolean {
  return !!id && undos.has(id);
}

export function runUndo(id: string): boolean {
  const fn = undos.get(id);
  if (!fn) return false;
  undos.delete(id);
  fn();
  emit();
  return true;
}

export function useCanUndo(id: string | undefined): boolean {
  return useSyncExternalStore(subscribe, () => canUndo(id));
}

// ---------- notices ----------
// The store can't show UI or navigate; it raises notices and the root layout turns
// them into toasts (undo / open actions).

export interface NoticeAction {
  label: string;
  undo?: string; // undo id from registerUndo
  path?: string; // route to open
}

export interface Notice {
  title: string;
  body?: string;
  actions?: NoticeAction[];
  remind?: boolean; // dated to-dos were created: make sure reminders are allowed
}

let noticeHandler: ((n: Notice) => void) | null = null;

export function setNoticeHandler(fn: ((n: Notice) => void) | null) {
  noticeHandler = fn;
}

export function notify(n: Notice) {
  noticeHandler?.(n);
}
