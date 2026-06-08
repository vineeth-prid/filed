// Microcopy helpers — convert raw numbers into parent-friendly sentences.

export const microPlacement = (rate) => {
  if (rate == null) return "";
  return `About ${Math.round(rate)} out of every 100 students got jobs.`;
};

export const microSalary = () =>
  "Half the placed students earned above this amount and half earned below it.";

export const microHigherStudies = (pct) =>
  `About ${Math.round(pct)} out of every 100 students chose to study further.`;

export const microRatio = (ratio) => {
  // "1:16" → "On average, one teacher for every 16 students."
  const parts = String(ratio).split(":");
  if (parts.length === 2) {
    return `On average, one teacher for every ${parts[1].trim()} students.`;
  }
  return "";
};

export const microCost = () =>
  "Estimated total spend across the full program (tuition + accommodation).";

export const microStudents = (n) =>
  `${n.toLocaleString("en-IN")} students currently enrolled across all programs.`;

export const microFaculty = (n) =>
  `${n.toLocaleString("en-IN")} full-time teachers on the regular roll.`;

export const microDiversity = () =>
  "Mix of students from different states and backgrounds. Higher = more variety.";

export const microResearch = () =>
  "Based on publications, citations and sponsored work. Higher = more research-active.";

export const microTransparency = (v) => {
  if (v >= 80) return "This college shares most of its data openly.";
  if (v >= 65) return "This college shares some data but leaves gaps.";
  return "This college shares limited information publicly.";
};

export const microCareerSuccess = () =>
  "Combines jobs, salaries and further studies into one easy number out of 100.";

export const microValueForMoney = (rating) => {
  if (rating === "AAA") return "Strong outcomes for what families spend.";
  if (rating === "AA") return "Solid outcomes for the money.";
  if (rating === "A") return "Reasonable outcomes for the cost.";
  return "Outcomes look modest for what it costs.";
};

export const microConfidence = () =>
  "Based on how complete and recent the college's filings are.";
