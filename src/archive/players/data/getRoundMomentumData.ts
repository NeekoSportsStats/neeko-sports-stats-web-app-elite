import { supabase } from "@/integrations/supabase/client";

export type RoundStat = "disposals" | "goals" | "fantasy";

export type RoundMomentumData = {
  topScore: { playerName: string; value: number };
  biggestOverperformer: { playerName: string; diff: number; roundValue: number };
  roundAverage: number;
  keyPoints: string[];
  isGrandFinal: boolean;
  currentRound: number;
  sparkline?: number[];
};

function statValue(row: any, stat: RoundStat): number {
  if (stat === "goals") return row.goals ?? 0;
  if (stat === "fantasy") return row.fantasy_points ?? 0;
  return row.disposals ?? 0;
}

function avgStatValue(avgRow: any, stat: RoundStat): number {
  if (stat === "goals") return Number(avgRow.avg_goals ?? 0);
  if (stat === "fantasy") return Number(avgRow.avg_fantasy ?? 0);
  return Number(avgRow.avg_disposals ?? 0);
}

function roundAverageFor(rows: any[], stat: RoundStat): number {
  if (!rows.length) return 0;
  const total = rows.reduce((s, r) => s + statValue(r, stat), 0);
  return Number((total / rows.length).toFixed(1));
}

export async function getRoundMomentumData(season: number, stat: RoundStat): Promise<RoundMomentumData> {
  const { data: rows } = await supabase
    .from("player_round_with_colors")
    .select("player, disposals, goals, fantasy_points, round_number")
    .eq("season", 2025);

  if (!rows?.length) {
    return {
      topScore: { playerName: "—", value: 0 },
      biggestOverperformer: { playerName: "—", diff: 0, roundValue: 0 },
      roundAverage: 0,
      keyPoints: ["No round data available."],
      isGrandFinal: false,
      currentRound: 0,
      sparkline: [],
    };
  }

  const currentRound = Math.max(...rows.map((r) => r.round_number));
  const latest = rows.filter((r) => r.round_number === currentRound);

  const { data: averages } = await supabase
    .from("player_season_totals_2025")
    .select("player, avg_disposals, avg_goals, avg_fantasy, games_played")
    .eq("season", 2025)
    .gte("games_played", 5);

  const avgMap = new Map(averages?.map((a) => [a.player, a]) ?? []);

  const top = latest.reduce((m, r) => (statValue(r, stat) > statValue(m, stat) ? r : m));

  // Biggest Over logic
  let over = latest
    .filter((r) => avgMap.has(r.player))
    .map((r) => ({
      player: r.player,
      diff: statValue(r, stat) - avgStatValue(avgMap.get(r.player), stat),
      roundValue: statValue(r, stat),
    }))
    .sort((a, b) => b.diff - a.diff)[0];

  if (!over) {
    const roundAvg = roundAverageFor(latest, stat);
    over = latest
      .map((r) => ({
        player: r.player,
        diff: statValue(r, stat) - roundAvg,
        roundValue: statValue(r, stat),
      }))
      .sort((a, b) => b.diff - a.diff)[0];
  }

  const roundAvg = roundAverageFor(latest, stat);

  return {
    topScore: { playerName: top.player, value: statValue(top, stat) },
    biggestOverperformer: {
      playerName: over.player,
      diff: Number(over.diff.toFixed(1)),
      roundValue: over.roundValue,
    },
    roundAverage: roundAvg,
    keyPoints: [
      `⭐ ${top.player} led the round.`,
      `📈 Biggest overperformer: ${over.player} (+${Number(over.diff.toFixed(1))}).`,
      `🧠 League average: ${roundAvg} ${stat}.`,
    ],
    isGrandFinal: currentRound >= 28,
    currentRound,
    sparkline: Array.from(new Set(rows.map((r) => r.round_number)))
      .sort((a, b) => a - b)
      .slice(-5)
      .map((rn) => roundAverageFor(rows.filter((r) => r.round_number === rn), stat)),
  };
}