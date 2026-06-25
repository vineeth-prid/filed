import { Link, useLocation } from "react-router-dom";
import ModeToggle from "./ModeToggle";
import { useAuth } from "../lib/AuthContext";

export default function Navbar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const linkCls = (path) =>
    `text-sm tracking-tight transition-colors ${
      location.pathname === path ? "text-navy" : "text-slate2 hover:text-navy"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-offwhite/90 backdrop-blur-xl">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between h-16">
          <Link to="/" data-testid="logo-link" className="flex items-center gap-2.5 group">
            <div className="relative">
              <div className="w-7 h-7 bg-navy flex items-center justify-center">
                <span className="text-white font-heading font-bold text-sm leading-none">F</span>
              </div>
              <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-emerald2 rounded-full" />
            </div>
            <div className="leading-none">
              <div className="font-heading font-bold text-navy text-base tracking-tight">Filed</div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-slate2 font-medium mt-0.5">
                Education Intelligence
              </div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <Link to="/colleges" className={linkCls("/colleges")} data-testid="nav-colleges">Colleges</Link>
            <Link to="/match" className={linkCls("/match")} data-testid="nav-match">Match Me</Link>
            <Link to="/compare" className={linkCls("/compare")} data-testid="nav-compare">Compare</Link>
            <Link to="/shortlist" className={linkCls("/shortlist")} data-testid="nav-shortlist">Shortlist</Link>
            <Link to="/methodology" className={linkCls("/methodology")} data-testid="nav-methodology">How We Calculate</Link>
          </nav>

          <div className="flex items-center gap-3">
            {user && (
              <button onClick={logout} data-testid="nav-logout" className="hidden sm:inline text-xs font-mono text-slate2 hover:text-navy tracking-wide">Logout</button>
            )}
            <ModeToggle size="sm" />
            <Link
              to="/compare"
              data-testid="nav-cta"
              className="h-9 px-4 bg-navy text-white text-xs tracking-wide flex items-center hover:bg-navy-700 transition-colors"
            >
              Compare colleges
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
