// To-do model and date helpers. Dates are local "YYYY-MM-DD", times local "HH:MM";
// a to-do with a date but no time is all-day and reminds at settings.todoAllDayTime.
// All of these are wall times in the app time zone (lib/zone); `now` defaults to it.
import { appZone, nowWall } from "./zone";

export type Repeat = "none" | "daily" | "weekdays" | "weekly" | "monthly";

export interface Todo {
  id: string;
  title: string;
  note?: string;
  date?: string;
  time?: string;
  repeat: Repeat;
  priority: "normal" | "high";
  createdAt: string;
  doneAt?: string;
  lastDoneAt?: string; // repeating to-dos stay open; this records the latest completion
  postponed?: number;
  source?: "voice" | "text";
  ask?: { question: string; options: DraftOption[] }; // the agent's open question about the time
}

export interface DraftOption {
  label: string;
  date: string;
  time: string;
}

// What the model proposes; edited on the confirm screen before it becomes a Todo.
export interface TodoDraft {
  title: string;
  note: string;
  date: string;
  time: string;
  repeat: Repeat;
  priority: "normal" | "high";
  question: string;
  options: DraftOption[];
}

export const REPEAT_LABEL: Record<Repeat, string> = { none: "不重复", daily: "每天", weekdays: "工作日", weekly: "每周", monthly: "每月" };

const WEEK = "日一二三四五六";
const pad = (n: number) => `${n}`.padStart(2, "0");

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeStr(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDate(date: string, time = "00:00"): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
}

export function addDays(date: string, n: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function today(now = nowWall()): string {
  return toDateStr(now);
}

// "2026-10-24 15:20 周六": what the model resolves relative dates against.
export function localNow(now = nowWall()): string {
  return `${toDateStr(now)} ${toTimeStr(now)} 周${WEEK[now.getDay()]}`;
}

export function timeZone(): string {
  return appZone();
}

// When the reminder fires, as a wall date (all-day → the configured morning time).
// Use zone.instantOf() to get the real instant.
export function dueAt(t: Pick<Todo, "date" | "time">, allDayTime: string): Date | null {
  return t.date ? parseDate(t.date, t.time || allDayTime) : null;
}

export function isOverdue(t: Pick<Todo, "date" | "time" | "doneAt">, now = nowWall()): boolean {
  if (!t.date || t.doneAt) return false;
  if (!t.time) return t.date < today(now);
  return parseDate(t.date, t.time).getTime() < now.getTime();
}

export function overdueDays(t: Pick<Todo, "date">, now = nowWall()): number {
  if (!t.date) return 0;
  return Math.max(0, Math.round((parseDate(today(now)).getTime() - parseDate(t.date).getTime()) / 86400_000));
}

export function dayLabel(date: string, now = nowWall()): string {
  const t = today(now);
  if (date === t) return "今天";
  if (date === addDays(t, 1)) return "明天";
  if (date === addDays(t, 2)) return "后天";
  if (date === addDays(t, -1)) return "昨天";
  const d = parseDate(date);
  const diff = (d.getTime() - parseDate(t).getTime()) / 86400_000;
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  if (diff > 0 && diff < 7) return `周${WEEK[d.getDay()]} ${md}`;
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}年${md}`;
}

export function dueLabel(t: Pick<Todo, "date" | "time">, now = nowWall()): string {
  if (!t.date) return "";
  return t.time ? `${dayLabel(t.date, now)} ${t.time}` : dayLabel(t.date, now);
}

// Next date for a repeating to-do after it was completed.
export function nextOccurrence(t: Todo, now = nowWall()): string {
  const base = t.date && t.date > today(now) ? t.date : today(now);
  let d = base;
  const step = () => {
    switch (t.repeat) {
      case "daily":
      case "weekdays":
        return addDays(d, 1);
      case "weekly":
        return addDays(d, 7);
      case "monthly": {
        const x = parseDate(d);
        const day = t.date ? parseDate(t.date).getDate() : x.getDate();
        return toDateStr(new Date(x.getFullYear(), x.getMonth() + 1, Math.min(day, 28)));
      }
      default:
        return d;
    }
  };
  d = step();
  if (t.repeat === "weekdays") while ([0, 6].includes(parseDate(d).getDay())) d = addDays(d, 1);
  return d;
}

export function sortTodos(list: Todo[], allDayTime: string): Todo[] {
  return [...list].sort((a, b) => {
    const da = dueAt(a, allDayTime)?.getTime() ?? Infinity;
    const db = dueAt(b, allDayTime)?.getTime() ?? Infinity;
    if (da !== db) return da - db;
    if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export type TodoSection = { key: string; title: string; tone?: "danger" | "primary"; todos: Todo[] };

// Overdue · Today · Tomorrow · later days · Anytime.
export function groupTodos(list: Todo[], allDayTime: string, now = nowWall()): TodoSection[] {
  const open = sortTodos(list.filter((t) => !t.doneAt), allDayTime);
  const t0 = today(now);
  const sections = new Map<string, TodoSection>();
  const put = (key: string, title: string, todo: Todo, tone?: TodoSection["tone"]) => {
    if (!sections.has(key)) sections.set(key, { key, title, tone, todos: [] });
    sections.get(key)!.todos.push(todo);
  };
  for (const t of open) {
    if (!t.date) continue;
    if (isOverdue(t, now) && t.date < t0) put("overdue", "已逾期", t, "danger");
    else if (t.date <= t0) put("today", "今天", t, "primary");
    else if (t.date === addDays(t0, 1)) put("tomorrow", "明天", t);
    else put(`d-${t.date}`, dayLabel(t.date, now), t);
  }
  const anytime = open.filter((t) => !t.date);
  const out = [...sections.values()];
  if (anytime.length) out.push({ key: "anytime", title: "未设日期", todos: anytime });
  return out;
}

// Today + overdue, for the tab badge and Home.
export function todayTodos(list: Todo[], allDayTime: string, now = nowWall()): Todo[] {
  const t0 = today(now);
  return sortTodos(list.filter((t) => !t.doneAt && t.date && t.date <= t0), allDayTime);
}
