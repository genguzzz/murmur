// Background refresh: iOS wakes the app every so often (its schedule, roughly hourly
// at best) to roll reminders forward, refresh the Home brief and upload events.
import { Platform } from "react-native";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { has, log } from "./core";
import { getState, loadState, refreshBrief, resyncTodoReminders } from "../store";
import { flushEvents, track } from "../track";

const TASK = "murmur-refresh";
const BRIEF_MAX_AGE = 3 * 3600_000;

if (Platform.OS !== "web") {
  TaskManager.defineTask(TASK, async () => {
    const t0 = Date.now();
    try {
      await loadState();
      resyncTodoReminders();
      const s = getState();
      const stale = !s.brief || Date.now() - new Date(s.brief.at).getTime() > BRIEF_MAX_AGE;
      if (s.settings.token && stale && s.todos.some((t) => !t.doneAt)) await refreshBrief();
      track("bg_refresh", { ok: true, ms: Date.now() - t0, brief: stale });
      await flushEvents();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (e) {
      log.warn("background refresh failed", e);
      track("bg_refresh", { ok: false, ms: Date.now() - t0 });
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerBackgroundRefresh(): Promise<void> {
  if (Platform.OS === "web" || !has("backgroundTask")) return;
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
      log.info("background refresh unavailable", { status });
      return;
    }
    if (!(await TaskManager.isTaskRegisteredAsync(TASK))) await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 60 });
  } catch (e) {
    log.warn("background refresh register failed", e);
  }
}

export async function backgroundStatus(): Promise<{ available: boolean; registered: boolean }> {
  if (Platform.OS === "web") return { available: false, registered: false };
  const status = await BackgroundTask.getStatusAsync();
  return { available: status === BackgroundTask.BackgroundTaskStatus.Available, registered: await TaskManager.isTaskRegisteredAsync(TASK) };
}
