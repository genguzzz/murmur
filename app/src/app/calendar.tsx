import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MoodLegend } from "@/components/MoodLegend";
import { MoodStamp } from "@/components/MoodStamp";
import { Bubble, Card, IconButton, Screen, TopBar, styles as ui, tap } from "@/components/ui";
import { entriesByDay, mainMood } from "@/lib/days";
import { sortedEntries, useStore } from "@/lib/store";
import { dayKey, fullDate } from "@/lib/format";
import { nowWall } from "@/lib/zone";
import { colors, fonts, MOOD_LABELS } from "@/lib/theme";

const WEEKDAYS = "日一二三四五六";

// Month grid: each day shows its main mood and how many entries it has. Tapping a
// day with entries opens that day's page (/day/[date]).
export default function Calendar() {
  const router = useRouter();
  const params = useLocalSearchParams<{ day?: string }>();
  const raw = useStore((s) => s.entries);
  const memberSince = useStore((s) => s.settings.memberSince);
  const entries = useMemo(() => sortedEntries(raw).filter((e) => e.status === "done"), [raw]);
  const [month, setMonth] = useState(() => {
    const d = params.day ? new Date(`${params.day}T12:00:00`) : nowWall();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [today] = useState(() => dayKey(nowWall()));
  const [legend, setLegend] = useState(false);

  const byDay = useMemo(() => entriesByDay(entries), [entries]);
  const monthMood = useMemo(() => mainMood(entries.filter((e) => {
    const k = dayKey(e.createdAt);
    return k.startsWith(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`);
  })), [entries, month]);
  const stats = useMemo(() => ({ entries: entries.length, words: entries.reduce((n, e) => n + (e.words ?? 0), 0), days: byDay.size }), [entries, byDay]);

  const firstDow = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const shift = (n: number) => { tap(); setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1)); };
  const first = entries.at(-1)?.createdAt ?? memberSince;
  const sinceDays = first ? Math.max(1, Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${dayKey(first)}T12:00:00`).getTime()) / 86400_000) + 1) : 0;

  return (
    <Screen>
      <TopBar title="日历" right={<><IconButton name="time-outline" onPress={() => router.push("/entries")} /><IconButton name="search-outline" onPress={() => router.push("/search")} /></>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 60 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.serif, fontSize: 28, color: colors.text }}>{month.getFullYear()}年{month.getMonth() + 1}月</Text>
            <View style={{ flexDirection: "row", gap: 4, marginTop: 6, marginLeft: -6 }}>
              <Pressable hitSlop={8} accessibilityLabel="上个月" onPress={() => shift(-1)} style={{ padding: 6 }}><Ionicons name="chevron-back" size={20} color={colors.textSoft} /></Pressable>
              <Pressable hitSlop={8} accessibilityLabel="下个月" onPress={() => shift(1)} style={{ padding: 6 }}><Ionicons name="chevron-forward" size={20} color={colors.textSoft} /></Pressable>
            </View>
          </View>
          {monthMood ? (
            <Pressable onPress={() => { tap(); setLegend(true); }} style={{ alignItems: "center", gap: 4 }}>
              <MoodStamp mood={monthMood.mood} size={40} />
              <Text style={[ui.faint, { fontSize: 11, letterSpacing: 1 }]}>本月情绪</Text>
              <Text style={{ fontSize: 13, color: colors.text, fontWeight: "600" }}>{monthMood.moodLabel ?? MOOD_LABELS[monthMood.mood!]}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", marginTop: 18 }}>
          {WEEKDAYS.split("").map((d) => <Text key={d} style={[ui.faint, { flex: 1, textAlign: "center", fontWeight: "600" }]}>{d}</Text>)}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
          {cells.map((day, i) => {
            if (!day) return <View key={i} style={{ width: `${100 / 7}%`, height: 84 }} />;
            const k = dayKey(new Date(month.getFullYear(), month.getMonth(), day));
            const list = byDay.get(k);
            const mood = list ? mainMood(list)?.mood : undefined;
            const isToday = k === today;
            return (
              <Pressable
                key={i}
                disabled={!list}
                accessibilityLabel={list ? `${month.getMonth() + 1}月${day}日，${list.length} 条记录` : undefined}
                onPress={() => { tap(); router.push(`/day/${k}`); }}
                style={({ pressed }) => ({ width: `${100 / 7}%`, height: 84, alignItems: "center", paddingTop: 2, opacity: pressed ? 0.6 : 1 })}
              >
                <View style={{ width: 44, height: 44, borderRadius: 12, borderWidth: isToday ? 2 : 1, borderColor: isToday ? colors.primary : colors.border, alignItems: "center", justifyContent: "center", backgroundColor: list ? colors.card : "transparent" }}>
                  {mood ? <MoodStamp mood={mood} size={38} /> : list ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
                  {list ? (
                    <View style={{ position: "absolute", top: -7, right: -7, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 10.5, fontWeight: "700", color: colors.onPrimary }}>{list.length}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ fontSize: 13, marginTop: 5, color: list || isToday ? colors.text : colors.textFaint, fontWeight: list || isToday ? "700" : "400" }}>{day}</Text>
                {isToday ? <Text style={{ fontSize: 9.5, color: colors.primary, fontWeight: "700", letterSpacing: 1 }}>今天</Text> : null}
              </Pressable>
            );
          })}
        </View>

        {entries.length ? (
          <>
            <Card style={{ flexDirection: "row", marginTop: 18 }}>
              {([["条记录", stats.entries], ["字", stats.words >= 1000 ? `${(stats.words / 1000).toFixed(1)}k` : stats.words], ["天有记录", stats.days]] as const).map(([label, v], i) => (
                <View key={label} style={{ flex: 1, alignItems: "center", borderLeftWidth: i ? 1 : 0, borderColor: colors.border }}>
                  <Text style={{ fontFamily: fonts.serif, fontSize: 24, color: colors.text }}>{v}</Text>
                  <Text style={[ui.faint, { marginTop: 2, letterSpacing: 1 }]}>{label}</Text>
                </View>
              ))}
            </Card>
            <View style={{ alignItems: "center", marginTop: 28, gap: 4 }}>
              <Ionicons name="sparkles" size={20} color={colors.primary} />
              <Text style={[ui.title, { marginTop: 6 }]}>你的日记</Text>
              {first ? <Text style={ui.body}>始于 {fullDate(first).split(" ")[0]} · 第 {sinceDays} 天</Text> : null}
            </View>
          </>
        ) : (
          <View style={{ alignItems: "center", marginTop: 30 }}>
            <Bubble text="有记录的日期会显示在这里" size={56} />
          </View>
        )}
      </ScrollView>
      <MoodLegend visible={legend} onClose={() => setLegend(false)} />
    </Screen>
  );
}
