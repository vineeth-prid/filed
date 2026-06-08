// Section 6: DISCLOSURE COMPARISON
import { colleges, formatINR, variance, varianceBand } from "../data/colleges";
import { useState } from "react";

export default function DisclosureComparison() {
  const [selected, setSelected] = useState("vit-vellore");
  const c = colleges.find((x) => x.id === selected);

  const rows = [
    {
      metric: "Placement Statistic",
      advertised: `${c.advertised.placementShown}%`,
      filed: `${c.filed.placementReported}%`,
      v: Math.abs(c.advertised.placementShown - c.filed.placementReported) * 1.5,
      advNote: "As communicated in marketing collateral",
      filNote: "Reported placement outcome (NIRF filing)",
    },
    {
      metric: "Headline Salary Figure",
      advertised: formatINR(c.advertised.highest),
      filed: formatINR(c.filed.median),
      v: variance(c.advertised.highest, c.filed.median),
      advNote: "Highest package figure",
      filNote: "Median salary across reporting batch",
    },
    {
      metric: "Average Salary",
      advertised: formatINR(c.advertised.average),
      filed: formatINR(c.filed.average),
      v: variance(c.advertised.average, c.filed.average),
      advNote: "Communicated average",
      filNote: "Disclosed average across batch",
    },
    {
      metric: "Higher Studies Data",
      advertised: "Not Disclosed",
      filed: `${c.filed.higherStudiesReported}%`,
      v: c.filed.higherStudiesReported < 20 ? 35 : 18,
      advNote: "Information not surfaced in marketing",
      filNote: "Higher studies cohort (NIRF filing)",
    },
  ];

  return (
    <section id="disclosure" className="border-b border-border bg-white">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-24 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
          <div className="lg:col-span-7">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3">
              <span className="font-mono">06</span> · Disclosure Comparison
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl tracking-tighter font-bold text-navy leading-[1.05]">
              Advertised information,<br />against regulatory filings.
            </h2>
          </div>
          <div className="lg:col-span-5 text-sm text-slate2 leading-relaxed">
            Different metrics may measure different student populations and reporting methodologies. We surface the gap — you review the source documents.
          </div>
        </div>

        {/* Institution picker */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate2 font-mono mr-2">Institution:</span>
          {colleges.slice(0, 8).map((x) => (
            <button
              key={x.id}
              onClick={() => setSelected(x.id)}
              data-testid={`disclosure-pick-${x.id}`}
              className={`text-xs px-3 h-8 border transition-colors ${
                selected === x.id ? "bg-navy text-white border-navy" : "bg-white border-border text-slate2 hover:border-navy"
              }`}
            >
              {x.short}
            </button>
          ))}
        </div>

        <div className="border border-border bg-white">
          {/* table header */}
          <div className="grid grid-cols-12 gap-0 border-b border-border bg-offwhite">
            <div className="col-span-3 px-5 py-3 text-[10px] uppercase tracking-[0.2em] font-mono text-slate2 font-semibold">Metric</div>
            <div className="col-span-4 px-5 py-3 text-[10px] uppercase tracking-[0.2em] font-mono text-amber2 font-semibold border-l border-border">Institution Communication</div>
            <div className="col-span-3 px-5 py-3 text-[10px] uppercase tracking-[0.2em] font-mono text-emerald2 font-semibold border-l border-border">Regulatory Disclosure</div>
            <div className="col-span-2 px-5 py-3 text-[10px] uppercase tracking-[0.2em] font-mono text-slate2 font-semibold border-l border-border">Variance</div>
          </div>

          {rows.map((r) => {
            const band = varianceBand(r.v);
            return (
              <div key={r.metric} className="grid grid-cols-12 border-b border-border last:border-b-0 hover:bg-offwhite/50 transition-colors">
                <div className="col-span-3 px-5 py-5">
                  <div className="text-sm font-semibold text-navy">{r.metric}</div>
                </div>
                <div className="col-span-4 px-5 py-5 border-l border-border">
                  <div className="font-heading text-lg font-bold text-navy tabular">{r.advertised}</div>
                  <div className="text-[10px] text-slate2 mt-1">{r.advNote}</div>
                </div>
                <div className="col-span-3 px-5 py-5 border-l border-border">
                  <div className="font-heading text-lg font-bold text-navy tabular">{r.filed}</div>
                  <div className="text-[10px] text-slate2 mt-1">{r.filNote}</div>
                </div>
                <div className="col-span-2 px-5 py-5 border-l border-border">
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono uppercase tracking-wider border"
                    style={{ borderColor: band.color + "44", color: band.color, background: band.bg }}
                  >
                    <span className="dot" style={{ background: band.color }} />
                    {band.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 border-l-2 border-steel bg-offwhite px-5 py-4 text-xs text-slate2 leading-relaxed">
          <span className="font-semibold text-navy">Note:</span> Different metrics may measure different student populations and reporting methodologies. Always review the underlying source documents before drawing conclusions.
        </div>
      </div>
    </section>
  );
}
