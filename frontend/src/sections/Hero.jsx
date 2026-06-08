// Section 1: HERO
import { ArrowUpRight, Plus } from "lucide-react";
import { Link } from "react-router-dom";
export default function Hero() {
  return (
    <section className="relative border-b border-border bg-offwhite overflow-hidden">
      {/* Subtle grid backdrop */}
      <div className="absolute inset-0 bg-grid opacity-60 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-offwhite/0 via-offwhite/0 to-offwhite pointer-events-none" />

      {/* Bloomberg-style ticker */}
      <div className="relative border-b border-border bg-white/60">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
          <div className="flex items-center h-9 gap-6 text-[11px] font-mono text-slate2 overflow-hidden whitespace-nowrap">
            <span className="text-navy font-semibold tracking-wider">FILED · INTELLIGENCE TICKER</span>
            <div className="flex-1 overflow-hidden">
              <div className="flex gap-10 animate-ticker" style={{ width: "max-content" }}>
                {[...Array(2)].map((_, k) => (
                  <div key={k} className="flex gap-10">
                    <span>IIT-B · OUTCOME 94 <span className="text-emerald2">▲</span> 2.1%</span>
                    <span>IIM-A · MEDIAN ₹34.5L <span className="text-emerald2">▲</span> 4.8%</span>
                    <span>BITS-P · TRANSPARENCY 81 <span className="text-amber2">●</span> STABLE</span>
                    <span>NIT-T · ROI AAA <span className="text-emerald2">▲</span> RECONFIRMED</span>
                    <span>JNU · HIGHER STUDIES 54% <span className="text-emerald2">▲</span> 1.2%</span>
                    <span>VIT · DISCLOSURE VARIANCE MODERATE <span className="text-amber2">●</span></span>
                    <span>DU · PLACEMENT 64% · NIRF 2024 FILING</span>
                    <span>SRM · TRANSPARENCY 58 · DISCLOSURE GAP TRACKED</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 pt-20 pb-24 lg:pt-28 lg:pb-32 grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Left: typography */}
        <div className="lg:col-span-7">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold animate-fade-up" style={{ animationDelay: "60ms" }}>
            <span className="dot bg-emerald2" />
            <span>Education Due Diligence Platform · Est. 2026</span>
          </div>

          <h1 className="mt-8 font-heading text-[44px] sm:text-[58px] lg:text-[76px] leading-[1.02] tracking-tighter font-bold text-navy animate-fade-up" style={{ animationDelay: "120ms" }}>
            Choosing a college<br />
            shouldn{"\u2019"}t feel like<br />
            <span className="relative inline-block">
              <span className="relative">
                guesswork
                <svg className="absolute -bottom-2 left-0 w-full" height="14" viewBox="0 0 200 14" fill="none">
                  <path d="M2 9 Q 60 1, 100 7 T 198 6" stroke="#059669" strokeWidth="3" strokeLinecap="round" className="animate-draw" />
                </svg>
              </span>
              .
            </span>
          </h1>

          <p className="mt-10 max-w-xl text-base lg:text-lg text-slate2 leading-relaxed animate-fade-up" style={{ animationDelay: "240ms" }}>
            See what students actually achieved after graduation, how much colleges cost, and whether they{"\u2019"}re worth it. Pulled from public filings, written for families.
          </p>

          {/* Search bar */}
          <div className="mt-10 animate-fade-up" style={{ animationDelay: "340ms" }}>
            <div className="flex items-center border border-navy bg-white h-14 px-2 max-w-2xl">
              <span className="px-3 text-[10px] uppercase tracking-[0.2em] text-slate2 font-semibold border-r border-border">Search</span>
              <input
                type="text"
                placeholder="Search any college, course or city"
                data-testid="hero-search-input"
                className="flex-1 px-4 h-full bg-transparent outline-none text-sm placeholder:text-slate2/60"
              />
              <button data-testid="hero-search-btn" className="h-10 px-5 bg-navy text-white text-xs tracking-wide hover:bg-navy-700">
                Inspect
              </button>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4 animate-fade-up" style={{ animationDelay: "420ms" }}>
            <Link to="/colleges" data-testid="hero-primary-cta" className="group inline-flex items-center gap-2 h-12 px-6 bg-navy text-white text-sm tracking-wide hover:bg-navy-700 transition-colors">
              Explore College Intelligence
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Link>
            <Link to="/compare" data-testid="hero-secondary-cta" className="inline-flex items-center gap-2 h-12 px-6 border border-navy text-navy text-sm tracking-wide hover:bg-navy hover:text-white transition-colors">
              <Plus className="w-4 h-4" />
              Compare Colleges
            </Link>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-6 max-w-xl animate-fade-up" style={{ animationDelay: "520ms" }}>
            <Stat n="16" l="Colleges Indexed" />
            <Stat n="48+" l="Data Points Per College" />
            <Stat n="100%" l="Sources Cited" />
          </div>
        </div>

        {/* Right: animated dashboard */}
        <div className="lg:col-span-5 lg:pl-4">
          <HeroDashboard />
        </div>
      </div>
    </section>
  );
}

function Stat({ n, l }) {
  return (
    <div className="border-l border-border pl-3">
      <div className="text-2xl font-heading font-bold text-navy tabular">{n}</div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate2 mt-1">{l}</div>
    </div>
  );
}

function HeroDashboard() {
  return (
    <div className="relative border border-border bg-white shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border px-4 h-10 bg-navy text-white">
        <div className="flex items-center gap-2">
          <div className="dot bg-emerald2 animate-pulse-line" />
          <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">Filed Terminal</span>
        </div>
        <span className="text-[10px] font-mono text-white/60">SESSION 04:21:09</span>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-slate2 font-semibold">Career Success · Top 5</span>
            <span className="text-[10px] font-mono text-slate2">NIRF 2024</span>
          </div>
          <div className="space-y-1.5">
            {[
              { n: "IIT Madras", v: 95 },
              { n: "IIM Ahmedabad", v: 96 },
              { n: "IIT Bombay", v: 94 },
              { n: "IIM Bangalore", v: 94 },
              { n: "IIT Delhi", v: 93 },
            ].map((r, i) => (
              <div key={r.n} className="flex items-center gap-3 animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
                <span className="text-xs text-navy w-32 truncate">{r.n}</span>
                <div className="flex-1 h-1.5 bg-offwhite">
                  <div className="h-full bg-navy" style={{ width: `${r.v}%`, transition: "width 1.2s" }} />
                </div>
                <span className="text-xs font-mono text-navy tabular w-8 text-right">{r.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* mini chart */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-slate2 font-semibold">Median Salary Trend</span>
            <span className="text-[10px] font-mono text-emerald2">▲ 6.8% YoY</span>
          </div>
          <svg viewBox="0 0 320 90" className="w-full h-20">
            <defs>
              <linearGradient id="hg" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0,70 L40,62 L80,55 L120,48 L160,52 L200,38 L240,30 L280,24 L320,18 L320,90 L0,90 Z" fill="url(#hg)" />
            <path d="M0,70 L40,62 L80,55 L120,48 L160,52 L200,38 L240,30 L280,24 L320,18" stroke="#059669" strokeWidth="1.5" fill="none" className="animate-draw" />
            {[70, 62, 55, 48, 52, 38, 30, 24, 18].map((y, i) => (
              <circle key={i} cx={i * 40} cy={y} r="2" fill="#0B1528" />
            ))}
          </svg>
        </div>

        {/* KPI grid */}
        <div className="border-t border-border pt-4 grid grid-cols-3 gap-3">
          <Kpi label="Value For Money" v="AAA" sub="14 colleges" color="#059669" />
          <Kpi label="Avg. Openness" v="74" sub="↑ 3.2" color="#0B1528" />
          <Kpi label="Big Marketing Gap" v="6" sub="colleges" color="#D97706" />
        </div>
      </div>

      <div className="border-t border-border px-4 py-2 flex items-center justify-between text-[10px] font-mono text-slate2 bg-offwhite">
        <span>SRC: NIRF · NAAC · AICTE · UGC</span>
        <span>LIVE</span>
      </div>
    </div>
  );
}

function Kpi({ label, v, sub, color }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate2 font-semibold">{label}</div>
      <div className="mt-1 font-heading font-bold text-xl text-navy tabular" style={{ color }}>{v}</div>
      <div className="text-[10px] text-slate2 font-mono">{sub}</div>
    </div>
  );
}
