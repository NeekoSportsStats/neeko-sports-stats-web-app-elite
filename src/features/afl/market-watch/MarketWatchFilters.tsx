import { X } from "lucide-react";

export interface FilterState {
  position: string | null;
  team: string | null;
  priceRange: [number, number] | null;
  riskLevel: "low" | "medium" | "high" | null;
}

interface Props {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  teams: string[];
}

const POSITIONS = ["DEF", "MID", "FWD", "RUC"];
const RISK_LEVELS: { key: "low" | "medium" | "high"; label: string }[] = [
  { key: "low",    label: "Low Risk" },
  { key: "medium", label: "Med Risk" },
  { key: "high",   label: "High Risk" },
];
const PRICE_RANGES: { label: string; range: [number, number] }[] = [
  { label: "< $300k",       range: [0, 300_000] },
  { label: "$300k–$600k",   range: [300_000, 600_000] },
  { label: "$600k–$900k",   range: [600_000, 900_000] },
  { label: "> $900k",       range: [900_000, 9_999_999] },
];

const hasActiveFilters = (f: FilterState) =>
  f.position !== null || f.team !== null || f.priceRange !== null || f.riskLevel !== null;

export function MarketWatchFilters({ filters, onChange, teams }: Props) {
  const setPos = (pos: string) =>
    onChange({ ...filters, position: filters.position === pos ? null : pos });

  const setTeam = (team: string) =>
    onChange({ ...filters, team: filters.team === team ? null : team });

  const setRange = (range: [number, number]) =>
    onChange({
      ...filters,
      priceRange:
        filters.priceRange?.[0] === range[0] && filters.priceRange?.[1] === range[1]
          ? null
          : range,
    });

  const setRisk = (risk: "low" | "medium" | "high") =>
    onChange({ ...filters, riskLevel: filters.riskLevel === risk ? null : risk });

  const clearAll = () =>
    onChange({ position: null, team: null, priceRange: null, riskLevel: null });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] text-white/30 uppercase tracking-wider shrink-0">Filter</span>

      {POSITIONS.map(pos => (
        <FilterChip
          key={pos}
          active={filters.position === pos}
          onClick={() => setPos(pos)}
        >
          {pos}
        </FilterChip>
      ))}

      <div className="h-3 w-px bg-white/10 mx-0.5" />

      {PRICE_RANGES.map(pr => (
        <FilterChip
          key={pr.label}
          active={
            filters.priceRange?.[0] === pr.range[0] &&
            filters.priceRange?.[1] === pr.range[1]
          }
          onClick={() => setRange(pr.range)}
        >
          {pr.label}
        </FilterChip>
      ))}

      <div className="h-3 w-px bg-white/10 mx-0.5" />

      {RISK_LEVELS.map(r => (
        <FilterChip
          key={r.key}
          active={filters.riskLevel === r.key}
          onClick={() => setRisk(r.key)}
          colorClass={
            r.key === "low"
              ? "data-[active=true]:border-green-400/30 data-[active=true]:bg-green-400/10 data-[active=true]:text-green-400"
              : r.key === "medium"
              ? "data-[active=true]:border-yellow-400/30 data-[active=true]:bg-yellow-400/10 data-[active=true]:text-yellow-400"
              : "data-[active=true]:border-red-400/30 data-[active=true]:bg-red-400/10 data-[active=true]:text-red-400"
          }
        >
          {r.label}
        </FilterChip>
      ))}

      {teams.length > 0 && (
        <>
          <div className="h-3 w-px bg-white/10 mx-0.5" />
          <select
            value={filters.team ?? ""}
            onChange={e => onChange({ ...filters, team: e.target.value || null })}
            className="text-[11px] bg-white/[0.03] border border-white/8 text-white/50 rounded-lg px-2 py-1 outline-none focus:border-white/20 hover:border-white/15 transition-colors cursor-pointer"
          >
            <option value="">All Teams</option>
            {teams.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </>
      )}

      {hasActiveFilters(filters) && (
        <button
          onClick={clearAll}
          className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 transition-colors ml-1"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  );
}

function FilterChip({
  children,
  active,
  onClick,
  colorClass,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  colorClass?: string;
}) {
  return (
    <button
      data-active={active}
      onClick={onClick}
      className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
        colorClass
          ? `bg-white/[0.03] border-white/8 text-white/40 hover:text-white/70 hover:border-white/15 ${colorClass}`
          : active
          ? "bg-[#F5C84C]/15 border-[#F5C84C]/30 text-[#F5C84C] font-semibold"
          : "bg-white/[0.03] border-white/8 text-white/40 hover:text-white/70 hover:border-white/15"
      }`}
    >
      {children}
    </button>
  );
}
