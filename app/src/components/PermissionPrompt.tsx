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
  notifications: { icon: "notifications", ask: "允许 Murmur 发送通知", why: "用于在你设定的时间提醒待办。提醒由这台设备在本地安排，不经过服务器。" },
  microphone: { icon: "mic", ask: "允许使用麦克风", why: "用于录制语音记录。录音文件保存在这台设备上；转写时会发送到服务器进行语音识别，服务器不保存录音文件。" },
  camera: { icon: "camera", ask: "允许使用相机", why: "用于拍摄照片并添加到记录中。照片只保存在这台设备上。" },
  photos: { icon: "images", ask: "允许访问照片", why: "用于从相册选择照片添加到记录中。" },
  photosAdd: { icon: "download", ask: "允许保存到相册", why: "用于将图片保存到系统相册。Murmur 不会读取相册中的其他内容。" },
  location: { icon: "location", ask: "允许使用位置", why: "用于为记录标注地点。位置信息只保存在这台设备上。" },
  locationAlways: { icon: "navigate", ask: "允许始终使用位置", why: "选择“始终允许”后，Murmur 可在你到达家、公司等地点时于后台提醒相关待办。" },
  calendar: { icon: "calendar", ask: "允许访问日历", why: "用于结合你的日程安排待办，或将待办添加到日历。" },
  reminders: { icon: "checkmark-done", ask: "允许访问提醒事项", why: "用于将待办同步到系统“提醒事项”。" },
  contacts: { icon: "people", ask: "允许访问通讯录", why: "用于识别待办中提到的联系人，例如“给妈妈打电话”。" },
  speech: { icon: "chatbubble-ellipses", ask: "允许使用语音识别", why: "用于在录音时实时显示文字。" },
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
    toast(`未开启${NAME[kind]}权限`, "可在系统设置中开启");
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
        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text, marginTop: 14, textAlign: "center" }}>{denied ? `${NAME[ask.kind]}权限已关闭` : copy.ask}</Text>
        <Text style={{ fontSize: 15, lineHeight: 23, color: colors.textSoft, marginTop: 8, textAlign: "center", paddingHorizontal: 10 }}>
          {denied ? `${ask.reason ?? copy.why}\n请在系统设置中开启 Murmur 的${NAME[ask.kind]}权限。` : (ask.reason ?? copy.why)}
        </Text>
      </View>
      <PillButton
        label={denied ? "打开设置" : "继续"}
        icon={denied ? "settings-outline" : copy.icon}
        onPress={() => {
          if (denied) void Linking.openSettings();
          finish(!denied);
        }}
        style={{ marginTop: 22 }}
      />
      <PillButton label={denied ? "知道了" : "暂不开启"} variant="ghost" onPress={() => finish(false)} style={{ marginTop: 10 }} />
    </Sheet>
  );
}
