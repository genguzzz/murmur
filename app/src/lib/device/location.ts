// Location: where am I (with a readable place name), and geofences that fire a local
// notification on arrival/departure even when the app is closed.
import { Platform } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { ensureAccess, needAccess } from "./access";
import { DeviceError, instrument, log, requireCapability } from "./core";
import { kv } from "./kv";
import { track } from "../track";

export interface Place {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  name: string; // best short label: POI/street, else district/city
  city?: string;
  district?: string;
  street?: string;
  country?: string;
}

function label(a: Location.LocationGeocodedAddress | undefined): Pick<Place, "name" | "city" | "district" | "street" | "country"> {
  if (!a) return { name: "" };
  const street = [a.street, a.streetNumber].filter(Boolean).join("");
  return {
    name: a.name || street || a.district || a.city || "",
    ...(a.city ? { city: a.city } : {}),
    ...(a.district ? { district: a.district } : {}),
    ...(street ? { street } : {}),
    ...(a.country ? { country: a.country } : {}),
  };
}

export function placeName(latitude: number, longitude: number): Promise<Pick<Place, "name" | "city" | "district" | "street" | "country">> {
  return instrument("reverseGeocode", async () => label((await Location.reverseGeocodeAsync({ latitude, longitude }))[0]));
}

// Fast path uses the last known fix if it is recent enough.
export function currentPlace(opts: { maxAgeSec?: number; precise?: boolean; withName?: boolean; reason?: string } = {}): Promise<Place> {
  return instrument("currentPlace", async () => {
    requireCapability("location");
    await needAccess("location", opts.reason);
    if (!(await Location.hasServicesEnabledAsync())) throw new DeviceError("unavailable", "定位服务已关闭");
    const last = await Location.getLastKnownPositionAsync({ maxAge: (opts.maxAgeSec ?? 120) * 1000 });
    const fix = last ?? (await Location.getCurrentPositionAsync({ accuracy: opts.precise ? Location.Accuracy.High : Location.Accuracy.Balanced }));
    const { latitude, longitude, accuracy } = fix.coords;
    const named = opts.withName === false ? { name: "" } : await placeName(latitude, longitude).catch(() => ({ name: "" }));
    return { latitude, longitude, accuracy: accuracy ?? null, ...named };
  });
}

export function findPlace(query: string): Promise<{ latitude: number; longitude: number }[]> {
  return instrument("geocode", async () => (await Location.geocodeAsync(query)).map((r) => ({ latitude: r.latitude, longitude: r.longitude })));
}

// ---------- geofences ----------

export interface Geofence {
  id: string;
  latitude: number;
  longitude: number;
  radius: number; // metres; iOS needs ≥100 to be reliable
  on: "enter" | "exit" | "both";
  title: string; // notification shown when it fires
  body?: string;
  data?: Record<string, string>; // passed through to the notification (e.g. route)
}

const GEOFENCE_TASK = "murmur-geofence";
const GEOFENCE_KEY = "device.geofences";

// Must be defined at module load so iOS can wake the app into it.
if (Platform.OS !== "web") TaskManager.defineTask<{ eventType: Location.GeofencingEventType; region: Location.LocationRegion }>(GEOFENCE_TASK, async ({ data, error }) => {
  if (error || !data) {
    log.warn("geofence task error", error);
    return;
  }
  const fence = kv.get<Geofence[]>(GEOFENCE_KEY, []).find((f) => f.id === data.region.identifier);
  const kind = data.eventType === Location.GeofencingEventType.Enter ? "enter" : "exit";
  track("geofence", { kind, known: !!fence });
  if (!fence || (fence.on !== "both" && fence.on !== kind)) return;
  await Notifications.scheduleNotificationAsync({
    content: { title: fence.title, body: fence.body ?? (kind === "enter" ? "已到达" : "已离开"), sound: "default", data: { ...fence.data, geofence: fence.id } },
    trigger: null,
  });
});

export function listGeofences(): Geofence[] {
  return kv.get<Geofence[]>(GEOFENCE_KEY, []);
}

// Replaces the whole set (iOS monitors at most 20 regions per app).
export function setGeofences(fences: Geofence[], reason?: string): Promise<void> {
  return instrument("setGeofences", async () => {
    requireCapability("taskManager");
    kv.set(GEOFENCE_KEY, fences.slice(0, 20));
    if (!fences.length) {
      if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) await Location.stopGeofencingAsync(GEOFENCE_TASK);
      return;
    }
    await needAccess("location", reason);
    // "Always" is what lets iOS wake us; without it fences only work while open.
    const always = await ensureAccess("locationAlways", { reason });
    if (always !== "granted") log.warn("geofences without always-location", { always });
    await Location.startGeofencingAsync(
      GEOFENCE_TASK,
      fences.slice(0, 20).map((f) => ({
        identifier: f.id,
        latitude: f.latitude,
        longitude: f.longitude,
        radius: Math.max(100, f.radius),
        notifyOnEnter: f.on !== "exit",
        notifyOnExit: f.on !== "enter",
      })),
    );
  });
}
