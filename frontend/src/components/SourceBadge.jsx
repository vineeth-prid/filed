export const SOURCE_META = {
  "nirf": { label: "NIRF", color: "#0B1528", desc: "National Institutional Ranking Framework — Ministry of Education filing" },
  "naac": { label: "NAAC", color: "#4682B4", desc: "National Assessment and Accreditation Council report" },
  "aicte": { label: "AICTE", color: "#059669", desc: "All India Council for Technical Education disclosure" },
  "ugc": { label: "UGC", color: "#D97706", desc: "University Grants Commission filing" },
  "institution": { label: "Institution", color: "#64748B", desc: "Institution Annual Report / Disclosure" },
  "regulatory": { label: "Regulatory", color: "#0B1528", desc: "Regulatory Submission" },
};

export default function SourceBadge({ source = "nirf", year, size = "sm" }) {
  const meta = SOURCE_META[source] || SOURCE_META.nirf;
  const px = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      title={meta.desc}
      className={`inline-flex items-center gap-1 ${px} font-mono uppercase tracking-wider border`}
      style={{ borderColor: meta.color + "33", color: meta.color, background: meta.color + "08" }}
      data-testid={`source-badge-${source}`}
    >
      <span className="dot" style={{ background: meta.color }} />
      {meta.label}{year ? ` ${year}` : ""}
    </span>
  );
}
