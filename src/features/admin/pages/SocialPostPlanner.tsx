/**
 * Social Post Planner — weekly AFL content posting plan.
 * Admin-only. No public exposure.
 * All posts target TikTok + Instagram + Facebook simultaneously.
 */
import { useState, useMemo, useCallback } from "react";
import { Copy, Check, ChevronDown, ChevronUp, Calendar, Hash, Zap, TriangleAlert as AlertTriangle, Clock } from "lucide-react";
import type { StatBoardPlayer, StatBoardMatch } from "@/features/afl/stat-board/types";
import type { StatBoardTeamRow } from "@/features/afl/stat-board/teamTypes";

// ─── CIData subset ────────────────────────────────────────────────────────────

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
  /** Player IDs to exclude from post candidate pools (injured/unavailable/suspended). */
  unavailablePlayerIds?: Set<number>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

type PostType = "Image" | "Carousel" | "Short video";

type PostIntent =
  | "recap"
  | "same_day_preview"
  | "cross_game_preview"
  | "pre_game"
  | "evergreen_backup";

type PostCategory =
  | "Disposal Trend"
  | "Goal Trend"
  | "Tackle Trend"
  | "Form Mover"
  | "Team Total"
  | "Matchup Angle"
  | "Round Preview"
  | "Round Wrap"
  | "Proof Post";

type CopyTone = "clean_stats" | "punchier_social" | "short_caption";

type StatLens = "disposals" | "goals" | "tackles" | "fantasy" | "team-total";

type ConfidenceLevel = "High" | "Medium" | "Fallback";

interface SocialPost {
  id: string;
  day: DayOfWeek;
  postNumber: 1 | 2 | 3;
  postTime: string;
  type: PostType;
  category: PostCategory;
  intent: PostIntent;
  statLens: StatLens;
  confidence: ConfidenceLevel;
  title: string;
  content: string;          // Hook / opening sentence
  statsShown: string[];     // Bullet stat lines
  onScreenText: string;     // Short text to overlay on the visual
  caption: string;          // Full caption for the post
  hashtags: string[];
  suggestedVisual: string;
  imageDescription: string;
  dataScope: string;
  targetGame: string | null;
  targetGameStatus: "upcoming" | "completed" | "any" | null;
  fallbackWarning: string | null;
  playerNames: string[];
  teamNames: string[];
  thresholdLabel: string;
  isBackup: boolean;
  tone: CopyTone;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DAY_FULL: Record<DayOfWeek, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
  Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

// Default post times per day slot (3 per day)
const POST_TIMES: Record<DayOfWeek, [string, string, string]> = {
  Mon: ["9:00 AM",  "12:00 PM", "5:00 PM"],
  Tue: ["8:00 AM",  "12:00 PM", "7:00 PM"],
  Wed: ["8:00 AM",  "12:00 PM", "7:00 PM"],
  Thu: ["8:00 AM",  "12:00 PM", "7:00 PM"],
  Fri: ["9:00 AM",  "12:00 PM", "7:00 PM"],
  Sat: ["8:00 AM",  "12:00 PM", "4:00 PM"],
  Sun: ["9:00 AM",  "12:00 PM", "7:00 PM"],
};

// Default post types per day/slot — image-first
const POST_TYPES: Record<DayOfWeek, [PostType, PostType, PostType]> = {
  Mon: ["Carousel", "Image",   "Carousel"],
  Tue: ["Image",    "Image",   "Carousel"],
  Wed: ["Image",    "Carousel","Image"],
  Thu: ["Carousel", "Image",   "Image"],
  Fri: ["Carousel", "Image",   "Short video"],
  Sat: ["Carousel", "Image",   "Carousel"],
  Sun: ["Carousel", "Image",   "Carousel"],
};

const HASHTAG_SETS: Record<PostCategory | "base" | "gameday", string[]> = {
  base:              ["#AFL", "#AFLStats", "#FootyStats", "#AFL2026", "#NeekoSportsStats"],
  gameday:           ["#AFL", "#AFLStats", "#ThursdayFooty", "#SaturdayFooty", "#SundayFooty", "#NeekoSportsStats"],
  "Disposal Trend":  ["#AFL", "#AFLStats", "#Disposals", "#PlayerStats", "#AFL2026", "#NeekoSportsStats"],
  "Goal Trend":      ["#AFL", "#AFLGoals", "#AFLStats", "#FootyStats", "#AFL2026", "#NeekoSportsStats"],
  "Tackle Trend":    ["#AFL", "#Tackles", "#AFLStats", "#AFLFantasy", "#AFL2026", "#NeekoSportsStats"],
  "Form Mover":      ["#AFL", "#AFLStats", "#FootyStats", "#FormGuide", "#AFL2026", "#NeekoSportsStats"],
  "Team Total":      ["#AFL", "#TeamStats", "#AFLStats", "#FootyStats", "#AFL2026", "#NeekoSportsStats"],
  "Matchup Angle":   ["#AFL", "#AFLStats", "#Matchup", "#FootyStats", "#AFL2026", "#NeekoSportsStats"],
  "Round Preview":   ["#AFL", "#AFLStats", "#FootyStats", "#AFL2026", "#NeekoSportsStats"],
  "Round Wrap":      ["#AFL", "#AFLStats", "#FootyStats", "#AFL2026", "#NeekoSportsStats"],
  "Proof Post":      ["#AFL", "#AFLStats", "#FootyStats", "#AFL2026", "#NeekoSportsStats"],
};

const SAFE_SIGN_OFFS = [
  "See the data. Make your own call.",
  "Stats over gut feel.",
  "No odds. No tips. Just AFL stats made easier to read.",
  "Player form, hit rates and recent trends laid out clearly.",
  "The numbers don't make the decision for you — they make it clearer.",
  "Full board at Neeko Sports Stats.",
];

// ─── Utility helpers ──────────────────────────────────────────────────────────

function signOff(idx = 0): string {
  return SAFE_SIGN_OFFS[idx % SAFE_SIGN_OFFS.length];
}

function pct(rate: number): string {
  const v = rate > 1 ? rate : rate * 100;
  return `${Math.round(v)}%`;
}

function getHitRate(p: StatBoardPlayer, threshold: number): number {
  return p.all_threshold_hit_rates?.[String(threshold)]?.rate ?? 0;
}

function getL5Avg(p: StatBoardPlayer): number {
  return p.last_5_avg ?? p.season_avg ?? 0;
}

function getSeasonAvg(p: StatBoardPlayer): number {
  return p.season_avg ?? 0;
}

function formDelta(p: StatBoardPlayer): number {
  const l5 = p.last_5_avg ?? 0;
  const s = p.season_avg ?? 0;
  return s > 0 ? l5 - s : 0;
}

function isPositiveFormMover(p: StatBoardPlayer): boolean {
  return formDelta(p) >= 4 && (p.last_5_avg ?? 0) >= 18;
}

function getTeamL5Avg(t: StatBoardTeamRow): number {
  return t.recent_avg_l5 ?? t.season_avg ?? 0;
}

function getTeamSeasonAvg(t: StatBoardTeamRow): number {
  return t.season_avg ?? 0;
}

// Whether a match's game_date is in the future (upcoming/not played)
function isUpcoming(match: StatBoardMatch): boolean {
  return new Date(match.game_date).getTime() > Date.now();
}

function isCompleted(match: StatBoardMatch): boolean {
  return new Date(match.game_date).getTime() < Date.now() - 3 * 60 * 60 * 1000; // 3h buffer
}

// ─── Best-threshold assignment ────────────────────────────────────────────────

/**
 * Returns the highest disposal threshold bucket a player genuinely belongs to.
 * Uses L5 avg, season avg, and hit rates to determine.
 * Hard rule: a player who qualifies for 30+ must NOT appear in a 20+ post.
 */
function bestDisposalThreshold(p: StatBoardPlayer): 30 | 25 | 20 | 15 | 10 {
  const l5  = p.last_5_avg  ?? 0;
  const sea = p.season_avg  ?? 0;
  const hr30 = getHitRate(p, 30);
  const hr25 = getHitRate(p, 25);
  const hr20 = getHitRate(p, 20);
  const hr15 = getHitRate(p, 15);

  // 30+ bucket: L5 or season avg >= 29.5, OR hit rate at 30 is strong
  if (l5 >= 29.5 || sea >= 29.5 || hr30 >= 0.45) return 30;

  // 25+ bucket: L5 or season avg >= 24.5, OR strong hit rate at 25
  if (l5 >= 24.5 || sea >= 24.5 || hr25 >= 0.55) return 25;

  // 20+ bucket: L5 or season avg >= 19.5, OR strong hit rate at 20
  if (l5 >= 19.5 || sea >= 19.5 || hr20 >= 0.60) return 20;

  // 15+ bucket: L5 or season avg >= 14.5, OR hit rate at 15
  if (l5 >= 14.5 || sea >= 14.5 || hr15 >= 0.60) return 15;

  return 10;
}

/**
 * Returns the highest goal threshold bucket a player genuinely belongs to.
 */
function bestGoalThreshold(p: StatBoardPlayer): 3 | 2 | 1 {
  const hr3 = getHitRate(p, 3);
  const hr2 = getHitRate(p, 2);
  const hr1 = getHitRate(p, 1);
  const l5  = p.last_5_avg ?? 0;

  if (l5 >= 2.5 || hr3 >= 0.35) return 3;
  if (l5 >= 1.5 || hr2 >= 0.45) return 2;
  if (hr1 >= 0.50) return 1;
  return 1;
}

// ─── Anti-duplication player selector ────────────────────────────────────────

/**
 * Returns top-N disposal players for a given threshold,
 * excluding players already used at higher thresholds.
 */
function selectDisposalPlayers(
  pool: StatBoardPlayer[],
  threshold: number,
  excludeIds: Set<number>,
  minHitRate: number,
  n: number,
): StatBoardPlayer[] {
  const candidates = pool
    .filter(p => !excludeIds.has(p.player_id) && getHitRate(p, threshold) >= minHitRate)
    .sort((a, b) => getHitRate(b, threshold) - getHitRate(a, threshold));
  // If not enough, fill from next-best without exclusion
  if (candidates.length >= n) return candidates.slice(0, n);
  const fillers = pool
    .filter(p => !candidates.some(c => c.player_id === p.player_id) && getHitRate(p, threshold) >= minHitRate * 0.7)
    .sort((a, b) => getHitRate(b, threshold) - getHitRate(a, threshold));
  return [...candidates, ...fillers].slice(0, n);
}

// ─── Post builder ─────────────────────────────────────────────────────────────

let _postCounter = 0;
function nextId(prefix: string): string {
  return `spp-${prefix}-${++_postCounter}`;
}

function makePost(args: {
  day: DayOfWeek;
  postNumber: 1 | 2 | 3;
  type: PostType;
  category: PostCategory;
  intent: PostIntent;
  statLens: StatLens;
  confidence: ConfidenceLevel;
  title: string;
  content: string;
  statsShown: string[];
  onScreenText: string;
  caption: string;
  hashtags: string[];
  suggestedVisual: string;
  imageDescription: string;
  dataScope: string;
  targetGame: string | null;
  targetGameStatus: "upcoming" | "completed" | "any" | null;
  fallbackWarning: string | null;
  players: StatBoardPlayer[];
  teams?: string[];
  thresholdLabel: string;
  isBackup?: boolean;
  tone?: CopyTone;
}): SocialPost {
  const {
    day, postNumber, type, category, intent, statLens, confidence,
    title, content, statsShown, onScreenText, caption, hashtags,
    suggestedVisual, imageDescription, dataScope, targetGame, targetGameStatus,
    fallbackWarning, players, teams = [], thresholdLabel,
    isBackup = false, tone = "clean_stats",
  } = args;
  return {
    id: nextId(`${day}-${postNumber}`),
    day, postNumber, postTime: POST_TIMES[day][postNumber - 1],
    type, category, intent, statLens, confidence,
    title, content, statsShown, onScreenText, caption, hashtags,
    suggestedVisual, imageDescription, dataScope, targetGame, targetGameStatus,
    fallbackWarning,
    playerNames: players.map(p => p.player_name).filter(Boolean),
    teamNames: teams.filter(Boolean),
    thresholdLabel, isBackup, tone,
  };
}

// ─── Caption builder ──────────────────────────────────────────────────────────

function buildCaption(hook: string, bullets: string[], signOffIdx = 0): string {
  return [hook, "", ...bullets.map(b => `• ${b}`), "", signOff(signOffIdx)].join("\n");
}

// ─── Weekly plan generation ───────────────────────────────────────────────────

function buildWeeklyPlan(data: CIDataSubset): { schedule: SocialPost[]; backup: SocialPost[]; excludedCount: number } {
  _postCounter = 0;
  const schedule: SocialPost[] = [];
  const backup: SocialPost[] = [];
  const rl = data.roundLabel;

  const upcomingMatches = data.matches.filter(isUpcoming);
  const completedMatches = data.matches.filter(isCompleted);

  // ── Unavailability filter ─────────────────────────────────────────────────
  // Exclude injured/suspended/inactive players from all post candidate pools.
  const unavailable = data.unavailablePlayerIds ?? new Set<number>();
  const isAvailable = (p: StatBoardPlayer) => !unavailable.has(p.player_id);

  // ── Sorted player pools ───────────────────────────────────────────────────

  const dispPool = [...data.disposalPlayers]
    .filter(p => isAvailable(p) && getSeasonAvg(p) >= 13 && (p.games_played ?? 0) >= 3)
    .sort((a, b) => getL5Avg(b) - getL5Avg(a));

  const goalPool = [...data.goalPlayers]
    .filter(p => isAvailable(p) && (p.games_played ?? 0) >= 3)
    .sort((a, b) => getHitRate(b, 1) - getHitRate(a, 1) || getL5Avg(b) - getL5Avg(a));

  const excludedCount = [...data.disposalPlayers, ...data.goalPlayers]
    .filter(p => unavailable.has(p.player_id))
    .reduce((set, p) => (set.add(p.player_id), set), new Set<number>()).size;

  const formMovers = [...data.disposalPlayers]
    .filter(p => isAvailable(p) && isPositiveFormMover(p))
    .sort((a, b) => formDelta(b) - formDelta(a));

  const tacklePlayers = [...data.disposalPlayers]
    .filter(p => getHitRate(p, 5) >= 0.5 && (p.games_played ?? 0) >= 3)
    .sort((a, b) => getHitRate(b, 5) - getHitRate(a, 5));

  const teamScoreRows = [...(data.teamScore || [])]
    .filter(t => (t.recent_games_count ?? 0) >= 3)
    .sort((a, b) => getTeamL5Avg(b) - getTeamL5Avg(a));

  // ── Threshold-segmented disposal pools ───────────────────────────────────
  // Each player belongs to exactly one bucket: their best/highest supported threshold.
  // Hard rule: a player in pool30 must NOT appear in pool25/pool20/pool15.
  const pool30 = dispPool
    .filter(p => bestDisposalThreshold(p) === 30)
    .sort((a, b) => getL5Avg(b) - getL5Avg(a));

  const pool25 = dispPool
    .filter(p => bestDisposalThreshold(p) === 25)
    .sort((a, b) => getHitRate(b, 25) - getHitRate(a, 25) || getL5Avg(b) - getL5Avg(a));

  const pool20 = dispPool
    .filter(p => bestDisposalThreshold(p) === 20)
    .sort((a, b) => getHitRate(b, 20) - getHitRate(a, 20) || getL5Avg(b) - getL5Avg(a));

  const pool15 = dispPool
    .filter(p => bestDisposalThreshold(p) === 15)
    .sort((a, b) => getHitRate(b, 15) - getHitRate(a, 15) || getL5Avg(b) - getL5Avg(a));

  // Combined high-volume pool (30+/25+) for elite posts
  const poolElite = [...pool30, ...pool25]
    .sort((a, b) => getL5Avg(b) - getL5Avg(a));

  // Legacy compat: top25/top20/top15 now draw from segmented pools
  const top25 = (pool25.length >= 3 ? pool25 : poolElite).slice(0, 5);
  const top20 = (pool20.length >= 2 ? pool20 : pool25.slice(0, 5)).slice(0, 5);
  const top15 = (pool15.length >= 2 ? pool15 : pool20.slice(0, 5)).slice(0, 5);

  // ── Threshold-segmented goal pools ───────────────────────────────────────
  const goalPool3 = goalPool.filter(p => bestGoalThreshold(p) === 3);
  const goalPool2 = goalPool.filter(p => bestGoalThreshold(p) === 2);
  const goalPool1 = goalPool.filter(p => bestGoalThreshold(p) === 1);

  // Helper for match label
  const firstUpcoming = upcomingMatches[0];
  const upcomingGameLabel = firstUpcoming
    ? `${firstUpcoming.home_team_name} v ${firstUpcoming.away_team_name}`
    : null;

  // ── MONDAY ────────────────────────────────────────────────────────────────

  // Post 1 — Weekend proof / recap (Carousel)
  // Uses threshold-correct pool: picks the most represented bucket (30+, 25+, or 20+)
  {
    const hasCompleted = completedMatches.length > 0;

    // Choose the best-populated threshold pool for the proof post
    const proofPool30 = pool30.slice(0, 5);
    const proofPool25 = pool25.slice(0, 5);
    const proofPool20 = pool20.slice(0, 5);

    let proofPlayers: StatBoardPlayer[];
    let proofThreshold: string;
    let proofHook: string;

    if (proofPool30.length >= 3) {
      proofPlayers = proofPool30;
      proofThreshold = "30+ Disposals";
      proofHook = hasCompleted
        ? `${rl} wrapped. Elite disposal form — here's how the big numbers held up.`
        : `Elite disposal form heading into ${rl}. Who's been clearing 30+?`;
    } else if (poolElite.length >= 3) {
      proofPlayers = poolElite.slice(0, 5);
      proofThreshold = "25–30+ Disposals";
      proofHook = hasCompleted
        ? `${rl} wrapped. High-volume disposal form — the 25+ and 30+ performers.`
        : `High-volume disposal form heading into ${rl}.`;
    } else if (proofPool20.length >= 3) {
      proofPlayers = proofPool20;
      proofThreshold = "20+ Disposals";
      proofHook = hasCompleted
        ? `${rl} wrapped. Here's how the disposal form held up across the weekend.`
        : `${rl} is underway. Key 20+ disposal performers tracked.`;
    } else {
      proofPlayers = dispPool.slice(0, 5);
      proofThreshold = "Disposal Form";
      proofHook = hasCompleted
        ? `${rl} wrapped. Here's how disposal form held up across the weekend.`
        : `${rl} disposal form leaders.`;
    }

    // For proof posts, show threshold-matched hit rate
    const thrNum = proofThreshold === "30+ Disposals" ? 30
      : proofThreshold === "20+ Disposals" ? 20 : 25;
    const bullets = proofPlayers.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, thrNum))} hit rate at ${thrNum}+, L5 avg ${getL5Avg(p).toFixed(1)}`
    );

    // Title and category depend on whether we have completed data
    const postTitle = hasCompleted
      ? `${rl} — weekend ${proofThreshold.toLowerCase()} recap`
      : `${rl} — ${proofThreshold.toLowerCase()} watchlist`;
    const postCategory: PostCategory = hasCompleted ? "Proof Post" : "Round Wrap";
    const postIntent: PostIntent = "recap";

    schedule.push(makePost({
      day: "Mon", postNumber: 1,
      type: "Carousel",
      category: postCategory, intent: postIntent,
      statLens: "disposals", confidence: proofPlayers.length >= 3 ? "High" : "Fallback",
      title: postTitle,
      content: proofHook,
      statsShown: bullets,
      onScreenText: hasCompleted ? "Weekend disposal recap" : "Disposal watchlist",
      caption: buildCaption(proofHook, bullets, 0),
      hashtags: HASHTAG_SETS[postCategory],
      suggestedVisual: `Stat card grid — top 5 ${proofThreshold.toLowerCase()} players vs their L5 average`,
      imageDescription: `Carousel graphic. Each slide shows one player: name, team, ${proofThreshold} hit rate as a large number, L5 average. Clean dark background, AFL team colours. No betting language. ${proofPlayers.length} players total.`,
      dataScope: hasCompleted ? "Completed weekend games" : `${rl} disposal player pool`,
      targetGame: hasCompleted ? "Weekend completed games" : null,
      targetGameStatus: hasCompleted ? "completed" : "any",
      fallbackWarning: hasCompleted ? null : "No completed game data — showing season/L5 form as watchlist preview instead of proof post.",
      players: proofPlayers,
      thresholdLabel: proofThreshold,
    }));
  }

  // Post 2 — Positive form movers (Image)
  {
    const movers = formMovers.slice(0, 5);
    const hasMover = movers.length >= 2;
    const pool = hasMover ? movers : dispPool.slice(0, 4);
    const bullets = pool.map(p => {
      const d = formDelta(p);
      return `${p.player_name} (${p.team_name ?? ""}) — L5 avg ${(p.last_5_avg ?? 0).toFixed(1)} (${d >= 0 ? "+" : ""}${d.toFixed(1)} vs season avg ${(p.season_avg ?? 0).toFixed(1)})`;
    });
    const hook = hasMover
      ? `Players trending well above their season average. Form is real — the numbers back it up.`
      : `Recent disposal form leaders heading into the next round.`;
    schedule.push(makePost({
      day: "Mon", postNumber: 2,
      type: "Image",
      category: "Form Mover", intent: "recap",
      statLens: "disposals", confidence: hasMover ? "High" : "Medium",
      title: `Positive form movers — ${rl}`,
      content: hook,
      statsShown: bullets,
      onScreenText: "Form movers",
      caption: buildCaption(hook, bullets, 1),
      hashtags: HASHTAG_SETS["Form Mover"],
      suggestedVisual: "Up-arrow graphic with player name, L5 avg, and delta vs season avg",
      imageDescription: `Static image. Up-arrow visual. Each row: player name, team, L5 avg, and delta vs season avg (e.g. +4.2). ${pool.length} players. Dark background, green accent arrows for positive deltas.`,
      dataScope: `${rl} disposal player pool`,
      targetGame: null, targetGameStatus: "any",
      fallbackWarning: hasMover ? null : "Fallback: insufficient form mover candidates",
      players: pool,
      thresholdLabel: "Form Risers",
    }));
  }

  // Post 3 — Weekend recap (Carousel)
  {
    const teams = teamScoreRows.slice(0, 5);
    const hasTeams = teams.length >= 2;
    const bullets = hasTeams
      ? teams.map(t => `${t.team_name ?? ""} — L5 avg ${getTeamL5Avg(t).toFixed(1)} pts (season avg ${getTeamSeasonAvg(t).toFixed(1)})`)
      : ["Team scoring data not available for this round."];
    const hook = `Team scoring trends from ${rl}. Who's running hot on the scoreboard?`;
    schedule.push(makePost({
      day: "Mon", postNumber: 3,
      type: "Carousel",
      category: "Team Total", intent: "recap",
      statLens: "team-total", confidence: hasTeams ? "Medium" : "Fallback",
      title: `${rl} team scoring recap`,
      content: hook,
      statsShown: bullets,
      onScreenText: "Team scoring trends",
      caption: buildCaption(hook, bullets, 2),
      hashtags: HASHTAG_SETS["Team Total"],
      suggestedVisual: "Bar chart of top-scoring teams, L5 vs season average",
      imageDescription: `Carousel. Each slide shows one team: name, logo placeholder, L5 average score, and season average score side by side. ${teams.length} teams. Clean layout, neutral dark background.`,
      dataScope: `${rl} team score rows`,
      targetGame: null, targetGameStatus: "any",
      fallbackWarning: hasTeams ? null : "Fallback: insufficient team score data",
      players: [], teams: teams.map(t => t.team_name ?? "").filter(Boolean),
      thresholdLabel: "Team Score",
    }));
  }

  // ── TUESDAY ───────────────────────────────────────────────────────────────

  // Post 1 — Top 5 for 25+/30+ disposals (Image)
  // Uses segmented pool: if pool30 is large enough, promote to 30+ post
  {
    let tue1Players: StatBoardPlayer[];
    let tue1Threshold: string;
    let tue1ThrNum: number;
    let tue1Title: string;
    let tue1Hook: string;
    let tue1Fallback: string | null = null;

    if (pool30.length >= 3) {
      tue1Players = pool30.slice(0, 5);
      tue1Threshold = "30+ Disposals";
      tue1ThrNum = 30;
      tue1Title = `Top 5 for 30+ disposals — ${rl}`;
      tue1Hook = `Elite disposal volume. Who's been clearing 30+ consistently heading into ${rl}?`;
    } else if (pool25.length >= 3) {
      tue1Players = pool25.slice(0, 5);
      tue1Threshold = "25+ Disposals";
      tue1ThrNum = 25;
      tue1Title = `Top 5 for 25+ disposals — ${rl}`;
      tue1Hook = `Top disposers heading into ${rl}. Who's been clearing 25+ consistently?`;
    } else {
      // Not enough 25+ or 30+ players — use combined elite pool
      tue1Players = poolElite.length >= 2 ? poolElite.slice(0, 5) : dispPool.slice(0, 5);
      tue1Threshold = "25–30+ Disposals";
      tue1ThrNum = 25;
      tue1Title = `High-volume disposal form — ${rl}`;
      tue1Hook = `High-volume disposers heading into ${rl}. Numbers that matter.`;
      tue1Fallback = pool25.length < 3 ? "Low 25+ candidate count — combined 25+/30+ pool used" : null;
    }

    const tue1Bullets = tue1Players.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, tue1ThrNum))} at ${tue1ThrNum}+, L5 avg ${getL5Avg(p).toFixed(1)}`
    );
    schedule.push(makePost({
      day: "Tue", postNumber: 1,
      type: "Image",
      category: "Disposal Trend", intent: "cross_game_preview",
      statLens: "disposals", confidence: tue1Fallback ? "Fallback" : "High",
      title: tue1Title,
      content: tue1Hook,
      statsShown: tue1Bullets,
      onScreenText: `${tue1ThrNum}+ disposal form`,
      caption: buildCaption(tue1Hook, tue1Bullets, 3),
      hashtags: HASHTAG_SETS["Disposal Trend"],
      suggestedVisual: `5-player stat grid — name, team, ${tue1ThrNum}+ hit rate, L5 avg`,
      imageDescription: `Static image. 5-player stat grid. Threshold: ${tue1ThrNum}+ disposals. Each row: player name, team abbreviation, ${tue1ThrNum}+ hit rate percentage, L5 average. Dark background, stat values highlighted. No betting language.`,
      dataScope: `${rl} cross-game disposal pool`,
      targetGame: upcomingGameLabel, targetGameStatus: upcomingGameLabel ? "upcoming" : "any",
      fallbackWarning: tue1Fallback,
      players: tue1Players, thresholdLabel: tue1Threshold,
    }));
  }

  // Post 2 — Top 5 for 20+ disposals (Image) — only players whose best threshold is 20+
  {
    // pool20 contains ONLY players whose highest supported line is 20+ (not 25+ or 30+)
    let tue2Players: StatBoardPlayer[];
    let isFallback = false;

    if (pool20.length >= 3) {
      tue2Players = pool20.slice(0, 5);
    } else if (pool20.length >= 1) {
      // Supplement with 15+ players if necessary but never with 25+/30+
      tue2Players = [...pool20, ...pool15].slice(0, 5);
      isFallback = true;
    } else {
      // No genuine 20+ players — downgrade to preview/watchlist instead
      tue2Players = pool15.slice(0, 5);
      isFallback = true;
    }

    const tue2ThrNum = pool20.length >= 2 ? 20 : 15;
    const tue2Threshold = `${tue2ThrNum}+ Disposals`;
    const hook = pool20.length >= 3
      ? `Solid ${tue2ThrNum}+ disposal form — players whose most relevant content line sits around ${tue2ThrNum}+.`
      : `Volume disposers in the ${tue2ThrNum}+ range heading into ${rl}.`;
    const tue2Bullets = tue2Players.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, tue2ThrNum))} at ${tue2ThrNum}+, L5 avg ${getL5Avg(p).toFixed(1)}`
    );
    schedule.push(makePost({
      day: "Tue", postNumber: 2,
      type: "Image",
      category: "Disposal Trend", intent: "cross_game_preview",
      statLens: "disposals", confidence: isFallback ? "Medium" : "High",
      title: `Top 5 for ${tue2ThrNum}+ disposals — ${rl}`,
      content: hook,
      statsShown: tue2Bullets,
      onScreenText: `${tue2ThrNum}+ disposal form`,
      caption: buildCaption(hook, tue2Bullets, 4),
      hashtags: HASHTAG_SETS["Disposal Trend"],
      suggestedVisual: `5-player stat grid — name, team, ${tue2ThrNum}+ hit rate, L5 avg`,
      imageDescription: `Static image. 5-player stat grid. Threshold: ${tue2ThrNum}+ disposals. Each row: player name, team abbreviation, ${tue2ThrNum}+ hit rate, L5 average. These players sit in the ${tue2ThrNum}+ tier only — not the higher tiers. Dark background.`,
      dataScope: `${rl} cross-game disposal pool (${tue2ThrNum}+ tier only)`,
      targetGame: upcomingGameLabel, targetGameStatus: upcomingGameLabel ? "upcoming" : "any",
      fallbackWarning: isFallback ? `Low ${tue2ThrNum}+ candidate count — pool supplemented with adjacent tier` : null,
      players: tue2Players, thresholdLabel: tue2Threshold,
    }));
  }

  // Post 3 — Disposal ladder (Carousel)
  {
    const tiers: Array<{ thr: number; label: string; players: StatBoardPlayer[] }> = [
      { thr: 25, label: "25+", players: top25.slice(0, 3) },
      { thr: 20, label: "20+", players: top20.slice(0, 3) },
      { thr: 15, label: "15+", players: top15.slice(0, 3) },
    ];
    const bullets = tiers.flatMap(t =>
      t.players.length > 0
        ? [`${t.label}: ${t.players.map(p => `${p.player_name} ${pct(getHitRate(p, t.thr))}`).join(", ")}`]
        : []
    );
    const hook = `Disposal ladder for ${rl} — 15+, 20+, 25+ tiers. Different names, different thresholds.`;
    schedule.push(makePost({
      day: "Tue", postNumber: 3,
      type: "Carousel",
      category: "Disposal Trend", intent: "cross_game_preview",
      statLens: "disposals", confidence: bullets.length >= 2 ? "High" : "Medium",
      title: `Disposal ladder — ${rl}`,
      content: hook,
      statsShown: bullets,
      onScreenText: "Disposal tiers",
      caption: buildCaption(hook, bullets, 5),
      hashtags: HASHTAG_SETS["Disposal Trend"],
      suggestedVisual: "3-slide carousel — one slide per threshold tier (25+, 20+, 15+)",
      imageDescription: `3-slide carousel. Slide 1: 25+ disposal tier — 3 player names with hit rates. Slide 2: 20+ disposal tier — 3 player names with hit rates. Slide 3: 15+ disposal tier — 3 player names with hit rates. Each slide has a tier label as headline. Dark background, consistent layout.`,
      dataScope: `${rl} cross-game disposal pool — all 3 tiers`,
      targetGame: null, targetGameStatus: "any",
      fallbackWarning: bullets.length < 2 ? "Fallback: insufficient tier data" : null,
      players: [...top25, ...top20, ...top15], thresholdLabel: "15+/20+/25+ Disposals",
    }));
  }

  // ── WEDNESDAY ─────────────────────────────────────────────────────────────

  // Post 1 — Top goal scorers — threshold-aware (uses best threshold per pool)
  {
    // Choose the most interesting threshold bucket with enough candidates
    let wedGoalPlayers: StatBoardPlayer[];
    let wedGoalThr: number;
    let wedGoalLabel: string;

    if (goalPool3.length >= 3) {
      wedGoalPlayers = goalPool3.slice(0, 5);
      wedGoalThr = 3;
      wedGoalLabel = "3+ Goals";
    } else if (goalPool2.length >= 3) {
      wedGoalPlayers = goalPool2.slice(0, 5);
      wedGoalThr = 2;
      wedGoalLabel = "2+ Goals";
    } else if (goalPool3.length + goalPool2.length >= 3) {
      wedGoalPlayers = [...goalPool3, ...goalPool2].slice(0, 5);
      wedGoalThr = 2;
      wedGoalLabel = "2–3+ Goals";
    } else {
      wedGoalPlayers = goalPool.slice(0, 5);
      wedGoalThr = 1;
      wedGoalLabel = "1+ Goals";
    }

    const bullets = wedGoalPlayers.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, wedGoalThr))} at ${wedGoalThr}+, L5 avg ${getL5Avg(p).toFixed(1)}`
    );
    const hook = `Top goal-scorers at the ${wedGoalLabel} threshold heading into ${rl}.`;
    schedule.push(makePost({
      day: "Wed", postNumber: 1,
      type: "Image",
      category: "Goal Trend", intent: "cross_game_preview",
      statLens: "goals", confidence: wedGoalPlayers.length >= 3 ? "High" : "Medium",
      title: `Top 5 for ${wedGoalLabel} — ${rl}`,
      content: hook,
      statsShown: bullets,
      onScreenText: `${wedGoalLabel} form`,
      caption: buildCaption(hook, bullets, 0),
      hashtags: HASHTAG_SETS["Goal Trend"],
      suggestedVisual: `5-player stat grid — name, team, ${wedGoalThr}+ goal hit rate, L5 avg`,
      imageDescription: `Static image. 5-player stat grid. Threshold: ${wedGoalLabel}. Each row: player name, team, ${wedGoalThr}+ goal hit rate as percentage, L5 average. Dark background, clean layout. No betting language.`,
      dataScope: `${rl} cross-game goal pool (${wedGoalLabel} tier)`,
      targetGame: null, targetGameStatus: "any",
      fallbackWarning: wedGoalPlayers.length < 3 ? "Fallback: low goal player count" : null,
      players: wedGoalPlayers, thresholdLabel: wedGoalLabel,
    }));
  }

  // Post 2 — Top tackle trends (Carousel)
  {
    const players = tacklePlayers.slice(0, 5);
    const hasTackle = players.length >= 3;
    const pool = hasTackle ? players : dispPool.slice(0, 4);
    const bullets = hasTackle
      ? players.map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, 5))} at 5+ tackles, L5 avg ${getL5Avg(p).toFixed(1)} disposals`)
      : pool.map(p => `${p.player_name} (${p.team_name ?? ""}) — L5 avg ${getL5Avg(p).toFixed(1)}, ${pct(getHitRate(p, 20))} at 20+`);
    const hook = hasTackle
      ? `Tackle machines heading into ${rl}. These players consistently hit 5+ per game.`
      : `Mid-week stat update — disposal form for ${rl}.`;
    schedule.push(makePost({
      day: "Wed", postNumber: 2,
      type: "Carousel",
      category: hasTackle ? "Tackle Trend" : "Disposal Trend", intent: "cross_game_preview",
      statLens: hasTackle ? "tackles" : "disposals", confidence: hasTackle ? "High" : "Fallback",
      title: hasTackle ? `Top tackle trends — ${rl}` : `Disposal form update — ${rl}`,
      content: hook,
      statsShown: bullets,
      onScreenText: hasTackle ? "Tackle form" : "Disposal form",
      caption: buildCaption(hook, bullets, 1),
      hashtags: hasTackle ? HASHTAG_SETS["Tackle Trend"] : HASHTAG_SETS["Disposal Trend"],
      suggestedVisual: hasTackle ? "5-player tackle form grid" : "Disposal form grid",
      imageDescription: hasTackle
        ? `Carousel. ${players.length} slides — one player per slide. Shows name, team, 5+ tackle hit rate, and L5 disposal average. Dark background with tackle-focused design.`
        : `Carousel. ${pool.length} players shown. Disposal form update graphic with name, team, L5 average. Clean layout, neutral dark background.`,
      dataScope: `${rl} cross-game player pool`,
      targetGame: null, targetGameStatus: "any",
      fallbackWarning: hasTackle ? null : "Fallback: insufficient tackle data — using disposal trend",
      players: hasTackle ? players : pool, thresholdLabel: hasTackle ? "5+ Tackles" : "20+ Disposals",
    }));
  }

  // Post 3 — Round quick stats / mixed (Image)
  {
    const topDisp = dispPool.slice(0, 3);
    const topGoal = goalPool.slice(0, 2);
    const bullets = [
      ...topDisp.map(p => `${p.player_name} — ${getL5Avg(p).toFixed(1)} disp L5 avg`),
      ...topGoal.map(p => `${p.player_name} — ${getL5Avg(p).toFixed(1)} goals L5 avg`),
    ];
    const hook = `Quick stat snapshot for ${rl}. Disposals, goals — numbers that matter.`;
    schedule.push(makePost({
      day: "Wed", postNumber: 3,
      type: "Image",
      category: "Round Preview", intent: "cross_game_preview",
      statLens: "disposals", confidence: bullets.length >= 3 ? "High" : "Medium",
      title: `${rl} quick stats snapshot`,
      content: hook,
      statsShown: bullets,
      onScreenText: "Round at a glance",
      caption: buildCaption(hook, bullets, 2),
      hashtags: HASHTAG_SETS["Round Preview"],
      suggestedVisual: "Mixed stat card — disposals section + goals section on one image",
      imageDescription: `Static image split into two sections. Top section: top 3 disposal players (name, L5 average). Bottom section: top 2 goal scorers (name, L5 average). Headline: "${rl} at a glance". Dark background, two-column or stacked layout.`,
      dataScope: `${rl} mixed player pool`,
      targetGame: null, targetGameStatus: "any",
      fallbackWarning: null,
      players: [...topDisp, ...topGoal], thresholdLabel: "Mixed Stats",
    }));
  }

  // ── THURSDAY ──────────────────────────────────────────────────────────────

  // Post 1 — Round stat watchlist (Carousel)
  {
    // Use the best-populated threshold for the watchlist reference stat
    const thu1ThrNum = pool30.length >= 3 ? 30 : pool25.length >= 3 ? 25 : 20;
    const thu1ThrLabel = `${thu1ThrNum}+ Disposals`;
    const players = dispPool.slice(0, 6);
    const bullets = players.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — L5 avg ${getL5Avg(p).toFixed(1)}, ${pct(getHitRate(p, thu1ThrNum))} at ${thu1ThrNum}+, season avg ${getSeasonAvg(p).toFixed(1)}`
    );
    const hook = `${rl} stat watchlist. These names have the numbers. See the data, make your own call.`;
    schedule.push(makePost({
      day: "Thu", postNumber: 1,
      type: "Carousel",
      category: "Round Preview", intent: "cross_game_preview",
      statLens: "disposals", confidence: players.length >= 3 ? "High" : "Medium",
      title: `${rl} stat watchlist`,
      content: hook,
      statsShown: bullets,
      onScreenText: "Stat watchlist",
      caption: buildCaption(hook, bullets, 3),
      hashtags: HASHTAG_SETS["Round Preview"],
      suggestedVisual: `6-player watchlist card — name, team, L5 avg, ${thu1ThrNum}+ hit rate`,
      imageDescription: `Carousel. 6-player watchlist. Each slide: player name, team, L5 average, ${thu1ThrNum}+ hit rate, season average. Headline: "${rl} Stat Watchlist". Dark background, clean stat rows.`,
      dataScope: `${rl} cross-game disposal pool`,
      targetGame: null, targetGameStatus: "any",
      fallbackWarning: null,
      players, thresholdLabel: thu1ThrLabel,
    }));
  }

  // Post 2 — Thursday game quick stats (Image) — only upcoming Thu games
  {
    const thuMatches = upcomingMatches.filter(m => {
      const d = new Date(m.game_date);
      return d.getDay() === 4; // Thursday
    });
    const hasThuGame = thuMatches.length > 0;
    const gamePlayers = hasThuGame
      ? dispPool.filter(p => thuMatches.some(m => m.home_team_id === p.team_id || m.away_team_id === p.team_id)).slice(0, 5)
      : dispPool.slice(0, 5);
    const thu2ThrNum = hasThuGame
      ? (pool30.filter(p => thuMatches.some(m => m.home_team_id === p.team_id || m.away_team_id === p.team_id)).length >= 2 ? 30
        : pool25.filter(p => thuMatches.some(m => m.home_team_id === p.team_id || m.away_team_id === p.team_id)).length >= 2 ? 25 : 20)
      : (pool30.length >= 3 ? 30 : pool25.length >= 3 ? 25 : 20);
    const thu2ThrLabel = `${thu2ThrNum}+ Disposals`;
    const bullets = gamePlayers.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — L5 avg ${getL5Avg(p).toFixed(1)}, ${pct(getHitRate(p, thu2ThrNum))} at ${thu2ThrNum}+`
    );
    const gameLabel = hasThuGame ? thuMatches.map(m => `${m.home_team_name} v ${m.away_team_name}`).join(", ") : null;
    const hook = hasThuGame
      ? `Quick stats for tonight's game${thuMatches.length > 1 ? "s" : ""}. ${gameLabel}.`
      : `${rl} stat update — key disposal form players.`;
    schedule.push(makePost({
      day: "Thu", postNumber: 2,
      type: "Image",
      category: "Round Preview", intent: hasThuGame ? "same_day_preview" : "cross_game_preview",
      statLens: "disposals", confidence: gamePlayers.length >= 3 ? "High" : "Medium",
      title: hasThuGame ? `Thursday game quick stats` : `${rl} mid-week stats`,
      content: hook,
      statsShown: bullets,
      onScreenText: hasThuGame ? "Tonight's form" : "Stat update",
      caption: buildCaption(hook, bullets, 4),
      hashtags: hasThuGame ? HASHTAG_SETS.gameday : HASHTAG_SETS["Round Preview"],
      suggestedVisual: hasThuGame ? "Game-specific stat card with team colours" : "Generic stat card",
      imageDescription: hasThuGame
        ? `Static image. Game-specific stat card for ${gameLabel ?? "Thursday game"}. ${gamePlayers.length} players: name, team, L5 average, ${thu2ThrNum}+ hit rate. Team colours as accents. Dark background.`
        : `Static image. Cross-round disposal stat update. ${gamePlayers.length} players: name, team, L5 average. Clean layout, neutral dark background.`,
      dataScope: hasThuGame ? `Thursday upcoming games only` : `${rl} cross-game pool`,
      targetGame: gameLabel,
      targetGameStatus: hasThuGame ? "upcoming" : "any",
      fallbackWarning: hasThuGame ? null : "Fallback: no Thursday upcoming game found — using cross-game stats",
      players: gamePlayers, thresholdLabel: thu2ThrLabel,
    }));
  }

  // Post 3 — One stat before bounce (Image or Short video)
  {
    const thuMatches = upcomingMatches.filter(m => new Date(m.game_date).getDay() === 4);
    const hasThuGame = thuMatches.length > 0;
    const spotlight = hasThuGame
      ? dispPool.filter(p => thuMatches.some(m => m.home_team_id === p.team_id || m.away_team_id === p.team_id)).slice(0, 1)
      : dispPool.slice(0, 1);
    const player = spotlight[0];
    const thu3ThrNum = (() => {
      if (!player) return 20;
      return bestDisposalThreshold(player) === 30 ? 30 : bestDisposalThreshold(player) === 25 ? 25 : 20;
    })();
    const thu3ThrLabel = `${thu3ThrNum}+ Disposals`;
    const bullet = player
      ? `${player.player_name} (${player.team_name ?? ""}) — ${pct(getHitRate(player, thu3ThrNum))} at ${thu3ThrNum}+, L5 avg ${getL5Avg(player).toFixed(1)}, season avg ${getSeasonAvg(player).toFixed(1)}`
      : "Check the full board at Neeko Sports Stats.";
    const hook = player
      ? `One stat before the bounce. ${player.player_name} — the numbers laid out clearly.`
      : `One stat to know before ${rl} gets underway.`;
    schedule.push(makePost({
      day: "Thu", postNumber: 3,
      type: POST_TYPES.Thu[2],
      category: "Round Preview", intent: hasThuGame ? "pre_game" : "cross_game_preview",
      statLens: "disposals", confidence: player ? "High" : "Fallback",
      title: hasThuGame ? "One stat before the bounce — Thursday" : `${rl} stat spotlight`,
      content: hook,
      statsShown: [bullet],
      onScreenText: player ? `${player.player_name} — L5 avg ${getL5Avg(player).toFixed(1)}` : "Stat spotlight",
      caption: buildCaption(hook, [bullet], 5),
      hashtags: hasThuGame ? HASHTAG_SETS.gameday : HASHTAG_SETS.base,
      suggestedVisual: player ? `Full-screen stat card — ${player.player_name}, team colours, L5 avg` : "Generic round preview card",
      imageDescription: player
        ? `Short video or full-screen static. Single player spotlight: ${player.player_name} (${player.team_name ?? ""}). Large centre stat: L5 average ${getL5Avg(player).toFixed(1)}. Secondary: ${thu3ThrNum}+ hit rate ${pct(getHitRate(player, thu3ThrNum))}. Team colours as background accent. No betting language.`
        : `Short video or static card. "One stat before bounce" template. Round label in top corner. Placeholder for player name and stat. Dark background, minimal text.`,
      dataScope: hasThuGame ? "Thursday upcoming game" : `${rl} cross-game pool`,
      targetGame: hasThuGame && thuMatches[0] ? `${thuMatches[0].home_team_name} v ${thuMatches[0].away_team_name}` : null,
      targetGameStatus: hasThuGame ? "upcoming" : "any",
      fallbackWarning: hasThuGame ? null : "Fallback: no Thursday game — using cross-round spotlight",
      players: spotlight, thresholdLabel: thu3ThrLabel,
    }));
  }

  // ── FRIDAY ────────────────────────────────────────────────────────────────

  // Post 1 — Friday night stat watch (Carousel) — only upcoming Fri games
  {
    const friMatches = upcomingMatches.filter(m => new Date(m.game_date).getDay() === 5);
    const hasFriGame = friMatches.length > 0;
    const gamePlayers = hasFriGame
      ? dispPool.filter(p => friMatches.some(m => m.home_team_id === p.team_id || m.away_team_id === p.team_id)).slice(0, 5)
      : dispPool.slice(0, 5);
    const fallback = !hasFriGame;
    const fri1ThrNum = hasFriGame
      ? (pool30.filter(p => friMatches.some(m => m.home_team_id === p.team_id || m.away_team_id === p.team_id)).length >= 2 ? 30
        : pool25.filter(p => friMatches.some(m => m.home_team_id === p.team_id || m.away_team_id === p.team_id)).length >= 2 ? 25 : 20)
      : (pool30.length >= 3 ? 30 : pool25.length >= 3 ? 25 : 20);
    const fri1ThrLabel = `${fri1ThrNum}+ Disposals`;
    const bullets = gamePlayers.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — L5 avg ${getL5Avg(p).toFixed(1)}, ${pct(getHitRate(p, fri1ThrNum))} at ${fri1ThrNum}+`
    );
    const gameLabel = hasFriGame ? friMatches.map(m => `${m.home_team_name} v ${m.away_team_name}`).join(", ") : null;
    const hook = hasFriGame
      ? `Friday night stat watch. ${gameLabel} — numbers to know before bounce.`
      : `${rl} heading into the weekend. Key disposal form numbers.`;
    schedule.push(makePost({
      day: "Fri", postNumber: 1,
      type: "Carousel",
      category: "Round Preview", intent: hasFriGame ? "same_day_preview" : "cross_game_preview",
      statLens: "disposals", confidence: gamePlayers.length >= 3 ? "High" : "Medium",
      title: hasFriGame ? "Friday night stat watch" : `${rl} weekend preview`,
      content: hook,
      statsShown: bullets,
      onScreenText: hasFriGame ? "Friday night form" : "Weekend preview",
      caption: buildCaption(hook, bullets, 0),
      hashtags: hasFriGame ? HASHTAG_SETS.gameday : HASHTAG_SETS["Round Preview"],
      suggestedVisual: hasFriGame ? "Game-specific carousel — player form for tonight's game" : "Weekend preview carousel",
      imageDescription: hasFriGame
        ? `Carousel. Game-specific. ${gameLabel ?? "Friday game"}. ${gamePlayers.length} players: name, team, L5 average, ${fri1ThrNum}+ hit rate. Team colours as accents. Each player gets one slide. Dark background.`
        : `Carousel. Weekend preview. ${gamePlayers.length} players: name, team, L5 average. Clean layout, dark background.`,
      dataScope: hasFriGame ? "Friday upcoming games only" : `${rl} cross-game pool`,
      targetGame: gameLabel, targetGameStatus: hasFriGame ? "upcoming" : "any",
      fallbackWarning: fallback ? "Fallback: no Friday upcoming game found" : null,
      players: gamePlayers, thresholdLabel: fri1ThrLabel,
    }));
  }

  // Post 2 — Weekend cross-game trends (Image)
  {
    const weMatches = upcomingMatches.filter(m => {
      const d = new Date(m.game_date).getDay();
      return d === 6 || d === 0; // Sat/Sun
    });
    const hasWeekend = weMatches.length > 0;
    const fri2ThrNum = pool30.length >= 3 ? 30 : pool25.length >= 3 ? 25 : 20;
    const fri2ThrLabel = `${fri2ThrNum}+ Disposals`;
    const players = dispPool.slice(0, 5);
    const bullets = players.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — L5 avg ${getL5Avg(p).toFixed(1)}, ${pct(getHitRate(p, fri2ThrNum))} at ${fri2ThrNum}+`
    );
    const hook = hasWeekend
      ? `Weekend cross-game trends. ${weMatches.length} game${weMatches.length !== 1 ? "s" : ""} across the weekend — stat form to know.`
      : `Cross-game disposal trends heading into ${rl}.`;
    schedule.push(makePost({
      day: "Fri", postNumber: 2,
      type: "Image",
      category: "Disposal Trend", intent: "cross_game_preview",
      statLens: "disposals", confidence: players.length >= 3 ? "High" : "Medium",
      title: `Weekend cross-game disposal trends`,
      content: hook,
      statsShown: bullets,
      onScreenText: "Weekend trends",
      caption: buildCaption(hook, bullets, 1),
      hashtags: HASHTAG_SETS["Disposal Trend"],
      suggestedVisual: `5-player stat grid — weekend matchup context, ${fri2ThrNum}+ threshold`,
      imageDescription: `Static image. 5-player grid showing weekend form leaders. Each row: player name, team, L5 average, ${fri2ThrNum}+ hit rate. Headline: "Weekend Disposal Trends". Dark background, clean layout.`,
      dataScope: hasWeekend ? "Saturday/Sunday upcoming games" : `${rl} cross-game pool`,
      targetGame: null, targetGameStatus: hasWeekend ? "upcoming" : "any",
      fallbackWarning: hasWeekend ? null : "Fallback: no Sat/Sun upcoming games found",
      players, thresholdLabel: fri2ThrLabel,
    }));
  }

  // Post 3 — Friday quick stats / one stat (Short video)
  {
    const friMatches = upcomingMatches.filter(m => new Date(m.game_date).getDay() === 5);
    const hasFri = friMatches.length > 0;
    const spotlight = hasFri
      ? goalPool.filter(p => friMatches.some(m => m.home_team_id === p.team_id || m.away_team_id === p.team_id)).slice(0, 1)
      : goalPool.slice(0, 1);
    const player = spotlight[0];
    const bullet = player
      ? `${player.player_name} (${player.team_name ?? ""}) — ${pct(getHitRate(player, 1))} at 1+ goals, L5 avg ${getL5Avg(player).toFixed(1)}`
      : "Full goal scorer form on the board — Neeko Sports Stats.";
    const hook = player
      ? `One to watch tonight. ${player.player_name} — goal form snapshot.`
      : `One stat to know before the weekend gets started.`;
    const fri3GoalThr = player ? bestGoalThreshold(player) : 1;
    schedule.push(makePost({
      day: "Fri", postNumber: 3,
      type: POST_TYPES.Fri[2],
      category: "Goal Trend", intent: hasFri ? "pre_game" : "cross_game_preview",
      statLens: "goals", confidence: player ? "High" : "Fallback",
      title: hasFri ? "One stat before bounce — Friday" : `${rl} goal spotlight`,
      content: hook,
      statsShown: [bullet],
      onScreenText: player ? `${player.player_name} — goal form` : "Goal spotlight",
      caption: buildCaption(hook, [bullet], 2),
      hashtags: hasFri ? HASHTAG_SETS.gameday : HASHTAG_SETS["Goal Trend"],
      suggestedVisual: player ? `Full-screen stat card — ${player.player_name}, goal form` : "Goal trend graphic",
      imageDescription: player
        ? `Short video or full-screen static. Single player: ${player.player_name} (${player.team_name ?? ""}). Large centre stat: ${fri3GoalThr}+ goal hit rate ${pct(getHitRate(player, fri3GoalThr))}. Secondary: L5 average ${getL5Avg(player).toFixed(1)}. Team colours as background accent. No betting language.`
        : `Short video or static card. Goal spotlight template. Dark background, minimal design.`,
      dataScope: hasFri ? "Friday upcoming game" : `${rl} goal pool`,
      targetGame: hasFri && friMatches[0] ? `${friMatches[0].home_team_name} v ${friMatches[0].away_team_name}` : null,
      targetGameStatus: hasFri ? "upcoming" : "any",
      fallbackWarning: hasFri ? null : "Fallback: no Friday game — using cross-round goal spotlight",
      players: spotlight, thresholdLabel: `${fri3GoalThr}+ Goals`,
    }));
  }

  // ── SATURDAY ─────────────────────────────────────────────────────────────

  // Post 1 — Saturday AFL stat watch (Carousel)
  {
    const satMatches = upcomingMatches.filter(m => new Date(m.game_date).getDay() === 6);
    const hasSat = satMatches.length > 0;
    const gamePlayers = hasSat
      ? dispPool.filter(p => satMatches.some(m => m.home_team_id === p.team_id || m.away_team_id === p.team_id)).slice(0, 6)
      : dispPool.slice(0, 6);
    const sat1ThrNum = hasSat
      ? (pool30.filter(p => satMatches.some(m => m.home_team_id === p.team_id || m.away_team_id === p.team_id)).length >= 2 ? 30
        : pool25.filter(p => satMatches.some(m => m.home_team_id === p.team_id || m.away_team_id === p.team_id)).length >= 2 ? 25 : 20)
      : (pool30.length >= 3 ? 30 : pool25.length >= 3 ? 25 : 20);
    const sat1ThrLabel = `${sat1ThrNum}+ Disposals`;
    const bullets = gamePlayers.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — L5 avg ${getL5Avg(p).toFixed(1)}, ${pct(getHitRate(p, sat1ThrNum))} at ${sat1ThrNum}+`
    );
    const hook = hasSat
      ? `Saturday AFL stat watch. ${satMatches.length} game${satMatches.length !== 1 ? "s" : ""} today — form players to track.`
      : `${rl} game day. Key disposal form to know.`;
    schedule.push(makePost({
      day: "Sat", postNumber: 1,
      type: "Carousel",
      category: "Round Preview", intent: hasSat ? "same_day_preview" : "cross_game_preview",
      statLens: "disposals", confidence: gamePlayers.length >= 3 ? "High" : "Medium",
      title: hasSat ? "Saturday AFL stat watch" : `${rl} game day stats`,
      content: hook,
      statsShown: bullets,
      onScreenText: "Saturday stat watch",
      caption: buildCaption(hook, bullets, 3),
      hashtags: HASHTAG_SETS.gameday,
      suggestedVisual: hasSat ? "Multi-game Saturday carousel — player form per game" : "Game day stat carousel",
      imageDescription: hasSat
        ? `Carousel. Saturday game day. ${gamePlayers.length} player slides. Each: player name, team, L5 average, ${sat1ThrNum}+ hit rate. Grouped by game where possible. Team colours as accents. Headline: "Saturday AFL Stat Watch".`
        : `Carousel. Game day stat overview. ${gamePlayers.length} players: name, team, L5 average. Dark background.`,
      dataScope: hasSat ? "Saturday upcoming games only" : `${rl} cross-game pool`,
      targetGame: hasSat ? satMatches.map(m => `${m.home_team_name} v ${m.away_team_name}`).join(", ") : null,
      targetGameStatus: hasSat ? "upcoming" : "any",
      fallbackWarning: hasSat ? null : "Fallback: no Saturday upcoming games — using cross-round stats",
      players: gamePlayers, thresholdLabel: sat1ThrLabel,
    }));
  }

  // Post 2 — Top 5 for 25+ disposals today (Image)
  {
    const satMatches = upcomingMatches.filter(m => new Date(m.game_date).getDay() === 6);
    const hasSat = satMatches.length > 0;
    const satPlayerIds = new Set(
      hasSat ? satMatches.flatMap(m => [m.home_team_id, m.away_team_id]) : []
    );
    const satDispPool = hasSat
      ? dispPool.filter(p => satPlayerIds.has(p.team_id))
      : dispPool;
    const players = selectDisposalPlayers(satDispPool, 25, new Set(), 0.5, 5);
    const isFallback = players.length < 3;
    const bullets = players.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, 25))} at 25+, L5 avg ${getL5Avg(p).toFixed(1)}`
    );
    const hook = `Top 25+ disposal form players in today's games. Stats over gut feel.`;
    schedule.push(makePost({
      day: "Sat", postNumber: 2,
      type: "Image",
      category: "Disposal Trend", intent: hasSat ? "same_day_preview" : "cross_game_preview",
      statLens: "disposals", confidence: isFallback ? "Fallback" : "High",
      title: `Top 5 for 25+ disposals — Saturday`,
      content: hook,
      statsShown: bullets,
      onScreenText: "25+ today",
      caption: buildCaption(hook, bullets, 4),
      hashtags: HASHTAG_SETS["Disposal Trend"],
      suggestedVisual: "5-player grid — Saturday game context, 25+ hit rates",
      imageDescription: `Static image. 5-player stat grid for Saturday games. Threshold: 25+ disposals. Each row: player name, team abbreviation, 25+ hit rate percentage, L5 average. Headline: "Top 5 for 25+ Today". Dark background, stat values highlighted. No betting language.`,
      dataScope: hasSat ? "Saturday upcoming games only" : `${rl} cross-game pool`,
      targetGame: null, targetGameStatus: hasSat ? "upcoming" : "any",
      fallbackWarning: isFallback ? "Fallback fill: not enough Saturday 25+ candidates" : null,
      players, thresholdLabel: "25+ Disposals",
    }));
  }

  // Post 3 — Team total trends today (Carousel)
  {
    const satMatches = upcomingMatches.filter(m => new Date(m.game_date).getDay() === 6);
    const sunMatches = upcomingMatches.filter(m => new Date(m.game_date).getDay() === 0);
    const hasSat = satMatches.length > 0;
    const hasSun = sunMatches.length > 0;
    const teamIds = new Set(
      (hasSat ? satMatches : hasSun ? sunMatches : []).flatMap(m => [m.home_team_id, m.away_team_id])
    );
    const relevantTeams = hasSat || hasSun
      ? teamScoreRows.filter(t => teamIds.has(t.team_id))
      : teamScoreRows;
    const teams = relevantTeams.slice(0, 5);
    const fallbackMsg = !hasSat && !hasSun ? "Fallback: no weekend upcoming games — using full team pool" : null;
    const bullets = teams.length >= 2
      ? teams.map(t => `${t.team_name ?? ""} — L5 avg ${getTeamL5Avg(t).toFixed(1)} pts (season avg ${getTeamSeasonAvg(t).toFixed(1)})`)
      : ["Team scoring data unavailable for today."];
    const hook = hasSat
      ? `Team scoring trends across today's Saturday games.`
      : hasSun
      ? `Team scoring trends for the weekend — Sunday games.`
      : `Team scoring trends for ${rl}.`;
    schedule.push(makePost({
      day: "Sat", postNumber: 3,
      type: "Carousel",
      category: "Team Total", intent: hasSat ? "same_day_preview" : hasSun ? "same_day_preview" : "cross_game_preview",
      statLens: "team-total", confidence: teams.length >= 3 ? "High" : "Medium",
      title: "Team total trends today",
      content: hook,
      statsShown: bullets,
      onScreenText: "Team scoring trends",
      caption: buildCaption(hook, bullets, 5),
      hashtags: HASHTAG_SETS["Team Total"],
      suggestedVisual: "Team scoring carousel — bar chart per team with L5 vs season avg",
      imageDescription: `Carousel. ${teams.length} team slides. Each slide: team name, L5 average score, season average score side by side. ${hasSat ? "Saturday games only." : hasSun ? "Sunday games only." : "Cross-round team pool."} Clean layout, neutral dark background. No betting language.`,
      dataScope: hasSat ? "Saturday upcoming games" : hasSun ? "Sunday upcoming games" : `${rl} team pool`,
      targetGame: null, targetGameStatus: hasSat || hasSun ? "upcoming" : "any",
      fallbackWarning: fallbackMsg,
      players: [], teams: teams.map(t => t.team_name ?? "").filter(Boolean),
      thresholdLabel: "Team Score",
    }));
  }

  // ── SUNDAY ────────────────────────────────────────────────────────────────

  // Post 1 — Sunday AFL stat watch (Carousel)
  {
    const sunMatches = upcomingMatches.filter(m => new Date(m.game_date).getDay() === 0);
    const hasSun = sunMatches.length > 0;
    const gamePlayers = hasSun
      ? dispPool.filter(p => sunMatches.some(m => m.home_team_id === p.team_id || m.away_team_id === p.team_id)).slice(0, 5)
      : dispPool.slice(0, 5);
    // Dynamic threshold based on who's playing on Sunday
    const sun1ThrNum = hasSun
      ? (pool30.filter(p => sunMatches.some(m => m.home_team_id === p.team_id || m.away_team_id === p.team_id)).length >= 2 ? 30
        : pool25.filter(p => sunMatches.some(m => m.home_team_id === p.team_id || m.away_team_id === p.team_id)).length >= 2 ? 25 : 20)
      : (pool30.length >= 3 ? 30 : pool25.length >= 3 ? 25 : 20);
    const sun1ThrLabel = `${sun1ThrNum}+ Disposals`;
    const bullets = gamePlayers.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — L5 avg ${getL5Avg(p).toFixed(1)}, ${pct(getHitRate(p, sun1ThrNum))} at ${sun1ThrNum}+`
    );
    const hook = hasSun
      ? `Sunday AFL stat watch. Forms to track across today's games.`
      : `${rl} Sunday wrap — form numbers from this round.`;
    const gameLabel = hasSun ? sunMatches.map(m => `${m.home_team_name} v ${m.away_team_name}`).join(", ") : null;
    schedule.push(makePost({
      day: "Sun", postNumber: 1,
      type: "Carousel",
      category: hasSun ? "Round Preview" : "Round Wrap", intent: hasSun ? "same_day_preview" : "recap",
      statLens: "disposals", confidence: gamePlayers.length >= 3 ? "High" : "Medium",
      title: hasSun ? "Sunday AFL stat watch" : `${rl} Sunday round-up`,
      content: hook,
      statsShown: bullets,
      onScreenText: "Sunday stat watch",
      caption: buildCaption(hook, bullets, 0),
      hashtags: HASHTAG_SETS.gameday,
      suggestedVisual: hasSun ? "Multi-game Sunday carousel" : "Round wrap carousel",
      imageDescription: hasSun
        ? `Carousel. Sunday game day. ${gamePlayers.length} player slides. Each: player name, team, L5 average, ${sun1ThrNum}+ hit rate. Grouped by game where possible. Team colours as accents. Headline: "Sunday AFL Stat Watch".`
        : `Carousel. Round wrap overview. ${gamePlayers.length} players: name, team, L5 average. Headline: "${rl} Sunday Round-Up". Dark background, clean layout.`,
      dataScope: hasSun ? "Sunday upcoming games only" : `${rl} round wrap`,
      targetGame: gameLabel,
      targetGameStatus: hasSun ? "upcoming" : "completed",
      fallbackWarning: hasSun ? null : "Fallback: no Sunday upcoming games — using round wrap",
      players: gamePlayers, thresholdLabel: sun1ThrLabel,
    }));
  }

  // Post 2 — Best Sunday goal trends (Image) — threshold-aware
  {
    const sunMatches = upcomingMatches.filter(m => new Date(m.game_date).getDay() === 0);
    const hasSun = sunMatches.length > 0;
    const sunTeamIds = new Set(hasSun ? sunMatches.flatMap(m => [m.home_team_id, m.away_team_id]) : []);
    const sunGoalPool = hasSun
      ? goalPool.filter(p => sunTeamIds.has(p.team_id))
      : goalPool;

    // Choose the most interesting threshold with enough candidates from Sunday pool
    let sun2GoalPlayers: StatBoardPlayer[];
    let sun2GoalThr: number;
    let sun2GoalLabel: string;

    const sun2Pool3 = sunGoalPool.filter(p => bestGoalThreshold(p) === 3);
    const sun2Pool2 = sunGoalPool.filter(p => bestGoalThreshold(p) === 2);

    if (sun2Pool3.length >= 3) {
      sun2GoalPlayers = sun2Pool3.slice(0, 5);
      sun2GoalThr = 3;
      sun2GoalLabel = "3+ Goals";
    } else if (sun2Pool2.length >= 3) {
      sun2GoalPlayers = sun2Pool2.slice(0, 5);
      sun2GoalThr = 2;
      sun2GoalLabel = "2+ Goals";
    } else if (sun2Pool3.length + sun2Pool2.length >= 3) {
      sun2GoalPlayers = [...sun2Pool3, ...sun2Pool2].slice(0, 5);
      sun2GoalThr = 2;
      sun2GoalLabel = "2–3+ Goals";
    } else {
      sun2GoalPlayers = sunGoalPool.slice(0, 5);
      sun2GoalThr = 1;
      sun2GoalLabel = "1+ Goals";
    }

    const bullets = sun2GoalPlayers.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, sun2GoalThr))} at ${sun2GoalThr}+ goals, L5 avg ${getL5Avg(p).toFixed(1)}`
    );
    const hook = hasSun
      ? `Best Sunday goal scorers at ${sun2GoalLabel} — form numbers heading into today's games.`
      : `Top ${sun2GoalLabel} goal scorer form — ${rl} round-up.`;
    schedule.push(makePost({
      day: "Sun", postNumber: 2,
      type: "Image",
      category: "Goal Trend", intent: hasSun ? "same_day_preview" : "recap",
      statLens: "goals", confidence: sun2GoalPlayers.length >= 3 ? "High" : "Medium",
      title: hasSun ? `Best Sunday ${sun2GoalLabel} goal trends` : `${rl} ${sun2GoalLabel} goal scorer form`,
      content: hook,
      statsShown: bullets,
      onScreenText: `${sun2GoalLabel} form`,
      caption: buildCaption(hook, bullets, 1),
      hashtags: HASHTAG_SETS["Goal Trend"],
      suggestedVisual: hasSun ? `5-player ${sun2GoalLabel} goal form grid — Sunday games` : "Round goal wrap grid",
      imageDescription: `Static image. 5-player goal form grid. Threshold: ${sun2GoalLabel}. Each row: player name, team, ${sun2GoalThr}+ goal hit rate as percentage, L5 average. ${hasSun ? "Sunday games only." : "Cross-round goal wrap."} Dark background, clean layout. No betting language.`,
      dataScope: hasSun ? "Sunday upcoming games" : `${rl} goal pool`,
      targetGame: hasSun ? sunMatches.map(m => `${m.home_team_name} v ${m.away_team_name}`).join(", ") : null,
      targetGameStatus: hasSun ? "upcoming" : "any",
      fallbackWarning: hasSun ? null : "Fallback: no Sunday upcoming games",
      players: sun2GoalPlayers, thresholdLabel: sun2GoalLabel,
    }));
  }

  // Post 3 — Weekend recap / what the stats got right (Carousel)
  {
    const hasCompleted = completedMatches.length > 0;

    // Select threshold-correct proof players (same logic as Monday Post 1)
    let sunProofPlayers: StatBoardPlayer[];
    let sunProofThreshold: string;
    let sunProofThrNum: number;

    if (pool30.length >= 3) {
      sunProofPlayers = pool30.slice(0, 5);
      sunProofThreshold = "30+ Disposals";
      sunProofThrNum = 30;
    } else if (poolElite.length >= 3) {
      sunProofPlayers = poolElite.slice(0, 5);
      sunProofThreshold = "25–30+ Disposals";
      sunProofThrNum = 25;
    } else if (pool20.length >= 3) {
      sunProofPlayers = pool20.slice(0, 5);
      sunProofThreshold = "20+ Disposals";
      sunProofThrNum = 20;
    } else {
      sunProofPlayers = dispPool.slice(0, 5);
      sunProofThreshold = "Disposal Form";
      sunProofThrNum = 20;
    }

    const bullets = sunProofPlayers.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, sunProofThrNum))} at ${sunProofThrNum}+, L5 avg ${getL5Avg(p).toFixed(1)}, season avg ${getSeasonAvg(p).toFixed(1)}`
    );
    const hook = hasCompleted
      ? `${rl} — what the stats got right. See the data, make your own call.`
      : `${rl} wrap-up. Form leaders from the round.`;

    // Only label as "Proof Post" or "what the stats got right" when actual completed data exists
    const sunCategory: PostCategory = hasCompleted ? "Proof Post" : "Round Wrap";
    const sunTitle = hasCompleted
      ? `${rl} — what the stats got right`
      : `${rl} weekend watchlist`;

    schedule.push(makePost({
      day: "Sun", postNumber: 3,
      type: "Carousel",
      category: sunCategory, intent: "recap",
      statLens: "disposals", confidence: hasCompleted ? "High" : "Medium",
      title: sunTitle,
      content: hook,
      statsShown: bullets,
      onScreenText: hasCompleted ? "What the stats got right" : "Weekend watchlist",
      caption: buildCaption(hook, bullets, 2),
      hashtags: HASHTAG_SETS[sunCategory],
      suggestedVisual: "Round recap carousel — top performers vs L5 average",
      imageDescription: hasCompleted
        ? `Carousel. Weekend proof post. ${sunProofPlayers.length} player slides. Each: player name, team, ${sunProofThrNum}+ hit rate, L5 average. Headline: "${rl} — What the Stats Got Right". Dark background, proof-style layout. No betting language.`
        : `Carousel. Weekend watchlist. ${sunProofPlayers.length} players: name, team, L5 average, season average. Headline: "${rl} Weekend Watchlist". Clean dark background, no proof/recap framing until games complete.`,
      dataScope: hasCompleted ? "Completed weekend games" : `${rl} round wrap`,
      targetGame: hasCompleted ? "Weekend completed games" : null,
      targetGameStatus: hasCompleted ? "completed" : "any",
      fallbackWarning: hasCompleted ? null : "No completed game data — showing as watchlist preview. Do not label as proof/recap.",
      players: sunProofPlayers, thresholdLabel: sunProofThreshold,
    }));
  }

  // ── BACKUP BANK (22+ unique posts) ────────────────────────────────────────

  let bkIdx = 0;
  function bkPost(args: Parameters<typeof makePost>[0]): void {
    backup.push(makePost({ ...args, isBackup: true, postNumber: 1 }));
    bkIdx++;
  }

  // 1. 30+ disposal consistency — only players whose best threshold is 30+
  {
    const players = pool30.slice(0, 5);
    if (players.length >= 2) {
      const bullets = players.map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, 30))} at 30+, L5 avg ${getL5Avg(p).toFixed(1)}`);
      bkPost({ day: "Tue", type: "Image", category: "Disposal Trend", intent: "cross_game_preview", statLens: "disposals", confidence: "High", title: `Top 5 for 30+ disposals — ${rl}`, content: "Elite disposal volume. Who's been clearing 30+ consistently?", statsShown: bullets, onScreenText: "30+ disposal form", caption: buildCaption("Elite disposal volume. Who's been clearing 30+ consistently?", bullets, 0), hashtags: HASHTAG_SETS["Disposal Trend"], suggestedVisual: "5-player stat grid — 30+ hit rates", imageDescription: `Static image. 5-player stat grid. Threshold: 30+ disposals. Each row: player name, team abbreviation, 30+ hit rate percentage, L5 average. Elite tier only — no lower-threshold players. Dark background, stat values highlighted. No betting language.`, dataScope: `${rl} cross-game pool (30+ tier only)`, targetGame: null, targetGameStatus: "any", fallbackWarning: null, players, thresholdLabel: "30+ Disposals", postNumber: 1 });
    }
  }

  // 2. 25+ disposals across Saturday games
  {
    const satMatches = data.matches.filter(m => new Date(m.game_date).getDay() === 6);
    const satTeamIds = new Set(satMatches.flatMap(m => [m.home_team_id, m.away_team_id]));
    const players = dispPool.filter(p => satTeamIds.has(p.team_id) && getHitRate(p, 25) >= 0.5).slice(0, 5);
    if (players.length >= 2) {
      const bullets = players.map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, 25))} at 25+, L5 avg ${getL5Avg(p).toFixed(1)}`);
      bkPost({ day: "Sat", type: "Image", category: "Disposal Trend", intent: "same_day_preview", statLens: "disposals", confidence: "High", title: "Top 5 for 25+ disposals — Saturday games", content: "Saturday 25+ disposal form. Stats laid out clearly.", statsShown: bullets, onScreenText: "Saturday 25+ form", caption: buildCaption("Saturday 25+ disposal form.", bullets, 1), hashtags: HASHTAG_SETS["Disposal Trend"], suggestedVisual: "Saturday game-specific 5-player grid", imageDescription: `Static image. 5-player stat grid for Saturday games. Threshold: 25+ disposals. Each row: player name, team, 25+ hit rate, L5 average. Headline: "Top 5 for 25+ Disposals — Saturday". Dark background. No betting language.`, dataScope: "Saturday games only", targetGame: null, targetGameStatus: "upcoming", fallbackWarning: null, players, thresholdLabel: "25+ Disposals", postNumber: 1 });
    }
  }

  // 3. 20+ disposals — Sunday games
  {
    const sunMatches = data.matches.filter(m => new Date(m.game_date).getDay() === 0);
    const sunTeamIds = new Set(sunMatches.flatMap(m => [m.home_team_id, m.away_team_id]));
    const players = dispPool.filter(p => sunTeamIds.has(p.team_id) && getHitRate(p, 20) >= 0.55).slice(0, 5);
    if (players.length >= 2) {
      const bullets = players.map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, 20))} at 20+, L5 avg ${getL5Avg(p).toFixed(1)}`);
      bkPost({ day: "Sun", type: "Image", category: "Disposal Trend", intent: "same_day_preview", statLens: "disposals", confidence: "High", title: "Top 5 for 20+ disposals — Sunday games", content: "Sunday disposal form. See the numbers, make your own call.", statsShown: bullets, onScreenText: "Sunday 20+ form", caption: buildCaption("Sunday disposal form.", bullets, 2), hashtags: HASHTAG_SETS["Disposal Trend"], suggestedVisual: "Sunday game-specific 5-player grid", imageDescription: `Static image. 5-player stat grid for Sunday games. Threshold: 20+ disposals. Each row: player name, team, 20+ hit rate, L5 average. Headline: "Sunday Disposal Form". Dark background. No betting language.`, dataScope: "Sunday games only", targetGame: null, targetGameStatus: "upcoming", fallbackWarning: null, players, thresholdLabel: "20+ Disposals", postNumber: 1 });
    }
  }

  // 4. 15+ disposals — selected game spotlight
  {
    const players = top15.slice(0, 5);
    if (players.length >= 2) {
      const bullets = players.map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, 15))} at 15+, L5 avg ${getL5Avg(p).toFixed(1)}`);
      bkPost({ day: "Wed", type: "Image", category: "Disposal Trend", intent: "cross_game_preview", statLens: "disposals", confidence: "Medium", title: `15+ disposal form — different names`, content: "Volume disposers at the 15+ threshold — different names from the 20+ and 25+ lists.", statsShown: bullets, onScreenText: "15+ form", caption: buildCaption("15+ threshold form — different names from the 20+/25+ lists.", bullets, 3), hashtags: HASHTAG_SETS["Disposal Trend"], suggestedVisual: "5-player stat grid", imageDescription: `Static image. 5-player stat grid. Threshold: 15+ disposals. These players sit in the 15+ tier only — different names from 20+/25+ posts. Each row: player name, team, 15+ hit rate, L5 average. Dark background. No betting language.`, dataScope: `${rl} cross-game pool`, targetGame: null, targetGameStatus: "any", fallbackWarning: null, players, thresholdLabel: "15+ Disposals", postNumber: 1 });
    }
  }

  // 5. 1+ goals cross-round — only players whose best goal threshold is 1
  {
    const players = (goalPool1.length >= 2 ? goalPool1 : goalPool).slice(0, 5);
    if (players.length >= 2) {
      const bullets = players.map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, 1))} at 1+, L5 avg ${getL5Avg(p).toFixed(1)}`);
      bkPost({ day: "Thu", type: "Image", category: "Goal Trend", intent: "cross_game_preview", statLens: "goals", confidence: "High", title: `Top 5 for 1+ goals — ${rl}`, content: "Goal form across the round. Who's been finding the big sticks regularly?", statsShown: bullets, onScreenText: "Goal form", caption: buildCaption("Goal form across the round.", bullets, 4), hashtags: HASHTAG_SETS["Goal Trend"], suggestedVisual: "5-player goal form grid", imageDescription: `Static image. 5-player goal form grid. Threshold: 1+ goals. Each row: player name, team, 1+ goal hit rate as percentage, L5 average. Cross-round pool. Dark background. No betting language.`, dataScope: `${rl} cross-game goal pool (1+ tier)`, targetGame: null, targetGameStatus: "any", fallbackWarning: goalPool1.length < 2 ? "Low 1+ only candidates — using full goal pool" : null, players, thresholdLabel: "1+ Goals", postNumber: 1 });
    }
  }

  // 6. 2+ goals — only players whose best threshold is 2+
  {
    const players = (goalPool2.length >= 2 ? goalPool2 : goalPool.filter(p => getHitRate(p, 2) >= 0.45)).slice(0, 5);
    if (players.length >= 2) {
      const bullets = players.map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, 2))} at 2+, L5 avg ${getL5Avg(p).toFixed(1)}`);
      bkPost({ day: "Fri", type: "Image", category: "Goal Trend", intent: "cross_game_preview", statLens: "goals", confidence: "Medium", title: `Top 5 for 2+ goals — ${rl}`, content: "Multi-goal scorers with strong recent hit rates.", statsShown: bullets, onScreenText: "2+ goal form", caption: buildCaption("Multi-goal scorers with strong recent hit rates.", bullets, 5), hashtags: HASHTAG_SETS["Goal Trend"], suggestedVisual: "5-player 2+ goal grid", imageDescription: `Static image. 5-player goal form grid. Threshold: 2+ goals. Each row: player name, team, 2+ goal hit rate as percentage, L5 average. Multi-goal tier only. Dark background. No betting language.`, dataScope: `${rl} cross-game goal pool (2+ tier)`, targetGame: null, targetGameStatus: "any", fallbackWarning: null, players, thresholdLabel: "2+ Goals", postNumber: 1 });
    }
  }

  // 7. 3+ goals — only players whose best threshold is 3+
  {
    const players = (goalPool3.length >= 2 ? goalPool3 : goalPool.filter(p => getHitRate(p, 3) >= 0.35)).slice(0, 5);
    if (players.length >= 2) {
      const bullets = players.map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, 3))} at 3+, L5 avg ${getL5Avg(p).toFixed(1)}`);
      bkPost({ day: "Sat", type: "Image", category: "Goal Trend", intent: "cross_game_preview", statLens: "goals", confidence: "Medium", title: `3+ goal scorers — ${rl}`, content: "Three-plus goal scorers with form worth noting.", statsShown: bullets, onScreenText: "3+ goals", caption: buildCaption("Three-plus goal scorers with form worth noting.", bullets, 0), hashtags: HASHTAG_SETS["Goal Trend"], suggestedVisual: "Elite goal scorers stat card", imageDescription: `Static image. 5-player goal form grid. Threshold: 3+ goals. Elite goal scorers only. Each row: player name, team, 3+ goal hit rate as percentage, L5 average. Dark background, clean layout. No betting language.`, dataScope: `${rl} cross-game goal pool (3+ tier)`, targetGame: null, targetGameStatus: "any", fallbackWarning: null, players, thresholdLabel: "3+ Goals", postNumber: 1 });
    }
  }

  // 8. Thursday/Friday game goal trends
  {
    const thuFriMatches = data.matches.filter(m => { const d = new Date(m.game_date).getDay(); return d === 4 || d === 5; });
    const teamIds = new Set(thuFriMatches.flatMap(m => [m.home_team_id, m.away_team_id]));
    const players = goalPool.filter(p => teamIds.has(p.team_id)).slice(0, 5);
    if (players.length >= 2) {
      const bullets = players.map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, 1))} at 1+ goals, L5 avg ${getL5Avg(p).toFixed(1)}`);
      bkPost({ day: "Thu", type: "Carousel", category: "Goal Trend", intent: "same_day_preview", statLens: "goals", confidence: "High", title: "Thu/Fri game goal trends", content: "Goal form for this week's early games — Thu and Fri fixtures.", statsShown: bullets, onScreenText: "Early game goals", caption: buildCaption("Goal form for this week's early games.", bullets, 1), hashtags: HASHTAG_SETS["Goal Trend"], suggestedVisual: "Thu/Fri game-specific goal form carousel", imageDescription: `Carousel. Thursday/Friday game goal trends. ${players.length} players, one per slide. Each: player name, team, 1+ goal hit rate, L5 average. Game-day framing. Dark background. No betting language.`, dataScope: "Thursday/Friday games", targetGame: null, targetGameStatus: "upcoming", fallbackWarning: thuFriMatches.length === 0 ? "Fallback: no Thu/Fri games found" : null, players, thresholdLabel: "1+ Goals", postNumber: 1 });
    }
  }

  // 9. Saturday disposal trends
  {
    const satMatches = data.matches.filter(m => new Date(m.game_date).getDay() === 6);
    const teamIds = new Set(satMatches.flatMap(m => [m.home_team_id, m.away_team_id]));
    const players = dispPool.filter(p => teamIds.has(p.team_id)).slice(0, 6);
    if (players.length >= 2) {
      const bullets = players.map(p => `${p.player_name} (${p.team_name ?? ""}) — L5 avg ${getL5Avg(p).toFixed(1)}, ${pct(getHitRate(p, 20))} at 20+`);
      bkPost({ day: "Sat", type: "Carousel", category: "Disposal Trend", intent: "same_day_preview", statLens: "disposals", confidence: "High", title: "Saturday disposal trends", content: "Disposal form across Saturday's games. Stats laid out clearly.", statsShown: bullets, onScreenText: "Sat disposal form", caption: buildCaption("Disposal form across Saturday's games.", bullets, 2), hashtags: HASHTAG_SETS["Disposal Trend"], suggestedVisual: "Saturday game carousel — 6 players by disposal form", imageDescription: `Carousel. Saturday game day. 6 players, one per slide. Each: player name, team, L5 average, 20+ hit rate. Saturday games only. Team colours as accents. Headline: "Saturday Disposal Trends". No betting language.`, dataScope: "Saturday games only", targetGame: null, targetGameStatus: "upcoming", fallbackWarning: satMatches.length === 0 ? "Fallback: no Saturday games" : null, players, thresholdLabel: "20+ Disposals", postNumber: 1 });
    }
  }

  // 10. Sunday goal trends
  {
    const sunMatches = data.matches.filter(m => new Date(m.game_date).getDay() === 0);
    const teamIds = new Set(sunMatches.flatMap(m => [m.home_team_id, m.away_team_id]));
    const players = goalPool.filter(p => teamIds.has(p.team_id)).slice(0, 5);
    if (players.length >= 2) {
      const bullets = players.map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, 1))} at 1+ goals, L5 avg ${getL5Avg(p).toFixed(1)}`);
      bkPost({ day: "Sun", type: "Image", category: "Goal Trend", intent: "same_day_preview", statLens: "goals", confidence: "High", title: "Sunday game goal trends", content: "Goal form across Sunday's games.", statsShown: bullets, onScreenText: "Sunday goals", caption: buildCaption("Goal form across Sunday's games.", bullets, 3), hashtags: HASHTAG_SETS["Goal Trend"], suggestedVisual: "Sunday game goal form grid", imageDescription: `Static image. 5-player goal form grid for Sunday games. Each row: player name, team, 1+ goal hit rate as percentage, L5 average. Sunday games only. Dark background. No betting language.`, dataScope: "Sunday games only", targetGame: null, targetGameStatus: "upcoming", fallbackWarning: sunMatches.length === 0 ? "Fallback: no Sunday games" : null, players, thresholdLabel: "1+ Goals", postNumber: 1 });
    }
  }

  // 11. Top tackle trends
  {
    const players = tacklePlayers.slice(0, 6);
    if (players.length >= 2) {
      const bullets = players.map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, 5))} at 5+, L5 avg ${getL5Avg(p).toFixed(1)} disposals`);
      bkPost({ day: "Wed", type: "Carousel", category: "Tackle Trend", intent: "cross_game_preview", statLens: "tackles", confidence: "High", title: `Top tackle form — ${rl}`, content: "Tackle machines worth tracking. Consistently hitting 5+ per game.", statsShown: bullets, onScreenText: "Tackle form", caption: buildCaption("Tackle machines worth tracking.", bullets, 4), hashtags: HASHTAG_SETS["Tackle Trend"], suggestedVisual: "6-player tackle form carousel", imageDescription: `Carousel. 6 players, one per slide. Each: player name, team, 5+ tackle hit rate as percentage, L5 disposal average. Headline: "Tackle Machines". Dark background, tackle-focused design. No betting language.`, dataScope: `${rl} cross-game pool`, targetGame: null, targetGameStatus: "any", fallbackWarning: null, players, thresholdLabel: "5+ Tackles", postNumber: 1 });
    }
  }

  // 12. Top mark trends
  {
    const markPlayers = dispPool.filter(p => getHitRate(p, 5) >= 0.45).slice(0, 5);
    if (markPlayers.length >= 2) {
      const bullets = markPlayers.map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, 5))} at 5+ (disposal proxy), L5 avg ${getL5Avg(p).toFixed(1)}`);
      bkPost({ day: "Tue", type: "Image", category: "Matchup Angle", intent: "cross_game_preview", statLens: "disposals", confidence: "Medium", title: `Mark and contested possession form — ${rl}`, content: "Contested possession and marking form. Players winning the ball consistently.", statsShown: bullets, onScreenText: "Marking form", caption: buildCaption("Contested possession form.", bullets, 5), hashtags: HASHTAG_SETS["Matchup Angle"], suggestedVisual: "5-player contested stat grid", imageDescription: `Static image. 5-player contested possession grid. Each row: player name, team, contested stat hit rate, L5 disposal average. Headline: "Marking and Contested Form". Dark background, clean layout. No betting language.`, dataScope: `${rl} cross-game pool`, targetGame: null, targetGameStatus: "any", fallbackWarning: null, players: markPlayers, thresholdLabel: "Contested Form", postNumber: 1 });
    }
  }

  // 13. Fantasy score trends
  {
    const fantasyPlayers = dispPool.filter(p => getSeasonAvg(p) >= 80 && (p.games_played ?? 0) >= 4).slice(0, 5);
    if (fantasyPlayers.length >= 2) {
      const bullets = fantasyPlayers.map(p => `${p.player_name} (${p.team_name ?? ""}) — season avg ${getSeasonAvg(p).toFixed(1)}, L5 avg ${getL5Avg(p).toFixed(1)}`);
      bkPost({ day: "Wed", type: "Image", category: "Round Preview", intent: "cross_game_preview", statLens: "fantasy", confidence: "Medium", title: `Fantasy score form — ${rl}`, content: "Fantasy scoring form. Players tracking well across multiple stat categories.", statsShown: bullets, onScreenText: "Fantasy form", caption: buildCaption("Fantasy scoring form.", bullets, 0), hashtags: ["#AFL", "#AFLFantasy", "#AFLStats", "#AFL2026", "#NeekoSportsStats"], suggestedVisual: "5-player fantasy form grid — season vs L5 avg", imageDescription: `Static image. 5-player fantasy score form grid. Each row: player name, team, season average, L5 average. Headline: "Fantasy Score Form". Dark background, clean stat rows. No betting language.`, dataScope: `${rl} cross-game pool`, targetGame: null, targetGameStatus: "any", fallbackWarning: null, players: fantasyPlayers, thresholdLabel: "Fantasy Form", postNumber: 1 });
    }
  }

  // 14. Positive form movers extended
  {
    const players = formMovers.slice(0, 6);
    if (players.length >= 2) {
      const bullets = players.map(p => {
        const d = formDelta(p);
        return `${p.player_name} (${p.team_name ?? ""}) — L5 avg ${(p.last_5_avg ?? 0).toFixed(1)} (${d >= 0 ? "+" : ""}${d.toFixed(1)} vs season avg)`;
      });
      bkPost({ day: "Tue", type: "Carousel", category: "Form Mover", intent: "cross_game_preview", statLens: "disposals", confidence: "High", title: `Form movers — ${rl} extended`, content: "Players tracking well above their season average this round. Form is real.", statsShown: bullets, onScreenText: "Form movers", caption: buildCaption("Form movers — tracking above season average.", bullets, 1), hashtags: HASHTAG_SETS["Form Mover"], suggestedVisual: "Form mover carousel — up-arrow visual, L5 vs season", imageDescription: `Carousel. ${players.length} form movers, one per slide. Each: player name, team, L5 average, delta vs season average (e.g. +4.2). Up-arrow visual accent for positive deltas. Headline: "Form Movers". Dark background, green accent for positive movement. No betting language.`, dataScope: `${rl} cross-game pool`, targetGame: null, targetGameStatus: "any", fallbackWarning: players.length < 3 ? "Fallback: low form mover count" : null, players, thresholdLabel: "Form Risers", postNumber: 1 });
    }
  }

  // 15. Players above season average last 3
  {
    const players = dispPool.filter(p => (p.last_3_avg ?? 0) > (p.season_avg ?? 0) && (p.last_3_avg ?? 0) >= 20).slice(0, 5);
    if (players.length >= 2) {
      const bullets = players.map(p => `${p.player_name} — L3 avg ${(p.last_3_avg ?? 0).toFixed(1)} vs season avg ${(p.season_avg ?? 0).toFixed(1)}`);
      bkPost({ day: "Mon", type: "Image", category: "Form Mover", intent: "cross_game_preview", statLens: "disposals", confidence: "Medium", title: "Players above season avg — last 3 games", content: "Players whose last 3 game average beats their season average. In form right now.", statsShown: bullets, onScreenText: "Last 3 > season avg", caption: buildCaption("In form right now — last 3 above season avg.", bullets, 2), hashtags: HASHTAG_SETS["Form Mover"], suggestedVisual: "L3 vs season avg comparison graphic", imageDescription: `Static image. 5-player comparison grid. Each row: player name, last 3 average, season average, with delta highlighted. Headline: "In Form Right Now — L3 Above Season Avg". Dark background, green accent for positive delta. No betting language.`, dataScope: `${rl} cross-game pool`, targetGame: null, targetGameStatus: "any", fallbackWarning: null, players, thresholdLabel: "L3 vs Season Avg", postNumber: 1 });
    }
  }

  // 16. Players above season average last 5
  {
    const players = dispPool.filter(p => (p.last_5_avg ?? 0) > (p.season_avg ?? 0) + 3 && (p.last_5_avg ?? 0) >= 18).slice(0, 5);
    if (players.length >= 2) {
      const bullets = players.map(p => `${p.player_name} — L5 avg ${(p.last_5_avg ?? 0).toFixed(1)} vs season avg ${(p.season_avg ?? 0).toFixed(1)} (+${formDelta(p).toFixed(1)})`);
      bkPost({ day: "Tue", type: "Image", category: "Form Mover", intent: "cross_game_preview", statLens: "disposals", confidence: "Medium", title: "Players above season avg — last 5 games", content: "5-game form window above season average. Consistent recent improvement.", statsShown: bullets, onScreenText: "Last 5 > season avg", caption: buildCaption("5-game form above season average.", bullets, 3), hashtags: HASHTAG_SETS["Form Mover"], suggestedVisual: "L5 vs season comparison graphic", imageDescription: `Static image. 5-player comparison grid. Each row: player name, L5 average, season average, positive delta (e.g. +5.1). Headline: "5-Game Form Above Season Average". Dark background, green accent for improvement. No betting language.`, dataScope: `${rl} cross-game pool`, targetGame: null, targetGameStatus: "any", fallbackWarning: null, players, thresholdLabel: "L5 vs Season Avg", postNumber: 1 });
    }
  }

  // 17. Most consistent players last 5
  {
    const players = dispPool.filter(p => p.confidence_label === "HIGH" && (p.last_5_avg ?? 0) >= 20).slice(0, 5);
    if (players.length >= 2) {
      const bullets = players.map(p => `${p.player_name} (${p.team_name ?? ""}) — HIGH consistency, L5 avg ${(p.last_5_avg ?? 0).toFixed(1)}, ${pct(getHitRate(p, 20))} at 20+`);
      bkPost({ day: "Wed", type: "Carousel", category: "Disposal Trend", intent: "cross_game_preview", statLens: "disposals", confidence: "High", title: `Most consistent — last 5 games`, content: "High-consistency disposal players. Reliable form, tight variance.", statsShown: bullets, onScreenText: "High consistency", caption: buildCaption("High-consistency disposal players.", bullets, 4), hashtags: HASHTAG_SETS["Disposal Trend"], suggestedVisual: "Consistency tier graphic — HIGH badges", imageDescription: `Carousel. ${players.length} player slides plus a title card. Title card: "Most Consistent — Last 5 Games". Each slide: player name, team abbreviation, HIGH consistency badge, L5 average, 20+ hit rate percentage. Dark background, tight layout. No betting language.`, dataScope: `${rl} cross-game pool`, targetGame: null, targetGameStatus: "any", fallbackWarning: null, players, thresholdLabel: "High Consistency", postNumber: 1 });
    }
  }

  // 18. Team scoring trends
  {
    const teams = teamScoreRows.slice(0, 6);
    if (teams.length >= 2) {
      const bullets = teams.map(t => `${t.team_name ?? ""} — L5 avg ${getTeamL5Avg(t).toFixed(1)} pts (season avg ${getTeamSeasonAvg(t).toFixed(1)})`);
      bkPost({ day: "Thu", type: "Carousel", category: "Team Total", intent: "cross_game_preview", statLens: "team-total", confidence: "High", title: `Team scoring trends — ${rl}`, content: "Which teams are running the most points through the season? Scoring environments explained.", statsShown: bullets, onScreenText: "Team scoring", caption: buildCaption("Team scoring trends.", bullets, 5), hashtags: HASHTAG_SETS["Team Total"], suggestedVisual: "Team scoring bar chart carousel", imageDescription: `Carousel. ${teams.length} team slides plus a title card. Title card: "Team Scoring Trends". Each slide: team name, team logo placeholder, L5 average score, season average score. Horizontal bar or stat row layout. Dark background, neutral colour palette. No betting language.`, dataScope: `${rl} team pool`, targetGame: null, targetGameStatus: "any", fallbackWarning: null, players: [], teams: teams.map(t => t.team_name ?? ""), thresholdLabel: "Team Score", postNumber: 1 });
    }
  }

  // 19. Team defensive/conceded trends
  {
    const teamsDisp = [...(data.teamDisposals || [])].sort((a, b) => getTeamL5Avg(b) - getTeamL5Avg(a)).slice(0, 5);
    if (teamsDisp.length >= 2) {
      const bullets = teamsDisp.map(t => `${t.team_name ?? ""} — concedes L5 avg ${getTeamL5Avg(t).toFixed(1)} disposals against`);
      bkPost({ day: "Fri", type: "Image", category: "Matchup Angle", intent: "cross_game_preview", statLens: "disposals", confidence: "Medium", title: `Disposal concession rates — ${rl}`, content: "Teams that concede the most disposals to opponents. Matchup context.", statsShown: bullets, onScreenText: "Conceded disposals", caption: buildCaption("Disposal concession matchup context.", bullets, 0), hashtags: HASHTAG_SETS["Matchup Angle"], suggestedVisual: "Team concession rate comparison graphic", imageDescription: `Static image. ${teamsDisp.length}-team ranked list. Title: "Teams Conceding Most Disposals". Each row: team name, L5 average disposals conceded to opponents. Ranked top-to-bottom. Dark background, clean stat layout. No player names. No betting language.`, dataScope: `${rl} team disposal rows`, targetGame: null, targetGameStatus: "any", fallbackWarning: null, players: [], teams: teamsDisp.map(t => t.team_name ?? ""), thresholdLabel: "Disposal Conceded", postNumber: 1 });
    }
  }

  // 20. One stat before bounce — generic
  {
    const player = dispPool[0];
    if (player) {
      const bullet = `${player.player_name} (${player.team_name ?? ""}) — ${pct(getHitRate(player, 20))} at 20+, L5 avg ${getL5Avg(player).toFixed(1)}, season avg ${getSeasonAvg(player).toFixed(1)}`;
      bkPost({ day: "Sat", type: "Short video", category: "Round Preview", intent: "pre_game", statLens: "disposals", confidence: "High", title: "One stat before bounce", content: "One stat. No fluff. Just the number.", statsShown: [bullet], onScreenText: `${player.player_name} — L5 avg ${getL5Avg(player).toFixed(1)}`, caption: buildCaption("One stat before bounce. See the data, make your own call.", [bullet], 1), hashtags: HASHTAG_SETS.gameday, suggestedVisual: "Single-player full-screen graphic — team colours, L5 avg", imageDescription: `Short video / static frame. Single player focus. Full-screen layout: player name large, team name below, L5 average centred in bold. 20+ hit rate shown as percentage bar. Team colours as background accent. No other players. No betting language.`, dataScope: `${rl} top disposal player`, targetGame: null, targetGameStatus: "upcoming", fallbackWarning: null, players: [player], thresholdLabel: "20+ Disposals", postNumber: 1 });
    }
  }

  // 21. Weekend recap proof post
  {
    const hasCompleted = completedMatches.length > 0;
    // Use threshold-correct pool (same logic as Monday Post 1 and Sunday Post 3)
    const bkProofPlayers = pool30.length >= 3 ? pool30.slice(0, 5)
      : poolElite.length >= 3 ? poolElite.slice(0, 5)
      : pool20.length >= 3 ? pool20.slice(0, 5)
      : dispPool.slice(0, 5);
    const bkThrNum = pool30.length >= 3 ? 30 : poolElite.length >= 3 ? 25 : 20;
    const bkThrLabel = `${bkThrNum}+ Disposals`;
    const bullets = bkProofPlayers.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, bkThrNum))} at ${bkThrNum}+, L5 avg ${getL5Avg(p).toFixed(1)}`
    );
    bkPost({
      day: "Mon", type: "Carousel",
      category: hasCompleted ? "Proof Post" : "Round Wrap",
      intent: "recap",
      statLens: "disposals", confidence: hasCompleted ? "High" : "Fallback",
      title: hasCompleted ? `${rl} weekend ${bkThrLabel.toLowerCase()} proof post` : `${rl} ${bkThrLabel.toLowerCase()} watchlist`,
      content: hasCompleted
        ? `${rl} wrapped. Checking the ${bkThrLabel.toLowerCase()} leaders — did the numbers deliver?`
        : `${rl} disposal form recap — L5 averages and hit rates for ${bkThrLabel.toLowerCase()} performers.`,
      statsShown: bullets,
      onScreenText: hasCompleted ? "Did the stats deliver?" : "Disposal watchlist",
      caption: buildCaption(hasCompleted ? `${rl} wrapped.` : `${rl} disposal form.`, bullets, 2),
      hashtags: HASHTAG_SETS[hasCompleted ? "Proof Post" : "Round Wrap"],
      suggestedVisual: "Weekend proof carousel — player vs L5 average",
      imageDescription: hasCompleted
        ? `Carousel. ${bkProofPlayers.length} player slides. Title card: "${rl} — Did The Stats Deliver?". Each slide: player name, team, ${bkThrLabel} hit rate, actual game result vs L5 average. Dark background, green highlight for hit, red for miss. No betting language.`
        : `Carousel. ${bkProofPlayers.length} player slides. Title card: "${rl} ${bkThrLabel} Watchlist". Each slide: player name, team, L5 average, ${bkThrLabel} hit rate percentage. Dark background, clean stat layout. No betting language.`,
      dataScope: hasCompleted ? "Completed weekend games" : `${rl} round pool`,
      targetGame: hasCompleted ? "Weekend completed games" : null,
      targetGameStatus: hasCompleted ? "completed" : "any",
      fallbackWarning: hasCompleted ? null : "No completed game data — showing as watchlist. Do not label as proof/recap.",
      players: bkProofPlayers, thresholdLabel: bkThrLabel, postNumber: 1,
    });
  }

  // 22. Next round watchlist
  {
    const players = dispPool.slice(0, 5);
    const bullets = players.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — season avg ${getSeasonAvg(p).toFixed(1)}, L5 avg ${getL5Avg(p).toFixed(1)}, ${pct(getHitRate(p, 20))} at 20+`
    );
    bkPost({
      day: "Sun", type: "Carousel", category: "Round Preview", intent: "evergreen_backup",
      statLens: "disposals", confidence: "Medium",
      title: "Watchlist — next round",
      content: "Building the watchlist for next round. Consistent performers with strong form numbers.",
      statsShown: bullets,
      onScreenText: "Next round watchlist",
      caption: buildCaption("Watchlist for next round.", bullets, 3),
      hashtags: HASHTAG_SETS["Round Preview"],
      suggestedVisual: "Watchlist carousel — 5 players with season and L5 stats",
      imageDescription: `Carousel. ${players.length} player slides plus a title card. Title card: "Next Round Watchlist". Each slide: player name, team abbreviation, season average, L5 average, 20+ hit rate percentage. Dark background, watchlist badge accent. No betting language.`,
      dataScope: `${rl} cross-game pool`,
      targetGame: null, targetGameStatus: "any", fallbackWarning: null,
      players, thresholdLabel: "20+ Disposals", postNumber: 1,
    });
  }

  return { schedule, backup, excludedCount };
}

// ─── Copy utilities ───────────────────────────────────────────────────────────

function buildFullPostText(post: SocialPost, includeHeader = true): string {
  const lines: string[] = [];
  if (includeHeader) {
    lines.push(`${DAY_FULL[post.day].toUpperCase()} — POST ${post.postNumber}`);
    lines.push(`Time: ${post.postTime}`);
    lines.push(`Platforms: TikTok + Instagram + Facebook`);
    lines.push(`Type: ${post.type}`);
    lines.push(`Intent: ${post.intent}`);
    lines.push(``);
  }
  lines.push(`Content: ${post.content}`);
  lines.push(``);
  if (post.statsShown.length > 0) {
    lines.push(`Stats shown:`);
    post.statsShown.forEach(s => lines.push(`  • ${s}`));
    lines.push(``);
  }
  lines.push(`On-screen text: ${post.onScreenText}`);
  lines.push(``);
  lines.push(`Caption:`);
  lines.push(post.caption);
  lines.push(``);
  lines.push(`Hashtags: ${post.hashtags.join(" ")}`);
  lines.push(``);
  lines.push(`Suggested visual: ${post.suggestedVisual}`);
  if (post.imageDescription) {
    lines.push(``);
    lines.push(`Image description: ${post.imageDescription}`);
  }
  return lines.join("\n");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: PostType }) {
  const cls =
    type === "Carousel" ? "bg-sky-950/60 text-sky-300 border-sky-600/30" :
    type === "Image" ? "bg-emerald-950/60 text-emerald-300 border-emerald-600/30" :
    "bg-violet-950/60 text-violet-300 border-violet-600/30";
  return <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide ${cls}`}>{type}</span>;
}

function IntentBadge({ intent }: { intent: PostIntent }) {
  const map: Record<PostIntent, { label: string; cls: string }> = {
    recap:             { label: "Recap",        cls: "bg-amber-950/60 text-amber-300 border-amber-600/30" },
    same_day_preview:  { label: "Same-day",     cls: "bg-emerald-950/60 text-emerald-300 border-emerald-600/30" },
    cross_game_preview:{ label: "Cross-game",   cls: "bg-zinc-800 text-zinc-300 border-zinc-700" },
    pre_game:          { label: "Pre-game",      cls: "bg-sky-950/60 text-sky-300 border-sky-600/30" },
    evergreen_backup:  { label: "Evergreen",    cls: "bg-zinc-900 text-zinc-500 border-zinc-800" },
  };
  const { label, cls } = map[intent];
  return <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${cls}`}>{label}</span>;
}

function ConfidenceBadge({ confidence }: { confidence: ConfidenceLevel }) {
  const cls =
    confidence === "High"     ? "bg-emerald-950/60 text-emerald-300 border-emerald-600/30" :
    confidence === "Medium"   ? "bg-amber-950/60 text-amber-300 border-amber-600/30" :
    "bg-zinc-800 text-zinc-500 border-zinc-700";
  return <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${cls}`}>{confidence}</span>;
}

function CopyBtn({
  label, onClick, copied, small = false,
}: { label: string; onClick: () => void; copied: boolean; small?: boolean }) {
  const sz = small ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-[11px]";
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-lg border transition-colors ${sz} font-medium ${
        copied
          ? "bg-emerald-900/50 text-emerald-300 border-emerald-700/40"
          : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500 hover:text-zinc-100"
      }`}
    >
      {copied ? <Check className="h-3 w-3 shrink-0" /> : <Copy className="h-3 w-3 shrink-0" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[120px_1fr] gap-x-2 items-baseline">
      <span className="text-[10px] text-zinc-500 font-medium shrink-0">{label}</span>
      <span className="text-[11px] text-zinc-300 break-words">{value}</span>
    </div>
  );
}

function SocialPostCard({
  post, copiedId, onCopyField,
}: {
  post: SocialPost;
  copiedId: string | null;
  onCopyField: (id: string, text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const copyKey = (suffix: string) => `${post.id}-${suffix}`;

  return (
    <div className={`border rounded-xl overflow-hidden ${post.isBackup ? "border-zinc-800/60 bg-zinc-900/20" : "border-zinc-800 bg-zinc-900/30"}`}>
      {/* Collapsed header */}
      <div
        className="flex items-start gap-2 p-3 cursor-pointer hover:bg-zinc-800/20 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap mb-1">
            <span className="text-[9px] font-bold text-zinc-400 bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded uppercase tracking-wide">
              Post {post.postNumber}
            </span>
            <TypeBadge type={post.type} />
            <IntentBadge intent={post.intent} />
            <ConfidenceBadge confidence={post.confidence} />
            {post.isBackup && (
              <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-zinc-900 text-zinc-600 border-zinc-800">Backup</span>
            )}
          </div>
          <p className="text-[12.5px] font-semibold text-zinc-200 leading-snug">{post.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <Clock className="h-2.5 w-2.5 text-zinc-600 shrink-0" />
            <span className="text-[10px] text-zinc-500">{post.postTime}</span>
            <span className="text-zinc-700">·</span>
            <span className="text-[10px] text-zinc-500">TikTok + Instagram + Facebook</span>
            <span className="text-zinc-700">·</span>
            <span className="text-[10px] text-zinc-500">{post.thresholdLabel}</span>
            {post.fallbackWarning && (
              <AlertTriangle className="h-2.5 w-2.5 text-amber-500 shrink-0" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onCopyField(copyKey("full"), buildFullPostText(post)); }}
            title="Copy full post"
            className="p-1.5 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {copiedId === copyKey("full") ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-zinc-600" /> : <ChevronDown className="h-3.5 w-3.5 text-zinc-600" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-zinc-800/50 p-3 space-y-3">
          {/* Meta fields */}
          <div className="space-y-1.5">
            <Field label="Day" value={DAY_FULL[post.day]} />
            <Field label="Post time" value={post.postTime} />
            <Field label="Platforms" value="TikTok + Instagram + Facebook" />
            <Field label="Type" value={post.type} />
            <Field label="Intent" value={post.intent} />
            <Field label="Data scope" value={post.dataScope} />
            {post.targetGame && <Field label="Target game" value={post.targetGame} />}
            {post.targetGameStatus && <Field label="Game status" value={post.targetGameStatus} />}
          </div>

          {post.fallbackWarning && (
            <div className="flex items-start gap-1.5 text-[10px] text-amber-400 bg-amber-950/20 border border-amber-800/30 rounded-lg px-2.5 py-2">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{post.fallbackWarning}</span>
            </div>
          )}

          <div className="border-t border-zinc-800/50 pt-2.5 space-y-1.5">
            <Field label="Content" value={post.content} />
          </div>

          {post.statsShown.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-500 font-medium">Stats shown</span>
              <ul className="space-y-0.5">
                {post.statsShown.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-zinc-300">
                    <span className="text-zinc-600 shrink-0 mt-0.5">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-1.5">
            <Field label="On-screen text" value={post.onScreenText} />
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-zinc-500 font-medium">Caption</span>
            <pre className="text-[11px] text-zinc-300 bg-zinc-800/40 rounded-lg p-2.5 whitespace-pre-wrap break-words font-sans leading-relaxed">{post.caption}</pre>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-zinc-500 font-medium">Hashtags</span>
            <div className="flex flex-wrap gap-1">
              {post.hashtags.map(h => (
                <span key={h} className="text-[10px] text-zinc-500 bg-zinc-800/60 px-1.5 py-0.5 rounded">{h}</span>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Field label="Suggested visual" value={post.suggestedVisual} />
            {post.imageDescription && <Field label="Image description" value={post.imageDescription} />}
          </div>

          {/* Copy buttons row */}
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-zinc-800/50">
            <CopyBtn
              label="Copy full post"
              onClick={() => onCopyField(copyKey("full"), buildFullPostText(post))}
              copied={copiedId === copyKey("full")}
            />
            <CopyBtn
              label="Copy caption"
              onClick={() => onCopyField(copyKey("caption"), post.caption)}
              copied={copiedId === copyKey("caption")}
              small
            />
            <CopyBtn
              label="Copy hashtags"
              onClick={() => onCopyField(copyKey("hashtags"), post.hashtags.join(" "))}
              copied={copiedId === copyKey("hashtags")}
              small
            />
            <CopyBtn
              label="Copy on-screen text"
              onClick={() => onCopyField(copyKey("onscreen"), post.onScreenText)}
              copied={copiedId === copyKey("onscreen")}
              small
            />
            {post.statsShown.length > 0 && (
              <CopyBtn
                label="Copy stat list"
                onClick={() => onCopyField(copyKey("stats"), post.statsShown.map(s => `• ${s}`).join("\n"))}
                copied={copiedId === copyKey("stats")}
                small
              />
            )}
            {post.imageDescription && (
              <CopyBtn
                label="Copy image description"
                onClick={() => onCopyField(copyKey("imgdesc"), post.imageDescription)}
                copied={copiedId === copyKey("imgdesc")}
                small
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Freshness panel ──────────────────────────────────────────────────────────

function FreshnessPanel({ data, excludedCount }: { data: CIDataSubset; excludedCount: number }) {
  const ageMin = Math.floor((Date.now() - data.loadedAt.getTime()) / 60000);
  const upcoming = data.matches.filter(isUpcoming).length;
  const completed = data.matches.filter(isCompleted).length;
  const fallbackWarnings =
    (data.disposalPlayers.length === 0 ? 1 : 0) +
    (data.goalPlayers.length === 0 ? 1 : 0) +
    (upcoming === 0 ? 1 : 0);

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 space-y-2.5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-semibold">
          <Zap className="h-3.5 w-3.5 text-amber-400" />
          {data.roundLabel} — {ageMin < 1 ? "just loaded" : `loaded ${ageMin} min ago`}
        </div>
        <span className="text-[10px] text-zinc-600">Planner updates from current Content Intel data. Refresh after round rollover.</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 text-[10px]">
        {[
          { label: "Upcoming games", val: upcoming,                        warn: upcoming === 0 },
          { label: "Completed games", val: completed,                       warn: false },
          { label: "Disposal players", val: data.disposalPlayers.length,   warn: data.disposalPlayers.length === 0 },
          { label: "Goal players",     val: data.goalPlayers.length,        warn: data.goalPlayers.length === 0 },
          { label: "Team rows",        val: data.teamScore?.length ?? 0,    warn: (data.teamScore?.length ?? 0) === 0 },
          { label: "Excluded players", val: excludedCount,                   warn: excludedCount > 0 },
          { label: "Fallback warnings",val: fallbackWarnings,               warn: fallbackWarnings > 0 },
        ].map(({ label, val, warn }) => (
          <div key={label} className="bg-zinc-800/50 rounded-lg p-2">
            <div className="text-zinc-500">{label}</div>
            <div className={`text-[13px] font-bold mt-0.5 ${warn ? "text-amber-400" : "text-zinc-200"}`}>{val}</div>
          </div>
        ))}
      </div>
      {data.disposalPlayers.length === 0 && (
        <p className="text-[10px] text-amber-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          No disposal player data loaded. Refresh data on the Freshness tab first.
        </p>
      )}
    </div>
  );
}

// ─── Select helper ────────────────────────────────────────────────────────────

function Sel({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
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
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SocialPostPlanner({ data }: { data: CIDataSubset }) {
  const [activeDay, setActiveDay] = useState<DayOfWeek | "backup">("Mon");
  const [typeFilter, setTypeFilter] = useState<PostType | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [toneFilter, setToneFilter] = useState<CopyTone | "all">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { schedule, backup, excludedCount } = useMemo(() => buildWeeklyPlan(data), [data]);

  const handleCopyField = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  }, []);

  const handleCopyAllDay = useCallback((day: DayOfWeek) => {
    const posts = schedule.filter(p => p.day === day).sort((a, b) => a.postNumber - b.postNumber);
    const text = posts.map(p => buildFullPostText(p, true)).join("\n\n---\n\n");
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(`copyall-${day}`);
    setTimeout(() => setCopiedId(null), 1800);
  }, [schedule]);

  function applyFilters(posts: SocialPost[]): SocialPost[] {
    return posts.filter(p => {
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (toneFilter !== "all" && p.tone !== toneFilter) return false;
      return true;
    });
  }

  const isBackupTab = activeDay === "backup";

  const activePosts = useMemo(() => {
    const base = isBackupTab ? backup : schedule.filter(p => p.day === activeDay);
    return applyFilters(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDay, schedule, backup, typeFilter, categoryFilter, toneFilter]);

  const scheduledCountByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of schedule) counts[p.day] = (counts[p.day] ?? 0) + 1;
    return counts;
  }, [schedule]);

  const tabCls = (key: DayOfWeek | "backup") => {
    const active = activeDay === key;
    return `relative px-3 py-2 text-[11.5px] font-medium whitespace-nowrap transition-colors min-h-[40px] ${
      active ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
    }`;
  };

  const CATEGORIES: PostCategory[] = [
    "Disposal Trend", "Goal Trend", "Tackle Trend",
    "Form Mover", "Team Total", "Matchup Angle",
    "Round Preview", "Round Wrap", "Proof Post",
  ];

  return (
    <div className="space-y-4 pt-4">
      <FreshnessPanel data={data} excludedCount={excludedCount} />

      {/* Day tabs */}
      <div
        className="overflow-x-auto touch-pan-x overscroll-x-contain -mx-4"
        style={{ scrollbarWidth: "none" } as React.CSSProperties}
      >
        <div className="flex gap-0 border-b border-zinc-800 px-4 w-max min-w-full">
          {DAYS.map(day => (
            <button key={day} onClick={() => setActiveDay(day)} className={tabCls(day)}>
              <span className="hidden sm:inline">{DAY_FULL[day]}</span>
              <span className="sm:hidden">{day}</span>
              {(scheduledCountByDay[day] ?? 0) > 0 && (
                <span className="ml-1 text-[8.5px] bg-zinc-700 text-zinc-400 px-1 rounded">{scheduledCountByDay[day]}</span>
              )}
              {activeDay === day && <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-t bg-zinc-100" />}
            </button>
          ))}
          <button onClick={() => setActiveDay("backup")} className={tabCls("backup")}>
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              <span className="hidden sm:inline">Backup Bank</span>
              <span className="sm:hidden">BK</span>
            </span>
            {backup.length > 0 && (
              <span className="ml-1 text-[8.5px] bg-zinc-700 text-zinc-400 px-1 rounded">{backup.length}</span>
            )}
            {activeDay === "backup" && <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-t bg-zinc-100" />}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(["all", "Image", "Carousel", "Short video"] as (PostType | "all")[]).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                typeFilter === t
                  ? "bg-zinc-200 text-zinc-900 border-zinc-300"
                  : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t === "all" ? "All types" : t}
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
            label="Copy tone"
            value={toneFilter}
            onChange={v => setToneFilter(v as CopyTone | "all")}
            options={[
              { value: "all", label: "All tones" },
              { value: "clean_stats", label: "Clean Stats" },
              { value: "punchier_social", label: "Punchier Social" },
              { value: "short_caption", label: "Short Caption" },
            ]}
          />
        </div>
      </div>

      {/* Day header with count + copy-all */}
      {!isBackupTab && activeDay !== "backup" && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <Calendar className="h-3 w-3" />
            <span>
              <span className="text-zinc-300 font-medium">{activePosts.length}</span>
              {" post"}{activePosts.length !== 1 ? "s" : ""} for {DAY_FULL[activeDay as DayOfWeek]}
            </span>
            {activePosts.length === 0 && (
              <span className="text-amber-400">— try adjusting filters or check freshness panel above</span>
            )}
          </div>
          <button
            onClick={() => handleCopyAllDay(activeDay as DayOfWeek)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
              copiedId === `copyall-${activeDay}`
                ? "bg-emerald-900/50 text-emerald-300 border-emerald-700/40"
                : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500 hover:text-zinc-100"
            }`}
          >
            {copiedId === `copyall-${activeDay}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            Copy all 3 posts for {DAY_FULL[activeDay as DayOfWeek]}
          </button>
        </div>
      )}

      {isBackupTab && (
        <div className="text-[11px] text-zinc-500">
          <span className="text-zinc-300 font-medium">Backup Bank ({activePosts.length})</span>
          {" "} — unique posts available for any day
        </div>
      )}

      {/* Post list */}
      {activePosts.length === 0 ? (
        <div className="py-8 text-center text-zinc-600 text-[12px]">
          {data.disposalPlayers.length === 0
            ? "No player data loaded. Refresh data on the Freshness tab first."
            : "No posts match the current filters."}
        </div>
      ) : (
        <div className="space-y-2.5">
          {activePosts.map(post => (
            <SocialPostCard
              key={post.id}
              post={post}
              copiedId={copiedId}
              onCopyField={handleCopyField}
            />
          ))}
        </div>
      )}
    </div>
  );
}
