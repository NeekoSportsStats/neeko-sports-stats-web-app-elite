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

const BUDGET_PRICE_CAP = 350_000;

function isEligible(p: RankingRow): boolean {
  if (!p.player_id) return false;
  if (p.is_injured) return false;
  if (p.is_bye) return false;
  const status = (p.manual_status ?? p.status ?? "").toLowerCase();
  if (["delisted", "retired", "inactive"].includes(status)) return false;
  return true;
}

function isEligiblePositive(p: RankingRow): boolean {
  if (!isEligible(p)) return false;
  if (p.projection == null || p.projection <= 0) return false;
  if ((p.games_played ?? 0) < 1) return false;
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
  const byDecisionDesc = [...enrichedPositive].sort((a, b) => (b.decision_score ?? 0) - (a.decision_score ?? 0));
  const byDecisionAscAll = [...enrichedAll].sort((a, b) => (a.decision_score ?? 0) - (b.decision_score ?? 0));

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
  const budgetBase = byDecisionDesc
    .filter(p =>
      !usedIds.has(p.player_id) &&
      (p.price ?? 0) > 0 &&
      (p.price ?? 999_999) < BUDGET_PRICE_CAP &&
      hasPositiveAction(p)
    )
    .slice(0, BUDGET_LIMIT);

  const budgetPicks = budgetBase.length >= 3
    ? budgetBase
    : byDecisionDesc
        .filter(p => !usedIds.has(p.player_id) && (p.price ?? 0) > 0 && (p.price ?? 999_999) < BUDGET_PRICE_CAP)
        .slice(0, BUDGET_LIMIT);

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
