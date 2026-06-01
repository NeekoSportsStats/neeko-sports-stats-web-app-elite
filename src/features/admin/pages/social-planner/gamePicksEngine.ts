/**
 * Game Picks Engine — admin-only.
 *
 * Produces per-game pick cards for the Social Post Planner "Game Picks" tab.
 * No betting language. No public exposure. Data-driven copy only.
 *
 * All hit-rate display uses statLineEngine which guarantees:
 *   - Rates are normalised to 0–1 before any arithmetic
 *   - Display always uses "7/10" and "70%", never "3000%"
 */
import type { StatBoardPlayer, StatBoardMatch } from "@/features/afl/stat-board/types";
import {
  rankDisposalCandidatesForTeams,
  rankGoalCandidatesForTeams,
  rankGoalCandidatesAt1Plus,
  tierLabel,
  tierColor,
  resolveFreshLast5ForSocial,
  formatHitRecord,
  formatRateAsPercent,
  getSeasonHitRecord,
} from "./statLineEngine";
import type { CandidateScore, ConfidenceTier } from "./statLineEngine";

// ─── Output types ─────────────────────────────────────────────────────────────

export type GamePickLens = "disposals" | "goals";

export interface GamePickPlayer {
  player_id: number;
  player_name: string;
  team_name: string;
  threshold: number;
  /** "disposals" or "goals" — used by post builders to route voiceover/copy correctly. */
  statFamily: "disposals" | "goals";
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
   * 25+ tier explicitly excludes players who qualify at 30+ threshold.
   */
  publicContentTier: 30 | 25 | 20 | 15 | null;
  /** Admin-only warnings: thin sample, anomalous recent values, etc. Never shown publicly. */
  adminWarnings: string[];
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
  /**
   * All players who qualify at the 1+ goals threshold for this game,
   * regardless of whether they also qualify at 2+ or 3+.
   * Used by the game-day 1+ Goals post so high-tier scorers like Harry Sharp
   * (who qualifies at 2+) are not excluded from the 1+ Goals post.
   */
  goal_picks_1plus: GamePickPlayer[];
}

// ─── Conversion helper ────────────────────────────────────────────────────────

function toGamePickPlayer(c: CandidateScore, statFamily: "disposals" | "goals"): GamePickPlayer {
  // Use the validated resolver — it cross-checks the strip avg against scalar l5_avg
  // so stale array ordering bugs surface as a suppressed strip + warning rather than
  // wrong data reaching posts or AI prompts.
  const resolved = resolveFreshLast5ForSocial({
    last_10_values: c.last_10_values ?? null,
    last_5_avg: c.l5Avg,
  } as Pick<StatBoardPlayer, "last_10_values" | "last_5_avg"> as StatBoardPlayer);

  // Use full-season hit record for all public display fields.
  // Qualification logic (threshold selection, scoring) still uses last-10 hitRecord.
  const displayRec = c.seasonHitRecord;

  const adminWarnings: string[] = [];

  if (c.games < 5) {
    adminWarnings.push(`Thin sample — only ${c.games} game${c.games === 1 ? "" : "s"} played. Treat with caution.`);
  }

  if (c.l5Avg != null && c.l5Avg > 0 && resolved.values.length > 0) {
    const anomalous = resolved.values.filter(v => v < c.l5Avg! * 0.5);
    if (anomalous.length > 0) {
      adminWarnings.push(
        `Review Last 5 outlier — possible injury/sub-affected game. (${anomalous.join(", ")} vs L5 avg ${c.l5Avg.toFixed(1)})`
      );
    }
  }

  return {
    player_id: c.player_id,
    player_name: c.player_name,
    team_name: c.team_name,
    threshold: c.threshold,
    statFamily,
    hitRecord: displayRec.sample > 0
      ? formatHitRecord(displayRec.hits, displayRec.sample)
      : "—",
    hitPct: formatRateAsPercent(displayRec.rate),
    hitRate: displayRec.rate,
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
    adminWarnings,
  };
}

// ─── Limits ───────────────────────────────────────────────────────────────────

const MAX_PICKS_PER_GAME_DISPOSAL = 8;
const MAX_PICKS_PER_GAME_GOAL = 6;

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Builds per-game pick cards for every match in `matches`.
 *
 * Uses statLineEngine for all threshold selection and scoring — no inline
 * hit-rate arithmetic that could produce "3000%" display values.
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

    // 1+ Goals post pool: evaluates all players at 1+ threshold specifically.
    // Includes 2+ and 3+ tier players — they are excellent 1+ scorers too.
    const goalCandidates1Plus = rankGoalCandidatesAt1Plus(
      goalPlayers,
      teamIds,
      unavailablePlayerIds,
    );

    // Filter out Low-tier picks from default view — keep High + Medium
    // (UI can override with ConsistencyTier filter)
    const disposalPicks = disposalCandidates
      .filter(c => c.tier === "High" || c.tier === "Medium")
      .slice(0, MAX_PICKS_PER_GAME_DISPOSAL)
      .map(c => toGamePickPlayer(c, "disposals"));

    const goalPicks = goalCandidates
      .filter(c => c.tier === "High" || c.tier === "Medium")
      .slice(0, MAX_PICKS_PER_GAME_GOAL)
      .map(c => toGamePickPlayer(c, "goals"));

    const goalPicks1Plus = goalCandidates1Plus
      .filter(c => c.tier === "High" || c.tier === "Medium" || c.tier === "Low")
      .slice(0, MAX_PICKS_PER_GAME_GOAL)
      .map(c => toGamePickPlayer(c, "goals"));

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
      goal_picks_1plus: goalPicks1Plus,
    });
  }

  // Free matches first, then preserve input order
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

/** Human-readable label for a pick's confidence tier. */
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

// Re-export tier helpers for use in UI
export { tierLabel, tierColor };

/** Formats all picks for a game into a copyable plain-text block. */
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
