import { useMode, MODES } from "../lib/modeStore";
import { GraduationCap, Users } from "lucide-react";

export default function ModeToggle({ size = "md" }) {
  const { modeId, setMode } = useMode();
  const heightCls = size === "sm" ? "h-8 text-[10px]" : "h-9 text-[11px]";

  return (
    <div
      role="tablist"
      aria-label="Switch between Student and Parent view"
      data-testid="mode-toggle"
      className={`inline-flex items-center bg-offwhite border border-border p-0.5 ${heightCls}`}
    >
      {Object.values(MODES).map((m) => {
        const active = modeId === m.id;
        const Icon = m.id === "student" ? GraduationCap : Users;
        return (
          <button
            key={m.id}
            role="tab"
            aria-selected={active}
            onClick={() => setMode(m.id)}
            data-testid={`mode-${m.id}`}
            className="relative px-3 h-full inline-flex items-center gap-1.5 transition-colors"
            style={{
              background: active ? m.accent : "transparent",
              color: active ? "#FFFFFF" : "#64748B",
              letterSpacing: "0.06em",
            }}
          >
            <Icon className="w-3 h-3" strokeWidth={2} />
            <span className="font-mono uppercase font-semibold">{m.short}</span>
          </button>
        );
      })}
    </div>
  );
}
