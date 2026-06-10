import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { Lock, ArrowRight, AlertCircle } from "lucide-react";

function errText(detail) {
  if (!detail) return "Login failed. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  return String(detail);
}

export default function AdminLogin() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      navigate(location.state?.from || "/admin", { replace: true });
    } catch (err) {
      setError(errText(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="admin-login-page" className="min-h-screen bg-navy text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2.5 mb-10 group w-fit">
          <div className="w-8 h-8 bg-white flex items-center justify-center">
            <span className="text-navy font-heading font-bold text-base leading-none">F</span>
          </div>
          <div className="leading-none">
            <div className="font-heading font-bold text-lg tracking-tight">Filed</div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-white/40 mt-0.5">Admin Console</div>
          </div>
        </Link>

        <div className="border border-white/10 bg-white/[0.03] backdrop-blur p-8">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-emerald2 font-mono font-semibold mb-3">
            <Lock className="w-3.5 h-3.5" /> Restricted Access
          </div>
          <h1 className="font-heading text-3xl font-bold tracking-tight mb-7">Sign in to the Admin Panel</h1>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/50 font-mono">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                data-testid="login-email" autoComplete="username"
                className="mt-1.5 w-full h-11 px-3 bg-white/5 border border-white/15 text-white text-sm focus:border-emerald2 outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/50 font-mono">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                data-testid="login-password" autoComplete="current-password"
                className="mt-1.5 w-full h-11 px-3 bg-white/5 border border-white/15 text-white text-sm focus:border-emerald2 outline-none" />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-[12px] text-red-300 bg-red-500/10 border border-red-500/30 px-3 py-2" data-testid="login-error">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
              </div>
            )}

            <button type="submit" disabled={busy} data-testid="login-submit"
              className="w-full h-11 bg-emerald2 text-navy font-semibold text-sm tracking-wide flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity">
              {busy ? "Signing in…" : <>Sign in <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        </div>

        <Link to="/" className="block mt-6 text-center text-[11px] font-mono text-white/40 hover:text-white/70">← Back to Filed</Link>
      </div>
    </div>
  );
}
