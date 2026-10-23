import type { ExpoConfig } from "expo/config";

// CI sets BUILD_NUMBER (GitHub run number) so every IPA has a new version in the source.
const build = process.env.BUILD_NUMBER ?? "0";

const config: ExpoConfig = {
  name: "Murmur",
  slug: "murmur",
  scheme: "murmur",
  version: `0.1.${build}`,
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
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
    "expo-secure-store",
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
