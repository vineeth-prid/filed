import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { colleges, formatINR } from "../data/colleges";
import { X, Plus, Sparkles, Loader2, ArrowUpRight } from "lucide-react";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend,
} from "recharts";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DEFAULT = ["iit-bombay", "iim-ahmedabad", "bits-pilani", "vit-vellore"];

// Derived helpers ----------------------------------------------------------
const tuitionOf = (c) => Math.round(c.cost * 0.7);
const hostelOf = (c) => c.cost - tuitionOf(c);
const naacOf = (c) => (c.accreditation || []).find((a) => a.startsWith("NAAC")) || "Not graded";
const nirfRankOf = (c) => {
  // Rank by outcomeScore across the whole dataset (1 = best)
  const sorted = [...colleges].sort((a, b) => b.outcomeScore - a.outcomeScore);
  return sorted.findIndex((x) => x.id === c.id) + 1;
};
const sourceCompleteness = (c) => Math.min(100, Math.round(((c.sources?.length || 0) / 4) * 100));
const roiNumeric = { AAA: 100, AA: 85, A: 70, BBB: 55, BB: 40 };
const facultyToScore = (ratio) => {
  const n = Number((ratio || "1:25").split(":")[1] || 25);
  return Math.max(10, Math.min(100, 130 - n * 4)); // 1:10 -> 90, 1:30 -> 10
};

// Color palette ------------------------------------------------------------
const SERIES_COLORS = ["#0B1528", "#059669", "#4682B4", "#D97706"];

// Comparison sections ------------------------------------------------------
const SECTIONS = [
  {
    title: "Career Outcomes",
    rows: [
      { key: "placementRate", label: "Placement Rate", format: (c) => `${c.placementRate}%`, value: (c) => c.placementRate },
      { key: "medianSalary", label: "Median Salary", format: (c) => formatINR(c.medianSalary), value: (c) => c.medianSalary },
      { key: "higherStudies", label: "Higher Studies %", format: (c) => `${c.higherStudies}%`, value: (c) => c.higherStudies },
    ],
  },
  {
    title: "Cost",
    rows: [
      { key: "tuition", label: "Tuition Fees", format: (c) => formatINR(tuitionOf(c)), value: (c) => tuitionOf(c), lowerBetter: true },
      { key: "hostel", label: "Hostel Cost", format: (c) => formatINR(hostelOf(c)), value: (c) => hostelOf(c), lowerBetter: true },
      { key: "cost", label: "Total Estimated Cost", format: (c) => formatINR(c.cost), value: (c) => c.cost, lowerBetter: true },
    ],
  },
  {
    title: "Academic Quality",
    rows: [
      { key: "nirf", label: "NIRF Rank", format: (c) => `#${nirfRankOf(c)}`, value: (c) => -nirfRankOf(c) },
      { key: "naac", label: "NAAC Grade", format: (c) => naacOf(c), value: (c) => naacOf(c), isText: true },
      { key: "facultyRatio", label: "Faculty Ratio", format: (c) => c.facultyRatio, value: (c) => facultyToScore(c.facultyRatio) },
    ],
  },
  {
    title: "Transparency",
    rows: [
      { key: "transparency", label: "Transparency Score", format: (c) => `${c.transparency} / 100`, value: (c) => c.transparency },
      { key: "sourceCompleteness", label: "Source Completeness", format: (c) => `${sourceCompleteness(c)}%`, value: (c) => sourceCompleteness(c) },
    ],
  },
];

// Natural-language Key Takeaways ------------------------------------------
function generateTakeaways(selected) {
  if (selected.length < 2) return [];
  const out = [];

  // 1) Cost spread
  const byCost = [...selected].sort((a, b) => a.cost - b.cost);
  const cheapest = byCost[0];
  const priciest = byCost[byCost.length - 1];
  if (cheapest && priciest && cheapest.id !== priciest.id) {
    const diff = Math.round(((priciest.cost - cheapest.cost) / priciest.cost) * 100);
    if (diff >= 10) {
      out.push(`${cheapest.short} costs about ${diff}% less than ${priciest.short} across the full program.`);
    }
  }

  // 2) Similar salary, lower cost
  const sorted = [...selected].sort((a, b) => b.medianSalary - a.medianSalary);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = 0; j < sorted.length; j++) {
      if (i === j) continue;
      const a = sorted[i], b = sorted[j];
      const salaryGap = Math.abs(a.medianSalary - b.medianSalary) / Math.max(a.medianSalary, b.medianSalary);
      if (salaryGap < 0.18 && b.cost < a.cost) {
        const costDiff = Math.round(((a.cost - b.cost) / a.cost) * 100);
        if (costDiff >= 15) {
          out.push(`${b.short} sees similar salaries to ${a.short} but its total cost is roughly ${costDiff}% lower.`);
          i = sorted.length; break;
        }
      }
    }
  }

  // 3) Higher studies leader
  const hs = [...selected].sort((a, b) => b.higherStudies - a.higherStudies);
  if (hs.length >= 2 && hs[0].higherStudies - hs[1].higherStudies >= 10) {
    out.push(`${hs[0].short} sends a noticeably larger share of students into further studies (${hs[0].higherStudies}% vs ${hs[1].higherStudies}% at ${hs[1].short}).`);
  }

  // 4) Salary leader
  const sal = [...selected].sort((a, b) => b.medianSalary - a.medianSalary);
  if (sal.length >= 2) {
    const ratio = sal[0].medianSalary / sal[sal.length - 1].medianSalary;
    if (ratio >= 1.5) {
      out.push(`Graduates from ${sal[0].short} typically earn about ${ratio.toFixed(1)}\u00D7 what ${sal[sal.length - 1].short} graduates earn.`);
    }
  }

  // 5) Transparency leader
  const tp = [...selected].sort((a, b) => b.transparency - a.transparency);
  if (tp.length >= 2 && tp[0].transparency - tp[tp.length - 1].transparency >= 20) {
    out.push(`${tp[0].short} shares far more data publicly than ${tp[tp.length - 1].short} (openness ${tp[0].transparency} vs ${tp[tp.length - 1].transparency}).`);
  }

  // 6) Value-for-money winner (outcome per ₹ lakh)
  const vfm = selected.map((c) => ({ c, score: c.outcomeScore / (c.cost / 100000) }))
    .sort((a, b) => b.score - a.score);
  if (vfm.length >= 2 && vfm[0].score / vfm[vfm.length - 1].score >= 1.5) {
    out.push(`Rupee for rupee, ${vfm[0].c.short} delivers the strongest outcomes in this comparison.`);
  }

  return out.slice(0, 5);
}

// =========================================================================
export default function Compare() {
  const [params] = useSearchParams();
  const initial = params.get("ids")?.split(",").filter(Boolean) || DEFAULT;
  const [ids, setIdsState] = useState(initial.slice(0, 4));
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(false);

  const setIds = (updater) => { setIdsState(updater); setInsights([]); };

  const selected = ids.map((id) => colleges.find((c) => c.id === id)).filter(Boolean);
  const remaining = colleges.filter((c) => !ids.includes(c.id));
  const takeaways = useMemo(() => generateTakeaways(selected), [selected]);

  // Radar data — one entry per axis with one key per college
  const radarData = useMemo(() => {
    const axes = [
      { axis: "Placement", get: (c) => c.placementRate },
      { axis: "Salary", get: (c) => Math.min(100, c.medianSalary / 35000) },
      { axis: "ROI", get: (c) => roiNumeric[c.roiRating] || 50 },
      { axis: "Faculty", get: (c) => facultyToScore(c.facultyRatio) },
      { axis: "Transparency", get: (c) => c.transparency },
      { axis: "Research", get: (c) => c.research },
    ];
    return axes.map(({ axis, get }) => {
      const row = { axis };
      selected.forEach((c) => { row[c.id] = Math.round(get(c)); });
      return row;
    });
  }, [selected]);

  const runInsights = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/insights`, { colleges: selected });
      if (data?.insights?.length) setInsights(data.insights);
    } catch (e) {
      setInsights([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid="compare-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-12">
        {/* Header */}
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono">Advanced Compare</div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-bold leading-[1.02]">
              Put colleges side by side.<br />
              <span className="text-slate2">See every number that matters.</span>
            </h1>
          </div>
          <button
            onClick={runInsights}
            disabled={loading || selected.length < 2}
            data-testid="compare-insights-btn"
            className="inline-flex items-center gap-2 h-11 px-5 bg-navy text-white text-xs tracking-wide hover:bg-navy-700 disabled:opacity-40"
          >
            {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading the numbers…</> : <><Sparkles className="w-3.5 h-3.5" /> Get smart insights</>}
          </button>
        </div>

        {/* Hero college cards (CarDekho-style) */}
        <CollegeHeader selected={selected} setIds={setIds} remaining={remaining} />

        {/* Radar + Key Takeaways */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-12">
          <div className="lg:col-span-7 border border-border bg-white">
            <div className="border-b border-border px-5 py-3 bg-navy text-white flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.2em] font-mono font-semibold">Performance Across Six Axes</span>
              <span className="text-[10px] font-mono text-white/50">0 = LOW · 100 = HIGH</span>
            </div>
            <div className="p-4 sm:p-6">
              <div style={{ width: "100%", height: 380 }}>
                <ResponsiveContainer>
                  <RadarChart data={radarData} outerRadius="78%">
                    <PolarGrid stroke="#E2E8F0" />
                    <PolarAngleAxis dataKey="axis" tick={{ fill: "#0B1528", fontSize: 12, fontWeight: 600, fontFamily: "Manrope" }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#94A3B8", fontSize: 10, fontFamily: "JetBrains Mono" }} stroke="#CBD5E1" />
                    {selected.map((c, i) => (
                      <Radar key={c.id} name={c.short} dataKey={c.id} stroke={SERIES_COLORS[i]} fill={SERIES_COLORS[i]} fillOpacity={0.18} strokeWidth={2} />
                    ))}
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: "Inter", paddingTop: 12 }} iconType="circle" />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 border border-border bg-white">
            <div className="border-b border-border px-5 py-3 bg-navy text-white">
              <span className="text-[10px] uppercase tracking-[0.2em] font-mono font-semibold">Key Takeaways</span>
            </div>
            <div className="p-5 space-y-4">
              {takeaways.length === 0 ? (
                <div className="text-sm text-slate2">Pick at least two colleges to see takeaways.</div>
              ) : (
                takeaways.map((t, i) => (
                  <div key={i} className="flex items-start gap-3 animate-fade-up" style={{ animationDelay: `${i * 80}ms` }} data-testid={`takeaway-${i}`}>
                    <span className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-emerald2 text-emerald2 text-[10px] font-mono font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <p className="text-sm text-navy leading-relaxed">{t}</p>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-border px-5 py-3 bg-offwhite text-[10px] font-mono text-slate2 uppercase tracking-wider">
              Generated from disclosed metrics · Always read the source documents
            </div>
          </div>
        </div>

        {/* LLM Smart insights (optional) */}
        {insights.length > 0 && (
          <div className="mt-10 border border-navy bg-navy text-white">
            <div className="border-b border-white/10 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="dot bg-emerald2 animate-pulse-line" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-mono font-semibold">Filed Analyst · What We{"\u2019"}re Seeing</span>
              </div>
              <span className="text-[10px] font-mono text-white/40">WRITTEN FOR FAMILIES</span>
            </div>
            <div className="p-6 space-y-4">
              {insights.map((line, i) => (
                <div key={i} className="flex gap-4 animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-emerald2 flex-shrink-0 w-12">No. {String(i + 1).padStart(2, "0")}</div>
                  <p className="text-sm text-white/90 leading-relaxed">{line}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sticky comparison table */}
        <ComparisonTable selected={selected} setIds={setIds} remaining={remaining} />

        <div className="mt-6 text-xs text-slate2 leading-relaxed border-l-2 border-steel pl-4">
          <span className="font-semibold text-navy">A small note:</span> {"\u201CBest\u201D is only relative to the colleges you\u2019re comparing on this metric \u2014 not an overall ranking. Always read the source documents."}
        </div>
      </main>
      <Footer />
    </div>
  );
}

// =========================================================================
function CollegeHeader({ selected, setIds, remaining }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border">
      {selected.map((c, i) => (
        <article key={c.id} className="bg-white p-5 relative">
          <button
            onClick={() => setIds((p) => p.filter((id) => id !== c.id))}
            data-testid={`compare-remove-${c.id}`}
            className="absolute top-3 right-3 w-6 h-6 border border-border bg-white text-slate2 hover:text-amber2 hover:border-amber2 flex items-center justify-center"
          >
            <X className="w-3 h-3" />
          </button>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: SERIES_COLORS[i] }} />
            <span className="text-[9px] uppercase tracking-wider font-mono text-slate2">{c.city}</span>
          </div>
          <h3 className="font-heading text-lg lg:text-xl font-bold text-navy mt-1.5 leading-tight pr-7">{c.short}</h3>
          <div className="text-[10px] text-slate2 uppercase tracking-wider mt-1 truncate">{c.type.split(" \u2014 ")[0]}</div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniStat k="Outcome" v={c.outcomeScore} />
            <MiniStat k="ROI" v={c.roiRating} highlight="#059669" />
            <MiniStat k="Open" v={c.transparency} />
          </div>
          <Link to={`/college/${c.id}`} className="mt-4 inline-flex items-center gap-1 text-[11px] text-navy hover:text-emerald2 font-semibold">
            Open snapshot <ArrowUpRight className="w-3 h-3" />
          </Link>
        </article>
      ))}
      {ids_padding(selected).map((_, k) => (
        <article key={`empty-${k}`} className="bg-white p-5 flex items-center justify-center min-h-[180px]">
          <AddPicker remaining={remaining} onAdd={(id) => setIds((p) => [...p, id])} />
        </article>
      ))}
    </div>
  );
}

// Pads slots to 4
function ids_padding(selected) {
  return Array.from({ length: Math.max(0, 4 - selected.length) });
}

function MiniStat({ k, v, highlight }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-slate2 font-mono">{k}</div>
      <div className="font-heading font-bold text-base tabular" style={{ color: highlight || "#0B1528" }}>{v}</div>
    </div>
  );
}

function AddPicker({ remaining, onAdd }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative w-full">
      <button
        data-testid="compare-add-btn"
        onClick={() => setOpen((o) => !o)}
        className="w-full inline-flex items-center justify-center gap-2 h-11 border border-dashed border-slate2 text-xs text-slate2 hover:border-navy hover:text-navy"
      >
        <Plus className="w-3.5 h-3.5" /> Add a college
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 max-h-72 overflow-y-auto bg-white border border-navy shadow-xl z-30">
          {remaining.map((c) => (
            <button
              key={c.id}
              data-testid={`compare-add-${c.id}`}
              onClick={() => { onAdd(c.id); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-navy hover:bg-offwhite border-b border-border last:border-b-0"
            >
              {c.short}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================================
function ComparisonTable({ selected, setIds, remaining }) {
  const colCount = selected.length;
  // Sticky header bar + sticky metric column. Use CSS sticky.
  return (
    <div className="mt-12">
      <h2 className="font-heading text-3xl tracking-tighter font-bold mb-6">Every metric, in one place.</h2>

      <div className="border border-border bg-white overflow-x-auto">
        {/* Sticky header */}
        <div className="sticky top-16 z-20 bg-navy text-white border-b border-border">
          <div className="grid" style={{ gridTemplateColumns: `220px repeat(${colCount}, minmax(180px, 1fr))${colCount < 4 ? " minmax(180px, 1fr)" : ""}` }}>
            <div className="px-5 py-3 text-[10px] uppercase tracking-[0.2em] font-mono font-semibold">Metric</div>
            {selected.map((c, i) => (
              <div key={c.id} className="px-5 py-3 border-l border-white/10 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: SERIES_COLORS[i] }} />
                <div className="min-w-0">
                  <div className="font-heading font-bold text-sm leading-tight truncate">{c.short}</div>
                  <div className="text-[10px] text-white/50 mt-0.5">{c.city}</div>
                </div>
              </div>
            ))}
            {colCount < 4 && (
              <div className="px-5 py-3 border-l border-white/10 flex items-center">
                <AddPicker remaining={remaining} onAdd={(id) => setIds((p) => [...p, id])} />
              </div>
            )}
          </div>
        </div>

        {/* Sections */}
        {SECTIONS.map((sec) => (
          <div key={sec.title}>
            {/* Section header row */}
            <div
              className="grid bg-offwhite border-b border-border"
              style={{ gridTemplateColumns: `220px repeat(${colCount}, minmax(180px, 1fr))${colCount < 4 ? " minmax(180px, 1fr)" : ""}` }}
            >
              <div className="sticky left-0 z-10 bg-offwhite px-5 py-3 text-[10px] uppercase tracking-[0.2em] font-mono font-semibold text-navy border-r border-border">
                {sec.title}
              </div>
              <div style={{ gridColumn: `span ${colCount + (colCount < 4 ? 1 : 0)}` }} className="px-5 py-3 text-[10px] uppercase tracking-wider text-slate2 font-mono">
                {sec.rows.length} {sec.rows.length === 1 ? "metric" : "metrics"}
              </div>
            </div>

            {sec.rows.map((row) => {
              const vals = selected.map((c) => row.value(c));
              let bestIdx = -1;
              if (!row.isText && vals.length > 1) {
                let extremum;
                if (row.lowerBetter) {
                  extremum = Math.min(...vals);
                } else {
                  extremum = Math.max(...vals);
                }
                const allEqual = vals.every((v) => v === vals[0]);
                if (!allEqual) bestIdx = vals.indexOf(extremum);
              }

              return (
                <div
                  key={row.key}
                  className="grid border-b border-border last:border-b-0 hover:bg-offwhite/40"
                  style={{ gridTemplateColumns: `220px repeat(${colCount}, minmax(180px, 1fr))${colCount < 4 ? " minmax(180px, 1fr)" : ""}` }}
                >
                  <div className="sticky left-0 z-10 bg-white px-5 py-4 text-xs uppercase tracking-wider text-slate2 font-mono border-r border-border">
                    {row.label}
                  </div>
                  {selected.map((c, i) => {
                    const isBest = i === bestIdx;
                    return (
                      <div key={c.id} className="px-5 py-4 border-l border-border" data-testid={`row-${row.key}-${c.id}`}>
                        <span className={`font-heading font-bold text-base tabular ${isBest ? "text-emerald2" : "text-navy"}`}>
                          {row.format(c)}
                        </span>
                        {isBest && <span className="ml-2 text-[9px] font-mono text-emerald2 uppercase tracking-wider">BEST</span>}
                      </div>
                    );
                  })}
                  {colCount < 4 && <div className="border-l border-border" />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
