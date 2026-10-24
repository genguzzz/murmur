import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { BottomBar } from "@/components/BottomBar";
import { EntryArt } from "@/components/EntryArt";
import { Mascot } from "@/components/Mascot";
import { MoodLegend } from "@/components/MoodLegend";
import { MoodStamp } from "@/components/MoodStamp";
import { WaveformPlayer } from "@/components/WaveformPlayer";
import { Card, Chip, EmptyState, IconButton, PillButton, Screen, SectionTitle, Sheet, SmallButton, SpeechBubble, TopBar, styles as ui, tap, toast } from "@/components/ui";
import { logger } from "@/lib/log";
import { deleteEntry, processEntry, reanalyze, setKeepOnHome, setReturnAt, useStore } from "@/lib/store";
import { dayKey, fullDate } from "@/lib/format";
import { colors, fonts, MOOD_LABELS } from "@/lib/theme";

const log = logger("entry");

const RETURN_OPTIONS: [string, number][] = [["明天", 1], ["3 天后", 3], ["1 周后", 7], ["1 个月后", 30]];

export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const entry = useStore((s) => s.entries.find((e) => e.id === id));
  const [menu, setMenu] = useState(false);
  const [pickTime, setPickTime] = useState(false);
  const [legend, setLegend] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!entry) return (<Screen><TopBar /><EmptyState text="这条记录不见了" /></Screen>);

  const busy = entry.status === "transcribing" || entry.status === "analyzing";
  const words = entry.rawText ?? entry.text ?? "";

  const remove = () =>
    Alert.alert("删除这条记录？", "录音和文字都会删除，无法恢复。", [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => { deleteEntry(entry.id); router.back(); } },
    ]);

  const keep = () => {
    const next = !entry.keepOnHome;
    setKeepOnHome(entry.id, next);
    toast(next ? "已固定在首页" : "已从首页移除", next ? "这条记录会一直留在首页。" : "这条记录不再固定在首页。");
  };

  const chooseTime = (days: number) => {
    const at = new Date();
    at.setDate(at.getDate() + days);
    at.setHours(9, 0, 0, 0);
    setReturnAt(entry.id, at.toISOString());
    setPickTime(false);
    toast("约好了", `${at.getMonth() + 1}月${at.getDate()}日 会回到首页。`);
  };

  const cancelReturn = () => {
    setReturnAt(entry.id, undefined);
    toast("已取消回看", "这条记录不再约时间回来。");
  };

  const talkMore = () => router.push({ pathname: "/record", params: entry.followUp ? { prompt: entry.followUp, followUpOf: entry.id } : {} });

  return (
    <Screen>
      <TopBar
        right={
          <>
            <IconButton name="create-outline" onPress={() => router.push(`/edit/${entry.id}`)} />
            <IconButton name="ellipsis-horizontal" onPress={() => setMenu(true)} />
          </>
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 220 }}>
        {entry.reflection || entry.summary ? (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 22 }}>
            <Mascot size={46} />
            <SpeechBubble style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 15, lineHeight: 23 }}>{entry.reflection ?? entry.summary}</Text>
            </SpeechBubble>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <EntryArt seed={entry.id} size={58} />
          <Text style={{ flex: 1, fontFamily: fonts.serif, fontSize: 27, lineHeight: 34, color: colors.text }}>
            {entry.title ?? (busy ? "整理中…" : "未整理的记录")}
          </Text>
        </View>
        <Text style={[ui.faint, { marginTop: 8 }]}>{fullDate(entry.createdAt)}</Text>

        {busy ? (
          <Card muted style={{ marginTop: 16, flexDirection: "row", gap: 10, alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={ui.body}>{entry.status === "transcribing" ? "正在转写语音…" : "正在整理内容…"}</Text>
          </Card>
        ) : null}

        {entry.status === "failed" ? (
          <Card style={{ marginTop: 16, borderColor: colors.danger + "55" }}>
            <Text style={[ui.title, { color: colors.danger }]}>处理失败</Text>
            <Text style={[ui.body, { marginTop: 4 }]}>{entry.error}</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <PillButton label="重试" icon="refresh" onPress={() => { log.info("retry", { id: entry.id }); void processEntry(entry.id); }} style={{ flex: 1, height: 44 }} />
              <PillButton label="删除" variant="ghost" onPress={remove} style={{ flex: 1, height: 44 }} />
            </View>
          </Card>
        ) : null}

        {/* Come back to this */}
        {entry.status === "done" ? (
          <Card style={{ marginTop: 18 }}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.cardMuted, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="return-down-back" size={15} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[ui.title, { fontSize: 15 }]}>回头再看</Text>
                <Text style={[ui.body, { fontSize: 13, marginTop: 2 }]}>
                  {entry.keepOnHome
                    ? "会一直留在首页，直到你移除。"
                    : entry.returnAt
                      ? `${new Date(entry.returnAt).getMonth() + 1}月${new Date(entry.returnAt).getDate()}日 回到首页。`
                      : "准备好接着想的时候，把它带回首页。"}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 14, marginLeft: 42 }}>
              <SmallButton label={entry.keepOnHome ? "从首页移除" : "固定在首页"} icon={entry.keepOnHome ? "bookmark" : "bookmark-outline"} active={entry.keepOnHome} onPress={keep} />
              {entry.returnAt && !entry.keepOnHome ? (
                <SmallButton label="取消约定" icon="close" onPress={cancelReturn} />
              ) : !entry.keepOnHome ? (
                <SmallButton label="选个时间" icon="alarm-outline" onPress={() => setPickTime(true)} />
              ) : null}
            </View>
          </Card>
        ) : null}

        {entry.prompt ? (
          <Card style={{ marginTop: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="chatbox-ellipses-outline" size={13} color={colors.primary} />
              <Text style={[ui.faint, { fontWeight: "700", letterSpacing: 1.2 }]}>你一开始聊的</Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 15, marginTop: 8, lineHeight: 22 }}>{entry.prompt}</Text>
          </Card>
        ) : null}

        {words ? (
          <>
            <SectionTitle
              icon="document-text-outline"
              title="你的原话"
            />
            <Card>
              {entry.kind === "voice" && entry.audioFile ? (
                <View style={{ marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <WaveformPlayer entry={entry} />
                </View>
              ) : null}
              <Text selectable numberOfLines={expanded ? undefined : 5} style={{ fontSize: 16, lineHeight: 28, color: colors.text, letterSpacing: 0.5 }}>{words}</Text>
              {words.length > 120 ? (
                <Pressable onPress={() => { tap(); setExpanded(!expanded); }} style={{ marginTop: 8 }}>
                  <Text style={{ color: colors.primary, fontWeight: "600" }}>{expanded ? "收起" : "展开全部"}</Text>
                </Pressable>
              ) : null}
            </Card>
          </>
        ) : null}

        {entry.insight ? (
          <>
            <SectionTitle icon="bulb" title="洞察" />
            <Card onPress={() => router.push(`/insight/${entry.id}`)}>
              <Text style={[ui.title, { fontSize: 16 }]}>{entry.insightTitle ?? "这条记录的洞察"}</Text>
              <Text style={[ui.body, { marginTop: 6 }]} numberOfLines={3}>{entry.insight}</Text>
              <Text style={{ color: colors.primary, fontWeight: "600", marginTop: 10 }}>查看洞察 ›</Text>
            </Card>
          </>
        ) : null}

        {entry.mood ? (
          <>
            <SectionTitle icon="heart-outline" title="情绪" right={<IconButton name="color-palette-outline" size={18} onPress={() => setLegend(true)} />} />
            <Card onPress={() => router.push({ pathname: "/calendar", params: { day: dayKey(entry.createdAt) } })} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <MoodStamp mood={entry.mood} size={50} />
              <View style={{ flex: 1 }}>
                <Text style={[ui.title, { fontSize: 17 }]}>{entry.moodLabel ?? MOOD_LABELS[entry.mood]}</Text>
                <Text style={[ui.body, { fontSize: 13, marginTop: 2 }]}>看看这天前后的记录</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Card>
          </>
        ) : null}

        {entry.themes?.length ? (
          <>
            <SectionTitle icon="pricetags-outline" title="主题" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {entry.themes.map((t) => <Chip key={t} text={t} onPress={() => router.push({ pathname: "/search", params: { theme: t } })} />)}
            </View>
          </>
        ) : null}
      </ScrollView>

      {entry.followUp && entry.status === "done" ? (
        <View style={{ position: "absolute", left: 14, right: 14, bottom: insets.bottom + 80, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Mascot size={36} />
          <SpeechBubble style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }} numberOfLines={3}>{entry.followUp}</Text>
          </SpeechBubble>
        </View>
      ) : null}
      <BottomBar label="接着说" onWrite={() => router.push({ pathname: "/write", params: entry.followUp ? { prompt: entry.followUp, followUpOf: entry.id } : {} })} onRecord={talkMore} onChat={() => router.push("/chats")} />

      <Sheet visible={menu} onClose={() => setMenu(false)} button={null}>
        <View style={{ gap: 10 }}>
          <MenuRow icon="refresh" label="重新整理" onPress={() => { setMenu(false); reanalyze(entry.id); toast("正在重新整理"); }} disabled={!entry.rawText} />
          <MenuRow icon="copy-outline" label="复制文字" onPress={() => { setMenu(false); void Clipboard.setStringAsync(`${entry.title ?? ""}\n\n${entry.text ?? words}`); toast("已复制"); }} />
          <MenuRow icon="share-outline" label="分享" onPress={() => { setMenu(false); void Share.share({ message: `${entry.title ?? ""}\n\n${entry.text ?? words}` }); }} />
          <MenuRow icon="trash-outline" label="删除" danger onPress={() => { setMenu(false); remove(); }} />
        </View>
      </Sheet>

      <Sheet visible={pickTime} onClose={() => setPickTime(false)} icon={<Ionicons name="alarm-outline" size={26} color={colors.primary} />} title="什么时候回来看？" button="取消">
        <View style={{ gap: 10, marginTop: 18 }}>
          {RETURN_OPTIONS.map(([label, days]) => (
            <PillButton key={label} label={label} variant="soft" onPress={() => chooseTime(days)} />
          ))}
        </View>
      </Sheet>

      <MoodLegend visible={legend} onClose={() => setLegend(false)} />
    </Screen>
  );
}

function MenuRow({ icon, label, onPress, danger, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={() => { tap(); onPress(); }} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 14, backgroundColor: colors.cardMuted, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 })}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.text} />
      <Text style={{ fontSize: 16, color: danger ? colors.danger : colors.text }}>{label}</Text>
    </Pressable>
  );
}

