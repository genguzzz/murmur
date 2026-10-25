import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Mascot } from "@/components/Mascot";
import { ensureReminderPermission } from "@/components/PermissionPrompt";
import { TodoRow } from "@/components/TodoRow";
import { TodoSheet } from "@/components/TodoSheet";
import { Screen, SpeechBubble, TAB_BAR_SPACE, TabHeader, styles as ui, tap, toast } from "@/components/ui";
import { describeError } from "@/lib/api";
import { logger } from "@/lib/log";
import { addTodos, clearDoneTodos, completeTodo, quickAddTodo, reopenTodo, updateTodo, useStore } from "@/lib/store";
import { runUndo } from "@/lib/runs";
import { dayLabel, dueLabel, groupTodos, type DraftOption, type Todo } from "@/lib/todo";
import { colors, radius, shadow } from "@/lib/theme";
import { nowWall } from "@/lib/zone";

const log = logger("todos");
const EXAMPLES = ["明早 9 点交周报", "周五晚上给妈妈打电话", "每天 22:30 吃维生素"];

export default function Todos() {
  const router = useRouter();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const todos = useStore((s) => s.todos);
  const inbox = useStore((s) => s.inbox);
  const allDay = useStore((s) => s.settings.todoAllDayTime);
  const [now, setNow] = useState(() => nowWall());
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [showDone, setShowDone] = useState(false);

  // Re-evaluate "today/overdue" whenever the tab comes back into view.
  useFocusEffect(useCallback(() => setNow(nowWall()), []));

  const sections = useMemo(() => groupTodos(todos, allDay, now), [todos, allDay, now]);
  const done = useMemo(() => todos.filter((t) => t.doneAt).sort((a, b) => b.doneAt!.localeCompare(a.doneAt!)).slice(0, 30), [todos]);
  const openCount = sections.reduce((n, s) => n + s.todos.length, 0);
  const todayCount = sections.filter((s) => s.key === "today" || s.key === "overdue").reduce((n, s) => n + s.todos.length, 0);
  const overdue = sections.find((s) => s.key === "overdue")?.todos.length ?? 0;

  const toggle = (t: Todo) => {
    if (t.doneAt) {
      reopenTodo(t.id);
      return;
    }
    const next = completeTodo(t.id);
    if (next) toast("完成了", `下次：${dayLabel(next)}${t.time ? ` ${t.time}` : ""}`);
    else toast("完成了", t.title, { label: "撤销", onPress: () => reopenTodo(t.id) });
  };

  const submit = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const r = await quickAddTodo(text);
      setDraft("");
      toast(r.reply, r.lines.length > 1 ? r.lines.join("\n") : undefined, r.undoId ? { label: "撤销", onPress: () => { if (runUndo(r.undoId!)) toast("已撤销"); } } : undefined);
      if (r.remind) void ensureReminderPermission();
    } catch (e) {
      // Offline: still capture it, without a date.
      log.warn("quick add parse failed", e);
      addTodos([{ title: text, note: "", date: "", time: "", repeat: "none", priority: "normal" }], "text");
      setDraft("");
      toast("先记下了", `时间没识别（${describeError(e)}），点开可以补上`);
    } finally {
      setBusy(false);
    }
  };

  const answer = (t: Todo, o: DraftOption | null) => {
    if (!o) {
      updateTodo(t.id, { ask: undefined });
      return;
    }
    updateTodo(t.id, { date: o.date, ...(o.time ? { time: o.time } : { time: undefined }), ask: undefined });
    toast("定好了", `${t.title} · ${dueLabel({ date: o.date, time: o.time || undefined })}`);
    void ensureReminderPermission();
  };

  const summary = openCount === 0 ? "没有待办，轻松一下" : todayCount ? `今天 ${todayCount} 件${overdue ? `，其中 ${overdue} 件已逾期` : ""}` : `共 ${openCount} 件，今天没有要做的`;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + 30 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <TabHeader title="待办" right={done.length ? <Pressable hitSlop={10} onPress={() => { tap(); setShowDone(!showDone); }}><Ionicons name={showDone ? "eye-off-outline" : "checkmark-done-outline"} size={22} color={colors.textSoft} /></Pressable> : null} />
        <View style={{ paddingHorizontal: 18 }}>
          <Text style={[ui.body, { marginTop: 2 }]}>{summary}</Text>

          {inbox.filter((p) => p.kind !== "unclear").map((p) => (
            <Pressable
              key={p.id}
              onPress={() => { tap(); router.push(`/confirm/${p.id}`); }}
              style={({ pressed }) => ({ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary + "55", opacity: pressed ? 0.85 : 1 })}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={p.source === "voice" ? "mic" : "create"} size={17} color={colors.onPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text }}>
                  {p.drafts.length ? `${p.drafts.length} 件待办等你确认` : "有事项可能已经做完"}
                </Text>
                <Text style={{ fontSize: 13, color: colors.textSoft, marginTop: 2 }} numberOfLines={1}>“{p.text}”</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.primary} />
            </Pressable>
          ))}

          {/* Quick add: type naturally, the model fills in date, time and repeat. */}
          <View style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: radius.lg, paddingLeft: 16, paddingRight: 6, height: 54, borderWidth: 1, borderColor: colors.border, ...shadow() }}>
            <Ionicons name="add" size={22} color={colors.primary} />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => void submit()}
              returnKeyType="done"
              editable={!busy}
              placeholder="加个待办，如「明天下午三点开会」"
              placeholderTextColor={colors.textFaint}
              style={{ flex: 1, fontSize: 16, color: colors.text, height: 54 }}
            />
            {busy ? (
              <ActivityIndicator color={colors.primary} style={{ width: 42 }} />
            ) : draft.trim() ? (
              <Pressable onPress={() => void submit()} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="arrow-up" size={20} color={colors.onPrimary} />
              </Pressable>
            ) : (
              <Pressable accessibilityLabel="语音添加待办" onPress={() => { tap(); router.push({ pathname: "/record", params: { mode: "todo" } }); }} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="mic" size={19} color={colors.primary} />
              </Pressable>
            )}
          </View>

          {openCount === 0 && !inbox.length ? (
            <View style={{ alignItems: "center", marginTop: 40, gap: 18 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Mascot size={64} />
                <SpeechBubble style={{ maxWidth: 230 }}>
                  <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>说一句「提醒我…」，我帮你记着，到点叫你。</Text>
                </SpeechBubble>
              </View>
              <View style={{ gap: 8, alignSelf: "stretch" }}>
                {EXAMPLES.map((e) => (
                  <Pressable key={e} onPress={() => { tap(); setDraft(e); }} style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border }}>
                    <Text style={{ color: colors.textSoft, fontSize: 14 }}>试试：{e}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {sections.map((s) => (
            <View key={s.key} style={{ marginTop: 22 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 8, paddingHorizontal: 4 }}>
                <Text style={{ fontSize: 15, fontWeight: "800", color: s.tone === "danger" ? colors.danger : s.tone === "primary" ? colors.primary : colors.text }}>{s.title}</Text>
                <Text style={ui.faint}>{s.todos.length}</Text>
              </View>
              <List>
                {s.todos.map((t) => (
                  <TodoRow key={t.id} todo={t} now={now} highlight={focus === t.id} onToggle={() => toggle(t)} onPress={() => setEditing(t)} onAnswer={(o) => answer(t, o)} />
                ))}
              </List>
            </View>
          ))}

          {showDone && done.length ? (
            <View style={{ marginTop: 22 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, paddingHorizontal: 4 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: "800", color: colors.textSoft }}>已完成</Text>
                <Pressable hitSlop={8} onPress={() => { tap(); clearDoneTodos(); setShowDone(false); }}>
                  <Text style={{ fontSize: 13, color: colors.textFaint }}>清除</Text>
                </Pressable>
              </View>
              <List>
                {done.map((t) => (
                  <TodoRow key={t.id} todo={t} now={now} onToggle={() => toggle(t)} onPress={() => setEditing(t)} onAnswer={(o) => answer(t, o)} />
                ))}
              </List>
            </View>
          ) : null}
        </View>
      </ScrollView>
      {editing ? <TodoSheet todo={editing} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}

// Grouped list card with inset hairlines between rows, like Reminders.
function List({ children }: { children: ReactNode[] }) {
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow() }}>
      {children.map((c, i) => (
        <View key={i}>
          {i ? <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 50 }} /> : null}
          {c}
        </View>
      ))}
    </View>
  );
}
