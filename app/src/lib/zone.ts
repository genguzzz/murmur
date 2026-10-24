// App time zone. By default it is the phone's; Settings can pin one (e.g. Asia/Shanghai)
// so "明天下午三点", today/overdue and reminders follow that zone even when the phone
// is set elsewhere.
//
// Model: a "wall" Date is a Date whose *local* fields (getHours, getDate, …) read as
// the wall-clock time in the app zone. Date logic and display work on wall dates;
// only scheduling converts back to a real instant with instantOf().

let pinned: string | null = null;

export function setAppZone(tz: string | null) {
  pinned = tz;
}

export function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

export function appZone(): string {
  return pinned ?? deviceZone();
}

const formatters = new Map<string, Intl.DateTimeFormat>();

// Minutes east of UTC for `tz` at `instant` (DST-aware). Falls back to UTC+8 for
// Asia zones if Intl can't resolve the zone, else to the device offset.
export function zoneOffset(tz: string, instant: Date): number {
  try {
    let f = formatters.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
      formatters.set(tz, f);
    }
    const p: Record<string, number> = {};
    for (const part of f.formatToParts(instant)) if (part.type !== "literal") p[part.type] = Number(part.value);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
    return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
  } catch {
    return tz.startsWith("Asia/") ? 480 : -instant.getTimezoneOffset();
  }
}

// How far wall time in the app zone is ahead of the device's local time, in ms.
function shift(instant: Date): number {
  if (!pinned) return 0;
  return (zoneOffset(pinned, instant) + instant.getTimezoneOffset()) * 60000;
}

// Real instant → wall date in the app zone.
export function wall(instant: Date | string | number = Date.now()): Date {
  const d = instant instanceof Date ? instant : new Date(instant);
  return new Date(d.getTime() + shift(d));
}

export function nowWall(): Date {
  return wall(Date.now());
}

// Wall date in the app zone → real instant (for notification triggers, APIs).
export function instantOf(w: Date): Date {
  if (!pinned) return w;
  let t = w.getTime() - shift(w);
  // Second pass settles DST boundaries where the first guess used the wrong offset.
  t = w.getTime() - shift(new Date(t));
  return new Date(t);
}

// "UTC+8" style label for an offset in minutes.
export function offsetLabel(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const m = Math.abs(minutes);
  return `UTC${sign}${Math.floor(m / 60)}${m % 60 ? `:${`${m % 60}`.padStart(2, "0")}` : ""}`;
}
