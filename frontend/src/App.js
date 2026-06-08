import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Home from "./pages/Home";
import Factsheet from "./pages/Factsheet";
import Compare from "./pages/Compare";
import Colleges from "./pages/Colleges";
import Methodology from "./pages/Methodology";
import Match from "./pages/Match";

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
          <Route path="/methodology" element={<Methodology />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-right" theme="light" />
    </div>
  );
}

export default App;
