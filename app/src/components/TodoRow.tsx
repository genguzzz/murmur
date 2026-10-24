import { useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { dueLabel, isOverdue, REPEAT_LABEL, type Todo } from "@/lib/todo";
import { colors } from "@/lib/theme";

export function Checkbox({ checked, high, onPress, size = 24 }: { checked: boolean; high?: boolean; onPress: () => void; size?: number }) {
  const [pop] = useState(() => new Animated.Value(1));
  const press = () => {
    void Haptics.notificationAsync(checked ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
    Animated.sequence([
      Animated.timing(pop, { toValue: 0.8, duration: 80, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
    onPress();
  };
  const ring = high ? colors.danger : colors.textFaint;
  return (
    <Pressable hitSlop={12} onPress={press} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: checked ? 0 : high ? 2 : 1.6,
          borderColor: ring,
          backgroundColor: checked ? colors.primary : high ? colors.danger + "14" : "transparent",
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale: pop }],
        }}
      >
        {checked ? <Ionicons name="checkmark" size={size * 0.62} color={colors.onPrimary} /> : null}
      </Animated.View>
    </Pressable>
  );
}

export function TodoMeta({ todo, now }: { todo: Todo; now: Date }) {
  const overdue = isOverdue(todo, now);
  const parts: { icon: keyof typeof Ionicons.glyphMap; text: string; color?: string }[] = [];
  if (todo.date) parts.push({ icon: todo.time ? "alarm-outline" : "calendar-clear-outline", text: dueLabel(todo, now), color: overdue ? colors.danger : undefined });
  if (todo.repeat !== "none") parts.push({ icon: "repeat", text: REPEAT_LABEL[todo.repeat] });
  if (todo.source === "voice") parts.push({ icon: "mic-outline", text: "" });
  if (todo.note) parts.push({ icon: "document-text-outline", text: "" });
  if (!parts.length) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
      {parts.map((p, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Ionicons name={p.icon} size={13} color={p.color ?? colors.textFaint} />
          {p.text ? <Text style={{ fontSize: 12.5, color: p.color ?? colors.textSoft, fontWeight: p.color ? "600" : "400" }}>{p.text}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export function TodoRow({ todo, now, onToggle, onPress, highlight }: { todo: Todo; now: Date; onToggle: () => void; onPress: () => void; highlight?: boolean }) {
  const done = !!todo.doneAt;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        paddingVertical: 13,
        paddingHorizontal: 14,
        backgroundColor: highlight ? colors.primarySoft : pressed ? colors.cardMuted : "transparent",
      })}
    >
      <View style={{ paddingTop: 1 }}>
        <Checkbox checked={done} high={todo.priority === "high"} onPress={onToggle} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, lineHeight: 22, color: done ? colors.textFaint : colors.text, textDecorationLine: done ? "line-through" : "none" }}>{todo.title}</Text>
        {done ? null : <TodoMeta todo={todo} now={now} />}
      </View>
    </Pressable>
  );
}
