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
  if (players.length === 0) {
    console.warn("[EdgeBoard] No players supplied — pipeline may not have run yet");
    return { mustHave: [], breakout: [], avoid: [], allEdgeIds: new Set() };
  }

  const available = players.filter(
    (p) =>
      (p.manual_status ?? "").toUpperCase() !== "OUT" &&
      (p.manual_status ?? "").toUpperCase() !== "INJURED" &&
      (p.manual_status ?? "").toUpperCase() !== "OMITTED" &&
      (p.status ?? "").toUpperCase() !== "OUT" &&
      !p.is_bye
  );

  console.log(`[EdgeBoard] available players after status filter: ${available.length} / ${players.length}`);

  const rankedAll = [...players].sort(
    (a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0)
  );
  const rankMap = new Map<string, number>();
  rankedAll.forEach((p, i) => {
    if (p.player_id) rankMap.set(p.player_id, i + 1);
  });

  const byEdgeDesc = [...available].sort(
    (a, b) => (b.edge_canonical ?? b.edge ?? 0) - (a.edge_canonical ?? a.edge ?? 0)
  );
  const byEdgeAsc = [...available].sort(
    (a, b) => (a.edge_canonical ?? a.edge ?? 0) - (b.edge_canonical ?? b.edge ?? 0)
  );

  const usedIds = new Set<string>();

  function toEdgeBoardPlayer(p: RankingRow, section: EdgeSection): EdgeBoardPlayer {
    const id = p.player_id ?? "";
    usedIds.add(id);
    return { ...p, edgeSection: section, overallRank: rankMap.get(id) ?? 999 };
  }

  function pickFromPool(pool: RankingRow[], count: number, section: EdgeSection): EdgeBoardPlayer[] {
    const result: EdgeBoardPlayer[] = [];
    for (const p of pool) {
      if (result.length >= count) break;
      if (!usedIds.has(p.player_id ?? "")) {
        result.push(toEdgeBoardPlayer(p, section));
      }
    }
    return result;
  }

  const mustHavePool = byEdgeDesc.filter((p) => (p.edge_canonical ?? p.edge ?? 0) >= 10);
  const mustHave = pickFromPool(mustHavePool, PLAYERS_PER_SECTION, "must_have");

  if (mustHave.length < PLAYERS_PER_SECTION) {
    console.warn(`[EdgeBoard] must_have: only ${mustHave.length}/${PLAYERS_PER_SECTION} players met the edge >= 10 threshold`);
  }

  const breakoutPool = byEdgeDesc.filter((p) => {
    const e = p.edge_canonical ?? p.edge ?? 0;
    return e >= 3 && e < 10;
  });
  const breakout = pickFromPool(breakoutPool, PLAYERS_PER_SECTION, "breakout");

  if (breakout.length < PLAYERS_PER_SECTION) {
    console.warn(`[EdgeBoard] breakout: only ${breakout.length}/${PLAYERS_PER_SECTION} players met the edge 3–10 threshold`);
  }

  const avoidPool = byEdgeAsc.filter((p) => (p.edge_canonical ?? p.edge ?? 0) < 3);
  const avoid = pickFromPool(avoidPool, PLAYERS_PER_SECTION, "avoid");

  if (avoid.length < PLAYERS_PER_SECTION) {
    console.warn(`[EdgeBoard] avoid: only ${avoid.length}/${PLAYERS_PER_SECTION} players met the edge < 3 threshold`);
  }

  const allEdgeIds = new Set<string>();
  [...mustHave, ...breakout, ...avoid].forEach((p) => {
    if (p.player_id) allEdgeIds.add(p.player_id);
  });

  console.log(`[EdgeBoard] must_have:${mustHave.length} breakout:${breakout.length} avoid:${avoid.length}`);

  return { mustHave, breakout, avoid, allEdgeIds };
}
