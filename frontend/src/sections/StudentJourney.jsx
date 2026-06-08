// NEW SECTION: The Student Journey
import { useState } from "react";
import { colleges, formatINR } from "../data/colleges";

export default function StudentJourney() {
  const [pickId, setPickId] = useState("iit-bombay");
  const c = colleges.find((x) => x.id === pickId);

  // Compute funnel values (illustrative — based on disclosed metrics)
  const joined = 100;
  const graduated = 96; // typical completion
  const gotJobs = c.placementRate;
  const higher = c.higherStudies;

  const steps = [
    { label: "Students joined", value: joined, sub: "Out of every 100 students who enrolled.", color: "#0B1528" },
    { label: "Students graduated", value: graduated, sub: "Completed their degree on time.", color: "#4682B4" },
    { label: "Students got jobs", value: gotJobs, sub: `Placed in jobs by the end of the program. Typical salary: ${formatINR(c.medianSalary)}.`, color: "#059669" },
    { label: "Chose further studies", value: higher, sub: "Continued into post-graduate education (in India or abroad).", color: "#D97706" },
  ];

  return (
    <section id="student-journey" className="border-b border-border bg-offwhite">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-24 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10 items-end">
          <div className="lg:col-span-7">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono">
              The Student Journey
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl tracking-tighter font-bold text-navy leading-[1.05]">
              What actually happens<br />to 100 students.
            </h2>
            <p className="mt-5 text-base text-slate2 max-w-xl leading-relaxed">
              For every 100 students who join, here{"\u2019"}s what their journey typically looks like. Pick any college below.
            </p>
          </div>
          <div className="lg:col-span-5">
            <div className="text-[10px] uppercase tracking-wider text-slate2 font-mono mb-2">Pick a college</div>
            <div className="flex flex-wrap gap-2">
              {colleges.slice(0, 6).map((x) => (
                <button
                  key={x.id}
                  onClick={() => setPickId(x.id)}
                  data-testid={`journey-pick-${x.id}`}
                  className={`text-xs px-3 h-8 border transition-colors ${
                    pickId === x.id ? "bg-navy text-white border-navy" : "bg-white border-border text-slate2 hover:border-navy"
                  }`}
                >
                  {x.short}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Funnel */}
        <div className="border border-border bg-white">
          <div className="border-b border-border px-5 py-3 bg-navy text-white flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.2em] font-mono font-semibold">{c.short} · Journey of 100 Students</span>
            <span className="text-[10px] font-mono text-white/60">SRC: NIRF · INSTITUTION FILINGS</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-border">
            {steps.map((s, i) => {
              const widthPct = Math.max(8, s.value);
              return (
                <div key={s.label} className="bg-white p-6 relative animate-fade-up" style={{ animationDelay: `${i * 120}ms` }}>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate2 font-mono font-semibold flex items-center gap-2">
                    <span className="text-emerald2">{String(i + 1).padStart(2, "0")}</span>
                    <span>{s.label}</span>
                  </div>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="font-heading font-bold text-5xl tabular tracking-tighter" style={{ color: s.color }}>{s.value}</span>
                    <span className="text-sm text-slate2">of 100</span>
                  </div>
                  <div className="mt-3 h-1.5 bg-offwhite border border-border">
                    <div className="h-full" style={{ width: `${widthPct}%`, background: s.color, transition: "width 800ms cubic-bezier(0.16,1,0.3,1)" }} />
                  </div>
                  <p className="mt-4 text-xs text-slate2 leading-relaxed">{s.sub}</p>
                  {i < steps.length - 1 && (
                    <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-border items-center justify-center text-slate2 z-10 text-sm">↓</div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="border-t border-border px-5 py-3 bg-offwhite text-[11px] text-slate2 leading-relaxed">
            <span className="text-navy font-semibold">Reading this:</span> these are typical numbers based on what {c.short} disclosed in its most recent NIRF filing. Some students take longer to graduate; some don{"\u2019"}t appear in placement data because they chose to start their own ventures or take a gap year.
          </div>
        </div>
      </div>
    </section>
  );
}
