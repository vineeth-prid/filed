import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import MethodologySection from "../sections/Methodology";
import { Shield, FileText, Calculator } from "lucide-react";

const SCORES = [
  {
    name: "Career Success",
    formula: "0.45 · Got Jobs + 0.30 · Typical Salary (normalised) + 0.25 · Further Studies (normalised)",
    desc: "A single number out of 100 that combines whether students got jobs, what they typically earned, and whether they chose to study further. Higher = stronger career outcomes overall.",
  },
  {
    name: "Openness",
    formula: "Sum of completeness across 7 disclosure areas, normalised to 0–100",
    desc: "How completely a college shares information across placements, fees, faculty, infrastructure, audits, research and student outcomes. Higher = the college shares more openly.",
  },
  {
    name: "Value For Money",
    formula: "Letter rating from (Typical Salary × Got Jobs %) / What You'll Spend",
    desc: "A letter grade (AAA → BB) that tells you whether the career outcomes are worth what families pay. The ratings are absolute, not just relative to a few colleges.",
  },
  {
    name: "Research & Innovation",
    formula: "Normalised mix of publications, citations and sponsored research disclosed in NIRF and college reports",
    desc: "How research-active a college is at the institutional level. Higher = more active research culture.",
  },
];

export default function MethodologyPage() {
  return (
    <div data-testid="methodology-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-12">
        <div className="mb-12">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono">How We Calculated This · Version 1.0 · Feb 2026</div>
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-bold">How we built every score.</h1>
          <p className="mt-4 text-base text-slate2 max-w-2xl leading-relaxed">
            Every score on Filed has a published formula and a primary source. This page lists them all in one place. Hover any number on a college snapshot to see how that number was worked out.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border border border-border mb-12">
          {[
            { i: Shield, t: "Source-first", d: "We tag every number with the document or filing it came from. No source, no number." },
            { i: FileText, t: "We don\u2019t make stuff up", d: "We show what colleges file publicly. We don\u2019t estimate, infer or extrapolate." },
            { i: Calculator, t: "Open formulas", d: "Composite scores publish their ingredients. Nothing is computed behind a curtain." },
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
