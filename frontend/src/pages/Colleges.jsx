import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useState, useMemo, useEffect } from "react";
import { colleges, formatINR } from "../data/colleges";
import TransparencyChip from "../components/TransparencyChip";
import { Link } from "react-router-dom";
import { Search, ArrowUpRight, Database } from "lucide-react";
import { fetchLiveColleges } from "../lib/collegesApi";

const TYPES = ["All", "Public", "Private"];
const SORTS = [
  { key: "outcomeScore", label: "Career Success" },
  { key: "transparency", label: "Openness" },
  { key: "medianSalary", label: "Typical Salary" },
  { key: "cost", label: "What You'll Spend" },
];

export default function Colleges() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("All");
  const [sort, setSort] = useState("outcomeScore");
  const [liveCount, setLiveCount] = useState(null);

  useEffect(() => {
    let active = true;
    fetchLiveColleges().then((live) => { if (active) setLiveCount(live.length); });
    return () => { active = false; };
  }, []);

  const rows = useMemo(() => {
    let r = [...colleges];
    if (type !== "All") r = r.filter((c) => c.type.startsWith(type));
    if (q.trim()) {
      const Q = q.toLowerCase();
      r = r.filter((c) => `${c.name} ${c.city} ${c.state}`.toLowerCase().includes(Q));
    }
    r.sort((a, b) => (sort === "cost" ? a[sort] - b[sort] : b[sort] - a[sort]));
    return r;
  }, [q, type, sort]);

  return (
    <div data-testid="colleges-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-12">
        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono">All Colleges · 16 Indexed</div>
          <h1 className="font-heading text-4xl sm:text-5xl tracking-tighter font-bold">Every college, all the numbers.</h1>
          <p className="mt-3 text-sm text-slate2 max-w-2xl">All 16 colleges with every public number we have. Click any row to open its full snapshot.</p>
          {liveCount > 0 && (
            <div data-testid="live-data-banner" className="mt-4 inline-flex items-center gap-2 border border-emerald2/40 bg-emerald2/5 text-emerald2 text-xs px-3 py-2 font-mono">
              <Database className="w-3.5 h-3.5" />
              {liveCount} institutions available from the live NIRF pipeline
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="border border-border bg-white p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center mb-6">
          <div className="flex items-center gap-2 flex-1 border border-border h-10 px-3 bg-offwhite">
            <Search className="w-4 h-4 text-slate2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="colleges-search"
              placeholder="Search any college, course or city"
              className="flex-1 bg-transparent outline-none text-sm"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate2 font-mono mr-2">Type</span>
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                data-testid={`type-${t.toLowerCase()}`}
                className={`px-3 h-9 text-xs border ${type === t ? "bg-navy text-white border-navy" : "border-border text-slate2 hover:border-navy"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-slate2 font-mono mr-2">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              data-testid="colleges-sort"
              className="h-9 px-3 text-xs border border-border bg-white"
            >
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="border border-border bg-white overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-navy text-white">
                {["College", "City", "Type", "Career Success", "Got Jobs", "Typical Salary", "You'll Spend", "Openness", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-[0.16em] font-mono font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-offwhite cursor-pointer">
                  <td className="px-4 py-3">
                    <Link to={`/college/${c.id}`} data-testid={`college-row-${c.id}`} className="font-semibold text-navy hover:text-emerald2">
                      {c.short}
                    </Link>
                    <div className="text-[10px] text-slate2 uppercase tracking-wider">{c.accreditation[0]}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate2">{c.city}</td>
                  <td className="px-4 py-3 text-xs text-slate2">{c.type.split(" — ")[0]}</td>
                  <td className="px-4 py-3 font-mono font-semibold tabular">{c.outcomeScore}</td>
                  <td className="px-4 py-3 font-mono tabular">{c.placementRate}%</td>
                  <td className="px-4 py-3 font-mono font-semibold tabular">{formatINR(c.medianSalary)}</td>
                  <td className="px-4 py-3 font-mono tabular text-slate2">{formatINR(c.cost)}</td>
                  <td className="px-4 py-3"><TransparencyChip value={c.transparency} /></td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/college/${c.id}`} className="inline-flex items-center gap-1 text-xs text-navy hover:text-emerald2">
                      Open <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-slate2">No colleges match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
      <Footer />
    </div>
  );
}
