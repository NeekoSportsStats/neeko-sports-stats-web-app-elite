import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Lock, Check } from "lucide-react";
import type { StatBoardMatch } from "../types";

interface Props {
  matches: StatBoardMatch[];
  selected: StatBoardMatch | null;
  loading: boolean;
  onChange: (match: StatBoardMatch) => void;
}

export function MatchSelector({ matches, selected, loading, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [dropUp, setDropUp] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [close]);

  function handleOpen() {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 340);
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open || !listRef.current || !selected) return;
    const el = listRef.current.querySelector("[data-selected='true']") as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [open, selected]);

  if (loading) {
    return <div className="mb-6 h-9 w-64 rounded-lg bg-white/5 border border-white/8 animate-pulse" />;
  }

  if (matches.length === 0) return null;

  const groups = groupByRound(matches);

  const selectedIsLocked = selected?.is_locked ?? false;
  const selectedIsFree   = selected ? !selectedIsLocked : false;

  // Trigger: "R9 · Fremantle Dockers vs Hawthorn Hawks"
  const triggerFixture = selected ? formatFixture(selected.match_label) : null;
  const triggerRound   = selected != null ? roundShort(selected.week) : null;
  const triggerLabel   = triggerFixture ?? "Select a match";

  // Phase label (Finals, Preseason, etc.) — only when not regular season
  const phaseLabel = selected ? competitionPhase(selected.round) : null;

  return (
    <div ref={containerRef} className="relative mb-6">
      {/* ── Trigger ─────────────────────────────────────────────────────────── */}
      <button
        ref={triggerRef}
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Match: ${triggerRound ? triggerRound + " · " : ""}${triggerLabel}`}
        className={`
          inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left
          transition-all duration-100 focus:outline-none focus-visible:ring-2
          focus-visible:ring-white/20 max-w-full
          ${open
            ? "bg-white/8 border-white/18 text-white"
            : "bg-white/[0.045] border-white/10 text-white/80 hover:bg-white/7 hover:border-white/16 hover:text-white/95"}
        `}
      >
        {/* Free / locked indicator */}
        <span className="shrink-0 flex items-center justify-center w-3.5">
          {selectedIsFree ? (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" aria-hidden />
          ) : selectedIsLocked ? (
            <Lock className="h-3 w-3 text-[#F5C84C]/55" aria-label="Locked" />
          ) : null}
        </span>

        {/* Round badge */}
        {triggerRound && (
          <span className="shrink-0 text-[11px] font-bold text-white/55 tabular-nums leading-none">
            {triggerRound}
          </span>
        )}

        {/* Separator dot between round and fixture */}
        {triggerRound && triggerFixture && (
          <span className="shrink-0 text-white/20 text-[10px]" aria-hidden>·</span>
        )}

        {/* Fixture label */}
        <span className="text-[13px] font-medium leading-none truncate" style={{ maxWidth: "260px" }}>
          {triggerLabel}
        </span>

        {/* Non-regular-season phase pill */}
        {phaseLabel && (
          <span className="shrink-0 text-[9px] font-semibold text-white/30 bg-white/6 rounded px-1.5 py-0.5 leading-none uppercase tracking-wide whitespace-nowrap">
            {phaseLabel}
          </span>
        )}

        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-white/30 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {/* ── Dropdown panel ──────────────────────────────────────────────────── */}
      {open && (
        <div
          role="listbox"
          aria-label="Select a match"
          style={{
            animation: "matchDropIn 120ms cubic-bezier(0.2,0,0,1) forwards",
            ...(dropUp
              ? { bottom: "calc(100% + 6px)", top: "auto" }
              : { top: "calc(100% + 6px)", bottom: "auto" }),
          }}
          className="absolute left-0 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/12 bg-[#111111] shadow-2xl shadow-black/70 overflow-hidden"
        >
          <style>{`
            @keyframes matchDropIn {
              from { opacity: 0; transform: translateY(-6px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          <div
            ref={listRef}
            className="overflow-y-auto overscroll-contain py-1.5"
            style={{ maxHeight: "min(360px, calc(100vh - 180px))" }}
          >
            {groups.map((group) => (
              <div key={group.roundKey}>
                {/* Round group header */}
                <div className="px-3.5 pt-3 pb-1.5 flex items-center gap-2">
                  <span className="text-[10px] font-bold text-white/28 uppercase tracking-widest shrink-0">
                    {group.roundLabel}
                  </span>
                  {group.phaseLabel && (
                    <span className="text-[9px] font-semibold text-white/20 bg-white/5 rounded px-1.5 py-0.5 leading-none uppercase tracking-wide shrink-0">
                      {group.phaseLabel}
                    </span>
                  )}
                  <div className="flex-1 h-px bg-white/[0.07]" />
                </div>

                {group.matches.map((match) => {
                  const isSelected = selected?.match_id === match.match_id;
                  return (
                    <MatchOption
                      key={match.match_id}
                      match={match}
                      isSelected={isSelected}
                      onClick={() => {
                        onChange(match);
                        close();
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend footer */}
          <div className="px-3.5 py-2 border-t border-white/[0.07] bg-white/[0.015] flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 shrink-0" aria-hidden />
              <span className="text-[10px] text-white/28">Free</span>
            </span>
            <span className="text-white/12">·</span>
            <span className="flex items-center gap-1.5">
              <Lock className="h-2.5 w-2.5 text-[#F5C84C]/40 shrink-0" aria-hidden />
              <span className="text-[10px] text-white/28">Neeko+ required</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Match option row ──────────────────────────────────────────────────────────

function MatchOption({
  match,
  isSelected,
  onClick,
}: {
  match: StatBoardMatch;
  isSelected: boolean;
  onClick: () => void;
}) {
  const dateStr = match.game_date
    ? new Date(match.game_date).toLocaleDateString("en-AU", {
        weekday: "short",
        day:     "numeric",
        month:   "short",
      })
    : null;

  const teams = parseTeams(match.match_label);

  return (
    <button
      role="option"
      aria-selected={isSelected}
      data-selected={isSelected ? "true" : undefined}
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3.5 py-2.5 text-left
        transition-colors duration-75 focus:outline-none
        focus-visible:bg-white/8
        ${isSelected
          ? "bg-white/[0.09]"
          : match.is_locked
          ? "hover:bg-white/[0.035] opacity-80 hover:opacity-100"
          : "hover:bg-white/[0.055]"}
      `}
    >
      {/* Left icon */}
      <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-md">
        {isSelected ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
        ) : match.is_free_match ? (
          <span className="h-2 w-2 rounded-full bg-emerald-500/55" aria-hidden />
        ) : (
          <Lock className="h-3 w-3 text-[#F5C84C]/45" aria-hidden />
        )}
      </span>

      {/* Team matchup + round + date */}
      <div className="flex-1 min-w-0">
        {teams ? (
          <p className={`text-[12.5px] font-semibold leading-tight truncate ${
            isSelected ? "text-white" : match.is_locked ? "text-white/50" : "text-white/80"
          }`}>
            {teams.home}
            <span className="mx-1.5 font-normal text-white/25 text-[11px]">vs</span>
            {teams.away}
          </p>
        ) : (
          <p className={`text-[12.5px] font-semibold leading-tight truncate ${
            isSelected ? "text-white" : match.is_locked ? "text-white/50" : "text-white/80"
          }`}>
            {match.match_label}
          </p>
        )}
        {/* Round + date sub-line */}
        <p className="text-[10px] text-white/28 mt-0.5 leading-none flex items-center gap-1">
          <span className="font-semibold text-white/35">{roundShort(match.week)}</span>
          {dateStr && (
            <>
              <span className="text-white/15">·</span>
              <span>{dateStr}</span>
            </>
          )}
        </p>
      </div>

      {/* Venue */}
      {match.venue && (
        <span className="shrink-0 text-[10px] text-white/22 hidden sm:block max-w-[80px] truncate text-right leading-tight">
          {abbreviateVenue(match.venue)}
        </span>
      )}

      {/* FREE badge */}
      {match.is_free_match && !isSelected && (
        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-emerald-500/70 bg-emerald-500/8 rounded px-1.5 py-0.5 leading-none">
          Free
        </span>
      )}
    </button>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface RoundGroup {
  roundKey:   string;
  roundLabel: string;
  phaseLabel: string | null;
  matches:    StatBoardMatch[];
}

// week is 0-indexed from the DB (week 0 = Round 1)
function roundShort(week: number): string {
  return `R${week + 1}`;
}

function roundFull(week: number): string {
  return `Round ${week + 1}`;
}

// Returns a phase label when the round field indicates something other than regular season.
// "Regular Season" → null (no badge needed)
// "Finals" / "Grand Final" / "Preseason" / etc. → returned as-is
function competitionPhase(round: string | null | undefined): string | null {
  if (!round) return null;
  if (/regular.?season/i.test(round)) return null;
  return round;
}

function groupByRound(matches: StatBoardMatch[]): RoundGroup[] {
  const map = new Map<string, StatBoardMatch[]>();
  for (const m of matches) {
    const key = String(m.week ?? "?");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  const groups: RoundGroup[] = [];
  for (const [key, ms] of map) {
    const week = ms[0]?.week ?? parseInt(key, 10);
    groups.push({
      roundKey:   key,
      roundLabel: roundFull(week),
      phaseLabel: competitionPhase(ms[0]?.round ?? null),
      matches:    ms,
    });
  }
  return groups;
}

// Formats fixture label without "Football Club" / "FC" suffixes.
function formatFixture(matchLabel: string): string {
  const teams = parseTeams(matchLabel);
  if (teams) return `${teams.home} vs ${teams.away}`;
  return matchLabel;
}

function parseTeams(label: string): { home: string; away: string } | null {
  const m = label.match(/^(.+?)\s+v(?:s\.?)?\s+(.+)$/i);
  if (!m) return null;
  return {
    home: abbreviateTeam(m[1].trim()),
    away: abbreviateTeam(m[2].trim()),
  };
}

function abbreviateTeam(name: string): string {
  if (!name) return name;
  return name.replace(/ (Football Club|F\.?C\.?|AFC)$/i, "").trim();
}

function abbreviateVenue(venue: string): string {
  return venue
    .replace(/ Stadium$/i, "")
    .replace(/ Ground$/i,  "")
    .replace(/ Oval$/i,    "")
    .replace(/ Park$/i,    "")
    .trim();
}
