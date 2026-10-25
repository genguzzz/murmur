import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { EntryCard } from "@/components/EntryCard";
import { MoodLegend } from "@/components/MoodLegend";
import { MoodStamp } from "@/components/MoodStamp";
import { EmptyState, IconButton, Screen, TopBar, styles as ui, tap } from "@/components/ui";
import { entriesByDay, mainMood } from "@/lib/days";
import { sortedEntries, useStore } from "@/lib/store";
import { colors, MOOD_LABELS } from "@/lib/theme";

const WEEKDAYS = "日一二三四五六";

// One day from the calendar: its main mood, the date, and every entry recorded that day.
export default function Day() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const router = useRouter();
  const raw = useStore((s) => s.entries);
  const [legend, setLegend] = useState(false);

  const byDay = useMemo(() => entriesByDay(sortedEntries(raw).filter((e) => e.status === "done")), [raw]);
  const list = byDay.get(date) ?? [];
  const mood = mainMood(list);
  const d = new Date(`${date}T12:00:00`);

  return (
    <Screen>
      <TopBar title="日历" right={<><IconButton name="time-outline" onPress={() => router.push("/entries")} /><IconButton name="search-outline" onPress={() => router.push("/search")} /></>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 60 }}>
        <View style={{ alignItems: "center", marginTop: 4, marginBottom: 24 }}>
          {mood ? (
            <Pressable onPress={() => { tap(); setLegend(true); }} style={{ alignItems: "center" }}>
              <MoodStamp mood={mood.mood} size={60} />
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 10 }}>{mood.moodLabel ?? MOOD_LABELS[mood.mood!]}</Text>
            </Pressable>
          ) : null}
          <Text style={{ fontSize: 28, fontWeight: "800", color: colors.text, marginTop: 18, textAlign: "center" }}>
            {d.getFullYear()}年{d.getMonth() + 1}月{d.getDate()}日 星期{WEEKDAYS[d.getDay()]}
          </Text>
          <Text style={[ui.body, { fontSize: 16, marginTop: 6 }]}>{list.length} 条记录</Text>
        </View>

        {list.length ? (
          <View style={{ gap: 12 }}>
            {list.map((e) => <EntryCard full key={e.id} entry={e} onPress={() => router.push(`/entry/${e.id}`)} />)}
          </View>
        ) : (
          <EmptyState text="这天没有记录" />
        )}
      </ScrollView>
      <MoodLegend visible={legend} onClose={() => setLegend(false)} />
    </Screen>
  );
}
