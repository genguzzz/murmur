// App lock: 4-digit PIN (salted SHA-256 in the keychain) with optional Face ID.
// Locks on cold start and when returning from background after `lockDelaySec`.
import { useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { logger } from "./log";
import { getState, updateSettings } from "./store";

const log = logger("lock");
const PIN_KEY = "murmur.pin.v1"; // value: "<salt>:<sha256(salt:pin)>"

// ---------- secure storage (localStorage on web, for the preview only) ----------

async function readSecret(): Promise<string | null> {
  if (Platform.OS === "web") return globalThis.localStorage?.getItem(PIN_KEY) ?? null;
  return SecureStore.getItemAsync(PIN_KEY);
}

async function writeSecret(v: string | null): Promise<void> {
  if (Platform.OS === "web") {
    if (v === null) globalThis.localStorage?.removeItem(PIN_KEY);
    else globalThis.localStorage?.setItem(PIN_KEY, v);
    return;
  }
  if (v === null) await SecureStore.deleteItemAsync(PIN_KEY);
  else await SecureStore.setItemAsync(PIN_KEY, v, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

async function hash(salt: string, pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function setPin(pin: string): Promise<void> {
  const salt = Crypto.randomUUID();
  await writeSecret(`${salt}:${await hash(salt, pin)}`);
  updateSettings({ lockEnabled: true });
  log.info("pin set");
}

export async function disableLock(): Promise<void> {
  await writeSecret(null);
  updateSettings({ lockEnabled: false, lockBiometrics: false });
  setLocked(false);
  log.info("lock disabled");
}

// Wrong attempts back off: 5 failures → 30 s wait, doubling after that.
let failures = 0;
let blockedUntil = 0;

export function blockedForMs(): number {
  return Math.max(0, blockedUntil - Date.now());
}

export async function verifyPin(pin: string): Promise<boolean> {
  if (blockedForMs() > 0) return false;
  const stored = await readSecret();
  if (!stored) {
    // Keychain lost the PIN (e.g. restored to a new phone): don't lock the user out.
    log.warn("pin missing from keychain, disabling lock");
    await disableLock();
    return true;
  }
  const [salt, digest] = stored.split(":");
  const ok = (await hash(salt, pin)) === digest;
  if (ok) {
    failures = 0;
  } else {
    failures += 1;
    if (failures >= 5) blockedUntil = Date.now() + 30_000 * 2 ** (failures - 5);
    log.warn("wrong pin", { failures });
  }
  return ok;
}

// ---------- biometrics ----------

export async function biometricKind(): Promise<"faceid" | "touchid" | null> {
  if (Platform.OS === "web") return null;
  try {
    if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) return null;
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "faceid";
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "touchid";
  } catch (e) {
    log.warn("biometric probe failed", e);
  }
  return null;
}

export async function authenticateBiometric(): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: "解锁 Murmur",
      cancelLabel: "用密码",
      disableDeviceFallback: true,
      fallbackLabel: "",
    });
    log.info("biometric result", r.success ? { success: true } : { success: false, error: r.error });
    if (r.success || r.error !== "lockout") return r.success;
    // iOS locks Face ID after repeated failed scans and only the device passcode
    // clears it; biometrics-only auth would keep failing instantly until then.
    const p = await LocalAuthentication.authenticateAsync({ promptMessage: "面容 ID 已锁定，输入手机密码以重新启用" });
    log.info("passcode fallback result", p.success ? { success: true } : { success: false, error: p.error });
    return p.success;
  } catch (e) {
    log.error("biometric error", e);
    return false;
  }
}

// ---------- lock state ----------

let locked = false;
const listeners = new Set<() => void>();

function setLocked(v: boolean) {
  if (locked === v) return;
  locked = v;
  log.info(v ? "locked" : "unlocked");
  for (const l of listeners) l();
}

export function unlock() {
  setLocked(false);
}

export function useLocked(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => locked,
  );
}

let started = false;
let backgroundAt: number | null = null;

// Call once after state is loaded.
export function startLockWatcher() {
  if (started) return;
  started = true;
  if (getState().settings.lockEnabled) setLocked(true);
  // Only "background" counts: the Face ID sheet itself makes the app "inactive".
  AppState.addEventListener("change", (s) => {
    const { lockEnabled, lockDelaySec } = getState().settings;
    if (!lockEnabled) return;
    if (s === "background") backgroundAt = Date.now();
    else if (s === "active" && backgroundAt !== null) {
      const away = (Date.now() - backgroundAt) / 1000;
      backgroundAt = null;
      if (away >= lockDelaySec) setLocked(true);
    }
  });
}
