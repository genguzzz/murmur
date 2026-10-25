import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
// Gesture-handler ScrollView so the month swipe and vertical scroll negotiate natively.
import { GestureDetector, ScrollView, usePanGesture } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MoodLegend } from "@/components/MoodLegend";
import { MoodStamp } from "@/components/MoodStamp";
import { Bubble, IconButton, Screen, TopBar, styles as ui, tap } from "@/components/ui";
import { entriesByDay, mainMood } from "@/lib/days";
import { sortedEntries, useStore } from "@/lib/store";
import { dayKey, fullDate } from "@/lib/format";
import { nowWall } from "@/lib/zone";
import { colors, fonts, MOOD_LABELS } from "@/lib/theme";

const WEEKDAYS = "日一二三四五六";

// Month grid: each day shows its main mood and how many entries it has. Tapping a
// day with entries opens that day's page (/day/[date]); swipe sideways to change month.
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
  const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const monthMood = useMemo(() => mainMood(entries.filter((e) => dayKey(e.createdAt).startsWith(prefix))), [entries, prefix]);

  const firstDow = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const shift = (n: number) => { tap(); setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1)); };
  const swipe = usePanGesture({
    runOnJS: true,
    activeOffsetX: [-24, 24],
    failOffsetY: [-14, 14],
    onDeactivate: (e) => {
      if (e.canceled) return;
      if (e.translationX < -50 || e.velocityX < -500) shift(1);
      else if (e.translationX > 50 || e.velocityX > 500) shift(-1);
    },
  });

  const first = entries.at(-1)?.createdAt ?? memberSince;
  const sinceDays = first ? Math.max(0, Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${dayKey(first)}T12:00:00`).getTime()) / 86400_000)) : 0;

  return (
    <Screen>
      <TopBar title="日历" right={<><IconButton name="time-outline" onPress={() => router.push("/entries")} /><IconButton name="search-outline" onPress={() => router.push("/search")} /></>} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <GestureDetector gesture={swipe}>
          <View style={{ paddingHorizontal: 18 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, minHeight: 92 }}>
              <Text style={{ flex: 1, fontFamily: fonts.serif, fontSize: 30, color: colors.text }}>{month.getFullYear()}年{month.getMonth() + 1}月</Text>
              {monthMood ? (
                <Pressable onPress={() => { tap(); setLegend(true); }} style={{ alignItems: "center" }}>
                  <MoodStamp mood={monthMood.mood} size={44} />
                  <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1.5, color: colors.textSoft, marginTop: 6 }}>本月情绪</Text>
                  <Text style={{ fontSize: 14, color: colors.text, fontWeight: "600", marginTop: 1 }}>{monthMood.moodLabel ?? MOOD_LABELS[monthMood.mood!]}</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={{ flexDirection: "row", marginTop: 14 }}>
              {WEEKDAYS.split("").map((d) => <Text key={d} style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: "700", color: colors.textSoft }}>{d}</Text>)}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12 }}>
              {cells.map((day, i) => {
                if (!day) return <View key={i} style={{ width: `${100 / 7}%`, height: 82 }} />;
                const k = `${prefix}-${String(day).padStart(2, "0")}`;
                const list = byDay.get(k);
                const mood = list ? mainMood(list)?.mood : undefined;
                const isToday = k === today;
                return (
                  <Pressable
                    key={i}
                    disabled={!list}
                    accessibilityLabel={list ? `${month.getMonth() + 1}月${day}日，${list.length} 条记录` : undefined}
                    onPress={() => { tap(); router.push(`/day/${k}`); }}
                    style={({ pressed }) => ({ width: `${100 / 7}%`, height: 82, alignItems: "center", opacity: pressed ? 0.6 : 1 })}
                  >
                    <View style={{ width: 46, height: 46, borderRadius: 14, borderWidth: isToday ? 2.5 : 1.5, borderColor: isToday ? colors.primary : colors.border, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                      {mood ? <MoodStamp mood={mood} size={46} /> : list ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
                    </View>
                    {list ? (
                      <View style={{ position: "absolute", top: -8, left: "50%", marginLeft: 13, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, backgroundColor: colors.primaryDark, borderWidth: 2, borderColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: "#fff" }}>{list.length}</Text>
                      </View>
                    ) : null}
                    <Text style={{ fontSize: 14, marginTop: 6, color: colors.text, fontWeight: list || isToday ? "700" : "500" }}>{day}</Text>
                    {isToday ? <Text style={{ fontSize: 10, color: colors.primary, fontWeight: "700", letterSpacing: 1.5, marginTop: 1 }}>今天</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </GestureDetector>

        {entries.length ? (
          <View style={{ marginTop: 40, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "center", paddingTop: 36, paddingHorizontal: 24 }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="sparkles" size={22} color={colors.primary} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 14 }}>你的日记</Text>
            {first ? (
              <>
                <Text style={{ fontSize: 15, color: colors.text, marginTop: 6 }}>始于 {fullDate(first).split(" ")[0]}</Text>
                <Text style={[ui.body, { marginTop: 4 }]}>{sinceDays ? `距第一条记录 ${sinceDays} 天` : "今天开始记录"}</Text>
              </>
            ) : null}
          </View>
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
