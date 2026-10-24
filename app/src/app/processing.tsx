import { useEffect, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Mascot } from "@/components/Mascot";
import { PillButton } from "@/components/ui";
import { useStore } from "@/lib/store";
import { colors } from "@/lib/theme";

// "Got it" screen shown right after saving; processing continues in the background.
export default function Processing() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useStore((s) => s.entries.find((e) => e.id === id));
  // Set when the model found to-dos: "todo" memos leave the journal, "mixed" keep both.
  const pending = useStore((s) => s.inbox.find((p) => p.id === id || p.journalId === id));
  const todoOnly = pending?.kind === "todo";

  useEffect(() => {
    if (todoOnly) router.replace(`/confirm/${pending.id}`);
  }, [todoOnly, pending?.id, router]);
  const [bounce] = useState(() => new Animated.Value(0));

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

  const msg =
    entry?.status === "done"
      ? "整理好了，去看看吧。"
      : entry?.status === "failed"
        ? `出了点问题：${entry.error ?? ""}`
        : entry?.status === "analyzing"
          ? entry.mode === "todo" ? "听清楚了，正在整理成待办…" : "听清楚了，正在帮你整理…"
          : todoOnly
            ? "找到了要做的事…"
            : "收到了，正在转写这段话…";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 16, paddingHorizontal: 24 }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryDark, marginBottom: 22, transform: [{ translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -26] }) }] }} />
        <Mascot size={110} mood={entry?.status === "done" ? "smile" : "calm"} />
        <View style={{ backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, marginTop: 24, borderWidth: 1, borderColor: colors.border, maxWidth: 300 }}>
          <Text style={{ fontSize: 15, color: colors.text, textAlign: "center", lineHeight: 22 }}>{msg}</Text>
        </View>
      </View>
      {pending && !todoOnly ? (
        <PillButton label={`确认 ${pending.drafts.length || pending.completes.length} 件待办`} icon="checkmark-circle-outline" onPress={() => router.replace(`/confirm/${pending.id}`)} style={{ marginBottom: 10 }} />
      ) : null}
      {entry?.status === "done" ? (
        <PillButton label="查看这条记录" variant={pending ? "soft" : "primary"} onPress={() => router.replace(`/entry/${id}`)} style={{ marginBottom: 10 }} />
      ) : null}
      <PillButton label="回到首页" variant={entry?.status === "done" ? "ghost" : "primary"} onPress={() => router.dismissTo("/")} />
    </View>
  );
}
