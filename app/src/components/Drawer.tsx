import { useEffect, useMemo, type ReactNode } from "react";
import { Animated, Dimensions, Easing, PanResponder, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Mascot } from "./Mascot";
import { closeDrawer, openDrawer, useDrawerOpen } from "./drawerState";
import { tap } from "./ui";
import { appVersion } from "@/lib/api";
import { dayKey, greeting } from "@/lib/format";
import { useStore } from "@/lib/store";
import { colors, radius, shadow } from "@/lib/theme";

const WIDTH = Math.min(320, Dimensions.get("window").width * 0.82);
// 0 = closed, 1 = open. Module-level so the edge swipe and the panel share it.
const progress = new Animated.Value(0);

function animateTo(v: 0 | 1) {
  Animated.timing(progress, { toValue: v, duration: v ? 260 : 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
}

type Item = { icon: keyof typeof Ionicons.glyphMap; label: string; path: string; hint?: string };

const ITEMS: Item[] = [
  { icon: "create-outline", label: "写一段", path: "/write", hint: "不方便说话时打字记录" },
  { icon: "time-outline", label: "历史记录", path: "/entries", hint: "按时间翻看所有记录" },
  { icon: "calendar-outline", label: "日历", path: "/calendar" },
  { icon: "sparkles-outline", label: "规律与洞察", path: "/insights" },
  { icon: "search-outline", label: "搜索", path: "/search" },
];

export function DrawerHost() {
  const open = useDrawerOpen();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const name = useStore((s) => s.settings.name);
  const entries = useStore((s) => s.entries);
  const inbox = useStore((s) => s.inbox);
  const stats = useMemo(() => ({ count: entries.length, days: new Set(entries.map((e) => dayKey(e.createdAt))).size }), [entries]);

  useEffect(() => {
    animateTo(open ? 1 : 0);
  }, [open]);

  // Drag the panel left to close.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx < -8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_, g) => progress.setValue(Math.max(0, Math.min(1, 1 + g.dx / WIDTH))),
        onPanResponderRelease: (_, g) => {
          if (g.dx < -WIDTH * 0.3 || g.vx < -0.5) {
            animateTo(0);
            closeDrawer();
          } else animateTo(1);
        },
      }),
    [],
  );

  const go = (path: string) => {
    tap();
    closeDrawer();
    router.push(path as never);
  };

  return (
    <View pointerEvents={open ? "auto" : "box-none"} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 150 }}>
      <Animated.View pointerEvents={open ? "auto" : "none"} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.backdrop, opacity: progress }}>
        <Pressable style={{ flex: 1 }} onPress={closeDrawer} accessibilityLabel="关闭菜单" />
      </Animated.View>
      <Animated.View
        {...pan.panHandlers}
        pointerEvents={open ? "auto" : "none"}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: WIDTH,
          backgroundColor: colors.sheet,
          borderTopRightRadius: 28,
          borderBottomRightRadius: 28,
          borderRightWidth: 1,
          borderColor: colors.border,
          paddingTop: insets.top + 18,
          paddingBottom: insets.bottom + 16,
          paddingHorizontal: 18,
          transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-WIDTH - 20, 0] }) }],
          ...shadow(),
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Mascot size={54} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 19, fontWeight: "700", color: colors.text }} numberOfLines={1}>
              {name ? `${greeting()}，${name}` : "Murmur"}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSoft, marginTop: 3 }}>
              {stats.count ? `记录了 ${stats.days} 天 · ${stats.count} 条` : "说出来，想清楚"}
            </Text>
          </View>
        </View>

        {inbox.length ? (
          <Pressable
            onPress={() => go("/pending")}
            style={({ pressed }) => ({ marginTop: 22, flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.primarySoft, opacity: pressed ? 0.8 : 1 })}
          >
            <Ionicons name="mail-unread-outline" size={20} color={colors.primary} />
            <Text style={{ flex: 1, color: colors.text, fontWeight: "600" }}>{inbox.length} 条录音等你确认</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </Pressable>
        ) : null}

        <View style={{ marginTop: 22, gap: 4 }}>
          {ITEMS.map((it) => (
            <DrawerRow key={it.path} {...it} onPress={() => go(it.path)} />
          ))}
        </View>
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 14, marginHorizontal: 6 }} />
        <DrawerRow icon="settings-outline" label="设置" path="/settings" onPress={() => go("/settings")} />

        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 6 }}>
          <Ionicons name="lock-closed-outline" size={12} color={colors.textFaint} />
          <Text style={{ fontSize: 12, color: colors.textFaint }}>录音只保存在这台手机上</Text>
        </View>
        <Text style={{ fontSize: 12, color: colors.textFaint, marginTop: 4, paddingHorizontal: 6 }}>Murmur {appVersion}</Text>
      </Animated.View>
    </View>
  );
}

function DrawerRow({ icon, label, hint, onPress }: Item & { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 11, paddingHorizontal: 6, borderRadius: 14, backgroundColor: pressed ? colors.cardMuted : "transparent" })}>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.cardMuted, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }}>
        <Ionicons name={icon} size={19} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, color: colors.text, fontWeight: "500" }}>{label}</Text>
        {hint ? <Text style={{ fontSize: 12, color: colors.textFaint, marginTop: 2 }}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

// Wraps the tab screens: a rightward swipe that starts near the left edge pulls the
// drawer out. Claimed in the capture phase on move only, so taps and vertical
// scrolls inside the screens are untouched, and nothing overlays the content.
const EDGE = 36; // px from the left where a swipe may start (72 felt too eager)
export function DrawerGestureArea({ children }: { children: ReactNode }) {
  const pan = useMemo(
    () =>
      PanResponder.create({
        // x0 is only filled in after grant, so derive where the finger started.
        onMoveShouldSetPanResponderCapture: (_, g) => g.moveX - g.dx < EDGE && g.dx > 10 && g.dx > Math.abs(g.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => progress.setValue(Math.max(0, Math.min(1, g.dx / WIDTH))),
        onPanResponderRelease: (_, g) => {
          if (g.dx > WIDTH * 0.25 || g.vx > 0.35) {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            openDrawer();
            animateTo(1);
          } else animateTo(0);
        },
        onPanResponderTerminate: () => animateTo(0),
      }),
    [],
  );
  return (
    <View style={{ flex: 1 }} {...pan.panHandlers}>
      {children}
    </View>
  );
}
