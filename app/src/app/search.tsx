import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { EntryCard } from "@/components/EntryCard";
import { Card, EmptyState, IconButton, Screen, Sheet, TopBar, styles as ui, tap } from "@/components/ui";
import { describeError } from "@/lib/api";
import { logger } from "@/lib/log";
import { semanticSearch, sortedEntries, useStore, type Entry } from "@/lib/store";
import { colors, radius } from "@/lib/theme";

const log = logger("search");

export default function Search() {
  const router = useRouter();
  const params = useLocalSearchParams<{ theme?: string }>();
  const raw = useStore((s) => s.entries);
  const entries = useMemo(() => sortedEntries(raw), [raw]);
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<string | null>(params.theme ?? null);
  const [themeSheet, setThemeSheet] = useState(false);
  const [meaning, setMeaning] = useState(false);
  const [meaningQuery, setMeaningQuery] = useState("");
  const [meaningResults, setMeaningResults] = useState<{ entry: Entry; reason: string }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const themes = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of entries) for (const t of e.themes ?? []) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const exact = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && !theme) return null;
    return entries.filter((e) => {
      if (theme && !e.themes?.includes(theme)) return false;
      if (!q) return true;
      return [e.title, e.summary, e.text, e.rawText, ...(e.themes ?? [])].some((f) => f?.toLowerCase().includes(q));
    });
  }, [entries, query, theme]);

  const runMeaning = async () => {
    const q = meaningQuery.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const r = await semanticSearch(q);
      log.info("semantic search", { chars: q.length, hits: r.length });
      setMeaningResults(r);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSearching(false);
    }
  };

  return (
    <Screen>
      <TopBar
        title="搜索"
        right={
          <>
            <IconButton name="time-outline" onPress={() => router.push("/entries")} />
            <IconButton name="calendar-outline" onPress={() => router.push("/calendar")} />
          </>
        }
      />
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        {meaning ? (
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="sparkles" size={18} color={colors.primary} />
              <Text style={[ui.title, { flex: 1 }]}>按意思搜索</Text>
              <IconButton name="close" size={18} onPress={() => { setMeaning(false); setMeaningResults(null); }} />
            </View>
            <TextInput
              autoFocus
              value={meaningQuery}
              onChangeText={setMeaningQuery}
              onSubmitEditing={() => void runMeaning()}
              returnKeyType="search"
              placeholder="例如：让我失眠的事"
              placeholderTextColor={colors.textFaint}
              style={{ height: 46, borderRadius: radius.sm, paddingHorizontal: 12, backgroundColor: colors.cardMuted, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border }}
            />
          </Card>
        ) : (
          <Card onPress={() => setMeaning(true)} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Ionicons name="sparkles" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[ui.title, { fontSize: 16 }]}>按意思搜索</Text>
              <Text style={[ui.body, { fontSize: 13, marginTop: 2 }]}>按含义查找记录，不限于字面匹配。</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Card>
        )}

        {!meaning ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="search" size={18} color={colors.textFaint} />
              <TextInput value={query} onChangeText={setQuery} placeholder="搜索原文中的字词…" placeholderTextColor={colors.textFaint} style={{ flex: 1, height: 48, fontSize: 15, color: colors.text }} clearButtonMode="while-editing" />
            </View>
            <Pressable onPress={() => { tap(); setThemeSheet(true); }} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, height: 50, borderWidth: 1, borderColor: theme ? colors.primary : colors.border }}>
              <Ionicons name="pricetag" size={16} color={colors.primary} />
              <Text style={{ flex: 1, color: colors.text, fontWeight: "600" }}>{theme ? `主题：${theme}` : "按主题筛选"}</Text>
              {theme ? <IconButton name="close-circle" size={18} onPress={() => setTheme(null)} /> : <Ionicons name="chevron-down" size={18} color={colors.textSoft} />}
            </Pressable>
          </>
        ) : null}
      </View>

      {meaning ? (
        searching ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : error ? (
          <Text style={{ color: colors.danger, textAlign: "center", marginTop: 30 }}>{error}</Text>
        ) : meaningResults ? (
          meaningResults.length ? (
            <FlatList
              data={meaningResults}
              keyExtractor={(r) => r.entry.id}
              contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}
              renderItem={({ item }) => (
                <View>
                  <Text style={[ui.faint, { marginBottom: 6, marginLeft: 4 }]}>{item.reason}</Text>
                  <EntryCard full entry={item.entry} onPress={() => router.push(`/entry/${item.entry.id}`)} />
                </View>
              )}
            />
          ) : (
            <EmptyState text="没有找到意思相近的记录" />
          )
        ) : null
      ) : exact ? (
        exact.length ? (
          <FlatList
            data={exact}
            keyExtractor={(e) => e.id}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}
            renderItem={({ item }) => <EntryCard full entry={item} onPress={() => router.push(`/entry/${item.id}`)} />}
          />
        ) : (
          <EmptyState text="没有找到相关记录" />
        )
      ) : null}

      <Sheet visible={themeSheet} onClose={() => setThemeSheet(false)} title="按主题筛选" button="完成">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          {themes.length ? themes.map(([t, n]) => (
            <Pressable key={t} onPress={() => { tap(); setTheme(theme === t ? null : t); setThemeSheet(false); }} style={{ paddingHorizontal: 14, height: 36, borderRadius: 999, justifyContent: "center", backgroundColor: theme === t ? colors.primary : colors.cardMuted, borderWidth: 1, borderColor: theme === t ? colors.primary : colors.border }}>
              <Text style={{ color: theme === t ? colors.onPrimary : colors.text }}>{t} · {n}</Text>
            </Pressable>
          )) : <Text style={ui.body}>还没有主题</Text>}
        </View>
      </Sheet>
    </Screen>
  );
}
