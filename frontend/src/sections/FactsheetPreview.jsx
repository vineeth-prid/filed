// Section 5: COLLEGE SNAPSHOT PREVIEW (mutual-fund style)
import SourceBadge from "../components/SourceBadge";
import ScoreBar from "../components/ScoreBar";
import { Link } from "react-router-dom";
import { formatINR, colleges } from "../data/colleges";
import { ArrowUpRight } from "lucide-react";
import {
  microPlacement, microSalary, microHigherStudies, microRatio,
  microCost, microStudents, microDiversity, microCareerSuccess,
  microValueForMoney, microTransparency, microConfidence,
} from "../lib/microcopy";

export default function FactsheetPreview() {
  const c = colleges.find((x) => x.id === "iit-bombay");

  return (
    <section id="snapshot" className="border-b border-border bg-offwhite">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-24 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-10 items-end">
          <div className="lg:col-span-7">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3">
              <span className="font-mono">05</span> · College Snapshot
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl tracking-tighter font-bold text-navy leading-[1.05]">
              A quick look at what<br />students can expect.
            </h2>
          </div>
          <div className="lg:col-span-5 text-sm text-slate2 leading-relaxed">
            Every number tells you where it came from. Hover any box to see what it actually means and how we worked it out.
          </div>
        </div>

        {/* Factsheet card */}
        <div className="border border-navy bg-white">
          {/* Header */}
          <div className="border-b border-border p-6 sm:p-8 grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-7">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate2 font-semibold mb-2 font-mono">FACTSHEET · ID FILED-{c.id.toUpperCase()}</div>
              <h3 className="font-heading text-2xl sm:text-3xl font-bold text-navy tracking-tight">{c.name}</h3>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate2">
                <span>{c.city}, {c.state}</span>
                <span className="text-border">|</span>
                <span>{c.type}</span>
                <span className="text-border">|</span>
                <span>Est. {c.established}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {c.accreditation.map((a) => (
                  <span key={a} className="text-[10px] uppercase tracking-wider px-2 py-0.5 border border-border bg-offwhite text-slate2 font-mono">
                    {a}
                  </span>
                ))}
              </div>
            </div>
            <div className="md:col-span-5 grid grid-cols-2 gap-px bg-border border border-border">
              <Big label="Career Success" v={c.outcomeScore} color="#0B1528" />
              <Big label="Value For Money" v={c.roiRating} color="#059669" />
              <Big label="Openness" v={c.transparency} color="#4682B4" />
              <Big label="Research & Innovation" v={c.research} color="#0B1528" />
            </div>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-border border-t border-border">
            <Metric label="Students Who Got Jobs" value={`${c.placementRate}%`} micro={microPlacement(c.placementRate)} source="aicte" year="2024" calc="Placed graduates / total eligible cohort" />
            <Metric label="Typical Salary" value={formatINR(c.medianSalary)} micro={microSalary()} source="nirf" year="2024" calc="Median of disclosed CTC across batch" />
            <Metric label="Chose Further Studies" value={`${c.higherStudies}%`} micro={microHigherStudies(c.higherStudies)} source="nirf" year="2024" calc="Graduates pursuing post-graduate education" />
            <Metric label="Student-To-Teacher Ratio" value={c.facultyRatio} micro={microRatio(c.facultyRatio)} source="aicte" year="2024" calc="Students per regular faculty" />
            <Metric label="Students Enrolled" value={c.students.toLocaleString("en-IN")} micro={microStudents(c.students)} source="ugc" year="2024" calc="On-roll enrolment across programs" />
            <Metric label="Student Mix" value={c.diversity} micro={microDiversity()} source="institution" year="2024" calc="Composite index across state + gender" />
            <Metric label="What You'll Spend" value={formatINR(c.cost)} micro={microCost()} source="institution" year="2024" calc="Tuition + accommodation, full program" />
            <Metric label="Data Confidence" value="6 / 7" micro={microConfidence()} source="regulatory" year="2024" calc="Filings on time across regulators" />
          </div>

          {/* Score bars */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border border-t border-border">
            <div className="bg-white p-6 sm:p-8">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate2 font-semibold mb-4 font-mono">What Drives Career Success</div>
              <div className="text-xs text-slate2 mb-4 leading-relaxed">{microCareerSuccess()}</div>
              <div className="space-y-4">
                <Bar label="Got Jobs" v={c.placementRate} color="#0B1528" />
                <Bar label="Further Studies" v={c.higherStudies + 50} adj={c.higherStudies} color="#4682B4" />
                <Bar label="Salary Strength" v={Math.min(100, c.medianSalary / 50000)} adj={`${formatINR(c.medianSalary)}`} color="#059669" />
              </div>
            </div>
            <div className="bg-white p-6 sm:p-8">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate2 font-semibold mb-4 font-mono">How Much We Can Trust This Data</div>
              <div className="text-xs text-slate2 mb-4 leading-relaxed">{microTransparency(c.transparency)} {microValueForMoney(c.roiRating)}</div>
              <div className="space-y-4">
                <Bar label="Openness" v={c.transparency} color="#0B1528" />
                <Bar label="Research & Innovation" v={c.research} color="#4682B4" />
                <Bar label="Student Mix" v={c.diversity} color="#059669" />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-offwhite">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-slate2 font-mono">Sources:</span>
              <SourceBadge source="nirf" year="2024" />
              <SourceBadge source="aicte" year="2024" />
              <SourceBadge source="ugc" year="2024" />
              <SourceBadge source="institution" year="2024" />
            </div>
            <Link to={`/college/${c.id}`} data-testid="factsheet-open-full" className="inline-flex items-center gap-1 text-xs text-navy hover:text-emerald2 transition-colors font-semibold">
              Open full snapshot <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Big({ label, v, color }) {
  return (
    <div className="bg-white p-4">
      <div className="text-[9px] uppercase tracking-[0.16em] text-slate2 font-semibold">{label}</div>
      <div className="font-heading font-bold text-2xl tabular mt-2" style={{ color }}>{v}</div>
    </div>
  );
}

function Metric({ label, value, source, year, calc, micro }) {
  return (
    <div className="bg-white p-5 group relative cursor-help">
      <div className="text-[9px] uppercase tracking-[0.16em] text-slate2 font-semibold">{label}</div>
      <div className="font-heading font-bold text-xl text-navy mt-1.5 tabular">{value}</div>
      {micro && <div className="text-[11px] text-slate2 mt-1.5 leading-snug">{micro}</div>}
      <div className="mt-3"><SourceBadge source={source} year={year} /></div>
      {/* Tooltip on hover */}
      <div className="absolute inset-x-0 bottom-0 translate-y-full bg-navy text-white p-3 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
        <div className="font-mono uppercase tracking-wider text-white/50 mb-1">How we calculated this</div>
        <div>{calc}</div>
      </div>
    </div>
  );
}

function Bar({ label, v, adj, color }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-navy">{label}</span>
        <span className="font-mono text-slate2 tabular">{adj ?? v}</span>
      </div>
      <ScoreBar value={v} color={color} />
    </div>
  );
}
