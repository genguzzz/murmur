import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Bubble, Card, PillButton, Screen, SectionTitle, TopBar, styles as ui } from "@/components/ui";
import { describeError } from "@/lib/api";
import { logger } from "@/lib/log";
import { insightsStale, refreshInsights, useInsightsRefreshing, useStore } from "@/lib/store";
import { timeAgo } from "@/lib/format";
import { colors, fonts } from "@/lib/theme";

const log = logger("insights");

export default function Insights() {
  const cache = useStore((s) => s.insights);
  const doneCount = useStore((s) => s.entries.filter((e) => e.status === "done").length);
  const hasToken = useStore((s) => !!s.settings.token);
  const loading = useInsightsRefreshing();
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    refreshInsights().then(
      () => setError(null),
      (e) => {
        log.error("refresh failed", e);
        setError(describeError(e));
      },
    );
  };

  // Opening the page with new entries since the last analysis refreshes it by itself.
  useEffect(() => {
    if (hasToken && doneCount >= 2 && insightsStale()) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stale = !!cache && insightsStale();

  return (
    <Screen>
      <TopBar title="规律与洞察" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        {loading ? (
          <Card muted style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[ui.body, { flex: 1 }]}>{cache ? `有新记录，正在根据全部 ${doneCount} 条重新看一遍…` : `正在读你的 ${doneCount} 条记录…`}</Text>
          </Card>
        ) : null}
        {!cache ? (
          <View style={{ alignItems: "center", marginTop: 40, gap: 24 }}>
            <Bubble text={doneCount >= 2 ? "让我把你说过的话串起来看看" : "多记几条，规律才会出现"} />
          </View>
        ) : (
          <View style={{ opacity: loading ? 0.5 : 1 }}>
            <Text style={ui.faint}>基于 {cache.entryCount} 条记录 · {timeAgo(cache.at)}{stale && !loading ? ` · 之后又多了 ${Math.max(0, doneCount - cache.entryCount)} 条` : ""}</Text>
            <Text style={{ fontFamily: fonts.serif, fontSize: 26, color: colors.text, marginTop: 8 }}>{cache.data.headline}</Text>
            <Text style={{ fontSize: 16, lineHeight: 25, color: colors.text, marginTop: 12 }}>{cache.data.body}</Text>
            <SectionTitle icon="git-network-outline" title="正在形成的模式" />
            <View style={{ gap: 10 }}>
              {cache.data.patterns.map((p) => (
                <Card key={p.title}>
                  <Text style={ui.title}>{p.title}</Text>
                  <Text style={[ui.body, { marginTop: 4 }]}>{p.detail}</Text>
                </Card>
              ))}
            </View>
            {cache.data.people?.length ? (
              <>
                <SectionTitle icon="people-outline" title="你常想到的人" />
                <View style={{ gap: 10 }}>
                  {cache.data.people.map((p) => (
                    <Card key={p.name}>
                      <Text style={ui.title}>{p.name}</Text>
                      <Text style={[ui.body, { marginTop: 4 }]}>{p.detail}</Text>
                    </Card>
                  ))}
                </View>
              </>
            ) : null}
            {cache.data.recurring?.length ? (
              <>
                <SectionTitle icon="alert-circle-outline" title="反复出现的担忧" />
                <View style={{ gap: 10 }}>
                  {cache.data.recurring.map((r) => (
                    <Card key={r.title}>
                      <Text style={ui.title}>{r.title} · {r.count} 次</Text>
                      <Text style={[ui.body, { marginTop: 4 }]}>{r.detail}</Text>
                    </Card>
                  ))}
                </View>
              </>
            ) : null}
            <SectionTitle icon="compass-outline" title="接下来可以想想" />
            <Card muted><Text style={[ui.body, { color: colors.text }]}>{cache.data.suggestion}</Text></Card>
          </View>
        )}
        {error ? <Text style={{ color: colors.danger, marginTop: 16, textAlign: "center" }}>{error}</Text> : null}
        <PillButton
          label={cache ? (stale ? "有新记录，重新分析" : "重新分析") : "开始分析"}
          icon="sparkles"
          onPress={run}
          loading={loading}
          disabled={doneCount < 1}
          style={{ marginTop: 28 }}
        />
      </ScrollView>
    </Screen>
  );
}
