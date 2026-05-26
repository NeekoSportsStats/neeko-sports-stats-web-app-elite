/**
 * Game Picks Engine — admin-only.
 *
 * Produces per-game pick cards for the Social Post Planner "Game Picks" tab.
 * No betting language. No public exposure. Data-driven copy only.
 */
import type { StatBoardPlayer, StatBoardMatch } from "@/features/afl/stat-board/types";

// ─── Output types ─────────────────────────────────────────────────────────────

export type GamePickLens = "disposals" | "goals";

export interface GamePickPlayer {
  player_id: number;
  player_name: string;
  team_name: string;
  /** Best threshold for this lens (e.g. 25 for disposals, 2 for goals) */
  threshold: number;
  hit_rate: number;
  l5_avg: number | null;
  season_avg: number | null;
  games_played: number;
  projection: number | null;
  position_group: string | null;
  /**
   * Composite consistency score (0–100).
   * hitRate*50 + sampleCoverage*15 + l5Support*15 + seasonSupport*10 + projectionSupport*5 + availabilityConfidence*5
   */
  consistency_score: number;
  /** Short copy line ready for social post use. */
  copy_line: string;
}

export interface GamePick {
  match_id: number;
  match_label: string;
  game_date: string;
  venue: string;
  home_team_name: string;
  away_team_name: string;
  week: number;
  round: string;
  is_free_match: boolean;
  disposal_picks: GamePickPlayer[];
  goal_picks: GamePickPlayer[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getHitRate(p: StatBoardPlayer, threshold: number): number {
  if (p.all_threshold_hit_rates) {
    const entry = p.all_threshold_hit_rates[String(threshold)];
    if (entry && entry.games > 0) return entry.rate;
  }
  if (p.threshold === threshold && p.hit_rate_last_10 !== null) {
    return p.hit_rate_last_10;
  }
  return 0;
}

function getGamesAtThreshold(p: StatBoardPlayer, threshold: number): number {
  if (p.all_threshold_hit_rates) {
    const entry = p.all_threshold_hit_rates[String(threshold)];
    if (entry) return entry.games;
  }
  if (p.threshold === threshold) return p.games_played ?? 0;
  return 0;
}

function getL5Avg(p: StatBoardPlayer): number {
  return p.last_5_avg ?? p.last_10_avg ?? 0;
}

function getSeasonAvg(p: StatBoardPlayer): number {
  return p.season_avg ?? 0;
}

/**
 * Selects the best realistic disposal threshold for a player.
 * Prefers highest threshold where hit_rate >= 0.50.
 * Falls back to the highest threshold >= 0.40 if nothing qualifies at 0.50.
 */
function bestDisposalThreshold(p: StatBoardPlayer): number {
  const DISPOSAL_THRESHOLDS = [30, 25, 20, 15] as const;
  for (const t of DISPOSAL_THRESHOLDS) {
    if (getHitRate(p, t) >= 0.50) return t;
  }
  for (const t of DISPOSAL_THRESHOLDS) {
    if (getHitRate(p, t) >= 0.40) return t;
  }
  return 15;
}

/**
 * Selects the best goal threshold.
 * 3+ only if hit_rate >= 0.50 or L5 >= 2.3.
 * 2+ if hit_rate >= 0.45.
 * Falls back to 1+.
 */
function bestGoalThreshold(p: StatBoardPlayer): number {
  if (getHitRate(p, 3) >= 0.50 || getL5Avg(p) >= 2.3) return 3;
  if (getHitRate(p, 2) >= 0.45) return 2;
  return 1;
}

/**
 * Consistency score (0–100) for a player at a given threshold.
 *
 * Components:
 *   hitRate         * 50  — primary signal
 *   sampleCoverage  * 15  — reliability of the sample (games >= 8 = full)
 *   l5Support       * 15  — L5 avg vs threshold (above = 1.0, within 20% below = 0.5)
 *   seasonSupport   * 10  — season avg vs threshold
 *   projectionSupport * 5 — projection vs threshold (if present)
 *   availabilityConf * 5  — base availability confidence (always 1.0 for included players)
 */
function computeConsistencyScore(
  p: StatBoardPlayer,
  threshold: number,
): number {
  const hitRate = getHitRate(p, threshold);
  const games = getGamesAtThreshold(p, threshold);
  const l5 = getL5Avg(p);
  const seasonAvg = getSeasonAvg(p);
  const projection = p.projection;

  const sampleCoverage = Math.min(games / 8, 1.0);

  const l5Support =
    l5 >= threshold ? 1.0 : l5 >= threshold * 0.8 ? 0.5 : 0.0;

  const seasonSupport =
    seasonAvg >= threshold ? 1.0 : seasonAvg >= threshold * 0.8 ? 0.5 : 0.0;

  const projectionSupport =
    projection !== null
      ? projection >= threshold
        ? 1.0
        : projection >= threshold * 0.85
          ? 0.5
          : 0.0
      : 0.0;

  const availabilityConfidence = 1.0;

  const raw =
    hitRate * 50 +
    sampleCoverage * 15 +
    l5Support * 15 +
    seasonSupport * 10 +
    projectionSupport * 5 +
    availabilityConfidence * 5;

  return Math.round(Math.min(raw, 100));
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function buildDisposalCopyLine(p: StatBoardPlayer, threshold: number): string {
  const hitRate = getHitRate(p, threshold);
  const l5 = getL5Avg(p);
  const games = getGamesAtThreshold(p, threshold);
  const sampleText = games >= 8 ? "last 10" : `last ${games}`;

  const parts: string[] = [];
  parts.push(`${threshold}+ disposals: ${pct(hitRate)} (${sampleText})`);

  if (l5 > 0) {
    parts.push(`L5 avg ${l5.toFixed(1)}`);
  }

  if (p.projection !== null && p.projection > 0) {
    parts.push(`proj ${p.projection.toFixed(0)}`);
  }

  return `${p.player_name} (${p.team_name}) — ${parts.join(" | ")}`;
}

function buildGoalCopyLine(p: StatBoardPlayer, threshold: number): string {
  const hitRate = getHitRate(p, threshold);
  const l5 = getL5Avg(p);
  const games = getGamesAtThreshold(p, threshold);
  const sampleText = games >= 8 ? "last 10" : `last ${games}`;

  const thresholdLabel = threshold === 1 ? "1+ goal" : `${threshold}+ goals`;
  const parts: string[] = [];
  parts.push(`${thresholdLabel}: ${pct(hitRate)} (${sampleText})`);

  if (l5 > 0) {
    parts.push(`L5 avg ${l5.toFixed(1)}`);
  }

  if (p.projection !== null && p.projection > 0) {
    parts.push(`proj ${p.projection.toFixed(1)}`);
  }

  return `${p.player_name} (${p.team_name}) — ${parts.join(" | ")}`;
}

function toGamePickPlayer(
  p: StatBoardPlayer,
  threshold: number,
  lens: GamePickLens,
): GamePickPlayer {
  const score = computeConsistencyScore(p, threshold);
  const copyLine =
    lens === "disposals"
      ? buildDisposalCopyLine(p, threshold)
      : buildGoalCopyLine(p, threshold);

  return {
    player_id: p.player_id,
    player_name: p.player_name,
    team_name: p.team_name,
    threshold,
    hit_rate: getHitRate(p, threshold),
    l5_avg: p.last_5_avg,
    season_avg: p.season_avg,
    games_played: p.games_played ?? 0,
    projection: p.projection,
    position_group: p.position_group,
    consistency_score: score,
    copy_line: copyLine,
  };
}

// ─── Minimum quality gates ────────────────────────────────────────────────────

const MIN_GAMES_DISPOSAL = 4;
const MIN_HIT_RATE_DISPOSAL = 0.40;
const MIN_GAMES_GOAL = 4;
const MIN_HIT_RATE_GOAL_1 = 0.40;
const MIN_HIT_RATE_GOAL_2PLUS = 0.35;
const MAX_PICKS_PER_GAME_DISPOSAL = 6;
const MAX_PICKS_PER_GAME_GOAL = 5;

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Builds per-game pick cards for every match in `matches`.
 *
 * Players in `unavailablePlayerIds` are excluded from all pick pools.
 * Disposal players and goal players are sourced from `disposalPlayers`/`goalPlayers`
 * which already carry the stat_lens context from the stat board RPC.
 */
export function buildGamePicks(
  matches: StatBoardMatch[],
  disposalPlayers: StatBoardPlayer[],
  goalPlayers: StatBoardPlayer[],
  unavailablePlayerIds: Set<number> = new Set(),
): GamePick[] {
  const result: GamePick[] = [];

  for (const match of matches) {
    const teamIds = new Set([match.home_team_id, match.away_team_id]);

    // ── Disposal picks ────────────────────────────────────────────────────────
    const disposalCandidates = disposalPlayers.filter(
      p =>
        teamIds.has(p.team_id) &&
        !unavailablePlayerIds.has(p.player_id) &&
        (p.games_played ?? 0) >= MIN_GAMES_DISPOSAL,
    );

    const disposalPickMap = new Map<number, GamePickPlayer>();
    for (const p of disposalCandidates) {
      const threshold = bestDisposalThreshold(p);
      const hr = getHitRate(p, threshold);
      if (hr < MIN_HIT_RATE_DISPOSAL) continue;
      const pick = toGamePickPlayer(p, threshold, "disposals");
      const existing = disposalPickMap.get(p.player_id);
      if (!existing || pick.consistency_score > existing.consistency_score) {
        disposalPickMap.set(p.player_id, pick);
      }
    }

    const disposalPicks = [...disposalPickMap.values()]
      .sort((a, b) => b.consistency_score - a.consistency_score)
      .slice(0, MAX_PICKS_PER_GAME_DISPOSAL);

    // ── Goal picks ────────────────────────────────────────────────────────────
    const goalCandidates = goalPlayers.filter(
      p =>
        teamIds.has(p.team_id) &&
        !unavailablePlayerIds.has(p.player_id) &&
        (p.games_played ?? 0) >= MIN_GAMES_GOAL,
    );

    const goalPickMap = new Map<number, GamePickPlayer>();
    for (const p of goalCandidates) {
      const threshold = bestGoalThreshold(p);
      const hr = getHitRate(p, threshold);
      const minHr = threshold >= 2 ? MIN_HIT_RATE_GOAL_2PLUS : MIN_HIT_RATE_GOAL_1;
      if (hr < minHr) continue;
      const pick = toGamePickPlayer(p, threshold, "goals");
      const existing = goalPickMap.get(p.player_id);
      if (!existing || pick.consistency_score > existing.consistency_score) {
        goalPickMap.set(p.player_id, pick);
      }
    }

    const goalPicks = [...goalPickMap.values()]
      .sort((a, b) => b.consistency_score - a.consistency_score)
      .slice(0, MAX_PICKS_PER_GAME_GOAL);

    result.push({
      match_id: match.match_id,
      match_label: match.match_label,
      game_date: match.game_date,
      venue: match.venue,
      home_team_name: match.home_team_name,
      away_team_name: match.away_team_name,
      week: match.week,
      round: match.round,
      is_free_match: match.is_free_match,
      disposal_picks: disposalPicks,
      goal_picks: goalPicks,
    });
  }

  // Sort: free matches first, then by match order (preserved from input order)
  return result.sort((a, b) => {
    if (a.is_free_match !== b.is_free_match) return a.is_free_match ? -1 : 1;
    return 0;
  });
}

// ─── Filtering helpers for UI ─────────────────────────────────────────────────

export type ConsistencyTier = "all" | "high" | "medium" | "low";

export function filterPicksByConsistency(
  picks: GamePickPlayer[],
  tier: ConsistencyTier,
): GamePickPlayer[] {
  if (tier === "all") return picks;
  if (tier === "high") return picks.filter(p => p.consistency_score >= 65);
  if (tier === "medium") return picks.filter(p => p.consistency_score >= 40 && p.consistency_score < 65);
  return picks.filter(p => p.consistency_score < 40);
}

export function consistencyLabel(score: number): string {
  if (score >= 70) return "Strong";
  if (score >= 50) return "Moderate";
  if (score >= 35) return "Speculative";
  return "Weak";
}

export function consistencyColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 50) return "text-yellow-400";
  if (score >= 35) return "text-orange-400";
  return "text-zinc-500";
}

/** Formats all picks for a game into a copyable plain-text block. */
export function formatGamePicksForCopy(game: GamePick, lens: GamePickLens): string {
  const picks = lens === "disposals" ? game.disposal_picks : game.goal_picks;
  if (picks.length === 0) return `${game.match_label}\nNo qualifying ${lens} picks.`;

  const lines: string[] = [`${game.match_label} — ${lens.charAt(0).toUpperCase() + lens.slice(1)} Picks`];
  for (const p of picks) {
    lines.push(`• ${p.copy_line} [Score: ${p.consistency_score}]`);
  }
  return lines.join("\n");
}
