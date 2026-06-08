import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-navy text-white">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          <div className="md:col-span-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-white flex items-center justify-center">
                <span className="text-navy font-heading font-bold text-sm leading-none">F</span>
              </div>
              <div className="leading-none">
                <div className="font-heading font-bold text-base">Filed</div>
                <div className="text-[9px] uppercase tracking-[0.18em] text-white/50 mt-0.5">Education Intelligence</div>
              </div>
            </div>
            <p className="mt-6 text-sm text-white/60 max-w-xs leading-relaxed">
              An education due-diligence platform. We surface publicly disclosed institutional data — never opinions.
            </p>
          </div>

          <div className="md:col-span-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold mb-4">Product</div>
            <ul className="space-y-2.5 text-sm text-white/80">
              <li><Link to="/colleges" className="hover:text-white">Institutions</Link></li>
              <li><Link to="/compare" className="hover:text-white">Comparison</Link></li>
              <li><Link to="/methodology" className="hover:text-white">Methodology</Link></li>
            </ul>
          </div>

          <div className="md:col-span-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold mb-4">Data Sources</div>
            <ul className="space-y-2.5 text-sm text-white/80">
              <li>NIRF</li>
              <li>NAAC</li>
              <li>AICTE</li>
              <li>UGC</li>
            </ul>
          </div>

          <div className="md:col-span-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold mb-4">Disclaimer</div>
            <p className="text-xs text-white/50 leading-relaxed">
              Filed presents publicly disclosed metrics as filed with regulators and as published by institutions.
              Different metrics may measure different student populations and reporting methodologies. Always
              review the underlying source documents before making a decision.
            </p>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="text-[11px] text-white/40 font-mono">
            © 2026 FILED RESEARCH · ALL FIGURES SOURCED · LAST INDEX REFRESH 14 FEB 2026
          </div>
          <div className="flex items-center gap-2">
            <div className="dot bg-emerald2" />
            <span className="text-[11px] text-white/50 uppercase tracking-wider">Data Verified</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
