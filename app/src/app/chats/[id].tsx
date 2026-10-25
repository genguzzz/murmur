import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StepList } from "@/components/Activity";
import { Bubble, Card, EmptyState, IconButton, TopBar, tap, toast } from "@/components/ui";
import { deleteChat, restoreChat, sendChat, sortedEntries, useStore, type ChatMessage } from "@/lib/store";
import { runUndo, useCanUndo, useRun, watchRun } from "@/lib/runs";
import { colors, radius } from "@/lib/theme";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const chat = useStore((s) => s.chats.find((c) => c.id === id));
  const rawEntries = useStore((s) => s.entries);
  const [text, setText] = useState("");
  const list = useRef<FlatList>(null);
  const run = useRun(id);
  const sending = !!chat?.messages.some((m) => m.pending);

  useEffect(() => watchRun(id), [id]);

  // Starter cards built from recent entries, like "ask about a past entry".
  const starters = useMemo(() => {
    const recent = sortedEntries(rawEntries).filter((e) => e.status === "done").slice(0, 3);
    return [
      ...recent.slice(0, 2).map((e) => `回顾「${e.title}」`),
      "最近反复出现的主题有哪些？",
      "整理本周的待办",
      "总结本周的记录",
    ].slice(0, 5);
  }, [rawEntries]);

  if (!chat) return (<><TopBar /><EmptyState text="对话不存在" /></>);

  const send = (content: string) => {
    const c = content.trim();
    if (!c || sending) return;
    setText("");
    void sendChat(chat.id, c);
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <TopBar
        title={chat.messages.length ? chat.title : "新对话"}
        right={chat.messages.length ? <IconButton name="trash-outline" onPress={() => { const c = chat; deleteChat(c.id); router.back(); toast("已删除对话", c.title, { label: "撤销", onPress: () => restoreChat(c) }); }} /> : undefined}
      />
      {chat.messages.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <View style={{ alignItems: "center", marginBottom: 28 }}>
            <Bubble text="有什么需要帮忙的？" />
            <Text style={{ color: colors.textSoft, marginTop: 14, textAlign: "center", paddingHorizontal: 40, lineHeight: 20 }}>
              可以询问过去的记录、调整待办，或提出其他问题。
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 18, gap: 10 }} style={{ flexGrow: 0 }}>
            {starters.map((s) => (
              <Card key={s} style={{ width: 160 }} onPress={() => send(s)}>
                <Text style={{ color: colors.text, lineHeight: 20 }}>{s}</Text>
              </Card>
            ))}
          </ScrollView>
        </View>
      ) : (
        <FlatList
          ref={list}
          data={chat.messages}
          keyExtractor={(_, i) => String(i)}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => <MessageView item={item} steps={item.pending && run?.status === "running" ? run.steps : undefined} />}
        />
      )}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 14, paddingTop: 8, paddingBottom: insets.bottom + 8 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={sending ? "正在回复…" : "输入消息"}
          placeholderTextColor={colors.textFaint}
          multiline
          style={{ flex: 1, maxHeight: 120, minHeight: 44, backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border }}
        />
        <Pressable accessibilityLabel="发送" onPress={() => send(text)} disabled={!text.trim() || sending} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() && !sending ? colors.primary : colors.border, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="arrow-up" size={20} color={colors.onPrimary} />
        </Pressable>
      </View>
      <Text style={{ textAlign: "center", fontSize: 11, color: colors.textFaint, paddingBottom: insets.bottom ? 0 : 6, marginTop: -4 }}>AI 生成的内容可能有误，重要信息请以你的原始记录为准。</Text>
    </KeyboardAvoidingView>
  );
}

function MessageView({ item, steps }: { item: ChatMessage; steps?: { id: string; label: string; state: "run" | "done" | "fail" }[] }) {
  if (item.role === "user") {
    return (
      <View style={{ alignSelf: "flex-end", maxWidth: "85%", backgroundColor: colors.primary, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 }}>
        {item.voice ? <Ionicons name="mic" size={12} color={colors.onPrimary} style={{ opacity: 0.7, marginBottom: 2 }} /> : null}
        <Text selectable style={{ color: colors.onPrimary, fontSize: 15, lineHeight: 22 }}>{item.content}</Text>
      </View>
    );
  }
  return (
    <View style={{ alignSelf: "flex-start", maxWidth: "88%", gap: 8 }}>
      {steps?.length ? (
        <View style={{ paddingHorizontal: 4 }}>
          <StepList steps={steps} compact />
        </View>
      ) : null}
      {item.content || !item.pending ? (
        <View style={{ backgroundColor: item.error ? colors.danger + "18" : colors.card, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 }}>
          <RichText text={item.content + (item.pending ? " ▍" : "")} color={item.error ? colors.danger : colors.text} />
        </View>
      ) : null}
      {item.ops?.length ? <OpsCard lines={item.ops} undoId={item.undoId} /> : null}
    </View>
  );
}

// What the agent changed this turn, with undo while it's still possible.
function OpsCard({ lines, undoId }: { lines: string[]; undoId?: string }) {
  const can = useCanUndo(undoId);
  const [undone, setUndone] = useState(false);
  return (
    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardMuted, padding: 12, gap: 6 }}>
      {lines.map((l) => (
        <View key={l} style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <Ionicons name={undone ? "arrow-undo-outline" : "checkmark-circle-outline"} size={15} color={undone ? colors.textFaint : colors.primary} />
          <Text style={{ flex: 1, fontSize: 13.5, color: undone ? colors.textFaint : colors.text, textDecorationLine: undone ? "line-through" : "none" }}>{l}</Text>
        </View>
      ))}
      {can ? (
        <Pressable hitSlop={8} onPress={() => { tap(); if (runUndo(undoId!)) { setUndone(true); toast("已撤销", "相关改动已恢复"); } }} style={{ alignSelf: "flex-start", marginTop: 2 }}>
          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13.5 }}>撤销以上改动</Text>
        </Pressable>
      ) : undone ? (
        <Text style={{ fontSize: 12.5, color: colors.textFaint }}>已撤销</Text>
      ) : null}
    </View>
  );
}

// Just enough markdown for replies: **bold**, "- " bullets, numbered lines, # headings.
function RichText({ text, color }: { text: string; color: string }) {
  const lines = text.split("\n");
  return (
    <View style={{ gap: 4 }}>
      {lines.map((raw, i) => {
        if (!raw.trim()) return <View key={i} style={{ height: 4 }} />;
        const bullet = /^\s*[-•*]\s+/.exec(raw);
        const num = /^\s*(\d+)[.、)]\s+/.exec(raw);
        const heading = /^#{1,4}\s+/.exec(raw);
        const body = raw.slice((bullet ?? num ?? heading)?.[0].length ?? 0);
        const inline = <Inline text={body} color={color} bold={!!heading} />;
        if (bullet || num) {
          return (
            <View key={i} style={{ flexDirection: "row", gap: 6 }}>
              <Text style={{ color, fontSize: 15, lineHeight: 22 }}>{bullet ? "•" : `${num![1]}.`}</Text>
              <View style={{ flex: 1 }}>{inline}</View>
            </View>
          );
        }
        return <View key={i}>{inline}</View>;
      })}
    </View>
  );
}

function Inline({ text, color, bold }: { text: string; color: string; bold?: boolean }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text selectable style={{ color, fontSize: 15, lineHeight: 22, fontWeight: bold ? "700" : "400" }}>
      {parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <Text key={i} style={{ fontWeight: "700" }}>{p.slice(2, -2)}</Text> : p))}
    </Text>
  );
}
