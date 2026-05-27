/**
 * Social Post Planner — weekly AFL content posting plan.
 * Admin-only. No public exposure.
 * All posts target TikTok + Instagram + Facebook simultaneously.
 */
import { useState, useMemo, useCallback, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { Copy, Check, ChevronDown, ChevronUp, Calendar, Hash, Zap, TriangleAlert as AlertTriangle, Clock, Shield, Star, Crosshair, LayoutGrid } from "lucide-react";
import {
  buildGamePicks,
  filterPicksByConsistency,
  consistencyLabel,
  consistencyColor,
  formatGamePicksForCopy,
  tierLabel,
  tierColor,
} from "./social-planner/gamePicksEngine";
import type { GamePick, GamePickPlayer, ConsistencyTier, GamePickLens } from "./social-planner/gamePicksEngine";
import { buildAllGamePickMarketingPacks } from "./social-planner/gamePickPostKit";
import type { GamePickMarketingPack, GamePickPostKit } from "./social-planner/gamePickPostKit";
import type { StatBoardPlayer, StatBoardMatch } from "@/features/afl/stat-board/types";
import type { StatBoardTeamRow } from "@/features/afl/stat-board/teamTypes";
import { enrichPost } from "./social-planner/postEnrichment";
import { buildEvergreenPool } from "./social-planner/evergreenPosts";
import { normaliseRate, getRecentHitRecord } from "./social-planner/statLineEngine";
import { usePostStatus, STATUS_LABELS, STATUS_OPTIONS } from "./social-planner/usePostStatus";
import type {
  SocialPost,
  PostStatus,
  CIDataSubset,
  DayOfWeek,
  PostType,
  PostIntent,
  PostCategory,
  CopyTone,
  StatLens,
  ConfidenceLevel,
} from "./social-planner/types";

// Re-export CIDataSubset for AdminContentIntel compatibility
export type { CIDataSubset };

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

const HASHTAG_SETS: Record<PostCategory | "base", string[]> = {
  base:              ["#AFL", "#AFLStats", "#FootyStats", "#AFL2026", "#NeekoSportsStats"],
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

function gamedayHashtags(day: DayOfWeek): string[] {
  const base = ["#AFL", "#AFLStats", "#NeekoSportsStats"];
  if (day === "Thu") return [...base, "#ThursdayFooty"];
  if (day === "Sat") return [...base, "#SaturdayFooty"];
  if (day === "Sun") return [...base, "#SundayFooty"];
  return base;
}

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
  const raw = p.all_threshold_hit_rates?.[String(threshold)]?.rate ?? 0;
  return normaliseRate(raw);
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
 * Uses L5 avg AND hit rates — both conditions must be met for 30+/25+.
 * Hard rule: a player who qualifies for 30+ must NOT appear in a 20+ post.
 *
 * 30+: L5 ≥ 27.0 AND hr30 ≥ 0.70 (genuine 30+ tier only)
 * 25+: L5 ≥ 24.5 AND hr25 ≥ 0.70 AND does NOT qualify at 30+ tier
 * 20+: L5 ≥ 18.0 AND hr20 ≥ 0.55
 * 15+: L5 ≥ 13.0 AND hr15 ≥ 0.55
 */
function bestDisposalThreshold(p: StatBoardPlayer): 30 | 25 | 20 | 15 | 10 {
  const l5  = p.last_5_avg  ?? 0;
  const sea = p.season_avg  ?? 0;
  const avgL5Sea = l5 > 0 ? l5 : sea; // prefer L5, fall back to season
  const hr30 = getHitRate(p, 30);
  const hr25 = getHitRate(p, 25);
  const hr20 = getHitRate(p, 20);
  const hr15 = getHitRate(p, 15);

  // 30+: both volume and hit rate must be elite
  if (avgL5Sea >= 27.0 && hr30 >= 0.70) return 30;

  // 25+: strong L5 and hit rate, must NOT qualify as 30+ tier (already handled above)
  if (avgL5Sea >= 24.5 && hr25 >= 0.70) return 25;

  // 20+: moderate volume with solid hit rate
  if (avgL5Sea >= 18.0 && hr20 >= 0.55) return 20;

  // 15+: accessible tier
  if (avgL5Sea >= 13.0 && hr15 >= 0.55) return 15;

  return 10;
}

/**
 * Returns the highest goal threshold bucket a player genuinely belongs to.
 *
 * 3+: hr3 ≥ 0.40 AND sample ≥ 5 AND L5 ≥ 2.0 (genuine multi-goal players only)
 * 2+: hr2 ≥ 0.45 AND sample ≥ 5 AND L5 ≥ 1.3
 * 1+: hr1 ≥ 0.55 AND sample ≥ 4 AND L5 ≥ 0.5
 */
function bestGoalThreshold(p: StatBoardPlayer): 3 | 2 | 1 {
  const hr3 = getHitRate(p, 3);
  const hr2 = getHitRate(p, 2);
  const hr1 = getHitRate(p, 1);
  const l5  = p.last_5_avg ?? 0;
  const rec3 = getRecentHitRecord(p, 3);
  const rec2 = getRecentHitRecord(p, 2);
  const rec1 = getRecentHitRecord(p, 1);

  if (hr3 >= 0.40 && rec3.sample >= 5 && l5 >= 2.0) return 3;
  if (hr2 >= 0.45 && rec2.sample >= 5 && l5 >= 1.3) return 2;
  if (hr1 >= 0.55 && rec1.sample >= 4 && l5 >= 0.5) return 1;
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

function buildWeeklyPlan(data: CIDataSubset): { schedule: SocialPost[]; backup: SocialPost[]; evergreen: SocialPost[]; excludedCount: number } {
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

  // Legacy compat: top25/top20/top15 draw from strictly segmented pools.
  // Hard rule: elite players (pool30/pool25) must NOT bleed into lower-tier posts.
  const top25 = (pool25.length >= 3 ? pool25 : poolElite).slice(0, 5);
  // top20: ONLY from pool20 — never from pool25/pool30
  const top20 = pool20.slice(0, 5);
  // top15: ONLY from pool15 — fall back to pool20 only (not higher tiers)
  const top15 = (pool15.length >= 2 ? pool15 : pool20).slice(0, 5);

  // ── Weekly fingerprint — deduplicate cross-game 30+ disposal posts ─────────
  // Allow only ONE global cross-game 30+ disposal post per week.
  // Same-day (game-specific) 30+ posts are exempt from this limit.
  let globalElitePostUsed = false;

  // ── Threshold-segmented goal pools ───────────────────────────────────────
  // 3+ pool: bestGoalThreshold already enforces hr≥0.40+sample≥5+L5≥2.0
  // Additionally require at least 3 qualifying players before using 3+ bucket
  const goalPool3Raw = goalPool.filter(p => bestGoalThreshold(p) === 3);
  const goalPool3 = goalPool3Raw.length >= 3 ? goalPool3Raw : [];
  const goalPool2 = goalPool.filter(p => bestGoalThreshold(p) === 2);
  const goalPool1 = goalPool.filter(p => bestGoalThreshold(p) === 1);

  // Helper for match label
  const firstUpcoming = upcomingMatches[0];
  const upcomingGameLabel = firstUpcoming
    ? `${firstUpcoming.home_team_name} v ${firstUpcoming.away_team_name}`
    : null;

  // ── MONDAY ────────────────────────────────────────────────────────────────

  // Post 1 — Previous week results (if completed games exist) else 20+ watchlist
  {
    const hasCompleted = completedMatches.length > 0;

    if (hasCompleted) {
      // Recap framing — use the best available disposal pool for proof context
      const recapPool = pool20.length >= 3 ? pool20
        : poolElite.length >= 3 ? poolElite
        : dispPool;
      const recapThrNum = pool20.length >= 3 ? 20 : poolElite.length >= 3 ? 25 : 20;
      const recapPlayers = recapPool.slice(0, 5);
      const bullets = recapPlayers.map(p =>
        `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, recapThrNum))} at ${recapThrNum}+, L5 avg ${getL5Avg(p).toFixed(1)}`
      );
      const hook = `${rl} results in. Here's how the form numbers looked across the weekend.`;
      schedule.push(makePost({
        day: "Mon", postNumber: 1,
        type: "Carousel",
        category: "Round Wrap", intent: "recap",
        statLens: "disposals", confidence: "High",
        title: `${rl} — previous round results`,
        content: hook,
        statsShown: bullets,
        onScreenText: "Weekend results",
        caption: buildCaption(hook, bullets, 0),
        hashtags: HASHTAG_SETS["Round Wrap"],
        suggestedVisual: `${recapPlayers.length}-player recap grid — name, team, ${recapThrNum}+ hit rate, L5 avg`,
        imageDescription: `Carousel. ${recapPlayers.length} players, one per slide. Each slide: player name, team, ${recapThrNum}+ disposal hit rate, L5 average. Title card: "${rl} — Round Results". Dark background, AFL team colours as accents. No betting language.`,
        dataScope: "Completed weekend games",
        targetGame: null,
        targetGameStatus: "completed",
        fallbackWarning: null,
        players: recapPlayers,
        thresholdLabel: `${recapThrNum}+ Disposals`,
      }));
    } else {
      // No completed games — show 20+ disposal watchlist instead
      const mon1Players = pool20.length >= 3 ? pool20.slice(0, 5)
        : pool20.length >= 1 ? [...pool20, ...pool15].slice(0, 5)
        : pool15.slice(0, 5);
      const mon1ThrNum = pool20.length >= 2 ? 20 : 15;
      const hook = `${rl} preview — who's been clearing ${mon1ThrNum}+ disposals consistently?`;
      const bullets = mon1Players.map(p =>
        `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, mon1ThrNum))} at ${mon1ThrNum}+, L5 avg ${getL5Avg(p).toFixed(1)}`
      );
      schedule.push(makePost({
        day: "Mon", postNumber: 1,
        type: "Carousel",
        category: "Disposal Trend", intent: "cross_game_preview",
        statLens: "disposals", confidence: pool20.length >= 3 ? "High" : "Medium",
        title: `${rl} — ${mon1ThrNum}+ disposals watchlist`,
        content: hook,
        statsShown: bullets,
        onScreenText: `${mon1ThrNum}+ disposal form`,
        caption: buildCaption(hook, bullets, 0),
        hashtags: HASHTAG_SETS["Disposal Trend"],
        suggestedVisual: `${mon1Players.length}-player stat grid — name, team, ${mon1ThrNum}+ hit rate, L5 avg`,
        imageDescription: `Carousel. ${mon1Players.length} players, one per slide. Each slide: player name, team, ${mon1ThrNum}+ disposals hit rate as a percentage, L5 average. Dark background, AFL team colours as accents. Headline: "${rl} — ${mon1ThrNum}+ Disposals Watchlist". No betting language.`,
        dataScope: `${rl} ${mon1ThrNum}+ disposal player pool`,
        targetGame: null,
        targetGameStatus: "any",
        fallbackWarning: pool20.length < 2 ? `Low 20+ candidate count — using ${mon1ThrNum}+ pool instead` : null,
        players: mon1Players,
        thresholdLabel: `${mon1ThrNum}+ Disposals`,
      }));
    }
  }

  // Post 2 — Current week 20+ disposals (strict pool20 only)
  {
    const mon2Players = pool20.length >= 3 ? pool20.slice(0, 5)
      : pool20.length >= 1 ? [...pool20, ...pool15].slice(0, 5)
      : pool15.slice(0, 5);
    const isFallback = pool20.length < 2;
    const mon2ThrNum = pool20.length >= 2 ? 20 : 15;
    const hook = `${rl} — players consistently clearing ${mon2ThrNum}+ disposals. Stats over gut feel.`;
    const bullets = mon2Players.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, mon2ThrNum))} at ${mon2ThrNum}+, L5 avg ${getL5Avg(p).toFixed(1)}`
    );
    schedule.push(makePost({
      day: "Mon", postNumber: 2,
      type: "Image",
      category: "Disposal Trend", intent: "cross_game_preview",
      statLens: "disposals", confidence: isFallback ? "Medium" : "High",
      title: `${rl} — ${mon2ThrNum}+ disposal form`,
      content: hook,
      statsShown: bullets,
      onScreenText: `${mon2ThrNum}+ disposal form`,
      caption: buildCaption(hook, bullets, 1),
      hashtags: HASHTAG_SETS["Disposal Trend"],
      suggestedVisual: `5-player stat grid — name, team, ${mon2ThrNum}+ hit rate, L5 avg`,
      imageDescription: `Static image. 5-player stat grid. Threshold: ${mon2ThrNum}+ disposals. Each row: player name, team abbreviation, ${mon2ThrNum}+ hit rate percentage, L5 average. These players sit in the ${mon2ThrNum}+ tier only. Dark background, stat values highlighted. No betting language.`,
      dataScope: `${rl} ${mon2ThrNum}+ disposal player pool (strict tier)`,
      targetGame: null,
      targetGameStatus: "any",
      fallbackWarning: isFallback ? `Low 20+ candidate count — using ${mon2ThrNum}+ pool` : null,
      players: mon2Players,
      thresholdLabel: `${mon2ThrNum}+ Disposals`,
    }));
  }

  // Post 3 — Current week 1+ goals
  {
    const mon3Players = (goalPool1.length >= 2 ? goalPool1 : goalPool).slice(0, 5);
    const hook = `${rl} — goal scorer form. Who's been finding the big sticks regularly?`;
    const bullets = mon3Players.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, 1))} at 1+ goals, L5 avg ${getL5Avg(p).toFixed(1)}`
    );
    schedule.push(makePost({
      day: "Mon", postNumber: 3,
      type: "Carousel",
      category: "Goal Trend", intent: "cross_game_preview",
      statLens: "goals", confidence: mon3Players.length >= 3 ? "High" : "Medium",
      title: `${rl} — 1+ goal scorer form`,
      content: hook,
      statsShown: bullets,
      onScreenText: "Goal scorer form",
      caption: buildCaption(hook, bullets, 2),
      hashtags: HASHTAG_SETS["Goal Trend"],
      suggestedVisual: `${mon3Players.length}-player goal form grid — name, team, 1+ hit rate, L5 avg`,
      imageDescription: `Carousel. ${mon3Players.length} players, one per slide. Each: player name, team, 1+ goal hit rate as percentage, L5 average. Dark background, clean layout. No betting language.`,
      dataScope: `${rl} 1+ goal player pool`,
      targetGame: null,
      targetGameStatus: "any",
      fallbackWarning: goalPool1.length < 2 ? "Low 1+ only candidates — using full goal pool" : null,
      players: mon3Players,
      thresholdLabel: "1+ Goals",
    }));
  }

  // ── TUESDAY ───────────────────────────────────────────────────────────────

  // Post 1 — Current week 25+ disposals (strict pool25 only — never pool30)
  {
    const tue1Players = pool25.length >= 3 ? pool25.slice(0, 5)
      : pool25.length >= 1 ? pool25.slice(0, pool25.length)
      : pool20.slice(0, 5);
    const isFallback = pool25.length < 2;
    const tue1ThrNum = pool25.length >= 2 ? 25 : 20;
    const hook = `${rl} — who's been clearing ${tue1ThrNum}+ disposals consistently? Data from the last 5 games.`;
    const tue1Bullets = tue1Players.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, tue1ThrNum))} at ${tue1ThrNum}+, L5 avg ${getL5Avg(p).toFixed(1)}`
    );
    schedule.push(makePost({
      day: "Tue", postNumber: 1,
      type: "Image",
      category: "Disposal Trend", intent: "cross_game_preview",
      statLens: "disposals", confidence: isFallback ? "Medium" : "High",
      title: `${rl} — ${tue1ThrNum}+ disposal form`,
      content: hook,
      statsShown: tue1Bullets,
      onScreenText: `${tue1ThrNum}+ disposal form`,
      caption: buildCaption(hook, tue1Bullets, 3),
      hashtags: HASHTAG_SETS["Disposal Trend"],
      suggestedVisual: `5-player stat grid — name, team, ${tue1ThrNum}+ hit rate, L5 avg`,
      imageDescription: `Static image. 5-player stat grid. Threshold: ${tue1ThrNum}+ disposals. Each row: player name, team abbreviation, ${tue1ThrNum}+ hit rate percentage, L5 average. ${tue1ThrNum}+ tier players only. Dark background, stat values highlighted. No betting language.`,
      dataScope: `${rl} ${tue1ThrNum}+ disposal pool (strict tier — no 30+ players)`,
      targetGame: null,
      targetGameStatus: "any",
      fallbackWarning: isFallback ? `Low 25+ candidate count (${pool25.length}) — using ${tue1ThrNum}+ pool` : null,
      players: tue1Players,
      thresholdLabel: `${tue1ThrNum}+ Disposals`,
    }));
  }

  // Post 2 — Current week 2+ goals
  {
    const tue2Players = (goalPool2.length >= 2 ? goalPool2 : goalPool.filter(p => getHitRate(p, 2) >= 0.45)).slice(0, 5);
    const hook = `${rl} — multi-goal scorers with strong recent form. Hit rates from the last 5 games.`;
    const bullets = tue2Players.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, 2))} at 2+ goals, L5 avg ${getL5Avg(p).toFixed(1)}`
    );
    schedule.push(makePost({
      day: "Tue", postNumber: 2,
      type: "Image",
      category: "Goal Trend", intent: "cross_game_preview",
      statLens: "goals", confidence: tue2Players.length >= 3 ? "High" : "Medium",
      title: `${rl} — 2+ goal scorer form`,
      content: hook,
      statsShown: bullets,
      onScreenText: "2+ goal form",
      caption: buildCaption(hook, bullets, 4),
      hashtags: HASHTAG_SETS["Goal Trend"],
      suggestedVisual: `5-player 2+ goal form grid — name, team, 2+ hit rate, L5 avg`,
      imageDescription: `Static image. 5-player goal form grid. Threshold: 2+ goals. Each row: player name, team, 2+ goal hit rate as percentage, L5 average. Multi-goal tier players. Dark background. No betting language.`,
      dataScope: `${rl} 2+ goal player pool`,
      targetGame: null,
      targetGameStatus: "any",
      fallbackWarning: goalPool2.length < 2 ? "Low 2+ only candidates — using relaxed goal pool" : null,
      players: tue2Players,
      thresholdLabel: "2+ Goals",
    }));
  }

  // Post 3 — Positive form movers
  {
    const movers = formMovers.slice(0, 5);
    const hasMover = movers.length >= 2;
    const pool = hasMover ? movers : dispPool.slice(0, 4);
    const bullets = pool.map(p => {
      const d = formDelta(p);
      return `${p.player_name} (${p.team_name ?? ""}) — L5 avg ${(p.last_5_avg ?? 0).toFixed(1)} (${d >= 0 ? "+" : ""}${d.toFixed(1)} vs season avg ${(p.season_avg ?? 0).toFixed(1)})`;
    });
    const hook = hasMover
      ? `Players trending well above their season average heading into ${rl}. Form is real — the numbers back it up.`
      : `Recent disposal form leaders heading into ${rl}.`;
    schedule.push(makePost({
      day: "Tue", postNumber: 3,
      type: "Carousel",
      category: "Form Mover", intent: "cross_game_preview",
      statLens: "disposals", confidence: hasMover ? "High" : "Medium",
      title: `${rl} — positive form movers`,
      content: hook,
      statsShown: bullets,
      onScreenText: "Form movers",
      caption: buildCaption(hook, bullets, 5),
      hashtags: HASHTAG_SETS["Form Mover"],
      suggestedVisual: `${pool.length}-player up-arrow graphic — name, L5 avg, delta vs season avg`,
      imageDescription: `Carousel. ${pool.length} players, one per slide. Each: player name, team, L5 average, delta vs season average (e.g. +4.2). Up-arrow visual accent for positive deltas. Headline: "${rl} — Form Movers". Dark background, green accents. No betting language.`,
      dataScope: `${rl} disposal player pool — form movers`,
      targetGame: null,
      targetGameStatus: "any",
      fallbackWarning: hasMover ? null : "Fallback: insufficient form mover candidates — using top disposal pool",
      players: pool,
      thresholdLabel: "Form Risers",
    }));
  }

  // ── WEDNESDAY ─────────────────────────────────────────────────────────────

  // Post 1 — Current week 30+ disposals (strict pool30 — marks elite fingerprint)
  {
    const wed1Players = pool30.length >= 3 ? pool30.slice(0, 5)
      : poolElite.length >= 3 ? poolElite.slice(0, 5)
      : pool25.slice(0, 5);
    const wed1ThrNum = pool30.length >= 3 ? 30 : poolElite.length >= 3 ? 25 : 25;
    const isFallback = pool30.length < 2;
    if (pool30.length >= 3) globalElitePostUsed = true;
    const hook = pool30.length >= 3
      ? `Elite disposal volume heading into ${rl}. Who's been clearing 30+ consistently?`
      : `High-volume disposers heading into ${rl}. Numbers that matter.`;
    const bullets = wed1Players.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, wed1ThrNum))} at ${wed1ThrNum}+, L5 avg ${getL5Avg(p).toFixed(1)}`
    );
    schedule.push(makePost({
      day: "Wed", postNumber: 1,
      type: "Image",
      category: "Disposal Trend", intent: "cross_game_preview",
      statLens: "disposals", confidence: isFallback ? "Medium" : "High",
      title: pool30.length >= 3 ? `${rl} — 30+ disposal form` : `${rl} — high-volume disposal form`,
      content: hook,
      statsShown: bullets,
      onScreenText: `${wed1ThrNum}+ disposal form`,
      caption: buildCaption(hook, bullets, 0),
      hashtags: HASHTAG_SETS["Disposal Trend"],
      suggestedVisual: `5-player stat grid — name, team, ${wed1ThrNum}+ hit rate, L5 avg`,
      imageDescription: `Static image. 5-player stat grid. Threshold: ${wed1ThrNum}+ disposals. Elite tier. Each row: player name, team abbreviation, ${wed1ThrNum}+ hit rate percentage, L5 average. Dark background, stat values highlighted. No betting language.`,
      dataScope: `${rl} ${wed1ThrNum}+ disposal pool (elite tier)`,
      targetGame: null,
      targetGameStatus: "any",
      fallbackWarning: isFallback ? `Low 30+ candidate count (${pool30.length}) — using ${wed1ThrNum}+ pool` : null,
      players: wed1Players,
      thresholdLabel: `${wed1ThrNum}+ Disposals`,
    }));
  }

  // Post 2 — Current week 3+ goals (fallback to 2+ if < 3 strong candidates)
  {
    let wed2Players: StatBoardPlayer[];
    let wed2Thr: number;
    let wed2Label: string;

    if (goalPool3.length >= 3) {
      wed2Players = goalPool3.slice(0, 5);
      wed2Thr = 3;
      wed2Label = "3+ Goals";
    } else if (goalPool2.length >= 3) {
      wed2Players = goalPool2.slice(0, 5);
      wed2Thr = 2;
      wed2Label = "2+ Goals";
    } else if (goalPool3.length + goalPool2.length >= 2) {
      wed2Players = [...goalPool3, ...goalPool2].slice(0, 5);
      wed2Thr = 2;
      wed2Label = "2–3+ Goals";
    } else {
      wed2Players = goalPool.slice(0, 5);
      wed2Thr = 1;
      wed2Label = "1+ Goals";
    }

    const hook = `${rl} — ${wed2Label} goal scorer form. Consistent performers at the higher threshold.`;
    const bullets = wed2Players.map(p =>
      `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, wed2Thr))} at ${wed2Thr}+, L5 avg ${getL5Avg(p).toFixed(1)}`
    );
    schedule.push(makePost({
      day: "Wed", postNumber: 2,
      type: "Carousel",
      category: "Goal Trend", intent: "cross_game_preview",
      statLens: "goals", confidence: wed2Players.length >= 3 ? "High" : "Medium",
      title: `${rl} — ${wed2Label} goal form`,
      content: hook,
      statsShown: bullets,
      onScreenText: `${wed2Label} form`,
      caption: buildCaption(hook, bullets, 1),
      hashtags: HASHTAG_SETS["Goal Trend"],
      suggestedVisual: `5-player ${wed2Label} goal form grid — name, team, ${wed2Thr}+ hit rate, L5 avg`,
      imageDescription: `Carousel. ${wed2Players.length} players, one per slide. Each: player name, team, ${wed2Thr}+ goal hit rate as percentage, L5 average. Threshold: ${wed2Label}. Dark background, clean layout. No betting language.`,
      dataScope: `${rl} ${wed2Label} goal player pool`,
      targetGame: null,
      targetGameStatus: "any",
      fallbackWarning: goalPool3.length < 3 ? `Low 3+ goal candidate count (${goalPool3.length}) — using ${wed2Label} pool` : null,
      players: wed2Players,
      thresholdLabel: wed2Label,
    }));
  }

  // Post 3 — Team scoring trends
  {
    const teams = teamScoreRows.slice(0, 5);
    const hasTeams = teams.length >= 2;
    const bullets = hasTeams
      ? teams.map(t => `${t.team_name ?? ""} — L5 avg ${getTeamL5Avg(t).toFixed(1)} pts (season avg ${getTeamSeasonAvg(t).toFixed(1)})`)
      : ["Team scoring data not available for this round."];
    const hook = `${rl} — team scoring trends. Which teams are running the most points?`;
    schedule.push(makePost({
      day: "Wed", postNumber: 3,
      type: "Image",
      category: "Team Total", intent: "cross_game_preview",
      statLens: "team-total", confidence: hasTeams ? "Medium" : "Fallback",
      title: `${rl} — team scoring trends`,
      content: hook,
      statsShown: bullets,
      onScreenText: "Team scoring trends",
      caption: buildCaption(hook, bullets, 2),
      hashtags: HASHTAG_SETS["Team Total"],
      suggestedVisual: "Bar chart of top-scoring teams — L5 vs season average",
      imageDescription: `Static image. ${teams.length} teams. Each row: team name, L5 average score, season average score side by side. Headline: "${rl} — Team Scoring Trends". Clean layout, neutral dark background. No betting language.`,
      dataScope: `${rl} team score rows`,
      targetGame: null,
      targetGameStatus: "any",
      fallbackWarning: hasTeams ? null : "Fallback: insufficient team score data",
      players: [],
      teams: teams.map(t => t.team_name ?? "").filter(Boolean),
      thresholdLabel: "Team Score",
    }));
  }

  // ── THURSDAY / FRIDAY / SATURDAY / SUNDAY ────────────────────────────────
  // These days are driven entirely by per-game post kits (GamePickMarketingPack).
  // No generic day-level posts are pushed to `schedule` for Thu–Sun.
  // The Game Day tab UI renders them directly from gamePickMarketingPacks.
  // (old generic Thu–Sun posts removed — they hardcoded round/day context)
  void 0; // ── placeholder so the block is not empty ──
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
    // Use pool25 (strict tier), ≥70% hit rate — no cross-tier leakage
    let players = pool25.filter(p => satTeamIds.has(p.team_id) && getHitRate(p, 25) >= 0.70).slice(0, 5);
    if (players.length < 2) players = pool25.filter(p => satTeamIds.has(p.team_id)).slice(0, 5);
    if (players.length >= 2) {
      const bullets = players.map(p => `${p.player_name} (${p.team_name ?? ""}) — ${pct(getHitRate(p, 25))} at 25+, L5 avg ${getL5Avg(p).toFixed(1)}`);
      bkPost({ day: "Sat", type: "Image", category: "Disposal Trend", intent: "same_day_preview", statLens: "disposals", confidence: "High", title: "Top 5 for 25+ disposals — Saturday games", content: "Saturday 25+ disposal form. Stats laid out clearly.", statsShown: bullets, onScreenText: "Saturday 25+ form", caption: buildCaption("Saturday 25+ disposal form.", bullets, 1), hashtags: HASHTAG_SETS["Disposal Trend"], suggestedVisual: "Saturday game-specific 5-player grid", imageDescription: `Static image. 5-player stat grid for Saturday games. Threshold: 25+ disposals. Each row: player name, team, 25+ hit rate, L5 average. Headline: "Top 5 for 25+ Disposals — Saturday". Dark background. No betting language.`, dataScope: "Saturday games only", targetGame: null, targetGameStatus: "upcoming", fallbackWarning: null, players, thresholdLabel: "25+ Disposals", postNumber: 1 });
    }
  }

  // 3. 20+ disposals — Sunday games
  {
    const sunMatches = data.matches.filter(m => new Date(m.game_date).getDay() === 0);
    const sunTeamIds = new Set(sunMatches.flatMap(m => [m.home_team_id, m.away_team_id]));
    // Use pool20 (strict tier) — no 25+/30+ players leaking in
    let players = pool20.filter(p => sunTeamIds.has(p.team_id) && getHitRate(p, 20) >= 0.70).slice(0, 5);
    if (players.length < 2) players = pool20.filter(p => sunTeamIds.has(p.team_id)).slice(0, 5);
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
    // Use pool20 to match the 20+ label — no 25+/30+ tier leakage
    const players = pool20.filter(p => teamIds.has(p.team_id)).slice(0, 6);
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
      bkPost({ day: "Sat", type: "Short video", category: "Round Preview", intent: "pre_game", statLens: "disposals", confidence: "High", title: "One stat before bounce", content: "One stat. No fluff. Just the number.", statsShown: [bullet], onScreenText: `${player.player_name} — L5 avg ${getL5Avg(player).toFixed(1)}`, caption: buildCaption("One stat before bounce. See the data, make your own call.", [bullet], 1), hashtags: gamedayHashtags("Sat"), suggestedVisual: "Single-player full-screen graphic — team colours, L5 avg", imageDescription: `Short video / static frame. Single player focus. Full-screen layout: player name large, team name below, L5 average centred in bold. 20+ hit rate shown as percentage bar. Team colours as background accent. No other players. No betting language.`, dataScope: `${rl} top disposal player`, targetGame: null, targetGameStatus: "upcoming", fallbackWarning: null, players: [player], thresholdLabel: "20+ Disposals", postNumber: 1 });
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
      intent: hasCompleted ? "recap" : "cross_game_preview",
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

  // Enrich all posts with compliance, quality, timing, platform captions, etc.
  const enriched = (posts: SocialPost[]) => posts.map(p => enrichPost(p, data.matches));

  const evergreen = buildEvergreenPool({
    currentRound: data.currentRound,
    roundLabel: data.roundLabel,
    matches: data.matches,
    disposalPlayers: data.disposalPlayers,
    goalPlayers: data.goalPlayers,
    teamDisposals: data.teamDisposals,
    teamGoals: data.teamGoals,
    teamScore: data.teamScore,
    loadedAt: data.loadedAt,
  });

  return {
    schedule: enriched(schedule),
    backup: enriched(backup),
    evergreen,
    excludedCount,
  };
}

// ─── Carousel slide helpers ───────────────────────────────────────────────────

/**
 * Safely converts any carousel slide value into a well-typed CarouselSlide.
 * Guards against object-as-JSX-child crashes (React error #31).
 */
function normaliseCarouselSlide(slide: unknown, index: number): CarouselSlide {
  if (slide && typeof slide === "object") {
    const s = slide as Partial<CarouselSlide>;
    return {
      slideNumber: Number(s.slideNumber ?? index + 1),
      headline: String(s.headline ?? `Slide ${index + 1}`),
      body: String(s.body ?? ""),
      visualNote: s.visualNote ? String(s.visualNote) : "",
    };
  }
  if (typeof slide === "string") {
    return {
      slideNumber: index + 1,
      headline: `Slide ${index + 1}`,
      body: slide,
      visualNote: "",
    };
  }
  return {
    slideNumber: index + 1,
    headline: `Slide ${index + 1}`,
    body: "",
    visualNote: "",
  };
}

function formatCarouselSlideForCopy(slide: unknown, index = 0): string {
  const s = normaliseCarouselSlide(slide, index);
  return [
    `Slide ${s.slideNumber}: ${s.headline}`,
    s.body,
    s.visualNote ? `Visual: ${s.visualNote}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Warns in console if a marketing pack has unexpected field shapes.
 * Never throws — falls back silently.
 */
function validateMarketingPackShape(pack: unknown, label = "pack"): void {
  if (!pack || typeof pack !== "object") {
    console.warn(`[Admin] validateMarketingPackShape: ${label} is not an object`, pack);
    return;
  }
  const p = pack as Record<string, unknown>;

  if (p.post && typeof p.post === "object") {
    const post = p.post as Record<string, unknown>;
    if (post.carouselSlides !== undefined && !Array.isArray(post.carouselSlides)) {
      console.warn(`[Admin] ${label}.post.carouselSlides is not an array`, post.carouselSlides);
    }
    if (post.hookOptions !== undefined && !Array.isArray(post.hookOptions)) {
      console.warn(`[Admin] ${label}.post.hookOptions is not an array`, post.hookOptions);
    }
    if (post.hashtags !== undefined && !Array.isArray(post.hashtags)) {
      console.warn(`[Admin] ${label}.post.hashtags is not an array`, post.hashtags);
    }
    if (post.aiImagePrompt !== undefined && typeof post.aiImagePrompt !== "string") {
      console.warn(`[Admin] ${label}.post.aiImagePrompt is not a string`, post.aiImagePrompt);
    }
    if (post.voiceoverScript !== undefined && typeof post.voiceoverScript !== "string") {
      console.warn(`[Admin] ${label}.post.voiceoverScript is not a string`, post.voiceoverScript);
    }
  }
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

function QualityBadge({ quality }: { quality: SocialPost["quality"] }) {
  if (!quality) return null;
  const cls =
    quality.label === "Premium" ? "bg-amber-950/60 text-amber-300 border-amber-600/30" :
    quality.label === "Strong"  ? "bg-emerald-950/60 text-emerald-300 border-emerald-600/30" :
    quality.label === "Good"    ? "bg-sky-950/60 text-sky-300 border-sky-600/30" :
    "bg-zinc-800 text-zinc-500 border-zinc-700";
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium flex items-center gap-0.5 ${cls}`}>
      <Star className="h-2 w-2" />
      {quality.score} · {quality.label}
    </span>
  );
}

function ComplianceBadge({ compliance }: { compliance: SocialPost["compliance"] }) {
  if (!compliance || compliance.status === "Clean") return null;
  const cls = compliance.status === "Do not use"
    ? "bg-red-950/60 text-red-400 border-red-700/40"
    : "bg-amber-950/60 text-amber-400 border-amber-700/40";
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium flex items-center gap-0.5 ${cls}`}>
      <Shield className="h-2 w-2" />
      {compliance.status}
    </span>
  );
}

function SocialPostCard({
  post, copiedId, onCopyField, roundLabel,
}: {
  post: SocialPost;
  copiedId: string | null;
  onCopyField: (id: string, text: string) => void;
  roundLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [platformTab, setPlatformTab] = useState<"tiktok" | "instagram" | "facebook">("tiktok");
  const { getEntry, setStatus, setNote } = usePostStatus(roundLabel);
  const entry = getEntry(post.id);

  const copyKey = (suffix: string) => `${post.id}-${suffix}`;

  const statusCls = (s: PostStatus) => {
    if (s === "posted_tiktok" || s === "posted_instagram" || s === "posted_facebook") return "text-emerald-400";
    if (s === "scheduled") return "text-sky-400";
    if (s === "do_not_use") return "text-red-400";
    if (s === "skipped") return "text-zinc-600";
    if (s === "drafted" || s === "image_created") return "text-amber-400";
    return "text-zinc-400";
  };

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
            {post.quality && <QualityBadge quality={post.quality} />}
            {post.compliance && post.compliance.status !== "Clean" && <ComplianceBadge compliance={post.compliance} />}
            {post.isBackup && (
              <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-zinc-900 text-zinc-600 border-zinc-800">Backup</span>
            )}
          </div>
          <p className="text-[12.5px] font-semibold text-zinc-200 leading-snug">{post.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <Clock className="h-2.5 w-2.5 text-zinc-600 shrink-0" />
            <span className="text-[10px] text-zinc-500">{post.postTime}</span>
            {post.timing?.countdownText && (
              <>
                <span className="text-zinc-700">·</span>
                <span className={`text-[10px] ${post.timing.urgency === "High" ? "text-amber-400" : post.timing.urgency === "Stale" ? "text-red-400" : "text-zinc-500"}`}>
                  {post.timing.countdownText}
                </span>
              </>
            )}
            <span className="text-zinc-700">·</span>
            <span className="text-[10px] text-zinc-500">{post.thresholdLabel}</span>
            {entry.status !== "todo" && (
              <span className={`text-[9px] font-medium ${statusCls(entry.status)}`}>
                {STATUS_LABELS[entry.status]}
              </span>
            )}
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

          {/* Workflow status + notes */}
          <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-2.5 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-zinc-500 font-medium shrink-0">Status</span>
              <select
                value={entry.status}
                onChange={e => { e.stopPropagation(); setStatus(post.id, e.target.value as PostStatus); }}
                onClick={e => e.stopPropagation()}
                className={`bg-zinc-900 border border-zinc-700 text-[10px] rounded-md px-2 py-1 h-[26px] ${statusCls(entry.status)}`}
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <textarea
              value={entry.note}
              onChange={e => { e.stopPropagation(); setNote(post.id, e.target.value); }}
              onClick={e => e.stopPropagation()}
              placeholder="Admin notes (saved locally)…"
              rows={2}
              className="w-full bg-zinc-900/60 border border-zinc-700/50 rounded-md px-2 py-1.5 text-[10px] text-zinc-300 placeholder-zinc-600 resize-none"
            />
          </div>

          {/* Quality + timing block */}
          {(post.quality || post.timing) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {post.quality && (
                <div className="bg-zinc-800/30 border border-zinc-700/40 rounded-lg p-2 space-y-1">
                  <div className="text-[10px] text-zinc-500 font-medium">Quality</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-bold text-zinc-200">{post.quality.score}/100</span>
                    <QualityBadge quality={post.quality} />
                  </div>
                  <div className="text-[10px] text-zinc-400">{post.quality.useReason}</div>
                  {post.quality.useRecommendation !== "Use" && (
                    <div className={`text-[10px] font-medium ${post.quality.useRecommendation === "Do not use" ? "text-red-400" : "text-amber-400"}`}>
                      {post.quality.useRecommendation}
                    </div>
                  )}
                </div>
              )}
              {post.timing && (
                <div className="bg-zinc-800/30 border border-zinc-700/40 rounded-lg p-2 space-y-1">
                  <div className="text-[10px] text-zinc-500 font-medium">Timing</div>
                  {post.timing.countdownText && (
                    <div className={`text-[12px] font-semibold ${post.timing.urgency === "High" ? "text-amber-400" : post.timing.urgency === "Stale" ? "text-red-400" : "text-zinc-300"}`}>
                      {post.timing.countdownText}
                    </div>
                  )}
                  <div className="text-[10px] text-zinc-300">{post.timing.recommendedWindowText}</div>
                  <div className="text-[10px] text-zinc-500">{post.timing.recommendedTimingReason}</div>
                </div>
              )}
            </div>
          )}

          {/* Compliance block */}
          {post.compliance && (
            <div className={`flex items-start gap-1.5 text-[10px] rounded-lg px-2.5 py-2 ${
              post.compliance.status === "Clean"
                ? "bg-emerald-950/20 border border-emerald-800/30 text-emerald-400"
                : post.compliance.status === "Do not use"
                ? "bg-red-950/20 border border-red-800/30 text-red-400"
                : "bg-amber-950/20 border border-amber-800/30 text-amber-400"
            }`}>
              <Shield className="h-3 w-3 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium">{post.compliance.status}</span>
                {post.compliance.flags.length > 0 && (
                  <span className="ml-1 opacity-75">— {post.compliance.flags.join(", ")}</span>
                )}
              </div>
            </div>
          )}

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

          {/* Hook options */}
          {post.hookOptions && post.hookOptions.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-500 font-medium">Hook options</span>
              <div className="space-y-1">
                {post.hookOptions.map((h, i) => (
                  <div key={i} className="flex items-start gap-1.5 group">
                    <span className="text-[10px] text-zinc-600 shrink-0 mt-0.5 w-3">{i + 1}.</span>
                    <span className="text-[10px] text-zinc-400 flex-1">{h}</span>
                    <button
                      onClick={e => { e.stopPropagation(); onCopyField(copyKey(`hook-${i}`), h); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-600 hover:text-zinc-300 transition-all"
                    >
                      {copiedId === copyKey(`hook-${i}`) ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {/* Platform captions tabs */}
          {post.platformCaptions && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 font-medium">Platform captions</span>
                <div className="flex gap-0.5">
                  {(["tiktok", "instagram", "facebook"] as const).map(p => (
                    <button
                      key={p}
                      onClick={e => { e.stopPropagation(); setPlatformTab(p); }}
                      className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                        platformTab === p ? "bg-zinc-700 text-zinc-200" : "text-zinc-600 hover:text-zinc-400"
                      }`}
                    >
                      {p === "tiktok" ? "TikTok" : p === "instagram" ? "Instagram" : "Facebook"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative">
                <pre className="text-[11px] text-zinc-300 bg-zinc-800/40 rounded-lg p-2.5 whitespace-pre-wrap break-words font-sans leading-relaxed">
                  {post.platformCaptions[platformTab]}
                </pre>
                <button
                  onClick={e => { e.stopPropagation(); onCopyField(copyKey(`cap-${platformTab}`), post.platformCaptions![platformTab]); }}
                  className="absolute top-2 right-2 p-1 rounded bg-zinc-700/60 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {copiedId === copyKey(`cap-${platformTab}`) ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
                </button>
              </div>
            </div>
          )}

          {/* Full caption fallback */}
          {!post.platformCaptions && (
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-500 font-medium">Caption</span>
              <pre className="text-[11px] text-zinc-300 bg-zinc-800/40 rounded-lg p-2.5 whitespace-pre-wrap break-words font-sans leading-relaxed">{post.caption}</pre>
            </div>
          )}

          <div className="space-y-1">
            <span className="text-[10px] text-zinc-500 font-medium">Hashtags</span>
            <div className="flex flex-wrap gap-1">
              {post.hashtags.map(h => (
                <span key={h} className="text-[10px] text-zinc-500 bg-zinc-800/60 px-1.5 py-0.5 rounded">{h}</span>
              ))}
            </div>
          </div>

          {/* Voiceover script */}
          {post.voiceoverScript && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 font-medium">Voiceover script</span>
                <button
                  onClick={e => { e.stopPropagation(); onCopyField(copyKey("vo"), post.voiceoverScript!); }}
                  className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
                >
                  {copiedId === copyKey("vo") ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 bg-zinc-800/30 rounded-lg px-2.5 py-2 leading-relaxed">{post.voiceoverScript}</p>
            </div>
          )}

          {/* Carousel slides */}
          {post.carouselSlides && post.carouselSlides.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-500 font-medium">Carousel slides ({post.carouselSlides.length})</span>
              <div className="space-y-1.5">
                {post.carouselSlides.map((slide, i) => (
                  <div key={i} className="bg-zinc-800/30 rounded-lg p-2 border border-zinc-700/40">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[9px] text-zinc-600 font-bold">Slide {slide.slideNumber}</span>
                      <span className="text-[10px] text-zinc-300 font-medium">{slide.headline}</span>
                    </div>
                    <p className="text-[10px] text-zinc-400">{slide.body}</p>
                    {slide.visualNote && <p className="text-[9px] text-zinc-600 mt-0.5 italic">{slide.visualNote}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Thumbnail options */}
          {post.thumbnailOptions && post.thumbnailOptions.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-500 font-medium">Thumbnail text options</span>
              <div className="flex flex-wrap gap-1.5">
                {post.thumbnailOptions.map((t, i) => (
                  <button
                    key={i}
                    onClick={e => { e.stopPropagation(); onCopyField(copyKey(`thumb-${i}`), t); }}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                      copiedId === copyKey(`thumb-${i}`)
                        ? "bg-emerald-900/40 text-emerald-300 border-emerald-700/40"
                        : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Field label="Suggested visual" value={post.suggestedVisual} />
            {post.imageDescription && <Field label="Image description" value={post.imageDescription} />}
          </div>

          {/* AI image prompt */}
          {post.aiImagePrompt && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 font-medium">AI image prompt</span>
                <button
                  onClick={e => { e.stopPropagation(); onCopyField(copyKey("aiprompt"), post.aiImagePrompt!); }}
                  className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
                >
                  {copiedId === copyKey("aiprompt") ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 bg-zinc-800/30 rounded-lg px-2.5 py-2 leading-relaxed">{post.aiImagePrompt}</p>
            </div>
          )}

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
            {post.aiImagePrompt && (
              <CopyBtn
                label="Copy AI prompt"
                onClick={() => onCopyField(copyKey("aiprompt"), post.aiImagePrompt!)}
                copied={copiedId === copyKey("aiprompt")}
                small
              />
            )}
            {post.voiceoverScript && (
              <CopyBtn
                label="Copy voiceover"
                onClick={() => onCopyField(copyKey("vo"), post.voiceoverScript!)}
                copied={copiedId === copyKey("vo")}
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

// ─── Game Picks Tab ───────────────────────────────────────────────────────────

function GamePickRow({
  pick,
  copiedId,
  onCopy,
}: {
  pick: GamePickPlayer;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
}) {
  const copyId = `gp-${pick.player_id}`;
  const copied = copiedId === copyId;

  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-zinc-800/60 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11.5px] text-zinc-200 font-medium">{pick.player_name}</span>
          <span className="text-[10px] text-zinc-500">{pick.team_name}</span>
          {pick.position_group && (
            <span className="text-[9px] text-zinc-600 bg-zinc-800 px-1 rounded">{pick.position_group}</span>
          )}
          <span className={`text-[9px] font-semibold ${tierColor(pick.tier)}`}>
            {tierLabel(pick.tier)} ({pick.consistency_score})
          </span>
        </div>
        <div className="text-[10px] text-zinc-400 mt-0.5 flex flex-wrap gap-2">
          <span>
            <span className="text-zinc-300">{pick.threshold}+</span>
            {" "}<span className="text-zinc-300">{pick.hitRecord}</span>
            <span className="text-zinc-500"> ({pick.hitPct})</span>
            {pick.publicContentTier !== null && pick.publicContentTier !== pick.threshold && (
              <span className={`ml-1 px-1 rounded text-[9px] font-semibold ${
                pick.publicContentTier === 30 ? "bg-orange-900/60 text-orange-300" :
                pick.publicContentTier === 25 ? "bg-sky-900/60 text-sky-300" :
                pick.publicContentTier === 20 ? "bg-zinc-700 text-zinc-300" :
                "bg-zinc-800 text-zinc-400"
              }`}>
                post tier: {pick.publicContentTier}+
              </span>
            )}
            {pick.publicContentTier === 30 && pick.threshold === 30 && (
              <span className="ml-1 px-1 rounded text-[9px] font-semibold bg-orange-900/60 text-orange-300">30+ tier</span>
            )}
            {pick.publicContentTier === 25 && pick.threshold === 25 && (
              <span className="ml-1 px-1 rounded text-[9px] font-semibold bg-sky-900/60 text-sky-300">25+ tier</span>
            )}
          </span>
          {pick.l5_avg !== null && (
            <span>L5: <span className="text-zinc-300">{pick.l5_avg.toFixed(1)}</span></span>
          )}
          {pick.season_avg !== null && (
            <span>Avg: <span className="text-zinc-300">{pick.season_avg.toFixed(1)}</span></span>
          )}
          {pick.projection !== null && (
            <span>Proj: <span className="text-zinc-300">{pick.projection.toFixed(0)}</span></span>
          )}
          <span className="text-zinc-600">{pick.games_played}g</span>
        </div>
      </div>
      <button
        onClick={() => onCopy(copyId, pick.copy_line)}
        className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors ${
          copied
            ? "bg-emerald-900/50 text-emerald-300 border-emerald-700/40"
            : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-200"
        }`}
        title="Copy line"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

// ─── Post Kit Panel ───────────────────────────────────────────────────────────

function PostKitTab({
  kit,
  copiedId,
  onCopy,
}: {
  kit: GamePickPostKit;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
}) {
  const { post } = kit;
  const cid = (suffix: string) => `${post.id}-${suffix}`;

  return (
    <div className="space-y-3 pt-2">
      {/* Title + quality */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-zinc-200 font-semibold">{post.title}</span>
        {post.quality && <QualityBadge quality={post.quality} />}
        {post.compliance && post.compliance.status !== "Clean" && <ComplianceBadge compliance={post.compliance} />}
        <ConfidenceBadge confidence={post.confidence} />
      </div>

      {/* Quality detail */}
      {post.quality && (
        <div className="text-[10px] text-zinc-400 bg-zinc-800/30 rounded px-2.5 py-1.5">
          <span className="font-medium text-zinc-300">{post.quality.score}/100 · {post.quality.label}</span>
          {" — "}{post.quality.useReason}
          {post.quality.useRecommendation !== "Use" && (
            <span className={`ml-1 font-medium ${post.quality.useRecommendation === "Do not use" ? "text-red-400" : "text-amber-400"}`}>
              · {post.quality.useRecommendation}
            </span>
          )}
        </div>
      )}

      {/* Fallback warning */}
      {post.fallbackWarning && (
        <div className="flex items-start gap-1.5 text-[10px] text-amber-400 bg-amber-950/20 border border-amber-800/30 rounded px-2 py-1.5">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
          <span>{post.fallbackWarning}</span>
        </div>
      )}

      {/* Hook options */}
      {post.hookOptions && post.hookOptions.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] text-zinc-500 font-medium">Hook options</span>
          <div className="space-y-1">
            {post.hookOptions.map((h, i) => (
              <div key={i} className="flex items-start gap-1.5 group">
                <span className="text-[10px] text-zinc-600 shrink-0 mt-0.5 w-3">{i + 1}.</span>
                <span className="text-[10px] text-zinc-400 flex-1">{h}</span>
                <button
                  onClick={() => onCopy(cid(`hook-${i}`), h)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-600 hover:text-zinc-300 transition-all"
                >
                  {copiedId === cid(`hook-${i}`) ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats shown */}
      {post.statsShown.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] text-zinc-500 font-medium">Stats shown</span>
          <ul className="space-y-0.5">
            {post.statsShown.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[10px] text-zinc-300">
                <span className="text-zinc-600 shrink-0 mt-0.5">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Platform captions */}
      {post.platformCaptions && (
        <div className="space-y-2">
          <span className="text-[10px] text-zinc-500 font-medium">Platform captions</span>
          {(["tiktok", "instagram", "facebook"] as const).map(platform => {
            const caption = post.platformCaptions?.[platform];
            if (!caption) return null;
            return (
              <div key={platform} className="bg-zinc-800/30 rounded p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">{platform}</span>
                  <button
                    onClick={() => onCopy(cid(`cap-${platform}`), caption)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
                  >
                    {copiedId === cid(`cap-${platform}`) ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
                    Copy
                  </button>
                </div>
                <p className="text-[10px] text-zinc-400 whitespace-pre-wrap">{caption}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Voiceover */}
      {post.voiceoverScript && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500 font-medium">Voiceover script</span>
            <button
              onClick={() => onCopy(cid("vo"), post.voiceoverScript!)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
            >
              {copiedId === cid("vo") ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
              Copy
            </button>
          </div>
          <p className="text-[10px] text-zinc-400 bg-zinc-800/30 rounded px-2 py-1.5 whitespace-pre-wrap">{post.voiceoverScript}</p>
        </div>
      )}

      {/* Carousel slides */}
      {post.carouselSlides && post.carouselSlides.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500 font-medium">Carousel slides</span>
            <button
              type="button"
              onClick={() => onCopy(cid("slides"), post.carouselSlides!.map(formatCarouselSlideForCopy).join("\n\n"))}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
            >
              {copiedId === cid("slides") ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
              Copy all
            </button>
          </div>
          <div className="space-y-1.5">
            {post.carouselSlides.map((rawSlide, i) => {
              const slide = normaliseCarouselSlide(rawSlide, i);
              return (
                <div key={i} className="text-[10px] text-zinc-400 bg-zinc-800/30 rounded px-2 py-1.5 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-zinc-600 font-bold">Slide {slide.slideNumber}</span>
                    <span className="text-zinc-300 font-medium">{slide.headline}</span>
                  </div>
                  {slide.body && <p className="text-zinc-400">{slide.body}</p>}
                  {slide.visualNote && <p className="text-[9px] text-zinc-600 italic">{slide.visualNote}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* On-screen text */}
      {post.onScreenText && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500 font-medium">On-screen text</span>
            <button
              onClick={() => onCopy(cid("onscreen"), post.onScreenText)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
            >
              {copiedId === cid("onscreen") ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
              Copy
            </button>
          </div>
          <p className="text-[10px] text-zinc-400 bg-zinc-800/30 rounded px-2 py-1.5 whitespace-pre-wrap font-mono">{post.onScreenText}</p>
        </div>
      )}

      {/* AI image prompt */}
      {post.aiImagePrompt && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500 font-medium">AI image prompt</span>
            <button
              onClick={() => onCopy(cid("img"), post.aiImagePrompt!)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
            >
              {copiedId === cid("img") ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
              Copy
            </button>
          </div>
          <p className="text-[10px] text-zinc-400 bg-zinc-800/30 rounded px-2 py-1.5 whitespace-pre-wrap">{post.aiImagePrompt}</p>
        </div>
      )}

      {/* Suggested visual */}
      {post.suggestedVisual && (
        <div className="text-[10px] text-zinc-500">
          <span className="font-medium text-zinc-400">Visual: </span>{post.suggestedVisual}
        </div>
      )}

      {/* Hashtags */}
      {post.hashtags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => onCopy(cid("tags"), post.hashtags.join(" "))}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors shrink-0"
          >
            {copiedId === cid("tags") ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
            Copy tags
          </button>
          <span className="text-[10px] text-zinc-600">{post.hashtags.join(" ")}</span>
        </div>
      )}

      {/* Copy full post */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => onCopy(cid("full"), buildFullPostText(post))}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
            copiedId === cid("full")
              ? "bg-emerald-900/50 text-emerald-300 border-emerald-700/40"
              : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500 hover:text-zinc-100"
          }`}
        >
          {copiedId === cid("full") ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          Copy full post
        </button>
      </div>
    </div>
  );
}

function PostKitSection({
  pack,
  copiedId,
  onCopy,
}: {
  pack: GamePickMarketingPack;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeKit, setActiveKit] = useState(0);

  const kitLabels: Record<string, string> = {
    disposals: "Disposals",
    goals: "Goals",
    combined: "Combined",
  };

  return (
    <div className="mt-2 border-t border-zinc-800/60 pt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 py-1 hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-2">
          <Zap className="h-3 w-3 text-amber-400 shrink-0" />
          <span className="text-[11px] font-semibold text-zinc-300">Post Kit</span>
          {pack.kits.length > 0 ? (
            <span className="text-[9px] bg-amber-900/40 text-amber-400 border border-amber-700/30 px-1.5 rounded">
              {pack.kits.length} kit{pack.kits.length !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-[9px] text-zinc-600">No kits</span>
          )}
          <span className="text-[10px] text-zinc-500 hidden sm:inline truncate">{pack.bestAngle}</span>
        </div>
        {open ? <ChevronUp className="h-3 w-3 text-zinc-600 shrink-0" /> : <ChevronDown className="h-3 w-3 text-zinc-600 shrink-0" />}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {/* Best angle info */}
          <div className="bg-zinc-800/20 rounded px-2.5 py-2 space-y-1">
            <div className="text-[10px] text-zinc-300 font-medium">{pack.bestAngle}</div>
            <div className="text-[10px] text-zinc-500">{pack.bestAngleReason}</div>
          </div>

          {pack.kits.length === 0 ? (
            <div className="text-[10px] text-zinc-600 px-1">{pack.skipReason}</div>
          ) : (
            <>
              {/* Kit tabs */}
              {pack.kits.length > 1 && (
                <div className="flex gap-1">
                  {pack.kits.map((kit, i) => (
                    <button
                      key={kit.kitType}
                      onClick={() => setActiveKit(i)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                        activeKit === i
                          ? "bg-zinc-200 text-zinc-900 border-zinc-300"
                          : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {kitLabels[kit.kitType] ?? kit.kitType}
                      <span className="ml-1 text-[9px] opacity-60">{kit.pickCount}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Active kit */}
              {pack.kits[activeKit] && (
                <PostKitTab
                  kit={pack.kits[activeKit]}
                  copiedId={copiedId}
                  onCopy={onCopy}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function GamePickCard({
  game,
  pack,
  lens,
  tier,
  show25TierOnly,
  search,
  copiedId,
  onCopy,
}: {
  game: GamePick;
  pack: GamePickMarketingPack | null;
  lens: GamePickLens;
  tier: ConsistencyTier;
  show25TierOnly: boolean;
  search: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const rawPicks = lens === "disposals" ? game.disposal_picks : game.goal_picks;
  let tieredPicks = filterPicksByConsistency(rawPicks, tier);
  if (lens === "disposals" && show25TierOnly) {
    tieredPicks = tieredPicks.filter(p => p.publicContentTier === 25);
  }
  const filteredPicks = search.trim().length < 2
    ? tieredPicks
    : tieredPicks.filter(p =>
        p.player_name.toLowerCase().includes(search.toLowerCase()) ||
        p.team_name.toLowerCase().includes(search.toLowerCase()),
      );

  const copyAllId = `gp-all-${game.match_id}-${lens}`;
  const copiedAll = copiedId === copyAllId;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-zinc-800/40 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] text-zinc-200 font-semibold truncate">{game.match_label}</span>
          <span className="text-[10px] text-zinc-500 shrink-0">{game.venue}</span>
          {game.is_free_match && (
            <span className="text-[9px] bg-amber-900/40 text-amber-400 border border-amber-700/30 px-1 rounded shrink-0">Free</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-zinc-500">{filteredPicks.length} picks</span>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />}
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-zinc-800">
          {filteredPicks.length === 0 ? (
            <p className="text-[10px] text-zinc-600 py-2">No qualifying picks for this game with current filters.</p>
          ) : (
            <>
              <div className="mt-2 space-y-0">
                {filteredPicks.map(p => (
                  <GamePickRow
                    key={p.player_id}
                    pick={p}
                    copiedId={copiedId}
                    onCopy={onCopy}
                  />
                ))}
              </div>
              <button
                onClick={() => onCopy(copyAllId, formatGamePicksForCopy(game, lens))}
                className={`mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] border transition-colors ${
                  copiedAll
                    ? "bg-emerald-900/50 text-emerald-300 border-emerald-700/40"
                    : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-200"
                }`}
              >
                {copiedAll ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                Copy all {lens} picks for this game
              </button>
            </>
          )}
          {pack && (
            <PostKitSection
              pack={pack}
              copiedId={copiedId}
              onCopy={onCopy}
            />
          )}
        </div>
      )}
    </div>
  );
}

function GamePicksTabContent({
  gamePicks,
  marketingPacks,
  lens,
  onLensChange,
  tier,
  onTierChange,
  search,
  onSearchChange,
  copiedId,
  onCopy,
  roundLabel,
}: {
  gamePicks: GamePick[];
  marketingPacks: GamePickMarketingPack[];
  lens: GamePickLens;
  onLensChange: (l: GamePickLens) => void;
  tier: ConsistencyTier;
  onTierChange: (t: ConsistencyTier) => void;
  search: string;
  onSearchChange: (s: string) => void;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  roundLabel: string;
}) {
  // When true, disposal view shows only players whose publicContentTier === 25
  // (strict 25+ tier — excludes any 30+ tier players from disposal picks)
  const [show25TierOnly, setShow25TierOnly] = useState(false);

  function applyTierFilter(picks: GamePickPlayer[]): GamePickPlayer[] {
    let result = filterPicksByConsistency(picks, tier);
    if (lens === "disposals" && show25TierOnly) {
      result = result.filter(p => p.publicContentTier === 25);
    }
    return result;
  }

  const totalPicks = gamePicks.reduce((acc, g) => {
    const picks = lens === "disposals" ? g.disposal_picks : g.goal_picks;
    return acc + applyTierFilter(picks).length;
  }, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <Crosshair className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-zinc-300 font-medium">Game Picks</span>
          <span>— {roundLabel} · {gamePicks.length} games · {totalPicks} picks</span>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 space-y-2.5">
        {/* Lens toggle */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 w-16 shrink-0">Stat lens</span>
          <div className="flex gap-1">
            {(["disposals", "goals"] as GamePickLens[]).map(l => (
              <button
                key={l}
                onClick={() => onLensChange(l)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  lens === l
                    ? "bg-zinc-200 text-zinc-900 border-zinc-300"
                    : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
                }`}
              >
                {l.charAt(0).toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Tier filter */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 w-16 shrink-0">Confidence</span>
          <div className="flex gap-1 flex-wrap">
            {(["all", "high", "medium", "low"] as ConsistencyTier[]).map(t => (
              <button
                key={t}
                onClick={() => onTierChange(t)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  tier === t
                    ? "bg-zinc-200 text-zinc-900 border-zinc-300"
                    : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 w-16 shrink-0">Search</span>
          <input
            type="text"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Player or team name…"
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1"
            >
              Clear
            </button>
          )}
        </div>

        {/* 25+ tier filter — disposals only */}
        {lens === "disposals" && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-16 shrink-0">Content tier</span>
            <button
              onClick={() => setShow25TierOnly(v => !v)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                show25TierOnly
                  ? "bg-sky-900/70 text-sky-300 border-sky-700/60"
                  : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
              }`}
            >
              25+ tier only
            </button>
            {show25TierOnly && (
              <span className="text-[10px] text-zinc-500">Hides 30+ tier players from disposal view</span>
            )}
          </div>
        )}
      </div>

      {/* Game cards */}
      {gamePicks.length === 0 ? (
        <div className="py-8 text-center text-zinc-600 text-[12px]">
          No match data loaded. Refresh on the Freshness tab first.
        </div>
      ) : (
        <div className="space-y-2.5">
          {gamePicks.map(game => (
            <GamePickCard
              key={game.match_id}
              game={game}
              pack={marketingPacks.find(p => p.game.match_id === game.match_id) ?? null}
              lens={lens}
              tier={tier}
              show25TierOnly={show25TierOnly}
              search={search}
              copiedId={copiedId}
              onCopy={onCopy}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Error boundary ───────────────────────────────────────────────────────────

interface EBState { error: Error | null }

class SocialPostPlannerErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Admin] SocialPostPlanner crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-red-800/60 bg-red-950/30 p-6 text-center space-y-3">
          <p className="text-red-400 font-medium text-sm">Admin content panel failed to render.</p>
          <p className="text-red-600 text-xs font-mono">{String(this.state.error.message)}</p>
          <p className="text-zinc-500 text-xs">Check console for details.</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="px-3 py-1.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-300 text-xs hover:border-zinc-500 transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Game Day tab (Thu / Fri / Sat / Sun) ────────────────────────────────────

const DAY_HASHTAG: Record<string, string> = {
  Thu: "#ThursdayFooty",
  Fri: "#FridayFooty",
  Sat: "#SaturdayFooty",
  Sun: "#SundayFooty",
};

function GameDayTabContent({
  day,
  packs,
  copiedId,
  onCopy,
  roundLabel,
}: {
  day: "Thu" | "Fri" | "Sat" | "Sun";
  packs: GamePickMarketingPack[];
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  roundLabel: string;
}) {
  const dayFull = DAY_FULL[day];
  const dayHashtag = DAY_HASHTAG[day];

  if (packs.length === 0) {
    return (
      <div className="py-10 text-center space-y-2">
        <p className="text-zinc-500 text-[12px]">No games scheduled for {dayFull}.</p>
        <p className="text-zinc-700 text-[11px]">Post kits are generated automatically when fixture data is loaded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-[11px] text-zinc-500 flex items-center gap-2">
        <span className="text-zinc-300 font-medium">{dayFull} — {roundLabel}</span>
        <span className="text-zinc-600">{packs.length} game{packs.length !== 1 ? "s" : ""}</span>
        <span className="text-amber-500/70">{dayHashtag}</span>
      </div>
      <div className="space-y-3">
        {packs.map(pack => (
          <div
            key={pack.game.match_id}
            className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-zinc-200">{pack.game.match_label}</span>
                {pack.game.is_free_match && (
                  <span className="text-[8.5px] bg-emerald-900/40 text-emerald-400 border border-emerald-700/30 px-1.5 rounded">Free</span>
                )}
                {pack.kits.length > 0 ? (
                  <span className="text-[8.5px] bg-amber-900/30 text-amber-400 border border-amber-700/30 px-1.5 rounded">
                    {pack.kits.length} kit{pack.kits.length !== 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="text-[8.5px] text-zinc-600">No kits</span>
                )}
              </div>
              <span className="text-[10px] text-zinc-600">{pack.game.venue}</span>
            </div>
            {pack.skipReason ? (
              <p className="text-[10px] text-zinc-600 italic">{pack.skipReason}</p>
            ) : (
              <PostKitSection pack={pack} copiedId={copiedId} onCopy={onCopy} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Game Bank tab ────────────────────────────────────────────────────────────

function GameBankTabContent({
  packs,
  copiedId,
  onCopy,
  roundLabel,
}: {
  packs: GamePickMarketingPack[];
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  roundLabel: string;
}) {
  if (packs.length === 0) {
    return (
      <div className="py-8 text-center text-zinc-600 text-[12px]">
        No game marketing packs available. Check that matches are loaded.
      </div>
    );
  }

  // Group packs by game_date for day-labelled sections
  const grouped = new Map<string, GamePickMarketingPack[]>();
  for (const pack of packs) {
    const date = pack.game.game_date ?? "TBC";
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(pack);
  }

  const dayLabel = (dateStr: string): string => {
    if (dateStr === "TBC") return "TBC";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-[11px] text-zinc-500">
        <span className="text-zinc-300 font-medium">Game Post Bank ({packs.length} games)</span>
        {" "} — per-game marketing kits for {roundLabel}
      </div>
      {Array.from(grouped.entries()).map(([date, dayPacks]) => (
        <div key={date} className="space-y-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-3 w-3 text-zinc-500" />
            <span className="text-[11px] font-semibold text-zinc-400">{dayLabel(date)}</span>
            <span className="text-[9px] text-zinc-600">{dayPacks.length} game{dayPacks.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="space-y-2 pl-1">
            {dayPacks.map(pack => (
              <div
                key={pack.game.match_id}
                className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-zinc-200">{pack.game.match_label}</span>
                    {pack.game.is_free_match && (
                      <span className="text-[8.5px] bg-emerald-900/40 text-emerald-400 border border-emerald-700/30 px-1.5 rounded">Free</span>
                    )}
                    {pack.kits.length > 0 ? (
                      <span className="text-[8.5px] bg-amber-900/30 text-amber-400 border border-amber-700/30 px-1.5 rounded">
                        {pack.kits.length} kit{pack.kits.length !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-[8.5px] text-zinc-600">No kits</span>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-600">{pack.game.venue}</span>
                </div>
                <PostKitSection pack={pack} copiedId={copiedId} onCopy={onCopy} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type ActiveTab = DayOfWeek | "backup" | "evergreen" | "game_picks" | "game_bank";

function SocialPostPlannerInner({ data }: { data: CIDataSubset }) {
  const [activeDay, setActiveDay] = useState<ActiveTab>("Mon");
  const [typeFilter, setTypeFilter] = useState<PostType | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [toneFilter, setToneFilter] = useState<CopyTone | "all">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [gpLens, setGpLens] = useState<GamePickLens>("disposals");
  const [gpTier, setGpTier] = useState<ConsistencyTier>("all");
  const [gpSearch, setGpSearch] = useState("");

  const { schedule, backup, evergreen, excludedCount } = useMemo(() => buildWeeklyPlan(data), [data]);

  const gamePicks = useMemo(
    () => buildGamePicks(
      data.matches,
      data.disposalPlayers,
      data.goalPlayers,
      data.unavailablePlayerIds ?? new Set(),
    ),
    [data.matches, data.disposalPlayers, data.goalPlayers, data.unavailablePlayerIds],
  );

  const gamePickMarketingPacks = useMemo(
    () => buildAllGamePickMarketingPacks(gamePicks, data.matches),
    [gamePicks, data.matches],
  );

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
  const isEvergreenTab = activeDay === "evergreen";
  const isGamePicksTab = activeDay === "game_picks";
  const isGameBankTab = activeDay === "game_bank";
  const isGameDayTab = activeDay === "Thu" || activeDay === "Fri" || activeDay === "Sat" || activeDay === "Sun";

  // Day-of-week index for filtering game packs (Thu=4, Fri=5, Sat=6, Sun=0)
  const GAME_DAY_DOW: Record<string, number> = { Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  const gameDayPacks = useMemo(() => {
    if (!isGameDayTab) return [];
    const dow = GAME_DAY_DOW[activeDay as string];
    return gamePickMarketingPacks.filter(pack => {
      if (!pack.game.game_date) return false;
      return new Date(pack.game.game_date).getDay() === dow;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDay, isGameDayTab, gamePickMarketingPacks]);

  const activePosts = useMemo(() => {
    const base = isBackupTab ? backup
      : isEvergreenTab ? evergreen
      : isGamePicksTab || isGameBankTab || isGameDayTab ? []
      : schedule.filter(p => p.day === activeDay);
    return applyFilters(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDay, schedule, backup, evergreen, isGamePicksTab, isGameBankTab, isGameDayTab, typeFilter, categoryFilter, toneFilter]);

  const scheduledCountByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of schedule) counts[p.day] = (counts[p.day] ?? 0) + 1;
    return counts;
  }, [schedule]);

  const tabCls = (key: ActiveTab) => {
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

  // Best posts today — top 3 by quality score
  const bestToday = useMemo(() => {
    return [...schedule]
      .filter(p => p.quality)
      .sort((a, b) => (b.quality?.score ?? 0) - (a.quality?.score ?? 0))
      .slice(0, 3);
  }, [schedule]);

  return (
    <div className="space-y-4 pt-4">
      <FreshnessPanel data={data} excludedCount={excludedCount} />

      {/* Best posts this week */}
      {bestToday.length > 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Star className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[11px] text-zinc-400 font-semibold">Best posts this week</span>
            <span className="text-[9px] text-zinc-600">— highest quality scores</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {bestToday.map(post => (
              <button
                key={post.id}
                onClick={() => setActiveDay(post.day)}
                className="text-left bg-zinc-800/40 border border-zinc-700/50 rounded-lg p-2 hover:border-zinc-500 transition-colors"
              >
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[9px] text-zinc-500">{DAY_FULL[post.day]}</span>
                  {post.quality && <QualityBadge quality={post.quality} />}
                </div>
                <p className="text-[11px] text-zinc-300 font-medium leading-snug line-clamp-2">{post.title}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Day tabs */}
      <div
        className="overflow-x-auto touch-pan-x overscroll-x-contain -mx-4"
        style={{ scrollbarWidth: "none" } as React.CSSProperties}
      >
        <div className="flex gap-0 border-b border-zinc-800 px-4 w-max min-w-full">
          {DAYS.map(day => {
            const isGamDay = day === "Thu" || day === "Fri" || day === "Sat" || day === "Sun";
            const gamDow = ({ Thu: 4, Fri: 5, Sat: 6, Sun: 0 } as Record<string, number>)[day];
            const gameCount = isGamDay
              ? gamePickMarketingPacks.filter(p => p.game.game_date && new Date(p.game.game_date).getDay() === gamDow).length
              : 0;
            const schedCount = scheduledCountByDay[day] ?? 0;
            const badgeCount = isGamDay ? gameCount : schedCount;
            return (
              <button key={day} onClick={() => setActiveDay(day)} className={tabCls(day)}>
                <span className="hidden sm:inline">{DAY_FULL[day]}</span>
                <span className="sm:hidden">{day}</span>
                {badgeCount > 0 && (
                  <span className={`ml-1 text-[8.5px] px-1 rounded ${isGamDay ? "bg-amber-900/40 text-amber-400" : "bg-zinc-700 text-zinc-400"}`}>{badgeCount}</span>
                )}
                {activeDay === day && <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-t bg-zinc-100" />}
              </button>
            );
          })}
          <button onClick={() => setActiveDay("backup")} className={tabCls("backup")}>
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              <span className="hidden sm:inline">Backup</span>
              <span className="sm:hidden">BK</span>
            </span>
            {backup.length > 0 && (
              <span className="ml-1 text-[8.5px] bg-zinc-700 text-zinc-400 px-1 rounded">{backup.length}</span>
            )}
            {activeDay === "backup" && <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-t bg-zinc-100" />}
          </button>
          <button onClick={() => setActiveDay("evergreen")} className={tabCls("evergreen")}>
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              <span className="hidden sm:inline">Evergreen</span>
              <span className="sm:hidden">EG</span>
            </span>
            {evergreen.length > 0 && (
              <span className="ml-1 text-[8.5px] bg-zinc-700 text-zinc-400 px-1 rounded">{evergreen.length}</span>
            )}
            {activeDay === "evergreen" && <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-t bg-zinc-100" />}
          </button>
          <button onClick={() => setActiveDay("game_picks")} className={tabCls("game_picks")}>
            <span className="flex items-center gap-1">
              <Crosshair className="h-3 w-3" />
              <span className="hidden sm:inline">Game Picks</span>
              <span className="sm:hidden">GP</span>
            </span>
            {gamePicks.length > 0 && (
              <span className="ml-1 text-[8.5px] bg-zinc-700 text-zinc-400 px-1 rounded">{gamePicks.length}</span>
            )}
            {activeDay === "game_picks" && <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-t bg-zinc-100" />}
          </button>
          <button onClick={() => setActiveDay("game_bank")} className={tabCls("game_bank")}>
            <span className="flex items-center gap-1">
              <LayoutGrid className="h-3 w-3" />
              <span className="hidden sm:inline">Game Bank</span>
              <span className="sm:hidden">GB</span>
            </span>
            {gamePickMarketingPacks.length > 0 && (
              <span className="ml-1 text-[8.5px] bg-zinc-700 text-zinc-400 px-1 rounded">{gamePickMarketingPacks.length}</span>
            )}
            {activeDay === "game_bank" && <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-t bg-zinc-100" />}
          </button>
        </div>
      </div>

      {/* Filters — hidden on evergreen, game_picks, game_bank, game day tabs */}
      {!isEvergreenTab && !isGamePicksTab && !isGameBankTab && !isGameDayTab && (
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
      )}

      {/* Day header with count + copy-all */}
      {!isBackupTab && !isEvergreenTab && !isGamePicksTab && !isGameBankTab && !isGameDayTab && (
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
          <span className="text-zinc-300 font-medium">Backup Bank ({backup.length})</span>
          {" "} — unique posts available for any day
        </div>
      )}

      {isEvergreenTab && (
        <div className="text-[11px] text-zinc-500">
          <span className="text-zinc-300 font-medium">Evergreen pool ({evergreen.length})</span>
          {" "} — round-independent educational posts, no game data required
        </div>
      )}

      {/* Game Picks tab */}
      {isGamePicksTab && (
        <GamePicksTabContent
          gamePicks={gamePicks}
          marketingPacks={gamePickMarketingPacks}
          lens={gpLens}
          onLensChange={setGpLens}
          tier={gpTier}
          onTierChange={setGpTier}
          search={gpSearch}
          onSearchChange={setGpSearch}
          copiedId={copiedId}
          onCopy={(id, text) => { navigator.clipboard.writeText(text).catch(() => {}); setCopiedId(id); setTimeout(() => setCopiedId(null), 1800); }}
          roundLabel={data.roundLabel}
        />
      )}

      {/* Game Bank tab — per-game marketing kits grouped by day */}
      {isGameBankTab && (
        <GameBankTabContent
          packs={gamePickMarketingPacks}
          copiedId={copiedId}
          onCopy={(id, text) => { navigator.clipboard.writeText(text).catch(() => {}); setCopiedId(id); setTimeout(() => setCopiedId(null), 1800); }}
          roundLabel={data.roundLabel}
        />
      )}

      {/* Game Day tab — Thu/Fri/Sat/Sun show per-game marketing kits */}
      {isGameDayTab && (
        <GameDayTabContent
          day={activeDay as "Thu" | "Fri" | "Sat" | "Sun"}
          packs={gameDayPacks}
          copiedId={copiedId}
          onCopy={(id, text) => { navigator.clipboard.writeText(text).catch(() => {}); setCopiedId(id); setTimeout(() => setCopiedId(null), 1800); }}
          roundLabel={data.roundLabel}
        />
      )}

      {/* Post list — hidden on game picks, game bank, and game day tabs */}
      {!isGamePicksTab && !isGameBankTab && !isGameDayTab && (
        activePosts.length === 0 ? (
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
                roundLabel={data.roundLabel}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}

export function SocialPostPlanner({ data }: { data: CIDataSubset }) {
  return (
    <SocialPostPlannerErrorBoundary>
      <SocialPostPlannerInner data={data} />
    </SocialPostPlannerErrorBoundary>
  );
}
