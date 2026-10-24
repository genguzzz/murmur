// Text-to-speech, and live on-device speech recognition (captions while talking).
// The Groq transcription of the saved audio stays the source of truth for entries.
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { needAccess } from "./access";
import { DeviceError, instrument, log, requireCapability } from "./core";
import { track } from "../track";

export function speak(text: string, opts: { rate?: number; language?: string } = {}): Promise<void> {
  return instrument("speak", async () => {
    requireCapability("speech");
    await Speech.stop();
    await new Promise<void>((resolve) => {
      Speech.speak(text, { language: opts.language ?? "zh-CN", rate: opts.rate ?? 1, onDone: resolve, onStopped: resolve, onError: () => resolve() });
    });
  });
}

export const stopSpeaking = () => Speech.stop();

export interface LiveTranscription {
  stop: () => void; // finish and deliver the final text
  abort: () => void; // discard
}

// Streams partial text while the user talks. Microphone + speech permissions are
// requested on first use. Only one session can run at a time (it shares the mic).
export async function liveTranscribe(opts: {
  language?: string;
  onText: (text: string, final: boolean) => void;
  onError?: (e: DeviceError) => void;
  onEnd?: () => void;
  onDevice?: boolean;
  reason?: string;
}): Promise<LiveTranscription> {
  return instrument("liveTranscribe", async () => {
    requireCapability("speechRecognition");
    await needAccess("microphone", opts.reason);
    await needAccess("speech", opts.reason);
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) throw new DeviceError("unavailable", "系统语音识别不可用");
    const t0 = Date.now();
    let chars = 0;
    const subs = [
      ExpoSpeechRecognitionModule.addListener("result", (e) => {
        const text = e.results[0]?.transcript ?? "";
        chars = text.length;
        opts.onText(text, e.isFinal);
      }),
      ExpoSpeechRecognitionModule.addListener("error", (e) => {
        log.warn("live transcription error", { error: e.error, message: e.message });
        opts.onError?.(new DeviceError(e.error === "not-allowed" ? "denied" : "failed", e.message));
      }),
      ExpoSpeechRecognitionModule.addListener("end", () => {
        subs.forEach((s) => s.remove());
        track("device.liveTranscribe.end", { ms: Date.now() - t0, chars });
        opts.onEnd?.();
      }),
    ];
    const onDevice = opts.onDevice ?? ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    ExpoSpeechRecognitionModule.start({ lang: opts.language ?? "zh-CN", interimResults: true, continuous: true, addsPunctuation: true, requiresOnDeviceRecognition: onDevice });
    return { stop: () => ExpoSpeechRecognitionModule.stop(), abort: () => ExpoSpeechRecognitionModule.abort() };
  });
}
