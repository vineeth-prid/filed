import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Hero from "../sections/Hero";
import DecisionGap from "../sections/DecisionGap";
import MarketLandscape from "../sections/MarketLandscape";
import IntelligenceCategories from "../sections/IntelligenceCategories";
import FactsheetPreview from "../sections/FactsheetPreview";
import StudentJourney from "../sections/StudentJourney";
import DisclosureComparison from "../sections/DisclosureComparison";
import ParentQuestions from "../sections/ParentQuestions";
import ComparisonEngine from "../sections/ComparisonEngine";
import InsightEngine from "../sections/InsightEngine";
import Methodology from "../sections/Methodology";
import FinalCTA from "../sections/FinalCTA";

export default function Home() {
  return (
    <div data-testid="home-page" className="bg-offwhite text-navy">
      <Navbar />
      <main>
        <Hero />
        <DecisionGap />
        <MarketLandscape />
        <IntelligenceCategories />
        <FactsheetPreview />
        <StudentJourney />
        <DisclosureComparison />
        <ParentQuestions />
        <ComparisonEngine />
        <InsightEngine />
        <Methodology />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
