import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  Brain, RefreshCw, ArrowLeft, ChevronRight, Calculator, X,
  Briefcase, Wallet, GraduationCap, ShieldCheck, Check, Pencil,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SCORE_META = {
  career_success: { label: "Career Success", icon: Briefcase },
  value_for_money: { label: "Value For Money", icon: Wallet },
  academic_strength: { label: "Academic Strength", icon: GraduationCap },
  transparency: { label: "Transparency", icon: ShieldCheck },
};
const SCORE_ORDER = ["career_success", "value_for_money", "academic_strength", "transparency"];

function gradeColor(grade) {
  if (["AAA", "AA"].includes(grade)) return "#059669";
  if (grade === "A") return "#4682B4";
  if (["BBB", "BB"].includes(grade)) return "#D97706";
  return "#DC2626";
}
function fmtRaw(c) {
  if (c.raw_value === null || c.raw_value === undefined) return "—";
  if (c.unit === "₹/yr" || c.unit === "₹/faculty") return `₹${Math.round(c.raw_value).toLocaleString("en-IN")}`;
  if (c.unit === "ratio") return `${(c.raw_value * 100).toFixed(1)}%`;
  if (c.unit === "%") return `${c.raw_value}%`;
  if (c.unit === "students:faculty") return `${Number(c.raw_value).toFixed(1)} : 1`;
  return String(c.raw_value);
}

function pollJob(jobId, onUpdate, onDone) {
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    axios.get(`${API}/admin/nirf/intelligence/jobs/${jobId}`).then(({ data }) => {
      if (stopped) return;
      onUpdate(data);
      if (data.status === "Completed" || data.status === "Failed") { onDone(); return; }
      setTimeout(tick, 1400);
    }).catch(() => { if (!stopped) setTimeout(tick, 2500); });
  };
  setTimeout(tick, 500);
  return () => { stopped = true; };
}

export default function AdminIntelligence() {
  const [year, setYear] = useState(2024);
  const [category, setCategory] = useState("Engineering");
  const [categories, setCategories] = useState([]);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState(null);

  const fetchRows = useCallback(async () => {
    const { data } = await axios.get(`${API}/admin/nirf/intelligence?year=${year}&category=${category}`);
    setRows(data.intelligence || []);
  }, [year, category]);

  useEffect(() => {
    axios.get(`${API}/admin/nirf/categories`).then((r) => setCategories(r.data?.categories || []));
  }, []);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  const runCompute = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/admin/nirf/intelligence`, { year, category });
      setJob({ id: data.job_id, status: "Queued" });
      toast.info("Scoring institutions…");
      pollJob(data.job_id, (j) => setJob(j), () => { fetchRows(); toast.success("Intelligence scores computed"); });
    } catch (e) {
      toast.error("Failed to start scoring");
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (documentId) => {
    try {
      const { data } = await axios.get(`${API}/admin/nirf/intelligence/${documentId}`);
      setSelected(data);
    } catch (e) {
      toast.error("Failed to load scores");
    }
  };

  const saveFees = async (documentId, fees) => {
    try {
      const { data } = await axios.put(`${API}/admin/nirf/fees/${documentId}`, { fees, source: "Admin-set fee" });
      setSelected(data);
      fetchRows();
      toast.success("Fees updated · scores recomputed");
    } catch (e) {
      toast.error("Failed to update fees");
    }
  };

  return (
    <div data-testid="admin-intelligence-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1500px] mx-auto px-6 sm:px-8 lg:px-12 py-12">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono flex items-center gap-2">
              <Brain className="w-3.5 h-3.5 text-emerald2" /> Admin · College Intelligence Engine
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-bold leading-[1.02]">
              Intelligence Scores.<br />
              <span className="text-slate2">Composite, comparative, explainable.</span>
            </h1>
          </div>
          <Link to="/admin/nirf/metrics" data-testid="intel-to-metrics"
            className="inline-flex items-center gap-2 h-10 px-4 border border-border text-xs text-navy hover:border-navy font-mono">
            <ArrowLeft className="w-3.5 h-3.5" /> Normalized Metrics
          </Link>
        </div>

        {/* Controls */}
        <div className="border border-border bg-white p-5 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Year">
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} data-testid="intel-year"
                className="h-10 px-3 border border-border bg-white text-sm">
                {[2024, 2023, 2022].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="intel-category"
                className="h-10 px-3 border border-border bg-white text-sm min-w-[160px]">
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <button onClick={runCompute}
              disabled={busy || job?.status === "Running" || job?.status === "Queued"}
              data-testid="intel-compute-btn"
              className="ml-auto inline-flex items-center gap-2 h-11 px-5 bg-navy text-white text-xs tracking-wide hover:opacity-90 disabled:opacity-40 font-semibold">
              {busy || job?.status === "Running" || job?.status === "Queued"
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Scoring…</>
                : <><Brain className="w-3.5 h-3.5" /> Compute Intelligence Scores</>}
            </button>
          </div>
          {job && (
            <div className="mt-4 border-t border-border pt-4 font-mono text-[11px] text-slate2">
              <span className="text-navy font-semibold">Job {job.status}</span>
              {job.stats && <span className="ml-3">{job.stats.scored}/{job.stats.total} institutions scored</span>}
            </div>
          )}
        </div>

        {/* Scores table */}
        <div className="border border-border bg-white overflow-x-auto mb-6">
          <table className="w-full min-w-[960px]" data-testid="intel-table">
            <thead>
              <tr className="bg-navy text-white">
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-[0.16em] font-mono font-semibold">Institution</th>
                {SCORE_ORDER.map((k) => (
                  <th key={k} className="text-center px-3 py-3 text-[10px] uppercase tracking-[0.14em] font-mono font-semibold">{SCORE_META[k].label}</th>
                ))}
                <th className="text-center px-4 py-3 text-[10px] uppercase tracking-[0.16em] font-mono font-semibold">Overall</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate2">No scores yet. Click "Compute Intelligence Scores".</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.document_id} className="border-t border-border hover:bg-offwhite cursor-pointer"
                  onClick={() => openDetail(r.document_id)} data-testid={`intel-row-${r.institute_id}`}>
                  <td className="px-4 py-3">
                    <div className="text-xs font-semibold text-navy">{r.college_name || r.institute_id}</div>
                    <div className="font-mono text-[10px] text-slate2">{r.institute_id}</div>
                  </td>
                  {SCORE_ORDER.map((k) => <td key={k} className="px-3 py-3 text-center"><ScoreChip s={r.scores?.[k]} /></td>)}
                  <td className="px-4 py-3 text-center">
                    <span className="font-heading font-bold text-lg tabular" style={{ color: gradeColor(r.overall_grade) }}>{r.overall_index ?? "—"}</span>
                    <span className="ml-1.5 text-[10px] font-mono" style={{ color: gradeColor(r.overall_grade) }}>{r.overall_grade}</span>
                  </td>
                  <td className="px-3 py-3 text-right"><ChevronRight className="w-4 h-4 text-slate2 inline" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && <IntelDetail record={selected} onClose={() => setSelected(null)} onSaveFees={saveFees} />}
      </main>
      <Footer />
    </div>
  );
}

function ScoreChip({ s }) {
  if (!s || s.value === null) return <span className="text-slate2 text-xs">—</span>;
  const c = gradeColor(s.grade);
  return (
    <span className="inline-flex items-center gap-1.5 font-mono tabular">
      <span className="font-heading font-bold text-sm" style={{ color: c }}>{s.value}</span>
      <span className="text-[9px] px-1 py-0.5 border" style={{ borderColor: c + "55", color: c }}>{s.grade}</span>
    </span>
  );
}

function IntelDetail({ record, onClose, onSaveFees }) {
  return (
    <div className="border border-navy bg-white" data-testid="intel-detail">
      <div className="bg-navy text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{record.college_name || record.institute_id}</div>
          <div className="font-mono text-[10px] text-white/50 mt-0.5">
            {record.institute_id} · scored vs cohort of {record.cohort_size} · overall {record.overall_index} ({record.overall_grade})
          </div>
        </div>
        <button onClick={onClose} className="text-[10px] font-mono text-white/50 hover:text-white">close</button>
      </div>

      <div className="p-5">
        <FeesEditor documentId={record.document_id} fees={record.fees} source={record.fees_source} onSave={onSaveFees} />
        <div className="grid md:grid-cols-2 gap-5 mt-5">
          {SCORE_ORDER.map((k) => (
            <ScoreCard key={k} sk={k} score={record.scores[k]} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FeesEditor({ documentId, fees, source, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(fees ?? ""));
  return (
    <div className="flex items-center gap-3 border border-border bg-offwhite px-4 py-2.5" data-testid="fees-editor">
      <Wallet className="w-3.5 h-3.5 text-slate2" />
      <span className="text-[10px] uppercase tracking-wider font-mono text-slate2">Annual Fees (₹)</span>
      {editing ? (
        <>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} data-testid="fees-input"
            className="h-8 w-32 px-2 border border-navy bg-white text-xs font-mono text-right" />
          <button onClick={() => { onSave(documentId, Number(draft)); setEditing(false); }} data-testid="fees-save"
            className="h-8 w-8 inline-flex items-center justify-center bg-emerald2 text-navy"><Check className="w-3.5 h-3.5" /></button>
          <button onClick={() => setEditing(false)} className="h-8 w-8 inline-flex items-center justify-center border border-border text-slate2"><X className="w-3.5 h-3.5" /></button>
        </>
      ) : (
        <>
          <span className="font-mono text-sm text-navy tabular">₹{Number(fees || 0).toLocaleString("en-IN")}</span>
          <span className="font-mono text-[10px] text-slate2">· {source}</span>
          <button onClick={() => { setDraft(String(fees ?? "")); setEditing(true); }} data-testid="fees-edit"
            className="ml-auto h-8 w-8 inline-flex items-center justify-center border border-border text-slate2 hover:border-navy hover:text-navy"><Pencil className="w-3.5 h-3.5" /></button>
        </>
      )}
    </div>
  );
}

function ScoreCard({ sk, score }) {
  const [open, setOpen] = useState(false);
  const Icon = SCORE_META[sk].icon;
  const c = gradeColor(score.grade);
  return (
    <div className="border border-border" data-testid={`score-card-${sk}`}>
      <div className="p-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-slate2 font-mono font-semibold">
            <Icon className="w-3.5 h-3.5" style={{ color: c }} /> {score.label}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading font-bold text-4xl tabular" style={{ color: c }}>{score.value ?? "—"}</span>
            <span className="text-xs font-mono px-1.5 py-0.5 border" style={{ borderColor: c + "55", color: c }}>{score.grade}</span>
          </div>
          <div className="font-mono text-[10px] text-slate2 mt-1">confidence {Math.round((score.confidence || 0) * 100)}%</div>
        </div>
        <div className="w-1.5 h-16 bg-border overflow-hidden self-center">
          <div className="w-full" style={{ height: `${score.value || 0}%`, background: c, marginTop: `${100 - (score.value || 0)}%` }} />
        </div>
      </div>
      <button onClick={() => setOpen((o) => !o)} data-testid={`how-calculated-${sk}`}
        className="w-full border-t border-border px-4 py-2.5 flex items-center justify-between text-xs text-navy hover:bg-offwhite font-medium">
        <span className="inline-flex items-center gap-2"><Calculator className="w-3.5 h-3.5 text-emerald2" /> See How This Was Calculated</span>
        <ChevronRight className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-border bg-offwhite p-4" data-testid={`calc-breakdown-${sk}`}>
          <div className="font-mono text-[10px] text-slate2 mb-3">{score.method} · weight basis {score.weight_basis}</div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-slate2 font-mono uppercase tracking-wider text-[9px]">
                <th className="text-left py-1">Component</th>
                <th className="text-right py-1">Raw</th>
                <th className="text-right py-1">Norm</th>
                <th className="text-right py-1">Weight</th>
                <th className="text-right py-1">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {score.components.map((cmp, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1.5">
                    <div className="text-navy font-medium">{cmp.label}</div>
                    <div className="font-mono text-[9px] text-slate2">{cmp.direction} · {cmp.source}</div>
                    {cmp.note && <div className="font-mono text-[9px] text-amber2 mt-0.5">{cmp.note}</div>}
                  </td>
                  <td className="text-right font-mono tabular text-navy">{fmtRaw(cmp)}</td>
                  <td className="text-right font-mono tabular text-navy">{cmp.normalized_score ?? "—"}</td>
                  <td className="text-right font-mono tabular text-slate2">{cmp.weight}</td>
                  <td className="text-right font-mono tabular text-navy">{cmp.contribution}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-navy">
                <td className="py-1.5 font-mono text-[10px] uppercase tracking-wider text-navy font-semibold" colSpan={4}>Composite (weighted avg)</td>
                <td className="text-right font-heading font-bold text-navy tabular">{score.value ?? "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
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
