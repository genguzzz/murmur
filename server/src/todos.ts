// To-dos from speech: decide whether a memo is a note or a task, turn tasks into
// dated reminders, and write the Home "today" brief that keeps them moving.
import { z } from "zod";
import { call, type ClaudeMeta } from "./claude.ts";

// ---------- intent: note vs. to-do ----------

const REPEATS = ["none", "daily", "weekdays", "weekly", "monthly"] as const;

const IntentSchema = z.object({
  kind: z.enum(["note", "todo", "mixed"]),
  todos: z.array(
    z.object({
      title: z.string(),
      note: z.string(),
      date: z.string(),
      time: z.string(),
      repeat: z.enum(REPEATS),
      priority: z.enum(["normal", "high"]),
      question: z.string(),
      options: z.array(z.object({ label: z.string(), date: z.string(), time: z.string() })),
    }),
  ),
  completes: z.array(z.object({ index: z.number(), reason: z.string() })),
  reply: z.string(),
});
export type Intent = z.infer<typeof IntentSchema>;

const option = {
  type: "object",
  additionalProperties: false,
  required: ["label", "date", "time"],
  properties: {
    label: { type: "string", description: "按钮文字，≤8 字，如『今晚 8 点』『明早 9 点』『周六上午』" },
    date: { type: "string", description: "YYYY-MM-DD" },
    time: { type: "string", description: "HH:MM，全天则留空" },
  },
};

const intentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "todos", "completes", "reply"],
  properties: {
    kind: { type: "string", enum: ["note", "todo", "mixed"] },
    todos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "note", "date", "time", "repeat", "priority", "question", "options"],
        properties: {
          title: { type: "string", description: "≤20 字，动词开头的具体动作，如『给妈妈打电话问体检结果』" },
          note: { type: "string", description: "补充细节（地点、对象、要带的东西、链接），没有就空字符串" },
          date: { type: "string", description: "YYYY-MM-DD；没提到日期就空字符串" },
          time: { type: "string", description: "HH:MM 24 小时制；只有日期或没有时间就空字符串" },
          repeat: { type: "string", enum: [...REPEATS] },
          priority: { type: "string", enum: ["normal", "high"], description: "用户强调『一定』『很重要』『截止』才用 high" },
          question: { type: "string", description: "需要确认时的一句追问，否则空字符串" },
          options: { type: "array", items: option, description: "追问的 2-3 个快捷答案；不追问就空数组" },
        },
      },
    },
    completes: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["index", "reason"], properties: { index: { type: "integer" }, reason: { type: "string" } } },
      description: "用户说已经做完的现有待办（index 来自 <open_todos>）",
    },
    reply: { type: "string", description: "一句简短确认，如『好，明天下午 3 点提醒你交报告。』；纯笔记时空字符串" },
  },
};

const INTENT_SYSTEM = `你是语音日记应用 Murmur 里的待办助手。用户说了一段话（语音转写，可能有错字），你判断它是想记下来的想法（笔记），还是要你记住并提醒的事（待办），然后把待办整理成可以直接创建的任务。

## 判断 kind
- todo：用户要你记住、提醒或跟踪一件将来要做的事。典型说法：提醒我…、记得…、别忘了…、帮我记一下…、明天要…、下周得…、加个待办…、X 点之前把…
- note：感受、经历、回顾、思考、吐槽、长期愿望（如『我想以后学吉他』）。话里顺带提到计划，但没有要人提醒的意思，也算 note。
- mixed：一段话里既有值得记下的想法，又有明确要跟进的事。
- 拿不准时选 note，不要把普通日记硬拆成任务。
- hint=todo 表示用户是在待办页里说的：只要有能执行的事就当 todo。

## 写待办
- 一件事一条，多件事拆开；同一件事只写一次。
- 和 <open_todos> 里已有的事重复就不要新建，在 reply 里提一句已经有了。
- title 用动词开头，写清对象，去掉『提醒我』『记得』这类词。
- 用户说已经做完了 <open_todos> 里的某件事，放进 completes。

## 解析时间（以 <now> 为准，按用户本地时间）
- 明天、后天、大后天按日期推算。『周五』『这周五』指本周五，已经过了就指下周五；『下周五』指下周的周五。
- 早上、上午 09:00；中午 12:00；下午 15:00；傍晚、下班后 18:30；晚上 20:00；睡前 22:30。『早上』如果 <defaults> 给了 morning 时间，用那个。
- 『X 小时后』『半小时后』用当前时间相加，取整到 5 分钟。
- 月底指当月最后一天，月初指下月 1 日。
- 只说了日期、没说时刻：time 留空，表示全天任务。
- 『每天』『工作日』『每周X』『每月X号』设置 repeat，date 填第一次发生的日期。
- 绝不给出已经过去的时间。

## 什么时候追问
只在答案会改变提醒效果时才问。每条待办最多一个问题，写进 question，并给 2-3 个具体的快捷答案放进 options。几个选项的日期时间必须互不相同。应用会自动加一个『不设时间』的选项，你不用写。
- 没有日期：问要不要定个时间，比如『要我什么时候提醒你？』。快捷答案按事情性质给，比如买东西给『今晚 8 点』『明天下班后』，工作给『明早 9 点』『明天下午』。
- 时间含糊（改天、有空、尽快、这周、过几天）：追问一个具体时间，并给出你的最佳猜测作为第一个选项，同时把它预填到 date/time。
- 时间已经过去，或者有歧义（如『8 点』在晚上 9 点说）：问清楚，并给出两种理解。
- 日期和时间都清楚时，question 留空、options 为空数组。

## 语气
reply 是一句简短、自然的确认，像靠谱的助理，不浮夸，不加表情。默认简体中文；用户主要说英文时用英文。`;

export interface IntentInput {
  text: string;
  now: string; // local wall time, e.g. "2026-10-24 15:20 周五"
  tz: string;
  hint: "auto" | "todo";
  openTodos: { index: number; title: string; due?: string }[];
  defaults: { morning: string; evening: string };
}

export async function detectIntent(input: IntentInput): Promise<{ intent: Intent; meta: ClaudeMeta }> {
  const open = input.openTodos.length ? input.openTodos.map((t) => `[${t.index}] ${t.title}${t.due ? `（${t.due}）` : ""}`).join("\n") : "（无）";
  const content =
    `<now>${input.now}（${input.tz}）</now>\n` +
    `<defaults>morning=${input.defaults.morning} evening=${input.defaults.evening}</defaults>\n` +
    `<hint>${input.hint}</hint>\n` +
    `<open_todos>\n${open}\n</open_todos>\n\n` +
    `<transcript>\n${input.text}\n</transcript>`;
  const { text, meta } = await call({ system: INTENT_SYSTEM, messages: [{ role: "user", content }], effort: "low", maxTokens: 8000, schema: intentJsonSchema });
  const intent = IntentSchema.parse(JSON.parse(text));
  // Guard against hallucinated indexes.
  intent.completes = intent.completes.filter((c) => input.openTodos.some((t) => t.index === c.index));
  return { intent, meta };
}

// ---------- Home brief ----------

const BriefSchema = z.object({
  headline: z.string(),
  body: z.string(),
  focus: z.array(z.object({ index: z.number(), why: z.string() })),
  nudges: z.array(z.object({ index: z.number(), text: z.string(), action: z.enum(["tomorrow", "done", "open", "split"]) })),
});
export type Brief = z.infer<typeof BriefSchema>;

const briefJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "body", "focus", "nudges"],
  properties: {
    headline: { type: "string", description: "≤16 字，今天最值得说的一句话" },
    body: { type: "string", description: "1-2 句，把待办和最近的记录联系起来，第二人称" },
    focus: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["index", "why"], properties: { index: { type: "integer" }, why: { type: "string", description: "≤20 字，为什么今天做它" } } },
      description: "今天最该推进的 1-3 件待办，按重要程度排序；没有待办就空数组",
    },
    nudges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "text", "action"],
        properties: {
          index: { type: "integer" },
          text: { type: "string", description: "≤30 字的跟进提醒，具体、不责备" },
          action: { type: "string", enum: ["tomorrow", "done", "open", "split"], description: "建议的操作：推到明天 / 可能已做完 / 打开看看 / 拆成小步" },
        },
      },
      description: "0-2 条：拖了很久、反复推迟、或日记里提到可能已经做完的待办",
    },
  },
};

const BRIEF_SYSTEM = `你是语音日记应用 Murmur 首页上的『今日回顾』。用户每次打开应用都会看到你写的这一小段。
你能看到用户的待办（含逾期天数、创建了多久、推迟次数）、最近完成的事和最近几条日记。
你的任务：帮用户看清今天该推进什么，并温和地跟进那些被搁置的事。
原则：
- 具体：直接点出待办的名字和日记里的事，不说空话。
- 克制：focus 最多 3 件，nudges 最多 2 条，只挑真正需要跟进的。
- 联系：如果日记里提到了和某个待办相关的情况（比如焦虑、已经做完、时间冲突），说出来。
- 不责备、不说教、不加表情；像一个了解你的朋友顺口提一句。
- 没有待办时，就根据最近的记录说一句有用的话，focus 和 nudges 都为空。
- index 只能用 <todos> 里给出的编号。默认简体中文。`;

export interface BriefInput {
  now: string;
  name?: string;
  todos: { index: number; title: string; due?: string; overdueDays?: number; ageDays: number; postponed?: number }[];
  done: { title: string; when: string }[];
  entries: { date: string; title: string; summary: string; mood?: string }[];
}

export async function briefFor(input: BriefInput): Promise<{ brief: Brief; meta: ClaudeMeta }> {
  const todos = input.todos.length
    ? input.todos
        .map((t) => `[${t.index}] ${t.title}｜${t.due ?? "未定时间"}${t.overdueDays ? `｜逾期 ${t.overdueDays} 天` : ""}｜创建于 ${t.ageDays} 天前${t.postponed ? `｜推迟过 ${t.postponed} 次` : ""}`)
        .join("\n")
    : "（无）";
  const done = input.done.length ? input.done.map((d) => `- ${d.when} ${d.title}`).join("\n") : "（无）";
  const entries = input.entries.length ? input.entries.map((e) => `- ${e.date}《${e.title}》${e.mood ? `[${e.mood}] ` : ""}${e.summary}`).join("\n") : "（无）";
  const content =
    `<now>${input.now}</now>${input.name ? `\n<name>${input.name}</name>` : ""}\n\n` +
    `<todos>\n${todos}\n</todos>\n\n<recently_done>\n${done}\n</recently_done>\n\n<recent_entries>\n${entries}\n</recent_entries>`;
  const { text, meta } = await call({ system: BRIEF_SYSTEM, messages: [{ role: "user", content }], effort: "low", maxTokens: 6000, schema: briefJsonSchema });
  const brief = BriefSchema.parse(JSON.parse(text));
  const valid = (i: number) => input.todos.some((t) => t.index === i);
  brief.focus = brief.focus.filter((f) => valid(f.index)).slice(0, 3);
  brief.nudges = brief.nudges.filter((n) => valid(n.index)).slice(0, 2);
  return { brief, meta };
}
