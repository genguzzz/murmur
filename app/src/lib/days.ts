// Grouping entries by calendar day (app time zone) for the calendar screens.
import { dayKey } from "./format";
import type { Entry } from "./store";

// The day's main mood: the most frequent mood among its entries (latest wins ties).
export function mainMood(list: Entry[]): Entry | undefined {
  const withMood = list.filter((e) => e.mood);
  const count = new Map<string, number>();
  for (const e of withMood) count.set(e.mood!, (count.get(e.mood!) ?? 0) + 1);
  return withMood.sort((a, b) => (count.get(b.mood!) ?? 0) - (count.get(a.mood!) ?? 0))[0];
}

export function entriesByDay(entries: Entry[]): Map<string, Entry[]> {
  const m = new Map<string, Entry[]>();
  for (const e of entries) {
    const k = dayKey(e.createdAt);
    m.set(k, [...(m.get(k) ?? []), e]);
  }
  return m;
}

