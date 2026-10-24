// Photos: pick from the library, take a photo, compress, keep a private copy in the
// app's documents (media/), save to the camera roll.
import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library/legacy";
import { needAccess } from "./access";
import { DeviceError, instrument, requireCapability } from "./core";

export interface Photo {
  uri: string;
  width: number;
  height: number;
  size?: number;
  mime?: string;
  takenAt?: string;
  location?: { latitude: number; longitude: number };
}

function toPhoto(a: ImagePicker.ImagePickerAsset): Photo {
  const exif = a.exif as Record<string, unknown> | null | undefined;
  const gps = exif?.["{GPS}"] as Record<string, number | string> | undefined;
  const lat = gps ? Number(gps.Latitude) * (gps.LatitudeRef === "S" ? -1 : 1) : NaN;
  const lon = gps ? Number(gps.Longitude) * (gps.LongitudeRef === "W" ? -1 : 1) : NaN;
  const taken = (exif?.["{Exif}"] as Record<string, string> | undefined)?.DateTimeOriginal;
  return {
    uri: a.uri,
    width: a.width,
    height: a.height,
    ...(a.fileSize ? { size: a.fileSize } : {}),
    ...(a.mimeType ? { mime: a.mimeType } : {}),
    ...(taken ? { takenAt: taken.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3") } : {}),
    ...(Number.isFinite(lat) && Number.isFinite(lon) ? { location: { latitude: lat, longitude: lon } } : {}),
  };
}

// System photo picker: runs out of process, so no library permission is needed.
export function pickPhotos(opts: { max?: number; quality?: number } = {}): Promise<Photo[] | null> {
  return instrument("pickPhotos", async () => {
    requireCapability("imagePicker");
    const max = opts.max ?? 1;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: max > 1,
      selectionLimit: max,
      quality: opts.quality ?? 0.85,
      exif: true,
    });
    return r.canceled ? null : r.assets.map(toPhoto);
  });
}

export function takePhoto(opts: { quality?: number; reason?: string } = {}): Promise<Photo | null> {
  return instrument("takePhoto", async () => {
    requireCapability("imagePicker");
    await needAccess("camera", opts.reason);
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: opts.quality ?? 0.85, exif: true });
    return r.canceled ? null : toPhoto(r.assets[0]);
  });
}

// Downscale so the long side is at most `maxSide` and re-encode as JPEG.
export function compressPhoto(uri: string, opts: { maxSide?: number; quality?: number } = {}): Promise<Photo> {
  return instrument("compressPhoto", async () => {
    requireCapability("imageManipulator");
    const maxSide = opts.maxSide ?? 1600;
    const ctx = ImageManipulator.manipulate(uri);
    const probe = await ctx.renderAsync();
    const scale = Math.min(1, maxSide / Math.max(probe.width, probe.height));
    const img = scale < 1 ? await ctx.resize({ width: Math.round(probe.width * scale) }).renderAsync() : probe;
    const out = await img.saveAsync({ compress: opts.quality ?? 0.8, format: SaveFormat.JPEG });
    return { uri: out.uri, width: out.width, height: out.height, size: new File(out.uri).size, mime: "image/jpeg" };
  });
}

export function saveToPhotos(uri: string, reason?: string): Promise<void> {
  return instrument("saveToPhotos", async () => {
    requireCapability("mediaLibrary");
    await needAccess("photosAdd", reason);
    await MediaLibrary.saveToLibraryAsync(uri);
  });
}

// ---------- private copies (documents/media/<name>) ----------

function mediaDir(): Directory {
  const d = new Directory(Paths.document, "media");
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

export function mediaFile(name: string): File {
  return new File(mediaDir(), name);
}

// Copies a picked/taken file into app storage and returns its file name. Sync on
// purpose: picker temp files can disappear, and async copy+delete lost data before.
export function keepMedia(uri: string, name: string): string {
  const src = new File(uri);
  const dest = mediaFile(name);
  src.copySync(dest, { overwrite: true });
  if (!dest.exists || dest.size === 0) throw new DeviceError("failed", "照片保存失败");
  return name;
}

export function deleteMedia(name: string) {
  const f = mediaFile(name);
  if (f.exists) f.delete();
}
