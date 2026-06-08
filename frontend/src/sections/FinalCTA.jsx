// Section 10: FINAL CTA
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

export default function FinalCTA() {
  return (
    <section className="border-b border-border bg-navy text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-10 pointer-events-none" />
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-24 lg:py-32 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
          <div className="lg:col-span-7">
            <div className="text-[10px] uppercase tracking-[0.22em] text-emerald2 font-semibold mb-4 font-mono">
              <span>10</span> · Choose With Confidence
            </div>
            <h2 className="font-heading text-4xl sm:text-5xl lg:text-7xl tracking-tighter font-bold leading-[1.02]">
              Choose with<br />
              <span className="relative inline-block">
                confidence.
                <svg className="absolute -bottom-3 left-0 w-full" height="14" viewBox="0 0 200 14" fill="none">
                  <path d="M2 9 Q 60 1, 100 7 T 198 6" stroke="#059669" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </span>
            </h2>
            <p className="mt-8 max-w-xl text-base text-white/70 leading-relaxed">
              Explore colleges using structured, transparent and explainable data. Built for students, parents, counsellors and consultants who treat education like the investment it is.
            </p>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-3">
            <Link to="/colleges" data-testid="final-explore-btn" className="group flex items-center justify-between gap-4 h-16 px-6 bg-emerald2 hover:bg-emerald2/90 transition-colors text-navy">
              <span className="font-heading font-bold text-base">Explore Institutions</span>
              <ArrowUpRight className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </Link>
            <Link to="/compare" data-testid="final-compare-btn" className="group flex items-center justify-between gap-4 h-16 px-6 bg-white hover:bg-white/90 transition-colors text-navy">
              <span className="font-heading font-bold text-base">Compare Colleges</span>
              <ArrowUpRight className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </Link>
            <button data-testid="final-early-access-btn" className="group flex items-center justify-between gap-4 h-16 px-6 border border-white/30 hover:border-emerald2 transition-colors text-white">
              <span className="font-heading font-bold text-base">Join Early Access</span>
              <ArrowUpRight className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
