// ⚠️ CONTRACT LOCK:
// afl.match_center_games_base has updated_at as the ONLY datetime field.
// Use date (derived from updated_at) for display.
// Format dates as: Thu 15 Aug, Fri 16 Aug, etc.

import React from "react";
import type { DayGroup, MatchSummary } from "./types";
import type { QuarterScoreRow } from "./services/matchCenter.service";
import { getTeamPair } from "./utils/teamColors";

interface Props {
  groups: DayGroup[];
  onSelectMatch: (m: MatchSummary) => void;
  quarterScoresMap?: Map<string, QuarterScoreRow[]>;
}

function formatDayLabel(dateStr: string): string {
  if (dateStr === "Unknown") return "Date TBC";

  try {
    const date = new Date(`${dateStr}T00:00:00`);
    if (isNaN(date.getTime())) return dateStr;

    return date.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return dateStr;
  }
}

function computeWonBy(m: MatchSummary): string | null {
  const h = m.home_score;
  const a = m.away_score;
  if (h == null || a == null) return null;
  if (m.status !== "FT") return null;
  const margin = Math.abs(h - a);
  if (margin === 0) return "Draw";
  const winner = h > a ? (m.home_team_vendor ?? "Home") : (m.away_team_vendor ?? "Away");
  return `${winner} won by ${margin} pts`;
}

export default function MatchList({ groups, onSelectMatch, quarterScoresMap }: Props) {
  if (!groups || groups.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/30 p-10 text-center text-white/50">
        No matches found for this round.
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-10">
      {groups.map((g, idx) => {
        const dayLabel = formatDayLabel(g.date);
        const matches = g.matches ?? [];

        return (
          <div key={idx} className="space-y-3 md:space-y-5">
            <div className="flex items-baseline gap-3 py-1.5 md:py-2 border-b border-gradient-to-r from-[#F5C84C]/15 via-slate-700/20 to-transparent pb-2 md:pb-3">
              <span className="text-white font-semibold text-base md:text-lg">{dayLabel}</span>
              <span className="bg-gradient-to-r from-[#F5C84C] to-[#E6B84A] bg-clip-text text-transparent text-xs md:text-sm font-medium">{g.round_label}</span>
            </div>

            <div className="space-y-3 md:space-y-5">
              {matches.map((m, mIdx) => {
                const homeTeam = m.home_team_vendor ?? "Home";
                const awayTeam = m.away_team_vendor ?? "Away";
                const isFinished = m.status === "FT";
                const venue = m.venue && m.venue !== "TBC" ? m.venue : null;
                const homeScoreNum = m.home_score ?? null;
                const awayScoreNum = m.away_score ?? null;
                const homeGoalsBehinds = m.home_goals != null && m.home_behinds != null
                  ? `${m.home_goals}.${m.home_behinds}`
                  : null;
                const awayGoalsBehinds = m.away_goals != null && m.away_behinds != null
                  ? `${m.away_goals}.${m.away_behinds}`
                  : null;
                const wonBy = computeWonBy(m);
                const homeWon = homeScoreNum != null && awayScoreNum != null && homeScoreNum > awayScoreNum;
                const awayWon = homeScoreNum != null && awayScoreNum != null && awayScoreNum > homeScoreNum;
                const quarters = quarterScoresMap?.get(m.match_id ?? "") ?? [];
                const teamColors = getTeamPair(homeTeam, awayTeam);

                return (
                  <button
                    key={m.match_id ?? mIdx}
                    onClick={() => onSelectMatch(m)}
                    className="w-full text-left rounded-2xl border border-slate-700/30 bg-gradient-to-br from-slate-950/40 via-black/30 to-slate-900/40 hover:from-slate-900/50 hover:via-black/40 hover:to-slate-800/50 hover:border-[#F5C84C]/30 md:hover:scale-[1.01] active:bg-black/50 active:scale-[0.99] transition-all duration-200 p-4 md:p-6 group min-h-[64px] touch-manipulation relative overflow-hidden"
                    style={{
                      boxShadow: `0 0 0 0 ${teamColors.home.primary}00`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = `0 0 24px ${teamColors.home.primary}20, 0 0 48px ${teamColors.away.primary}15`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = `0 0 0 0 ${teamColors.home.primary}00`;
                    }}
                  >
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{
                        background: `linear-gradient(to right, ${teamColors.home.primary}05, transparent, ${teamColors.away.primary}05)`
                      }}
                    />
                    <div className="relative">
                      <div className="grid grid-cols-[1fr_auto_1fr] md:grid-cols-3 items-center gap-3 md:gap-6">
                        <div className="space-y-2 md:space-y-1.5">
                          <div className="flex items-center gap-1.5 md:gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{
                                backgroundColor: teamColors.home.primary,
                                boxShadow: `0 0 8px ${teamColors.home.primary}60`
                              }}
                            />
                            <div className="text-white font-semibold text-sm md:text-base leading-tight line-clamp-1">{homeTeam}</div>
                          </div>
                          <div className="flex items-baseline gap-2">
                            {homeGoalsBehinds && (
                              <div className="text-xs text-slate-500 font-medium">{homeGoalsBehinds}</div>
                            )}
                            <div
                              className={`text-3xl md:text-4xl font-bold ${homeWon ? '' : 'text-white/90'}`}
                              style={homeWon ? {
                                background: `linear-gradient(135deg, ${teamColors.home.primary}, ${teamColors.home.primary}CC)`,
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                              } : {}}
                            >
                              {homeScoreNum ?? "—"}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-center justify-center text-center py-1 md:pt-2">
                          <div className="bg-gradient-to-r from-[#F5C84C]/60 via-slate-400/50 to-[#F5C84C]/60 bg-clip-text text-transparent font-black text-sm md:text-xl">VS</div>
                          {wonBy && (
                            <div className="mt-1 md:mt-3 text-[10px] md:text-xs text-[#F5C84C]/70 leading-tight font-medium whitespace-nowrap">{wonBy}</div>
                          )}
                        </div>

                        <div className="space-y-2 md:space-y-1.5 text-right">
                          <div className="flex items-center gap-1.5 md:gap-2 justify-end">
                            <div className="text-white font-semibold text-sm md:text-base leading-tight line-clamp-1 text-right">{awayTeam}</div>
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{
                                backgroundColor: teamColors.away.primary,
                                boxShadow: `0 0 8px ${teamColors.away.primary}60`
                              }}
                            />
                          </div>
                          <div className="flex items-baseline gap-2 justify-end">
                            <div
                              className={`text-3xl md:text-4xl font-bold ${awayWon ? '' : 'text-white/90'}`}
                              style={awayWon ? {
                                background: `linear-gradient(135deg, ${teamColors.away.primary}, ${teamColors.away.primary}CC)`,
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                              } : {}}
                            >
                              {awayScoreNum ?? "—"}
                            </div>
                            {awayGoalsBehinds && (
                              <div className="text-xs text-slate-500 font-medium">{awayGoalsBehinds}</div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 md:mt-5 pt-4 md:pt-4 border-t border-gradient-to-r from-transparent via-slate-700/20 to-transparent flex flex-wrap items-center gap-3 md:gap-4 text-sm">
                        {venue && (
                          <div className={`text-sm ${isFinished ? "text-slate-600" : "text-slate-400"}`}>{venue}</div>
                        )}
                        {isFinished && (
                          <div className="px-2.5 py-1.5 md:px-2 md:py-1 rounded-md border border-white/10 bg-white/[0.02] text-xs uppercase tracking-wider text-white/40 font-semibold">
                            FT
                          </div>
                        )}
                        <div className="ml-auto text-slate-400 text-sm flex items-center gap-2 group-hover:text-[#F5C84C] transition-all min-h-[48px] md:min-h-[48px] py-2 -mr-1 touch-manipulation">
                          <span className="font-medium">View Details</span>
                          <span className="text-lg group-hover:translate-x-1 transition-transform duration-200">›</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
