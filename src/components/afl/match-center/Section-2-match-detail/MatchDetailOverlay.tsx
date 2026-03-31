// src/components/afl/match-center/MatchDetailOverlay.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { FixtureMatch, TeamStatLine } from "../data/types";
import type { StatConfig } from "@/lib/stats/types";
import { X, ChevronDown } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(" ");

function quarterDelta(q: { home: number; away: number }) {
  return q.home - q.away;
}

function statKey(label: string) {
  return label.trim().toLowerCase().replace(/\s+/g, "-");
}

/** For stats where lower is better (e.g. Turnovers) */
function isHigherBetter(s: TeamStatLine) {
  return s.higherIsBetter !== false;
}

function fmtDelta(d: number) {
  const sign = d > 0 ? "↑" : d < 0 ? "↓" : "—";
  return d === 0 ? "—" : `${sign}${Math.abs(d)}`;
}

function safeNum(n: any) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

/* -------------------------------------------------------------------------- */
/* PROPS                                                                      */
/* -------------------------------------------------------------------------- */

type Props = {
  match: FixtureMatch;
  onClose: () => void;
  statConfig: StatConfig;
};

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function MatchDetailOverlay({ match, onClose, statConfig }: Props) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevWidth = document.body.style.width;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.width = prevWidth;
    };
  }, []);

  const isFinal = match.status === "final";

  const margin =
    isFinal && match.homeScore !== undefined && match.awayScore !== undefined
      ? match.homeScore - match.awayScore
      : 0;

  /* --------------------------- POST GAME LOGIC --------------------------- */

  const quarterResults =
    isFinal && match.quarters
      ? match.quarters.map((q) => ({
          label: q.label,
          winner:
            q.home > q.away ? match.homeTeam : q.away > q.home ? match.awayTeam : "Draw",
          delta: Math.abs(quarterDelta(q)),
        }))
      : [];

  const decisiveQuarter =
    quarterResults.length > 0 ? quarterResults.reduce((a, b) => (b.delta > a.delta ? b : a)) : null;

  /* ---------------------------------------------------------------------- */

  // FINAL: team performance table model
  const perfRows = useMemo(() => {
    if (!isFinal || !match.teamStats?.length) return [];

    const home = match.teamStats.find((t) => t.team === match.homeTeam);
    const away = match.teamStats.find((t) => t.team === match.awayTeam);
    if (!home || !away) return [];

    const homeMap = new Map(home.stats.map((s) => [statKey(s.label), s]));
    const awayMap = new Map(away.stats.map((s) => [statKey(s.label), s]));

    const labels = Array.from(
      new Set([...home.stats.map((s) => s.label), ...away.stats.map((s) => s.label)])
    );

    return labels.map((label) => {
      const hk = statKey(label);
      const hs = homeMap.get(hk);
      const as = awayMap.get(hk);
      const hVal = safeNum(hs?.value);
      const aVal = safeNum(as?.value);

      const leagueAvg = hs?.leagueAvg ?? as?.leagueAvg;
      const higherBetter = isHigherBetter(hs ?? as ?? { label, value: 0 });

      // determine “winner” (accounting for lower-better)
      let homeBetter = false;
      let awayBetter = false;
      if (higherBetter) {
        homeBetter = hVal > aVal;
        awayBetter = aVal > hVal;
      } else {
        homeBetter = hVal < aVal;
        awayBetter = aVal < hVal;
      }

      const delta = higherBetter ? hVal - aVal : aVal - hVal; // positive = home “wins” the stat

      return {
        label,
        home: hVal,
        away: aVal,
        leagueAvg,
        homeBetter,
        awayBetter,
        higherBetter,
        delta,
      };
    });
  }, [isFinal, match.teamStats, match.homeTeam, match.awayTeam]);

  // Collapsible team lists for UPCOMING (overlay only)
  const [showLists, setShowLists] = useState(true);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ overflow: "hidden" }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <aside
        className="relative h-full w-full max-w-[460px] bg-[#0b0b0b] border-l border-white/10 p-5 overflow-y-auto"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y" }}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="text-xs text-white/40">
              {match.roundLabel} ·{" "}
              {new Date(match.dateISO).toLocaleDateString("en-AU", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}{" "}
              · {match.timeLocal}
            </div>
            <div className="mt-1 text-lg font-semibold">
              {match.homeTeam} <span className="text-white/40 mx-1">vs</span> {match.awayTeam}
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-white/50 hover:text-white hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>

        {/* =========================== FINAL MATCH =========================== */}
        {isFinal && (
          <div className="space-y-6">
            {/* RESULT SUMMARY */}
            <section>
              <div className="text-sm font-semibold mb-1">Final Result</div>
              <div className="text-white/80">
                {margin > 0
                  ? `${match.homeTeam} def ${match.awayTeam} by ${margin}`
                  : `${match.awayTeam} def ${match.homeTeam} by ${Math.abs(margin)}`}
              </div>
              <div className="mt-1 text-white/50 text-sm">
                Final score: {match.homeScore} – {match.awayScore}
              </div>
            </section>

            {/* GAME FLOW */}
            {quarterResults.length > 0 && (
              <section>
                <div className="text-sm font-semibold mb-2">Game Flow</div>
                <div className="text-sm text-white/70">
                  {match.homeTeam} won {quarterResults.filter((q) => q.winner === match.homeTeam).length} quarters ·{" "}
                  {match.awayTeam} won {quarterResults.filter((q) => q.winner === match.awayTeam).length}
                </div>
              </section>
            )}

            {/* KEY SWING */}
            {decisiveQuarter && decisiveQuarter.delta >= 6 && (
              <section>
                <div className="text-sm font-semibold mb-1">Key Swing</div>
                <div className="text-sm text-white/70">
                  {decisiveQuarter.winner} +{decisiveQuarter.delta} in {decisiveQuarter.label}
                </div>
              </section>
            )}

            {/* TEAM PERFORMANCE (bars + ghost line + deltas + winner highlight) */}
            {perfRows.length > 0 && (
              <section>
                <div className="text-sm font-semibold mb-3">Team Performance</div>

                <div className="space-y-3">
                  {perfRows.map((r) => {
                    const max = Math.max(r.home, r.away, r.leagueAvg ?? 0, 1);
                    const homePct = (r.home / max) * 100;
                    const awayPct = (r.away / max) * 100;
                    const avgPct = r.leagueAvg !== undefined ? (r.leagueAvg / max) * 100 : null;

                    // display delta as “home vs away” but reflect lower-better too
                    const rawDelta = r.home - r.away;
                    const deltaDisplay = r.higherBetter ? rawDelta : -rawDelta;

                    return (
                      <div key={r.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-center justify-between text-[11px] text-white/55 mb-2">
                          <div className="uppercase tracking-wide">{r.label}</div>
                          <div className="tabular-nums">{fmtDelta(deltaDisplay)}</div>
                        </div>

                        <div className="grid grid-cols-[56px_1fr_56px] items-center gap-3">
                          <div className={cx("text-sm tabular-nums", r.homeBetter && "text-emerald-200 font-semibold")}>
                            {r.home}
                          </div>

                          <div className="relative h-2 rounded-full bg-white/10 overflow-hidden">
                            {/* league avg ghost line */}
                            {avgPct !== null && (
                              <div
                                className="absolute top-0 h-full w-[2px] bg-white/25"
                                style={{ left: `${avgPct}%` }}
                              />
                            )}

                            {/* home fill */}
                            <div
                              className={cx(
                                "absolute left-0 top-0 h-full",
                                r.homeBetter ? "bg-emerald-400/80" : "bg-emerald-400/35"
                              )}
                              style={{ width: `${homePct}%` }}
                            />
                            {/* away fill (overlay from right to show split) */}
                            <div
                              className={cx(
                                "absolute right-0 top-0 h-full",
                                r.awayBetter ? "bg-amber-400/70" : "bg-amber-400/30"
                              )}
                              style={{ width: `${awayPct}%` }}
                            />
                          </div>

                          <div
                            className={cx(
                              "text-sm tabular-nums text-right",
                              r.awayBetter && "text-amber-200 font-semibold"
                            )}
                          >
                            {r.away}
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[11px] text-white/40">
                          <div>{match.homeTeam}</div>
                          <div>{match.awayTeam}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* TOP FANTASY (small) */}
            {match.topFantasy?.length ? (
              <section>
                <div className="text-sm font-semibold mb-2">Top {statConfig.labels.fantasy}</div>
                <div className="space-y-3 text-sm">
                  {match.topFantasy.map((team) => (
                    <div key={team.team}>
                      <div className="text-white/60 mb-1">{team.team}</div>
                      <div className="text-white/80 leading-relaxed">
                        {team.players.map((p) => `${p.name} ${p.fantasy}`).join(" · ")}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* CONTEXT */}
            <section>
              <div className="text-sm font-semibold mb-2">Context</div>
              <div className="text-sm text-white/60 space-y-1">
                <div>Venue: {match.venue}</div>
                {match.crowd && <div>Crowd: {match.crowd.toLocaleString()}</div>}
                <div>Round: {match.roundLabel}</div>
              </div>
            </section>
          </div>
        )}

        {/* =========================== UPCOMING MATCH ========================= */}
        {!isFinal && (
          <div className="space-y-6">
            <section>
              <div className="text-sm font-semibold mb-1">Match Preview</div>
              <div className="text-sm text-white/60">
                This is a pre-game preview — results and team stats will appear after the match.
              </div>
            </section>

            {/* WIN PROB + REASONS */}
            {match.preview && (
              <section>
                <div className="text-sm font-semibold mb-2">Win Probability</div>

                <div className="flex justify-between text-sm text-white/70 mb-2">
                  <div>
                    {match.homeTeam}{" "}
                    <span className="text-white tabular-nums">{match.preview.homeWinProb}%</span>
                  </div>
                  <div className="text-right">
                    {match.awayTeam}{" "}
                    <span className="text-white tabular-nums">{match.preview.awayWinProb}%</span>
                  </div>
                </div>

                <div className="relative h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="absolute left-0 top-0 h-full bg-amber-400"
                    style={{ width: `${match.preview.homeWinProb}%` }}
                  />
                </div>

                <div className="mt-3 space-y-1 text-sm text-white/65">
                  <div>{match.preview.reasons[0]}</div>
                  <div>{match.preview.reasons[1]}</div>
                </div>
              </section>
            )}

            {/* FORM & LADDER */}
            {match.preview?.last5 && match.preview.ladderPos && (
              <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold">Form & Ladder</div>
                  <div className="text-xs text-white/40">last 5</div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-white/80">{match.homeTeam}</div>
                    <div className="text-xs text-white/40">Ladder: #{match.preview.ladderPos.home}</div>
                    <div className="mt-2 flex gap-1">{match.preview.last5.home.map((v, i) => (
                      <span
                        key={i}
                        className={cx(
                          "inline-flex items-center justify-center h-5 w-5 rounded-md text-[10px] font-semibold",
                          v === "W" ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"
                        )}
                      >
                        {v}
                      </span>
                    ))}</div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm text-white/80">{match.awayTeam}</div>
                    <div className="text-xs text-white/40">Ladder: #{match.preview.ladderPos.away}</div>
                    <div className="mt-2 flex gap-1 justify-end">{match.preview.last5.away.map((v, i) => (
                      <span
                        key={i}
                        className={cx(
                          "inline-flex items-center justify-center h-5 w-5 rounded-md text-[10px] font-semibold",
                          v === "W" ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"
                        )}
                      >
                        {v}
                      </span>
                    ))}</div>
                  </div>
                </div>
              </section>
            )}

            {/* TEAM LISTS (overlay only) */}
            {match.teamLists && (
              <section>
                <button
                  type="button"
                  onClick={() => setShowLists((s) => !s)}
                  className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-semibold">Team Lists</div>
                    <div className="text-xs text-white/45">
                      {match.teamLists.announced ? "Announced" : "Not yet announced"}
                    </div>
                  </div>
                  <ChevronDown className={cx("h-4 w-4 text-white/50 transition-transform", showLists && "rotate-180")} />
                </button>

                {showLists && (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
                    {!match.teamLists.announced && (
                      <div className="mb-3 text-xs text-white/50">
                        {match.teamLists.caption ?? "Not yet announced — projected club list"}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm font-semibold mb-2">{match.homeTeam}</div>
                        <ul className="text-sm text-white/70 space-y-1">
                          {match.teamLists.home.map((p) => (
                            <li key={p} className="flex items-center justify-between">
                              <span>{p}</span>
                              {match.teamLists.homeBench?.includes(p) ? (
                                <span className="ml-2 text-[10px] rounded bg-white/10 px-1.5 py-0.5 text-white/60">
                                  B
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <div className="text-sm font-semibold mb-2">{match.awayTeam}</div>
                        <ul className="text-sm text-white/70 space-y-1">
                          {match.teamLists.away.map((p) => (
                            <li key={p} className="flex items-center justify-between">
                              <span>{p}</span>
                              {match.teamLists.awayBench?.includes(p) ? (
                                <span className="ml-2 text-[10px] rounded bg-white/10 px-1.5 py-0.5 text-white/60">
                                  B
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {match.teamLists.lateChanges?.length ? (
                      <div className="mt-4 border-t border-white/10 pt-3">
                        <div className="text-xs text-white/45 uppercase tracking-wide mb-2">Late Changes</div>
                        <div className="space-y-2 text-sm text-white/70">
                          {match.teamLists.lateChanges.map((c, idx) => (
                            <div key={idx} className="rounded-lg bg-white/[0.04] px-3 py-2">
                              <span className="text-white/80">{c.team}:</span>{" "}
                              <span className="text-emerald-200">{c.in}</span>
                              {c.out ? (
                                <>
                                  {" "}
                                  <span className="text-white/40">for</span>{" "}
                                  <span className="text-rose-200">{c.out}</span>
                                </>
                              ) : null}
                              {c.note ? <span className="text-white/40"> · {c.note}</span> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
            )}

            {/* CONTEXT */}
            <section>
              <div className="text-sm font-semibold mb-2">Context</div>
              <div className="text-sm text-white/60 space-y-1">
                <div>Venue: {match.venue}</div>
                <div>Round: {match.roundLabel}</div>
              </div>
            </section>
          </div>
        )}

        {/* CTA */}
        <div className="mt-8">
          <a
            href="https://www.neekostats.com.au/sports/afl/ai-analysis"
            className="block w-full rounded-lg bg-amber-400 text-black text-sm font-semibold py-3 text-center hover:bg-amber-300 transition-colors"
          >
            Open AI Match Analysis →
          </a>
        </div>
      </aside>
    </div>
  );
}
