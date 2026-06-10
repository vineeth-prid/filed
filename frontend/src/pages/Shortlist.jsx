import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { colleges, formatINR } from "../data/colleges";
import { useShortlist, PRIORITY_META, formatRelative } from "../lib/shortlistStore";
import TransparencyChip from "../components/TransparencyChip";
import { Plus, Trash2, FileText, Bookmark, X, ArrowUpRight, Edit3, ListPlus } from "lucide-react";

export default function Shortlist() {
  const sl = useShortlist();
  const { lists, items, views } = sl.state;

  const [activeListId, setActiveListId] = useState(lists[0]?.id || "dream");
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");

  const activeList = lists.find((l) => l.id === activeListId) || lists[0];
  const activeItems = useMemo(
    () =>
      items
        .filter((i) => i.listId === activeListId)
        .map((i) => ({ ...i, college: colleges.find((c) => c.id === i.collegeId) }))
        .filter((i) => i.college)
        .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt)),
    [items, activeListId]
  );

  const totals = useMemo(() => {
    const cs = activeItems.map((i) => i.college);
    if (!cs.length) return null;
    const avgSalary = Math.round(cs.reduce((s, c) => s + c.medianSalary, 0) / cs.length);
    const avgPlacement = Math.round(cs.reduce((s, c) => s + c.placementRate, 0) / cs.length);
    const avgCost = Math.round(cs.reduce((s, c) => s + c.cost, 0) / cs.length);
    const high = activeItems.filter((i) => i.priority === "high").length;
    return { count: cs.length, avgSalary, avgPlacement, avgCost, high };
  }, [activeItems]);

  const createList = () => {
    if (!newListName.trim()) return;
    sl.createList(newListName.trim());
    setNewListName("");
    setNewListOpen(false);
  };

  return (
    <div data-testid="shortlist-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-12">
        {/* Header */}
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono flex items-center gap-2">
              <Bookmark className="w-3.5 h-3.5 text-emerald2" /> My College Shortlist
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-bold leading-[1.02]">
              Your watchlist.<br />
              <span className="text-slate2">Organised, tagged, ready to decide.</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {totals && (
              <Link
                to="/shortlist/report"
                target="_blank"
                rel="noreferrer"
                data-testid="shortlist-export"
                className="inline-flex items-center gap-2 h-11 px-5 bg-navy text-white text-xs tracking-wide hover:bg-navy-700"
              >
                <FileText className="w-4 h-4" /> Generate Report
              </Link>
            )}
          </div>
        </div>

        {/* Watchlist KPI strip */}
        {totals && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border border border-border mb-8">
            <Kpi k="In this list" v={totals.count} sub={activeList?.name} />
            <Kpi k="Avg Placement" v={`${totals.avgPlacement}%`} accent="#059669" />
            <Kpi k="Avg Typical Salary" v={formatINR(totals.avgSalary)} />
            <Kpi k="Avg Total Cost" v={formatINR(totals.avgCost)} accent="#4682B4" />
            <Kpi k="High Priority" v={totals.high} accent="#D97706" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sidebar */}
          <aside className="lg:col-span-3 border border-border bg-white h-fit">
            <div className="border-b border-border px-4 py-3 bg-navy text-white flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.2em] font-mono font-semibold">My Lists</span>
              <button
                onClick={() => setNewListOpen((o) => !o)}
                data-testid="shortlist-new-list-btn"
                className="text-white/70 hover:text-emerald2"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {newListOpen && (
              <div className="border-b border-border p-3 bg-offwhite">
                <input
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") createList(); }}
                  placeholder="e.g. Backup Colleges"
                  data-testid="shortlist-new-list-input"
                  className="w-full h-9 px-3 text-xs border border-border bg-white outline-none focus:border-navy"
                  autoFocus
                />
                <button
                  onClick={createList}
                  data-testid="shortlist-create-list"
                  className="mt-2 w-full h-8 bg-navy text-white text-[11px] tracking-wide hover:bg-navy-700"
                >
                  Create list
                </button>
              </div>
            )}

            <nav className="py-1">
              {lists.map((l) => {
                const count = items.filter((i) => i.listId === l.id).length;
                const active = activeListId === l.id;
                const isDefault = ["dream", "safe", "budget", "private", "target"].includes(l.id);
                return (
                  <div key={l.id} className={`group flex items-center justify-between px-4 py-2.5 border-b border-border last:border-b-0 cursor-pointer ${active ? "bg-offwhite" : "hover:bg-offwhite/60"}`}
                    onClick={() => setActiveListId(l.id)}
                    data-testid={`shortlist-list-${l.id}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-1 h-5 ${active ? "bg-emerald2" : "bg-transparent"}`} />
                      <span className={`text-sm truncate ${active ? "text-navy font-semibold" : "text-slate2"}`}>{l.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-slate2 tabular">{count}</span>
                      {!isDefault && (
                        <button
                          onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete the list "${l.name}"?`)) sl.deleteList(l.id); if (activeListId === l.id) setActiveListId("dream"); }}
                          className="opacity-0 group-hover:opacity-100 text-slate2 hover:text-amber2"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </nav>

            <div className="border-t border-border p-3 text-[10px] text-slate2 leading-relaxed">
              Saved locally on this device. Clear browser data and your shortlist resets.
            </div>
          </aside>

          {/* Main */}
          <section className="lg:col-span-9">
            {activeItems.length === 0 ? (
              <EmptyList listName={activeList?.name} />
            ) : (
              <div className="space-y-4">
                {activeItems.map((item) => (
                  <Row
                    key={item.id}
                    item={item}
                    lastViewed={views[item.collegeId]}
                    onRemove={() => sl.removeItem(item.id)}
                    onUpdate={(patch) => sl.updateItem(item.id, patch)}
                    lists={lists}
                    onMoveToList={(listId) => sl.updateItem(item.id, { listId })}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Kpi({ k, v, sub, accent }) {
  return (
    <div className="bg-white p-5">
      <div className="text-[9px] uppercase tracking-[0.16em] text-slate2 font-semibold">{k}</div>
      <div className="font-heading font-bold text-2xl mt-1.5 tabular" style={{ color: accent || "#0B1528" }}>{v}</div>
      {sub && <div className="text-[10px] text-slate2 font-mono mt-1 truncate">{sub}</div>}
    </div>
  );
}

function EmptyList({ listName }) {
  return (
    <div className="border border-dashed border-border bg-white p-12 text-center">
      <ListPlus className="w-8 h-8 text-slate2 mx-auto mb-4" strokeWidth={1.4} />
      <h3 className="font-heading font-bold text-xl text-navy">No colleges in {listName || "this list"} yet.</h3>
      <p className="text-sm text-slate2 mt-2 max-w-md mx-auto leading-relaxed">
        Open any college{"\u2019"}s snapshot and use the {"\u201C"}Save to Shortlist{"\u201D"} button to add it here.
      </p>
      <Link to="/colleges" data-testid="empty-browse-link" className="inline-flex items-center gap-2 mt-6 h-11 px-5 bg-navy text-white text-xs tracking-wide hover:bg-navy-700">
        Browse colleges <ArrowUpRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

function Row({ item, lastViewed, onRemove, onUpdate, lists, onMoveToList }) {
  const c = item.college;
  const [editingNotes, setEditingNotes] = useState(false);
  const [draft, setDraft] = useState(item.notes);
  const [moveOpen, setMoveOpen] = useState(false);

  const setPriority = (p) => onUpdate({ priority: item.priority === p ? null : p });
  const saveNotes = () => { onUpdate({ notes: draft }); setEditingNotes(false); };
  const priority = item.priority ? PRIORITY_META[item.priority] : null;

  return (
    <article className="border border-border bg-white">
      <div className="grid grid-cols-12 gap-px bg-border">
        {/* College column */}
        <div className="col-span-12 md:col-span-4 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wider font-mono text-slate2">{c.city} · {c.type.split(" — ")[0]}</div>
              <h3 className="font-heading text-lg font-bold text-navy leading-tight mt-1">{c.short}</h3>
              <div className="text-[10px] text-slate2 mt-1">Added {formatRelative(item.addedAt)}</div>
            </div>
            <span className="text-[10px] font-mono font-bold bg-navy text-white px-2 py-0.5 flex-shrink-0">{c.roiRating}</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            {Object.entries(PRIORITY_META).map(([k, meta]) => {
              const active = item.priority === k;
              return (
                <button
                  key={k}
                  onClick={() => setPriority(k)}
                  data-testid={`priority-${k}-${item.id}`}
                  className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 border transition-colors"
                  style={{
                    borderColor: active ? meta.color : "#E2E8F0",
                    color: active ? meta.color : "#64748B",
                    background: active ? meta.bg : "transparent",
                  }}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Stats column */}
        <div className="col-span-12 md:col-span-5 bg-white p-5">
          <div className="grid grid-cols-2 gap-4">
            <Stat k="Placement" v={`${c.placementRate}%`} />
            <Stat k="Median Salary" v={formatINR(c.medianSalary)} />
            <Stat k="Fees" v={formatINR(c.cost)} />
            <Stat k="Last viewed" v={lastViewed ? formatRelative(lastViewed) : "Not yet"} />
          </div>
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <TransparencyChip value={c.transparency} />
            {priority && (
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5" style={{ color: priority.color, background: priority.bg }}>
                {priority.label} priority
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="col-span-12 md:col-span-3 bg-white p-5 flex flex-col gap-2">
          <Link to={`/college/${c.id}`} data-testid={`row-open-${item.id}`} className="inline-flex items-center justify-between gap-1 h-9 px-3 bg-navy text-white text-xs hover:bg-navy-700">
            Open snapshot <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <div className="relative">
            <button
              onClick={() => setMoveOpen((o) => !o)}
              data-testid={`row-move-${item.id}`}
              className="w-full inline-flex items-center justify-between gap-1 h-9 px-3 border border-border text-navy text-xs hover:border-navy"
            >
              Move to list <ListPlus className="w-3.5 h-3.5" />
            </button>
            {moveOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-navy shadow-xl z-20">
                {lists.filter((l) => l.id !== item.listId).map((l) => (
                  <button
                    key={l.id}
                    onClick={() => { onMoveToList(l.id); setMoveOpen(false); }}
                    data-testid={`row-move-target-${l.id}-${item.id}`}
                    className="w-full text-left px-3 py-2 text-xs text-navy hover:bg-offwhite border-b border-border last:border-b-0"
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onRemove}
            data-testid={`row-remove-${item.id}`}
            className="inline-flex items-center justify-between gap-1 h-9 px-3 text-slate2 text-xs hover:text-amber2"
          >
            Remove from list <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Notes row */}
        <div className="col-span-12 bg-white border-t border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[10px] uppercase tracking-wider font-mono text-slate2 mt-1 flex-shrink-0">Notes</div>
            {!editingNotes && (
              <button onClick={() => { setDraft(item.notes); setEditingNotes(true); }} data-testid={`notes-edit-${item.id}`} className="text-slate2 hover:text-navy">
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {editingNotes ? (
            <div className="mt-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                data-testid={`notes-input-${item.id}`}
                placeholder="e.g. Visited campus, ask about hostel, check scholarship..."
                className="w-full text-sm border border-navy bg-white outline-none p-3 leading-relaxed"
                autoFocus
              />
              <div className="mt-2 flex items-center gap-2">
                <button onClick={saveNotes} data-testid={`notes-save-${item.id}`} className="h-8 px-3 bg-navy text-white text-xs hover:bg-navy-700">Save</button>
                <button onClick={() => setEditingNotes(false)} className="h-8 px-3 text-slate2 text-xs hover:text-navy">Cancel</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-navy mt-2 leading-relaxed whitespace-pre-wrap">
              {item.notes ? item.notes : <span className="text-slate2 italic">No notes yet. Click the pencil to add one.</span>}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function Stat({ k, v }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider font-mono text-slate2">{k}</div>
      <div className="font-heading font-bold text-base text-navy mt-0.5 tabular">{v}</div>
    </div>
  );
}
