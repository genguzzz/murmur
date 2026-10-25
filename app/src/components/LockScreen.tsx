import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PinPad } from "./PinPad";
import { authenticateBiometric, biometricKind, blockedForMs, unlock, verifyPin } from "@/lib/lock";
import { useStore } from "@/lib/store";
import { colors } from "@/lib/theme";

// Full-screen overlay above the navigator, so the route stack survives locking.
export function LockScreen() {
  const insets = useSafeAreaInsets();
  const useBio = useStore((s) => s.settings.lockBiometrics);
  const [kind, setKind] = useState<"faceid" | "touchid" | null>(null);

  const tryBiometric = useCallback(async () => {
    if (await authenticateBiometric()) unlock();
  }, []);

  useEffect(() => {
    if (!useBio) return;
    void biometricKind().then((k) => {
      setKind(k);
      // Prompt right away, like the system lock screen.
      if (k) void tryBiometric();
    });
  }, [useBio, tryBiometric]);

  const onComplete = useCallback(async (pin: string) => {
    const wait = blockedForMs();
    if (wait > 0) {
      Alert.alert("尝试次数过多", `请 ${Math.ceil(wait / 1000)} 秒后再试`);
      return false;
    }
    const ok = await verifyPin(pin);
    if (ok) unlock();
    return ok;
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 10, zIndex: 100 }]}>
      <PinPad
        title="输入密码"
        bubble="请输入密码解锁"
        onComplete={onComplete}
        biometric={useBio ? kind : null}
        onBiometric={() => void tryBiometric()}
        footer={useBio && kind ? `点按 ${kind === "faceid" ? "Face ID" : "Touch ID"} 图标，使用${kind === "faceid" ? "面容" : "指纹"}解锁` : undefined}
      />
    </View>
  );
}
