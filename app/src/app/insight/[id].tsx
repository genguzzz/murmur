import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { EntryArt } from "@/components/EntryArt";
import { Mascot } from "@/components/Mascot";
import { Card, EmptyState, PillButton, Screen, SpeechBubble, TopBar, styles as ui, tap } from "@/components/ui";
import { describeError } from "@/lib/api";
import { logger } from "@/lib/log";
import { insightsStale, refreshInsights, useInsightsRefreshing, useStore } from "@/lib/store";
import { colors, fonts } from "@/lib/theme";

const log = logger("insight");

// Per-entry insight: action bubble, insight card with the user's own words, then
// the cross-entry pattern cards (Lound keeps those behind Premium; here they're free).
export default function InsightScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const entry = useStore((s) => s.entries.find((e) => e.id === id));
  const cache = useStore((s) => s.insights);
  const hasToken = useStore((s) => !!s.settings.token);
  const loading = useInsightsRefreshing();
  const [error, setError] = useState<string | null>(null);

  // The pattern cards below come from the cross-entry analysis; keep it current.
  useEffect(() => {
    if (hasToken && cache && insightsStale()) refreshInsights().catch((e) => log.warn("refresh failed", e));
  }, [hasToken, cache]);

  if (!entry) return (<Screen><TopBar title="洞察" /><EmptyState text="找不到这条记录" /></Screen>);

  const analyzeAll = () => {
    setError(null);
    refreshInsights().catch((e) => {
      log.error("refresh failed", e);
      setError(describeError(e));
    });
  };

  const pattern = cache?.data.patterns[0];
  const person = cache?.data.people?.[0];
  const recurring = cache?.data.recurring?.[0];

  return (
    <Screen>
      <TopBar title="洞察" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 60 }}>
        {entry.action ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 4 }}>
            <Mascot size={52} glasses />
            <SpeechBubble style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                <Ionicons name="create-outline" size={18} color={colors.text} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, color: colors.text, fontSize: 16, lineHeight: 24 }}>{entry.action}</Text>
              </View>
            </SpeechBubble>
          </View>
        ) : null}

        <Card style={{ marginTop: 22, flexDirection: "row", alignItems: "center", gap: 14 }} onPress={() => router.push("/insights")}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="sparkles" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[ui.title, { fontSize: 16 }]}>查看全部记录的规律</Text>
            <Text style={[ui.body, { fontSize: 13, marginTop: 2 }]}>以上内容基于你最新的一条记录。轻点查看全部记录之间的规律。</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Card>

        <Card style={{ marginTop: 18, padding: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <EntryArt seed={entry.id} size={68} />
            <Text style={{ flex: 1, fontSize: 21, fontWeight: "700", color: colors.text, lineHeight: 28 }}>{entry.insightTitle ?? entry.title}</Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 16, lineHeight: 27, marginTop: 18, opacity: 0.92 }}>{entry.insight}</Text>
          {entry.quote ? (
            <View style={{ marginTop: 20, backgroundColor: colors.quote, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="chatbubble-outline" size={20} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 16, lineHeight: 27, marginTop: 10, letterSpacing: 1 }}>“{entry.quote}”</Text>
              <Pressable onPress={() => { tap(); router.push(`/entry/${entry.id}`); }}>
                <Text style={{ color: colors.primary, fontWeight: "700", marginTop: 12 }}>— {entry.title}</Text>
              </Pressable>
            </View>
          ) : null}
        </Card>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 34, marginBottom: 16 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text style={[ui.faint, { fontWeight: "700", letterSpacing: 2, fontSize: 13 }]}>跨记录的规律</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        <PatternCard icon="repeat" tint="#8E7CC3" title="正在形成的模式" empty="记录中反复出现的规律，例如你在周一的状态" item={pattern ? { head: pattern.title, body: pattern.detail } : undefined} onPress={() => router.push("/insights")} />
        <PatternCard icon="people" tint="#8E7CC3" title="你常想到的人" empty="你最常提到的人，以及提到他们时的情绪" item={person ? { head: person.name, body: person.detail } : undefined} onPress={() => router.push("/insights")} />
        <PatternCard icon="alert-circle" tint="#D86A73" title="反复出现的担忧" empty="反复出现的担忧及其出现频率" item={recurring ? { head: `${recurring.title} · ${recurring.count} 次`, body: recurring.detail } : undefined} onPress={() => router.push("/insights")} />

        {!cache ? <PillButton label="分析全部记录" icon="sparkles" onPress={analyzeAll} loading={loading} style={{ marginTop: 8 }} /> : null}
        {error ? <Text style={{ color: colors.danger, marginTop: 12, textAlign: "center" }}>{error}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

function PatternCard({ icon, tint, title, empty, item, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
  empty: string;
  item?: { head: string; body: string };
  onPress: () => void;
}) {
  return (
    <Card style={{ marginBottom: 14 }} onPress={onPress}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: tint + "26", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon} size={18} color={tint} />
        </View>
        <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: colors.text, fontFamily: item ? undefined : fonts.serif }}>{title}</Text>
      </View>
      {item ? (
        <>
          <Text style={[ui.title, { marginTop: 12, fontSize: 15 }]}>{item.head}</Text>
          <Text style={[ui.body, { marginTop: 4, fontSize: 15, lineHeight: 23 }]}>{item.body}</Text>
        </>
      ) : (
        <Text style={[ui.body, { marginTop: 12, fontSize: 15, lineHeight: 23 }]}>{empty}</Text>
      )}
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 14 }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="sparkles" size={16} color={colors.primary} />
        <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 15 }}>{item ? "查看完整洞察" : "分析后可见"}</Text>
      </View>
    </Card>
  );
}
