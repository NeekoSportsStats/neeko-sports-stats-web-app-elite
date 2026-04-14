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
}

const CAPTAIN_LIMIT  = 8;
const MUST_BUY_LIMIT = 12;
const BUDGET_LIMIT   = 10;
const RISK_LIMIT     = 11;

const BUDGET_PRICE_CAP = 350_000;

function isEligible(p: RankingRow): boolean {
  if (!p.player_id) return false;
  if (p.is_injured) return false;
  if (p.is_bye) return false;
  if ((p.games_played ?? 0) < 1) return false;
  const status = (p.manual_status ?? p.status ?? "").toLowerCase();
  if (["delisted", "retired", "inactive"].includes(status)) return false;
  if (p.projection == null || p.projection <= 0) return false;
  return true;
}

function hasPositiveSignal(p: RankingRow): boolean {
  const ac = (p.action_canonical ?? "").toUpperCase();
  return ac === "START" || ac === "SMASH_START" || ac === "STRONG_START";
}

function hasNegativeSignal(p: RankingRow): boolean {
  const ac = (p.action_canonical ?? "").toUpperCase();
  return ac === "SIT" || ac === "HARD_SIT";
}

export function buildCurrentRoundPlayers(
  players: RankingRow[],
  edgeBoardIds: Set<string> = new Set()
): CurrentRoundResult {
  if (players.length === 0) {
    return { captains: [], mustBuys: [], budgetPicks: [], riskPicks: [] };
  }

  const eligible = players.filter(isEligible);

  const rankMap = new Map<string, number>();
  [...players]
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .forEach((p, i) => { if (p.player_id) rankMap.set(p.player_id, i + 1); });

  function enrich(p: RankingRow): CurrentRoundPlayer {
    const id = p.player_id ?? "";
    return { ...p, overallRank: rankMap.get(id) ?? 999, isFeaturedPick: edgeBoardIds.has(id) };
  }

  const enriched = eligible.map(enrich);

  const byProjDesc        = [...enriched].sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0));
  const byDecisionDesc    = [...enriched].sort((a, b) => (b.decision_score ?? b.edge_canonical ?? 0) - (a.decision_score ?? a.edge_canonical ?? 0));
  const byDecisionAsc     = [...enriched].sort((a, b) => (a.decision_score ?? a.edge_canonical ?? 0) - (b.decision_score ?? b.edge_canonical ?? 0));

  // ── CAPTAIN PICKS ─────────────────────────────────────────────────────────
  // Best projection players with non-negative signal (not SIT/HARD_SIT)
  const captains = byProjDesc
    .filter((p) => !hasNegativeSignal(p))
    .slice(0, CAPTAIN_LIMIT);
  const captainIds = new Set(captains.map((p) => p.player_id));

  // ── MUST BUYS ──────────────────────────────────────────────────────────────
  // action_canonical IN ('SMASH_START','STRONG_START','START')
  // Sorted by decision_score DESC (falls back to edge_canonical)
  const mustBuys = byDecisionDesc
    .filter((p) =>
      !captainIds.has(p.player_id) &&
      hasPositiveSignal(p)
    )
    .slice(0, MUST_BUY_LIMIT);
  const mustBuyIds = new Set(mustBuys.map((p) => p.player_id));

  // ── BUDGET UPSIDE ──────────────────────────────────────────────────────────
  // Under $350k, positive signal, not already used
  // Sorted by decision_score DESC
  const usedIds = new Set([...captainIds, ...mustBuyIds]);
  const budgetPicks = byDecisionDesc
    .filter((p) =>
      !usedIds.has(p.player_id) &&
      (p.price ?? 0) > 0 &&
      (p.price ?? 999_999) < BUDGET_PRICE_CAP &&
      hasPositiveSignal(p)
    )
    .slice(0, BUDGET_LIMIT);
  const budgetIds = new Set(budgetPicks.map((p) => p.player_id));

  // ── RISK / OVERPRICED ─────────────────────────────────────────────────────
  // action_canonical IN ('SIT','HARD_SIT'), not shown elsewhere
  // Sorted by decision_score ASC (worst first)
  const allUsedIds = new Set([...usedIds, ...budgetIds]);
  const riskPicks = byDecisionAsc
    .filter((p) =>
      !allUsedIds.has(p.player_id) &&
      hasNegativeSignal(p)
    )
    .slice(0, RISK_LIMIT);

  return { captains, mustBuys, budgetPicks, riskPicks };
}
