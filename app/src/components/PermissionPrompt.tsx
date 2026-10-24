// In-app explainer shown before any one-shot iOS permission prompt, and a way back
// to Settings once access was denied. Registered as the prompter for lib/device/access.
import { useEffect, useSyncExternalStore } from "react";
import { Linking, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Mascot } from "./Mascot";
import { PillButton, Sheet, toast } from "./ui";
import { ensureAccess, type PermissionKind } from "@/lib/device";
import { setPrompter } from "@/lib/device/access";
import { resyncTodoReminders } from "@/lib/store";
import { colors } from "@/lib/theme";

const COPY: Record<PermissionKind, { icon: keyof typeof Ionicons.glyphMap; ask: string; why: string }> = {
  notifications: { icon: "notifications", ask: "到点了，我来提醒你", why: "Murmur 需要通知权限，才能在你定的时间提醒待办。提醒只在这台手机上安排，不经过服务器。" },
  microphone: { icon: "mic", ask: "让我听见你", why: "录音需要麦克风权限。录音只存在这台手机上。" },
  camera: { icon: "camera", ask: "拍张照片记下来", why: "拍照需要相机权限。照片只存在这台手机上。" },
  photos: { icon: "images", ask: "从相册里挑照片", why: "需要访问相册，才能把照片放进记录。" },
  photosAdd: { icon: "download", ask: "保存到相册", why: "需要相册的写入权限，才能把图片保存进去。" },
  location: { icon: "location", ask: "记下你在哪儿", why: "需要位置权限，才能给记录标上地点。位置只存在这台手机上。" },
  locationAlways: { icon: "navigate", ask: "到了地方再提醒你", why: "选择「始终允许」，到家、到公司时 Murmur 才能在后台提醒你对应的待办。" },
  calendar: { icon: "calendar", ask: "看看你的日程", why: "需要日历权限，才能结合你的日程安排待办，或把待办写进日历。" },
  reminders: { icon: "checkmark-done", ask: "同步到提醒事项", why: "需要「提醒事项」权限，才能把待办同步到系统提醒事项。" },
  contacts: { icon: "people", ask: "认出你提到的人", why: "需要通讯录权限，才能在待办里找到你说的人，比如「给妈妈打电话」。" },
  speech: { icon: "chatbubble-ellipses", ask: "边说边出字", why: "需要语音识别权限，才能在你说话时实时显示文字。" },
};

const NAME: Record<PermissionKind, string> = {
  notifications: "通知", microphone: "麦克风", camera: "相机", photos: "照片", photosAdd: "照片", location: "位置",
  locationAlways: "位置（始终）", calendar: "日历", reminders: "提醒事项", contacts: "通讯录", speech: "语音识别",
};

type Ask = { kind: PermissionKind; mode: "ask" | "denied"; reason?: string; resolve: (ok: boolean) => void };
let current: Ask | null = null;
const listeners = new Set<() => void>();
const deniedShown = new Set<PermissionKind>();

function show(kind: PermissionKind, mode: Ask["mode"], reason?: string): Promise<boolean> {
  // After the first "go to Settings" sheet in a session, a toast is enough.
  if (mode === "denied" && deniedShown.has(kind)) {
    toast(`${NAME[kind]}权限没开`, "可以在系统设置里打开");
    return Promise.resolve(false);
  }
  if (mode === "denied") deniedShown.add(kind);
  return new Promise((resolve) => {
    current?.resolve(false);
    current = { kind, mode, reason, resolve };
    listeners.forEach((l) => l());
  });
}

function finish(ok: boolean) {
  current?.resolve(ok);
  current = null;
  listeners.forEach((l) => l());
}

export async function ensureReminderPermission(): Promise<boolean> {
  const a = await ensureAccess("notifications");
  if (a === "granted") resyncTodoReminders();
  return a === "granted";
}

export function PermissionHost() {
  useEffect(() => {
    setPrompter(show);
    return () => setPrompter(null);
  }, []);
  const ask = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
  if (!ask) return null;
  const denied = ask.mode === "denied";
  const copy = COPY[ask.kind];
  return (
    <Sheet visible onClose={() => finish(false)} button={null}>
      <View style={{ alignItems: "center", marginTop: 4 }}>
        <View>
          <Mascot size={84} />
          <View style={{ position: "absolute", right: -6, top: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.sheet }}>
            <Ionicons name={copy.icon} size={14} color={colors.onPrimary} />
          </View>
        </View>
        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text, marginTop: 14, textAlign: "center" }}>{denied ? `${NAME[ask.kind]}权限被关掉了` : copy.ask}</Text>
        <Text style={{ fontSize: 15, lineHeight: 23, color: colors.textSoft, marginTop: 8, textAlign: "center", paddingHorizontal: 10 }}>
          {denied ? `${ask.reason ?? copy.why}\n去系统设置里打开 Murmur 的${NAME[ask.kind]}权限就行。` : (ask.reason ?? copy.why)}
        </Text>
      </View>
      <PillButton
        label={denied ? "去设置打开" : "好的"}
        icon={denied ? "settings-outline" : copy.icon}
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
