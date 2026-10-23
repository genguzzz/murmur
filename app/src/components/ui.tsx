import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, radius, shadow } from "@/lib/theme";
import { Mascot } from "./Mascot";

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>{children}</View>;
}

// Top bar for pushed screens: back chevron, centered title, optional right actions.
export function TopBar({ title, right }: { title?: string; right?: ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
      <Pressable hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={styles.topBtn}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <Text style={styles.topTitle} numberOfLines={1}>{title ?? ""}</Text>
      <View style={[styles.topBtn, { flexDirection: "row", justifyContent: "flex-end", gap: 14 }]}>{right}</View>
    </View>
  );
}

export function Card({ children, style, onPress, muted }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; muted?: boolean }) {
  const body = <View style={[styles.card, muted && { backgroundColor: colors.cardMuted }, style]}>{children}</View>;
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}>
      {body}
    </Pressable>
  );
}

export function SectionTitle({ icon, title, right }: { icon?: keyof typeof Ionicons.glyphMap; title: string; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      {icon ? <Ionicons name={icon} size={15} color={colors.primary} /> : null}
      <Text style={styles.sectionText}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

export function PillButton({ label, icon, onPress, variant = "primary", loading, disabled, style }: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant?: "primary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = variant === "primary" ? colors.primary : variant === "danger" ? colors.danger : "transparent";
  const fg = variant === "ghost" ? colors.text : colors.white;
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        variant === "ghost" && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

// Mascot + speech bubble, used on empty states and the recorder.
export function Bubble({ text, size = 64, mood }: { text: string; size?: number; mood?: "smile" | "talk" | "calm" }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Mascot size={size} mood={mood} />
      <View style={styles.bubble}>
        <Text style={styles.bubbleText}>{text}</Text>
      </View>
    </View>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <Bubble text={text} />
    </View>
  );
}

export function Tag({ text, color = colors.primary }: { text: string; color?: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: color + "22" }]}>
      <Text style={[styles.tagText, { color }]}>{text}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10, backgroundColor: colors.bg },
  topBtn: { width: 72 },
  topTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "600", color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: 16, ...shadow },
  section: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 22, marginBottom: 10 },
  sectionText: { fontSize: 13, fontWeight: "700", letterSpacing: 1.2, color: colors.text },
  pill: { height: 52, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 22 },
  pillText: { fontSize: 16, fontWeight: "600" },
  bubble: { backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 220, ...shadow },
  bubbleText: { fontSize: 16, color: colors.text, lineHeight: 22 },
  tag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: "flex-start" },
  tagText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  h1: { fontFamily: fonts.serif, fontSize: 28, color: colors.text },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  body: { fontSize: 14, lineHeight: 21, color: colors.textSoft },
  faint: { fontSize: 12, color: colors.textFaint },
});
