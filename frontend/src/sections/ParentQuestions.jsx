// NEW SECTION: Questions Parents Usually Ask
import { Briefcase, IndianRupee, Scale, GraduationCap, ArrowLeftRight } from "lucide-react";

const QUESTIONS = [
  { q: "Will my child get a job?", a: "See placement rates and which colleges deliver jobs.", icon: Briefcase, href: "#student-journey" },
  { q: "How much do graduates typically earn?", a: "Compare typical salaries across colleges.", icon: IndianRupee, href: "#market-landscape" },
  { q: "Is this college worth the fees?", a: "Look at value-for-money ratings for every college.", icon: Scale, href: "#snapshot" },
  { q: "Do students go abroad or study further?", a: "See what share of students continue their studies.", icon: GraduationCap, href: "#student-journey" },
  { q: "How does it compare with similar colleges?", a: "Put up to four colleges side by side.", icon: ArrowLeftRight, href: "#comparison-engine" },
];

const handleScroll = (e, href) => {
  e.preventDefault();
  const el = document.querySelector(href);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

export default function ParentQuestions() {
  return (
    <section className="border-b border-border bg-white">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-24 lg:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12 items-end">
          <div className="lg:col-span-7">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono">
              For Parents
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl tracking-tighter font-bold text-navy leading-[1.05]">
              Questions parents<br />usually ask.
            </h2>
          </div>
          <div className="lg:col-span-5 text-sm text-slate2 leading-relaxed">
            Click any question to jump to the data that answers it.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border">
          {QUESTIONS.map((item, i) => {
            const Icon = item.icon;
            return (
              <a
                key={item.q}
                href={item.href}
                onClick={(e) => handleScroll(e, item.href)}
                data-testid={`parent-q-${i}`}
                className="bg-white p-7 hover-lift group flex flex-col gap-5"
              >
                <Icon className="w-5 h-5 text-emerald2" strokeWidth={1.5} />
                <h3 className="font-heading font-bold text-navy text-lg leading-snug">{item.q}</h3>
                <p className="text-sm text-slate2 leading-relaxed">{item.a}</p>
                <div className="mt-auto pt-4 border-t border-border flex items-center justify-between text-[10px] uppercase tracking-wider text-slate2 font-mono group-hover:text-emerald2 transition-colors">
                  <span>Show me the data</span>
                  <span>→</span>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
