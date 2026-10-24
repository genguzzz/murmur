import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "@/lib/theme";

// Faint line drawings behind the content (open book, pencil, swirl, sprout).
export function Doodles() {
  const c = colors.doodle;
  const p = { stroke: c, strokeWidth: 2.2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={170} height={120} viewBox="0 0 170 120" style={{ position: "absolute", right: -10, top: "38%" }}>
        <Path d="M85 30 C65 18 35 18 15 26 V100 C35 92 65 92 85 104 C105 92 135 92 155 100 V26 C135 18 105 18 85 30 Z" {...p} />
        <Path d="M85 30 V104" {...p} />
        <Path d="M108 48 C120 40 136 46 132 58 C128 70 112 66 116 56" {...p} />
      </Svg>
      <Svg width={120} height={150} viewBox="0 0 120 150" style={{ position: "absolute", left: -20, bottom: "14%" }}>
        <Path d="M20 130 L90 30 L104 40 L34 140 L16 146 Z" {...p} />
        <Path d="M84 38 L98 48" {...p} />
        <Path d="M30 128 L42 136" {...p} />
      </Svg>
      <Svg width={90} height={90} viewBox="0 0 90 90" style={{ position: "absolute", right: 18, bottom: "8%" }}>
        <Path d="M45 80 V44" {...p} />
        <Path d="M45 54 C34 54 26 46 26 36 C38 36 45 44 45 54" {...p} />
        <Path d="M45 48 C55 48 64 40 64 28 C52 28 45 36 45 48" {...p} />
      </Svg>
    </View>
  );
}
