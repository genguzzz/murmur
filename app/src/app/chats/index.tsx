import { FlatList, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, EmptyState, PillButton, TopBar, styles as ui } from "@/components/ui";
import { createChat, useStore } from "@/lib/store";
import { timeAgo } from "@/lib/format";
import { colors } from "@/lib/theme";

export default function Chats() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const chats = useStore((s) => s.chats);

  const startNew = () => {
    const c = createChat();
    router.push(`/chats/${c.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="对话" />
      {chats.length === 0 ? (
        <EmptyState text="你的对话都在这里" />
      ) : (
        <FlatList
          data={[...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: 120 }}
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
      <View style={{ position: "absolute", left: 18, right: 18, bottom: insets.bottom + 12 }}>
        <PillButton label="新对话" icon="chatbubble" onPress={startNew} />
      </View>
    </View>
  );
}
