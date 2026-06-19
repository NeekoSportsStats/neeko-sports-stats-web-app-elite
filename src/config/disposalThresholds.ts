/**
 * Central typed threshold-policy module for disposal statistics.
 *
 * Each named profile describes exactly which integer thresholds are valid for
 * a specific surface. Consumers should import the relevant profile rather than
 * hardcoding arrays inline.
 *
 * WHY: Multiple surfaces (admin planner, public stat board, social posts, public
 * expanded player panel) each require a different set of thresholds. Centralising
 * them here prevents drift between surfaces and makes it easy to audit all
 * threshold-related decisions in one place.
 */

/** Integer thresholds used by the admin social planner UI (full range). */
export const adminSocialPlanner = range(15, 40) as readonly number[];

/** Integer thresholds shown in the public collapsed stat-board card columns. */
export const publicCollapsedCard = [15, 20, 25, 30] as const;

/** Integer thresholds available in the public expanded player panel threshold selector. */
export const publicExpandedPlayer = range(10, 40) as readonly number[];

/** Integer thresholds used when selecting top hit-rate rows for social post copy. */
export const socialPostTopHitRates = range(15, 40) as readonly number[];

/** Integer thresholds shown as columns in the social post stats board table. */
export const socialPostStatsBoard = [15, 20, 25, 30] as const;

// ─── Expanded threshold profiles for the public expanded-player Season Hit Rates table ──

/** Integer thresholds for the expanded kicks panel (full range). */
export const publicExpandedKicks = range(5, 25) as readonly number[];

/** Integer thresholds for the expanded marks panel (full range). */
export const publicExpandedMarks = range(2, 12) as readonly number[];

/** Integer thresholds for the expanded tackles panel (full range). */
export const publicExpandedTackles = range(2, 10) as readonly number[];

/** Integer thresholds for the expanded goals panel (full range). */
export const publicExpandedGoals = [1, 2, 3, 4, 5, 6] as const;

/** Integer thresholds for the expanded fantasy panel (full range). */
export const publicExpandedFantasy = range(50, 130) as readonly number[];

/**
 * Returns an array of integers from `start` to `end` inclusive, step 1.
 * Both bounds are inclusive. `start` must be ≤ `end`.
 */
export function range(start: number, end: number): number[] {
  if (start > end) {
    throw new RangeError(`disposalThresholds.range: start (${start}) must be ≤ end (${end})`);
  }
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}
