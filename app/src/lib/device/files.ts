// Import files through the system document picker (no permission, no iCloud entitlement).
import * as DocumentPicker from "expo-document-picker";
import { instrument, requireCapability } from "./core";

export interface PickedFile {
  uri: string;
  name: string;
  size?: number;
  mime?: string;
}

export function pickFiles(opts: { types?: string[]; multiple?: boolean } = {}): Promise<PickedFile[] | null> {
  return instrument("pickFiles", async () => {
    requireCapability("documentPicker");
    const r = await DocumentPicker.getDocumentAsync({ type: opts.types ?? "*/*", multiple: opts.multiple ?? false, copyToCacheDirectory: true });
    if (r.canceled) return null;
    return r.assets.map((a) => ({ uri: a.uri, name: a.name, ...(a.size ? { size: a.size } : {}), ...(a.mimeType ? { mime: a.mimeType } : {}) }));
  });
}
