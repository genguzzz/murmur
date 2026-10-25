import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { Card, Screen, TopBar, styles as ui, tap } from "@/components/ui";
import {
  accessOf,
  addReminder,
  ALL_PERMISSIONS,
  backgroundStatus,
  capabilities,
  compressPhoto,
  currentPlace,
  deleteReminder,
  ensureAccess,
  isOnline,
  kv,
  liveTranscribe,
  locale,
  pickContact,
  pickFiles,
  pickPhotos,
  speak,
  takePhoto,
  upcomingEvents,
  type Access,
  type LiveTranscription,
  type PermissionKind,
} from "@/lib/device";
import { describeError } from "@/lib/api";
import { flushEvents } from "@/lib/track";
import { colors, radius } from "@/lib/theme";

const ACCESS_COLOR: Record<Access, string> = { granted: "#5E9A55", limited: "#D9A15B", ask: "#A99683", denied: "#C2574A" };
const ACCESS_LABEL: Record<Access, string> = { granted: "已允许", limited: "部分允许", ask: "未询问", denied: "已拒绝" };

// Debug page: proves every native capability in this binary works, so features
// built on them can ship over the air. Each test goes through the lib/device wrappers.
export default function Diagnostics() {
  const [caps] = useState(() => capabilities());
  const [perms, setPerms] = useState<Partial<Record<PermissionKind, Access>>>({});
  const [results, setResults] = useState<{ name: string; ok: boolean; text: string }[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [live, setLive] = useState<LiveTranscription | null>(null);
  const [liveText, setLiveText] = useState("");

  const refresh = useCallback(async () => {
    const entries = await Promise.all(ALL_PERMISSIONS.map(async (k) => [k, await accessOf(k)] as const));
    setPerms(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = (name: string, fn: () => Promise<string | null>) => async () => {
    tap();
    try {
      const text = await fn();
      setResults((r) => [{ name, ok: true, text: text ?? "已取消" }, ...r].slice(0, 30));
    } catch (e) {
      setResults((r) => [{ name, ok: false, text: describeError(e) }, ...r].slice(0, 30));
    }
    void refresh();
  };

  const tests: [string, () => Promise<string | null>][] = [
    ["拍照", async () => { const p = await takePhoto(); if (p) setPhoto(p.uri); return p && `${p.width}×${p.height} ${p.size ? Math.round(p.size / 1024) + "KB" : ""}`; }],
    ["选照片", async () => { const ps = await pickPhotos({ max: 3 }); if (ps?.[0]) setPhoto(ps[0].uri); return ps && `${ps.length} 张${ps[0]?.location ? " · 含位置" : ""}${ps[0]?.takenAt ? ` · ${ps[0].takenAt}` : ""}`; }],
    ["压缩照片", async () => { if (!photo) return "请先拍照或选择照片"; const c = await compressPhoto(photo, { maxSide: 1200 }); setPhoto(c.uri); return `${c.width}×${c.height} ${Math.round((c.size ?? 0) / 1024)}KB`; }],
    ["定位", async () => { const p = await currentPlace({ reason: "测试定位能力" }); return `${p.name || "（无地名）"} ${p.latitude.toFixed(4)},${p.longitude.toFixed(4)} ±${Math.round(p.accuracy ?? 0)}m`; }],
    ["近两天日程", async () => { const ev = await upcomingEvents({ days: 2 }); return `${ev.length} 个${ev[0] ? `，最近一项：${ev[0].title}` : ""}`; }],
    ["写入提醒事项", async () => { const id = await addReminder({ title: "Murmur 能力自检（会自动删除）", due: new Date(Date.now() + 3600_000) }); await deleteReminder(id); return "写入并删除成功"; }],
    ["选联系人", async () => { const c = await pickContact(); return c && `${c.name} · ${c.phones.length} 个号码`; }],
    ["选文件", async () => { const f = await pickFiles(); return f && `${f[0].name} ${f[0].size ? Math.round(f[0].size / 1024) + "KB" : ""}`; }],
    ["朗读", async () => { await speak("这是 Murmur 朗读测试。"); return "播放完成"; }],
    ["网络", async () => (await isOnline()) ? "在线" : "离线"],
    ["地区", async () => { const l = locale(); return `${l.language} · ${l.timeZone} · ${l.uses24h ? "24" : "12"} 小时制`; }],
    ["后台刷新", async () => { const s = await backgroundStatus(); return `${s.available ? "可用" : "系统未开启"} · ${s.registered ? "已注册" : "未注册"}`; }],
    ["本地 KV", async () => { kv.set("diag.ping", Date.now()); return `读回 ${kv.get("diag.ping", 0)}`; }],
    ["上传埋点", async () => { await flushEvents(); return "已发送"; }],
  ];

  const toggleLive = async () => {
    tap();
    if (live) {
      live.stop();
      setLive(null);
      return;
    }
    setLiveText("");
    try {
      const s = await liveTranscribe({
        reason: "测试实时语音识别",
        onText: (t) => setLiveText(t),
        onError: (e) => setResults((r) => [{ name: "实时识别", ok: false, text: e.message }, ...r]),
        onEnd: () => setLive(null),
      });
      setLive(s);
    } catch (e) {
      setResults((r) => [{ name: "实时识别", ok: false, text: describeError(e) }, ...r]);
    }
  };

  const missing = Object.entries(caps).filter(([, v]) => !v);

  return (
    <Screen doodles={false}>
      <TopBar title="能力自检" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60, gap: 18 }}>
        <View>
          <Text style={[ui.title, { marginBottom: 8 }]}>原生模块 · {Object.keys(caps).length - missing.length}/{Object.keys(caps).length}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(caps).map(([k, v]) => (
              <View key={k} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: (v ? "#5E9A55" : "#C2574A") + "22" }}>
                <Text style={{ fontSize: 11.5, color: v ? "#5E9A55" : "#C2574A", fontWeight: "600" }}>{k}</Text>
              </View>
            ))}
          </View>
        </View>

        <View>
          <Text style={[ui.title, { marginBottom: 8 }]}>权限（点按申请）</Text>
          <Card style={{ padding: 0 }}>
            {ALL_PERMISSIONS.map((k, i) => {
              const a = perms[k];
              return (
                <Pressable key={k} onPress={() => { tap(); void ensureAccess(k).then(refresh); }} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                  <Text style={{ flex: 1, color: colors.text, fontSize: 14 }}>{k}</Text>
                  {a ? <Text style={{ fontSize: 12.5, fontWeight: "700", color: ACCESS_COLOR[a] }}>{ACCESS_LABEL[a]}</Text> : null}
                </Pressable>
              );
            })}
          </Card>
        </View>

        <View>
          <Text style={[ui.title, { marginBottom: 8 }]}>功能测试</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {tests.map(([name, fn]) => (
              <Pressable key={name} onPress={run(name, fn)} style={({ pressed }) => ({ paddingHorizontal: 12, height: 36, borderRadius: 999, justifyContent: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 })}>
                <Text style={{ color: colors.text, fontSize: 13.5 }}>{name}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => void toggleLive()} style={{ paddingHorizontal: 12, height: 36, borderRadius: 999, justifyContent: "center", backgroundColor: live ? colors.primary : colors.card, borderWidth: 1, borderColor: live ? colors.primary : colors.border }}>
              <Text style={{ color: live ? colors.onPrimary : colors.text, fontSize: 13.5 }}>{live ? "停止识别" : "实时识别"}</Text>
            </Pressable>
          </View>
          {live || liveText ? (
            <Card muted style={{ marginTop: 10 }}>
              <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>{liveText || "请开始说话…"}</Text>
            </Card>
          ) : null}
          {photo ? <Image source={{ uri: photo }} style={{ width: "100%", height: 200, borderRadius: radius.md, marginTop: 10 }} contentFit="cover" /> : null}
        </View>

        {results.length ? (
          <Card style={{ gap: 8 }}>
            {results.map((r, i) => (
              <Text key={i} style={{ fontSize: 13, color: r.ok ? colors.text : colors.danger }}>
                {r.ok ? "✓" : "✗"} {r.name}：{r.text}
              </Text>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
