import React from "react";

export type LadderRow = {
  pos: number;
  team: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  percentage: number;
  delta?: number; // optional movement
};

type Props = {
  rows: LadderRow[];
  highlightTeams?: string[]; // [home, away]
};

const cx = (...c: Array<string | false | undefined>) =>
  c.filter(Boolean).join(" ");

function LadderSnapshot({ rows, highlightTeams = [] }: Props) {
  const homeTeam = highlightTeams[0];
  const awayTeam = highlightTeams[1];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-white">
          Ladder Snapshot
        </div>
        <div className="text-xs text-white/45">Top 16</div>
      </div>

      {/* Column labels */}
      <div className="sticky top-0 z-10 bg-[#0b0b0b]">
        <div className="grid grid-cols-[40px_1fr_32px_32px_32px_56px] gap-2 px-2 py-1 text-[10px] text-white/40">
          <div>#</div>
          <div>Team</div>
          <div className="text-center">W</div>
          <div className="text-center">L</div>
          <div className="text-center">D</div>
          <div className="text-right hidden sm:block">%</div>
          <div className="text-right sm:hidden">W-L</div>
        </div>
      </div>

      <div className="space-y-1.5 mt-1">
        {rows.map((r, i) => {
          const isHome = r.team === homeTeam;
          const isAway = r.team === awayTeam;

          return (
            <React.Fragment key={r.team}>
              {/* Finals cutoff */}
              {i === 8 && (
                <div className="my-1 border-t border-white/10 px-2 text-[10px] text-white/30">
                  Finals Cutoff
                </div>
              )}

              <div
                className={cx(
                  "grid grid-cols-[40px_1fr_32px_32px_32px_56px] items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors",
                  isHome && "bg-amber-400/15 text-amber-200",
                  isAway && "bg-cyan-400/10 text-cyan-200",
                  !isHome &&
                    !isAway &&
                    "text-white/70 hover:bg-white/[0.04]"
                )}
              >
                {/* Position + delta */}
                <div className="flex items-center gap-1 text-white/50">
                  {r.pos}
                  {r.delta !== undefined && (
                    <span
                      className={cx(
                        "text-[10px]",
                        r.delta > 0 && "text-emerald-400",
                        r.delta < 0 && "text-rose-400",
                        r.delta === 0 && "text-white/30"
                      )}
                    >
                      {r.delta > 0
                        ? `↑${r.delta}`
                        : r.delta < 0
                        ? `↓${Math.abs(r.delta)}`
                        : "—"}
                    </span>
                  )}
                </div>

                <div className="truncate">{r.team}</div>
                <div className="text-center">{r.wins}</div>
                <div className="text-center">{r.losses}</div>
                <div className="text-center">{r.draws}</div>

                {/* % / W-L */}
                <div className="text-right hidden sm:block">
                  {r.percentage.toFixed(1)}
                </div>
                <div className="text-right sm:hidden text-white/50">
                  {r.wins}-{r.losses}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div className="mt-3 text-[11px] text-white/40">
        Ladder shown for context only.
      </div>
    </div>
  );
}

export default LadderSnapshot;
export { LadderSnapshot };
