import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, Platform, View } from "react-native";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Device from "expo-device";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LockScreen } from "@/components/LockScreen";
import { Mascot } from "@/components/Mascot";
import { startLockWatcher, useLocked } from "@/lib/lock";
import { appVersion } from "@/lib/api";
import { flush, installGlobalHandlers, logger, pruneLogs, sessionId } from "@/lib/log";
import { loadState, resumePending, useLoaded, useStore } from "@/lib/store";
import { colors } from "@/lib/theme";

const log = logger("app");
installGlobalHandlers();
log.info("launch", {
  session: sessionId,
  version: appVersion,
  os: `${Platform.OS} ${Platform.Version}`,
  device: `${Device.manufacturer ?? ""} ${Device.modelName ?? ""}`.trim(),
});
void loadState(startLockWatcher).then(() => {
  pruneLogs();
  resumePending();
});

export default function RootLayout() {
  const loaded = useLoaded();
  const pathname = usePathname();
  const locked = useLocked();
  const lockEnabled = useStore((s) => s.settings.lockEnabled);
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    log.info("route", { pathname });
  }, [pathname]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      log.info("appstate", { state: s });
      setAppState(s);
      if (s !== "active") void flush();
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {loaded ? (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="record" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
          <Stack.Screen name="processing" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
          <Stack.Screen name="write" options={{ presentation: "modal" }} />
        </Stack>
      ) : null}
      {loaded && locked ? <LockScreen /> : null}
      {loaded && lockEnabled && !locked && appState !== "active" ? (
        // Hides journal content in the app switcher snapshot.
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
          <Mascot size={96} mood="calm" />
        </View>
      ) : null}
      {!loaded ? (
        <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
    </SafeAreaProvider>
  );
}
