// Shared plumbing for the device wrappers: typed errors, instrumentation and the
// registry of native modules compiled into this binary.
import { requireOptionalNativeModule } from "expo-modules-core";
import { logger } from "../log";
import { timed } from "../track";

export const log = logger("device");

export type DeviceErrorCode = "denied" | "unavailable" | "failed";

export class DeviceError extends Error {
  constructor(public code: DeviceErrorCode, message: string) {
    super(message);
    this.name = "DeviceError";
  }
}

// Every wrapper runs through this: one log line and one `device.<name>` event per
// call, with ok/ms/error code. `null` results mean the user cancelled.
export async function instrument<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const r = await timed(`device.${name}`, fn);
    log.info(name, { ms: Date.now() - t0, result: r === null ? "cancelled" : "ok" });
    return r;
  } catch (e) {
    log.warn(`${name} failed`, { ms: Date.now() - t0, code: (e as DeviceError).code, err: e });
    throw e;
  }
}

// Native modules that OTA code may rely on. A runtime version guarantees them, but
// checking keeps a mistake in a future update from crashing older binaries.
const MODULES = {
  imagePicker: "ExponentImagePicker",
  camera: "ExpoCamera",
  mediaLibrary: "ExpoMediaLibrary",
  imageManipulator: "ExpoImageManipulator",
  image: "ExpoImage",
  location: "ExpoLocation",
  taskManager: "ExpoTaskManager",
  backgroundTask: "ExpoBackgroundTask",
  calendar: "ExpoCalendar",
  contacts: "ExpoContacts",
  documentPicker: "ExpoDocumentPicker",
  speech: "ExpoSpeech",
  speechRecognition: "ExpoSpeechRecognition",
  sqlite: "ExpoSQLite",
  network: "ExpoNetwork",
  localization: "ExpoLocalization",
  keepAwake: "ExpoKeepAwake",
  webBrowser: "ExpoWebBrowser",
  quickActions: "ExpoQuickActions",
  glassEffect: "ExpoGlassEffect",
  symbols: "SymbolModule",
  blur: "ExpoBlur",
  notifications: "ExpoNotificationScheduler",
  audio: "ExpoAudio",
  haptics: "ExpoHaptics",
  systemUI: "ExpoSystemUI",
  live: "MurmurLive",
} as const;

export type Capability = keyof typeof MODULES;

const cache = new Map<Capability, boolean>();

export function has(cap: Capability): boolean {
  if (!cache.has(cap)) cache.set(cap, requireOptionalNativeModule(MODULES[cap]) != null);
  return cache.get(cap)!;
}

export function capabilities(): Record<Capability, boolean> {
  return Object.fromEntries((Object.keys(MODULES) as Capability[]).map((c) => [c, has(c)])) as Record<Capability, boolean>;
}

export function requireCapability(cap: Capability) {
  if (!has(cap)) throw new DeviceError("unavailable", `当前版本不支持 ${cap}，请更新 App`);
}
