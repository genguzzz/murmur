import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bubble, Card, EmptyState, TopBar } from "@/components/ui";
import { sendChat, sortedEntries, useStore } from "@/lib/store";
import { colors, radius } from "@/lib/theme";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const chat = useStore((s) => s.chats.find((c) => c.id === id));
  const rawEntries = useStore((s) => s.entries);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const list = useRef<FlatList>(null);

  // Starter cards built from recent entries, like "ask about a past entry".
  const starters = useMemo(() => {
    const recent = sortedEntries(rawEntries).filter((e) => e.status === "done").slice(0, 3);
    return [
      ...recent.map((e) => `聊聊「${e.title}」这件事`),
      "最近我反复提到的是什么？",
      "帮我回顾一下这周",
    ].slice(0, 4);
  }, [rawEntries]);

  if (!chat) return (<><TopBar /><EmptyState text="对话不存在" /></>);

  const send = async (content: string) => {
    const c = content.trim();
    if (!c || sending) return;
    setText("");
    setSending(true);
    await sendChat(chat.id, c);
    setSending(false);
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <TopBar title={chat.messages.length ? chat.title : "新对话"} />
      {chat.messages.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <View style={{ alignItems: "center", marginBottom: 28 }}>
            <Bubble text="想聊点什么？" />
            <Text style={{ color: colors.textSoft, marginTop: 14, textAlign: "center", paddingHorizontal: 40, lineHeight: 20 }}>
              聊一件新的事，或者问问过去的某条记录。
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 18, gap: 10 }} style={{ flexGrow: 0 }}>
            {starters.map((s) => (
              <Card key={s} style={{ width: 160 }} onPress={() => void send(s)}>
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
          renderItem={({ item }) => (
            <View
              style={{
                alignSelf: item.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                backgroundColor: item.role === "user" ? colors.primary : item.error ? colors.danger + "18" : colors.card,
                borderRadius: 18,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <Text selectable style={{ color: item.role === "user" ? colors.onPrimary : item.error ? colors.danger : colors.text, fontSize: 15, lineHeight: 22 }}>{item.content}</Text>
            </View>
          )}
          ListFooterComponent={sending ? <ActivityIndicator style={{ alignSelf: "flex-start", margin: 8 }} color={colors.primary} /> : undefined}
        />
      )}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 14, paddingTop: 8, paddingBottom: insets.bottom + 8 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="说点什么"
          placeholderTextColor={colors.textFaint}
          multiline
          style={{ flex: 1, maxHeight: 120, minHeight: 44, backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border }}
        />
        <Pressable onPress={() => void send(text)} disabled={!text.trim() || sending} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() && !sending ? colors.primary : colors.border, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="arrow-up" size={20} color={colors.onPrimary} />
        </Pressable>
      </View>
      <Text style={{ textAlign: "center", fontSize: 11, color: colors.textFaint, paddingBottom: insets.bottom ? 0 : 6, marginTop: -4 }}>AI 会出错，重要的事以你自己的记录为准。</Text>
    </KeyboardAvoidingView>
  );
}
