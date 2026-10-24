import Svg, { Circle, Path, Rect } from "react-native-svg";

// Small hand-drawn style illustration per entry, chosen deterministically from its id.
export function EntryArt({ seed, size = 48 }: { seed: string; size?: number }) {
  let h = 0;
  for (const c of seed) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  const Art = ARTS[h % ARTS.length];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x="2" y="2" width="96" height="96" rx="18" fill="#F4EBD9" stroke="#E2D4BC" strokeWidth="2" />
      <Art />
    </Svg>
  );
}

const ink = "#2C3A66";
const accent = "#D9764A";
const S = { stroke: ink, strokeWidth: 4, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const ARTS: (() => React.ReactNode)[] = [
  // squiggle + dot
  () => (
    <>
      <Path d="M28 34 C40 22 62 30 52 42 C42 54 22 50 30 62 C38 74 64 70 76 60" {...S} />
      <Path d="M30 72 C44 80 62 78 74 70" {...S} strokeWidth={3} />
      <Circle cx="70" cy="34" r="5" fill={accent} />
    </>
  ),
  // sun over hills
  () => (
    <>
      <Circle cx="60" cy="38" r="12" fill={accent} />
      <Path d="M18 72 C30 56 42 56 52 68 C60 58 72 56 84 72" {...S} />
      <Path d="M24 82 H78" {...S} strokeWidth={3} />
    </>
  ),
  // waves
  () => (
    <>
      <Path d="M20 42 Q30 34 40 42 T60 42 T80 42" {...S} />
      <Path d="M20 56 Q30 48 40 56 T60 56 T80 56" {...S} />
      <Path d="M20 70 Q30 62 40 70 T60 70 T80 70" {...S} stroke={accent} />
    </>
  ),
  // sprout
  () => (
    <>
      <Path d="M50 80 V46" {...S} />
      <Path d="M50 56 C38 56 30 48 30 38 C42 38 50 46 50 56" {...S} />
      <Path d="M50 50 C60 50 70 42 70 30 C58 30 50 38 50 50" {...S} stroke={accent} />
      <Path d="M34 80 H66" {...S} strokeWidth={3} />
    </>
  ),
  // spiral
  () => (
    <>
      <Path d="M52 50 C52 44 60 44 60 50 C60 58 46 60 44 50 C42 38 62 34 68 46 C74 60 58 74 44 70 C30 66 26 46 36 36" {...S} />
      <Circle cx="30" cy="70" r="4" fill={accent} />
    </>
  ),
  // mountain + moon
  () => (
    <>
      <Path d="M18 76 L40 44 L52 60 L62 48 L84 76 Z" {...S} />
      <Path d="M72 26 C64 28 62 40 70 44 C64 46 56 38 60 30 C62 26 68 24 72 26 Z" fill={accent} />
    </>
  ),
];
