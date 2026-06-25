import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  GraduationCap, RefreshCw, FileText, FileSearch, X, ArrowLeft, Server,
  CheckCircle2, AlertTriangle, Clock, Link2, CalendarClock, ListChecks, Building2,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function startRunPoller(runId, onUpdate, onDone) {
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    axios.get(`${API}/admin/sync-runs/${runId}`).then(({ data }) => {
      if (stopped) return;
      onUpdate(data);
      if (["Completed", "Failed", "Interrupted"].includes(data.status)) { onDone(); return; }
      setTimeout(tick, 1800);
    }).catch(() => { if (!stopped) setTimeout(tick, 2500); });
  };
  setTimeout(tick, 600);
  return () => { stopped = true; };
}

function fmt(ts) { if (!ts) return "—"; try { return new Date(ts).toLocaleString(); } catch { return ts; } }

function StatusPill({ status }) {
  const map = {
    active: "bg-emerald2/15 text-emerald2 border-emerald2/30",
    Completed: "bg-emerald2/15 text-emerald2 border-emerald2/30",
    success: "bg-emerald2/15 text-emerald2 border-emerald2/30",
    Running: "bg-steel/15 text-steel border-steel/30",
    Queued: "bg-amber2/15 text-amber2 border-amber2/30",
    pending: "bg-amber2/15 text-amber2 border-amber2/30",
    Failed: "bg-red-100 text-red-600 border-red-200",
    failed: "bg-red-100 text-red-600 border-red-200",
    Interrupted: "bg-amber2/15 text-amber2 border-amber2/30",
  };
  const cls = map[status] || "bg-slate-100 text-slate2 border-border";
  return <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border ${cls}`}>{status || "—"}</span>;
}

export default function AdminNAAC() {
  const [ov, setOv] = useState(null);
  const [tab, setTab] = useState("overview");
  const [institutions, setInstitutions] = useState([]);
  const [instTotal, setInstTotal] = useState(0);
  const [q, setQ] = useState("");
  const [documents, setDocuments] = useState([]);
  const [runs, setRuns] = useState([]);
  const [detail, setDetail] = useState(null);
  const [extractionDoc, setExtractionDoc] = useState(null);
  const [busy, setBusy] = useState(false);
  const [activeRun, setActiveRun] = useState(null);
  const [logRun, setLogRun] = useState(null);
  const [schedule, setSchedule] = useState(null);

  // sync form
  const [mode, setMode] = useState("manual");
  const [instType, setInstType] = useState("2");
  const [stateId, setStateId] = useState("5");
  const [cycle, setCycle] = useState("0");
  const [iiqaStatus, setIiqaStatus] = useState("5");
  const [instName, setInstName] = useState("");
  const [heiId, setHeiId] = useState("");
  const [limit, setLimit] = useState(25);
  const [downloadPdfs, setDownloadPdfs] = useState(true);
  const [extractPdfs, setExtractPdfs] = useState(true);
  // filter dropdown options discovered from the portal
  const [filterOpts, setFilterOpts] = useState(null);
  const [filterStatus, setFilterStatus] = useState("idle"); // idle | loading | ok | manual
  const [filterNote, setFilterNote] = useState("");

  const loadFilters = useCallback(async () => {
    setFilterStatus("loading");
    try {
      const { data } = await axios.get(`${API}/admin/naac/filters`);
      if (data.ok && data.filters) {
        setFilterOpts(data.filters); setFilterStatus("ok"); setFilterNote("");
      } else {
        setFilterOpts(null); setFilterStatus("manual");
        setFilterNote(data.error || data.note || "Portal dropdowns unavailable from here — enter IDs manually.");
      }
    } catch (e) {
      setFilterOpts(null); setFilterStatus("manual");
      setFilterNote("Could not load filter options — enter IDs manually.");
    }
  }, []);

  const fetchOverview = useCallback(async () => {
    const { data } = await axios.get(`${API}/admin/naac/overview`); setOv(data);
  }, []);
  const fetchInstitutions = useCallback(async () => {
    const p = new URLSearchParams({ limit: "200" }); if (q) p.set("q", q);
    const { data } = await axios.get(`${API}/admin/naac/institutions?${p}`);
    setInstitutions(data.institutions || []); setInstTotal(data.total || 0);
  }, [q]);
  const fetchDocuments = useCallback(async () => {
    const { data } = await axios.get(`${API}/admin/naac/documents?limit=200`); setDocuments(data.documents || []);
  }, []);
  const fetchRuns = useCallback(async () => {
    const src = await axios.get(`${API}/admin/sources`);
    const naac = (src.data.sources || []).find((s) => s.source_type === "NAAC");
    if (naac) { const { data } = await axios.get(`${API}/admin/sources/${naac.id}/runs?limit=50`); setRuns(data.runs || []); }
  }, []);
  const fetchSchedule = useCallback(async () => {
    const { data } = await axios.get(`${API}/admin/naac/schedule`); setSchedule(data);
  }, []);

  useEffect(() => { fetchOverview(); fetchDocuments(); fetchRuns(); fetchSchedule(); }, [fetchOverview, fetchDocuments, fetchRuns, fetchSchedule]);
  useEffect(() => { fetchInstitutions(); }, [fetchInstitutions]);
  useEffect(() => { if (tab === "sync" && filterStatus === "idle") loadFilters(); }, [tab, filterStatus, loadFilters]);

  const sync = async () => {
    setBusy(true);
    try {
      const body = {
        mode,
        filters: { inst_type: instType, state: stateId, cycle, iiqa_status: iiqaStatus, inst_name: instName },
        hei_assessment_id: heiId ? Number(heiId) : null,
        state: stateId, cycle,
        limit: Number(limit), download_pdfs: downloadPdfs, extract_pdfs: extractPdfs,
      };
      const { data } = await axios.post(`${API}/admin/naac/sync`, body);
      setActiveRun({ id: data.run_id, status: "Queued", source_type: "NAAC", logs: [] });
      startRunPoller(data.run_id, (r) => setActiveRun(r), () => {
        fetchOverview(); fetchInstitutions(); fetchDocuments(); fetchRuns();
      });
    } finally { setBusy(false); }
  };

  const openDetail = async (hei) => {
    const { data } = await axios.get(`${API}/admin/naac/institutions/${hei}`); setDetail(data);
  };
  const openExtraction = async (docId) => {
    const { data } = await axios.get(`${API}/admin/naac/documents/${docId}/extraction`); setExtractionDoc(data);
  };
  const saveSchedule = async (patch) => {
    const body = { enabled: patch.enabled ?? schedule?.enabled ?? false,
      interval_hours: patch.interval_hours ?? schedule?.interval_hours ?? 24,
      params: { mode: "manual", state: stateId, inst_type: instType, limit: Number(limit) } };
    const { data } = await axios.put(`${API}/admin/naac/schedule`, body); setSchedule(data);
  };

  const TABS = [
    ["overview", "Overview", Server],
    ["sync", "Sync", RefreshCw],
    ["institutions", "Institutions", Building2],
    ["documents", "Documents", FileText],
    ["schedule", "Schedule", CalendarClock],
    ["history", "Sync History", ListChecks],
  ];

  return (
    <div data-testid="admin-naac-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate2 hover:text-navy mb-5">
          <ArrowLeft className="w-3.5 h-3.5" /> Admin Panel
        </Link>
        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono flex items-center gap-2">
            <GraduationCap className="w-3.5 h-3.5 text-emerald2" /> NAAC Connector · Hybrid Web
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl tracking-tighter font-bold leading-[1.02]">
            NAAC.<br /><span className="text-slate2">Accreditation disclosures, acquired.</span>
          </h1>
        </div>

        <div className="flex flex-wrap gap-px bg-border border border-border w-fit mb-6">
          {TABS.map(([k, label, Icon]) => (
            <button key={k} data-testid={`tab-${k}`} onClick={() => setTab(k)}
              className={`px-4 py-2 text-xs font-mono uppercase tracking-wider flex items-center gap-2 ${tab === k ? "bg-navy text-white" : "bg-white text-slate2 hover:text-navy"}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {tab === "overview" && ov && (
          <div data-testid="naac-overview">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mb-3">
              <Stat k="Institutions Synced" v={ov.monitoring?.institutions_synced} sub={`${ov.institutions} total`} />
              <Stat k="Assessments Imported" v={ov.monitoring?.assessments_imported} sub={`${ov.assessments} total`} />
              <Stat k="PDFs Downloaded" v={ov.monitoring?.pdfs_downloaded} sub={`${ov.pdfs_downloaded} total`} />
              <Stat k="Extraction Success" v={ov.monitoring?.extraction_success} sub={`${ov.extraction_success} total`} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mb-6">
              <Stat k="Failed Downloads" v={ov.monitoring?.failed_downloads} danger={ov.monitoring?.failed_downloads > 0} />
              <Stat k="Failed Parsing" v={ov.monitoring?.failed_parsing} danger={ov.monitoring?.failed_parsing > 0} />
              <Stat k="Document Links" v={ov.document_links} />
              <Stat k="Raw HTML / PDF" v={`${ov.raw_html} / ${ov.raw_pdf}`} />
            </div>
            {ov.last_run && (
              <div className="border border-border bg-white p-4 flex items-center justify-between">
                <div className="text-xs font-mono text-slate2">Last sync: {fmt(ov.last_run.started_at || ov.last_run.created_at)} · {ov.last_run.records_processed ?? 0} institutions</div>
                <StatusPill status={ov.last_run.status} />
              </div>
            )}
            <div className="mt-6 border border-border bg-white p-5 text-sm text-slate2 leading-relaxed">
              <div className="font-heading font-bold text-navy mb-2">Pipeline</div>
              Discovery (filters) → Acquisition (institutions + raw HTML) → Detail (View Details modal) → PDF discovery (IIQA / SSR / Peer Team / Grade Sheet) → Download (versioned, checksummed) → Extraction (all sections) → Normalize. No scores or rankings computed.
            </div>
          </div>
        )}

        {tab === "sync" && (
          <div data-testid="naac-sync" className="border border-border bg-white p-6 max-w-3xl">
            {/* Mode selector with descriptions */}
            <div className="mb-5">
              <div className="text-[9px] uppercase tracking-wider text-slate2 font-mono mb-2">What do you want to sync?</div>
              <div className="grid sm:grid-cols-2 gap-2">
                {[
                  ["manual", "Filtered sync", "Discover institutions matching the filters below."],
                  ["state", "State sync", "All institutions in one state."],
                  ["cycle", "Cycle sync", "Institutions of a given assessment cycle."],
                  ["single", "Single institution", "One institution by its HEI ID."],
                ].map(([val, title, desc]) => (
                  <button key={val} type="button" onClick={() => setMode(val)}
                    className={`text-left border p-3 transition-colors ${mode === val ? "border-navy bg-navy/[0.03]" : "border-border hover:border-navy/40"}`}>
                    <div className="font-heading font-semibold text-sm text-navy">{title}</div>
                    <div className="text-[11px] text-slate2 mt-0.5">{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Filter source banner */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] font-mono text-slate2">
                {filterStatus === "loading" && "Loading filter options from the NAAC portal…"}
                {filterStatus === "ok" && <span className="text-emerald2">Filter options loaded from the live portal.</span>}
                {filterStatus === "manual" && <span className="text-amber2">Live options unavailable — enter IDs manually.</span>}
              </div>
              <button type="button" onClick={loadFilters} className="text-[11px] font-mono uppercase tracking-wider text-emerald2 hover:underline">
                Reload options
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {mode === "single" ? (
                <Field label="HEI Assessment ID">
                  <input value={heiId} onChange={(e) => setHeiId(e.target.value)} placeholder="e.g. 16164"
                    className="w-full border border-border px-3 py-2 text-sm font-mono" />
                </Field>
              ) : (
                <>
                  <FilterField label="Institution Type" value={instType} onChange={setInstType}
                    options={filterOpts?.inst_type} placeholder="All types" manualHint="1 = College · 2 = University" />
                  <FilterField label="State" value={stateId} onChange={setStateId}
                    options={filterOpts?.state} placeholder="All states" manualHint="e.g. 5 = Tamil Nadu" highlight={mode === "state"} />
                  <FilterField label="Cycle" value={cycle} onChange={setCycle}
                    options={filterOpts?.cycle} placeholder="All cycles" manualHint="0 = all cycles" highlight={mode === "cycle"} />
                  <FilterField label="IIQA Status" value={iiqaStatus} onChange={setIiqaStatus}
                    options={filterOpts?.iiqa_status} placeholder="Any status" manualHint="e.g. 5 = Accredited" />
                  <Field label="Institution Name (search)">
                    <input value={instName} onChange={(e) => setInstName(e.target.value)} placeholder="optional"
                      className="w-full border border-border px-3 py-2 text-sm" />
                  </Field>
                </>
              )}
              <Field label="Max institutions">
                <input type="number" value={limit} onChange={(e) => setLimit(e.target.value)}
                  className="w-full border border-border px-3 py-2 text-sm font-mono" />
              </Field>
            </div>

            <div className="flex items-center gap-5 mt-4 text-xs font-mono text-slate2">
              <label className="flex items-center gap-2"><input type="checkbox" checked={downloadPdfs} onChange={(e) => setDownloadPdfs(e.target.checked)} /> Download PDFs</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={extractPdfs} onChange={(e) => setExtractPdfs(e.target.checked)} /> Extract PDFs</label>
            </div>
            <button data-testid="naac-sync-btn" disabled={busy} onClick={sync}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-navy text-white text-xs font-mono uppercase tracking-wider hover:bg-emerald2 hover:text-navy transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Run Sync
            </button>
            {filterNote && <p className="mt-3 text-[11px] text-amber2 font-mono">{filterNote}</p>}
            <p className="mt-2 text-[11px] text-slate2 font-mono">Tip: leave filters blank for a broad discovery, or pick a state to scope the sync. First run? Set a small Max institutions value and turn PDFs off to test discovery quickly.</p>
          </div>
        )}

        {tab === "institutions" && (
          <div data-testid="naac-institutions">
            <div className="flex items-center gap-3 mb-4">
              <input data-testid="inst-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search institution…" className="border border-border bg-white px-3 py-2 text-sm w-72" />
              <span className="text-xs font-mono text-slate2">{instTotal} institutions</span>
            </div>
            <div className="border border-border bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-navy/[0.03] text-[10px] uppercase tracking-wider text-slate2 font-mono">
                  <th className="text-left px-3 py-3">Institution</th><th className="text-left px-3 py-3">AISHE</th>
                  <th className="text-left px-3 py-3">State</th><th className="text-left px-3 py-3">Grade</th><th className="text-right px-3 py-3"></th>
                </tr></thead>
                <tbody>
                  {institutions.map((i) => (
                    <tr key={i.hei_assessment_id} className="border-t border-border">
                      <td className="px-3 py-2.5"><div className="font-semibold text-navy">{i.hei_name}</div><div className="text-[10px] font-mono text-slate2">{i.institution_code || "—"}</div></td>
                      <td className="px-3 py-2.5 font-mono text-xs">{i.aishe_id || "—"}</td>
                      <td className="px-3 py-2.5 text-xs">{i.state || "—"}</td>
                      <td className="px-3 py-2.5 font-mono">{i.grade || "—"}</td>
                      <td className="px-3 py-2.5 text-right"><button onClick={() => openDetail(i.hei_assessment_id)} className="text-[11px] font-mono uppercase tracking-wider text-emerald2 hover:underline">Details</button></td>
                    </tr>
                  ))}
                  {!institutions.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-slate2">No institutions yet. Run a sync.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "documents" && (
          <div data-testid="naac-documents" className="border border-border bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-navy/[0.03] text-[10px] uppercase tracking-wider text-slate2 font-mono">
                <th className="text-left px-3 py-3">Institution</th><th className="text-left px-3 py-3">Type</th>
                <th className="text-right px-3 py-3">Ver</th><th className="text-left px-3 py-3">Downloaded</th>
                <th className="text-left px-3 py-3">Extraction</th><th className="text-right px-3 py-3"></th>
              </tr></thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="px-3 py-2.5">{d.institution_name || d.aishe_id || d.hei_assessment_id}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{d.doc_label || d.doc_type}</td>
                    <td className="px-3 py-2.5 text-right tabular">v{d.version}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px]">{fmt(d.download_date)}</td>
                    <td className="px-3 py-2.5"><StatusPill status={d.extraction_status} /></td>
                    <td className="px-3 py-2.5 text-right"><button onClick={() => openExtraction(d.id)} className="text-[11px] font-mono uppercase tracking-wider text-emerald2 hover:underline">View</button></td>
                  </tr>
                ))}
                {!documents.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate2">No documents yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "schedule" && schedule && (
          <div data-testid="naac-schedule" className="border border-border bg-white p-6 max-w-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="font-heading font-bold">Scheduled Sync</div>
              <StatusPill status={schedule.enabled ? "active" : "—"} />
            </div>
            <div className="flex items-center gap-4 mb-4">
              <Field label="Interval (hours)">
                <input type="number" defaultValue={schedule.interval_hours}
                  onChange={(e) => setSchedule({ ...schedule, interval_hours: Number(e.target.value) })}
                  className="w-32 border border-border px-3 py-2 text-sm font-mono" />
              </Field>
            </div>
            <div className="text-[11px] text-slate2 font-mono mb-4">Runs while the server is up; uses the current Sync-tab filters (state {stateId}, type {instType}, limit {limit}). Last run: {fmt(schedule.last_run_at)}</div>
            <div className="flex gap-3">
              <button onClick={() => saveSchedule({ enabled: true })} className="px-4 py-2 bg-navy text-white text-xs font-mono uppercase tracking-wider hover:bg-emerald2 hover:text-navy">Enable / Save</button>
              <button onClick={() => saveSchedule({ enabled: false })} className="px-4 py-2 border border-border text-xs font-mono uppercase tracking-wider text-slate2 hover:text-navy">Disable</button>
            </div>
          </div>
        )}

        {tab === "history" && (
          <div data-testid="naac-history">
            {runs.map((r) => (
              <button key={r.id} onClick={() => setLogRun(r)} className="w-full text-left border border-border bg-white p-3 mb-2 hover:border-navy flex items-center justify-between">
                <div><div className="text-xs font-mono">{fmt(r.started_at || r.created_at)}</div>
                  <div className="text-[10px] text-slate2 font-mono">{r.run_type} · {r.records_processed ?? 0} institutions{r.errors?.length ? ` · ${r.errors.length} errors` : ""}</div></div>
                <StatusPill status={r.status} />
              </button>
            ))}
            {!runs.length && <div className="text-sm text-slate2">No sync history yet.</div>}
          </div>
        )}
      </main>
      <Footer />

      {activeRun && <RunPanel run={activeRun} onClose={() => setActiveRun(null)} title="Live Sync" />}
      {logRun && <RunPanel run={logRun} onClose={() => setLogRun(null)} title="Run Details" />}

      {detail && (
        <div className="fixed inset-0 bg-navy/40 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white border border-border max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-white">
              <div className="font-heading font-bold">{detail.institution.hei_name} <span className="text-slate2 font-mono text-xs">{detail.institution.aishe_id}</span></div>
              <button onClick={() => setDetail(null)}><X className="w-5 h-5 text-slate2" /></button>
            </div>
            <div className="p-5 space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <KV k="State" v={detail.institution.state} /><KV k="Code" v={detail.institution.institution_code} />
                <KV k="IIQA Status" v={detail.institution.iiqa_status} /><KV k="SSR Status" v={detail.institution.ssr_status} />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate2 font-mono mb-2">Historical Assessments</div>
                <table className="w-full text-xs border border-border">
                  <thead><tr className="bg-navy/[0.03] font-mono text-slate2"><th className="px-2 py-1.5 text-left">Cycle</th><th className="px-2 py-1.5 text-left">Date</th><th className="px-2 py-1.5">Grade</th><th className="px-2 py-1.5">CGPA</th><th className="px-2 py-1.5 text-left">EC No</th></tr></thead>
                  <tbody>{detail.assessments.map((a, i) => (<tr key={i} className="border-t border-border"><td className="px-2 py-1.5">{a.cycle}</td><td className="px-2 py-1.5">{a.assessment_date}</td><td className="px-2 py-1.5 text-center font-mono">{a.grade}</td><td className="px-2 py-1.5 text-center tabular">{a.cgpa ?? "—"}</td><td className="px-2 py-1.5 font-mono">{a.ec_no}</td></tr>))}</tbody>
                </table>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate2 font-mono mb-2 flex items-center gap-1"><Link2 className="w-3 h-3" /> Document Links</div>
                {detail.document_links.map((l) => (<a key={l.id} href={l.url} target="_blank" rel="noreferrer" className="block text-emerald2 text-xs font-mono hover:underline py-0.5">{l.doc_label} ↗</a>))}
              </div>
              {detail.documents?.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate2 font-mono mb-2 flex items-center gap-1"><FileText className="w-3 h-3" /> Downloaded PDFs</div>
                  {detail.documents.map((d) => (<button key={d.id} onClick={() => openExtraction(d.id)} className="block text-navy text-xs font-mono hover:underline py-0.5">{d.doc_label} v{d.version} · {d.extraction_status} ↗</button>))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {extractionDoc && (
        <div className="fixed inset-0 bg-navy/40 z-[60] flex items-center justify-center p-4" onClick={() => setExtractionDoc(null)}>
          <div className="bg-white border border-border max-w-4xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-white">
              <div className="font-heading font-bold">{extractionDoc.doc_label} · {extractionDoc.institution_name}
                <span className="ml-2"><StatusPill status={extractionDoc.extraction_status} /></span></div>
              <button onClick={() => setExtractionDoc(null)}><X className="w-5 h-5 text-slate2" /></button>
            </div>
            <div className="p-5">
              <div className="text-[11px] font-mono text-slate2 mb-3">
                Source: <a href={extractionDoc.source_url} target="_blank" rel="noreferrer" className="text-emerald2 hover:underline">PDF ↗</a> ·
                {extractionDoc.extraction_meta ? ` ${extractionDoc.extraction_meta.page_count} pages · ${extractionDoc.extraction_meta.table_count} tables · ${extractionDoc.extraction_meta.char_count} chars` : ""}
                · checksum {String(extractionDoc.checksum || "").slice(0, 12)}…
              </div>
              {extractionDoc.extraction?.full_text ? (
                <pre className="text-[10px] font-mono text-slate2 whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto bg-navy/[0.02] p-3 border border-border">{extractionDoc.extraction.full_text}</pre>
              ) : (<div className="text-sm text-slate2">No extracted text available {extractionDoc.extraction_error ? `(${extractionDoc.extraction_error})` : ""}.</div>)}
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
  const s = run.stats || {};
  return (
    <div className="fixed bottom-0 right-0 m-4 w-full max-w-md bg-white border border-border shadow-2xl z-[70]" data-testid="naac-run-panel">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 font-heading font-bold text-sm">
          {ok ? <CheckCircle2 className="w-4 h-4 text-emerald2" /> : failed ? <AlertTriangle className="w-4 h-4 text-red-500" /> : <Clock className="w-4 h-4 text-steel animate-pulse" />}
          {title}
        </div>
        <button onClick={onClose}><X className="w-4 h-4 text-slate2" /></button>
      </div>
      <div className="px-4 py-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono text-slate2 border-b border-border">
        <span>Status: <b className="text-navy">{run.status}</b></span>
        {Object.keys(s).length > 0 && (<>
          <span>Inst: <b className="text-navy">{s.institutions}</b></span>
          <span>Assess: <b className="text-navy">{s.assessments}</b></span>
          <span>PDFs: <b className="text-navy">{s.pdfs_downloaded}</b></span>
          <span>Extracted: <b className="text-navy">{s.extraction_success}</b></span>
        </>)}
      </div>
      <div className="max-h-64 overflow-y-auto px-4 py-3 font-mono text-[10px] text-slate2 leading-relaxed bg-navy/[0.02]">
        {(run.logs || []).map((l, i) => <div key={i}>{l}</div>)}
        {!run.logs?.length && <div>Waiting for logs…</div>}
        {run.errors?.length > 0 && run.errors.slice(0, 30).map((e, i) => <div key={`e${i}`} className="text-red-500">ERROR: {e}</div>)}
      </div>
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

function Field({ label, children }) {
  return (<div><div className="text-[9px] uppercase tracking-wider text-slate2 font-mono mb-1">{label}</div>{children}</div>);
}

function FilterField({ label, value, onChange, options, placeholder, manualHint, highlight }) {
  // When the portal returned real dropdown options, render a labelled <select>;
  // otherwise fall back to a manual ID input with a helpful hint.
  if (options && options.length > 0) {
    return (
      <Field label={label}>
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className={`w-full border px-3 py-2 text-sm ${highlight ? "border-navy" : "border-border"}`}>
          <option value="">{placeholder || "All"}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
    );
  }
  return (
    <Field label={`${label} (ID)`}>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className={`w-full border px-3 py-2 text-sm font-mono ${highlight ? "border-navy" : "border-border"}`} />
      {manualHint && <div className="text-[10px] text-slate2 font-mono mt-1">{manualHint}</div>}
    </Field>
  );
}

function KV({ k, v }) {
  return (<div className="border border-border p-2"><span className="text-slate2">{k}: </span><b className="text-navy">{v || "—"}</b></div>);
}
