import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { EntryCard } from "@/components/EntryCard";
import { Bubble, Card, TopBar, styles as ui } from "@/components/ui";
import { sortedEntries, useStore, type Entry } from "@/lib/store";
import { dayKey } from "@/lib/format";
import { colors, fonts, MOOD_COLORS } from "@/lib/theme";

export default function Calendar() {
  const router = useRouter();
  const raw = useStore((s) => s.entries);
  const entries = useMemo(() => sortedEntries(raw), [raw]);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(dayKey(new Date()));

  const byDay = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) {
      const k = dayKey(e.createdAt);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [entries]);

  const stats = useMemo(
    () => ({
      entries: entries.length,
      words: entries.reduce((n, e) => n + (e.words ?? 0), 0),
      days: byDay.size,
    }),
    [entries, byDay],
  );

  const firstDow = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = dayKey(new Date());
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const dayEntries = selected ? byDay.get(selected) ?? [] : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="日历" right={<Pressable hitSlop={10} onPress={() => router.push("/entries")}><Ionicons name="time-outline" size={21} color={colors.textSoft} /></Pressable>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 60 }}>
        <Text style={[ui.body, { marginBottom: 14 }]}>每天的色块是那天的主要情绪，点一天看当天的记录。</Text>
        <Card style={{ flexDirection: "row" }}>
          {([["条记录", stats.entries], ["字", stats.words >= 1000 ? `${(stats.words / 1000).toFixed(1)}k` : stats.words], ["天有记录", stats.days]] as const).map(([label, v], i) => (
            <View key={label} style={{ flex: 1, alignItems: "center", borderLeftWidth: i ? 1 : 0, borderColor: colors.border }}>
              <Text style={{ fontFamily: fonts.serif, fontSize: 24, color: colors.text }}>{v}</Text>
              <Text style={[ui.faint, { marginTop: 2 }]}>{label}</Text>
            </View>
          ))}
        </Card>

        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 24, marginBottom: 12 }}>
          <Text style={{ fontFamily: fonts.serif, fontSize: 24, color: colors.text, flex: 1 }}>
            {month.getFullYear()}年{month.getMonth() + 1}月
          </Text>
          <Pressable hitSlop={10} onPress={() => shift(-1)} style={{ padding: 6 }}><Ionicons name="chevron-back" size={20} color={colors.textSoft} /></Pressable>
          <Pressable hitSlop={10} onPress={() => shift(1)} style={{ padding: 6 }}><Ionicons name="chevron-forward" size={20} color={colors.textSoft} /></Pressable>
        </View>
        <View style={{ flexDirection: "row" }}>
          {"日一二三四五六".split("").map((d) => (
            <Text key={d} style={[ui.faint, { flex: 1, textAlign: "center" }]}>{d}</Text>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
          {cells.map((day, i) => {
            if (!day) return <View key={i} style={{ width: `${100 / 7}%`, height: 50 }} />;
            const k = dayKey(new Date(month.getFullYear(), month.getMonth(), day));
            const list = byDay.get(k);
            const mood = list?.find((e) => e.mood)?.mood;
            const isSel = k === selected;
            return (
              <Pressable key={i} onPress={() => setSelected(k)} style={{ width: `${100 / 7}%`, height: 50, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: mood ? MOOD_COLORS[mood] : list ? colors.primarySoft : colors.card, borderWidth: isSel ? 2 : k === today ? 1 : 0, borderColor: isSel ? colors.text : colors.primary }}>
                  <Text style={{ fontSize: 13, color: mood ? "#fff" : colors.textSoft, fontWeight: k === today ? "700" : "400" }}>{day}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginTop: 18, gap: 10 }}>
          {dayEntries.length ? (
            dayEntries.map((e) => <EntryCard key={e.id} entry={e} onPress={() => router.push(`/entry/${e.id}`)} />)
          ) : (
            <View style={{ alignItems: "center", marginTop: 20 }}>
              <Bubble text={entries.length ? "这一天没有记录" : "找一天，回来看看"} size={52} />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
