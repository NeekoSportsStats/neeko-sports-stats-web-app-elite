/**
 * Admin Content Intel — private stat research and market-check board.
 * Covers all current-round games, all teams. Stats-based only.
 * No public-facing content. No betting advice. No AI. No mock data.
 */
import {
  useState, useEffect, useCallback, useRef, useMemo,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  RefreshCw, Copy, Check, ChevronDown, ChevronUp,
  Clock, Database, X, Search, Plus, CircleCheck, CircleDashed,
} from "lucide-react";
import { AdminPageHeader } from "@/features/admin/shared/AdminPageHeader";
import type {
  StatBoardPlayer, StatBoardMatch, ThresholdHitRate,
} from "@/features/afl/stat-board/types";
import type { StatBoardTeamRow } from "@/features/afl/stat-board/teamTypes";

// ─── Constants ────────────────────────────────────────────────────────────────

const STALE_MS = 5 * 60 * 1000;
const SEASON = 2026;

// ─── Types ────────────────────────────────────────────────────────────────────

type StatFamily =
  | "disposals" | "goals" | "tackles" | "marks"
  | "kicks" | "handballs" | "clearances" | "hitouts" | "fantasy";

type HitProfile =
  | "all" | "perfect" | "missed-once" | "missed-twice"
  | "at-least-80" | "at-least-70" | "at-least-60"
  | "fade" | "volatile" | "projection-supported" | "matchup-supported";

type SampleWindow = "last3" | "last5" | "last8" | "last10";
type MinSample = 0 | 3 | 5 | 8;

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

// ─── Stat family config ───────────────────────────────────────────────────────

interface FamilyCfg {
  value: StatFamily;
  label: string;
  lens: "disposals" | "goals";
  thresholds: number[];
}

const FAMILY_CFG: FamilyCfg[] = [
  { value: "disposals", label: "Disposals",    lens: "disposals", thresholds: [10, 15, 20, 25, 30, 35] },
  { value: "goals",     label: "Goals",        lens: "goals",     thresholds: [1, 2, 3, 4, 5] },
  { value: "tackles",   label: "Tackles",      lens: "disposals", thresholds: [2, 3, 5, 7, 10] },
  { value: "marks",     label: "Marks",        lens: "disposals", thresholds: [3, 5, 7, 10, 12] },
  { value: "kicks",     label: "Kicks",        lens: "disposals", thresholds: [10, 15, 20, 25] },
  { value: "handballs", label: "Handballs",    lens: "disposals", thresholds: [10, 15, 20] },
  { value: "clearances",label: "Clearances",   lens: "disposals", thresholds: [3, 5, 7, 10] },
  { value: "hitouts",   label: "Hitouts",      lens: "disposals", thresholds: [10, 20, 30, 40] },
  { value: "fantasy",   label: "Fantasy Score",lens: "disposals", thresholds: [50, 60, 70, 80, 90, 100, 110, 120] },
];

const HIT_PROFILES: { value: HitProfile; label: string }[] = [
  { value: "all",                  label: "All profiles" },
  { value: "perfect",              label: "Perfect / No misses" },
  { value: "missed-once",          label: "Missed Once" },
  { value: "missed-twice",         label: "Missed Twice" },
  { value: "at-least-80",         label: "80%+" },
  { value: "at-least-70",         label: "70%+" },
  { value: "at-least-60",         label: "60%+" },
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
  "elite-perfect":       { label: "Elite / Perfect",       cls: "bg-emerald-950/60 text-emerald-300 border-emerald-600/30" },
  "missed-once":         { label: "Missed Once",            cls: "bg-sky-950/60 text-sky-300 border-sky-600/30" },
  "missed-twice":        { label: "Missed Twice",           cls: "bg-blue-950/60 text-blue-300 border-blue-600/30" },
  "strong-70":           { label: "Strong 70%+",            cls: "bg-zinc-900 text-zinc-300 border-zinc-600/30" },
  "projection-supported":{ label: "Projection-Supported",  cls: "bg-amber-950/60 text-amber-300 border-amber-600/30" },
  "matchup-supported":   { label: "Matchup-Supported",     cls: "bg-teal-950/60 text-teal-300 border-teal-600/30" },
  "volatile":            { label: "Volatile Upside",        cls: "bg-orange-950/60 text-orange-300 border-orange-600/30" },
  "fade":                { label: "Fade / Under",           cls: "bg-red-950/60 text-red-300 border-red-600/30" },
};

// ─── RoundInfo interface ──────────────────────────────────────────────────────

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

// ─── Research row interface ───────────────────────────────────────────────────

interface ResearchRow {
  player_id: number;
  player_name: string;
  team_name: string;
  opponent_team_name: string;
  match_id: number;
  match_label: string;
  venue: string;
  position_group: string | null;
  statFamily: StatFamily;
  threshold: number;
  hits: number;
  games: number;
  rate: number; // stored 0-100
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
}

// ─── Loaded data bundle ───────────────────────────────────────────────────────

interface CIData {
  roundInfo: RoundInfo | null;
  currentRound: number;
  roundLabel: string;
  matches: StatBoardMatch[];
  disposalPlayers: StatBoardPlayer[];  // lens=disposals
  goalPlayers: StatBoardPlayer[];      // lens=goals
  teamDisposals: StatBoardTeamRow[];
  teamGoals: StatBoardTeamRow[];
  teamScore: StatBoardTeamRow[];
  loadedAt: Date;
  roundSource: "canonical" | "fallback";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true }).toLowerCase();
}

function fmtAgeMin(from: Date): string {
  const m = Math.floor((Date.now() - from.getTime()) / 60000);
  return m < 1 ? "just now" : m === 1 ? "1 min ago" : `${m} mins ago`;
}

function toFrac(rate: number): number {
  return rate > 1 ? rate / 100 : rate;
}

function pct(rate: number): number {
  return Math.round(toFrac(rate) * 100);
}

// Extract hit data for a stat family + threshold from a player row
function hitData(
  player: StatBoardPlayer,
  family: StatFamily,
  threshold: number,
): { hits: number; games: number; rate: number } | null {
  const rates = player.all_threshold_hit_rates;
  if (!rates) return null;
  const key = String(threshold);
  const entry = rates[key] as ThresholdHitRate | undefined;
  if (!entry || entry.games === 0) return null;
  return { hits: entry.hits, games: entry.games, rate: entry.rate };
}

// Per-family averages — for disposals/fantasy/tackles/etc lens, the player avg fields
// reflect the lens stat. Goals lens reflects goals averages.
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
  player_name: string, threshold: number, familyLabel: string,
  hits: number, games: number, l10avg: number | null,
  projection: number | null, opponent: string, bucket: GroupBucket,
): string {
  const p = Math.round((hits / Math.max(games, 1)) * 100);
  const avgStr = l10avg != null ? `, L10 avg ${l10avg.toFixed(1)}` : "";
  const projStr = projection != null ? `, projected ${projection.toFixed(0)}` : "";
  if (bucket === "elite-perfect")        return `${hits}/${games} over ${threshold}+ ${familyLabel} (perfect${avgStr}). Playing ${opponent}.`;
  if (bucket === "missed-once")          return `${hits}/${games} over ${threshold}+ ${familyLabel} — missed once${avgStr}${projStr}. Playing ${opponent}.`;
  if (bucket === "missed-twice")         return `${hits}/${games} over ${threshold}+ ${familyLabel} — missed twice${avgStr}${projStr}. Playing ${opponent}.`;
  if (bucket === "fade")                 return `${hits}/${games} over ${threshold}+ ${familyLabel} (${p}%${avgStr}${projStr}). Private market-check fade angle vs ${opponent}.`;
  if (bucket === "projection-supported") return `${hits}/${games} over ${threshold}+ ${familyLabel}${projStr}. Projection supports this line vs ${opponent}.`;
  if (bucket === "matchup-supported")    return `${hits}/${games} over ${threshold}+ ${familyLabel}. Opponent ${opponent} concession profile supports this.`;
  return `${hits}/${games} over ${threshold}+ ${familyLabel} (${p}%${avgStr}${projStr}). Playing ${opponent}.`;
}

function filterByProfile(row: ResearchRow, profile: HitProfile): boolean {
  const frac = toFrac(row.rate);
  const misses = row.games - row.hits;
  switch (profile) {
    case "all":                  return true;
    case "perfect":              return misses === 0 && row.games >= 3;
    case "missed-once":          return misses === 1;
    case "missed-twice":         return misses === 2;
    case "at-least-80":         return frac >= 0.80;
    case "at-least-70":         return frac >= 0.70;
    case "at-least-60":         return frac >= 0.60;
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

// Build all research rows from players for a family+threshold
function buildRows(
  players: StatBoardPlayer[],
  family: StatFamily,
  threshold: number,
  minSample: MinSample,
  teamConcessionMap: Map<number, number>, // opponent_team_id -> conceded_l5
): ResearchRow[] {
  const cfg = FAMILY_CFG.find(f => f.value === family)!;
  const familyLabel = cfg.label;
  const rows: ResearchRow[] = [];

  for (const p of players) {
    const hd = hitData(p, family, threshold);
    if (!hd) continue;
    const { hits, games, rate } = hd;
    if (minSample > 0 && games < minSample) continue;

    const avgs = playerAvgs(p);
    const opponentConcededL5 = teamConcessionMap.get(p.opponent_team_id) ?? null;
    const bucket = classifyBucket(hits, games, rate, p.projection, threshold, opponentConcededL5, p.stddev_last_10, avgs.l10);
    const reason = buildReason(p.player_name, threshold, familyLabel, hits, games, avgs.l10, p.projection, p.opponent_team_name, bucket);

    rows.push({
      player_id: p.player_id,
      player_name: p.player_name,
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
    });
  }
  return rows;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchCIData(): Promise<CIData> {
  // 1. Canonical round
  let roundInfo: RoundInfo | null = null;
  let currentRound = 0;
  let roundSource: CIData["roundSource"] = "canonical";

  const rRes = await supabase.rpc("get_current_afl_round_safe", { p_season: SEASON });
  if (!rRes.error && rRes.data?.length) {
    roundInfo = rRes.data[0] as RoundInfo;
    currentRound = roundInfo.current_round;
  }

  // 2. Matches for this round
  const mRes = await supabase.rpc("get_stat_board_matches", { p_season: SEASON, p_round: currentRound || null });
  const matches: StatBoardMatch[] = mRes.data ?? [];

  if (currentRound === 0 && matches.length > 0) {
    currentRound = matches[0].week;
    roundSource = "fallback";
  }
  const roundLabel = currentRound > 0 ? `Round ${currentRound}` : "Current Round";

  // 3. All disposal-lens players (no match filter)
  const dpRes = await supabase.rpc("get_stat_board_players", {
    p_season: SEASON, p_round: currentRound || null, p_match_id: null,
    p_lens: "disposals", p_threshold: 20, p_position_group: null,
    p_team_id: null, p_search: null, p_limit: 600, p_offset: 0,
  });
  const disposalPlayers: StatBoardPlayer[] = dpRes.data ?? [];

  // 4. All goal-lens players
  const gpRes = await supabase.rpc("get_stat_board_players", {
    p_season: SEASON, p_round: currentRound || null, p_match_id: null,
    p_lens: "goals", p_threshold: 1, p_position_group: null,
    p_team_id: null, p_search: null, p_limit: 600, p_offset: 0,
  });
  const goalPlayers: StatBoardPlayer[] = gpRes.data ?? [];

  // 5-7. Team rows for concession context
  const [tdRes, tgRes, tsRes] = await Promise.all([
    supabase.rpc("get_stat_board_team_rows", { p_season: SEASON, p_round: currentRound || null, p_match_id: null, p_lens: "disposals" }),
    supabase.rpc("get_stat_board_team_rows", { p_season: SEASON, p_round: currentRound || null, p_match_id: null, p_lens: "goals" }),
    supabase.rpc("get_stat_board_team_rows", { p_season: SEASON, p_round: currentRound || null, p_match_id: null, p_lens: "score" }),
  ]);

  return {
    roundInfo, currentRound, roundLabel, matches,
    disposalPlayers, goalPlayers,
    teamDisposals: tdRes.data ?? [],
    teamGoals: tgRes.data ?? [],
    teamScore: tsRes.data ?? [],
    loadedAt: new Date(),
    roundSource,
  };
}

// ─── Post builder ─────────────────────────────────────────────────────────────

function buildPosts(data: CIData, concessionMap: Map<number, number>): PostTemplate[] {
  const posts: PostTemplate[] = [];
  const rl = data.roundLabel;

  function topRows(
    family: StatFamily, threshold: number,
    filterBucket?: GroupBucket | null,
    limit = 6,
  ): ResearchRow[] {
    const src = family === "goals" ? data.goalPlayers : data.disposalPlayers;
    const rows = buildRows(src, family, threshold, 3, concessionMap);
    const filtered = filterBucket ? rows.filter(r => r.bucket === filterBucket) : rows.filter(r => r.bucket !== "fade");
    return sortRows(filtered, "hitrate").slice(0, limit);
  }

  function fadeRows(family: StatFamily, threshold: number, limit = 6): ResearchRow[] {
    const src = family === "goals" ? data.goalPlayers : data.disposalPlayers;
    const rows = buildRows(src, family, threshold, 3, concessionMap);
    return sortRows(rows.filter(r => r.bucket === "fade"), "hitrate").slice(0, limit);
  }

  function makeBullets(rows: ResearchRow[], family: StatFamily, threshold: number): string[] {
    const cfg = FAMILY_CFG.find(f => f.value === family)!;
    return rows.map(r =>
      `${r.player_name} (${r.team_name} vs ${r.opponent_team_name}) — ${r.hits}/${r.games} over ${threshold}+ ${cfg.label}, L5 avg ${r.l5avg?.toFixed(1) ?? "N/A"}`
    );
  }

  function makePost(
    id: string, format: PostFormat, category: string, angleTag: string,
    title: string, hook: string, rows: ResearchRow[], family: StatFamily, threshold: number,
  ): PostTemplate {
    return {
      id, format, category, angleTag, title, hook,
      bullets: makeBullets(rows, family, threshold),
      cta: `Check the full stat board at Neeko Sports Stats.`,
      sourceCount: rows.length,
      matchIds: [...new Set(rows.map(r => r.match_id))],
      teamNames: [...new Set(rows.map(r => r.team_name))],
    };
  }

  // Disposal trends
  const dispThresholds: [number, string][] = [
    [10, "10+ Disposals"],
    [15, "15+ Disposals"],
    [20, "20+ Disposals"],
    [25, "25+ Disposals"],
    [30, "30+ Disposals"],
    [35, "35+ Disposals (Upside)"],
  ];

  for (const [t, cat] of dispThresholds) {
    const rows = topRows("disposals", t, null, 6);
    if (rows.length === 0) continue;
    posts.push(makePost(`disp-${t}-tiktok`, "tiktok", cat, "Disposal Trend",
      `AFL ${rl}: Players with strong ${t}+ disposal trends`,
      `These players have been consistently clearing ${t}+ disposals in recent games.`,
      rows, "disposals", t));
    posts.push(makePost(`disp-${t}-instagram`, "instagram", cat, "Disposal Trend",
      `${rl}: ${t}+ disposal stat trends`,
      `Disposal trends across all ${rl} games — players worth tracking.`,
      rows, "disposals", t));
    if (t >= 20) {
      posts.push(makePost(`disp-${t}-reddit`, "reddit", cat, "Disposal Trend",
        `${rl} ${t}+ disposal stat angles — research shortlist`,
        `Based on recent form data here are players consistently hitting ${t}+ disposals.`,
        rows, "disposals", t));
    }
  }

  // Goal trends
  const goalThresholds: [number, string][] = [
    [1, "1+ Goals"], [2, "2+ Goals"], [3, "3+ Goals"],
  ];
  for (const [t, cat] of goalThresholds) {
    const rows = topRows("goals", t, null, 6);
    if (rows.length === 0) continue;
    posts.push(makePost(`goal-${t}-tiktok`, "tiktok", cat, "Goal Trend",
      `AFL ${rl}: Players with strong ${t}+ goal trends`,
      `Goal-scoring form data for ${rl} — players hitting ${t}+ goals consistently.`,
      rows, "goals", t));
    posts.push(makePost(`goal-${t}-twitter`, "twitter", cat, "Goal Trend",
      `${rl} — ${t}+ goal stat trends`,
      `Players with strong ${t}+ goal records recently.`,
      rows, "goals", t));
  }

  // Tackle trends
  const tackleRows = topRows("tackles", 5, null, 6);
  if (tackleRows.length > 0) {
    posts.push(makePost("tackle-5-tiktok", "tiktok", "Tackle Trends", "Tackle Trend",
      `AFL ${rl}: 5+ tackle trend players`,
      `Tackle machine players for ${rl} — consistent tacklers.`,
      tackleRows, "tackles", 5));
    posts.push(makePost("tackle-5-caption", "caption", "Tackle Trends", "Tackle Trend",
      `${rl}: 5+ tackle watchlist`,
      `Short-form tackle watchlist for ${rl}.`,
      tackleRows.slice(0, 4), "tackles", 5));
  }

  // Mark trends
  const markRows = topRows("marks", 5, null, 6);
  if (markRows.length > 0) {
    posts.push(makePost("marks-5-instagram", "instagram", "Mark Trends", "Mark Trend",
      `AFL ${rl}: 5+ marks stat trend players`,
      `Marking forwards and mids with strong recent records.`,
      markRows, "marks", 5));
  }

  // Kick trends
  const kickRows = topRows("kicks", 15, null, 6);
  if (kickRows.length > 0) {
    posts.push(makePost("kicks-15-twitter", "twitter", "Kick Trends", "Kick Trend",
      `${rl}: 15+ kicks stat trends`,
      `Players regularly finding the ball by foot this season.`,
      kickRows, "kicks", 15));
  }

  // Clearance trends
  const clearRows = topRows("clearances", 5, null, 6);
  if (clearRows.length > 0) {
    posts.push(makePost("clear-5-caption", "caption", "Clearance Trends", "Clearance Trend",
      `${rl}: 5+ clearance watchlist`,
      `Contested midfielders clearing 5+ regularly.`,
      clearRows, "clearances", 5));
  }

  // Hitout trends
  const hitoutRows = topRows("hitouts", 20, null, 6);
  if (hitoutRows.length > 0) {
    posts.push(makePost("hitout-20-tiktok", "tiktok", "Hitout Trends", "Hitout Trend",
      `AFL ${rl}: 20+ hitout stat trends`,
      `Rucks dominating the hitout count for ${rl}.`,
      hitoutRows, "hitouts", 20));
  }

  // Handball trends
  const hbRows = topRows("handballs", 15, null, 6);
  if (hbRows.length > 0) {
    posts.push(makePost("handball-15-twitter", "twitter", "Handball Trends", "Handball Trend",
      `${rl}: 15+ handball stat trends`,
      `High-touch players distributing by hand this round.`,
      hbRows, "handballs", 15));
  }

  // Perfect hitters (no misses)
  for (const [family, threshold] of [["disposals", 20], ["goals", 1], ["disposals", 15]] as const) {
    const perfRows = topRows(family, threshold, "elite-perfect", 6);
    if (perfRows.length === 0) continue;
    const cfg = FAMILY_CFG.find(f => f.value === family)!;
    posts.push(makePost(`perfect-${family}-${threshold}-reddit`, "reddit", "Perfect Hitters", "Elite Trend",
      `${rl}: Players with perfect ${threshold}+ ${cfg.label} records`,
      `No misses in their recent sample — the most reliable stat trends for ${rl}.`,
      perfRows, family, threshold));
    posts.push(makePost(`perfect-${family}-${threshold}-instagram`, "instagram", "Perfect Hitters", "Elite Trend",
      `${rl}: Flawless ${threshold}+ ${cfg.label} trends`,
      `These players haven't missed this stat line once in their recent sample.`,
      perfRows, family, threshold));
  }

  // Missed-once angles
  const missedOnce20 = topRows("disposals", 20, "missed-once", 6);
  if (missedOnce20.length > 0) {
    posts.push(makePost("missed-once-20-tiktok", "tiktok", "Missed Once", "Missed Once",
      `AFL ${rl}: Players who've only missed 20+ disposals once`,
      `Near-perfect disposal records — missed the 20+ line just once in their recent sample.`,
      missedOnce20, "disposals", 20));
    posts.push(makePost("missed-once-20-twitter", "twitter", "Missed Once", "Missed Once",
      `${rl}: 20+ disposal near-misses worth reviewing`,
      `Strong disposal records with a single blip. Still solid trend research.`,
      missedOnce20, "disposals", 20));
  }
  const missedOnce15 = topRows("disposals", 15, "missed-once", 6);
  if (missedOnce15.length > 0) {
    posts.push(makePost("missed-once-15-caption", "caption", "Missed Once", "Missed Once",
      `${rl}: 15+ disposal missed-once shortlist`,
      `These players have barely missed the 15-disposal mark.`,
      missedOnce15, "disposals", 15));
  }
  const missedOnceGoal = topRows("goals", 1, "missed-once", 6);
  if (missedOnceGoal.length > 0) {
    posts.push(makePost("missed-once-goals-instagram", "instagram", "Missed Once", "Missed Once",
      `${rl}: Near-perfect goal scorers — missed once`,
      `Goal-scoring reliability research — players who barely missed.`,
      missedOnceGoal, "goals", 1));
  }

  // Missed-twice
  const missedTwice20 = topRows("disposals", 20, "missed-twice", 6);
  if (missedTwice20.length > 0) {
    posts.push(makePost("missed-twice-20-caption", "caption", "Missed Twice", "Missed Twice",
      `${rl}: Players who've missed 20+ disposals twice — still strong overall`,
      `Two misses in the sample but still positive trend overall.`,
      missedTwice20, "disposals", 20));
  }

  // Fade angles
  for (const [family, threshold] of [["disposals", 20], ["disposals", 25], ["goals", 2]] as const) {
    const fadeR = fadeRows(family, threshold, 5);
    if (fadeR.length === 0) continue;
    const cfg = FAMILY_CFG.find(f => f.value === family)!;
    posts.push(makePost(`fade-${family}-${threshold}-twitter`, "twitter", "Fade Angles", "Fade",
      `${rl}: Players frequently missing ${threshold}+ ${cfg.label}`,
      `Low hit-rate research shortlist — private market-check fade angles. Worth reviewing carefully.`,
      fadeR, family, threshold));
    posts.push(makePost(`fade-${family}-${threshold}-reddit`, "reddit", "Fade Angles", "Fade",
      `${rl}: ${threshold}+ ${cfg.label} fade watchlist`,
      `Players who have regularly fallen below ${threshold}+ ${cfg.label} in recent games.`,
      fadeR, family, threshold));
  }

  // Volatile upside
  const volatileDisp = sortRows(buildRows(data.disposalPlayers, "disposals", 20, 3, concessionMap).filter(r => r.bucket === "volatile"), "l10avg").slice(0, 6);
  if (volatileDisp.length > 0) {
    posts.push(makePost("volatile-disp-tiktok", "tiktok", "Volatile Upside", "Volatile",
      `AFL ${rl}: High-ceiling but inconsistent disposal players`,
      `These players have big upside but volatile output — worth watching but treat with caution.`,
      volatileDisp, "disposals", 20));
  }

  // Matchup-supported
  const matchupDisp = topRows("disposals", 20, "matchup-supported", 6);
  if (matchupDisp.length > 0) {
    posts.push(makePost("matchup-disp-instagram", "instagram", "Matchup-Supported", "Matchup",
      `AFL ${rl}: Matchup-supported disposal angles`,
      `Players whose opponent concession profile supports this disposal line.`,
      matchupDisp, "disposals", 20));
  }
  const matchupGoal = topRows("goals", 1, "matchup-supported", 6);
  if (matchupGoal.length > 0) {
    posts.push(makePost("matchup-goal-instagram", "instagram", "Matchup-Supported", "Matchup",
      `AFL ${rl}: Matchup-supported goal angles`,
      `Goal scorers facing teams with high goal-concession rates.`,
      matchupGoal, "goals", 1));
  }

  // Projection-supported
  const projDisp = topRows("disposals", 20, "projection-supported", 6);
  if (projDisp.length > 0) {
    posts.push(makePost("proj-disp-caption", "caption", "Projection-Supported", "Projection",
      `${rl}: Projection-supported 20+ disposal angles`,
      `Players whose projection sits above the disposal line with a solid hit rate.`,
      projDisp, "disposals", 20));
  }

  // Per-position
  for (const pos of ["MID", "DEF", "FWD", "RUC"] as const) {
    const posLabel = pos === "MID" ? "Midfielder" : pos === "DEF" ? "Defender" : pos === "FWD" ? "Forward" : "Ruck";
    const posRows = sortRows(buildRows(data.disposalPlayers, "disposals", 20, 3, concessionMap).filter(r => r.position_group === pos && r.bucket !== "fade"), "hitrate").slice(0, 5);
    if (posRows.length === 0) continue;
    posts.push(makePost(`pos-${pos}-20-caption`, "caption", `${posLabel} Trends`, "Position",
      `AFL ${rl}: ${posLabel} 20+ disposal stat trends`,
      `${posLabel}s hitting 20+ disposals consistently this ${rl}.`,
      posRows, "disposals", 20));
  }

  // Under-the-radar (non-MID)
  const radarRows = sortRows(
    buildRows(data.disposalPlayers, "disposals", 20, 5, concessionMap)
      .filter(r => r.position_group !== "MID" && (r.bucket === "elite-perfect" || r.bucket === "missed-once")),
    "hitrate"
  ).slice(0, 6);
  if (radarRows.length > 0) {
    posts.push(makePost("radar-tiktok", "tiktok", "Under the Radar", "Quiet Consistency",
      `AFL ${rl}: Under-the-radar players with strong disposal trends`,
      `Non-midfielders with standout disposal consistency. Often overlooked.`,
      radarRows, "disposals", 20));
    posts.push(makePost("radar-reddit", "reddit", "Under the Radar", "Quiet Consistency",
      `${rl}: Under-the-radar disposal trend players`,
      `These non-midfielders are quietly hitting 20+ disposals with a strong recent record.`,
      radarRows, "disposals", 20));
  }

  // High-sample reliable (8+ games)
  const highSampleRows = sortRows(
    buildRows(data.disposalPlayers, "disposals", 20, 8, concessionMap).filter(r => r.bucket !== "fade"),
    "hitrate"
  ).slice(0, 6);
  if (highSampleRows.length > 0) {
    posts.push(makePost("high-sample-instagram", "instagram", "High-Sample Reliability", "Reliable",
      `AFL ${rl}: 20+ disposal trends — 8+ game sample reliability`,
      `Long-sample reliability check. These players have at least 8 data points.`,
      highSampleRows, "disposals", 20));
  }

  // Round snapshot (all round top angles combined)
  const roundSnap = sortRows(
    buildRows(data.disposalPlayers, "disposals", 15, 3, concessionMap).filter(r => r.bucket === "elite-perfect" || r.bucket === "missed-once"),
    "hitrate"
  ).slice(0, 8);
  if (roundSnap.length > 0) {
    posts.push(makePost("round-snap-tiktok", "tiktok", "Round Snapshot", "Snapshot",
      `AFL ${rl}: Best disposal stat trends across all games`,
      `A full-round snapshot of the strongest 15+ disposal records. All teams covered.`,
      roundSnap, "disposals", 15));
    posts.push(makePost("round-snap-reddit", "reddit", "Round Snapshot", "Snapshot",
      `AFL ${rl} full-round stat trend snapshot`,
      `Best stat trends across all ${rl} games. All teams. All matches.`,
      roundSnap, "disposals", 15));
  }

  // Top 5 per match
  const matchGroups = new Map<number, ResearchRow[]>();
  for (const row of buildRows(data.disposalPlayers, "disposals", 20, 3, concessionMap).filter(r => r.bucket !== "fade")) {
    if (!matchGroups.has(row.match_id)) matchGroups.set(row.match_id, []);
    matchGroups.get(row.match_id)!.push(row);
  }
  for (const [matchId, mRows] of matchGroups) {
    const topMatch = sortRows(mRows, "hitrate").slice(0, 5);
    const match = data.matches.find(m => m.match_id === matchId);
    if (!match || topMatch.length < 2) continue;
    posts.push({
      id: `match-${matchId}-top5`,
      format: "instagram",
      category: "By Match",
      angleTag: "Same-Game",
      title: `${match.match_label}: Top 20+ disposal stat angles`,
      hook: `Best 20+ disposal research angles for ${match.match_label}.`,
      bullets: makeBullets(topMatch, "disposals", 20),
      cta: `Full stat board at Neeko Sports Stats.`,
      sourceCount: topMatch.length,
      matchIds: [matchId],
      teamNames: [...new Set(topMatch.map(r => r.team_name))],
    });
  }

  // Cross-game safest disposal shortlist
  const crossDisp = sortRows(
    buildRows(data.disposalPlayers, "disposals", 15, 5, concessionMap).filter(r => r.bucket === "elite-perfect" || r.bucket === "missed-once"),
    "hitrate"
  ).slice(0, 6);
  if (crossDisp.length > 0 && new Set(crossDisp.map(r => r.match_id)).size >= 2) {
    posts.push({
      id: "cross-disp-shortlist-reddit",
      format: "reddit",
      category: "Cross-Game Shortlist",
      angleTag: "Cross-Game",
      title: `${rl}: Cross-game 15+ disposal research shortlist`,
      hook: `Players from different ${rl} games with the strongest 15+ disposal records. Research shortlist only.`,
      bullets: makeBullets(crossDisp, "disposals", 15),
      cta: `Full research at Neeko Sports Stats.`,
      sourceCount: crossDisp.length,
      matchIds: [...new Set(crossDisp.map(r => r.match_id))],
      teamNames: [...new Set(crossDisp.map(r => r.team_name))],
    });
    posts.push({
      id: "cross-disp-shortlist-tiktok",
      format: "tiktok",
      category: "Cross-Game Shortlist",
      angleTag: "Cross-Game",
      title: `AFL ${rl}: Cross-game stat angles — 15+ disposals`,
      hook: `Strong disposal trends across multiple ${rl} games.`,
      bullets: makeBullets(crossDisp, "disposals", 15),
      cta: `Neeko Sports Stats — full stat board.`,
      sourceCount: crossDisp.length,
      matchIds: [...new Set(crossDisp.map(r => r.match_id))],
      teamNames: [...new Set(crossDisp.map(r => r.team_name))],
    });
  }

  // Cross-game goal shortlist
  const crossGoal = sortRows(
    buildRows(data.goalPlayers, "goals", 1, 5, concessionMap).filter(r => r.bucket === "elite-perfect" || r.bucket === "missed-once"),
    "hitrate"
  ).slice(0, 6);
  if (crossGoal.length > 0 && new Set(crossGoal.map(r => r.match_id)).size >= 2) {
    posts.push({
      id: "cross-goal-shortlist",
      format: "reddit",
      category: "Cross-Game Shortlist",
      angleTag: "Cross-Game",
      title: `${rl}: Cross-game 1+ goal research shortlist`,
      hook: `Goal-scoring trends across different ${rl} games. Research shortlist.`,
      bullets: makeBullets(crossGoal, "goals", 1),
      cta: `Full stat board at Neeko Sports Stats.`,
      sourceCount: crossGoal.length,
      matchIds: [...new Set(crossGoal.map(r => r.match_id))],
      teamNames: [...new Set(crossGoal.map(r => r.team_name))],
    });
  }

  // Cross-game mixed (disposals + goals combo)
  const mixedDisp = sortRows(buildRows(data.disposalPlayers, "disposals", 20, 5, concessionMap).filter(r => r.bucket === "elite-perfect"), "hitrate").slice(0, 3);
  const mixedGoal = sortRows(buildRows(data.goalPlayers, "goals", 1, 5, concessionMap).filter(r => r.bucket === "elite-perfect"), "hitrate").slice(0, 3);
  if (mixedDisp.length >= 2 && mixedGoal.length >= 2) {
    posts.push({
      id: "mixed-shortlist-reddit",
      format: "reddit",
      category: "Cross-Game Shortlist",
      angleTag: "Cross-Game",
      title: `${rl}: Mixed stat cross-game research shortlist`,
      hook: `Disposals and goals trends across ${rl} — private research shortlist.`,
      bullets: [
        ...makeBullets(mixedDisp, "disposals", 20),
        ...makeBullets(mixedGoal, "goals", 1),
      ],
      cta: `Full research at Neeko Sports Stats.`,
      sourceCount: mixedDisp.length + mixedGoal.length,
      matchIds: [...new Set([...mixedDisp, ...mixedGoal].map(r => r.match_id))],
      teamNames: [...new Set([...mixedDisp, ...mixedGoal].map(r => r.team_name))],
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
      title: `AFL ${rl}: Teams conceding the most disposals`,
      hook: `Teams giving up the most disposal production to their opponents — worth targeting.`,
      bullets: topConcession.map(t => `${t.opponent_team_name} vs ${t.team_name} — conceding avg ${t.opponent_conceded_l5?.toFixed(1)} disposals L5`),
      cta: `Full analysis at Neeko Sports Stats.`,
      sourceCount: topConcession.length,
      matchIds: [...new Set(topConcession.map(t => t.match_id))],
      teamNames: [...new Set(topConcession.map(t => t.team_name))],
    });
    posts.push({
      id: "team-concession-disposals-reddit",
      format: "reddit",
      category: "Team Concession",
      angleTag: "Concession",
      title: `${rl}: Teams leaking the most disposals — opponent targets`,
      hook: `Which teams are conceding the most opposition disposals? ${rl} concession stats.`,
      bullets: topConcession.map(t => `${t.team_name} has conceded avg ${t.opponent_conceded_l5?.toFixed(1)} opp disposals L5 — ${t.opponent_team_name} attacking`),
      cta: `Research at Neeko Sports Stats.`,
      sourceCount: topConcession.length,
      matchIds: [...new Set(topConcession.map(t => t.match_id))],
      teamNames: [...new Set(topConcession.map(t => t.team_name))],
    });
  }

  // Quiet consistency (high sample, not flashy names)
  posts.push({
    id: "quiet-consistency",
    format: "instagram",
    category: "Quiet Consistency",
    angleTag: "Quiet",
    title: `AFL ${rl}: Quiet consistency — players flying under the radar`,
    hook: `Strong stat records without the highlight reel. The stats don't lie.`,
    bullets: radarRows.length > 0
      ? radarRows.map(r => `${r.player_name} (${r.team_name}) — ${r.hits}/${r.games} over 20+, avg ${r.l10avg?.toFixed(1) ?? "N/A"}`)
      : ["No data loaded for this round."],
    cta: `Full research at Neeko Sports Stats.`,
    sourceCount: radarRows.length,
    matchIds: [...new Set(radarRows.map(r => r.match_id))],
    teamNames: [...new Set(radarRows.map(r => r.team_name))],
  });

  // Stat board discovery
  posts.push({
    id: "stat-board-discovery",
    format: "tiktok",
    category: "Stat Board Discovery",
    angleTag: "Discovery",
    title: `AFL ${rl}: Stat board discoveries — what the numbers show`,
    hook: `Using the Neeko stat board to find ${rl} research angles. Here's what stands out.`,
    bullets: [
      `${data.disposalPlayers.length} players loaded across ${data.matches.length} ${rl} games`,
      ...sortRows(buildRows(data.disposalPlayers, "disposals", 20, 5, concessionMap).filter(r => r.bucket === "elite-perfect"), "hitrate")
        .slice(0, 4).map(r => `${r.player_name}: ${r.hits}/${r.games} over 20+ disposals`),
    ],
    cta: `Full stat board at Neeko Sports Stats.`,
    sourceCount: data.disposalPlayers.length,
    matchIds: [...new Set(data.matches.map(m => m.match_id))],
    teamNames: [],
  });

  return posts;
}

// ─── Small UI Components ──────────────────────────────────────────────────────

function Chip({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
        active
          ? "bg-zinc-200 text-zinc-900 border-zinc-300"
          : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}

function Sel({
  label, value, onChange, options,
}: {
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
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function BucketBadge({ bucket }: { bucket: GroupBucket }) {
  const m = BUCKET_META[bucket];
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
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-1 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 transition-colors"
    >
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

// ─── Player Stat Angles Tab ───────────────────────────────────────────────────

function PlayerStatAngles({ data, concessionMap }: { data: CIData; concessionMap: Map<number, number> }) {
  const [family, setFamily] = useState<StatFamily>("disposals");
  const [threshold, setThreshold] = useState(20);
  const [profile, setProfile] = useState<HitProfile>("all");
  const [sampleWindow, _setSampleWindow] = useState<SampleWindow>("last10");
  const [minSample, setMinSample] = useState<MinSample>(3);
  const [sortBy, setSortBy] = useState<SortBy>("hitrate");
  const [matchFilter, setMatchFilter] = useState<number | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [oppFilter, setOppFilter] = useState<string>("");
  const [posFilter, setPosFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const cfg = FAMILY_CFG.find(f => f.value === family)!;

  useEffect(() => {
    if (!cfg.thresholds.includes(threshold)) setThreshold(cfg.thresholds[Math.floor(cfg.thresholds.length / 2)]);
  }, [family]);

  const srcPlayers = family === "goals" ? data.goalPlayers : data.disposalPlayers;

  // Apply match filter client-side
  const matchFiltered = useMemo(() =>
    matchFilter == null ? srcPlayers : srcPlayers.filter(p => p.match_id === matchFilter),
    [srcPlayers, matchFilter]);

  const allRows = useMemo(() =>
    buildRows(matchFiltered, family, threshold, minSample, concessionMap),
    [matchFiltered, family, threshold, minSample, concessionMap]);

  const filtered = useMemo(() => {
    let rows = allRows;
    if (teamFilter) rows = rows.filter(r => r.team_name === teamFilter);
    if (oppFilter) rows = rows.filter(r => r.opponent_team_name === oppFilter);
    if (posFilter) rows = rows.filter(r => r.position_group === posFilter);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r => r.player_name.toLowerCase().includes(q) || r.team_name.toLowerCase().includes(q));
    }
    rows = rows.filter(r => filterByProfile(r, profile));
    return sortRows(rows, sortBy);
  }, [allRows, teamFilter, oppFilter, posFilter, search, profile, sortBy]);

  const grouped = useMemo(() => {
    const g: Record<GroupBucket, ResearchRow[]> = {
      "elite-perfect": [], "missed-once": [], "missed-twice": [], "strong-70": [],
      "projection-supported": [], "matchup-supported": [], "volatile": [], "fade": [],
    };
    for (const r of filtered) g[r.bucket].push(r);
    return g;
  }, [filtered]);

  const teams = useMemo(() => [...new Set(srcPlayers.map(p => p.team_name))].sort(), [srcPlayers]);
  const opps = useMemo(() => [...new Set(srcPlayers.map(p => p.opponent_team_name))].sort(), [srcPlayers]);

  const presets: { label: string; fam: StatFamily; thr: number; prof: HitProfile }[] = [
    { label: "10+ Disp",     fam: "disposals", thr: 10,  prof: "all" },
    { label: "15+ Disp",     fam: "disposals", thr: 15,  prof: "all" },
    { label: "20+ Disp",     fam: "disposals", thr: 20,  prof: "all" },
    { label: "25+ Disp",     fam: "disposals", thr: 25,  prof: "all" },
    { label: "30+ Disp",     fam: "disposals", thr: 30,  prof: "all" },
    { label: "1+ Goals",     fam: "goals",     thr: 1,   prof: "all" },
    { label: "2+ Goals",     fam: "goals",     thr: 2,   prof: "all" },
    { label: "3+ Goals",     fam: "goals",     thr: 3,   prof: "all" },
    { label: "5+ Tackles",   fam: "tackles",   thr: 5,   prof: "all" },
    { label: "5+ Marks",     fam: "marks",     thr: 5,   prof: "all" },
    { label: "Missed Once",  fam: family,      thr: threshold, prof: "missed-once" },
    { label: "Fade Angles",  fam: family,      thr: threshold, prof: "fade" },
    { label: "Perfect",      fam: family,      thr: threshold, prof: "perfect" },
  ];

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map(p => (
          <Chip
            key={`${p.fam}-${p.thr}-${p.prof}`}
            label={p.label}
            active={family === p.fam && threshold === p.thr && profile === p.prof}
            onClick={() => { setFamily(p.fam); setThreshold(p.thr); setProfile(p.prof); }}
          />
        ))}
        <button
          onClick={() => { setFamily("disposals"); setThreshold(20); setProfile("all"); setMinSample(3); setSortBy("hitrate"); setMatchFilter(null); setTeamFilter(""); setOppFilter(""); setPosFilter(""); setSearch(""); }}
          className="px-2.5 py-1 rounded-full text-[11px] font-medium border bg-zinc-900 text-zinc-500 border-zinc-700 hover:border-zinc-500 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Filters */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Sel label="Game" value={matchFilter == null ? "all" : String(matchFilter)} onChange={v => setMatchFilter(v === "all" ? null : Number(v))}
            options={[{ value: "all", label: "All Games" }, ...data.matches.map(m => ({ value: String(m.match_id), label: m.match_label }))]} />
          <Sel label="Team" value={teamFilter || "all"} onChange={v => setTeamFilter(v === "all" ? "" : v)}
            options={[{ value: "all", label: "All Teams" }, ...teams.map(t => ({ value: t, label: t }))]} />
          <Sel label="Opponent" value={oppFilter || "all"} onChange={v => setOppFilter(v === "all" ? "" : v)}
            options={[{ value: "all", label: "All Opponents" }, ...opps.map(t => ({ value: t, label: t }))]} />
          <Sel label="Position" value={posFilter || "all"} onChange={v => setPosFilter(v === "all" ? "" : v)}
            options={[{ value: "all", label: "All" }, { value: "MID", label: "Mid" }, { value: "DEF", label: "Def" }, { value: "FWD", label: "Fwd" }, { value: "RUC", label: "Ruck" }]} />
          <Sel label="Stat Family" value={family} onChange={v => setFamily(v as StatFamily)} options={FAMILY_CFG.map(f => ({ value: f.value, label: f.label }))} />
          <Sel label="Threshold" value={String(threshold)} onChange={v => setThreshold(Number(v))} options={cfg.thresholds.map(t => ({ value: String(t), label: `${t}+` }))} />
          <Sel label="Hit Profile" value={profile} onChange={v => setProfile(v as HitProfile)} options={HIT_PROFILES} />
          <Sel label="Min Games" value={String(minSample)} onChange={v => setMinSample(Number(v) as MinSample)}
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

      {/* Summary */}
      <div className="text-[11px] text-zinc-500">
        <span className="text-zinc-300 font-medium">{filtered.length}</span> players with {threshold}+ {cfg.label}
        {matchFilter != null
          ? <> in {data.matches.find(m => m.match_id === matchFilter)?.match_label}</>
          : <> across all {data.matches.length} {data.roundLabel} game{data.matches.length !== 1 ? "s" : ""}</>}
      </div>

      {filtered.length === 0 && (
        <div className="py-10 text-center text-zinc-500 text-sm border border-zinc-800 rounded-lg">
          No players match the current filters.
          {profile === "perfect" && <div className="mt-1 text-[11px]">Try 'All profiles' to see near-miss players.</div>}
        </div>
      )}

      {/* Grouped results */}
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
                    <th className="text-left py-1.5 px-2">vs</th>
                    <th className="text-left py-1.5 px-2">Game</th>
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
                      <tr key={`${row.player_id}-${row.threshold}`} className="border-b border-zinc-900 hover:bg-zinc-900/30">
                        <td className="py-1.5 px-2 font-medium text-zinc-200 whitespace-nowrap">{row.player_name}</td>
                        <td className="py-1.5 px-2 text-zinc-400 whitespace-nowrap">{row.team_name}</td>
                        <td className="py-1.5 px-2 text-zinc-400 whitespace-nowrap">{row.opponent_team_name}</td>
                        <td className="py-1.5 px-2 text-zinc-500 whitespace-nowrap text-[10px]">{row.match_label}</td>
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

function SameGameShortlists({ data, concessionMap }: { data: CIData; concessionMap: Map<number, number> }) {
  const [includeFade, setIncludeFade] = useState(false);
  const [minHitProfile, setMinHitProfile] = useState<"all" | "at-least-70" | "perfect">("all");

  const matchShortlists = useMemo(() => {
    return data.matches.map(match => {
      const dispRows = sortRows(
        buildRows(data.disposalPlayers.filter(p => p.match_id === match.match_id), "disposals", 20, 3, concessionMap)
          .filter(r => includeFade || r.bucket !== "fade")
          .filter(r => filterByProfile(r, minHitProfile)),
        "hitrate"
      ).slice(0, 6);

      const goalRows = sortRows(
        buildRows(data.goalPlayers.filter(p => p.match_id === match.match_id), "goals", 1, 3, concessionMap)
          .filter(r => includeFade || r.bucket !== "fade")
          .filter(r => filterByProfile(r, minHitProfile)),
        "hitrate"
      ).slice(0, 4);

      const fadeRows_ = includeFade ? sortRows(
        buildRows(data.disposalPlayers.filter(p => p.match_id === match.match_id), "disposals", 20, 3, concessionMap)
          .filter(r => r.bucket === "fade"),
        "hitrate"
      ).slice(0, 3) : [];

      // Team concession context for this match
      const matchTeams = data.teamDisposals.filter(t => t.match_id === match.match_id);

      const totalAngles = dispRows.length + goalRows.length + fadeRows_.length;

      return { match, dispRows, goalRows, fadeRows: fadeRows_, matchTeams, totalAngles };
    }).filter(m => m.totalAngles > 0);
  }, [data, concessionMap, includeFade, minHitProfile]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-[11px] text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={includeFade} onChange={e => setIncludeFade(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800" />
          Include Fade Angles
        </label>
        <Sel label="" value={minHitProfile} onChange={v => setMinHitProfile(v as typeof minHitProfile)}
          options={[{ value: "all", label: "All profiles" }, { value: "at-least-70", label: "70%+ only" }, { value: "perfect", label: "Perfect only" }]} />
      </div>

      <p className="text-[11px] text-zinc-500">
        {matchShortlists.length} of {data.matches.length} {data.roundLabel} games have stat research angles.
        Private shortlist — not public advice.
      </p>

      {matchShortlists.map(({ match, dispRows, goalRows, fadeRows: fRows, matchTeams }) => (
        <div key={match.match_id} className="border border-zinc-800 rounded-lg overflow-hidden">
          <div className="bg-zinc-900/60 px-4 py-2.5 flex items-center justify-between">
            <div>
              <span className="text-[13px] font-semibold text-zinc-200">{match.match_label}</span>
              {match.venue && <span className="ml-2 text-[10px] text-zinc-500">{match.venue}</span>}
            </div>
            <span className="text-[10px] text-zinc-500">{new Date(match.game_date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</span>
          </div>

          <div className="p-3 space-y-3">
            {/* Team concession row */}
            {matchTeams.length > 0 && (
              <div className="text-[10px] text-zinc-500 flex flex-wrap gap-4">
                {matchTeams.map(t => (
                  <span key={t.team_id}>
                    <span className="text-zinc-400">{t.team_name}</span> conceding <span className="text-zinc-300">{t.opponent_conceded_l5?.toFixed(1) ?? "—"}</span> opp disposals L5
                  </span>
                ))}
              </div>
            )}

            {dispRows.length > 0 && (
              <div>
                <p className="text-[10px] text-zinc-500 mb-1">Disposal angles (20+)</p>
                <div className="space-y-1">
                  {dispRows.map(r => (
                    <div key={r.player_id} className="flex items-center gap-2 text-[11px]">
                      <BucketBadge bucket={r.bucket} />
                      <span className="font-medium text-zinc-200">{r.player_name}</span>
                      <span className="text-zinc-500">{r.team_name}</span>
                      <span className="font-mono text-zinc-300 ml-auto">{r.hits}/{r.games} · {pct(r.rate)}% · L5 {r.l5avg?.toFixed(1) ?? "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {goalRows.length > 0 && (
              <div>
                <p className="text-[10px] text-zinc-500 mb-1">Goal angles (1+)</p>
                <div className="space-y-1">
                  {goalRows.map(r => (
                    <div key={r.player_id} className="flex items-center gap-2 text-[11px]">
                      <BucketBadge bucket={r.bucket} />
                      <span className="font-medium text-zinc-200">{r.player_name}</span>
                      <span className="text-zinc-500">{r.team_name}</span>
                      <span className="font-mono text-zinc-300 ml-auto">{r.hits}/{r.games} · {pct(r.rate)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fRows.length > 0 && (
              <div>
                <p className="text-[10px] text-zinc-500 mb-1">Fade angles (20+ disposals)</p>
                <div className="space-y-1">
                  {fRows.map(r => (
                    <div key={r.player_id} className="flex items-center gap-2 text-[11px]">
                      <BucketBadge bucket="fade" />
                      <span className="font-medium text-zinc-200">{r.player_name}</span>
                      <span className="text-zinc-500">{r.team_name}</span>
                      <span className="font-mono text-red-400 ml-auto">{r.hits}/{r.games} · {pct(r.rate)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {matchShortlists.length === 0 && (
        <div className="py-10 text-center text-zinc-500 text-sm border border-zinc-800 rounded-lg">
          No same-game angles found. Try reducing minimum sample or enabling fade angles.
        </div>
      )}
    </div>
  );
}

// ─── Cross-Game Shortlists Tab ────────────────────────────────────────────────

type CrossListStatus = { status: ResearchStatus; note: string };

function CrossGameShortlists({ data, concessionMap }: { data: CIData; concessionMap: Map<number, number> }) {
  const [statuses, setStatuses] = useState<Record<string, CrossListStatus>>({});
  const [minRate, setMinRate] = useState(60);
  const [maxSize, setMaxSize] = useState(6);
  const [includeFade, setIncludeFade] = useState(false);

  const STATUS_OPTS: { value: ResearchStatus; label: string }[] = [
    { value: "not-checked", label: "Not checked" },
    { value: "market-exists", label: "Market exists" },
    { value: "no-market", label: "No market" },
    { value: "price-not-good", label: "Price not good" },
    { value: "added-to-list", label: "Added to list" },
    { value: "posted", label: "Posted" },
  ];

  const shortlists = useMemo(() => {
    function make(id: string, title: string, angleTag: string, rows: ResearchRow[]) {
      const limited = rows.slice(0, maxSize);
      const matchCount = new Set(limited.map(r => r.match_id)).size;
      return { id, title, angleTag, rows: limited, matchCount };
    }

    function topFor(family: StatFamily, threshold: number, minHitRate: number, excludeFade = !includeFade): ResearchRow[] {
      const src = family === "goals" ? data.goalPlayers : data.disposalPlayers;
      return sortRows(
        buildRows(src, family, threshold, 3, concessionMap)
          .filter(r => toFrac(r.rate) * 100 >= minHitRate)
          .filter(r => !excludeFade || r.bucket !== "fade"),
        "hitrate"
      );
    }

    const lists = [
      make("safe-disposals", `${data.roundLabel}: Safest disposal trend shortlist (15+)`,
        "Cross-Game",
        topFor("disposals", 15, minRate).filter(r => r.bucket === "elite-perfect" || r.bucket === "missed-once")),
      make("safe-disposals-20", `${data.roundLabel}: 20+ disposal research shortlist`,
        "Cross-Game",
        topFor("disposals", 20, minRate)),
      make("safe-disposals-25", `${data.roundLabel}: 25+ disposal research shortlist`,
        "Cross-Game",
        topFor("disposals", 25, minRate)),
      make("goal-trends", `${data.roundLabel}: 1+ goal trend shortlist`,
        "Cross-Game",
        topFor("goals", 1, minRate).filter(r => r.bucket === "elite-perfect" || r.bucket === "missed-once")),
      make("goal-2plus", `${data.roundLabel}: 2+ goal research shortlist`,
        "Cross-Game",
        topFor("goals", 2, minRate)),
      make("missed-once-disp", `${data.roundLabel}: Missed-once disposal shortlist`,
        "Missed Once",
        topFor("disposals", 20, 0).filter(r => r.bucket === "missed-once")),
      make("missed-once-goals", `${data.roundLabel}: Missed-once goal shortlist`,
        "Missed Once",
        topFor("goals", 1, 0).filter(r => r.bucket === "missed-once")),
      make("high-conf", `${data.roundLabel}: High-confidence only shortlist`,
        "High Confidence",
        sortRows(topFor("disposals", 20, minRate).filter(r => r.confidence_label === "HIGH"), "confidence")),
      make("tackle-shortlist", `${data.roundLabel}: 5+ tackle research shortlist`,
        "Cross-Game",
        topFor("tackles", 5, minRate)),
      make("marks-shortlist", `${data.roundLabel}: 5+ mark research shortlist`,
        "Cross-Game",
        topFor("marks", 5, minRate)),
      ...(includeFade ? [
        make("fade-disposals", `${data.roundLabel}: Fade shortlist — 20+ disposals`,
          "Fade",
          topFor("disposals", 20, 0, false).filter(r => r.bucket === "fade")),
        make("fade-goals", `${data.roundLabel}: Fade shortlist — 2+ goals`,
          "Fade",
          topFor("goals", 2, 0, false).filter(r => r.bucket === "fade")),
      ] : []),
      make("broad-round", `${data.roundLabel}: Broad round stat angles — all teams`,
        "Round Snapshot",
        topFor("disposals", 15, minRate).filter(r => r.bucket !== "fade")),
    ];

    return lists.filter(l => l.rows.length >= 2);
  }, [data, concessionMap, minRate, maxSize, includeFade]);

  function updateStatus(id: string, status: ResearchStatus) {
    setStatuses(s => ({ ...s, [id]: { status, note: s[id]?.note ?? "" } }));
  }
  function updateNote(id: string, note: string) {
    setStatuses(s => ({ ...s, [id]: { status: s[id]?.status ?? "not-checked", note } }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <Sel label="Min hit rate" value={String(minRate)} onChange={v => setMinRate(Number(v))}
          options={[{ value: "0", label: "Any" }, { value: "60", label: "60%+" }, { value: "70", label: "70%+" }, { value: "80", label: "80%+" }]} />
        <Sel label="Max shortlist size" value={String(maxSize)} onChange={v => setMaxSize(Number(v))}
          options={[{ value: "3", label: "3" }, { value: "4", label: "4" }, { value: "5", label: "5" }, { value: "6", label: "6" }]} />
        <label className="flex items-center gap-2 text-[11px] text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={includeFade} onChange={e => setIncludeFade(e.target.checked)} className="rounded border-zinc-600 bg-zinc-800" />
          Include Fade Lists
        </label>
      </div>

      <div className="text-[10px] text-zinc-500 p-2 bg-zinc-900/40 border border-zinc-800 rounded">
        Private browser-only workflow state. Status resets on page refresh. No odds. No betting data.
      </div>

      <div className="text-[11px] text-zinc-500">{shortlists.length} cross-game shortlists generated from live data.</div>

      <div className="space-y-3">
        {shortlists.map(sl => {
          const st = statuses[sl.id] ?? { status: "not-checked", note: "" };
          const copyText = `${sl.title}\n\n${sl.rows.map(r => `• ${r.player_name} (${r.team_name} vs ${r.opponent_team_name}) — ${r.hits}/${r.games} over ${r.threshold}+ ${FAMILY_CFG.find(f => f.value === r.statFamily)?.label}, ${pct(r.rate)}%`).join("\n")}`;
          return (
            <div key={sl.id} className="border border-zinc-800 rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[9px] font-semibold text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5">{sl.angleTag}</span>
                    <span className="text-[10px] text-zinc-500">{sl.rows.length} angles · {sl.matchCount} game{sl.matchCount !== 1 ? "s" : ""}</span>
                  </div>
                  <p className="text-[12px] font-semibold text-zinc-200">{sl.title}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <CopyBtn text={copyText} />
                  <select
                    value={st.status}
                    onChange={e => updateStatus(sl.id, e.target.value as ResearchStatus)}
                    className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-300 focus:outline-none"
                  >
                    {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                {sl.rows.map(r => (
                  <div key={`${r.player_id}-${r.threshold}`} className="flex items-center gap-2 text-[11px]">
                    <BucketBadge bucket={r.bucket} />
                    <span className="font-medium text-zinc-200">{r.player_name}</span>
                    <span className="text-zinc-500">{r.team_name} vs {r.opponent_team_name}</span>
                    <span className="text-zinc-600 text-[10px]">{r.match_label}</span>
                    <span className="font-mono text-zinc-300 ml-auto shrink-0">{r.hits}/{r.games} · {pct(r.rate)}% · L5 {r.l5avg?.toFixed(1) ?? "—"}</span>
                  </div>
                ))}
              </div>
              {st.status !== "not-checked" && (
                <input
                  value={st.note}
                  onChange={e => updateNote(sl.id, e.target.value)}
                  placeholder="Add a private note…"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-300 focus:outline-none"
                />
              )}
            </div>
          );
        })}
      </div>

      {shortlists.length === 0 && (
        <div className="py-10 text-center text-zinc-500 text-sm border border-zinc-800 rounded-lg">
          No shortlists generated. Lower the minimum hit rate or check that stat data has loaded.
        </div>
      )}
    </div>
  );
}

// ─── Team / Match Angles Tab ──────────────────────────────────────────────────

function TeamMatchAngles({ data }: { data: CIData }) {
  const [lens, setLens] = useState<"disposals" | "goals" | "score">("disposals");
  const [teamFilter, setTeamFilter] = useState<string>("");

  const teamRows = lens === "disposals" ? data.teamDisposals : lens === "goals" ? data.teamGoals : data.teamScore;
  const filtered = teamFilter ? teamRows.filter(t => t.team_name === teamFilter || t.opponent_team_name === teamFilter) : teamRows;
  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => (b.opponent_conceded_l5 ?? 0) - (a.opponent_conceded_l5 ?? 0)),
    [filtered]);

  const teams = useMemo(() => [...new Set(teamRows.flatMap(t => [t.team_name, t.opponent_team_name]))].sort(), [teamRows]);
  const lensLabel = lens === "disposals" ? "Disposals" : lens === "goals" ? "Goals" : "Score";

  // Match environment summary
  const matchEnv = useMemo(() => {
    return data.matches.map(match => {
      const dispRows = data.teamDisposals.filter(t => t.match_id === match.match_id);
      const goalRows = data.teamGoals.filter(t => t.match_id === match.match_id);
      const scoreRows = data.teamScore.filter(t => t.match_id === match.match_id);
      const avgDisp = dispRows.length ? dispRows.reduce((s, t) => s + (t.recent_avg_l5 ?? 0), 0) / dispRows.length : null;
      const avgGoals = goalRows.length ? goalRows.reduce((s, t) => s + (t.recent_goals_avg ?? 0), 0) / goalRows.length : null;
      const projScore = scoreRows.find(t => t.projected_combined_score != null)?.projected_combined_score ?? null;
      return { match, avgDisp, avgGoals, projScore, dispRows, goalRows };
    });
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-2">
          {(["disposals", "goals", "score"] as const).map(l => (
            <button key={l} onClick={() => setLens(l)}
              className={`px-3 py-1.5 rounded text-[11px] font-medium border transition-colors
                ${lens === l ? "bg-zinc-200 text-zinc-900 border-zinc-300" : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500"}`}>
              {l === "disposals" ? "Disposals" : l === "goals" ? "Goals" : "Score"}
            </button>
          ))}
        </div>
        <Sel label="" value={teamFilter || "all"} onChange={v => setTeamFilter(v === "all" ? "" : v)}
          options={[{ value: "all", label: "All Teams" }, ...teams.map(t => ({ value: t, label: t }))]} />
      </div>

      {/* Team concession table */}
      <div>
        <h3 className="text-[12px] font-semibold text-zinc-300 mb-2">Teams conceding {lensLabel} — opponent target list</h3>
        {sorted.length === 0 ? (
          <div className="py-6 text-center text-zinc-500 text-sm border border-zinc-800 rounded-lg">No team data available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 font-medium">
                  <th className="text-left py-1.5 px-2">Team (attacking)</th>
                  <th className="text-left py-1.5 px-2">Opponent (conceding)</th>
                  <th className="text-left py-1.5 px-2">H/A</th>
                  <th className="text-right py-1.5 px-2">Opp Conc L5</th>
                  <th className="text-right py-1.5 px-2">Opp Conc Ssn</th>
                  <th className="text-right py-1.5 px-2">Own L5</th>
                  <th className="text-right py-1.5 px-2">Own Ssn</th>
                  <th className="text-right py-1.5 px-2">Proj</th>
                  <th className="text-right py-1.5 px-2">Conf</th>
                  <th className="text-left py-1.5 px-2">Angle</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => {
                  const concL5 = row.opponent_conceded_l5;
                  const concSsn = row.opponent_conceded_season;
                  const elevated = concL5 != null && concSsn != null && concL5 > concSsn * 1.05;
                  return (
                    <tr key={i} className="border-b border-zinc-900 hover:bg-zinc-900/30">
                      <td className="py-1.5 px-2 font-medium text-zinc-200">{row.team_name}</td>
                      <td className="py-1.5 px-2 text-zinc-400">{row.opponent_team_name}</td>
                      <td className="py-1.5 px-2 text-zinc-500">{row.is_home ? "H" : "A"}</td>
                      <td className={`py-1.5 px-2 text-right font-mono ${elevated ? "text-amber-300 font-semibold" : "text-zinc-400"}`}>
                        {concL5?.toFixed(1) ?? "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-zinc-400">{concSsn?.toFixed(1) ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-zinc-400">{row.recent_avg_l5?.toFixed(1) ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-zinc-400">{row.season_avg?.toFixed(1) ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right font-mono text-zinc-300">{row.projection?.toFixed(1) ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right"><ConfBadge label={row.confidence_label} /></td>
                      <td className="py-1.5 px-2">
                        {elevated && (
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
      </div>

      {/* Match environment board */}
      <div>
        <h3 className="text-[12px] font-semibold text-zinc-300 mb-2">Match environment — all {data.roundLabel} games</h3>
        <div className="space-y-2">
          {matchEnv.map(({ match, avgDisp, avgGoals, projScore, dispRows }) => (
            <div key={match.match_id} className="bg-zinc-900/40 border border-zinc-800 rounded-lg px-4 py-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-[12px] font-semibold text-zinc-200">{match.match_label}</span>
                  {match.venue && <span className="ml-2 text-[10px] text-zinc-500">{match.venue}</span>}
                </div>
                <div className="flex items-center gap-4 text-[11px]">
                  {projScore != null && <span className="text-zinc-400">Proj total <span className="font-mono text-zinc-200">{projScore.toFixed(0)}</span></span>}
                  {avgDisp != null && <span className="text-zinc-400">Avg disp env <span className="font-mono text-zinc-200">{avgDisp.toFixed(0)}</span></span>}
                  {avgGoals != null && <span className="text-zinc-400">Avg goals env <span className="font-mono text-zinc-200">{avgGoals.toFixed(1)}</span></span>}
                  {projScore == null && avgDisp == null && <span className="text-zinc-600 text-[10px]">Environment data loading…</span>}
                </div>
              </div>
              {dispRows.length > 0 && (
                <div className="mt-1 flex gap-4 text-[10px] text-zinc-500">
                  {dispRows.map(t => (
                    <span key={t.team_id}>
                      {t.team_name} facing <span className="text-zinc-400">{t.opponent_conceded_l5?.toFixed(0) ?? "?"}</span> opp disp L5
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-zinc-600">
        Concession = average {lensLabel} allowed by the listed team to their opponents. Elevated = L5 concession above season average.
      </p>
    </div>
  );
}

// ─── Post Ideas Tab ───────────────────────────────────────────────────────────

const POST_CATEGORIES = [
  "All",
  "10+ Disposals", "15+ Disposals", "20+ Disposals", "25+ Disposals",
  "30+ Disposals", "35+ Disposals (Upside)",
  "1+ Goals", "2+ Goals", "3+ Goals",
  "Tackle Trends", "Mark Trends", "Kick Trends", "Handball Trends",
  "Clearance Trends", "Hitout Trends",
  "Perfect Hitters", "Missed Once", "Missed Twice",
  "Fade Angles", "Volatile Upside",
  "Matchup-Supported", "Projection-Supported",
  "By Match", "Cross-Game Shortlist",
  "Team Concession",
  "Defender Trends", "Midfielder Trends", "Forward Trends", "Ruck Trends",
  "Under the Radar", "High-Sample Reliability", "Round Snapshot", "Quiet Consistency",
  "Stat Board Discovery",
];

function PostIdeas({ posts }: { posts: PostTemplate[] }) {
  const [cat, setCat] = useState("All");
  const [fmt, setFmt] = useState<PostFormat | "all">("all");
  const [gameFilter, setGameFilter] = useState<number | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const matchIds = useMemo(() => [...new Set(posts.flatMap(p => p.matchIds))], [posts]);
  const allTeams = useMemo(() => [...new Set(posts.flatMap(p => p.teamNames))].sort(), [posts]);

  const filtered = useMemo(() => {
    return posts.filter(p => {
      if (cat !== "All" && p.category !== cat) return false;
      if (fmt !== "all" && p.format !== fmt) return false;
      if (gameFilter != null && !p.matchIds.includes(gameFilter)) return false;
      if (teamFilter && !p.teamNames.includes(teamFilter)) return false;
      return true;
    });
  }, [posts, cat, fmt, gameFilter, teamFilter]);

  const usedCategories = useMemo(() => {
    const used = new Set(posts.map(p => p.category));
    return POST_CATEGORIES.filter(c => c === "All" || used.has(c));
  }, [posts]);

  return (
    <div className="space-y-4">
      {/* Category chips — scrollable */}
      <div className="flex gap-1.5 flex-wrap">
        {usedCategories.map(c => (
          <Chip key={c} label={c} active={cat === c} onClick={() => setCat(c)} />
        ))}
      </div>

      <div className="flex gap-2 flex-wrap items-end">
        <div className="flex gap-1">
          {(["all", "tiktok", "instagram", "reddit", "twitter", "caption"] as const).map(f => (
            <button key={f} onClick={() => setFmt(f)}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors
                ${fmt === f ? "bg-zinc-700 text-zinc-200 border-zinc-500" : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700"}`}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <select value={gameFilter ?? "all"} onChange={e => setGameFilter(e.target.value === "all" ? null : Number(e.target.value))}
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-300 focus:outline-none">
          <option value="all">All Games</option>
          {matchIds.map(id => <option key={id} value={id}>Game {id}</option>)}
        </select>
        <select value={teamFilter || "all"} onChange={e => setTeamFilter(e.target.value === "all" ? "" : e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-300 focus:outline-none">
          <option value="all">All Teams</option>
          {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="text-[11px] text-zinc-500">
        <span className="text-zinc-300 font-medium">{filtered.length}</span> post packs
        {posts.length > 0 && <> of {posts.length} total</>}
        {" — "}derived from live stat rows. No AI. No hardcoded content.
      </div>

      {filtered.length === 0 && (
        <div className="py-10 text-center text-zinc-500 text-sm border border-zinc-800 rounded-lg">
          No post ideas match the current filters.
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(post => {
          const isOpen = expandedId === post.id;
          const copyText = `${post.title}\n\n${post.hook}\n\n${post.bullets.map(b => `• ${b}`).join("\n")}\n\n${post.cta}`;
          return (
            <div key={post.id} className="border border-zinc-800 rounded-lg overflow-hidden">
              <button onClick={() => setExpandedId(isOpen ? null : post.id)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-zinc-900/50 transition-colors text-left">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5 shrink-0">{post.format}</span>
                  <span className="text-[9px] text-zinc-600 border border-zinc-800 rounded px-1.5 py-0.5 shrink-0">{post.angleTag}</span>
                  <span className="text-[11px] font-medium text-zinc-300 truncate">{post.title}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-zinc-600">{post.sourceCount} rows</span>
                  {isOpen ? <ChevronUp className="h-3 w-3 text-zinc-500" /> : <ChevronDown className="h-3 w-3 text-zinc-500" />}
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 border-t border-zinc-800 pt-3 space-y-3">
                  <p className="text-[12px] text-zinc-300">{post.hook}</p>
                  <ul className="space-y-1">
                    {post.bullets.map((b, i) => (
                      <li key={i} className="text-[11px] text-zinc-400 flex gap-2">
                        <span className="text-zinc-600 shrink-0">•</span>{b}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-zinc-500">{post.cta}</p>
                  <div className="flex justify-end">
                    <CopyBtn text={copyText} />
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

// ─── Freshness Tab ────────────────────────────────────────────────────────────

function FreshnessView({ data, posts, shortlistCount }: { data: CIData; posts: PostTemplate[]; shortlistCount: number }) {
  return (
    <div className="space-y-4">
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-[12px] font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <Database className="h-3.5 w-3.5" /> Source Freshness Report
        </h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[11px]">
          <FRow label="Round source" value={data.roundSource === "canonical" ? "get_current_afl_round_safe" : "stat board week fallback"} />
          <FRow label="Current round" value={String(data.currentRound || "unknown")} />
          <FRow label="Round status" value={data.roundInfo?.round_status ?? "—"} />
          <FRow label="Total games (round)" value={String(data.roundInfo?.total_games ?? data.matches.length)} />
          <FRow label="Completed games" value={String(data.roundInfo?.completed_games ?? "—")} />
          <FRow label="In-progress" value={String(data.roundInfo?.in_progress_games ?? "—")} />
          <FRow label="Should rollover" value={data.roundInfo?.should_rollover ? "yes" : "no"} />
          <FRow label="Games/matches loaded" value={String(data.matches.length)} />
          <FRow label="Disposal player rows" value={String(data.disposalPlayers.length)} />
          <FRow label="Goal player rows" value={String(data.goalPlayers.length)} />
          <FRow label="Team disposal rows" value={String(data.teamDisposals.length)} />
          <FRow label="Team goal rows" value={String(data.teamGoals.length)} />
          <FRow label="Team score rows" value={String(data.teamScore.length)} />
          <FRow label="Post ideas generated" value={String(posts.length)} />
          <FRow label="Cross-game shortlists" value={String(shortlistCount)} />
          <FRow label="Content Intel refreshed" value={fmtTime(data.loadedAt)} />
          <FRow label="Refetch interval" value="Every 5 minutes" />
          <FRow label="Focus refetch" value="If older than 5 min" />
          <FRow label="Post regen method" value="useMemo — regenerates on every data change" />
          <FRow label="localStorage cache" value="None — fully live" />
        </div>
      </div>
      <div className="text-[10px] text-zinc-600 p-2">
        All data sourced from Supabase RPCs. No OpenAI. No AI summaries. No hardcoded round.
        Stat families available: {FAMILY_CFG.map(f => f.label).join(", ")}.
      </div>
    </div>
  );
}

function FRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300 font-mono">{value}</span>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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
  const [data, setData] = useState<CIData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedAtRef = useRef<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCIData();
      setData(result);
      loadedAtRef.current = result.loadedAt;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error loading data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    const id = setInterval(() => { fetchAll(); }, STALE_MS);
    return () => clearInterval(id);
  }, [fetchAll]);
  useEffect(() => {
    function onFocus() {
      if (!loadedAtRef.current) return;
      if (Date.now() - loadedAtRef.current.getTime() > STALE_MS) fetchAll();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchAll]);

  // Build opponent concession map for enriching player rows
  const concessionMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of data?.teamDisposals ?? []) {
      if (t.opponent_conceded_l5 != null) m.set(t.team_id, t.opponent_conceded_l5);
    }
    return m;
  }, [data]);

  // Post ideas regenerated from live data
  const allPosts = useMemo(() => data ? buildPosts(data, concessionMap) : [], [data, concessionMap]);

  const statusLine = data
    ? `Live stats · ${data.roundLabel} · refreshed ${fmtTime(data.loadedAt)} · ${data.matches.length} games loaded`
    : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <AdminPageHeader
        title="Content Intel"
        subtitle="Private stat research board — current round · all teams · all games"
      />

      {/* Status bar */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 min-w-0">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="truncate">{loading ? "Refreshing…" : (statusLine ?? "Loading…")}</span>
          {data?.roundInfo && (
            <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${
              data.roundInfo.round_status === "active"
                ? "bg-emerald-950/40 text-emerald-400 border-emerald-600/30"
                : "bg-zinc-900 text-zinc-400 border-zinc-700/30"
            }`}>
              {data.roundInfo.round_status}
            </span>
          )}
        </div>
        <button onClick={fetchAll} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition-colors disabled:opacity-50 shrink-0">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <SCard label="Round" value={data.currentRound ? `Round ${data.currentRound}` : "—"} sub={data.roundInfo ? `${data.roundInfo.total_games} games · ${data.roundInfo.completed_games} done` : "—"} />
          <SCard label="Games loaded" value={String(data.matches.length)} sub={data.matches.map(m => m.match_label).join(" · ") || "—"} />
          <SCard label="Player rows" value={String(data.disposalPlayers.length + data.goalPlayers.length)} sub={`${data.disposalPlayers.length} disposal + ${data.goalPlayers.length} goal`} />
          <SCard label="Post ideas" value={String(allPosts.length)} sub={`${[...new Set(allPosts.map(p => p.category))].length} categories`} />
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-950/30 border border-red-800/30 rounded text-[12px] text-red-400">{error}</div>
      )}

      {/* Tab bar — underline indicator style */}
      <div className="flex gap-0 mb-6 border-b border-zinc-800 overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`relative px-4 py-2.5 text-[12px] font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === tab ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}>
            {tab}
            {activeTab === tab && <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-t bg-zinc-100" />}
          </button>
        ))}
      </div>

      {/* Loading / error states */}
      {!data && loading && <div className="py-20 text-center text-zinc-500">Fetching live stat data…</div>}
      {!data && !loading && !error && <div className="py-20 text-center text-zinc-500">Loading…</div>}

      {data && (
        <div>
          {activeTab === "Player Stat Angles"    && <PlayerStatAngles data={data} concessionMap={concessionMap} />}
          {activeTab === "Team / Match Angles"   && <TeamMatchAngles data={data} />}
          {activeTab === "Same-Game Shortlists"  && <SameGameShortlists data={data} concessionMap={concessionMap} />}
          {activeTab === "Cross-Game Shortlists" && <CrossGameShortlists data={data} concessionMap={concessionMap} />}
          {activeTab === "Post Ideas"            && <PostIdeas posts={allPosts} />}
          {activeTab === "Freshness"             && (
            <FreshnessView
              data={data}
              posts={allPosts}
              shortlistCount={/* estimated from common shortlist count */ 10}
            />
          )}
        </div>
      )}
    </div>
  );
}
