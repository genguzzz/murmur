import { ActivityIndicator, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card, Chip, styles as ui } from "@/components/ui";
import { MoodStamp } from "@/components/MoodStamp";
import type { Entry } from "@/lib/store";
import { timeAgo } from "@/lib/format";
import { colors, MOOD_LABELS } from "@/lib/theme";

function clockTime(iso: string) {
  const d = new Date(iso);
  return `${d.getHours()}:${`${d.getMinutes()}`.padStart(2, "0")}`;
}

// `full` adds the stamp, time and theme chips (calendar/list); compact is for Home.
export function EntryCard({ entry, onPress, full }: { entry: Entry; onPress: () => void; full?: boolean }) {
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
      <Card onPress={onPress} style={{ borderColor: colors.danger + "66" }}>
        <Text style={[ui.title, { color: colors.danger }]}>处理失败，点开查看</Text>
        <Text style={[ui.body, { marginTop: 4 }]}>{entry.error}</Text>
      </Card>
    );
  }
  if (!full) {
    return (
      <Card onPress={onPress}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={[ui.title, { flex: 1 }]} numberOfLines={1}>{entry.title}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </View>
        <Text style={[ui.body, { marginTop: 6 }]} numberOfLines={2}>{entry.summary}</Text>
      </Card>
    );
  }
  return (
    <Card onPress={onPress}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {entry.mood ? <MoodStamp mood={entry.mood} size={52} /> : null}
        <View style={{ flex: 1, justifyContent: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {entry.mood ? <MoodStamp mood={entry.mood} size={16} /> : null}
            <Text style={[ui.title, { fontSize: 17, flex: 1 }]} numberOfLines={1}>{entry.title}</Text>
          </View>
          <Text style={[ui.faint, { marginTop: 4, fontSize: 13 }]}>
            {clockTime(entry.createdAt)}
            {entry.moodLabel || entry.mood ? ` · ${entry.moodLabel ?? MOOD_LABELS[entry.mood!]}` : ""}
          </Text>
        </View>
      </View>
      <Text style={[ui.body, { marginTop: 10, color: colors.text, opacity: 0.85 }]} numberOfLines={2}>{entry.summary}</Text>
      {entry.themes?.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {entry.themes.slice(0, 3).map((t) => <Chip key={t} text={t} />)}
        </View>
      ) : null}
    </Card>
  );
}
