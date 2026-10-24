import { Platform } from "react-native";

export type Scheme = "light" | "dark";

const light = {
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
  onPrimary: "#FFFFFF",
  danger: "#C2574A",
  white: "#FFFFFF",
  doodle: "#D8C6AE",
  sheet: "#FFFBF5",
  backdrop: "rgba(40,28,18,0.35)",
  quote: "#F4E9DA",
};

const dark: typeof light = {
  bg: "#141110",
  card: "#1D1916",
  cardMuted: "#241F1B",
  border: "#2F2924",
  text: "#F1EAE2",
  textSoft: "#A99D91",
  textFaint: "#6E645B",
  primary: "#E4A35A",
  primaryDark: "#E4A35A",
  primarySoft: "#3A2B1C",
  onPrimary: "#1A130D",
  danger: "#E0786F",
  white: "#FFFFFF",
  doodle: "#2C2621",
  sheet: "#1A1714",
  backdrop: "rgba(0,0,0,0.55)",
  quote: "#211C17",
};

// Mutable palette: the root layout assigns the active scheme before rendering
// and remounts the tree when it changes, so components can read `colors.x` directly.
export const colors = { ...light };
export let scheme: Scheme = "light";

export function applyScheme(s: Scheme) {
  scheme = s;
  Object.assign(colors, s === "dark" ? dark : light);
}

export const fonts = {
  serif: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" }),
};

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 };

export function shadow() {
  if (scheme === "dark") return {};
  return Platform.select({
    ios: { shadowColor: "#7A5A3A", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
    android: { elevation: 1 },
    default: {},
  });
}

// ---------- moods ----------

export type MoodFamily = "positive" | "calm" | "warm" | "neutral" | "difficult";

export const MOOD_FAMILY: Record<string, MoodFamily> = {
  excited: "positive", happy: "positive", grateful: "positive", hopeful: "positive", proud: "positive", joyful: "positive",
  peaceful: "calm", relaxed: "calm", calm: "calm",
  nostalgic: "warm", loving: "warm", cozy: "warm",
  reflective: "neutral", thoughtful: "neutral", curious: "neutral", neutral: "neutral",
  tired: "difficult", stressed: "difficult", anxious: "difficult", sad: "difficult", frustrated: "difficult", angry: "difficult", lonely: "difficult",
};

export const FAMILY_INFO: Record<MoodFamily, { name: string; examples: string; color: string }> = {
  positive: { name: "积极", examples: "兴奋、感恩、开心", color: "#5E9A55" },
  calm: { name: "平静", examples: "安宁、放松、从容", color: "#6A93BF" },
  warm: { name: "温暖", examples: "怀念、爱、惬意", color: "#B9735E" },
  neutral: { name: "中性", examples: "反思、思考、好奇", color: "#D9A15B" },
  difficult: { name: "困难", examples: "压力、焦虑、沮丧", color: "#D86A73" },
};

export const MOOD_LABELS: Record<string, string> = {
  excited: "兴奋", happy: "开心", grateful: "感恩", hopeful: "期待", proud: "自豪", joyful: "开心",
  peaceful: "安宁", relaxed: "放松", calm: "平静",
  nostalgic: "怀念", loving: "爱", cozy: "惬意",
  reflective: "反思", thoughtful: "思考", curious: "好奇", neutral: "一般",
  tired: "疲惫", stressed: "压力", anxious: "焦虑", sad: "低落", frustrated: "烦躁", angry: "生气", lonely: "孤独",
};

export function familyOf(mood?: string): MoodFamily | undefined {
  return mood ? MOOD_FAMILY[mood] ?? "neutral" : undefined;
}

// Kept for older screens: a single accent per mood (family color).
export const MOOD_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(MOOD_FAMILY).map(([m, f]) => [m, FAMILY_INFO[f].color]),
);
