import { useRef } from "react";
import { Search, X } from "lucide-react";
import type { StatLens, PositionFilter } from "../types";
import type { CompareMode, SortKey } from "./currentWeekTypes";

const STAT_OPTIONS: { key: StatLens; label: string }[] = [
  { key: "disposals", label: "Disposals" },
  { key: "goals",     label: "Goals" },
  { key: "marks",     label: "Marks" },
  { key: "tackles",   label: "Tackles" },
  { key: "kicks",     label: "Kicks" },
  { key: "fantasy",   label: "Fantasy" },
];

const MODE_OPTIONS: { key: CompareMode; label: string }[] = [
  { key: "board", label: "Board Lines" },
  { key: "fine",  label: "Fine Lines" },
];

const POSITION_OPTIONS: { key: PositionFilter; label: string }[] = [
  { key: "ALL",  label: "All" },
  { key: "MID",  label: "MID" },
  { key: "DEF",  label: "DEF" },
  { key: "FWD",  label: "FWD" },
  { key: "RUCK", label: "RUCK" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "hit_rate",   label: "Hit rate" },
  { key: "l5_avg",     label: "L5 avg" },
  { key: "projection", label: "Projection" },
  { key: "name",       label: "A–Z" },
];

interface Props {
  stat: StatLens;
  mode: CompareMode;
  position: PositionFilter;
  sort: SortKey;
  search: string;
  onStatChange: (s: StatLens) => void;
  onModeChange: (m: CompareMode) => void;
  onPositionChange: (p: PositionFilter) => void;
  onSortChange: (s: SortKey) => void;
  onSearchChange: (s: string) => void;
}

export function CurrentWeekControls({
  stat, mode, position, sort, search,
  onStatChange, onModeChange, onPositionChange, onSortChange, onSearchChange,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null);
  const px = "clamp(12px,3vw,20px)";

  return (
    <div className="flex flex-col gap-1.5">
      {/* Row 1: Stat family */}
      <ScrollRow label="Stat" px={px}>
        {STAT_OPTIONS.map((o) => (
          <PillButton
            key={o.key}
            active={stat === o.key}
            onClick={() => onStatChange(o.key)}
          >
            {o.label}
          </PillButton>
        ))}
      </ScrollRow>

      {/* Row 2: Mode */}
      <ScrollRow label="Mode" px={px}>
        {MODE_OPTIONS.map((o) => (
          <PillButton
            key={o.key}
            active={mode === o.key}
            onClick={() => onModeChange(o.key)}
          >
            {o.label}
          </PillButton>
        ))}
      </ScrollRow>

      {/* Row 3: Position */}
      <ScrollRow label="Position" px={px}>
        {POSITION_OPTIONS.map((o) => (
          <PillButton
            key={o.key}
            active={position === o.key}
            onClick={() => onPositionChange(o.key)}
          >
            {o.label}
          </PillButton>
        ))}
      </ScrollRow>

      {/* Row 4: Search + Sort */}
      <div
        className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5"
        style={{ paddingInline: px }}
      >
        {/* Search input */}
        <div className="relative flex-1 min-w-[120px] max-w-[220px]">
          <Search
            size={11}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none"
          />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search player..."
            className="w-full pl-7 pr-7 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/20 focus:bg-white/[0.06] transition-colors"
          />
          {search && (
            <button
              onClick={() => { onSearchChange(""); searchRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              aria-label="Clear search"
            >
              <X size={10} />
            </button>
          )}
        </div>

        {/* Sort pills */}
        <div className="flex gap-1.5 flex-shrink-0">
          {SORT_OPTIONS.map((o) => (
            <PillButton
              key={o.key}
              active={sort === o.key}
              onClick={() => onSortChange(o.key)}
              small
            >
              {o.label}
            </PillButton>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScrollRow({ label, px, children }: { label: string; px: string; children: React.ReactNode }) {
  return (
    <div
      className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
      style={{ paddingInline: px }}
      aria-label={label}
    >
      {children}
    </div>
  );
}

function PillButton({
  active, onClick, children, small = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex-shrink-0 rounded-lg border font-medium transition-all duration-100",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40",
        small ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]",
        active
          ? "bg-white/[0.10] border-white/25 text-white"
          : "bg-white/[0.02] border-white/[0.08] text-white/50 hover:bg-white/[0.05] hover:text-white/75 hover:border-white/15",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
