import { useRef, useEffect } from "react";
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Scroll selected pill into view on first render / match change
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [selected?.match_id]);

  if (loading) {
    return (
      <div
        className="flex gap-2 overflow-x-auto no-scrollbar pb-1"
        style={{ paddingInline: "clamp(12px,3vw,20px)" }}
        aria-label="Loading games"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex-shrink-0 animate-pulse bg-white/[0.04] rounded-xl"
            style={{ height: 52, width: 80 }}
          />
        ))}
      </div>
    );
  }

  if (!matches.length) return null;

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto no-scrollbar pb-1"
      style={{ paddingInline: "clamp(12px,3vw,20px)" }}
      role="listbox"
      aria-label="Select a game"
    >
      {matches.map((m) => {
        const isSelected = selected?.match_id === m.match_id;
        const isLocked = !hasFullAccess && !m.is_free_match;
        const isFinal = !isLocked && !m.is_free_match;

        return (
          <button
            key={m.match_id}
            ref={isSelected ? selectedRef : undefined}
            role="option"
            aria-selected={isSelected}
            aria-label={`${m.home_team_name} vs ${m.away_team_name}${isLocked ? " — Neeko+ required" : ""}`}
            onClick={() => {
              if (isLocked) { onLockedClick?.(m); return; }
              onChange(m);
            }}
            className={[
              "flex-shrink-0 flex flex-col items-center justify-center gap-0.5",
              "px-3 py-2.5 rounded-xl border text-center transition-all duration-150",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40",
              isSelected
                ? "bg-white/[0.08] border-white/25"
                : isLocked
                ? "bg-white/[0.02] border-white/[0.06] opacity-60"
                : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] hover:border-white/15",
            ].join(" ")}
            style={{ minWidth: 78 }}
          >
            <span className={[
              "text-[11px] font-bold tracking-tight",
              isSelected ? "text-white" : "text-white/60",
            ].join(" ")}>
              {abbr(m.home_team_name)} v {abbr(m.away_team_name)}
            </span>
            <span className="flex items-center gap-1">
              {isLocked ? (
                <Lock size={8} className="text-amber-400/70" />
              ) : m.is_free_match ? (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 flex-shrink-0" />
              ) : null}
              <span className={[
                "text-[9px] font-medium",
                isLocked ? "text-amber-400/60" : m.is_free_match ? "text-emerald-400/60" : "text-white/30",
              ].join(" ")}>
                {isLocked ? "Neeko+" : m.is_free_match ? "Free" : "R" + m.week}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
