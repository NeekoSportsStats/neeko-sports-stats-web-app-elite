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

export function buildCurrentRoundPlayers(
  players: RankingRow[],
  edgeBoardIds: Set<string> = new Set()
): CurrentRoundResult {
  const filtered = players.filter(
    (p) =>
      (p.games_played ?? 0) >= 3 &&
      (p.projection_final ?? 0) >= 70 &&
      p.status !== "OUT" &&
      p.manual_status !== "OUT" &&
      p.manual_status !== "INJURED"
  );

  const rankedAll = [...players].sort(
    (a, b) => (b.neeko_rating ?? 0) - (a.neeko_rating ?? 0)
  );
  const rankMap = new Map<string, number>();
  rankedAll.forEach((p, i) => {
    if (p.player_id) rankMap.set(p.player_id, i + 1);
  });

  function enrich(p: RankingRow): CurrentRoundPlayer {
    const id = p.player_id ?? "";
    return {
      ...p,
      edge:
        p.projection_final != null && p.breakeven != null
          ? p.projection_final - p.breakeven
          : (p.edge ?? 0),
      overallRank: rankMap.get(id) ?? 999,
      isFeaturedPick: edgeBoardIds.has(id),
    };
  }

  const enriched = filtered.map(enrich);

  const captains = [...enriched]
    .sort((a, b) => (b.captain_score ?? b.projection_final ?? 0) - (a.captain_score ?? a.projection_final ?? 0))
    .slice(0, 5);

  const captainIds = new Set(captains.map((p) => p.player_id));

  const topPicks = [...enriched]
    .filter((p) => !captainIds.has(p.player_id))
    .sort((a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0))
    .slice(0, 10);

  const topIds = new Set([...captainIds, ...topPicks.map((p) => p.player_id)]);

  const valuePicks = [...enriched]
    .filter((p) => !topIds.has(p.player_id) && (p.edge ?? 0) > 8)
    .sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0))
    .slice(0, 10);

  const valueIds = new Set([...topIds, ...valuePicks.map((p) => p.player_id)]);

  const safePicks = [...enriched]
    .filter(
      (p) =>
        !valueIds.has(p.player_id) &&
        (p.trend_signal === "STABLE" || p.trend_signal === "UP") &&
        (p.projection_confidence ?? 0) >= 60
    )
    .sort((a, b) => (b.projection_confidence ?? 0) - (a.projection_confidence ?? 0))
    .slice(0, 10);

  const safeIds = new Set([...valueIds, ...safePicks.map((p) => p.player_id)]);

  const riskPicks = [...enriched]
    .filter(
      (p) =>
        !safeIds.has(p.player_id) &&
        (p.trend_signal === "DOWN" ||
          p.trend_signal === "STRONG_DOWN" ||
          (p.edge ?? 0) < -5)
    )
    .sort((a, b) => (a.edge ?? 0) - (b.edge ?? 0))
    .slice(0, 10);

  return { captains, topPicks, valuePicks, safePicks, riskPicks };
}
