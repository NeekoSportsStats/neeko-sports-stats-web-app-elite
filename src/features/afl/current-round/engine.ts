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

const CAPTAIN_LIMIT  = 8;
const MUST_BUY_LIMIT = 12;
const BUDGET_LIMIT   = 10;
const RISK_LIMIT     = 11;
const TRAP_LIMIT     = 8;

const BUDGET_BAND_A_MAX = 350_000;
const BUDGET_BAND_B_MAX = 650_000;

function isEligible(p: RankingRow): boolean {
  if (!p.player_id) return false;
  if (p.is_injured) return false;
  if (p.is_bye) return false;
  const status = (p.manual_status ?? p.status ?? "").toLowerCase();
  if (["delisted", "retired", "inactive"].includes(status)) return false;
  if ((p.games_played ?? 0) < 1) return false;
  return true;
}

function isEligiblePositive(p: RankingRow): boolean {
  if (!isEligible(p)) return false;
  if (p.projection == null || p.projection <= 0) return false;
  return true;
}

function hasPositiveAction(p: RankingRow): boolean {
  const ac = (p.action_canonical ?? "").toUpperCase();
  return ac === "START" || ac === "SMASH_START";
}

function hasNegativeAction(p: RankingRow): boolean {
  const ac = (p.action_canonical ?? "").toUpperCase();
  return ac === "SIT" || ac === "HARD_SIT";
}

function isHardSit(p: RankingRow): boolean {
  return (p.action_canonical ?? "").toUpperCase() === "HARD_SIT";
}

export function buildCurrentRoundPlayers(
  players: RankingRow[],
  edgeBoardIds: Set<string> = new Set()
): CurrentRoundResult {
  if (players.length === 0) {
    return { captains: [], mustBuys: [], budgetPicks: [], riskPicks: [], traps: [] };
  }

  const eligiblePositive = players.filter(isEligiblePositive);
  const eligibleAll = players.filter(isEligible);

  const rankMap = new Map<string, number>();
  [...players]
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .forEach((p, i) => { if (p.player_id) rankMap.set(p.player_id, i + 1); });

  function enrich(p: RankingRow): CurrentRoundPlayer {
    const id = p.player_id ?? "";
    return { ...p, overallRank: rankMap.get(id) ?? 999, isFeaturedPick: edgeBoardIds.has(id) };
  }

  const enrichedPositive = eligiblePositive.map(enrich);
  const enrichedAll = eligibleAll.map(enrich);

  const byProjDesc     = [...enrichedPositive].sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0));
  const byDecisionDesc = [...enrichedPositive].sort((a, b) => (b.decision_score ?? -999) - (a.decision_score ?? -999));
  const byDecisionAscAll = [...enrichedAll].sort((a, b) => (a.decision_score ?? 999) - (b.decision_score ?? 999));

  // ── CAPTAIN PICKS ─────────────────────────────────────────────────────────
  const captains = byProjDesc
    .filter(p => !hasNegativeAction(p))
    .slice(0, CAPTAIN_LIMIT);
  const captainIds = new Set(captains.map(p => p.player_id));

  // ── MUST BUYS — START or SMASH_START, sorted by decision_score desc ────────
  const mustBuys = byDecisionDesc
    .filter(p => !captainIds.has(p.player_id) && hasPositiveAction(p))
    .slice(0, MUST_BUY_LIMIT);

  // Fallback: if no positively-actioned players, take top by projection
  const mustBuysFinal = mustBuys.length >= 3
    ? mustBuys
    : byDecisionDesc.filter(p => !captainIds.has(p.player_id)).slice(0, MUST_BUY_LIMIT);

  const mustBuyIds = new Set(mustBuysFinal.map(p => p.player_id));

  // ── BUDGET UPSIDE ──────────────────────────────────────────────────────────
  const usedIds = new Set([...captainIds, ...mustBuyIds]);

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

    // Reward genuine value/upside with a soft price discount
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

  const budgetEligible = enrichedPositive.filter(p =>
    !usedIds.has(p.player_id) &&
    (p.price ?? 0) > 0 &&
    (p.price ?? 999_999) <= BUDGET_BAND_B_MAX &&
    !hasNegativeAction(p)
  );

  // Band A: basement / rookie price range
  const bandA = budgetEligible
    .filter(p => (p.price ?? 999_999) <= BUDGET_BAND_A_MAX && hasRealUpside(p))
    .map(p => ({ p, score: getBudgetUpsideScore(p) }))
    .filter(({ score }) => score !== null)
    .sort((a, b) => (b.score as number) - (a.score as number))
    .map(({ p }) => p);

  // Band B: playable mid-price value range
  const bandB = budgetEligible
    .filter(p => (p.price ?? 0) > BUDGET_BAND_A_MAX && (p.price ?? 999_999) <= BUDGET_BAND_B_MAX && hasRealUpside(p))
    .map(p => ({ p, score: getBudgetUpsideScore(p) }))
    .filter(({ score }) => score !== null)
    .sort((a, b) => (b.score as number) - (a.score as number))
    .map(({ p }) => p);

  // Interleave bands for diversity: 1 from B, 1 from A, then fill from best remaining
  const interleaved: CurrentRoundPlayer[] = [];
  const usedInBudget = new Set<string>();

  function addBudget(candidates: CurrentRoundPlayer[]) {
    for (const c of candidates) {
      if (!usedInBudget.has(c.player_id ?? "") && interleaved.length < BUDGET_LIMIT) {
        interleaved.push(c);
        usedInBudget.add(c.player_id ?? "");
      }
    }
  }

  // Lead with a mid-price value play if available, then rookie/cheap
  if (bandB.length > 0) addBudget([bandB[0]]);
  if (bandA.length > 0) addBudget([bandA[0]]);
  addBudget(bandB.slice(1));
  addBudget(bandA.slice(1));

  // Fallback: any positive-action budget player scored by upside, no real-upside filter
  if (interleaved.length < 3) {
    const fallback = budgetEligible
      .filter(p => !usedInBudget.has(p.player_id ?? "") && hasPositiveAction(p))
      .map(p => ({ p, score: getBudgetUpsideScore(p) }))
      .filter(({ score }) => score !== null)
      .sort((a, b) => (b.score as number) - (a.score as number))
      .map(({ p }) => p);
    addBudget(fallback);
  }

  // Last resort: any budget player sorted by decision_score
  if (interleaved.length < 3) {
    const lastResort = budgetEligible
      .filter(p => !usedInBudget.has(p.player_id ?? ""))
      .sort((a, b) => (b.decision_score ?? -999) - (a.decision_score ?? -999));
    addBudget(lastResort);
  }

  const budgetPicks = interleaved;

  // ── RISK / OVERPRICED — SIT or HARD_SIT, worst decision_score first ────────
  const riskPicks = byDecisionAscAll
    .filter(p => hasNegativeAction(p))
    .slice(0, RISK_LIMIT);

  // Fallback: just worst decision_score if no negative-action players
  const riskFinal = riskPicks.length >= 3
    ? riskPicks
    : byDecisionAscAll.slice(0, RISK_LIMIT);

  // ── TRAPS — HARD_SIT only, worst decision_score first ─────────────────────
  const traps = byDecisionAscAll
    .filter(p => isHardSit(p))
    .slice(0, TRAP_LIMIT);

  // Fallback: SIT + HARD_SIT combined if not enough HARD_SIT
  const trapsFinal = traps.length >= 2
    ? traps
    : byDecisionAscAll.filter(p => hasNegativeAction(p)).slice(0, TRAP_LIMIT);

  return {
    captains,
    mustBuys: mustBuysFinal,
    budgetPicks,
    riskPicks: riskFinal,
    traps: trapsFinal,
  };
}
