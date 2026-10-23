import { useEffect } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Card, EmptyState, PillButton, SectionTitle, Tag, TopBar, styles as ui } from "@/components/ui";
import { logger } from "@/lib/log";
import { audioFile, deleteEntry, processEntry, useStore, type Entry } from "@/lib/store";
import { clock, fullDate } from "@/lib/format";
import { colors, fonts, MOOD_COLORS, MOOD_LABELS } from "@/lib/theme";

const log = logger("entry");

export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const entry = useStore((s) => s.entries.find((e) => e.id === id));

  if (!entry) return (<><TopBar /><EmptyState text="这条记录不见了" /></>);

  const remove = () =>
    Alert.alert("删除这条记录？", "录音和文字都会删除，无法恢复。", [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => { deleteEntry(entry.id); router.back(); } },
    ]);

  const busy = entry.status === "transcribing" || entry.status === "analyzing";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar right={<Pressable hitSlop={10} onPress={remove}><Ionicons name="trash-outline" size={21} color={colors.textSoft} /></Pressable>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
        <Text style={ui.faint}>{fullDate(entry.createdAt)}</Text>
        <Text style={{ fontFamily: fonts.serif, fontSize: 27, color: colors.text, marginTop: 6, lineHeight: 36 }}>
          {entry.title ?? (busy ? "整理中…" : "未整理的记录")}
        </Text>

        {entry.mood || entry.themes?.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {entry.mood ? <Tag text={entry.moodLabel ?? MOOD_LABELS[entry.mood] ?? entry.mood} color={MOOD_COLORS[entry.mood] ?? colors.primary} /> : null}
            {entry.themes?.map((t) => <Tag key={t} text={t} color={colors.textSoft} />)}
          </View>
        ) : null}

        {entry.kind === "voice" && entry.audioFile ? <Player entry={entry} /> : null}

        {busy ? (
          <Card muted style={{ marginTop: 16, flexDirection: "row", gap: 10, alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={ui.body}>{entry.status === "transcribing" ? "正在转写语音…" : "正在整理内容…"}</Text>
          </Card>
        ) : null}

        {entry.status === "failed" ? (
          <Card style={{ marginTop: 16, borderWidth: 1, borderColor: colors.danger + "55" }}>
            <Text style={[ui.title, { color: colors.danger }]}>处理失败</Text>
            <Text style={[ui.body, { marginTop: 4 }]}>{entry.error}</Text>
            <PillButton label="重试" icon="refresh" onPress={() => { log.info("retry", { id: entry.id }); void processEntry(entry.id); }} style={{ marginTop: 12, height: 44 }} />
          </Card>
        ) : null}

        {entry.prompt ? (
          <Card muted style={{ marginTop: 16 }}>
            <Text style={ui.faint}>回答的问题</Text>
            <Text style={[ui.body, { color: colors.text, marginTop: 4 }]}>{entry.prompt}</Text>
          </Card>
        ) : null}

        {entry.summary ? (
          <>
            <SectionTitle icon="sparkles" title="摘要" />
            <Text style={{ fontSize: 16, lineHeight: 25, color: colors.text }}>{entry.summary}</Text>
          </>
        ) : null}

        {entry.text || entry.rawText ? (
          <>
            <SectionTitle icon="document-text-outline" title={entry.text ? "正文" : "原始转写"} />
            <Text selectable style={{ fontSize: 16, lineHeight: 27, color: colors.text }}>{entry.text ?? entry.rawText}</Text>
          </>
        ) : null}

        {entry.insight ? (
          <>
            <SectionTitle icon="bulb" title="洞察" />
            <Card><Text style={ui.body}>{entry.insight}</Text></Card>
          </>
        ) : null}

        {entry.followUp ? (
          <>
            <SectionTitle icon="return-down-forward" title="追问" />
            <Card>
              <Text style={[ui.title, { fontWeight: "600", lineHeight: 23 }]}>{entry.followUp}</Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                <PillButton label="说一说" icon="mic" style={{ flex: 1, height: 44 }} onPress={() => router.push({ pathname: "/record", params: { prompt: entry.followUp!, followUpOf: entry.id } })} />
                <PillButton label="写一写" icon="create-outline" variant="ghost" style={{ flex: 1, height: 44 }} onPress={() => router.push({ pathname: "/write", params: { prompt: entry.followUp!, followUpOf: entry.id } })} />
              </View>
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Player({ entry }: { entry: Entry }) {
  const uri = Platform.OS === "web" ? entry.audioFile! : audioFile(entry.audioFile!).uri;
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  }, []);

  const toggle = () => {
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.1)) void player.seekTo(0);
      player.play();
    }
  };

  const duration = status.duration || entry.durationSec || 0;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;
  return (
    <Card style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
      <Pressable onPress={toggle} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={status.playing ? "pause" : "play"} size={20} color="#fff" />
      </Pressable>
      <View style={{ flex: 1 }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.cardMuted }}>
          <View style={{ height: 4, borderRadius: 2, width: `${progress * 100}%`, backgroundColor: colors.primary }} />
        </View>
        <Text style={[ui.faint, { marginTop: 6 }]}>{clock(status.currentTime * 1000)} / {clock(duration * 1000)}</Text>
      </View>
    </Card>
  );
}
