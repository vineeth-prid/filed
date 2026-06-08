import { Link, useLocation } from "react-router-dom";
import { Search } from "lucide-react";

export default function Navbar() {
  const location = useLocation();
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
            <Link to="/colleges" className={linkCls("/colleges")} data-testid="nav-colleges">Institutions</Link>
            <Link to="/compare" className={linkCls("/compare")} data-testid="nav-compare">Compare</Link>
            <Link to="/methodology" className={linkCls("/methodology")} data-testid="nav-methodology">Methodology</Link>
            <a href="#disclosure" className="text-sm tracking-tight text-slate2 hover:text-navy">Disclosure</a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              data-testid="nav-search-btn"
              className="hidden sm:flex items-center gap-2 px-3 h-9 border border-border bg-white text-xs text-slate2 hover:border-navy transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search institutions</span>
              <kbd className="ml-3 px-1.5 py-0.5 text-[10px] font-mono border border-border bg-offwhite text-slate2">⌘K</kbd>
            </button>
            <Link
              to="/compare"
              data-testid="nav-cta"
              className="h-9 px-4 bg-navy text-white text-xs tracking-wide flex items-center hover:bg-navy-700 transition-colors"
            >
              Open Intelligence
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
