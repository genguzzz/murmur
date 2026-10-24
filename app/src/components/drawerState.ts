// Open/close state for the side drawer, shared by the header button and the drawer itself.
import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

function set(v: boolean) {
  if (open === v) return;
  open = v;
  for (const l of listeners) l();
}

export const openDrawer = () => set(true);
export const closeDrawer = () => set(false);

export function useDrawerOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
  );
}
