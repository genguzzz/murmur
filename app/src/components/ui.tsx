import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ActivityIndicator, Animated, Modal, Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { colors, fonts, radius, shadow } from "@/lib/theme";
import { Doodles } from "./Doodles";
import { Mascot } from "./Mascot";
import { openDrawer } from "./drawerState";

export const tap = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

export function Screen({ children, style, doodles = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; doodles?: boolean }) {
  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      {doodles ? <Doodles /> : null}
      {children}
    </View>
  );
}

// Top bar for pushed screens: back chevron, centered title, optional right actions.
export function TopBar({ title, right }: { title?: string; right?: ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10, paddingTop: insets.top + 6 }}>
      <Pressable hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={{ width: 80 }}>
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
      <Text style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600", color: colors.text }} numberOfLines={1}>{title ?? ""}</Text>
      <View style={{ width: 80, flexDirection: "row", justifyContent: "flex-end", gap: 18 }}>{right}</View>
    </View>
  );
}

// Space the system tab bar plus its bottom accessory cover at the bottom of tab screens.
export const TAB_BAR_SPACE = 140;

// Header for the four tab screens: drawer button, title, optional actions.
export function TabHeader({ title, right, large = true }: { title?: string; right?: ReactNode; large?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 18, paddingBottom: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 40 }}>
        <Pressable
          hitSlop={12}
          accessibilityLabel="打开菜单"
          onPress={() => { tap(); openDrawer(); }}
          style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1, ...shadow() })}
        >
          <MenuGlyph />
        </Pressable>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>{right}</View>
      </View>
      {title && large ? <Text style={[styles.h1, { marginTop: 14 }]}>{title}</Text> : null}
    </View>
  );
}

// Two uneven strokes: a softer take on the hamburger that fits the hand-drawn style.
function MenuGlyph() {
  return (
    <View style={{ gap: 5 }}>
      <View style={{ width: 18, height: 2.2, borderRadius: 2, backgroundColor: colors.text }} />
      <View style={{ width: 12, height: 2.2, borderRadius: 2, backgroundColor: colors.text }} />
    </View>
  );
}

export function IconButton({ name, onPress, size = 22, color }: { name: keyof typeof Ionicons.glyphMap; onPress: () => void; size?: number; color?: string }) {
  return (
    <Pressable hitSlop={10} onPress={() => { tap(); onPress(); }} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={name} size={size} color={color ?? colors.textSoft} />
    </Pressable>
  );
}

export function Card({ children, style, onPress, muted }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; muted?: boolean }) {
  const base: ViewStyle = { backgroundColor: muted ? colors.cardMuted : colors.card, borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: colors.border, ...shadow() };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={({ pressed }) => [base, style, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}>
      {children}
    </Pressable>
  );
}

export function SectionTitle({ icon, title, right, onInfo }: { icon?: keyof typeof Ionicons.glyphMap; title: string; right?: ReactNode; onInfo?: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 26, marginBottom: 10 }}>
      {icon ? <Ionicons name={icon} size={16} color={colors.primary} /> : null}
      <Text style={{ fontSize: 14, fontWeight: "700", letterSpacing: 1.6, color: colors.text }}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
      {onInfo ? <IconButton name="information-circle-outline" size={18} color={colors.textFaint} onPress={onInfo} /> : null}
    </View>
  );
}

export function PillButton({ label, icon, onPress, variant = "primary", loading, disabled, style }: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant?: "primary" | "ghost" | "danger" | "soft";
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: colors.primary, danger: colors.danger, ghost: "transparent", soft: colors.cardMuted }[variant];
  const fg = variant === "primary" ? colors.onPrimary : variant === "danger" ? colors.white : colors.text;
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={() => { tap(); onPress(); }}
      style={({ pressed }) => [
        { height: 52, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 22, backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        (variant === "ghost" || variant === "soft") && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ fontSize: 16, fontWeight: "600", color: fg }}>{label}</Text>
    </Pressable>
  );
}

export function SmallButton({ label, icon, onPress, active }: { label: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; active?: boolean }) {
  return (
    <Pressable
      onPress={() => { tap(); onPress(); }}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 10, backgroundColor: active ? colors.primary : colors.cardMuted, borderWidth: 1, borderColor: active ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 })}
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? colors.onPrimary : colors.primary} /> : null}
      <Text style={{ fontSize: 13, fontWeight: "600", color: active ? colors.onPrimary : colors.text }}>{label}</Text>
    </Pressable>
  );
}

// Speech bubble with a tail pointing at the mascot on its left.
export function SpeechBubble({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexShrink: 1 }, style]}>
      <View style={{ position: "absolute", left: -7, top: 18, width: 16, height: 16, backgroundColor: colors.card, borderLeftWidth: 1, borderBottomWidth: 1, borderColor: colors.border, transform: [{ rotate: "45deg" }] }} />
      <View style={{ backgroundColor: colors.card, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1, borderColor: colors.border, ...shadow() }}>{children}</View>
    </View>
  );
}

export function Bubble({ text, size = 64, mood, glasses }: { text: string; size?: number; mood?: "smile" | "talk" | "calm"; glasses?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <Mascot size={size} mood={mood} glasses={glasses} />
      <SpeechBubble style={{ maxWidth: 230 }}>
        <Text style={{ fontSize: 17, color: colors.text, lineHeight: 24 }}>{text}</Text>
      </SpeechBubble>
    </View>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <Bubble text={text} size={72} />
    </View>
  );
}

export function Tag({ text, color = colors.primary }: { text: string; color?: string }) {
  return (
    <View style={{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: "flex-start", backgroundColor: color + "22" }}>
      <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.5, color }}>{text}</Text>
    </View>
  );
}

export function Chip({ text, onPress }: { text: string; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={() => { tap(); onPress?.(); }} style={{ paddingHorizontal: 14, height: 34, borderRadius: 999, justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardMuted }}>
      <Text style={{ color: colors.text, fontSize: 14 }}>{text}</Text>
    </Pressable>
  );
}

// ---------- bottom sheet ----------

export function Sheet({ visible, onClose, icon, title, body, children, button = "知道了" }: {
  visible: boolean;
  onClose: () => void;
  icon?: ReactNode;
  title?: string;
  body?: string;
  children?: ReactNode;
  button?: string | null;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: colors.backdrop }} onPress={onClose} />
      <View style={{ backgroundColor: colors.sheet, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingTop: 10, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderColor: colors.border }}>
        <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 18 }} />
        {icon ? <View style={{ alignSelf: "center", width: 56, height: 56, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>{icon}</View> : null}
        {title ? <Text style={{ textAlign: "center", fontSize: 24, fontWeight: "700", color: colors.text }}>{title}</Text> : null}
        {body ? <Text style={{ textAlign: "center", fontSize: 15, lineHeight: 23, color: colors.textSoft, marginTop: 10, paddingHorizontal: 8 }}>{body}</Text> : null}
        {children}
        {button ? <PillButton label={button} onPress={onClose} style={{ marginTop: 20 }} /> : null}
      </View>
    </Modal>
  );
}

// ---------- toast ----------

type ToastAction = { label: string; onPress: () => void };
type ToastMsg = { id: number; title: string; body?: string; action?: ToastAction };
let toastState: ToastMsg | null = null;
const toastListeners = new Set<() => void>();
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(title: string, body?: string, action?: ToastAction) {
  toastState = { id: Date.now(), title, body, action };
  toastListeners.forEach((l) => l());
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastState = null;
    toastListeners.forEach((l) => l());
  }, action ? 5000 : 3500);
}

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const msg = useSyncExternalStore((l) => { toastListeners.add(l); return () => toastListeners.delete(l); }, () => toastState);
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(anim, { toValue: msg ? 1 : 0, useNativeDriver: true, friction: 8 }).start();
  }, [msg, anim]);
  if (!msg) return null;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 14, right: 14, bottom: insets.bottom + TAB_BAR_SPACE - 10, zIndex: 300, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.sheet, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.border, ...shadow() }}>
        <Mascot size={38} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{msg.title}</Text>
          {msg.body ? <Text style={{ color: colors.textSoft, fontSize: 13, marginTop: 2 }}>{msg.body}</Text> : null}
        </View>
        {msg.action ? (
          <Pressable hitSlop={8} onPress={() => { tap(); msg.action!.onPress(); toastState = null; toastListeners.forEach((l) => l()); }} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.primarySoft }}>
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>{msg.action.label}</Text>
          </Pressable>
        ) : (
          <Pressable hitSlop={10} onPress={() => { toastState = null; toastListeners.forEach((l) => l()); }}>
            <Ionicons name="close" size={18} color={colors.textSoft} />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

// Theme-aware text styles (getters, so they always read the active palette).
export const styles = {
  get h1(): TextStyle { return { fontFamily: fonts.serif, fontSize: 28, color: colors.text }; },
  get title(): TextStyle { return { fontSize: 16, fontWeight: "700", color: colors.text }; },
  get body(): TextStyle { return { fontSize: 14, lineHeight: 21, color: colors.textSoft }; },
  get faint(): TextStyle { return { fontSize: 12, color: colors.textFaint }; },
};
