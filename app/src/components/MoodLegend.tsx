import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MoodStamp } from "./MoodStamp";
import { Sheet } from "./ui";
import { colors, FAMILY_INFO, type MoodFamily } from "@/lib/theme";

const ORDER: MoodFamily[] = ["positive", "calm", "warm", "neutral", "difficult"];

export function MoodLegend({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      icon={<Ionicons name="color-palette" size={28} color={colors.primary} />}
      title="情绪印章"
      body="Murmur 根据记录内容推测一种情绪。颜色表示情绪类别，图案表示具体情绪；日历上每天显示当天的主要情绪。"
    >
      <View style={{ marginTop: 18 }}>
        {ORDER.map((f, i) => (
          <View key={f} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderColor: colors.border }}>
            <MoodStamp family={f} size={46} />
            <View>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>{FAMILY_INFO[f].name}</Text>
              <Text style={{ color: colors.textSoft, fontSize: 14, marginTop: 2 }}>{FAMILY_INFO[f].examples}</Text>
            </View>
          </View>
        ))}
      </View>
    </Sheet>
  );
}
