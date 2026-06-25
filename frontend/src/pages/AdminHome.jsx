import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  Database, FileSearch, SlidersHorizontal, Brain, RotateCw,
  ArrowRight, Layers, Activity, Plug, Server, GraduationCap,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MODULES = [
  {
    step: 1, to: "/admin/nirf", icon: Database, title: "NIRF Sync Control",
    desc: "Scrape rankings, generate PDF URLs, download official disclosure reports, track & retry downloads.",
    testid: "module-sync",
  },
  {
    step: 2, to: "/admin/nirf/review", icon: FileSearch, title: "Extraction Review",
    desc: "Parse downloaded PDFs into structured fields with per-field source page + confidence; apply manual corrections.",
    testid: "module-extract",
  },
  {
    step: 3, to: "/admin/nirf/metrics", icon: SlidersHorizontal, title: "Normalized Metrics",
    desc: "Comparable derived metrics (placement, outcome, faculty ratio, research) — fully traceable to source, immutable raw data.",
    testid: "module-metrics",
  },
  {
    step: 4, to: "/admin/nirf/intelligence", icon: Brain, title: "Intelligence Scores",
    desc: "Career Success, Value For Money, Academic Strength & Transparency scores — every score has a 'See How This Was Calculated' breakdown.",
    testid: "module-intelligence",
  },
  {
    step: 5, to: "/admin/nirf/refresh", icon: RotateCw, title: "Annual Refresh",
    desc: "One-click 7-stage 'Sync NIRF {year}', year-on-year change tracking (salary / placement / faculty) and trends. Historical years preserved.",
    testid: "module-refresh",
  },
];

export default function AdminHome() {
  const [ov, setOv] = useState(null);

  useEffect(() => {
    axios.get(`${API}/admin/nirf/overview?year=2024&category=Engineering`).then((r) => setOv(r.data)).catch(() => {});
  }, []);

  return (
    <div data-testid="admin-home-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-12">
        <div className="mb-9">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-emerald2" /> Admin Panel
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-bold leading-[1.02]">
            Data Operations.<br />
            <span className="text-slate2">The pipeline behind every factsheet.</span>
          </h1>
          <p className="mt-4 text-sm text-slate2 max-w-2xl">
            The full due-diligence pipeline — from raw NIRF disclosures to explainable scores. Work top-to-bottom: each stage feeds the next.
          </p>
        </div>

        {/* Pipeline status */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-px bg-border border border-border mb-8">
          <Stat k="Institutions" v={ov?.institutions} />
          <Stat k="Downloaded" v={ov?.downloaded} />
          <Stat k="Extracted" v={ov?.extractions} />
          <Stat k="Metrics" v={ov?.derived_metrics} />
          <Stat k="Scored" v={ov?.intelligence_scores} />
          <Stat k="Years" v={ov?.years_tracked?.length} sub={ov?.years_tracked?.join(" · ")} />
        </div>

        {ov?.last_refresh && (
          <div className="mb-8 flex items-center gap-2 text-[11px] font-mono text-slate2 border border-border bg-white px-4 py-2.5" data-testid="last-refresh">
            <Activity className="w-3.5 h-3.5 text-emerald2" />
            Last refresh: NIRF {ov.last_refresh.year} · {ov.last_refresh.status}
            {ov.last_refresh.data_origin === "simulated" && <span className="text-amber2"> · simulated (upstream unavailable)</span>}
          </div>
        )}

        {/* Data Sources Management Layer (multi-source platform) */}
        <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold font-mono">
          <Server className="w-3.5 h-3.5 text-emerald2" /> Data Sources Platform
        </div>
        <div className="grid md:grid-cols-2 gap-5 mb-10">
          <Link to="/admin/sources" data-testid="module-sources"
            className="group border border-border bg-white p-6 hover:border-navy transition-colors flex flex-col">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-navy flex items-center justify-center group-hover:bg-emerald2 transition-colors">
                  <Layers className="w-5 h-5 text-white group-hover:text-navy transition-colors" strokeWidth={1.6} />
                </div>
                <div>
                  <div className="font-mono text-[10px] text-slate2 uppercase tracking-wider">Platform</div>
                  <div className="font-heading font-bold text-lg text-navy tracking-tight">Data Sources</div>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate2 group-hover:text-navy group-hover:translate-x-1 transition-all" />
            </div>
            <p className="mt-4 text-sm text-slate2 leading-relaxed">
              Manage every connector (NIRF, AICTE, future NAAC / TNEA / AISHE) from one dashboard — sync, history, logs, version & error tracking, and cross-source monitoring.
            </p>
          </Link>

          <Link to="/admin/aicte" data-testid="module-aicte"
            className="group border border-border bg-white p-6 hover:border-navy transition-colors flex flex-col">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-navy flex items-center justify-center group-hover:bg-emerald2 transition-colors">
                  <Plug className="w-5 h-5 text-white group-hover:text-navy transition-colors" strokeWidth={1.6} />
                </div>
                <div>
                  <div className="font-mono text-[10px] text-slate2 uppercase tracking-wider">Connector · JSON API</div>
                  <div className="font-heading font-bold text-lg text-navy tracking-tight">AICTE</div>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate2 group-hover:text-navy group-hover:translate-x-1 transition-all" />
            </div>
            <p className="mt-4 text-sm text-slate2 leading-relaxed">
              Acquire approved-intake disclosures (NRI / PIO / FN / CIWG) from AICTE APIs — fetch JSON, store immutable raw payloads, normalize & validate into structured records.
            </p>
          </Link>

          <Link to="/admin/naac" data-testid="module-naac"
            className="group border border-border bg-white p-6 hover:border-navy transition-colors flex flex-col">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-navy flex items-center justify-center group-hover:bg-emerald2 transition-colors">
                  <GraduationCap className="w-5 h-5 text-white group-hover:text-navy transition-colors" strokeWidth={1.6} />
                </div>
                <div>
                  <div className="font-mono text-[10px] text-slate2 uppercase tracking-wider">Connector · Hybrid Web</div>
                  <div className="font-heading font-bold text-lg text-navy tracking-tight">NAAC</div>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate2 group-hover:text-navy group-hover:translate-x-1 transition-all" />
            </div>
            <p className="mt-4 text-sm text-slate2 leading-relaxed">
              Acquire accreditation data from the NAAC HEI portal — discover institutions, capture assessment history, register & download report PDFs (Peer Team, Grade Sheet) and extract all sections.
            </p>
          </Link>
        </div>

        {/* NIRF pipeline (existing) */}
        <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold font-mono">
          <Database className="w-3.5 h-3.5 text-emerald2" /> NIRF Pipeline
        </div>
        {/* Module cards */}
        <div className="grid md:grid-cols-2 gap-5">
          {MODULES.map((m) => (
            <Link key={m.to} to={m.to} data-testid={m.testid}
              className="group border border-border bg-white p-6 hover:border-navy transition-colors flex flex-col">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-navy flex items-center justify-center group-hover:bg-emerald2 transition-colors">
                    <m.icon className="w-5 h-5 text-white group-hover:text-navy transition-colors" strokeWidth={1.6} />
                  </div>
                  <div>
                    <div className="font-mono text-[10px] text-slate2 uppercase tracking-wider">Stage {m.step}</div>
                    <div className="font-heading font-bold text-lg text-navy tracking-tight">{m.title}</div>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-slate2 group-hover:text-navy group-hover:translate-x-1 transition-all" />
              </div>
              <p className="mt-4 text-sm text-slate2 leading-relaxed">{m.desc}</p>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
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
