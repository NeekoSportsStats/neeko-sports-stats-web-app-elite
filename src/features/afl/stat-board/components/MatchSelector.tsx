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
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
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

  // Scroll selected item into view when dropdown opens
  useEffect(() => {
    if (!open || !listRef.current || !selected) return;
    const el = listRef.current.querySelector("[data-selected='true']") as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [open, selected]);

  if (loading) {
    return <div className="mb-6 h-9 w-72 rounded-lg bg-white/5 border border-white/8 animate-pulse" />;
  }

  if (matches.length === 0) return null;

  // Group matches by round label
  const groups = groupByRound(matches);

  const triggerLabel = selected
    ? formatMatchLabel(selected)
    : "Select a match";

  return (
    <div ref={ref} className="relative mb-6 inline-block">
      {/* Trigger — compact, not full-width */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
          open
            ? "bg-white/8 border-white/18 text-white"
            : "bg-white/[0.04] border-white/10 text-white/75 hover:bg-white/7 hover:border-white/16 hover:text-white/90"
        }`}
      >
        <span className="text-[13px] font-medium leading-none truncate max-w-[260px]">
          {triggerLabel}
        </span>
        {selected?.is_locked && (
          <Lock className="h-3 w-3 shrink-0 text-[#F5C84C]/60" aria-label="Locked match" />
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-white/30 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="listbox"
          aria-label="Match list"
          className="absolute left-0 top-full z-50 mt-1.5 w-[320px] rounded-xl border border-white/12 bg-[#111111] shadow-xl shadow-black/60 overflow-hidden"
          style={{ animation: "dropIn 120ms cubic-bezier(0.2,0,0,1) forwards" }}
        >
          <style>{`
            @keyframes dropIn {
              from { opacity: 0; transform: translateY(-4px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          {/* Scrollable list */}
          <div ref={listRef} className="max-h-64 overflow-y-auto overscroll-contain py-1">
            {groups.map((group) => (
              <div key={group.round}>
                {/* Round group header */}
                <div className="px-3 pt-2.5 pb-1 flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                    {group.round}
                  </span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>

                {/* Match items */}
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

          {/* Footer hint */}
          <div className="px-3 py-2 border-t border-white/[0.06] flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 shrink-0" aria-hidden />
            <span className="text-[10px] text-white/25">Free match</span>
            <span className="ml-2 text-white/12">·</span>
            <Lock className="h-2.5 w-2.5 text-[#F5C84C]/40 shrink-0" aria-hidden />
            <span className="text-[10px] text-white/25">Neeko+ required</span>
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
  const timeStr = match.game_date
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
      data-selected={isSelected}
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors focus:outline-none focus-visible:bg-white/8 ${
        isSelected
          ? "bg-white/[0.07]"
          : match.is_locked
          ? "hover:bg-white/[0.04]"
          : "hover:bg-white/[0.05]"
      }`}
    >
      {/* Selected check / free dot / lock */}
      <span className="shrink-0 w-4 flex items-center justify-center">
        {isSelected ? (
          <Check className="h-3 w-3 text-emerald-400" aria-hidden />
        ) : match.is_free_match ? (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/60" aria-hidden />
        ) : (
          <Lock className="h-3 w-3 text-[#F5C84C]/40" aria-hidden />
        )}
      </span>

      {/* Match info */}
      <div className="flex-1 min-w-0">
        {teams ? (
          <p className={`text-[12px] font-medium leading-tight truncate ${
            match.is_locked && !isSelected ? "text-white/45" : "text-white/80"
          }`}>
            {teams.home}
            <span className="mx-1 text-white/25 font-normal text-[10px]">vs</span>
            {teams.away}
          </p>
        ) : (
          <p className={`text-[12px] font-medium leading-tight truncate ${
            match.is_locked && !isSelected ? "text-white/45" : "text-white/80"
          }`}>
            {match.match_label}
          </p>
        )}
        {timeStr && (
          <p className="text-[10px] text-white/28 mt-0.5 leading-none">{timeStr}</p>
        )}
      </div>

      {/* Venue — compact */}
      {match.venue && (
        <span className="shrink-0 text-[10px] text-white/22 hidden sm:block max-w-[72px] truncate text-right">
          {abbreviateVenue(match.venue)}
        </span>
      )}
    </button>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface RoundGroup {
  round: string;
  matches: StatBoardMatch[];
}

function groupByRound(matches: StatBoardMatch[]): RoundGroup[] {
  const map = new Map<string, StatBoardMatch[]>();
  for (const m of matches) {
    const key = m.round ?? "Unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return Array.from(map.entries()).map(([round, ms]) => ({ round, matches: ms }));
}

function formatMatchLabel(match: StatBoardMatch): string {
  const teams = parseTeams(match.match_label);
  if (teams) return `${teams.home} vs ${teams.away}`;
  return match.match_label;
}

function parseTeams(label: string): { home: string; away: string } | null {
  const vsMatch = label.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  if (!vsMatch) return null;
  return {
    home: abbreviateTeam(vsMatch[1].trim()),
    away: abbreviateTeam(vsMatch[2].trim()),
  };
}

function abbreviateTeam(name: string): string {
  if (!name) return name;
  return name
    .replace(/ (Football Club|F\.?C\.?|AFC)$/i, "")
    .trim();
}

function abbreviateVenue(venue: string): string {
  return venue
    .replace(/ Stadium$/i, "")
    .replace(/ Ground$/i, "")
    .replace(/ Oval$/i, "")
    .replace(/ Park$/i, "")
    .trim();
}
