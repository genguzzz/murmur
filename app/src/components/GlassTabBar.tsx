import { useMemo, type ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";
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

// Floating frosted capsule: two tabs · record · two tabs. Long-press the mic to type instead.
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
        <View style={{ borderRadius: 32, overflow: "hidden", borderWidth: 1, borderColor: scheme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.7)" }}>
          <BlurView intensity={scheme === "dark" ? 50 : 70} tint={scheme === "dark" ? "systemChromeMaterialDark" : "systemChromeMaterialLight"} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
          {/* Warm wash so the glass matches the paper palette instead of iOS grey. */}
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, opacity: scheme === "dark" ? 0.55 : 0.45 }} />
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 6 }}>
            {tabs.slice(0, mid)}
            <Pressable
              accessibilityLabel="录音"
              onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/record"); }}
              onLongPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); router.push("/write"); }}
              style={({ pressed }) => ({ width: 64, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.94 : 1 }] })}
            >
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="mic" size={25} color={colors.onPrimary} />
              </View>
            </Pressable>
            {tabs.slice(mid)}
          </View>
        </View>
      </View>
    </View>
  );
}
