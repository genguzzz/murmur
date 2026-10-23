import { ActivityIndicator, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card, styles as ui } from "@/components/ui";
import type { Entry } from "@/lib/store";
import { timeAgo } from "@/lib/format";
import { colors, MOOD_COLORS } from "@/lib/theme";

export function EntryCard({ entry, onPress }: { entry: Entry; onPress: () => void }) {
  if (entry.status === "transcribing" || entry.status === "analyzing") {
    return (
      <Card onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <ActivityIndicator color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={ui.title}>{entry.status === "transcribing" ? "正在转写…" : "正在整理…"}</Text>
          <Text style={ui.faint}>{entry.kind === "voice" ? `语音 ${Math.round(entry.durationSec ?? 0)} 秒` : "文字记录"} · {timeAgo(entry.createdAt)}</Text>
        </View>
      </Card>
    );
  }
  if (entry.status === "failed") {
    return (
      <Card onPress={onPress} style={{ borderWidth: 1, borderColor: colors.danger + "66" }}>
        <Text style={[ui.title, { color: colors.danger }]}>处理失败，点开重试</Text>
        <Text style={[ui.body, { marginTop: 4 }]}>{entry.error}</Text>
      </Card>
    );
  }
  return (
    <Card onPress={onPress}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {entry.mood ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: MOOD_COLORS[entry.mood] ?? colors.primary }} /> : null}
        <Text style={[ui.title, { flex: 1 }]} numberOfLines={1}>{entry.title}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      </View>
      <Text style={[ui.body, { marginTop: 6 }]} numberOfLines={3}>{entry.summary}</Text>
    </Card>
  );
}
