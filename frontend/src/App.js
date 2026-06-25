import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./lib/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
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
import AdminIntelligence from "./pages/AdminIntelligence";
import AdminRefresh from "./pages/AdminRefresh";
import AdminHome from "./pages/AdminHome";
import AdminLogin from "./pages/AdminLogin";
import AdminSources from "./pages/AdminSources";
import AdminAICTE from "./pages/AdminAICTE";
import AdminNAAC from "./pages/AdminNAAC";
import AdminLeads from "./pages/AdminLeads";
import AssistantWidget from "./components/AssistantWidget";

const protect = (el) => <ProtectedRoute>{el}</ProtectedRoute>;

function App() {
  return (
    <div className="App font-sans">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/colleges" element={<Colleges />} />
            <Route path="/college/:id" element={<Factsheet />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/match" element={<Match />} />
            <Route path="/shortlist" element={<Shortlist />} />
            <Route path="/shortlist/report" element={<Report />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={protect(<AdminHome />)} />
            <Route path="/admin/nirf" element={protect(<AdminNIRF />)} />
            <Route path="/admin/nirf/review" element={protect(<AdminExtract />)} />
            <Route path="/admin/nirf/metrics" element={protect(<AdminMetrics />)} />
            <Route path="/admin/nirf/intelligence" element={protect(<AdminIntelligence />)} />
            <Route path="/admin/nirf/refresh" element={protect(<AdminRefresh />)} />
            <Route path="/admin/sources" element={protect(<AdminSources />)} />
            <Route path="/admin/aicte" element={protect(<AdminAICTE />)} />
            <Route path="/admin/naac" element={protect(<AdminNAAC />)} />
            <Route path="/admin/leads" element={protect(<AdminLeads />)} />
          </Routes>
          <AssistantWidget />
        </AuthProvider>
      </BrowserRouter>
      <Toaster position="bottom-right" theme="light" />
    </div>
  );
}

export default App;
