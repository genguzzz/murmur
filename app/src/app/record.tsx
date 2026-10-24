import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Linking, Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { File } from "expo-file-system";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from "expo-audio";
import { Bubble, PillButton } from "@/components/ui";
import { logger } from "@/lib/log";
import { track } from "@/lib/track";
import { endLiveRecording, liveRecording } from "@/lib/device";
import { RECORD_OPENERS } from "@/lib/prompts";
import { audioFile, createVoiceEntry, newId } from "@/lib/store";
import { clock } from "@/lib/format";
import { colors, fonts } from "@/lib/theme";

const log = logger("record");

// Speech-friendly AAC: mono 64 kbps keeps a 30-minute memo around 14 MB.
const OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
  sampleRate: 44100,
  isMeteringEnabled: true,
  web: { mimeType: "audio/webm", bitsPerSecond: 64000 },
};

type Phase = "starting" | "recording" | "paused" | "saving" | "error";

export default function Record() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ prompt?: string; followUpOf?: string; mode?: string }>();
  const todoMode = params.mode === "todo";
  const recorder = useAudioRecorder(OPTIONS);
  const state = useAudioRecorderState(recorder, 100);
  const [phase, setPhase] = useState<Phase>("starting");
  const [opener] = useState(() => RECORD_OPENERS[Math.floor(Math.random() * RECORD_OPENERS.length)]);
  const done = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await requestRecordingPermissionsAsync();
        log.info("permission", { granted: perm.granted, status: perm.status, canAskAgain: perm.canAskAgain });
        if (!perm.granted) {
          setPhase("error");
          Alert.alert("需要麦克风权限", "请在系统设置里允许 Murmur 使用麦克风。", [
            { text: "取消", onPress: () => router.back() },
            { text: "去设置", onPress: () => { void Linking.openSettings(); router.back(); } },
          ]);
          return;
        }
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, allowsBackgroundRecording: true });
        await recorder.prepareToRecordAsync();
        if (cancelled) return;
        recorder.record();
        setPhase("recording");
        void liveRecording({ elapsedSec: 0, paused: false, prompt: params.prompt, todo: todoMode });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        log.info("recording started", { prompt: params.prompt ?? null, uri: recorder.uri });
      } catch (e) {
        log.error("start failed", e);
        setPhase("error");
        Alert.alert("录音启动失败", String(e), [{ text: "好", onPress: () => router.back() }]);
      }
    })();
    return () => {
      cancelled = true;
      // Leaving without saving (swipe, crash path): stop so the mic is released.
      if (!done.current) {
        recorder.stop().catch(() => {});
        void endLiveRecording(false);
        void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.mediaServicesDidReset) log.warn("media services reset during recording", { ms: state.durationMillis });
  }, [state.mediaServicesDidReset, state.durationMillis]);

  const togglePause = () => {
    if (phase === "recording") {
      recorder.pause();
      void liveRecording({ elapsedSec: state.durationMillis / 1000, paused: true, prompt: params.prompt, todo: todoMode });
      setPhase("paused");
      log.info("paused", { ms: state.durationMillis });
    } else if (phase === "paused") {
      recorder.record();
      setPhase("recording");
      void liveRecording({ elapsedSec: state.durationMillis / 1000, paused: false, prompt: params.prompt, todo: todoMode });
      log.info("resumed", { ms: state.durationMillis });
    }
    void Haptics.selectionAsync();
  };

  const save = async () => {
    const durationSec = state.durationMillis / 1000;
    if (durationSec < 1) {
      Alert.alert("太短了", "多说几句再保存吧。");
      return;
    }
    setPhase("saving");
    done.current = true;
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const src = recorder.uri;
      log.info("recording stopped", { durationSec, uri: src, bytes: state.fileSize });
      if (!src) throw new Error("录音文件不存在");
      const id = newId();
      let stored = src; // web keeps the blob URL
      if (Platform.OS !== "web") {
        const name = `${id}.m4a`;
        const from = new File(src);
        const srcSize = from.size;
        // moveSync: the async copy()/move() return promises, and deleting the source
        // before the copy finished lost every recording in 0.2.0.
        from.moveSync(audioFile(name), { overwrite: true });
        const dest = audioFile(name);
        log.info("audio stored", { name, srcSize, size: dest.exists ? dest.size : -1 });
        if (!dest.exists || dest.size === 0) throw new Error("录音文件保存失败");
        stored = name;
      }
      createVoiceEntry({ id, audioFile: stored, durationSec, prompt: params.prompt, followUpOf: params.followUpOf, ...(todoMode ? { mode: "todo" as const } : {}) });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void endLiveRecording(true);
      router.replace({ pathname: "/processing", params: { id } });
    } catch (e) {
      log.error("save failed", e);
      setPhase("error");
      Alert.alert("保存失败", String(e));
    }
  };

  const cancel = () => {
    const leave = async () => {
      done.current = true;
      try {
        await recorder.stop();
        if (recorder.uri && Platform.OS !== "web") new File(recorder.uri).delete();
      } catch (e) {
        log.warn("cancel cleanup failed", e);
      }
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      log.info("recording cancelled", { ms: state.durationMillis });
      void endLiveRecording(false);
      track("record_cancelled", { sec: Math.round(state.durationMillis / 1000), mode: todoMode ? "todo" : "note" });
      router.back();
    };
    if (state.durationMillis > 5000) {
      Alert.alert("放弃这段录音？", "录音会被删除。", [
        { text: "继续录", style: "cancel" },
        { text: "放弃", style: "destructive", onPress: () => void leave() },
      ]);
    } else void leave();
  };

  const level = meterLevel(state.metering);
  const status = phase === "starting" ? "准备中…" : phase === "paused" ? "已暂停" : phase === "saving" ? "保存中…" : phase === "error" ? "出错了" : "正在听…";

  return (
    <View style={{ flex: 1, backgroundColor: colors.primarySoft, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20, paddingHorizontal: 28 }}>
      <View style={{ alignItems: "center" }}>
        <Bubble text={params.prompt ?? (todoMode ? "要我记住什么事？顺便说下时间，我到点提醒你。" : opener)} mood={phase === "recording" ? "talk" : "smile"} />
      </View>

      <Text style={{ fontFamily: fonts.serif, fontSize: 64, color: colors.text, textAlign: "center", marginTop: 48, fontVariant: ["tabular-nums"] }}>
        {clock(state.durationMillis)}
      </Text>
      <Waveform level={phase === "recording" ? level : 0} />
      <Text style={{ textAlign: "center", color: colors.textSoft, fontSize: 16, marginTop: 6 }}>{status}</Text>

      <View style={{ flex: 1 }} />

      <View style={{ alignItems: "center", marginBottom: 26 }}>
        <Pressable
          onPress={togglePause}
          disabled={phase !== "recording" && phase !== "paused"}
          style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }}
        >
          <Ionicons name={phase === "paused" ? "mic" : "pause"} size={28} color={colors.primaryDark} />
        </Pressable>
      </View>
      <PillButton label={todoMode ? "说完了" : "保存这条记录"} icon="checkmark" onPress={() => void save()} loading={phase === "saving"} disabled={phase === "starting" || phase === "error"} />
      <Pressable onPress={cancel} style={{ alignSelf: "center", padding: 14 }}>
        <Text style={{ color: colors.textSoft, fontSize: 15 }}>取消</Text>
      </Pressable>
    </View>
  );
}

// metering is dBFS (-160..0); speech sits around -45..-10.
function meterLevel(db?: number): number {
  if (db === undefined || db === null) return 0.15;
  return Math.max(0, Math.min(1, (db + 55) / 45));
}

function Waveform({ level }: { level: number }) {
  const [bars] = useState(() => Array.from({ length: 7 }, () => new Animated.Value(0.2)));
  useEffect(() => {
    bars.forEach((b, i) => {
      const jitter = 0.55 + 0.45 * Math.abs(Math.sin(Date.now() / 140 + i * 1.7));
      Animated.timing(b, { toValue: Math.max(0.12, level * jitter), duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    });
  }, [level, bars]);
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, height: 50, marginTop: 18 }}>
      {bars.map((b, i) => (
        <Animated.View key={i} style={{ width: 5, height: 46, borderRadius: 3, backgroundColor: colors.primary, transform: [{ scaleY: b }] }} />
      ))}
    </View>
  );
}
