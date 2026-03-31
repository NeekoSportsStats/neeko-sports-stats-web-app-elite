// src/components/epl/match-center/MatchCard.tsx
import React, { useMemo } from "react";
import type { FixtureMatch } from "../data/types";

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function goalsBehinds(points: number) {
  const goals = Math.floor(points / 6);
  const behinds = points - goals * 6;
  return `${goals}.${behinds} (${points})`;
}

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(" ");

function dayLabel(dateISO: string) {
  return new Date(dateISO).toLocaleDateString("en-AU", { weekday: "long" });
}

function formPill(v: "W" | "L", i: number) {
  const isW = v === "W";
  return (
    <span
      key={i}
      className={cx(
        "inline-flex items-center justify-center h-5 w-5 rounded-md text-[10px] font-semibold tabular-nums",
        isW ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"
      )}
    >
      {v}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* PROPS                                                                      */
/* -------------------------------------------------------------------------- */

type Props = {
  match: FixtureMatch;
  onClick: () => void;
};

export default function MatchCard({ match, onClick }: Props) {
  const isFinal = match.status === "final";
  const isUpcoming = match.status === "upcoming";

  const homeScore = match.homeScore ?? null;
  const awayScore = match.awayScore ?? null;

  const margin =
    isFinal && homeScore !== null && awayScore !== null ? Math.abs(homeScore - awayScore) : null;

  const homeWon = isFinal && homeScore !== null && awayScore !== null && homeScore > awayScore;
  const awayWon = isFinal && homeScore !== null && awayScore !== null && awayScore > homeScore;

  const bestHomeQ = useMemo(() => {
    if (!match.quarters?.length) return null;
    return match.quarters.reduce((a, b) => (b.home > a.home ? b : a));
  }, [match.quarters]);

  const bestAwayQ = useMemo(() => {
    if (!match.quarters?.length) return null;
    return match.quarters.reduce((a, b) => (b.away > a.away ? b : a));
  }, [match.quarters]);

  const preview = match.preview;

  return (
    <button
      onClick={onClick}
      className={cx(
        "relative w-full text-left rounded-xl border p-5 transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-amber-400/40",
        isFinal
          ? "border-amber-400/30 bg-gradient-to-b from-white/[0.06] to-white/[0.04] hover:bg-white/[0.08]"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
      )}
    >
      {/* Accent strip for FINAL */}
      {isFinal && <div className="absolute left-0 top-0 h-full w-[3px] bg-amber-400 rounded-l-xl" />}

      {/* META */}
      <div className="flex justify-between items-center text-xs mb-4">
        <div className="text-white/50">
          {match.roundLabel} · {dayLabel(match.dateISO)} · {match.dateISO} · {match.timeLocal}
        </div>

        <div
          className={cx(
            "px-2 py-[2px] rounded-full border text-[10px] uppercase tracking-wide",
            isFinal
              ? "border-amber-400/20 bg-amber-400/10 text-amber-300/80"
              : "border-white/10 bg-white/[0.04] text-white/60"
          )}
        >
          {isFinal ? "FINAL" : "UPCOMING"}
        </div>
      </div>

      {/* TEAMS + SCORE */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className={cx(homeWon && "font-semibold text-white")}>{match.homeTeam}</div>

        <div className="text-center">
          <div className="text-[22px] font-bold tracking-tight tabular-nums">
            {isFinal ? (
              <>
                {homeScore} – {awayScore}
              </>
            ) : (
              <span className="text-white/60">—</span>
            )}
          </div>

          {isFinal && margin !== null && (
            <div className="mt-0.5 text-[11px] text-white/45">
              {homeWon ? `${match.homeTeam} by ${margin}` : `${match.awayTeam} by ${margin}`}
            </div>
          )}

          {!isFinal && <div className="mt-0.5 text-[11px] text-white/45">Starts {match.timeLocal}</div>}
        </div>

        <div className={cx("text-right", awayWon && "font-semibold text-white")}>{match.awayTeam}</div>
      </div>

      {/* VENUE */}
      <div className="mt-2 text-xs text-white/40">{match.venue}</div>

      {/* FINAL: QUARTERS + TOP FANTASY */}
      {isFinal && match.quarters?.length ? (
        <div className="mt-4 rounded-lg bg-black/20 p-3 text-xs">
          {match.quarters.map((q) => {
            const homeBetter = q.home > q.away;
            const awayBetter = q.away > q.home;

            return (
              <div
                key={q.label}
                className="grid grid-cols-[36px_1fr_1fr] items-center tabular-nums py-0.5"
              >
                <div className="text-white/40">{q.label}</div>

                <div className={cx(homeBetter && "text-emerald-300 font-medium", awayBetter && "text-rose-300/80")}>
                  {goalsBehinds(q.home)}
                  {q.label === bestHomeQ?.label && (
                    <span className="ml-2 inline-flex items-center rounded bg-emerald-400/15 px-1.5 py-0.5 text-[9px] text-emerald-300">
                      Best
                    </span>
                  )}
                </div>

                <div
                  className={cx(
                    "text-right",
                    awayBetter && "text-emerald-300 font-medium",
                    homeBetter && "text-rose-300/80"
                  )}
                >
                  {/* away best badge MUST be on the left */}
                  {q.label === bestAwayQ?.label && (
                    <span className="mr-2 inline-flex items-center rounded bg-emerald-400/15 px-1.5 py-0.5 text-[9px] text-emerald-300">
                      Best
                    </span>
                  )}
                  {goalsBehinds(q.away)}
                </div>
              </div>
            );
          })}

          {/* TOP FANTASY (card-only teaser) */}
          {match.topFantasy?.length ? (
            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="text-[11px] text-white/45 uppercase tracking-wide">Top Fantasy</div>
              <div className="mt-1 space-y-1 text-[11px] text-white/70">
                {match.topFantasy.map((t) => (
                  <div key={t.team}>
                    <span className="text-white/50 mr-1">{t.team}:</span>
                    {t.players.map((p) => `${p.name} ${p.fantasy}`).join(" · ")}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* CROWD */}
          {match.crowd ? (
            <div className="mt-3 text-[11px] text-white/45">Crowd: {match.crowd.toLocaleString()}</div>
          ) : null}
        </div>
      ) : null}

      {/* UPCOMING: preview strip (NO squads on card) */}
      {isUpcoming && preview ? (
        <div className="mt-4 rounded-lg bg-black/20 p-3">
          <div className="flex items-center justify-between text-[11px] text-white/70">
            <div>
              Win prob:{" "}
              <span className="text-white/80 tabular-nums">
                {preview.homeWinProb}%–{preview.awayWinProb}%
              </span>
            </div>
            {preview.ladderPos ? (
              <div className="text-white/50 tabular-nums">
                Ladder: #{preview.ladderPos.home} vs #{preview.ladderPos.away}
              </div>
            ) : null}
          </div>

          {preview.last5 ? (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] text-white/40 uppercase tracking-wide">{match.homeTeam} last 5</div>
                <div className="mt-1 flex gap-1">{preview.last5.home.map(formPill)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-white/40 uppercase tracking-wide">{match.awayTeam} last 5</div>
                <div className="mt-1 flex gap-1 justify-end">{preview.last5.away.map(formPill)}</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}
