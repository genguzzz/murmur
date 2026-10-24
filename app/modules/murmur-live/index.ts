// JS side of the MurmurLive native module. Optional so OTA code running on a
// binary without the module (older runtime, web) just no-ops.
import { requireOptionalNativeModule } from "expo-modules-core";

export type LiveMode = "recording" | "recordingPaused" | "playing" | "playbackPaused";

export interface LiveState {
  mode: LiveMode;
  title: string;
  subtitle: string;
  anchor: number; // epoch seconds where the clock reads 0
  elapsed: number; // seconds shown while paused
  duration: number; // playback length, 0 while recording
}

interface MurmurLiveNative {
  isSupported(): boolean;
  start(kind: "record" | "play", state: LiveState): Promise<string>;
  update(id: string, state: LiveState): Promise<void>;
  end(id: string, state: LiveState | null, immediate: boolean): Promise<void>;
  endAll(): Promise<void>;
}

export default requireOptionalNativeModule<MurmurLiveNative>("MurmurLive");
