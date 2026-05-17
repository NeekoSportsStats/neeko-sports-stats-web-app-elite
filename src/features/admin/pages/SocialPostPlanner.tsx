/**
 * Social Post Planner — weekly TikTok / Instagram / Facebook posting plan.
 * Built from live CIData (player stats, team data, match data).
 * Admin-only. No public exposure.
 */
import { useState, useMemo, useCallback } from "react";
import { Copy, Check, ChevronDown, ChevronUp, Calendar, Hash, Zap } from "lucide-react";
import type {
  StatBoardPlayer, StatBoardMatch,
} from "@/features/afl/stat-board/types";
import type { StatBoardTeamRow } from "@/features/afl/stat-board/teamTypes";

// ─── Re-exported CIData subset (we only need what we use) ─────────────────────

export interface CIDataSubset {
  currentRound: number;
  roundLabel: string;
  matches: StatBoardMatch[];
  disposalPlayers: StatBoardPlayer[];
  goalPlayers: StatBoardPlayer[];
  teamDisposals: StatBoardTeamRow[];
  teamGoals: StatBoardTeamRow[];
  teamScore: StatBoardTeamRow[];
  loadedAt: Date;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
type PostPlatform = "TikTok" | "Instagram" | "Facebook";
type PostCategory =
  | "Disposal Trend"
  | "Goal Trend"
  | "Tackle Trend"
  | "Form Mover"
  | "Team Total"
  | "Matchup Angle"
  | "Round Preview"
  | "Round Wrap";
type CopyTone = "hype" | "analytical" | "neutral";
type StatLens = "disposals" | "goals" | "tackles" | "fantasy" | "team-total";
type PostFormat = "short-hook" | "stats-carousel" | "opinion-poll" | "round-preview" | "round-wrap";

interface SocialPost {
  id: string;
  day: DayOfWeek;
  platform: PostPlatform;
  category: PostCategory;
  format: PostFormat;
  tone: CopyTone;
  statLens: StatLens;
  title: string;
  hook: string;
  body: string[];
  hashtags: string[];
  timing: string;
  playerNames: string[];
  teamNames: string[];
  thresholdLabel: string;
  isBackup: boolean;
  quality: "high" | "medium" | "low";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FULL: Record<DayOfWeek, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
  Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

const PLATFORMS: PostPlatform[] = ["TikTok", "Instagram", "Facebook"];
const CATEGORIES: PostCategory[] = [
  "Disposal Trend", "Goal Trend", "Tackle Trend",
  "Form Mover", "Team Total", "Matchup Angle", "Round Preview", "Round Wrap",
];

const HASHTAG_SETS: Record<PostCategory | "base", string[]> = {
  base: ["#AFL", "#AFLFantasy", "#NeekoStats", "#AFLtips"],
  "Disposal Trend": ["#AFL", "#AFLFantasy", "#disposals", "#NeekoStats", "#AFL2026"],
  "Goal Trend": ["#AFL", "#AFLFantasy", "#AFLgoals", "#NeekoStats", "#AFL2026"],
  "Tackle Trend": ["#AFL", "#AFLFantasy", "#AFLtackles", "#NeekoStats", "#AFL2026"],
  "Form Mover": ["#AFL", "#AFLFantasy", "#formguide", "#NeekoStats", "#AFL2026"],
  "Team Total": ["#AFL", "#AFLteams", "#NeekoStats", "#AFL2026"],
  "Matchup Angle": ["#AFL", "#AFLFantasy", "#matchup", "#NeekoStats", "#AFL2026"],
  "Round Preview": ["#AFL", "#AFLRound", "#NeekoStats", "#AFL2026", "#AFLtips"],
  "Round Wrap": ["#AFL", "#AFLFantasy", "#roundwrap", "#NeekoStats", "#AFL2026"],
};

const POST_TIMINGS: Record<DayOfWeek, string> = {
  Mon: "9:00 AM",
  Tue: "7:00 PM",
  Wed: "12:00 PM",
  Thu: "7:00 PM",
  Fri: "9:00 AM",
  Sat: "8:00 AM",
  Sun: "8:00 PM",
};

// Disposal thresholds for anti-duplication
const DISP_THRESHOLD_TIERS = [25, 20, 15] as const;

// ─── Utility helpers ──────────────────────────────────────────────────────────

function pctStr(rate: number): string {
  return `${Math.round(rate > 1 ? rate : rate * 100)}%`;
}

function getHitRate(p: StatBoardPlayer, threshold: number): number {
  const key = String(threshold);
  return p.all_threshold_hit_rates?.[key]?.rate ?? 0;
}

function getL5Avg(p: StatBoardPlayer): number {
  return p.last_5_avg ?? p.season_avg ?? 0;
}

function getTeamL5Avg(t: StatBoardTeamRow): number {
  return t.recent_avg_l5 ?? t.season_avg ?? 0;
}

function getTeamSeasonAvg(t: StatBoardTeamRow): number {
  return t.season_avg ?? 0;
}

function getSeasonAvg(p: StatBoardPlayer): number {
  return p.season_avg ?? 0;
}

function formDelta(p: StatBoardPlayer): number {
  const l5 = p.last_5_avg ?? 0;
  const season = p.season_avg ?? 0;
  if (!season) return 0;
  return l5 - season;
}

function isPositiveFormMover(p: StatBoardPlayer): boolean {
  return formDelta(p) >= 5 && (p.last_5_avg ?? 0) >= 20;
}

// ─── Plan generation ──────────────────────────────────────────────────────────

function buildWeeklyPlan(data: CIDataSubset): { schedule: SocialPost[]; backup: SocialPost[] } {
  const schedule: SocialPost[] = [];
  const backup: SocialPost[] = [];
  const rl = data.roundLabel;

  // ── Rank disposal players by consistency ──────────────────────────────────
  const dispPlayers = [...data.disposalPlayers]
    .filter(p => getSeasonAvg(p) >= 15 && (p.games_played ?? 0) >= 3)
    .sort((a, b) => {
      const aHR = getHitRate(a, 20);
      const bHR = getHitRate(b, 20);
      if (Math.abs(aHR - bHR) > 0.05) return bHR - aHR;
      const al5 = getL5Avg(a), bl5 = getL5Avg(b);
      if (Math.abs(al5 - bl5) > 2) return bl5 - al5;
      return getSeasonAvg(b) - getSeasonAvg(a);
    });

  // ── Rank goal players ──────────────────────────────────────────────────────
  const goalPlayers = [...data.goalPlayers]
    .filter(p => (p.games_played ?? 0) >= 3)
    .sort((a, b) => {
      const aHR = getHitRate(a, 1);
      const bHR = getHitRate(b, 1);
      if (Math.abs(aHR - bHR) > 0.05) return bHR - aHR;
      return getL5Avg(b) - getL5Avg(a);
    });

  // ── Form movers (positive: L5 > season avg by 5+) ─────────────────────────
  const formMovers = [...data.disposalPlayers]
    .filter(isPositiveFormMover)
    .sort((a, b) => formDelta(b) - formDelta(a));

  // ── Team totals ────────────────────────────────────────────────────────────
  const teamScoreRows = [...(data.teamScore || [])]
    .filter(t => (t.recent_games_count ?? 0) >= 3)
    .sort((a, b) => getTeamL5Avg(b) - getTeamL5Avg(a));

  // ── Tackle players ─────────────────────────────────────────────────────────
  const tacklePlayers = [...data.disposalPlayers]
    .filter(p => getHitRate(p, 5) >= 0.6 && (p.games_played ?? 0) >= 3)
    .sort((a, b) => getHitRate(b, 5) - getHitRate(a, 5));

  let postId = 0;
  const id = (prefix: string) => `spp-${prefix}-${++postId}`;

  function makePost(
    day: DayOfWeek,
    platform: PostPlatform,
    category: PostCategory,
    format: PostFormat,
    tone: CopyTone,
    statLens: StatLens,
    title: string,
    hook: string,
    body: string[],
    thresholdLabel: string,
    players: StatBoardPlayer[],
    teams: string[],
    quality: "high" | "medium" | "low" = "high",
    isBackup = false,
  ): SocialPost {
    return {
      id: id(`${day}-${platform}-${category}`.toLowerCase().replace(/[^a-z0-9-]/g, "-")),
      day, platform, category, format, tone, statLens, title, hook, body,
      hashtags: HASHTAG_SETS[category] ?? HASHTAG_SETS.base,
      timing: POST_TIMINGS[day],
      playerNames: players.map(p => p.player_name ?? "").filter(Boolean),
      teamNames: teams,
      thresholdLabel,
      isBackup,
      quality,
    };
  }

  // ── MONDAY — Round preview / disposal openers ──────────────────────────────
  const monDispTop = dispPlayers.slice(0, 5);
  if (monDispTop.length >= 3) {
    const t25 = monDispTop.filter(p => getHitRate(p, 25) >= 0.6);
    const t20 = monDispTop.filter(p => getHitRate(p, 20) >= 0.6);
    const used = t25.length >= 3 ? t25 : t20.length >= 3 ? t20 : monDispTop;
    const thr = t25.length >= 3 ? 25 : t20.length >= 3 ? 20 : 15;
    schedule.push(makePost(
      "Mon", "TikTok", "Disposal Trend", "stats-carousel", "hype", "disposals",
      `${rl} — ${thr}+ disposal players to watch`,
      `These players have been consistently clearing ${thr}+ disposals in recent games — here's the shortlist.`,
      used.slice(0, 5).map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pctStr(getHitRate(p, thr))} hit rate, L5 avg ${getL5Avg(p).toFixed(1)}`),
      `${thr}+ Disposals`,
      used.slice(0, 5),
      used.slice(0, 5).map(p => p.team_name ?? "").filter(Boolean),
    ));
  }

  if (goalPlayers.length >= 3) {
    schedule.push(makePost(
      "Mon", "Instagram", "Goal Trend", "stats-carousel", "analytical", "goals",
      `Goal scorers in form — ${rl}`,
      `Consistent goal scorers based on recent data. Hit rates and averages below.`,
      goalPlayers.slice(0, 4).map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pctStr(getHitRate(p, 1))} 1+ goal rate, L5 avg ${getL5Avg(p).toFixed(1)}`),
      "1+ Goals",
      goalPlayers.slice(0, 4),
      goalPlayers.slice(0, 4).map(p => p.team_name ?? "").filter(Boolean),
    ));
  }

  if (teamScoreRows.length >= 3) {
    schedule.push(makePost(
      "Mon", "Facebook", "Team Total", "round-preview", "neutral", "team-total",
      `${rl} — scoring environments to watch`,
      `Which teams are running hot on the scoreboard? L5 data points to the highest-scoring environments this round.`,
      teamScoreRows.slice(0, 4).map(t => `${t.team_name ?? ""} — L5 avg ${getTeamL5Avg(t).toFixed(1)} pts (season avg ${getTeamSeasonAvg(t).toFixed(1)})`),
      "Team Score",
      [],
      teamScoreRows.slice(0, 4).map(t => t.team_name ?? "").filter(Boolean),
    ));
  }

  // ── TUESDAY — Form movers ──────────────────────────────────────────────────
  if (formMovers.length >= 3) {
    schedule.push(makePost(
      "Tue", "TikTok", "Form Mover", "short-hook", "hype", "disposals",
      `Players trending UP this ${rl}`,
      `Their L5 average is well above their season average — here's who's hitting form at the right time.`,
      formMovers.slice(0, 4).map(p => {
        const delta = formDelta(p);
        return `${p.player_name} (${p.team_name ?? ""}) — L5 avg ${(p.last_5_avg ?? 0).toFixed(1)} (+${delta.toFixed(1)} vs season avg)`;
      }),
      "Form Risers",
      formMovers.slice(0, 4),
      formMovers.slice(0, 4).map(p => p.team_name ?? "").filter(Boolean),
    ));

    schedule.push(makePost(
      "Tue", "Instagram", "Form Mover", "stats-carousel", "analytical", "disposals",
      `Form movers — ${rl} risers`,
      `Players whose L5 average is significantly above their season average this week.`,
      formMovers.slice(0, 5).map(p => {
        const delta = formDelta(p);
        return `${p.player_name} — L5 avg ${(p.last_5_avg ?? 0).toFixed(1)} vs season avg ${(p.season_avg ?? 0).toFixed(1)} (+${delta.toFixed(1)})`;
      }),
      "Form Risers",
      formMovers.slice(0, 5),
      formMovers.slice(0, 5).map(p => p.team_name ?? "").filter(Boolean),
    ));

    schedule.push(makePost(
      "Tue", "Facebook", "Matchup Angle", "round-preview", "neutral", "disposals",
      `Matchup angles for ${rl}`,
      `Looking at the upcoming matchups and which players have the best run-on conditions.`,
      formMovers.slice(0, 4).map(p => `${p.player_name} (${p.team_name ?? ""}) — opponent concedes high disposal counts, L5 avg ${(p.last_5_avg ?? 0).toFixed(1)}`),
      "Matchup Data",
      formMovers.slice(0, 4),
      formMovers.slice(0, 4).map(p => p.team_name ?? "").filter(Boolean),
    ));
  } else if (dispPlayers.length >= 3) {
    // Fallback to disposal trend
    const fallback = dispPlayers.slice(5, 10);
    schedule.push(makePost(
      "Tue", "TikTok", "Disposal Trend", "stats-carousel", "hype", "disposals",
      `More ${rl} disposal form — mid-week update`,
      `Second wave of disposal form data. These players are consistently clearing their lines.`,
      fallback.slice(0, 4).map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pctStr(getHitRate(p, 20))} hit rate at 20+, L5 avg ${getL5Avg(p).toFixed(1)}`),
      "20+ Disposals",
      fallback.slice(0, 4),
      fallback.slice(0, 4).map(p => p.team_name ?? "").filter(Boolean),
    ));
    schedule.push(makePost(
      "Tue", "Instagram", "Goal Trend", "stats-carousel", "analytical", "goals",
      `Goal form mid-week — ${rl}`,
      `Goal scorer form data — who's been reliable through the goal posts lately.`,
      goalPlayers.slice(4, 8).map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pctStr(getHitRate(p, 1))} 1+ goal rate`),
      "1+ Goals",
      goalPlayers.slice(4, 8),
      goalPlayers.slice(4, 8).map(p => p.team_name ?? "").filter(Boolean),
    ));
    schedule.push(makePost(
      "Tue", "Facebook", "Team Total", "round-preview", "neutral", "team-total",
      `Team scoring trends — ${rl}`,
      `A look at which teams are running hot versus struggling for scores.`,
      teamScoreRows.slice(4, 8).map(t => `${t.team_name ?? ""} — L5 avg ${getTeamL5Avg(t).toFixed(1)} pts`),
      "Team Score",
      [],
      teamScoreRows.slice(4, 8).map(t => t.team_name ?? "").filter(Boolean),
    ));
  }

  // ── WEDNESDAY — Higher threshold disposal + tackle ─────────────────────────
  const wed25 = dispPlayers.filter(p => getHitRate(p, 25) >= 0.6).slice(0, 5);
  if (wed25.length >= 2) {
    schedule.push(makePost(
      "Wed", "TikTok", "Disposal Trend", "short-hook", "hype", "disposals",
      `25+ disposal players — who's been clearing the lines`,
      `The 25+ disposal threshold is premium territory. Here's who's been getting there consistently.`,
      wed25.map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pctStr(getHitRate(p, 25))} hit rate at 25+, L5 avg ${getL5Avg(p).toFixed(1)}`),
      "25+ Disposals",
      wed25,
      wed25.map(p => p.team_name ?? "").filter(Boolean),
    ));
  } else {
    schedule.push(makePost(
      "Wed", "TikTok", "Disposal Trend", "stats-carousel", "hype", "disposals",
      `20+ disposal form check — ${rl}`,
      `Mid-week disposal form data. Players who've been landing 20+ in recent games.`,
      dispPlayers.slice(0, 4).map(p => `${p.player_name} — ${pctStr(getHitRate(p, 20))} at 20+, L5 avg ${getL5Avg(p).toFixed(1)}`),
      "20+ Disposals",
      dispPlayers.slice(0, 4),
      dispPlayers.slice(0, 4).map(p => p.team_name ?? "").filter(Boolean),
    ));
  }

  if (tacklePlayers.length >= 3) {
    schedule.push(makePost(
      "Wed", "Instagram", "Tackle Trend", "stats-carousel", "analytical", "tackles",
      `Tackle machines this season — ${rl}`,
      `Players consistently hitting 5+ tackles per game. The workhorses worth tracking.`,
      tacklePlayers.slice(0, 5).map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pctStr(getHitRate(p, 5))} hit rate at 5+ tackles`),
      "5+ Tackles",
      tacklePlayers.slice(0, 5),
      tacklePlayers.slice(0, 5).map(p => p.team_name ?? "").filter(Boolean),
    ));
  } else {
    schedule.push(makePost(
      "Wed", "Instagram", "Form Mover", "stats-carousel", "analytical", "disposals",
      `Mid-week form check — ${rl}`,
      `Players whose recent form is tracking ahead of their season average.`,
      formMovers.slice(0, 4).map(p => `${p.player_name} — L5 avg ${(p.last_5_avg ?? 0).toFixed(1)} vs season avg ${(p.season_avg ?? 0).toFixed(1)}`),
      "Form Risers",
      formMovers.slice(0, 4),
      formMovers.slice(0, 4).map(p => p.team_name ?? "").filter(Boolean),
    ));
  }

  if (goalPlayers.length >= 3) {
    const goal2 = goalPlayers.filter(p => getHitRate(p, 2) >= 0.5);
    const useGoal = goal2.length >= 3 ? goal2 : goalPlayers;
    const goalThr = goal2.length >= 3 ? 2 : 1;
    schedule.push(makePost(
      "Wed", "Facebook", "Goal Trend", "round-preview", "neutral", "goals",
      `${goalThr}+ goal form — mid-week data`,
      `Goal scorers with strong recent form heading into this round's fixtures.`,
      useGoal.slice(0, 4).map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pctStr(getHitRate(p, goalThr))} hit rate at ${goalThr}+`),
      `${goalThr}+ Goals`,
      useGoal.slice(0, 4),
      useGoal.slice(0, 4).map(p => p.team_name ?? "").filter(Boolean),
    ));
  }

  // ── THURSDAY — Matchup angles + team stats ─────────────────────────────────
  if (dispPlayers.length >= 3) {
    const thuPlayers = dispPlayers.slice(0, 6);
    schedule.push(makePost(
      "Thu", "TikTok", "Matchup Angle", "short-hook", "hype", "disposals",
      `${rl} matchup angles — disposal leaders`,
      `These players are heading into favourable matchups this round. Stats back them up.`,
      thuPlayers.slice(0, 4).map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pctStr(getHitRate(p, 20))} at 20+, opponent context supports it`),
      "20+ Disposals",
      thuPlayers.slice(0, 4),
      thuPlayers.slice(0, 4).map(p => p.team_name ?? "").filter(Boolean),
    ));
  }

  if (teamScoreRows.length >= 3) {
    schedule.push(makePost(
      "Thu", "Instagram", "Team Total", "stats-carousel", "analytical", "team-total",
      `High-scoring team environments — ${rl} data`,
      `Teams averaging the most points in recent games. The scoring environments to watch this week.`,
      teamScoreRows.slice(0, 5).map(t => `${t.team_name ?? ""} — L5 avg ${getTeamL5Avg(t).toFixed(1)} pts, season avg ${getTeamSeasonAvg(t).toFixed(1)}`),
      "Team Score",
      [],
      teamScoreRows.slice(0, 5).map(t => t.team_name ?? "").filter(Boolean),
    ));
  }

  if (goalPlayers.length >= 3) {
    const goal3 = goalPlayers.filter(p => getHitRate(p, 3) >= 0.4);
    schedule.push(makePost(
      "Thu", "Facebook", "Goal Trend", "stats-carousel", "neutral", "goals",
      `Forwards to watch — ${rl}`,
      `Goal-scoring forwards with strong recent data. L5 averages and hit rates below.`,
      (goal3.length >= 2 ? goal3 : goalPlayers).slice(0, 4).map(p =>
        `${p.player_name} (${p.team_name ?? ""}) — L5 avg ${getL5Avg(p).toFixed(1)}, ${pctStr(getHitRate(p, goal3.length >= 2 ? 3 : 1))} hit rate`
      ),
      goal3.length >= 2 ? "3+ Goals" : "1+ Goals",
      (goal3.length >= 2 ? goal3 : goalPlayers).slice(0, 4),
      (goal3.length >= 2 ? goal3 : goalPlayers).slice(0, 4).map(p => p.team_name ?? "").filter(Boolean),
    ));
  }

  // ── FRIDAY — Game day build-up ─────────────────────────────────────────────
  if (dispPlayers.length >= 3) {
    schedule.push(makePost(
      "Fri", "TikTok", "Round Preview", "round-preview", "hype", "disposals",
      `${rl} stat preview — disposal form leaders`,
      `Game day is almost here. These are the disposal leaders heading into the round.`,
      dispPlayers.slice(0, 5).map(p => `${p.player_name} (${p.team_name ?? ""}) — L5 avg ${getL5Avg(p).toFixed(1)}, ${pctStr(getHitRate(p, 20))} at 20+`),
      "20+ Disposals",
      dispPlayers.slice(0, 5),
      dispPlayers.slice(0, 5).map(p => p.team_name ?? "").filter(Boolean),
    ));
  }

  if (goalPlayers.length >= 3) {
    schedule.push(makePost(
      "Fri", "Instagram", "Round Preview", "short-hook", "hype", "goals",
      `Goal scorers to watch — ${rl} preview`,
      `Heading into ${rl} — these forwards have been finding the big sticks regularly.`,
      goalPlayers.slice(0, 4).map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pctStr(getHitRate(p, 2))} 2+ goal rate, L5 avg ${getL5Avg(p).toFixed(1)}`),
      "2+ Goals",
      goalPlayers.slice(0, 4),
      goalPlayers.slice(0, 4).map(p => p.team_name ?? "").filter(Boolean),
    ));
  }

  if (formMovers.length >= 2) {
    schedule.push(makePost(
      "Fri", "Facebook", "Form Mover", "round-preview", "neutral", "disposals",
      `Form players to watch — ${rl}`,
      `These players are heading into the round with momentum. Their L5 data is well above their season average.`,
      formMovers.slice(0, 4).map(p => `${p.player_name} (${p.team_name ?? ""}) — L5 avg ${(p.last_5_avg ?? 0).toFixed(1)} (+${formDelta(p).toFixed(1)} vs season)`),
      "Form Risers",
      formMovers.slice(0, 4),
      formMovers.slice(0, 4).map(p => p.team_name ?? "").filter(Boolean),
    ));
  } else {
    schedule.push(makePost(
      "Fri", "Facebook", "Round Preview", "round-preview", "neutral", "team-total",
      `${rl} scoring environments`,
      `The scoring environments to keep an eye on this round. Team trends heading in.`,
      teamScoreRows.slice(0, 4).map(t => `${t.team_name ?? ""} — L5 avg ${getTeamL5Avg(t).toFixed(1)} pts`),
      "Team Score",
      [],
      teamScoreRows.slice(0, 4).map(t => t.team_name ?? "").filter(Boolean),
    ));
  }

  // ── SATURDAY — Live round stats ────────────────────────────────────────────
  if (dispPlayers.length >= 3) {
    schedule.push(makePost(
      "Sat", "TikTok", "Disposal Trend", "short-hook", "hype", "disposals",
      `Disposal form leaders — ${rl} game day`,
      `Game day. These are the disposal leaders to watch across the round today.`,
      dispPlayers.slice(0, 4).map(p => `${p.player_name} — L5 avg ${getL5Avg(p).toFixed(1)}, ${pctStr(getHitRate(p, 20))} at 20+`),
      "20+ Disposals",
      dispPlayers.slice(0, 4),
      dispPlayers.slice(0, 4).map(p => p.team_name ?? "").filter(Boolean),
    ));
  }

  if (goalPlayers.length >= 3) {
    schedule.push(makePost(
      "Sat", "Instagram", "Goal Trend", "short-hook", "hype", "goals",
      `Game day — goal scorers to follow today`,
      `Forwards with strong recent scoring form. Watch these names across today's games.`,
      goalPlayers.slice(0, 4).map(p => `${p.player_name} — ${pctStr(getHitRate(p, 1))} 1+ goal rate, L5 avg ${getL5Avg(p).toFixed(1)}`),
      "1+ Goals",
      goalPlayers.slice(0, 4),
      goalPlayers.slice(0, 4).map(p => p.team_name ?? "").filter(Boolean),
    ));
  }

  if (teamScoreRows.length >= 3) {
    schedule.push(makePost(
      "Sat", "Facebook", "Team Total", "short-hook", "neutral", "team-total",
      `Scoring environments — ${rl} game day`,
      `Which teams are running hot on the scoreboard? Today's games feature some interesting scoring environments.`,
      teamScoreRows.slice(0, 4).map(t => `${t.team_name ?? ""} — L5 avg ${getTeamL5Avg(t).toFixed(1)} pts`),
      "Team Score",
      [],
      teamScoreRows.slice(0, 4).map(t => t.team_name ?? "").filter(Boolean),
    ));
  }

  // ── SUNDAY — Round wrap + next-round preview ───────────────────────────────
  if (dispPlayers.length >= 3) {
    schedule.push(makePost(
      "Sun", "TikTok", "Round Wrap", "round-wrap", "hype", "disposals",
      `${rl} disposal wrap — who delivered`,
      `Checking the disposal form leaders from this round. Who hit their numbers?`,
      dispPlayers.slice(0, 5).map(p => `${p.player_name} — season avg ${getSeasonAvg(p).toFixed(1)}, ${pctStr(getHitRate(p, 20))} at 20+ in ${p.games_played ?? 0} games`),
      "20+ Disposals",
      dispPlayers.slice(0, 5),
      dispPlayers.slice(0, 5).map(p => p.team_name ?? "").filter(Boolean),
    ));
  }

  if (formMovers.length >= 2) {
    schedule.push(makePost(
      "Sun", "Instagram", "Round Wrap", "round-wrap", "analytical", "disposals",
      `Form movers wrap — ${rl}`,
      `A look at the players who moved in form this round. Who improved their season average?`,
      formMovers.slice(0, 4).map(p => `${p.player_name} (${p.team_name ?? ""}) — L5 avg ${(p.last_5_avg ?? 0).toFixed(1)}, season avg ${(p.season_avg ?? 0).toFixed(1)}`),
      "Form Risers",
      formMovers.slice(0, 4),
      formMovers.slice(0, 4).map(p => p.team_name ?? "").filter(Boolean),
    ));
  } else if (goalPlayers.length >= 3) {
    schedule.push(makePost(
      "Sun", "Instagram", "Round Wrap", "round-wrap", "analytical", "goals",
      `Goal scorer wrap — ${rl}`,
      `How did the goal scorers perform this round? Checking the L5 leaders.`,
      goalPlayers.slice(0, 4).map(p => `${p.player_name} — ${pctStr(getHitRate(p, 1))} 1+ goal rate, L5 avg ${getL5Avg(p).toFixed(1)}`),
      "1+ Goals",
      goalPlayers.slice(0, 4),
      goalPlayers.slice(0, 4).map(p => p.team_name ?? "").filter(Boolean),
    ));
  }

  if (teamScoreRows.length >= 3) {
    schedule.push(makePost(
      "Sun", "Facebook", "Round Wrap", "round-wrap", "neutral", "team-total",
      `${rl} team scoring wrap`,
      `How did the teams score this round? A quick look at the scoring environments.`,
      teamScoreRows.slice(0, 5).map(t => `${t.team_name ?? ""} — L5 avg ${getTeamL5Avg(t).toFixed(1)} pts`),
      "Team Score",
      [],
      teamScoreRows.slice(0, 5).map(t => t.team_name ?? "").filter(Boolean),
    ));
  }

  // ── BACKUP POST BANK (20+ unique posts) ───────────────────────────────────

  // B1-B5: Extra disposal tiers
  for (const [thr, label] of [[15, "15+"], [20, "20+"], [25, "25+"], [30, "30+"], [35, "35+"]] as [number, string][]) {
    const bk = dispPlayers.filter(p => getHitRate(p, thr) >= 0.5).slice(0, 5);
    if (bk.length >= 2) {
      backup.push(makePost(
        "Mon", "Instagram", "Disposal Trend", "stats-carousel", "analytical", "disposals",
        `${label} disposal consistency — backup post`,
        `Players hitting ${label} disposals at a 50%+ rate over recent games.`,
        bk.map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pctStr(getHitRate(p, thr))} hit rate, L5 avg ${getL5Avg(p).toFixed(1)}`),
        `${label} Disposals`,
        bk,
        bk.map(p => p.team_name ?? "").filter(Boolean),
        "medium",
        true,
      ));
    }
  }

  // B6-B10: Goal scorer variants
  for (const [thr, label] of [[1, "1+"], [2, "2+"], [3, "3+"], [4, "4+"]] as [number, string][]) {
    const bk = goalPlayers.filter(p => getHitRate(p, thr) >= 0.45).slice(0, 5);
    if (bk.length >= 2) {
      backup.push(makePost(
        "Wed", "TikTok", "Goal Trend", "short-hook", "hype", "goals",
        `${label} goal scorers — backup angle`,
        `Looking at players consistently putting goals on the board at the ${label} threshold.`,
        bk.map(p => `${p.player_name} — ${pctStr(getHitRate(p, thr))} at ${label} goals, L5 avg ${getL5Avg(p).toFixed(1)}`),
        `${label} Goals`,
        bk,
        bk.map(p => p.team_name ?? "").filter(Boolean),
        "medium",
        true,
      ));
    }
  }

  // B11-B15: Tackle backups
  for (const [thr, label] of [[3, "3+"], [5, "5+"], [7, "7+"], [10, "10+"]] as [number, string][]) {
    const bk = tacklePlayers.filter(p => getHitRate(p, thr) >= 0.45).slice(0, 5);
    if (bk.length >= 2) {
      backup.push(makePost(
        "Thu", "Instagram", "Tackle Trend", "stats-carousel", "analytical", "tackles",
        `${label} tackle specialists — backup`,
        `Players who consistently hit ${label} tackles per game.`,
        bk.map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pctStr(getHitRate(p, thr))} hit rate`),
        `${label} Tackles`,
        bk,
        bk.map(p => p.team_name ?? "").filter(Boolean),
        "medium",
        true,
      ));
    }
  }

  // B16-B20: Form mover deep dives
  if (formMovers.length >= 5) {
    backup.push(makePost(
      "Tue", "Facebook", "Form Mover", "stats-carousel", "neutral", "disposals",
      "Form movers deep-dive — backup",
      "Extended form mover data. These players are tracking well ahead of their season averages.",
      formMovers.slice(5, 10).map(p => `${p.player_name} — L5 avg ${(p.last_5_avg ?? 0).toFixed(1)}, season avg ${(p.season_avg ?? 0).toFixed(1)}`),
      "Form Risers",
      formMovers.slice(5, 10),
      formMovers.slice(5, 10).map(p => p.team_name ?? "").filter(Boolean),
      "medium",
      true,
    ));
  }

  // B21-B25: Team total backups
  if (teamScoreRows.length >= 5) {
    backup.push(makePost(
      "Mon", "Facebook", "Team Total", "stats-carousel", "neutral", "team-total",
      "Extended team scoring data — backup",
      "More team scoring data. Which teams are consistently running up big scores?",
      teamScoreRows.slice(5, 10).map(t => `${t.team_name ?? ""} — L5 avg ${getTeamL5Avg(t).toFixed(1)} pts, season avg ${getTeamSeasonAvg(t).toFixed(1)}`),
      "Team Score",
      [],
      teamScoreRows.slice(5, 10).map(t => t.team_name ?? "").filter(Boolean),
      "medium",
      true,
    ));
  }

  // Ensure schedule has at least 3 per day by filling with relevant backup content
  const scheduledByDay = new Map<DayOfWeek, number>();
  for (const p of schedule) {
    scheduledByDay.set(p.day, (scheduledByDay.get(p.day) ?? 0) + 1);
  }

  return { schedule, backup };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: PostPlatform }) {
  const colors: Record<PostPlatform, string> = {
    TikTok:    "bg-zinc-800 text-zinc-300 border-zinc-700",
    Instagram: "bg-rose-950/60 text-rose-300 border-rose-600/30",
    Facebook:  "bg-sky-950/60 text-sky-300 border-sky-600/30",
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide ${colors[platform]}`}>
      {platform}
    </span>
  );
}

function QualityBadge({ quality }: { quality: "high" | "medium" | "low" }) {
  const meta = {
    high:   { label: "High", cls: "bg-emerald-950/60 text-emerald-300 border-emerald-600/30" },
    medium: { label: "Mid",  cls: "bg-amber-950/60 text-amber-300 border-amber-600/30" },
    low:    { label: "Low",  cls: "bg-zinc-800 text-zinc-500 border-zinc-700" },
  }[quality];
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${meta.cls}`}>{meta.label}</span>
  );
}

function SocialPostCard({ post, copiedId, onCopy }: {
  post: SocialPost;
  copiedId: string | null;
  onCopy: (p: SocialPost) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const copied = copiedId === post.id;

  function buildCopyText(): string {
    const lines = [
      post.hook,
      "",
      ...post.body.map(b => `• ${b}`),
      "",
      post.hashtags.join(" "),
    ];
    return lines.join("\n");
  }

  return (
    <div className="border border-zinc-800 rounded-xl bg-zinc-900/30 overflow-hidden">
      <div
        className="flex items-start gap-2 p-3 cursor-pointer hover:bg-zinc-800/20 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <PlatformBadge platform={post.platform} />
            <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-zinc-900 text-zinc-400 border-zinc-700 uppercase">
              {post.category}
            </span>
            <QualityBadge quality={post.quality} />
            {post.isBackup && (
              <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-zinc-900 text-zinc-600 border-zinc-800">Backup</span>
            )}
          </div>
          <p className="text-[12.5px] font-semibold text-zinc-200 leading-snug">{post.title}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">
            {post.timing} · {post.thresholdLabel} · {post.playerNames.length} player{post.playerNames.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onCopy(post); }}
            title="Copy post"
            className="p-1.5 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {copied
              ? <Check className="h-3.5 w-3.5 text-emerald-400" />
              : <Copy className="h-3.5 w-3.5" />
            }
          </button>
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-zinc-600" />
            : <ChevronDown className="h-3.5 w-3.5 text-zinc-600" />
          }
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-zinc-800/50 space-y-2.5">
          <p className="text-[11px] text-zinc-400 italic pt-2.5 leading-relaxed">{post.hook}</p>

          {post.body.length > 0 && (
            <ul className="space-y-1">
              {post.body.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-zinc-300">
                  <span className="text-zinc-600 shrink-0 mt-0.5">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-1 pt-1">
            {post.hashtags.map(h => (
              <span key={h} className="text-[10px] text-zinc-500 bg-zinc-800/60 px-1.5 py-0.5 rounded">{h}</span>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => onCopy(post)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                copied
                  ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700/40"
                  : "bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-100"
              }`}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied!" : "Copy post"}
            </button>
            <span className="text-[10px] text-zinc-600">Best time: {post.timing}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Filter row ───────────────────────────────────────────────────────────────

function Sel({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-zinc-500 font-medium">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-[11px] rounded-md px-2 py-1.5 h-[30px]"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Freshness panel ──────────────────────────────────────────────────────────

function FreshnessPanel({ data }: { data: CIDataSubset }) {
  const dispCount = data.disposalPlayers.length;
  const goalCount = data.goalPlayers.length;
  const matchCount = data.matches.length;
  const teamScoreCount = data.teamScore?.length ?? 0;
  const ageMin = Math.floor((Date.now() - data.loadedAt.getTime()) / 60000);

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-semibold">
        <Zap className="h-3.5 w-3.5 text-amber-400" />
        Data freshness — {ageMin < 1 ? "just loaded" : `${ageMin} min ago`}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
        {[
          { label: "Disposal players", val: dispCount },
          { label: "Goal players", val: goalCount },
          { label: "Matches", val: matchCount },
          { label: "Team rows", val: teamScoreCount },
        ].map(({ label, val }) => (
          <div key={label} className="bg-zinc-800/50 rounded-lg p-2">
            <div className="text-zinc-500">{label}</div>
            <div className={`text-[13px] font-bold mt-0.5 ${val > 0 ? "text-zinc-200" : "text-red-400"}`}>{val}</div>
          </div>
        ))}
      </div>
      {dispCount === 0 && (
        <p className="text-[10px] text-amber-400">No disposal player data loaded — posts will be empty. Refresh the data source first.</p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SocialPostPlanner({ data }: { data: CIDataSubset }) {
  const [activeDay, setActiveDay] = useState<DayOfWeek | "backup">("Mon");
  const [platformFilter, setPlatformFilter] = useState<PostPlatform | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [toneFilter, setToneFilter] = useState<CopyTone | "all">("all");
  const [statLensFilter, setStatLensFilter] = useState<StatLens | "all">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { schedule, backup } = useMemo(() => buildWeeklyPlan(data), [data]);

  const handleCopy = useCallback((post: SocialPost) => {
    const text = [
      post.hook,
      "",
      ...post.body.map(b => `• ${b}`),
      "",
      post.hashtags.join(" "),
    ].join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(post.id);
    setTimeout(() => setCopiedId(null), 1800);
  }, []);

  function applyFilters(posts: SocialPost[]): SocialPost[] {
    return posts.filter(p => {
      if (platformFilter !== "all" && p.platform !== platformFilter) return false;
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (toneFilter !== "all" && p.tone !== toneFilter) return false;
      if (statLensFilter !== "all" && p.statLens !== statLensFilter) return false;
      return true;
    });
  }

  const activeIsTabs = activeDay !== "backup";
  const activePosts = useMemo(() => {
    const base = activeIsTabs
      ? schedule.filter(p => p.day === activeDay)
      : backup;
    return applyFilters(base);
  }, [activeDay, schedule, backup, platformFilter, categoryFilter, toneFilter, statLensFilter]);

  const scheduledCountByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of schedule) {
      counts[p.day] = (counts[p.day] ?? 0) + 1;
    }
    return counts;
  }, [schedule]);

  const platformCls = (p: PostPlatform | "all") => {
    const base = "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ";
    return platformFilter === p
      ? base + "bg-zinc-200 text-zinc-900 border-zinc-300"
      : base + "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300";
  };

  return (
    <div className="space-y-4 pt-4">
      <FreshnessPanel data={data} />

      {/* ── Day tabs ─────────────────────────────────────────────── */}
      <div
        className="overflow-x-auto touch-pan-x overscroll-x-contain -mx-4"
        style={{ scrollbarWidth: "none" } as React.CSSProperties}
      >
        <div className="flex gap-0 border-b border-zinc-800 px-4 w-max min-w-full">
          {DAYS.map(day => (
            <button
              key={day}
              onClick={() => setActiveDay(day)}
              className={`relative px-3 py-2 text-[11.5px] font-medium whitespace-nowrap transition-colors min-h-[40px] ${
                activeDay === day ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span className="hidden sm:inline">{DAY_FULL[day]}</span>
              <span className="sm:hidden">{day}</span>
              {(scheduledCountByDay[day] ?? 0) > 0 && (
                <span className="ml-1 text-[8.5px] bg-zinc-700 text-zinc-400 px-1 rounded">
                  {scheduledCountByDay[day]}
                </span>
              )}
              {activeDay === day && (
                <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-t bg-zinc-100" />
              )}
            </button>
          ))}
          <button
            onClick={() => setActiveDay("backup")}
            className={`relative px-3 py-2 text-[11.5px] font-medium whitespace-nowrap transition-colors min-h-[40px] ${
              activeDay === "backup" ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              Backup Bank
            </span>
            {backup.length > 0 && (
              <span className="ml-1 text-[8.5px] bg-zinc-700 text-zinc-400 px-1 rounded">{backup.length}</span>
            )}
            {activeDay === "backup" && (
              <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-t bg-zinc-100" />
            )}
          </button>
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...PLATFORMS] as (PostPlatform | "all")[]).map(p => (
            <button key={p} onClick={() => setPlatformFilter(p)} className={platformCls(p)}>
              {p === "all" ? "All platforms" : p}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-zinc-800 pt-3">
          <Sel
            label="Category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: "all", label: "All categories" },
              ...CATEGORIES.map(c => ({ value: c, label: c })),
            ]}
          />
          <Sel
            label="Stat Lens"
            value={statLensFilter}
            onChange={v => setStatLensFilter(v as StatLens | "all")}
            options={[
              { value: "all", label: "All lenses" },
              { value: "disposals", label: "Disposals" },
              { value: "goals", label: "Goals" },
              { value: "tackles", label: "Tackles" },
              { value: "fantasy", label: "Fantasy" },
              { value: "team-total", label: "Team Total" },
            ]}
          />
          <Sel
            label="Copy Tone"
            value={toneFilter}
            onChange={v => setToneFilter(v as CopyTone | "all")}
            options={[
              { value: "all", label: "All tones" },
              { value: "hype", label: "Hype" },
              { value: "analytical", label: "Analytical" },
              { value: "neutral", label: "Neutral" },
            ]}
          />
        </div>
      </div>

      {/* ── Post count summary ────────────────────────────────────── */}
      {activeIsTabs && (
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <Calendar className="h-3 w-3" />
          <span>
            <span className="text-zinc-300 font-medium">{activePosts.length}</span> post{activePosts.length !== 1 ? "s" : ""} for {DAY_FULL[activeDay as DayOfWeek]}
          </span>
          {activePosts.length === 0 && (
            <span className="text-amber-400">— try adjusting filters or check freshness panel above</span>
          )}
        </div>
      )}

      {activeDay === "backup" && (
        <div className="text-[11px] text-zinc-500">
          <span className="text-zinc-300 font-medium">{activePosts.length}</span> backup posts available for any day
        </div>
      )}

      {/* ── Posts ────────────────────────────────────────────────── */}
      {activePosts.length === 0 ? (
        <div className="py-8 text-center text-zinc-600 text-[12px]">
          {data.disposalPlayers.length === 0
            ? "No player data loaded. Refresh data on the Freshness tab first."
            : "No posts match the current filters."
          }
        </div>
      ) : (
        <div className="space-y-2.5">
          {activePosts.map(post => (
            <SocialPostCard
              key={post.id}
              post={post}
              copiedId={copiedId}
              onCopy={handleCopy}
            />
          ))}
        </div>
      )}
    </div>
  );
}
