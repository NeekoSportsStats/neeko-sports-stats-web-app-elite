/**
 * Stat Line Engine — shared, admin-only.
 * Single source of truth for threshold selection, hit-rate formatting,
 * and candidate ranking across Game Picks, weekly posts, and same-day posts.
 *
 * Key invariant: all internal rates are stored and returned as 0–1 decimals.
 * Raw values from the DB can arrive as either 0–1 or 0–100 — normaliseRate()
 * handles the conversion at the boundary.
 */
import type { StatBoardPlayer } from "@/features/afl/stat-board/types";

// ─── Rate normalisation ───────────────────────────────────────────────────────

/**
 * Normalises a raw hit-rate value to a 0–1 decimal.
 * DB RPCs sometimes return the rate as 0–100 (e.g. 70 for 70%),
 * sometimes as 0–1 (e.g. 0.70). This function handles both.
 */
export function normaliseRate(raw: number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  // If value is > 1 it's already a percentage — divide by 100
  return raw > 1 ? raw / 100 : raw;
}

/**
 * Computes a hit rate from raw game values.
 *
 * Counts games where `value >= threshold`, excluding BYE/DNP (null values).
 * Returns { hits, sample, rate } where rate is 0–1.
 * Returns { hits: 0, sample: 0, rate: 0 } when there are no qualifying games.
 *
 * Example: computeHitRateFromValues([23, 24, 24, 25], 24) → { hits: 3, sample: 4, rate: 0.75 }
 */
export function computeHitRateFromValues(
  values: (number | null)[],
  threshold: number,
): { hits: number; sample: number; rate: number } {
  const actual = values.filter((v): v is number => v !== null);
  const sample = actual.length;
  if (sample === 0) return { hits: 0, sample: 0, rate: 0 };
  const hits = actual.filter(v => v >= threshold).length;
  return { hits, sample, rate: hits / sample };
}

// ─── Hit-record retrieval ─────────────────────────────────────────────────────

export interface HitRecord {
  hits: number;
  sample: number;
  /** Always 0–1 decimal */
  rate: number;
}

/**
 * Returns the last-10 hit record for a player at a given threshold.
 * Prefers all_threshold_hit_rates; falls back to hit_rate_last_10.
 * Used internally by evaluateDisposalLine/evaluateGoalLine/assignDisposalMarketingTier
 * for threshold qualification logic (intentionally last-10 based).
 */
export function getRecentHitRecord(
  p: StatBoardPlayer,
  threshold: number,
): HitRecord {
  const entry = p.all_threshold_hit_rates?.[String(threshold)];
  if (entry && entry.games > 0) {
    return {
      hits: entry.hits,
      sample: entry.games,
      rate: normaliseRate(entry.rate),
    };
  }
  // Fallback: use hit_rate_last_10 with games_played as sample
  const rate = normaliseRate(p.hit_rate_last_10);
  const sample = p.games_played ?? 0;
  return {
    hits: Math.round(rate * sample),
    sample,
    rate,
  };
}

/**
 * Returns the full-season hit record for a player at a given threshold.
 * Reads season_threshold_hit_rates (denominator = all season games, not capped at 10).
 * Used by formatPublicStatLine and all public copy surfaces.
 *
 * Falls back to getRecentHitRecord if season data is unavailable.
 */
export function getSeasonHitRecord(
  p: StatBoardPlayer,
  threshold: number,
): HitRecord {
  const entry = p.season_threshold_hit_rates?.[String(threshold)];
  if (entry && entry.games > 0) {
    return {
      hits: entry.hits,
      sample: entry.games,
      rate: normaliseRate(entry.rate),
    };
  }
  // Fallback to last-10 record if season data not yet available
  return getRecentHitRecord(p, threshold);
}

// ─── Display formatters ───────────────────────────────────────────────────────

/** Returns "7/10" style record string. */
export function formatHitRecord(hits: number, sample: number): string {
  return `${hits}/${sample}`;
}

/** Returns "70%" style percentage string from a 0–1 decimal. */
export function formatRateAsPercent(rate01: number): string {
  return `${Math.round(rate01 * 100)}%`;
}

/**
 * Returns both display strings from a HitRecord: { record: "7/10", pct: "70%" }.
 */
export function formatRateFromHits(rec: HitRecord): { record: string; pct: string } {
  return {
    record: formatHitRecord(rec.hits, rec.sample),
    pct: formatRateAsPercent(rec.rate),
  };
}

// ─── Confidence tiers ─────────────────────────────────────────────────────────

export type ConfidenceTier = "High" | "Medium" | "Low" | "None";

// ─── Disposal line evaluation ─────────────────────────────────────────────────

export interface DisposalLineEval {
  threshold: 30 | 25 | 20 | 15;
  qualifies: boolean;
  tier: ConfidenceTier;
  hitRecord: HitRecord;
  l5Avg: number;
  seasonAvg: number;
  games: number;
}

/**
 * Evaluates whether a player qualifies at a specific disposal threshold.
 *
 * 30+ High:   hr ≥ 0.80 AND L5 ≥ 29.0 AND sample ≥ 7
 * 30+ Medium: hr ≥ 0.70 AND L5 ≥ 27.0 AND sample ≥ 5
 * 25+ High:   hr ≥ 0.80 AND L5 ≥ 25.0 AND sample ≥ 7   (tightened from 24.0)
 * 25+ Medium: hr ≥ 0.70 AND L5 ≥ 24.5 AND sample ≥ 7   (tightened from 22.0/5)
 *             OR hr ≥ 0.70 AND L5 ≥ 24.5 AND sample ≥ 5  (small-sample with L5 support)
 *   NOTE: A player qualifying at 30+ threshold is EXCLUDED from 25+ content tier.
 * 20+ High:   hr ≥ 0.75 AND L5 ≥ 19.0 AND sample ≥ 5
 * 20+ Medium: hr ≥ 0.60 AND L5 ≥ 18.0 AND sample ≥ 4
 * 15+ High:   hr ≥ 0.75 AND L5 ≥ 14.0 AND sample ≥ 5
 * 15+ Medium: hr ≥ 0.60 AND L5 ≥ 13.0 AND sample ≥ 4
 */
export function evaluateDisposalLine(
  p: StatBoardPlayer,
  threshold: 30 | 25 | 20 | 15,
): DisposalLineEval {
  const rec = getRecentHitRecord(p, threshold);
  const l5 = p.last_5_avg ?? p.season_avg ?? 0;
  const seasonAvg = p.season_avg ?? 0;
  const games = rec.sample;

  let tier: ConfidenceTier = "None";

  if (threshold === 30) {
    if (rec.rate >= 0.80 && l5 >= 29.0 && games >= 7) tier = "High";
    else if (rec.rate >= 0.70 && l5 >= 27.0 && games >= 5) tier = "Medium";
  } else if (threshold === 25) {
    // Exclude players who qualify at the 30+ tier — they belong to a higher content bucket.
    const rec30 = getRecentHitRecord(p, 30);
    const is30PlusTier = rec30.rate >= 0.70 && l5 >= 27.0 && rec30.sample >= 5;
    if (!is30PlusTier) {
      if (rec.rate >= 0.80 && l5 >= 25.0 && games >= 7) tier = "High";
      else if (rec.rate >= 0.70 && l5 >= 24.5 && games >= 5) tier = "Medium";
    }
  } else if (threshold === 20) {
    if (rec.rate >= 0.75 && l5 >= 19.0 && games >= 5) tier = "High";
    else if (rec.rate >= 0.60 && l5 >= 18.0 && games >= 4) tier = "Medium";
    // Also accept Low-end players in the 20+ bucket for general use
    else if (rec.rate >= 0.45 && l5 >= 17.0 && games >= 3) tier = "Low";
  } else {
    // 15+
    if (rec.rate >= 0.75 && l5 >= 14.0 && games >= 5) tier = "High";
    else if (rec.rate >= 0.60 && l5 >= 13.0 && games >= 4) tier = "Medium";
    else if (rec.rate >= 0.45 && l5 >= 12.0 && games >= 3) tier = "Low";
  }

  return {
    threshold,
    qualifies: tier !== "None",
    tier,
    hitRecord: rec,
    l5Avg: l5,
    seasonAvg,
    games,
  };
}

// ─── Goal line evaluation ─────────────────────────────────────────────────────

export interface GoalLineEval {
  threshold: 3 | 2 | 1;
  qualifies: boolean;
  tier: ConfidenceTier;
  hitRecord: HitRecord;
  l5Avg: number;
  games: number;
}

/**
 * Evaluates whether a player qualifies at a specific goal threshold.
 *
 * 3+ High:   hr ≥ 0.50 AND sample ≥ 7 AND L5 ≥ 2.2
 * 3+ Medium: hr ≥ 0.40 AND sample ≥ 5 AND L5 ≥ 2.0
 * 2+ High:   hr ≥ 0.60 AND sample ≥ 7 AND L5 ≥ 1.6
 * 2+ Medium: hr ≥ 0.45 AND sample ≥ 5 AND L5 ≥ 1.3
 * 1+ High:   hr ≥ 0.80 AND sample ≥ 5 AND L5 ≥ 0.8
 * 1+ Medium: hr ≥ 0.65 AND sample ≥ 5 AND L5 ≥ 0.6
 * 1+ Low:    hr ≥ 0.50 AND sample ≥ 4 AND L5 ≥ 0.4
 */
export function evaluateGoalLine(
  p: StatBoardPlayer,
  threshold: 3 | 2 | 1,
): GoalLineEval {
  const rec = getRecentHitRecord(p, threshold);
  const l5 = p.last_5_avg ?? p.season_avg ?? 0;
  const games = rec.sample;

  let tier: ConfidenceTier = "None";

  if (threshold === 3) {
    if (rec.rate >= 0.50 && games >= 7 && l5 >= 2.2) tier = "High";
    else if (rec.rate >= 0.40 && games >= 5 && l5 >= 2.0) tier = "Medium";
  } else if (threshold === 2) {
    if (rec.rate >= 0.60 && games >= 7 && l5 >= 1.6) tier = "High";
    else if (rec.rate >= 0.45 && games >= 5 && l5 >= 1.3) tier = "Medium";
  } else {
    // 1+
    if (rec.rate >= 0.80 && games >= 5 && l5 >= 0.8) tier = "High";
    else if (rec.rate >= 0.65 && games >= 5 && l5 >= 0.6) tier = "Medium";
    else if (rec.rate >= 0.50 && games >= 4 && l5 >= 0.4) tier = "Low";
  }

  return {
    threshold,
    qualifies: tier !== "None",
    tier,
    hitRecord: rec,
    l5Avg: l5,
    games,
  };
}

// ─── Best-line selectors ──────────────────────────────────────────────────────

/**
 * Selects the highest disposal threshold where the player genuinely qualifies
 * at Medium+ tier. Evaluated in descending order: 30 → 25 → 20 → 15.
 *
 * Returns null if no threshold qualifies (e.g. < 15 avg player).
 */
export function selectBestDisposalLine(
  p: StatBoardPlayer,
): DisposalLineEval | null {
  const thresholds: Array<30 | 25 | 20 | 15> = [30, 25, 20, 15];
  for (const t of thresholds) {
    const ev = evaluateDisposalLine(p, t);
    if (ev.tier === "High" || ev.tier === "Medium") return ev;
  }
  // Allow Low-tier 15+ as final fallback
  const ev15 = evaluateDisposalLine(p, 15);
  if (ev15.tier === "Low") return ev15;
  return null;
}

/**
 * Selects the highest goal threshold where the player qualifies at Medium+ tier.
 * 3+ → 2+ → 1+. Falls back to Low-tier 1+ if nothing else qualifies.
 */
export function selectBestGoalLine(
  p: StatBoardPlayer,
): GoalLineEval | null {
  const thresholds: Array<3 | 2 | 1> = [3, 2, 1];
  for (const t of thresholds) {
    const ev = evaluateGoalLine(p, t);
    if (ev.tier === "High" || ev.tier === "Medium") return ev;
  }
  // Low-tier 1+ fallback
  const ev1 = evaluateGoalLine(p, 1);
  if (ev1.tier === "Low") return ev1;
  return null;
}

/**
 * Returns the public disposal content tier for a player — the threshold that
 * should be used when labelling them in social posts and marketing copy.
 *
 * Differs from selectBestDisposalLine() in that:
 *   - 25+ explicitly excludes 30+ tier players (they go in a 30+ post instead)
 *   - Uses the tightened 25+ thresholds (L5 ≥ 24.5 / 25.0)
 *
 * Returns the qualifying threshold (30/25/20/15) or null.
 */
export function getPublicDisposalContentTier(
  p: StatBoardPlayer,
): 30 | 25 | 20 | 15 | null {
  const ev30 = evaluateDisposalLine(p, 30);
  if (ev30.tier === "High" || ev30.tier === "Medium") return 30;
  const ev25 = evaluateDisposalLine(p, 25);
  if (ev25.tier === "High" || ev25.tier === "Medium") return 25;
  const ev20 = evaluateDisposalLine(p, 20);
  if (ev20.tier === "High" || ev20.tier === "Medium") return 20;
  const ev15 = evaluateDisposalLine(p, 15);
  if (ev15.tier === "High" || ev15.tier === "Medium" || ev15.tier === "Low") return 15;
  return null;
}

// ─── Candidate scoring for Game Picks ────────────────────────────────────────

export interface CandidateScore {
  player_id: number;
  player_name: string;
  team_id: number;
  team_name: string;
  threshold: number;
  tier: ConfidenceTier;
  hitRecord: HitRecord;
  /** Full-season hit record (denominator = all season games). Used for public copy display. */
  seasonHitRecord: HitRecord;
  l5Avg: number;
  seasonAvg: number;
  games: number;
  projection: number | null;
  position_group: string | null;
  /** 0–100 composite score */
  score: number;
  /** Ready-to-display copy line */
  copyLine: string;
  /** Raw last-10 stat values from DB (oldest→newest). */
  last_10_values?: number[] | null;
  /**
   * Public content tier for this disposal candidate.
   * 25+ explicitly excludes 30+ tier players.
   */
  publicContentTier?: 30 | 25 | 20 | 15 | null;
  /** Full threshold hit-rate map (15–40) from DB for Copy All Stats export. */
  allThresholdHitRates?: Record<string, { hits: number; games: number; rate: number }> | null;
}

/**
 * Scores a disposal candidate (0–100).
 *
 * Components (all normalised to their max contribution):
 *   hitRate      40 pts — primary signal (scaled: 0.70→0, 1.0→40)
 *   sampleDepth  20 pts — min(sample/10, 1) * 20
 *   l5Support    20 pts — l5/threshold capped at 1.3x, scaled to 20
 *   seasonSupport 10 pts
 *   projSupport  10 pts — projection vs threshold
 *
 * High tier adds 5-point bonus. Medium tier gets 0 bonus. Low tier gets -5 deduction.
 */
function scoreDisposalCandidate(ev: DisposalLineEval, proj: number | null): number {
  const { hitRecord: rec, l5Avg: l5, seasonAvg, threshold } = ev;

  const hitRateScore = Math.max(0, Math.min((rec.rate - 0.50) / 0.50, 1)) * 40;
  const sampleScore = Math.min(rec.sample / 10, 1) * 20;
  const l5Score = Math.min(l5 / threshold, 1.3) / 1.3 * 20;
  const seasonScore = Math.min(seasonAvg / threshold, 1.3) / 1.3 * 10;
  const projScore = proj !== null ? (proj >= threshold ? 10 : proj >= threshold * 0.85 ? 5 : 0) : 0;

  const tierBonus = ev.tier === "High" ? 5 : ev.tier === "Low" ? -5 : 0;

  return Math.round(Math.min(100, Math.max(0, hitRateScore + sampleScore + l5Score + seasonScore + projScore + tierBonus)));
}

function scoreGoalCandidate(ev: GoalLineEval, proj: number | null): number {
  const { hitRecord: rec, l5Avg: l5, threshold } = ev;

  const hitRateScore = Math.max(0, Math.min((rec.rate - 0.35) / 0.65, 1)) * 40;
  const sampleScore = Math.min(rec.sample / 10, 1) * 20;
  const l5Score = threshold > 0 ? Math.min(l5 / threshold, 2) / 2 * 20 : 0;
  const projScore = proj !== null ? (proj >= threshold ? 10 : proj >= threshold * 0.7 ? 5 : 0) : 0;

  const tierBonus = ev.tier === "High" ? 5 : ev.tier === "Low" ? -5 : 0;

  return Math.round(Math.min(100, Math.max(0, hitRateScore + sampleScore + l5Score + projScore + tierBonus)));
}

function buildDisposalCopyLine(p: StatBoardPlayer, ev: DisposalLineEval): string {
  const { threshold, hitRecord: rec } = ev;
  const { record, pct } = formatRateFromHits(rec);
  const parts: string[] = [`${threshold}+ disposals: ${record} (${pct})`];
  if (ev.l5Avg > 0) parts.push(`L5 avg ${ev.l5Avg.toFixed(1)}`);
  if (p.projection !== null && p.projection > 0) parts.push(`proj ${p.projection.toFixed(0)}`);
  return `${p.player_name} (${p.team_name}) — ${parts.join(" | ")}`;
}

function buildGoalCopyLine(p: StatBoardPlayer, ev: GoalLineEval): string {
  const { threshold, hitRecord: rec } = ev;
  const { record, pct } = formatRateFromHits(rec);
  const thresholdLabel = threshold === 1 ? "1+ goal" : `${threshold}+ goals`;
  const parts: string[] = [`${thresholdLabel}: ${record} (${pct})`];
  if (ev.l5Avg > 0) parts.push(`L5 avg ${ev.l5Avg.toFixed(1)}`);
  if (p.projection !== null && p.projection > 0) parts.push(`proj ${p.projection.toFixed(1)}`);
  return `${p.player_name} (${p.team_name}) — ${parts.join(" | ")}`;
}

/**
 * Ranks all disposal candidates for a set of team IDs.
 * Only includes players with a qualifying Medium+ (or Low-fallback) best line.
 */
export function rankDisposalCandidatesForTeams(
  players: StatBoardPlayer[],
  teamIds: Set<number>,
  unavailablePlayerIds: Set<number>,
): CandidateScore[] {
  const seen = new Set<number>();
  const results: CandidateScore[] = [];

  for (const p of players) {
    if (!teamIds.has(p.team_id)) continue;
    if (unavailablePlayerIds.has(p.player_id)) continue;
    if (seen.has(p.player_id)) continue;
    if ((p.games_played ?? 0) < 4) continue;
    seen.add(p.player_id);

    const ev = selectBestDisposalLine(p);
    if (!ev) continue;

    const score = scoreDisposalCandidate(ev, p.projection ?? null);
    results.push({
      player_id: p.player_id,
      player_name: p.player_name,
      team_id: p.team_id,
      team_name: p.team_name,
      threshold: ev.threshold,
      tier: ev.tier,
      hitRecord: ev.hitRecord,
      seasonHitRecord: getSeasonHitRecord(p, ev.threshold),
      l5Avg: ev.l5Avg,
      seasonAvg: ev.seasonAvg,
      games: ev.games,
      projection: p.projection ?? null,
      position_group: p.position_group ?? null,
      score,
      copyLine: buildDisposalCopyLine(p, ev),
      last_10_values: p.last_10_values ?? null,
      // Derive from selectBestDisposalLine's threshold — avoids a second full evaluation pass.
      // ev.threshold is already the highest qualifying threshold, matching getPublicDisposalContentTier's
      // cascade. Cast is safe: selectBestDisposalLine only returns 30|25|20|15 thresholds.
      publicContentTier: ev.threshold as 30 | 25 | 20 | 15,
      allThresholdHitRates: p.all_threshold_hit_rates ?? null,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Ranks all goal candidates for a set of team IDs.
 */
export function rankGoalCandidatesForTeams(
  players: StatBoardPlayer[],
  teamIds: Set<number>,
  unavailablePlayerIds: Set<number>,
): CandidateScore[] {
  const seen = new Set<number>();
  const results: CandidateScore[] = [];

  for (const p of players) {
    if (!teamIds.has(p.team_id)) continue;
    if (unavailablePlayerIds.has(p.player_id)) continue;
    if (seen.has(p.player_id)) continue;
    if ((p.games_played ?? 0) < 4) continue;
    seen.add(p.player_id);

    const ev = selectBestGoalLine(p);
    if (!ev) continue;

    const score = scoreGoalCandidate(ev, p.projection ?? null);
    results.push({
      player_id: p.player_id,
      player_name: p.player_name,
      team_id: p.team_id,
      team_name: p.team_name,
      threshold: ev.threshold,
      tier: ev.tier,
      hitRecord: ev.hitRecord,
      seasonHitRecord: getSeasonHitRecord(p, ev.threshold),
      l5Avg: ev.l5Avg,
      seasonAvg: p.season_avg ?? 0,
      games: ev.games,
      projection: p.projection ?? null,
      position_group: p.position_group ?? null,
      score,
      copyLine: buildGoalCopyLine(p, ev),
      last_10_values: p.last_10_values ?? null,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Ranks goal candidates for a game-day 1+ Goals post.
 *
 * Unlike rankGoalCandidatesForTeams (which uses each player's best/highest
 * qualifying threshold), this evaluates every player specifically at the 1+
 * threshold. Players who also qualify at 2+ or 3+ are NOT excluded — they are
 * excellent 1+ scorers and should appear in the 1+ post.
 *
 * Scored by 1+ hit rate / sample depth / L5 avg relative to 1+ / projection.
 */
export function rankGoalCandidatesAt1Plus(
  players: StatBoardPlayer[],
  teamIds: Set<number>,
  unavailablePlayerIds: Set<number>,
): CandidateScore[] {
  const seen = new Set<number>();
  const results: CandidateScore[] = [];

  for (const p of players) {
    if (!teamIds.has(p.team_id)) continue;
    if (unavailablePlayerIds.has(p.player_id)) continue;
    if (seen.has(p.player_id)) continue;
    if ((p.games_played ?? 0) < 4) continue;
    seen.add(p.player_id);

    const ev = evaluateGoalLine(p, 1);
    if (!ev.qualifies) continue;

    const score = scoreGoalCandidate(ev, p.projection ?? null);
    results.push({
      player_id: p.player_id,
      player_name: p.player_name,
      team_id: p.team_id,
      team_name: p.team_name,
      threshold: 1,
      tier: ev.tier,
      hitRecord: ev.hitRecord,
      seasonHitRecord: getSeasonHitRecord(p, 1),
      l5Avg: ev.l5Avg,
      seasonAvg: p.season_avg ?? 0,
      games: ev.games,
      projection: p.projection ?? null,
      position_group: p.position_group ?? null,
      score,
      copyLine: buildGoalCopyLine(p, ev),
      last_10_values: p.last_10_values ?? null,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

// ─── Last-N value helpers ─────────────────────────────────────────────────────

/**
 * Core last-N extractor operating on a raw values array.
 * The RPC delivers last_10_values newest-first (index 0 = most recent game).
 * We filter null/negative sentinels (BYE/DNP/NYP) then take the first N.
 * Shared by getLastNValues and any consumer that holds last_10_values directly.
 */
export function lastNFromValues(
  raw: (number | null)[] | null | undefined,
  count: number,
): number[] {
  if (!raw || raw.length === 0) return [];
  return [...raw]
    .filter((v): v is number => v !== null && v >= 0)
    .slice(0, count);
}

/**
 * Extracts the last N actual stat values from a StatBoardPlayer.
 * Returns values newest-first, skipping null/negative sentinel values (BYE/DNP/NYP).
 */
export function getLastNValues(p: StatBoardPlayer, count: number): number[] {
  return lastNFromValues(p.last_10_values, count);
}

/**
 * Formats an array of stat values as a dot-separated strip.
 * e.g. [35, 34, 36, 33, 36] → "35 · 34 · 36 · 33 · 36"
 * Returns null if fewer than 2 values.
 */
export function formatLastNStrip(values: number[]): string | null {
  if (values.length < 2) return null;
  return values.map(v => String(v)).join(" · ");
}

// ─── Tier label helpers ───────────────────────────────────────────────────────

export function tierLabel(tier: ConfidenceTier): string {
  if (tier === "High") return "High";
  if (tier === "Medium") return "Medium";
  if (tier === "Low") return "Low";
  return "Weak";
}

export function tierColor(tier: ConfidenceTier): string {
  if (tier === "High") return "text-emerald-400";
  if (tier === "Medium") return "text-yellow-400";
  if (tier === "Low") return "text-orange-400";
  return "text-zinc-500";
}

// ─── Public stat-line formatter ───────────────────────────────────────────────

/**
 * Canonical stat bullet used in all weekly social posts.
 * Format: "Player (Team) — 8/13 (62%) at 25+, L5 avg 27.8"
 *
 * Uses full-season hit record (getSeasonHitRecord) so the denominator reflects
 * all games played this season, not just the last 10.
 *
 * Disposal thresholds: pass 15 | 20 | 25 | 30.
 * Goal thresholds: pass 1 | 2 | 3 (outputs "1+ goal" / "2+ goals" / "3+ goals").
 */
export function formatPublicStatLine(
  p: StatBoardPlayer,
  threshold: number,
): string {
  const rec = getSeasonHitRecord(p, threshold);
  const record = rec.sample > 0 ? `${rec.hits}/${rec.sample}` : "—";
  const pctStr = rec.sample > 0 ? ` (${Math.round(rec.rate * 100)}%)` : "";
  const hasL5 = p.last_5_avg !== null && p.last_5_avg !== undefined;
  const avg = hasL5 ? p.last_5_avg! : (p.season_avg ?? 0);
  const avgLabel = hasL5 ? "L5 avg" : "sea avg";
  const isGoal = threshold <= 3;
  const label = isGoal
    ? threshold === 1 ? "1+ goal" : `${threshold}+ goals`
    : `${threshold}+`;
  return `${p.player_name} (${p.team_name ?? ""}) — ${record}${pctStr} at ${label}, ${avgLabel} ${avg.toFixed(1)}`;
}

// ─── Marketing tier assignment ────────────────────────────────────────────────

/**
 * Assigns the single disposal marketing tier for a player: 30 | 25 | 20 | 15 | null.
 *
 * Evaluated in descending order — a player is placed at their HIGHEST qualifying tier.
 * A player assigned to 30+ will NOT appear in 25+/20+/15+ posts.
 * A player assigned to 25+ will NOT appear in 20+/15+ posts.
 *
 * L5 average is used as a primary promotion signal alongside hit rate.
 * If a player's L5 average is clearly in a higher tier's range, they are promoted
 * even if their hit rate at that threshold is moderate (≥ 0.60).
 *
 * 30+ tier:
 *   Primary:  hr30 >= 0.70 AND L5 >= 29.0 AND sample >= 5
 *   L5 promo: L5 >= 28.5 AND hr30 >= 0.60 AND sample >= 5
 *
 * 25+ tier (excludes 30+ players):
 *   Primary:  hr25 >= 0.70 AND L5 >= 24.5 AND sample >= 5
 *   L5 promo: L5 >= 24.0 AND hr25 >= 0.60 AND sample >= 5
 *
 * 20+ tier (excludes 30+/25+ players):
 *   Primary:  hr20 >= 0.70 AND L5 >= 19.0 AND sample >= 4
 *   L5 promo: L5 >= 18.5 AND hr20 >= 0.55 AND sample >= 4
 *
 * 15+ tier:
 *   hr15 >= 0.70 AND L5 >= 14.5 AND sample >= 4
 */
export function assignDisposalMarketingTier(
  p: StatBoardPlayer,
): 30 | 25 | 20 | 15 | null {
  const l5 = p.last_5_avg ?? p.season_avg ?? 0;

  // ── 30+ ──────────────────────────────────────────────────────────────────
  const rec30 = getRecentHitRecord(p, 30);
  if (rec30.sample >= 5) {
    if (rec30.rate >= 0.70 && l5 >= 29.0) return 30;
    // L5 promotion: strong average profile even if hit rate is moderate
    if (l5 >= 28.5 && rec30.rate >= 0.60) return 30;
  }

  // ── 25+ ──────────────────────────────────────────────────────────────────
  const rec25 = getRecentHitRecord(p, 25);
  if (rec25.sample >= 5) {
    if (rec25.rate >= 0.70 && l5 >= 24.5) return 25;
    // L5 promotion: L5 clearly in 25+ territory
    if (l5 >= 24.0 && rec25.rate >= 0.60) return 25;
  }

  // ── 20+ ──────────────────────────────────────────────────────────────────
  const rec20 = getRecentHitRecord(p, 20);
  if (rec20.sample >= 4) {
    if (rec20.rate >= 0.70 && l5 >= 19.0) return 20;
    // L5 promotion: solid 20+ average profile
    if (l5 >= 18.5 && rec20.rate >= 0.55) return 20;
  }

  // ── 15+ ──────────────────────────────────────────────────────────────────
  const rec15 = getRecentHitRecord(p, 15);
  if (rec15.rate >= 0.70 && l5 >= 14.5 && rec15.sample >= 4) return 15;

  return null;
}

/**
 * Assigns the single goal marketing tier for a player: 3 | 2 | 1 | null.
 *
 * Returns null if no tier qualifies — never returns 1 as a catch-all default.
 *
 * 3+: hr3 >= 0.40 AND sample >= 5 AND L5 >= 2.0
 * 2+: hr2 >= 0.50 AND sample >= 5 AND L5 >= 1.4
 * 1+: hr1 >= 0.65 AND sample >= 4 AND L5 >= 0.8
 */
export function assignGoalMarketingTier(
  p: StatBoardPlayer,
): 3 | 2 | 1 | null {
  const l5 = p.last_5_avg ?? p.season_avg ?? 0;

  const rec3 = getRecentHitRecord(p, 3);
  if (rec3.rate >= 0.40 && rec3.sample >= 5 && l5 >= 2.0) return 3;

  const rec2 = getRecentHitRecord(p, 2);
  if (rec2.rate >= 0.50 && rec2.sample >= 5 && l5 >= 1.4) return 2;

  const rec1 = getRecentHitRecord(p, 1);
  if (rec1.rate >= 0.65 && rec1.sample >= 4 && l5 >= 0.8) return 1;

  return null;
}

// ─── Strict candidate helpers ─────────────────────────────────────────────────

/**
 * Returns all available players who are strictly assigned to the given disposal tier.
 * Exact tier matching — a player at the 30+ tier will NOT appear in a 25+ result.
 */
export function getStrictDisposalCandidates(
  players: StatBoardPlayer[],
  tier: 30 | 25 | 20 | 15,
  unavailablePlayerIds: Set<number> = new Set(),
): StatBoardPlayer[] {
  return players.filter(p => {
    if (unavailablePlayerIds.has(p.player_id)) return false;
    if ((p.games_played ?? 0) < 4) return false;
    return assignDisposalMarketingTier(p) === tier;
  });
}

/**
 * Returns all available players who are strictly assigned to the given goal tier.
 * Exact tier matching — a player at the 3+ tier will NOT appear in a 1+ result.
 */
export function getStrictGoalCandidates(
  players: StatBoardPlayer[],
  tier: 3 | 2 | 1,
  unavailablePlayerIds: Set<number> = new Set(),
): StatBoardPlayer[] {
  return players.filter(p => {
    if (unavailablePlayerIds.has(p.player_id)) return false;
    if ((p.games_played ?? 0) < 3) return false;
    return assignGoalMarketingTier(p) === tier;
  });
}

/**
 * Returns candidates across all disposal tiers combined, at their own best tier.
 * This is the ONLY helper that intentionally mixes disposal thresholds.
 * Used exclusively by the Full Game Picks (combined) post builder.
 */
export function getCombinedGamePickCandidates(
  players: StatBoardPlayer[],
  unavailablePlayerIds: Set<number> = new Set(),
): Array<StatBoardPlayer & { assignedDisposalTier: 30 | 25 | 20 | 15 | null }> {
  const result: Array<StatBoardPlayer & { assignedDisposalTier: 30 | 25 | 20 | 15 | null }> = [];
  for (const p of players) {
    if (unavailablePlayerIds.has(p.player_id)) continue;
    if ((p.games_played ?? 0) < 4) continue;
    const assignedDisposalTier = assignDisposalMarketingTier(p);
    if (assignedDisposalTier !== null) result.push({ ...p, assignedDisposalTier });
  }
  return result;
}

// ─── L5 consistency validator ─────────────────────────────────────────────────

export interface L5ValidationResult {
  isConsistent: boolean;
  l5Avg: number;
  /** Hit rate at assigned tier threshold */
  hitRateAtTier: number;
  /** Flag: L5 avg is more than 15% below the threshold */
  l5BelowThreshold: boolean;
  /** Flag: hit rate and L5 give conflicting signals */
  signalMismatch: boolean;
  warnings: string[];
}

/**
 * Validates L5 consistency for a disposal stat line.
 * Catches cases where the hit record looks strong but L5 average is misleading,
 * or where L5 and hit rate give conflicting signals.
 */
export function validateL5Consistency(
  p: StatBoardPlayer,
  threshold: number,
): L5ValidationResult {
  const rec = getRecentHitRecord(p, threshold);
  const l5 = p.last_5_avg ?? p.season_avg ?? 0;
  const warnings: string[] = [];

  const l5BelowThreshold = l5 < threshold * 0.85;
  const signalMismatch = rec.rate >= 0.70 && l5 < threshold * 0.80;

  if (l5BelowThreshold) {
    warnings.push(`L5 avg ${l5.toFixed(1)} is below ${(threshold * 0.85).toFixed(0)} (85% of ${threshold}+ threshold)`);
  }
  if (signalMismatch) {
    warnings.push(`Hit rate (${Math.round(rec.rate * 100)}%) contradicts L5 avg ${l5.toFixed(1)} — may be driven by old data`);
  }
  if (rec.sample < 5) {
    warnings.push(`Small sample size (${rec.sample} games) — lower confidence`);
  }

  return {
    isConsistent: !l5BelowThreshold && !signalMismatch,
    l5Avg: l5,
    hitRateAtTier: rec.rate,
    l5BelowThreshold,
    signalMismatch,
    warnings,
  };
}

// ─── Fresh Last 5 resolver ────────────────────────────────────────────────────

export interface Last5Resolution {
  values: number[];
  strip: string | null;
  avg: number | null;
  /** true when the strip avg agrees with last_5_avg to within 0.5 pts */
  isConsistent: boolean;
  /** Fallback reason if strip was rejected */
  warning: string | null;
}

/**
 * Resolves the freshest available Last 5 values for social post display.
 *
 * Invariant: last_10_values is newest-first from the RPC.
 * Cross-checks the derived strip average against the scalar last_5_avg.
 * If they disagree by more than 0.5 pts the strip is suppressed (values=[])
 * and a warning is set — preventing stale array data from leaking into posts.
 *
 * The scalar last_5_avg is always used for averages because it is computed
 * directly in SQL and is never affected by array ordering bugs.
 */
export function resolveFreshLast5ForSocial(p: StatBoardPlayer): Last5Resolution {
  const rawValues = lastNFromValues(p.last_10_values, 5);
  const scalarAvg = p.last_5_avg ?? null;

  if (rawValues.length < 2) {
    return {
      values: rawValues,
      strip: formatLastNStrip(rawValues),
      avg: scalarAvg,
      isConsistent: true,
      warning: rawValues.length === 0 ? "No last_10_values data available." : null,
    };
  }

  const stripAvg = rawValues.reduce((a, b) => a + b, 0) / rawValues.length;
  const isConsistent = scalarAvg === null || Math.abs(stripAvg - scalarAvg) <= 0.5;

  if (!isConsistent) {
    return {
      values: [],
      strip: null,
      avg: scalarAvg,
      isConsistent: false,
      warning: `Last 5 strip avg ${stripAvg.toFixed(1)} disagrees with scalar last_5_avg ${scalarAvg?.toFixed(1)} by more than 0.5 — strip suppressed.`,
    };
  }

  return {
    values: rawValues,
    strip: formatLastNStrip(rawValues),
    avg: scalarAvg ?? (rawValues.length > 0 ? stripAvg : null),
    isConsistent: true,
    warning: null,
  };
}

// ─── Availability guard ───────────────────────────────────────────────────────

const EXCLUDED_LOCK_KEYWORDS = [
  "injured",
  "suspended",
  "omitted",
  "managed",
  "inactive",
  "test player",
  "emergency",
  "medical",
  "withdrawn",
  "delisted",
  "traded",
  "rookie_inactive",
];

/**
 * Comprehensive availability check for social post candidate pools.
 * Uses the lock_reason field on the player record as a proxy for exclusion.
 *
 * Primary mechanism: pass the unavailablePlayerIds set from CIDataSubset,
 * which is populated from the admin's manual status overrides.
 *
 * Secondary: if a player has lock_reason set to an injury/suspension keyword,
 * treat them as unavailable even if they're not in the set.
 */
export function isAvailableForSocial(
  p: StatBoardPlayer,
  unavailablePlayerIds?: Set<number>,
): boolean {
  if (unavailablePlayerIds?.has(p.player_id)) return false;
  const lockReason = (p.lock_reason ?? "").toLowerCase();
  return !lockReason || !EXCLUDED_LOCK_KEYWORDS.some(kw => lockReason.includes(kw));
}
