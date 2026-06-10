import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  Cpu, FileSearch, CheckCircle2, AlertTriangle, Gauge, Pencil, Check, X,
  RefreshCw, ArrowLeft, Sparkles, FileText, SlidersHorizontal,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const FIELD_LABELS = {
  college_name: "College Name", state: "State", city: "City",
  total_students: "Total Students", ug_students: "UG Students",
  pg_students: "PG Students", phd_students: "PhD Students",
  faculty_count: "Faculty Count",
  ug_graduated: "UG Graduated", ug_placed: "UG Placed",
  ug_higher_studies: "UG Higher Studies", ug_median_salary: "UG Median Salary",
  pg_graduated: "PG Graduated", pg_placed: "PG Placed",
  pg_higher_studies: "PG Higher Studies", pg_median_salary: "PG Median Salary",
  patents_filed: "Patents Filed", patents_granted: "Patents Granted",
  sponsored_projects: "Sponsored Projects", research_funding: "Research Funding (₹)",
};

// Poller lives outside React to avoid set-state-in-effect lint issues.
function pollExtractJob(jobId, onUpdate, onDone) {
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    axios.get(`${API}/admin/nirf/extract/jobs/${jobId}`).then(({ data }) => {
      if (stopped) return;
      onUpdate(data);
      if (data.status === "Completed" || data.status === "Failed") { onDone(); return; }
      setTimeout(tick, 1500);
    }).catch(() => { if (!stopped) setTimeout(tick, 2500); });
  };
  setTimeout(tick, 500);
  return () => { stopped = true; };
}

export default function AdminExtract() {
  const [year, setYear] = useState(2024);
  const [category, setCategory] = useState("Engineering");
  const [categories, setCategories] = useState([]);
  const [groups, setGroups] = useState({});
  const [list, setList] = useState([]);
  const [summary, setSummary] = useState({ total: 0, High: 0, Medium: 0, Low: 0, Reviewed: 0 });
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState(null);

  const fetchList = useCallback(async () => {
    const { data } = await axios.get(`${API}/admin/nirf/extractions?year=${year}&category=${category}`);
    setList(data.extractions || []);
    setSummary(data.summary || { total: 0, High: 0, Medium: 0, Low: 0, Reviewed: 0 });
  }, [year, category]);

  useEffect(() => {
    axios.get(`${API}/admin/nirf/categories`).then((r) => setCategories(r.data?.categories || []));
    axios.get(`${API}/admin/nirf/extract/schema`).then((r) => setGroups(r.data?.groups || {}));
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const runExtraction = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/admin/nirf/extract`, { year, category });
      setJob({ id: data.job_id, status: "Queued", logs: [] });
      toast.info("Extraction job started…");
      pollExtractJob(data.job_id, (j) => setJob(j), () => { fetchList(); toast.success("Extraction complete"); });
    } catch (e) {
      toast.error("Failed to start extraction");
    } finally {
      setBusy(false);
    }
  };

  const openRecord = async (id) => {
    try {
      const { data } = await axios.get(`${API}/admin/nirf/extractions/${id}`);
      setSelected(data);
    } catch (e) {
      toast.error("Failed to load extraction");
    }
  };

  const saveCorrection = async (field, value) => {
    try {
      const { data } = await axios.patch(`${API}/admin/nirf/extractions/${selected.id}/field`, { field, value });
      setSelected(data);
      fetchList();
      toast.success(`${FIELD_LABELS[field] || field} updated`);
    } catch (e) {
      toast.error("Failed to save correction");
    }
  };

  return (
    <div data-testid="admin-extract-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1500px] mx-auto px-6 sm:px-8 lg:px-12 py-12">
        {/* Header */}
        <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-emerald2" /> Admin · PDF Extraction Engine
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-bold leading-[1.02]">
              Extraction Review.<br />
              <span className="text-slate2">Parse, score, verify, correct.</span>
            </h1>
          </div>
          <Link to="/admin/nirf" data-testid="back-to-sync"
            className="inline-flex items-center gap-2 h-10 px-4 border border-border text-xs text-navy hover:border-navy font-mono">
            <ArrowLeft className="w-3.5 h-3.5" /> NIRF Sync
          </Link>
          <Link to="/admin/nirf/metrics" data-testid="to-metrics"
            className="inline-flex items-center gap-2 h-10 px-4 bg-navy text-white text-xs hover:opacity-90 font-mono">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Normalized Metrics →
          </Link>
        </div>

        {/* Controls */}
        <div className="border border-border bg-white p-5 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Year">
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="extract-year"
                className="h-10 px-3 border border-border bg-white text-sm">
                {[2024, 2023, 2022].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="extract-category"
                className="h-10 px-3 border border-border bg-white text-sm min-w-[160px]">
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <button
              onClick={runExtraction}
              disabled={busy || job?.status === "Running" || job?.status === "Queued"}
              data-testid="extract-run-btn"
              className="ml-auto inline-flex items-center gap-2 h-11 px-5 bg-navy text-white text-xs tracking-wide hover:opacity-90 disabled:opacity-40 font-semibold"
            >
              {busy || job?.status === "Running" || job?.status === "Queued"
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Extracting…</>
                : <><FileSearch className="w-3.5 h-3.5" /> Extract Downloaded PDFs</>}
            </button>
          </div>
          {job && (
            <div className="mt-4 border-t border-border pt-4 font-mono text-[11px] text-slate2 max-h-40 overflow-y-auto" data-testid="extract-job-log">
              <span className="text-navy font-semibold">Job {job.status}</span>
              {job.stats && <span className="ml-3">{job.stats.extracted}/{job.stats.total} extracted · {job.stats.failed} failed</span>}
              <div className="mt-1.5 space-y-0.5">
                {(job.logs || []).slice(-6).map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </div>
          )}
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border border border-border mb-6">
          <Kpi icon={FileText} k="Extracted" v={summary.total} accent="#0B1528" />
          <Kpi icon={CheckCircle2} k="High Conf." v={summary.High} accent="#059669" />
          <Kpi icon={Gauge} k="Medium Conf." v={summary.Medium} accent="#4682B4" />
          <Kpi icon={AlertTriangle} k="Low / Review" v={summary.Low} accent="#D97706" />
          <Kpi icon={Sparkles} k="Reviewed" v={summary.Reviewed} accent="#0B1528" />
        </div>

        {/* Two-pane: list + detail */}
        <div className="grid lg:grid-cols-[380px_1fr] gap-6">
          {/* Master list */}
          <div className="border border-border bg-white">
            <div className="bg-navy text-white px-4 py-3 text-[10px] uppercase tracking-[0.18em] font-mono font-semibold">
              Institutions · {list.length}
            </div>
            <div className="divide-y divide-border max-h-[640px] overflow-y-auto">
              {list.length === 0 && (
                <div className="p-8 text-center text-sm text-slate2">No extractions yet. Run extraction above.</div>
              )}
              {list.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openRecord(r.id)}
                  data-testid={`extract-row-${r.institute_id}`}
                  className={`w-full text-left px-4 py-3 hover:bg-offwhite transition-colors ${selected?.id === r.id ? "bg-offwhite border-l-2 border-navy" : "border-l-2 border-transparent"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-navy truncate">{r.college_name || r.institute_id}</span>
                    <BandPill band={r.confidence_band} />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="font-mono text-[10px] text-slate2">{r.institute_id}</span>
                    <span className="font-mono text-[10px] text-slate2 tabular">
                      {Math.round((r.overall_confidence || 0) * 100)}% · {Math.round((r.coverage || 0) * 100)}% fields
                    </span>
                  </div>
                  <ConfBar value={r.overall_confidence} />
                </button>
              ))}
            </div>
          </div>

          {/* Detail / review */}
          <div className="border border-border bg-white min-h-[400px]">
            {!selected ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 p-16 text-center text-sm text-slate2">
                <FileSearch className="w-8 h-8 text-slate2" strokeWidth={1.3} />
                Select an institution to review extracted fields, source pages and confidence — and apply manual corrections.
              </div>
            ) : (
              <ReviewPanel record={selected} groups={groups} onSave={saveCorrection} />
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function ReviewPanel({ record, groups, onSave }) {
  return (
    <div data-testid="review-panel">
      <div className="bg-navy text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{record.college_name || record.institute_id}</div>
          <div className="font-mono text-[10px] text-white/50 mt-0.5">
            {record.institute_id} · {record.category} {record.year} · {record.page_count}p · methods: {(record.methods_used || []).join(", ")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BandPill band={record.confidence_band} />
          <span className="font-mono text-[11px] text-white tabular">{Math.round((record.overall_confidence || 0) * 100)}%</span>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {Object.entries(groups).map(([group, keys]) => (
          <div key={group}>
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate2 font-mono font-semibold mb-2 border-b border-border pb-1.5">
              {group}
            </div>
            <div className="divide-y divide-border">
              {keys.map((k) => (
                <FieldRow key={k} fieldKey={k} field={record.fields?.[k] || {}} onSave={onSave} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const FIELD_LABELS_MAP = FIELD_LABELS;

function FieldRow({ fieldKey, field, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const label = FIELD_LABELS_MAP[fieldKey] || fieldKey;
  const conf = field.confidence || 0;
  const missing = field.value === null || field.value === undefined || field.value === "";

  const begin = () => { setDraft(missing ? "" : String(field.value)); setEditing(true); };
  const commit = () => {
    let v = draft.trim();
    if (v === "") { setEditing(false); return; }
    const numericField = !["college_name", "state", "city"].includes(fieldKey);
    const val = numericField && !Number.isNaN(Number(v)) ? Number(v) : v;
    onSave(fieldKey, val);
    setEditing(false);
  };

  return (
    <div className="py-2.5 grid grid-cols-[1fr_auto] items-center gap-3" data-testid={`field-${fieldKey}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-navy font-medium">{label}</span>
          {field.corrected && (
            <span className="text-[9px] uppercase tracking-wider font-mono text-emerald2 border border-emerald2/40 px-1.5 py-0.5">corrected</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="font-mono text-[10px] text-slate2">
            {field.source_page ? `page ${field.source_page}` : field.method === "ranking_metadata" ? "ranking meta" : "—"}
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-16"><ConfBar value={conf} /></div>
            <span className="font-mono text-[10px] text-slate2 tabular">{Math.round(conf * 100)}%</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 justify-end">
        {editing ? (
          <>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
              data-testid={`field-input-${fieldKey}`}
              className="h-8 w-32 px-2 border border-navy bg-white text-xs font-mono text-right"
            />
            <button onClick={commit} data-testid={`field-save-${fieldKey}`} className="h-8 w-8 inline-flex items-center justify-center bg-emerald2 text-navy">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setEditing(false)} className="h-8 w-8 inline-flex items-center justify-center border border-border text-slate2">
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <span className={`font-mono text-xs tabular ${missing ? "text-amber2" : "text-navy"} max-w-[180px] truncate`} title={missing ? "Not found — needs review" : String(field.value)}>
              {missing ? "— missing" : String(field.value)}
            </span>
            <button onClick={begin} data-testid={`field-edit-${fieldKey}`} className="h-8 w-8 inline-flex items-center justify-center border border-border text-slate2 hover:border-navy hover:text-navy">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ConfBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 85 ? "#059669" : pct >= 60 ? "#4682B4" : pct > 0 ? "#D97706" : "#CBD5E1";
  return (
    <div className="h-1.5 w-full bg-border overflow-hidden">
      <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function BandPill({ band }) {
  const m = {
    High: { c: "#059669", b: "rgba(5,150,105,0.10)" },
    Medium: { c: "#4682B4", b: "rgba(70,130,180,0.10)" },
    Low: { c: "#D97706", b: "rgba(217,119,6,0.10)" },
  }[band] || { c: "#64748B", b: "rgba(100,116,139,0.10)" };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider border"
      style={{ borderColor: m.c + "44", color: m.c, background: m.b }}>
      {band || "—"}
    </span>
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

function Kpi({ icon: Icon, k, v, accent }) {
  return (
    <div className="bg-white p-5">
      <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-slate2 font-semibold">
        {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={1.6} style={{ color: accent || "#64748B" }} />}
        {k}
      </div>
      <div className="font-heading font-bold text-3xl mt-1.5 tabular" style={{ color: accent || "#0B1528" }}>{v}</div>
    </div>
  );
}
