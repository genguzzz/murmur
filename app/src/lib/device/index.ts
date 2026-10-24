// Device capabilities, wrapped. Feature code imports from here, never from the expo-*
// modules directly, so permissions, logging and events behave the same everywhere.
// Native modules for all of these ship in runtime 4; new ones need a runtime bump.
export { capabilities, has, DeviceError, type Capability } from "./core";
export { ensureAccess, needAccess } from "./access";
export { accessOf, ALL_PERMISSIONS, type Access, type PermissionKind } from "./permissions";
export { compressPhoto, deleteMedia, keepMedia, mediaFile, pickPhotos, saveToPhotos, takePhoto, type Photo } from "./media";
export { currentPlace, findPlace, listGeofences, placeName, setGeofences, type Geofence, type Place } from "./location";
export { addEvent, addReminder, completeReminder, deleteReminder, openEventEditor, upcomingEvents, type CalendarEvent } from "./calendar";
export { call, findContacts, pickContact, sms, type Person } from "./contacts";
export { pickFiles, type PickedFile } from "./files";
export { liveTranscribe, speak, stopSpeaking, type LiveTranscription } from "./speech";
export { isOnline, keepAwake, locale, onNetworkChange, openInApp, releaseAwake } from "./system";
export { backgroundStatus, registerBackgroundRefresh } from "./background";
export { installQuickActions } from "./quickActions";
export { kv, openDatabaseSync } from "./kv";
