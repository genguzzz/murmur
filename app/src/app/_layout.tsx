import { useEffect } from "react";
import { ActivityIndicator, AppState, Platform, View } from "react-native";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Device from "expo-device";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { appVersion } from "@/lib/api";
import { flush, installGlobalHandlers, logger, pruneLogs, sessionId } from "@/lib/log";
import { loadState, resumePending, useLoaded } from "@/lib/store";
import { colors } from "@/lib/theme";

const log = logger("app");
installGlobalHandlers();
log.info("launch", {
  session: sessionId,
  version: appVersion,
  os: `${Platform.OS} ${Platform.Version}`,
  device: `${Device.manufacturer ?? ""} ${Device.modelName ?? ""}`.trim(),
});
void loadState().then(() => {
  pruneLogs();
  resumePending();
});

export default function RootLayout() {
  const loaded = useLoaded();
  const pathname = usePathname();

  useEffect(() => {
    log.info("route", { pathname });
  }, [pathname]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      log.info("appstate", { state: s });
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
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
    </SafeAreaProvider>
  );
}
