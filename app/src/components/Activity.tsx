import { useEffect, useState } from "react";
import { ActivityIndicator, Animated, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ensureReminderPermission } from "./PermissionPrompt";
import { TAB_BAR_SPACE, tap, toast, useToastVisible } from "./ui";
import { runUndo, setNoticeHandler, useRuns, type RunStep } from "@/lib/runs";
import { colors, shadow } from "@/lib/theme";

// Turns store notices into toasts: undo runs the registered undo, path opens a screen.
export function NoticeBridge() {
  const router = useRouter();
  useEffect(() => {
    setNoticeHandler((n) => {
      toast(
        n.title,
        n.body,
        (n.actions ?? []).map((a) => ({
          label: a.label,
          onPress: () => {
            if (a.undo) {
              if (runUndo(a.undo)) toast("已撤销", "改动都恢复原样了");
            } else if (a.path) router.push(a.path as never);
          },
        })),
      );
      if (n.remind) void ensureReminderPermission();
    });
    return () => setNoticeHandler(null);
  }, [router]);
  return null;
}

// While a memo is being worked on and no screen is showing it: a small pill above the
// tab bar with the agent's latest step. Tap to open the live view.
export function RunPill() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const runs = useRuns();
  const toastVisible = useToastVisible();
  const run = runs.find((r) => r.kind === "capture" && r.status === "running");
  const [anim] = useState(() => new Animated.Value(0));
  const show = !!run && !toastVisible && !pathname.startsWith("/processing") && !pathname.startsWith("/record");
  useEffect(() => {
    Animated.spring(anim, { toValue: show ? 1 : 0, useNativeDriver: true, friction: 8 }).start();
  }, [show, anim]);
  if (!run || !show) return null;
  const step = lastStep(run.steps);
  return (
    <Animated.View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, alignItems: "center", bottom: insets.bottom + TAB_BAR_SPACE - 4, zIndex: 290, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }}
    >
      <Pressable
        onPress={() => { tap(); router.push({ pathname: "/processing", params: { id: run.id } }); }}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 320, paddingLeft: 14, paddingRight: 12, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.sheet, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1, ...shadow() })}
      >
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={{ flexShrink: 1, fontSize: 14, color: colors.text, fontWeight: "600" }} numberOfLines={1}>{step?.label ?? "正在处理"}…</Text>
        <Ionicons name="chevron-up" size={15} color={colors.textFaint} />
      </Pressable>
    </Animated.View>
  );
}

export function lastStep(steps: RunStep[]): RunStep | undefined {
  return [...steps].reverse().find((s) => s.state === "run") ?? steps[steps.length - 1];
}

// The live step list: done steps get a check, the running one a spinner.
export function StepList({ steps, compact }: { steps: RunStep[]; compact?: boolean }) {
  return (
    <View style={{ gap: compact ? 6 : 10 }}>
      {steps.map((s) => (
        <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {s.state === "run" ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ width: 16, transform: [{ scale: compact ? 0.75 : 0.85 }] }} />
          ) : (
            <Ionicons name={s.state === "fail" ? "close-circle" : "checkmark-circle"} size={compact ? 14 : 16} color={s.state === "fail" ? colors.danger : colors.primary} style={{ width: 16 }} />
          )}
          <Text style={{ flex: 1, fontSize: compact ? 13 : 15, color: s.state === "run" ? colors.text : colors.textSoft }} numberOfLines={1}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}
