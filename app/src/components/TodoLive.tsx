import { useEffect } from "react";
import { AppState } from "react-native";
import * as Haptics from "expo-haptics";
import { endLiveTodo, liveSupported, liveTodo } from "@/lib/device";
import { onTodoReminder } from "@/lib/notify";
import { useStore } from "@/lib/store";
import { leadOf, parseDate, type Todo } from "@/lib/todo";
import { instantOf } from "@/lib/zone";

const GRACE_MS = 10 * 60_000; // keep the countdown up a little after the due time

// The to-do whose heads-up window (lead minutes before it, chosen by the agent) is open now.
function upcoming(todos: Todo[]) {
  const now = Date.now();
  return todos
    .filter((t) => !t.doneAt && t.date && t.time && leadOf(t) > 0)
    .map((t) => {
      const due = instantOf(parseDate(t.date!, t.time!)).getTime();
      // iOS ends a Live Activity after 8 hours, so longer leads show the countdown for the last 8.
      return { t, due, start: due - Math.min(leadOf(t), 480) * 60_000 };
    })
    .filter((c) => now >= c.start && now < c.due + GRACE_MS)
    .sort((a, b) => a.due - b.due)[0];
}

// Shows the next to-do as a Dynamic Island / Lock Screen countdown once its heads-up
// window opens. iOS only lets an app start a Live Activity while it's running, so this
// re-checks whenever the app comes forward or goes to the background, every minute
// while open, and when a reminder arrives.
export function TodoLiveSync() {
  const todos = useStore((s) => s.todos);

  useEffect(() => {
    if (!liveSupported()) return;
    const sync = () => {
      const c = upcoming(todos);
      if (c) void liveTodo({ todoId: c.t.id, title: c.t.title, subtitle: `${c.t.time} 到期`, startSec: c.start / 1000, dueSec: c.due / 1000 });
      else void endLiveTodo();
    };
    // Give the launch-time cleanup of stale activities a moment to finish first.
    const first = setTimeout(sync, 1500);
    const timer = setInterval(sync, 60_000);
    const app = AppState.addEventListener("change", sync);
    const off = onTodoReminder(() => sync());
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      app.remove();
      off();
    };
  }, [todos]);

  // A reminder while the app is open: make it felt, not just seen.
  useEffect(
    () =>
      onTodoReminder((_id, lead) => {
        void Haptics.notificationAsync(lead ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Error);
      }),
    [],
  );
  return null;
}
