// Local notifications: daily morning/evening check-ins and a "remembers what you
// said" reminder built from the latest entry's follow-up. Tapping one opens the
// recorder with the matching prompt.
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { logger } from "./log";
import { dueAt, leadLabel, leadOf, parseDate, sortTodos, today, type Todo } from "./todo";
import { instantOf, nowWall } from "./zone";

const log = logger("notify");

export const MORNING_PROMPTS = ["今天最想做成的一件事是什么？", "醒来后想到的第一件事是什么？", "今天希望以怎样的状态度过？", "今天有什么让你期待或担心的事？"];
export const EVENING_PROMPTS = ["今天有什么值得记住的瞬间？", "今天哪件事让你思考得最多？", "此刻的心情怎么样？", "今天你对自己满意的一点是什么？"];

const ID = { morning: "checkin-morning", evening: "checkin-evening", remember: "remember-followup" } as const;
const enabled = Platform.OS !== "web";

export interface CheckinPrefs {
  morning: { enabled: boolean; time: string };
  evening: { enabled: boolean; time: string };
  remember: boolean;
}

export function installNotificationHandler() {
  if (!enabled) return;
  Notifications.setNotificationHandler({
    // To-do reminders also sound (and so vibrate) while the app is open; check-ins stay quiet.
    handleNotification: async (n) => {
      const isTodo = !!(n.request.content.data as { todoId?: string } | undefined)?.todoId;
      return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: isTodo, shouldSetBadge: false };
    },
  });
}

export type PermissionState = "granted" | "ask" | "denied";

export async function permissionState(): Promise<PermissionState> {
  if (!enabled) return "denied";
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return "granted";
  return cur.canAskAgain ? "ask" : "denied";
}

export async function ensurePermission(): Promise<boolean> {
  if (!enabled) return false;
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const req = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  log.info("permission", { granted: req.granted, status: req.status });
  return req.granted;
}

function parseTime(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(":").map(Number);
  return { hour: h || 0, minute: m || 0 };
}

// Repeating triggers fire on the device's local clock; translate a wall time in the
// app zone (on a reference date) into the device-local fields iOS expects.
function deviceFields(date: string, time: string) {
  const at = instantOf(parseDate(date, time));
  return { hour: at.getHours(), minute: at.getMinutes(), weekday: at.getDay() + 1, day: at.getDate() };
}

function pick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

// Re-schedule both daily check-ins from preferences (called on launch and on change;
// a new prompt is picked each time so the wording rotates).
export async function syncCheckins(prefs: CheckinPrefs): Promise<void> {
  if (!enabled) return;
  try {
    for (const which of ["morning", "evening"] as const) {
      await Notifications.cancelScheduledNotificationAsync(ID[which]);
      const p = prefs[which];
      if (!p.enabled) continue;
      const prompt = pick(which === "morning" ? MORNING_PROMPTS : EVENING_PROMPTS);
      const at = deviceFields(today(), p.time);
      await Notifications.scheduleNotificationAsync({
        identifier: ID[which],
        content: { title: which === "morning" ? "早间签到" : "晚间签到", body: prompt, data: { route: "/record", prompt } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: at.hour, minute: at.minute },
      });
    }
    log.info("check-ins synced", { morning: prefs.morning, evening: prefs.evening });
  } catch (e) {
    log.error("check-in sync failed", e);
  }
}

// One pending reminder at a time: the newest entry's follow-up, tomorrow at the evening time.
export async function scheduleRemember(prefs: CheckinPrefs, entry: { id: string; title?: string; followUp?: string }): Promise<void> {
  if (!enabled || !prefs.remember || !entry.followUp) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(ID.remember);
    const { hour, minute } = parseTime(prefs.evening.time);
    const w = nowWall();
    w.setDate(w.getDate() + 1);
    w.setHours(hour, minute, 0, 0);
    const at = instantOf(w);
    await Notifications.scheduleNotificationAsync({
      identifier: ID.remember,
      content: { title: `回顾「${entry.title ?? "昨天的记录"}」`, body: entry.followUp, data: { route: "/record", prompt: entry.followUp, followUpOf: entry.id } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
    log.info("remember scheduled", { id: entry.id, at: at.toISOString() });
  } catch (e) {
    log.error("remember schedule failed", e);
  }
}

export async function cancelRemember() {
  if (enabled) await Notifications.cancelScheduledNotificationAsync(ID.remember).catch(() => {});
}

// Routes notification taps (including the one that launched the app).
export function onNotificationTap(go: (route: string, params: Record<string, string>) => void): () => void {
  if (!enabled) return () => {};
  const handle = (r: Notifications.NotificationResponse | null) => {
    const data = r?.notification.request.content.data as { route?: string; prompt?: string; followUpOf?: string; todoId?: string } | undefined;
    if (!data?.route) return;
    log.info("tapped", { id: r?.notification.request.identifier });
    // Otherwise the same launch response is replayed on every cold start.
    Notifications.clearLastNotificationResponse();
    const params: Record<string, string> = {};
    if (data.prompt) params.prompt = data.prompt;
    if (data.followUpOf) params.followUpOf = data.followUpOf;
    if (data.todoId) params.focus = data.todoId;
    go(data.route, params);
  };
  void Notifications.getLastNotificationResponseAsync().then(handle);
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}

// ---------- to-do reminders ----------

const TODO_PREFIX = "todo-";
const MAX_TODO_REMINDERS = 40; // iOS keeps at most 64 pending local notifications
let todoTimer: ReturnType<typeof setTimeout> | null = null;

// Rebuilds every to-do reminder from scratch; cheap, and never leaves a stale one behind.
// Debounced because the store calls it after each change.
export function syncTodoReminders(todos: Todo[], allDayTime: string) {
  if (!enabled) return;
  if (todoTimer) clearTimeout(todoTimer);
  todoTimer = setTimeout(() => void rebuildTodoReminders(todos, allDayTime), 600);
}

async function rebuildTodoReminders(todos: Todo[], allDayTime: string) {
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(scheduled.filter((n) => n.identifier.startsWith(TODO_PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
    const now = nowWall();
    const open = sortTodos(todos.filter((t) => !t.doneAt && t.date), allDayTime).slice(0, MAX_TODO_REMINDERS);
    let count = 0;
    for (const t of open) {
      const local = deviceFields(t.date!, t.time || allDayTime);
      const { hour, minute } = local;
      const content: Notifications.NotificationContentInput = {
        title: t.title,
        body: t.time ? `${t.time} · ${t.note || "已到时间"}` : (t.note || "今天的待办"),
        sound: "default",
        // Breaks through Focus where the system allows it; otherwise a normal banner.
        interruptionLevel: "timeSensitive",
        data: { route: "/todos", todoId: t.id },
      };
      // Advance notice, as far ahead of the due moment as the agent judged the task needs.
      const lead = leadOf(t);
      const leadContent: Notifications.NotificationContentInput = {
        ...content,
        title: `${leadLabel(lead)}后到期：${t.title}`,
        // Absolute date: "明天" worked out now would be wrong by the time it fires.
        body: `${Number(t.date!.slice(5, 7))}月${Number(t.date!.slice(8, 10))}日${t.time ? ` ${t.time}` : ""} 到期${t.note ? ` · ${t.note}` : ""}`,
        data: { route: "/todos", todoId: t.id, lead: true },
      };
      const T = Notifications.SchedulableTriggerInputTypes;
      const triggers: { id: string; lead?: boolean; trigger: Notifications.NotificationTriggerInput }[] = [];
      if (t.repeat === "daily") {
        triggers.push({ id: t.id, trigger: { type: T.DAILY, hour, minute } });
        if (lead) {
          const m = (((hour * 60 + minute - lead) % 1440) + 1440) % 1440;
          triggers.push({ id: `${t.id}-lead`, lead: true, trigger: { type: T.DAILY, hour: Math.floor(m / 60), minute: m % 60 } });
        }
      }
      else if (t.repeat === "weekdays") {
        // Mon–Fri in the app zone; shift if the zone difference crosses midnight.
        const delta = (local.weekday - (parseDate(t.date!).getDay() + 1) + 7) % 7;
        for (const w of [2, 3, 4, 5, 6]) {
          const weekday = ((w - 1 + delta) % 7) + 1;
          triggers.push({ id: `${t.id}-${w}`, trigger: { type: T.WEEKLY, weekday, hour, minute } });
        }
      }
      else if (t.repeat === "weekly") triggers.push({ id: t.id, trigger: { type: T.WEEKLY, weekday: local.weekday, hour, minute } });
      else if (t.repeat === "monthly") triggers.push({ id: t.id, trigger: { type: T.MONTHLY, day: local.day, hour, minute } });
      else {
        const at = dueAt(t, allDayTime)!;
        // Every time here is fixed by the to-do (due moment, minus its lead), so
        // rebuilding on each foreground re-creates the same schedule; past ones are skipped.
        const early = new Date(at.getTime() - lead * 60_000);
        if (at > now) triggers.push({ id: t.id, trigger: { type: T.DATE, date: instantOf(at) } });
        if (lead && early > now) triggers.push({ id: `${t.id}-lead`, lead: true, trigger: { type: T.DATE, date: instantOf(early) } });
      }
      for (const x of triggers) {
        await Notifications.scheduleNotificationAsync({ identifier: `${TODO_PREFIX}${x.id}`, content: x.lead ? leadContent : content, trigger: x.trigger });
        count += 1;
      }
    }
    log.info("todo reminders synced", { open: open.length, scheduled: count });
  } catch (e) {
    log.error("todo reminder sync failed", e);
  }
}

// A to-do reminder arrived while the app is open (the banner and sound come from the
// handler above); lets the UI add a haptic and refresh the countdown.
export function onTodoReminder(fn: (todoId: string, lead: boolean) => void): () => void {
  if (!enabled) return () => {};
  const sub = Notifications.addNotificationReceivedListener((n) => {
    const data = n.request.content.data as { todoId?: string; lead?: boolean } | undefined;
    if (data?.todoId) fn(data.todoId, !!data.lead);
  });
  return () => sub.remove();
}
