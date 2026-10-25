// JS side of the MurmurCloud native module (folder sync). Optional, so OTA code on a
// binary without it (runtime < 5, web) sees null and hides the feature.
import { requireOptionalNativeModule } from "expo-modules-core";

export interface PickedFolder {
  bookmark: string; // base64 bookmark, persisted to re-open the folder after relaunch
  name: string;
  iCloud: boolean; // the folder lives in iCloud Drive
}

interface MurmurCloudNative {
  pickFolder(): Promise<PickedFolder | null>;
  open(bookmark: string): Promise<{ name: string; iCloud: boolean; bookmark?: string }>;
  close(): Promise<void>;
  exists(rel: string): Promise<boolean>;
  list(rel: string): Promise<{ name: string; size: number }[]>;
  readText(rel: string): Promise<string | null>;
  writeText(rel: string, text: string): Promise<void>;
  copyIn(localUri: string, rel: string): Promise<void>;
  copyOut(rel: string, localUri: string): Promise<void>;
  remove(rel: string): Promise<void>;
}

export default requireOptionalNativeModule<MurmurCloudNative>("MurmurCloud");
