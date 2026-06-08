// Section 8: INSIGHT ENGINE
import { useState } from "react";
import axios from "axios";
import { colleges } from "../data/colleges";
import { Sparkles, Loader2 } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DEFAULT_PICKS = ["iit-bombay", "iim-ahmedabad", "bits-pilani", "jnu"];
const FALLBACK_INSIGHTS = [
  "IIT Bombay and IIM Ahmedabad deliver comparable median outcomes, but IIM Ahmedabad does so at roughly 3.1x the estimated total cost.",
  "BITS Pilani's higher-studies cohort (22%) sits below peer engineering institutes, suggesting a placement-led outcome profile.",
  "JNU reports a 54% higher-studies cohort — the highest in the comparison set — consistent with its research-heavy academic mix.",
  "Across the four institutions, transparency scores diverge by 28 points, indicating uneven reporting completeness rather than uneven quality.",
  "Cost-adjusted outcomes favour public Institutes of National Importance, with JNU showing the strongest ratio of median outcome to estimated cost.",
];

export default function InsightEngine() {
  const [picks, setPicks] = useState(DEFAULT_PICKS);
  const [insights, setInsights] = useState(FALLBACK_INSIGHTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const togglePick = (id) => {
    setPicks((p) => p.includes(id) ? p.filter((x) => x !== id) : p.length < 5 ? [...p, id] : p);
  };

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const selected = picks.map((id) => colleges.find((c) => c.id === id)).filter(Boolean);
      const { data } = await axios.post(`${API}/insights`, { colleges: selected });
      if (data?.insights?.length) setInsights(data.insights);
    } catch (e) {
      setError("Unable to reach the analyst service. Showing cached observations.");
      setInsights(FALLBACK_INSIGHTS);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="border-b border-border bg-white relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-fine opacity-30 pointer-events-none" />
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-24 lg:py-32 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10 items-end">
          <div className="lg:col-span-7">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3">
              <span className="font-mono">08</span> · Insight Engine
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl tracking-tighter font-bold text-navy leading-[1.05]">
              Research notes, generated.<br />Sourced, comparable, neutral.
            </h2>
          </div>
          <div className="lg:col-span-5 text-sm text-slate2 leading-relaxed">
            The Insight Engine produces investment-research-style observations from the underlying filed metrics. Every observation is comparative — never accusatory.
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Picker */}
          <div className="lg:col-span-4 border border-border bg-white">
            <div className="border-b border-border px-4 py-3 bg-navy text-white">
              <div className="text-[10px] uppercase tracking-[0.2em] font-mono font-semibold">Universe · Select up to 5</div>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {colleges.map((c) => {
                const active = picks.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => togglePick(c.id)}
                    data-testid={`insight-pick-${c.id}`}
                    className={`w-full text-left px-4 py-3 border-b border-border last:border-b-0 flex items-center justify-between transition-colors ${
                      active ? "bg-offwhite" : "hover:bg-offwhite/50"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className={`w-3.5 h-3.5 border ${active ? "bg-navy border-navy" : "border-border"} flex items-center justify-center`}>
                        {active && <span className="w-1.5 h-1.5 bg-white" />}
                      </span>
                      <span className="text-xs text-navy">{c.short}</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate2 tabular">{c.outcomeScore}</span>
                  </button>
                );
              })}
            </div>
            <div className="border-t border-border p-3">
              <button
                onClick={generate}
                disabled={loading || picks.length < 2}
                data-testid="insight-generate-btn"
                className="w-full inline-flex items-center justify-center gap-2 h-11 bg-navy text-white text-xs tracking-wide hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analysing…</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5" /> Generate Observations</>
                )}
              </button>
            </div>
          </div>

          {/* Observations */}
          <div className="lg:col-span-8 border border-navy bg-navy text-white">
            <div className="border-b border-white/10 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="dot bg-emerald2 animate-pulse-line" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-mono font-semibold">Filed Analyst · Research Notes</span>
              </div>
              <span className="text-[10px] font-mono text-white/40">CLAUDE SONNET 4.5 · NEUTRAL TONE</span>
            </div>

            <div className="p-6 sm:p-8 space-y-5 min-h-[380px]">
              {error && (
                <div className="border border-amber2/40 bg-amber2/10 text-amber2 px-3 py-2 text-[11px] font-mono uppercase tracking-wider">
                  {error}
                </div>
              )}
              {insights.map((line, i) => (
                <div key={i} className="flex gap-4 animate-fade-up" style={{ animationDelay: `${i * 100}ms` }}>
                  <div className="flex-shrink-0">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-emerald2 mb-1">OBS · {String(i + 1).padStart(2, "0")}</div>
                    <div className="w-0.5 h-full bg-emerald2/20" />
                  </div>
                  <p className="text-sm text-white/90 leading-relaxed font-mono">{line}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 px-5 py-3 flex items-center justify-between text-[10px] font-mono text-white/40 uppercase tracking-wider">
              <span>Observations are comparative · Always review primary sources</span>
              <span>{insights.length} NOTES</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
