import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import * as Haptics from "expo-haptics";
import { colors } from "@/lib/theme";

// Sits in the system tab bar's bottom accessory (the glass strip above the tabs).
// Regular: record as the main action, to-do and write beside it. Inline (tab bar
// minimised while scrolling): just the record action.
export function CaptureAccessory() {
  const router = useRouter();
  const placement = NativeTabs.BottomAccessory.usePlacement();
  const go = (path: "/record" | "/write", params?: Record<string, string>, strong = false) => {
    void Haptics.impactAsync(strong ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: path, params });
  };

  if (placement === "inline") {
    return (
      <Pressable onPress={() => go("/record", undefined, true)} accessibilityLabel="录一段" style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Ionicons name="mic" size={18} color={colors.primary} />
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>录一段</Text>
      </Pressable>
    );
  }

  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, gap: 4 }}>
      <Pressable onPress={() => go("/record", undefined, true)} accessibilityLabel="录一段" style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="mic" size={18} color={colors.onPrimary} />
        </View>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>录一段</Text>
      </Pressable>
      <Action icon="checkmark-done" label="记待办" onPress={() => go("/record", { mode: "todo" })} />
      <Action icon="create-outline" label="写一段" onPress={() => go("/write")} />
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={6} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={17} color={colors.textSoft} />
      <Text style={{ fontSize: 13.5, color: colors.textSoft }}>{label}</Text>
    </Pressable>
  );
}
