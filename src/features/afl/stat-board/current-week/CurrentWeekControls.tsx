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
  stat, mode, position, search,
  onStatChange, onModeChange, onPositionChange, onSearchChange,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null);
  const px = "var(--page-px)";

  return (
    <div className="flex flex-col gap-2">

      {/*
       * Row 1 (desktop): stat pills on the left, mode toggle on the right.
       * Mobile: stats scroll, mode below.
       */}
      <div
        className="flex items-center gap-3 justify-between"
        style={{ paddingInline: px }}
      >
        {/* Stat pills — scrollable on mobile, wrap-friendly on desktop */}
        <div
          className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5 flex-1 min-w-0"
          role="group"
          aria-label="Select stat"
        >
          {STAT_OPTIONS.map((o) => (
            <PillButton
              key={o.key}
              active={stat === o.key}
              onClick={() => onStatChange(o.key)}
              aria-pressed={stat === o.key}
            >
              {o.label}
            </PillButton>
          ))}
        </div>

        {/* Mode toggle — fixed right, never scrolls off */}
        <div
          className="flex gap-1 flex-shrink-0 bg-white/[0.03] border border-white/[0.07] rounded-xl p-0.5"
          role="group"
          aria-label="Select view mode"
        >
          {MODE_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => onModeChange(o.key)}
              aria-pressed={mode === o.key}
              className={[
                "px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40",
                mode === o.key
                  ? "bg-white/[0.12] text-white shadow-sm"
                  : "text-white/40 hover:text-white/70",
              ].join(" ")}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/*
       * Row 2: position filter left, search centre, (sort moved to per-team header).
       */}
      <div
        className="flex items-center gap-3"
        style={{ paddingInline: px }}
      >
        {/* Position filter */}
        <div
          className="flex gap-1 flex-shrink-0"
          role="group"
          aria-label="Filter by position"
        >
          {POSITION_OPTIONS.map((o) => (
            <PillButton
              key={o.key}
              active={position === o.key}
              onClick={() => onPositionChange(o.key)}
              small
              aria-pressed={position === o.key}
            >
              {o.label}
            </PillButton>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-[240px]">
          <Search
            size={11}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none"
          />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search player…"
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
      </div>

    </div>
  );
}

function PillButton({
  active, onClick, children, small = false, "aria-pressed": ariaPressed,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
  "aria-pressed"?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={ariaPressed}
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
