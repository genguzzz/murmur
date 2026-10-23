import { Platform } from "react-native";

export const colors = {
  bg: "#F6EEE3",
  card: "#FFFBF5",
  cardMuted: "#F1E6D8",
  border: "#EADCC9",
  text: "#3B2A1E",
  textSoft: "#7C6A5A",
  textFaint: "#A99683",
  primary: "#D2915A",
  primaryDark: "#B8763F",
  primarySoft: "#F2DEC8",
  danger: "#C2574A",
  white: "#FFFFFF",
};

// Serif headings give the journal feel; system sans for body.
export const fonts = {
  serif: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" }),
};

export const MOOD_COLORS: Record<string, string> = {
  joyful: "#F2B84B",
  grateful: "#E9A07A",
  hopeful: "#9CC59A",
  calm: "#8FB8C9",
  neutral: "#C9BBA8",
  tired: "#A9A1C2",
  anxious: "#D99A9A",
  sad: "#7E9CC4",
  frustrated: "#D98263",
  angry: "#C2574A",
};

export const MOOD_LABELS: Record<string, string> = {
  joyful: "开心",
  grateful: "感恩",
  hopeful: "期待",
  calm: "平静",
  neutral: "一般",
  tired: "疲惫",
  anxious: "焦虑",
  sad: "低落",
  frustrated: "烦躁",
  angry: "生气",
};

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 };

export const shadow = Platform.select({
  ios: { shadowColor: "#7A5A3A", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  android: { elevation: 1 },
  default: {},
});
