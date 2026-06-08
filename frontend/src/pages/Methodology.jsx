import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import MethodologySection from "../sections/Methodology";
import { Shield, FileText, Calculator } from "lucide-react";

const SCORES = [
  {
    name: "Outcome Score",
    formula: "0.45 · Placement + 0.30 · Median Salary (normalized) + 0.25 · Higher Studies (normalized)",
    desc: "Composite of disclosed graduate destinations. Higher = stronger graduate-level outcomes across placement and continued education.",
  },
  {
    name: "Transparency Rating",
    formula: "Sum of completeness across 7 reporting categories, normalized to 0–100",
    desc: "Measures how completely an institution discloses across placements, fees, faculty, infrastructure, audits, research and student outcomes.",
  },
  {
    name: "ROI Rating",
    formula: "Banded scale derived from (Median Salary × Placement %) / Estimated Cost",
    desc: "Letter rating (AAA → BB) reflecting the cost-adjusted graduate outcome. Bands are absolute, not relative to a peer set.",
  },
  {
    name: "Research Indicator",
    formula: "Normalized composite of publications, citations and sponsored research disclosed in NIRF and institution reports",
    desc: "Captures research intensity at the institutional level.",
  },
];

export default function MethodologyPage() {
  return (
    <div data-testid="methodology-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-12">
        <div className="mb-12">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono">Methodology · Version 1.0 · Feb 2026</div>
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-bold">How Filed builds its scores.</h1>
          <p className="mt-4 text-base text-slate2 max-w-2xl leading-relaxed">
            Every composite score on Filed has a published formula and a primary source. This page is the index. Click into individual factsheets to see metric-level calculations on hover.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border border border-border mb-12">
          {[
            { i: Shield, t: "Source-First", d: "We attribute every figure to a primary document. No figure exists on Filed without an attached source." },
            { i: FileText, t: "Filed, Not Inferred", d: "We surface what institutions themselves disclose. We do not estimate, infer or extrapolate." },
            { i: Calculator, t: "Explainable Composites", d: "Composite scores publish their constituent weights. Nothing is computed behind a curtain." },
          ].map((p) => {
            const Ic = p.i;
            return (
              <div key={p.t} className="bg-white p-8">
                <Ic className="w-5 h-5 text-emerald2 mb-5" strokeWidth={1.5} />
                <h3 className="font-heading font-bold text-lg text-navy leading-snug mb-3">{p.t}</h3>
                <p className="text-sm text-slate2 leading-relaxed">{p.d}</p>
              </div>
            );
          })}
        </div>

        {/* Scores */}
        <div className="border border-border bg-white mb-16">
          <div className="border-b border-border px-6 py-4 bg-offwhite">
            <span className="text-[10px] uppercase tracking-[0.2em] font-mono font-semibold text-navy">Composite Scores · Formulas</span>
          </div>
          {SCORES.map((s) => (
            <div key={s.name} className="border-b border-border last:border-b-0 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-3">
                <div className="font-heading font-bold text-navy text-lg">{s.name}</div>
              </div>
              <div className="lg:col-span-5 text-xs font-mono text-navy bg-offwhite border border-border px-3 py-2.5 leading-relaxed">
                {s.formula}
              </div>
              <div className="lg:col-span-4 text-sm text-slate2 leading-relaxed">{s.desc}</div>
            </div>
          ))}
        </div>
      </main>
      <MethodologySection />
      <Footer />
    </div>
  );
}
