import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip, DueEditor } from "@/components/DueEditor";
import { Mascot } from "@/components/Mascot";
import { ensureReminderPermission } from "@/components/PermissionPrompt";
import { Checkbox } from "@/components/TodoRow";
import { EmptyState, PillButton, SpeechBubble, styles as ui, tap, toast } from "@/components/ui";
import { confirmPending, dismissPending, pendingAsNote, useStore, type PendingIntent } from "@/lib/store";
import { dueLabel, REPEAT_LABEL, type TodoDraft } from "@/lib/todo";
import { colors, radius, shadow } from "@/lib/theme";

type Row = TodoDraft & { include: boolean; answered: boolean; editing: boolean };

// Review what the model heard before it becomes to-dos: fix titles, answer its
// follow-up questions with one tap, or say it was a note after all.
export default function Confirm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pending = useStore((s) => s.inbox.find((p) => p.id === id));
  if (!pending) return <EmptyState text="这条已经处理过了" />;
  return <ConfirmView pending={pending} />;
}

function ConfirmView({ pending }: { pending: PendingIntent }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Row[]>(() => pending.drafts.map((d) => ({ ...d, include: true, answered: !d.question, editing: false })));
  const [completes, setCompletes] = useState(() => new Set(pending.completes.map((c) => c.todoId)));
  const [showText, setShowText] = useState(false);

  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const chosen = rows.filter((r) => r.include && r.title.trim());
  const unanswered = chosen.filter((r) => !r.answered).length;

  const confirm = async () => {
    tap();
    const created = confirmPending(pending.id, chosen, [...completes]);
    const parts = [created.length ? `加了 ${created.length} 件待办` : "", completes.size ? `完成 ${completes.size} 件` : ""].filter(Boolean);
    toast(parts.join("，") || "好的", created.length === 1 && created[0].date ? `${dueLabel(created[0])} 提醒你` : undefined);
    router.back();
    if (created.some((t) => t.date)) void ensureReminderPermission();
  };

  const asNote = () => {
    tap();
    const entryId = pendingAsNote(pending.id);
    if (pending.kind === "todo" && entryId) router.replace({ pathname: "/processing", params: { id: entryId } });
    else router.back();
  };

  const primaryLabel = chosen.length ? `添加 ${chosen.length} 件待办${completes.size ? `，完成 ${completes.size} 件` : ""}` : completes.size ? `标记 ${completes.size} 件完成` : "都不需要";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 }}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Text style={{ fontSize: 16, color: colors.textSoft }}>稍后</Text>
        </Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "600", color: colors.text }}>确认待办</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Mascot size={56} mood="talk" />
          <SpeechBubble style={{ flex: 1 }}>
            <Text style={{ fontSize: 15.5, lineHeight: 23, color: colors.text }}>
              {unanswered ? "有个地方想跟你确认一下：" : pending.reply || "我听到了这些要做的事："}
            </Text>
          </SpeechBubble>
        </View>

        <Pressable onPress={() => setShowText(!showText)} style={{ marginTop: 14, paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 13, lineHeight: 20, color: colors.textFaint }} numberOfLines={showText ? undefined : 2}>
            <Ionicons name={pending.source === "voice" ? "mic-outline" : "create-outline"} size={12} color={colors.textFaint} /> “{pending.text}”
          </Text>
        </Pressable>

        <View style={{ gap: 12, marginTop: 16 }}>
          {rows.map((r, i) => (
            <DraftCard key={i} row={r} onChange={(p) => patch(i, p)} />
          ))}
        </View>

        {pending.completes.length ? (
          <View style={{ marginTop: 22 }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text, marginBottom: 8, paddingHorizontal: 4 }}>这些好像已经做完了</Text>
            <View style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, ...shadow() }}>
              {pending.completes.map((c, i) => (
                <View key={c.todoId} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                  <Checkbox
                    checked={completes.has(c.todoId)}
                    onPress={() => setCompletes((s) => { const n = new Set(s); if (n.has(c.todoId)) n.delete(c.todoId); else n.add(c.todoId); return n; })}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, color: colors.text }}>{c.title}</Text>
                    <Text style={[ui.faint, { marginTop: 3 }]}>{c.reason}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg }}>
        <PillButton label={primaryLabel} icon="checkmark" onPress={() => (chosen.length || completes.size ? void confirm() : (dismissPending(pending.id), router.back()))} />
        <Pressable onPress={pending.kind === "mixed" ? () => { dismissPending(pending.id); router.back(); } : asNote} style={{ alignSelf: "center", padding: 12 }}>
          <Text style={{ color: colors.textSoft, fontSize: 14 }}>{pending.kind === "mixed" ? "这些都不用记" : "其实是一条笔记，存进日记"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DraftCard({ row, onChange }: { row: Row; onChange: (p: Partial<Row>) => void }) {
  const asking = row.include && !row.answered;
  const when = row.date ? `${dueLabel(row)}${row.repeat !== "none" ? ` · ${REPEAT_LABEL[row.repeat]}` : ""}` : "不设时间";
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: asking ? colors.primary : colors.border, padding: 14, opacity: row.include ? 1 : 0.55, ...shadow() }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ paddingTop: 3 }}>
          <Checkbox checked={row.include} high={row.priority === "high"} onPress={() => onChange({ include: !row.include })} />
        </View>
        <View style={{ flex: 1 }}>
          <TextInput value={row.title} onChangeText={(title) => onChange({ title })} multiline style={{ fontSize: 17, fontWeight: "600", color: colors.text, padding: 0 }} />
          {row.note ? <Text style={[ui.body, { marginTop: 4, fontSize: 13 }]}>{row.note}</Text> : null}
          <Pressable onPress={() => { tap(); onChange({ editing: !row.editing }); }} style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8, alignSelf: "flex-start" }}>
            <Ionicons name={row.date ? (row.time ? "alarm-outline" : "calendar-clear-outline") : "time-outline"} size={14} color={row.date ? colors.primary : colors.textFaint} />
            <Text style={{ fontSize: 13.5, color: row.date ? colors.primary : colors.textSoft, fontWeight: "600" }}>{when}</Text>
            <Ionicons name={row.editing ? "chevron-up" : "chevron-down"} size={13} color={colors.textFaint} />
          </Pressable>
        </View>
      </View>

      {asking ? (
        <View style={{ marginTop: 12, marginLeft: 36, padding: 12, borderRadius: 12, backgroundColor: colors.primarySoft }}>
          <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
            <Ionicons name="chatbubble-ellipses" size={15} color={colors.primary} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, fontSize: 14.5, lineHeight: 21, color: colors.text, fontWeight: "500" }}>{row.question}</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {row.options.map((o) => (
              <Chip key={o.label} label={o.label} active={false} onPress={() => { tap(); onChange({ date: o.date, time: o.time, answered: true }); }} />
            ))}
            <Chip label="不设时间" active={false} onPress={() => { tap(); onChange({ date: "", time: "", repeat: "none", answered: true }); }} />
            <Chip label="自己选" icon="calendar-outline" active={false} onPress={() => { tap(); onChange({ editing: true, answered: true }); }} />
          </View>
        </View>
      ) : null}

      {row.editing && row.include ? (
        <View style={{ marginTop: 14, marginLeft: 36 }}>
          <DueEditor value={{ date: row.date, time: row.time, repeat: row.repeat }} onChange={(v) => onChange({ ...v, answered: true })} />
        </View>
      ) : null}
    </View>
  );
}
