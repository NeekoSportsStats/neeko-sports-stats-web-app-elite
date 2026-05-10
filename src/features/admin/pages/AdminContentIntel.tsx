/**
 * Admin Content Intel — private stat research and market-check board.
 * Covers all current-round games (and next-up games in Smart Next-Up mode).
 * Stats-based only. No public-facing content. No AI. No mock data.
 *
 * Smart Next-Up mode: teams who have already played their current-round game
 * show their NEXT scheduled opponent, so you can start preparing content
 * before the whole round finishes. Teams yet to play remain on current round.
 *
 * Does NOT affect any public page, Stat Board, Fantasy Hub, or round rollover.
 */
import {
  useState, useEffect, useCallback, useRef, useMemo,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import { RefreshCw, Copy, Check, ChevronDown, ChevronUp, Clock, Database, X, Search, TriangleAlert as AlertTriangle, ArrowRight, Lightbulb } from "lucide-react";
import { AdminPageHeader } from "@/features/admin/shared/AdminPageHeader";
import type {
  StatBoardPlayer, StatBoardMatch, ThresholdHitRate,
} from "@/features/afl/stat-board/types";
import type { StatBoardTeamRow } from "@/features/afl/stat-board/teamTypes";

// ─── Constants ────────────────────────────────────────────────────────────────

const STALE_MS = 5 * 60 * 1000;
const SEASON = 2026;
const FT_STATUSES = new Set(["FT", "COMPLETE", "COMPLETED", "FINAL"]);

// ─── Content Mode ─────────────────────────────────────────────────────────────

type ContentMode =
  | "smart-next-up"    // Default: completed = next-up, unplayed = current
  | "current-round"    // Always canonical current round
  | "next-round"       // All teams show next scheduled game
  | "played-this-round"  // Only completed teams
  | "not-yet-played";    // Only teams yet to play

const CONTENT_MODES: { value: ContentMode; label: string; desc: string }[] = [
  { value: "smart-next-up",     label: "Smart Next-Up",      desc: "Completed = next game · Unplayed = current game" },
  { value: "current-round",     label: "Current Round Only", desc: "All teams on current-round game" },
  { value: "next-round",        label: "Next Round Only",    desc: "All teams on next scheduled game" },
  { value: "played-this-round", label: "Played This Round",  desc: "Only teams whose current game is complete" },
  { value: "not-yet-played",    label: "Not Yet Played",     desc: "Only teams still waiting to play" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type StatFamily =
  | "disposals" | "goals" | "tackles" | "marks"
  | "kicks" | "handballs" | "clearances" | "hitouts" | "fantasy";

type HitProfile =
  | "all" | "perfect" | "missed-once" | "missed-twice"
  | "at-least-80" | "at-least-70" | "at-least-60"
  | "fade" | "volatile" | "projection-supported" | "matchup-supported";

type SortBy =
  | "hitrate" | "hits" | "misses" | "l5avg" | "l10avg" | "seasonavg"
  | "projection" | "diff" | "confidence" | "sample";

type GroupBucket =
  | "elite-perfect" | "missed-once" | "missed-twice"
  | "strong-70" | "projection-supported" | "matchup-supported"
  | "fade" | "volatile";

type ResearchStatus =
  | "not-checked" | "market-exists" | "no-market"
  | "price-not-good" | "added-to-list" | "posted";

type PostFormat = "tiktok" | "instagram" | "reddit" | "twitter" | "caption";

// Target badge for a player/team row
type TargetBadge =
  | "current-round"  // team hasn't played yet
  | "next-up"        // team has played, showing next game
  | "played-updated" // team has played + stats appear fresh
  | "waiting-stats"  // team has played but stats may not be ingested
  | "bye"            // team has no game
  | "no-fixture";    // no next fixture found

// ─── Smart Next-Up team target ────────────────────────────────────────────────

interface TeamTarget {
  team_id: number;
  team_name: string;
  current_round: number;
  current_game_id: number | null;
  current_game_date: string | null;
  current_opponent_id: number | null;
  current_opponent_name: string | null;
  current_game_status: string;
  has_played_current_round: boolean;
  next_game_id: number | null;
  next_game_round: number | null;
  next_game_date: string | null;
  next_opponent_id: number | null;
  next_opponent_name: string | null;
  next_game_status: string | null;
  target_mode_suggestion: "next-up" | "current-round" | "bye" | "no-fixture";
}

// ─── Stat family config ───────────────────────────────────────────────────────

interface FamilyCfg {
  value: StatFamily;
  label: string;
  lens: "disposals" | "goals";
  thresholds: number[];
}

const FAMILY_CFG: FamilyCfg[] = [
  { value: "disposals", label: "Disposals",     lens: "disposals", thresholds: [10, 15, 20, 25, 30, 35] },
  { value: "goals",     label: "Goals",         lens: "goals",     thresholds: [1, 2, 3, 4, 5] },
  { value: "tackles",   label: "Tackles",       lens: "disposals", thresholds: [2, 3, 5, 7, 10] },
  { value: "marks",     label: "Marks",         lens: "disposals", thresholds: [3, 5, 7, 10, 12] },
  { value: "kicks",     label: "Kicks",         lens: "disposals", thresholds: [10, 15, 20, 25] },
  { value: "handballs", label: "Handballs",     lens: "disposals", thresholds: [10, 15, 20] },
  { value: "clearances",label: "Clearances",    lens: "disposals", thresholds: [3, 5, 7, 10] },
  { value: "hitouts",   label: "Hitouts",       lens: "disposals", thresholds: [10, 20, 30, 40] },
  { value: "fantasy",   label: "Fantasy Score", lens: "disposals", thresholds: [50, 60, 70, 80, 90, 100, 110, 120] },
];

const HIT_PROFILES: { value: HitProfile; label: string }[] = [
  { value: "all",                  label: "All profiles" },
  { value: "perfect",              label: "Perfect / No misses" },
  { value: "missed-once",          label: "Missed Once" },
  { value: "missed-twice",         label: "Missed Twice" },
  { value: "at-least-80",          label: "80%+" },
  { value: "at-least-70",          label: "70%+" },
  { value: "at-least-60",          label: "60%+" },
  { value: "fade",                 label: "Fade / Under" },
  { value: "volatile",             label: "Volatile" },
  { value: "projection-supported", label: "Projection-supported" },
  { value: "matchup-supported",    label: "Matchup-supported" },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "hitrate",    label: "Hit Rate" },
  { value: "hits",       label: "Hits" },
  { value: "misses",     label: "Fewest Misses" },
  { value: "l5avg",      label: "L5 Average" },
  { value: "l10avg",     label: "L10 Average" },
  { value: "seasonavg",  label: "Season Average" },
  { value: "projection", label: "Projection" },
  { value: "diff",       label: "Avg vs Threshold" },
  { value: "confidence", label: "Confidence" },
  { value: "sample",     label: "Sample Size" },
];

const BUCKET_ORDER: GroupBucket[] = [
  "elite-perfect", "missed-once", "missed-twice", "strong-70",
  "projection-supported", "matchup-supported", "volatile", "fade",
];

const BUCKET_META: Record<GroupBucket, { label: string; cls: string }> = {
  "elite-perfect":        { label: "Elite / Perfect",      cls: "bg-emerald-950/60 text-emerald-300 border-emerald-600/30" },
  "missed-once":          { label: "Missed Once",           cls: "bg-sky-950/60 text-sky-300 border-sky-600/30" },
  "missed-twice":         { label: "Missed Twice",          cls: "bg-blue-950/60 text-blue-300 border-blue-600/30" },
  "strong-70":            { label: "Strong 70%+",           cls: "bg-zinc-900 text-zinc-300 border-zinc-600/30" },
  "projection-supported": { label: "Projection-Supported", cls: "bg-amber-950/60 text-amber-300 border-amber-600/30" },
  "matchup-supported":    { label: "Matchup-Supported",    cls: "bg-teal-950/60 text-teal-300 border-teal-600/30" },
  "volatile":             { label: "Volatile Upside",       cls: "bg-orange-950/60 text-orange-300 border-orange-600/30" },
  "fade":                 { label: "Fade / Under",          cls: "bg-red-950/60 text-red-300 border-red-600/30" },
};

// ─── RoundInfo ────────────────────────────────────────────────────────────────

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

// ─── Research row ─────────────────────────────────────────────────────────────

interface ResearchRow {
  player_id: number;
  player_name: string;
  team_id: number;
  team_name: string;
  // current-round data from stat board
  opponent_team_name: string;
  match_id: number;
  match_label: string;
  venue: string;
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
  opponentConcededL5: number | null;
  stddev: number | null;
  min10: number | null;
  max10: number | null;
  // Smart Next-Up enrichment
  targetBadge: TargetBadge;
  targetRound: number;
  targetOpponent: string;       // display opponent (may be next-up)
  targetGameDate: string | null;
  targetMatchLabel: string;     // display label
  isNextUp: boolean;
}

// ─── Post template ────────────────────────────────────────────────────────────

interface PostTemplate {
  id: string;
  format: PostFormat;
  category: string;
  angleTag: string;
  title: string;
  hook: string;
  bullets: string[];
  cta: string;
  sourceCount: number;
  matchIds: number[];
  teamNames: string[];
  targetRoundLabel: string; // e.g. "Round 10 next-up angle" or "Round 9 still-to-play"
  hasNextUpPlayers: boolean;
  hasCurrentRoundPlayers: boolean;
}

// ─── Loaded data bundle ───────────────────────────────────────────────────────

interface CIData {
  roundInfo: RoundInfo | null;
  currentRound: number;
  roundLabel: string;
  matches: StatBoardMatch[];
  disposalPlayers: StatBoardPlayer[];
  goalPlayers: StatBoardPlayer[];
  teamDisposals: StatBoardTeamRow[];
  teamGoals: StatBoardTeamRow[];
  teamScore: StatBoardTeamRow[];
  teamTargets: TeamTarget[];        // Smart Next-Up resolution per team
  loadedAt: Date;
  roundSource: "canonical" | "fallback";
  targetRounds: number[];           // distinct rounds represented in targets
  teamsNextUp: number;              // count of teams in next-up mode
  teamsCurrentRound: number;        // count of teams in current-round mode
  latestPlayerStatAt: string | null;
  latestTeamStatAt: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true }).toLowerCase();
}

function fmtAgeMin(from: Date): string {
  const m = Math.floor((Date.now() - from.getTime()) / 60000);
  return m < 1 ? "just now" : m === 1 ? "1 min ago" : `${m} mins ago`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

function toFrac(rate: number): number {
  return rate > 1 ? rate / 100 : rate;
}

function pct(rate: number): number {
  return Math.round(toFrac(rate) * 100);
}

function isCompletedStatus(status: string | null | undefined): boolean {
  return FT_STATUSES.has((status ?? "").toUpperCase());
}

// Get team target from the targets list
function getTeamTarget(teamTargets: TeamTarget[], teamId: number): TeamTarget | null {
  return teamTargets.find(t => t.team_id === teamId) ?? null;
}

// Determine what the target game is for a team given a content mode
function resolveTarget(
  tt: TeamTarget | null,
  mode: ContentMode,
): {
  round: number;
  opponent: string;
  gameDate: string | null;
  matchLabel: string;
  badge: TargetBadge;
  isNextUp: boolean;
} {
  if (!tt) {
    return { round: 0, opponent: "Unknown", gameDate: null, matchLabel: "—", badge: "bye", isNextUp: false };
  }

  const useNext = (() => {
    switch (mode) {
      case "smart-next-up":     return tt.has_played_current_round;
      case "current-round":     return false;
      case "next-round":        return true;
      case "played-this-round": return tt.has_played_current_round;
      case "not-yet-played":    return false;
    }
  })();

  if (useNext) {
    if (!tt.next_game_id) {
      return {
        round: tt.current_round,
        opponent: tt.current_opponent_name ?? "Unknown",
        gameDate: tt.current_game_date,
        matchLabel: "No next fixture",
        badge: "no-fixture",
        isNextUp: false,
      };
    }
    const badge: TargetBadge = "next-up";
    return {
      round: tt.next_game_round ?? tt.current_round + 1,
      opponent: tt.next_opponent_name ?? "Unknown",
      gameDate: tt.next_game_date,
      matchLabel: `R${tt.next_game_round} vs ${tt.next_opponent_name ?? "?"}`,
      badge,
      isNextUp: true,
    };
  } else {
    const badge: TargetBadge = tt.has_played_current_round ? "played-updated" : "current-round";
    return {
      round: tt.current_round,
      opponent: tt.current_opponent_name ?? "Unknown",
      gameDate: tt.current_game_date,
      matchLabel: tt.current_game_id
        ? `R${tt.current_round} vs ${tt.current_opponent_name ?? "?"}`
        : "No game this round",
      badge: tt.current_game_id ? badge : "bye",
      isNextUp: false,
    };
  }
}

// Build target badge display
const TARGET_BADGE_META: Record<TargetBadge, { label: string; cls: string }> = {
  "current-round":  { label: "Current Round", cls: "bg-zinc-800 text-zinc-300 border-zinc-600" },
  "next-up":        { label: "Next-Up",       cls: "bg-emerald-950/70 text-emerald-300 border-emerald-600/40" },
  "played-updated": { label: "Played",        cls: "bg-sky-950/70 text-sky-300 border-sky-600/40" },
  "waiting-stats":  { label: "Waiting Stats", cls: "bg-amber-950/70 text-amber-300 border-amber-600/40" },
  "bye":            { label: "Bye",           cls: "bg-zinc-900 text-zinc-600 border-zinc-700" },
  "no-fixture":     { label: "No Fixture",   cls: "bg-zinc-900 text-zinc-600 border-zinc-700" },
};

// Extract hit data for a stat family + threshold
function hitData(
  player: StatBoardPlayer,
  _family: StatFamily,
  threshold: number,
): { hits: number; games: number; rate: number } | null {
  const rates = player.all_threshold_hit_rates;
  if (!rates) return null;
  const key = String(threshold);
  const entry = rates[key] as ThresholdHitRate | undefined;
  if (!entry || entry.games === 0) return null;
  return { hits: entry.hits, games: entry.games, rate: entry.rate };
}

function playerAvgs(p: StatBoardPlayer) {
  return { l3: p.last_3_avg, l5: p.last_5_avg, l10: p.last_10_avg, season: p.season_avg };
}

function classifyBucket(
  hits: number, games: number, rate: number,
  projection: number | null, threshold: number,
  opponentConceded: number | null,
  stddev: number | null, l10avg: number | null,
): GroupBucket {
  const frac = toFrac(rate);
  const misses = games - hits;
  if (frac >= 1.0 && games >= 3) return "elite-perfect";
  if (misses === 1 && games >= 3) return "missed-once";
  if (misses === 2 && games >= 3) return "missed-twice";
  if (frac < 0.40 && games >= 4) return "fade";
  const volatile_ = stddev != null && l10avg != null && l10avg > 0 && stddev > l10avg * 0.4;
  if (volatile_ && frac >= 0.5) return "volatile";
  if (projection != null && projection > threshold * 1.15 && frac >= 0.6) return "projection-supported";
  if (opponentConceded != null && opponentConceded > threshold * 10 && frac >= 0.55) return "matchup-supported";
  return "strong-70";
}

function buildReason(
  _player_name: string, threshold: number, familyLabel: string,
  hits: number, games: number, l10avg: number | null,
  projection: number | null, opponent: string, bucket: GroupBucket,
): string {
  const p = Math.round((hits / Math.max(games, 1)) * 100);
  const avgStr = l10avg != null ? `, L10 avg ${l10avg.toFixed(1)}` : "";
  const projStr = projection != null ? `, projected ${projection.toFixed(0)}` : "";
  if (bucket === "elite-perfect")        return `${hits}/${games} over ${threshold}+ ${familyLabel} (perfect${avgStr}). Targeting ${opponent}.`;
  if (bucket === "missed-once")          return `${hits}/${games} over ${threshold}+ ${familyLabel} — missed once${avgStr}${projStr}. Targeting ${opponent}.`;
  if (bucket === "missed-twice")         return `${hits}/${games} over ${threshold}+ ${familyLabel} — missed twice${avgStr}${projStr}. Targeting ${opponent}.`;
  if (bucket === "fade")                 return `${hits}/${games} over ${threshold}+ ${familyLabel} (${p}%${avgStr}${projStr}). Private market-check fade angle vs ${opponent}.`;
  if (bucket === "projection-supported") return `${hits}/${games} over ${threshold}+ ${familyLabel}${projStr}. Projection supports this line vs ${opponent}.`;
  if (bucket === "matchup-supported")    return `${hits}/${games} over ${threshold}+ ${familyLabel}. ${opponent} concession profile supports this.`;
  return `${hits}/${games} over ${threshold}+ ${familyLabel} (${p}%${avgStr}${projStr}). Targeting ${opponent}.`;
}

function filterByProfile(row: ResearchRow, profile: HitProfile): boolean {
  const frac = toFrac(row.rate);
  const misses = row.games - row.hits;
  switch (profile) {
    case "all":                  return true;
    case "perfect":              return misses === 0 && row.games >= 3;
    case "missed-once":          return misses === 1;
    case "missed-twice":         return misses === 2;
    case "at-least-80":          return frac >= 0.80;
    case "at-least-70":          return frac >= 0.70;
    case "at-least-60":          return frac >= 0.60;
    case "fade":                 return frac < 0.40 && row.games >= 4;
    case "volatile":             return row.bucket === "volatile";
    case "projection-supported": return row.bucket === "projection-supported";
    case "matchup-supported":    return row.bucket === "matchup-supported";
    default:                     return true;
  }
}

function sortRows(rows: ResearchRow[], by: SortBy): ResearchRow[] {
  return [...rows].sort((a, b) => {
    switch (by) {
      case "hitrate":    return toFrac(b.rate) - toFrac(a.rate);
      case "hits":       return b.hits - a.hits;
      case "misses":     return (a.games - a.hits) - (b.games - b.hits);
      case "l5avg":      return (b.l5avg ?? 0) - (a.l5avg ?? 0);
      case "l10avg":     return (b.l10avg ?? 0) - (a.l10avg ?? 0);
      case "seasonavg":  return (b.seasonAvg ?? 0) - (a.seasonAvg ?? 0);
      case "projection": return (b.projection ?? 0) - (a.projection ?? 0);
      case "diff":       return ((b.l10avg ?? 0) - b.threshold) - ((a.l10avg ?? 0) - a.threshold);
      case "confidence": {
        const r = (c: string | null) => c === "HIGH" ? 3 : c === "MEDIUM" ? 2 : 1;
        return r(b.confidence_label) - r(a.confidence_label);
      }
      case "sample":     return b.games - a.games;
      default:           return toFrac(b.rate) - toFrac(a.rate);
    }
  });
}

// Build research rows with Smart Next-Up target enrichment
function buildRows(
  players: StatBoardPlayer[],
  family: StatFamily,
  threshold: number,
  minSample: number,
  teamConcessionMap: Map<number, number>,
  teamTargets: TeamTarget[],
  mode: ContentMode,
): ResearchRow[] {
  const cfg = FAMILY_CFG.find(f => f.value === family)!;
  const rows: ResearchRow[] = [];

  for (const p of players) {
    const hd = hitData(p, family, threshold);
    if (!hd) continue;
    const { hits, games, rate } = hd;
    if (minSample > 0 && games < minSample) continue;

    const avgs = playerAvgs(p);
    const opponentConcededL5 = teamConcessionMap.get(p.opponent_team_id) ?? null;
    const bucket = classifyBucket(hits, games, rate, p.projection, threshold, opponentConcededL5, p.stddev_last_10, avgs.l10);

    // Smart Next-Up: resolve target for this player's team
    const tt = getTeamTarget(teamTargets, p.team_id);
    const target = resolveTarget(tt, mode);
    const displayOpponent = target.isNextUp ? target.opponent : p.opponent_team_name;

    const reason = buildReason(p.player_name, threshold, cfg.label, hits, games, avgs.l10, p.projection, displayOpponent, bucket);

    rows.push({
      player_id: p.player_id,
      player_name: p.player_name,
      team_id: p.team_id,
      team_name: p.team_name,
      opponent_team_name: p.opponent_team_name,
      match_id: p.match_id,
      match_label: p.match_label,
      venue: p.venue,
      position_group: p.position_group,
      statFamily: family,
      threshold,
      hits, games, rate,
      l3avg: avgs.l3,
      l5avg: avgs.l5,
      l10avg: avgs.l10,
      seasonAvg: avgs.season,
      projection: p.projection,
      confidence_label: p.confidence_label,
      bucket, reason,
      opponentConcededL5,
      stddev: p.stddev_last_10,
      min10: p.min_last_10,
      max10: p.max_last_10,
      targetBadge: target.badge,
      targetRound: target.round,
      targetOpponent: displayOpponent,
      targetGameDate: target.gameDate,
      targetMatchLabel: target.matchLabel,
      isNextUp: target.isNextUp,
    });
  }
  return rows;
}

// Apply mode filter: exclude teams who don't match the mode
function applyModeFilter(rows: ResearchRow[], mode: ContentMode): ResearchRow[] {
  switch (mode) {
    case "played-this-round": return rows.filter(r => r.targetBadge === "played-updated" || r.targetBadge === "next-up");
    case "not-yet-played":    return rows.filter(r => r.targetBadge === "current-round");
    default:                  return rows;
  }
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchCIData(): Promise<CIData> {
  // 1. Canonical round (unchanged public RPC)
  let roundInfo: RoundInfo | null = null;
  let currentRound = 0;
  let roundSource: CIData["roundSource"] = "canonical";

  const rRes = await supabase.rpc("get_current_afl_round_safe", { p_season: SEASON });
  if (!rRes.error && rRes.data?.length) {
    roundInfo = rRes.data[0] as RoundInfo;
    currentRound = roundInfo.current_round;
  }

  // 2. Admin Smart Next-Up targets
  const targetsRes = await supabase.rpc("admin_get_smart_next_up_targets", { p_season: SEASON });
  const teamTargets: TeamTarget[] = (targetsRes.data ?? []) as TeamTarget[];

  // 3. Matches for the current round
  const mRes = await supabase.rpc("get_stat_board_matches", { p_season: SEASON, p_round: currentRound || null });
  const matches: StatBoardMatch[] = mRes.data ?? [];

  if (currentRound === 0 && matches.length > 0) {
    currentRound = matches[0].week;
    roundSource = "fallback";
  }
  const roundLabel = currentRound > 0 ? `Round ${currentRound}` : "Current Round";

  // 4. All disposal-lens players (no match filter = all games this round)
  const dpRes = await supabase.rpc("get_stat_board_players", {
    p_season: SEASON, p_round: currentRound || null, p_match_id: null,
    p_lens: "disposals", p_threshold: 20, p_position_group: null,
    p_team_id: null, p_search: null, p_limit: 600, p_offset: 0,
  });
  const disposalPlayers: StatBoardPlayer[] = dpRes.data ?? [];

  // 5. All goal-lens players
  const gpRes = await supabase.rpc("get_stat_board_players", {
    p_season: SEASON, p_round: currentRound || null, p_match_id: null,
    p_lens: "goals", p_threshold: 1, p_position_group: null,
    p_team_id: null, p_search: null, p_limit: 600, p_offset: 0,
  });
  const goalPlayers: StatBoardPlayer[] = gpRes.data ?? [];

  // 6. Team concession rows
  const [tdRes, tgRes, tsRes] = await Promise.all([
    supabase.rpc("get_stat_board_team_rows", { p_season: SEASON, p_round: currentRound || null, p_match_id: null, p_lens: "disposals" }),
    supabase.rpc("get_stat_board_team_rows", { p_season: SEASON, p_round: currentRound || null, p_match_id: null, p_lens: "goals" }),
    supabase.rpc("get_stat_board_team_rows", { p_season: SEASON, p_round: currentRound || null, p_match_id: null, p_lens: "score" }),
  ]);

  // Derive meta
  const targetRounds = [...new Set(teamTargets.map(t => t.has_played_current_round ? (t.next_game_round ?? currentRound) : t.current_round))].sort();
  const teamsNextUp = teamTargets.filter(t => t.has_played_current_round && t.next_game_id).length;
  const teamsCurrentRound = teamTargets.filter(t => !t.has_played_current_round).length;

  // Detect rough stat freshness from player update timestamps if available
  const latestPlayerStatAt = disposalPlayers.length > 0
    ? (disposalPlayers[0] as unknown as Record<string, unknown>)["updated_at"] as string ?? null
    : null;
  const latestTeamStatAt = (tdRes.data ?? []).length > 0
    ? ((tdRes.data ?? [])[0] as unknown as Record<string, unknown>)["updated_at"] as string ?? null
    : null;

  return {
    roundInfo, currentRound, roundLabel, matches,
    disposalPlayers, goalPlayers,
    teamDisposals: tdRes.data ?? [],
    teamGoals: tgRes.data ?? [],
    teamScore: tsRes.data ?? [],
    teamTargets,
    loadedAt: new Date(),
    roundSource,
    targetRounds,
    teamsNextUp,
    teamsCurrentRound,
    latestPlayerStatAt,
    latestTeamStatAt,
  };
}

// ─── Post builder (Smart Next-Up aware) ──────────────────────────────────────

function buildPosts(
  data: CIData,
  concessionMap: Map<number, number>,
  mode: ContentMode,
): PostTemplate[] {
  const posts: PostTemplate[] = [];
  const rl = data.roundLabel;

  function makeTargetRoundLabel(rows: ResearchRow[]): string {
    const nextUp = rows.filter(r => r.isNextUp);
    const current = rows.filter(r => !r.isNextUp);
    if (nextUp.length > 0 && current.length === 0) return `Round ${nextUp[0].targetRound} next-up angle`;
    if (nextUp.length === 0 && current.length > 0) return `${rl} still-to-play angle`;
    if (nextUp.length > 0 && current.length > 0) return `Mixed current/next-up angle`;
    return `${rl} angle`;
  }

  function topRows(
    family: StatFamily, threshold: number,
    filterBucket?: GroupBucket | null,
    limit = 6,
  ): ResearchRow[] {
    const src = family === "goals" ? data.goalPlayers : data.disposalPlayers;
    const rows = applyModeFilter(
      buildRows(src, family, threshold, 3, concessionMap, data.teamTargets, mode),
      mode,
    );
    const filtered = filterBucket ? rows.filter(r => r.bucket === filterBucket) : rows.filter(r => r.bucket !== "fade");
    return sortRows(filtered, "hitrate").slice(0, limit);
  }

  function fadeRows(family: StatFamily, threshold: number, limit = 6): ResearchRow[] {
    const src = family === "goals" ? data.goalPlayers : data.disposalPlayers;
    const rows = applyModeFilter(
      buildRows(src, family, threshold, 3, concessionMap, data.teamTargets, mode),
      mode,
    );
    return sortRows(rows.filter(r => r.bucket === "fade"), "hitrate").slice(0, limit);
  }

  function makeBullets(rows: ResearchRow[], family: StatFamily, threshold: number): string[] {
    const cfg = FAMILY_CFG.find(f => f.value === family)!;
    return rows.map(r => {
      const target = r.isNextUp ? ` → R${r.targetRound} vs ${r.targetOpponent}` : ` vs ${r.targetOpponent}`;
      return `${r.player_name} (${r.team_name}${target}) — ${r.hits}/${r.games} over ${threshold}+ ${cfg.label}, L5 avg ${r.l5avg?.toFixed(1) ?? "N/A"}`;
    });
  }

  function makePost(
    id: string, format: PostFormat, category: string, angleTag: string,
    title: string, hook: string, rows: ResearchRow[], family: StatFamily, threshold: number,
  ): PostTemplate {
    return {
      id, format, category, angleTag, title, hook,
      bullets: makeBullets(rows, family, threshold),
      cta: "Check the full stat board at Neeko Sports Stats.",
      sourceCount: rows.length,
      matchIds: [...new Set(rows.map(r => r.match_id))],
      teamNames: [...new Set(rows.map(r => r.team_name))],
      targetRoundLabel: makeTargetRoundLabel(rows),
      hasNextUpPlayers: rows.some(r => r.isNextUp),
      hasCurrentRoundPlayers: rows.some(r => !r.isNextUp),
    };
  }

  // Disposal trends
  const dispThresholds: [number, string][] = [
    [10, "10+ Disposals"], [15, "15+ Disposals"], [20, "20+ Disposals"],
    [25, "25+ Disposals"], [30, "30+ Disposals"], [35, "35+ Disposals (Upside)"],
  ];
  for (const [t, cat] of dispThresholds) {
    const rows = topRows("disposals", t, null, 6);
    if (rows.length === 0) continue;
    posts.push(makePost(`disp-${t}-tiktok`, "tiktok", cat, "Disposal Trend",
      `AFL: Players with strong ${t}+ disposal trends`,
      `These players have been consistently clearing ${t}+ disposals in recent games.`,
      rows, "disposals", t));
    posts.push(makePost(`disp-${t}-instagram`, "instagram", cat, "Disposal Trend",
      `${t}+ disposal stat trends`, `Disposal trends — players worth tracking.`, rows, "disposals", t));
    if (t >= 20) {
      posts.push(makePost(`disp-${t}-reddit`, "reddit", cat, "Disposal Trend",
        `${t}+ disposal stat angles — research shortlist`,
        `Based on recent form data here are players consistently hitting ${t}+ disposals.`,
        rows, "disposals", t));
    }
  }

  // Goal trends
  for (const [t, cat] of [[1, "1+ Goals"], [2, "2+ Goals"], [3, "3+ Goals"]] as [number, string][]) {
    const rows = topRows("goals", t, null, 6);
    if (rows.length === 0) continue;
    posts.push(makePost(`goal-${t}-tiktok`, "tiktok", cat, "Goal Trend",
      `AFL: Players with strong ${t}+ goal trends`,
      `Goal-scoring form data — players hitting ${t}+ goals consistently.`, rows, "goals", t));
    posts.push(makePost(`goal-${t}-twitter`, "twitter", cat, "Goal Trend",
      `${t}+ goal stat trends`, `Players with strong ${t}+ goal records recently.`, rows, "goals", t));
  }

  // Tackle trends
  const tackleRows = topRows("tackles", 5, null, 6);
  if (tackleRows.length > 0) {
    posts.push(makePost("tackle-5-tiktok", "tiktok", "Tackle Trends", "Tackle Trend",
      `AFL: 5+ tackle trend players`, `Tackle machine players — consistent tacklers.`, tackleRows, "tackles", 5));
    posts.push(makePost("tackle-5-caption", "caption", "Tackle Trends", "Tackle Trend",
      `5+ tackle watchlist`, `Short-form tackle watchlist.`, tackleRows.slice(0, 4), "tackles", 5));
  }

  // Mark trends
  const markRows = topRows("marks", 5, null, 6);
  if (markRows.length > 0) {
    posts.push(makePost("marks-5-instagram", "instagram", "Mark Trends", "Mark Trend",
      `AFL: 5+ marks stat trend players`, `Marking forwards and mids with strong recent records.`, markRows, "marks", 5));
  }

  // Kick trends
  const kickRows = topRows("kicks", 15, null, 6);
  if (kickRows.length > 0) {
    posts.push(makePost("kicks-15-twitter", "twitter", "Kick Trends", "Kick Trend",
      `15+ kicks stat trends`, `Players regularly finding the ball by foot this season.`, kickRows, "kicks", 15));
  }

  // Clearance trends
  const clearRows = topRows("clearances", 5, null, 6);
  if (clearRows.length > 0) {
    posts.push(makePost("clear-5-caption", "caption", "Clearance Trends", "Clearance Trend",
      `5+ clearance watchlist`, `Contested midfielders clearing 5+ regularly.`, clearRows, "clearances", 5));
  }

  // Hitout trends
  const hitoutRows = topRows("hitouts", 20, null, 6);
  if (hitoutRows.length > 0) {
    posts.push(makePost("hitout-20-tiktok", "tiktok", "Hitout Trends", "Hitout Trend",
      `AFL: 20+ hitout stat trends`, `Rucks dominating the hitout count.`, hitoutRows, "hitouts", 20));
  }

  // Handball trends
  const hbRows = topRows("handballs", 15, null, 6);
  if (hbRows.length > 0) {
    posts.push(makePost("handball-15-twitter", "twitter", "Handball Trends", "Handball Trend",
      `15+ handball stat trends`, `High-touch players distributing by hand this round.`, hbRows, "handballs", 15));
  }

  // Perfect hitters
  for (const [family, threshold] of [["disposals", 20], ["goals", 1], ["disposals", 15]] as [StatFamily, number][]) {
    const perfRows = topRows(family, threshold, "elite-perfect", 6);
    if (perfRows.length === 0) continue;
    const cfg = FAMILY_CFG.find(f => f.value === family)!;
    posts.push(makePost(`perfect-${family}-${threshold}-reddit`, "reddit", "Perfect Hitters", "Elite Trend",
      `Players with perfect ${threshold}+ ${cfg.label} records`,
      `No misses in their recent sample — the most reliable stat trends.`, perfRows, family, threshold));
    posts.push(makePost(`perfect-${family}-${threshold}-instagram`, "instagram", "Perfect Hitters", "Elite Trend",
      `Flawless ${threshold}+ ${cfg.label} trends`,
      `These players haven't missed this stat line once in their recent sample.`, perfRows, family, threshold));
  }

  // Missed-once angles
  const missedOnce20 = topRows("disposals", 20, "missed-once", 6);
  if (missedOnce20.length > 0) {
    posts.push(makePost("missed-once-20-tiktok", "tiktok", "Missed Once", "Missed Once",
      `AFL: Players who've only missed 20+ disposals once`,
      `Near-perfect disposal records — missed the 20+ line just once in their recent sample.`,
      missedOnce20, "disposals", 20));
    posts.push(makePost("missed-once-20-twitter", "twitter", "Missed Once", "Missed Once",
      `20+ disposal near-misses worth reviewing`,
      `Strong disposal records with a single blip. Still solid trend research.`,
      missedOnce20, "disposals", 20));
  }
  const missedOnce15 = topRows("disposals", 15, "missed-once", 6);
  if (missedOnce15.length > 0) {
    posts.push(makePost("missed-once-15-caption", "caption", "Missed Once", "Missed Once",
      `15+ disposal missed-once shortlist`,
      `These players have barely missed the 15-disposal mark.`, missedOnce15, "disposals", 15));
  }
  const missedOnceGoal = topRows("goals", 1, "missed-once", 6);
  if (missedOnceGoal.length > 0) {
    posts.push(makePost("missed-once-goals-instagram", "instagram", "Missed Once", "Missed Once",
      `Near-perfect goal scorers — missed once`,
      `Goal-scoring reliability research — players who barely missed.`, missedOnceGoal, "goals", 1));
  }

  // Missed-twice
  const missedTwice20 = topRows("disposals", 20, "missed-twice", 6);
  if (missedTwice20.length > 0) {
    posts.push(makePost("missed-twice-20-caption", "caption", "Missed Twice", "Missed Twice",
      `Players who've missed 20+ disposals twice — still strong overall`,
      `Two misses in the sample but still positive trend overall.`, missedTwice20, "disposals", 20));
  }

  // Fade angles
  for (const [family, threshold] of [["disposals", 20], ["disposals", 25], ["goals", 2]] as [StatFamily, number][]) {
    const fRows = fadeRows(family, threshold, 5);
    if (fRows.length === 0) continue;
    const cfg = FAMILY_CFG.find(f => f.value === family)!;
    posts.push(makePost(`fade-${family}-${threshold}-twitter`, "twitter", "Fade Angles", "Fade",
      `Players frequently missing ${threshold}+ ${cfg.label}`,
      `Low hit-rate research shortlist — private market-check fade angles. Worth reviewing carefully.`,
      fRows, family, threshold));
    posts.push(makePost(`fade-${family}-${threshold}-reddit`, "reddit", "Fade Angles", "Fade",
      `${threshold}+ ${cfg.label} fade watchlist`,
      `Players who have regularly fallen below ${threshold}+ ${cfg.label} in recent games.`,
      fRows, family, threshold));
  }

  // Volatile upside
  const allDispRows = buildRows(data.disposalPlayers, "disposals", 20, 3, concessionMap, data.teamTargets, mode);
  const modeFilteredDisp = applyModeFilter(allDispRows, mode);
  const volatileDisp = sortRows(modeFilteredDisp.filter(r => r.bucket === "volatile"), "l10avg").slice(0, 6);
  if (volatileDisp.length > 0) {
    posts.push(makePost("volatile-disp-tiktok", "tiktok", "Volatile Upside", "Volatile",
      `AFL: High-ceiling but inconsistent disposal players`,
      `These players have big upside but volatile output — worth watching but treat with caution.`,
      volatileDisp, "disposals", 20));
  }

  // Matchup-supported
  const matchupDisp = topRows("disposals", 20, "matchup-supported", 6);
  if (matchupDisp.length > 0) {
    posts.push(makePost("matchup-disp-instagram", "instagram", "Matchup-Supported", "Matchup",
      `AFL: Matchup-supported disposal angles`,
      `Players whose opponent concession profile supports this disposal line.`, matchupDisp, "disposals", 20));
  }

  // Projection-supported
  const projDisp = topRows("disposals", 20, "projection-supported", 6);
  if (projDisp.length > 0) {
    posts.push(makePost("proj-disp-caption", "caption", "Projection-Supported", "Projection",
      `Projection-supported 20+ disposal angles`,
      `Players whose projection sits above the disposal line with a solid hit rate.`, projDisp, "disposals", 20));
  }

  // Per-position
  for (const pos of ["MID", "DEF", "FWD", "RUC"] as const) {
    const posLabel = pos === "MID" ? "Midfielder" : pos === "DEF" ? "Defender" : pos === "FWD" ? "Forward" : "Ruck";
    const posRows = sortRows(
      modeFilteredDisp.filter(r => r.position_group === pos && r.bucket !== "fade" && r.threshold === 20),
      "hitrate",
    ).slice(0, 5);
    if (posRows.length === 0) continue;
    posts.push(makePost(`pos-${pos}-20-caption`, "caption", `${posLabel} Trends`, "Position",
      `AFL: ${posLabel} 20+ disposal stat trends`,
      `${posLabel}s hitting 20+ disposals consistently.`, posRows, "disposals", 20));
  }

  // Under-the-radar (non-MID)
  const radarRows = sortRows(
    modeFilteredDisp.filter(r => r.position_group !== "MID" && r.threshold === 20 && (r.bucket === "elite-perfect" || r.bucket === "missed-once")),
    "hitrate",
  ).slice(0, 6);
  if (radarRows.length > 0) {
    posts.push(makePost("radar-tiktok", "tiktok", "Under the Radar", "Quiet Consistency",
      `AFL: Under-the-radar players with strong disposal trends`,
      `Non-midfielders with standout disposal consistency. Often overlooked.`, radarRows, "disposals", 20));
    posts.push(makePost("radar-reddit", "reddit", "Under the Radar", "Quiet Consistency",
      `Under-the-radar disposal trend players`,
      `These non-midfielders are quietly hitting 20+ disposals with a strong recent record.`, radarRows, "disposals", 20));
  }

  // High-sample
  const highSampleRows = sortRows(
    applyModeFilter(buildRows(data.disposalPlayers, "disposals", 20, 8, concessionMap, data.teamTargets, mode), mode)
      .filter(r => r.bucket !== "fade"),
    "hitrate",
  ).slice(0, 6);
  if (highSampleRows.length > 0) {
    posts.push(makePost("high-sample-instagram", "instagram", "High-Sample Reliability", "Reliable",
      `AFL: 20+ disposal trends — 8+ game sample reliability`,
      `Long-sample reliability check. These players have at least 8 data points.`, highSampleRows, "disposals", 20));
  }

  // Round snapshot
  const roundSnap = sortRows(
    applyModeFilter(buildRows(data.disposalPlayers, "disposals", 15, 3, concessionMap, data.teamTargets, mode), mode)
      .filter(r => r.bucket === "elite-perfect" || r.bucket === "missed-once"),
    "hitrate",
  ).slice(0, 8);
  if (roundSnap.length > 0) {
    posts.push(makePost("round-snap-tiktok", "tiktok", "Round Snapshot", "Snapshot",
      `AFL: Best disposal stat trends across all target games`,
      `Full snapshot of the strongest 15+ disposal records. All teams covered.`, roundSnap, "disposals", 15));
    posts.push(makePost("round-snap-reddit", "reddit", "Round Snapshot", "Snapshot",
      `Full-round stat trend snapshot`,
      `Best stat trends across all target games. All teams. All matches.`, roundSnap, "disposals", 15));
  }

  // Next-up only snapshot (when in smart mode)
  if (mode === "smart-next-up" || mode === "next-round") {
    const nextUpSnap = sortRows(
      modeFilteredDisp.filter(r => r.isNextUp && r.bucket !== "fade"),
      "hitrate",
    ).slice(0, 8);
    if (nextUpSnap.length > 0) {
      posts.push(makePost("next-up-snap-tiktok", "tiktok", "Next-Up Snapshot", "Next-Up",
        `AFL: Next-up game stat angles — teams already played`,
        `Players from teams who've completed their current game. Preparing for next week.`,
        nextUpSnap, "disposals", 15));
    }
  }

  // By match
  const matchGroups = new Map<number, ResearchRow[]>();
  for (const row of modeFilteredDisp.filter(r => r.bucket !== "fade")) {
    if (!matchGroups.has(row.match_id)) matchGroups.set(row.match_id, []);
    matchGroups.get(row.match_id)!.push(row);
  }
  for (const [matchId, mRows] of matchGroups) {
    const topMatch = sortRows(mRows, "hitrate").slice(0, 5);
    const match = data.matches.find(m => m.match_id === matchId);
    if (!match || topMatch.length < 2) continue;
    const trl = makeTargetRoundLabel(topMatch);
    posts.push({
      id: `match-${matchId}-top5`,
      format: "instagram",
      category: "By Match",
      angleTag: "Same-Game",
      title: `${match.match_label}: Top 20+ disposal stat angles`,
      hook: `Best 20+ disposal research angles for ${match.match_label}.`,
      bullets: makeBullets(topMatch, "disposals", 20),
      cta: "Full stat board at Neeko Sports Stats.",
      sourceCount: topMatch.length,
      matchIds: [matchId],
      teamNames: [...new Set(topMatch.map(r => r.team_name))],
      targetRoundLabel: trl,
      hasNextUpPlayers: topMatch.some(r => r.isNextUp),
      hasCurrentRoundPlayers: topMatch.some(r => !r.isNextUp),
    });
  }

  // Cross-game safest disposal shortlist
  const crossDisp = sortRows(
    applyModeFilter(buildRows(data.disposalPlayers, "disposals", 15, 5, concessionMap, data.teamTargets, mode), mode)
      .filter(r => r.bucket === "elite-perfect" || r.bucket === "missed-once"),
    "hitrate",
  ).slice(0, 6);
  if (crossDisp.length > 0 && new Set(crossDisp.map(r => r.match_id)).size >= 2) {
    const trl = makeTargetRoundLabel(crossDisp);
    posts.push({
      id: "cross-disp-shortlist-reddit",
      format: "reddit",
      category: "Cross-Game Shortlist",
      angleTag: "Cross-Game",
      title: `Cross-game 15+ disposal research shortlist`,
      hook: `Players from different games with the strongest 15+ disposal records. Research shortlist only.`,
      bullets: makeBullets(crossDisp, "disposals", 15),
      cta: "Full research at Neeko Sports Stats.",
      sourceCount: crossDisp.length,
      matchIds: [...new Set(crossDisp.map(r => r.match_id))],
      teamNames: [...new Set(crossDisp.map(r => r.team_name))],
      targetRoundLabel: trl,
      hasNextUpPlayers: crossDisp.some(r => r.isNextUp),
      hasCurrentRoundPlayers: crossDisp.some(r => !r.isNextUp),
    });
  }

  // Cross-game goal shortlist
  const crossGoal = sortRows(
    applyModeFilter(buildRows(data.goalPlayers, "goals", 1, 5, concessionMap, data.teamTargets, mode), mode)
      .filter(r => r.bucket === "elite-perfect" || r.bucket === "missed-once"),
    "hitrate",
  ).slice(0, 6);
  if (crossGoal.length > 0 && new Set(crossGoal.map(r => r.match_id)).size >= 2) {
    const trl = makeTargetRoundLabel(crossGoal);
    posts.push({
      id: "cross-goal-shortlist",
      format: "reddit",
      category: "Cross-Game Shortlist",
      angleTag: "Cross-Game",
      title: `Cross-game 1+ goal research shortlist`,
      hook: `Goal-scoring trends across different games. Research shortlist.`,
      bullets: makeBullets(crossGoal, "goals", 1),
      cta: "Full stat board at Neeko Sports Stats.",
      sourceCount: crossGoal.length,
      matchIds: [...new Set(crossGoal.map(r => r.match_id))],
      teamNames: [...new Set(crossGoal.map(r => r.team_name))],
      targetRoundLabel: trl,
      hasNextUpPlayers: crossGoal.some(r => r.isNextUp),
      hasCurrentRoundPlayers: crossGoal.some(r => !r.isNextUp),
    });
  }

  // Mixed cross-game
  const mixedDisp2 = sortRows(modeFilteredDisp.filter(r => r.bucket === "elite-perfect" && r.threshold === 20), "hitrate").slice(0, 3);
  const allGoalRows = buildRows(data.goalPlayers, "goals", 1, 5, concessionMap, data.teamTargets, mode);
  const mixedGoal2 = sortRows(applyModeFilter(allGoalRows, mode).filter(r => r.bucket === "elite-perfect"), "hitrate").slice(0, 3);
  if (mixedDisp2.length >= 2 && mixedGoal2.length >= 2) {
    const allMixed = [...mixedDisp2, ...mixedGoal2];
    const trl = makeTargetRoundLabel(allMixed);
    posts.push({
      id: "mixed-shortlist-reddit",
      format: "reddit",
      category: "Cross-Game Shortlist",
      angleTag: "Cross-Game",
      title: `Mixed stat cross-game research shortlist`,
      hook: `Disposals and goals trends — private research shortlist.`,
      bullets: [...makeBullets(mixedDisp2, "disposals", 20), ...makeBullets(mixedGoal2, "goals", 1)],
      cta: "Full research at Neeko Sports Stats.",
      sourceCount: allMixed.length,
      matchIds: [...new Set(allMixed.map(r => r.match_id))],
      teamNames: [...new Set(allMixed.map(r => r.team_name))],
      targetRoundLabel: trl,
      hasNextUpPlayers: allMixed.some(r => r.isNextUp),
      hasCurrentRoundPlayers: allMixed.some(r => !r.isNextUp),
    });
  }

  // Team concession post
  const topConcession = [...data.teamDisposals]
    .filter(t => t.opponent_conceded_l5 != null)
    .sort((a, b) => (b.opponent_conceded_l5 ?? 0) - (a.opponent_conceded_l5 ?? 0))
    .slice(0, 6);
  if (topConcession.length > 0) {
    posts.push({
      id: "team-concession-disposals",
      format: "tiktok",
      category: "Team Concession",
      angleTag: "Concession",
      title: `AFL: Teams conceding the most disposals`,
      hook: `Teams giving up the most disposal production to their opponents — worth targeting.`,
      bullets: topConcession.map(t => `${t.opponent_team_name} vs ${t.team_name} — conceding avg ${t.opponent_conceded_l5?.toFixed(1)} disposals L5`),
      cta: "Full analysis at Neeko Sports Stats.",
      sourceCount: topConcession.length,
      matchIds: [...new Set(topConcession.map(t => t.match_id))],
      teamNames: [...new Set(topConcession.map(t => t.team_name))],
      targetRoundLabel: `${rl} concession data`,
      hasNextUpPlayers: false,
      hasCurrentRoundPlayers: true,
    });
  }

  // Quiet consistency
  posts.push({
    id: "quiet-consistency",
    format: "instagram",
    category: "Quiet Consistency",
    angleTag: "Quiet",
    title: `AFL: Quiet consistency — players flying under the radar`,
    hook: `Strong stat records without the highlight reel. The stats don't lie.`,
    bullets: radarRows.length > 0
      ? radarRows.map(r => `${r.player_name} (${r.team_name}) — ${r.hits}/${r.games} over 20+, avg ${r.l10avg?.toFixed(1) ?? "N/A"}`)
      : ["No data loaded for this round."],
    cta: "Full research at Neeko Sports Stats.",
    sourceCount: radarRows.length,
    matchIds: [...new Set(radarRows.map(r => r.match_id))],
    teamNames: [...new Set(radarRows.map(r => r.team_name))],
    targetRoundLabel: makeTargetRoundLabel(radarRows),
    hasNextUpPlayers: radarRows.some(r => r.isNextUp),
    hasCurrentRoundPlayers: radarRows.some(r => !r.isNextUp),
  });

  // Stat board discovery
  posts.push({
    id: "stat-board-discovery",
    format: "tiktok",
    category: "Stat Board Discovery",
    angleTag: "Discovery",
    title: `AFL: Stat board discoveries — what the numbers show`,
    hook: `Using the Neeko stat board to find stat research angles. Here's what stands out.`,
    bullets: [
      `${data.disposalPlayers.length} players loaded across ${data.matches.length} ${rl} games`,
      ...(mode === "smart-next-up" ? [`${data.teamsNextUp} teams in next-up mode, ${data.teamsCurrentRound} teams current-round`] : []),
      ...sortRows(modeFilteredDisp.filter(r => r.bucket === "elite-perfect" && r.threshold === 20), "hitrate")
        .slice(0, 4).map(r => {
          const tgt = r.isNextUp ? ` → R${r.targetRound} vs ${r.targetOpponent}` : ` vs ${r.targetOpponent}`;
          return `${r.player_name}: ${r.hits}/${r.games} over 20+ disposals${tgt}`;
        }),
    ],
    cta: "Full stat board at Neeko Sports Stats.",
    sourceCount: data.disposalPlayers.length,
    matchIds: [...new Set(data.matches.map(m => m.match_id))],
    teamNames: [],
    targetRoundLabel: makeTargetRoundLabel(modeFilteredDisp.slice(0, 5)),
    hasNextUpPlayers: modeFilteredDisp.some(r => r.isNextUp),
    hasCurrentRoundPlayers: modeFilteredDisp.some(r => !r.isNextUp),
  });

  return posts;
}

// ─── Small UI Components ──────────────────────────────────────────────────────

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
        active ? "bg-zinc-200 text-zinc-900 border-zinc-300" : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
      }`}
    >{label}</button>
  );
}

function Sel({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-[12px] text-zinc-200 focus:outline-none focus:border-zinc-500">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function BucketBadge({ bucket }: { bucket: GroupBucket }) {
  const m = BUCKET_META[bucket];
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border ${m.cls}`}>{m.label}</span>;
}

function TargetBadgeChip({ badge }: { badge: TargetBadge }) {
  const m = TARGET_BADGE_META[badge];
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border ${m.cls}`}>{m.label}</span>;
}

function ConfBadge({ label }: { label: string | null }) {
  if (!label) return null;
  const cls = label === "HIGH" ? "text-emerald-400" : label === "MEDIUM" ? "text-amber-400" : "text-zinc-500";
  return <span className={`text-[10px] font-medium ${cls}`}>{label}</span>;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-1 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 transition-colors">
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function SCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-[17px] font-semibold text-zinc-100 leading-tight">{value}</div>
      <div className="text-[10px] text-zinc-500 truncate mt-0.5">{sub}</div>
    </div>
  );
}

// ─── Content Mode Selector ────────────────────────────────────────────────────

function ContentModeSelector({ mode, onChange }: { mode: ContentMode; onChange: (m: ContentMode) => void }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <ArrowRight className="h-4 w-4 text-zinc-400" />
        <span className="text-[13px] font-semibold text-zinc-200">Content Mode</span>
        <span className="ml-auto text-[10px] text-zinc-600">Private admin — affects this page only</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {CONTENT_MODES.map(m => (
          <button key={m.value} onClick={() => onChange(m.value)}
            className={`text-left px-3 py-2.5 rounded-lg border text-[11px] transition-all ${
              mode === m.value
                ? "border-zinc-400 bg-zinc-800 text-zinc-100"
                : "border-zinc-800 bg-zinc-900/30 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
            }`}>
            <div className="font-semibold mb-0.5">{m.label}</div>
            <div className="text-[10px] opacity-70 leading-tight">{m.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Smart Next-Up Status Banner ──────────────────────────────────────────────

function NextUpBanner({ data, mode }: { data: CIData; mode: ContentMode }) {
  if (mode === "current-round") return null;

  const nextUpTeams = data.teamTargets.filter(t => t.has_played_current_round && t.next_game_id);
  const currentTeams = data.teamTargets.filter(t => !t.has_played_current_round && t.current_game_id);
  const noFixture = data.teamTargets.filter(t => t.has_played_current_round && !t.next_game_id);

  return (
    <div className="bg-emerald-950/30 border border-emerald-600/20 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <ArrowRight className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        <span className="text-[12px] font-semibold text-emerald-300">Smart Next-Up active</span>
        <span className="ml-auto text-[10px] text-zinc-500">Private admin tool only</span>
      </div>
      <div className="flex flex-wrap gap-3 text-[11px]">
        {mode !== "not-yet-played" && (
          <span className="text-emerald-300">
            <span className="font-semibold">{nextUpTeams.length}</span> teams next-up
            {nextUpTeams.length > 0 && <span className="text-emerald-500/70"> ({nextUpTeams.map(t => t.team_name.split(" ").pop()).join(", ")})</span>}
          </span>
        )}
        {mode !== "played-this-round" && (
          <span className="text-zinc-400">
            <span className="font-semibold text-zinc-300">{currentTeams.length}</span> teams still current-round
          </span>
        )}
        {noFixture.length > 0 && (
          <span className="text-amber-400">
            <span className="font-semibold">{noFixture.length}</span> teams with no next fixture
          </span>
        )}
      </div>
      {nextUpTeams.length > 0 && (
        <div className="text-[10px] text-zinc-500 border-t border-zinc-800/50 pt-1.5">
          Next-up games: {nextUpTeams.map(t => `${t.team_name} → R${t.next_game_round} vs ${t.next_opponent_name}`).join(" · ")}
        </div>
      )}
    </div>
  );
}

// ─── Player Stat Angles Tab ───────────────────────────────────────────────────

function PlayerStatAngles({
  data, concessionMap, mode,
}: { data: CIData; concessionMap: Map<number, number>; mode: ContentMode }) {
  const [family, setFamily] = useState<StatFamily>("disposals");
  const [threshold, setThreshold] = useState(20);
  const [profile, setProfile] = useState<HitProfile>("all");
  const [minSample, setMinSample] = useState<number>(3);
  const [sortBy, setSortBy] = useState<SortBy>("hitrate");
  const [matchFilter, setMatchFilter] = useState<number | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [oppFilter, setOppFilter] = useState<string>("");
  const [posFilter, setPosFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [targetFilter, setTargetFilter] = useState<"all" | "next-up" | "current-round">("all");

  const cfg = FAMILY_CFG.find(f => f.value === family)!;

  useEffect(() => {
    if (!cfg.thresholds.includes(threshold)) setThreshold(cfg.thresholds[Math.floor(cfg.thresholds.length / 2)]);
  }, [family]);

  const srcPlayers = family === "goals" ? data.goalPlayers : data.disposalPlayers;

  const matchFiltered = useMemo(() =>
    matchFilter == null ? srcPlayers : srcPlayers.filter(p => p.match_id === matchFilter),
    [srcPlayers, matchFilter]);

  const allRows = useMemo(() => {
    const raw = buildRows(matchFiltered, family, threshold, minSample, concessionMap, data.teamTargets, mode);
    return applyModeFilter(raw, mode);
  }, [matchFiltered, family, threshold, minSample, concessionMap, data.teamTargets, mode]);

  const filtered = useMemo(() => {
    let rows = allRows;
    if (teamFilter) rows = rows.filter(r => r.team_name === teamFilter);
    if (oppFilter) rows = rows.filter(r => r.targetOpponent === oppFilter || r.opponent_team_name === oppFilter);
    if (posFilter) rows = rows.filter(r => r.position_group === posFilter);
    if (targetFilter === "next-up") rows = rows.filter(r => r.isNextUp);
    if (targetFilter === "current-round") rows = rows.filter(r => !r.isNextUp);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r => r.player_name.toLowerCase().includes(q) || r.team_name.toLowerCase().includes(q));
    }
    rows = rows.filter(r => filterByProfile(r, profile));
    return sortRows(rows, sortBy);
  }, [allRows, teamFilter, oppFilter, posFilter, search, profile, sortBy, targetFilter]);

  const grouped = useMemo(() => {
    const g: Record<GroupBucket, ResearchRow[]> = {
      "elite-perfect": [], "missed-once": [], "missed-twice": [], "strong-70": [],
      "projection-supported": [], "matchup-supported": [], "volatile": [], "fade": [],
    };
    for (const r of filtered) g[r.bucket].push(r);
    return g;
  }, [filtered]);

  const teams = useMemo(() => [...new Set(allRows.map(p => p.team_name))].sort(), [allRows]);
  const opps = useMemo(() => [...new Set(allRows.map(p => p.targetOpponent))].sort(), [allRows]);

  const presets: { label: string; fam: StatFamily; thr: number; prof: HitProfile }[] = [
    { label: "10+ Disp",    fam: "disposals", thr: 10,  prof: "all" },
    { label: "15+ Disp",    fam: "disposals", thr: 15,  prof: "all" },
    { label: "20+ Disp",    fam: "disposals", thr: 20,  prof: "all" },
    { label: "25+ Disp",    fam: "disposals", thr: 25,  prof: "all" },
    { label: "30+ Disp",    fam: "disposals", thr: 30,  prof: "all" },
    { label: "1+ Goals",    fam: "goals",     thr: 1,   prof: "all" },
    { label: "2+ Goals",    fam: "goals",     thr: 2,   prof: "all" },
    { label: "5+ Tackles",  fam: "tackles",   thr: 5,   prof: "all" },
    { label: "5+ Marks",    fam: "marks",     thr: 5,   prof: "all" },
    { label: "Missed Once", fam: family,      thr: threshold, prof: "missed-once" },
    { label: "Fade Angles", fam: family,      thr: threshold, prof: "fade" },
    { label: "Perfect",     fam: family,      thr: threshold, prof: "perfect" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {presets.map(p => (
          <Chip key={`${p.fam}-${p.thr}-${p.prof}`} label={p.label}
            active={family === p.fam && threshold === p.thr && profile === p.prof}
            onClick={() => { setFamily(p.fam); setThreshold(p.thr); setProfile(p.prof); }} />
        ))}
        <button onClick={() => { setFamily("disposals"); setThreshold(20); setProfile("all"); setMinSample(3); setSortBy("hitrate"); setMatchFilter(null); setTeamFilter(""); setOppFilter(""); setPosFilter(""); setSearch(""); setTargetFilter("all"); }}
          className="px-2.5 py-1 rounded-full text-[11px] font-medium border bg-zinc-900 text-zinc-500 border-zinc-700 hover:border-zinc-500 transition-colors">
          Reset
        </button>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Sel label="Game" value={matchFilter == null ? "all" : String(matchFilter)}
            onChange={v => setMatchFilter(v === "all" ? null : Number(v))}
            options={[{ value: "all", label: "All Games" }, ...data.matches.map(m => ({ value: String(m.match_id), label: m.match_label }))]} />
          <Sel label="Team" value={teamFilter || "all"} onChange={v => setTeamFilter(v === "all" ? "" : v)}
            options={[{ value: "all", label: "All Teams" }, ...teams.map(t => ({ value: t, label: t }))]} />
          <Sel label="Target Opp" value={oppFilter || "all"} onChange={v => setOppFilter(v === "all" ? "" : v)}
            options={[{ value: "all", label: "All Opponents" }, ...opps.map(t => ({ value: t, label: t }))]} />
          <Sel label="Position" value={posFilter || "all"} onChange={v => setPosFilter(v === "all" ? "" : v)}
            options={[{ value: "all", label: "All" }, { value: "MID", label: "Mid" }, { value: "DEF", label: "Def" }, { value: "FWD", label: "Fwd" }, { value: "RUC", label: "Ruck" }]} />
          <Sel label="Target Mode" value={targetFilter}
            onChange={v => setTargetFilter(v as typeof targetFilter)}
            options={[{ value: "all", label: "All" }, { value: "next-up", label: "Next-Up only" }, { value: "current-round", label: "Current Round only" }]} />
          <Sel label="Stat Family" value={family} onChange={v => setFamily(v as StatFamily)} options={FAMILY_CFG.map(f => ({ value: f.value, label: f.label }))} />
          <Sel label="Threshold" value={String(threshold)} onChange={v => setThreshold(Number(v))} options={cfg.thresholds.map(t => ({ value: String(t), label: `${t}+` }))} />
          <Sel label="Hit Profile" value={profile} onChange={v => setProfile(v as HitProfile)} options={HIT_PROFILES} />
          <Sel label="Min Games" value={String(minSample)} onChange={v => setMinSample(Number(v))}
            options={[{ value: "0", label: "Any" }, { value: "3", label: "3+" }, { value: "5", label: "5+" }, { value: "8", label: "8+" }]} />
          <Sel label="Sort By" value={sortBy} onChange={v => setSortBy(v as SortBy)} options={SORT_OPTIONS} />
        </div>
        <div className="flex items-center gap-2 border-t border-zinc-800 pt-2">
          <Search className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search player or team…"
            className="flex-1 bg-transparent text-[12px] text-zinc-300 placeholder-zinc-600 focus:outline-none" />
          {search && <button onClick={() => setSearch("")}><X className="h-3 w-3 text-zinc-500" /></button>}
        </div>
      </div>

      <div className="text-[11px] text-zinc-500">
        <span className="text-zinc-300 font-medium">{filtered.length}</span> players with {threshold}+ {cfg.label}
        {" — "}{filtered.filter(r => r.isNextUp).length} next-up, {filtered.filter(r => !r.isNextUp).length} current-round
      </div>

      {filtered.length === 0 && (
        <div className="py-10 text-center text-zinc-500 text-sm border border-zinc-800 rounded-lg">
          No players match the current filters.
          {profile === "perfect" && <div className="mt-1 text-[11px]">Try 'All profiles' to see near-miss players.</div>}
        </div>
      )}

      {BUCKET_ORDER.map(bucket => {
        const rows = grouped[bucket];
        if (rows.length === 0) return null;
        return (
          <div key={bucket} className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-[12px] font-semibold text-zinc-300">{BUCKET_META[bucket].label}</h3>
              <span className="text-[10px] text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded">{rows.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 font-medium">
                    <th className="text-left py-1.5 px-2">Player</th>
                    <th className="text-left py-1.5 px-2">Team</th>
                    <th className="text-left py-1.5 px-2">Target Opp</th>
                    <th className="text-left py-1.5 px-2">Target Game</th>
                    <th className="text-left py-1.5 px-2">Mode</th>
                    <th className="text-left py-1.5 px-2">Pos</th>
                    <th className="text-right py-1.5 px-2">Record</th>
                    <th className="text-right py-1.5 px-2">Rate</th>
                    <th className="text-right py-1.5 px-2">Miss</th>
                    <th className="text-right py-1.5 px-2">L3</th>
                    <th className="text-right py-1.5 px-2">L5</th>
                    <th className="text-right py-1.5 px-2">L10</th>
                    <th className="text-right py-1.5 px-2">Ssn</th>
                    <th className="text-right py-1.5 px-2">Proj</th>
                    <th className="text-right py-1.5 px-2">Δ</th>
                    <th className="text-right py-1.5 px-2">Conf</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const diff = row.l10avg != null ? row.l10avg - row.threshold : null;
                    return (
                      <tr key={`${row.player_id}-${row.threshold}`}
                        className={`border-b border-zinc-900 hover:bg-zinc-900/30 ${row.isNextUp ? "bg-emerald-950/10" : ""}`}>
                        <td className="py-1.5 px-2 font-medium text-zinc-200 whitespace-nowrap">{row.player_name}</td>
                        <td className="py-1.5 px-2 text-zinc-400 whitespace-nowrap">{row.team_name}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap">
                          <span className={row.isNextUp ? "text-emerald-300 font-medium" : "text-zinc-400"}>{row.targetOpponent}</span>
                        </td>
                        <td className="py-1.5 px-2 text-zinc-500 whitespace-nowrap text-[10px]">{row.targetMatchLabel}</td>
                        <td className="py-1.5 px-2"><TargetBadgeChip badge={row.targetBadge} /></td>
                        <td className="py-1.5 px-2 text-zinc-500">{row.position_group ?? "—"}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-zinc-300">{row.hits}/{row.games}</td>
                        <td className="py-1.5 px-2 text-right font-mono font-semibold text-zinc-200">{pct(row.rate)}%</td>
                        <td className="py-1.5 px-2 text-right font-mono text-zinc-500">{row.games - row.hits}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-zinc-400">{row.l3avg?.toFixed(1) ?? "—"}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-zinc-400">{row.l5avg?.toFixed(1) ?? "—"}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-zinc-400">{row.l10avg?.toFixed(1) ?? "—"}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-zinc-400">{row.seasonAvg?.toFixed(1) ?? "—"}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-zinc-300">{row.projection?.toFixed(0) ?? "—"}</td>
                        <td className={`py-1.5 px-2 text-right font-mono ${diff == null ? "text-zinc-600" : diff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {diff != null ? `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}` : "—"}
                        </td>
                        <td className="py-1.5 px-2 text-right"><ConfBadge label={row.confidence_label} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Same-Game Shortlists Tab ─────────────────────────────────────────────────

function SameGameShortlists({
  data, concessionMap, mode,
}: { data: CIData; concessionMap: Map<number, number>; mode: ContentMode }) {
  const [includeFade, setIncludeFade] = useState(false);
  const [minHitProfile, setMinHitProfile] = useState<"all" | "at-least-70" | "perfect">("all");

  // Build target-game groups: group players by their TARGET game (not just current match)
  // For next-up players, their match_id is current-round but we group by target
  const targetGroups = useMemo(() => {
    // For each team target, determine target game id and label
    const groups = new Map<string, {
      key: string;
      matchLabel: string;
      gameDate: string | null;
      isNextUp: boolean;
      teamAName: string; teamAId: number; teamAPlayed: boolean;
      teamBName: string; teamBId: number; teamBPlayed: boolean;
      dispRows: ResearchRow[];
      goalRows: ResearchRow[];
      fadeRows: ResearchRow[];
    }>();

    // Group by target game
    const allDispRows = applyModeFilter(
      buildRows(data.disposalPlayers, "disposals", 20, 3, concessionMap, data.teamTargets, mode),
      mode,
    );
    const allGoalRows = applyModeFilter(
      buildRows(data.goalPlayers, "goals", 1, 3, concessionMap, data.teamTargets, mode),
      mode,
    );

    for (const tt of data.teamTargets) {
      const target = resolveTarget(tt, mode);
      if (target.badge === "bye" || target.badge === "no-fixture") continue;

      // Make a consistent key from the two team IDs
      const opponentTarget = data.teamTargets.find(t => t.team_id === (target.isNextUp ? tt.next_opponent_id : tt.current_opponent_id));
      if (!opponentTarget) continue;
      const key = [tt.team_id, opponentTarget.team_id].sort((a, b) => a - b).join("-");
      if (groups.has(key)) continue;

      const opponentResolved = resolveTarget(opponentTarget, mode);

      const teamDisp = allDispRows.filter(r => r.team_id === tt.team_id || r.team_id === opponentTarget.team_id);
      const teamGoal = allGoalRows.filter(r => r.team_id === tt.team_id || r.team_id === opponentTarget.team_id);
      const teamFade = allDispRows.filter(r => (r.team_id === tt.team_id || r.team_id === opponentTarget.team_id) && r.bucket === "fade");

      const matchLabel = target.isNextUp
        ? `R${target.round}: ${tt.team_name} vs ${opponentTarget.team_name}`
        : data.matches.find(m =>
            (m.home_team_name === tt.team_name || m.away_team_name === tt.team_name) &&
            (m.home_team_name === opponentTarget.team_name || m.away_team_name === opponentTarget.team_name)
          )?.match_label ?? `R${target.round}: ${tt.team_name} vs ${opponentTarget.team_name}`;

      groups.set(key, {
        key,
        matchLabel,
        gameDate: target.gameDate,
        isNextUp: target.isNextUp,
        teamAName: tt.team_name,
        teamAId: tt.team_id,
        teamAPlayed: tt.has_played_current_round,
        teamBName: opponentTarget.team_name,
        teamBId: opponentTarget.team_id,
        teamBPlayed: opponentTarget.has_played_current_round,
        dispRows: sortRows(teamDisp.filter(r => (includeFade || r.bucket !== "fade") && filterByProfile(r, minHitProfile)), "hitrate").slice(0, 6),
        goalRows: sortRows(teamGoal.filter(r => (includeFade || r.bucket !== "fade") && filterByProfile(r, minHitProfile)), "hitrate").slice(0, 4),
        fadeRows: includeFade ? sortRows(teamFade, "hitrate").slice(0, 3) : [],
      });
    }

    return [...groups.values()].sort((a, b) => {
      if (a.isNextUp !== b.isNextUp) return a.isNextUp ? -1 : 1;
      return a.matchLabel.localeCompare(b.matchLabel);
    });
  }, [data, concessionMap, mode, includeFade, minHitProfile]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-2 text-[12px] text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={includeFade} onChange={e => setIncludeFade(e.target.checked)}
            className="rounded border-zinc-700 bg-zinc-900" />
          Include fade angles
        </label>
        <Sel label="Min profile" value={minHitProfile} onChange={v => setMinHitProfile(v as typeof minHitProfile)}
          options={[{ value: "all", label: "All" }, { value: "at-least-70", label: "70%+" }, { value: "perfect", label: "Perfect only" }]} />
      </div>

      {targetGroups.length === 0 && (
        <div className="py-10 text-center text-zinc-500 text-sm border border-zinc-800 rounded-lg">
          No target games available for this content mode.
        </div>
      )}

      <div className="space-y-4">
        {targetGroups.map(g => {
          const teamAConceded = concessionMap.get(g.teamBId);
          const teamBConceded = concessionMap.get(g.teamAId);
          const isPartialNextUp = g.isNextUp && (!g.teamAPlayed || !g.teamBPlayed);

          return (
            <div key={g.key} className={`border rounded-xl p-4 space-y-3 ${g.isNextUp ? "border-emerald-600/30 bg-emerald-950/10" : "border-zinc-800 bg-zinc-900/20"}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[13px] font-semibold text-zinc-200">{g.matchLabel}</h3>
                {g.isNextUp
                  ? <span className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-950/70 text-emerald-300 border-emerald-600/40 font-semibold">Next-Up</span>
                  : <span className="text-[10px] px-1.5 py-0.5 rounded border bg-zinc-800 text-zinc-400 border-zinc-600 font-semibold">Current Round</span>
                }
                {g.gameDate && <span className="text-[10px] text-zinc-500">{fmtDate(g.gameDate)}</span>}
              </div>

              {isPartialNextUp && (
                <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-600/20 rounded p-2 text-[11px] text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Partial next-up data — {!g.teamAPlayed ? g.teamAName : g.teamBName} has not completed their current game yet. Stats may not reflect latest form.
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className={`px-2 py-1 rounded border ${g.teamAPlayed ? "border-emerald-600/30 text-emerald-300 bg-emerald-950/20" : "border-zinc-700 text-zinc-400"}`}>
                  {g.teamAName}: {g.teamAPlayed ? "played" : "yet to play"}{teamAConceded != null ? ` · opp conceded L5: ${teamAConceded.toFixed(0)}` : ""}
                </div>
                <div className={`px-2 py-1 rounded border ${g.teamBPlayed ? "border-emerald-600/30 text-emerald-300 bg-emerald-950/20" : "border-zinc-700 text-zinc-400"}`}>
                  {g.teamBName}: {g.teamBPlayed ? "played" : "yet to play"}{teamBConceded != null ? ` · opp conceded L5: ${teamBConceded.toFixed(0)}` : ""}
                </div>
              </div>

              {g.dispRows.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-zinc-400 mb-1.5">20+ Disposal Angles</div>
                  <div className="space-y-1">
                    {g.dispRows.map(r => (
                      <div key={r.player_id} className="flex items-center gap-2 text-[11px]">
                        <BucketBadge bucket={r.bucket} />
                        <span className="font-medium text-zinc-200">{r.player_name}</span>
                        <span className="text-zinc-500">({r.team_name})</span>
                        <span className="font-mono text-zinc-300 ml-auto">{r.hits}/{r.games} · {pct(r.rate)}%</span>
                        <span className="text-zinc-600 font-mono">L5:{r.l5avg?.toFixed(1) ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {g.goalRows.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-zinc-400 mb-1.5">1+ Goal Angles</div>
                  <div className="space-y-1">
                    {g.goalRows.map(r => (
                      <div key={r.player_id} className="flex items-center gap-2 text-[11px]">
                        <BucketBadge bucket={r.bucket} />
                        <span className="font-medium text-zinc-200">{r.player_name}</span>
                        <span className="text-zinc-500">({r.team_name})</span>
                        <span className="font-mono text-zinc-300 ml-auto">{r.hits}/{r.games} · {pct(r.rate)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {includeFade && g.fadeRows.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-red-400/70 mb-1.5">Fade Angles (20+ disposals)</div>
                  <div className="space-y-1">
                    {g.fadeRows.map(r => (
                      <div key={r.player_id} className="flex items-center gap-2 text-[11px]">
                        <BucketBadge bucket={r.bucket} />
                        <span className="font-medium text-zinc-300">{r.player_name}</span>
                        <span className="text-zinc-500">({r.team_name})</span>
                        <span className="font-mono text-red-400 ml-auto">{r.hits}/{r.games} · {pct(r.rate)}%</span>
                      </div>
                    ))}
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

// ─── Cross-Game Shortlists Tab ────────────────────────────────────────────────

type CrossListStatus = "not-checked" | "market-exists" | "no-market" | "price-not-good" | "added-to-list" | "posted";

const CROSS_STATUS_OPTIONS: { value: CrossListStatus; label: string }[] = [
  { value: "not-checked",   label: "Not checked" },
  { value: "market-exists", label: "Market exists" },
  { value: "no-market",     label: "No market" },
  { value: "price-not-good",label: "Price not good" },
  { value: "added-to-list", label: "Added to list" },
  { value: "posted",        label: "Posted" },
];

interface CrossListShortlist {
  id: string;
  title: string;
  angleTag: string;
  rows: ResearchRow[];
}

function CrossGameShortlists({
  data, concessionMap, mode,
}: { data: CIData; concessionMap: Map<number, number>; mode: ContentMode }) {
  const [statuses, setStatuses] = useState<Record<string, CrossListStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [includeNextUp, setIncludeNextUp] = useState(true);
  const [includeCurrent, setIncludeCurrent] = useState(true);
  const [onlyFreshStats, setOnlyFreshStats] = useState(false);

  const setStatus = (key: string, s: CrossListStatus) => setStatuses(p => ({ ...p, [key]: s }));
  const setNote = (key: string, n: string) => setNotes(p => ({ ...p, [key]: n }));

  const shortlists = useMemo((): CrossListShortlist[] => {
    const allDisp = applyModeFilter(
      buildRows(data.disposalPlayers, "disposals", 15, 5, concessionMap, data.teamTargets, mode),
      mode,
    ).filter(r => (includeNextUp || !r.isNextUp) && (includeCurrent || r.isNextUp));

    const allDisp20 = allDisp.filter(r => r.threshold === 20 || r.hits > 0);
    const dispAll = applyModeFilter(
      buildRows(data.disposalPlayers, "disposals", 20, 3, concessionMap, data.teamTargets, mode),
      mode,
    ).filter(r => (includeNextUp || !r.isNextUp) && (includeCurrent || r.isNextUp));

    const allGoal = applyModeFilter(
      buildRows(data.goalPlayers, "goals", 1, 5, concessionMap, data.teamTargets, mode),
      mode,
    ).filter(r => (includeNextUp || !r.isNextUp) && (includeCurrent || r.isNextUp));

    const allTackle = applyModeFilter(
      buildRows(data.disposalPlayers, "tackles", 5, 3, concessionMap, data.teamTargets, mode),
      mode,
    ).filter(r => (includeNextUp || !r.isNextUp) && (includeCurrent || r.isNextUp));

    const allMark = applyModeFilter(
      buildRows(data.disposalPlayers, "marks", 5, 3, concessionMap, data.teamTargets, mode),
      mode,
    ).filter(r => (includeNextUp || !r.isNextUp) && (includeCurrent || r.isNextUp));

    return [
      {
        id: "safest-disposals-20",
        title: "Safest 20+ Disposals",
        angleTag: "Disposal · Perfect/Missed-Once",
        rows: sortRows(dispAll.filter(r => r.bucket === "elite-perfect" || r.bucket === "missed-once"), "hitrate").slice(0, 10),
      },
      {
        id: "safest-disposals-15",
        title: "Safest 15+ Disposals",
        angleTag: "Disposal · Perfect/Missed-Once",
        rows: sortRows(allDisp.filter(r => r.bucket === "elite-perfect" || r.bucket === "missed-once"), "hitrate").slice(0, 10),
      },
      {
        id: "goal-scorers",
        title: "1+ Goal Scorers (70%+)",
        angleTag: "Goals · 70%+",
        rows: sortRows(allGoal.filter(r => toFrac(r.rate) >= 0.70), "hitrate").slice(0, 10),
      },
      {
        id: "missed-once-disposals",
        title: "Missed-Once Disposals (20+)",
        angleTag: "Disposal · Missed Once",
        rows: sortRows(dispAll.filter(r => r.bucket === "missed-once"), "hitrate").slice(0, 10),
      },
      {
        id: "high-conf-pool",
        title: "High-Confidence Pool (80%+)",
        angleTag: "Disposal · 80%+",
        rows: sortRows(dispAll.filter(r => toFrac(r.rate) >= 0.80), "hitrate").slice(0, 10),
      },
      {
        id: "tackle-angles",
        title: "Tackle Angles (5+)",
        angleTag: "Tackles · Strong",
        rows: sortRows(allTackle.filter(r => r.bucket !== "fade"), "hitrate").slice(0, 8),
      },
      {
        id: "fade-disposal",
        title: "Fade / Under Angles (20+)",
        angleTag: "Disposal · Fade",
        rows: sortRows(dispAll.filter(r => r.bucket === "fade"), "hitrate").slice(0, 8),
      },
      {
        id: "marks-angles",
        title: "Marks Angles (5+)",
        angleTag: "Marks · Strong",
        rows: sortRows(allMark.filter(r => r.bucket !== "fade"), "hitrate").slice(0, 8),
      },
      {
        id: "hitouts",
        title: "Hitout Angles (20+)",
        angleTag: "Hitouts · Strong",
        rows: sortRows(
          applyModeFilter(buildRows(data.disposalPlayers, "hitouts", 20, 3, concessionMap, data.teamTargets, mode), mode)
            .filter(r => (includeNextUp || !r.isNextUp) && (includeCurrent || r.isNextUp) && r.bucket !== "fade"),
          "hitrate",
        ).slice(0, 8),
      },
      {
        id: "round-snapshot",
        title: "Round Snapshot (15+ disposal, perfect/missed-once)",
        angleTag: "Disposal · Round Snapshot",
        rows: sortRows(allDisp.filter(r => r.bucket === "elite-perfect" || r.bucket === "missed-once"), "hitrate").slice(0, 12),
      },
    ].filter(sl => sl.rows.length > 0);
  }, [data, concessionMap, mode, includeNextUp, includeCurrent]);

  return (
    <div className="space-y-4">
      <div className="text-[11px] text-amber-400/80 bg-amber-950/20 border border-amber-600/20 rounded px-3 py-2">
        Private browser-only workflow state. Status and notes reset on page refresh. No odds. No betting data.
      </div>

      <div className="flex flex-wrap gap-4 items-center bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
        <label className="flex items-center gap-2 text-[12px] text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={includeNextUp} onChange={e => setIncludeNextUp(e.target.checked)}
            className="rounded border-zinc-700" />
          Include Next-Up players
        </label>
        <label className="flex items-center gap-2 text-[12px] text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={includeCurrent} onChange={e => setIncludeCurrent(e.target.checked)}
            className="rounded border-zinc-700" />
          Include Current Round players
        </label>
        <label className="flex items-center gap-2 text-[12px] text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={onlyFreshStats} onChange={e => setOnlyFreshStats(e.target.checked)}
            className="rounded border-zinc-700" />
          Only next-up ready (has played)
        </label>
      </div>

      {shortlists.map(sl => {
        const rows = onlyFreshStats ? sl.rows.filter(r => r.isNextUp || !r.targetBadge.includes("waiting")) : sl.rows;
        if (rows.length === 0) return null;
        const copyText = rows.map(r =>
          `${r.player_name} (${r.team_name} → ${r.targetMatchLabel}) — ${r.hits}/${r.games} over ${r.threshold}+ ${FAMILY_CFG.find(f => f.value === r.statFamily)?.label}, L5 avg ${r.l5avg?.toFixed(1) ?? "N/A"}`
        ).join("\n");

        return (
          <div key={sl.id} className="border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div>
                <div className="text-[13px] font-semibold text-zinc-200">{sl.title}</div>
                <div className="text-[10px] text-zinc-500">{sl.angleTag}</div>
              </div>
              <CopyBtn text={copyText} />
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[10px] text-zinc-600">{rows.filter(r => r.isNextUp).length} next-up · {rows.filter(r => !r.isNextUp).length} current</span>
                <select value={statuses[sl.id] ?? "not-checked"} onChange={e => setStatus(sl.id, e.target.value as CrossListStatus)}
                  className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-300 focus:outline-none">
                  {CROSS_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              {rows.map(r => {
                const rowKey = `${sl.id}-${r.player_id}`;
                return (
                  <div key={rowKey} className={`flex items-center gap-2 text-[11px] py-0.5 ${r.isNextUp ? "bg-emerald-950/10 rounded px-1" : ""}`}>
                    <TargetBadgeChip badge={r.targetBadge} />
                    <BucketBadge bucket={r.bucket} />
                    <span className="font-medium text-zinc-200">{r.player_name}</span>
                    <span className="text-zinc-500 text-[10px]">{r.team_name}</span>
                    <ArrowRight className="h-2.5 w-2.5 text-zinc-600" />
                    <span className={`text-[10px] ${r.isNextUp ? "text-emerald-300" : "text-zinc-500"}`}>{r.targetMatchLabel}</span>
                    <span className="font-mono text-zinc-300 ml-auto">{r.hits}/{r.games} · {pct(r.rate)}%</span>
                    <span className="text-zinc-600 font-mono">L5:{r.l5avg?.toFixed(1) ?? "—"}</span>
                    <select value={statuses[rowKey] ?? "not-checked"} onChange={e => setStatus(rowKey, e.target.value as CrossListStatus)}
                      className="bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 focus:outline-none">
                      {CROSS_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>

            <input value={notes[sl.id] ?? ""} onChange={e => setNote(sl.id, e.target.value)}
              placeholder="Private note (browser-only, not saved)…"
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded px-2.5 py-1.5 text-[11px] text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-zinc-600" />
          </div>
        );
      })}
    </div>
  );
}

// ─── Team / Match Angles Tab ──────────────────────────────────────────────────

function TeamMatchAngles({
  data, mode,
}: { data: CIData; mode: ContentMode }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const teamRows = useMemo(() => {
    return data.teamTargets
      .filter(tt => {
        if (mode === "played-this-round") return tt.has_played_current_round;
        if (mode === "not-yet-played") return !tt.has_played_current_round;
        return true;
      })
      .map(tt => {
        const target = resolveTarget(tt, mode);
        const teamRow = data.teamDisposals.find(t => t.team_id === tt.team_id);
        return { tt, target, teamRow };
      });
  }, [data, mode]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SCard label="Teams Next-Up" value={String(data.teamsNextUp)} sub="completed current game" />
        <SCard label="Teams Current Round" value={String(data.teamsCurrentRound)} sub="yet to play" />
        <SCard label="Target Rounds" value={data.targetRounds.join(", ") || "—"} sub="rounds represented" />
        <SCard label="Current Round" value={data.roundLabel} sub={data.roundInfo?.round_status ?? data.roundSource} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 font-medium">
              <th className="text-left py-1.5 px-2">Team</th>
              <th className="text-left py-1.5 px-2">Cur Game Status</th>
              <th className="text-left py-1.5 px-2">Target Mode</th>
              <th className="text-left py-1.5 px-2">Target Opponent</th>
              <th className="text-left py-1.5 px-2">Target Round</th>
              <th className="text-left py-1.5 px-2">Target Date</th>
              <th className="text-right py-1.5 px-2">Opp Conceded L5</th>
              <th className="text-right py-1.5 px-2">Team Avg L5</th>
              <th className="text-right py-1.5 px-2">Projection</th>
            </tr>
          </thead>
          <tbody>
            {teamRows.map(({ tt, target, teamRow }) => (
              <tr key={tt.team_id} className={`border-b border-zinc-900 hover:bg-zinc-900/30 ${target.isNextUp ? "bg-emerald-950/10" : ""}`}>
                <td className="py-1.5 px-2 font-medium text-zinc-200">{tt.team_name}</td>
                <td className="py-1.5 px-2">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isCompletedStatus(tt.current_game_status) ? "bg-emerald-950/50 text-emerald-300" : "bg-zinc-800 text-zinc-400"}`}>
                    {tt.current_game_status}
                  </span>
                </td>
                <td className="py-1.5 px-2"><TargetBadgeChip badge={target.badge} /></td>
                <td className={`py-1.5 px-2 font-medium ${target.isNextUp ? "text-emerald-300" : "text-zinc-300"}`}>{target.opponent}</td>
                <td className="py-1.5 px-2 text-zinc-400">R{target.round}</td>
                <td className="py-1.5 px-2 text-zinc-500 text-[10px]">{target.gameDate ? fmtDate(target.gameDate) : "—"}</td>
                <td className="py-1.5 px-2 text-right font-mono text-zinc-300">{teamRow?.opponent_conceded_l5?.toFixed(1) ?? "—"}</td>
                <td className="py-1.5 px-2 text-right font-mono text-zinc-400">{teamRow?.recent_avg_l5?.toFixed(1) ?? "—"}</td>
                <td className="py-1.5 px-2 text-right font-mono text-zinc-300">{teamRow?.projection?.toFixed(0) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Upcoming next-up opponent note */}
      {teamRows.some(r => r.target.isNextUp) && (
        <div className="text-[10px] text-zinc-600 border-t border-zinc-900 pt-2">
          Next-up rows show the teams' NEXT scheduled opponent (future fixture). Opponent concession data reflects that opponent's current stats and may still update if the opponent has not played their current game.
        </div>
      )}
    </div>
  );
}

// ─── Post Ideas Tab ───────────────────────────────────────────────────────────

const POST_FORMATS: PostFormat[] = ["tiktok", "instagram", "reddit", "twitter", "caption"];

const POST_TIMING_OPTIONS = [
  { value: "all",          label: "All timing" },
  { value: "next-up",      label: "Next-Up posts" },
  { value: "current-only", label: "Current Round posts" },
  { value: "mixed",        label: "Mixed posts" },
];

function PostIdeas({
  posts, data,
}: { posts: PostTemplate[]; data: CIData }) {
  const [formatFilter, setFormatFilter] = useState<PostFormat | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [timingFilter, setTimingFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [roundFilter, setRoundFilter] = useState("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const categories = useMemo(() => ["all", ...new Set(posts.map(p => p.category))], [posts]);
  const allTeamNames = useMemo(() => ["all", ...new Set(posts.flatMap(p => p.teamNames))].sort(), [posts]);
  const allRounds = useMemo(() => ["all", ...data.targetRounds.map(r => `Round ${r}`)], [data.targetRounds]);

  const filtered = useMemo(() => {
    return posts.filter(p => {
      if (formatFilter !== "all" && p.format !== formatFilter) return false;
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (teamFilter !== "all" && !p.teamNames.includes(teamFilter)) return false;
      if (roundFilter !== "all") {
        const rn = parseInt(roundFilter.replace("Round ", ""));
        if (!isNaN(rn) && !p.targetRoundLabel.includes(`Round ${rn}`)) return false;
      }
      if (timingFilter === "next-up" && !p.hasNextUpPlayers) return false;
      if (timingFilter === "current-only" && !p.hasCurrentRoundPlayers) return false;
      if (timingFilter === "mixed" && !(p.hasNextUpPlayers && p.hasCurrentRoundPlayers)) return false;
      return p.bullets.length > 0;
    });
  }, [posts, formatFilter, categoryFilter, teamFilter, roundFilter, timingFilter]);

  function copyPost(post: PostTemplate) {
    const text = `${post.title}\n\n${post.hook}\n\n${post.bullets.map(b => `• ${b}`).join("\n")}\n\n${post.cta}`;
    navigator.clipboard.writeText(text);
    setCopiedId(post.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const formatCls = (f: PostFormat | "all") => {
    const base = "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ";
    return formatFilter === f
      ? base + "bg-zinc-200 text-zinc-900 border-zinc-300"
      : base + "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300";
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...POST_FORMATS] as (PostFormat | "all")[]).map(f => (
            <button key={f} onClick={() => setFormatFilter(f)} className={formatCls(f)}>
              {f === "all" ? "All formats" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-zinc-800 pt-3">
          <Sel label="Category" value={categoryFilter} onChange={setCategoryFilter}
            options={categories.map(c => ({ value: c, label: c }))} />
          <Sel label="Game Timing" value={timingFilter} onChange={setTimingFilter} options={POST_TIMING_OPTIONS} />
          <Sel label="Target Round" value={roundFilter} onChange={setRoundFilter}
            options={allRounds.map(r => ({ value: r, label: r }))} />
          <Sel label="Team" value={teamFilter} onChange={setTeamFilter}
            options={allTeamNames.map(t => ({ value: t, label: t }))} />
        </div>
      </div>

      <div className="text-[11px] text-zinc-500">
        <span className="text-zinc-300 font-medium">{filtered.length}</span> post ideas
        · {filtered.filter(p => p.hasNextUpPlayers).length} with next-up angles
        · {filtered.filter(p => p.hasCurrentRoundPlayers && !p.hasNextUpPlayers).length} current-round only
      </div>

      <div className="space-y-3">
        {filtered.map(post => (
          <div key={post.id} className={`border rounded-xl ${post.hasNextUpPlayers && post.hasCurrentRoundPlayers ? "border-teal-600/20 bg-teal-950/10" : post.hasNextUpPlayers ? "border-emerald-600/20 bg-emerald-950/10" : "border-zinc-800 bg-zinc-900/20"}`}>
            <div className="flex items-start gap-2 p-3 cursor-pointer" onClick={() => setExpanded(p => ({ ...p, [post.id]: !p[post.id] }))}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] font-semibold text-zinc-200 truncate">{post.title}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-medium uppercase">{post.format}</span>
                  <span className="text-[9px] text-zinc-600">{post.category}</span>
                  {post.hasNextUpPlayers && <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-600/30">Next-Up</span>}
                  {post.hasCurrentRoundPlayers && !post.hasNextUpPlayers && <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">Current Round</span>}
                  {post.hasCurrentRoundPlayers && post.hasNextUpPlayers && <span className="text-[9px] px-1 py-0.5 rounded bg-teal-950/60 text-teal-300 border border-teal-600/30">Mixed</span>}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">{post.targetRoundLabel} · {post.sourceCount} source{post.sourceCount !== 1 ? "s" : ""}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={e => { e.stopPropagation(); copyPost(post); }}
                  className="p-1.5 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 transition-colors">
                  {copiedId === post.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                {expanded[post.id] ? <ChevronUp className="h-3.5 w-3.5 text-zinc-600" /> : <ChevronDown className="h-3.5 w-3.5 text-zinc-600" />}
              </div>
            </div>

            {expanded[post.id] && (
              <div className="px-3 pb-3 space-y-2 border-t border-zinc-800/50">
                <p className="text-[11px] text-zinc-400 italic pt-2">{post.hook}</p>
                <ul className="space-y-1">
                  {post.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-zinc-300">
                      <span className="text-zinc-600 shrink-0 mt-0.5">•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-zinc-600 italic">{post.cta}</p>
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="py-10 text-center text-zinc-500 text-sm border border-zinc-800 rounded-lg">
            No post ideas match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Source Freshness Tab ─────────────────────────────────────────────────────

function FreshnessView({ data, mode }: { data: CIData; mode: ContentMode }) {
  const nextUpTeams = data.teamTargets.filter(t => t.has_played_current_round && t.next_game_id);
  const currentTeams = data.teamTargets.filter(t => !t.has_played_current_round && t.current_game_id);
  const byeTeams = data.teamTargets.filter(t => !t.current_game_id);
  const noFixtureTeams = data.teamTargets.filter(t => t.has_played_current_round && !t.next_game_id);

  const currentMode = CONTENT_MODES.find(m => m.value === mode);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <SCard label="Canonical Round" value={data.roundLabel} sub={data.roundSource === "canonical" ? "from get_current_afl_round_safe()" : "fallback from matches"} />
        <SCard label="Content Mode" value={currentMode?.label ?? mode} sub={currentMode?.desc ?? ""} />
        <SCard label="Target Rounds" value={data.targetRounds.length > 0 ? data.targetRounds.join(", ") : "—"} sub="distinct rounds in targets" />
        <SCard label="Page Loaded" value={fmtTime(data.loadedAt)} sub={fmtAgeMin(data.loadedAt)} />
        <SCard label="Teams Next-Up" value={String(nextUpTeams.length)} sub="completed, showing next game" />
        <SCard label="Teams Current Round" value={String(currentTeams.length)} sub="yet to play" />
        <SCard label="Teams Bye/No Game" value={String(byeTeams.length)} sub="no current-round fixture" />
        <SCard label="No Next Fixture" value={String(noFixtureTeams.length)} sub="played but no R+1 fixture found" />
        <SCard label="Current Round Games" value={String(data.roundInfo?.total_games ?? data.matches.length)} sub={`${data.roundInfo?.completed_games ?? "?"} complete · ${data.roundInfo?.upcoming_games ?? "?"} upcoming`} />
        <SCard label="Disposal Players Loaded" value={String(data.disposalPlayers.length)} sub="from get_stat_board_players (disposals lens)" />
        <SCard label="Goal Players Loaded" value={String(data.goalPlayers.length)} sub="from get_stat_board_players (goals lens)" />
        <SCard label="Team Concession Rows" value={String(data.teamDisposals.length)} sub="from get_stat_board_team_rows (disposals)" />
      </div>

      {/* Team targets table */}
      <div>
        <h3 className="text-[12px] font-semibold text-zinc-400 mb-2">Team Target Resolution</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left py-1.5 px-2">Team</th>
                <th className="text-left py-1.5 px-2">Cur Round Status</th>
                <th className="text-left py-1.5 px-2">Has Played</th>
                <th className="text-left py-1.5 px-2">Next Game</th>
                <th className="text-left py-1.5 px-2">Next Opp</th>
                <th className="text-left py-1.5 px-2">Mode Suggestion</th>
              </tr>
            </thead>
            <tbody>
              {data.teamTargets.map(tt => (
                <tr key={tt.team_id} className={`border-b border-zinc-900 ${tt.has_played_current_round ? "bg-emerald-950/10" : ""}`}>
                  <td className="py-1 px-2 font-medium text-zinc-300">{tt.team_name}</td>
                  <td className="py-1 px-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isCompletedStatus(tt.current_game_status) ? "bg-emerald-950/50 text-emerald-300" : "bg-zinc-800 text-zinc-400"}`}>
                      {tt.current_game_status}
                    </span>
                  </td>
                  <td className="py-1 px-2 text-[10px] font-semibold">{tt.has_played_current_round ? <span className="text-emerald-400">yes</span> : <span className="text-zinc-600">no</span>}</td>
                  <td className="py-1 px-2 text-zinc-400 text-[10px]">{tt.next_game_id ? `R${tt.next_game_round}` : "—"}</td>
                  <td className="py-1 px-2 text-zinc-400">{tt.next_opponent_name ?? "—"}</td>
                  <td className="py-1 px-2"><TargetBadgeChip badge={tt.target_mode_suggestion === "next-up" ? "next-up" : tt.target_mode_suggestion === "bye" ? "bye" : tt.target_mode_suggestion === "no-fixture" ? "no-fixture" : "current-round"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[10px] text-zinc-700 border-t border-zinc-900 pt-2 space-y-1">
        <div>Sources: get_current_afl_round_safe · admin_get_smart_next_up_targets · get_stat_board_players · get_stat_board_matches · get_stat_board_team_rows</div>
        <div>Admin-only function: admin_get_smart_next_up_targets() reads afl.games_raw directly. Does not affect public round rollover.</div>
        <div>Refresh: 5-min interval · window focus · manual button. No localStorage.</div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TABS = [
  "Player Stat Angles",
  "Team / Match Angles",
  "Same-Game Shortlists",
  "Cross-Game Shortlists",
  "Post Ideas",
  "Freshness",
] as const;
type Tab = typeof TABS[number];

export default function AdminContentIntel() {
  const [activeTab, setActiveTab] = useState<Tab>("Player Stat Angles");
  const [contentMode, setContentMode] = useState<ContentMode>("smart-next-up");
  const [data, setData] = useState<CIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedAtRef = useRef<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchCIData();
      setData(d);
      loadedAtRef.current = d.loadedAt;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // 5-min interval refetch
  useEffect(() => {
    const id = setInterval(() => fetchAll(), STALE_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  // Focus refetch
  useEffect(() => {
    function onFocus() {
      if (!loadedAtRef.current) return;
      if (Date.now() - loadedAtRef.current.getTime() > STALE_MS) fetchAll();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchAll]);

  const concessionMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of data?.teamDisposals ?? []) {
      if (t.opponent_conceded_l5 != null) m.set(t.team_id, t.opponent_conceded_l5);
    }
    return m;
  }, [data]);

  // Posts regenerate from live data + concession map + current mode
  const allPosts = useMemo(
    () => data ? buildPosts(data, concessionMap, contentMode) : [],
    [data, concessionMap, contentMode],
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 space-y-4">
      <AdminPageHeader
        icon={Lightbulb}
        title="Content Intel"
        description="Private stat research · Smart Next-Up mode · No AI · No odds · Admin only"
      />

      {/* Content Mode Selector */}
      <ContentModeSelector mode={contentMode} onChange={setContentMode} />

      {/* Smart Next-Up Banner */}
      {data && (contentMode === "smart-next-up" || contentMode === "played-this-round" || contentMode === "next-round") && (
        <NextUpBanner data={data} mode={contentMode} />
      )}

      {/* Header bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {data && (
          <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            {data.roundLabel} · loaded {fmtTime(data.loadedAt)} ({fmtAgeMin(data.loadedAt)})
            {data.teamsNextUp > 0 && (
              <span className="ml-1 text-emerald-400/80">{data.teamsNextUp} next-up</span>
            )}
          </div>
        )}
        <button onClick={fetchAll} disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[12px] border border-zinc-700 disabled:opacity-50 transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-600/20 rounded-lg p-3 text-[12px] text-red-300 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-zinc-800">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`relative px-4 py-2.5 text-[12px] font-medium whitespace-nowrap transition-colors ${
                activeTab === tab ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}>
              {tab}
              {tab === "Post Ideas" && allPosts.length > 0 && (
                <span className="ml-1.5 text-[9px] bg-zinc-700 text-zinc-400 px-1 rounded">{allPosts.length}</span>
              )}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-t bg-zinc-100" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {!data && loading && (
        <div className="py-20 text-center text-zinc-500">
          <Database className="h-8 w-8 mx-auto mb-3 opacity-40 animate-pulse" />
          <div className="text-sm">Loading stat data…</div>
        </div>
      )}

      {data && (
        <div className="pb-8">
          {activeTab === "Player Stat Angles" && (
            <PlayerStatAngles data={data} concessionMap={concessionMap} mode={contentMode} />
          )}
          {activeTab === "Team / Match Angles" && (
            <TeamMatchAngles data={data} mode={contentMode} />
          )}
          {activeTab === "Same-Game Shortlists" && (
            <SameGameShortlists data={data} concessionMap={concessionMap} mode={contentMode} />
          )}
          {activeTab === "Cross-Game Shortlists" && (
            <CrossGameShortlists data={data} concessionMap={concessionMap} mode={contentMode} />
          )}
          {activeTab === "Post Ideas" && (
            <PostIdeas posts={allPosts} data={data} />
          )}
          {activeTab === "Freshness" && (
            <FreshnessView data={data} mode={contentMode} />
          )}
        </div>
      )}
    </div>
  );
}
