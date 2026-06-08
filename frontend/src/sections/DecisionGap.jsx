// Section 2: THE EDUCATION DECISION GAP
import { useEffect, useRef, useState } from "react";

export default function DecisionGap() {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const o = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setVis(true);
    }, { threshold: 0.25 });
    o.observe(node);
    return () => o.disconnect();
  }, []);

  return (
    <section ref={ref} className="border-b border-border bg-white">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-24 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-4">
              <span className="font-mono">02</span> · The Decision Gap
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl tracking-tighter font-bold text-navy leading-[1.05]">
              India sends millions to college every year.
              <span className="text-slate2"> Most decisions are made on the wrong inputs.</span>
            </h2>
            <p className="mt-6 text-sm text-slate2 leading-relaxed max-w-md">
              Filed structures publicly available institutional disclosures so the inputs match the magnitude of the decision.
            </p>
          </div>

          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-px bg-border border border-border">
            {[
              { v: "11,500+", l: "Higher Education Institutions in India" },
              { v: "40M+", l: "Students enrolled in higher education" },
              { v: "₹4.5L Cr", l: "Annual household spend on higher education" },
            ].map((s, i) => (
              <div key={s.l} className={`bg-white p-8 ${vis ? "animate-fade-up" : "opacity-0"}`} style={{ animationDelay: `${i * 120}ms` }}>
                <div className="font-heading font-bold text-4xl tracking-tighter text-navy tabular">{s.v}</div>
                <div className="text-xs text-slate2 mt-2 leading-relaxed">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Inputs comparison */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-px bg-border border border-border">
          <div className="bg-white p-8">
            <div className="text-[10px] uppercase tracking-[0.2em] text-amber2 font-semibold mb-4">Decisions Today Are Often Based On</div>
            <ul className="space-y-3">
              {["Advertisements", "Coaching brochures", "Headline rankings", "Word of mouth", "Highest-package headlines"].map((x) => (
                <li key={x} className="flex items-start gap-3 text-sm text-navy">
                  <span className="dot bg-amber2 mt-1.5 flex-shrink-0" />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-navy text-white p-8">
            <div className="text-[10px] uppercase tracking-[0.2em] text-emerald2 font-semibold mb-4">Filed Lets You Evaluate</div>
            <ul className="space-y-3">
              {["Graduate outcomes (placement & higher studies)", "Estimated cost of attendance", "Institutional transparency", "Faculty ratios & research strength", "Variance between advertised and filed data"].map((x) => (
                <li key={x} className="flex items-start gap-3 text-sm text-white">
                  <span className="dot bg-emerald2 mt-1.5 flex-shrink-0" />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
