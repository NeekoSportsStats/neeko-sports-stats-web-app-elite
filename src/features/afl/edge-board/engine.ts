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
    (p) => !p.is_injured && !p.is_bye
  );


  const rankedAll = [...players].sort(
    (a, b) => (b.projection ?? 0) - (a.projection ?? 0)
  );
  const rankMap = new Map<string, number>();
  rankedAll.forEach((p, i) => {
    if (p.player_id) rankMap.set(p.player_id, i + 1);
  });

  const byValueDesc = [...available].sort(
    (a, b) => (b.value_score ?? 0) - (a.value_score ?? 0)
  );

  const usedIds = new Set<string>();

  function toEdgeBoardPlayer(p: RankingRow, section: EdgeSection): EdgeBoardPlayer {
    const id = p.player_id ?? "";
    usedIds.add(id);
    return { ...p, edgeSection: section, overallRank: rankMap.get(id) ?? 999 };
  }

  function pickNext(pool: RankingRow[], count: number, section: EdgeSection): EdgeBoardPlayer[] {
    const result: EdgeBoardPlayer[] = [];
    for (const p of pool) {
      if (result.length >= count) break;
      if (!usedIds.has(p.player_id ?? "")) {
        result.push(toEdgeBoardPlayer(p, section));
      }
    }
    return result;
  }

  const mustHave = pickNext(byValueDesc, PLAYERS_PER_SECTION, "must_have");
  const breakout = pickNext(byValueDesc, PLAYERS_PER_SECTION, "breakout");

  const byValueAsc = [...byValueDesc].reverse();
  const avoid = pickNext(byValueAsc, PLAYERS_PER_SECTION, "avoid");

  const allEdgeIds = new Set<string>();
  [...mustHave, ...breakout, ...avoid].forEach((p) => {
    if (p.player_id) allEdgeIds.add(p.player_id);
  });


  return { mustHave, breakout, avoid, allEdgeIds };
}
