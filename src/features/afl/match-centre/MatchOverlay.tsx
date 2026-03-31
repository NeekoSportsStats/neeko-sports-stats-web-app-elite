// ⚠️ CONTRACT LOCK:
// afl.match_center_games_base has updated_at as the ONLY datetime field.
// Use date (derived from updated_at) for display.
// Use home_team_vendor and away_team_vendor only.

import React, { useEffect, useRef, useMemo, useState } from "react";
import { X, MapPin, Clock } from "lucide-react";
import type { MatchSummary, MatchPlayer, MatchPlayerStats, MatchScatterPoint, MatchTimeline, MatchQuarter } from "./types";
import type { QuarterScoreRow } from "./services/matchCenter.service";
import { fetchMatchQuarters } from "./services/matchCenter.service";
import { getTeamPair } from "./utils/teamColors";
import MatchScatter from "./MatchScatter";
import MomentumTimeline from "./MomentumTimeline";

interface MatchOverlayProps {
  match: MatchSummary;
  timeline?: MatchTimeline | null;
  matchPlayerStats?: MatchPlayerStats[];
  scatterData?: MatchScatterPoint[];
  quarterScores?: QuarterScoreRow[];
  onClose: () => void;
}

function formatMatchDate(dateStr: string | null | undefined, updatedAt?: string | null) {
  const source = dateStr || updatedAt;
  if (!source) return "—";
  try {
    const parsed = dateStr
      ? new Date(`${dateStr}T00:00:00`)
      : new Date(updatedAt!);
    if (isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return "—";
  }
}

function normaliseTeamName(name?: string | null) {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace("greater western sydney", "gws")
    .replace("gws giants", "gws")
    .replace("giants", "")
    .replace("tigers", "")
    .replace("blues", "")
    .replace("swans", "")
    .replace("eagles", "")
    .replace("dockers", "")
    .replace("demons", "")
    .replace("bombers", "")
    .replace("hawks", "")
    .replace("magpies", "")
    .replace("saints", "")
    .replace("kangaroos", "")
    .replace("power", "")
    .replace("cats", "")
    .replace("lions", "")
    .replace("suns", "")
    .trim();
}

function computeBiggestSwing(margin: { quarter: number; minute: number; margin_delta: number }[]): {
  swing: number;
  quarter: number | null;
  direction: "positive" | "negative";
} | null {
  if (!margin || margin.length < 2) return null;

  const sorted = [...margin].sort((a, b) => a.minute - b.minute);

  let bestSwing = 0;
  let bestQuarter: number | null = null;
  let bestDirection: "positive" | "negative" = "positive";

  for (let i = 0; i < sorted.length; i++) {
    let cumulative = 0;
    let maxInWindow = 0;
    for (let j = i; j < sorted.length; j++) {
      const timeDiff = sorted[j].minute - sorted[i].minute;
      if (timeDiff > 10) break;
      cumulative += sorted[j].margin_delta;
      if (Math.abs(cumulative) > Math.abs(maxInWindow)) {
        maxInWindow = cumulative;
      }
    }
    if (Math.abs(maxInWindow) > Math.abs(bestSwing)) {
      bestSwing = maxInWindow;
      bestDirection = maxInWindow > 0 ? "positive" : "negative";
      bestQuarter = sorted[i].quarter > 0 ? sorted[i].quarter : null;
    }
  }

  if (Math.abs(bestSwing) <= 6) return null;
  return { swing: Math.abs(bestSwing), quarter: bestQuarter, direction: bestDirection };
}

export default function MatchOverlay({ match, timeline, matchPlayerStats, scatterData, quarterScores, onClose }: MatchOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [quarters, setQuarters] = useState<MatchQuarter[]>([]);
  const [quartersLoading, setQuartersLoading] = useState(false);
  const [quartersError, setQuartersError] = useState<string | null>(null);
  const [showQuarters, setShowQuarters] = useState(false);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevWidth = document.body.style.width;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.width = prevWidth;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const matchId = (match?.match_id ?? match?.vendor_game_id) as string;
    if (!matchId) {
      setQuarters([]);
      return;
    }

    setQuartersLoading(true);
    setQuartersError(null);

    fetchMatchQuarters(matchId)
      .then((data) => {
        const sorted = [...data].sort((a, b) => a.quarter - b.quarter);
        setQuarters(sorted);
        setQuartersLoading(false);
      })
      .catch((err) => {
        console.debug("[MatchOverlay] Failed to fetch quarters:", String(err));
        setQuarters([]);
        setQuartersError(err?.message ?? "Failed to load quarters");
        setQuartersLoading(false);
      });
  }, [match?.match_id, match?.vendor_game_id]);

  const statsReady = matchPlayerStats && matchPlayerStats.length > 0;

  const players: MatchPlayer[] = useMemo(() => {
    if (!matchPlayerStats || matchPlayerStats.length === 0) return [];
    return matchPlayerStats.map((s): MatchPlayer => ({
      player_name: s.player,
      team_name: s.player_team,
      opponent_name: s.opponent_team,
      player_role: s.position,
      fantasy_points: s.fantasy_points,
      disposals: s.disposals,
      goals: s.goals,
    }));
  }, [matchPlayerStats]);

  const { team1Name, team2Name, team1Top3, team2Top3 } = useMemo(() => {
    const homeKey = normaliseTeamName(match.home_team_vendor);
    const awayKey = normaliseTeamName(match.away_team_vendor);
    const safePlayers = Array.isArray(players) ? players : [];
    const scopedPlayers = safePlayers
      .filter((p): p is MatchPlayer => p != null)
      .filter(p => {
        const teamKey = normaliseTeamName(p.team_name);
        return teamKey === homeKey || teamKey === awayKey;
      });

    const teamMap = new Map<string, MatchPlayer[]>();
    for (const p of scopedPlayers) {
      const key = normaliseTeamName(p.team_name);
      if (!teamMap.has(key)) teamMap.set(key, []);
      teamMap.get(key)!.push(p);
    }

    const homePlayers = (teamMap.get(homeKey) || [])
      .sort((a, b) => (b.fantasy_points ?? 0) - (a.fantasy_points ?? 0))
      .slice(0, 3);
    const awayPlayers = (teamMap.get(awayKey) || [])
      .sort((a, b) => (b.fantasy_points ?? 0) - (a.fantasy_points ?? 0))
      .slice(0, 3);

    return {
      team1Name: match.home_team_vendor ?? "",
      team2Name: match.away_team_vendor ?? "",
      team1Top3: homePlayers,
      team2Top3: awayPlayers,
    };
  }, [players, match.home_team_vendor, match.away_team_vendor]);

  const insightSentences = useMemo(() => {
    const sentences: string[] = [];
    const hScore = match.home_score ?? null;
    const aScore = match.away_score ?? null;
    const home = match.home_team_vendor ?? "Home";
    const away = match.away_team_vendor ?? "Away";

    if (hScore != null && aScore != null) {
      const margin = Math.abs(hScore - aScore);
      const winner = hScore >= aScore ? home : away;
      const loser = hScore >= aScore ? away : home;
      const winScore = Math.max(hScore, aScore);
      const loseScore = Math.min(hScore, aScore);

      const seed = (hScore + aScore + margin) % 3;

      if (margin === 0) {
        const drawPhrases = [
          `In a pulsating encounter, neither ${home} nor ${away} could land the knockout blow, finishing deadlocked at ${hScore} points each.`,
          `${home} and ${away} couldn't be separated in an absorbing contest that ebbed and flowed throughout, ending all square at ${hScore} apiece.`,
          `Honours even as ${home} and ${away} fought out a thrilling ${hScore}-all draw, with neither side able to gain the decisive edge.`
        ];
        sentences.push(drawPhrases[seed]);
      } else if (margin <= 6) {
        const closePhrases = [
          `${winner} emerged victorious by the barest of margins, surviving a last-gasp challenge from ${loser} to prevail by ${margin} points, ${winScore} to ${loseScore}.`,
          `In a nail-biting finish, ${winner} held their nerve to edge out ${loser} by just ${margin} points in a classic encounter, ${winScore} to ${loseScore}.`,
          `${winner} snatched victory from the jaws of defeat, outlasting ${loser} by a heart-stopping ${margin} points, ${winScore} to ${loseScore}.`
        ];
        sentences.push(closePhrases[seed]);
      } else if (margin <= 18) {
        const tightPhrases = [
          `${winner} proved too strong when it mattered, overcoming a resilient ${loser} by ${margin} points to secure the four points, ${winScore} to ${loseScore}.`,
          `After an arm-wrestle that went the distance, ${winner} emerged with a hard-fought ${margin}-point victory over ${loser}, ${winScore} to ${loseScore}.`,
          `${winner} found the answers when challenged, grinding out a ${margin}-point triumph against a gallant ${loser}, ${winScore} to ${loseScore}.`
        ];
        sentences.push(tightPhrases[seed]);
      } else if (margin <= 39) {
        const solidPhrases = [
          `${winner} stamped their authority on proceedings, pulling away in the crucial moments to claim a ${margin}-point victory, ${winScore} to ${loseScore}.`,
          `A polished performance from ${winner} yielded a commanding ${margin}-point win over ${loser}, who battled hard but were ultimately outclassed, ${winScore} to ${loseScore}.`,
          `${winner} asserted their dominance across the four quarters, running out comfortable ${margin}-point victors against ${loser}, ${winScore} to ${loseScore}.`
        ];
        sentences.push(solidPhrases[seed]);
      } else {
        const blowoutPhrases = [
          `${winner} delivered a ruthless display of attacking football, dismantling ${loser} by ${margin} points in a one-sided affair, ${winScore} to ${loseScore}.`,
          `It was all ${winner} in a comprehensive demolition job, with ${loser} unable to match the intensity as the margin blew out to ${margin} points, ${winScore} to ${loseScore}.`,
          `${winner} turned on the style in a clinical performance, overwhelming ${loser} from the opening bounce to record a ${margin}-point rout, ${winScore} to ${loseScore}.`
        ];
        sentences.push(blowoutPhrases[seed]);
      }
    }

    if (matchPlayerStats && matchPlayerStats.length > 0 && hScore != null && aScore != null) {
      const winner = hScore >= aScore ? home : away;
      const loser = hScore >= aScore ? away : home;

      const sorted = [...matchPlayerStats].sort((a, b) => (b.fantasy_points ?? 0) - (a.fantasy_points ?? 0));
      const winnerTopPerformer = sorted.find(p => normaliseTeamName(p.player_team) === normaliseTeamName(winner));
      const loserTopPerformer = sorted.find(p => normaliseTeamName(p.player_team) === normaliseTeamName(loser));

      if (winnerTopPerformer) {
        const disposals = winnerTopPerformer.disposals ?? 0;
        const fantasy = winnerTopPerformer.fantasy_points ?? 0;
        const bogSeed = (disposals + fantasy) % 3;

        let bogPhrase = "";
        if (disposals > 35) {
          const phrases = [
            `${winnerTopPerformer.player} was a one-man wrecking crew for ${winner}, amassing a game-high ${disposals} disposals en route to ${fantasy} fantasy points and best on ground honours.`,
            `In a dominant individual display, ${winnerTopPerformer.player} racked up ${disposals} touches for ${winner}, his ${fantasy} fantasy points underlining his influence on the contest.`,
            `${winnerTopPerformer.player} stood head and shoulders above the rest, pillaging ${disposals} disposals and ${fantasy} fantasy points in a virtuoso performance for ${winner}.`
          ];
          bogPhrase = phrases[bogSeed];
        } else if (disposals > 28) {
          const phrases = [
            `${winnerTopPerformer.player} proved the difference for ${winner}, his ${disposals} disposals and ${fantasy} fantasy points earning best afield accolades.`,
            `The class of ${winnerTopPerformer.player} shone through with ${disposals} touches and ${fantasy} fantasy points, spearheading ${winner}'s efforts throughout.`,
            `${winnerTopPerformer.player} was instrumental for ${winner}, collecting ${disposals} disposals and posting ${fantasy} fantasy points in a match-winning performance.`
          ];
          bogPhrase = phrases[bogSeed];
        } else {
          const phrases = [
            `${winnerTopPerformer.player} was named best on ground for ${winner}, his ${disposals} disposals and ${fantasy} fantasy points highlighting an impactful display.`,
            `Despite modest possession numbers (${disposals} disposals), ${winnerTopPerformer.player}'s quality shone through for ${winner}, his ${fantasy} fantasy points reflecting his game-breaking moments.`,
            `${winnerTopPerformer.player} took the honours with ${disposals} disposals and ${fantasy} fantasy points, his efficiency and decision-making proving crucial for ${winner}.`
          ];
          bogPhrase = phrases[bogSeed];
        }
        sentences.push(bogPhrase);
      }

      if (loserTopPerformer) {
        const disposals = loserTopPerformer.disposals ?? 0;
        const fantasy = loserTopPerformer.fantasy_points ?? 0;
        const loserSeed = (disposals + fantasy) % 3;

        const loserPhrases = [
          `${loserTopPerformer.player} fought strongly for ${loser}, finishing with ${disposals} disposals and ${fantasy} fantasy points in a valiant effort.`,
          `Despite the result, ${loserTopPerformer.player} gave everything for ${loser}, his ${disposals} disposals and ${fantasy} fantasy points a bright spot in defeat.`,
          `${loserTopPerformer.player} was ${loser}'s standout, battling hard with ${disposals} disposals and ${fantasy} fantasy points in a losing cause.`
        ];
        sentences.push(loserPhrases[loserSeed]);
      }
    }

    if (timeline?.margin && timeline.margin.length > 0) {
      const swing = computeBiggestSwing(timeline.margin);
      if (swing && swing.swing > 18) {
        const quarterText = swing.quarter
          ? swing.quarter === 1
            ? "early in the opening term"
            : swing.quarter === 2
              ? "late in the second quarter"
              : swing.quarter === 3
                ? "during a dominant third-quarter blitz"
                : "in the final term"
          : "";
        const teamName = swing.direction === "positive" ? home : away;
        const swingSeed = swing.swing % 4;
        const bigSwingPhrases = [
          `The complexion of the match changed ${quarterText}, as ${teamName} unleashed a devastating burst that broke the contest open.`,
          `${teamName}'s ruthless efficiency ${quarterText} proved the difference, with a match-defining surge putting the result beyond doubt.`,
          `It was ${quarterText} where ${teamName} seized the initiative, piling on unanswered majors in a spell that turned the game on its head.`,
          `The turning point arrived ${quarterText}, when ${teamName} hit the afterburners and established an unassailable advantage.`
        ];
        sentences.push(bigSwingPhrases[swingSeed]);
      } else if (swing && swing.swing > 12) {
        const teamName = swing.direction === "positive" ? home : away;
        const swingSeed = swing.swing % 4;
        const mediumSwingPhrases = [
          `${teamName} produced the decisive moment when the game hung in the balance, wresting control at a critical juncture.`,
          `The momentum shift proved crucial, with ${teamName} stringing together a match-changing passage of play that tilted the scales.`,
          `When the heat was on, ${teamName} lifted to another level, their surge in intensity proving the difference between the sides.`,
          `${teamName}'s ability to seize the ascendancy at key moments ultimately separated the two teams in a fiercely contested battle.`
        ];
        sentences.push(mediumSwingPhrases[swingSeed]);
      } else if (swing && swing.swing > 6) {
        const evenPhrases = [
          "Neither side could break the deadlock for sustained periods, with the lead changing hands repeatedly in an absorbing contest.",
          "The match ebbed and flowed throughout, with neither team able to assert prolonged dominance in a see-sawing encounter.",
          "Momentum was fleeting for both sides, as the contest remained on a knife's edge from first bounce to final siren."
        ];
        sentences.push(evenPhrases[swing.swing % 3]);
      }
    }

    const homeTop = team1Top3[0];
    const awayTop = team2Top3[0];
    if (homeTop && awayTop && homeTop.player_name !== awayTop.player_name) {
      const bogName = matchPlayerStats && matchPlayerStats.length > 0
        ? [...matchPlayerStats].sort((a, b) => (b.fantasy_points ?? 0) - (a.fantasy_points ?? 0))[0]?.player
        : null;
      const homeDisplay = homeTop.player_name === bogName ? team1Top3[1] : homeTop;
      const awayDisplay = awayTop.player_name === bogName ? team2Top3[1] : awayTop;
      if (homeDisplay && awayDisplay) {
        const supportSeed = ((homeDisplay.fantasy_points ?? 0) + (awayDisplay.fantasy_points ?? 0)) % 3;
        const supportPhrases = [
          `${homeDisplay.player_name} was a key contributor for ${home} with ${homeDisplay.fantasy_points} fantasy points, while ${awayDisplay.player_name} fought valiantly in a losing cause for ${away}, tallying ${awayDisplay.fantasy_points}.`,
          `Among the other standouts, ${homeDisplay.player_name} (${homeDisplay.fantasy_points} pts) provided excellent support for ${home}, and ${awayDisplay.player_name} (${awayDisplay.fantasy_points} pts) battled hard for ${away} despite the result.`,
          `${homeDisplay.player_name} impressed with ${homeDisplay.fantasy_points} fantasy points for ${home}, while ${awayDisplay.player_name} was a shining light for ${away} with ${awayDisplay.fantasy_points} in a determined individual effort.`
        ];
        sentences.push(supportPhrases[supportSeed]);
      }
    }

    return sentences.length > 0 ? sentences : null;
  }, [matchPlayerStats, match.home_score, match.away_score, match.home_team_vendor, match.away_team_vendor, timeline, team1Top3, team2Top3]);

  const roundLabel = match.round_label || "AFL";
  const season = match.season ?? 2025;
  const isFinished = match.status === "FT";
  const venue = match.venue && match.venue !== "TBC" ? match.venue : null;
  const formattedDate = formatMatchDate(match.date, match.updated_at);
  const homeScore = match.home_score ?? null;
  const awayScore = match.away_score ?? null;
  const teamColors = getTeamPair(match.home_team_vendor, match.away_team_vendor);
  const homeColor = teamColors.home.primary;
  const awayColor = teamColors.away.primary;

  const wonByLabel = useMemo(() => {
    if (homeScore == null || awayScore == null || !isFinished) return null;
    const margin = Math.abs(homeScore - awayScore);
    if (margin === 0) return "Draw";
    const winner = homeScore > awayScore ? (match.home_team_vendor ?? "Home") : (match.away_team_vendor ?? "Away");
    return `${winner} won by ${margin} points`;
  }, [homeScore, awayScore, isFinished, match.home_team_vendor, match.away_team_vendor]);

  const sortedQuarterScores = useMemo(() => {
    if (!quarterScores || quarterScores.length === 0) return [];
    return [...quarterScores].sort((a, b) => a.quarter - b.quarter);
  }, [quarterScores]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-gradient-to-b from-[#070707] to-black overflow-y-auto px-4 pb-10 pt-6 sm:max-w-4xl sm:mx-auto sm:mt-10 sm:rounded-xl animate-in fade-in duration-200"
      style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y" }}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="w-full rounded-xl border border-neutral-700/30 bg-gradient-to-b from-neutral-950/80 via-black/70 to-neutral-950/80 backdrop-blur-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between p-3 md:p-5 border-b border-gradient-to-r from-[#F5C84C]/20 via-neutral-700/20 to-transparent">
          <div>
            <div className="text-xs uppercase tracking-wider bg-gradient-to-r from-[#F5C84C] to-[#E6B84A] bg-clip-text text-transparent font-medium">
              {roundLabel} • {season}
              {isFinished && <span className="ml-2 text-neutral-400">Full Time</span>}
            </div>
            <div className="text-lg sm:text-xl font-semibold text-white">Match Detail</div>
          </div>
          <button
            onClick={onClose}
            className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] active:bg-white/[0.06] flex items-center justify-center transition-colors touch-manipulation"
          >
            <X className="h-5 w-5 text-neutral-300" />
          </button>
        </div>

        <div className="p-4 md:p-6 space-y-6 sm:space-y-10">
          <div className="rounded-xl md:rounded-2xl border border-gradient-to-r from-[#F5C84C]/15 via-neutral-700/10 to-[#60A5FA]/10 bg-gradient-to-br from-neutral-950/60 via-black/50 to-neutral-900/60 p-4 md:p-6 shadow-lg shadow-[#F5C84C]/5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-[#F5C84C]/[0.03] via-transparent to-[#60A5FA]/[0.03]" />
            <div className="relative">
              <div className="grid grid-cols-3 items-center gap-3 md:gap-4 mb-4 md:mb-4">
                <div>
                  <div className="flex items-center gap-2 md:gap-2 mb-3 md:mb-3">
                    <div className="w-2.5 h-2.5 md:w-2.5 md:h-2.5 rounded-full bg-gradient-to-br from-[#F5C84C] to-[#E6B84A] shadow-[0_0_8px_rgba(245,200,76,0.5)]" />
                    <div className="text-white font-semibold text-base md:text-xl leading-tight line-clamp-2">{match.home_team_vendor ?? "Home"}</div>
                  </div>
                  <div className="bg-gradient-to-br from-[#F5C84C] to-[#E6B84A] bg-clip-text text-transparent text-4xl md:text-4xl font-bold">
                    {homeScore ?? "—"}
                  </div>
                </div>
                <div className="text-center">
                  <div className="bg-gradient-to-r from-[#F5C84C]/60 via-neutral-400/50 to-[#60A5FA]/60 bg-clip-text text-transparent text-2xl md:text-3xl font-black">VS</div>
                  {wonByLabel && (
                    <div className="mt-2 md:mt-2 text-xs text-[#F5C84C] leading-relaxed px-1 font-semibold">{wonByLabel}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 md:gap-2 justify-end mb-3 md:mb-3">
                    <div className="text-white font-semibold text-base md:text-xl leading-tight line-clamp-2 text-right">{match.away_team_vendor ?? "Away"}</div>
                    <div className="w-2.5 h-2.5 md:w-2.5 md:h-2.5 rounded-full bg-gradient-to-br from-[#60A5FA] to-[#4B8FD8] shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
                  </div>
                  <div className="bg-gradient-to-br from-[#60A5FA] via-[#5B9FE6] to-[#4B8FD8] bg-clip-text text-transparent text-4xl md:text-4xl font-bold">
                    {awayScore ?? "—"}
                  </div>
                </div>
              </div>

            {(quarters.length > 0 || (sortedQuarterScores && sortedQuarterScores.length > 0)) && (
              <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-gradient-to-r from-[#F5C84C]/10 via-neutral-700/10 to-[#60A5FA]/10">
                <button
                  onClick={() => setShowQuarters(!showQuarters)}
                  className="w-full flex items-center justify-between mb-3 md:mb-4 touch-manipulation min-h-[48px] md:min-h-0 -my-2 md:my-0 py-2 md:py-0 hover:opacity-80 transition-opacity"
                >
                  <div className="text-xs uppercase tracking-wider font-bold flex items-center gap-2.5">
                    <span className={showQuarters ? 'bg-gradient-to-r from-[#F5C84C] to-[#E6B84A] bg-clip-text text-transparent' : 'text-[#F5C84C]/70'}>Quarter by Quarter</span>
                    <span className="md:hidden text-neutral-500 text-[10px] font-semibold">({showQuarters ? 'Hide' : 'Tap to show'})</span>
                  </div>
                  <span className="md:hidden text-[#F5C84C] text-base font-bold transition-transform duration-300" style={{ transform: showQuarters ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    ▼
                  </span>
                </button>
                <div className={`space-y-0 overflow-hidden transition-all duration-300 ${showQuarters ? 'max-h-[500px] opacity-100 md:max-h-none md:opacity-100' : 'max-h-0 opacity-0 md:max-h-none md:opacity-100'}`}>
                  {quarters.length > 0 ? (
                    quarters.map((q, idx) => {
                      const homeDisplay = q.home_goals != null && q.home_behinds != null && q.home_points != null
                        ? `${q.home_goals}.${q.home_behinds} (${q.home_points})`
                        : q.home_points != null ? `${q.home_points}` : '—';
                      const awayDisplay = q.away_goals != null && q.away_behinds != null && q.away_points != null
                        ? `${q.away_goals}.${q.away_behinds} (${q.away_points})`
                        : q.away_points != null ? `${q.away_points}` : '—';
                      return (
                        <div
                          key={q.quarter}
                          className={`flex items-center gap-5 md:gap-6 py-3.5 md:py-3 hover:bg-white/[0.02] transition-colors duration-150 rounded-lg px-3 md:px-2 -mx-3 md:-mx-2 ${idx !== quarters.length - 1 ? 'border-b border-white/[0.06]' : ''}`}
                        >
                          <div className="text-sm md:text-xs font-bold md:font-semibold text-[#F5C84C]/80 md:text-white/40 uppercase tracking-wider w-8 md:w-6">Q{q.quarter}</div>
                          <div className="flex items-center justify-between gap-6 md:gap-6 flex-1">
                            <div className="flex items-center gap-2.5 md:gap-2">
                              <span className="text-sm md:text-xs text-white/50 font-medium">H:</span>
                              <span className="text-lg md:text-lg font-bold text-white/90">{homeDisplay}</span>
                            </div>
                            <div className="flex items-center gap-2.5 md:gap-2">
                              <span className="text-sm md:text-xs text-white/50 font-medium">A:</span>
                              <span className="text-lg md:text-lg font-bold text-white/90">{awayDisplay}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    sortedQuarterScores.map((qScore, idx) => (
                      <div
                        key={qScore.quarter}
                        className={`flex items-center gap-5 md:gap-6 py-3.5 md:py-3 hover:bg-white/[0.02] transition-colors duration-150 rounded-lg px-3 md:px-2 -mx-3 md:-mx-2 ${idx !== sortedQuarterScores.length - 1 ? 'border-b border-white/[0.06]' : ''}`}
                      >
                        <div className="text-sm md:text-xs font-bold md:font-semibold text-[#F5C84C]/80 md:text-white/40 uppercase tracking-wider w-8 md:w-6">Q{qScore.quarter}</div>
                        <div className="flex items-center justify-center gap-6 md:gap-6 flex-1">
                          <span className="text-xl md:text-xl font-bold text-white/90 min-w-[3.5rem] md:min-w-[3rem] text-right">{qScore.home_qtr_points}</span>
                          <span className="text-white/30 text-base md:text-sm font-bold">—</span>
                          <span className="text-xl md:text-xl font-bold text-white/90 min-w-[3.5rem] md:min-w-[3rem] text-left">{qScore.away_qtr_points}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-neutral-800/30 flex flex-wrap items-center gap-2.5 md:gap-5 text-sm">
              {venue && (
                <div className={`flex items-center gap-1.5 ${isFinished ? "text-neutral-600" : "text-neutral-400"}`}>
                  <MapPin className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  <span className="text-xs md:text-sm">{venue}</span>
                </div>
              )}
              {formattedDate && (
                <div className="flex items-center gap-1.5 text-neutral-500">
                  <Clock className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  <span className="text-xs md:text-sm">{formattedDate}</span>
                </div>
              )}
              {isFinished && (
                <div className="px-2 py-1 rounded-md border border-white/10 bg-white/[0.02] text-[10px] md:text-xs uppercase tracking-wider text-white/40 font-semibold">
                  FT
                </div>
              )}
            </div>
            </div>
          </div>

          <MomentumTimeline
            matchId={match.match_id}
            homeTeam={match.home_team_vendor ?? "Home"}
            awayTeam={match.away_team_vendor ?? "Away"}
          />

          {statsReady ? (
            <>
              <div className="rounded-xl md:rounded-2xl border border-neutral-700/30 bg-gradient-to-br from-neutral-950/50 via-black/40 to-neutral-900/50 p-4 md:p-6 hover:border-neutral-600/40 transition-colors duration-300 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-[#F5C84C]/[0.02] via-transparent to-[#60A5FA]/[0.02]" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-3 md:mb-5">
                    <div className="w-1 h-5 md:h-6 bg-gradient-to-b from-[#F5C84C] to-[#E6B84A] rounded-full shadow-[0_0_8px_rgba(245,200,76,0.4)]" />
                    <div className="text-sm md:text-base font-bold text-white">Top Performers</div>
                  </div>
                  {team1Top3.length === 0 && team2Top3.length === 0 ? (
                    <div className="text-neutral-400 text-sm">Player data unavailable for this match</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                      <div>
                        <div className="flex items-center gap-1.5 md:gap-2 mb-3 md:mb-4">
                          <div className="w-2 h-2 rounded-full bg-gradient-to-br from-[#F5C84C] to-[#E6B84A] shadow-[0_0_6px_rgba(245,200,76,0.4)]" />
                          <div className="text-sm font-semibold text-white">{team1Name || match.home_team_vendor}</div>
                        </div>
                        {team1Top3.length === 0 ? (
                          <div className="text-neutral-400 text-sm">No data</div>
                        ) : (
                          <div className="space-y-2 md:space-y-3">
                            {team1Top3.map((p, idx) => (
                              <div
                                key={idx}
                                className="rounded-lg md:rounded-xl border border-neutral-800/40 bg-gradient-to-br from-neutral-950/60 via-black/50 to-neutral-900/60 px-3 md:px-4 py-2.5 md:py-3 hover:border-[#F5C84C]/30 hover:shadow-[0_0_12px_rgba(245,200,76,0.08)] transition-all duration-200 relative overflow-hidden group"
                              >
                                <div className="absolute inset-0 bg-gradient-to-r from-[#F5C84C]/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                <div className="relative">
                                  <div className="flex items-center justify-between mb-1.5 md:mb-2">
                                    <div className="text-white font-medium text-sm md:text-base">{p.player_name ?? "Unknown"}</div>
                                    <div className="bg-gradient-to-r from-[#F5C84C] to-[#E6B84A] bg-clip-text text-transparent font-bold text-sm md:text-base">{p.fantasy_points ?? 0}</div>
                                  </div>
                                  <div className="flex items-center gap-3 md:gap-4 text-xs text-neutral-500">
                                    <span>Disposals: {p.disposals ?? 0}</span>
                                    <span>Goals: {p.goals ?? 0}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 md:gap-2 mb-3 md:mb-4">
                          <div className="w-2 h-2 rounded-full bg-gradient-to-br from-[#60A5FA] to-[#4B8FD8] shadow-[0_0_6px_rgba(96,165,250,0.4)]" />
                          <div className="text-sm font-semibold text-white">{team2Name || match.away_team_vendor}</div>
                        </div>
                        {team2Top3.length === 0 ? (
                          <div className="text-neutral-400 text-sm">No data</div>
                        ) : (
                          <div className="space-y-2 md:space-y-3">
                            {team2Top3.map((p, idx) => (
                              <div
                                key={idx}
                                className="rounded-lg md:rounded-xl border border-neutral-800/40 bg-gradient-to-br from-neutral-950/60 via-black/50 to-neutral-900/60 px-3 md:px-4 py-2.5 md:py-3 hover:border-[#60A5FA]/30 hover:shadow-[0_0_12px_rgba(96,165,250,0.08)] transition-all duration-200 relative overflow-hidden group"
                              >
                                <div className="absolute inset-0 bg-gradient-to-l from-[#60A5FA]/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                <div className="relative">
                                  <div className="flex items-center justify-between mb-1.5 md:mb-2">
                                    <div className="text-white font-medium text-sm md:text-base">{p.player_name ?? "Unknown"}</div>
                                    <div className="bg-gradient-to-r from-[#F5C84C] to-[#E6B84A] bg-clip-text text-transparent font-bold text-sm md:text-base">{p.fantasy_points ?? 0}</div>
                                  </div>
                                  <div className="flex items-center gap-3 md:gap-4 text-xs text-neutral-500">
                                    <span>Disposals: {p.disposals ?? 0}</span>
                                    <span>Goals: {p.goals ?? 0}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pb-1">
                <MatchScatter
                  scatterData={scatterData ?? []}
                  homeTeam={match.home_team_vendor ?? "Home"}
                  awayTeam={match.away_team_vendor ?? "Away"}
                  homeColor={homeColor}
                  awayColor={awayColor}
                />
              </div>

              <div className="rounded-xl md:rounded-2xl border border-amber-600/20 bg-gradient-to-br from-amber-950/20 via-[#F5C84C]/5 to-transparent backdrop-blur-sm p-5 md:p-8 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-950/10 via-[#E6B84A]/5 to-transparent" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-4 md:mb-6">
                    <div className="w-1 h-6 bg-gradient-to-b from-amber-400 via-[#F5C84C] to-[#E6B84A] rounded-full shadow-[0_0_10px_rgba(245,200,76,0.5)]" />
                    <div className="bg-gradient-to-r from-white via-amber-50 to-amber-100 bg-clip-text text-transparent font-bold text-lg md:text-xl tracking-tight">Match Report</div>
                  </div>
                  <div className="text-sm sm:text-base text-neutral-300 leading-relaxed space-y-3.5 md:space-y-4 max-w-3xl">
                    {insightSentences && insightSentences.length > 0 ? (
                      insightSentences.map((s, i) => {
                        const isOpening = i === 0;
                        const isClosing = i === insightSentences.length - 1;
                        return (
                          <p
                            key={i}
                            className={
                              isOpening
                                ? "text-white font-medium text-lg md:text-lg"
                                : isClosing
                                  ? "text-amber-200/60 italic"
                                  : "text-white/75"
                            }
                          >
                            {s}
                          </p>
                        );
                      })
                    ) : (
                      <p className="text-neutral-400 italic">Match insights are currently unavailable for this fixture.</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-10 md:py-12">
              <div className="flex flex-col items-center gap-3 md:gap-4">
                <div className="w-10 h-10 border-4 border-yellow-400/20 border-t-yellow-400 rounded-full animate-spin" />
                <p className="text-white/50 text-sm">Loading match data...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
