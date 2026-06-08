// Section 9: METHODOLOGY & TRUST
import SourceBadge from "../components/SourceBadge";
import { Shield, FileText, Calculator, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";

const SOURCES = [
  { name: "NIRF", full: "National Institutional Ranking Framework", body: "Ministry of Education", year: "2024", desc: "India\u2019s official ranking framework. We use the raw disclosure data — not the rank itself.", key: "nirf" },
  { name: "NAAC", full: "National Assessment and Accreditation Council", body: "Autonomous Body of UGC", year: "2024", desc: "Accreditation grades and self-study reports that colleges submit for review.", key: "naac" },
  { name: "AICTE", full: "All India Council for Technical Education", body: "Statutory Body, MoE", year: "2024", desc: "What technical colleges officially disclose — including faculty, facilities and placements.", key: "aicte" },
  { name: "UGC", full: "University Grants Commission", body: "Statutory Body, MoE", year: "2024", desc: "University-level filings, recognition status and audited returns.", key: "ugc" },
  { name: "College Reports", full: "Annual Reports & Public Disclosures", body: "Direct From Colleges", year: "2024", desc: "Published placement reports, fee schedules and academic calendars from the college itself.", key: "institution" },
  { name: "Regulatory Filings", full: "Audited Statements & Filings", body: "Statutory Submissions", year: "2024", desc: "Audited financial statements and periodic regulatory submissions.", key: "regulatory" },
];

const PILLARS = [
  { icon: Shield, t: "Every score is explainable.", d: "We publish the formula behind every score. Hover any number on a snapshot to see what went into it." },
  { icon: FileText, t: "Every number has a source.", d: "Numbers without sources are opinions. We tag every figure with the filing or report it came from." },
  { icon: Calculator, t: "How we calculated this is right there.", d: "Composite scores show their ingredients. Nothing is computed behind a curtain." },
];

export default function Methodology() {
  return (
    <section id="methodology" className="border-b border-border bg-white">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-24 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
          <div className="lg:col-span-7">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3">
              <span className="font-mono">09</span> · How We Calculated This
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl tracking-tighter font-bold text-navy leading-[1.05]">
              We show our work.
            </h2>
          </div>
          <div className="lg:col-span-5 text-sm text-slate2 leading-relaxed">
            Filed reads what colleges file publicly and turns it into easy answers. Every number you see has a published formula and a primary source. No black boxes.
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
              <span className="text-[10px] uppercase tracking-[0.2em] font-mono font-semibold text-navy">Where The Data Comes From</span>
            </div>
            <span className="text-[10px] font-mono text-slate2">{SOURCES.length} PUBLIC SOURCES</span>
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
            See how we calculated this
          </Link>
          <Link to="/methodology" data-testid="view-sources-btn" className="inline-flex items-center gap-2 h-11 px-5 border border-navy text-navy text-xs tracking-wide hover:bg-navy hover:text-white">
            Where the data comes from
          </Link>
        </div>
      </div>
    </section>
  );
}
