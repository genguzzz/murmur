import { mkdir, readFile, rename, unlink, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.ts";

// Writes an IPA into the static 全能签/ESign/AltStore source served by nginx and
// updates appstore.json. Each app has one entry describing the latest version
// (全能签/ESign keys + AltStore keys) plus a `versions` history, newest first.

interface PublishInput {
  ipa: Buffer;
  icon: Buffer | null;
  bundleId: string;
  version: string; // semver, e.g. 0.2.0
  build: string; // CFBundleVersion
  name: string;
  minIos: string;
  notes: string;
  force: boolean; // allow re-publishing the same version
}

interface VersionRecord {
  version: string;
  buildVersion: string;
  date: string;
  localizedDescription: string;
  downloadURL: string;
  size: number;
  minOSVersion: string;
}

const SOURCE_META = {
  name: "tutu 自建源",
  identifier: "top.gugenzzz.apps",
  sourceURL: `${config.sourceBase}/appstore.json`,
  sourceicon: `${config.sourceBase}/icons/source.png`,
  iconURL: `${config.sourceBase}/icons/source.png`,
};

const KEEP_VERSIONS = 10;
const SAFE = /^[A-Za-z0-9._-]+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

export class PublishConflict extends Error {}

export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

export async function publishIpa(input: PublishInput): Promise<{ downUrl: string; versions: string[] }> {
  if (!SAFE.test(input.bundleId) || !SAFE.test(input.build)) throw new Error("bundleId/build contain unsafe characters");
  if (!SEMVER.test(input.version)) throw new Error(`version must be x.y.z, got ${input.version}`);

  const manifestPath = path.join(config.sourceRoot, "appstore.json");
  let data: { apps: Record<string, unknown>[]; news?: unknown[] } & Record<string, unknown>;
  try {
    data = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    data = { apps: [], news: [] };
  }
  const old = data.apps.find((a) => a.bundleId === input.bundleId);
  const history: VersionRecord[] = Array.isArray(old?.versions) ? (old.versions as VersionRecord[]) : [];
  // Entries published before version history existed: seed history from the flat fields.
  if (old && history.length === 0 && typeof old.version === "string" && SEMVER.test(old.version)) {
    history.push({
      version: old.version,
      buildVersion: "",
      date: String(old.versionDate ?? ""),
      localizedDescription: String(old.versionDescription ?? ""),
      downloadURL: String(old.downUrl ?? ""),
      size: Number(old.size ?? 0),
      minOSVersion: String(old.minIos ?? ""),
    });
  }

  const latest = history.filter((v) => SEMVER.test(v.version)).sort((a, b) => compareSemver(b.version, a.version))[0];
  if (latest) {
    const cmp = compareSemver(input.version, latest.version);
    if (cmp < 0) throw new PublishConflict(`version ${input.version} is older than published ${latest.version}`);
    if (cmp === 0 && !input.force) throw new PublishConflict(`version ${input.version} already published (pass force=1 to replace)`);
  }

  const appsDir = path.join(config.sourceRoot, "apps");
  const iconsDir = path.join(config.sourceRoot, "icons");
  await mkdir(appsDir, { recursive: true });
  await mkdir(iconsDir, { recursive: true });

  const fname = `${input.bundleId}-${input.version}.ipa`;
  await atomicWrite(path.join(appsDir, fname), input.ipa);
  let iconUrl = typeof old?.icon === "string" ? old.icon : "";
  if (input.icon) {
    await atomicWrite(path.join(iconsDir, `${input.bundleId}.png`), input.icon);
    iconUrl = `${config.sourceBase}/icons/${input.bundleId}.png`;
  }

  const downUrl = `${config.sourceBase}/apps/${fname}`;
  const now = new Date().toISOString();
  const record: VersionRecord = {
    version: input.version,
    buildVersion: input.build,
    date: now,
    localizedDescription: input.notes,
    downloadURL: downUrl,
    size: input.ipa.length,
    minOSVersion: input.minIos,
  };
  const versions = [record, ...history.filter((v) => v.version !== input.version)].sort((a, b) => compareSemver(b.version, a.version));
  const kept = versions.slice(0, KEEP_VERSIONS);
  for (const v of versions.slice(KEEP_VERSIONS)) {
    await unlink(path.join(appsDir, `${input.bundleId}-${v.version}.ipa`)).catch(() => {});
  }

  const entry = {
    name: input.name,
    type: "4",
    version: input.version,
    versionDate: now,
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
    versions: kept,
  };
  data = { ...data, ...SOURCE_META, apps: [...data.apps.filter((a) => a.bundleId !== input.bundleId), entry] };
  await atomicWrite(manifestPath, Buffer.from(JSON.stringify(data, null, 2)));
  return { downUrl, versions: kept.map((v) => v.version) };
}

async function atomicWrite(file: string, buf: Buffer): Promise<void> {
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, buf);
  await chmod(tmp, 0o644);
  await rename(tmp, file);
}
