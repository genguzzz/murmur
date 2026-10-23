import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "./config.ts";

// ANTHROPIC_API_KEY is read from the environment by the SDK.
const client = new Anthropic({ maxRetries: 2, timeout: 120_000 });

type Effort = "low" | "medium" | "high";

export interface ClaudeMeta {
  requestId: string | null;
  model: string;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  ms: number;
}

export class RefusalError extends Error {}

// One call shape for everything: Sonnet 5 with adaptive thinking,
// server-side refusal fallback, optional JSON-schema structured output.
async function call(opts: {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  effort: Effort;
  maxTokens: number;
  schema?: Record<string, unknown>;
}): Promise<{ text: string; meta: ClaudeMeta }> {
  const started = Date.now();
  const response = await client.beta.messages.create({
    model: config.claudeModel,
    max_tokens: opts.maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: opts.system,
    messages: opts.messages,
    output_config: {
      effort: opts.effort,
      ...(opts.schema ? { format: { type: "json_schema", schema: opts.schema } } : {}),
    },
  });
  const meta: ClaudeMeta = {
    requestId: response._request_id ?? null,
    model: response.model,
    stopReason: response.stop_reason,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    ms: Date.now() - started,
  };
  if (response.stop_reason === "refusal") {
    throw new RefusalError(`claude refused (${response.stop_details?.category ?? "unknown"})`);
  }
  const text = response.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("")
    .trim();
  return { text, meta };
}

// ---------- analyze one entry ----------

export const MOODS = [
  "joyful", "grateful", "hopeful", "calm", "neutral",
  "tired", "anxious", "sad", "frustrated", "angry",
] as const;

const AnalysisSchema = z.object({
  title: z.string(),
  summary: z.string(),
  cleaned_text: z.string(),
  mood: z.enum(MOODS),
  mood_label: z.string(),
  themes: z.array(z.string()),
  follow_up: z.string(),
  insight: z.string(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

const analysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "cleaned_text", "mood", "mood_label", "themes", "follow_up", "insight"],
  properties: {
    title: { type: "string", description: "≤16 个汉字的标题，概括这条记录的核心" },
    summary: { type: "string", description: "2-3 句，用第二人称“你”复述要点" },
    cleaned_text: { type: "string", description: "整理后的正文：去口头禅和重复，修正明显的转写错误，保留原意和语气，适当分段" },
    mood: { type: "string", enum: [...MOODS] },
    mood_label: { type: "string", description: "情绪的 2 字中文标签，如 平静、焦虑" },
    themes: { type: "array", items: { type: "string" }, description: "1-4 个简短主题标签" },
    follow_up: { type: "string", description: "一个温和、具体、开放的追问，帮助用户继续想下去" },
    insight: { type: "string", description: "结合最近记录看到的联系或模式，一两句；没有就返回空字符串" },
  },
};

const ANALYZE_SYSTEM = `你是一个私人语音日记应用里的整理助手。用户刚刚录了一段口述（已由语音识别转成文字，可能有错字、口头禅、重复）。
你的工作：把它整理成一条日记，并给出温和、具体的反馈。
原则：
- 忠实于用户说的内容，不编造，不说教，不给没被要求的建议。
- 语气像一个细心的朋友：简洁、真诚、不浮夸。
- 默认使用简体中文；如果用户主要说英文，就用英文输出。
- 追问只问一个问题，要具体到用户提到的事情。`;

export async function analyzeEntry(input: {
  text: string;
  prompt?: string;
  recent: { date: string; title: string; summary: string }[];
}): Promise<{ analysis: Analysis; meta: ClaudeMeta }> {
  const recent = input.recent.length
    ? input.recent.map((r) => `- ${r.date}《${r.title}》${r.summary}`).join("\n")
    : "（暂无）";
  const content =
    `<recent_entries>\n${recent}\n</recent_entries>\n\n` +
    (input.prompt ? `<prompt_user_answered>${input.prompt}</prompt_user_answered>\n\n` : "") +
    `<transcript>\n${input.text}\n</transcript>`;
  const { text, meta } = await call({
    system: ANALYZE_SYSTEM,
    messages: [{ role: "user", content }],
    effort: "low",
    maxTokens: 16000,
    schema: analysisJsonSchema,
  });
  return { analysis: AnalysisSchema.parse(JSON.parse(text)), meta };
}

// ---------- patterns across entries ----------

const InsightsSchema = z.object({
  headline: z.string(),
  body: z.string(),
  patterns: z.array(z.object({ title: z.string(), detail: z.string() })),
  suggestion: z.string(),
});
export type Insights = z.infer<typeof InsightsSchema>;

const insightsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "body", "patterns", "suggestion"],
  properties: {
    headline: { type: "string", description: "≤14 字的标题" },
    body: { type: "string", description: "3-5 句总体观察，第二人称" },
    patterns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail"],
        properties: { title: { type: "string" }, detail: { type: "string" } },
      },
      description: "2-5 个反复出现的主题、情绪变化或矛盾，每个引用具体记录",
    },
    suggestion: { type: "string", description: "一个可以接下来记录或思考的方向（不是说教）" },
  },
};

export interface EntryContext {
  date: string;
  title: string;
  summary: string;
  mood?: string;
  themes?: string[];
  text?: string;
}

function entriesBlock(entries: EntryContext[], withText: boolean): string {
  return entries
    .map((e) => {
      const head = `## ${e.date}《${e.title}》${e.mood ? ` 情绪:${e.mood}` : ""}${e.themes?.length ? ` 主题:${e.themes.join("、")}` : ""}`;
      return withText && e.text ? `${head}\n摘要：${e.summary}\n正文：${e.text}` : `${head}\n${e.summary}`;
    })
    .join("\n\n");
}

export async function insightsFor(entries: EntryContext[]): Promise<{ insights: Insights; meta: ClaudeMeta }> {
  const { text, meta } = await call({
    system: `${ANALYZE_SYSTEM}\n现在你要看用户的全部日记，找出跨条目的模式。`,
    messages: [{ role: "user", content: `<entries>\n${entriesBlock(entries, false)}\n</entries>` }],
    effort: "medium",
    maxTokens: 16000,
    schema: insightsJsonSchema,
  });
  return { insights: InsightsSchema.parse(JSON.parse(text)), meta };
}

// ---------- chat over the journal ----------

export async function chat(input: {
  messages: { role: "user" | "assistant"; content: string }[];
  entries: EntryContext[];
}): Promise<{ reply: string; meta: ClaudeMeta }> {
  const system =
    `你是用户私人语音日记里的对话伙伴。你可以读到用户的日记（见 <journal>），基于这些内容陪用户聊天、回顾、梳理想法。` +
    `回答简洁自然，像朋友聊天；引用日记时说明是哪天哪条；不知道就直说，不编造日记里没有的内容。默认简体中文。\n\n` +
    `<journal>\n${entriesBlock(input.entries, true) || "（还没有日记）"}\n</journal>`;
  const { text, meta } = await call({
    system,
    messages: input.messages,
    effort: "medium",
    maxTokens: 16000,
  });
  return { reply: text, meta };
}
