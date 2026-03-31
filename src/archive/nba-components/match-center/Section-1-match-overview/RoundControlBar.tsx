import React from "react";
import type { FixtureMatch } from "../data/types";

/* -------------------------------------------------------------------------- */
/*                                  TYPES                                     */
/* -------------------------------------------------------------------------- */

type Props = {
  match: FixtureMatch;
  onClick: () => void;
};

/* -------------------------------------------------------------------------- */
/*                               MATCH CARD                                   */
/* -------------------------------------------------------------------------- */
export default function MatchCard({ match, onClick }: Props) {
  const isFinal = match.status === "final";

  const homeWon =
    isFinal &&
    typeof match.homeScore === "number" &&
    typeof match.awayScore === "number" &&
    match.homeScore > match.awayScore;

  const awayWon =
    isFinal &&
    typeof match.homeScore === "number" &&
    typeof match.awayScore === "number" &&
    match.awayScore > match.homeScore;

  const margin =
    isFinal &&
    typeof match.homeScore === "number" &&
    typeof match.awayScore === "number"
      ? Math.abs(match.homeScore - match.awayScore)
      : null;

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left rounded-xl border
        transition-colors p-5
        focus:outline-none focus:ring-2 focus:ring-amber-400/40

        ${
          isFinal
            ? "border-amber-400/30 bg-white/[0.06] hover:bg-white/[0.08] relative"
            : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
        }
      `}
    >
      {/* FINAL accent bar */}
      {isFinal && (
        <div className="absolute left-0 top-0 h-full w-[2px] bg-amber-400/70 rounded-l-xl" />
      )}

      {/* Top meta row */}
      <div className="flex items-center justify-between text-xs mb-4">
        <div className="text-white/50">
          {match.roundLabel} · {match.dateISO} · {match.timeLocal}
        </div>

        <div
          className={`uppercase tracking-wide font-medium ${
            isFinal ? "text-amber-400" : "text-white/40"
          }`}
        >
          {match.status}
        </div>
      </div>

      {/* Teams + score */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        {/* Home */}
        <div
          className={`
            ${
              homeWon
                ? "text-white drop-shadow-[0_0_6px_rgba(251,191,36,0.35)]"
                : "text-white/40"
            }
          `}
        >
          <div className="font-semibold">{match.homeTeam}</div>
          <div className="text-xs opacity-70">Home</div>
        </div>

        {/* Score / margin */}
        <div className="text-center">
          {isFinal ? (
            <>
              <div className="text-2xl font-bold text-white">
                {match.homeScore} – {match.awayScore}
              </div>

              {margin !== null && (
                <div className="mt-1 inline-block rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                  +{margin}
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-white/40">vs</div>
          )}
        </div>

        {/* Away */}
        <div
          className={`
            text-right
            ${
              awayWon
                ? "text-white drop-shadow-[0_0_6px_rgba(251,191,36,0.35)]"
                : "text-white/40"
            }
          `}
        >
          <div className="font-semibold">{match.awayTeam}</div>
          <div className="text-xs opacity-70">Away</div>
        </div>
      </div>

      {/* Venue */}
      <div className="mt-3 text-xs text-white/40">
        Venue: {match.venue}
      </div>

      {/* FINAL-only details */}
      {isFinal && (
        <div className="mt-4 space-y-3 text-xs text-white/60">
          {/* Quarters with win/loss colouring */}
          {match.quarters && (
            <div className="space-y-1">
              {match.quarters.map((q) => {
                const homeQWon = q.home > q.away;
                const awayQWon = q.away > q.home;

                return (
                  <div
                    key={q.label}
                    className="grid grid-cols-[32px_1fr_1fr] gap-2"
                  >
                    <div className="text-white/40">{q.label}</div>

                    <div
                      className={
                        homeQWon
                          ? "text-emerald-300"
                          : awayQWon
                          ? "text-red-300"
                          : "text-white/60"
                      }
                    >
                      {q.home}
                    </div>

                    <div
                      className={`text-right ${
                        awayQWon
                          ? "text-emerald-300"
                          : homeQWon
                          ? "text-red-300"
                          : "text-white/60"
                      }`}
                    >
                      {q.away}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Crowd */}
          {typeof match.crowd === "number" && (
            <div>Crowd: {match.crowd.toLocaleString()}</div>
          )}

          {/* Top players (phase 1 generic) */}
          {Array.isArray(match.topPlayers) && match.topPlayers.length > 0 && (
            <div>
              <div className="text-white/40 mb-1">Top players</div>
              <div>{match.topPlayers.join(", ")}</div>
            </div>
          )}
        </div>
      )}
    </button>
  );
}
