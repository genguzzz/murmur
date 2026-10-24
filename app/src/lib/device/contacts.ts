// Contacts: the system picker needs no permission; searching does.
import { Linking } from "react-native";
import * as Contacts from "expo-contacts/legacy";
import { needAccess } from "./access";
import { instrument, requireCapability } from "./core";

export interface Person {
  id: string;
  name: string;
  phones: string[];
  emails: string[];
}

function toPerson(c: Contacts.ExistingContact): Person {
  return {
    id: c.id,
    name: c.name ?? [c.lastName, c.firstName].filter(Boolean).join(""),
    phones: (c.phoneNumbers ?? []).map((p) => p.number ?? "").filter(Boolean),
    emails: (c.emails ?? []).map((e) => e.email ?? "").filter(Boolean),
  };
}

export function pickContact(): Promise<Person | null> {
  return instrument("pickContact", async () => {
    requireCapability("contacts");
    const c = await Contacts.presentContactPickerAsync();
    return c ? toPerson(c) : null;
  });
}

// Fuzzy name lookup, e.g. to resolve "妈妈" or "小李" mentioned in a to-do.
export function findContacts(name: string, reason?: string): Promise<Person[]> {
  return instrument("findContacts", async () => {
    requireCapability("contacts");
    await needAccess("contacts", reason);
    const { data } = await Contacts.getContactsAsync({ name, fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Name], pageSize: 20 });
    return data.map(toPerson);
  });
}

export const call = (phone: string) => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`);
export const sms = (phone: string, body?: string) => Linking.openURL(`sms:${phone.replace(/[^\d+]/g, "")}${body ? `&body=${encodeURIComponent(body)}` : ""}`);
