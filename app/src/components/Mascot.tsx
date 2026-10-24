import Svg, { Circle, Path, Rect } from "react-native-svg";

// The little notebook companion. `mood` changes the mouth.
export function Mascot({ size = 44, mood = "smile", glasses }: { size?: number; mood?: "smile" | "talk" | "calm"; glasses?: boolean }) {
  const mouth =
    mood === "talk"
      ? <Circle cx="50" cy="60" r="5" fill="#463022" />
      : mood === "calm"
        ? <Path d="M42 60 Q50 63 58 60" stroke="#463022" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        : <Path d="M41 57 Q50 67 59 57" stroke="#463022" strokeWidth="3.5" fill="none" strokeLinecap="round" />;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x="22" y="14" width="58" height="74" rx="8" fill="#CE8C54" />
      <Rect x="22" y="14" width="10" height="74" rx="5" fill="#B87640" />
      {[22, 32, 42, 52, 62, 72, 82].map((y) => (
        <Rect key={y} x="17" y={y - 2} width="9" height="4" rx="2" fill="#463022" />
      ))}
      <Circle cx="43" cy="46" r="3.6" fill="#463022" />
      <Circle cx="61" cy="46" r="3.6" fill="#463022" />
      <Circle cx="37" cy="55" r="4" fill="#E8968A" opacity={0.6} />
      <Circle cx="67" cy="55" r="4" fill="#E8968A" opacity={0.6} />
      {mouth}
      {glasses ? (
        <>
          <Circle cx="43" cy="46" r="8" fill="none" stroke="#463022" strokeWidth="2.6" />
          <Circle cx="61" cy="46" r="8" fill="none" stroke="#463022" strokeWidth="2.6" />
          <Path d="M51 46 H53" stroke="#463022" strokeWidth="2.6" strokeLinecap="round" />
        </>
      ) : null}
    </Svg>
  );
}
