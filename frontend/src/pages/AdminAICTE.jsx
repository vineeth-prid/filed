import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  Plug, RefreshCw, Database, FileJson, CheckCircle2, AlertTriangle, Clock,
  X, ArrowLeft, Server, Calendar, ListChecks,
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

function fmt(ts) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function StatusPill({ status }) {
  const map = {
    Completed: "bg-emerald2/15 text-emerald2 border-emerald2/30",
    Running: "bg-steel/15 text-steel border-steel/30",
    Queued: "bg-amber2/15 text-amber2 border-amber2/30",
    Failed: "bg-red-100 text-red-600 border-red-200",
    Interrupted: "bg-amber2/15 text-amber2 border-amber2/30",
  };
  const cls = map[status] || "bg-slate-100 text-slate2 border-border";
  return <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border ${cls}`}>{status || "—"}</span>;
}

export default function AdminAICTE() {
  const [ov, setOv] = useState(null);
  const [endpoints, setEndpoints] = useState([]);
  const [records, setRecords] = useState([]);
  const [recTotal, setRecTotal] = useState(0);
  const [payloads, setPayloads] = useState([]);
  const [runs, setRuns] = useState([]);
  const [tab, setTab] = useState("overview");
  const [year, setYear] = useState("2025-2026");
  const [catFilter, setCatFilter] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeRun, setActiveRun] = useState(null);
  const [viewPayload, setViewPayload] = useState(null);
  const [logRun, setLogRun] = useState(null);

  const fetchOverview = useCallback(async () => {
    const { data } = await axios.get(`${API}/admin/aicte/overview`);
    setOv(data);
  }, []);
  const fetchEndpoints = useCallback(async () => {
    const { data } = await axios.get(`${API}/admin/aicte/sources`);
    setEndpoints(data.endpoints || []);
  }, []);
  const fetchRecords = useCallback(async () => {
    const params = new URLSearchParams({ limit: "200" });
    if (year) params.set("academic_year", year);
    if (catFilter) params.set("category", catFilter);
    if (q) params.set("q", q);
    const { data } = await axios.get(`${API}/admin/aicte/records?${params}`);
    setRecords(data.records || []);
    setRecTotal(data.total || 0);
  }, [year, catFilter, q]);
  const fetchPayloads = useCallback(async () => {
    const { data } = await axios.get(`${API}/admin/aicte/payloads?limit=50`);
    setPayloads(data.payloads || []);
  }, []);
  const fetchRuns = useCallback(async () => {
    const src = await axios.get(`${API}/admin/sources`);
    const aicte = (src.data.sources || []).find((s) => s.source_type === "AICTE");
    if (aicte) {
      const { data } = await axios.get(`${API}/admin/sources/${aicte.id}/runs?limit=50`);
      setRuns(data.runs || []);
    }
  }, []);

  useEffect(() => { fetchOverview(); fetchEndpoints(); fetchPayloads(); fetchRuns(); }, [fetchOverview, fetchEndpoints, fetchPayloads, fetchRuns]);
  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const sync = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/admin/aicte/sync`, { academic_year: year });
      setActiveRun({ id: data.run_id, status: "Queued", source_type: "AICTE", logs: [] });
      startRunPoller(data.run_id, (r) => setActiveRun(r), () => {
        fetchOverview(); fetchEndpoints(); fetchRecords(); fetchPayloads(); fetchRuns();
      });
    } finally {
      setBusy(false);
    }
  };

  const toggleEndpoint = async (ep) => {
    await axios.patch(`${API}/admin/aicte/sources/${ep.id}`, { active: !ep.active });
    fetchEndpoints();
  };

  const renormalize = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/admin/aicte/renormalize`, {});
      window.alert(`Re-normalized ${data.renormalized} record(s) across ${data.groups} group(s) from stored raw payloads.`);
      fetchOverview(); fetchRecords(); fetchPayloads();
    } finally {
      setBusy(false);
    }
  };

  const openPayload = async (p) => {
    const { data } = await axios.get(`${API}/admin/aicte/payloads/${p.id}`);
    setViewPayload(data);
  };

  const TABS = [
    ["overview", "Overview", Server],
    ["endpoints", "Endpoints", Plug],
    ["records", "Records", Database],
    ["payloads", "Raw Payloads", FileJson],
    ["history", "Sync History", ListChecks],
  ];

  return (
    <div data-testid="admin-aicte-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate2 hover:text-navy mb-5">
          <ArrowLeft className="w-3.5 h-3.5" /> Admin Panel
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono flex items-center gap-2">
              <Plug className="w-3.5 h-3.5 text-emerald2" /> AICTE Connector · JSON API
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl tracking-tighter font-bold leading-[1.02]">
              AICTE.<br /><span className="text-slate2">Approved-intake disclosures, normalized.</span>
            </h1>
          </div>
          <div className="flex items-end gap-3">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-slate2 font-mono mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Academic Year</div>
              <select data-testid="aicte-year" value={year} onChange={(e) => setYear(e.target.value)}
                className="border border-border bg-white px-3 py-2 text-navy text-sm font-mono">
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button data-testid="aicte-sync-btn" disabled={busy} onClick={sync}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-navy text-white text-xs font-mono uppercase tracking-wider hover:bg-emerald2 hover:text-navy transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Manual Sync
            </button>
            <button data-testid="aicte-renormalize-btn" disabled={busy} onClick={renormalize}
              title="Rebuild normalized records from stored raw payloads (no network call)"
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-border text-navy text-xs font-mono uppercase tracking-wider hover:border-navy transition-colors disabled:opacity-50">
              <ListChecks className="w-4 h-4" /> Re-normalize
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-px bg-border border border-border w-fit mb-6">
          {TABS.map(([k, label, Icon]) => (
            <button key={k} data-testid={`tab-${k}`} onClick={() => setTab(k)}
              className={`px-4 py-2 text-xs font-mono uppercase tracking-wider flex items-center gap-2 ${tab === k ? "bg-navy text-white" : "bg-white text-slate2 hover:text-navy"}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {tab === "overview" && ov && (
          <div data-testid="aicte-overview">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border border border-border mb-6">
              <Stat k="Endpoints" v={ov.endpoints} sub={`${ov.active_endpoints} active`} />
              <Stat k="Records Imported" v={ov.records_imported} />
              <Stat k="Raw Payloads" v={ov.raw_payloads} />
              <Stat k="Academic Years" v={ov.academic_years?.length} sub={ov.academic_years?.join(" · ")} />
              <Stat k="Categories" v={ov.categories?.length} sub={ov.categories?.join(" · ")} />
            </div>
            {ov.last_run && (
              <div className="border border-border bg-white p-4 flex items-center justify-between">
                <div className="text-xs font-mono text-slate2">
                  Last sync: {fmt(ov.last_run.started_at || ov.last_run.created_at)} · {ov.last_run.records_processed ?? 0} records
                  {ov.last_run.data_origin && <span className={ov.last_run.data_origin === "simulated" ? " text-amber2" : " text-emerald2"}> · {ov.last_run.data_origin}</span>}
                </div>
                <StatusPill status={ov.last_run.status} />
              </div>
            )}
            <div className="mt-6 border border-border bg-white p-5 text-sm text-slate2 leading-relaxed">
              <div className="font-heading font-bold text-navy mb-2">Data flow</div>
              AICTE API → Fetch JSON → Store Raw Payload (immutable) → Normalize → Validate → Publish to <code className="font-mono text-xs">aicte_records</code>.
              Categories (NRI / PIO / FN / CIWG) are configured dynamically as endpoints — add more without code changes.
            </div>
          </div>
        )}

        {tab === "endpoints" && (
          <div data-testid="aicte-endpoints" className="border border-border bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-navy/[0.03] text-[10px] uppercase tracking-wider text-slate2 font-mono">
                <th className="text-left px-4 py-3">Endpoint</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-left px-4 py-3">URL</th>
                <th className="text-left px-4 py-3">Active</th>
              </tr></thead>
              <tbody>
                {endpoints.map((ep) => (
                  <tr key={ep.id} className="border-t border-border">
                    <td className="px-4 py-3 font-heading font-semibold">{ep.endpoint_name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{ep.category}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-slate2 max-w-md truncate">{ep.endpoint_url}</td>
                    <td className="px-4 py-3">
                      <button data-testid={`toggle-${ep.category}`} onClick={() => toggleEndpoint(ep)}
                        className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider border ${ep.active ? "bg-emerald2/15 text-emerald2 border-emerald2/30" : "bg-slate-100 text-slate2 border-border"}`}>
                        {ep.active ? "Active" : "Inactive"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "records" && (
          <div data-testid="aicte-records">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <input data-testid="rec-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search institution…"
                className="border border-border bg-white px-3 py-2 text-sm w-64" />
              <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="border border-border bg-white px-3 py-2 text-sm font-mono">
                <option value="">All categories</option>
                {(ov?.categories || ["NRI", "PIO", "FN", "CIWG"]).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <span className="text-xs font-mono text-slate2">{recTotal} records · {year}</span>
            </div>
            <div className="border border-border bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-navy/[0.03] text-[10px] uppercase tracking-wider text-slate2 font-mono">
                  <th className="text-left px-3 py-3">Institution</th>
                  <th className="text-left px-3 py-3">State</th>
                  <th className="text-left px-3 py-3">Course</th>
                  <th className="text-left px-3 py-3">Level</th>
                  <th className="text-left px-3 py-3">Cat</th>
                  <th className="text-right px-3 py-3">Approved</th>
                  <th className="text-right px-3 py-3">Special</th>
                </tr></thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-navy">{r.collegename}</div>
                        <div className="text-[10px] font-mono text-slate2">{r.university || "—"} · {r.institution_type || "—"}</div>
                      </td>
                      <td className="px-3 py-2.5 text-xs">{r.state || "—"}</td>
                      <td className="px-3 py-2.5 text-xs">{r.course_name || "—"}</td>
                      <td className="px-3 py-2.5 text-xs font-mono">{r.course_level || "—"}</td>
                      <td className="px-3 py-2.5 text-xs font-mono">{r.source_category}</td>
                      <td className="px-3 py-2.5 text-right tabular">{r.approved_intake ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular">{r.special_intake ?? "—"}</td>
                    </tr>
                  ))}
                  {!records.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-slate2">No records for these filters. Run a sync.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "payloads" && (
          <div data-testid="aicte-payloads" className="border border-border bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-navy/[0.03] text-[10px] uppercase tracking-wider text-slate2 font-mono">
                <th className="text-left px-4 py-3">Fetched</th>
                <th className="text-left px-4 py-3">Year</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-right px-4 py-3">Records</th>
                <th className="text-left px-4 py-3">Origin</th>
                <th className="text-right px-4 py-3"></th>
              </tr></thead>
              <tbody>
                {payloads.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-2.5 font-mono text-[11px]">{fmt(p.fetched_at)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{p.academic_year}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{p.source_category || "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular">{p.record_count}</td>
                    <td className="px-4 py-2.5"><span className={`text-[10px] font-mono ${p.data_origin === "simulated" ? "text-amber2" : "text-emerald2"}`}>{p.data_origin || "live"}</span></td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => openPayload(p)} className="text-[11px] font-mono uppercase tracking-wider text-emerald2 hover:underline">View JSON</button>
                    </td>
                  </tr>
                ))}
                {!payloads.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate2">No payloads yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "history" && (
          <div data-testid="aicte-history">
            {runs.map((r) => (
              <button key={r.id} onClick={() => setLogRun(r)}
                className="w-full text-left border border-border bg-white p-3 mb-2 hover:border-navy flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono">{fmt(r.started_at || r.created_at)}</div>
                  <div className="text-[10px] text-slate2 font-mono">{r.run_type} · {r.records_processed ?? 0} records{r.errors?.length ? ` · ${r.errors.length} errors` : ""}{r.data_origin ? ` · ${r.data_origin}` : ""}</div>
                </div>
                <StatusPill status={r.status} />
              </button>
            ))}
            {!runs.length && <div className="text-sm text-slate2">No sync history yet. Run a manual sync.</div>}
          </div>
        )}
      </main>
      <Footer />

      {activeRun && <RunPanel run={activeRun} onClose={() => setActiveRun(null)} title="Live Sync" />}
      {logRun && <RunPanel run={logRun} onClose={() => setLogRun(null)} title="Run Details" />}

      {viewPayload && (
        <div className="fixed inset-0 bg-navy/40 z-50 flex items-center justify-center p-4" onClick={() => setViewPayload(null)}>
          <div className="bg-white border border-border max-w-3xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-white">
              <div className="font-heading font-bold">Raw Payload · {viewPayload.source_category} · {viewPayload.academic_year}
                <span className={`ml-2 text-[10px] font-mono ${viewPayload.data_origin === "simulated" ? "text-amber2" : "text-emerald2"}`}>{viewPayload.data_origin}</span></div>
              <button onClick={() => setViewPayload(null)}><X className="w-5 h-5 text-slate2" /></button>
            </div>
            <pre className="p-5 text-[10px] font-mono text-slate2 overflow-x-auto">{JSON.stringify(viewPayload.payload_json, null, 2)}</pre>
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
    <div className="fixed bottom-0 right-0 m-4 w-full max-w-md bg-white border border-border shadow-2xl z-50" data-testid="aicte-run-panel">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 font-heading font-bold text-sm">
          {ok ? <CheckCircle2 className="w-4 h-4 text-emerald2" /> : failed ? <AlertTriangle className="w-4 h-4 text-red-500" /> : <Clock className="w-4 h-4 text-steel animate-pulse" />}
          {title}
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

function Stat({ k, v, sub }) {
  return (
    <div className="bg-white p-4">
      <div className="text-[9px] uppercase tracking-[0.16em] text-slate2 font-semibold">{k}</div>
      <div className="font-heading font-bold text-2xl mt-1 text-navy tabular">{v ?? "—"}</div>
      {sub && <div className="text-[9px] text-slate2 font-mono mt-0.5 truncate">{sub}</div>}
    </div>
  );
}
