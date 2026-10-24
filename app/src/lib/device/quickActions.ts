// Home-screen quick actions (long-press the app icon). Items are set at runtime, so
// they can change with an OTA update; each maps to a route.
import { Platform } from "react-native";
import * as QuickActions from "expo-quick-actions";
import { has, log } from "./core";
import { track } from "../track";

type Item = QuickActions.Action & { params: { route: string; mode?: string } };

const ITEMS: Item[] = [
  { id: "record", title: "录一段", icon: "symbol:mic.fill", params: { route: "/record" } },
  { id: "todo", title: "记待办", icon: "symbol:checklist", params: { route: "/record", mode: "todo" } },
  { id: "write", title: "写一段", icon: "symbol:square.and.pencil", params: { route: "/write" } },
];

export function installQuickActions(go: (route: string, params: Record<string, string>) => void): () => void {
  if (Platform.OS === "web" || !has("quickActions")) return () => {};
  QuickActions.setItems(ITEMS).catch((e) => log.warn("quick actions setItems failed", e));
  const handle = (a: QuickActions.Action) => {
    const p = (a.params ?? {}) as Item["params"];
    if (!p.route) return;
    track("quick_action", { id: a.id });
    go(p.route, p.mode ? { mode: p.mode } : {});
  };
  if (QuickActions.initial) handle(QuickActions.initial);
  const sub = QuickActions.addListener(handle);
  return () => sub.remove();
}
