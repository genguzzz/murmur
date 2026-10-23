import { useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Mascot } from "./Mascot";
import { colors, fonts, shadow } from "@/lib/theme";

const LENGTH = 4;

// Shared keypad for the lock screen and PIN setup.
// onComplete returns false to shake and clear (wrong PIN).
export function PinPad({ title, bubble, onComplete, biometric, onBiometric, footer }: {
  title: string;
  bubble: string;
  onComplete: (pin: string) => Promise<boolean> | boolean;
  biometric?: "faceid" | "touchid" | null;
  onBiometric?: () => void;
  footer?: string;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake] = useState(() => new Animated.Value(0));

  const submit = (full: string) => {
    setBusy(true);
    void Promise.resolve(onComplete(full)).then((ok) => {
      if (!ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Animated.sequence(
          [12, -12, 8, -8, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: true })),
        ).start();
      }
      setPin("");
      setBusy(false);
    });
  };

  const press = (d: string) => {
    if (busy || pin.length >= LENGTH) return;
    void Haptics.selectionAsync();
    const next = pin + d;
    setPin(next);
    if (next.length === LENGTH) submit(next);
  };

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 }}>
      <View style={{ alignItems: "center" }}>
        <View>
          <Mascot size={92} />
          <Ionicons name="lock-closed" size={18} color={colors.primaryDark} style={{ position: "absolute", right: 4, bottom: 18 }} />
        </View>
        <View style={{ marginTop: 12, backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 22, paddingVertical: 10, borderWidth: 1.5, borderColor: colors.border, ...shadow }}>
          <Text style={{ fontSize: 16, color: colors.text }}>{bubble}</Text>
        </View>
      </View>

      <Text style={{ fontFamily: fonts.serif, fontSize: 30, fontWeight: "600", color: colors.text, marginTop: 30 }}>{title}</Text>

      <Animated.View style={{ flexDirection: "row", gap: 18, marginTop: 24, marginBottom: 34, transform: [{ translateX: shake }] }}>
        {Array.from({ length: LENGTH }, (_, i) => (
          <View key={i} style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.text, backgroundColor: i < pin.length ? colors.text : "transparent" }} />
        ))}
      </Animated.View>

      <View style={{ width: 300, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 18 }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <Key key={d} label={d} onPress={() => press(d)} />)}
        {biometric && onBiometric ? (
          <Key icon={biometric === "faceid" ? "scan-outline" : "finger-print"} onPress={onBiometric} />
        ) : (
          <View style={{ width: 84, height: 84 }} />
        )}
        <Key label="0" onPress={() => press("0")} />
        <Key icon="backspace-outline" onPress={() => setPin(pin.slice(0, -1))} />
      </View>

      {footer ? <Text style={{ marginTop: 34, color: colors.textSoft, fontSize: 14, textAlign: "center" }}>{footer}</Text> : null}
    </View>
  );
}

function Key({ label, icon, onPress }: { label?: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ width: 84, height: 84, borderRadius: 42, backgroundColor: pressed ? colors.primarySoft : colors.card, alignItems: "center", justifyContent: "center" })}
    >
      {label ? <Text style={{ fontSize: 32, color: colors.text }}>{label}</Text> : <Ionicons name={icon!} size={28} color={colors.text} />}
    </Pressable>
  );
}
