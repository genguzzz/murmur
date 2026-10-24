// Permission gate used by every wrapper. The PermissionHost component registers a
// prompter that explains why before the system dialog; without it we ask directly.
import { accessOf, requestAccess, type Access, type PermissionKind } from "./permissions";
import { DeviceError, log } from "./core";
import { track } from "../track";

type Prompter = (kind: PermissionKind, state: "ask" | "denied", reason?: string) => Promise<boolean>;
let prompter: Prompter | null = null;

export function setPrompter(p: Prompter | null) {
  prompter = p;
}

// Resolves to the final access; `quiet` skips the explainer (for silent checks).
export async function ensureAccess(kind: PermissionKind, opts: { reason?: string; quiet?: boolean } = {}): Promise<Access> {
  const before = await accessOf(kind);
  if (before === "granted" || before === "limited") return before;
  if (opts.quiet) return before;
  if (before === "denied") {
    await prompter?.(kind, "denied", opts.reason);
    track("permission", { kind, result: "denied_before" });
    return "denied";
  }
  if (prompter && !(await prompter(kind, "ask", opts.reason))) {
    track("permission", { kind, result: "declined_explainer" });
    return "ask";
  }
  const after = await requestAccess(kind);
  log.info("permission", { kind, before, after });
  track("permission", { kind, result: after });
  return after;
}

// Same, but throws DeviceError("denied") so wrappers can stay linear.
export async function needAccess(kind: PermissionKind, reason?: string): Promise<void> {
  const a = await ensureAccess(kind, { reason });
  if (a !== "granted" && a !== "limited") throw new DeviceError("denied", `没有${kind}权限`);
}
