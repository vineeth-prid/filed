// Section 9: METHODOLOGY & TRUST
import SourceBadge from "../components/SourceBadge";
import { Shield, FileText, Calculator, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";

const SOURCES = [
  { name: "NIRF", full: "National Institutional Ranking Framework", body: "Ministry of Education", year: "2024", desc: "Government's official ranking framework. We use the underlying disclosure data, not the rank.", key: "nirf" },
  { name: "NAAC", full: "National Assessment and Accreditation Council", body: "Autonomous Body of UGC", year: "2024", desc: "Institutional accreditation grades and self-study reports.", key: "naac" },
  { name: "AICTE", full: "All India Council for Technical Education", body: "Statutory Body, MoE", year: "2024", desc: "Approved technical institution disclosures including faculty, infrastructure & placement.", key: "aicte" },
  { name: "UGC", full: "University Grants Commission", body: "Statutory Body, MoE", year: "2024", desc: "University-level filings, recognition status and audited returns.", key: "ugc" },
  { name: "Institution", full: "Institution Disclosures & Annual Reports", body: "Public Filings", year: "2024", desc: "Published placement reports, fee schedules and academic calendars.", key: "institution" },
  { name: "Regulatory", full: "Regulatory Submissions", body: "Statutory Filings", year: "2024", desc: "Periodic regulatory submissions including audited statements.", key: "regulatory" },
];

const PILLARS = [
  { icon: Shield, t: "Every score is explainable.", d: "We publish the formula behind every composite metric. Hover any score on a factsheet to see its inputs and weighting." },
  { icon: FileText, t: "Every metric is sourced.", d: "Numbers without sources are opinions. We attribute every figure to a primary filing, document or disclosure." },
  { icon: Calculator, t: "Every calculation is transparent.", d: "Composite indicators show their constituent metrics. Nothing is computed behind a curtain." },
];

export default function Methodology() {
  return (
    <section id="methodology" className="border-b border-border bg-white">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-24 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
          <div className="lg:col-span-7">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3">
              <span className="font-mono">09</span> · Methodology & Trust
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl tracking-tighter font-bold text-navy leading-[1.05]">
              Trust is the product.
            </h2>
          </div>
          <div className="lg:col-span-5 text-sm text-slate2 leading-relaxed">
            Filed is a research platform applied to higher education. We borrow the discipline of regulated financial research: published methodology, attributed sources, explainable scores.
          </div>
        </div>

        {/* Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border border border-border mb-12">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.t} className="bg-white p-8">
                <Icon className="w-5 h-5 text-emerald2 mb-5" strokeWidth={1.5} />
                <h3 className="font-heading font-bold text-lg text-navy leading-snug mb-3">{p.t}</h3>
                <p className="text-sm text-slate2 leading-relaxed">{p.d}</p>
              </div>
            );
          })}
        </div>

        {/* Sources */}
        <div className="border border-border bg-white">
          <div className="border-b border-border px-6 py-4 flex items-center justify-between bg-offwhite">
            <div className="flex items-center gap-3">
              <BookOpen className="w-4 h-4 text-navy" strokeWidth={1.5} />
              <span className="text-[10px] uppercase tracking-[0.2em] font-mono font-semibold text-navy">Data Sources Indexed</span>
            </div>
            <span className="text-[10px] font-mono text-slate2">{SOURCES.length} PRIMARY SOURCES</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
            {SOURCES.map((s) => (
              <div key={s.name} className="bg-white p-6">
                <div className="flex items-start justify-between mb-3">
                  <SourceBadge source={s.key} year={s.year} />
                </div>
                <div className="font-heading font-bold text-navy text-base">{s.full}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate2 mt-1">{s.body}</div>
                <p className="text-xs text-slate2 mt-4 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/methodology" data-testid="view-methodology-btn" className="inline-flex items-center gap-2 h-11 px-5 bg-navy text-white text-xs tracking-wide hover:bg-navy-700">
            View Full Methodology
          </Link>
          <Link to="/methodology" data-testid="view-sources-btn" className="inline-flex items-center gap-2 h-11 px-5 border border-navy text-navy text-xs tracking-wide hover:bg-navy hover:text-white">
            View Data Sources
          </Link>
        </div>
      </div>
    </section>
  );
}
