// Section 4: COLLEGE INTELLIGENCE CATEGORIES
import { TrendingUp, Award, Eye, FlaskConical, Coins, Users } from "lucide-react";
import { colleges, formatINR } from "../data/colleges";
import { Link } from "react-router-dom";

const CATEGORIES = [
  { key: "outcome", title: "Best ROI Institutions", icon: Coins, sort: (a, b) => (b.outcomeScore / b.cost) - (a.outcomeScore / a.cost), metric: "ROI" },
  { key: "outcomeScore", title: "Strongest Graduate Outcomes", icon: TrendingUp, sort: (a, b) => b.outcomeScore - a.outcomeScore, metric: "Outcome" },
  { key: "transparency", title: "Most Transparent Institutions", icon: Eye, sort: (a, b) => b.transparency - a.transparency, metric: "Transparency" },
  { key: "research", title: "Research Leaders", icon: FlaskConical, sort: (a, b) => b.research - a.research, metric: "Research" },
  { key: "value", title: "Best Value Colleges", icon: Award, sort: (a, b) => (b.medianSalary / b.cost) - (a.medianSalary / a.cost), metric: "Value" },
  { key: "diversity", title: "Most Diverse Communities", icon: Users, sort: (a, b) => b.diversity - a.diversity, metric: "Diversity" },
];

export default function IntelligenceCategories() {
  return (
    <section className="border-b border-border bg-navy text-white">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-24 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end mb-12">
          <div className="lg:col-span-7">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/50 font-semibold mb-3">
              <span className="font-mono">04</span> · Intelligence Categories
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl tracking-tighter font-bold leading-[1.05]">
              Six lenses on every<br />institution.
            </h2>
          </div>
          <div className="lg:col-span-5 text-sm text-white/60 leading-relaxed">
            Categories are computed from filed disclosures. Every figure links to a primary source.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10 border border-white/10">
          {CATEGORIES.map((cat, i) => {
            const top = [...colleges].sort(cat.sort).slice(0, 3);
            const Icon = cat.icon;
            return (
              <Link
                key={cat.key}
                to={`/college/${top[0].id}`}
                data-testid={`category-card-${cat.key}`}
                className="bg-navy hover:bg-navy-700 transition-colors p-7 group relative"
              >
                <div className="flex items-start justify-between mb-6">
                  <Icon className="w-5 h-5 text-emerald2" strokeWidth={1.5} />
                  <span className="text-[9px] font-mono uppercase tracking-wider text-white/40">{String(i + 1).padStart(2, "0")} / 06</span>
                </div>
                <h3 className="font-heading font-bold text-lg leading-tight mb-5">{cat.title}</h3>
                <ul className="space-y-2.5">
                  {top.map((c, idx) => (
                    <li key={c.id} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-white/90">
                        <span className="font-mono text-white/40 w-4">{idx + 1}</span>
                        <span className="truncate">{c.short}</span>
                      </span>
                      <span className="font-mono text-emerald2 tabular">
                        {cat.key === "outcomeScore" && c.outcomeScore}
                        {cat.key === "transparency" && c.transparency}
                        {cat.key === "research" && c.research}
                        {cat.key === "diversity" && c.diversity}
                        {cat.key === "outcome" && `${(c.outcomeScore / (c.cost / 100000)).toFixed(1)}x`}
                        {cat.key === "value" && `${(c.medianSalary / c.cost).toFixed(2)}x`}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between text-[10px] uppercase tracking-wider text-white/40 font-mono group-hover:text-emerald2 transition-colors">
                  <span>View Leader</span>
                  <span>→</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
