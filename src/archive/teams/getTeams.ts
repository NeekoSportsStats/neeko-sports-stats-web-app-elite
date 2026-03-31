import { supabase } from "@/integrations/supabase/client";

export type StatLens = "fantasy" | "disposals" | "goals";

export interface HitRate {
  threshold: number;
  count: number;
  percentage: number;
}

export interface TeamStats {
  avg: number;
  min: number;
  max: number;
  games: number;
  total: number;
  volatility: number;
}

export interface GameEntry {
  round_number: number;
  round_sort_key: number;
  display_label: string;
  score: number | null;
  played: boolean;
  match_index: number;
}

export interface TeamData {
  id: string;
  name: string;
  teamColor: string;
  games: GameEntry[];
  rounds: { [key: string]: number | null };
  stats: TeamStats;
  hitRates: HitRate[];
}

export interface TeamsResponse {
  teams: TeamData[];
  minRound: number;
  maxRound: number;
}

function getStatColumn(lens: StatLens): "fantasy_points" | "disposals" | "goals" {
  switch (lens) {
    case "fantasy":
      return "fantasy_points";
    case "disposals":
      return "disposals";
    case "goals":
      return "goals";
  }
}

function thresholdsForLens(lens: StatLens): number[] {
  if (lens === "fantasy") return [1400, 1500, 1600, 1700, 1800];
  if (lens === "disposals") return [275, 300, 325, 350, 375];
  return [10, 12, 14, 16, 18];
}

function computeVolatility(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
  return Math.round(Math.sqrt(variance) * 10) / 10;
}

function buildHitRates(values: number[], thresholds: number[], totalGames: number): HitRate[] {
  return thresholds.map((t) => {
    const count = values.filter((v) => v >= t).length;
    const pct = totalGames > 0 ? (count / totalGames) * 100 : 0;
    return { threshold: t, count, percentage: pct };
  });
}

function computeStatsFromValues(values: number[], totalGames: number, lens: StatLens): TeamStats {
  const total = values.reduce((s, v) => s + v, 0);
  const avg = totalGames > 0 ? total / totalGames : 0;
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const volatility = computeVolatility(values);

  if (lens === "goals") {
    return {
      avg: Math.round(avg * 10) / 10,
      min: Math.round(min * 10) / 10,
      max: Math.round(max * 10) / 10,
      games: totalGames,
      total: Math.round(total * 10) / 10,
      volatility: Math.round(volatility * 10) / 10,
    };
  }

  return {
    avg: Math.round(avg * 10) / 10,
    min: Math.round(min),
    max: Math.round(max),
    games: totalGames,
    total: Math.round(total),
    volatility,
  };
}

export async function getTeams(
  lens: StatLens,
  season: number
): Promise<TeamsResponse> {
  const statColumn = getStatColumn(lens);

  try {
    const pageSize = 1000;
    let allData: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const to = from + pageSize - 1;
      const query = supabase
        .from("v_team_round_canonical_2025")
        .select("season, round_number, round_display, round_sort_key, team, team_color, played, disposals, goals, fantasy_points, match_index")
        .eq("season", 2025)
        .order("round_sort_key", { ascending: true })
        .order("match_index", { ascending: true })
        .order("team", { ascending: true })
        .range(from, to);

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching team data:", error);
        return { teams: [], minRound: 0, maxRound: 0 };
      }

      if (!data || data.length === 0) {
        break;
      }

      allData = allData.concat(data);
      hasMore = data.length === pageSize;
      from = to + 1;
    }

    if (allData.length === 0) {
      console.log(`No team data found for season ${season}`);
      return { teams: [], minRound: 0, maxRound: 0 };
    }

    console.log(`✓ Fetched total ${allData.length} rows for season ${season} (teams)`);

    const teamMap = new Map<string, any>();
    const allRounds = new Set<number>();
    const teamGamesMap = new Map<string, Array<any>>();

    for (const row of allData) {
      if (!row.team || row.round_number == null || row.round_sort_key == null) {
        console.warn("Skipping invalid row:", row);
        continue;
      }

      const teamName = row.team;
      allRounds.add(row.round_number);

      if (!teamMap.has(teamName)) {
        teamMap.set(teamName, {
          id: teamName,
          name: teamName,
          teamColor: row.team_color || "#666666",
          rounds: {},
          rawValues: [],
          roundsPlayed: new Set<number>(),
        });
        teamGamesMap.set(teamName, []);
      }

      const teamData = teamMap.get(teamName);
      const teamGames = teamGamesMap.get(teamName)!;
      const rawScore = row[statColumn];
      const score = rawScore != null ? rawScore : null;
      const isPlayed = row.played === true;

      const matchIndex = row.match_index || 1;

      teamGames.push({
        round_number: row.round_number,
        round_sort_key: row.round_sort_key,
        display_label: matchIndex > 1 ? `R${row.round_number}(${matchIndex})` : `R${row.round_number}`,
        score: score,
        played: isPlayed,
        match_index: matchIndex,
      });

      const roundKey = `${row.round_number}_${matchIndex}`;
      if (!teamData.rounds[roundKey]) {
        teamData.rounds[roundKey] = score;
      }

      if (isPlayed && score !== null) {
        teamData.roundsPlayed.add(row.round_number);
        if (score > 0) {
          teamData.rawValues.push(score);
        }
      }
    }

    const minRound = allRounds.size > 0 ? Math.min(...Array.from(allRounds)) : 0;
    const maxRound = allRounds.size > 0 ? Math.max(...Array.from(allRounds)) : 0;
    const result: TeamData[] = [];
    const thresholds = thresholdsForLens(lens);

    for (const [teamName, teamData] of teamMap) {
      const values = teamData.rawValues;
      const totalGames = teamData.roundsPlayed.size;
      const stats = computeStatsFromValues(values, totalGames, lens);
      const hitRates = buildHitRates(values, thresholds, totalGames);
      const games = teamGamesMap.get(teamName) || [];

      result.push({
        id: teamData.id,
        name: teamData.name,
        teamColor: teamData.teamColor,
        games: games,
        rounds: teamData.rounds,
        stats,
        hitRates,
      });
    }

    console.log(`✓ Round range: ${minRound} to ${maxRound}`);
    console.log(`✓ Processed ${result.length} teams`);

    return { teams: result, minRound, maxRound };
  } catch (err) {
    console.error("Exception fetching team data:", err);
    return { teams: [], minRound: 0, maxRound: 0 };
  }
}
