// Section 3: COLLEGE MARKET LANDSCAPE — Signature Scatter Plot
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ZAxis, ResponsiveContainer, Tooltip } from "recharts";
import { colleges, formatINR, transparencyBand } from "../data/colleges";
import { Link } from "react-router-dom";

export default function MarketLandscape() {
  const data = colleges.map((c) => ({
    ...c,
    x: c.cost / 100000,  // in lakhs
    y: c.medianSalary / 100000,
    z: c.students,
  }));

  // Split by transparency band for color
  const highT = data.filter((d) => d.transparency >= 80);
  const modT = data.filter((d) => d.transparency >= 65 && d.transparency < 80);
  const lowT = data.filter((d) => d.transparency < 65);

  return (
    <section className="border-b border-border bg-offwhite">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-24 lg:py-32">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3">
              <span className="font-mono">03</span> · Market Landscape
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl tracking-tighter font-bold text-navy leading-[1.05]">
              Explore the higher<br />education landscape.
            </h2>
            <p className="mt-4 text-sm text-slate2 max-w-md leading-relaxed">
              Understand how institutions compare across cost, outcomes and transparency. Bubble size reflects student strength.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 text-[10px] uppercase tracking-wider text-slate2 font-mono">
            <Legend color="#059669" label="High Transparency" />
            <Legend color="#4682B4" label="Moderate" />
            <Legend color="#D97706" label="Low" />
          </div>
        </div>

        <div className="border border-border bg-white">
          {/* axis labels */}
          <div className="flex items-center justify-between border-b border-border px-4 h-10 bg-navy text-white">
            <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">Cost vs Outcome · Median Graduate Salary (₹ L)</span>
            <span className="text-[10px] font-mono text-white/60">SRC: NIRF 2024 · INSTITUTION FILINGS</span>
          </div>

          <div className="p-4 sm:p-6">
            <div style={{ width: "100%", height: 480 }}>
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 20, right: 30, bottom: 60, left: 60 }}>
                  <CartesianGrid stroke="#E2E8F0" strokeDasharray="2 4" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Cost"
                    unit="L"
                    domain={[0, 30]}
                    tick={{ fill: "#475569", fontSize: 11, fontFamily: "JetBrains Mono" }}
                    label={{ value: "Estimated Total Cost (₹ Lakhs) →", position: "insideBottom", offset: -10, fill: "#475569", fontSize: 11 }}
                    stroke="#94A3B8"
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Median Salary"
                    unit="L"
                    domain={[0, 40]}
                    tick={{ fill: "#475569", fontSize: 11, fontFamily: "JetBrains Mono" }}
                    label={{ value: "Median Graduate Outcome (₹ Lakhs) ↑", angle: -90, position: "insideLeft", fill: "#475569", fontSize: 11 }}
                    stroke="#94A3B8"
                  />
                  <ZAxis type="number" dataKey="z" range={[60, 600]} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#0B1528", strokeDasharray: "4 4" }} />
                  <Scatter data={highT} fill="#059669" fillOpacity={0.55} stroke="#059669" strokeWidth={1.5} />
                  <Scatter data={modT} fill="#4682B4" fillOpacity={0.55} stroke="#4682B4" strokeWidth={1.5} />
                  <Scatter data={lowT} fill="#D97706" fillOpacity={0.55} stroke="#D97706" strokeWidth={1.5} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border-t border-border px-4 py-2.5 flex items-center justify-between bg-offwhite text-[10px] font-mono uppercase tracking-wider text-slate2">
            <span>{"Hover any institution for filed metrics \u00B7 Click \u201COpen Intelligence\u201D to inspect"}</span>
            <Link to="/colleges" data-testid="landscape-explore-link" className="text-navy hover:underline">Open Browser →</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-full" style={{ background: color, opacity: 0.55, border: `1.5px solid ${color}` }} />
      <span>{label}</span>
    </span>
  );
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const band = transparencyBand(d.transparency);
  return (
    <div className="bg-white border border-navy shadow-xl p-4 min-w-[260px]">
      <div className="flex items-start justify-between gap-3 pb-2 border-b border-border">
        <div>
          <div className="font-heading font-bold text-navy text-sm">{d.short}</div>
          <div className="text-[10px] text-slate2 uppercase tracking-wider">{d.city} · {d.type.split(" — ")[0]}</div>
        </div>
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-navy text-white">{d.roiRating}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3 text-[11px]">
        <Row k="Median Salary" v={formatINR(d.medianSalary)} />
        <Row k="Placement" v={`${d.placementRate}%`} />
        <Row k="Outcome Score" v={d.outcomeScore} />
        <Row k="Est. Cost" v={formatINR(d.cost)} />
      </div>
      <div className="mt-3 pt-2 border-t border-border flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-slate2">Transparency</span>
        <span className="text-[10px] font-mono uppercase font-bold" style={{ color: band.color }}>
          {band.label} · {d.transparency}
        </span>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-slate2">{k}</div>
      <div className="font-mono font-semibold text-navy tabular mt-0.5">{v}</div>
    </div>
  );
}
