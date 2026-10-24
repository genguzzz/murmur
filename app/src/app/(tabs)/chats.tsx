import { FlatList, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Card, EmptyState, PillButton, TAB_BAR_SPACE, TabHeader, styles as ui, tap } from "@/components/ui";
import { createChat, useStore } from "@/lib/store";
import { timeAgo } from "@/lib/format";
import { colors } from "@/lib/theme";

export default function Chats() {
  const router = useRouter();
  const chats = useStore((s) => s.chats);

  const startNew = () => {
    const c = createChat();
    router.push(`/chats/${c.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TabHeader title="对话" right={<Pressable hitSlop={10} accessibilityLabel="新对话" onPress={() => { tap(); startNew(); }}><Ionicons name="add-circle-outline" size={25} color={colors.primary} /></Pressable>} />
      {chats.length === 0 ? (
        <View style={{ flex: 1, paddingBottom: TAB_BAR_SPACE }}>
          <EmptyState text="问问你的日记：最近在烦什么？上周做成了什么？" />
          <PillButton label="开始一段对话" icon="chatbubble" onPress={startNew} style={{ marginHorizontal: 40 }} />
        </View>
      ) : (
        <FlatList
          data={[...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: TAB_BAR_SPACE + 30 }}
          renderItem={({ item }) => {
            const last = item.messages[item.messages.length - 1];
            return (
              <Card onPress={() => router.push(`/chats/${item.id}`)}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Text style={[ui.title, { flex: 1 }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={ui.faint}>{timeAgo(item.updatedAt)}</Text>
                </View>
                {last ? <Text style={[ui.body, { marginTop: 4 }]} numberOfLines={2}>{last.content}</Text> : null}
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}
