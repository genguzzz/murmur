import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { EntryCard } from "@/components/EntryCard";
import { MoodLegend } from "@/components/MoodLegend";
import { MoodStamp } from "@/components/MoodStamp";
import { Bubble, Card, IconButton, Screen, TopBar, styles as ui, tap } from "@/components/ui";
import { sortedEntries, useStore, type Entry } from "@/lib/store";
import { dayKey } from "@/lib/format";
import { colors, fonts, MOOD_LABELS } from "@/lib/theme";

const WEEKDAYS = "日一二三四五六";

// The day's main mood: the most frequent mood among its entries (latest wins ties).
function mainMood(list: Entry[]): Entry | undefined {
  const withMood = list.filter((e) => e.mood);
  const count = new Map<string, number>();
  for (const e of withMood) count.set(e.mood!, (count.get(e.mood!) ?? 0) + 1);
  return withMood.sort((a, b) => (count.get(b.mood!) ?? 0) - (count.get(a.mood!) ?? 0))[0];
}

export default function Calendar() {
  const router = useRouter();
  const params = useLocalSearchParams<{ day?: string }>();
  const raw = useStore((s) => s.entries);
  const entries = useMemo(() => sortedEntries(raw), [raw]);
  const initial = params.day ? new Date(`${params.day}T12:00:00`) : new Date();
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selected, setSelected] = useState<string>(params.day ?? dayKey(new Date()));
  const [legend, setLegend] = useState(false);

  const byDay = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) {
      const k = dayKey(e.createdAt);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [entries]);

  const stats = useMemo(
    () => ({ entries: entries.length, words: entries.reduce((n, e) => n + (e.words ?? 0), 0), days: byDay.size }),
    [entries, byDay],
  );

  const firstDow = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = dayKey(new Date());
  const shift = (n: number) => { tap(); setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1)); };
  const dayEntries = byDay.get(selected) ?? [];
  const dayMood = mainMood(dayEntries);
  const selDate = new Date(`${selected}T12:00:00`);

  return (
    <Screen>
      <TopBar title="日历" right={<><IconButton name="time-outline" onPress={() => router.push("/entries")} /><IconButton name="search-outline" onPress={() => router.push("/search")} /></>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 60 }}>
        {/* Selected day header */}
        <View style={{ alignItems: "center", marginTop: 6, marginBottom: 22 }}>
          {dayMood ? (
            <>
              <Pressable onPress={() => { tap(); setLegend(true); }}>
                <MoodStamp mood={dayMood.mood} size={64} />
              </Pressable>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700", marginTop: 10 }}>{dayMood.moodLabel ?? MOOD_LABELS[dayMood.mood!]}</Text>
            </>
          ) : null}
          <Text style={{ fontFamily: fonts.serif, fontSize: 28, color: colors.text, marginTop: 10, textAlign: "center" }}>
            {selDate.getMonth() + 1}月{selDate.getDate()}日 周{WEEKDAYS[selDate.getDay()]}
          </Text>
          <Text style={[ui.body, { marginTop: 4 }]}>{dayEntries.length ? `${dayEntries.length} 条想法` : "这天没有记录"}</Text>
        </View>

        <View style={{ gap: 12 }}>
          {dayEntries.map((e) => <EntryCard full key={e.id} entry={e} onPress={() => router.push(`/entry/${e.id}`)} />)}
        </View>

        <Card style={{ flexDirection: "row", marginTop: dayEntries.length ? 26 : 0 }}>
          {([["条记录", stats.entries], ["字", stats.words >= 1000 ? `${(stats.words / 1000).toFixed(1)}k` : stats.words], ["天有记录", stats.days]] as const).map(([label, v], i) => (
            <View key={label} style={{ flex: 1, alignItems: "center", borderLeftWidth: i ? 1 : 0, borderColor: colors.border }}>
              <Text style={{ fontFamily: fonts.serif, fontSize: 24, color: colors.text }}>{v}</Text>
              <Text style={[ui.faint, { marginTop: 2, letterSpacing: 1 }]}>{label}</Text>
            </View>
          ))}
        </Card>

        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 26, marginBottom: 12 }}>
          <Text style={{ fontFamily: fonts.serif, fontSize: 24, color: colors.text, flex: 1 }}>{month.getFullYear()}年{month.getMonth() + 1}月</Text>
          <IconButton name="color-palette-outline" size={20} onPress={() => setLegend(true)} />
          <Pressable hitSlop={10} onPress={() => shift(-1)} style={{ padding: 6, marginLeft: 10 }}><Ionicons name="chevron-back" size={20} color={colors.textSoft} /></Pressable>
          <Pressable hitSlop={10} onPress={() => shift(1)} style={{ padding: 6 }}><Ionicons name="chevron-forward" size={20} color={colors.textSoft} /></Pressable>
        </View>
        <View style={{ flexDirection: "row" }}>
          {WEEKDAYS.split("").map((d) => <Text key={d} style={[ui.faint, { flex: 1, textAlign: "center" }]}>{d}</Text>)}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
          {cells.map((day, i) => {
            if (!day) return <View key={i} style={{ width: `${100 / 7}%`, height: 58 }} />;
            const k = dayKey(new Date(month.getFullYear(), month.getMonth(), day));
            const list = byDay.get(k);
            const mood = list ? mainMood(list)?.mood : undefined;
            const isSel = k === selected;
            return (
              <Pressable key={i} onPress={() => { tap(); setSelected(k); }} style={{ width: `${100 / 7}%`, height: 58, alignItems: "center", justifyContent: "center", gap: 3 }}>
                <View style={{ borderRadius: 11, borderWidth: isSel ? 2 : 0, borderColor: colors.primary, padding: isSel ? 1 : 3 }}>
                  {mood ? <MoodStamp mood={mood} size={34} /> : <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: list ? colors.primarySoft : colors.cardMuted }} />}
                </View>
                <Text style={{ fontSize: 10, color: k === today ? colors.primary : colors.textFaint, fontWeight: k === today ? "700" : "400" }}>{k === today ? "今天" : day}</Text>
              </Pressable>
            );
          })}
        </View>

        {entries.length === 0 ? (
          <View style={{ alignItems: "center", marginTop: 30 }}>
            <Bubble text="找一天，回来看看" size={56} />
          </View>
        ) : null}
      </ScrollView>
      <MoodLegend visible={legend} onClose={() => setLegend(false)} />
    </Screen>
  );
}
