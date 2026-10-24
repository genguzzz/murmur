import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomBar } from "@/components/BottomBar";
import { EntryArt } from "@/components/EntryArt";
import { EntryCard } from "@/components/EntryCard";
import { Mascot } from "@/components/Mascot";
import { MoodLegend } from "@/components/MoodLegend";
import { Card, IconButton, Screen, SectionTitle, Sheet, Tag, styles as ui, tap } from "@/components/ui";
import { WeekStrip } from "@/components/WeekStrip";
import { QUICK_PROMPTS } from "@/lib/prompts";
import { comeBackEntries, sortedEntries, useStore } from "@/lib/store";
import { greeting, shortDate, timeAgo } from "@/lib/format";
import { colors } from "@/lib/theme";
import { restartToApply, useUpdates } from "@/lib/updates";

type Info = "followup" | "insights" | "comeback" | "mood" | null;

const INFO: Record<Exclude<Info, null | "mood">, { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }> = {
  followup: { icon: "mic", title: "追问", body: "根据你最近一条记录提出的问题。随时录一段回答，接着把这件事想下去。" },
  insights: { icon: "bulb", title: "洞察", body: "Murmur 读完你的记录后，指出其中的联系、矛盾或反复出现的问题，并给一个可以做的下一步。" },
  comeback: { icon: "return-down-back", title: "回头再看", body: "你固定在首页、或约好时间回来的记录会出现在这里，方便接着想。" },
};

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rawEntries = useStore((s) => s.entries);
  const settings = useStore((s) => s.settings);
  const entries = useMemo(() => sortedEntries(rawEntries), [rawEntries]);
  const { isUpdatePending } = useUpdates();
  const [info, setInfo] = useState<Info>(null);
  const [now] = useState(() => Date.now());

  const comeBack = useMemo(() => comeBackEntries(rawEntries, now), [rawEntries, now]);
  const latest = entries[0];
  const followUp = entries.find((e) => e.status === "done" && e.followUp && !e.followUpDone);
  const insightEntry = entries.find((e) => e.status === "done" && e.insight);
  // An older entry worth revisiting: deterministic per day so it doesn't jump around.
  const past = useMemo(() => {
    const old = entries.filter((e) => e.status === "done" && now - new Date(e.createdAt).getTime() > 3 * 86400_000);
    return old.length ? old[new Date(now).getDate() % old.length] : undefined;
  }, [entries, now]);

  const go = (path: string, params?: Record<string, string>) => router.push({ pathname: path as never, params });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: 130 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 22, paddingHorizontal: 4 }}>
          {([
            ["calendar-outline", "/calendar"],
            ["time-outline", "/entries"],
            ["chatbubble-ellipses-outline", "/chats"],
            ["search-outline", "/search"],
            ["settings-outline", "/settings"],
          ] as const).map(([icon, path]) => (
            <IconButton key={icon} name={icon} size={24} onPress={() => router.push(path as never)} />
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
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <Text style={{ flex: 1, color: colors.text, fontWeight: "600" }}>新版本已就绪，点这里重启生效</Text>
            <Ionicons name="refresh" size={18} color={colors.primary} />
          </Card>
        ) : null}

        {!settings.token ? (
          <Card style={{ marginTop: 18, borderColor: colors.primary }} onPress={() => go("/settings")}>
            <Text style={ui.title}>先连接服务器</Text>
            <Text style={[ui.body, { marginTop: 4 }]}>在设置里填入访问令牌后，录音才能被转写和整理。</Text>
          </Card>
        ) : null}

        {comeBack.length ? (
          <>
            <SectionTitle icon="return-down-back" title="回头再看" onInfo={() => setInfo("comeback")} />
            <View style={{ gap: 10 }}>
              {comeBack.slice(0, 3).map((e) => (
                <Card key={e.id} onPress={() => go(`/entry/${e.id}`)}>
                  <Text style={ui.faint}>{e.keepOnHome ? "固定在首页" : "约好今天回来"}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                    <Text style={[ui.title, { flex: 1 }]} numberOfLines={1}>{e.title}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                  </View>
                  <Text style={[ui.body, { marginTop: 4 }]} numberOfLines={1}>{e.summary}</Text>
                </Card>
              ))}
            </View>
          </>
        ) : null}

        {!latest || !comeBack.some((e) => e.id === latest.id) ? (
          <>
            <SectionTitle icon="bookmark" title="最新记录" right={latest ? <Text style={ui.faint}>{shortDate(latest.createdAt)}</Text> : null} />
            {latest ? (
              <EntryCard entry={latest} onPress={() => go(`/entry/${latest.id}`)} />
            ) : (
              <Card muted>
                <Text style={ui.body}>还没有记录。点下面的「录音」，随便说点什么。</Text>
              </Card>
            )}
          </>
        ) : null}

        {followUp ? (
          <>
            <SectionTitle icon="chatbubble-outline" title="追问" onInfo={() => setInfo("followup")} />
            <Card>
              <Text style={{ fontSize: 16, lineHeight: 25, color: colors.text, fontWeight: "500" }}>{followUp.followUp}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 16 }}>
                <Pressable style={{ flex: 1 }} onPress={() => { tap(); go(`/entry/${followUp.id}`); }}>
                  <Text style={[ui.faint, { textDecorationLine: "underline" }]} numberOfLines={1}>来自：{followUp.title} ›</Text>
                </Pressable>
                <Pressable
                  onPress={() => { tap(); go("/record", { prompt: followUp.followUp!, followUpOf: followUp.id }); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.cardMuted, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: colors.border }}
                >
                  <Ionicons name="mic-outline" size={14} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>回答</Text>
                </Pressable>
              </View>
            </Card>
          </>
        ) : null}

        {insightEntry ? (
          <>
            <SectionTitle icon="bulb" title="洞察" onInfo={() => setInfo("insights")} />
            <Card onPress={() => go(`/insight/${insightEntry.id}`)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <EntryArt seed={insightEntry.id} size={44} />
                <Text style={[ui.title, { flex: 1, fontSize: 17 }]} numberOfLines={2}>{insightEntry.insightTitle ?? insightEntry.title}</Text>
              </View>
              <Text style={[ui.body, { marginTop: 12 }]} numberOfLines={3}>{insightEntry.insight}</Text>
              <Text style={{ color: colors.primary, fontWeight: "600", marginTop: 12 }}>查看洞察 ›</Text>
            </Card>
          </>
        ) : null}

        <Card muted style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 }} onPress={() => go("/insights")}>
          <Ionicons name="sparkles" size={18} color={colors.primary} />
          <Text style={{ flex: 1, color: colors.text, fontWeight: "500" }}>看看所有记录里的规律</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Card>

        <Card style={{ marginTop: 14 }} onPress={() => go("/calendar")}>
          <WeekStrip entries={entries} />
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
            <Text style={[ui.faint, { fontWeight: "700", letterSpacing: 1.2 }]}>本周</Text>
            <Pressable hitSlop={10} onPress={() => { tap(); setInfo("mood"); }} style={{ marginLeft: 6 }}>
              <Ionicons name="color-palette-outline" size={14} color={colors.textFaint} />
            </Pressable>
            <View style={{ flex: 1 }} />
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
            <Card key={p.text} style={{ width: 170, minHeight: 124 }} onPress={() => go("/record", { prompt: p.text })}>
              <Tag text={p.tag} color={p.color} />
              <Text style={{ marginTop: 10, color: colors.text, fontSize: 15, lineHeight: 21 }}>{p.text}</Text>
            </Card>
          ))}
        </ScrollView>
      </ScrollView>

      <BottomBar onWrite={() => go("/write")} onRecord={() => go("/record")} onChat={() => go("/chats")} label="录音" />

      {info && info !== "mood" ? (
        <Sheet visible onClose={() => setInfo(null)} icon={<Ionicons name={INFO[info].icon} size={26} color={colors.primary} />} title={INFO[info].title} body={INFO[info].body} />
      ) : null}
      <MoodLegend visible={info === "mood"} onClose={() => setInfo(null)} />
    </Screen>
  );
}
