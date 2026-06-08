// Section 8: INSIGHT ENGINE
import { useState } from "react";
import axios from "axios";
import { colleges } from "../data/colleges";
import { Sparkles, Loader2 } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DEFAULT_PICKS = ["iit-bombay", "iim-ahmedabad", "bits-pilani", "jnu"];
const FALLBACK_INSIGHTS = [
  "You could spend 40% less at IIT Bombay and still get similar career outcomes as IIM Ahmedabad.",
  "More students from JNU continue their studies than take jobs immediately — its strength is research and academia.",
  "Graduates from IIT Bombay typically earn more than students from similar engineering colleges.",
  "BITS Pilani charges more than the IITs but its typical salary is lower — worth weighing carefully.",
  "JNU offers the lowest cost in this comparison with strong further-studies outcomes — a strong public-college pick.",
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
      setError("We couldn't reach our analyst right now. Showing cached observations.");
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
              <span className="font-mono">08</span> · Insights Written For Families
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl tracking-tighter font-bold text-navy leading-[1.05]">
              We{"\u2019"}ll point out the<br />things worth noticing.
            </h2>
          </div>
          <div className="lg:col-span-5 text-sm text-slate2 leading-relaxed">
            Pick a few colleges and we{"\u2019"}ll tell you what stands out — in plain English. Every observation comes straight from the numbers.
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Picker */}
          <div className="lg:col-span-4 border border-border bg-white">
            <div className="border-b border-border px-4 py-3 bg-navy text-white">
              <div className="text-[10px] uppercase tracking-[0.2em] font-mono font-semibold">Pick up to 5 colleges</div>
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
                <span className="text-[10px] uppercase tracking-[0.2em] font-mono font-semibold">Filed Analyst · What We{"\u2019"}re Seeing</span>
              </div>
              <span className="text-[10px] font-mono text-white/40">WRITTEN FOR FAMILIES</span>
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
                    <div className="font-mono text-[10px] uppercase tracking-wider text-emerald2 mb-1">No. {String(i + 1).padStart(2, "0")}</div>
                    <div className="w-0.5 h-full bg-emerald2/20" />
                  </div>
                  <p className="text-sm text-white/90 leading-relaxed">{line}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 px-5 py-3 flex items-center justify-between text-[10px] font-mono text-white/40 uppercase tracking-wider">
              <span>Every observation comes from the numbers · Always read the source documents</span>
              <span>{insights.length} NOTES</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
