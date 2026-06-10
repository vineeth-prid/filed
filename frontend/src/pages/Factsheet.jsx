import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getCollege, formatINR, transparencyBand, variance, varianceBand } from "../data/colleges";
import SourceBadge from "../components/SourceBadge";
import ScoreBar from "../components/ScoreBar";
import TransparencyChip from "../components/TransparencyChip";
import { ArrowUpRight, Download, FileText, Bookmark, BookmarkCheck, Check } from "lucide-react";
import {
  microPlacement, microSalary, microHigherStudies, microRatio,
  microCost, microStudents, microFaculty, microDiversity,
  microCareerSuccess, microValueForMoney, microTransparency, microConfidence,
} from "../lib/microcopy";
import { useShortlist } from "../lib/shortlistStore";

export default function Factsheet() {
  const { id } = useParams();
  const c = getCollege(id);
  const sl = useShortlist();
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (c) sl.markViewed(c.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const savedListIds = c ? sl.state.items.filter((i) => i.collegeId === c.id).map((i) => i.listId) : [];
  const isInAnyList = savedListIds.length > 0;
  const toggleList = (listId) => {
    if (!c) return;
    if (savedListIds.includes(listId)) {
      const existing = sl.state.items.find((i) => i.collegeId === c.id && i.listId === listId);
      if (existing) sl.removeItem(existing.id);
    } else {
      sl.addToList(c.id, listId);
    }
  };

  if (!c) {
    return (
      <div className="min-h-screen bg-offwhite">
        <Navbar />
        <div className="max-w-[1400px] mx-auto px-6 py-24 text-center">
          <h1 className="font-heading text-3xl text-navy">We couldn{"\u2019"}t find that college.</h1>
          <Link to="/colleges" className="mt-6 inline-block text-emerald2 hover:underline">← Browse all colleges</Link>
        </div>
        <Footer />
      </div>
    );
  }

  const band = transparencyBand(c.transparency);
  const variances = [
    { metric: "Headline salary vs median", v: variance(c.advertised.highest, c.filed.median) },
    { metric: "Average salary disclosed vs filed", v: variance(c.advertised.average, c.filed.average) },
    { metric: "Placement statistic shown vs reported", v: Math.abs(c.advertised.placementShown - c.filed.placementReported) * 1.5 },
  ];

  return (
    <div data-testid="factsheet-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-slate2 mb-6">
          <Link to="/" className="hover:text-navy">Filed</Link>
          <span>/</span>
          <Link to="/colleges" className="hover:text-navy">Colleges</Link>
          <span>/</span>
          <span className="text-navy">{c.short}</span>
        </div>

        {/* Header */}
        <div className="border border-navy bg-white">
          <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 border-b border-border">
            <div className="lg:col-span-8">
              <div className="text-[10px] uppercase tracking-[0.2em] font-mono text-slate2 mb-2">FILED ID · {c.id.toUpperCase()}</div>
              <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl tracking-tighter font-bold text-navy leading-[1.05]">{c.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate2">
                <span>{c.city}, {c.state}</span>
                <span className="text-border">|</span>
                <span>{c.type}</span>
                <span className="text-border">|</span>
                <span>Established {c.established}</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {c.accreditation.map((a) => (
                  <span key={a} className="text-[10px] uppercase tracking-wider px-2 py-1 border border-border bg-offwhite text-slate2 font-mono">{a}</span>
                ))}
                <TransparencyChip value={c.transparency} />
              </div>
            </div>
            <div className="lg:col-span-4 flex flex-col gap-2 justify-end relative">
              <Link to={`/compare?ids=${c.id}`} data-testid="factsheet-compare-btn" className="inline-flex items-center justify-between gap-2 h-11 px-5 bg-navy text-white text-xs">
                Add to comparison <ArrowUpRight className="w-4 h-4" />
              </Link>
              <button
                onClick={() => setPickerOpen((o) => !o)}
                data-testid="factsheet-save-btn"
                className={`inline-flex items-center justify-between gap-2 h-11 px-5 border text-xs transition-colors ${isInAnyList ? "border-emerald2 text-emerald2 bg-emerald2/5" : "border-navy text-navy hover:bg-navy hover:text-white"}`}
              >
                {isInAnyList ? <>Saved to shortlist <BookmarkCheck className="w-4 h-4" /></> : <>Save to shortlist <Bookmark className="w-4 h-4" /></>}
              </button>
              {pickerOpen && (
                <div className="absolute right-0 top-full mt-2 w-full bg-white border border-navy shadow-xl z-30">
                  <div className="px-3 py-2 border-b border-border text-[10px] uppercase tracking-wider font-mono text-slate2">Pick a list</div>
                  {sl.state.lists.map((l) => {
                    const checked = savedListIds.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        onClick={() => toggleList(l.id)}
                        data-testid={`save-to-list-${l.id}`}
                        className="w-full text-left px-3 py-2 text-xs text-navy hover:bg-offwhite border-b border-border last:border-b-0 flex items-center gap-2"
                      >
                        <span className={`w-3.5 h-3.5 border ${checked ? "bg-navy border-navy" : "border-border"} flex items-center justify-center flex-shrink-0`}>
                          {checked && <Check className="w-2 h-2 text-white" strokeWidth={3} />}
                        </span>
                        {l.name}
                      </button>
                    );
                  })}
                  <Link
                    to="/shortlist"
                    className="block px-3 py-2 text-[11px] text-center text-navy hover:text-emerald2 border-t border-border bg-offwhite font-semibold"
                  >
                    Open my shortlist →
                  </Link>
                </div>
              )}
              <button className="inline-flex items-center justify-between gap-2 h-11 px-5 border border-border text-slate2 text-xs hover:border-navy hover:text-navy">
                Download snapshot <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border-b border-border">
            <Kpi label="Career Success" value={c.outcomeScore} color="#0B1528" />
            <Kpi label="Value For Money" value={c.roiRating} color="#059669" />
            <Kpi label="Openness" value={c.transparency} color={band.color} />
            <Kpi label="Research & Innovation" value={c.research} color="#4682B4" />
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-border border-b border-border">
            <Metric label="Students Who Got Jobs" value={`${c.placementRate}%`} micro={microPlacement(c.placementRate)} source="aicte" year="2024" calc="Placed graduates / total eligible cohort" />
            <Metric label="Typical Salary" value={formatINR(c.medianSalary)} micro={microSalary()} source="nirf" year="2024" calc="Median of disclosed CTC across batch" />
            <Metric label="Chose Further Studies" value={`${c.higherStudies}%`} micro={microHigherStudies(c.higherStudies)} source="nirf" year="2024" calc="Graduates pursuing PG education" />
            <Metric label="Student-To-Teacher Ratio" value={c.facultyRatio} micro={microRatio(c.facultyRatio)} source="aicte" year="2024" calc="Students per regular faculty" />
            <Metric label="Students Enrolled" value={c.students.toLocaleString("en-IN")} micro={microStudents(c.students)} source="ugc" year="2024" calc="On-roll enrolment across programs" />
            <Metric label="Teachers On Roll" value={c.faculty.toLocaleString("en-IN")} micro={microFaculty(c.faculty)} source="aicte" year="2024" calc="Regular full-time faculty" />
            <Metric label="Student Mix" value={c.diversity} micro={microDiversity()} source="institution" year="2024" calc="Composite across state + gender" />
            <Metric label="What You'll Spend" value={formatINR(c.cost)} micro={microCost()} source="institution" year="2024" calc="Tuition + accommodation, full program" />
          </div>

          {/* Composition */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border border-b border-border">
            <div className="bg-white p-6 sm:p-8">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate2 font-semibold mb-2 font-mono">What Drives Career Success</div>
              <div className="text-xs text-slate2 mb-5 leading-relaxed">{microCareerSuccess()}</div>
              <div className="space-y-5">
                <Bar label="Got Jobs" v={c.placementRate} adj={`${c.placementRate}%`} color="#0B1528" />
                <Bar label="Further Studies" v={c.higherStudies * 1.8} adj={`${c.higherStudies}%`} color="#4682B4" />
                <Bar label="Salary Strength" v={Math.min(100, (c.medianSalary / 50000))} adj={formatINR(c.medianSalary)} color="#059669" />
                <Bar label="Career Success Score" v={c.outcomeScore} adj={c.outcomeScore} color="#0B1528" />
              </div>
            </div>
            <div className="bg-white p-6 sm:p-8">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate2 font-semibold mb-2 font-mono">How Much We Can Trust This Data</div>
              <div className="text-xs text-slate2 mb-5 leading-relaxed">{microTransparency(c.transparency)} {microValueForMoney(c.roiRating)}</div>
              <div className="space-y-5">
                <Bar label="Openness" v={c.transparency} adj={c.transparency} color={band.color} />
                <Bar label="Research & Innovation" v={c.research} adj={c.research} color="#4682B4" />
                <Bar label="Student Mix" v={c.diversity} adj={c.diversity} color="#059669" />
                <Bar label="Data Confidence" v={86} adj="6 / 7" color="#0B1528" />
              </div>
            </div>
          </div>

          {/* Variance summary */}
          <div className="p-6 sm:p-8 border-b border-border">
            <div className="flex items-center justify-between mb-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate2 font-semibold font-mono">Marketing vs Reported · Where The Numbers Differ</div>
              <FileText className="w-4 h-4 text-slate2" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border border border-border">
              {variances.map((v) => {
                const b = varianceBand(v.v);
                return (
                  <div key={v.metric} className="bg-white p-5">
                    <div className="text-xs text-slate2 mb-3">{v.metric}</div>
                    <div className="flex items-center justify-between">
                      <span className="font-heading font-bold text-2xl tabular" style={{ color: b.color }}>{v.v.toFixed(0)}%</span>
                      <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 border" style={{ borderColor: b.color + "44", color: b.color, background: b.bg }}>{b.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-slate2 leading-relaxed">
              Marketing and filings can show different numbers because they measure slightly different groups. A gap doesn{"\u2019"}t automatically mean something is wrong — but it{"\u2019"}s worth understanding.
            </p>
          </div>

          {/* Footer with sources */}
          <div className="px-6 py-4 flex flex-wrap items-center gap-2 bg-offwhite">
            <span className="text-[10px] uppercase tracking-wider text-slate2 font-mono">Sources used in this snapshot:</span>
            {c.sources.map((s) => (
              <span key={s} className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 border border-border bg-white text-navy">{s}</span>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div className="bg-white p-5">
      <div className="text-[9px] uppercase tracking-[0.16em] text-slate2 font-semibold">{label}</div>
      <div className="font-heading font-bold text-3xl mt-2 tabular" style={{ color }}>{value}</div>
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
        <span className="font-mono text-slate2 tabular">{adj}</span>
      </div>
      <ScoreBar value={v} color={color} height={8} />
    </div>
  );
}
