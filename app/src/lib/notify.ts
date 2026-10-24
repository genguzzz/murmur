// Local notifications: daily morning/evening check-ins and a "remembers what you
// said" reminder built from the latest entry's follow-up. Tapping one opens the
// recorder with the matching prompt.
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { logger } from "./log";

const log = logger("notify");

export const MORNING_PROMPTS = ["今天最想做成的一件事是什么？", "醒来时脑子里第一个念头是什么？", "今天想用什么状态度过？", "有什么在等着你，让你期待或担心？"];
export const EVENING_PROMPTS = ["今天有什么值得记住的瞬间？", "今天哪件事让你多想了一下？", "现在的心情像什么天气？", "今天你对自己满意的一点是什么？"];

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
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
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
      await Notifications.scheduleNotificationAsync({
        identifier: ID[which],
        content: { title: which === "morning" ? "早间签到" : "晚间签到", body: prompt, data: { route: "/record", prompt } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, ...parseTime(p.time) },
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
    const at = new Date();
    at.setDate(at.getDate() + 1);
    at.setHours(hour, minute, 0, 0);
    await Notifications.scheduleNotificationAsync({
      identifier: ID.remember,
      content: { title: `还记得「${entry.title ?? "昨天那条记录"}」吗？`, body: entry.followUp, data: { route: "/record", prompt: entry.followUp, followUpOf: entry.id } },
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
    const data = r?.notification.request.content.data as { route?: string; prompt?: string; followUpOf?: string } | undefined;
    if (!data?.route) return;
    log.info("tapped", { id: r?.notification.request.identifier });
    // Otherwise the same launch response is replayed on every cold start.
    Notifications.clearLastNotificationResponse();
    const params: Record<string, string> = {};
    if (data.prompt) params.prompt = data.prompt;
    if (data.followUpOf) params.followUpOf = data.followUpOf;
    go(data.route, params);
  };
  void Notifications.getLastNotificationResponseAsync().then(handle);
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
