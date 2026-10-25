import { useRef, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
// Gesture-handler list: the row swipe and the vertical scroll negotiate natively.
import { FlatList } from "react-native-gesture-handler";
import Swipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Card, EmptyState, PillButton, TAB_BAR_SPACE, TabHeader, styles as ui, tap, toast } from "@/components/ui";
import { createChat, deleteChat, restoreChat, useStore, type Chat } from "@/lib/store";
import { timeAgo } from "@/lib/format";
import { colors, radius } from "@/lib/theme";

export default function Chats() {
  const router = useRouter();
  const chats = useStore((s) => s.chats);
  // Only one row stays open at a time, like Mail.
  const openRow = useRef<SwipeableMethods | null>(null);

  const startNew = () => {
    const c = createChat();
    router.push(`/chats/${c.id}`);
  };

  const remove = (chat: Chat) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteChat(chat.id);
    toast("已删除对话", chat.title, { label: "撤销", onPress: () => restoreChat(chat) });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TabHeader title="对话" right={<Pressable hitSlop={10} accessibilityLabel="新建对话" onPress={() => { tap(); startNew(); }}><Ionicons name="add-circle-outline" size={25} color={colors.primary} /></Pressable>} />
      {chats.length === 0 ? (
        <View style={{ flex: 1, paddingBottom: TAB_BAR_SPACE }}>
          <EmptyState text="可以询问过去的记录、调整待办，或提出其他问题。" />
          <PillButton label="新建对话" icon="chatbubble" onPress={startNew} style={{ marginHorizontal: 40 }} />
        </View>
      ) : (
        <FlatList
          data={[...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: TAB_BAR_SPACE + 30 }}
          onScrollBeginDrag={() => openRow.current?.close()}
          renderItem={({ item }) => {
            const last = item.messages.filter((m) => !m.pending).at(-1);
            return (
              <SwipeRow onOpen={(row) => { if (openRow.current !== row) openRow.current?.close(); openRow.current = row; }} onDelete={() => remove(item)}>
                <Card onPress={() => router.push(`/chats/${item.id}`)}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Text style={[ui.title, { flex: 1 }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={ui.faint}>{timeAgo(item.updatedAt)}</Text>
                  </View>
                  {last ? <Text style={[ui.body, { marginTop: 4 }]} numberOfLines={2}>{preview(last.content)}</Text> : null}
                </Card>
              </SwipeRow>
            );
          }}
        />
      )}
    </View>
  );
}

// Swipe left to reveal 删除.
function SwipeRow({ children, onOpen, onDelete }: { children: ReactNode; onOpen: (row: SwipeableMethods) => void; onDelete: () => void }) {
  const row = useRef<SwipeableMethods>(null);
  return (
    <Swipeable
      ref={row}
      friction={1.6}
      rightThreshold={44}
      overshootRight={false}
      // Opaque backing: the pressed card fades and shrinks a little, and the delete
      // button sitting behind it must not show through.
      childrenContainerStyle={{ backgroundColor: colors.bg, borderRadius: radius.md }}
      onSwipeableWillOpen={() => {
        void Haptics.selectionAsync();
        if (row.current) onOpen(row.current);
      }}
      renderRightActions={() => (
        <Pressable
          accessibilityLabel="删除对话"
          onPress={onDelete}
          style={({ pressed }) => ({ width: 84, marginLeft: 10, borderRadius: radius.md, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", gap: 4, opacity: pressed ? 0.85 : 1 })}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>删除</Text>
        </Pressable>
      )}
    >
      {children}
    </Swipeable>
  );
}

// List preview: the reply's markdown marks and line breaks don't belong in two lines.
function preview(text: string): string {
  return text.replace(/\*\*/g, "").replace(/^\s*(#{1,4}|[-•*]|\d+[.、)])\s+/gm, "").replace(/\s*\n+\s*/g, " ").trim();
}
