import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { EntryCard } from "@/components/EntryCard";
import { EmptyState, TAB_BAR_SPACE, TabHeader, styles as ui } from "@/components/ui";
import { sortedEntries, useStore, type Entry } from "@/lib/store";
import { dayKey, shortDate } from "@/lib/format";
import { colors, radius } from "@/lib/theme";

type Row = { type: "day"; key: string; label: string } | { type: "entry"; key: string; entry: Entry };

export default function Entries() {
  const router = useRouter();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const raw = useStore((s) => s.entries);
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<string | null>(null);
  const entries = useMemo(() => sortedEntries(raw), [raw]);

  const themes = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of entries) for (const t of e.themes ?? []) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);
  }, [entries]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const hits = entries.filter((e) => {
      if (theme && !e.themes?.includes(theme)) return false;
      if (!q) return true;
      return [e.title, e.summary, e.text, e.rawText, ...(e.themes ?? [])].some((f) => f?.toLowerCase().includes(q));
    });
    const out: Row[] = [];
    let last = "";
    for (const e of hits) {
      const k = dayKey(e.createdAt);
      if (k !== last) {
        out.push({ type: "day", key: `d-${k}`, label: shortDate(e.createdAt) });
        last = k;
      }
      out.push({ type: "entry", key: e.id, entry: e });
    }
    return out;
  }, [entries, query, theme]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TabHeader title="记录" right={<Pressable hitSlop={10} onPress={() => router.push("/calendar")}><Ionicons name="calendar-outline" size={22} color={colors.textSoft} /></Pressable>} />
      <View style={{ paddingHorizontal: 18, marginTop: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="search" size={17} color={colors.textFaint} />
          <TextInput
            autoFocus={focus === "1"}
            value={query}
            onChangeText={setQuery}
            placeholder="搜索记录…"
            placeholderTextColor={colors.textFaint}
            style={{ flex: 1, height: 44, fontSize: 15, color: colors.text }}
            clearButtonMode="while-editing"
          />
        </View>
        {themes.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 8 }}>
            {themes.map((t) => (
              <Pressable key={t} onPress={() => setTheme(theme === t ? null : t)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: theme === t ? colors.primary : colors.card, borderWidth: 1, borderColor: theme === t ? colors.primary : colors.border }}>
                <Text style={{ color: theme === t ? colors.onPrimary : colors.textSoft, fontSize: 13 }}>{t}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
      {rows.length === 0 ? (
        <EmptyState text={entries.length ? "没有找到相关记录" : "还没有记录"} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          contentContainerStyle={{ padding: 18, paddingBottom: TAB_BAR_SPACE + 30, gap: 10 }}
          renderItem={({ item }) =>
            item.type === "day" ? (
              <Text style={[ui.faint, { fontWeight: "700", marginTop: 8 }]}>{item.label}</Text>
            ) : (
              <EntryCard full entry={item.entry} onPress={() => router.push(`/entry/${item.entry.id}`)} />
            )
          }
        />
      )}
    </View>
  );
}
