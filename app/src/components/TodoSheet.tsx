import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DueEditor, type Due } from "./DueEditor";
import { ensureReminderPermission } from "./PermissionPrompt";
import { tap, toast } from "./ui";
import { deleteTodo, postponeTodo, updateTodo } from "@/lib/store";
import { dueLabel, leadLabel, leadOf, type Todo } from "@/lib/todo";
import { colors, radius } from "@/lib/theme";

// Edit a to-do in a native page sheet. Changes save when the sheet closes.
export function TodoSheet({ todo, onClose }: { todo: Todo; onClose: () => void }) {
  const [title, setTitle] = useState(todo.title);
  const [note, setNote] = useState(todo.note ?? "");
  const [due, setDue] = useState<Due>({ date: todo.date ?? "", time: todo.time ?? "", repeat: todo.repeat });
  const [high, setHigh] = useState(todo.priority === "high");
  const [lead, setLead] = useState(() => leadOf(todo));
  // The agent's choice stays in the list even if it isn't one of the presets.
  const presets = due.time ? [0, 5, 10, 15, 30, 60, 120, 1440] : [0, 1440, 2880, 4320, 10080];
  const leadChoices = [...new Set([...presets, lead])].sort((a, b) => a - b);

  const save = () => {
    const patch: Partial<Todo> = {
      title: title.trim() || todo.title,
      note: note.trim() || undefined,
      date: due.date || undefined,
      time: (due.date && due.time) || undefined,
      repeat: due.date ? due.repeat : "none",
      priority: high ? "high" : "normal",
      ...(lead !== leadOf(todo) ? { lead } : {}),
    };
    const changed = (Object.keys(patch) as (keyof Todo)[]).some((k) => patch[k] !== todo[k]);
    if (changed) {
      updateTodo(todo.id, patch);
      if (patch.date && patch.date !== todo.date) void ensureReminderPermission();
    }
    onClose();
  };

  const remove = () =>
    Alert.alert("删除这条待办？", todo.title, [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => { deleteTodo(todo.id); onClose(); } },
    ]);

  const tomorrow = () => {
    postponeTodo(todo.id);
    toast("已推迟到明天", todo.time ? `将在明天 ${todo.time} 提醒` : undefined);
    onClose();
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={save}>
      <View style={{ flex: 1, backgroundColor: colors.sheet }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 }}>
          <Pressable hitSlop={10} onPress={remove}>
            <Ionicons name="trash-outline" size={21} color={colors.danger} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "600", color: colors.text }}>待办</Text>
          <Pressable hitSlop={10} onPress={save}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.primary }}>完成</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 18, gap: 18 }} keyboardShouldPersistTaps="handled">
          <View style={{ backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
            <TextInput value={title} onChangeText={setTitle} placeholder="待办内容" placeholderTextColor={colors.textFaint} multiline style={{ fontSize: 19, fontWeight: "600", color: colors.text, padding: 16, paddingBottom: 8 }} />
            <TextInput value={note} onChangeText={setNote} placeholder="备注" placeholderTextColor={colors.textFaint} multiline style={{ fontSize: 15, color: colors.textSoft, paddingHorizontal: 16, paddingBottom: 16, minHeight: 44 }} />
          </View>

          <View>
            <Label icon="calendar-outline" text={due.date ? `提醒：${dueLabel(due)}` : "设置时间"} />
            <DueEditor value={due} onChange={setDue} />
          </View>

          {due.date ? (
            <View>
              <Label icon="notifications-outline" text={`提前提醒：${leadLabel(lead)}`} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {leadChoices.map((m) => (
                  <Pressable key={m} onPress={() => { tap(); setLead(m); }} style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: m === lead ? colors.primary : colors.border, backgroundColor: m === lead ? colors.primarySoft : "transparent" }}>
                    <Text style={{ fontSize: 13.5, fontWeight: "600", color: m === lead ? colors.primary : colors.textSoft }}>{m ? leadLabel(m) : "不提前"}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={{ fontSize: 12, color: colors.textFaint, marginTop: 8 }}>{due.time ? "到期前先发一条通知，并在灵动岛和锁屏显示倒计时。" : "以当天的待办提醒时间为截止，提前发一条通知。"}</Text>
            </View>
          ) : null}

          <Pressable onPress={() => { tap(); setHigh(!high); }} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name={high ? "flag" : "flag-outline"} size={19} color={high ? colors.danger : colors.textSoft} />
            <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>重要</Text>
            <Text style={{ fontSize: 13, color: colors.textFaint }}>{high ? "已标记" : "点按标记为重要"}</Text>
          </Pressable>

          {!todo.doneAt ? (
            <Pressable onPress={tomorrow} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.cardMuted, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1 })}>
              <Ionicons name="arrow-redo-outline" size={19} color={colors.primary} />
              <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>推迟到明天</Text>
              {todo.postponed ? <Text style={{ fontSize: 12, color: colors.textFaint }}>已推迟 {todo.postponed} 次</Text> : null}
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Label({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
      <Ionicons name={icon} size={15} color={colors.primary} />
      <Text style={{ fontSize: 13, fontWeight: "700", letterSpacing: 1, color: colors.textSoft }}>{text}</Text>
    </View>
  );
}
