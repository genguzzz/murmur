import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from "react-native-svg";
import { familyOf, type MoodFamily } from "@/lib/theme";

// Mood stamp: color marks the mood family, the pattern varies with the mood.
export function MoodStamp({ mood, family, size = 40 }: { mood?: string; family?: MoodFamily; size?: number }) {
  const fam = family ?? familyOf(mood) ?? "neutral";
  const v = variant(mood);
  const id = `clip-${fam}-${v}-${size}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <ClipPath id={id}>
          <Rect x="0" y="0" width="100" height="100" rx="20" />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${id})`}>{PATTERNS[fam](v)}</G>
      <Rect x="1" y="1" width="98" height="98" rx="19" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
    </Svg>
  );
}

function variant(mood?: string): number {
  if (!mood) return 0;
  let h = 0;
  for (const c of mood) h = (h * 31 + c.charCodeAt(0)) % 997;
  return h % 3;
}

const PATTERNS: Record<MoodFamily, (v: number) => React.ReactNode> = {
  positive: (v) => (
    <>
      <Rect width="100" height="100" fill="#1C2A1B" />
      <Circle cx={v === 1 ? 30 : 22} cy="52" r="34" fill="#3D6B37" />
      <Circle cx="60" cy={v === 2 ? 40 : 48} r="30" fill="#5A9150" opacity={0.9} />
      <Circle cx="92" cy="58" r="24" fill="#3D6B37" opacity={0.85} />
    </>
  ),
  calm: (v) => (
    <>
      <Rect width="100" height="100" fill="#12161D" />
      <Path d={`M0 ${62 - v * 4} Q25 ${54 - v * 4} 50 ${62 - v * 4} T100 ${62 - v * 4} V100 H0 Z`} fill="#26384F" />
      <Path d="M0 74 Q25 66 50 74 T100 74 V100 H0 Z" fill="#3B5A7D" />
      <Path d="M0 86 Q25 79 50 86 T100 86 V100 H0 Z" fill="#6E98C4" />
    </>
  ),
  warm: (v) => (
    <>
      <Rect width="100" height="100" fill="#3A2320" />
      {Array.from({ length: 6 + v }, (_, i) => {
        const n = 6 + v;
        const a0 = Math.PI + (i * Math.PI) / n;
        const a1 = Math.PI + ((i + 1) * Math.PI) / n;
        const r = 140;
        return (
          <Path
            key={i}
            d={`M50 100 L${50 + r * Math.cos(a0)} ${100 + r * Math.sin(a0)} L${50 + r * Math.cos(a1)} ${100 + r * Math.sin(a1)} Z`}
            fill={i % 2 ? "#6E3E31" : "#4E2C25"}
          />
        );
      })}
    </>
  ),
  neutral: (v) => (
    <>
      <Rect width="100" height="100" fill="#1D1711" />
      <Path d={`M0 ${58 + v * 3} C30 ${48 + v * 3} 60 ${70 + v * 3} 100 ${56 + v * 3} V100 H0 Z`} fill="#5B4425" />
      <Path d="M0 70 C30 60 60 82 100 68 V100 H0 Z" fill="#94703A" />
      <Path d="M0 82 C30 74 60 92 100 80 V100 H0 Z" fill="#D9A15B" />
    </>
  ),
  difficult: (v) => (
    <>
      <Rect width="100" height="100" fill="#21141A" />
      <Path d={`M-10 ${40 + v * 4} L110 ${66 - v * 4}`} stroke="#B4535D" strokeWidth="5" />
      <Path d={`M-10 ${66 - v * 4} L110 ${40 + v * 4}`} stroke="#B4535D" strokeWidth="5" />
      <Path d="M-10 48 L110 58" stroke="#E2848A" strokeWidth="2.5" />
      <Path d="M-10 58 L110 48" stroke="#E2848A" strokeWidth="2.5" />
    </>
  ),
};
