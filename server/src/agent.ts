// The Murmur agent: one multi-turn tool loop behind both entry points.
//  - capture: what the user just said (or typed) from Home. Decide journal / to-do /
//    chat / pending, change to-dos, then write the entry analysis or answer in chat.
//  - chat: one turn of a conversation. Reads the journal, searches the web, changes
//    to-dos, saves notes.
// The phone owns the data, so the loop runs against a copy sent with the request: tool
// calls change that copy and are reported as ops, which the app applies together at
// the end (one undo). Progress streams to the app as NDJSON events.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { analyzeEntry, client, RefusalError, type Analysis } from "./claude.ts";
import { config } from "./config.ts";
import { APP_GUIDE } from "./guide.ts";
import { ASK_RULES, TIME_RULES } from "./todos.ts";

type Msg = Anthropic.Beta.BetaMessageParam;
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

const REPEATS = ["none", "daily", "weekdays", "weekly", "monthly"] as const;
const ROUTES = ["journal", "todo", "chat", "pending"] as const;
type Route = (typeof ROUTES)[number];

// ---------- request ----------

const TodoIn = z.object({
  id: z.string(),
  title: z.string(),
  note: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  repeat: z.enum(REPEATS).default("none"),
  priority: z.enum(["normal", "high"]).default("normal"),
  done: z.boolean().default(false),
});

const EntryIn = z.object({
  id: z.string(),
  date: z.string(),
  title: z.string(),
  summary: z.string(),
  mood: z.string().optional(),
  themes: z.array(z.string()).optional(),
  text: z.string().optional(),
});

export const AgentRequest = z.object({
  mode: z.enum(["capture", "chat"]),
  now: z.string().min(1), // wall time in the app zone, e.g. "2026-10-24 15:20 周六"
  tz: z.string().default(""),
  name: z.string().optional(),
  defaults: z.object({ morning: z.string(), evening: z.string() }).default({ morning: "09:00", evening: "20:00" }),
  todos: z.array(TodoIn).max(300).default([]),
  entries: z.array(EntryIn).max(500).default([]), // newest first
  // capture
  transcript: z.string().optional(),
  source: z.enum(["voice", "text"]).default("voice"),
  hint: z.enum(["auto", "todo", "journal"]).default("auto"),
  prompt: z.string().optional(),
  threadId: z.string().optional(),
  // chat
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) })).default([]),
});
export type AgentRequest = z.infer<typeof AgentRequest>;
type TodoIn = z.infer<typeof TodoIn>;

// ---------- output ----------

interface DraftTodo {
  title: string;
  note: string;
  date: string;
  time: string;
  repeat: (typeof REPEATS)[number];
  priority: "normal" | "high";
}
type TodoPatch = Partial<DraftTodo>;

export type Op =
  | { op: "todo.create"; ref: string; todo: DraftTodo; ask?: { question: string; options: { label: string; date: string; time: string }[] } }
  | { op: "todo.update"; id: string; patch: TodoPatch }
  | { op: "todo.complete"; id: string }
  | { op: "todo.reopen"; id: string }
  | { op: "todo.delete"; id: string }
  | { op: "entry.create"; text: string };

export interface AgentResult {
  route?: Route;
  continues?: string;
  title?: string; // chat title for capture → chat
  pending?: { title: string; reason: string };
  reply: string;
  ops: Op[];
  analysis?: Analysis;
}

export type AgentEvent =
  | { t: "step"; id: string; label: string; state: "run" | "done" | "fail" }
  | { t: "route"; route: Route; continues: string; title: string }
  | { t: "text"; delta: string }
  | { t: "done"; result: AgentResult }
  | { t: "error"; code: string; message: string };

export type Emit = (ev: AgentEvent) => void;

export interface AgentMeta {
  turns: number;
  tools: string[];
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  ms: number;
}

// ---------- tools ----------

const str = (description: string) => ({ type: "string", description });
const optionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "date", "time"],
  properties: { label: str("按钮文字，≤8 字，如『今晚 8 点』"), date: str("YYYY-MM-DD"), time: str("HH:MM，全天留空") },
};
const todoFields = {
  title: str("≤20 字，动词开头的具体动作"),
  note: str("补充细节，没有就省略"),
  date: str("YYYY-MM-DD；空字符串表示不定日期"),
  time: str("HH:MM 24 小时制；空字符串表示全天"),
  repeat: { type: "string", enum: [...REPEATS] },
  priority: { type: "string", enum: ["normal", "high"], description: "用户强调『一定』『很重要』『截止』才用 high" },
};

const TOOL_DEFS = {
  read_entries: {
    description: "读取日记原文。<journal> 里只有摘要；需要细节、引用原话或判断是不是某条的后续时调用。一次最多 6 条。",
    input_schema: { type: "object", additionalProperties: false, required: ["ids"], properties: { ids: { type: "array", items: { type: "string" }, description: "<journal> 里的 id" } } },
  },
  search_entries: {
    description: "按关键词在全部日记（含 <journal> 没列出的更早记录）里找相关条目，返回 id、日期、标题和摘要。",
    input_schema: { type: "object", additionalProperties: false, required: ["query"], properties: { query: str("关键词，多个用空格分开") } },
  },
  create_todo: {
    description: "新建一条待办。时间不清楚时带上 question 和 options，应用会在待办上显示快捷选项。",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["title"],
      properties: { ...todoFields, question: str("需要确认时间时的一句追问，否则省略"), options: { type: "array", items: optionSchema, description: "追问的 2-3 个快捷答案" } },
    },
  },
  update_todo: {
    description: "修改已有待办（改时间、改标题、改重复等），只传要改的字段。date 传空字符串表示改成不定日期。",
    input_schema: { type: "object", additionalProperties: false, required: ["id"], properties: { id: str("<todos> 里的 id，或 create_todo 返回的 id"), ...todoFields } },
  },
  complete_todo: {
    description: "把待办标记为完成（重复待办会顺延到下一次）。",
    input_schema: { type: "object", additionalProperties: false, required: ["id"], properties: { id: str("待办 id") } },
  },
  reopen_todo: {
    description: "把 <recently_done> 里已完成的待办重新打开。",
    input_schema: { type: "object", additionalProperties: false, required: ["id"], properties: { id: str("待办 id") } },
  },
  delete_todo: {
    description: "删除待办。只在用户明确说不用做了、取消、删掉时使用。",
    input_schema: { type: "object", additionalProperties: false, required: ["id"], properties: { id: str("待办 id") } },
  },
  save_entry: {
    description: "把一段内容存成一条新的日记（用户在对话里要你『记下来』『存一条』时用）。text 用用户的口吻写，忠实于他说的内容。",
    input_schema: { type: "object", additionalProperties: false, required: ["text"], properties: { text: str("要存的内容") } },
  },
  finish: {
    description: "处理完后调用，告诉应用这段话的去向。可以和其他工具在同一轮里一起调用。",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["route", "continues", "reply", "title", "pending_reason"],
      properties: {
        route: { type: "string", enum: [...ROUTES] },
        continues: str("这段话是哪条日记的后续（<journal> 里的 id），不是就空字符串"),
        reply: str("一句简短确认，说清你做了什么；chat/pending 时空字符串"),
        title: str("route=chat 时对话标题（≤12 字），route=pending 时卡片标题（如『这像是一次试录』），否则空字符串"),
        pending_reason: str("route=pending 时一句话说明为什么没处理（第二人称），否则空字符串"),
      },
    },
  },
} as const;

type ToolName = keyof typeof TOOL_DEFS;

function tools(names: ToolName[], webSearch: boolean): Anthropic.Beta.BetaToolUnion[] {
  const list: Anthropic.Beta.BetaToolUnion[] = names.map((name) => ({ name, ...TOOL_DEFS[name] }) as Anthropic.Beta.BetaTool);
  if (webSearch) list.push({ type: "web_search_20260209", name: "web_search", max_uses: 3 });
  return list;
}

const TodoArgs = z.object({
  title: z.string().optional(),
  note: z.string().optional(),
  date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional(),
  time: z.string().regex(/^(\d{2}:\d{2})?$/).optional(),
  repeat: z.enum(REPEATS).optional(),
  priority: z.enum(["normal", "high"]).optional(),
});
const Args = {
  read_entries: z.object({ ids: z.array(z.string()).max(6) }),
  search_entries: z.object({ query: z.string().min(1) }),
  create_todo: TodoArgs.extend({
    title: z.string().min(1),
    question: z.string().optional(),
    options: z.array(z.object({ label: z.string(), date: z.string(), time: z.string() })).max(3).optional(),
  }),
  update_todo: TodoArgs.extend({ id: z.string() }),
  complete_todo: z.object({ id: z.string() }),
  reopen_todo: z.object({ id: z.string() }),
  delete_todo: z.object({ id: z.string() }),
  save_entry: z.object({ text: z.string().min(1) }),
  finish: z.object({ route: z.enum(ROUTES), continues: z.string(), reply: z.string(), title: z.string(), pending_reason: z.string() }),
};

// ---------- working copy ----------

class Workspace {
  todos = new Map<string, TodoIn>();
  ops: Op[] = [];
  private seq = 0;
  readonly req: AgentRequest;
  constructor(req: AgentRequest) {
    this.req = req;
    for (const t of req.todos) this.todos.set(t.id, { ...t });
  }

  entry(id: string) {
    return this.req.entries.find((e) => e.id === id);
  }

  createTodo(a: z.infer<typeof Args.create_todo>): string {
    const ref = `new${++this.seq}`;
    const todo: DraftTodo = {
      title: a.title.trim(),
      note: a.note?.trim() ?? "",
      date: a.date ?? "",
      time: a.date ? (a.time ?? "") : "",
      repeat: a.date ? (a.repeat ?? "none") : "none",
      priority: a.priority ?? "normal",
    };
    const options = (a.options ?? []).filter((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.date));
    this.ops.push({ op: "todo.create", ref, todo, ...(a.question && options.length ? { ask: { question: a.question, options } } : {}) });
    this.todos.set(ref, { id: ref, ...todo, done: false });
    return ref;
  }

  // Changes to a to-do created in this run fold into its create op.
  updateTodo(id: string, patch: TodoPatch) {
    const create = this.ops.find((o): o is Extract<Op, { op: "todo.create" }> => o.op === "todo.create" && o.ref === id);
    if (create) {
      Object.assign(create.todo, patch);
      if (patch.date !== undefined || patch.time !== undefined) delete create.ask;
    } else {
      const prev = this.ops.find((o): o is Extract<Op, { op: "todo.update" }> => o.op === "todo.update" && o.id === id);
      if (prev) Object.assign(prev.patch, patch);
      else this.ops.push({ op: "todo.update", id, patch });
    }
    const t = this.todos.get(id)!;
    this.todos.set(id, { ...t, ...patch } as TodoIn);
  }

  removeTodo(id: string) {
    const created = this.ops.findIndex((o) => o.op === "todo.create" && o.ref === id);
    if (created >= 0) this.ops.splice(created, 1);
    else {
      this.ops = this.ops.filter((o) => !("id" in o && o.id === id));
      this.ops.push({ op: "todo.delete", id });
    }
    this.todos.delete(id);
  }
}

function todoLine(t: TodoIn): string {
  const when = t.date ? `${t.date}${t.time ? ` ${t.time}` : "（全天）"}` : "未定时间";
  return `[${t.id}] ${t.title}｜${when}${t.repeat !== "none" ? `｜重复:${t.repeat}` : ""}${t.priority === "high" ? "｜重要" : ""}${t.note ? `｜备注:${t.note}` : ""}`;
}

// Context the model sees in the system prompt (cached across loop turns).
function contextBlock(req: AgentRequest): string {
  const open = req.todos.filter((t) => !t.done);
  const done = req.todos.filter((t) => t.done).slice(0, 15);
  const journal = req.entries.slice(0, 60).map((e) => `[${e.id}] ${e.date}《${e.title}》${e.mood ? `[${e.mood}] ` : ""}${e.summary}`);
  const older = req.entries.length - journal.length;
  return (
    `<now>${req.now}（${req.tz || "本地时间"}）</now>\n` +
    `<defaults>morning=${req.defaults.morning} evening=${req.defaults.evening}</defaults>\n` +
    (req.name ? `<user_name>${req.name}</user_name>\n` : "") +
    `<todos>\n${open.map(todoLine).join("\n") || "（无）"}\n</todos>\n` +
    `<recently_done>\n${done.map(todoLine).join("\n") || "（无）"}\n</recently_done>\n` +
    `<journal>（新的在前${older > 0 ? `；还有 ${older} 条更早的，用 search_entries 找` : ""}）\n${journal.join("\n") || "（还没有日记）"}\n</journal>`
  );
}

const CAPTURE_SYSTEM = `你是语音日记应用 Murmur 的大脑。用户在首页说了一段话（语音转写，可能有错字）或打了一段字。你判断他想做什么，用工具把事情办完，最后调用 finish。

## 四种去向（finish.route）
- journal：值得记下来的经历、感受、想法、复盘、对计划的思考。大多数日记式的话都是这个。话里顺带要你提醒或修改的事，照样用待办工具处理，route 仍是 journal。
- todo：只是让你新建、修改、完成或删除待办（"提醒我…""把…改到周五""…做完了""…不用做了"），除此之外没有值得记进日记的内容。
- chat：用户在问你问题、请你帮忙查、想、写，或想跟你聊（"你觉得…""帮我查一下…""我上周都说了什么""…怎么办""这个功能怎么用"）。他要的是回答，不是记录。finish 之后会有对话助手接着回答，你不用回答，title 写对话标题。
- pending：拿不准——试录音（"喂喂""测试一下"）、只有零星几个字、听不清、明显没说完，或看不出想干什么。title 写卡片标题，pending_reason 用一句话说明为什么先放着。
拿不准 journal 还是 todo 时选 journal；拿不准是不是 chat 时，看他是不是在等你回答。
<hint>todo</hint>：用户是在待办页说的，倾向 todo。<hint>journal</hint>：用户在写日记或回答追问，倾向 journal。
有 <adding_to> 时，用户是在给那条记录补充后续：通常 route=journal，continues 填它的 id。

## continues
用户明确在说之前某条记录的后续（"上次说的…有进展了""接着昨天那件事"），并且 <journal> 里能对上，就把那条的 id 填进 continues；否则空字符串。

## 待办
- 修改已有待办用 <todos> 里的 id。说的事和已有待办是同一件，就修改它，不要新建重复的。
- "改到、推迟、提前、换成" → update_todo；"做完了、搞定了" → complete_todo；"不用了、取消、删掉" → delete_todo。只有用户明确表示才删除。
- 新建时 title 动词开头、写清对象，去掉"提醒我""记得"这类词。一件事一条。

${TIME_RULES}

${ASK_RULES}

## 效率
能一次做完就在同一轮里并行调用所有需要的工具，包括 finish。只有确实需要看旧记录原文（比如判断是不是某条的后续）时才用 read_entries。

## finish.reply
一句简短确认，说清你做了什么，如『记下了，顺手把交报告改到周五下午 3 点。』。没做任何待办改动的 journal 可以留空。不加表情。默认简体中文；用户主要说英文时用英文。`;

const CHAT_SYSTEM = `你是 Murmur 里的助手，用户私人语音日记和待办的伙伴。你可以：
- 陪用户聊天、回顾和梳理想法。<journal> 里只有摘要，需要原文时用 read_entries 或 search_entries；引用时说明是哪天哪条，不编造日记里没有的内容。
- 当普通助手回答问题。需要最新或事实性的信息时用 web_search，不要每个问题都查。
- 管理待办：新建、修改（时间、标题、重复…）、完成、删除，用 <todos> 里的 id。用户明确要求才删除；指代不清时先问清楚再改。
- 用户要你"记下来""存一条记录"时用 save_entry。
- 用户问 Murmur 本身怎么用、某个功能在哪、会发生什么时，按 <app_guide> 回答。
改完待办或存了记录后，用一句话告诉用户改了什么（应用会给他撤销按钮）。
回答简洁自然，像朋友聊天；可以用短列表，不用标题。默认简体中文；用户说英文就用英文。

${TIME_RULES}

${ASK_RULES}

${APP_GUIDE}`;

// ---------- loop ----------

const ROUTE_LABEL: Record<Route, string> = {
  journal: "这是一段记录",
  todo: "这是关于待办的",
  chat: "这是个问题，去对话里回答",
  pending: "没听出要做什么，先放着",
};

function short(s: string, n = 14) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function searchEntries(req: AgentRequest, query: string) {
  const terms = query.split(/[\s,，、]+/).filter(Boolean);
  const scored = req.entries.map((e) => {
    const hay = `${e.title} ${e.summary} ${e.themes?.join(" ") ?? ""} ${e.text ?? ""}`;
    let score = 0;
    for (const term of terms) {
      if (hay.includes(term)) score += 3;
      else if (term.length >= 2) {
        // Chinese has no spaces: partial credit for shared two-character chunks.
        for (let i = 0; i < term.length - 1; i++) if (hay.includes(term.slice(i, i + 2))) score += 1;
      }
    }
    return { e, score };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ e }) => ({ id: e.id, date: e.date, title: e.title, summary: e.summary }));
}

interface Loop {
  ws: Workspace;
  emit: Emit;
  meta: AgentMeta;
  stepSeq: number;
}

function step(loop: Loop, label: string, state: "run" | "done" | "fail" = "done", id?: string): string {
  const sid = id ?? `s${++loop.stepSeq}`;
  loop.emit({ t: "step", id: sid, label, state });
  return sid;
}

type Finish = z.infer<typeof Args.finish>;

// Runs one tool call against the working copy. Returns the tool_result content.
function runTool(loop: Loop, name: string, input: unknown): { content: string; isError?: boolean; finish?: Finish } {
  const { ws } = loop;
  if (!(name in Args)) return { content: `unknown tool ${name}`, isError: true };
  const parsed = Args[name as keyof typeof Args].safeParse(input);
  if (!parsed.success) return { content: `参数不对：${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, isError: true };
  const a = parsed.data as never;
  const todoOr = (id: string) => ws.todos.get(id);
  switch (name as ToolName) {
    case "read_entries": {
      const { ids } = a as z.infer<typeof Args.read_entries>;
      const found = ids.map((id) => ws.entry(id)).filter((e) => !!e);
      step(loop, found.length ? `翻看${found.map((e) => `《${short(e.title, 10)}》`).join("")}` : "翻看记录");
      if (!found.length) return { content: "没有这些 id 的记录", isError: true };
      return { content: found.map((e) => `## [${e.id}] ${e.date}《${e.title}》\n${(e.text || e.summary).slice(0, 3000)}`).join("\n\n") };
    }
    case "search_entries": {
      const { query } = a as z.infer<typeof Args.search_entries>;
      step(loop, `在记录里找「${short(query, 10)}」`);
      const hits = searchEntries(ws.req, query);
      return { content: hits.length ? JSON.stringify(hits) : "没有找到相关记录" };
    }
    case "create_todo": {
      const args = a as z.infer<typeof Args.create_todo>;
      const id = ws.createTodo(args);
      step(loop, `新建待办「${short(args.title)}」`);
      return { content: JSON.stringify({ ok: true, id }) };
    }
    case "update_todo": {
      const { id, ...patch } = a as z.infer<typeof Args.update_todo>;
      const t = todoOr(id);
      if (!t) return { content: `没有 id 为 ${id} 的待办`, isError: true };
      if (patch.date === "") patch.time = "";
      ws.updateTodo(id, patch);
      step(loop, `修改待办「${short(patch.title ?? t.title)}」`);
      return { content: JSON.stringify({ ok: true }) };
    }
    case "complete_todo":
    case "reopen_todo":
    case "delete_todo": {
      const { id } = a as { id: string };
      const t = todoOr(id);
      if (!t) return { content: `没有 id 为 ${id} 的待办`, isError: true };
      if (name === "delete_todo") {
        ws.removeTodo(id);
        step(loop, `删除待办「${short(t.title)}」`);
      } else if (id.startsWith("new")) {
        return { content: "刚新建的待办不能在同一轮里完成或重开", isError: true };
      } else {
        ws.ops.push(name === "complete_todo" ? { op: "todo.complete", id } : { op: "todo.reopen", id });
        ws.todos.set(id, { ...t, done: name === "complete_todo" });
        step(loop, `${name === "complete_todo" ? "完成" : "重新打开"}「${short(t.title)}」`);
      }
      return { content: JSON.stringify({ ok: true }) };
    }
    case "save_entry": {
      const { text } = a as z.infer<typeof Args.save_entry>;
      ws.ops.push({ op: "entry.create", text });
      step(loop, "存成一条记录");
      return { content: JSON.stringify({ ok: true }) };
    }
    case "finish":
      return { content: "ok", finish: a as Finish };
  }
}

// Generic tool loop. Streams text when `onText` is given. Stops after `finish`.
async function runLoop(loop: Loop, opts: {
  system: string;
  messages: Msg[];
  tools: Anthropic.Beta.BetaToolUnion[];
  effort: "low" | "medium";
  maxTokens: number;
  maxTurns: number;
  onText?: (delta: string) => void;
  thinkingLabel: string;
}): Promise<{ text: string; finish?: Finish }> {
  const messages = [...opts.messages];
  let text = "";
  for (let turn = 0; turn < opts.maxTurns; turn++) {
    const think = turn === 0 ? step(loop, opts.thinkingLabel, "run") : null;
    let searching: string | null = null;
    const stream = client.beta.messages.stream({
      model: config.claudeModel,
      max_tokens: opts.maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages,
      tools: opts.tools,
      output_config: { effort: opts.effort },
    });
    stream.on("streamEvent", (ev) => {
      if (ev.type === "content_block_start" && ev.content_block.type === "server_tool_use" && !searching) searching = step(loop, "上网查一查", "run");
    });
    if (opts.onText) {
      let first = true;
      stream.on("text", (delta) => {
        if (first && text) opts.onText!("\n\n");
        first = false;
        opts.onText!(delta);
      });
    }
    const msg = await stream.finalMessage();
    loop.meta.turns += 1;
    loop.meta.inputTokens += msg.usage.input_tokens;
    loop.meta.outputTokens += msg.usage.output_tokens;
    loop.meta.cacheRead += msg.usage.cache_read_input_tokens ?? 0;
    if (think) step(loop, opts.thinkingLabel, "done", think);
    if (msg.stop_reason === "refusal") throw new RefusalError("claude refused");

    const turnText = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    if (turnText) text = text ? `${text}\n\n${turnText}` : turnText;
    for (const b of msg.content) {
      if (b.type === "server_tool_use") {
        const q = (b.input as { query?: string }).query;
        loop.meta.tools.push("web_search");
        step(loop, q ? `上网查「${short(q, 12)}」` : "上网查一查", "done", searching ?? undefined);
        searching = null;
      }
    }

    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (!uses.length) return { text };
    if (msg.stop_reason === "max_tokens") throw new Error("tool input truncated (max_tokens)");

    const results: ToolResult[] = [];
    let finish: Finish | undefined;
    for (const u of uses) {
      loop.meta.tools.push(u.name);
      const r = runTool(loop, u.name, u.input);
      if (r.finish) finish = r.finish;
      results.push({ type: "tool_result", tool_use_id: u.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
    }
    if (finish) return { text, finish };
    messages.push({ role: "assistant", content: msg.content }, { role: "user", content: results });
  }
  return { text };
}

// ---------- entry points ----------

export async function runAgent(req: AgentRequest, emit: Emit): Promise<{ result: AgentResult; meta: AgentMeta }> {
  const started = Date.now();
  const loop: Loop = { ws: new Workspace(req), emit, meta: { turns: 0, tools: [], inputTokens: 0, outputTokens: 0, cacheRead: 0, ms: 0 }, stepSeq: 0 };
  const result = req.mode === "capture" ? await capture(loop, req) : await chatTurn(loop, req, req.messages);
  loop.meta.ms = Date.now() - started;
  return { result, meta: loop.meta };
}

async function chatTurn(loop: Loop, req: AgentRequest, history: { role: "user" | "assistant"; content: string }[], label = "想一想"): Promise<AgentResult> {
  // The API needs alternating turns starting with the user.
  const messages: Msg[] = [];
  for (const m of history) {
    const last = messages[messages.length - 1];
    if (last && last.role === m.role) last.content = `${last.content as string}\n\n${m.content}`;
    else if (messages.length || m.role === "user") messages.push({ role: m.role, content: m.content });
  }
  if (!messages.length) throw Object.assign(new Error("empty conversation"), { statusCode: 400 });
  const { text } = await runLoop(loop, {
    system: `${CHAT_SYSTEM}\n\n${contextBlock(req)}`,
    messages,
    tools: tools(["read_entries", "search_entries", "create_todo", "update_todo", "complete_todo", "reopen_todo", "delete_todo", "save_entry"], true),
    effort: "medium",
    maxTokens: 12000,
    maxTurns: 8,
    onText: (delta) => loop.emit({ t: "text", delta }),
    thinkingLabel: label,
  });
  return { reply: text || "（我这次没想好怎么回答，换个说法再问我一次？）", ops: loop.ws.ops };
}

async function capture(loop: Loop, req: AgentRequest): Promise<AgentResult> {
  const transcript = req.transcript?.trim();
  if (!transcript) throw Object.assign(new Error("missing transcript"), { statusCode: 400 });
  const thread = req.threadId ? loop.ws.entry(req.threadId) : undefined;
  const content =
    `<hint>${req.hint}</hint>\n<source>${req.source === "voice" ? "语音" : "文字"}</source>\n` +
    (req.prompt ? `<prompt_user_answered>${req.prompt}</prompt_user_answered>\n` : "") +
    (thread ? `<adding_to>[${thread.id}] ${thread.date}《${thread.title}》${thread.summary}</adding_to>\n` : "") +
    `<transcript>\n${transcript}\n</transcript>`;
  const { finish } = await runLoop(loop, {
    system: `${CAPTURE_SYSTEM}\n\n${contextBlock(req)}`,
    messages: [{ role: "user", content }],
    tools: tools(["read_entries", "search_entries", "create_todo", "update_todo", "complete_todo", "reopen_todo", "delete_todo", "finish"], false),
    effort: "low",
    maxTokens: 6000,
    maxTurns: 5,
    thinkingLabel: "理解你说的话",
  });

  // No finish (ran out of turns): keep it as a journal entry rather than lose it.
  const hasOps = loop.ws.ops.length > 0;
  let route: Route = finish?.route ?? (req.hint === "todo" && hasOps ? "todo" : "journal");
  if (route === "todo" && !hasOps) route = req.hint === "todo" ? "pending" : "journal";
  const continuesId = finish?.continues && loop.ws.entry(finish.continues) ? finish.continues : (thread?.id ?? "");
  const title = finish?.title ?? "";
  step(loop, ROUTE_LABEL[route]);
  loop.emit({ t: "route", route, continues: continuesId, title });
  const base = { route, continues: continuesId, reply: finish?.reply ?? "", ops: loop.ws.ops };

  if (route === "chat") {
    const answer = await chatTurn(loop, req, [{ role: "user", content: transcript }], "想想怎么回答");
    return { ...base, title: title || short(transcript, 12), reply: answer.reply, ops: loop.ws.ops };
  }
  if (route === "pending") {
    return { ...base, pending: { title: title || "这条先放着", reason: finish?.pending_reason || (req.hint === "todo" ? "没听出要记什么待办。" : "没听出你想记录还是想问什么。") } };
  }
  if (route === "todo") return base;

  const writing = step(loop, "整理成日记", "run");
  const parent = continuesId ? loop.ws.entry(continuesId) : undefined;
  const recent = req.entries.slice(0, 8).map((e) => ({ date: e.date, title: e.title, summary: e.summary }));
  const { analysis } = await analyzeEntry({ text: transcript, prompt: req.prompt, recent, ...(parent ? { thread: { date: parent.date, title: parent.title, summary: parent.summary } } : {}) });
  step(loop, `整理成日记《${short(analysis.title)}》`, "done", writing);
  return { ...base, analysis };
}
