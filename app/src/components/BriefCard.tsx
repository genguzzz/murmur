import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { Checkbox, TodoMeta } from "./TodoRow";
import { Card, tap, toast } from "./ui";
import { describeError } from "@/lib/api";
import { logger } from "@/lib/log";
import { briefKey, completeTodo, postponeTodo, refreshBrief, reopenTodo, useStore } from "@/lib/store";
import { todayTodos, type Todo } from "@/lib/todo";
import { colors, fonts } from "@/lib/theme";

const log = logger("brief");
const ACTION_LABEL = { tomorrow: "推到明天", done: "已经做完", open: "看看", split: "拆成小步" } as const;

// Top of Home: the model's take on today — what to push forward, and gentle
// follow-ups on to-dos that have been sitting. Falls back to a plain list offline.
export function BriefCard() {
  const router = useRouter();
  const brief = useStore((s) => s.brief);
  const todos = useStore((s) => s.todos);
  const allDay = useStore((s) => s.settings.todoAllDayTime);
  const hasToken = useStore((s) => !!s.settings.token);
  const hasJournal = useStore((s) => s.entries.some((e) => e.status === "done"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastTry = useRef(0);

  const byId = useMemo(() => new Map(todos.map((t) => [t.id, t])), [todos]);
  const today = useMemo(() => todayTodos(todos, allDay), [todos, allDay]);
  const openCount = useMemo(() => todos.filter((t) => !t.doneAt).length, [todos]);

  const refresh = useCallback(async (manual: boolean) => {
    if (!hasToken || (!openCount && !hasJournal)) return;
    if (!manual && Date.now() - lastTry.current < 60_000) return;
    lastTry.current = Date.now();
    setLoading(true);
    setError(null);
    try {
      await refreshBrief();
    } catch (e) {
      log.warn("brief failed", e);
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, [hasToken, openCount, hasJournal]);

  // Regenerate when Home comes into view and the inputs changed since last time.
  useFocusEffect(
    useCallback(() => {
      if (!brief || brief.key !== briefKey()) void refresh(false);
    }, [brief, refresh]),
  );

  if (!openCount && !hasJournal) return null;

  const todoAt = (i: number): Todo | undefined => {
    const id = brief?.ids[i];
    return id ? byId.get(id) : undefined;
  };
  const focus = brief ? brief.data.focus.map((f) => ({ todo: todoAt(f.index), why: f.why })).filter((f) => f.todo && !f.todo.doneAt) : today.slice(0, 3).map((t) => ({ todo: t, why: "" }));
  const nudges = brief ? brief.data.nudges.map((n) => ({ ...n, todo: todoAt(n.index) })).filter((n) => n.todo && !n.todo.doneAt) : [];

  const toggle = (t: Todo) => {
    const next = completeTodo(t.id);
    if (!next) toast("完成了", t.title, { label: "撤销", onPress: () => reopenTodo(t.id) });
  };

  const act = (n: (typeof nudges)[number]) => {
    tap();
    const t = n.todo!;
    if (n.action === "tomorrow") {
      postponeTodo(t.id);
      toast("推到明天了", t.title);
    } else if (n.action === "done") toggle(t);
    else if (n.action === "split") router.push({ pathname: "/record", params: { mode: "todo", prompt: `「${t.title}」可以拆成哪几步？一步一步说给我听` } });
    else router.push({ pathname: "/todos", params: { focus: t.id } });
  };

  const now = new Date();
  const updated = brief ? new Date(brief.at) : null;
  const headline = brief?.data.headline ?? (today.length ? `今天有 ${today.length} 件事要做` : openCount ? "今天没有到期的事" : "");
  const body = brief?.data.body ?? "";

  return (
    <Card style={{ marginTop: 18, padding: 0, overflow: "hidden" }}>
      <View style={{ padding: 16, paddingBottom: focus.length || nudges.length ? 8 : 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="sparkles" size={14} color={colors.primary} />
          <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 1.6, color: colors.primary }}>今日回顾</Text>
          <View style={{ flex: 1 }} />
          {loading ? (
            <ActivityIndicator size="small" color={colors.textFaint} />
          ) : hasToken ? (
            <Pressable hitSlop={10} onPress={() => { tap(); void refresh(true); }} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              {updated ? <Text style={{ fontSize: 11, color: colors.textFaint }}>{`${updated.getHours()}:${`${updated.getMinutes()}`.padStart(2, "0")}`}</Text> : null}
              <Ionicons name="refresh" size={14} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        {headline ? <Text style={{ fontFamily: fonts.serif, fontSize: 20, lineHeight: 27, color: colors.text, marginTop: 8 }}>{headline}</Text> : loading ? <Text style={{ fontSize: 15, color: colors.textSoft, marginTop: 8 }}>正在看看你今天的安排…</Text> : null}
        {body ? <Text style={{ fontSize: 14, lineHeight: 21, color: colors.textSoft, marginTop: 6 }}>{body}</Text> : null}
        {error && !brief ? <Text style={{ fontSize: 12, color: colors.textFaint, marginTop: 6 }}>回顾暂时没生成：{error}</Text> : null}
      </View>

      {focus.map(({ todo, why }) => (
        <Pressable key={todo!.id} onPress={() => router.push({ pathname: "/todos", params: { focus: todo!.id } })} style={({ pressed }) => ({ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? colors.cardMuted : "transparent" })}>
          <View style={{ paddingTop: 1 }}>
            <Checkbox checked={false} high={todo!.priority === "high"} size={22} onPress={() => toggle(todo!)} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15.5, color: colors.text }}>{todo!.title}</Text>
            {why ? <Text style={{ fontSize: 12.5, color: colors.textSoft, marginTop: 3 }} numberOfLines={2}>{why}</Text> : <TodoMeta todo={todo!} now={now} />}
          </View>
        </Pressable>
      ))}

      {nudges.map((n) => (
        <View key={`${n.index}-${n.action}`} style={{ marginHorizontal: 12, marginTop: 4, marginBottom: 8, padding: 12, borderRadius: 12, backgroundColor: colors.primarySoft, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name="return-down-forward" size={16} color={colors.primary} />
          <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: colors.text }}>{n.text}</Text>
          <Pressable onPress={() => act(n)} style={({ pressed }) => ({ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1 })}>
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.primary }}>{ACTION_LABEL[n.action]}</Text>
          </Pressable>
        </View>
      ))}

      {openCount ? (
        <Pressable onPress={() => { tap(); router.push("/todos"); }} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 }}>
          <Text style={{ flex: 1, fontSize: 13, color: colors.textSoft }}>全部待办 {openCount} 件</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </Card>
  );
}
