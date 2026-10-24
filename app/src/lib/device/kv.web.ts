// Web preview stand-in for kv.ts (expo-sqlite's web worker needs wasm + COOP/COEP).
export const kv = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = globalThis.localStorage?.getItem(key);
      return v == null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  },
  remove(key: string) {
    globalThis.localStorage?.removeItem(key);
  },
};

export function openDatabaseSync(): never {
  throw new Error("SQLite is not available in the web preview");
}
