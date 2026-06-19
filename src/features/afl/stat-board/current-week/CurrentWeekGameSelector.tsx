import { Lock } from "lucide-react";
import type { StatBoardMatch } from "../types";

const TEAM_ABBR: Record<string, string> = {
  "Adelaide Crows": "ADE",
  "Brisbane Lions": "BRI",
  "Carlton": "CAR",
  "Collingwood": "COL",
  "Essendon": "ESS",
  "Fremantle": "FRE",
  "Geelong Cats": "GEE",
  "Gold Coast Suns": "GCS",
  "GWS Giants": "GWS",
  "Hawthorn": "HAW",
  "Melbourne": "MEL",
  "North Melbourne": "NM",
  "Port Adelaide": "PA",
  "Richmond": "RIC",
  "St Kilda": "STK",
  "Sydney Swans": "SYD",
  "West Coast Eagles": "WCE",
  "Western Bulldogs": "WBD",
};

function abbr(name: string): string {
  return TEAM_ABBR[name] ?? name.slice(0, 3).toUpperCase();
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
          gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))",
        }}
        aria-label="Loading games"
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse bg-white/[0.04] rounded-xl"
            style={{ height: 54 }}
          />
        ))}
      </div>
    );
  }

  if (!matches.length) return null;

  return (
    /*
     * Mobile (<640px): horizontal scroll strip (same as before).
     * Tablet+ (≥640px): responsive grid, 4 cols @640, 6–7 cols @1280+.
     */
    <>
      {/* Mobile: horizontal scroll */}
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
            isLocked={!hasFullAccess && !m.is_free_match}
            onChange={onChange}
            onLockedClick={onLockedClick}
            flex
          />
        ))}
      </div>

      {/* Tablet+: responsive grid */}
      <div
        className="hidden sm:grid gap-2"
        style={{
          paddingInline: "var(--page-px)",
          /*
           * 4 cols at 640px, grows to fill at wider viewports.
           * minmax(84px,1fr) fills 6-7 cards at 1440px with natural spacing.
           */
          gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))",
        }}
        role="listbox"
        aria-label="Select a game"
      >
        {matches.map((m) => (
          <GameCard
            key={m.match_id}
            match={m}
            isSelected={selected?.match_id === m.match_id}
            isLocked={!hasFullAccess && !m.is_free_match}
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
  return (
    <button
      role="option"
      aria-selected={isSelected}
      aria-label={`${m.home_team_name} vs ${m.away_team_name}${isLocked ? " — Neeko+ required" : ""}`}
      onClick={() => {
        if (isLocked) { onLockedClick?.(m); return; }
        onChange(m);
      }}
      className={[
        "flex flex-col items-center justify-center gap-0.5",
        "px-3 py-2.5 rounded-xl border text-center transition-all duration-150",
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
      <span
        className={[
          "text-[11px] font-bold tracking-tight",
          isSelected ? "text-white" : "text-white/60",
        ].join(" ")}
      >
        {abbr(m.home_team_name)} v {abbr(m.away_team_name)}
      </span>
      <span className="flex items-center gap-1">
        {isLocked ? (
          <Lock size={8} className="text-amber-400/70" />
        ) : m.is_free_match ? (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 flex-shrink-0" />
        ) : null}
        <span
          className={[
            "text-[9px] font-medium",
            isLocked
              ? "text-amber-400/60"
              : m.is_free_match
              ? "text-emerald-400/60"
              : "text-white/30",
          ].join(" ")}
        >
          {isLocked ? "Neeko+" : m.is_free_match ? "Free" : "R" + m.week}
        </span>
      </span>
    </button>
  );
}
