/**
 * Insight lens guard — prevents AI insight content from one stat context
 * being displayed under a different stat lens.
 *
 * The existing `get_stat_board_player_ai_insight` RPC returns rankings-cache
 * AI summaries that discuss fantasy scoring.  They carry no `stat_lens` tag,
 * meaning they are "untagged" and must never be rendered as if they describe
 * disposals, goals, marks, tackles, or kicks.
 *
 * An insight is safe to display only when:
 *   1. It carries a `stat_lens` that exactly matches the current lens, OR
 *   2. The current lens is "fantasy" AND the insight is untagged (the existing
 *      AI text is fantasy-framed and may be shown in the fantasy view).
 *
 * In every other combination the insight must be suppressed.
 */

import type { StatLens } from "@/features/afl/stat-board/types";

export interface InsightWithLens {
  player_id?: number;
  stat_lens?: string | null;
  season?: number | null;
  summary_short?: string | null;
  summary_long?: string | null;
  ai_generated_at?: string | null;
  prompt_version?: string | null;
}

/**
 * Returns true when `insight` is safe to render under `activeLens`.
 *
 * Rules:
 * - null insight → false (nothing to show)
 * - insight has a stat_lens tag that matches activeLens → true
 * - insight has a stat_lens tag that does NOT match activeLens → false
 * - insight has NO stat_lens tag AND activeLens is "fantasy" → true
 *   (existing untagged AI text is fantasy-framed)
 * - insight has NO stat_lens tag AND activeLens is anything else → false
 */
export function isInsightValidForLens(
  insight: InsightWithLens | null | undefined,
  activeLens: StatLens
): boolean {
  if (insight == null) return false;

  const tag = insight.stat_lens ?? null;

  if (tag !== null && tag !== undefined) {
    // Tagged insight: must match exactly
    return tag === activeLens;
  }

  // Untagged insight: only safe under fantasy
  return activeLens === "fantasy";
}

/**
 * Returns true when the insight belongs to the expected player.
 * Guards against stale insight from the previous expanded player
 * being briefly visible after the expanded player changes.
 */
export function isInsightForPlayer(
  insight: InsightWithLens | null | undefined,
  playerId: number
): boolean {
  if (insight == null) return false;
  if (insight.player_id == null) return true; // no player_id field → can't verify, allow
  return insight.player_id === playerId;
}

/**
 * Returns true when the insight matches the expected season.
 */
export function isInsightForSeason(
  insight: InsightWithLens | null | undefined,
  season: number
): boolean {
  if (insight == null) return false;
  if (insight.season == null) return true; // no season field → can't verify, allow
  return insight.season === season;
}
