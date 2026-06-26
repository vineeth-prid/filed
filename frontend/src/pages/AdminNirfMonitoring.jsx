import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  Activity, ArrowLeft, RotateCcw, CheckCircle2, AlertTriangle, Clock, X,
  History, Database, Layers,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function fmt(ts) { if (!ts) return "—"; try { return new Date(ts).toLocaleString(); } catch { return ts; } }

function StatusPill({ status }) {
  const map = {
    Completed: "bg-emerald2/15 text-emerald2 border-emerald2/30",
    Downloaded: "bg-emerald2/15 text-emerald2 border-emerald2/30",
    Running: "bg-steel/15 text-steel border-steel/30",
    Queued: "bg-amber2/15 text-amber2 border-amber2/30",
    Pending: "bg-amber2/15 text-amber2 border-amber2/30",
    Failed: "bg-red-100 text-red-600 border-red-200",
    Interrupted: "bg-amber2/15 text-amber2 border-amber2/30",
  };
  const cls = map[status] || "bg-slate-100 text-slate2 border-border";
  return <span className={`inline-flex px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border ${cls}`}>{status || "—"}</span>;
}

export default function AdminNirfMonitoring() {
  const [year, setYear] = useState(2024);
  const [category, setCategory] = useState("Engineering");
  const [categories, setCategories] = useState([]);
  const [ov, setOv] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [docs, setDocs] = useState([]);
  const [counts, setCounts] = useState({ Pending: 0, Downloaded: 0, Failed: 0 });
  const [logJob, setLogJob] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    axios.get(`${API}/admin/nirf/categories`).then((r) => setCategories(r.data?.categories || [])).catch(() => {});
  }, []);

  const fetchAll = useCallback(async () => {
    const [o, j, d] = await Promise.all([
      axios.get(`${API}/admin/nirf/overview?year=${year}&category=${category}`),
      axios.get(`${API}/admin/nirf/jobs?limit=25`),
      axios.get(`${API}/admin/nirf/documents?year=${year}&category=${category}&limit=500`),
    ]);
    setOv(o.data);
    setJobs(j.data || []);
    setDocs(d.data?.documents || []);
    setCounts(d.data?.counts || { Pending: 0, Downloaded: 0, Failed: 0 });
  }, [year, category]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const retry = async (id) => {
    setBusyId(id);
    try { await axios.post(`${API}/admin/nirf/documents/${id}/retry`); await fetchAll(); }
    finally { setBusyId(null); }
  };

  const failedDocs = docs.filter((d) => d.status === "Failed");

  return (
    <div data-testid="admin-nirf-monitoring-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate2 hover:text-navy mb-5">
          <ArrowLeft className="w-3.5 h-3.5" /> Admin Panel
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-emerald2" /> NIRF · Stage 3
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl tracking-tighter font-bold leading-[1.02]">
              Version & Monitoring.<br /><span className="text-slate2">Runs, documents, health & versions.</span>
            </h1>
          </div>
          <div className="flex items-end gap-3">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-slate2 font-mono mb-1">Year</div>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-border bg-white px-3 py-2 text-sm font-mono">
                {(ov?.years_tracked?.length ? ov.years_tracked : [2024]).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-slate2 font-mono mb-1">Category</div>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-border bg-white px-3 py-2 text-sm font-mono">
                {(categories.length ? categories : ["Engineering"]).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Connector health / pipeline counts */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border border border-border mb-6">
          <Stat k="Institutions" v={ov?.institutions} />
          <Stat k="Downloaded" v={counts.Downloaded} />
          <Stat k="Failed Downloads" v={counts.Failed} danger={counts.Failed > 0} />
          <Stat k="Extractions" v={ov?.extractions} />
          <Stat k="Year Versions" v={ov?.years_tracked?.length} sub={ov?.years_tracked?.join(" · ")} />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Reprocessing queue (failed downloads) */}
          <section className="border border-border bg-white">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div className="font-heading font-bold flex items-center gap-2"><RotateCcw className="w-4 h-4 text-emerald2" /> Reprocessing Queue</div>
              <span className="text-[11px] font-mono text-slate2">{failedDocs.length} failed</span>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {failedDocs.length === 0 && <div className="px-5 py-8 text-center text-sm text-slate2">No failed downloads. Pipeline healthy.</div>}
              {failedDocs.map((d) => (
                <div key={d.id} className="flex items-center justify-between px-5 py-2.5 border-b border-border last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-navy truncate">{d.college_name || d.institute_id}</div>
                    <div className="text-[10px] font-mono text-slate2 truncate">{d.error || "download failed"}</div>
                  </div>
                  <button disabled={busyId === d.id} onClick={() => retry(d.id)} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 border border-border text-[11px] font-mono uppercase tracking-wider text-slate2 hover:text-navy hover:border-navy disabled:opacity-50">
                    <RotateCcw className={`w-3.5 h-3.5 ${busyId === d.id ? "animate-spin" : ""}`} /> Retry
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Sync history / historical runs */}
          <section className="border border-border bg-white">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2 font-heading font-bold"><History className="w-4 h-4 text-emerald2" /> Sync History</div>
            <div className="max-h-80 overflow-y-auto">
              {jobs.length === 0 && <div className="px-5 py-8 text-center text-sm text-slate2">No sync runs yet.</div>}
              {jobs.map((j) => (
                <button key={j.id} onClick={() => setLogJob(j)} className="w-full text-left flex items-center justify-between px-5 py-2.5 border-b border-border last:border-0 hover:bg-navy/[0.02]">
                  <div>
                    <div className="text-sm font-mono">NIRF {j.year} · {j.category}</div>
                    <div className="text-[10px] font-mono text-slate2">{fmt(j.created_at)} · {j.stats?.downloaded ?? 0}/{j.stats?.total ?? 0} downloaded{j.stats?.failed ? ` · ${j.stats.failed} failed` : ""}</div>
                  </div>
                  <StatusPill status={j.status} />
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Year versions + last refresh */}
        <section className="mt-6 border border-border bg-white p-5">
          <div className="font-heading font-bold flex items-center gap-2 mb-3"><Layers className="w-4 h-4 text-emerald2" /> Year Versions</div>
          <div className="flex flex-wrap gap-2">
            {(ov?.years_tracked || []).map((y) => (
              <span key={y} className="px-3 py-1.5 border border-border font-mono text-xs">{y}</span>
            ))}
            {!ov?.years_tracked?.length && <span className="text-sm text-slate2">No versioned years yet.</span>}
          </div>
          {ov?.last_refresh && (
            <div className="mt-4 text-[11px] font-mono text-slate2 flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-emerald2" /> Last refresh: NIRF {ov.last_refresh.year} · {ov.last_refresh.status}
              {ov.last_refresh.data_origin === "simulated" && <span className="text-amber2"> · simulated</span>}
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate2">Annual refresh & year-on-year history remain available; this view surfaces versions and run history. KPI/Intelligence scoring has moved out of the connector to a future Business Intelligence module.</p>
        </section>
      </main>
      <Footer />

      {logJob && (
        <div className="fixed bottom-0 right-0 m-4 w-full max-w-md bg-white border border-border shadow-2xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 font-heading font-bold text-sm">
              {logJob.status === "Completed" ? <CheckCircle2 className="w-4 h-4 text-emerald2" /> : logJob.status === "Failed" ? <AlertTriangle className="w-4 h-4 text-red-500" /> : <Clock className="w-4 h-4 text-steel" />}
              Run Details · NIRF {logJob.year}
            </div>
            <button onClick={() => setLogJob(null)}><X className="w-4 h-4 text-slate2" /></button>
          </div>
          <div className="max-h-72 overflow-y-auto px-4 py-3 font-mono text-[10px] text-slate2 leading-relaxed bg-navy/[0.02]">
            {(logJob.logs || []).map((l, i) => <div key={i}>{l}</div>)}
            {!logJob.logs?.length && <div>No logs recorded.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ k, v, sub, danger }) {
  return (
    <div className="bg-white p-4">
      <div className="text-[9px] uppercase tracking-[0.16em] text-slate2 font-semibold">{k}</div>
      <div className={`font-heading font-bold text-2xl mt-1 tabular ${danger ? "text-red-500" : "text-navy"}`}>{v ?? "—"}</div>
      {sub && <div className="text-[9px] text-slate2 font-mono mt-0.5 truncate">{sub}</div>}
    </div>
  );
}
