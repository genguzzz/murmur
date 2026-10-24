import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, Platform, useColorScheme, View } from "react-native";
import { Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Device from "expo-device";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DrawerHost } from "@/components/Drawer";
import { LockScreen } from "@/components/LockScreen";
import { Mascot } from "@/components/Mascot";
import { PermissionHost } from "@/components/PermissionPrompt";
import { ToastHost } from "@/components/ui";
import { isAuthenticating, startLockWatcher, useLocked } from "@/lib/lock";
import { appVersion } from "@/lib/api";
import { flush, installGlobalHandlers, logger, pruneLogs, sessionId } from "@/lib/log";
import { getState, loadState, resumePending, resyncTodoReminders, useLoaded, useStore } from "@/lib/store";
import { applyScheme, colors, type Scheme } from "@/lib/theme";
import { logRunningUpdate, startForegroundChecks } from "@/lib/updates";
import { installNotificationHandler, onNotificationTap, syncCheckins } from "@/lib/notify";
import { capabilities, clearStaleLiveActivities, installQuickActions, registerBackgroundRefresh } from "@/lib/device";
import { installTracking, track } from "@/lib/track";

const log = logger("app");
installGlobalHandlers();
installTracking();
log.info("launch", {
  session: sessionId,
  version: appVersion,
  os: `${Platform.OS} ${Platform.Version}`,
  device: `${Device.manufacturer ?? ""} ${Device.modelName ?? ""}`.trim(),
});
track("app_open", { version: appVersion, os: `${Platform.OS} ${Platform.Version}` });
if (Platform.OS !== "web") {
  const caps = capabilities();
  const missing = Object.entries(caps).filter(([, v]) => !v).map(([k]) => k);
  log.info("capabilities", { total: Object.keys(caps).length, missing });
}
clearStaleLiveActivities();
logRunningUpdate();
startForegroundChecks();
installNotificationHandler();
void loadState(startLockWatcher).then(() => {
  pruneLogs();
  resumePending();
  void syncCheckins(getState().settings.checkins);
  resyncTodoReminders();
  void registerBackgroundRefresh();
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
    // Screen views; ids in paths (/entry/abc) are collapsed so events stay countable.
    track("screen", { path: pathname.replace(/\/[a-z0-9]{8,}$/i, "/:id") });
  }, [pathname]);

  useEffect(() => {
    if (!loaded) return;
    return onNotificationTap((route, params) => router.push({ pathname: route as never, params }));
  }, [loaded, router]);

  useEffect(() => {
    if (!loaded) return;
    return installQuickActions((route, params) => router.push({ pathname: route as never, params }));
  }, [loaded, router]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      log.info("appstate", { state: s });
      setAppState(s);
      if (s !== "active") void flush();
      // Picks up a permission granted in iOS Settings and rolls repeating to-dos forward.
      else resyncTodoReminders();
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider key={scheme}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        {loaded ? (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="confirm/[id]" options={{ presentation: "modal" }} />
            <Stack.Screen name="record" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
            <Stack.Screen name="processing" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
            <Stack.Screen name="write" options={{ presentation: "modal" }} />
            <Stack.Screen name="edit/[id]" options={{ presentation: "modal" }} />
          </Stack>
        ) : null}
        {loaded ? <DrawerHost /> : null}
        {loaded ? <ToastHost /> : null}
        {loaded ? <PermissionHost /> : null}
        {loaded && locked ? <LockScreen /> : null}
        {loaded && lockEnabled && !locked && appState !== "active" && !isAuthenticating() ? (
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
    </GestureHandlerRootView>
  );
}
