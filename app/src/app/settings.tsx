import { useEffect, useState, type ReactNode } from "react";
import { Alert, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Device from "expo-device";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { File, Paths } from "expo-file-system";
import { Card, PillButton, SectionTitle, TopBar, styles as ui, tap } from "@/components/ui";
import { appVersion, describeError, ping, uploadLogs } from "@/lib/api";
import { authenticateBiometric, biometricKind, disableLock } from "@/lib/lock";
import { collectLogs, logger, recentLines, sessionId } from "@/lib/log";
import { debugSummary, exportJson, updateSettings, useStore, wipeAll } from "@/lib/store";
import * as Updates from "expo-updates";
import { checkAndFetch, restartToApply, runningLabel, updatesEnabled } from "@/lib/updates";
import { colors, radius } from "@/lib/theme";

const log = logger("settings");

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const router = useRouter();
  const [bioKind, setBioKind] = useState<"faceid" | "touchid" | null>(null);
  useEffect(() => {
    void biometricKind().then(setBioKind);
  }, []);
  const bioName = bioKind === "touchid" ? "Touch ID" : "Face ID";

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
  const [server, setServer] = useState(settings.server);
  const [token, setToken] = useState(settings.token);
  const [name, setName] = useState(settings.name);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const [lastLogId, setLastLogId] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [checking, setChecking] = useState(false);

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
        Alert.alert("已复制到剪贴板");
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="设置" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card muted style={{ flexDirection: "row", gap: 8 }}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.textSoft} />
          <Text style={[ui.faint, { flex: 1, lineHeight: 18 }]}>录音和记录只保存在这台手机上。发去转写和整理时，服务器处理完就丢弃，不留存。</Text>
        </Card>

        <SectionTitle icon="person-outline" title="称呼" />
        <Field value={name} onChange={setName} placeholder="首页问候用的名字（可空）" />

        <SectionTitle icon="contrast-outline" title="外观" />
        <View style={{ flexDirection: "row", gap: 8 }}>
          {([["system", "跟随系统"], ["light", "浅色"], ["dark", "深色"]] as const).map(([v, label]) => (
            <Pressable key={v} onPress={() => { tap(); updateSettings({ theme: v }); }} style={{ flex: 1, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: settings.theme === v ? colors.primary : colors.card, borderWidth: 1, borderColor: settings.theme === v ? colors.primary : colors.border }}>
              <Text style={{ color: settings.theme === v ? colors.onPrimary : colors.text }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <SectionTitle icon="lock-closed-outline" title="隐私锁" />
        <Card style={{ gap: 14 }}>
          <ToggleRow title="密码锁" subtitle="打开 App 时需要 4 位密码" value={settings.lockEnabled} onChange={toggleLock} />
          {settings.lockEnabled ? (
            <>
              {bioKind ? <ToggleRow title={`使用 ${bioName}`} subtitle="解锁时优先用生物识别" value={settings.lockBiometrics} onChange={(v) => void toggleBio(v)} /> : null}
              <View>
                <Text style={[ui.title, { fontSize: 15 }]}>离开后多久上锁</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  {([[0, "立即"], [60, "1 分钟"], [300, "5 分钟"]] as const).map(([v, label]) => (
                    <Pressable key={v} onPress={() => updateSettings({ lockDelaySec: v })} style={{ flex: 1, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: settings.lockDelaySec === v ? colors.primary : colors.bg, borderWidth: 1, borderColor: settings.lockDelaySec === v ? colors.primary : colors.border }}>
                      <Text style={{ color: settings.lockDelaySec === v ? colors.onPrimary : colors.text, fontSize: 13 }}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Pressable onPress={() => router.push("/pin")}>
                <Text style={{ color: colors.primaryDark, fontWeight: "600" }}>修改密码</Text>
              </Pressable>
            </>
          ) : null}
        </Card>

        <SectionTitle icon="server-outline" title="服务器" />
        <View style={{ gap: 10 }}>
          <Field value={server} onChange={setServer} placeholder="https://voice.gugenzzz.top" />
          <Field value={token} onChange={setToken} placeholder="访问令牌" secure />
          <PillButton label={dirty ? "保存并测试连接" : "测试连接"} icon="pulse" onPress={() => void saveAndTest()} loading={testing} />
        </View>

        <SectionTitle icon="language-outline" title="识别语言" />
        <View style={{ flexDirection: "row", gap: 8 }}>
          {([["auto", "自动"], ["zh", "中文"], ["en", "English"]] as const).map(([v, label]) => (
            <Pressable key={v} onPress={() => updateSettings({ language: v })} style={{ flex: 1, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: settings.language === v ? colors.primary : colors.card, borderWidth: 1, borderColor: settings.language === v ? colors.primary : colors.border }}>
              <Text style={{ color: settings.language === v ? colors.onPrimary : colors.text }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <SectionTitle icon="bug-outline" title="调试" />
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

        <SectionTitle icon="folder-open-outline" title="数据" />
        <View style={{ gap: 10 }}>
          <Row icon="download-outline" title="导出全部数据" subtitle="JSON 格式，包含记录和对话（不含录音）" onPress={() => void doExport()} />
          <Row icon="trash-outline" title="清空所有数据" subtitle="删除记录、录音和对话" onPress={wipe} danger />
        </View>

        <SectionTitle icon="information-circle-outline" title="版本" />
        <Card style={{ gap: 6 }}>
          <Text style={ui.body}>App {appVersion}</Text>
          <Text style={ui.faint}>
            {updatesEnabled
              ? Updates.isEmbeddedLaunch
                ? "运行的是安装包自带的代码"
                : `运行热更新 ${Updates.updateId?.slice(0, 8)} · ${Updates.createdAt?.toLocaleString() ?? ""}`
              : "开发模式，热更新未启用"}
          </Text>
          <Text style={ui.faint}>运行时版本 {Updates.runtimeVersion ?? "-"}</Text>
          {updatesEnabled ? <PillButton label="检查更新" icon="cloud-download-outline" variant="ghost" onPress={() => void checkUpdate()} loading={checking} style={{ marginTop: 6, height: 44 }} /> : null}
        </Card>

        <Text style={[ui.faint, { textAlign: "center", marginTop: 30 }]}>session {sessionId}</Text>
      </ScrollView>
    </View>
  );
}

function ToggleRow({ title, subtitle, value, onChange }: { title: string; subtitle: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={[ui.title, { fontSize: 15 }]}>{title}</Text>
        <Text style={[ui.faint, { marginTop: 2 }]}>{subtitle}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} />
    </View>
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

function Row({ icon, title, subtitle, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; onPress: () => void; danger?: boolean }): ReactNode {
  return (
    <Card onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.textSoft} />
      <View style={{ flex: 1 }}>
        <Text style={[ui.title, { fontSize: 15, color: danger ? colors.danger : colors.text }]}>{title}</Text>
        <Text style={[ui.faint, { marginTop: 2 }]}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </Card>
  );
}
