import { useState, useRef, useEffect, useCallback, memo } from "react";
import { ChevronDown, Lock, Check } from "lucide-react";
import type { StatBoardTeamMatch } from "../teamTypes";

interface Props {
  matches: StatBoardTeamMatch[];
  selected: StatBoardTeamMatch | null;
  loading: boolean;
  onChange: (m: StatBoardTeamMatch) => void;
  hasFullAccess?: boolean;
}

export const TeamMatchSelector = memo(function TeamMatchSelector({
  matches,
  selected,
  loading,
  onChange,
  hasFullAccess = false,
}: Props) {
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
      setDropUp(window.innerHeight - rect.bottom < 340);
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open || !listRef.current || !selected) return;
    const el = listRef.current.querySelector("[data-selected='true']") as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [open, selected]);

  if (loading) {
    return <div className="mb-4 h-10 w-full sm:w-72 rounded-xl bg-white/5 border border-white/8 animate-pulse" />;
  }
  if (matches.length === 0) return null;

  const groups = groupByWeek(matches);
  const isLocked = hasFullAccess ? false : (selected?.is_locked ?? false);
  const isFree = selected ? !isLocked : false;

  const triggerLabel = selected ? formatMatchLabel(selected.match_label) : "Select a match";
  const triggerRound = selected != null ? roundShort(selected.week) : null;

  return (
    <div ref={containerRef} className="relative mb-4">
      <button
        ref={triggerRef}
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`
          flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left
          w-full sm:w-auto max-w-full min-w-0
          transition-all duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20
          ${open
            ? "bg-white/8 border-white/18 text-white"
            : "bg-white/[0.045] border-white/10 text-white/80 hover:bg-white/7 hover:border-white/16 hover:text-white/95"}
        `}
      >
        <span className="shrink-0 flex items-center justify-center w-3.5">
          {isFree ? (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" aria-hidden />
          ) : isLocked ? (
            <Lock className="h-3 w-3 text-[#F5C84C]/55" aria-label="Locked" />
          ) : null}
        </span>
        {triggerRound && (
          <span className="shrink-0 text-[11px] font-bold text-white/55 tabular-nums leading-none">
            {triggerRound}
          </span>
        )}
        {triggerRound && (
          <span className="shrink-0 text-white/20 text-[10px]" aria-hidden>·</span>
        )}
        <span className="text-[13px] font-medium leading-none truncate flex-1 min-w-0">
          {triggerLabel}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-white/30 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select a match"
          style={{
            animation: "tmDropIn 120ms cubic-bezier(0.2,0,0,1) forwards",
            ...(dropUp
              ? { bottom: "calc(100% + 6px)", top: "auto" }
              : { top: "calc(100% + 6px)", bottom: "auto" }),
          }}
          className="absolute left-0 z-50 w-full sm:w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/12 bg-[#111111] shadow-2xl shadow-black/70 overflow-hidden"
        >
          <style>{`
            @keyframes tmDropIn {
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
              <div key={group.key}>
                <div className="px-3.5 pt-3 pb-1.5 flex items-center gap-2">
                  <span className="text-[10px] font-bold text-white/28 uppercase tracking-widest shrink-0">
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-white/[0.07]" />
                </div>
                {group.matches.map((m) => {
                  const isSel = selected?.match_id === m.match_id;
                  return (
                    <MatchOption
                      key={m.match_id}
                      match={m}
                      isSelected={isSel}
                      hasFullAccess={hasFullAccess}
                      onClick={() => { onChange(m); close(); }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          {!hasFullAccess && (
            <div className="px-3.5 py-2 border-t border-white/[0.07] bg-white/[0.015] flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 shrink-0" aria-hidden />
                <span className="text-[10px] text-white/28">First 2 matches free</span>
              </span>
              <span className="text-white/12">·</span>
              <span className="flex items-center gap-1.5">
                <Lock className="h-2.5 w-2.5 text-[#F5C84C]/40 shrink-0" aria-hidden />
                <span className="text-[10px] text-white/28">Neeko+ required</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ── Match option row ──────────────────────────────────────────────────────────

function MatchOption({
  match,
  isSelected,
  hasFullAccess,
  onClick,
}: {
  match: StatBoardTeamMatch;
  isSelected: boolean;
  hasFullAccess: boolean;
  onClick: () => void;
}) {
  const isLocked = hasFullAccess ? false : match.is_locked;
  const isFree   = hasFullAccess ? true  : match.is_free_match;

  const dateStr = match.game_date
    ? new Date(match.game_date).toLocaleDateString("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "short",
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
        transition-colors duration-75 focus:outline-none focus-visible:bg-white/8
        ${isSelected
          ? "bg-white/[0.09]"
          : isLocked
          ? "hover:bg-white/[0.035] opacity-80 hover:opacity-100"
          : "hover:bg-white/[0.055]"}
      `}
    >
      <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-md">
        {isSelected ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
        ) : isFree ? (
          <span className="h-2 w-2 rounded-full bg-emerald-500/55" aria-hidden />
        ) : (
          <Lock className="h-3 w-3 text-[#F5C84C]/45" aria-hidden />
        )}
      </span>

      <div className="flex-1 min-w-0">
        {teams ? (
          <p className={`text-[12.5px] font-semibold leading-tight truncate ${
            isSelected ? "text-white" : isLocked ? "text-white/50" : "text-white/80"
          }`}>
            {teams.home}
            <span className="mx-1.5 font-normal text-white/25 text-[11px]">vs</span>
            {teams.away}
          </p>
        ) : (
          <p className={`text-[12.5px] font-semibold leading-tight truncate ${
            isSelected ? "text-white" : isLocked ? "text-white/50" : "text-white/80"
          }`}>
            {match.match_label}
          </p>
        )}
        <p className="text-[10px] text-white/28 mt-0.5 leading-none flex items-center gap-1 flex-wrap">
          <span className="font-semibold text-white/35">{roundShort(match.week)}</span>
          {dateStr && (
            <>
              <span className="text-white/15">·</span>
              <span>{dateStr}</span>
            </>
          )}
          {match.venue && (
            <span className="hidden sm:contents">
              <span className="text-white/15">·</span>
              <span>{abbreviateVenue(match.venue)}</span>
            </span>
          )}
        </p>
      </div>

      {isFree && !isSelected && !hasFullAccess && (
        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-emerald-500/70 bg-emerald-500/8 rounded px-1.5 py-0.5 leading-none">
          Free
        </span>
      )}
    </button>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface WeekGroup {
  key: string;
  label: string;
  matches: StatBoardTeamMatch[];
}

function roundShort(week: number): string {
  return week === 0 ? "OR" : `R${week}`;
}

function groupByWeek(matches: StatBoardTeamMatch[]): WeekGroup[] {
  const map = new Map<number, StatBoardTeamMatch[]>();
  for (const m of matches) {
    const w = m.week ?? 0;
    if (!map.has(w)) map.set(w, []);
    map.get(w)!.push(m);
  }
  const groups: WeekGroup[] = [];
  for (const [week, ms] of map) {
    groups.push({
      key: String(week),
      label: week === 0 ? "Opening Round" : `Round ${week}`,
      matches: ms,
    });
  }
  return groups;
}

function formatMatchLabel(label: string): string {
  const teams = parseTeams(label);
  if (teams) return `${teams.home} vs ${teams.away}`;
  return label;
}

function parseTeams(label: string): { home: string; away: string } | null {
  const m = label.match(/^(.+?)\s+v(?:s\.?)?\s+(.+)$/i);
  if (!m) return null;
  return { home: abbreviateTeam(m[1].trim()), away: abbreviateTeam(m[2].trim()) };
}

function abbreviateTeam(name: string): string {
  return name.replace(/ (Football Club|F\.?C\.?|AFC)$/i, "").trim();
}

function abbreviateVenue(venue: string): string {
  return venue
    .replace(/ Stadium$/i, "")
    .replace(/ Ground$/i, "")
    .replace(/ Oval$/i, "")
    .replace(/ Park$/i, "")
    .trim();
}
