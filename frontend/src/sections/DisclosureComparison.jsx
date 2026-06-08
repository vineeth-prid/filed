// Section 6: DISCLOSURE COMPARISON
import { colleges, formatINR, variance, varianceBand } from "../data/colleges";
import { useState } from "react";

export default function DisclosureComparison() {
  const [selected, setSelected] = useState("vit-vellore");
  const c = colleges.find((x) => x.id === selected);

  const rows = [
    {
      metric: "Got Jobs",
      advertised: `${c.advertised.placementShown}%`,
      filed: `${c.filed.placementReported}%`,
      v: Math.abs(c.advertised.placementShown - c.filed.placementReported) * 1.5,
      advNote: "As shown in marketing materials",
      filNote: "As reported in NIRF filing",
    },
    {
      metric: "Headline Salary",
      advertised: formatINR(c.advertised.highest),
      filed: formatINR(c.filed.median),
      v: variance(c.advertised.highest, c.filed.median),
      advNote: "Highest package figure shown publicly",
      filNote: "Typical salary across the batch",
    },
    {
      metric: "Average Salary",
      advertised: formatINR(c.advertised.average),
      filed: formatINR(c.filed.average),
      v: variance(c.advertised.average, c.filed.average),
      advNote: "Average shown in brochures",
      filNote: "Average reported to regulators",
    },
    {
      metric: "Students Who Chose Further Studies",
      advertised: "Not shown",
      filed: `${c.filed.higherStudiesReported}%`,
      v: c.filed.higherStudiesReported < 20 ? 35 : 18,
      advNote: "Not surfaced in marketing materials",
      filNote: "Reported in NIRF filing",
    },
  ];

  return (
    <section id="disclosure" className="border-b border-border bg-white">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-24 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
          <div className="lg:col-span-7">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3">
              <span className="font-mono">06</span> · What The College Says vs What Was Reported
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl tracking-tighter font-bold text-navy leading-[1.05]">
              The numbers in the brochure,<br />next to the numbers they filed.
            </h2>
          </div>
          <div className="lg:col-span-5 text-sm text-slate2 leading-relaxed">
            Sometimes the marketing version of a college is different from what it reports to the government. We show both, side by side — you decide what matters.
          </div>
        </div>

        {/* Institution picker */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate2 font-mono mr-2">Pick a college:</span>
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
            <div className="col-span-4 px-5 py-3 text-[10px] uppercase tracking-[0.2em] font-mono text-amber2 font-semibold border-l border-border">What The College Highlights</div>
            <div className="col-span-3 px-5 py-3 text-[10px] uppercase tracking-[0.2em] font-mono text-emerald2 font-semibold border-l border-border">Reported To Government Agencies</div>
            <div className="col-span-2 px-5 py-3 text-[10px] uppercase tracking-[0.2em] font-mono text-slate2 font-semibold border-l border-border">Gap</div>
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
          <span className="font-semibold text-navy">A small note:</span> these numbers might measure slightly different groups of students. A gap doesn{"\u2019"}t automatically mean something is wrong. It usually means the marketing version highlights the best-case story, while the filing covers everyone. Always read the source documents before deciding.
        </div>
      </div>
    </section>
  );
}
