import { Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { tap } from "./ui";
import { addDays, dayLabel, parseDate, REPEAT_LABEL, today, toDateStr, toTimeStr, type Repeat } from "@/lib/todo";
import { colors, scheme } from "@/lib/theme";
import { nowWall } from "@/lib/zone";

export interface Due {
  date: string;
  time: string;
  repeat: Repeat;
}

function quickDates(now = nowWall()): { label: string; date: string }[] {
  const t = today(now);
  const dow = now.getDay();
  const sat = addDays(t, dow === 6 ? 7 : 6 - dow);
  const mon = addDays(t, ((8 - dow) % 7) || 7);
  return [
    { label: "今天", date: t },
    { label: "明天", date: addDays(t, 1) },
    { label: "周末", date: sat },
    { label: "下周一", date: mon },
  ];
}

// Next sensible time on the chosen day: tomorrow and later → 09:00; today → next full hour.
function defaultTime(date: string): string {
  const now = nowWall();
  if (date !== today(now)) return "09:00";
  const h = Math.min(23, now.getHours() + 1);
  return `${`${h}`.padStart(2, "0")}:00`;
}

const REPEATS: Repeat[] = ["none", "daily", "weekdays", "weekly", "monthly"];

// Quick date chips, native compact pickers for exact date/time, and repeat.
export function DueEditor({ value, onChange, showRepeat = true }: { value: Due; onChange: (v: Due) => void; showRepeat?: boolean }) {
  const quick = quickDates();
  const isQuick = quick.some((q) => q.date === value.date);
  const set = (patch: Partial<Due>) => {
    tap();
    const next = { ...value, ...patch };
    if (!next.date) Object.assign(next, { time: "", repeat: "none" });
    onChange(next);
  };
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {quick.map((q) => (
          <Chip key={q.label} label={q.label} active={value.date === q.date} onPress={() => set({ date: q.date })} />
        ))}
        {value.date && !isQuick ? <Chip label={dayLabel(value.date)} active onPress={() => {}} /> : null}
        <Chip label="不设时间" active={!value.date} onPress={() => set({ date: "" })} icon="remove-circle-outline" />
      </View>

      {value.date ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {Platform.OS === "ios" ? (
            <DateTimePicker
              value={parseDate(value.date)}
              mode="date"
              display="compact"
              locale="zh-CN"
              minimumDate={parseDate(today())}
              accentColor={colors.primary}
              themeVariant={scheme}
              onValueChange={(_, d) => set({ date: toDateStr(d) })}
            />
          ) : null}
          {value.time ? (
            <>
              {Platform.OS === "ios" ? (
                <DateTimePicker
                  value={parseDate(value.date, value.time)}
                  mode="time"
                  display="compact"
                  locale="zh-CN"
                  minuteInterval={5}
                  accentColor={colors.primary}
                  themeVariant={scheme}
                  onValueChange={(_, d) => set({ time: toTimeStr(d) })}
                />
              ) : (
                ["09:00", "12:00", "15:00", "20:00"].map((t) => <Chip key={t} label={t} active={value.time === t} onPress={() => set({ time: t })} />)
              )}
              <Pressable hitSlop={8} onPress={() => set({ time: "" })} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name="close-circle" size={16} color={colors.textFaint} />
                <Text style={{ fontSize: 13, color: colors.textSoft }}>全天</Text>
              </Pressable>
            </>
          ) : (
            <Chip label="添加时间" icon="alarm-outline" active={false} onPress={() => set({ time: defaultTime(value.date) })} />
          )}
        </View>
      ) : null}

      {value.date && showRepeat ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Ionicons name="repeat" size={15} color={colors.textFaint} style={{ marginRight: 2 }} />
          {REPEATS.map((r) => (
            <Chip key={r} small label={REPEAT_LABEL[r]} active={value.repeat === r} onPress={() => set({ repeat: r })} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function Chip({ label, active, onPress, icon, small }: { label: string; active: boolean; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; small?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        height: small ? 28 : 34,
        paddingHorizontal: small ? 10 : 13,
        borderRadius: 999,
        backgroundColor: active ? colors.primary : colors.cardMuted,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={small ? 12 : 14} color={active ? colors.onPrimary : colors.textSoft} /> : null}
      <Text style={{ fontSize: small ? 12.5 : 14, color: active ? colors.onPrimary : colors.text, fontWeight: active ? "600" : "400" }}>{label}</Text>
    </Pressable>
  );
}
