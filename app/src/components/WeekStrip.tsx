import { Text, View } from "react-native";
import type { Entry } from "@/lib/store";
import { dayKey, startOfWeek } from "@/lib/format";
import { colors, MOOD_COLORS } from "@/lib/theme";

// Seven day tiles (Sun..Sat) tinted with that day's most recent mood.
export function WeekStrip({ entries }: { entries: Entry[] }) {
  const start = startOfWeek();
  const today = dayKey(new Date());
  const moodByDay = new Map<string, string>();
  for (const e of entries) {
    const k = dayKey(e.createdAt);
    if (e.mood && !moodByDay.has(k)) moodByDay.set(k, e.mood);
  }
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const k = dayKey(d);
        const mood = moodByDay.get(k);
        return (
          <View key={k} style={{ alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 11, color: k === today ? colors.primaryDark : colors.textFaint, fontWeight: k === today ? "700" : "400" }}>
              {"日一二三四五六"[i]}
            </Text>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                backgroundColor: mood ? MOOD_COLORS[mood] : colors.cardMuted,
                borderWidth: k === today ? 2 : 0,
                borderColor: colors.primary,
              }}
            />
          </View>
        );
      })}
    </View>
  );
}
