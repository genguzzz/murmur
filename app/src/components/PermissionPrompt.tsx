// In-app explainer before the one-shot iOS notification prompt, and a way back to
// Settings once it has been denied. Call ensureReminderPermission() before relying on reminders.
import { useSyncExternalStore } from "react";
import { Linking, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Mascot } from "./Mascot";
import { PillButton, Sheet, toast } from "./ui";
import { logger } from "@/lib/log";
import { ensurePermission, permissionState } from "@/lib/notify";
import { resyncTodoReminders } from "@/lib/store";
import { colors } from "@/lib/theme";

const log = logger("permission");

type Ask = { mode: "ask" | "denied"; resolve: (ok: boolean) => void };
let current: Ask | null = null;
const listeners = new Set<() => void>();
let deniedShown = false;

function show(mode: Ask["mode"]): Promise<boolean> {
  return new Promise((resolve) => {
    current = { mode, resolve };
    listeners.forEach((l) => l());
  });
}

function finish(ok: boolean) {
  current?.resolve(ok);
  current = null;
  listeners.forEach((l) => l());
}

export async function ensureReminderPermission(): Promise<boolean> {
  const state = await permissionState();
  if (state === "granted") return true;
  if (state === "denied") {
    // Ask once per session; after that a toast is enough.
    if (deniedShown) {
      toast("通知没开", "待办已保存，但不会按时提醒");
      return false;
    }
    deniedShown = true;
    await show("denied");
    return false;
  }
  if (!(await show("ask"))) return false;
  const ok = await ensurePermission();
  log.info("reminder permission", { ok });
  if (ok) resyncTodoReminders();
  return ok;
}

export function PermissionHost() {
  const ask = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
  if (!ask) return null;
  const denied = ask.mode === "denied";
  return (
    <Sheet visible onClose={() => finish(false)} button={null}>
      <View style={{ alignItems: "center", marginTop: 4 }}>
        <View>
          <Mascot size={84} />
          <View style={{ position: "absolute", right: -6, top: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.sheet }}>
            <Ionicons name="notifications" size={14} color={colors.onPrimary} />
          </View>
        </View>
        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text, marginTop: 14, textAlign: "center" }}>{denied ? "通知被关掉了" : "到点了，我来提醒你"}</Text>
        <Text style={{ fontSize: 15, lineHeight: 23, color: colors.textSoft, marginTop: 8, textAlign: "center", paddingHorizontal: 10 }}>
          {denied
            ? "待办已经保存。想按时收到提醒，需要去系统设置里打开 Murmur 的通知。"
            : "Murmur 需要通知权限，才能在你定的时间提醒待办。提醒只在这台手机上安排，不经过服务器。"}
        </Text>
      </View>
      <PillButton
        label={denied ? "去设置打开" : "允许通知"}
        icon={denied ? "settings-outline" : "notifications-outline"}
        onPress={() => {
          if (denied) void Linking.openSettings();
          finish(!denied);
        }}
        style={{ marginTop: 22 }}
      />
      <PillButton label={denied ? "知道了" : "以后再说"} variant="ghost" onPress={() => finish(false)} style={{ marginTop: 10 }} />
    </Sheet>
  );
}
