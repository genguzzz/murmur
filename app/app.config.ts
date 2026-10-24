import type { ExpoConfig } from "expo/config";

import pkg from "./package.json";

// The release version comes from package.json (bumped by scripts/release.sh);
// CI sets BUILD_NUMBER (GitHub run number) as the build number.
const build = process.env.BUILD_NUMBER ?? "0";

// OTA updates only reach binaries with the same runtime version. Bump this
// whenever native code changes (new/upgraded native module, plugin, permission,
// Expo SDK upgrade), then cut a new IPA with scripts/release.sh.
export const RUNTIME_VERSION = "3"; // 3: expo-blur, datetimepicker (2: expo-notifications, automatic light/dark)

const config: ExpoConfig = {
  name: "Murmur",
  slug: "murmur",
  scheme: "murmur",
  version: pkg.version,
  runtimeVersion: RUNTIME_VERSION,
  updates: {
    url: "https://voice.gugenzzz.top/updates/manifest",
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 0,
  },
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  backgroundColor: "#F6EEE3",
  ios: {
    bundleIdentifier: "top.gugenzzz.murmur",
    buildNumber: build,
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleDisplayName: "Murmur",
    },
  },
  android: {
    package: "top.gugenzzz.murmur",
    versionCode: Number(build) || 1,
    adaptiveIcon: {
      backgroundColor: "#F6EEE3",
      foregroundImage: "./assets/android-icon-foreground.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: { favicon: "./assets/favicon.png" },
  plugins: [
    "expo-router",
    "expo-updates",
    "expo-secure-store",
    // Local notifications only (check-ins, follow-up reminders): no APNs entitlement,
    // so the IPA re-signs cleanly with any provisioning profile.
    ["expo-notifications", { enableRemoteNotifications: false }],
    ["expo-local-authentication", { faceIDPermission: "Murmur 用面容 ID 解锁你的日记。" }],
    [
      "expo-audio",
      {
        microphonePermission: "Murmur 需要使用麦克风录制你的语音日记。",
        enableBackgroundRecording: true,
      },
    ],
  ],
  experiments: { typedRoutes: true },
};

export default config;
