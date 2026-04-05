import type { RankingRow } from "@/features/afl/rankings/components/types";

export type EdgeSection = "must_have" | "breakout" | "avoid";

export interface EdgeBoardPlayer extends RankingRow {
  edgeSection: EdgeSection;
  overallRank: number;
}

export interface EdgeBoardResult {
  mustHave: EdgeBoardPlayer[];
  breakout: EdgeBoardPlayer[];
  avoid: EdgeBoardPlayer[];
  allEdgeIds: Set<string>;
}

export function buildEdgeBoardPlayers(players: RankingRow[]): EdgeBoardResult {
  const filtered = players.filter(
    (p) =>
      (p.games_played ?? 0) >= 3 &&
      (p.projection_final ?? 0) >= 70 &&
      p.status !== "OUT" &&
      p.manual_status !== "OUT" &&
      p.manual_status !== "INJURED" &&
      !p.is_bye
  );

  const rankedAll = [...players]
    .sort((a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0));

  const rankMap = new Map<string, number>();
  rankedAll.forEach((p, i) => {
    if (p.player_id) rankMap.set(p.player_id, i + 1);
  });

  const withEdge = filtered.map((p) => ({
    ...p,
    edge: p.projection_final != null && p.breakeven != null
      ? p.projection_final - p.breakeven
      : (p.edge ?? 0),
  }));

  const usedIds = new Set<string>();

  function pick(list: typeof withEdge, count: number, section: EdgeSection): EdgeBoardPlayer[] {
    const result: EdgeBoardPlayer[] = [];
    for (const p of list) {
      const id = p.player_id ?? "";
      if (!usedIds.has(id)) {
        usedIds.add(id);
        result.push({
          ...p,
          edgeSection: section,
          overallRank: rankMap.get(id) ?? 999,
        });
      }
      if (result.length === count) break;
    }
    return result;
  }

  const mustHavePrimary = [...withEdge]
    .filter((p) => p.signal_tag === "Target" && (p.edge ?? 0) > 0)
    .sort((a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0));

  const mustHaveFallback = [...withEdge]
    .sort((a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0));

  const mustHave = pick(mustHavePrimary.length > 0 ? mustHavePrimary : mustHaveFallback, 2, "must_have");

  const breakoutPrimary = [...withEdge]
    .filter((p) => p.signal_tag === "Watch")
    .sort((a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0));

  const breakoutFallback = [...withEdge]
    .filter((p) => !mustHave.some((m) => m.player_id === p.player_id))
    .sort((a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0));

  const breakout = pick(breakoutPrimary.length > 0 ? breakoutPrimary : breakoutFallback, 2, "breakout");

  const avoidPrimary = [...withEdge]
    .filter((p) => p.signal_tag === "Avoid")
    .sort((a, b) => (a.edge ?? 0) - (b.edge ?? 0));

  const avoidFallback = [...withEdge]
    .filter((p) => !mustHave.some((m) => m.player_id === p.player_id) && !breakout.some((br) => br.player_id === p.player_id))
    .sort((a, b) => (a.edge ?? 0) - (b.edge ?? 0));

  const avoid = pick(avoidPrimary.length > 0 ? avoidPrimary : avoidFallback, 2, "avoid");

  const allEdgeIds = new Set<string>();
  [...mustHave, ...breakout, ...avoid].forEach((p) => {
    if (p.player_id) allEdgeIds.add(p.player_id);
  });

  return { mustHave, breakout, avoid, allEdgeIds };
}
