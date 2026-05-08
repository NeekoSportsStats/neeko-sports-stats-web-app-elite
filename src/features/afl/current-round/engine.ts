import type { RankingRow } from "@/features/afl/rankings/components/types";

export interface CurrentRoundPlayer extends RankingRow {
  overallRank: number;
  isFeaturedPick: boolean;
}

export interface CurrentRoundResult {
  captains: CurrentRoundPlayer[];
  /** Merged: strong-action buys + budget upside picks, deduped */
  buyValuePicks: CurrentRoundPlayer[];
  /** Merged: hard-sit traps + risk/overpriced players, deduped, traps first */
  trapFadeAlerts: CurrentRoundPlayer[];
}

// ── TARGETS ──────────────────────────────────────────────────────────────────
const CAPTAIN_TARGET   = 6;
const BUY_VALUE_TARGET = 12;
const TRAP_FADE_TARGET = 10;

const BUDGET_BAND_A_MAX = 350_000;
const BUDGET_BAND_B_MAX = 650_000;

// ── ELIGIBILITY ───────────────────────────────────────────────────────────────

function isEligible(p: RankingRow): boolean {
  if (!p.player_id) return false;
  if (p.is_injured) return false;
  if (p.is_bye) return false;
  const status = (p.manual_status ?? p.status ?? "").toLowerCase();
  if (["delisted", "retired", "inactive"].includes(status)) return false;
  if ((p.games_played ?? 0) < 1) return false;
  return true;
}

function hasProjection(p: RankingRow): boolean {
  return p.projection != null && (p.projection as number) > 0;
}

function getAction(p: RankingRow): string {
  return String(p.action_canonical ?? p.signal_tag ?? p.signal ?? "").trim().toUpperCase();
}

function hasNegativeAction(p: RankingRow): boolean {
  const ac = getAction(p);
  return ac === "SIT" || ac === "STRONG_SIT";
}

function isHardSit(p: RankingRow): boolean {
  return getAction(p) === "STRONG_SIT";
}

function hasStrongPositiveAction(p: RankingRow): boolean {
  const ac = getAction(p);
  return ac === "STRONG_START" || ac === "START";
}

// ── SCORING ───────────────────────────────────────────────────────────────────

function decisionScore(p: RankingRow): number {
  return p.decision_score ?? 0;
}

// ── BUDGET UPSIDE LOGIC ────────────────────────────────────────────────────────

function getBudgetUpsideScore(p: RankingRow): number | null {
  const projection = typeof p.projection === "number" ? p.projection : null;
  const price = typeof p.price === "number" ? p.price : null;
  const breakeven = typeof p.breakeven === "number" ? p.breakeven : null;
  const valueScore = typeof p.value_score === "number" ? p.value_score : null;

  if (projection === null || projection < 50) return null;
  if (price === null || price <= 0) return null;

  const value = valueScore !== null
    ? valueScore
    : (breakeven !== null ? projection - breakeven : null);

  if (value === null) return null;
  return value - (price / 1_000_000) * 8;
}

function hasRealUpside(p: RankingRow): boolean {
  const sig = (p.signal_tag ?? "").toUpperCase();
  if (["UP", "STRONG_UP", "BUY", "VALUE"].includes(sig)) return true;
  const breakeven = typeof p.breakeven === "number" ? p.breakeven : null;
  const projection = typeof p.projection === "number" ? p.projection : null;
  if (projection !== null && breakeven !== null && projection > breakeven) return true;
  const valueScore = typeof p.value_score === "number" ? p.value_score : null;
  if (valueScore !== null && valueScore > 0) return true;
  return false;
}

// ── MAIN BUILDER ──────────────────────────────────────────────────────────────

export function buildCurrentRoundPlayers(
  players: RankingRow[],
  edgeBoardIds: Set<string> = new Set()
): CurrentRoundResult {
  if (players.length === 0) {
    return { captains: [], buyValuePicks: [], trapFadeAlerts: [] };
  }

  const eligible = players.filter(isEligible);
  const eligibleWithProjection = eligible.filter(hasProjection);

  const rankMap = new Map<string, number>();
  [...players]
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .forEach((p, i) => { if (p.player_id) rankMap.set(p.player_id, i + 1); });

  function enrich(p: RankingRow): CurrentRoundPlayer {
    const id = p.player_id ?? "";
    return { ...p, overallRank: rankMap.get(id) ?? 999, isFeaturedPick: edgeBoardIds.has(id) };
  }

  const pool    = eligibleWithProjection.map(enrich);
  const poolAll = eligible.map(enrich);

  const byProjDesc     = [...pool].sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0));
  const byDecisionDesc = [...pool].sort((a, b) => decisionScore(b) - decisionScore(a));
  const byDecisionAsc  = [...poolAll].sort((a, b) => decisionScore(a) - decisionScore(b));

  const assigned = new Set<string>();

  function assign(list: CurrentRoundPlayer[]): CurrentRoundPlayer[] {
    const out: CurrentRoundPlayer[] = [];
    for (const p of list) {
      const id = p.player_id ?? "";
      if (!assigned.has(id)) {
        assigned.add(id);
        out.push(p);
      }
    }
    return out;
  }

  function refillFrom(
    existing: CurrentRoundPlayer[],
    candidates: CurrentRoundPlayer[],
    target: number
  ): CurrentRoundPlayer[] {
    if (existing.length >= target) return existing;
    const result = [...existing];
    for (const c of candidates) {
      if (result.length >= target) break;
      const id = c.player_id ?? "";
      if (!assigned.has(id) && !result.some(r => r.player_id === id)) {
        assigned.add(id);
        result.push(c);
      }
    }
    return result;
  }

  // ── 1. CAPTAINS ────────────────────────────────────────────────────────────
  const captainCandidates = byProjDesc.filter(p => !hasNegativeAction(p));
  const captains = assign(captainCandidates.slice(0, CAPTAIN_TARGET));

  // ── 2. BUY / VALUE PICKS ───────────────────────────────────────────────────
  // Primary: strong positive action sorted by decision_score desc.
  const mustBuyPrimary = byDecisionDesc.filter(p =>
    !assigned.has(p.player_id ?? "") && hasStrongPositiveAction(p)
  );
  let buyValuePicks = assign(mustBuyPrimary.slice(0, BUY_VALUE_TARGET));

  // Fill remaining slots from budget/value players (under $650k with upside)
  if (buyValuePicks.length < BUY_VALUE_TARGET) {
    const budgetEligible = pool.filter(p =>
      !assigned.has(p.player_id ?? "") &&
      (p.price ?? 0) > 0 &&
      (p.price ?? 999_999) <= BUDGET_BAND_B_MAX &&
      !hasNegativeAction(p)
    );

    const bandA = budgetEligible
      .filter(p => (p.price ?? 999_999) <= BUDGET_BAND_A_MAX && hasRealUpside(p))
      .map(p => ({ p, score: getBudgetUpsideScore(p) }))
      .filter(({ score }) => score !== null)
      .sort((a, b) => (b.score as number) - (a.score as number))
      .map(({ p }) => p);

    const bandB = budgetEligible
      .filter(p => (p.price ?? 0) > BUDGET_BAND_A_MAX && hasRealUpside(p))
      .map(p => ({ p, score: getBudgetUpsideScore(p) }))
      .filter(({ score }) => score !== null)
      .sort((a, b) => (b.score as number) - (a.score as number))
      .map(({ p }) => p);

    // Interleave band B (mid-price) and band A (cheap) for variety
    const budgetCandidates: CurrentRoundPlayer[] = [];
    const seen = new Set<string>();
    const maxBudget = BUY_VALUE_TARGET - buyValuePicks.length;

    function addBudgetCandidate(c: CurrentRoundPlayer) {
      const id = c.player_id ?? "";
      if (!assigned.has(id) && !seen.has(id) && budgetCandidates.length < maxBudget) {
        budgetCandidates.push(c);
        seen.add(id);
      }
    }

    if (bandB.length > 0) addBudgetCandidate(bandB[0]);
    if (bandA.length > 0) addBudgetCandidate(bandA[0]);
    for (const c of bandB.slice(1)) addBudgetCandidate(c);
    for (const c of bandA.slice(1)) addBudgetCandidate(c);

    buyValuePicks = refillFrom(buyValuePicks, budgetCandidates, BUY_VALUE_TARGET);
  }

  // Last resort fill: any non-negative player by decision_score
  if (buyValuePicks.length < BUY_VALUE_TARGET) {
    const fallback = byDecisionDesc.filter(p =>
      !assigned.has(p.player_id ?? "") && !hasNegativeAction(p)
    );
    buyValuePicks = refillFrom(buyValuePicks, fallback, BUY_VALUE_TARGET);
  }

  // ── 3. TRAP / FADE ALERTS ──────────────────────────────────────────────────
  // Traps (hard sits) come first, then broader risk/overpriced players.
  // These do NOT block each other — both pools draw from the same negative-action players.
  const positiveIds = new Set([...assigned]);

  const trapFadeAlerts: CurrentRoundPlayer[] = [];
  const trapFadeIds = new Set<string>();

  // First pass: hard sits (STRONG_SIT)
  const hardSits = byDecisionAsc.filter(p =>
    !positiveIds.has(p.player_id ?? "") && isHardSit(p)
  );
  for (const p of hardSits) {
    if (trapFadeAlerts.length >= TRAP_FADE_TARGET) break;
    const id = p.player_id ?? "";
    if (!trapFadeIds.has(id)) {
      trapFadeIds.add(id);
      trapFadeAlerts.push(p);
    }
  }

  // Second pass: any negative-action player (SIT or STRONG_SIT) not yet added
  const negativePlayers = byDecisionAsc.filter(p =>
    !positiveIds.has(p.player_id ?? "") && hasNegativeAction(p)
  );
  for (const p of negativePlayers) {
    if (trapFadeAlerts.length >= TRAP_FADE_TARGET) break;
    const id = p.player_id ?? "";
    if (!trapFadeIds.has(id)) {
      trapFadeIds.add(id);
      trapFadeAlerts.push(p);
    }
  }

  // Refill: lowest decision_score non-positive players if still under target
  if (trapFadeAlerts.length < 3) {
    const lowScoreFill = byDecisionAsc.filter(p => {
      const id = p.player_id ?? "";
      return !positiveIds.has(id) && !trapFadeIds.has(id);
    });
    for (const p of lowScoreFill) {
      if (trapFadeAlerts.length >= TRAP_FADE_TARGET) break;
      const id = p.player_id ?? "";
      trapFadeIds.add(id);
      trapFadeAlerts.push(p);
    }
  }

  return { captains, buyValuePicks, trapFadeAlerts };
}
