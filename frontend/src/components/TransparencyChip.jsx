import { transparencyBand } from "../data/colleges";

export default function TransparencyChip({ value }) {
  const band = transparencyBand(value);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border"
      style={{ borderColor: band.color + "44", color: band.color, background: band.bg }}
      data-testid="transparency-chip"
    >
      <span className="dot" style={{ background: band.color }} />
      {band.label} · {value}
    </span>
  );
}
