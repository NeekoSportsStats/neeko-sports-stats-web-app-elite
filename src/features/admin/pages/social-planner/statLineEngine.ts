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

// ─── Hit-record retrieval ─────────────────────────────────────────────────────

export interface HitRecord {
  hits: number;
  sample: number;
  /** Always 0–1 decimal */
  rate: number;
}

/**
 * Returns the hit record for a player at a given threshold.
 * Prefers all_threshold_hit_rates; falls back to hit_rate_last_10.
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
 * 25+ High:   hr ≥ 0.80 AND L5 ≥ 24.0 AND sample ≥ 7
 * 25+ Medium: hr ≥ 0.70 AND L5 ≥ 22.0 AND sample ≥ 5
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
    if (rec.rate >= 0.80 && l5 >= 24.0 && games >= 7) tier = "High";
    else if (rec.rate >= 0.70 && l5 >= 22.0 && games >= 5) tier = "Medium";
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

// ─── Candidate scoring for Game Picks ────────────────────────────────────────

export interface CandidateScore {
  player_id: number;
  player_name: string;
  team_id: number;
  team_name: string;
  threshold: number;
  tier: ConfidenceTier;
  hitRecord: HitRecord;
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
  // L5 relative to threshold (goals scale is much smaller)
  const l5Score = threshold > 0 ? Math.min(l5 / threshold, 2) / 2 * 20 : 0;
  const seasonScore = 0; // not used for goals — too noisy
  const projScore = proj !== null ? (proj >= threshold ? 10 : proj >= threshold * 0.7 ? 5 : 0) : 0;

  const tierBonus = ev.tier === "High" ? 5 : ev.tier === "Low" ? -5 : 0;

  return Math.round(Math.min(100, Math.max(0, hitRateScore + sampleScore + l5Score + seasonScore + projScore + tierBonus)));
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
      l5Avg: ev.l5Avg,
      seasonAvg: ev.seasonAvg,
      games: ev.games,
      projection: p.projection ?? null,
      position_group: p.position_group ?? null,
      score,
      copyLine: buildDisposalCopyLine(p, ev),
      last_10_values: p.last_10_values ?? null,
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
 * Extracts the last N actual stat values from a StatBoardPlayer.
 * Returns values newest-first, skipping null/negative sentinel values (BYE/DNP/NYP).
 */
export function getLastNValues(p: StatBoardPlayer, count: number): number[] {
  const raw = p.last_10_values;
  if (!raw || raw.length === 0) return [];
  return [...raw]
    .reverse()
    .filter((v): v is number => v !== null && v >= 0)
    .slice(0, count);
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
