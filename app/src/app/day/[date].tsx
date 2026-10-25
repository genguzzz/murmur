import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { EntryCard } from "@/components/EntryCard";
import { MoodLegend } from "@/components/MoodLegend";
import { MoodStamp } from "@/components/MoodStamp";
import { EmptyState, Screen, TopBar, styles as ui, tap } from "@/components/ui";
import { entriesByDay, mainMood } from "@/lib/days";
import { sortedEntries, useStore } from "@/lib/store";
import { colors, fonts, MOOD_LABELS } from "@/lib/theme";

const WEEKDAYS = "日一二三四五六";

// One day from the calendar: its main mood, the date, and every entry recorded that
// day. The arrows step to the previous / next day that has entries.
export default function Day() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const router = useRouter();
  const raw = useStore((s) => s.entries);
  const [legend, setLegend] = useState(false);

  const byDay = useMemo(() => entriesByDay(sortedEntries(raw).filter((e) => e.status === "done")), [raw]);
  const list = byDay.get(date) ?? [];
  const mood = mainMood(list);
  const days = useMemo(() => [...byDay.keys()].sort(), [byDay]);
  const i = days.indexOf(date);
  const prev = i > 0 ? days[i - 1] : undefined;
  const next = i >= 0 && i < days.length - 1 ? days[i + 1] : undefined;
  const d = new Date(`${date}T12:00:00`);
  const go = (k: string) => { tap(); router.replace(`/day/${k}`); };

  return (
    <Screen>
      <TopBar title="日历" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 60 }}>
        <View style={{ alignItems: "center", marginTop: 4, marginBottom: 24 }}>
          {mood ? (
            <Pressable onPress={() => { tap(); setLegend(true); }} style={{ alignItems: "center" }}>
              <MoodStamp mood={mood.mood} size={64} />
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 10 }}>{mood.moodLabel ?? MOOD_LABELS[mood.mood!]}</Text>
            </Pressable>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }}>
            <Pressable hitSlop={10} disabled={!prev} accessibilityLabel="前一个有记录的日期" onPress={() => prev && go(prev)} style={{ padding: 4, opacity: prev ? 1 : 0.25 }}>
              <Ionicons name="chevron-back" size={20} color={colors.textSoft} />
            </Pressable>
            <Text style={{ fontFamily: fonts.serif, fontSize: 26, color: colors.text, textAlign: "center" }}>
              {d.getMonth() + 1}月{d.getDate()}日 周{WEEKDAYS[d.getDay()]}
            </Text>
            <Pressable hitSlop={10} disabled={!next} accessibilityLabel="后一个有记录的日期" onPress={() => next && go(next)} style={{ padding: 4, opacity: next ? 1 : 0.25 }}>
              <Ionicons name="chevron-forward" size={20} color={colors.textSoft} />
            </Pressable>
          </View>
          <Text style={[ui.body, { marginTop: 4 }]}>{d.getFullYear()}年 · {list.length} 条记录</Text>
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
