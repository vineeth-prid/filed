// Global Student/Parent Mode store. localStorage-backed with event sync.
import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "filed.mode.v1";
const CHANGE_EVENT = "filed:mode-changed";

export const MODES = {
  student: {
    id: "student",
    label: "Student Mode",
    short: "Student",
    tagline: "Built for the person who will actually attend.",
    accent: "#059669", // emerald
    accentBg: "rgba(5,150,105,0.10)",
    focus: ["Placements", "Recruiters", "Salary", "Campus Life", "Opportunities"],
    // Ordered priority of metrics — used to re-rank KPI strip + metric grid
    kpiOrder: ["medianSalary", "placementRate", "outcomeScore", "research"],
    metricOrder: [
      "placementRate", "medianSalary", "higherStudies", "research",
      "students", "diversity", "facultyRatio", "cost",
    ],
    badge: "STUDENT VIEW",
  },
  parent: {
    id: "parent",
    label: "Parent Mode",
    short: "Parent",
    tagline: "Built for the person who underwrites the decision.",
    accent: "#4682B4", // steel
    accentBg: "rgba(70,130,180,0.10)",
    focus: ["Cost", "ROI", "Safety", "Transparency", "Higher Studies", "Faculty Quality"],
    kpiOrder: ["roiRating", "cost", "transparency", "facultyRatio"],
    metricOrder: [
      "cost", "facultyRatio", "transparency", "higherStudies",
      "faculty", "placementRate", "medianSalary", "diversity",
    ],
    badge: "PARENT VIEW",
  },
};

const load = () => {
  if (typeof window === "undefined") return "student";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "parent" ? "parent" : "student";
  } catch (e) {
    return "student";
  }
};

const persist = (id) => {
  window.localStorage.setItem(STORAGE_KEY, id);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: id }));
};

export function useMode() {
  const [modeId, setModeId] = useState(load);

  useEffect(() => {
    const handler = () => setModeId(load());
    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const setMode = useCallback((id) => {
    if (!MODES[id]) return;
    persist(id);
    setModeId(id);
  }, []);

  const toggle = useCallback(() => {
    const next = modeId === "student" ? "parent" : "student";
    persist(next);
    setModeId(next);
  }, [modeId]);

  return { mode: MODES[modeId], modeId, setMode, toggle };
}
