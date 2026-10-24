// System Calendar and Reminders: read upcoming events (context for the brief),
// write events/reminders, or hand off to the system editor (no permission needed).
import * as Calendar from "expo-calendar/legacy";
import { needAccess } from "./access";
import { DeviceError, instrument, requireCapability } from "./core";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  calendar?: string;
}

export function upcomingEvents(opts: { days?: number; reason?: string } = {}): Promise<CalendarEvent[]> {
  return instrument("upcomingEvents", async () => {
    requireCapability("calendar");
    await needAccess("calendar", opts.reason);
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const names = new Map(cals.map((c) => [c.id, c.title]));
    const start = new Date();
    const end = new Date(start.getTime() + (opts.days ?? 2) * 86400_000);
    const events = await Calendar.getEventsAsync(cals.map((c) => c.id), start, end);
    return events
      .map((e) => ({
        id: e.id,
        title: e.title,
        start: new Date(e.startDate).toISOString(),
        end: new Date(e.endDate).toISOString(),
        allDay: !!e.allDay,
        ...(e.location ? { location: e.location } : {}),
        ...(names.get(e.calendarId) ? { calendar: names.get(e.calendarId) } : {}),
      }))
      .sort((a, b) => a.start.localeCompare(b.start));
  });
}

export function addEvent(e: { title: string; start: Date; end?: Date; allDay?: boolean; notes?: string; location?: string; alarmMinutesBefore?: number; reason?: string }): Promise<string> {
  return instrument("addEvent", async () => {
    requireCapability("calendar");
    await needAccess("calendar", e.reason);
    const cal = await Calendar.getDefaultCalendarAsync();
    return Calendar.createEventAsync(cal.id, {
      title: e.title,
      startDate: e.start,
      endDate: e.end ?? new Date(e.start.getTime() + 3600_000),
      allDay: e.allDay ?? false,
      ...(e.notes ? { notes: e.notes } : {}),
      ...(e.location ? { location: e.location } : {}),
      ...(e.alarmMinutesBefore !== undefined ? { alarms: [{ relativeOffset: -e.alarmMinutesBefore }] } : {}),
    });
  });
}

// Opens the system "new event" sheet prefilled; the user saves it. No permission.
export function openEventEditor(e: { title: string; start: Date; end?: Date; notes?: string; location?: string }): Promise<"saved" | "canceled" | "deleted" | "done" | "responded"> {
  return instrument("openEventEditor", async () => {
    requireCapability("calendar");
    const r = await Calendar.createEventInCalendarAsync({ title: e.title, startDate: e.start, endDate: e.end ?? new Date(e.start.getTime() + 3600_000), notes: e.notes, location: e.location });
    return r.action;
  });
}

async function remindersCalendarId(): Promise<string> {
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER);
  const target = cals.find((c) => c.allowsModifications && c.source?.type !== "subscribed") ?? cals.find((c) => c.allowsModifications);
  if (!target) throw new DeviceError("unavailable", "没有可写入的提醒事项列表");
  return target.id;
}

// Writes into the system Reminders app; returns the reminder id (keep it to update/delete).
export function addReminder(r: { title: string; due?: Date; allDay?: boolean; notes?: string; reason?: string }): Promise<string> {
  return instrument("addReminder", async () => {
    requireCapability("calendar");
    await needAccess("reminders", r.reason);
    return Calendar.createReminderAsync(await remindersCalendarId(), {
      title: r.title,
      ...(r.notes ? { notes: r.notes } : {}),
      ...(r.due ? { dueDate: r.due, startDate: r.due, allDay: r.allDay ?? false, alarms: r.allDay ? [] : [{ absoluteDate: r.due.toISOString() }] } : {}),
    });
  });
}

export function completeReminder(id: string, done = true): Promise<void> {
  return instrument("completeReminder", async () => {
    await needAccess("reminders");
    await Calendar.updateReminderAsync(id, { completed: done, ...(done ? { completionDate: new Date() } : {}) });
  });
}

export function deleteReminder(id: string): Promise<void> {
  return instrument("deleteReminder", async () => {
    await needAccess("reminders");
    await Calendar.deleteReminderAsync(id);
  });
}
