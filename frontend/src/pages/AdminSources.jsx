import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  Layers, RefreshCw, History, Activity, CheckCircle2, AlertTriangle,
  Clock, X, ArrowLeft, Server, Database,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const YEARS = ["2023-2024", "2024-2025", "2025-2026", "2026-2027"];

function startRunPoller(runId, onUpdate, onDone) {
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    axios.get(`${API}/admin/sync-runs/${runId}`).then(({ data }) => {
      if (stopped) return;
      onUpdate(data);
      if (["Completed", "Failed", "Interrupted"].includes(data.status)) { onDone(); return; }
      setTimeout(tick, 1500);
    }).catch(() => { if (!stopped) setTimeout(tick, 2200); });
  };
  setTimeout(tick, 500);
  return () => { stopped = true; };
}

function StatusPill({ status }) {
  const map = {
    active: "bg-emerald2/15 text-emerald2 border-emerald2/30",
    Completed: "bg-emerald2/15 text-emerald2 border-emerald2/30",
    Running: "bg-steel/15 text-steel border-steel/30",
    Queued: "bg-amber2/15 text-amber2 border-amber2/30",
    Failed: "bg-red-100 text-red-600 border-red-200",
    error: "bg-red-100 text-red-600 border-red-200",
    Interrupted: "bg-amber2/15 text-amber2 border-amber2/30",
  };
  const cls = map[status] || "bg-slate-100 text-slate2 border-border";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border ${cls}`}>
      {status || "—"}
    </span>
  );
}

function fmt(ts) {
  if (!ts) return "Never";
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

export default function AdminSources() {
  const [sources, setSources] = useState([]);
  const [tab, setTab] = useState("sources");
  const [monitoring, setMonitoring] = useState(null);
  const [year, setYear] = useState("2025-2026");
  const [activeRun, setActiveRun] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [historyRuns, setHistoryRuns] = useState([]);
  const [logRun, setLogRun] = useState(null);

  const fetchSources = useCallback(async () => {
    const { data } = await axios.get(`${API}/admin/sources`);
    setSources(data.sources || []);
  }, []);

  const fetchMonitoring = useCallback(async () => {
    const { data } = await axios.get(`${API}/admin/monitoring`);
    setMonitoring(data);
  }, []);

  useEffect(() => { fetchSources(); fetchMonitoring(); }, [fetchSources, fetchMonitoring]);

  const syncSource = async (src) => {
    setBusyId(src.id);
    try {
      const body = src.source_type === "AICTE" ? { academic_year: year } : {};
      const { data } = await axios.post(`${API}/admin/sources/${src.id}/sync`, body);
      setActiveRun({ id: data.run_id, status: "Queued", source_type: src.source_type, logs: [] });
      startRunPoller(data.run_id, (r) => setActiveRun(r), () => { fetchSources(); fetchMonitoring(); });
    } finally {
      setBusyId(null);
    }
  };

  const openHistory = async (src) => {
    setHistoryFor(src);
    const { data } = await axios.get(`${API}/admin/sources/${src.id}/runs?limit=50`);
    setHistoryRuns(data.runs || []);
  };

  return (
    <div data-testid="admin-sources-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate2 hover:text-navy mb-5">
          <ArrowLeft className="w-3.5 h-3.5" /> Admin Panel
        </Link>
        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-emerald2" /> Data Sources
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl tracking-tighter font-bold leading-[1.02]">
            Data Sources.<br />
            <span className="text-slate2">Manage every connector from one place.</span>
          </h1>
          <p className="mt-4 text-sm text-slate2 max-w-2xl">
            A source-independent acquisition layer. Sync, track history, view logs and monitor every
            connector. New sources (NAAC, TNEA, AISHE) plug in without touching existing pipelines.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-px bg-border border border-border w-fit mb-6">
          {[["sources", "Sources", Server], ["monitoring", "Monitoring", Activity]].map(([k, label, Icon]) => (
            <button key={k} data-testid={`tab-${k}`} onClick={() => setTab(k)}
              className={`px-5 py-2 text-xs font-mono uppercase tracking-wider flex items-center gap-2 ${tab === k ? "bg-navy text-white" : "bg-white text-slate2 hover:text-navy"}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* Year selector (applies to year-based connectors like AICTE) */}
        {tab === "sources" && (
          <div className="flex items-center gap-3 mb-5 text-xs font-mono text-slate2">
            <span className="uppercase tracking-wider">Academic Year</span>
            <select data-testid="year-select" value={year} onChange={(e) => setYear(e.target.value)}
              className="border border-border bg-white px-3 py-1.5 text-navy">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-[10px]">(used by year-based connectors, e.g. AICTE)</span>
          </div>
        )}

        {tab === "sources" && (
          <div data-testid="sources-table" className="border border-border bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy/[0.03] text-[10px] uppercase tracking-wider text-slate2 font-mono">
                  <th className="text-left px-4 py-3">Source</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Connector</th>
                  <th className="text-right px-4 py-3">Records</th>
                  <th className="text-left px-4 py-3">Years Available</th>
                  <th className="text-left px-4 py-3">Last Sync</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id} data-testid={`source-row-${s.source_type}`} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-navy flex items-center justify-center">
                          <Database className="w-4 h-4 text-white" strokeWidth={1.6} />
                        </div>
                        <div>
                          <div className="font-heading font-bold text-navy">{s.source_name}</div>
                          <div className="text-[10px] font-mono text-slate2">{s.source_type}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-slate2">{s.connector_type}</td>
                    <td className="px-4 py-3 text-right tabular font-semibold">{s.records ?? 0}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate2">{s.years_available?.length ? s.years_available.join(" · ") : "—"}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate2">{fmt(s.last_sync)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button data-testid={`sync-${s.source_type}`} disabled={busyId === s.id}
                          onClick={() => syncSource(s)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-navy text-white text-[11px] font-mono uppercase tracking-wider hover:bg-emerald2 hover:text-navy transition-colors disabled:opacity-50">
                          <RefreshCw className={`w-3.5 h-3.5 ${busyId === s.id ? "animate-spin" : ""}`} /> Sync
                        </button>
                        <button data-testid={`history-${s.source_type}`} onClick={() => openHistory(s)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border text-[11px] font-mono uppercase tracking-wider text-slate2 hover:text-navy hover:border-navy transition-colors">
                          <History className="w-3.5 h-3.5" /> History
                        </button>
                        {s.source_type === "AICTE" && (
                          <Link to="/admin/aicte" className="text-[11px] font-mono uppercase tracking-wider text-emerald2 hover:underline px-2">Open</Link>
                        )}
                        {s.source_type === "NIRF" && (
                          <Link to="/admin/nirf" className="text-[11px] font-mono uppercase tracking-wider text-emerald2 hover:underline px-2">Open</Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "monitoring" && monitoring && (
          <div data-testid="monitoring-view">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mb-6">
              <Stat k="Sources" v={monitoring.sources} />
              <Stat k="Total Runs" v={monitoring.total_runs} />
              <Stat k="Active" v={monitoring.active_runs} />
              <Stat k="Failed" v={monitoring.failed_runs} danger={monitoring.failed_runs > 0} />
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              <div className="border border-border bg-white p-5">
                <div className="text-[10px] uppercase tracking-wider text-slate2 font-mono mb-3">By Source</div>
                {monitoring.by_source?.map((b) => (
                  <div key={b.source_type} className="flex items-center justify-between py-2 border-t border-border first:border-t-0">
                    <div className="font-heading font-semibold text-sm">{b.source_name}
                      <span className="ml-2 text-[10px] font-mono text-slate2">{b.runs} runs</span></div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-slate2">{fmt(b.last_sync)}</span>
                      <StatusPill status={b.last_status} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="border border-border bg-white p-5">
                <div className="text-[10px] uppercase tracking-wider text-slate2 font-mono mb-3">Recent Runs</div>
                {monitoring.recent_runs?.map((r) => (
                  <button key={r.id} onClick={() => setLogRun(r)}
                    className="w-full flex items-center justify-between py-2 border-t border-border first:border-t-0 text-left hover:bg-navy/[0.02]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold">{r.source_type}</span>
                      <span className="text-[10px] font-mono text-slate2">{r.run_type}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-slate2">{r.records_processed ?? 0} recs</span>
                      <StatusPill status={r.status} />
                    </div>
                  </button>
                ))}
                {!monitoring.recent_runs?.length && <div className="text-xs text-slate2">No runs yet.</div>}
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />

      {/* Active sync progress drawer */}
      {activeRun && (
        <RunPanel run={activeRun} onClose={() => setActiveRun(null)} title="Live Sync" />
      )}
      {/* Log viewer for a historical run */}
      {logRun && (
        <RunPanel run={logRun} onClose={() => setLogRun(null)} title="Run Details" />
      )}

      {/* History modal */}
      {historyFor && (
        <div className="fixed inset-0 bg-navy/40 z-50 flex items-center justify-center p-4" onClick={() => setHistoryFor(null)}>
          <div data-testid="history-modal" className="bg-white border border-border max-w-3xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-white">
              <div className="font-heading font-bold">Sync History — {historyFor.source_name}</div>
              <button onClick={() => setHistoryFor(null)}><X className="w-5 h-5 text-slate2" /></button>
            </div>
            <div className="p-5">
              {historyRuns.length === 0 && <div className="text-sm text-slate2">No sync runs yet.</div>}
              {historyRuns.map((r) => (
                <button key={r.id} onClick={() => setLogRun(r)}
                  className="w-full text-left border border-border p-3 mb-2 hover:border-navy flex items-center justify-between">
                  <div>
                    <div className="text-xs font-mono">{fmt(r.started_at || r.created_at)}</div>
                    <div className="text-[10px] text-slate2 font-mono">{r.run_type} · {r.records_processed ?? 0} records{r.data_origin ? ` · ${r.data_origin}` : ""}</div>
                  </div>
                  <StatusPill status={r.status} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RunPanel({ run, onClose, title }) {
  const ok = run.status === "Completed";
  const failed = run.status === "Failed" || run.status === "Interrupted";
  return (
    <div className="fixed bottom-0 right-0 m-4 w-full max-w-md bg-white border border-border shadow-2xl z-50" data-testid="run-panel">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 font-heading font-bold text-sm">
          {ok ? <CheckCircle2 className="w-4 h-4 text-emerald2" /> : failed ? <AlertTriangle className="w-4 h-4 text-red-500" /> : <Clock className="w-4 h-4 text-steel animate-pulse" />}
          {title} · {run.source_type}
        </div>
        <button onClick={onClose}><X className="w-4 h-4 text-slate2" /></button>
      </div>
      <div className="px-4 py-2 flex items-center gap-3 text-[11px] font-mono text-slate2 border-b border-border">
        <span>Status: <b className="text-navy">{run.status}</b></span>
        <span>Records: <b className="text-navy">{run.records_processed ?? 0}</b></span>
        {run.data_origin && <span>Origin: <b className={run.data_origin === "simulated" ? "text-amber2" : "text-emerald2"}>{run.data_origin}</b></span>}
      </div>
      {run.data_origin === "simulated" && (
        <div className="px-4 py-2 text-[10px] text-amber2 bg-amber2/10 border-b border-border">
          Upstream AICTE endpoint unreachable from this environment — using clearly-labelled simulated payload.
        </div>
      )}
      <div className="max-h-64 overflow-y-auto px-4 py-3 font-mono text-[10px] text-slate2 leading-relaxed bg-navy/[0.02]">
        {(run.logs || []).map((l, i) => <div key={i}>{l}</div>)}
        {!run.logs?.length && <div>Waiting for logs…</div>}
        {run.errors?.length > 0 && run.errors.map((e, i) => <div key={`e${i}`} className="text-red-500">ERROR: {e}</div>)}
      </div>
    </div>
  );
}

function Stat({ k, v, danger }) {
  return (
    <div className="bg-white p-4">
      <div className="text-[9px] uppercase tracking-[0.16em] text-slate2 font-semibold">{k}</div>
      <div className={`font-heading font-bold text-2xl mt-1 tabular ${danger ? "text-red-500" : "text-navy"}`}>{v ?? "—"}</div>
    </div>
  );
}
