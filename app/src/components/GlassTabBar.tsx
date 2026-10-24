import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Tabs, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { tap } from "./ui";
import { useStore } from "@/lib/store";
import { todayTodos } from "@/lib/todo";
import { colors, scheme, shadow } from "@/lib/theme";

type IconName = keyof typeof Ionicons.glyphMap;
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const TABS: Record<string, { label: string; icon: IconName; active: IconName }> = {
  index: { label: "首页", icon: "home-outline", active: "home" },
  todos: { label: "待办", icon: "checkmark-circle-outline", active: "checkmark-circle" },
  entries: { label: "记录", icon: "book-outline", active: "book" },
  chats: { label: "对话", icon: "chatbubbles-outline", active: "chatbubbles" },
};

// Floating frosted capsule: two tabs · record · two tabs.
export function GlassTabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const router = useRouter();
  const todos = useStore((s) => s.todos);
  const allDay = useStore((s) => s.settings.todoAllDayTime);
  const inbox = useStore((s) => s.inbox.length);
  const due = useMemo(() => todayTodos(todos, allDay).length, [todos, allDay]);

  const press = (key: string, focused: boolean) => {
    tap();
    const event = emitter.emit({ type: "tabPress", target: key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigateToTab(key);
  };

  const tabs = state.routes.map((route, i) => {
    const meta = TABS[route.name];
    if (!meta) return null;
    const focused = i === state.index;
    const badge = route.name === "todos" ? due + inbox : 0;
    return (
      <Pressable key={route.key} onPress={() => press(route.key, focused)} accessibilityRole="tab" accessibilityState={{ selected: focused }} style={{ flex: 1, alignItems: "center", justifyContent: "center", height: 64 }}>
        <View>
          <Ionicons name={focused ? meta.active : meta.icon} size={23} color={focused ? colors.primary : colors.textSoft} />
          {badge ? (
            <View style={{ position: "absolute", top: -4, right: -10, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: inbox ? colors.danger : colors.primary, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.white, fontSize: 10, fontWeight: "700" }}>{badge > 99 ? "99+" : badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ fontSize: 10.5, marginTop: 3, color: focused ? colors.primary : colors.textSoft, fontWeight: focused ? "700" : "500" }}>{meta.label}</Text>
      </Pressable>
    );
  });

  const mid = Math.ceil(tabs.length / 2);
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom - 8, 12), paddingHorizontal: 16 }}>
      <View style={{ borderRadius: 32, ...shadow(), shadowOpacity: scheme === "dark" ? 0 : 0.14, shadowRadius: 18 }}>
        <View style={{ borderRadius: 32, borderWidth: 1, borderColor: scheme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.7)" }}>
          {/* Only the glass is clipped, so the mic's hold menu can pop out above the bar. */}
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 31, overflow: "hidden" }}>
            <BlurView intensity={scheme === "dark" ? 50 : 70} tint={scheme === "dark" ? "systemChromeMaterialDark" : "systemChromeMaterialLight"} style={{ flex: 1 }} />
            {/* Warm wash so the glass matches the paper palette instead of iOS grey. */}
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, opacity: scheme === "dark" ? 0.55 : 0.45 }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 6 }}>
            {tabs.slice(0, mid)}
            <MicButton
              onRecord={() => router.push("/record")}
              onWrite={() => router.push("/write")}
              onTodo={() => router.push({ pathname: "/record", params: { mode: "todo" } })}
            />
            {tabs.slice(mid)}
          </View>
        </View>
      </View>
    </View>
  );
}

// ---------- record button: tap to record; hold, then slide to 写一段 / 记待办 ----------

type Target = "record" | "write" | "todo" | null;
const HOLD_MS = 260;
const OPTIONS = [
  { key: "write" as const, label: "写一段", icon: "create" as IconName, dx: -86, dy: -96 },
  { key: "todo" as const, label: "记待办", icon: "checkmark-done" as IconName, dx: 86, dy: -96 },
];

function hitTest(dx: number, dy: number): Target {
  for (const o of OPTIONS) if (Math.hypot(dx - o.dx, dy - o.dy) < 52) return o.key;
  return Math.hypot(dx, dy) < 36 ? "record" : null;
}

type MicActions = { onRecord: () => void; onWrite: () => void; onTodo: () => void };

// Gesture state lives in this closure: PanResponder callbacks are created once
// and must see the latest hold/hover state without re-rendering to read it.
function createMicGesture(anim: Animated.Value, setOpen: (v: boolean) => void, setHover: (t: Target) => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let open = false;
  let hover: Target = "record";
  let actions: MicActions | null = null;
  const show = (v: boolean) => {
    open = v;
    setOpen(v);
    Animated.spring(anim, { toValue: v ? 1 : 0, friction: 7, tension: 90, useNativeDriver: true }).start();
  };
  const setH = (t: Target) => {
    if (hover === t) return;
    hover = t;
    setHover(t);
    if (t) void Haptics.selectionAsync();
  };
  const end = (fire: boolean) => {
    if (timer) clearTimeout(timer);
    timer = null;
    const target = open ? hover : "record";
    show(false);
    setH("record");
    if (!fire || !actions) return;
    if (target === "record") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      actions.onRecord();
    } else if (target === "write") actions.onWrite();
    else if (target === "todo") actions.onTodo();
  };
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      timer = setTimeout(() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        show(true);
      }, HOLD_MS);
    },
    onPanResponderMove: (_, e) => {
      if (open) setH(hitTest(e.dx, e.dy));
    },
    onPanResponderRelease: () => end(true),
    onPanResponderTerminate: () => end(false),
  });
  return { handlers: pan.panHandlers, setActions: (a: MicActions) => { actions = a; } };
}

function MicButton({ onRecord, onWrite, onTodo }: MicActions) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<Target>("record");
  const [anim] = useState(() => new Animated.Value(0));
  const [gesture] = useState(() => createMicGesture(anim, setOpen, setHover));
  useEffect(() => gesture.setActions({ onRecord, onWrite, onTodo }), [gesture, onRecord, onWrite, onTodo]);

  return (
    <View style={{ width: 64, alignItems: "center", justifyContent: "center" }}>
      {OPTIONS.map((o) => {
        const active = hover === o.key;
        return (
          <Animated.View
            key={o.key}
            pointerEvents="none"
            style={{
              position: "absolute",
              alignItems: "center",
              opacity: anim,
              transform: [
                { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, o.dx] }) },
                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, o.dy] }) },
                { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, active ? 1.12 : 1] }) },
              ],
            }}
          >
            <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: active ? colors.primary : colors.card, borderWidth: 1, borderColor: active ? colors.primary : colors.border, ...shadow(), shadowOpacity: 0.18 }}>
              <Ionicons name={o.icon} size={24} color={active ? colors.onPrimary : colors.primary} />
            </View>
            <View style={{ marginTop: 6, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: active ? colors.primary : colors.card, borderWidth: 1, borderColor: active ? colors.primary : colors.border }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: active ? colors.onPrimary : colors.text }}>{o.label}</Text>
            </View>
          </Animated.View>
        );
      })}
      <View
        {...gesture.handlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel="录音"
        accessibilityHint="按住后滑动可以选择写一段或记待办"
        accessibilityActions={[{ name: "activate" }, { name: "longpress", label: "写一段" }]}
        onAccessibilityAction={(e) => (e.nativeEvent.actionName === "longpress" ? onWrite() : onRecord())}
        style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: open && hover !== "record" ? colors.primaryDark : colors.primary, alignItems: "center", justifyContent: "center", transform: [{ scale: open ? 0.92 : 1 }] }}
      >
        <Ionicons name={open ? "mic-outline" : "mic"} size={25} color={colors.onPrimary} />
      </View>
    </View>
  );
}
