import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { colleges, formatINR } from "../data/colleges";
import { X, Plus, Sparkles, Loader2 } from "lucide-react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DEFAULT = ["iit-bombay", "iim-ahmedabad", "bits-pilani", "vit-vellore"];

export default function Compare() {
  const [params] = useSearchParams();
  const initial = params.get("ids")?.split(",").filter(Boolean) || DEFAULT;
  const [ids, setIdsState] = useState(initial.slice(0, 4));
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(false);

  const setIds = (updater) => {
    setIdsState(updater);
    setInsights([]);
  };

  const selected = ids.map((id) => colleges.find((c) => c.id === id)).filter(Boolean);
  const remaining = colleges.filter((c) => !ids.includes(c.id));

  const metrics = [
    { key: "outcomeScore", label: "Career Success", format: (v) => v },
    { key: "roiRating", label: "Value For Money", format: (v) => v, isText: true },
    { key: "placementRate", label: "Students Who Got Jobs", format: (v) => `${v}%` },
    { key: "medianSalary", label: "Typical Salary", format: formatINR },
    { key: "higherStudies", label: "Chose Further Studies", format: (v) => `${v}%` },
    { key: "facultyRatio", label: "Student-To-Teacher Ratio", format: (v) => v, isText: true },
    { key: "transparency", label: "Openness", format: (v) => v },
    { key: "research", label: "Research & Innovation", format: (v) => v },
    { key: "diversity", label: "Student Mix", format: (v) => v },
    { key: "cost", label: "What You'll Spend", format: formatINR, lowerBetter: true },
    { key: "students", label: "Students Enrolled", format: (v) => v.toLocaleString("en-IN") },
  ];

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
        <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono">Compare Colleges</div>
            <h1 className="font-heading text-4xl sm:text-5xl tracking-tighter font-bold">Put up to four colleges side by side.</h1>
            <p className="mt-3 text-sm text-slate2 max-w-2xl">The best value on each row is highlighted in green. Click a metric name to focus on it.</p>
          </div>
          <button
            onClick={runInsights}
            disabled={loading || selected.length < 2}
            data-testid="compare-insights-btn"
            className="inline-flex items-center gap-2 h-11 px-5 bg-navy text-white text-xs tracking-wide hover:bg-navy-700 disabled:opacity-40"
          >
            {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading the numbers…</> : <><Sparkles className="w-3.5 h-3.5" /> Show me what stands out</>}
          </button>
        </div>

        {/* Insight panel */}
        {insights.length > 0 && (
          <div className="mb-8 border border-navy bg-navy text-white">
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

        {/* Comparison table */}
        <div className="border border-border bg-white overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-navy text-white">
                <th className="text-left px-5 py-4 text-[10px] uppercase tracking-[0.2em] font-mono font-semibold w-[220px] sticky left-0 bg-navy">Metric</th>
                {selected.map((c) => (
                  <th key={c.id} className="text-left px-5 py-4 border-l border-white/10">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-heading font-bold text-sm leading-tight">{c.short}</div>
                        <div className="text-[10px] text-white/50 mt-0.5">{c.city} · {c.type.split(" — ")[0]}</div>
                      </div>
                      <button
                        onClick={() => setIds((p) => p.filter((id) => id !== c.id))}
                        data-testid={`compare-remove-${c.id}`}
                        className="text-white/40 hover:text-amber2"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </th>
                ))}
                {ids.length < 4 && (
                  <th className="text-left px-5 py-4 border-l border-white/10 w-[200px]">
                    <Picker remaining={remaining} onAdd={(id) => setIds((p) => [...p, id])} />
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                const values = selected.map((c) => Number(c[m.key]) || 0);
                const best = m.isText ? null : (m.lowerBetter ? Math.min(...values) : Math.max(...values));
                const worst = m.isText ? null : (m.lowerBetter ? Math.max(...values) : Math.min(...values));
                return (
                  <tr key={m.key} className="border-b border-border last:border-b-0">
                    <td className="px-5 py-4 sticky left-0 bg-white">
                      <div className="text-xs uppercase tracking-wider text-slate2 font-mono">{m.label}</div>
                    </td>
                    {selected.map((c) => {
                      const v = c[m.key];
                      const isBest = !m.isText && Number(v) === best && best !== worst;
                      return (
                        <td key={c.id} className="px-5 py-4 border-l border-border">
                          <span className={`font-heading font-bold text-base tabular ${isBest ? "text-emerald2" : "text-navy"}`}>
                            {m.format(v)}
                          </span>
                          {isBest && <span className="ml-2 text-[9px] font-mono text-emerald2 uppercase tracking-wider">BEST</span>}
                        </td>
                      );
                    })}
                    {ids.length < 4 && <td className="border-l border-border" />}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 text-xs text-slate2 leading-relaxed border-l-2 border-steel pl-4">
          <span className="font-semibold text-navy">A small note:</span> {"\u201C"}Best{"\u201D"} is only relative to the colleges you{"\u2019"}re comparing on this metric — not an overall ranking. Always read the source documents.
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Picker({ remaining, onAdd }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        data-testid="compare-add-btn"
        className="inline-flex items-center gap-2 text-xs text-white border border-white/30 hover:border-emerald2 hover:text-emerald2 px-3 h-8"
      >
        <Plus className="w-3 h-3" /> Add a college
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 max-h-72 overflow-y-auto bg-white border border-navy shadow-xl z-20">
          {remaining.map((c) => (
            <button
              key={c.id}
              onClick={() => { onAdd(c.id); setOpen(false); }}
              data-testid={`compare-add-${c.id}`}
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
