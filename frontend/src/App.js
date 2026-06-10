import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Home from "./pages/Home";
import Factsheet from "./pages/Factsheet";
import Compare from "./pages/Compare";
import Colleges from "./pages/Colleges";
import Methodology from "./pages/Methodology";
import Match from "./pages/Match";
import Shortlist from "./pages/Shortlist";
import Report from "./pages/Report";
import AdminNIRF from "./pages/AdminNIRF";
import AdminExtract from "./pages/AdminExtract";
import AdminMetrics from "./pages/AdminMetrics";

function App() {
  return (
    <div className="App font-sans">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/colleges" element={<Colleges />} />
          <Route path="/college/:id" element={<Factsheet />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/match" element={<Match />} />
          <Route path="/shortlist" element={<Shortlist />} />
          <Route path="/shortlist/report" element={<Report />} />
          <Route path="/admin/nirf" element={<AdminNIRF />} />
          <Route path="/admin/nirf/review" element={<AdminExtract />} />
          <Route path="/admin/nirf/metrics" element={<AdminMetrics />} />
          <Route path="/methodology" element={<Methodology />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-right" theme="light" />
    </div>
  );
}

export default App;
