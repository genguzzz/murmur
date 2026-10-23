import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Mascot } from "@/components/Mascot";
import { EntryCard } from "@/components/EntryCard";
import { Card, PillButton, SectionTitle, Tag, styles as ui } from "@/components/ui";
import { WeekStrip } from "@/components/WeekStrip";
import { QUICK_PROMPTS } from "@/lib/prompts";
import { sortedEntries, useStore } from "@/lib/store";
import { greeting, shortDate, timeAgo } from "@/lib/format";
import { colors } from "@/lib/theme";
import { restartToApply, useUpdates } from "@/lib/updates";

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rawEntries = useStore((s) => s.entries);
  const settings = useStore((s) => s.settings);
  const entries = useMemo(() => sortedEntries(rawEntries), [rawEntries]);
  const { isUpdatePending } = useUpdates();

  const latest = entries[0];
  const followUp = entries.find((e) => e.status === "done" && e.followUp && !e.followUpDone);
  const insightEntry = entries.find((e) => e.status === "done" && e.insight);
  // An older entry worth revisiting: deterministic per day so it doesn't jump around.
  const [now] = useState(() => Date.now());
  const past = useMemo(() => {
    const old = entries.filter((e) => e.status === "done" && now - new Date(e.createdAt).getTime() > 3 * 86400_000);
    if (!old.length) return undefined;
    return old[new Date(now).getDate() % old.length];
  }, [entries, now]);

  const go = (path: string, params?: Record<string, string>) => router.push({ pathname: path as never, params });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: 120 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 18 }}>
          {([
            ["calendar-outline", "/calendar"],
            ["time-outline", "/entries"],
            ["chatbubble-ellipses-outline", "/chats"],
            ["search-outline", "/entries?focus=1"],
            ["settings-outline", "/settings"],
          ] as const).map(([icon, path]) => (
            <Pressable key={icon} hitSlop={10} onPress={() => router.push(path as never)}>
              <Ionicons name={icon} size={23} color={colors.textSoft} />
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Mascot size={42} />
          <Text style={ui.h1}>
            {greeting()}
            {settings.name ? `，${settings.name}` : ""}
          </Text>
        </View>

        {isUpdatePending ? (
          <Card style={{ marginTop: 18, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.primarySoft }} onPress={() => void restartToApply()}>
            <Ionicons name="sparkles" size={18} color={colors.primaryDark} />
            <Text style={{ flex: 1, color: colors.text, fontWeight: "600" }}>新版本已就绪，点这里重启生效</Text>
            <Ionicons name="refresh" size={18} color={colors.primaryDark} />
          </Card>
        ) : null}

        {!settings.token ? (
          <Card style={{ marginTop: 18, borderWidth: 1, borderColor: colors.primary }} onPress={() => go("/settings")}>
            <Text style={ui.title}>先连接服务器</Text>
            <Text style={[ui.body, { marginTop: 4 }]}>在设置里填入访问令牌后，录音才能被转写和整理。</Text>
          </Card>
        ) : null}

        <SectionTitle icon="bookmark" title="最新记录" right={latest ? <Text style={ui.faint}>{shortDate(latest.createdAt)}</Text> : null} />
        {latest ? <EntryCard entry={latest} onPress={() => go(`/entry/${latest.id}`)} /> : (
          <Card muted>
            <Text style={ui.body}>还没有记录。点下面的「录音」，随便说点什么。</Text>
          </Card>
        )}

        {followUp ? (
          <>
            <SectionTitle icon="return-down-forward" title="追问" />
            <Card>
              <Text style={[ui.title, { fontWeight: "600", lineHeight: 23 }]}>{followUp.followUp}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 14 }}>
                <Pressable style={{ flex: 1 }} onPress={() => go(`/entry/${followUp.id}`)}>
                  <Text style={[ui.faint, { textDecorationLine: "underline" }]} numberOfLines={1}>来自：{followUp.title}</Text>
                </Pressable>
                <Pressable
                  onPress={() => go("/record", { prompt: followUp.followUp!, followUpOf: followUp.id })}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}
                >
                  <Ionicons name="mic" size={14} color={colors.primaryDark} />
                  <Text style={{ color: colors.primaryDark, fontWeight: "600", fontSize: 13 }}>回答</Text>
                </Pressable>
              </View>
            </Card>
          </>
        ) : null}

        {insightEntry ? (
          <>
            <SectionTitle icon="bulb" title="洞察" />
            <Card onPress={() => go(`/entry/${insightEntry.id}`)}>
              <Text style={ui.title}>{insightEntry.title}</Text>
              <Text style={[ui.body, { marginTop: 6 }]}>{insightEntry.insight}</Text>
            </Card>
          </>
        ) : null}

        <Card muted style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8 }} onPress={() => go("/insights")}>
          <Ionicons name="sparkles" size={16} color={colors.primary} />
          <Text style={{ flex: 1, color: colors.text, fontWeight: "500" }}>看看所有记录里的规律</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Card>

        <Card style={{ marginTop: 14 }} onPress={() => go("/calendar")}>
          <WeekStrip entries={entries} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
            <Text style={[ui.faint, { fontWeight: "700", letterSpacing: 1 }]}>本周</Text>
            <Text style={ui.faint}>查看日历 ›</Text>
          </View>
        </Card>

        <SectionTitle icon="hourglass-outline" title="往日片段" />
        {past ? (
          <Card onPress={() => go(`/entry/${past.id}`)}>
            <Text style={ui.faint}>{shortDate(past.createdAt)} · {timeAgo(past.createdAt)}</Text>
            <Text style={[ui.title, { marginTop: 4 }]}>{past.title}</Text>
            <Text style={[ui.body, { marginTop: 4 }]} numberOfLines={3}>{past.summary}</Text>
          </Card>
        ) : (
          <Card muted>
            <Text style={[ui.body, { textAlign: "center" }]}>记录多了以后，这里会翻出过去某天的你。</Text>
          </Card>
        )}

        <SectionTitle icon="flash" title="快捷提示" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 10 }}>
          {QUICK_PROMPTS.map((p) => (
            <Card key={p.text} style={{ width: 170, minHeight: 120 }} onPress={() => go("/record", { prompt: p.text })}>
              <Tag text={p.tag} color={p.color} />
              <Text style={{ marginTop: 10, color: colors.text, fontSize: 15, lineHeight: 21 }}>{p.text}</Text>
            </Card>
          ))}
        </ScrollView>
      </ScrollView>

      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom + 10, paddingTop: 10, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.bg + "F0" }}>
        <RoundButton icon="create-outline" onPress={() => go("/write")} />
        <PillButton label="录音" icon="mic" onPress={() => go("/record")} style={{ flex: 1 }} />
        <RoundButton icon="chatbubble-ellipses-outline" onPress={() => go("/chats")} />
      </View>
    </View>
  );
}

function RoundButton({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1, borderWidth: 1, borderColor: colors.border })}>
      <Ionicons name={icon} size={21} color={colors.textSoft} />
    </Pressable>
  );
}
