import { config } from "./config.ts";

export interface Transcript {
  text: string;
  language: string | null;
  duration: number | null;
  // Segments Whisper itself flagged as non-speech, dropped from `text`.
  droppedSegments: number;
}

interface Segment {
  text: string;
  no_speech_prob?: number;
  avg_logprob?: number;
}

// Whisper "hears" these on silence/noise (training-data artefacts from video outros).
const HALLUCINATIONS = [/请不吝点赞/, /订阅.*转发.*打赏/, /明镜与点点/, /字幕由.*提供/, /谢谢(大家)?观看/, /Thank you for watching/i];

function isHallucination(seg: Segment): boolean {
  if ((seg.no_speech_prob ?? 0) > 0.6 && (seg.avg_logprob ?? 0) < -0.7) return true;
  return HALLUCINATIONS.some((re) => re.test(seg.text));
}

// Groq Whisper (OpenAI-compatible audio endpoint). Audio is held in memory only
// for the duration of this request and never written to disk.
export async function transcribe(
  audio: Buffer,
  filename: string,
  mime: string,
  language?: string,
): Promise<Transcript> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), filename);
  form.append("model", config.groqModel);
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  if (language && language !== "auto") form.append("language", language);
  // A short prompt nudges Whisper towards simplified Chinese with punctuation.
  if (!language || language === "auto" || language === "zh") {
    form.append("prompt", "以下是普通话的日记录音，请使用简体中文和标点。");
  }

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.groqKey}` },
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new UpstreamError("groq", res.status, body.slice(0, 500));
  }
  const json = JSON.parse(body) as { text?: string; language?: string; duration?: number; segments?: Segment[] };
  const segments = json.segments ?? [];
  const kept = segments.filter((seg) => !isHallucination(seg));
  // CJK segments join without spaces; everything else with one.
  const sep = /chinese|japanese|^zh|^ja/i.test(json.language ?? "") ? "" : " ";
  const text = segments.length ? kept.map((seg) => seg.text.trim()).join(sep) : (json.text ?? "").trim();
  return {
    text,
    language: json.language ?? null,
    duration: json.duration ?? null,
    droppedSegments: segments.length - kept.length,
  };
}

export class UpstreamError extends Error {
  upstream: string;
  status: number;
  constructor(upstream: string, status: number, detail: string) {
    super(`${upstream} ${status}: ${detail}`);
    this.upstream = upstream;
    this.status = status;
  }
}
