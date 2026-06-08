// Section 7: COLLEGE COMPARISON ENGINE preview
import { useState } from "react";
import { colleges, formatINR } from "../data/colleges";
import { Link } from "react-router-dom";
import { X, Plus, ArrowUpRight } from "lucide-react";

const DEFAULT_IDS = ["iit-bombay", "iim-ahmedabad", "bits-pilani", "vit-vellore"];

export default function ComparisonEngine() {
  const [ids, setIds] = useState(DEFAULT_IDS);
  const [sortKey, setSortKey] = useState(null);
  const selected = ids.map((id) => colleges.find((c) => c.id === id)).filter(Boolean);

  const metrics = [
    { key: "outcomeScore", label: "Outcome Score", format: (v) => v },
    { key: "roiRating", label: "ROI Rating", format: (v) => v, isText: true },
    { key: "placementRate", label: "Placement Rate", format: (v) => `${v}%` },
    { key: "medianSalary", label: "Median Salary", format: formatINR },
    { key: "higherStudies", label: "Higher Studies", format: (v) => `${v}%` },
    { key: "facultyRatio", label: "Faculty Ratio", format: (v) => v, isText: true },
    { key: "transparency", label: "Transparency", format: (v) => v },
    { key: "research", label: "Research Indicator", format: (v) => v },
    { key: "cost", label: "Est. Cost of Attendance", format: formatINR },
  ];

  const remaining = colleges.filter((c) => !ids.includes(c.id));

  return (
    <section className="border-b border-border bg-offwhite">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-24 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end mb-10">
          <div className="lg:col-span-7">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3">
              <span className="font-mono">07</span> · Comparison Engine
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl tracking-tighter font-bold text-navy leading-[1.05]">
              Side by side, on what<br />actually matters.
            </h2>
          </div>
          <div className="lg:col-span-5 flex justify-start lg:justify-end">
            <Link to="/compare" data-testid="comparison-open-full" className="inline-flex items-center gap-1 text-sm text-navy hover:text-emerald2 font-semibold">
              Open full comparison <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <div className="border border-border bg-white overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-border bg-navy text-white">
                <th className="text-left px-5 py-4 text-[10px] uppercase tracking-[0.2em] font-mono font-semibold w-[200px] sticky left-0 bg-navy">Metric</th>
                {selected.map((c) => (
                  <th key={c.id} className="text-left px-5 py-4 border-l border-white/10">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-heading font-bold text-sm leading-tight">{c.short}</div>
                        <div className="text-[10px] text-white/50 mt-0.5">{c.city}</div>
                      </div>
                      <button
                        data-testid={`comp-remove-${c.id}`}
                        onClick={() => setIds((p) => p.filter((id) => id !== c.id))}
                        className="text-white/40 hover:text-amber2"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </th>
                ))}
                {ids.length < 4 && (
                  <th className="text-left px-5 py-4 border-l border-white/10 w-[180px]">
                    <AddPicker remaining={remaining} onAdd={(id) => setIds((p) => [...p, id])} />
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                const best = m.isText ? null : Math.max(...selected.map((c) => Number(c[m.key]) || 0));
                const worst = m.isText ? null : Math.min(...selected.map((c) => Number(c[m.key]) || 0));
                return (
                  <tr
                    key={m.key}
                    className={`border-b border-border last:border-b-0 hover:bg-offwhite/40 cursor-pointer ${sortKey === m.key ? "bg-offwhite" : ""}`}
                    onClick={() => setSortKey(m.key)}
                  >
                    <td className="px-5 py-4 sticky left-0 bg-white">
                      <div className="text-xs uppercase tracking-wider text-slate2 font-mono">{m.label}</div>
                    </td>
                    {selected.map((c) => {
                      const v = c[m.key];
                      const isBest = !m.isText && best !== null && Number(v) === best && best !== worst;
                      const color = m.key === "cost" ? (Number(v) === worst ? "#059669" : "#0B1528") : isBest ? "#059669" : "#0B1528";
                      return (
                        <td key={c.id} className="px-5 py-4 border-l border-border">
                          <span className="font-heading font-bold text-base tabular" style={{ color }}>
                            {m.format(v)}
                          </span>
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
      </div>
    </section>
  );
}

function AddPicker({ remaining, onAdd }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        data-testid="comp-add-btn"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 text-xs text-white border border-white/20 hover:border-emerald2 hover:text-emerald2 px-3 h-8"
      >
        <Plus className="w-3 h-3" /> Add institution
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 max-h-72 overflow-y-auto bg-white border border-navy shadow-xl z-20">
          {remaining.map((c) => (
            <button
              key={c.id}
              data-testid={`comp-add-${c.id}`}
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
