import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  SlidersHorizontal, RefreshCw, ArrowLeft, GitBranch, BarChart3,
  TrendingUp, Users, FlaskConical, ChevronRight, FileText,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Key columns shown in the comparison table.
const TABLE_COLS = [
  { key: "placement_rate_overall", label: "Placement", icon: TrendingUp },
  { key: "outcome_rate_overall", label: "Outcome", icon: BarChart3 },
  { key: "faculty_ratio", label: "Student:Faculty", icon: Users },
  { key: "research_per_faculty", label: "Research / Faculty", icon: FlaskConical },
];

function fmt(metric) {
  if (!metric || metric.value === null || metric.value === undefined) return "—";
  if (metric.kind === "rate") return `${(metric.value * 100).toFixed(1)}%`;
  if (metric.kind === "ratio") return `${metric.value.toFixed(1)} : 1`;
  if (metric.kind === "perfaculty") return `₹${Math.round(metric.value).toLocaleString("en-IN")}`;
  return String(metric.value);
}

function pollJob(jobId, onUpdate, onDone) {
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    axios.get(`${API}/admin/nirf/normalize/jobs/${jobId}`).then(({ data }) => {
      if (stopped) return;
      onUpdate(data);
      if (data.status === "Completed" || data.status === "Failed") { onDone(); return; }
      setTimeout(tick, 1400);
    }).catch(() => { if (!stopped) setTimeout(tick, 2500); });
  };
  setTimeout(tick, 500);
  return () => { stopped = true; };
}

export default function AdminMetrics() {
  const [year, setYear] = useState(2024);
  const [category, setCategory] = useState("Engineering");
  const [categories, setCategories] = useState([]);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState(null);

  const fetchRows = useCallback(async () => {
    const { data } = await axios.get(`${API}/admin/nirf/derived-metrics?year=${year}&category=${category}`);
    setRows(data.derived_metrics || []);
  }, [year, category]);

  useEffect(() => {
    axios.get(`${API}/admin/nirf/categories`).then((r) => setCategories(r.data?.categories || []));
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const runNormalize = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/admin/nirf/normalize`, { year, category });
      setJob({ id: data.job_id, status: "Queued", logs: [] });
      toast.info("Normalization started…");
      pollJob(data.job_id, (j) => setJob(j), () => { fetchRows(); toast.success("Metrics normalized"); });
    } catch (e) {
      toast.error("Failed to start normalization");
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (documentId) => {
    try {
      const { data } = await axios.get(`${API}/admin/nirf/derived-metrics/${documentId}`);
      setSelected(data);
    } catch (e) {
      toast.error("Failed to load metric detail");
    }
  };

  return (
    <div data-testid="admin-metrics-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1500px] mx-auto px-6 sm:px-8 lg:px-12 py-12">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono flex items-center gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald2" /> Admin · Data Normalization
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-bold leading-[1.02]">
              Comparable Metrics.<br />
              <span className="text-slate2">Derived, traceable, never destructive.</span>
            </h1>
          </div>
          <Link to="/admin/nirf/review" data-testid="metrics-to-review"
            className="inline-flex items-center gap-2 h-10 px-4 border border-border text-xs text-navy hover:border-navy font-mono">
            <ArrowLeft className="w-3.5 h-3.5" /> Extraction Review
          </Link>
        </div>

        {/* Controls */}
        <div className="border border-border bg-white p-5 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Year">
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="metrics-year"
                className="h-10 px-3 border border-border bg-white text-sm">
                {[2024, 2023, 2022].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="metrics-category"
                className="h-10 px-3 border border-border bg-white text-sm min-w-[160px]">
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <button
              onClick={runNormalize}
              disabled={busy || job?.status === "Running" || job?.status === "Queued"}
              data-testid="metrics-normalize-btn"
              className="ml-auto inline-flex items-center gap-2 h-11 px-5 bg-navy text-white text-xs tracking-wide hover:opacity-90 disabled:opacity-40 font-semibold"
            >
              {busy || job?.status === "Running" || job?.status === "Queued"
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Normalizing…</>
                : <><SlidersHorizontal className="w-3.5 h-3.5" /> Normalize Metrics</>}
            </button>
          </div>
          {job && (
            <div className="mt-4 border-t border-border pt-4 font-mono text-[11px] text-slate2">
              <span className="text-navy font-semibold">Job {job.status}</span>
              {job.stats && <span className="ml-3">{job.stats.normalized}/{job.stats.total} institutions normalized</span>}
            </div>
          )}
        </div>

        {/* Comparison table */}
        <div className="border border-border bg-white overflow-x-auto mb-6">
          <table className="w-full min-w-[900px]" data-testid="metrics-table">
            <thead>
              <tr className="bg-navy text-white">
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-[0.16em] font-mono font-semibold">Institution</th>
                {TABLE_COLS.map((c) => (
                  <th key={c.key} className="text-right px-4 py-3 text-[10px] uppercase tracking-[0.16em] font-mono font-semibold">{c.label}</th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate2">No normalized metrics yet. Run normalization above.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.document_id} className="border-t border-border hover:bg-offwhite cursor-pointer"
                  onClick={() => openDetail(r.document_id)} data-testid={`metrics-row-${r.institute_id}`}>
                  <td className="px-4 py-3">
                    <div className="text-xs font-semibold text-navy">{r.college_name || r.institute_id}</div>
                    <div className="font-mono text-[10px] text-slate2">{r.institute_id} · raw v{r.raw_data_version}</div>
                  </td>
                  {TABLE_COLS.map((c) => (
                    <td key={c.key} className="px-4 py-3 text-right font-mono text-xs text-navy tabular">{fmt(r.metrics?.[c.key])}</td>
                  ))}
                  <td className="px-4 py-3 text-right"><ChevronRight className="w-4 h-4 text-slate2 inline" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detail with full traceability */}
        {selected && <MetricDetail record={selected} onClose={() => setSelected(null)} />}
      </main>
      <Footer />
    </div>
  );
}

function MetricDetail({ record, onClose }) {
  const grouped = {};
  Object.entries(record.metrics || {}).forEach(([key, m]) => {
    (grouped[m.group] = grouped[m.group] || []).push({ key, ...m });
  });
  return (
    <div className="border border-navy bg-white" data-testid="metrics-detail">
      <div className="bg-navy text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{record.college_name || record.institute_id}</div>
          <div className="font-mono text-[10px] text-white/50 mt-0.5 flex items-center gap-1.5">
            <GitBranch className="w-3 h-3" /> Derived from immutable raw_data v{record.raw_data_version} · {record.metrics_computed}/{record.metrics_total} metrics
          </div>
        </div>
        <button onClick={onClose} className="text-[10px] font-mono text-white/50 hover:text-white">close</button>
      </div>
      <div className="p-5 space-y-6">
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group}>
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate2 font-mono font-semibold mb-2 border-b border-border pb-1.5">{group}</div>
            <div className="space-y-3">
              {items.map((m) => (
                <div key={m.key} className="grid md:grid-cols-[260px_1fr] gap-3 items-start" data-testid={`metric-${m.key}`}>
                  <div>
                    <div className="text-xs font-semibold text-navy">{m.label}</div>
                    <div className="font-mono text-[10px] text-slate2 mt-0.5">{m.formula}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-heading font-bold text-xl text-navy tabular">{fmt(m)}</span>
                      {m.status !== "ok"
                        ? <span className="text-[9px] uppercase font-mono text-amber2 border border-amber2/40 px-1.5 py-0.5">{m.status.replace("_", " ")}</span>
                        : <span className="font-mono text-[10px] text-slate2">conf {Math.round((m.confidence || 0) * 100)}%</span>}
                    </div>
                    {/* Source traceability */}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(m.inputs || []).map((i, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border border-border text-slate2"
                          title={`Sourced from extracted field '${i.field}'`}>
                          <FileText className="w-2.5 h-2.5" />
                          {i.field}={i.value === null ? "—" : i.value}
                          {i.source_page ? ` · p${i.source_page}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate2 font-mono mb-1">{label}</div>
      {children}
    </div>
  );
}
