import { useEffect, useState } from "react";
import { Animated, Easing, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lastStep, StepList } from "@/components/Activity";
import { Mascot } from "@/components/Mascot";
import { PillButton } from "@/components/ui";
import { processEntry, useStore } from "@/lib/store";
import { useRun, watchRun } from "@/lib/runs";
import { colors } from "@/lib/theme";

const LEAD: Record<string, string> = {
  journal: "整理好了，带你去看看。",
  chat: "这是个问题，去对话里聊。",
  todo: "待办处理好了。",
  pending: "没太听懂，先放进待确认。",
};

// Live view right after saving: the agent's steps as they happen. When it's done this
// screen gets out of the way — into the entry, the conversation, or back with a toast.
// Leaving early is fine; the work carries on and the pill above the tab bar tracks it.
export default function Processing() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useStore((s) => s.entries.find((e) => e.id === id));
  const run = useRun(id);
  const [bounce] = useState(() => new Animated.Value(0));

  useEffect(() => watchRun(id), [id]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bounce]);

  // Re-runs (no agent step) just wait for the entry.
  const finishedRoute = run?.status === "done" ? (run.route ?? "journal") : !run && entry?.status === "done" ? "journal" : null;
  useEffect(() => {
    if (!finishedRoute) return;
    const t = setTimeout(() => {
      if (finishedRoute === "journal") router.replace(`/entry/${id}`);
      else if (finishedRoute === "chat" && run?.chatId) router.replace(`/chats/${run.chatId}`);
      else router.back();
    }, 550);
    return () => clearTimeout(t);
  }, [finishedRoute, id, run?.chatId, router]);

  const failed = run?.status === "failed" || (!run && entry?.status === "failed");
  const step = run ? lastStep(run.steps) : undefined;
  const msg = failed
    ? `出了点问题：${run?.error ?? entry?.error ?? ""}`
    : finishedRoute
      ? LEAD[finishedRoute]
      : step?.state === "run"
        ? `${step.label}…`
        : entry?.status === "transcribing"
          ? "收到了，正在转写这段话…"
          : "正在想这段话该怎么处理…";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 16, paddingHorizontal: 24 }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        {failed || finishedRoute ? null : (
          <Animated.View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primaryDark, marginBottom: 20, transform: [{ translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -22] }) }] }} />
        )}
        <Mascot size={104} mood={finishedRoute ? "smile" : "calm"} />
        <View style={{ backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, marginTop: 22, borderWidth: 1, borderColor: colors.border, maxWidth: 300 }}>
          <Text style={{ fontSize: 15, color: colors.text, textAlign: "center", lineHeight: 22 }}>{msg}</Text>
        </View>
        {run?.steps.length ? (
          <ScrollView style={{ maxHeight: 240, alignSelf: "stretch", marginTop: 26 }} contentContainerStyle={{ paddingHorizontal: 22 }}>
            <StepList steps={run.steps} />
          </ScrollView>
        ) : null}
      </View>
      {failed && entry ? <PillButton label="重试" icon="refresh" onPress={() => void processEntry(entry.id)} style={{ marginBottom: 10 }} /> : null}
      <PillButton label={failed ? "回到首页" : "先回去，好了告诉我"} variant={failed ? "primary" : "ghost"} onPress={() => router.dismissTo("/")} />
    </View>
  );
}
