import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import { MessageCircle, X, Send, Loader2, UserPlus, CheckCircle2 } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const SID_KEY = "filed_assistant_session";

function getSessionId() {
  let sid = localStorage.getItem(SID_KEY);
  if (!sid) {
    sid = (crypto?.randomUUID && crypto.randomUUID()) || `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(SID_KEY, sid);
  }
  return sid;
}

const WELCOME = "Hi! I'm the Filed Assistant. Ask me about colleges, comparisons, or how Filed works — or tell me if you'd like admission help.";

export default function AssistantWidget() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", content: WELCOME }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showLead, setShowLead] = useState(false);
  const [leadSent, setLeadSent] = useState(false);
  const [lead, setLead] = useState({ name: "", email: "", phone: "", interest: "", location: "", message: "" });
  const [leadErr, setLeadErr] = useState("");
  const scrollRef = useRef(null);
  const sid = getSessionId();

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });
  }, []);
  useEffect(() => { scrollDown(); }, [messages, showLead, scrollDown]);

  // Hide on admin pages — the assistant is for public visitors only.
  if (location.pathname.startsWith("/admin")) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/assistant/chat`, { session_id: sid, message: text }, { timeout: 170000 });
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      if (data.suggest_lead && !leadSent) setShowLead(true);
    } catch (e) {
      const msg = e?.response?.status === 429
        ? "You're sending messages quickly — please wait a moment."
        : "Sorry, I couldn't reach the assistant. You can still share your details below and our team will help.";
      setMessages((m) => [...m, { role: "assistant", content: msg }]);
      setShowLead(true);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  const submitLead = async () => {
    setLeadErr("");
    if (!lead.name.trim()) { setLeadErr("Please enter your name."); return; }
    if (!lead.email.trim() && !lead.phone.trim()) { setLeadErr("Please add an email or phone."); return; }
    setBusy(true);
    try {
      await axios.post(`${API}/assistant/lead`, { session_id: sid, ...lead });
      setLeadSent(true);
      setShowLead(false);
      setMessages((m) => [...m, { role: "assistant", content: `Thanks ${lead.name.split(" ")[0]}! Our team will reach out to you shortly. Anything else I can help with?` }]);
    } catch (e) {
      setLeadErr(e?.response?.data?.detail || "Could not save your details. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col items-end" data-testid="assistant-widget">
      {open && (
        <div className="mb-3 w-[92vw] max-w-[380px] h-[560px] max-h-[78vh] bg-white border border-border shadow-2xl rounded-lg flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-navy text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-emerald2 flex items-center justify-center rounded-full">
                <MessageCircle className="w-4 h-4 text-navy" />
              </div>
              <div className="leading-tight">
                <div className="font-heading font-bold text-sm">Filed Assistant</div>
                <div className="text-[10px] text-white/60 font-mono">Ask anything · Admission help</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} data-testid="assistant-close" aria-label="Close"><X className="w-5 h-5 text-white/80 hover:text-white" /></button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3 bg-offwhite">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[82%] px-3 py-2 text-sm leading-relaxed rounded-lg ${m.role === "user" ? "bg-navy text-white" : "bg-white border border-border text-navy"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {busy && !showLead && (
              <div className="flex justify-start"><div className="bg-white border border-border text-slate2 px-3 py-2 rounded-lg"><Loader2 className="w-4 h-4 animate-spin" /></div></div>
            )}

            {/* Inline lead form */}
            {showLead && !leadSent && (
              <div className="bg-white border border-emerald2/40 rounded-lg p-3" data-testid="assistant-lead-form">
                <div className="flex items-center gap-2 text-navy font-heading font-bold text-sm mb-2"><UserPlus className="w-4 h-4 text-emerald2" /> Get admission help</div>
                <div className="space-y-2">
                  <input value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} placeholder="Your name *" className="w-full border border-border px-2.5 py-1.5 text-sm rounded" />
                  <input value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} placeholder="Email" className="w-full border border-border px-2.5 py-1.5 text-sm rounded" />
                  <input value={lead.phone} onChange={(e) => setLead({ ...lead, phone: e.target.value })} placeholder="Phone" className="w-full border border-border px-2.5 py-1.5 text-sm rounded" />
                  <input value={lead.interest} onChange={(e) => setLead({ ...lead, interest: e.target.value })} placeholder="Course / college of interest" className="w-full border border-border px-2.5 py-1.5 text-sm rounded" />
                  <textarea value={lead.message} onChange={(e) => setLead({ ...lead, message: e.target.value })} placeholder="Anything specific? (optional)" rows={2} className="w-full border border-border px-2.5 py-1.5 text-sm rounded resize-none" />
                  {leadErr && <div className="text-[12px] text-red-500">{leadErr}</div>}
                  <div className="flex gap-2">
                    <button onClick={submitLead} disabled={busy} data-testid="assistant-lead-submit" className="flex-1 bg-navy text-white text-xs font-mono uppercase tracking-wider py-2 rounded hover:bg-emerald2 hover:text-navy transition-colors disabled:opacity-50">
                      {busy ? "Sending…" : "Submit"}
                    </button>
                    <button onClick={() => setShowLead(false)} className="px-3 text-xs font-mono text-slate2 hover:text-navy">Later</button>
                  </div>
                </div>
              </div>
            )}
            {leadSent && (
              <div className="flex items-center gap-2 text-emerald2 text-xs font-mono"><CheckCircle2 className="w-4 h-4" /> Details shared with our team.</div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-border bg-white p-2 flex items-center gap-2">
            {!showLead && !leadSent && (
              <button onClick={() => setShowLead(true)} title="Get admission help" data-testid="assistant-leadbtn" className="shrink-0 w-9 h-9 flex items-center justify-center border border-border rounded hover:border-navy">
                <UserPlus className="w-4 h-4 text-slate2" />
              </button>
            )}
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} placeholder="Type your message…" data-testid="assistant-input" className="flex-1 border border-border px-3 py-2 text-sm rounded outline-none focus:border-navy" />
            <button onClick={send} disabled={busy || !input.trim()} data-testid="assistant-send" className="shrink-0 w-9 h-9 flex items-center justify-center bg-navy text-white rounded hover:bg-emerald2 hover:text-navy transition-colors disabled:opacity-50">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <button onClick={() => setOpen((o) => !o)} data-testid="assistant-toggle" aria-label="Open assistant"
        className="w-14 h-14 rounded-full bg-navy text-white shadow-2xl flex items-center justify-center hover:bg-emerald2 hover:text-navy transition-colors">
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>
    </div>
  );
}
