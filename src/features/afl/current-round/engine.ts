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
    console.log("[CurrentRound] No players supplied — returning empty result");
    return { captains: [], topPicks: [], valuePicks: [], safePicks: [], riskPicks: [] };
  }

  // Exclude only genuinely unavailable players — no games_played or projection floor filter
  const available = players.filter(
    (p) =>
      (p.status ?? "").toUpperCase() !== "OUT" &&
      (p.manual_status ?? "").toUpperCase() !== "OUT" &&
      (p.manual_status ?? "").toUpperCase() !== "INJURED" &&
      (p.manual_status ?? "").toUpperCase() !== "OMITTED"
  );

  console.log(`[CurrentRound] available players after status filter: ${available.length} / ${players.length}`);

  const rankedAll = [...players].sort(
    (a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0)
  );
  const rankMap = new Map<string, number>();
  rankedAll.forEach((p, i) => {
    if (p.player_id) rankMap.set(p.player_id, i + 1);
  });

  function enrich(p: RankingRow): CurrentRoundPlayer {
    const id = p.player_id ?? "";
    const edge =
      p.edge_canonical != null ? p.edge_canonical :
      p.projection_final != null && p.breakeven != null
        ? p.projection_final - p.breakeven
        : (p.edge ?? null);
    return {
      ...p,
      edge,
      overallRank: rankMap.get(id) ?? 999,
      isFeaturedPick: edgeBoardIds.has(id),
    };
  }

  const enriched = available.map(enrich);

  const byProjDesc = [...enriched].sort(
    (a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0)
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

  console.log(`[CurrentRound] captains: ${captains.length}`);

  // TOP PICKS: next best projection (not captain)
  const topPicks = byProjDesc
    .filter((p) => !captainIds.has(p.player_id))
    .slice(0, TOP_PICKS_LIMIT);

  const topIds = new Set([...captainIds, ...topPicks.map((p) => p.player_id)]);

  console.log(`[CurrentRound] topPicks: ${topPicks.length}`);

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
    if (extra.length > 0) {
      console.log(`[CurrentRound] valuePicks fallback1: added ${extra.length} from positive-edge pool`);
    }
  }
  if (valuePicks.length < 3) {
    const extra = valuePool
      .filter((p) => !valuePicks.some((v) => v.player_id === p.player_id))
      .slice(0, OTHER_LIMIT - valuePicks.length);
    valuePicks = [...valuePicks, ...extra];
    if (extra.length > 0) {
      console.log(`[CurrentRound] valuePicks fallback2: added ${extra.length} from remaining pool`);
    }
  }

  const valueIds = new Set([...topIds, ...valuePicks.map((p) => p.player_id)]);

  console.log(`[CurrentRound] valuePicks: ${valuePicks.length}`);

  // SAFE PICKS: good projection, no strong negative signal, not already used
  // Primary: projection >= 80 and edge >= -15, fallback: any not used, by projection desc
  const safePool = byProjDesc.filter((p) => !valueIds.has(p.player_id));
  const safePrimary = safePool
    .filter(
      (p) =>
        (p.projection_final ?? 0) >= 80 &&
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
    if (extra.length > 0) {
      console.log(`[CurrentRound] safePicks fallback1: added ${extra.length} with relaxed edge threshold`);
    }
  }
  if (safePicks.length < 3) {
    const extra = safePool
      .filter((p) => !safePicks.some((s) => s.player_id === p.player_id))
      .slice(0, OTHER_LIMIT - safePicks.length);
    safePicks = [...safePicks, ...extra];
    if (extra.length > 0) {
      console.log(`[CurrentRound] safePicks fallback2: added ${extra.length} from remaining pool`);
    }
  }

  const safeIds = new Set([...valueIds, ...safePicks.map((p) => p.player_id)]);

  console.log(`[CurrentRound] safePicks: ${safePicks.length}`);

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
    if (extra.length > 0) {
      console.log(`[CurrentRound] riskPicks fallback: added ${extra.length} from lowest-edge pool`);
    }
  }

  console.log(`[CurrentRound] riskPicks: ${riskPicks.length}`);

  return { captains, topPicks, valuePicks, safePicks, riskPicks };
}
