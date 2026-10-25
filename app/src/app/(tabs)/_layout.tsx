import { useMemo } from "react";
import { Platform, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeTabs } from "expo-router/native-tabs";
import { CaptureAccessory } from "@/components/CaptureAccessory";
import { DrawerGestureArea } from "@/components/Drawer";
import { useStore } from "@/lib/store";
import { todayTodos } from "@/lib/todo";
import { colors, shadow } from "@/lib/theme";

// Bottom accessories exist from iOS 26; elsewhere a floating mic stands in.
const HAS_ACCESSORY = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;

// The four everyday screens on the system tab bar (Liquid Glass on iOS 26+), with the
// capture actions in its bottom accessory. Everything else lives in the side drawer.
export default function TabsLayout() {
  const todos = useStore((s) => s.todos);
  const allDay = useStore((s) => s.settings.todoAllDayTime);
  const inbox = useStore((s) => s.inbox.filter((p) => p.kind !== "unclear").length);
  const badge = useMemo(() => todayTodos(todos, allDay).length + inbox, [todos, allDay, inbox]);

  return (
    <DrawerGestureArea>
      <NativeTabs tintColor={colors.primary} minimizeBehavior="onScrollDown">
        <NativeTabs.BottomAccessory>
          <CaptureAccessory />
        </NativeTabs.BottomAccessory>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
          <NativeTabs.Trigger.Label>首页</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        {/* badgeValue is always passed: dropping the prop leaves iOS showing the last
            value, so 0 must be an explicit empty string to clear it. */}
        <NativeTabs.Trigger name="todos" unstable_nativeProps={{ badgeValue: badge ? (badge > 99 ? "99+" : String(badge)) : "" }}>
          <NativeTabs.Trigger.Icon sf={{ default: "checklist", selected: "checklist.checked" }} md="checklist" />
          <NativeTabs.Trigger.Label>待办</NativeTabs.Trigger.Label>
          {badge ? <NativeTabs.Trigger.Badge>{badge > 99 ? "99+" : String(badge)}</NativeTabs.Trigger.Badge> : null}

        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="entries">
          <NativeTabs.Trigger.Icon sf={{ default: "book", selected: "book.fill" }} md="menu_book" />
          <NativeTabs.Trigger.Label>记录</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="chats">
          <NativeTabs.Trigger.Icon sf={{ default: "bubble.left.and.bubble.right", selected: "bubble.left.and.bubble.right.fill" }} md="forum" />
          <NativeTabs.Trigger.Label>对话</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
      {HAS_ACCESSORY ? null : <FloatingMic />}
    </DrawerGestureArea>
  );
}

function FloatingMic() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", right: 18, bottom: insets.bottom + 64 }}>
      <Pressable onPress={() => router.push("/record")} onLongPress={() => router.push("/write")} accessibilityLabel="录一段" style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", ...shadow() }}>
        <Ionicons name="mic" size={25} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}
