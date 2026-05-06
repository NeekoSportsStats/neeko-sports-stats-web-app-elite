import { memo } from "react";
import type { StatBoardTeamMatch } from "../teamTypes";

interface Props {
  matches: StatBoardTeamMatch[];
  selected: StatBoardTeamMatch | null;
  loading: boolean;
  onChange: (m: StatBoardTeamMatch) => void;
}

export const TeamMatchSelector = memo(function TeamMatchSelector({
  matches,
  selected,
  loading,
  onChange,
}: Props) {
  if (loading) {
    return (
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="shrink-0 h-9 w-36 rounded-xl bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (matches.length === 0) return null;

  // Group by week
  const byWeek = new Map<number, StatBoardTeamMatch[]>();
  for (const m of matches) {
    const arr = byWeek.get(m.week) ?? [];
    arr.push(m);
    byWeek.set(m.week, arr);
  }
  const weeks = [...byWeek.keys()].sort((a, b) => a - b);

  return (
    <div className="mb-4 space-y-2">
      {weeks.map((week) => {
        const weekMatches = byWeek.get(week)!;
        const label = weekMatches[0]?.round_label ?? `R${week}`;
        return (
          <div key={week}>
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1.5 px-0.5">
              {label}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
              {weekMatches.map((m) => {
                const isSelected = selected?.match_id === m.match_id;
                return (
                  <button
                    key={m.match_id}
                    onClick={() => onChange(m)}
                    className={`
                      shrink-0 snap-start flex items-center gap-1.5
                      rounded-xl border px-3 py-2 text-left
                      transition-all duration-100
                      focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50
                      ${isSelected
                        ? "border-emerald-500/40 bg-emerald-500/10 text-white"
                        : "border-white/10 bg-white/[0.03] text-white/55 hover:border-white/18 hover:bg-white/[0.06] hover:text-white/80"
                      }
                    `}
                    aria-pressed={isSelected}
                  >
                    <span className="text-[12px] font-semibold whitespace-nowrap">
                      {m.home_team_name.split(" ").pop()}
                      <span className="mx-1 text-white/30">v</span>
                      {m.away_team_name.split(" ").pop()}
                    </span>
                    {m.is_locked && (
                      <span className="text-[9px] font-semibold text-[#F5C84C]/60 bg-[#F5C84C]/8 rounded px-1 py-0.5 ml-1 whitespace-nowrap">
                        +
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
});
