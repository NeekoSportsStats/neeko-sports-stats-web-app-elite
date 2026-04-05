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
  const filtered = players.filter(
    (p) =>
      (p.games_played ?? 0) >= 3 &&
      (p.projection_final ?? 0) >= 40 &&
      p.status !== "OUT" &&
      p.manual_status !== "OUT" &&
      p.manual_status !== "INJURED" &&
      !p.is_bye
  );

  const rankedAll = [...players].sort(
    (a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0)
  );

  const rankMap = new Map<string, number>();
  rankedAll.forEach((p, i) => {
    if (p.player_id) rankMap.set(p.player_id, i + 1);
  });

  const withEdge = filtered.map((p) => ({
    ...p,
    edge:
      p.projection_final != null && p.breakeven != null
        ? p.projection_final - p.breakeven
        : (p.edge ?? 0),
  }));

  const usedIds = new Set<string>();

  function pick(
    list: typeof withEdge,
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

  // Must Have: STRONG_UP or UP signal + positive edge, sorted by value_score desc
  const mustHavePrimary = [...withEdge]
    .filter(
      (p) =>
        (p.signal === "STRONG_UP" || p.signal === "UP") &&
        (p.edge ?? 0) > 0
    )
    .sort((a, b) => (b.value_score ?? -99) - (a.value_score ?? -99));

  // Fallback: any positive-edge player sorted by value_score
  const mustHaveFallback = [...withEdge]
    .filter((p) => (p.edge ?? 0) > 0)
    .sort((a, b) => (b.value_score ?? -99) - (a.value_score ?? -99));

  const mustHave = pick(
    mustHavePrimary.length >= PLAYERS_PER_SECTION
      ? mustHavePrimary
      : [...mustHavePrimary, ...mustHaveFallback.filter(
          (p) => !mustHavePrimary.some((m) => m.player_id === p.player_id)
        )],
    PLAYERS_PER_SECTION,
    "must_have"
  );

  // Breakout: STRONG_UP signal specifically — highest projection upside
  const breakoutPrimary = [...withEdge]
    .filter(
      (p) =>
        p.signal === "STRONG_UP" &&
        !mustHave.some((m) => m.player_id === p.player_id)
    )
    .sort((a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0));

  // Fallback: UP signal players not yet used
  const breakoutFallback = [...withEdge]
    .filter(
      (p) =>
        p.signal === "UP" &&
        !mustHave.some((m) => m.player_id === p.player_id)
    )
    .sort((a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0));

  const breakout = pick(
    breakoutPrimary.length >= PLAYERS_PER_SECTION
      ? breakoutPrimary
      : [...breakoutPrimary, ...breakoutFallback.filter(
          (p) => !breakoutPrimary.some((b) => b.player_id === p.player_id)
        )],
    PLAYERS_PER_SECTION,
    "breakout"
  );

  // Avoid: DOWN or STRONG_DOWN signal, worst edge first
  const avoidPrimary = [...withEdge]
    .filter(
      (p) =>
        (p.signal === "DOWN" || p.signal === "STRONG_DOWN") &&
        !mustHave.some((m) => m.player_id === p.player_id) &&
        !breakout.some((b) => b.player_id === p.player_id)
    )
    .sort((a, b) => (a.edge ?? 0) - (b.edge ?? 0));

  // Fallback: most negative edge players not already used
  const avoidFallback = [...withEdge]
    .filter(
      (p) =>
        !mustHave.some((m) => m.player_id === p.player_id) &&
        !breakout.some((b) => b.player_id === p.player_id) &&
        !avoidPrimary.some((av) => av.player_id === p.player_id)
    )
    .sort((a, b) => (a.edge ?? 0) - (b.edge ?? 0));

  const avoid = pick(
    avoidPrimary.length >= PLAYERS_PER_SECTION
      ? avoidPrimary
      : [...avoidPrimary, ...avoidFallback],
    PLAYERS_PER_SECTION,
    "avoid"
  );

  const allEdgeIds = new Set<string>();
  [...mustHave, ...breakout, ...avoid].forEach((p) => {
    if (p.player_id) allEdgeIds.add(p.player_id);
  });

  return { mustHave, breakout, avoid, allEdgeIds };
}
