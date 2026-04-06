import type { RankingRow } from "@/features/afl/rankings/components/types";

export interface CurrentRoundPlayer extends RankingRow {
  overallRank: number;
  isFeaturedPick: boolean;
}

export interface CurrentRoundResult {
  captains: CurrentRoundPlayer[];
  topPicks: CurrentRoundPlayer[];
  valuePicks: CurrentRoundPlayer[];
  safePicks: CurrentRoundPlayer[];
  riskPicks: CurrentRoundPlayer[];
}

const CAPTAIN_LIMIT   = 5;
const TOP_PICKS_LIMIT = 10;
const OTHER_LIMIT     = 10;

export function buildCurrentRoundPlayers(
  players: RankingRow[],
  edgeBoardIds: Set<string> = new Set()
): CurrentRoundResult {
  if (players.length === 0) {
    return { captains: [], topPicks: [], valuePicks: [], safePicks: [], riskPicks: [] };
  }

  const available = players.filter(
    (p) => !p.is_injured && !p.is_bye
  );


  const rankedAll = [...players].sort(
    (a, b) => (b.projection ?? 0) - (a.projection ?? 0)
  );
  const rankMap = new Map<string, number>();
  rankedAll.forEach((p, i) => {
    if (p.player_id) rankMap.set(p.player_id, i + 1);
  });

  function enrich(p: RankingRow): CurrentRoundPlayer {
    const id = p.player_id ?? "";
    return {
      ...p,
      overallRank: rankMap.get(id) ?? 999,
      isFeaturedPick: edgeBoardIds.has(id),
    };
  }

  const enriched = available.map(enrich);

  const byProjDesc = [...enriched].sort(
    (a, b) => (b.projection ?? 0) - (a.projection ?? 0)
  );
  const byEdgeDesc = [...enriched].sort(
    (a, b) => (b.edge ?? 0) - (a.edge ?? 0)
  );
  const byEdgeAsc = [...enriched].sort(
    (a, b) => (a.edge ?? 0) - (b.edge ?? 0)
  );

  // CAPTAINS: top projection players
  const captains = byProjDesc.slice(0, CAPTAIN_LIMIT);
  const captainIds = new Set(captains.map((p) => p.player_id));


  // TOP PICKS: next best projection (not captain)
  const topPicks = byProjDesc
    .filter((p) => !captainIds.has(p.player_id))
    .slice(0, TOP_PICKS_LIMIT);

  const topIds = new Set([...captainIds, ...topPicks.map((p) => p.player_id)]);


  // VALUE PICKS: highest edge players not already used
  // Primary: edge > 8, fallback: any positive edge, second fallback: top remaining by projection
  const valuePool = byEdgeDesc.filter((p) => !topIds.has(p.player_id));
  const valuePrimary = valuePool.filter((p) => (p.edge ?? 0) > 8).slice(0, OTHER_LIMIT);

  let valuePicks = valuePrimary;
  if (valuePicks.length < 3) {
    const extra = valuePool
      .filter((p) => (p.edge ?? 0) > 0 && !valuePrimary.some((v) => v.player_id === p.player_id))
      .slice(0, OTHER_LIMIT - valuePicks.length);
    valuePicks = [...valuePicks, ...extra];
  }
  if (valuePicks.length < 3) {
    const extra = valuePool
      .filter((p) => !valuePicks.some((v) => v.player_id === p.player_id))
      .slice(0, OTHER_LIMIT - valuePicks.length);
    valuePicks = [...valuePicks, ...extra];
  }

  const valueIds = new Set([...topIds, ...valuePicks.map((p) => p.player_id)]);


  // SAFE PICKS: good projection, no strong negative signal, not already used
  // Primary: projection >= 80 and edge >= -15, fallback: any not used, by projection desc
  const safePool = byProjDesc.filter((p) => !valueIds.has(p.player_id));
  const safePrimary = safePool
    .filter(
      (p) =>
        (p.projection ?? 0) >= 80 &&
        (p.edge ?? 0) >= -15 &&
        p.signal !== "STRONG_DOWN" &&
        p.signal !== "DOWN"
    )
    .slice(0, OTHER_LIMIT);

  let safePicks = safePrimary;
  if (safePicks.length < 3) {
    const extra = safePool
      .filter((p) => !safePrimary.some((s) => s.player_id === p.player_id) && (p.edge ?? 0) >= -20)
      .slice(0, OTHER_LIMIT - safePicks.length);
    safePicks = [...safePicks, ...extra];
  }
  if (safePicks.length < 3) {
    const extra = safePool
      .filter((p) => !safePicks.some((s) => s.player_id === p.player_id))
      .slice(0, OTHER_LIMIT - safePicks.length);
    safePicks = [...safePicks, ...extra];
  }

  const safeIds = new Set([...valueIds, ...safePicks.map((p) => p.player_id)]);


  // RISK PICKS: lowest edge players not already used (derived from edge_canonical)
  // Primary: edge < -5, fallback: most negative edge available
  const riskPool = byEdgeAsc.filter((p) => !safeIds.has(p.player_id));
  const riskPrimary = riskPool.filter((p) => (p.edge ?? 0) < -5).slice(0, OTHER_LIMIT);

  let riskPicks = riskPrimary;
  if (riskPicks.length < 3) {
    const extra = riskPool
      .filter((p) => !riskPrimary.some((r) => r.player_id === p.player_id))
      .slice(0, OTHER_LIMIT - riskPicks.length);
    riskPicks = [...riskPicks, ...extra];
  }


  return { captains, topPicks, valuePicks, safePicks, riskPicks };
}
