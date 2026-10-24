import { Text, View } from "react-native";
import type { Entry } from "@/lib/store";
import { dayKey, startOfWeek } from "@/lib/format";
import { nowWall } from "@/lib/zone";
import { colors } from "@/lib/theme";
import { MoodStamp } from "./MoodStamp";

// Seven day tiles (Sun..Sat) showing that day's most recent mood stamp.
export function WeekStrip({ entries }: { entries: Entry[] }) {
  const start = startOfWeek();
  const today = dayKey(nowWall());
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
          <View key={k} style={{ alignItems: "center", gap: 7 }}>
            <Text style={{ fontSize: 11, color: k === today ? colors.primary : colors.textFaint, fontWeight: k === today ? "700" : "500" }}>
              {"日一二三四五六"[i]}
            </Text>
            <View style={{ borderRadius: 10, borderWidth: k === today ? 2 : 0, borderColor: colors.primary, padding: k === today ? 1 : 3 }}>
              {mood ? <MoodStamp mood={mood} size={32} /> : <View style={{ width: 32, height: 32, borderRadius: 7, backgroundColor: colors.cardMuted }} />}
            </View>
          </View>
        );
      })}
    </View>
  );
}
