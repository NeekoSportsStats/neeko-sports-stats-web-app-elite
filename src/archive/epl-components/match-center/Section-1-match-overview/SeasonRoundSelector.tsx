// src/components/epl/match-center/SeasonRoundSelector.tsx
import React, { useMemo } from "react";

type Season = string;

type Props = {
  season: Season;
  roundNumber: number;
  onChangeSeason: (season: Season) => void;
  onChangeRound: (roundNumber: number) => void;
  isDefaultRound?: boolean;
};

const cx = (...c: Array<string | false | undefined>) =>
  c.filter(Boolean).join(" ");

const GAMEWEEK_LABELS: Array<{ label: string; value: number }> = Array.from(
  { length: 38 },
  (_, i) => ({
    label: `GW${i + 1}`,
    value: i + 1,
  })
);

export default function SeasonRoundSelector({
  season,
  roundNumber,
  onChangeSeason,
  onChangeRound,
  isDefaultRound,
}: Props) {
  const seasons: Season[] = useMemo(() => ["2024–2025", "2025–2026"], []);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
      <div className="flex flex-col gap-4">
        {/* Season selector */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Season</div>
            <div className="text-xs text-white/50">
              Choose a season, then select a gameweek.
            </div>
          </div>

          <div className="inline-flex rounded-xl border border-white/10 bg-black/30 p-1">
            {seasons.map((y) => {
              const active = y === season;
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => onChangeSeason(y)}
                  className={cx(
                    "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap",
                    active
                      ? "bg-amber-400 text-black"
                      : "text-white/70 hover:text-white hover:bg-white/[0.06]"
                  )}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>

        {/* Gameweek selector */}
        <div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-white">Gameweek</div>
            <div className="text-xs text-white/45">
              Gameweek {roundNumber}
            </div>
          </div>

          {isDefaultRound && (
            <div className="mt-2 flex items-center gap-2 text-xs text-amber-300/80">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span>Current gameweek</span>
            </div>
          )}

          <div className="mt-3 -mx-1 px-1 overflow-x-auto">
            <div className="flex gap-2 min-w-max">
              {GAMEWEEK_LABELS.map((r) => {
                const active = r.value === roundNumber;
                return (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() => onChangeRound(r.value)}
                    className={cx(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                      active
                        ? "border-amber-400/40 bg-amber-400/15 text-amber-200"
                        : "border-white/10 bg-white/[0.02] text-white/60 hover:text-white hover:bg-white/[0.06]"
                    )}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 text-[11px] text-white/45">
            Tip: <span className="text-white/70">GW1</span> is the default
            start of season.
          </div>
        </div>
      </div>
    </div>
  );
}
