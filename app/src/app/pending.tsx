import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { WaveformPlayer } from "@/components/WaveformPlayer";
import { Card, EmptyState, Screen, TopBar, styles as ui, tap, toast } from "@/components/ui";
import { dismissPending, pendingAsChat, pendingAsNote, useStore, type Entry, type PendingIntent } from "@/lib/store";
import { shortDate, clockOf } from "@/lib/format";
import { colors, radius } from "@/lib/theme";

// Memos the agent didn't act on: ones it couldn't place (a test, a fragment) and older
// to-do drafts waiting for confirmation. Audio stays on the phone until you decide.
export default function Pending() {
  const inbox = useStore((s) => s.inbox);
  return (
    <Screen>
      <TopBar title="待确认" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 60, gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.cardMuted }}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textSoft} />
          <Text style={[ui.body, { flex: 1 }]}>未能判断用途的录音会暂存在这里，你可以将其保存为记录、作为问题提问或删除。录音只保存在这台设备上。</Text>
        </View>
        {inbox.length === 0 ? <EmptyState text="没有待确认的录音" /> : inbox.map((p) => (p.kind === "unclear" ? <UnclearCard key={p.id} p={p} /> : <DraftCard key={p.id} p={p} />))}
      </ScrollView>
    </Screen>
  );
}

function UnclearCard({ p }: { p: PendingIntent }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // The player only needs these fields; it's never saved as an entry.
  const audio: Entry | null = p.audioFile ? { id: p.id, createdAt: p.createdAt, kind: "voice", status: "done", audioFile: p.audioFile, durationSec: p.durationSec, title: p.title } : null;
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={[ui.title, { flex: 1, fontSize: 14 }]}>{shortDate(p.createdAt)} {clockOf(p.createdAt)}</Text>
        <Text style={ui.faint}>未保存</Text>
      </View>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, marginTop: 10 }}>{p.title ?? "未能判断用途"}</Text>
      {p.reason ? <Text style={[ui.body, { fontSize: 15, lineHeight: 23, marginTop: 6 }]}>{p.reason}</Text> : null}
      {p.prompt ? <Text style={[ui.body, { marginTop: 10 }]}>回答的问题：“{p.prompt}”</Text> : null}
      <Pressable onPress={() => { tap(); setOpen(!open); }} style={{ marginTop: 10 }}>
        <Text style={{ fontSize: 15, lineHeight: 23, color: colors.text }} numberOfLines={open ? undefined : 2}>“{p.text}”</Text>
      </Pressable>
      {audio ? (
        <View style={{ marginTop: 12 }}>
          <WaveformPlayer entry={audio} />
        </View>
      ) : null}
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 14 }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Action icon="bookmark-outline" label="保存为记录" primary onPress={() => { const id = pendingAsNote(p.id); toast("已保存为记录", "正在整理…"); if (id) router.push(`/entry/${id}`); }} />
        <Action icon="chatbubble-ellipses-outline" label="作为提问" onPress={() => { const id = pendingAsChat(p.id); if (id) router.push(`/chats/${id}`); }} />
        <View style={{ flex: 1 }} />
        <Action icon="trash-outline" label="删除" danger onPress={() => { dismissPending(p.id); toast("已删除"); }} />
      </View>
    </Card>
  );
}

function DraftCard({ p }: { p: PendingIntent }) {
  const router = useRouter();
  return (
    <Card onPress={() => router.push(`/confirm/${p.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Ionicons name="checkmark-done-outline" size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={ui.title}>{p.drafts.length ? `${p.drafts.length} 件待办待确认` : "有事项可能已完成"}</Text>
        <Text style={[ui.body, { marginTop: 2 }]} numberOfLines={1}>“{p.text}”</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </Card>
  );
}

function Action({ icon, label, onPress, primary, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; primary?: boolean; danger?: boolean }) {
  const color = danger ? colors.danger : primary ? colors.onPrimary : colors.text;
  return (
    <Pressable
      onPress={() => { tap(); onPress(); }}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: primary ? 16 : 10, paddingVertical: 10, borderRadius: 12, backgroundColor: primary ? colors.text : "transparent", opacity: pressed ? 0.75 : 1 })}
    >
      <Ionicons name={icon} size={17} color={primary ? colors.bg : color} />
      <Text style={{ fontSize: 15, fontWeight: "600", color: primary ? colors.bg : color }}>{label}</Text>
    </Pressable>
  );
}
