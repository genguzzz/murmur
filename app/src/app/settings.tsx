import { useState, type ReactNode } from "react";
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Device from "expo-device";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { Card, PillButton, SectionTitle, TopBar, styles as ui } from "@/components/ui";
import { appVersion, describeError, ping, uploadLogs } from "@/lib/api";
import { collectLogs, logger, recentLines, sessionId } from "@/lib/log";
import { debugSummary, exportJson, updateSettings, useStore, wipeAll } from "@/lib/store";
import { colors, radius } from "@/lib/theme";

const log = logger("settings");

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const [server, setServer] = useState(settings.server);
  const [token, setToken] = useState(settings.token);
  const [name, setName] = useState(settings.name);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const [lastLogId, setLastLogId] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

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
              <Text style={{ color: settings.language === v ? "#fff" : colors.text }}>{label}</Text>
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

        <Text style={[ui.faint, { textAlign: "center", marginTop: 30 }]}>Murmur {appVersion} · session {sessionId}</Text>
      </ScrollView>
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
