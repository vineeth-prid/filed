export default function ScoreBar({ value, max = 100, color = "#0B1528", height = 6 }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="w-full bg-offwhite border border-border" style={{ height }}>
      <div className="h-full" style={{ width: `${pct}%`, background: color, transition: "width 600ms cubic-bezier(0.16,1,0.3,1)" }} />
    </div>
  );
}
