import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  RotateCw, ArrowLeft, CheckCircle2, Circle, Loader2, AlertTriangle,
  TrendingUp, TrendingDown, Minus, Wallet, Users, Briefcase, FlaskConical,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const METRIC_TABS = [
  { key: "median_salary", label: "Median Salary", icon: Wallet, unit: "₹" },
  { key: "placement_rate", label: "Placement", icon: Briefcase, unit: "%" },
  { key: "faculty_count", label: "Faculty", icon: Users, unit: "" },
];

function pollRefresh(jobId, onUpdate, onDone) {
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    axios.get(`${API}/admin/nirf/refresh/jobs/${jobId}`).then(({ data }) => {
      if (stopped) return;
      onUpdate(data);
      if (data.status === "Completed" || data.status === "Failed") { onDone(data); return; }
      setTimeout(tick, 1200);
    }).catch(() => { if (!stopped) setTimeout(tick, 2200); });
  };
  setTimeout(tick, 400);
  return () => { stopped = true; };
}

export default function AdminRefresh() {
  const [year, setYear] = useState(2026);
  const [category] = useState("Engineering");
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [changes, setChanges] = useState([]);
  const [summary, setSummary] = useState(null);
  const [metric, setMetric] = useState("median_salary");
  const [trend, setTrend] = useState(null);
  const [years, setYears] = useState([]);

  const loadChanges = useCallback(async (yr) => {
    try {
      const { data } = await axios.get(`${API}/admin/nirf/changes?year=${yr}&category=${category}`);
      setChanges(data.changes || []);
      setSummary(data.summary || null);
    } catch (e) { setChanges([]); setSummary(null); }
  }, [category]);

  const loadTrend = useCallback(async (m) => {
    const { data } = await axios.get(`${API}/admin/nirf/trends?category=${category}&metric=${m}`);
    setTrend(data);
  }, [category]);

  useEffect(() => {
    axios.get(`${API}/admin/nirf/years?category=${category}`).then((r) => setYears(r.data?.years || []));
  }, [category]);
  useEffect(() => { loadChanges(year); }, [year, loadChanges]);
  useEffect(() => { loadTrend(metric); }, [metric, loadTrend]);

  const runRefresh = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/admin/nirf/refresh`, { year, category, limit: 25, simulate: true });
      setJob({ id: data.job_id, status: "Queued", stages: [] });
      toast.info(`Sync NIRF ${year} started…`);
      pollRefresh(data.job_id, (j) => setJob(j), () => {
        loadChanges(year); loadTrend(metric);
        axios.get(`${API}/admin/nirf/years?category=${category}`).then((r) => setYears(r.data?.years || []));
        toast.success(`NIRF ${year} refresh complete`);
      });
    } catch (e) {
      toast.error("Failed to start refresh");
    } finally {
      setBusy(false);
    }
  };

  const running = busy || job?.status === "Running" || job?.status === "Queued";
  const chartData = (trend?.average || []).map((a) => ({ year: a.year, value: a.value }));

  return (
    <div data-testid="admin-refresh-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1500px] mx-auto px-6 sm:px-8 lg:px-12 py-12">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono flex items-center gap-2">
              <RotateCw className="w-3.5 h-3.5 text-emerald2" /> Admin · Annual NIRF Refresh
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-bold leading-[1.02]">
              Annual Refresh.<br />
              <span className="text-slate2">Sync, track, trend — year on year.</span>
            </h1>
          </div>
          <Link to="/admin/nirf/intelligence" data-testid="refresh-to-intel"
            className="inline-flex items-center gap-2 h-10 px-4 border border-border text-xs text-navy hover:border-navy font-mono">
            <ArrowLeft className="w-3.5 h-3.5" /> Intelligence Scores
          </Link>
        </div>

        {/* Control */}
        <div className="border border-border bg-white p-5 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate2 font-mono mb-1">Survey Year</div>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="refresh-year"
                className="h-10 px-3 border border-border bg-white text-sm">
                {[2026, 2025, 2024, 2023].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button onClick={runRefresh} disabled={running} data-testid="sync-nirf-btn"
              className="ml-auto inline-flex items-center gap-2 h-11 px-6 bg-emerald2 text-navy text-xs tracking-wide hover:opacity-90 disabled:opacity-40 font-semibold">
              {running ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing…</> : <><RotateCw className="w-3.5 h-3.5" /> Sync NIRF {year}</>}
            </button>
          </div>

          {/* Staged progress */}
          {job?.stages?.length > 0 && (
            <div className="mt-5 border-t border-border pt-5" data-testid="refresh-stages">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {job.stages.map((s) => (
                  <div key={s.n} className="flex items-start gap-2 border border-border p-2.5">
                    <StageIcon status={s.status} />
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-navy">{s.n}. {s.name}</div>
                      {s.detail && <div className="font-mono text-[9px] text-slate2 truncate">{s.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
              {job.data_origin === "simulated" && job.status === "Completed" && (
                <div className="mt-3 flex items-center gap-2 text-[11px] text-amber2 bg-amber2/5 border border-amber2/30 px-3 py-2" data-testid="simulated-banner">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Upstream NIRF {year} PDFs were unavailable — data simulated (labelled) via carry-forward from the prior year so change tracking is demonstrable.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Summary KPIs */}
        {summary?.previous_year && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mb-6">
            <Kpi k="Institutions Tracked" v={summary.institutions} sub={`${summary.year} vs ${summary.previous_year}`} accent="#0B1528" />
            <Kpi k="Avg Salary Change" v={summary.avg_salary_pct != null ? `${summary.avg_salary_pct > 0 ? "+" : ""}${summary.avg_salary_pct}%` : "—"} accent="#059669" />
            <Kpi k="Avg Placement Change" v={summary.avg_placement_delta_pp != null ? `${summary.avg_placement_delta_pp > 0 ? "+" : ""}${summary.avg_placement_delta_pp} pp` : "—"} accent="#4682B4" />
            <Kpi k="Avg Faculty Change" v={summary.avg_faculty_pct != null ? `${summary.avg_faculty_pct > 0 ? "+" : ""}${summary.avg_faculty_pct}%` : "—"} accent="#D97706" />
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_460px] gap-6">
          {/* Change table */}
          <div className="border border-border bg-white overflow-x-auto">
            <div className="bg-navy text-white px-4 py-3 text-[10px] uppercase tracking-[0.18em] font-mono font-semibold flex items-center justify-between">
              <span>Year-on-Year Changes {summary?.previous_year ? `· ${summary.year} vs ${summary.previous_year}` : ""}</span>
            </div>
            <table className="w-full min-w-[640px]" data-testid="changes-table">
              <thead>
                <tr className="bg-offwhite text-slate2">
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-mono">Institution</th>
                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-mono">Median Salary</th>
                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-mono">Placement</th>
                  <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-mono">Faculty</th>
                </tr>
              </thead>
              <tbody>
                {changes.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-slate2">No year-on-year changes yet. Run a sync for a year with a prior year of data.</td></tr>
                )}
                {changes.map((r) => (
                  <tr key={r.institute_id} className="border-t border-border hover:bg-offwhite" data-testid={`change-row-${r.institute_id}`}>
                    <td className="px-4 py-3">
                      <div className="text-xs font-semibold text-navy">{r.college_name || r.institute_id}</div>
                      <div className="font-mono text-[10px] text-slate2">{r.institute_id}</div>
                    </td>
                    <td className="px-3 py-3 text-right"><DeltaCell c={r.changes.median_salary} kind="money" /></td>
                    <td className="px-3 py-3 text-right"><DeltaCell c={r.changes.placement_rate} kind="pp" /></td>
                    <td className="px-3 py-3 text-right"><DeltaCell c={r.changes.faculty_count} kind="int" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* YoY trend chart */}
          <div className="border border-border bg-white" data-testid="trends-panel">
            <div className="bg-navy text-white px-4 py-3 text-[10px] uppercase tracking-[0.18em] font-mono font-semibold">Year-on-Year Trend (cohort avg)</div>
            <div className="p-4">
              <div className="flex gap-1 mb-4">
                {METRIC_TABS.map((m) => (
                  <button key={m.key} onClick={() => setMetric(m.key)} data-testid={`trend-tab-${m.key}`}
                    className={`inline-flex items-center gap-1.5 px-3 h-8 text-[11px] font-mono border ${metric === m.key ? "bg-navy text-white border-navy" : "border-border text-slate2 hover:border-navy"}`}>
                    <m.icon className="w-3 h-3" /> {m.label}
                  </button>
                ))}
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#E2E8F0" />
                    <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: "monospace", fill: "#64748B" }} />
                    <YAxis tick={{ fontSize: 10, fontFamily: "monospace", fill: "#64748B" }} width={54}
                      tickFormatter={(v) => metric === "median_salary" ? `₹${(v / 100000).toFixed(1)}L` : metric === "placement_rate" ? `${v}%` : v} />
                    <Tooltip formatter={(v) => metric === "median_salary" ? `₹${Number(v).toLocaleString("en-IN")}` : metric === "placement_rate" ? `${v}%` : v} />
                    <Line type="monotone" dataKey="value" stroke="#059669" strokeWidth={2.5} dot={{ r: 4, fill: "#0B1528" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 font-mono text-[10px] text-slate2">
                Years on record: {years.join(" · ") || "—"} · historical years are preserved, never overwritten.
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function StageIcon({ status }) {
  if (status === "done") return <CheckCircle2 className="w-4 h-4 text-emerald2 shrink-0 mt-0.5" />;
  if (status === "running") return <Loader2 className="w-4 h-4 text-steel animate-spin shrink-0 mt-0.5" />;
  if (status === "failed") return <AlertTriangle className="w-4 h-4 text-amber2 shrink-0 mt-0.5" />;
  return <Circle className="w-4 h-4 text-border shrink-0 mt-0.5" />;
}

function DeltaCell({ c, kind }) {
  if (!c || c.current === null || c.current === undefined) return <span className="text-slate2 text-xs">—</span>;
  const dir = c.direction;
  const color = dir === "up" ? "#059669" : dir === "down" ? "#DC2626" : "#64748B";
  const Icon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
  const fmtV = (v) => kind === "money" ? `₹${Number(v).toLocaleString("en-IN")}` : kind === "int" ? Math.round(v) : kind === "pp" ? `${(v * 100).toFixed(1)}%` : v;
  const deltaLabel = kind === "pp" ? `${c.delta > 0 ? "+" : ""}${c.delta} pp`
    : (c.pct_change != null ? `${c.pct_change > 0 ? "+" : ""}${c.pct_change}%` : "—");
  return (
    <div className="inline-flex flex-col items-end">
      <span className="font-mono text-xs text-navy tabular">{fmtV(c.current)}</span>
      <span className="inline-flex items-center gap-1 font-mono text-[10px]" style={{ color }}>
        <Icon className="w-3 h-3" /> {deltaLabel}
      </span>
    </div>
  );
}

function Kpi({ k, v, sub, accent }) {
  return (
    <div className="bg-white p-5">
      <div className="text-[9px] uppercase tracking-[0.16em] text-slate2 font-semibold">{k}</div>
      <div className="font-heading font-bold text-3xl mt-1.5 tabular" style={{ color: accent || "#0B1528" }}>{v}</div>
      {sub && <div className="text-[10px] text-slate2 font-mono mt-1">{sub}</div>}
    </div>
  );
}
