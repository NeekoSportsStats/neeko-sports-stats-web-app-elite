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

const PLAYERS_PER_SECTION = 3;

export function buildEdgeBoardPlayers(players: RankingRow[]): EdgeBoardResult {
  const eligible = players.filter(
    (p) =>
      (p.games_played ?? 0) >= 3 &&
      (p.projection_final ?? 0) > 50 &&
      (p.manual_status ?? "").toUpperCase() !== "OUT" &&
      (p.manual_status ?? "").toUpperCase() !== "INJURED" &&
      (p.manual_status ?? "").toUpperCase() !== "OMITTED" &&
      (p.status ?? "").toUpperCase() !== "OUT" &&
      !p.is_bye
  );

  const rankedAll = [...players].sort(
    (a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0)
  );

  const rankMap = new Map<string, number>();
  rankedAll.forEach((p, i) => {
    if (p.player_id) rankMap.set(p.player_id, i + 1);
  });

  const usedIds = new Set<string>();

  function pick(
    list: RankingRow[],
    count: number,
    section: EdgeSection
  ): EdgeBoardPlayer[] {
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

  // MUST HAVE: top edge_canonical DESC, positive edge only
  const mustHavePool = [...eligible]
    .filter((p) => (p.edge_canonical ?? 0) > 0)
    .sort((a, b) => (b.edge_canonical ?? 0) - (a.edge_canonical ?? 0));

  const mustHave = pick(mustHavePool, PLAYERS_PER_SECTION, "must_have");

  // WATCH: next best edge_canonical (not already used), middle range
  const watchPool = [...eligible]
    .filter((p) => !mustHave.some((m) => m.player_id === p.player_id))
    .sort((a, b) => (b.edge_canonical ?? 0) - (a.edge_canonical ?? 0));

  const breakout = pick(watchPool, PLAYERS_PER_SECTION, "breakout");

  // AVOID: worst edge_canonical DESC (most negative first), negative edge only
  const avoidPool = [...eligible]
    .filter(
      (p) =>
        (p.edge_canonical ?? 0) < 0 &&
        !mustHave.some((m) => m.player_id === p.player_id) &&
        !breakout.some((b) => b.player_id === p.player_id)
    )
    .sort((a, b) => (a.edge_canonical ?? 0) - (b.edge_canonical ?? 0));

  const avoid = pick(avoidPool, PLAYERS_PER_SECTION, "avoid");

  const allEdgeIds = new Set<string>();
  [...mustHave, ...breakout, ...avoid].forEach((p) => {
    if (p.player_id) allEdgeIds.add(p.player_id);
  });

  return { mustHave, breakout, avoid, allEdgeIds };
}
