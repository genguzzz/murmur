import type { ExpoConfig } from "expo/config";

import pkg from "./package.json";

// The release version comes from package.json (bumped by scripts/release.sh);
// CI sets BUILD_NUMBER (GitHub run number) as the build number.
const build = process.env.BUILD_NUMBER ?? "0";

// OTA updates only reach binaries with the same runtime version. Bump this
// whenever native code changes (new/upgraded native module, plugin, permission,
// Expo SDK upgrade), then cut a new IPA with scripts/release.sh.
// 4: capability pack (camera, photos, location, calendar, contacts, speech, background
//    task, sqlite, reanimated/gesture-handler, …) so new features can ship over the air.
// 3: expo-blur, datetimepicker. 2: expo-notifications, automatic light/dark.
export const RUNTIME_VERSION = "4";

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
    // ---- Capability pack: native modules shipped ahead of the features that use them.
    // Permission prompts only appear when a feature first calls the API (src/lib/device).
    // No entitlements here (iCloud, App Groups, push…): they would break re-signing.
    [
      "expo-image-picker",
      {
        photosPermission: "Murmur 需要访问相册，让你给日记和待办配上照片。",
        cameraPermission: "Murmur 需要使用相机，让你拍照记录。",
        microphonePermission: "Murmur 需要使用麦克风录制你的语音日记。",
      },
    ],
    ["expo-camera", { cameraPermission: "Murmur 需要使用相机，让你拍照记录。", microphonePermission: "Murmur 需要使用麦克风录制你的语音日记。" }],
    ["expo-media-library", { photosPermission: "Murmur 需要访问相册，让你给日记和待办配上照片。", savePhotosPermission: "Murmur 需要把图片保存到你的相册。", isAccessMediaLocationEnabled: true }],
    [
      "expo-location",
      {
        locationWhenInUsePermission: "Murmur 用你的位置给记录标上地点，或在你到达某地时提醒待办。",
        locationAlwaysAndWhenInUsePermission: "开启「始终」后，Murmur 能在你到家、到公司时提醒对应的待办，即使 App 没打开。",
        locationAlwaysPermission: "开启「始终」后，Murmur 能在你到家、到公司时提醒对应的待办，即使 App 没打开。",
        locationFullAccuracyPermission: "需要精确位置才能准确判断你是否到达提醒地点。",
        motionUsagePermission: "Murmur 用运动状态判断你是否在路上，以便合适的时候提醒。",
        isIosBackgroundLocationEnabled: false,
      },
    ],
    ["expo-calendar", { calendarPermission: "Murmur 可以把待办同步到你的日历。", remindersPermission: "Murmur 可以把待办同步到系统「提醒事项」。" }],
    ["expo-contacts", { contactsPermission: "Murmur 用通讯录识别你在待办里提到的人，比如「给妈妈打电话」。" }],
    ["expo-speech-recognition", { speechRecognitionPermission: "Murmur 用系统语音识别在你说话时实时显示文字。", microphonePermission: "Murmur 需要使用麦克风录制你的语音日记。" }],
    "expo-background-task",
    "expo-sqlite",
    "expo-web-browser",
  ],
  experiments: { typedRoutes: true },
};

export default config;
