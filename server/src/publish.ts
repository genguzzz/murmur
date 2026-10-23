import { mkdir, readFile, readdir, rename, unlink, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.ts";

// Writes an IPA into the static 全能签/ESign/AltStore source served by nginx and
// updates appstore.json. Entries carry both key sets so either client format works.

interface PublishInput {
  ipa: Buffer;
  icon: Buffer | null;
  bundleId: string;
  version: string;
  name: string;
  minIos: string;
  notes: string;
}

const SOURCE_META = {
  name: "tutu 自建源",
  identifier: "top.gugenzzz.apps",
  sourceURL: `${config.sourceBase}/appstore.json`,
  sourceicon: `${config.sourceBase}/icons/source.png`,
  iconURL: `${config.sourceBase}/icons/source.png`,
};

const SAFE = /^[A-Za-z0-9._-]+$/;

export async function publishIpa(input: PublishInput): Promise<{ downUrl: string }> {
  if (!SAFE.test(input.bundleId) || !SAFE.test(input.version)) {
    throw new Error("bundleId/version contain unsafe characters");
  }
  const appsDir = path.join(config.sourceRoot, "apps");
  const iconsDir = path.join(config.sourceRoot, "icons");
  await mkdir(appsDir, { recursive: true });
  await mkdir(iconsDir, { recursive: true });

  const fname = `${input.bundleId}-${input.version}.ipa`;
  await atomicWrite(path.join(appsDir, fname), input.ipa);
  let iconUrl = "";
  if (input.icon) {
    await atomicWrite(path.join(iconsDir, `${input.bundleId}.png`), input.icon);
    iconUrl = `${config.sourceBase}/icons/${input.bundleId}.png`;
  }

  const manifestPath = path.join(config.sourceRoot, "appstore.json");
  let data: { apps: Record<string, unknown>[]; news?: unknown[] } & Record<string, unknown>;
  try {
    data = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    data = { apps: [], news: [] };
  }
  const old = data.apps.find((a) => a.bundleId === input.bundleId);
  if (!iconUrl && old && typeof old.icon === "string") iconUrl = old.icon;

  const downUrl = `${config.sourceBase}/apps/${fname}`;
  const now = new Date();
  const entry = {
    name: input.name,
    type: "4",
    version: input.version,
    versionDate: now.toISOString(),
    versionDescription: input.notes,
    bundleId: input.bundleId,
    icon: iconUrl,
    downUrl,
    minIos: input.minIos,
    size: input.ipa.length,
    bundleIdentifier: input.bundleId,
    downloadURL: downUrl,
    iconURL: iconUrl,
    localizedDescription: input.notes || input.name,
    developerName: "tutu",
  };
  data = { ...data, ...SOURCE_META, apps: [...data.apps.filter((a) => a.bundleId !== input.bundleId), entry] };
  await atomicWrite(manifestPath, Buffer.from(JSON.stringify(data, null, 2)));

  // Keep only the 3 newest builds of this app on disk.
  const builds = (await readdir(appsDir)).filter((f) => f.startsWith(`${input.bundleId}-`) && f.endsWith(".ipa"));
  const byAge = await Promise.all(builds.map(async (f) => ({ f, v: f.slice(input.bundleId.length + 1, -4) })));
  byAge.sort((a, b) => b.v.localeCompare(a.v, undefined, { numeric: true }));
  for (const { f } of byAge.slice(3)) await unlink(path.join(appsDir, f)).catch(() => {});

  return { downUrl };
}

async function atomicWrite(file: string, buf: Buffer): Promise<void> {
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, buf);
  await chmod(tmp, 0o644);
  await rename(tmp, file);
}
