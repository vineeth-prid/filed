import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { colleges, formatINR } from "../data/colleges";
import TransparencyChip from "../components/TransparencyChip";
import { ArrowUpRight, ArrowLeft, Check, Sparkles, RotateCcw, GraduationCap, IndianRupee, Target, MapPin } from "lucide-react";

const COURSES = [
  "Computer Science", "AI & Data Science", "IT", "ECE", "EEE", "Mechanical", "Civil", "Biotechnology", "BCA", "BBA",
];

const BUDGETS = [
  { id: "u5", label: "Under \u20B95 Lakhs", min: 0, max: 500000 },
  { id: "5-10", label: "\u20B95\u201310 Lakhs", min: 500000, max: 1000000 },
  { id: "10-15", label: "\u20B910\u201315 Lakhs", min: 1000000, max: 1500000 },
  { id: "15-20", label: "\u20B915\u201320 Lakhs", min: 1500000, max: 2000000 },
  { id: "20p", label: "\u20B920 Lakhs+", min: 2000000, max: Infinity },
];

const GOALS = [
  { id: "job", label: "Get a Job Quickly", note: "Weighs placement rates and typical salary." },
  { id: "higher", label: "Higher Studies", note: "Weighs how many students continue to PG, plus research." },
  { id: "brand", label: "Brand Reputation", note: "Weighs career success score and accreditation strength." },
  { id: "research", label: "Research", note: "Weighs research output and innovation indicators." },
  { id: "lowcost", label: "Lowest Cost", note: "Weighs how little the full program costs your family." },
  { id: "campus", label: "Campus Experience", note: "Weighs student diversity and the size of the community." },
];

const LOCATIONS = ["Chennai", "Coimbatore", "Trichy", "Madurai", "Anywhere"];
const LOC_MATCH = {
  "Chennai": (c) => c.city === "Chennai",
  "Coimbatore": (c) => c.city === "Coimbatore",
  "Trichy": (c) => c.city === "Tiruchirappalli" || c.city === "Trichy",
  "Madurai": (c) => c.city === "Madurai",
  "Anywhere": () => true,
};

function scoreCollege(c, goal) {
  const norm = (v, max) => Math.min(1, v / max);
  switch (goal) {
    case "job":
      return norm(c.placementRate, 100) * 0.6 + norm(c.medianSalary, 3500000) * 0.4;
    case "higher":
      return norm(c.higherStudies, 60) * 0.65 + norm(c.research, 100) * 0.35;
    case "brand":
      return norm(c.outcomeScore, 100) * 0.55 + norm(c.transparency, 100) * 0.45;
    case "research":
      return norm(c.research, 100) * 0.75 + norm(c.higherStudies, 60) * 0.25;
    case "lowcost":
      return 1 - norm(c.cost, 3000000);
    case "campus":
      return norm(c.diversity, 100) * 0.6 + norm(c.students, 50000) * 0.4;
    default:
      return norm(c.outcomeScore, 100);
  }
}

const GOAL_LABEL = {
  job: "placements", higher: "further studies", brand: "brand reputation",
  research: "research strength", lowcost: "lowest cost", campus: "campus experience",
};

function explain(college, picks, bucket) {
  const goalText = GOAL_LABEL[picks.goal] || "career outcomes";
  const budgetText = BUDGETS.find((b) => b.id === picks.budget)?.label || "your budget";
  if (bucket === "premium") {
    return `A premium pick if your family is open to spending around ${formatINR(college.cost)} for the full program.`;
  }
  if (bucket === "budget") {
    return `Costs only ${formatINR(college.cost)} for the full program \u2014 a friendly option for tighter budgets.`;
  }
  return `Matched because your priority is ${goalText} and your budget is ${budgetText.toLowerCase()}.`;
}

export default function Match() {
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState({ course: null, budget: null, goal: null, location: null });
  const [showResults, setShowResults] = useState(false);

  const set = (key, value) => setPicks((p) => ({ ...p, [key]: value }));

  const totalSteps = 4;
  const progress = ((step + (showResults ? 1 : 0)) / totalSteps) * 100;

  const next = () => {
    if (step < totalSteps - 1) setStep(step + 1);
    else setShowResults(true);
  };
  const back = () => {
    if (showResults) { setShowResults(false); return; }
    if (step > 0) setStep(step - 1);
  };
  const reset = () => {
    setPicks({ course: null, budget: null, goal: null, location: null });
    setStep(0);
    setShowResults(false);
  };

  const buckets = useMemo(() => {
    if (!showResults) return null;
    const courseMatch = picks.course
      ? colleges.filter((c) => c.courses?.includes(picks.course))
      : colleges;
    const locMatch = courseMatch.filter(LOC_MATCH[picks.location] || (() => true));
    const universe = locMatch.length >= 3 ? locMatch : courseMatch; // fallback to nationwide
    const budget = BUDGETS.find((b) => b.id === picks.budget) || BUDGETS[BUDGETS.length - 1];

    const scored = universe.map((c) => ({ ...c, _score: scoreCollege(c, picks.goal) }));
    const inBudget = scored.filter((c) => c.cost <= budget.max);
    const outOfBudget = scored.filter((c) => c.cost > budget.max);

    const sortedInBudget = [...inBudget].sort((a, b) => b._score - a._score);
    const best = sortedInBudget.slice(0, 3);
    const alts = sortedInBudget.slice(3, 6);

    const budgetFriendly = [...scored].sort((a, b) => a.cost - b.cost).slice(0, 3);
    const premium = [...outOfBudget].sort((a, b) => b._score - a._score).slice(0, 3);

    return { best, alts, budgetFriendly, premium, locationFellBack: locMatch.length < 3 && picks.location !== "Anywhere" };
  }, [picks, showResults]);

  return (
    <div data-testid="match-page" className="min-h-screen bg-offwhite text-navy">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 py-12">
        {/* Header */}
        <div className="mb-10 flex items-start justify-between flex-wrap gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate2 font-semibold mb-3 font-mono">
              <Sparkles className="w-3 h-3 inline-block mr-2 text-emerald2" /> Find Colleges That Match You
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-bold leading-[1.02]">
              Tell us four things.<br />
              <span className="text-slate2">We{"\u2019"}ll line up colleges that fit.</span>
            </h1>
          </div>
          {(step > 0 || showResults) && (
            <button onClick={reset} data-testid="match-reset" className="inline-flex items-center gap-2 text-xs text-slate2 hover:text-navy border border-border h-9 px-3">
              <RotateCcw className="w-3.5 h-3.5" /> Start over
            </button>
          )}
        </div>

        {/* Progress */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate2 font-mono font-semibold">
              {showResults ? "Match results" : `Step ${step + 1} of ${totalSteps}`}
            </div>
            <div className="text-[10px] font-mono text-slate2 tabular">{Math.round(progress)}%</div>
          </div>
          <div className="h-1 bg-border">
            <div className="h-full bg-navy transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Steps */}
        {!showResults && (
          <div className="border border-border bg-white p-8 sm:p-10">
            {step === 0 && (
              <Step icon={GraduationCap} title="Which course are you looking at?" hint="Pick one. You can compare related branches later.">
                <ChoiceGrid options={COURSES} value={picks.course} onChange={(v) => set("course", v)} testidPrefix="match-course" />
              </Step>
            )}
            {step === 1 && (
              <Step icon={IndianRupee} title="What budget feels comfortable?" hint="Total spend across the full program, including hostel.">
                <ChoiceGrid options={BUDGETS.map((b) => b.label)} value={picks.budget && BUDGETS.find((b) => b.id === picks.budget)?.label}
                  onChange={(label) => set("budget", BUDGETS.find((b) => b.label === label)?.id)} testidPrefix="match-budget" />
              </Step>
            )}
            {step === 2 && (
              <Step icon={Target} title="What matters most to you?" hint="We use this to rank what we show you \u2014 nothing else.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border border border-border">
                  {GOALS.map((g) => {
                    const active = picks.goal === g.id;
                    return (
                      <button
                        key={g.id}
                        onClick={() => set("goal", g.id)}
                        data-testid={`match-goal-${g.id}`}
                        className={`text-left p-5 transition-colors flex items-start gap-4 ${active ? "bg-navy text-white" : "bg-white hover:bg-offwhite"}`}
                      >
                        <span className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 ${active ? "border-emerald2 bg-emerald2" : "border-slate2"}`}>
                          {active && <Check className="w-2.5 h-2.5 text-navy" strokeWidth={3} />}
                        </span>
                        <div>
                          <div className="font-heading font-bold text-base">{g.label}</div>
                          <div className={`text-xs mt-1 leading-relaxed ${active ? "text-white/70" : "text-slate2"}`}>{g.note}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Step>
            )}
            {step === 3 && (
              <Step icon={MapPin} title="Any preferred location?" hint="Pick a Tamil Nadu city, or open it up to anywhere in India.">
                <ChoiceGrid options={LOCATIONS} value={picks.location} onChange={(v) => set("location", v)} testidPrefix="match-loc" cols={3} />
              </Step>
            )}

            {/* Step nav */}
            <div className="mt-10 pt-6 border-t border-border flex items-center justify-between">
              <button
                onClick={back}
                disabled={step === 0}
                data-testid="match-back"
                className="inline-flex items-center gap-2 h-11 px-4 text-xs text-slate2 hover:text-navy disabled:opacity-30"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={next}
                disabled={
                  (step === 0 && !picks.course) ||
                  (step === 1 && !picks.budget) ||
                  (step === 2 && !picks.goal) ||
                  (step === 3 && !picks.location)
                }
                data-testid="match-next"
                className="inline-flex items-center gap-2 h-11 px-6 bg-navy text-white text-xs tracking-wide hover:bg-navy-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {step === totalSteps - 1 ? "See my matches" : "Next"} <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {showResults && buckets && (
          <div className="space-y-12">
            {/* Picks summary */}
            <div className="border border-border bg-white p-6 flex flex-wrap items-center gap-4">
              <span className="text-[10px] uppercase tracking-wider text-slate2 font-mono">Your picks:</span>
              <Pick label="Course" v={picks.course} />
              <Pick label="Budget" v={BUDGETS.find((b) => b.id === picks.budget)?.label} />
              <Pick label="Goal" v={GOALS.find((g) => g.id === picks.goal)?.label} />
              <Pick label="Location" v={picks.location} />
              {buckets.locationFellBack && (
                <span className="text-[11px] text-amber2 ml-auto">Not enough matches in {picks.location} \u2014 showing nationwide.</span>
              )}
            </div>

            <Bucket title="Best Match" subtitle="Strongest fit for what you picked." cards={buckets.best} picks={picks} bucket="best" empty="No colleges fit within this budget. Try expanding budget or location." />
            <Bucket title="Strong Alternatives" subtitle="Also worth a serious look." cards={buckets.alts} picks={picks} bucket="alt" empty="No alternatives at this filter level." />
            <Bucket title="Budget-Friendly Options" subtitle="Lower total spend, regardless of budget pick." cards={buckets.budgetFriendly} picks={picks} bucket="budget" />
            <Bucket title="Premium Options" subtitle="Higher cost than your budget, included for context." cards={buckets.premium} picks={picks} bucket="premium" empty="Your budget already covers the premium tier." />

            <div className="border-l-2 border-steel bg-white px-5 py-4 text-xs text-slate2 leading-relaxed">
              <span className="font-semibold text-navy">A small note:</span> We{"\u2019"}re matching your preferences against publicly filed data \u2014 not recommending colleges. Always read the source documents before deciding.
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Step({ icon: Icon, title, hint, children }) {
  return (
    <div>
      <div className="flex items-start gap-4 mb-8">
        <div className="w-10 h-10 border border-navy bg-offwhite flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-navy" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="font-heading text-2xl sm:text-3xl tracking-tight font-bold leading-tight">{title}</h2>
          <p className="text-sm text-slate2 mt-1.5 leading-relaxed">{hint}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function ChoiceGrid({ options, value, onChange, testidPrefix, cols = 2 }) {
  const colCls = cols === 3 ? "md:grid-cols-3 lg:grid-cols-5" : "md:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={`grid grid-cols-1 ${colCls} gap-px bg-border border border-border`}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            data-testid={`${testidPrefix}-${opt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
            className={`text-left p-4 transition-colors flex items-center gap-3 ${active ? "bg-navy text-white" : "bg-white hover:bg-offwhite"}`}
          >
            <span className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${active ? "border-emerald2 bg-emerald2" : "border-slate2"}`}>
              {active && <Check className="w-2.5 h-2.5 text-navy" strokeWidth={3} />}
            </span>
            <span className="font-heading font-semibold text-sm">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

function Pick({ label, v }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-slate2 font-mono">{label}</span>
      <span className="text-xs font-semibold text-navy bg-offwhite border border-border px-2 py-1">{v || "\u2014"}</span>
    </div>
  );
}

function Bucket({ title, subtitle, cards, picks, bucket, empty }) {
  const accent = { best: "#059669", alt: "#0B1528", budget: "#4682B4", premium: "#D97706" }[bucket];
  return (
    <section data-testid={`bucket-${bucket}`}>
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: accent }} />
            <h3 className="font-heading text-2xl sm:text-3xl tracking-tighter font-bold">{title}</h3>
          </div>
          <p className="text-sm text-slate2 mt-1 ml-5">{subtitle}</p>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate2">{cards.length} colleges</span>
      </div>

      {cards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {cards.map((c, i) => (
            <MatchCard key={c.id} c={c} reason={explain(c, picks, bucket)} accent={accent} index={i} />
          ))}
        </div>
      ) : (
        <div className="border border-dashed border-border bg-white p-8 text-center text-sm text-slate2">{empty || "No colleges match this bucket."}</div>
      )}
    </section>
  );
}

function MatchCard({ c, reason, accent, index }) {
  return (
    <article className="border border-border bg-white group hover-lift animate-fade-up flex flex-col" style={{ animationDelay: `${index * 80}ms` }}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
            <span className="text-[9px] uppercase tracking-wider font-mono text-slate2">{c.city}</span>
          </div>
          <h4 className="font-heading text-lg font-bold text-navy mt-1 leading-tight truncate" title={c.name}>{c.short}</h4>
        </div>
        <span className="text-[10px] font-mono font-bold bg-navy text-white px-2 py-1 flex-shrink-0">{c.roiRating}</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-px bg-border border-b border-border">
        <Stat k="Typical Salary" v={formatINR(c.medianSalary)} />
        <Stat k="Got Jobs" v={`${c.placementRate}%`} />
        <Stat k="You'll Spend" v={formatINR(c.cost)} />
      </div>

      <div className="grid grid-cols-2 gap-px bg-border border-b border-border">
        <Stat k="Further Studies" v={`${c.higherStudies}%`} />
        <div className="bg-white p-3 flex items-center justify-between">
          <span className="text-[9px] uppercase tracking-wider text-slate2 font-mono">Openness</span>
          <TransparencyChip value={c.transparency} />
        </div>
      </div>

      {/* Reason */}
      <div className="px-5 py-3.5 bg-offwhite border-b border-border">
        <div className="text-[10px] uppercase tracking-wider text-slate2 font-mono mb-1">Why we matched this</div>
        <p className="text-xs text-navy leading-relaxed">{reason}</p>
      </div>

      {/* Footer CTA */}
      <Link
        to={`/college/${c.id}`}
        data-testid={`match-card-${c.id}`}
        className="px-5 py-3.5 text-xs font-semibold text-navy hover:bg-navy hover:text-white transition-colors flex items-center justify-between mt-auto"
      >
        <span>View full report</span>
        <ArrowUpRight className="w-4 h-4" />
      </Link>
    </article>
  );
}

function Stat({ k, v }) {
  return (
    <div className="bg-white p-3">
      <div className="text-[9px] uppercase tracking-wider text-slate2 font-mono">{k}</div>
      <div className="font-heading font-bold text-base text-navy mt-1 tabular">{v}</div>
    </div>
  );
}
