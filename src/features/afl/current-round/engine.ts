import type { RankingRow } from "@/features/afl/rankings/components/types";

export interface CurrentRoundPlayer extends RankingRow {
  overallRank: number;
  isFeaturedPick: boolean;
}

export interface CurrentRoundResult {
  captains: CurrentRoundPlayer[];
  mustBuys: CurrentRoundPlayer[];
  budgetPicks: CurrentRoundPlayer[];
  riskPicks: CurrentRoundPlayer[];
  traps: CurrentRoundPlayer[];
}

// ── TARGETS ──────────────────────────────────────────────────────────────────
// These are the full premium arrays. Free users see a slice of the same arrays.
const CAPTAIN_TARGET  = 6;
const MUST_BUY_TARGET = 10;
const BUDGET_TARGET   = 10;
const RISK_TARGET     = 10;
const TRAP_TARGET     = 8;

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
    return { captains: [], mustBuys: [], budgetPicks: [], riskPicks: [], traps: [] };
  }

  // One canonical eligible pool — active, no delisted/retired
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

  const pool = eligibleWithProjection.map(enrich);
  const poolAll = eligible.map(enrich);

  // Pre-sorted views
  const byProjDesc     = [...pool].sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0));
  const byDecisionDesc = [...pool].sort((a, b) => decisionScore(b) - decisionScore(a));
  const byDecisionAsc  = [...poolAll].sort((a, b) => decisionScore(a) - decisionScore(b));

  const assigned = new Set<string>();

  function assign(players: CurrentRoundPlayer[]): CurrentRoundPlayer[] {
    const out: CurrentRoundPlayer[] = [];
    for (const p of players) {
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
  // Top projection players without a negative action signal.
  const captainCandidates = byProjDesc.filter(p => !hasNegativeAction(p));
  const captains = assign(captainCandidates.slice(0, CAPTAIN_TARGET));

  // ── 2. MUST BUYS ───────────────────────────────────────────────────────────
  // Primary: strong positive action, sorted by decision_score desc, not already captain.
  // Refill: any non-negative player sorted by decision_score desc.
  const mustBuyPrimary = byDecisionDesc.filter(p =>
    !assigned.has(p.player_id ?? "") && hasStrongPositiveAction(p)
  );
  let mustBuys = assign(mustBuyPrimary.slice(0, MUST_BUY_TARGET));

  if (mustBuys.length < MUST_BUY_TARGET) {
    const refillCandidates = byDecisionDesc.filter(p =>
      !assigned.has(p.player_id ?? "") && !hasNegativeAction(p)
    );
    mustBuys = refillFrom(mustBuys, refillCandidates, MUST_BUY_TARGET);
  }

  // ── 3. BUDGET UPSIDE ───────────────────────────────────────────────────────
  // Under BUDGET_BAND_B_MAX price, not already assigned, not negative action.
  // Ranked by upside score; interleaved band A / band B.
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
    .filter(p => (p.price ?? 0) > BUDGET_BAND_A_MAX && (p.price ?? 999_999) <= BUDGET_BAND_B_MAX && hasRealUpside(p))
    .map(p => ({ p, score: getBudgetUpsideScore(p) }))
    .filter(({ score }) => score !== null)
    .sort((a, b) => (b.score as number) - (a.score as number))
    .map(({ p }) => p);

  // Interleave: one from each band, then fill from whichever has more
  const interleaved: CurrentRoundPlayer[] = [];
  const inBudget = new Set<string>();

  function addBudget(c: CurrentRoundPlayer) {
    const id = c.player_id ?? "";
    if (!assigned.has(id) && !inBudget.has(id) && interleaved.length < BUDGET_TARGET) {
      interleaved.push(c);
      inBudget.add(id);
      assigned.add(id);
    }
  }

  if (bandB.length > 0) addBudget(bandB[0]);
  if (bandA.length > 0) addBudget(bandA[0]);
  for (const c of bandB.slice(1)) addBudget(c);
  for (const c of bandA.slice(1)) addBudget(c);

  // Refill budget: any remaining eligible budget players without upside signal
  if (interleaved.length < 3) {
    const fallbackBudget = budgetEligible
      .filter(p => !inBudget.has(p.player_id ?? ""))
      .map(p => ({ p, score: getBudgetUpsideScore(p) }))
      .filter(({ score }) => score !== null)
      .sort((a, b) => (b.score as number) - (a.score as number))
      .map(({ p }) => p);
    for (const c of fallbackBudget) addBudget(c);
  }

  // Last resort: any non-negative budget player sorted by decision_score
  if (interleaved.length < 3) {
    const lastResort = budgetEligible
      .filter(p => !inBudget.has(p.player_id ?? ""))
      .sort((a, b) => decisionScore(b) - decisionScore(a));
    for (const c of lastResort) addBudget(c);
  }

  const budgetPicks = interleaved;

  // ── 4. RISK / OVERPRICED ────────────────────────────────────────────────────
  // Primary: players with a SIT or HARD_SIT action, worst decision_score first.
  // Refill: lowest decision_score players from the FULL eligible pool (not in positive categories).
  // This ensures the category is populated even when action_canonical is sparse.
  const positiveIds = new Set([...assigned]);

  const riskPrimary = byDecisionAsc.filter(p =>
    !positiveIds.has(p.player_id ?? "") && hasNegativeAction(p)
  );

  // For risk, we do NOT use assign() — risk players don't block traps
  const riskIds = new Set<string>();
  const riskPicks: CurrentRoundPlayer[] = [];

  for (const p of riskPrimary) {
    if (riskPicks.length >= RISK_TARGET) break;
    const id = p.player_id ?? "";
    if (!riskIds.has(id)) {
      riskIds.add(id);
      riskPicks.push(p);
    }
  }

  // Refill with any non-positive players ranked worst decision_score
  if (riskPicks.length < RISK_TARGET) {
    const refillRisk = byDecisionAsc.filter(p => {
      const id = p.player_id ?? "";
      return !positiveIds.has(id) && !riskIds.has(id);
    });
    for (const p of refillRisk) {
      if (riskPicks.length >= RISK_TARGET) break;
      const id = p.player_id ?? "";
      riskIds.add(id);
      riskPicks.push(p);
    }
  }

  // ── 5. TRAPS ────────────────────────────────────────────────────────────────
  // Primary: HARD_SIT only. Refill from all riskPicks if needed.
  // Traps are a subset view of the risk pool (can overlap with riskPicks).
  const traps: CurrentRoundPlayer[] = [];
  const trapIds = new Set<string>();

  const hardSitCandidates = byDecisionAsc.filter(p =>
    !positiveIds.has(p.player_id ?? "") && isHardSit(p)
  );
  for (const p of hardSitCandidates) {
    if (traps.length >= TRAP_TARGET) break;
    const id = p.player_id ?? "";
    if (!trapIds.has(id)) {
      trapIds.add(id);
      traps.push(p);
    }
  }

  // Refill traps from riskPicks (all negative-action players)
  if (traps.length < 2) {
    for (const p of riskPicks) {
      if (traps.length >= TRAP_TARGET) break;
      const id = p.player_id ?? "";
      if (!trapIds.has(id)) {
        trapIds.add(id);
        traps.push(p);
      }
    }
  }

  return {
    captains,
    mustBuys,
    budgetPicks,
    riskPicks,
    traps,
  };
}
