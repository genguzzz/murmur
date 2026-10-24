import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, Platform, useColorScheme, View } from "react-native";
import { Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Device from "expo-device";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LockScreen } from "@/components/LockScreen";
import { Mascot } from "@/components/Mascot";
import { ToastHost } from "@/components/ui";
import { startLockWatcher, useLocked } from "@/lib/lock";
import { appVersion } from "@/lib/api";
import { flush, installGlobalHandlers, logger, pruneLogs, sessionId } from "@/lib/log";
import { getState, loadState, resumePending, useLoaded, useStore } from "@/lib/store";
import { applyScheme, colors, type Scheme } from "@/lib/theme";
import { logRunningUpdate, startForegroundChecks } from "@/lib/updates";
import { installNotificationHandler, onNotificationTap, syncCheckins } from "@/lib/notify";

const log = logger("app");
installGlobalHandlers();
log.info("launch", {
  session: sessionId,
  version: appVersion,
  os: `${Platform.OS} ${Platform.Version}`,
  device: `${Device.manufacturer ?? ""} ${Device.modelName ?? ""}`.trim(),
});
logRunningUpdate();
startForegroundChecks();
installNotificationHandler();
void loadState(startLockWatcher).then(() => {
  pruneLogs();
  resumePending();
  void syncCheckins(getState().settings.checkins);
});

export default function RootLayout() {
  const loaded = useLoaded();
  const pathname = usePathname();
  const router = useRouter();
  const locked = useLocked();
  const lockEnabled = useStore((s) => s.settings.lockEnabled);
  const themePref = useStore((s) => s.settings.theme);
  const system = useColorScheme();
  const [appState, setAppState] = useState(AppState.currentState);

  const scheme: Scheme = themePref === "light" || themePref === "dark" ? themePref : system === "dark" ? "dark" : "light";
  // Palette must be in place before any child renders; the key below remounts on change.
  applyScheme(scheme);

  useEffect(() => {
    log.info("theme", { pref: themePref, system, scheme });
  }, [themePref, system, scheme]);

  useEffect(() => {
    log.info("route", { pathname });
  }, [pathname]);

  useEffect(() => {
    if (!loaded) return;
    return onNotificationTap((route, params) => router.push({ pathname: route as never, params }));
  }, [loaded, router]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      log.info("appstate", { state: s });
      setAppState(s);
      if (s !== "active") void flush();
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider key={scheme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {loaded ? (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="record" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
          <Stack.Screen name="processing" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
          <Stack.Screen name="write" options={{ presentation: "modal" }} />
          <Stack.Screen name="edit/[id]" options={{ presentation: "modal" }} />
        </Stack>
      ) : null}
      {loaded ? <ToastHost /> : null}
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
