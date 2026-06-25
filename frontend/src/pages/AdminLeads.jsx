import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Inbox, ArrowLeft, X, Mail, Phone, MapPin, Tag } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_STYLES = {
  new: "bg-steel/15 text-steel border-steel/30",
  contacted: "bg-amber2/15 text-amber2 border-amber2/30",
  qualified: "bg-emerald2/15 text-emerald2 border-emerald2/30",
  converted: "bg-emerald2/15 text-emerald2 border-emerald2/30",
  closed: "bg-slate-100 text-slate2 border-border",
};

function fmt(ts) { if (!ts) return "—"; try { return new Date(ts).toLocaleString(); } catch { return ts; } }

export default function AdminLeads() {
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null);
  const [notes, setNotes] = useState("");

  const fetchStats = useCallback(async () => {
    const { data } = await axios.get(`${API}/admin/leads/stats`); setStats(data);
  }, []);
  const fetchLeads = useCallback(async () => {
    const p = new URLSearchParams({ limit: "200" });
    if (statusFilter) p.set("status", statusFilter);
    if (q) p.set("q", q);
    const { data } = await axios.get(`${API}/admin/leads?${p}`);
    setLeads(data.leads || []); setTotal(data.total || 0);
  }, [statusFilter, q]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const openDetail = async (id) => {
    const { data } = await axios.get(`${API}/admin/leads/${id}`);
    setDetail(data); setNotes(data.lead?.notes || "");
  };

  const updateLead = async (id, patch) => {
    const { data } = await axios.patch(`${API}/admin/leads/${id}`, patch);
    setDetail((d) => (d ? { ...d, lead: data } : d));
    fetchLeads(); fetchStats();
  };

  const STATUSES = stats?.statuses || ["new", "contacted", "qualified", "converted", "closed"];

  return (
    <div data-testid="admin-leads-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate2 hover:text-navy mb-5">
          <ArrowLeft className="w-3.5 h-3.5" /> Admin Panel
        </Link>
        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono flex items-center gap-2">
            <Inbox className="w-3.5 h-3.5 text-emerald2" /> Leads
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl tracking-tighter font-bold leading-[1.02]">
            Admission Leads.<br /><span className="text-slate2">Captured by the assistant.</span>
          </h1>
        </div>

        {stats && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-px bg-border border border-border mb-6">
            <button onClick={() => setStatusFilter("")} className={`bg-white p-4 text-left ${statusFilter === "" ? "ring-2 ring-navy ring-inset" : ""}`}>
              <div className="text-[9px] uppercase tracking-[0.16em] text-slate2 font-semibold">All</div>
              <div className="font-heading font-bold text-2xl mt-1 tabular text-navy">{stats.total}</div>
            </button>
            {STATUSES.map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`bg-white p-4 text-left ${statusFilter === s ? "ring-2 ring-navy ring-inset" : ""}`}>
                <div className="text-[9px] uppercase tracking-[0.16em] text-slate2 font-semibold">{s}</div>
                <div className="font-heading font-bold text-2xl mt-1 tabular text-navy">{stats.by_status?.[s] ?? 0}</div>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 mb-4">
          <input data-testid="lead-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / email / phone / interest…" className="border border-border bg-white px-3 py-2 text-sm w-80" />
          <span className="text-xs font-mono text-slate2">{total} leads{statusFilter ? ` · ${statusFilter}` : ""}</span>
        </div>

        <div className="border border-border bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-navy/[0.03] text-[10px] uppercase tracking-wider text-slate2 font-mono">
              <th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Contact</th>
              <th className="text-left px-4 py-3">Interest</th><th className="text-left px-4 py-3">Received</th>
              <th className="text-left px-4 py-3">Status</th><th className="text-right px-4 py-3"></th>
            </tr></thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} data-testid="lead-row" className="border-t border-border">
                  <td className="px-4 py-2.5 font-semibold text-navy">{l.name}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-slate2">{l.email || "—"}<br />{l.phone || ""}</td>
                  <td className="px-4 py-2.5 text-xs">{l.interest || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate2">{fmt(l.created_at)}</td>
                  <td className="px-4 py-2.5"><span className={`inline-flex px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border ${STATUS_STYLES[l.status] || "bg-slate-100 text-slate2 border-border"}`}>{l.status}</span></td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => openDetail(l.id)} className="text-[11px] font-mono uppercase tracking-wider text-emerald2 hover:underline">Open</button></td>
                </tr>
              ))}
              {!leads.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate2">No leads yet. They will appear here when visitors request admission help via the assistant.</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
      <Footer />

      {detail && (
        <div className="fixed inset-0 bg-navy/40 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white border border-border max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-white">
              <div className="font-heading font-bold text-lg">{detail.lead.name}</div>
              <button onClick={() => setDetail(null)}><X className="w-5 h-5 text-slate2" /></button>
            </div>
            <div className="p-5 space-y-5">
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <Info icon={Mail} label="Email" value={detail.lead.email} />
                <Info icon={Phone} label="Phone" value={detail.lead.phone} />
                <Info icon={Tag} label="Interest" value={detail.lead.interest} />
                <Info icon={MapPin} label="Location" value={detail.lead.location} />
              </div>
              {detail.lead.message && <div className="text-sm border border-border p-3 bg-offwhite"><div className="text-[10px] uppercase tracking-wider text-slate2 font-mono mb-1">Message</div>{detail.lead.message}</div>}

              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate2 font-mono mb-2">Status</div>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <button key={s} onClick={() => updateLead(detail.lead.id, { status: s })}
                      className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border ${detail.lead.status === s ? "bg-navy text-white border-navy" : "border-border text-slate2 hover:border-navy"}`}>{s}</button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate2 font-mono mb-2">Notes</div>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full border border-border px-3 py-2 text-sm resize-none" placeholder="Internal notes…" />
                <button onClick={() => updateLead(detail.lead.id, { notes })} className="mt-2 px-4 py-2 bg-navy text-white text-xs font-mono uppercase tracking-wider hover:bg-emerald2 hover:text-navy">Save notes</button>
              </div>

              {detail.conversation?.messages?.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate2 font-mono mb-2">Conversation</div>
                  <div className="border border-border max-h-60 overflow-y-auto p-3 space-y-2 bg-offwhite">
                    {detail.conversation.messages.map((m, i) => (
                      <div key={i} className={`text-xs ${m.role === "user" ? "text-navy" : "text-slate2"}`}>
                        <b className="font-mono">{m.role === "user" ? "Visitor" : "Assistant"}:</b> {m.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="border border-border p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate2 font-mono mb-1 flex items-center gap-1"><Icon className="w-3 h-3" /> {label}</div>
      <div className="text-navy">{value || "—"}</div>
    </div>
  );
}
