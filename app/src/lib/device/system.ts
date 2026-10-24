// Small system helpers: network state, locale/time zone, keep-awake, in-app browser.
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { getCalendars, getLocales } from "expo-localization";
import * as Network from "expo-network";
import * as WebBrowser from "expo-web-browser";
import { instrument } from "./core";
import { colors } from "../theme";

export async function isOnline(): Promise<boolean> {
  const s = await Network.getNetworkStateAsync();
  return !!s.isConnected && s.isInternetReachable !== false;
}

export function onNetworkChange(cb: (online: boolean, type: string) => void): () => void {
  const sub = Network.addNetworkStateListener((s) => cb(!!s.isConnected && s.isInternetReachable !== false, String(s.type)));
  return () => sub.remove();
}

export function locale(): { language: string; region: string | null; timeZone: string | null; uses24h: boolean } {
  const l = getLocales()[0];
  const c = getCalendars()[0];
  return { language: l?.languageTag ?? "zh-CN", region: l?.regionCode ?? null, timeZone: c?.timeZone ?? null, uses24h: c?.uses24hourClock ?? true };
}

// Keep the screen on during long recordings; pair every keepAwake with release.
export const keepAwake = (tag = "murmur") => activateKeepAwakeAsync(tag);
export const releaseAwake = (tag = "murmur") => deactivateKeepAwake(tag);

export function openInApp(url: string): Promise<void> {
  return instrument("openInApp", async () => {
    await WebBrowser.openBrowserAsync(url, { controlsColor: colors.primary, presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
  });
}
