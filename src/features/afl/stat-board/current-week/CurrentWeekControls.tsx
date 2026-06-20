import { useRef } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import type { StatLens, PositionFilter } from "../types";
import type { CompareMode, SortKey } from "./currentWeekTypes";
import { getThresholdsForMode } from "./currentWeekUtils";

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

/** Quick-line window size: 3 before + selected + 3 after = 7 buttons max */
const QUICK_WINDOW = 3;

interface Props {
  stat: StatLens;
  mode: CompareMode;
  position: PositionFilter;
  sort: SortKey;
  search: string;
  selectedLine: number;
  onStatChange: (s: StatLens) => void;
  onModeChange: (m: CompareMode) => void;
  onPositionChange: (p: PositionFilter) => void;
  onSortChange: (s: SortKey) => void;
  onSearchChange: (s: string) => void;
  onLineChange: (l: number) => void;
}

export function CurrentWeekControls({
  stat, mode, position, sort, search, selectedLine,
  onStatChange, onModeChange, onPositionChange, onSortChange, onSearchChange, onLineChange,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null);
  const px = "var(--page-px)";

  const thresholds = getThresholdsForMode(stat, mode);

  // Build quick-line window centred around selected line
  const selectedIdx = thresholds.indexOf(selectedLine);
  const quickStart  = Math.max(0, selectedIdx - QUICK_WINDOW);
  const quickEnd    = Math.min(thresholds.length - 1, selectedIdx + QUICK_WINDOW);
  const quickLines  = Array.from(thresholds).slice(quickStart, quickEnd + 1);

  return (
    <div className="flex flex-col gap-2">

      {/*
       * ROW 1
       * Desktop: [stat pills] ··· [Board/Fine toggle] [fine-lines selector]
       * Mobile:  stat pills scroll, mode below
       */}
      <div
        className="flex items-center gap-2 sm:gap-3"
        style={{ paddingInline: px }}
      >
        {/* Stat pills — scrollable on mobile */}
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

        {/* Mode toggle — fixed right */}
        <div
          className="flex gap-1 flex-shrink-0 bg-white/[0.03] border border-white/[0.07] rounded-xl p-0.5"
          role="group"
          aria-label="Select view mode"
          data-testid="mode-toggle"
        >
          {MODE_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => onModeChange(o.key)}
              aria-pressed={mode === o.key}
              data-mode={o.key}
              className={[
                "px-2.5 py-1.5 sm:px-3 rounded-lg text-[10px] sm:text-[11px] font-semibold transition-all duration-150",
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

        {/*
         * Fine Lines line selector — desktop only (≥640px).
         * Shows a dropdown + 7-button quick window.
         * Mobile line picker stays in the separate <LinePicker> below the controls.
         */}
        {mode === "fine" && (
          <div
            className="hidden sm:flex items-center gap-2 flex-shrink-0"
            data-testid="desktop-line-selector"
          >
            <span className="text-[10px] font-medium text-white/40">Line:</span>

            {/* Dropdown — authoritative selector */}
            <div className="relative">
              <select
                value={selectedLine}
                onChange={(e) => onLineChange(Number(e.target.value))}
                aria-label="Select comparison line"
                className="appearance-none bg-white/[0.06] border border-white/[0.12] text-white text-[11px] font-bold rounded-lg pl-2.5 pr-6 py-1.5 focus:outline-none focus:border-white/25 transition-colors cursor-pointer"
                style={{ background: "#0d1117" }}
              >
                {Array.from(thresholds).map((t) => (
                  <option key={t} value={t} style={{ background: "#0d1117" }}>
                    {t}+
                  </option>
                ))}
              </select>
              <ChevronDown
                size={10}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
              />
            </div>

            {/* Quick-line buttons centred around selected */}
            <div
              className="flex gap-1"
              role="group"
              aria-label="Quick line selection"
            >
              {quickLines.map((t) => (
                <button
                  key={t}
                  onClick={() => onLineChange(t)}
                  aria-pressed={t === selectedLine}
                  aria-label={`Select ${t}+ line`}
                  className={[
                    "px-2 py-1 rounded text-[10px] font-semibold border transition-all duration-100",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40",
                    t === selectedLine
                      ? "bg-white/[0.10] border-white/25 text-white"
                      : "bg-transparent border-white/[0.08] text-white/35 hover:border-white/20 hover:text-white/60",
                  ].join(" ")}
                >
                  {t}+
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/*
       * ROW 2
       * [position filters] [search 240–320px] [Sort by: dropdown]
       */}
      <div
        className="flex items-center gap-2 sm:gap-3"
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
        <div className="relative flex-1 min-w-0 max-w-[280px]">
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

        {/* Global sort — one control applies to both teams */}
        <div
          className="flex items-center gap-1.5 flex-shrink-0 ml-auto"
          data-testid="global-sort-control"
        >
          <span className="hidden sm:inline text-[10px] font-medium text-white/35">Sort by:</span>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
            aria-label="Sort players"
            className="text-[10px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/65 rounded-md px-2 py-1.5 focus:outline-none focus:border-white/20 focus:text-white/80 transition-colors appearance-none cursor-pointer"
            style={{ background: "#0d1117" }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key} style={{ background: "#0d1117" }}>
                {o.label}
              </option>
            ))}
          </select>
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
        small ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-[11px]",
        active
          ? "bg-white/[0.10] border-white/25 text-white"
          : "bg-white/[0.02] border-white/[0.08] text-white/50 hover:bg-white/[0.05] hover:text-white/75 hover:border-white/15",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** Mobile-only line picker: horizontal scroll of all thresholds */
export function MobileLinePicker({
  thresholds,
  selectedLine,
  onSelect,
}: {
  thresholds: readonly number[];
  selectedLine: number;
  onSelect: (line: number) => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 sm:hidden"
      style={{ paddingInline: "var(--page-px)" }}
      role="group"
      aria-label="Select comparison line"
      data-testid="mobile-line-picker"
    >
      <span className="text-[10px] font-semibold text-white/40 flex-shrink-0">Line:</span>
      {Array.from(thresholds).map((t) => (
        <button
          key={t}
          onClick={() => onSelect(t)}
          aria-pressed={t === selectedLine}
          aria-label={`Select ${t}+ line`}
          className={[
            "flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold border transition-all duration-100",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40",
            t === selectedLine
              ? "bg-white/[0.10] border-white/25 text-white"
              : "bg-transparent border-white/[0.08] text-white/35 hover:border-white/20 hover:text-white/60",
          ].join(" ")}
        >
          {t}+
        </button>
      ))}
    </div>
  );
}
