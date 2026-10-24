import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Device from "expo-device";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as Updates from "expo-updates";
import { Mascot } from "@/components/Mascot";
import { ensureReminderPermission } from "@/components/PermissionPrompt";
import { Card, PillButton, Screen, Sheet, TopBar, styles as ui, tap, toast } from "@/components/ui";
import { appVersion, describeError, ping, uploadLogs } from "@/lib/api";
import { authenticateBiometric, biometricKind, disableLock } from "@/lib/lock";
import { collectLogs, logger, recentLines, sessionId } from "@/lib/log";
import { cancelRemember, ensurePermission, permissionState, syncCheckins, type CheckinPrefs, type PermissionState } from "@/lib/notify";
import { debugSummary, exportJson, getState, resyncTodoReminders, updateSettings, useStore, wipeAll } from "@/lib/store";
import { checkAndFetch, restartToApply, runningLabel, updatesEnabled } from "@/lib/updates";
import { dayKey } from "@/lib/format";
import { appZone, deviceZone, offsetLabel, wall, zoneOffset } from "@/lib/zone";
import { colors, radius } from "@/lib/theme";

const log = logger("settings");

const THEMES = [
  ["system", "跟随系统", "白天浅色，夜里自动变深", "phone-portrait-outline"],
  ["light", "浅色", "明亮的日间主题", "sunny-outline"],
  ["dark", "深色", "适合夜晚，不刺眼", "moon-outline"],
] as const;
const LOOKS = [["original", "原版"], ["glasses", "戴眼镜"], ["beret", "贝雷帽"]] as const;
const MORNING_TIMES = ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00"];
const EVENING_TIMES = ["20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00"];
const ALLDAY_TIMES = ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "12:00"];
const ZONES = [
  ["Asia/Shanghai", "北京时间"],
  ["Asia/Hong_Kong", "香港"],
  ["Asia/Taipei", "台北"],
  ["Asia/Singapore", "新加坡"],
  ["Asia/Tokyo", "东京"],
  ["Europe/London", "伦敦"],
  ["Europe/Paris", "巴黎"],
  ["America/New_York", "纽约"],
  ["America/Los_Angeles", "洛杉矶"],
] as const;

function zoneLabel(tz: string): string {
  const name = ZONES.find((z) => z[0] === tz)?.[1] ?? tz;
  return `${name} · ${offsetLabel(zoneOffset(tz, new Date()))}`;
}

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const entries = useStore((s) => s.entries);
  const router = useRouter();
  const [bioKind, setBioKind] = useState<"faceid" | "touchid" | null>(null);
  const [sheet, setSheet] = useState<null | "theme" | "look" | "morning" | "evening" | "remember" | "todo" | "zone">(null);
  const [perm, setPerm] = useState<PermissionState | null>(null);
  const [server, setServer] = useState(settings.server);
  const [token, setToken] = useState(settings.token);
  const [name, setName] = useState(settings.name);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const [lastLogId, setLastLogId] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void biometricKind().then(setBioKind);
    void permissionState().then(setPerm);
  }, []);
  const bioName = bioKind === "touchid" ? "Touch ID" : "Face ID";

  const stats = useMemo(() => {
    const voiceSec = entries.reduce((n, e) => n + (e.kind === "voice" ? e.durationSec ?? 0 : 0), 0);
    return { count: entries.length, minutes: Math.round(voiceSec / 60), days: new Set(entries.map((e) => dayKey(e.createdAt))).size };
  }, [entries]);
  // memberSince is filled in on first load, so it is always set here.
  const since = wall(settings.memberSince ?? 0);

  // ---------- notifications ----------
  const setCheckins = async (next: CheckinPrefs, needsPermission: boolean) => {
    if (needsPermission && !(await ensurePermission())) {
      Alert.alert("需要通知权限", "请在系统设置里允许 Murmur 发送通知。");
      return;
    }
    updateSettings({ checkins: next });
    await syncCheckins(next);
    if (!next.remember) void cancelRemember();
  };
  const ck = settings.checkins;

  const setZone = (tz: string | null) => {
    tap();
    updateSettings({ timeZone: tz });
    // Reminders and check-ins are scheduled in device time: rebuild them for the new zone.
    resyncTodoReminders();
    void syncCheckins(getState().settings.checkins);
    log.info("time zone", { pinned: tz, device: deviceZone() });
  };

  // ---------- lock ----------
  const toggleLock = (on: boolean) => {
    if (on) router.push("/pin");
    else
      Alert.alert("关闭密码锁？", "打开 App 将不再需要密码。", [
        { text: "取消", style: "cancel" },
        { text: "关闭", style: "destructive", onPress: () => void disableLock() },
      ]);
  };
  const toggleBio = async (on: boolean) => {
    if (!on) return updateSettings({ lockBiometrics: false });
    // Confirm it actually works (and trigger the iOS permission prompt) before relying on it.
    if (await authenticateBiometric()) updateSettings({ lockBiometrics: true });
    else Alert.alert(`${bioName} 未通过`, "没有开启。");
  };

  // ---------- server / debug / data ----------
  const dirty = server !== settings.server || token !== settings.token || name !== settings.name;
  const saveAndTest = async () => {
    updateSettings({ server: server.trim(), token: token.trim(), name: name.trim() });
    setTesting(true);
    try {
      const r = await ping();
      Alert.alert("连接成功", `服务器时间 ${new Date(r.time).toLocaleString()}`);
    } catch (e) {
      Alert.alert("连接失败", describeError(e));
    } finally {
      setTesting(false);
    }
  };

  const checkUpdate = async () => {
    setChecking(true);
    const ready = await checkAndFetch("manual");
    setChecking(false);
    if (ready)
      Alert.alert("新版本已下载", "重启后生效。", [
        { text: "稍后", style: "cancel" },
        { text: "立即重启", onPress: () => void restartToApply() },
      ]);
    else Alert.alert("已是最新", `当前运行：${runningLabel()}`);
  };

  const upload = async () => {
    setUploading(true);
    try {
      log.info("log upload requested", { note, summary: debugSummary() });
      const text = await collectLogs();
      const { id } = await uploadLogs(text, {
        note,
        session: sessionId,
        appVersion,
        os: `${Platform.OS} ${Platform.Version}`,
        device: `${Device.manufacturer ?? ""} ${Device.modelName ?? ""}`.trim(),
        summary: JSON.stringify(debugSummary()),
      });
      setLastLogId(id);
      setNote("");
      await Clipboard.setStringAsync(id);
      Alert.alert("日志已上传", `编号：${id}\n（已复制，发给开发者即可）`);
    } catch (e) {
      Alert.alert("上传失败", describeError(e));
    } finally {
      setUploading(false);
    }
  };

  const doExport = async () => {
    try {
      const json = exportJson();
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(json);
        toast("已复制到剪贴板");
        return;
      }
      const f = new File(Paths.cache, `murmur-export-${new Date().toISOString().slice(0, 10)}.json`);
      if (f.exists) f.delete();
      f.create();
      await f.write(json);
      await Sharing.shareAsync(f.uri, { mimeType: "application/json", dialogTitle: "导出 Murmur 数据" });
      log.info("exported", { bytes: json.length });
    } catch (e) {
      log.error("export failed", e);
      Alert.alert("导出失败", String(e));
    }
  };

  const wipe = () =>
    Alert.alert("清空所有数据？", "所有记录、录音和对话都会删除，无法恢复。", [
      { text: "取消", style: "cancel" },
      { text: "清空", style: "destructive", onPress: wipeAll },
    ]);

  const theme = THEMES.find((t) => t[0] === settings.theme) ?? THEMES[0];

  return (
    <Screen>
      <TopBar title="设置" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Section icon="compass" title="你的日记">
          <Row icon="document-text-outline" label="总记录" value={`${stats.count} 条`} />
          <Row icon="mic-outline" label="录音时长" value={`${stats.minutes} 分钟`} />
          <Row icon="calendar-outline" label="记录天数" value={`${stats.days} 天`} />
          <Row icon="calendar-number-outline" label="开始使用" value={`${since.getFullYear()}年${since.getMonth() + 1}月${since.getDate()}日`} />
        </Section>

        <Section icon="notifications" title="通知">
          <ToggleRow
            icon="sunny-outline"
            title="早间签到"
            subtitle={ck.morning.enabled ? `每天 ${ck.morning.time} · 给今天定个方向` : "给今天定个方向"}
            value={ck.morning.enabled}
            onChange={(v) => void setCheckins({ ...ck, morning: { ...ck.morning, enabled: v } }, v)}
            onPress={ck.morning.enabled ? () => setSheet("morning") : undefined}
          />
          <ToggleRow
            icon="moon-outline"
            title="晚间签到"
            subtitle={ck.evening.enabled ? `每天 ${ck.evening.time} · 回顾今天，放松一下` : "回顾今天，放松一下"}
            value={ck.evening.enabled}
            onChange={(v) => void setCheckins({ ...ck, evening: { ...ck.evening, enabled: v } }, v)}
            onPress={ck.evening.enabled ? () => setSheet("evening") : undefined}
          />
          <NavRow
            icon="globe-outline"
            title="时区"
            subtitle={settings.timeZone ? `指定：${zoneLabel(settings.timeZone)}` : `跟随系统：${zoneLabel(deviceZone())}`}
            onPress={() => setSheet("zone")}
          />
          <NavRow
            icon="checkmark-circle-outline"
            title="待办提醒"
            subtitle={perm === "granted" ? `到点提醒；只有日期的待办在 ${settings.todoAllDayTime} 提醒` : "通知未开启，待办不会按时提醒"}
            onPress={() => setSheet("todo")}
          />
          <Card onPress={() => setSheet("remember")} style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 6 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="sparkles" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[ui.title, { fontSize: 16 }]}>记得你说过的话</Text>
              <Text style={[ui.body, { fontSize: 13, marginTop: 2 }]}>{ck.remember ? "已开启 · " : ""}根据你真正说过的内容，第二天提醒你接着想。</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Card>
        </Section>

        <Section icon="moon" title="外观">
          <NavRow icon={theme[3]} title="主题" subtitle={`${theme[1]} · ${theme[2]}`} onPress={() => setSheet("theme")} />
          <NavRow iconNode={<Mascot size={34} />} title="吉祥物造型" subtitle={LOOKS.find((l) => l[0] === settings.look)?.[1] ?? "原版"} onPress={() => setSheet("look")} />
        </Section>

        <Section icon="shield-checkmark" title="安全">
          <ToggleRow icon="lock-closed-outline" title="密码锁" subtitle="打开 App 时需要 4 位密码" value={settings.lockEnabled} onChange={toggleLock} />
          {settings.lockEnabled ? (
            <>
              {bioKind ? <ToggleRow icon="scan-outline" title={`使用 ${bioName}`} subtitle="解锁时优先用生物识别" value={settings.lockBiometrics} onChange={(v) => void toggleBio(v)} /> : null}
              <View style={{ paddingVertical: 10, paddingLeft: 42 }}>
                <Text style={[ui.title, { fontSize: 15 }]}>离开后多久上锁</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  {([[0, "立即"], [60, "1 分钟"], [300, "5 分钟"]] as const).map(([v, label]) => (
                    <Segment key={v} label={label} active={settings.lockDelaySec === v} onPress={() => updateSettings({ lockDelaySec: v })} />
                  ))}
                </View>
              </View>
              <NavRow icon="keypad-outline" title="修改密码" onPress={() => router.push("/pin")} />
            </>
          ) : null}
        </Section>

        <Section icon="person" title="称呼">
          <Field value={name} onChange={setName} placeholder="首页问候用的名字（可空）" />
          {name !== settings.name ? <PillButton label="保存" onPress={() => { updateSettings({ name: name.trim() }); toast("已保存"); }} style={{ marginTop: 10, height: 44 }} /> : null}
        </Section>

        <Section icon="server" title="服务器">
          <View style={{ gap: 10 }}>
            <Field value={server} onChange={setServer} placeholder="https://voice.gugenzzz.top" />
            <Field value={token} onChange={setToken} placeholder="访问令牌" secure />
            <PillButton label={dirty ? "保存并测试连接" : "测试连接"} icon="pulse" onPress={() => void saveAndTest()} loading={testing} />
          </View>
          <Text style={[ui.title, { fontSize: 15, marginTop: 16 }]}>识别语言</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {([["auto", "自动"], ["zh", "中文"], ["en", "English"]] as const).map(([v, label]) => (
              <Segment key={v} label={label} active={settings.language === v} onPress={() => updateSettings({ language: v })} />
            ))}
          </View>
        </Section>

        <Section icon="bug" title="调试">
          <Card style={{ gap: 10 }}>
            <Text style={ui.body}>遇到问题时，简单描述一下再上传日志。日志只含操作和错误信息，不含记录内容。</Text>
            <Field value={note} onChange={setNote} placeholder="发生了什么？（可空）" />
            <PillButton label="上传日志" icon="cloud-upload-outline" onPress={() => void upload()} loading={uploading} />
            {lastLogId ? (
              <Pressable onPress={() => void Clipboard.setStringAsync(lastLogId)}>
                <Text style={[ui.faint, { textAlign: "center" }]}>上次上传：{lastLogId}（点击复制）</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setShowLog(!showLog)}>
              <Text style={[ui.faint, { textAlign: "center", textDecorationLine: "underline" }]}>{showLog ? "收起最近日志" : "查看最近日志"}</Text>
            </Pressable>
            {showLog ? (
              <ScrollView style={{ maxHeight: 320, backgroundColor: "#2B211A", borderRadius: radius.sm, padding: 10 }} nestedScrollEnabled>
                <Text selectable style={{ color: "#E9DCCB", fontSize: 10, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) }}>
                  {recentLines(200).join("\n")}
                </Text>
              </ScrollView>
            ) : null}
          </Card>
          <ToggleRow
            icon="stats-chart-outline"
            title="上报使用统计"
            subtitle="只发送用了哪些功能、是否成功，不含任何记录内容"
            value={settings.analytics}
            onChange={(v) => updateSettings({ analytics: v })}
          />
          <NavRow icon="hardware-chip-outline" title="能力自检" subtitle="测试相机、相册、定位、日历等原生能力" onPress={() => router.push("/diagnostics")} />
        </Section>

        <Section icon="folder-open" title="数据与隐私">
          <Text style={[ui.faint, { lineHeight: 18, marginBottom: 6 }]}>录音和记录只保存在这台手机上。发去转写和整理时，服务器处理完就丢弃，不留存。</Text>
          <NavRow icon="download-outline" title="导出全部数据" subtitle="JSON 格式，包含记录和对话（不含录音）" onPress={() => void doExport()} />
          <NavRow icon="trash-outline" title="清空所有数据" subtitle="删除记录、录音和对话" onPress={wipe} danger />
        </Section>

        <Section icon="information-circle" title="版本">
          <Text style={ui.body}>App {appVersion}</Text>
          <Text style={[ui.faint, { marginTop: 4 }]}>
            {updatesEnabled
              ? Updates.isEmbeddedLaunch
                ? "运行的是安装包自带的代码"
                : `运行热更新 ${Updates.updateId?.slice(0, 8)} · ${Updates.createdAt?.toLocaleString() ?? ""}`
              : "开发模式，热更新未启用"}
          </Text>
          <Text style={[ui.faint, { marginTop: 2 }]}>运行时版本 {Updates.runtimeVersion ?? "-"} · session {sessionId}</Text>
          {updatesEnabled ? <PillButton label="检查更新" icon="cloud-download-outline" variant="ghost" onPress={() => void checkUpdate()} loading={checking} style={{ marginTop: 12, height: 44 }} /> : null}
        </Section>
      </ScrollView>

      <Sheet visible={sheet === "theme"} onClose={() => setSheet(null)} icon={<Ionicons name="contrast" size={26} color={colors.primary} />} title="主题" button="完成">
        <View style={{ gap: 10, marginTop: 18 }}>
          {THEMES.map(([v, label, desc, icon]) => (
            <Choice key={v} icon={icon} title={label} subtitle={desc} active={settings.theme === v} onPress={() => updateSettings({ theme: v })} />
          ))}
        </View>
      </Sheet>

      <Sheet visible={sheet === "look"} onClose={() => setSheet(null)} title="吉祥物造型" button="完成">
        <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 22 }}>
          {LOOKS.map(([v, label]) => (
            <Pressable key={v} onPress={() => { tap(); updateSettings({ look: v }); }} style={{ alignItems: "center", gap: 8, padding: 10, borderRadius: 18, borderWidth: 2, borderColor: settings.look === v ? colors.primary : "transparent" }}>
              <Mascot size={72} look={v} />
              <Text style={{ color: colors.text, fontWeight: settings.look === v ? "700" : "400" }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>

      {(["morning", "evening"] as const).map((which) => (
        <Sheet key={which} visible={sheet === which} onClose={() => setSheet(null)} icon={<Ionicons name={which === "morning" ? "sunny" : "moon"} size={26} color={colors.primary} />} title={which === "morning" ? "早间签到时间" : "晚间签到时间"} button="完成">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18, justifyContent: "center" }}>
            {(which === "morning" ? MORNING_TIMES : EVENING_TIMES).map((t) => (
              <Pressable key={t} onPress={() => { tap(); void setCheckins({ ...ck, [which]: { ...ck[which], time: t } }, false); }} style={{ width: 92, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: ck[which].time === t ? colors.primary : colors.cardMuted, borderWidth: 1, borderColor: ck[which].time === t ? colors.primary : colors.border }}>
                <Text style={{ fontSize: 16, color: ck[which].time === t ? colors.onPrimary : colors.text }}>{t}</Text>
              </Pressable>
            ))}
          </View>
        </Sheet>
      ))}

      <Sheet visible={sheet === "todo"} onClose={() => setSheet(null)} icon={<Ionicons name="checkmark-circle" size={26} color={colors.primary} />} title="待办提醒" body="有具体时间的待办到点提醒；只说了日期的，在下面这个时间提醒。" button="完成">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18, justifyContent: "center" }}>
          {ALLDAY_TIMES.map((t) => (
            <Pressable key={t} onPress={() => { tap(); updateSettings({ todoAllDayTime: t }); resyncTodoReminders(); }} style={{ width: 92, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: settings.todoAllDayTime === t ? colors.primary : colors.cardMuted, borderWidth: 1, borderColor: settings.todoAllDayTime === t ? colors.primary : colors.border }}>
              <Text style={{ fontSize: 16, color: settings.todoAllDayTime === t ? colors.onPrimary : colors.text }}>{t}</Text>
            </Pressable>
          ))}
        </View>
        {perm !== "granted" ? (
          <PillButton
            label="开启通知"
            icon="notifications-outline"
            variant="soft"
            onPress={() => {
              setSheet(null);
              // Let this sheet finish dismissing; iOS drops a modal presented mid-dismiss.
              setTimeout(() => void ensureReminderPermission().then(() => permissionState().then(setPerm)), 450);
            }}
            style={{ marginTop: 16 }}
          />
        ) : null}
      </Sheet>

      <Sheet visible={sheet === "zone"} onClose={() => setSheet(null)} icon={<Ionicons name="globe" size={26} color={colors.primary} />} title="时区" body="待办的日期和提醒、「明天下午三点」这类说法、签到时间都按这个时区算。" button="完成">
        <View style={{ marginTop: 14 }}>
          <ToggleRow
            icon="location-outline"
            title="指定时区"
            subtitle={settings.timeZone ? "不随手机时区变化" : `现在跟随系统：${zoneLabel(deviceZone())}`}
            value={!!settings.timeZone}
            onChange={(v) => setZone(v ? "Asia/Shanghai" : null)}
          />
          {settings.timeZone ? (
            <View style={{ gap: 6, marginTop: 4 }}>
              {ZONES.map(([tz, name]) => {
                const on = settings.timeZone === tz;
                const off = zoneOffset(tz, new Date());
                return (
                  <Pressable key={tz} onPress={() => setZone(tz)} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 14, borderRadius: radius.sm, backgroundColor: on ? colors.primarySoft : colors.cardMuted, borderWidth: 1, borderColor: on ? colors.primary : colors.border }}>
                    <Text style={{ flex: 1, fontSize: 15, color: colors.text, fontWeight: on ? "700" : "400" }}>{name}</Text>
                    <Text style={{ fontSize: 13, color: colors.textSoft, marginRight: on ? 8 : 0 }}>{offsetLabel(off)}</Text>
                    {on ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <Text style={[ui.faint, { textAlign: "center", marginTop: 12 }]}>
            按当前设置，现在是 {(() => { const w = wall(); return `${w.getMonth() + 1}月${w.getDate()}日 ${w.getHours()}:${`${w.getMinutes()}`.padStart(2, "0")}`; })()}（{appZone()}）
          </Text>
        </View>
      </Sheet>

      <Sheet visible={sheet === "remember"} onClose={() => setSheet(null)} icon={<Ionicons name="sparkles" size={26} color={colors.primary} />} title="记得你说过的话" body={`每条记录整理完后，Murmur 会在第二天 ${ck.evening.time}（晚间签到的时间）用这条记录的追问提醒你，点开就能接着说。`} button={null}>
        <PillButton
          label={ck.remember ? "关闭提醒" : "开启提醒"}
          variant={ck.remember ? "ghost" : "primary"}
          onPress={() => { void setCheckins({ ...ck, remember: !ck.remember }, !ck.remember); setSheet(null); toast(ck.remember ? "已关闭提醒" : "已开启提醒"); }}
          style={{ marginTop: 20 }}
        />
      </Sheet>
    </Screen>
  );
}

function Section({ icon, title, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 26 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon} size={15} color={colors.primary} />
        </View>
        <Text style={{ fontSize: 14, fontWeight: "700", letterSpacing: 2, color: colors.text }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Row({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 11 }}>
      <Ionicons name={icon} size={24} color={colors.text} style={{ width: 26 }} />
      <View>
        <Text style={{ color: colors.textSoft, fontSize: 14 }}>{label}</Text>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: "600", marginTop: 2 }}>{value}</Text>
      </View>
    </View>
  );
}

function ToggleRow({ icon, title, subtitle, value, onChange, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; value: boolean; onChange: (v: boolean) => void; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={() => { tap(); onPress?.(); }} style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12 }}>
      <Ionicons name={icon} size={24} color={colors.text} style={{ width: 26 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: "600" }}>{title}</Text>
        <Text style={{ color: colors.textSoft, fontSize: 14, marginTop: 2 }}>{subtitle}</Text>
      </View>
      <Switch value={value} onValueChange={(v) => { tap(); onChange(v); }} trackColor={{ true: "#5E7F4F", false: colors.border }} />
    </Pressable>
  );
}

function NavRow({ icon, iconNode, title, subtitle, onPress, danger }: { icon?: keyof typeof Ionicons.glyphMap; iconNode?: ReactNode; title: string; subtitle?: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 26, alignItems: "center" }}>{iconNode ?? <Ionicons name={icon!} size={24} color={danger ? colors.danger : colors.text} />}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? colors.danger : colors.text, fontSize: 17, fontWeight: "600" }}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.textSoft, fontSize: 14, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

function Choice({ icon, title, subtitle, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 14, backgroundColor: colors.cardMuted, borderWidth: 1.5, borderColor: active ? colors.primary : colors.border }}>
      <Ionicons name={icon} size={22} color={colors.text} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>{title}</Text>
        <Text style={{ color: colors.textSoft, fontSize: 13, marginTop: 2 }}>{subtitle}</Text>
      </View>
      {active ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
    </Pressable>
  );
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={{ flex: 1, height: 38, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: active ? colors.primary : colors.card, borderWidth: 1, borderColor: active ? colors.primary : colors.border }}>
      <Text style={{ color: active ? colors.onPrimary : colors.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

function Field({ value, onChange, placeholder, secure }: { value: string; onChange: (v: string) => void; placeholder: string; secure?: boolean }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      secureTextEntry={secure}
      autoCapitalize="none"
      autoCorrect={false}
      style={{ height: 46, backgroundColor: colors.card, borderRadius: radius.sm, paddingHorizontal: 14, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border }}
    />
  );
}
