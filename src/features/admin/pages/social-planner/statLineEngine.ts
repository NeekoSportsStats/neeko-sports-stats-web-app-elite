/**
 * Stat Line Engine — shared, admin-only.
 * Single source of truth for threshold selection, hit-rate formatting,
 * and candidate ranking across Game Picks, weekly posts, and same-day posts.
 *
 * Key invariant: all internal rates are stored and returned as 0–1 decimals.
 * Raw values from the DB can arrive as either 0–1 or 0–100 — normaliseRate()
 * handles the conversion at the boundary.
 *
 * TIER SYSTEM (Part 2 canonical rules):
 * - last_10_values is newest-first (index 0 = most recent game)
 * - Tier logic uses L5 avg + hit rate + last 5 values (form-first)
 * - Bailey Dale with Last 5 of 31·31·25·32·31 qualifies as 30+ not 20+
 */
import type { StatBoardPlayer } from "@/features/afl/stat-board/types";

// ─── Rate normalisation ───────────────────────────────────────────────────────

export function normaliseRate(raw: number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  return raw > 1 ? raw / 100 : raw;
}

// ─── Hit-record retrieval ─────────────────────────────────────────────────────

export interface HitRecord {
  hits: number;
  sample: number;
  /** Always 0–1 decimal */
  rate: number;
}

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
  const rate = normaliseRate(p.hit_rate_last_10);
  const sample = p.games_played ?? 0;
  return {
    hits: Math.round(rate * sample),
    sample,
    rate,
  };
}

// ─── Display formatters ───────────────────────────────────────────────────────

export function formatHitRecord(hits: number, sample: number): string {
  return `${hits}/${sample}`;
}

export function formatRateAsPercent(rate01: number): string {
  return `${Math.round(rate01 * 100)}%`;
}

export function formatRateFromHits(rec: HitRecord): { record: string; pct: string } {
  return {
    record: formatHitRecord(rec.hits, rec.sample),
    pct: formatRateAsPercent(rec.rate),
  };
}

// ─── Confidence tiers ─────────────────────────────────────────────────────────

export type ConfidenceTier = "High" | "Medium" | "Low" | "None";

// ─── Last-N value helpers ─────────────────────────────────────────────────────

/**
 * Core last-N extractor.
 * last_10_values from the RPC is newest-first (index 0 = most recent game).
 * We filter null/negative sentinels (BYE/DNP/NYP) then take the first N.
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

export function getLastNValues(p: StatBoardPlayer, count: number): number[] {
  return lastNFromValues(p.last_10_values, count);
}

export function formatLastNStrip(values: number[]): string | null {
  if (values.length < 2) return null;
  return values.map(v => String(v)).join(" · ");
}

// ─── Fresh Last 5 resolver ────────────────────────────────────────────────────

export interface Last5Resolution {
  values: number[];
  strip: string | null;
  avg: number | null;
  isConsistent: boolean;
  warning: string | null;
}

/**
 * Resolves the freshest available Last 5 values for social post display.
 * Cross-checks strip avg against scalar last_5_avg (max 0.5 pt tolerance).
 * Suppresses the strip if they disagree — prevents stale data leaking.
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

// ─── Tier reason ─────────────────────────────────────────────────────────────

export interface TierAssignment {
  tier: 30 | 25 | 20 | 15 | null;
  tierReason: string;
  confidence: "High" | "Medium" | "Low";
  warning: string | null;
}

// ─── CANONICAL DISPOSAL TIER FUNCTION (Part 2) ───────────────────────────────

/**
 * CANONICAL public disposal content tier assignment.
 *
 * Uses form-first logic: recent L5 avg + last 5 values take priority.
 * This means a player like Bailey Dale with Last 5 of 31·31·25·32·31
 * and L5 avg 30.0 correctly qualifies as 30+, not 20+.
 *
 * Tier cascade (highest wins):
 *
 * 30+ tier:
 *   A) L5 avg >= 29.5 AND at least 3 of last 5 are 30+
 *   B) L10 30+ hit rate >= 60% AND L5 avg >= 29.0
 *
 * 25+ tier (only if not 30+):
 *   A) L5 avg >= 24.5 AND at least 3 of last 5 are 25+
 *   B) L10 25+ hit rate >= 65% AND L5 avg >= 24.0
 *
 * 20+ tier (only if not 25+/30+):
 *   A) L5 avg >= 19.0 AND L10 20+ hit rate >= 70%
 *   B) at least 4 of last 5 are 20+ AND L5 avg >= 19.0
 *
 * 15+ tier (only if not 20+/25+/30+):
 *   L5 avg >= 14.5 AND L10 15+ hit rate >= 70%
 *
 * Returns null if no tier qualifies.
 */
export function getPublicDisposalContentTier(p: StatBoardPlayer): TierAssignment {
  const l5 = p.last_5_avg ?? p.season_avg ?? 0;
  const last5 = lastNFromValues(p.last_10_values, 5);

  // Count how many of last 5 clear each threshold
  const countAbove = (thr: number) => last5.filter(v => v >= thr).length;

  const above30 = countAbove(30);
  const above25 = countAbove(25);
  const above20 = countAbove(20);

  const rec30 = getRecentHitRecord(p, 30);
  const rec25 = getRecentHitRecord(p, 25);
  const rec20 = getRecentHitRecord(p, 20);
  const rec15 = getRecentHitRecord(p, 15);

  // ── 30+ ──────────────────────────────────────────────────────────────────
  const q30_form = l5 >= 29.5 && above30 >= 3;
  const q30_rate = rec30.rate >= 0.60 && l5 >= 29.0 && rec30.sample >= 5;

  if (q30_form || q30_rate) {
    const confidence = (l5 >= 30.0 && above30 >= 4) ? "High" : "Medium";
    const reason = q30_form
      ? `30+ tier: L5 avg ${l5.toFixed(1)} ≥ 29.5 and ${above30}/5 last games ≥ 30`
      : `30+ tier: ${Math.round(rec30.rate * 100)}% at 30+ (L10), L5 avg ${l5.toFixed(1)}`;
    return { tier: 30, tierReason: reason, confidence, warning: null };
  }

  // ── 25+ ──────────────────────────────────────────────────────────────────
  const q25_form = l5 >= 24.5 && above25 >= 3;
  const q25_rate = rec25.rate >= 0.65 && l5 >= 24.0 && rec25.sample >= 5;

  if (q25_form || q25_rate) {
    const confidence = (l5 >= 26.0 && above25 >= 4) ? "High" : "Medium";
    const isBorderline = l5 < 25.5 && above25 === 3;
    const reason = q25_form
      ? `25+ tier: L5 avg ${l5.toFixed(1)} ≥ 24.5 and ${above25}/5 last games ≥ 25`
      : `25+ tier: ${Math.round(rec25.rate * 100)}% at 25+ (L10), L5 avg ${l5.toFixed(1)}`;
    return {
      tier: 25,
      tierReason: reason,
      confidence,
      warning: isBorderline ? `Borderline 25+ — only ${above25}/5 last games cleared 25, monitor form.` : null,
    };
  }

  // ── 20+ ──────────────────────────────────────────────────────────────────
  const q20_rate = rec20.rate >= 0.70 && l5 >= 19.0 && rec20.sample >= 4;
  const q20_form = above20 >= 4 && l5 >= 19.0;

  if (q20_rate || q20_form) {
    const confidence = (rec20.rate >= 0.80 && l5 >= 21.0) ? "High" : "Medium";
    const reason = q20_rate
      ? `20+ tier: ${Math.round(rec20.rate * 100)}% at 20+ (L10), L5 avg ${l5.toFixed(1)}`
      : `20+ tier: ${above20}/5 last games ≥ 20, L5 avg ${l5.toFixed(1)}`;
    return { tier: 20, tierReason: reason, confidence, warning: null };
  }

  // ── 15+ ──────────────────────────────────────────────────────────────────
  const q15 = rec15.rate >= 0.70 && l5 >= 14.5 && rec15.sample >= 4;
  if (q15) {
    return {
      tier: 15,
      tierReason: `15+ tier: ${Math.round(rec15.rate * 100)}% at 15+ (L10), L5 avg ${l5.toFixed(1)}`,
      confidence: "Low",
      warning: null,
    };
  }

  return { tier: null, tierReason: "No disposal tier qualifies", confidence: "Low", warning: null };
}

// ─── CANONICAL GOAL TIER FUNCTION (Part 2) ───────────────────────────────────

export interface GoalTierAssignment {
  tier: 3 | 2 | 1 | null;
  tierReason: string;
  confidence: "High" | "Medium" | "Low";
  isWatchlistOnly: boolean;
  warning: string | null;
}

/**
 * CANONICAL public goal content tier assignment.
 *
 * 3+ goals: L5 avg >= 2.0 AND 3+ hit rate >= 40% (labelled "watchlist" if 40–55%)
 * 2+ goals: only if not 3+; L5 avg >= 1.4 AND 2+ hit rate >= 50%
 * 1+ goal: only if not 2+/3+; 1+ hit rate >= 65%
 *
 * Returns null if no tier qualifies.
 */
export function getPublicGoalContentTier(p: StatBoardPlayer): GoalTierAssignment {
  const l5 = p.last_5_avg ?? p.season_avg ?? 0;

  const rec3 = getRecentHitRecord(p, 3);
  const rec2 = getRecentHitRecord(p, 2);
  const rec1 = getRecentHitRecord(p, 1);

  // ── 3+ ───────────────────────────────────────────────────────────────────
  if (rec3.rate >= 0.40 && rec3.sample >= 5 && l5 >= 2.0) {
    const isWatchlist = rec3.rate < 0.55;
    return {
      tier: 3,
      tierReason: `3+ goals: ${Math.round(rec3.rate * 100)}% at 3+ (L10), L5 avg ${l5.toFixed(1)}`,
      confidence: rec3.rate >= 0.65 ? "High" : "Medium",
      isWatchlistOnly: isWatchlist,
      warning: isWatchlist ? `3+ rate only ${Math.round(rec3.rate * 100)}% — label as "3+ Goal Watchlist", not "consistent".` : null,
    };
  }

  // ── 2+ ───────────────────────────────────────────────────────────────────
  if (rec2.rate >= 0.50 && rec2.sample >= 5 && l5 >= 1.4) {
    const isWatchlist = rec2.rate < 0.65;
    return {
      tier: 2,
      tierReason: `2+ goals: ${Math.round(rec2.rate * 100)}% at 2+ (L10), L5 avg ${l5.toFixed(1)}`,
      confidence: rec2.rate >= 0.70 ? "High" : "Medium",
      isWatchlistOnly: isWatchlist,
      warning: isWatchlist ? `2+ rate ${Math.round(rec2.rate * 100)}% — use watchlist framing.` : null,
    };
  }

  // ── 1+ ───────────────────────────────────────────────────────────────────
  if (rec1.rate >= 0.65 && rec1.sample >= 4) {
    return {
      tier: 1,
      tierReason: `1+ goal: ${Math.round(rec1.rate * 100)}% at 1+ (L10)`,
      confidence: rec1.rate >= 0.80 ? "High" : "Medium",
      isWatchlistOnly: false,
      warning: null,
    };
  }

  return { tier: null, tierReason: "No goal tier qualifies", confidence: "Low", isWatchlistOnly: false, warning: null };
}

// ─── Legacy wrappers (used by weekly post builders) ───────────────────────────

/**
 * Legacy: Returns the disposal tier number only (for compatibility with existing post builders).
 * Prefer getPublicDisposalContentTier() for new code.
 */
export function assignDisposalMarketingTier(p: StatBoardPlayer): 30 | 25 | 20 | 15 | null {
  return getPublicDisposalContentTier(p).tier;
}

/**
 * Legacy: Returns the goal tier number only.
 */
export function assignGoalMarketingTier(p: StatBoardPlayer): 3 | 2 | 1 | null {
  return getPublicGoalContentTier(p).tier;
}

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
    const rec30 = getRecentHitRecord(p, 30);
    const is30PlusTier = rec30.rate >= 0.70 && l5 >= 27.0 && rec30.sample >= 5;
    if (!is30PlusTier) {
      if (rec.rate >= 0.80 && l5 >= 25.0 && games >= 7) tier = "High";
      else if (rec.rate >= 0.70 && l5 >= 24.5 && games >= 5) tier = "Medium";
    }
  } else if (threshold === 20) {
    if (rec.rate >= 0.75 && l5 >= 19.0 && games >= 5) tier = "High";
    else if (rec.rate >= 0.60 && l5 >= 18.0 && games >= 4) tier = "Medium";
    else if (rec.rate >= 0.45 && l5 >= 17.0 && games >= 3) tier = "Low";
  } else {
    if (rec.rate >= 0.75 && l5 >= 14.0 && games >= 5) tier = "High";
    else if (rec.rate >= 0.60 && l5 >= 13.0 && games >= 4) tier = "Medium";
    else if (rec.rate >= 0.45 && l5 >= 12.0 && games >= 3) tier = "Low";
  }

  return { threshold, qualifies: tier !== "None", tier, hitRecord: rec, l5Avg: l5, seasonAvg, games };
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
    if (rec.rate >= 0.80 && games >= 5 && l5 >= 0.8) tier = "High";
    else if (rec.rate >= 0.65 && games >= 5 && l5 >= 0.6) tier = "Medium";
    else if (rec.rate >= 0.50 && games >= 4 && l5 >= 0.4) tier = "Low";
  }

  return { threshold, qualifies: tier !== "None", tier, hitRecord: rec, l5Avg: l5, games };
}

// ─── Best-line selectors ──────────────────────────────────────────────────────

export function selectBestDisposalLine(p: StatBoardPlayer): DisposalLineEval | null {
  const thresholds: Array<30 | 25 | 20 | 15> = [30, 25, 20, 15];
  for (const t of thresholds) {
    const ev = evaluateDisposalLine(p, t);
    if (ev.tier === "High" || ev.tier === "Medium") return ev;
  }
  const ev15 = evaluateDisposalLine(p, 15);
  if (ev15.tier === "Low") return ev15;
  return null;
}

export function selectBestGoalLine(p: StatBoardPlayer): GoalLineEval | null {
  const thresholds: Array<3 | 2 | 1> = [3, 2, 1];
  for (const t of thresholds) {
    const ev = evaluateGoalLine(p, t);
    if (ev.tier === "High" || ev.tier === "Medium") return ev;
  }
  const ev1 = evaluateGoalLine(p, 1);
  if (ev1.tier === "Low") return ev1;
  return null;
}

// ─── Strict candidate helpers (use canonical tier) ───────────────────────────

/**
 * Returns all available players strictly assigned to the given disposal tier.
 * Uses getPublicDisposalContentTier() — the canonical form-first function.
 * A player at the 30+ tier will NOT appear in a 25+ result.
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
  score: number;
  copyLine: string;
  last_10_values?: number[] | null;
  publicContentTier?: 30 | 25 | 20 | 15 | null;
}

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
    // Use canonical tier for publicContentTier
    const publicContentTier = assignDisposalMarketingTier(p);

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
      publicContentTier,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

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

// ─── L5 consistency validator ─────────────────────────────────────────────────

export interface L5ValidationResult {
  isConsistent: boolean;
  l5Avg: number;
  hitRateAtTier: number;
  l5BelowThreshold: boolean;
  signalMismatch: boolean;
  warnings: string[];
}

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

// ─── Post validation (Part 13) ────────────────────────────────────────────────

import type { SocialPost, PostValidationResult } from "./types";

/**
 * Validates a SocialPost for tier consistency, player count accuracy, and
 * voiceover language match.
 *
 * Rules:
 * - Strict 20+ post: all statsShown must contain "at 20+" not "at 25+", "at 30+", or "at 15+"
 * - Strict 25+ post: all statsShown must contain "at 25+" not "at 20+" or "at 30+"
 * - Strict 30+ post: all statsShown must contain "at 30+"
 * - Mixed Disposal Watch: allowed to mix thresholds, must be labelled mixed
 * - Image description player count must match playerNames count
 * - Full Game Picks: allowed to mix anything
 */
export function validatePost(post: SocialPost): PostValidationResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  const isFullGamePicks = post.thresholdLabel === "Full Game Picks" ||
    post.thresholdLabel === "Mixed Stat Watch" ||
    post.thresholdLabel === "Disposals + Goals";

  const isMixed = post.isMixedDisposalWatch === true || post.thresholdLabel.toLowerCase().includes("watch");

  // ── Strict tier checks ───────────────────────────────────────────────────
  if (!isFullGamePicks && !isMixed) {
    const thr = post.thresholdLabel.match(/(\d+)\+\s*Disposals?/i)?.[1];
    if (thr && post.statLens === "disposals") {
      const strictThr = parseInt(thr, 10);
      const otherThr = [15, 20, 25, 30].filter(t => t !== strictThr);
      for (const stat of post.statsShown) {
        for (const bad of otherThr) {
          if (stat.includes(`at ${bad}+`) && !stat.includes(`at ${bad}+ goals`)) {
            violations.push(`Strict ${strictThr}+ post contains a player with "at ${bad}+" stat line: "${stat.slice(0, 60)}"`);
          }
        }
      }
    }

    const goalThr = post.thresholdLabel.match(/(\d+)\+\s*Goals?/i)?.[1];
    if (goalThr && post.statLens === "goals") {
      const strictGoalThr = parseInt(goalThr, 10);
      const otherGoal = [1, 2, 3].filter(t => t !== strictGoalThr);
      for (const stat of post.statsShown) {
        for (const bad of otherGoal) {
          const pattern = bad === 1 ? "at 1+ goal" : `at ${bad}+ goals`;
          if (stat.toLowerCase().includes(pattern)) {
            violations.push(`Strict ${strictGoalThr}+ goal post contains "at ${bad}+" stat line`);
          }
        }
      }
    }
  }

  // ── Player count accuracy ─────────────────────────────────────────────────
  const descMatch = post.imageDescription.match(/(\d+)-player/i);
  if (descMatch) {
    const descCount = parseInt(descMatch[1], 10);
    if (descCount !== post.playerNames.length) {
      violations.push(`imageDescription says "${descCount}-player" but playerNames has ${post.playerNames.length} players`);
    }
  }
  const visualMatch = post.suggestedVisual.match(/(\d+)-player/i);
  if (visualMatch) {
    const visCount = parseInt(visualMatch[1], 10);
    if (visCount !== post.playerNames.length) {
      violations.push(`suggestedVisual says "${visCount}-player" but playerNames has ${post.playerNames.length} players`);
    }
  }

  // ── L5 consistency ────────────────────────────────────────────────────────
  // (checked via resolveFreshLast5ForSocial at player level)

  // ── Mixed disposal watch label ────────────────────────────────────────────
  if (!isFullGamePicks && post.statLens === "disposals") {
    const thresholds = new Set<number>();
    for (const stat of post.statsShown) {
      const m = stat.match(/at (\d+)\+/g);
      if (m) m.forEach(t => {
        const n = parseInt(t.replace('at ', '').replace('+', ''), 10);
        if ([15, 20, 25, 30].includes(n)) thresholds.add(n);
      });
    }
    if (thresholds.size > 1 && !isMixed) {
      violations.push(`Post mixes disposal thresholds (${[...thresholds].join(', ')}+) but is not labelled as Mixed Disposal Watch`);
    }
  }

  const needsReview = violations.length > 0;
  return { isValid: violations.length === 0, needsReview, violations, warnings };
}

// ─── Availability guard ───────────────────────────────────────────────────────

const EXCLUDED_LOCK_KEYWORDS = [
  "injured", "suspended", "omitted", "managed", "inactive",
  "test player", "emergency", "medical", "withdrawn", "delisted",
  "traded", "rookie_inactive",
];

export function isAvailableForSocial(
  p: StatBoardPlayer,
  unavailablePlayerIds?: Set<number>,
): boolean {
  if (unavailablePlayerIds?.has(p.player_id)) return false;
  const lockReason = (p.lock_reason ?? "").toLowerCase();
  return !lockReason || !EXCLUDED_LOCK_KEYWORDS.some(kw => lockReason.includes(kw));
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

export function formatPublicStatLine(
  p: StatBoardPlayer,
  threshold: number,
): string {
  const rec = getRecentHitRecord(p, threshold);
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
