import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { RefreshCw, RotateCcw, Database, AlertTriangle, CheckCircle2, Clock, FileText, Activity, Cpu } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Job poller — lives outside React so it never trips set-state-in-effect lint rules.
function startJobPoller(jobId, onUpdate, onDone) {
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    axios.get(`${API}/admin/nirf/jobs/${jobId}`).then(({ data }) => {
      if (stopped) return;
      onUpdate(data);
      if (data.status === "Completed" || data.status === "Failed") { onDone(); return; }
      setTimeout(tick, 1800);
    }).catch(() => { if (!stopped) setTimeout(tick, 2500); });
  };
  setTimeout(tick, 600);
  return () => { stopped = true; };
}

export default function AdminNIRF() {
  const [year, setYear] = useState(2024);
  const [category, setCategory] = useState("Engineering");
  const [limit, setLimit] = useState(15);
  const [categories, setCategories] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [docs, setDocs] = useState([]);
  const [counts, setCounts] = useState({ Pending: 0, Downloaded: 0, Failed: 0 });
  const [institutions, setInstitutions] = useState([]);
  const [activeJob, setActiveJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("documents");
  // Stage 1 acquisition filters
  const [stateFilter, setStateFilter] = useState("ALL");
  const [rankBand, setRankBand] = useState("all");
  const [search, setSearch] = useState("");
  const [syncMode, setSyncMode] = useState("full");

  const fetchAll = useCallback(async () => {
    const [j, d, i] = await Promise.all([
      axios.get(`${API}/admin/nirf/jobs?limit=10`),
      axios.get(`${API}/admin/nirf/documents?year=${year}&category=${category}&limit=500`),
      axios.get(`${API}/admin/nirf/institutions?year=${year}&category=${category}&limit=200`),
    ]);
    setJobs(j.data || []);
    setDocs(d.data?.documents || []);
    setCounts(d.data?.counts || { Pending: 0, Downloaded: 0, Failed: 0 });
    setInstitutions(i.data || []);
  }, [year, category]);

  useEffect(() => {
    axios.get(`${API}/admin/nirf/categories`).then((r) => setCategories(r.data?.categories || []));
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const triggerSync = async () => {
    setBusy(true);
    try {
      // Ranking band scopes how many top-ranked institutions to acquire.
      const bandMax = { "1-10": 10, "1-25": 25, "1-50": 50, "1-100": 100 }[rankBand];
      const effLimit = bandMax || limit;
      const { data } = await axios.post(`${API}/admin/nirf/sync`, {
        year, category, limit: effLimit, mode: syncMode, state: stateFilter,
      });
      setActiveJob({ id: data.job_id, status: "Queued", logs: [] });
      startJobPoller(data.job_id, (j) => setActiveJob(j), () => fetchAll());
    } finally {
      setBusy(false);
    }
  };

  const retry = async (id) => {
    await axios.post(`${API}/admin/nirf/documents/${id}/retry`);
    fetchAll();
  };

  const total = counts.Pending + counts.Downloaded + counts.Failed;
  const downloadedPct = total ? Math.round((counts.Downloaded / total) * 100) : 0;

  // Derived view filters (State / Ranking Band / Search) applied to the displayed lists.
  const availableStates = Array.from(new Set(institutions.map((i) => i.state).filter(Boolean))).sort();
  const inBand = (rank) => {
    if (rankBand === "all" || !rank) return true;
    const max = { "1-10": 10, "1-25": 25, "1-50": 50, "1-100": 100 }[rankBand] || 9999;
    return Number(rank) <= max;
  };
  const matchesSearch = (name) => !search || (name || "").toLowerCase().includes(search.toLowerCase());
  const viewInstitutions = institutions.filter(
    (r) => (stateFilter === "ALL" || r.state === stateFilter) && inBand(r.rank) && matchesSearch(r.college_name)
  );
  // For documents, scope by the institute_ids that pass the institution-level filters.
  const allowedIds = new Set(viewInstitutions.map((i) => i.institute_id));
  const stateBandActive = stateFilter !== "ALL" || rankBand !== "all";
  const viewDocs = docs.filter(
    (d) => matchesSearch(d.college_name) && (!stateBandActive || allowedIds.has(d.institute_id))
  );

  return (
    <div data-testid="admin-nirf-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-12">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-emerald2" /> NIRF · Stage 1
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-bold leading-[1.02]">
              Sync & Acquisition.<br />
              <span className="text-slate2">Discover, download, queue, retry.</span>
            </h1>
          </div>
          <Link to="/admin/nirf/review" data-testid="to-extraction-review"
            className="inline-flex items-center gap-2 h-11 px-5 bg-navy text-white text-xs tracking-wide hover:opacity-90 font-semibold">
            <Cpu className="w-3.5 h-3.5" /> Processing & Extraction →
          </Link>
        </div>

        {/* Controls */}
        <div className="border border-border bg-white p-5 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Academic Year">
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="nirf-year"
                className="h-10 px-3 border border-border bg-white text-sm">
                {[2024, 2023, 2022].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="nirf-category"
                className="h-10 px-3 border border-border bg-white text-sm min-w-[150px]">
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="State *">
              <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} data-testid="nirf-state"
                className="h-10 px-3 border border-border bg-white text-sm min-w-[150px]">
                <option value="ALL">All States</option>
                {availableStates.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Ranking Band">
              <select value={rankBand} onChange={(e) => setRankBand(e.target.value)} data-testid="nirf-band"
                className="h-10 px-3 border border-border bg-white text-sm">
                {["all", "1-10", "1-25", "1-50", "1-100"].map((b) => <option key={b} value={b}>{b === "all" ? "All ranks" : `Top ${b.split("-")[1]}`}</option>)}
              </select>
            </Field>
            <Field label="Sync Mode">
              <select value={syncMode} onChange={(e) => setSyncMode(e.target.value)} data-testid="nirf-mode"
                className="h-10 px-3 border border-border bg-white text-sm">
                <option value="full">Full</option>
                <option value="incremental">Incremental</option>
              </select>
            </Field>
            <Field label="Institution Search">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="filter by name"
                data-testid="nirf-search" className="h-10 px-3 border border-border bg-white text-sm w-44" />
            </Field>
            <Field label="Limit">
              <input type="number" value={limit} min={1} max={100} onChange={(e) => setLimit(Number(e.target.value))}
                data-testid="nirf-limit" className="h-10 px-3 border border-border bg-white text-sm w-20" />
            </Field>
            <button
              onClick={triggerSync}
              disabled={busy || activeJob?.status === "Running" || activeJob?.status === "Queued"}
              data-testid="nirf-sync-btn"
              className="ml-auto inline-flex items-center gap-2 h-11 px-5 bg-emerald2 text-navy text-xs tracking-wide hover:opacity-90 disabled:opacity-40 font-semibold"
            >
              {busy || activeJob?.status === "Running" || activeJob?.status === "Queued"
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Syncing…</>
                : <><RefreshCw className="w-3.5 h-3.5" /> Sync NIRF Data</>}
            </button>
          </div>
          <p className="mt-3 text-[11px] text-slate2 font-mono">
            State &amp; Ranking Band filter the discovered institutions and the extraction queue. Ranking Band also scopes acquisition (top-N). Sync Mode: Full re-acquires; Incremental skips already-downloaded.
          </p>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border border border-border mb-6">
          <Kpi icon={Database} k="Institutions" v={institutions.length} sub={`${year} · ${category}`} />
          <Kpi icon={CheckCircle2} k="Downloaded" v={counts.Downloaded} accent="#059669" />
          <Kpi icon={Clock} k="Pending" v={counts.Pending} accent="#4682B4" />
          <Kpi icon={AlertTriangle} k="Failed" v={counts.Failed} accent="#D97706" />
          <Kpi icon={Activity} k="Success Rate" v={`${downloadedPct}%`} accent="#0B1528" />
        </div>

        {/* Active job log */}
        {activeJob && (
          <div className="border border-navy bg-navy text-white mb-6">
            <div className="border-b border-white/10 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`dot ${activeJob.status === "Completed" ? "bg-emerald2" : activeJob.status === "Failed" ? "bg-amber2" : "bg-emerald2 animate-pulse-line"}`} />
                <span className="text-[10px] uppercase tracking-[0.2em] font-mono font-semibold">
                  Sync Job · {activeJob.status}
                </span>
              </div>
              <button onClick={() => setActiveJob(null)} className="text-[10px] font-mono text-white/40 hover:text-white">close</button>
            </div>
            <div className="p-5 font-mono text-[11px] text-emerald2 max-h-72 overflow-y-auto leading-relaxed" data-testid="nirf-job-log">
              {(activeJob.logs || []).length === 0 ? (
                <span className="text-white/40">Waiting for log output…</span>
              ) : activeJob.logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
            {activeJob.stats && (
              <div className="border-t border-white/10 px-5 py-3 grid grid-cols-4 gap-4 text-[10px] uppercase tracking-wider font-mono">
                <div><span className="text-white/40">Total</span> <span className="text-white ml-2 tabular">{activeJob.stats.total}</span></div>
                <div><span className="text-white/40">Downloaded</span> <span className="text-emerald2 ml-2 tabular">{activeJob.stats.downloaded}</span></div>
                <div><span className="text-white/40">Failed</span> <span className="text-amber2 ml-2 tabular">{activeJob.stats.failed}</span></div>
                <div><span className="text-white/40">Fallback</span> <span className="text-white ml-2 tabular">{activeJob.stats.fallback_used ? "Yes" : "No"}</span></div>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4 border-b border-border">
          {[
            { id: "documents", label: "Documents", count: viewDocs.length },
            { id: "institutions", label: "Institutions", count: viewInstitutions.length },
            { id: "jobs", label: "Jobs", count: jobs.length },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              data-testid={`nirf-tab-${t.id}`}
              className={`px-4 h-10 text-xs uppercase tracking-wider font-mono border-b-2 -mb-px transition-colors ${tab === t.id ? "border-navy text-navy" : "border-transparent text-slate2 hover:text-navy"}`}
            >
              {t.label} <span className="text-[10px] text-slate2 ml-1">({t.count})</span>
            </button>
          ))}
        </div>

        {tab === "documents" && <DocumentsTable docs={viewDocs} onRetry={retry} />}
        {tab === "institutions" && <InstitutionsTable rows={viewInstitutions} />}
        {tab === "jobs" && <JobsTable jobs={jobs} onOpen={(j) => setActiveJob(j)} />}
      </main>
      <Footer />
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

function Kpi({ icon: Icon, k, v, sub, accent }) {
  return (
    <div className="bg-white p-5">
      <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-slate2 font-semibold">
        {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={1.6} style={{ color: accent || "#64748B" }} />}
        {k}
      </div>
      <div className="font-heading font-bold text-3xl mt-1.5 tabular" style={{ color: accent || "#0B1528" }}>{v}</div>
      {sub && <div className="text-[10px] text-slate2 font-mono mt-1">{sub}</div>}
    </div>
  );
}

function StatusPill({ status }) {
  const m = {
    Downloaded: { color: "#059669", bg: "rgba(5,150,105,0.10)" },
    Pending:    { color: "#4682B4", bg: "rgba(70,130,180,0.10)" },
    Failed:     { color: "#D97706", bg: "rgba(217,119,6,0.10)" },
  }[status] || { color: "#64748B", bg: "rgba(100,116,139,0.10)" };
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border"
      style={{ borderColor: m.color + "44", color: m.color, background: m.bg }}>
      <span className="dot" style={{ background: m.color }} /> {status}
    </span>
  );
}

function DocumentsTable({ docs, onRetry }) {
  if (!docs.length) return <Empty msg="No documents yet. Hit Sync NIRF Data above." />;
  return (
    <div className="border border-border bg-white overflow-x-auto">
      <table className="w-full min-w-[900px]">
        <thead>
          <tr className="bg-navy text-white">
            {["Institute ID", "College", "Status", "Attempts", "Size", "PDF URL", "Action"].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-[0.16em] font-mono font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-t border-border hover:bg-offwhite" data-testid={`doc-row-${d.id}`}>
              <td className="px-4 py-3 font-mono text-xs text-navy tabular">{d.institute_id}</td>
              <td className="px-4 py-3 text-xs text-navy">{d.college_name}</td>
              <td className="px-4 py-3"><StatusPill status={d.status} /></td>
              <td className="px-4 py-3 font-mono text-xs text-slate2 tabular">{d.attempts || 0}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate2 tabular">{d.size ? `${(d.size / 1024).toFixed(0)} KB` : "—"}</td>
              <td className="px-4 py-3 font-mono text-[10px] text-slate2 truncate max-w-[260px]" title={d.url}>{d.url}</td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onRetry(d.id)}
                  disabled={d.status === "Downloaded"}
                  data-testid={`doc-retry-${d.id}`}
                  className="inline-flex items-center gap-1 h-8 px-3 border border-border text-xs text-navy hover:border-navy disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-3 h-3" /> Retry
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InstitutionsTable({ rows }) {
  if (!rows.length) return <Empty msg="No institutions ingested yet." />;
  return (
    <div className="border border-border bg-white overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr className="bg-navy text-white">
            {["Rank", "Institute ID", "College", "City", "State", "Score"].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-[0.16em] font-mono font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.institute_id}-${r.year}-${r.category}`} className="border-t border-border hover:bg-offwhite">
              <td className="px-4 py-3 font-mono text-xs text-navy tabular font-semibold">#{r.rank}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate2 tabular">{r.institute_id}</td>
              <td className="px-4 py-3 text-xs text-navy">{r.college_name}</td>
              <td className="px-4 py-3 text-xs text-slate2">{r.city}</td>
              <td className="px-4 py-3 text-xs text-slate2">{r.state}</td>
              <td className="px-4 py-3 font-mono text-xs text-navy tabular">{Number(r.score || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JobsTable({ jobs, onOpen }) {
  if (!jobs.length) return <Empty msg="No sync jobs yet." />;
  return (
    <div className="border border-border bg-white overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr className="bg-navy text-white">
            {["Started", "Year", "Category", "Status", "Total", "Downloaded", "Failed", ""].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-[0.16em] font-mono font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="border-t border-border hover:bg-offwhite cursor-pointer" onClick={() => onOpen(j)} data-testid={`job-row-${j.id}`}>
              <td className="px-4 py-3 font-mono text-[11px] text-slate2 tabular">{(j.started_at || j.created_at || "").replace("T", " ").slice(0, 19)}</td>
              <td className="px-4 py-3 font-mono text-xs text-navy tabular">{j.year}</td>
              <td className="px-4 py-3 text-xs text-navy">{j.category}</td>
              <td className="px-4 py-3"><StatusPill status={j.status === "Running" ? "Pending" : j.status === "Completed" ? "Downloaded" : j.status === "Failed" ? "Failed" : "Pending"} /></td>
              <td className="px-4 py-3 font-mono text-xs text-navy tabular">{j.stats?.total ?? 0}</td>
              <td className="px-4 py-3 font-mono text-xs text-emerald2 tabular">{j.stats?.downloaded ?? 0}</td>
              <td className="px-4 py-3 font-mono text-xs text-amber2 tabular">{j.stats?.failed ?? 0}</td>
              <td className="px-4 py-3 text-xs text-navy">View logs →</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ msg }) {
  return (
    <div className="border border-dashed border-border bg-white p-10 text-center text-sm text-slate2 flex flex-col items-center gap-3">
      <FileText className="w-6 h-6 text-slate2" strokeWidth={1.4} />
      {msg}
    </div>
  );
}
