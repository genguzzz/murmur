import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Bubble, Card, PillButton, SectionTitle, TopBar, styles as ui } from "@/components/ui";
import { describeError } from "@/lib/api";
import { logger } from "@/lib/log";
import { refreshInsights, useStore } from "@/lib/store";
import { timeAgo } from "@/lib/format";
import { colors, fonts } from "@/lib/theme";

const log = logger("insights");

export default function Insights() {
  const cache = useStore((s) => s.insights);
  const doneCount = useStore((s) => s.entries.filter((e) => e.status === "done").length);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshInsights();
    } catch (e) {
      log.error("refresh failed", e);
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  };

  const stale = cache && cache.entryCount !== doneCount;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="规律与洞察" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        {!cache ? (
          <View style={{ alignItems: "center", marginTop: 40, gap: 24 }}>
            <Bubble text={doneCount >= 2 ? "让我把你说过的话串起来看看" : "多记几条，规律才会出现"} />
          </View>
        ) : (
          <>
            <Text style={ui.faint}>基于 {cache.entryCount} 条记录 · {timeAgo(cache.at)}</Text>
            <Text style={{ fontFamily: fonts.serif, fontSize: 26, color: colors.text, marginTop: 8 }}>{cache.data.headline}</Text>
            <Text style={{ fontSize: 16, lineHeight: 25, color: colors.text, marginTop: 12 }}>{cache.data.body}</Text>
            <SectionTitle icon="git-network-outline" title="反复出现的" />
            <View style={{ gap: 10 }}>
              {cache.data.patterns.map((p) => (
                <Card key={p.title}>
                  <Text style={ui.title}>{p.title}</Text>
                  <Text style={[ui.body, { marginTop: 4 }]}>{p.detail}</Text>
                </Card>
              ))}
            </View>
            <SectionTitle icon="compass-outline" title="接下来可以想想" />
            <Card muted><Text style={[ui.body, { color: colors.text }]}>{cache.data.suggestion}</Text></Card>
          </>
        )}
        {error ? <Text style={{ color: colors.danger, marginTop: 16, textAlign: "center" }}>{error}</Text> : null}
        <PillButton
          label={cache ? (stale ? "有新记录，重新分析" : "重新分析") : "开始分析"}
          icon="sparkles"
          onPress={() => void run()}
          loading={loading}
          disabled={doneCount < 1}
          style={{ marginTop: 28 }}
        />
      </ScrollView>
    </View>
  );
}
