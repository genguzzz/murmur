// One permission model for every capability. UI (the in-app explainer before the
// one-shot iOS prompt) lives in components/PermissionPrompt; this file only talks to iOS.
import { Platform } from "react-native";
import { requestRecordingPermissionsAsync, getRecordingPermissionsAsync } from "expo-audio";
import * as Calendar from "expo-calendar/legacy";
import { Camera } from "expo-camera";
import * as Contacts from "expo-contacts/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Notifications from "expo-notifications";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

export type PermissionKind =
  | "notifications"
  | "microphone"
  | "camera"
  | "photos" // read the library (picker works without it on iOS 14+)
  | "photosAdd" // save into the library
  | "location"
  | "locationAlways"
  | "calendar"
  | "reminders"
  | "contacts"
  | "speech";

export type Access = "granted" | "limited" | "ask" | "denied";

type Raw = { granted: boolean; canAskAgain?: boolean; status?: string; accessPrivileges?: string };
type Adapter = { get: () => Promise<Raw>; request: () => Promise<Raw> };

const ADAPTERS: Record<PermissionKind, Adapter> = {
  notifications: {
    get: () => Notifications.getPermissionsAsync(),
    request: () => Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }),
  },
  microphone: { get: getRecordingPermissionsAsync, request: requestRecordingPermissionsAsync },
  camera: { get: () => Camera.getCameraPermissionsAsync(), request: () => Camera.requestCameraPermissionsAsync() },
  photos: { get: () => ImagePicker.getMediaLibraryPermissionsAsync(), request: () => ImagePicker.requestMediaLibraryPermissionsAsync() },
  photosAdd: { get: () => MediaLibrary.getPermissionsAsync(true), request: () => MediaLibrary.requestPermissionsAsync(true) },
  location: { get: () => Location.getForegroundPermissionsAsync(), request: () => Location.requestForegroundPermissionsAsync() },
  locationAlways: { get: () => Location.getBackgroundPermissionsAsync(), request: () => Location.requestBackgroundPermissionsAsync() },
  calendar: { get: () => Calendar.getCalendarPermissionsAsync(), request: () => Calendar.requestCalendarPermissionsAsync() },
  reminders: { get: () => Calendar.getRemindersPermissionsAsync(), request: () => Calendar.requestRemindersPermissionsAsync() },
  contacts: { get: () => Contacts.getPermissionsAsync(), request: () => Contacts.requestPermissionsAsync() },
  speech: { get: () => ExpoSpeechRecognitionModule.getPermissionsAsync(), request: () => ExpoSpeechRecognitionModule.requestPermissionsAsync() },
};

function toAccess(r: Raw): Access {
  if (r.granted) return r.accessPrivileges === "limited" ? "limited" : "granted";
  return r.canAskAgain === false || r.status === "denied" ? "denied" : "ask";
}

export async function accessOf(kind: PermissionKind): Promise<Access> {
  if (Platform.OS === "web") return "denied";
  try {
    return toAccess(await ADAPTERS[kind].get());
  } catch {
    return "denied";
  }
}

// Shows the system prompt (only does anything while the state is "ask").
export async function requestAccess(kind: PermissionKind): Promise<Access> {
  if (Platform.OS === "web") return "denied";
  return toAccess(await ADAPTERS[kind].request());
}

export const ALL_PERMISSIONS = Object.keys(ADAPTERS) as PermissionKind[];
