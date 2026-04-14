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
  return ac === "START";
}

function hasNegativeSignal(p: RankingRow): boolean {
  const ac = (p.action_canonical ?? "").toUpperCase();
  return ac === "SIT";
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

  const byProjDesc  = [...enriched].sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0));
  const byEdgeDesc  = [...enriched].sort((a, b) => (b.edge_canonical ?? 0) - (a.edge_canonical ?? 0));
  const byEdgeAsc   = [...enriched].sort((a, b) => (a.edge_canonical ?? 0) - (b.edge_canonical ?? 0));

  // ── CAPTAIN PICKS ─────────────────────────────────────────────────────────
  // Best projection players with non-negative signal (not SIT/STRONG_SIT)
  const captains = byProjDesc
    .filter((p) => !hasNegativeSignal(p))
    .slice(0, CAPTAIN_LIMIT);
  const captainIds = new Set(captains.map((p) => p.player_id));

  // ── MUST BUYS ──────────────────────────────────────────────────────────────
  // Positive canonical signal (START or STRONG_START) + positive edge
  // Sorted by edge desc so strongest value trade targets come first
  const mustBuys = byEdgeDesc
    .filter((p) =>
      !captainIds.has(p.player_id) &&
      hasPositiveSignal(p) &&
      (p.edge_canonical ?? 0) > 0
    )
    .slice(0, MUST_BUY_LIMIT);
  const mustBuyIds = new Set(mustBuys.map((p) => p.player_id));

  // ── BUDGET UPSIDE ──────────────────────────────────────────────────────────
  // True budget players only: price < $350k, games_played >= 1 (already enforced by eligible)
  // NOT already in mustBuys or captains
  // Require at least START signal (positive signal only — no random cheap players)
  const usedIds = new Set([...captainIds, ...mustBuyIds]);
  const budgetPicks = byEdgeDesc
    .filter((p) =>
      !usedIds.has(p.player_id) &&
      (p.price ?? 0) > 0 &&
      (p.price ?? 999_999) < BUDGET_PRICE_CAP &&
      hasPositiveSignal(p)
    )
    .slice(0, BUDGET_LIMIT);
  const budgetIds = new Set(budgetPicks.map((p) => p.player_id));

  // ── RISK / OVERPRICED ─────────────────────────────────────────────────────
  // Canonical negative signal (SIT or STRONG_SIT) players
  // NOT already shown elsewhere
  // Sorted by edge ascending (most negative first)
  const allUsedIds = new Set([...usedIds, ...budgetIds]);
  const riskPicks = byEdgeAsc
    .filter((p) =>
      !allUsedIds.has(p.player_id) &&
      hasNegativeSignal(p)
    )
    .slice(0, RISK_LIMIT);

  return { captains, mustBuys, budgetPicks, riskPicks };
}
