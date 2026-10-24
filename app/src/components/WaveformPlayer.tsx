import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import { GestureDetector, useExclusiveGestures, usePanGesture, useTapGesture } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioSampleListener } from "expo-audio";
import * as Haptics from "expo-haptics";
import { tap } from "./ui";
import { endLivePlayback, livePlayback } from "@/lib/device";
import { clock, shortDate } from "@/lib/format";
import { audioFile, setWaveform, updateSettings, useStore, type Entry } from "@/lib/store";
import { track } from "@/lib/track";
import { colors } from "@/lib/theme";

const RATES = [1, 1.5, 2, 0.75];
const BAR = 2.5;
const GAP = 2;
const HEIGHT = 34;
const BINS = 160; // resolution of a waveform learned while playing

// Max-pool (or stretch) a loudness series to `n` bars.
function resample(src: number[], n: number): number[] {
  if (!src.length || n <= 0) return [];
  return Array.from({ length: n }, (_, i) => {
    const a = Math.floor((i * src.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * src.length) / n));
    let m = 0;
    for (let j = a; j < b && j < src.length; j++) m = Math.max(m, src[j]);
    return m;
  });
}

// Stand-in shape until the real waveform is known: smooth, stable per entry.
function placeholder(seed: string): number[] {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: BINS }, (_, i) => {
    const v = 0.45 + 0.25 * Math.sin(i / 3 + (h % 7)) * Math.sin(i / 11 + (h % 13)) + 0.15 * Math.sin(i * 1.7 + (h % 5));
    return Math.max(0.12, Math.min(0.85, v));
  });
}

// PCM RMS → the same 0..1 scale the recorder's dBFS metering uses.
function loudness(frames: number[]): number {
  let sum = 0;
  for (let i = 0; i < frames.length; i += 4) sum += frames[i] * frames[i];
  const rms = Math.sqrt(sum / Math.max(1, Math.ceil(frames.length / 4)));
  const db = 20 * Math.log10(rms || 1e-6);
  return Math.max(0, Math.min(1, (db + 55) / 45));
}

// Compact player for a memo: play/pause, a waveform you can tap or drag to seek,
// and a speed pill. Also drives the Live Activity and lock screen controls.
export function WaveformPlayer({ entry }: { entry: Entry }) {
  const uri = Platform.OS === "web" ? entry.audioFile! : audioFile(entry.audioFile!).uri;
  const player = useAudioPlayer(uri, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const stored = useStore((s) => s.settings.playbackRate);
  const rate = RATES.includes(stored) ? stored : 1;
  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null); // 0..1 while dragging
  // Target of the last seek, shown until the player reports it (avoids a flash back).
  const [pending, setPending] = useState<number | null>(null);
  const seekSeq = useRef(0);
  const bins = useRef<number[]>([]);

  const duration = status.duration || entry.durationSec || 0;
  const title = entry.title || "语音记录";
  const subtitle = `${shortDate(entry.createdAt)} · Murmur`;
  const progress = scrub ?? pending ?? (duration > 0 ? Math.min(1, status.currentTime / duration) : 0);

  useEffect(() => {
    // Keeps playing (with lock screen controls and the Live Activity) after leaving the app.
    void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, shouldPlayInBackground: true, interruptionMode: "doNotMix" });
    return () => {
      void endLivePlayback();
    };
  }, []);

  useEffect(() => {
    player.setPlaybackRate(rate, "high");
  }, [player, rate]);

  // Older memos have no stored waveform: learn it silently while playing and save it
  // after a full listen. It is not drawn live — a filling-in waveform reads as a
  // second progress bar.
  useAudioSampleListener(player, (sample) => {
    if (entry.waveform || !duration || !sample.channels[0]) return;
    const i = Math.min(BINS - 1, Math.floor((sample.timestamp / duration) * BINS));
    bins.current[i] = Math.max(bins.current[i] ?? 0, loudness(sample.channels[0].frames));
  });

  useEffect(() => {
    if (!status.didJustFinish) return;
    void endLivePlayback();
    const filled = bins.current.filter((v) => v !== undefined).length;
    if (!entry.waveform && filled >= BINS * 0.85) {
      setWaveform(entry.id, Array.from({ length: BINS }, (_, i) => Math.round((bins.current[i] ?? 0.1) * 100) / 100));
    }
  }, [status.didJustFinish, entry.id, entry.waveform]);

  // Fixed for the life of the player, so saving a learned waveform doesn't reshape it mid-listen.
  const [base] = useState(() => entry.waveform ?? placeholder(entry.id));
  const count = width > 0 ? Math.floor((width + GAP) / (BAR + GAP)) : 0;
  const bars = useMemo(() => (count ? resample(base, count) : []), [base, count]);

  const live = (playing: boolean, positionSec: number, r = rate) => {
    void livePlayback({ title, subtitle, positionSec, durationSec: duration, playing, rate: r });
  };

  const toggle = () => {
    tap();
    if (status.playing) {
      player.pause();
      live(false, status.currentTime);
    } else {
      const restart = status.didJustFinish || (duration > 0 && status.currentTime >= duration - 0.1);
      if (restart) void player.seekTo(0);
      player.setActiveForLockScreen(true, { title, artist: "Murmur" });
      player.play();
      live(true, restart ? 0 : status.currentTime);
    }
  };

  const cycleRate = () => {
    void Haptics.selectionAsync();
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1;
    updateSettings({ playbackRate: next });
    track("playback_rate", { rate: next });
    if (status.playing) live(true, status.currentTime, next);
  };

  const seekTo = (p: number) => {
    const t = p * duration;
    setPending(p);
    const n = ++seekSeq.current;
    // Hold the target until the seek lands and the next status tick (200 ms) reports it;
    // a newer seek owns `pending` from then on.
    player
      .seekTo(t)
      .catch(() => {})
      .finally(() => setTimeout(() => n === seekSeq.current && setPending(null), 350));
    track("playback_seek", { pct: Math.round(p * 100) });
    if (status.playing || status.currentTime > 0) live(status.playing, t);
  };

  // Native gestures, so iOS arbitrates them against the page's ScrollView and the
  // back swipe: a horizontal drag scrubs (and the page stays put), a vertical drag
  // fails the pan and scrolls the page, a tap seeks.
  const bucket = useRef(-1);
  const at = (x: number) => Math.max(0, Math.min(1, x / Math.max(1, width)));
  const pan = usePanGesture({
    runOnJS: true,
    activeOffsetX: [-6, 6],
    failOffsetY: [-10, 10],
    onActivate: (e) => {
      bucket.current = -1;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setScrub(at(e.x));
    },
    onUpdate: (e) => {
      const p = at(e.x);
      // A light tick every 5% so dragging feels like a detented dial.
      if (Math.floor(p * 20) !== bucket.current) {
        bucket.current = Math.floor(p * 20);
        void Haptics.selectionAsync();
      }
      setScrub(p);
    },
    onDeactivate: (e) => {
      setScrub(null);
      if (!e.canceled) seekTo(at(e.x));
    },
  });
  const tapSeek = useTapGesture({
    runOnJS: true,
    onActivate: (e) => {
      void Haptics.selectionAsync();
      seekTo(at(e.x));
    },
  });
  const scrubGesture = useExclusiveGestures(pan, tapSeek);

  const playedBars = Math.round(progress * bars.length);
  const shown = scrub ?? pending;
  const timeLeft = clock((shown !== null ? shown * duration : status.currentTime) * 1000);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Pressable
        onPress={toggle}
        accessibilityLabel={status.playing ? "暂停" : "播放原声"}
        style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.94 : 1 }] })}
      >
        <Ionicons name={status.playing ? "pause" : "play"} size={17} color={colors.onPrimary} style={status.playing ? undefined : { marginLeft: 2 }} />
      </Pressable>

      <View style={{ flex: 1 }}>
        <GestureDetector gesture={scrubGesture}>
        <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="adjustable" accessibilityLabel="播放进度" style={{ height: HEIGHT, justifyContent: "center" }}>
          <View pointerEvents="none" style={{ flexDirection: "row", alignItems: "center", gap: GAP, height: HEIGHT }}>
            {bars.map((v, i) => (
              <View
                key={i}
                style={{
                  width: BAR,
                  height: 3 + v * (HEIGHT - 3),
                  borderRadius: BAR / 2,
                  backgroundColor: colors.primary,
                  opacity: i < playedBars ? 1 : 0.3,
                }}
              />
            ))}
          </View>
          {scrub !== null ? (
            <View pointerEvents="none" style={{ position: "absolute", left: Math.max(0, Math.min(width - 44, scrub * width - 22)), top: -26, width: 44, alignItems: "center" }}>
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.text }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.bg, fontVariant: ["tabular-nums"] }}>{timeLeft}</Text>
              </View>
            </View>
          ) : null}
          {scrub !== null || (!status.playing && status.currentTime > 0) ? (
            <View pointerEvents="none" style={{ position: "absolute", left: Math.max(0, progress * width - 1), top: 0, bottom: 0, width: 2, borderRadius: 1, backgroundColor: colors.primaryDark }} />
          ) : null}
        </View>
        </GestureDetector>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 3 }}>
          <Text style={{ fontSize: 11, color: colors.textFaint, fontVariant: ["tabular-nums"] }}>{timeLeft}</Text>
          <Text style={{ fontSize: 11, color: colors.textFaint, fontVariant: ["tabular-nums"] }}>{clock(duration * 1000)}</Text>
        </View>
      </View>

      <Pressable
        onPress={cycleRate}
        accessibilityLabel={`播放速度 ${rate} 倍`}
        hitSlop={8}
        style={({ pressed }) => ({ width: 50, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: rate === 1 ? colors.cardMuted : colors.primarySoft, borderWidth: 1, borderColor: rate === 1 ? colors.border : colors.primary, opacity: pressed ? 0.75 : 1, marginBottom: 14 })}
      >
        <Text style={{ fontSize: 12, fontWeight: "700", color: rate === 1 ? colors.textSoft : colors.primary, fontVariant: ["tabular-nums"] }}>{rate}×</Text>
      </Pressable>
    </View>
  );
}
