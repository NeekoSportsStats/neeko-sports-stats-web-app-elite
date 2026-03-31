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

function getStatLabel(stat: RoundStat) {
  if (stat === "goals") return "goals";
  if (stat === "disposals") return "disposals";
  return "fantasy points";
}

function statValue(row: any, stat: RoundStat): number {
  if (stat === "goals") return Number(row.goals ?? 0);
  if (stat === "fantasy") return Number(row.fantasy_points ?? 0);
  return Number(row.disposals ?? 0);
}

function avgStatValue(avgRow: any, stat: RoundStat): number {
  // avg_* can come back as string depending on view definition — always coerce
  if (stat === "goals") return Number(avgRow?.avg_goals ?? 0);
  if (stat === "fantasy") return Number(avgRow?.avg_fantasy ?? 0);
  return Number(avgRow?.avg_disposals ?? 0);
}

function roundAverageFor(rows: any[], stat: RoundStat): number {
  if (!rows.length) return 0;
  const total = rows.reduce((s, r) => s + statValue(r, stat), 0);
  return Number((total / rows.length).toFixed(1));
}

function signalThreshold(stat: RoundStat) {
  if (stat === "goals") return 1.0;
  if (stat === "fantasy") return 10.0;
  return 5.0;
}

export async function getRoundMomentumData(
  season: number,
  stat: RoundStat
): Promise<RoundMomentumData> {
  const { data: rows, error: roundError } = await supabase
    .from("player_round_with_colors")
    .select("player, disposals, goals, fantasy_points, round_number")
    .eq("season", 2025);

  if (roundError) {
    return {
      topScore: { playerName: "—", value: 0 },
      biggestOverperformer: { playerName: "—", diff: 0, roundValue: 0 },
      roundAverage: 0,
      keyPoints: [`Failed to load round data (${roundError.message}).`],
      isGrandFinal: false,
      currentRound: 0,
      sparkline: [],
    };
  }

  if (!rows || rows.length === 0) {
    const statLabel = getStatLabel(stat);
    return {
      topScore: { playerName: "—", value: 0 },
      biggestOverperformer: { playerName: "—", diff: 0, roundValue: 0 },
      roundAverage: 0,
      keyPoints: [`No ${statLabel} data available yet.`],
      isGrandFinal: false,
      currentRound: 0,
      sparkline: [],
    };
  }

  const currentRound = Math.max(...rows.map((r) => r.round_number));
  const isGrandFinal = currentRound >= 28;

  const latest = rows.filter((r) => r.round_number === currentRound);

  // Sparkline: last 5 rounds league averages
  const lastRounds = Array.from(new Set(rows.map((r) => r.round_number)))
    .sort((a, b) => a - b)
    .slice(-5);

  const sparkline = lastRounds.map((rn) => {
    const rRows = rows.filter((r) => r.round_number === rn);
    return roundAverageFor(rRows, stat);
  });

  // Season averages (>=5 games)
  const { data: averages, error: avgError } = await supabase
    .from("player_season_totals_2025")
    .select("player, avg_disposals, avg_goals, avg_fantasy, games_played")
    .eq("season", 2025)
    .gte("games_played", 5);

  // avgError is not fatal — we still show top + league avg + sparkline
  const avgMap = new Map((averages ?? []).map((a) => [a.player, a]));

  // Top performer
  const top = latest.reduce((m, r) =>
    statValue(r, stat) > statValue(m, stat) ? r : m
  );

  // Biggest overperformer (do NOT filter out — always pick best diff among eligible)
  let over:
    | { player: string; diff: number; roundValue: number; avgValue: number }
    | undefined;

  if (!avgError && avgMap.size > 0) {
    const overList = latest
      .filter((r) => avgMap.has(r.player))
      .map((r) => {
        const a = avgMap.get(r.player)!;
        const roundVal = statValue(r, stat);
        const avgVal = avgStatValue(a, stat);
        return {
          player: r.player,
          diff: Number((roundVal - avgVal).toFixed(1)),
          roundValue: roundVal,
          avgValue: avgVal,
        };
      })
      .sort((a, b) => b.diff - a.diff);

    over = overList[0];
  }

  const roundAvg = roundAverageFor(latest, stat);
  const statLabel = getStatLabel(stat);

  const keyPoints: string[] = [];

  keyPoints.push(
    `⭐ ${top.player} led the round.`
  );

  if (over && Number.isFinite(over.diff)) {
    if (over.diff >= signalThreshold(stat)) {
      keyPoints.push(
        `📈 ${over.player} significantly exceeded their season average (+${over.diff} ${statLabel}).`
      );
    } else if (over.diff > 0) {
      keyPoints.push(
        `📈 No major overperformer signal — best was ${over.player} (+${over.diff}).`
      );
    } else {
      keyPoints.push(
        "📈 No players significantly exceeded their season averages."
      );
    }
  } else {
    keyPoints.push(
      avgError
        ? "📈 Overperformer signal unavailable (season averages query failed)."
        : "📈 No overperformer signal (insufficient season averages)."
    );
  }

  keyPoints.push(
    `🧠 League average: ${roundAvg}.`
  );

  return {
    topScore: { playerName: top.player, value: statValue(top, stat) },
    biggestOverperformer: over
      ? {
          playerName: over.player,
          diff: over.diff,
          roundValue: over.roundValue,
        }
      : { playerName: "—", diff: 0, roundValue: 0 },
    roundAverage: roundAvg,
    keyPoints,
    isGrandFinal,
    currentRound,
    sparkline,
  };
}