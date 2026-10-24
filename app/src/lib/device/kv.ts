// Small synchronous key-value store backed by SQLite. Unlike the journal JSON it is
// readable from headless background tasks (geofences, background refresh) instantly.
import Storage from "expo-sqlite/kv-store";

export const kv = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = Storage.getItemSync(key);
      return v == null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    Storage.setItemSync(key, JSON.stringify(value));
  },
  remove(key: string) {
    Storage.removeItemSync(key);
  },
};

export { openDatabaseSync } from "expo-sqlite";
