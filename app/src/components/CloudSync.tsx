import { useEffect } from "react";
import { AppState } from "react-native";
import { cloudAvailable, syncNow } from "@/lib/cloud";
import { useStore } from "@/lib/store";

const DEBOUNCE_MS = 15_000;

// Runs folder sync when it's on: shortly after any change to the journal, when the app
// comes forward (pick up other devices' changes) and when it leaves (push ours).
export function CloudSync() {
  const on = useStore((s) => !!s.settings.cloud);
  const entries = useStore((s) => s.entries);
  const todos = useStore((s) => s.todos);
  const chats = useStore((s) => s.chats);
  const inbox = useStore((s) => s.inbox);

  useEffect(() => {
    if (!on || !cloudAvailable()) return;
    const t = setTimeout(() => void syncNow("change"), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [on, entries, todos, chats, inbox]);

  useEffect(() => {
    if (!on || !cloudAvailable()) return;
    const first = setTimeout(() => void syncNow("launch"), 3000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void syncNow("foreground");
      else if (s === "background") void syncNow("background");
    });
    return () => {
      clearTimeout(first);
      sub.remove();
    };
  }, [on]);
  return null;
}
