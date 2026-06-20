import { CircleCheck as CheckCircle, Lock } from "lucide-react";
import type { StatBoardMatch } from "../types";

const TEAM_ABBR: Record<string, string> = {
  "Adelaide Crows":    "ADE",
  "Brisbane Lions":    "BRI",
  "Carlton":           "CAR",
  "Collingwood":       "COL",
  "Essendon":          "ESS",
  "Fremantle":         "FRE",
  "Geelong Cats":      "GEE",
  "Gold Coast Suns":   "GCS",
  "GWS Giants":        "GWS",
  "Hawthorn":          "HAW",
  "Melbourne":         "MEL",
  "North Melbourne":   "NM",
  "Port Adelaide":     "PA",
  "Richmond":          "RIC",
  "St Kilda":          "STK",
  "Sydney Swans":      "SYD",
  "West Coast Eagles": "WCE",
  "Western Bulldogs":  "WBD",
};

function abbr(name: string): string {
  return TEAM_ABBR[name] ?? name.slice(0, 3).toUpperCase();
}

/** Derive a simple completed/live/upcoming state from match data. */
function matchState(m: StatBoardMatch): "completed" | "locked" | "free" | "standard" {
  // Completed: game_date in the past AND not locked (simplified heuristic)
  // We use is_locked to indicate premium-only; free = is_free_match
  if (!m.is_free_match && m.is_locked) return "locked";
  if (m.is_free_match) return "free";
  return "standard";
}

interface Props {
  matches: StatBoardMatch[];
  selected: StatBoardMatch | null;
  loading: boolean;
  hasFullAccess: boolean;
  onChange: (match: StatBoardMatch) => void;
  onLockedClick?: (match: StatBoardMatch) => void;
}

export function CurrentWeekGameSelector({
  matches,
  selected,
  loading,
  hasFullAccess,
  onChange,
  onLockedClick,
}: Props) {
  if (loading) {
    return (
      <div
        className="grid gap-2"
        style={{
          paddingInline: "var(--page-px)",
          gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
        }}
        aria-label="Loading games"
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse bg-white/[0.04] rounded-xl"
            style={{ height: 56 }}
          />
        ))}
      </div>
    );
  }

  if (!matches.length) return null;

  const isCardLocked = (m: StatBoardMatch) => !hasFullAccess && !m.is_free_match;

  return (
    <>
      {/* Mobile: horizontal scroll strip */}
      <div
        className="flex gap-2 overflow-x-auto no-scrollbar pb-1 sm:hidden"
        style={{ paddingInline: "var(--page-px)" }}
        role="listbox"
        aria-label="Select a game"
      >
        {matches.map((m) => (
          <GameCard
            key={m.match_id}
            match={m}
            isSelected={selected?.match_id === m.match_id}
            isLocked={isCardLocked(m)}
            onChange={onChange}
            onLockedClick={onLockedClick}
            flex
          />
        ))}
      </div>

      {/*
       * Tablet+ (≥640px): responsive grid.
       * ~4 cols @640px, ~6–7 cols @1440px via auto-fill.
       * min 90px keeps cards readable; 1fr fills available space.
       */}
      <div
        className="hidden sm:grid gap-2"
        style={{
          paddingInline: "var(--page-px)",
          gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
        }}
        role="listbox"
        aria-label="Select a game"
        data-testid="game-selector-grid"
      >
        {matches.map((m) => (
          <GameCard
            key={m.match_id}
            match={m}
            isSelected={selected?.match_id === m.match_id}
            isLocked={isCardLocked(m)}
            onChange={onChange}
            onLockedClick={onLockedClick}
          />
        ))}
      </div>
    </>
  );
}

function GameCard({
  match: m,
  isSelected,
  isLocked,
  onChange,
  onLockedClick,
  flex = false,
}: {
  match: StatBoardMatch;
  isSelected: boolean;
  isLocked: boolean;
  onChange: (m: StatBoardMatch) => void;
  onLockedClick?: (m: StatBoardMatch) => void;
  flex?: boolean;
}) {
  const state = matchState(m);

  const statusLabel = () => {
    if (isLocked)            return "Neeko+";
    if (state === "free")    return "Free";
    return `R${m.week}`;
  };

  const statusColor = () => {
    if (isLocked)         return "text-amber-400/70";
    if (state === "free") return "text-emerald-400/70";
    return "text-white/35";
  };

  return (
    <button
      role="option"
      aria-selected={isSelected}
      data-testid={isLocked ? "locked-game-card" : "game-card"}
      aria-label={`${m.home_team_name} vs ${m.away_team_name}${isLocked ? " — Neeko+ required" : ""}`}
      onClick={() => {
        if (isLocked) { onLockedClick?.(m); return; }
        onChange(m);
      }}
      className={[
        "flex flex-col items-center justify-center gap-0.5",
        "px-2 py-2.5 rounded-xl border text-center transition-all duration-150",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40",
        flex ? "flex-shrink-0" : "w-full",
        isSelected
          ? "bg-white/[0.09] border-white/25 ring-1 ring-white/10"
          : isLocked
          ? "bg-white/[0.02] border-white/[0.06] opacity-60 cursor-default"
          : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] hover:border-white/15",
      ].join(" ")}
      style={flex ? { minWidth: 84 } : undefined}
    >
      {/* Team matchup */}
      <span
        className={[
          "text-[11px] font-bold tracking-tight",
          isSelected ? "text-white" : "text-white/65",
        ].join(" ")}
      >
        {abbr(m.home_team_name)} v {abbr(m.away_team_name)}
      </span>

      {/* Status row */}
      <span className="flex items-center gap-1">
        {isLocked ? (
          <Lock size={8} className="text-amber-400/70 flex-shrink-0" aria-hidden="true" />
        ) : state === "free" ? (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 flex-shrink-0" aria-hidden="true" />
        ) : state === "completed" ? (
          <CheckCircle size={8} className="text-white/30 flex-shrink-0" aria-hidden="true" />
        ) : null}
        <span className={`text-[9px] font-medium ${statusColor()}`}>
          {statusLabel()}
        </span>
      </span>

      {/* Locked: secondary "Locked" label so status is unambiguous */}
      {isLocked && (
        <span
          className="text-[8px] font-semibold text-amber-400/45 uppercase tracking-wide"
          aria-hidden="true"
        >
          Locked
        </span>
      )}
    </button>
  );
}
