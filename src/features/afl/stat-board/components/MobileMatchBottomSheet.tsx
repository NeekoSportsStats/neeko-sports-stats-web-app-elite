import { useEffect, useRef } from "react";
import { X, Lock, Check } from "lucide-react";
import { track } from "@/lib/analytics";
import type { StatBoardMatch } from "../types";

interface Props {
  matches: StatBoardMatch[];
  selected: StatBoardMatch | null;
  hasFullAccess: boolean;
  onSelect: (match: StatBoardMatch) => void;
  onClose: () => void;
}

function roundLabel(week: number): string {
  return week === 0 ? "Opening Round" : `Round ${week}`;
}

function roundShort(week: number): string {
  return week === 0 ? "OR" : `R${week}`;
}

function competitionPhase(round: string | null | undefined): string | null {
  if (!round) return null;
  if (/regular.?season/i.test(round)) return null;
  return round;
}

interface RoundGroup {
  roundKey: string;
  roundLabel: string;
  phaseLabel: string | null;
  matches: StatBoardMatch[];
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
      roundKey: key,
      roundLabel: roundLabel(week),
      phaseLabel: competitionPhase(ms[0]?.round ?? null),
      matches: ms,
    });
  }
  return groups;
}

function abbreviateTeam(name: string): string {
  return name.replace(/ (Football Club|F\.?C\.?|AFC)$/i, "").trim();
}

function parseTeams(label: string): { home: string; away: string } | null {
  const m = label.match(/^(.+?)\s+v(?:s\.?)?\s+(.+)$/i);
  if (!m) return null;
  return { home: abbreviateTeam(m[1].trim()), away: abbreviateTeam(m[2].trim()) };
}

export function MobileMatchBottomSheet({ matches, selected, hasFullAccess, onSelect, onClose }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view on open
  useEffect(() => {
    if (!scrollRef.current || !selected) return;
    const el = scrollRef.current.querySelector("[data-selected='true']") as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [selected]);

  // Close on backdrop tap
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const groups = groupByRound(matches);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]"
        aria-hidden
        onClick={onClose}
        style={{ touchAction: "none" }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Select a match"
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-[#111111] border-t border-white/10 shadow-2xl"
        style={{
          maxHeight: "82dvh",
          display: "flex",
          flexDirection: "column",
          paddingBottom: "env(safe-area-inset-bottom)",
          animation: "sheetSlideUp 220ms cubic-bezier(0.32,0.72,0,1) forwards",
        }}
      >
        <style>{`
          @keyframes sheetSlideUp {
            from { transform: translateY(100%); }
            to   { transform: translateY(0); }
          }
        `}</style>

        {/* Handle + header */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          {/* Drag handle */}
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/18" aria-hidden />

          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-white">Choose a match</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="h-7 w-7 flex items-center justify-center rounded-full text-white/35 hover:text-white/70 hover:bg-white/8 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Legend */}
          {!hasFullAccess && (
            <div className="mt-2 flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 shrink-0" aria-hidden />
                <span className="text-[10px] text-white/38">Free Game</span>
              </span>
              <span className="text-white/12">·</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-white/20 shrink-0" aria-hidden />
                <span className="text-[10px] text-white/38">Limited Preview</span>
              </span>
              <span className="text-white/12">·</span>
              <span className="flex items-center gap-1.5">
                <Lock className="h-2.5 w-2.5 text-[#F5C84C]/50 shrink-0" aria-hidden />
                <span className="text-[10px] text-white/38">Neeko+</span>
              </span>
            </div>
          )}
        </div>

        <div className="h-px bg-white/[0.07] shrink-0" />

        {/* Scrollable match list */}
        <div
          ref={scrollRef}
          className="overflow-y-auto overscroll-contain flex-1 py-1.5"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {groups.map((group) => (
            <div key={group.roundKey}>
              {/* Round group header */}
              <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
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
                const isLocked = hasFullAccess ? false : match.is_locked;
                const isFree = hasFullAccess ? true : match.is_free_match;
                const isPreview = !hasFullAccess && !isFree && !isLocked;

                const teams = parseTeams(match.match_label);
                const dateStr = match.game_date
                  ? new Date(match.game_date).toLocaleDateString("en-AU", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })
                  : null;

                return (
                  <button
                    key={match.match_id}
                    role="option"
                    aria-selected={isSelected}
                    data-selected={isSelected ? "true" : undefined}
                    onClick={() => {
                      if (isLocked) track("locked_match_clicked", { source: "locked_match_selector", match_id: match.match_id });
                      onSelect(match);
                      onClose();
                    }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 text-left
                      transition-colors duration-75 focus:outline-none focus-visible:bg-white/8
                      ${isSelected ? "bg-white/[0.09]" : "hover:bg-white/[0.04] active:bg-white/[0.07]"}
                    `}
                  >
                    {/* Status icon */}
                    <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                      {isSelected ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : isFree ? (
                        <span className="h-2 w-2 rounded-full bg-emerald-500/60" aria-hidden />
                      ) : isPreview ? (
                        <span className="h-2 w-2 rounded-full bg-white/22" aria-hidden />
                      ) : (
                        <Lock className="h-3.5 w-3.5 text-[#F5C84C]/45" aria-hidden />
                      )}
                    </span>

                    {/* Match info */}
                    <div className="flex-1 min-w-0">
                      {teams ? (
                        <p className={`text-[13px] font-semibold leading-tight truncate ${
                          isSelected ? "text-white" : "text-white/85"
                        }`}>
                          {teams.home}
                          <span className="mx-1.5 font-normal text-white/30 text-[11px]">vs</span>
                          {teams.away}
                        </p>
                      ) : (
                        <p className={`text-[13px] font-semibold leading-tight truncate ${
                          isSelected ? "text-white" : "text-white/85"
                        }`}>
                          {match.match_label}
                        </p>
                      )}
                      <p className="text-[10px] text-white/32 mt-0.5 leading-none flex items-center gap-1">
                        <span className="font-semibold text-white/40">{roundShort(match.week)}</span>
                        {dateStr && (
                          <>
                            <span className="text-white/15">·</span>
                            <span>{dateStr}</span>
                          </>
                        )}
                      </p>
                    </div>

                    {/* Access badge */}
                    {!hasFullAccess && (
                      <span className="shrink-0">
                        {isFree ? (
                          <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-500/70 bg-emerald-500/8 border border-emerald-500/15 rounded px-1.5 py-0.5 leading-none">
                            Free
                          </span>
                        ) : isPreview ? (
                          <span className="text-[9px] font-bold uppercase tracking-wide text-white/40 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 leading-none">
                            Preview
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold uppercase tracking-wide text-[#F5C84C]/60 bg-[#F5C84C]/8 border border-[#F5C84C]/15 rounded px-1.5 py-0.5 leading-none">
                            Neeko+
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
