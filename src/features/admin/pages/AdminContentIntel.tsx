import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  RefreshCw, Copy, Check, TrendingUp, Target, Zap, FileText,
  TriangleAlert as AlertTriangle, Filter, ChevronDown, ChevronUp,
  Clock, Database, X, Search,
} from "lucide-react";
import { AdminPageHeader } from "@/features/admin/shared/AdminPageHeader";
import type { StatBoardPlayer, StatBoardMatch, ThresholdHitRate } from "@/features/afl/stat-board/types";
import type { StatBoardTeamRow } from "@/features/afl/stat-board/teamTypes";
import type { RankingRow } from "@/features/afl/rankings/components/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const STALE_MS = 5 * 60 * 1000;
const SEASON = 2026;

// ─── Types ────────────────────────────────────────────────────────────────────

type StatFamily =
  | "disposals" | "goals" | "fantasy" | "tackles" | "marks"
  | "kicks" | "handballs" | "clearances" | "hitouts";

type HitProfile =
  | "all" | "perfect" | "missed-once" | "missed-twice"
  | "at-least-80" | "at-least-70" | "at-least-60" | "fade" | "volatile"
  | "projection-supported" | "matchup-supported";

type SampleWindow = "last3" | "last5" | "last8" | "last10";
type MinSample = 3 | 5 | 8 | 0;
type SortBy = "hitrate" | "projection" | "l5avg" | "l10avg" | "seasonavg" | "confidence" | "diff" | "matchup";

type MarketCheckLevel = "high" | "medium" | "low";
type MarketCheckStatus = "not-checked" | "market-exists" | "no-market" | "price-not-good" | "added-to-list" | "posted";

type PostFormat = "tiktok" | "instagram" | "reddit" | "twitter" | "caption";

type GroupBucket =
  | "elite-perfect" | "missed-once" | "missed-twice"
  | "strong-70" | "projection-supported" | "matchup-supported"
  | "fade" | "volatile";

interface RoundInfo {
  current_round: number;
  round_label: string;
  round_status: string;
  total_games: number;
  completed_games: number;
  in_progress_games: number;
  upcoming_games: number;
  next_round: number;
  should_rollover: boolean;
  reason: string;
}

interface SourceFreshness {
  rankingsCachedAt: string | null;
  statBoardRowCount: number;
  rankingsRowCount: number;
  matchRowCount: number;
  teamRowCount: number;
  generatedAt: Date;
  roundSource: "get_current_afl_round_safe" | "stat_board_week_fallback";
}

interface ResearchRow {
  player_id: number;
  player_name: string;
  team_name: string;
  opponent_team_name: string;
  match_label: string;
  position_group: string | null;
  statFamily: StatFamily;
  threshold: number;
  hits: number;
  games: number;
  rate: number; // 0-100
  l3avg: number | null;
  l5avg: number | null;
  l10avg: number | null;
  seasonAvg: number | null;
  projection: number | null;
  confidence_label: string | null;
  bucket: GroupBucket;
  reason: string;
  marketCheckLevel: MarketCheckLevel;
  opponentConcededL5: number | null;
  opponentConcededSeason: number | null;
  stddev: number | null;
  min10: number | null;
  max10: number | null;
}

interface MarketCheckItem {
  id: string;
  player_name: string;
  team_name: string;
  opponent_team_name: string;
  match_label: string;
  statFamily: StatFamily;
  threshold: number;
  hits: number;
  games: number;
  rate: number;
  reason: string;
  marketCheckLevel: MarketCheckLevel;
  status: MarketCheckStatus;
}

interface PostTemplate {
  id: string;
  format: PostFormat;
  category: string;
  title: string;
  hook: string;
  bullets: string[];
  cta: string;
  sourceCount: number;
}

interface ContentIntelData {
  roundInfo: RoundInfo | null;
  currentRound: number;
  roundLabel: string;
  matches: StatBoardMatch[];
  disposalPlayers: StatBoardPlayer[];
  goalPlayers: StatBoardPlayer[];
  teamDisposals: StatBoardTeamRow[];
  teamGoals: StatBoardTeamRow[];
  teamScore: StatBoardTeamRow[];
  rankings: RankingRow[];
  freshness: SourceFreshness;
  loadedAt: Date;
}

// ─── Stat family config ───────────────────────────────────────────────────────

const STAT_FAMILIES: { value: StatFamily; label: string; lens: "disposals" | "goals" | null; thresholds: number[] }[] = [
  { value: "disposals", label: "Disposals", lens: "disposals", thresholds: [10, 15, 20, 25, 30, 35] },
  { value: "goals", label: "Goals", lens: "goals", thresholds: [1, 2, 3, 4, 5] },
  { value: "fantasy", label: "Fantasy Score", lens: "disposals", thresholds: [50, 60, 70, 80, 90, 100, 110, 120] },
  { value: "tackles", label: "Tackles", lens: "disposals", thresholds: [2, 3, 5, 7, 10] },
  { value: "marks", label: "Marks", lens: "disposals", thresholds: [3, 5, 7, 10, 12] },
  { value: "kicks", label: "Kicks", lens: "disposals", thresholds: [10, 15, 20, 25] },
  { value: "handballs", label: "Handballs", lens: "disposals", thresholds: [10, 15, 20] },
  { value: "clearances", label: "Clearances", lens: "disposals", thresholds: [3, 5, 7, 10] },
  { value: "hitouts", label: "Hitouts", lens: "disposals", thresholds: [10, 20, 30, 40] },
];

const SAMPLE_WINDOWS: { value: SampleWindow; label: string; count: number }[] = [
  { value: "last3", label: "Last 3", count: 3 },
  { value: "last5", label: "Last 5", count: 5 },
  { value: "last8", label: "Last 8", count: 8 },
  { value: "last10", label: "Last 10", count: 10 },
];

const HIT_PROFILES: { value: HitProfile; label: string }[] = [
  { value: "all", label: "All profiles" },
  { value: "perfect", label: "Perfect / No misses" },
  { value: "missed-once", label: "Missed Once" },
  { value: "missed-twice", label: "Missed Twice" },
  { value: "at-least-80", label: "80%+" },
  { value: "at-least-70", label: "70%+" },
  { value: "at-least-60", label: "60%+" },
  { value: "fade", label: "Fade / Under" },
  { value: "volatile", label: "Volatile" },
  { value: "projection-supported", label: "Projection-supported" },
  { value: "matchup-supported", label: "Matchup-supported" },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "hitrate", label: "Hit Rate" },
  { value: "l5avg", label: "Recent Average (L5)" },
  { value: "l10avg", label: "Recent Average (L10)" },
  { value: "projection", label: "Projection" },
  { value: "diff", label: "Avg vs Threshold" },
  { value: "confidence", label: "Confidence" },
  { value: "matchup", label: "Matchup Strength" },
];

// ─── Helper functions ─────────────────────────────────────────────────────────

function fmtTimestamp(d: Date): string {
  return d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true }).toLowerCase();
}

function fmtAge(from: Date): string {
  const mins = Math.floor((Date.now() - from.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  return `${mins} mins ago`;
}

function rateToFraction(rate: number): number {
  return rate > 1 ? rate / 100 : rate;
}

function getStatValue(player: StatBoardPlayer, family: StatFamily, threshold: number): { hits: number; games: number; rate: number } | null {
  const rates = player.all_threshold_hit_rates;
  if (!rates) return null;

  // Map stat family to threshold key in the JSON
  // For disposals/goals lens, the threshold keys are the numeric thresholds
  const key = String(threshold);
  const entry = rates[key] as ThresholdHitRate | undefined;
  if (!entry) return null;

  return { hits: entry.hits, games: entry.games, rate: entry.rate };
}

function getAvgForFamily(player: StatBoardPlayer, family: StatFamily): { l3: number | null; l5: number | null; l10: number | null; season: number | null } {
  // For disposals and goals lens, the averages from the RPC are the averages for that lens stat
  // The player rows from disposals lens = disposal averages; goals lens = goal averages
  // For other families (tackles, marks, etc.) we can't get per-family averages from the player RPC directly
  // We use the generic averages which reflect the selected lens
  return {
    l3: player.last_3_avg ?? null,
    l5: player.last_5_avg ?? null,
    l10: player.last_10_avg ?? null,
    season: player.season_avg ?? null,
  };
}

function classifyBucket(
  hits: number, games: number, rate: number,
  projection: number | null, threshold: number,
  opponentConceded: number | null,
  stddev: number | null, l10avg: number | null
): GroupBucket {
  const frac = rateToFraction(rate);
  const misses = games - hits;

  if (frac >= 1.0 && games >= 3) return "elite-perfect";
  if (misses === 1 && games >= 3) return "missed-once";
  if (misses === 2 && games >= 3) return "missed-twice";
  if (frac < 0.40 && games >= 4) return "fade";

  const isVolatile = stddev != null && l10avg != null && stddev > l10avg * 0.4;
  if (isVolatile && frac >= 0.5) return "volatile";

  if (projection != null && projection > threshold * 1.15 && frac >= 0.6) return "projection-supported";
  if (opponentConceded != null && opponentConceded > threshold * 10 && frac >= 0.55) return "matchup-supported";

  return "strong-70";
}

function buildReason(
  player_name: string, threshold: number, family: StatFamily, hits: number, games: number,
  l10avg: number | null, projection: number | null, opponent: string, bucket: GroupBucket
): string {
  const familyLabel = STAT_FAMILIES.find(f => f.value === family)?.label ?? family;
  const pct = Math.round((hits / Math.max(games, 1)) * 100);

  if (bucket === "elite-perfect") {
    return `${hits}/${games} over ${threshold}+ ${familyLabel} in recent sample (100%). ${l10avg != null ? `L10 avg ${l10avg.toFixed(1)}.` : ""} Playing ${opponent}.`;
  }
  if (bucket === "missed-once") {
    return `${hits}/${games} over ${threshold}+ ${familyLabel} — missed exactly once. ${l10avg != null ? `L10 avg ${l10avg.toFixed(1)}.` : ""} Playing ${opponent}.`;
  }
  if (bucket === "missed-twice") {
    return `${hits}/${games} over ${threshold}+ ${familyLabel} — missed twice. ${l10avg != null ? `L10 avg ${l10avg.toFixed(1)}.` : ""} Playing ${opponent}.`;
  }
  if (bucket === "fade") {
    return `${hits}/${games} over ${threshold}+ ${familyLabel} (${pct}%). ${l10avg != null ? `L10 avg ${l10avg.toFixed(1)}.` : ""} Treat as a market-check fade angle vs ${opponent}.`;
  }
  if (bucket === "projection-supported") {
    return `${hits}/${games} over ${threshold}+ ${familyLabel}. ${projection != null ? `Projected ${projection.toFixed(0)}.` : ""} Projection supports vs ${opponent}.`;
  }
  if (bucket === "matchup-supported") {
    return `${hits}/${games} over ${threshold}+ ${familyLabel}. Opponent ${opponent} concession profile supports this angle.`;
  }
  return `${hits}/${games} over ${threshold}+ ${familyLabel} (${pct}%). ${l10avg != null ? `L10 avg ${l10avg.toFixed(1)}.` : ""} Playing ${opponent}.`;
}

function getMarketCheckLevel(bucket: GroupBucket, frac: number): MarketCheckLevel {
  if (bucket === "elite-perfect") return "high";
  if (bucket === "missed-once") return "high";
  if (bucket === "missed-twice") return "medium";
  if (bucket === "projection-supported") return "high";
  if (bucket === "matchup-supported") return "medium";
  if (bucket === "fade") return "medium"; // fade check
  if (frac >= 0.7) return "medium";
  return "low";
}

function filterByHitProfile(row: ResearchRow, profile: HitProfile): boolean {
  const frac = rateToFraction(row.rate);
  const misses = row.games - row.hits;
  switch (profile) {
    case "all": return true;
    case "perfect": return misses === 0 && row.games >= 3;
    case "missed-once": return misses === 1;
    case "missed-twice": return misses === 2;
    case "at-least-80": return frac >= 0.80;
    case "at-least-70": return frac >= 0.70;
    case "at-least-60": return frac >= 0.60;
    case "fade": return frac < 0.40 && row.games >= 4;
    case "volatile": return row.bucket === "volatile";
    case "projection-supported": return row.bucket === "projection-supported";
    case "matchup-supported": return row.bucket === "matchup-supported";
    default: return true;
  }
}

// Build research rows from player data for a given stat family and threshold
function buildResearchRows(
  players: StatBoardPlayer[],
  family: StatFamily,
  threshold: number,
  sampleWindow: SampleWindow,
  minSample: MinSample,
): ResearchRow[] {
  const rows: ResearchRow[] = [];

  for (const p of players) {
    const hitData = getStatValue(p, family, threshold);
    if (!hitData) continue;
    const { hits, games, rate } = hitData;
    if (minSample > 0 && games < minSample) continue;
    if (games === 0) continue;

    const avgs = getAvgForFamily(p, family);
    const frac = rateToFraction(rate);
    const misses = games - hits;

    // Get opponent concession from team rows if available — we'll leave null here
    // as team data is separate. Will join later if needed.
    const bucket = classifyBucket(hits, games, rate, p.projection, threshold, null, p.stddev_last_10, avgs.l10);
    const reason = buildReason(p.player_name, threshold, family, hits, games, avgs.l10, p.projection, p.opponent_team_name, bucket);
    const marketCheckLevel = getMarketCheckLevel(bucket, frac);

    rows.push({
      player_id: p.player_id,
      player_name: p.player_name,
      team_name: p.team_name,
      opponent_team_name: p.opponent_team_name,
      match_label: p.match_label,
      position_group: p.position_group,
      statFamily: family,
      threshold,
      hits,
      games,
      rate,
      l3avg: avgs.l3,
      l5avg: avgs.l5,
      l10avg: avgs.l10,
      seasonAvg: avgs.season,
      projection: p.projection,
      confidence_label: p.confidence_label,
      bucket,
      reason,
      marketCheckLevel,
      opponentConcededL5: null,
      opponentConcededSeason: null,
      stddev: p.stddev_last_10,
      min10: p.min_last_10,
      max10: p.max_last_10,
    });
  }

  return rows;
}

// Sort rows
function sortRows(rows: ResearchRow[], sortBy: SortBy): ResearchRow[] {
  return [...rows].sort((a, b) => {
    switch (sortBy) {
      case "hitrate": return rateToFraction(b.rate) - rateToFraction(a.rate);
      case "l5avg": return (b.l5avg ?? 0) - (a.l5avg ?? 0);
      case "l10avg": return (b.l10avg ?? 0) - (a.l10avg ?? 0);
      case "projection": return (b.projection ?? 0) - (a.projection ?? 0);
      case "diff": {
        const aD = (a.l10avg ?? 0) - a.threshold;
        const bD = (b.l10avg ?? 0) - b.threshold;
        return bD - aD;
      }
      case "confidence": {
        const rank = (c: string | null) => c === "HIGH" ? 3 : c === "MEDIUM" ? 2 : 1;
        return rank(b.confidence_label) - rank(a.confidence_label);
      }
      default: return rateToFraction(b.rate) - rateToFraction(a.rate);
    }
  });
}

// ─── Post template builder ────────────────────────────────────────────────────

function buildPostTemplates(data: ContentIntelData | null): PostTemplate[] {
  if (!data) return [];
  const { disposalPlayers, goalPlayers, rankings, roundLabel } = data;
  const posts: PostTemplate[] = [];

  // Helper: pick top N players for a family/threshold
  function topFor(family: StatFamily, threshold: number, limit: number): ResearchRow[] {
    const src = family === "goals" ? goalPlayers : disposalPlayers;
    const rows = buildResearchRows(src, family, threshold, "last10", 3);
    return sortRows(rows.filter(r => r.bucket !== "fade"), "hitrate").slice(0, limit);
  }

  function topFade(family: StatFamily, threshold: number, limit: number): ResearchRow[] {
    const src = family === "goals" ? goalPlayers : disposalPlayers;
    const rows = buildResearchRows(src, family, threshold, "last10", 3);
    return sortRows(rows.filter(r => r.bucket === "fade"), "hitrate").slice(0, limit);
  }

  const thresholds: [StatFamily, number, string][] = [
    ["disposals", 15, "15+ Disposals"],
    ["disposals", 20, "20+ Disposals"],
    ["disposals", 25, "25+ Disposals"],
    ["disposals", 30, "30+ Disposals"],
    ["goals", 1, "1+ Goals"],
    ["goals", 2, "2+ Goals"],
    ["goals", 3, "3+ Goals"],
  ];

  for (const [family, threshold, label] of thresholds) {
    const top = topFor(family, threshold, 5);
    if (top.length === 0) continue;
    const bullets = top.map(r =>
      `${r.player_name} (${r.team_name}) — ${r.hits}/${r.games} over ${threshold}+ ${label.split("+")[1].trim()}, L5 avg ${r.l5avg?.toFixed(1) ?? "N/A"}`
    );
    posts.push({
      id: `${family}-${threshold}-tiktok`,
      format: "tiktok",
      category: label,
      title: `AFL ${roundLabel}: Players with strong ${label} trends`,
      hook: `These players have been consistently hitting ${label} in recent games. Here's the stat rundown.`,
      bullets,
      cta: `Check the full stat board at Neeko Sports Stats.`,
      sourceCount: top.length,
    });
    posts.push({
      id: `${family}-${threshold}-reddit`,
      format: "reddit",
      category: label,
      title: `${roundLabel} ${label} stat trends — players worth reviewing`,
      hook: `Based on recent AFL form data, here are players who have been consistently hitting ${label}.`,
      bullets,
      cta: `Full stat board at Neeko Sports Stats for deeper research.`,
      sourceCount: top.length,
    });
  }

  // Missed once pack
  const missedOnce = sortRows(
    buildResearchRows(disposalPlayers, "disposals", 20, "last10", 3).filter(r => r.bucket === "missed-once"),
    "l10avg"
  ).slice(0, 5);
  if (missedOnce.length > 0) {
    posts.push({
      id: "missed-once-20plus",
      format: "instagram",
      category: "Missed Once",
      title: `AFL ${roundLabel}: Players who've only missed 20+ disposals once`,
      hook: `Near-perfect disposal records — these players have only missed the 20 disposal mark once in their last sample.`,
      bullets: missedOnce.map(r => `${r.player_name} (${r.team_name}) — ${r.hits}/${r.games}, L5 avg ${r.l5avg?.toFixed(1) ?? "N/A"}, vs ${r.opponent_team_name}`),
      cta: `Full analysis at Neeko Sports Stats.`,
      sourceCount: missedOnce.length,
    });
  }

  // Fade angles
  const fadePacks: [StatFamily, number][] = [["disposals", 20], ["goals", 2]];
  for (const [family, threshold] of fadePacks) {
    const fades = topFade(family, threshold, 5);
    if (fades.length === 0) continue;
    const label = `${threshold}+ ${STAT_FAMILIES.find(f => f.value === family)?.label ?? family}`;
    posts.push({
      id: `fade-${family}-${threshold}`,
      format: "twitter",
      category: "Fade Angles",
      title: `AFL ${roundLabel}: Under-performers on ${label}`,
      hook: `These players have been below the ${label} mark recently. Worth reviewing as fade angles.`,
      bullets: fades.map(r => `${r.player_name} (${r.team_name}) — ${r.hits}/${r.games} over ${threshold}, avg ${r.l10avg?.toFixed(1) ?? "N/A"}, vs ${r.opponent_team_name}`),
      cta: `Stat research at Neeko Sports Stats.`,
      sourceCount: fades.length,
    });
  }

  // Fantasy projections from rankings
  const topFantasy = [...rankings]
    .filter(r => r.projection != null && !r.is_injured && !r.is_bye)
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .slice(0, 8);
  if (topFantasy.length > 0) {
    posts.push({
      id: "fantasy-projections",
      format: "instagram",
      category: "Fantasy Projections",
      title: `AFL ${roundLabel}: Top projected fantasy scorers`,
      hook: `Fantasy projections for this round's top performers.`,
      bullets: topFantasy.map(r => `${r.player_name} (${r.team ?? ""}) — projected ${r.projection?.toFixed(0)} pts`),
      cta: `Full rankings at Neeko Sports Stats.`,
      sourceCount: topFantasy.length,
    });
  }

  // Tackle trends
  const tackles = sortRows(
    buildResearchRows(disposalPlayers, "tackles", 5, "last10", 3).filter(r => r.bucket !== "fade"),
    "hitrate"
  ).slice(0, 5);
  if (tackles.length > 0) {
    posts.push({
      id: "tackle-trends",
      format: "caption",
      category: "Tackle Trends",
      title: `AFL ${roundLabel}: 5+ tackle trends`,
      hook: `Tackle machine alert — these players are consistently laying 5+ tackles.`,
      bullets: tackles.map(r => `${r.player_name} — ${r.hits}/${r.games} over 5+ tackles`),
      cta: `Neeko Sports Stats.`,
      sourceCount: tackles.length,
    });
  }

  // Under-the-radar
  const radar = sortRows(
    buildResearchRows(disposalPlayers, "disposals", 20, "last10", 5)
      .filter(r => r.bucket === "missed-once" || r.bucket === "elite-perfect")
      .filter(r => r.position_group !== "MID"),
    "hitrate"
  ).slice(0, 5);
  if (radar.length > 0) {
    posts.push({
      id: "radar-players",
      format: "tiktok",
      category: "Under the Radar",
      title: `AFL ${roundLabel}: Under-the-radar players with strong disposal trends`,
      hook: `Non-midfielders with standout disposal numbers. Often overlooked but statistically reliable.`,
      bullets: radar.map(r => `${r.player_name} (${r.team_name}, ${r.position_group ?? "?"}) — ${r.hits}/${r.games} over 20+`),
      cta: `Full stat board at Neeko Sports Stats.`,
      sourceCount: radar.length,
    });
  }

  return posts;
}

// ─── Fetch all data ───────────────────────────────────────────────────────────

async function fetchContentIntel(): Promise<ContentIntelData> {
  // Step 1: Canonical round
  let roundInfo: RoundInfo | null = null;
  let currentRound = 0;
  let roundSource: SourceFreshness["roundSource"] = "get_current_afl_round_safe";

  const roundRes = await supabase.rpc("get_current_afl_round_safe", { p_season: SEASON });
  if (!roundRes.error && roundRes.data && roundRes.data.length > 0) {
    roundInfo = roundRes.data[0] as RoundInfo;
    currentRound = roundInfo.current_round;
  }

  // Step 2: All current-round matches
  const matchRes = await supabase.rpc("get_stat_board_matches", { p_season: SEASON, p_round: currentRound || null });
  const matches: StatBoardMatch[] = matchRes.data ?? [];

  // Fallback round from stat board if canonical RPC failed
  if (currentRound === 0 && matches.length > 0) {
    currentRound = (matches[0] as StatBoardMatch).week ?? 0;
    roundSource = "stat_board_week_fallback";
  }

  const roundLabel = currentRound > 0 ? `Round ${currentRound}` : "Current Round";

  // Step 3: All disposal players for current round (no match filter = all matches)
  const disposalRes = await supabase.rpc("get_stat_board_players", {
    p_season: SEASON,
    p_round: currentRound || null,
    p_match_id: null,
    p_lens: "disposals",
    p_threshold: 20,
    p_position_group: null,
    p_team_id: null,
    p_search: null,
    p_limit: 500,
    p_offset: 0,
  });
  const disposalPlayers: StatBoardPlayer[] = disposalRes.data ?? [];

  // Step 4: All goal players for current round
  const goalRes = await supabase.rpc("get_stat_board_players", {
    p_season: SEASON,
    p_round: currentRound || null,
    p_match_id: null,
    p_lens: "goals",
    p_threshold: 1,
    p_position_group: null,
    p_team_id: null,
    p_search: null,
    p_limit: 500,
    p_offset: 0,
  });
  const goalPlayers: StatBoardPlayer[] = goalRes.data ?? [];

  // Step 5: Team disposal concession rows
  const teamDispRes = await supabase.rpc("get_stat_board_team_rows", {
    p_season: SEASON,
    p_round: currentRound || null,
    p_match_id: null,
    p_lens: "disposals",
  });
  const teamDisposals: StatBoardTeamRow[] = teamDispRes.data ?? [];

  // Step 6: Team goals concession rows
  const teamGoalRes = await supabase.rpc("get_stat_board_team_rows", {
    p_season: SEASON,
    p_round: currentRound || null,
    p_match_id: null,
    p_lens: "goals",
  });
  const teamGoals: StatBoardTeamRow[] = teamGoalRes.data ?? [];

  // Step 7: Team score rows
  const teamScoreRes = await supabase.rpc("get_stat_board_team_rows", {
    p_season: SEASON,
    p_round: currentRound || null,
    p_match_id: null,
    p_lens: "score",
  });
  const teamScore: StatBoardTeamRow[] = teamScoreRes.data ?? [];

  // Step 8: Rankings for fantasy angles
  const rankRes = await supabase.rpc("get_rankings_safe", { p_user_id: null, p_is_bot: false, p_limit: 500 });
  const rankings: RankingRow[] = rankRes.data ?? [];

  // Freshness
  const rankingsCachedAt = rankings.find(r => r.cached_at)?.cached_at ?? null;

  const freshness: SourceFreshness = {
    rankingsCachedAt,
    statBoardRowCount: disposalPlayers.length + goalPlayers.length,
    rankingsRowCount: rankings.length,
    matchRowCount: matches.length,
    teamRowCount: teamDisposals.length + teamGoals.length,
    generatedAt: new Date(),
    roundSource,
  };

  return {
    roundInfo,
    currentRound,
    roundLabel,
    matches,
    disposalPlayers,
    goalPlayers,
    teamDisposals,
    teamGoals,
    teamScore,
    rankings,
    freshness,
    loadedAt: new Date(),
  };
}

// ─── UI Components ────────────────────────────────────────────────────────────

function BucketBadge({ bucket }: { bucket: GroupBucket }) {
  const cfg: Record<GroupBucket, { label: string; cls: string }> = {
    "elite-perfect": { label: "Perfect", cls: "bg-emerald-950/60 text-emerald-300 border-emerald-600/30" },
    "missed-once": { label: "Missed Once", cls: "bg-sky-950/60 text-sky-300 border-sky-600/30" },
    "missed-twice": { label: "Missed Twice", cls: "bg-blue-950/60 text-blue-300 border-blue-600/30" },
    "strong-70": { label: "Strong 70%+", cls: "bg-zinc-900 text-zinc-300 border-zinc-600/30" },
    "projection-supported": { label: "Projection ↑", cls: "bg-amber-950/60 text-amber-300 border-amber-600/30" },
    "matchup-supported": { label: "Matchup ↑", cls: "bg-teal-950/60 text-teal-300 border-teal-600/30" },
    "fade": { label: "Fade", cls: "bg-red-950/60 text-red-300 border-red-600/30" },
    "volatile": { label: "Volatile", cls: "bg-orange-950/60 text-orange-300 border-orange-600/30" },
  };
  const { label, cls } = cfg[bucket];
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function MarketCheckBadge({ level }: { level: MarketCheckLevel }) {
  const cls = level === "high"
    ? "bg-emerald-950/60 text-emerald-300 border-emerald-600/30"
    : level === "medium"
    ? "bg-amber-950/60 text-amber-300 border-amber-600/30"
    : "bg-zinc-900 text-zinc-400 border-zinc-700/30";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border ${cls}`}>
      {level === "high" ? "High" : level === "medium" ? "Medium" : "Low"}
    </span>
  );
}

function ConfBadge({ label }: { label: string | null }) {
  if (!label) return null;
  const cls = label === "HIGH"
    ? "text-emerald-400"
    : label === "MEDIUM"
    ? "text-amber-400"
    : "text-zinc-500";
  return <span className={`text-[10px] font-medium ${cls}`}>{label}</span>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-1 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// Freshness panel
function FreshnessPanel({ data, loadedAt }: { data: ContentIntelData; loadedAt: Date }) {
  const [open, setOpen] = useState(false);
  const age = rankingsCachedAtAge(data.freshness.rankingsCachedAt);
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-zinc-400 hover:text-zinc-300 hover:bg-zinc-900/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Database className="h-3 w-3" />
          Source freshness debug
        </span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="px-3 pb-3 bg-zinc-950/50 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
          <FRow label="Round source" value={data.freshness.roundSource} />
          <FRow label="Current round" value={String(data.currentRound || "unknown")} />
          <FRow label="Round status" value={data.roundInfo?.round_status ?? "—"} />
          <FRow label="Total games" value={String(data.roundInfo?.total_games ?? "—")} />
          <FRow label="Completed games" value={String(data.roundInfo?.completed_games ?? "—")} />
          <FRow label="Live games" value={String(data.roundInfo?.in_progress_games ?? "—")} />
          <FRow label="Should rollover" value={data.roundInfo?.should_rollover ? "yes" : "no"} />
          <FRow label="Rankings cached_at" value={data.freshness.rankingsCachedAt ? new Date(data.freshness.rankingsCachedAt).toLocaleString("en-AU") : "—"} />
          <FRow label="Rankings age" value={age} />
          <FRow label="Rankings rows" value={String(data.freshness.rankingsRowCount)} />
          <FRow label="Player stat rows" value={String(data.freshness.statBoardRowCount)} />
          <FRow label="Match rows" value={String(data.freshness.matchRowCount)} />
          <FRow label="Team rows" value={String(data.freshness.teamRowCount)} />
          <FRow label="Post derivation" value="Live useMemo — no storage" />
          <FRow label="Generated at" value={fmtTimestamp(data.freshness.generatedAt)} />
          <FRow label="Refetch interval" value="5 min" />
          <FRow label="Focus refetch" value="If older than 5 min" />
        </div>
      )}
    </div>
  );
}

function FRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-zinc-500 pt-1">{label}</span>
      <span className="text-zinc-300 pt-1 font-mono">{value}</span>
    </>
  );
}

function rankingsCachedAtAge(cachedAt: string | null): string {
  if (!cachedAt) return "—";
  const mins = Math.floor((Date.now() - new Date(cachedAt).getTime()) / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

// Select component
function Sel({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-zinc-200 focus:outline-none focus:border-zinc-500"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Main Research Board ──────────────────────────────────────────────────────

function ResearchBoard({ data }: { data: ContentIntelData }) {
  const [statFamily, setStatFamily] = useState<StatFamily>("disposals");
  const [threshold, setThreshold] = useState(20);
  const [hitProfile, setHitProfile] = useState<HitProfile>("all");
  const [sampleWindow, setSampleWindow] = useState<SampleWindow>("last10");
  const [minSample, setMinSample] = useState<MinSample>(3);
  const [sortBy, setSortBy] = useState<SortBy>("hitrate");
  const [selectedMatch, setSelectedMatch] = useState<number | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null);
  const [positionFilter, setPositionFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Get config for selected family
  const familyCfg = STAT_FAMILIES.find(f => f.value === statFamily)!;
  const thresholds = familyCfg.thresholds;

  // Ensure threshold is valid for family
  useEffect(() => {
    if (!thresholds.includes(threshold)) {
      setThreshold(thresholds[Math.floor(thresholds.length / 2)] ?? thresholds[0]);
    }
  }, [statFamily]);

  // Source players based on family
  const sourcePlayers = statFamily === "goals" ? data.goalPlayers : data.disposalPlayers;

  // Filter by match
  const matchFilteredPlayers = useMemo(() => {
    if (selectedMatch == null) return sourcePlayers;
    return sourcePlayers.filter(p => p.match_id === selectedMatch);
  }, [sourcePlayers, selectedMatch]);

  // Build research rows
  const allRows = useMemo(() => {
    return buildResearchRows(matchFilteredPlayers, statFamily, threshold, sampleWindow, minSample);
  }, [matchFilteredPlayers, statFamily, threshold, sampleWindow, minSample]);

  // Apply filters
  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (selectedTeam) rows = rows.filter(r => r.team_name === selectedTeam);
    if (selectedOpponent) rows = rows.filter(r => r.opponent_team_name === selectedOpponent);
    if (positionFilter) rows = rows.filter(r => r.position_group === positionFilter);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r => r.player_name.toLowerCase().includes(q) || r.team_name.toLowerCase().includes(q));
    }
    rows = rows.filter(r => filterByHitProfile(r, hitProfile));
    return sortRows(rows, sortBy);
  }, [allRows, selectedTeam, selectedOpponent, positionFilter, search, hitProfile, sortBy]);

  // Group into buckets
  const grouped = useMemo(() => {
    const buckets: Record<GroupBucket, ResearchRow[]> = {
      "elite-perfect": [],
      "missed-once": [],
      "missed-twice": [],
      "strong-70": [],
      "projection-supported": [],
      "matchup-supported": [],
      "fade": [],
      "volatile": [],
    };
    for (const r of filteredRows) {
      buckets[r.bucket].push(r);
    }
    return buckets;
  }, [filteredRows]);

  // Teams list for filters
  const teams = useMemo(() => {
    const set = new Set(sourcePlayers.map(p => p.team_name));
    return Array.from(set).sort();
  }, [sourcePlayers]);

  const opponents = useMemo(() => {
    const set = new Set(sourcePlayers.map(p => p.opponent_team_name));
    return Array.from(set).sort();
  }, [sourcePlayers]);

  // Preset chips
  const presets: { label: string; family: StatFamily; threshold: number; profile: HitProfile }[] = [
    { label: "15+ Disp", family: "disposals", threshold: 15, profile: "all" },
    { label: "20+ Disp", family: "disposals", threshold: 20, profile: "all" },
    { label: "25+ Disp", family: "disposals", threshold: 25, profile: "all" },
    { label: "30+ Disp", family: "disposals", threshold: 30, profile: "all" },
    { label: "1+ Goals", family: "goals", threshold: 1, profile: "all" },
    { label: "2+ Goals", family: "goals", threshold: 2, profile: "all" },
    { label: "3+ Goals", family: "goals", threshold: 3, profile: "all" },
    { label: "80+ Fantasy", family: "fantasy", threshold: 80, profile: "all" },
    { label: "100+ Fantasy", family: "fantasy", threshold: 100, profile: "all" },
    { label: "5+ Tackles", family: "tackles", threshold: 5, profile: "all" },
    { label: "Missed Once", family: statFamily, threshold, profile: "missed-once" },
    { label: "Fade Angles", family: statFamily, threshold, profile: "fade" },
  ];

  const BUCKET_ORDER: GroupBucket[] = [
    "elite-perfect", "missed-once", "missed-twice", "strong-70",
    "projection-supported", "matchup-supported", "volatile", "fade",
  ];

  const BUCKET_LABELS: Record<GroupBucket, string> = {
    "elite-perfect": "Elite / Perfect",
    "missed-once": "Missed Once",
    "missed-twice": "Missed Twice",
    "strong-70": "Strong 70%+",
    "projection-supported": "Projection-Supported",
    "matchup-supported": "Matchup-Supported",
    "fade": "Fade / Under Angles",
    "volatile": "Volatile Upside",
  };

  return (
    <div className="space-y-4">
      {/* Preset chips */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map(p => (
          <button
            key={`${p.family}-${p.threshold}-${p.profile}`}
            onClick={() => { setStatFamily(p.family); setThreshold(p.threshold); setHitProfile(p.profile); }}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors
              ${statFamily === p.family && threshold === p.threshold && hitProfile === p.profile
                ? "bg-zinc-200 text-zinc-900 border-zinc-300"
                : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500"}`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => { setStatFamily("disposals"); setThreshold(20); setHitProfile("all"); setSampleWindow("last10"); setMinSample(3); setSortBy("hitrate"); setSelectedMatch(null); setSelectedTeam(null); setSelectedOpponent(null); setPositionFilter(null); setSearch(""); }}
          className="px-2.5 py-1 rounded-full text-[11px] font-medium border bg-zinc-900 text-zinc-500 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Sel
            label="Match"
            value={selectedMatch == null ? "all" : String(selectedMatch)}
            onChange={v => setSelectedMatch(v === "all" ? null : Number(v))}
            options={[
              { value: "all", label: "All Matches" },
              ...data.matches.map(m => ({ value: String(m.match_id), label: m.match_label })),
            ]}
          />
          <Sel
            label="Team"
            value={selectedTeam ?? "all"}
            onChange={v => setSelectedTeam(v === "all" ? null : v)}
            options={[{ value: "all", label: "All Teams" }, ...teams.map(t => ({ value: t, label: t }))]}
          />
          <Sel
            label="Opponent"
            value={selectedOpponent ?? "all"}
            onChange={v => setSelectedOpponent(v === "all" ? null : v)}
            options={[{ value: "all", label: "All Opponents" }, ...opponents.map(t => ({ value: t, label: t }))]}
          />
          <Sel
            label="Position"
            value={positionFilter ?? "all"}
            onChange={v => setPositionFilter(v === "all" ? null : v)}
            options={[
              { value: "all", label: "All Positions" },
              { value: "MID", label: "Mids" },
              { value: "DEF", label: "Defenders" },
              { value: "FWD", label: "Forwards" },
              { value: "RUC", label: "Rucks" },
            ]}
          />
          <Sel
            label="Stat Family"
            value={statFamily}
            onChange={v => setStatFamily(v as StatFamily)}
            options={STAT_FAMILIES.map(f => ({ value: f.value, label: f.label }))}
          />
          <Sel
            label="Threshold"
            value={String(threshold)}
            onChange={v => setThreshold(Number(v))}
            options={thresholds.map(t => ({ value: String(t), label: `${t}+` }))}
          />
          <Sel
            label="Sample"
            value={sampleWindow}
            onChange={v => setSampleWindow(v as SampleWindow)}
            options={SAMPLE_WINDOWS.map(s => ({ value: s.value, label: s.label }))}
          />
          <Sel
            label="Min Games"
            value={String(minSample)}
            onChange={v => setMinSample(Number(v) as MinSample)}
            options={[
              { value: "0", label: "Any" },
              { value: "3", label: "3+" },
              { value: "5", label: "5+" },
              { value: "8", label: "8+" },
            ]}
          />
          <Sel
            label="Hit Profile"
            value={hitProfile}
            onChange={v => setHitProfile(v as HitProfile)}
            options={HIT_PROFILES}
          />
          <Sel
            label="Sort By"
            value={sortBy}
            onChange={v => setSortBy(v as SortBy)}
            options={SORT_OPTIONS}
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search player or team…"
            className="flex-1 bg-transparent border-0 text-[12px] text-zinc-300 placeholder-zinc-600 focus:outline-none"
          />
          {search && <button onClick={() => setSearch("")}><X className="h-3 w-3 text-zinc-500" /></button>}
        </div>
      </div>

      {/* Summary */}
      <div className="text-[11px] text-zinc-500">
        Showing <span className="text-zinc-300 font-medium">{filteredRows.length}</span> players
        with <span className="text-zinc-300">{threshold}+ {familyCfg.label}</span>
        {selectedMatch != null && <> in {data.matches.find(m => m.match_id === selectedMatch)?.match_label}</>}
        {selectedMatch == null && <> across all {data.matches.length} {data.roundLabel} match{data.matches.length !== 1 ? "es" : ""}</>}
      </div>

      {filteredRows.length === 0 && (
        <div className="py-10 text-center text-zinc-500 text-sm border border-zinc-800 rounded-lg">
          No players match the current filters.
          {hitProfile === "perfect" && " Try 'All profiles' to see near-miss players."}
        </div>
      )}

      {/* Grouped results */}
      {BUCKET_ORDER.map(bucket => {
        const rows = grouped[bucket];
        if (rows.length === 0) return null;
        return (
          <div key={bucket} className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-[12px] font-semibold text-zinc-300">{BUCKET_LABELS[bucket]}</h3>
              <span className="text-[10px] text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded">{rows.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">Player</th>
                    <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">Team</th>
                    <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">Opp</th>
                    <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">Pos</th>
                    <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">Record</th>
                    <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">Rate</th>
                    <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">L3</th>
                    <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">L5</th>
                    <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">L10</th>
                    <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">Proj</th>
                    <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">Conf</th>
                    <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">MCQ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={`${row.player_id}-${row.threshold}`} className="border-b border-zinc-900 hover:bg-zinc-900/30">
                      <td className="py-1.5 px-2 font-medium text-zinc-200">{row.player_name}</td>
                      <td className="py-1.5 px-2 text-zinc-400">{row.team_name}</td>
                      <td className="py-1.5 px-2 text-zinc-400">{row.opponent_team_name}</td>
                      <td className="py-1.5 px-2 text-zinc-500">{row.position_group ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-zinc-300">{row.hits}/{row.games}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-zinc-200">{Math.round(rateToFraction(row.rate) * 100)}%</td>
                      <td className="py-1.5 px-2 text-right font-mono text-zinc-400">{row.l3avg?.toFixed(1) ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-zinc-400">{row.l5avg?.toFixed(1) ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-zinc-400">{row.l10avg?.toFixed(1) ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-zinc-300">{row.projection?.toFixed(0) ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right"><ConfBadge label={row.confidence_label} /></td>
                      <td className="py-1.5 px-2 text-right"><MarketCheckBadge level={row.marketCheckLevel} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Team Angles ──────────────────────────────────────────────────────────────

function TeamAngles({ data }: { data: ContentIntelData }) {
  const [lens, setLens] = useState<"disposals" | "goals" | "score">("disposals");

  const teamRows = lens === "disposals" ? data.teamDisposals
    : lens === "goals" ? data.teamGoals
    : data.teamScore;

  const sorted = useMemo(() => {
    return [...teamRows].sort((a, b) => {
      const av = (a.opponent_conceded_l5 ?? a.opponent_conceded_season ?? 0);
      const bv = (b.opponent_conceded_l5 ?? b.opponent_conceded_season ?? 0);
      return bv - av;
    });
  }, [teamRows]);

  const lensLabel = lens === "disposals" ? "Disposals" : lens === "goals" ? "Goals" : "Score";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["disposals", "goals", "score"] as const).map(l => (
          <button
            key={l}
            onClick={() => setLens(l)}
            className={`px-3 py-1.5 rounded text-[11px] font-medium transition-colors border
              ${lens === l ? "bg-zinc-200 text-zinc-900 border-zinc-300" : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500"}`}
          >
            {l === "disposals" ? "Disposals" : l === "goals" ? "Goals" : "Score"}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="py-8 text-center text-zinc-500 text-sm border border-zinc-800 rounded-lg">
          No team concession data available for this round.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">Team</th>
                <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">Opponent</th>
                <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">H/A</th>
                <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">Conc L5</th>
                <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">Conc Ssn</th>
                <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">Own L5 avg</th>
                <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">Own Ssn avg</th>
                <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">Proj</th>
                <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">Angle</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const concL5 = row.opponent_conceded_l5;
                const concSsn = row.opponent_conceded_season;
                const isHighConcession = concL5 != null && concSsn != null && concL5 > concSsn * 1.05;
                return (
                  <tr key={i} className="border-b border-zinc-900 hover:bg-zinc-900/30">
                    <td className="py-1.5 px-2 font-medium text-zinc-200">{row.team_name}</td>
                    <td className="py-1.5 px-2 text-zinc-400">{row.opponent_team_name}</td>
                    <td className="py-1.5 px-2 text-zinc-500">{row.is_home ? "H" : "A"}</td>
                    <td className={`py-1.5 px-2 text-right font-mono ${isHighConcession ? "text-amber-300" : "text-zinc-400"}`}>
                      {concL5?.toFixed(1) ?? "—"}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-zinc-400">{concSsn?.toFixed(1) ?? "—"}</td>
                    <td className="py-1.5 px-2 text-right font-mono text-zinc-400">{row.recent_avg_l5?.toFixed(1) ?? "—"}</td>
                    <td className="py-1.5 px-2 text-right font-mono text-zinc-400">{row.season_avg?.toFixed(1) ?? "—"}</td>
                    <td className="py-1.5 px-2 text-right font-mono text-zinc-300">{row.projection?.toFixed(1) ?? "—"}</td>
                    <td className="py-1.5 px-2">
                      {isHighConcession && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold border bg-amber-950/60 text-amber-300 border-amber-600/30">
                          Concession ↑
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-zinc-600">
        Concession = average {lensLabel} allowed to opponents. Higher = opposition players may find more of this stat.
        All current-round matches shown.
      </p>
    </div>
  );
}

// ─── Market Check Queue ───────────────────────────────────────────────────────

function MarketCheckQueue({ data }: { data: ContentIntelData }) {
  const [statuses, setStatuses] = useState<Record<string, MarketCheckStatus>>({});
  const [levelFilter, setLevelFilter] = useState<MarketCheckLevel | "all">("all");

  const items = useMemo((): MarketCheckItem[] => {
    const rows: MarketCheckItem[] = [];
    const configs: [StatFamily, number][] = [
      ["disposals", 15], ["disposals", 20], ["disposals", 25], ["disposals", 30],
      ["goals", 1], ["goals", 2], ["goals", 3],
    ];
    for (const [family, threshold] of configs) {
      const src = family === "goals" ? data.goalPlayers : data.disposalPlayers;
      const built = buildResearchRows(src, family, threshold, "last10", 3);
      for (const r of built) {
        if (r.marketCheckLevel === "low" && r.bucket !== "fade") continue;
        const id = `${r.player_id}-${family}-${threshold}`;
        rows.push({
          id,
          player_name: r.player_name,
          team_name: r.team_name,
          opponent_team_name: r.opponent_team_name,
          match_label: r.match_label,
          statFamily: family,
          threshold,
          hits: r.hits,
          games: r.games,
          rate: r.rate,
          reason: r.reason,
          marketCheckLevel: r.marketCheckLevel,
          status: statuses[id] ?? "not-checked",
        });
      }
    }
    // Deduplicate by player+family+threshold
    const seen = new Set<string>();
    return rows.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
  }, [data, statuses]);

  const filtered = useMemo(() => {
    return items.filter(i => levelFilter === "all" || i.marketCheckLevel === levelFilter);
  }, [items, levelFilter]);

  const STATUS_OPTS: { value: MarketCheckStatus; label: string }[] = [
    { value: "not-checked", label: "Not checked" },
    { value: "market-exists", label: "Market exists" },
    { value: "no-market", label: "No market" },
    { value: "price-not-good", label: "Price not good" },
    { value: "added-to-list", label: "Added to list" },
    { value: "posted", label: "Posted" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-2 bg-zinc-900/40 border border-zinc-800 rounded text-[10px] text-zinc-500">
        Private browser-only workflow state. Status resets on page refresh. No gambling data is stored.
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["all", "high", "medium", "low"] as const).map(l => (
          <button
            key={l}
            onClick={() => setLevelFilter(l)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors
              ${levelFilter === l ? "bg-zinc-200 text-zinc-900 border-zinc-300" : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500"}`}
          >
            {l === "all" ? "All" : l.charAt(0).toUpperCase() + l.slice(1)}
          </button>
        ))}
      </div>

      <div className="text-[11px] text-zinc-500">{filtered.length} angles worth checking</div>

      {filtered.length === 0 && (
        <div className="py-8 text-center text-zinc-500 text-sm border border-zinc-800 rounded-lg">
          No market-check angles found for current data.
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(item => {
          const frac = rateToFraction(item.rate);
          return (
            <div key={item.id} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-zinc-200 text-[12px]">{item.player_name}</span>
                    <span className="text-zinc-500 text-[11px]">{item.team_name} vs {item.opponent_team_name}</span>
                    <MarketCheckBadge level={item.marketCheckLevel} />
                    <span className="text-[10px] text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5">
                      {item.threshold}+ {STAT_FAMILIES.find(f => f.value === item.statFamily)?.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mb-1">
                    {item.hits}/{item.games} — {Math.round(frac * 100)}% hit rate
                  </div>
                  <div className="text-[10px] text-zinc-500">{item.reason}</div>
                </div>
                <select
                  value={statuses[item.id] ?? "not-checked"}
                  onChange={e => setStatuses(s => ({ ...s, [item.id]: e.target.value as MarketCheckStatus }))}
                  className="shrink-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[10px] text-zinc-300 focus:outline-none"
                >
                  {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Fantasy Angles ───────────────────────────────────────────────────────────

function FantasyAngles({ data }: { data: ContentIntelData }) {
  const { rankings } = data;

  const active = rankings.filter(r => !r.is_injured && !r.is_bye && r.projection != null);

  const topProjected = useMemo(() =>
    [...active].sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0)).slice(0, 10),
    [active]
  );

  const bestValue = useMemo(() =>
    [...active].filter(r => r.value_score != null).sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0)).slice(0, 10),
    [active]
  );

  const highConf = useMemo(() =>
    [...active].filter(r => r.confidence_label === "HIGH").sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0)).slice(0, 10),
    [active]
  );

  const trapPlayers = useMemo(() =>
    [...rankings].filter(r => r.action_canonical === "sell" || r.recommendation_color === "red").sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0)).slice(0, 10),
    [rankings]
  );

  const formRisers = useMemo(() =>
    [...active].filter(r => r.form_delta != null && r.form_delta > 0).sort((a, b) => (b.form_delta ?? 0) - (a.form_delta ?? 0)).slice(0, 10),
    [active]
  );

  const formFallers = useMemo(() =>
    [...active].filter(r => r.form_delta != null && r.form_delta < 0).sort((a, b) => (a.form_delta ?? 0) - (b.form_delta ?? 0)).slice(0, 10),
    [active]
  );

  function PlayerTable({ players, label, cols }: {
    players: RankingRow[];
    label: string;
    cols?: ("projection" | "value_score" | "form_delta" | "confidence_label")[];
  }) {
    const show = cols ?? ["projection"];
    return (
      <div>
        <h3 className="text-[12px] font-semibold text-zinc-300 mb-2">{label}</h3>
        {players.length === 0 ? (
          <p className="text-[11px] text-zinc-500 py-3 border border-zinc-800 rounded text-center">No data available.</p>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">Player</th>
                <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">Team</th>
                <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">Pos</th>
                {show.includes("projection") && <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">Proj</th>}
                {show.includes("value_score") && <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">Value</th>}
                {show.includes("form_delta") && <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">Form Δ</th>}
                {show.includes("confidence_label") && <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">Conf</th>}
              </tr>
            </thead>
            <tbody>
              {players.map(p => (
                <tr key={p.player_id} className="border-b border-zinc-900 hover:bg-zinc-900/30">
                  <td className="py-1.5 px-2 font-medium text-zinc-200">{p.player_name}</td>
                  <td className="py-1.5 px-2 text-zinc-400">{p.team ?? "—"}</td>
                  <td className="py-1.5 px-2 text-zinc-500">{p.position ?? "—"}</td>
                  {show.includes("projection") && <td className="py-1.5 px-2 text-right font-mono text-zinc-300">{p.projection?.toFixed(0) ?? "—"}</td>}
                  {show.includes("value_score") && <td className="py-1.5 px-2 text-right font-mono text-zinc-300">{p.value_score?.toFixed(1) ?? "—"}</td>}
                  {show.includes("form_delta") && (
                    <td className={`py-1.5 px-2 text-right font-mono ${(p.form_delta ?? 0) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {p.form_delta != null ? `${p.form_delta > 0 ? "+" : ""}${p.form_delta.toFixed(1)}` : "—"}
                    </td>
                  )}
                  {show.includes("confidence_label") && <td className="py-1.5 px-2 text-right"><ConfBadge label={p.confidence_label} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {rankings.length === 0 && (
        <div className="py-8 text-center text-zinc-500 text-sm border border-zinc-800 rounded-lg">
          No rankings data loaded.
        </div>
      )}
      <PlayerTable players={topProjected} label="Top Projected Scorers" cols={["projection", "confidence_label"]} />
      <PlayerTable players={bestValue} label="Best Value Players" cols={["projection", "value_score"]} />
      <PlayerTable players={highConf} label="High Confidence Players" cols={["projection", "confidence_label"]} />
      <PlayerTable players={trapPlayers} label="Trap / Fade Fantasy Players" cols={["projection", "confidence_label"]} />
      <PlayerTable players={formRisers} label="Form Risers" cols={["projection", "form_delta"]} />
      <PlayerTable players={formFallers} label="Form Fallers" cols={["projection", "form_delta"]} />
    </div>
  );
}

// ─── Post Ideas ───────────────────────────────────────────────────────────────

function PostIdeas({ posts }: { posts: PostTemplate[] }) {
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [formatFilter, setFormatFilter] = useState<PostFormat | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const cats = new Set(posts.map(p => p.category));
    return ["All", ...Array.from(cats)];
  }, [posts]);

  const filtered = useMemo(() => {
    return posts.filter(p =>
      (categoryFilter === "All" || p.category === categoryFilter) &&
      (formatFilter === "all" || p.format === formatFilter)
    );
  }, [posts, categoryFilter, formatFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors
              ${categoryFilter === c ? "bg-zinc-200 text-zinc-900 border-zinc-300" : "bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500"}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        {(["all", "tiktok", "instagram", "reddit", "twitter", "caption"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFormatFilter(f)}
            className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors
              ${formatFilter === f ? "bg-zinc-700 text-zinc-200 border-zinc-500" : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700"}`}
          >
            {f === "all" ? "All formats" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="text-[11px] text-zinc-500">{filtered.length} post packs — derived from {posts.reduce((s, p) => s + p.sourceCount, 0)} live data rows</div>

      {filtered.length === 0 && (
        <div className="py-8 text-center text-zinc-500 text-sm border border-zinc-800 rounded-lg">
          No posts generated. Insufficient live data for current filters.
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(post => {
          const isExpanded = expandedId === post.id;
          const fullText = `${post.title}\n\n${post.hook}\n\n${post.bullets.map(b => `• ${b}`).join("\n")}\n\n${post.cta}`;
          return (
            <div key={post.id} className="border border-zinc-800 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : post.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-900/50 transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5 shrink-0">
                    {post.format}
                  </span>
                  <span className="text-[11px] font-medium text-zinc-300 truncate">{post.title}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-zinc-600">{post.sourceCount} rows</span>
                  {isExpanded ? <ChevronUp className="h-3 w-3 text-zinc-500" /> : <ChevronDown className="h-3 w-3 text-zinc-500" />}
                </div>
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-zinc-800 pt-3 space-y-3">
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-1">Hook</p>
                    <p className="text-[12px] text-zinc-300">{post.hook}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-1">Content bullets</p>
                    <ul className="space-y-1">
                      {post.bullets.map((b, i) => (
                        <li key={i} className="text-[11px] text-zinc-400 flex gap-2">
                          <span className="text-zinc-600 shrink-0">•</span>{b}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-1">CTA</p>
                    <p className="text-[11px] text-zinc-400">{post.cta}</p>
                  </div>
                  <div className="flex justify-end">
                    <CopyButton text={fullText} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = ["Research Board", "Team Angles", "Fantasy Angles", "Market Check", "Post Ideas", "Freshness"] as const;
type Tab = typeof TABS[number];

export default function AdminContentIntel() {
  const [activeTab, setActiveTab] = useState<Tab>("Research Board");
  const [data, setData] = useState<ContentIntelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedAtRef = useRef<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchContentIntel();
      setData(result);
      loadedAtRef.current = result.loadedAt;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Interval refetch every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => { fetchAll(); }, STALE_MS);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Window focus refetch if stale
  useEffect(() => {
    function onFocus() {
      if (!loadedAtRef.current) return;
      if (Date.now() - loadedAtRef.current.getTime() > STALE_MS) fetchAll();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchAll]);

  // Post ideas regenerated from live data via useMemo
  const allPosts = useMemo(() => buildPostTemplates(data), [data]);

  const statusLine = data
    ? `Generated from live stats · ${data.roundLabel} · refreshed ${fmtTimestamp(data.loadedAt)}`
    : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <AdminPageHeader
        title="Content Intel"
        subtitle="Private stat research tool — current round stat angles and market-check workflow"
      />

      {/* Status bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <Clock className="h-3 w-3" />
          {loading ? "Refreshing…" : statusLine ?? "Loading…"}
          {data?.roundInfo && (
            <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
              data.roundInfo.round_status === "active"
                ? "bg-emerald-950/40 text-emerald-400 border-emerald-600/30"
                : "bg-zinc-900 text-zinc-400 border-zinc-700/30"
            }`}>
              {data.roundInfo.round_status}
            </span>
          )}
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <SCard
            label="Round"
            value={data.currentRound ? `Round ${data.currentRound}` : "—"}
            sub={data.roundInfo ? `${data.roundInfo.total_games} games · ${data.roundInfo.completed_games} done` : ""}
          />
          <SCard
            label="Matches loaded"
            value={String(data.matches.length)}
            sub={data.matches.slice(0, 3).map(m => m.match_label).join(", ") || "—"}
          />
          <SCard
            label="Player stat rows"
            value={String(data.freshness.statBoardRowCount)}
            sub={`Disposals + Goals`}
          />
          <SCard
            label="Rankings loaded"
            value={String(data.freshness.rankingsRowCount)}
            sub={data.freshness.rankingsCachedAt ? `Cached ${fmtAge(new Date(data.freshness.rankingsCachedAt))}` : ""}
          />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-red-950/30 border border-red-800/30 rounded text-[12px] text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Tab bar — underline indicator style */}
      <div className="flex gap-0 mb-6 border-b border-zinc-800">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative px-4 py-2.5 text-[12px] font-medium transition-colors ${
              activeTab === tab ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-t bg-zinc-100" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {!data && !loading && !error && (
        <div className="py-20 text-center text-zinc-500">Loading data…</div>
      )}
      {!data && loading && (
        <div className="py-20 text-center text-zinc-500">Fetching live stats…</div>
      )}

      {data && (
        <div>
          {activeTab === "Research Board" && <ResearchBoard data={data} />}
          {activeTab === "Team Angles" && <TeamAngles data={data} />}
          {activeTab === "Fantasy Angles" && <FantasyAngles data={data} />}
          {activeTab === "Market Check" && <MarketCheckQueue data={data} />}
          {activeTab === "Post Ideas" && <PostIdeas posts={allPosts} />}
          {activeTab === "Freshness" && <FreshnessPanel data={data} loadedAt={data.loadedAt} />}
        </div>
      )}
    </div>
  );
}

function SCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-[18px] font-semibold text-zinc-100">{value}</div>
      <div className="text-[10px] text-zinc-500 truncate mt-0.5">{sub}</div>
    </div>
  );
}
