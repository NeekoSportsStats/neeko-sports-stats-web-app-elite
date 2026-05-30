/**
 * Game Picks Engine — admin-only.
 *
 * Produces per-game pick cards for the Social Post Planner "Game Picks" tab.
 * No betting language. No public exposure. Data-driven copy only.
 *
 * Uses getPublicDisposalContentTier() as the canonical tier source.
 * All hit-rate display guaranteed to show correct percentages via statLineEngine.
 */
import type { StatBoardPlayer, StatBoardMatch } from "@/features/afl/stat-board/types";
import {
  rankDisposalCandidatesForTeams,
  rankGoalCandidatesForTeams,
  tierLabel,
  tierColor,
  resolveFreshLast5ForSocial,
  formatHitRecord,
  formatRateAsPercent,
  assignDisposalMarketingTier,
} from "./statLineEngine";
import type { CandidateScore, ConfidenceTier } from "./statLineEngine";

// ─── Output types ─────────────────────────────────────────────────────────────

export type GamePickLens = "disposals" | "goals";

export interface GamePickPlayer {
  player_id: number;
  player_name: string;
  team_name: string;
  threshold: number;
  /** "7/10" style */
  hitRecord: string;
  /** "70%" style */
  hitPct: string;
  /** 0–1 decimal */
  hitRate: number;
  l5_avg: number | null;
  season_avg: number | null;
  games_played: number;
  projection: number | null;
  position_group: string | null;
  tier: ConfidenceTier;
  /** 0–100 composite score */
  consistency_score: number;
  /** Short copy line ready for social post use. */
  copy_line: string;
  /** Actual last 5 stat values, newest first. */
  last_5_values: number[];
  /** Formatted strip e.g. "35 · 34 · 36 · 33 · 36" or null if < 2 values. */
  last_5_strip: string | null;
  /** Non-null when the Last 5 strip was suppressed due to inconsistency with scalar avg. */
  last5Warning: string | null;
  /**
   * Public content tier: the disposal threshold this player should be labelled
   * under in social posts (30/25/20/15). Null means no qualifying tier.
   * Uses getPublicDisposalContentTier() — form-first canonical logic.
   */
  publicContentTier: 30 | 25 | 20 | 15 | null;
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

// ─── Conversion helper ────────────────────────────────────────────────────────

function toGamePickPlayer(c: CandidateScore): GamePickPlayer {
  // Use validated resolver — cross-checks strip avg against scalar l5_avg
  const resolved = resolveFreshLast5ForSocial({
    last_10_values: c.last_10_values ?? null,
    last_5_avg: c.l5Avg,
  } as Pick<StatBoardPlayer, "last_10_values" | "last_5_avg"> as StatBoardPlayer);

  return {
    player_id: c.player_id,
    player_name: c.player_name,
    team_name: c.team_name,
    threshold: c.threshold,
    hitRecord: c.hitRecord.sample > 0
      ? formatHitRecord(c.hitRecord.hits, c.hitRecord.sample)
      : "—",
    hitPct: formatRateAsPercent(c.hitRecord.rate),
    hitRate: c.hitRecord.rate,
    l5_avg: c.l5Avg,
    season_avg: c.seasonAvg,
    games_played: c.games,
    projection: c.projection,
    position_group: c.position_group,
    tier: c.tier,
    consistency_score: c.score,
    copy_line: c.copyLine,
    last_5_values: resolved.values,
    last_5_strip: resolved.strip,
    last5Warning: resolved.warning,
    publicContentTier: c.publicContentTier ?? null,
  };
}

// ─── Limits ───────────────────────────────────────────────────────────────────

const MAX_PICKS_PER_GAME_DISPOSAL = 8;
const MAX_PICKS_PER_GAME_GOAL = 6;

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildGamePicks(
  matches: StatBoardMatch[],
  disposalPlayers: StatBoardPlayer[],
  goalPlayers: StatBoardPlayer[],
  unavailablePlayerIds: Set<number> = new Set(),
): GamePick[] {
  const result: GamePick[] = [];

  for (const match of matches) {
    const teamIds = new Set([match.home_team_id, match.away_team_id]);

    const disposalCandidates = rankDisposalCandidatesForTeams(
      disposalPlayers,
      teamIds,
      unavailablePlayerIds,
    );

    const goalCandidates = rankGoalCandidatesForTeams(
      goalPlayers,
      teamIds,
      unavailablePlayerIds,
    );

    const disposalPicks = disposalCandidates
      .filter(c => c.tier === "High" || c.tier === "Medium")
      .slice(0, MAX_PICKS_PER_GAME_DISPOSAL)
      .map(toGamePickPlayer);

    const goalPicks = goalCandidates
      .filter(c => c.tier === "High" || c.tier === "Medium")
      .slice(0, MAX_PICKS_PER_GAME_GOAL)
      .map(toGamePickPlayer);

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
  if (tier === "high") return picks.filter(p => p.tier === "High");
  if (tier === "medium") return picks.filter(p => p.tier === "Medium");
  return picks.filter(p => p.tier === "Low");
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

export { tierLabel, tierColor };

export function formatGamePicksForCopy(game: GamePick, lens: GamePickLens): string {
  const picks = lens === "disposals" ? game.disposal_picks : game.goal_picks;
  if (picks.length === 0) return `${game.match_label}\nNo qualifying ${lens} picks.`;

  const lines: string[] = [`${game.match_label} — ${lens.charAt(0).toUpperCase() + lens.slice(1)} Picks`];
  for (const p of picks) {
    const strip = p.last_5_strip ? ` | Last 5: ${p.last_5_strip}` : "";
    lines.push(`• ${p.copy_line} [${p.tier} | Score: ${p.consistency_score}${strip}]`);
  }
  return lines.join("\n");
}

/**
 * Returns the disposal players from a game that qualify for the strict 20+ tier only.
 * Uses canonical getPublicDisposalContentTier — excludes 25+/30+ players.
 */
export function getStrict20PlusPlayers(picks: GamePickPlayer[]): GamePickPlayer[] {
  return picks.filter(p => p.publicContentTier === 20);
}

/**
 * Returns players at 25+ or 30+ tier from a game's disposal picks.
 * Used to fill thin 20+ posts as Mixed Disposal Watch.
 */
export function getHigherTierDisposalPlayers(picks: GamePickPlayer[]): GamePickPlayer[] {
  return picks.filter(p => p.publicContentTier === 25 || p.publicContentTier === 30);
}
