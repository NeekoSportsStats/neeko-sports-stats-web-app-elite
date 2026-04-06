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

function deriveEdgeCategory(edge: number | null): EdgeSection {
  const e = edge ?? 0;
  if (e >= 10) return "must_have";
  if (e >= 3)  return "breakout";
  return "avoid";
}

export function buildEdgeBoardPlayers(players: RankingRow[]): EdgeBoardResult {
  if (players.length === 0) {
    console.log("[EdgeBoard] No players supplied — returning empty result");
    return { mustHave: [], breakout: [], avoid: [], allEdgeIds: new Set() };
  }

  // Exclude genuinely unavailable players — no games_played or projection_final filter
  const available = players.filter(
    (p) =>
      (p.manual_status ?? "").toUpperCase() !== "OUT" &&
      (p.manual_status ?? "").toUpperCase() !== "INJURED" &&
      (p.manual_status ?? "").toUpperCase() !== "OMITTED" &&
      (p.status ?? "").toUpperCase() !== "OUT" &&
      !p.is_bye
  );

  console.log(`[EdgeBoard] available players after status filter: ${available.length} / ${players.length}`);

  // Build overall rank from all players (not just available)
  const rankedAll = [...players].sort(
    (a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0)
  );
  const rankMap = new Map<string, number>();
  rankedAll.forEach((p, i) => {
    if (p.player_id) rankMap.set(p.player_id, i + 1);
  });

  // Sort available pool by edge descending as the baseline
  const byEdgeDesc = [...available].sort(
    (a, b) => (b.edge_canonical ?? b.edge ?? 0) - (a.edge_canonical ?? a.edge ?? 0)
  );

  const byEdgeAsc = [...available].sort(
    (a, b) => (a.edge_canonical ?? a.edge ?? 0) - (b.edge_canonical ?? b.edge ?? 0)
  );

  const byProjDesc = [...available].sort(
    (a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0)
  );

  const usedIds = new Set<string>();

  function toEdgeBoardPlayer(p: RankingRow, section: EdgeSection): EdgeBoardPlayer {
    const id = p.player_id ?? "";
    usedIds.add(id);
    return {
      ...p,
      edgeSection: section,
      overallRank: rankMap.get(id) ?? 999,
    };
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

  // MUST HAVE: players whose edge_canonical >= 10, sorted by edge desc
  const mustHavePool = byEdgeDesc.filter((p) => (p.edge_canonical ?? p.edge ?? 0) >= 10);
  const mustHave = pickFromPool(mustHavePool, PLAYERS_PER_SECTION, "must_have");

  // Fallback: fill must_have from top projection players if pool was too small
  if (mustHave.length < PLAYERS_PER_SECTION) {
    const fallback = pickFromPool(byProjDesc, PLAYERS_PER_SECTION - mustHave.length, "must_have");
    mustHave.push(...fallback);
    if (fallback.length > 0) {
      console.log(`[EdgeBoard] must_have fallback: filled ${fallback.length} from top projection`);
    }
  }

  console.log(`[EdgeBoard] must_have: ${mustHave.length} players`);

  // BREAKOUT: edge between 3 and 10, sorted by edge desc
  const breakoutPool = byEdgeDesc.filter((p) => {
    const e = p.edge_canonical ?? p.edge ?? 0;
    return e >= 3 && e < 10;
  });
  const breakout = pickFromPool(breakoutPool, PLAYERS_PER_SECTION, "breakout");

  // Fallback: fill breakout from middle-range edge players (anything not already used)
  if (breakout.length < PLAYERS_PER_SECTION) {
    const fallback = pickFromPool(byEdgeDesc, PLAYERS_PER_SECTION - breakout.length, "breakout");
    breakout.push(...fallback);
    if (fallback.length > 0) {
      console.log(`[EdgeBoard] breakout fallback: filled ${fallback.length} from edge desc pool`);
    }
  }

  // Second fallback: fill from projection if still short
  if (breakout.length < PLAYERS_PER_SECTION) {
    const fallback = pickFromPool(byProjDesc, PLAYERS_PER_SECTION - breakout.length, "breakout");
    breakout.push(...fallback);
    if (fallback.length > 0) {
      console.log(`[EdgeBoard] breakout fallback2: filled ${fallback.length} from projection`);
    }
  }

  console.log(`[EdgeBoard] breakout: ${breakout.length} players`);

  // AVOID: players whose edge_canonical < 3, sorted by edge asc (most negative first)
  const avoidPool = byEdgeAsc.filter((p) => (p.edge_canonical ?? p.edge ?? 0) < 3);
  const avoid = pickFromPool(avoidPool, PLAYERS_PER_SECTION, "avoid");

  // Fallback: fill avoid from worst projection players
  if (avoid.length < PLAYERS_PER_SECTION) {
    const fallback = pickFromPool(
      [...byProjDesc].reverse(),
      PLAYERS_PER_SECTION - avoid.length,
      "avoid"
    );
    avoid.push(...fallback);
    if (fallback.length > 0) {
      console.log(`[EdgeBoard] avoid fallback: filled ${fallback.length} from lowest projection`);
    }
  }

  console.log(`[EdgeBoard] avoid: ${avoid.length} players`);

  const allEdgeIds = new Set<string>();
  [...mustHave, ...breakout, ...avoid].forEach((p) => {
    if (p.player_id) allEdgeIds.add(p.player_id);
  });

  return { mustHave, breakout, avoid, allEdgeIds };
}
