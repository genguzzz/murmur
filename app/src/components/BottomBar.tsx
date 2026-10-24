import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PillButton, tap } from "./ui";
import { colors } from "@/lib/theme";

// Write · Record/Talk more · Chat, pinned to the bottom of Home and entry pages.
export function BottomBar({ onWrite, onRecord, onChat, label }: { onWrite: () => void; onRecord: () => void; onChat: () => void; label: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom + 10, paddingTop: 12, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.bg + "F2" }}>
      <RoundButton icon="create-outline" onPress={onWrite} />
      <PillButton label={label} icon="mic" onPress={onRecord} style={{ flex: 1, height: 54 }} />
      <RoundButton icon="chatbubble-ellipses-outline" onPress={onChat} />
    </View>
  );
}

function RoundButton({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={({ pressed }) => ({ width: 50, height: 50, borderRadius: 25, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1, borderWidth: 1, borderColor: colors.border })}>
      <Ionicons name={icon} size={22} color={colors.textSoft} />
    </Pressable>
  );
}
