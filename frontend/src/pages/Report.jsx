// Printable College Decision Report. Designed for print-to-PDF.
import { useEffect, useMemo } from "react";
import { colleges, formatINR } from "../data/colleges";
import { loadState, PRIORITY_META } from "../lib/shortlistStore";
import { Printer } from "lucide-react";

export default function Report() {
  const state = loadState();
  const items = useMemo(
    () =>
      state.items
        .map((i) => ({ ...i, college: colleges.find((c) => c.id === i.collegeId), list: state.lists.find((l) => l.id === i.listId) }))
        .filter((i) => i.college),
    [state]
  );

  useEffect(() => { document.title = "My College Decision Report · Filed"; }, []);

  const generated = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  // Group by list
  const byList = useMemo(() => {
    const map = new Map();
    state.lists.forEach((l) => map.set(l.id, { list: l, items: [] }));
    items.forEach((i) => {
      if (!map.has(i.listId)) map.set(i.listId, { list: i.list, items: [] });
      map.get(i.listId).items.push(i);
    });
    return Array.from(map.values()).filter((g) => g.items.length > 0);
  }, [items, state.lists]);

  // Cross-list summary
  const summary = useMemo(() => {
    const cs = items.map((i) => i.college);
    if (!cs.length) return null;
    const cheap = [...cs].sort((a, b) => a.cost - b.cost)[0];
    const expensive = [...cs].sort((a, b) => b.cost - a.cost)[0];
    const bestSal = [...cs].sort((a, b) => b.medianSalary - a.medianSalary)[0];
    const bestHs = [...cs].sort((a, b) => b.higherStudies - a.higherStudies)[0];
    const mostOpen = [...cs].sort((a, b) => b.transparency - a.transparency)[0];
    return { cheap, expensive, bestSal, bestHs, mostOpen, avgCost: Math.round(cs.reduce((s, c) => s + c.cost, 0) / cs.length), n: cs.length };
  }, [items]);

  return (
    <div className="bg-white text-navy print-root">
      <style>{`
        @page { size: A4; margin: 18mm 14mm; }
        @media print {
          .no-print { display: none !important; }
          .print-page { page-break-after: always; }
          body { background: white !important; }
        }
        .print-root { font-family: 'Inter', sans-serif; }
        .print-h { font-family: 'Manrope', sans-serif; }
      `}</style>

      {/* Toolbar (screen only) */}
      <div className="no-print sticky top-0 z-10 bg-offwhite border-b border-border">
        <div className="max-w-[920px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="text-xs text-slate2 font-mono uppercase tracking-wider">Print preview · use your browser to save as PDF</div>
          <button
            onClick={() => window.print()}
            data-testid="report-print-btn"
            className="inline-flex items-center gap-2 h-9 px-4 bg-navy text-white text-xs tracking-wide hover:bg-navy-700"
          >
            <Printer className="w-3.5 h-3.5" /> Print / Save as PDF
          </button>
        </div>
      </div>

      <div className="max-w-[920px] mx-auto px-6 py-12">
        {/* Cover */}
        <div className="border-2 border-navy p-10 mb-12 print-page">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-mono text-slate2">
            <span className="dot bg-emerald2" /> Filed · Education Due Diligence
          </div>
          <h1 className="print-h text-5xl font-bold tracking-tighter mt-8 leading-[1.02]">
            My College<br />Decision Report
          </h1>
          <p className="text-base text-slate2 mt-6 leading-relaxed max-w-md">
            A summary of the colleges I{"\u2019"}m evaluating, with my notes and priority tags. Based on publicly filed data.
          </p>
          <div className="mt-12 pt-6 border-t border-border grid grid-cols-3 gap-6 text-xs">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate2 font-mono">Generated</div>
              <div className="font-heading font-bold text-navy mt-1">{generated}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate2 font-mono">Colleges Tracked</div>
              <div className="font-heading font-bold text-navy mt-1">{items.length}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate2 font-mono">Lists</div>
              <div className="font-heading font-bold text-navy mt-1">{byList.length}</div>
            </div>
          </div>
        </div>

        {/* Summary */}
        {summary && (
          <section className="mb-12">
            <h2 className="print-h text-2xl font-bold tracking-tight mb-4">Comparison Summary</h2>
            <div className="border border-border">
              <SummaryRow k="Most affordable" v={summary.cheap.short} d={`Total cost ${formatINR(summary.cheap.cost)}`} />
              <SummaryRow k="Most expensive" v={summary.expensive.short} d={`Total cost ${formatINR(summary.expensive.cost)}`} />
              <SummaryRow k="Highest typical salary" v={summary.bestSal.short} d={`${formatINR(summary.bestSal.medianSalary)} median`} />
              <SummaryRow k="Most students into further studies" v={summary.bestHs.short} d={`${summary.bestHs.higherStudies}% continue studying`} />
              <SummaryRow k="Most transparent" v={summary.mostOpen.short} d={`Openness ${summary.mostOpen.transparency}/100`} />
              <SummaryRow k="Average cost across shortlist" v={formatINR(summary.avgCost)} d={`Across ${summary.n} colleges`} />
            </div>
          </section>
        )}

        {/* Lists */}
        {byList.map(({ list, items }) => (
          <section key={list.id} className="mb-12 print-page">
            <div className="flex items-baseline justify-between mb-4 pb-2 border-b-2 border-navy">
              <h2 className="print-h text-2xl font-bold tracking-tight">{list.name}</h2>
              <span className="text-[10px] uppercase tracking-wider text-slate2 font-mono">{items.length} colleges</span>
            </div>
            <div className="space-y-5">
              {items.map((i) => (
                <CollegeBlock key={i.id} item={i} />
              ))}
            </div>
          </section>
        ))}

        {byList.length === 0 && (
          <div className="border border-dashed border-border p-12 text-center">
            <p className="text-sm text-slate2">No colleges saved yet. Add a few from any snapshot and come back.</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-16 pt-6 border-t border-border text-[10px] text-slate2 leading-relaxed">
          <p>
            <strong>Sources:</strong> NIRF, NAAC, AICTE, UGC and institutional disclosures (2024). Marketing and filings can sometimes measure slightly different groups. This report is a decision aid, not a recommendation. Always read the source documents before deciding.
          </p>
          <p className="mt-3 font-mono uppercase tracking-wider">© Filed · Generated on {generated}</p>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ k, v, d }) {
  return (
    <div className="grid grid-cols-12 border-b border-border last:border-b-0 px-5 py-3">
      <div className="col-span-5 text-xs uppercase tracking-wider font-mono text-slate2">{k}</div>
      <div className="col-span-4 print-h font-bold text-navy text-base">{v}</div>
      <div className="col-span-3 text-xs text-slate2 text-right">{d}</div>
    </div>
  );
}

function CollegeBlock({ item }) {
  const c = item.college;
  const pr = item.priority ? PRIORITY_META[item.priority] : null;
  const strengths = computeStrengths(c);
  return (
    <article className="border border-border break-inside-avoid">
      <header className="px-5 py-3 border-b border-border bg-offwhite flex items-baseline justify-between">
        <div>
          <h3 className="print-h text-lg font-bold text-navy">{c.short}</h3>
          <div className="text-[10px] text-slate2 uppercase tracking-wider mt-0.5">{c.city} · {c.type}</div>
        </div>
        {pr && (
          <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 border" style={{ color: pr.color, borderColor: pr.color }}>
            {pr.label} priority
          </span>
        )}
      </header>
      <div className="grid grid-cols-4 gap-px bg-border">
        <Cell k="Placement" v={`${c.placementRate}%`} />
        <Cell k="Median Salary" v={formatINR(c.medianSalary)} />
        <Cell k="Further Studies" v={`${c.higherStudies}%`} />
        <Cell k="Total Cost" v={formatINR(c.cost)} />
      </div>
      <div className="grid grid-cols-4 gap-px bg-border">
        <Cell k="ROI" v={c.roiRating} />
        <Cell k="Transparency" v={`${c.transparency}/100`} />
        <Cell k="Faculty Ratio" v={c.facultyRatio} />
        <Cell k="Research" v={c.research} />
      </div>
      <div className="grid grid-cols-12 border-t border-border">
        <div className="col-span-6 px-5 py-3 border-r border-border">
          <div className="text-[10px] uppercase tracking-wider font-mono text-slate2 mb-1.5">Key Strengths</div>
          {strengths.length ? (
            <ul className="text-xs text-navy space-y-1">
              {strengths.map((s) => <li key={s} className="flex items-start gap-2"><span className="text-emerald2">•</span> {s}</li>)}
            </ul>
          ) : <div className="text-xs text-slate2 italic">No standout strengths surfaced at this filter.</div>}
        </div>
        <div className="col-span-6 px-5 py-3">
          <div className="text-[10px] uppercase tracking-wider font-mono text-slate2 mb-1.5">Decision Notes</div>
          {item.notes ? (
            <p className="text-xs text-navy leading-relaxed whitespace-pre-wrap">{item.notes}</p>
          ) : (
            <p className="text-xs text-slate2 italic">No notes added.</p>
          )}
        </div>
      </div>
    </article>
  );
}

function Cell({ k, v }) {
  return (
    <div className="bg-white p-3">
      <div className="text-[9px] uppercase tracking-wider text-slate2 font-mono">{k}</div>
      <div className="print-h font-bold text-base text-navy mt-0.5 tabular">{v}</div>
    </div>
  );
}

function computeStrengths(c) {
  const s = [];
  if (c.transparency >= 80) s.push(`Shares data openly (${c.transparency}/100).`);
  if (c.placementRate >= 85) s.push(`Strong placement rate (${c.placementRate}%).`);
  if (c.medianSalary >= 1500000) s.push(`Typical salary ${formatINR(c.medianSalary)}, well above average.`);
  if (c.higherStudies >= 30) s.push(`${c.higherStudies}% of students continue to further studies.`);
  if (c.cost < 700000) s.push(`Affordable: total program cost ${formatINR(c.cost)}.`);
  if (c.research >= 80) s.push(`Research-active institution (score ${c.research}/100).`);
  if (c.roiRating === "AAA") s.push("AAA value-for-money rating.");
  return s.slice(0, 4);
}
