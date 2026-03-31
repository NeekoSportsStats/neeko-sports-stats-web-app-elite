// ⚠️ CONTRACT LOCK:
// afl.match_center_games_base has updated_at as the ONLY datetime field.
// Use date (derived from updated_at) for grouping matches by day.
// Format: Thu 15 Aug, Fri 16 Aug, Sat 17 Aug, etc.

import type { MatchPlayer, MatchSummary, DayGroup } from "./types";

export function computeTop3(players: MatchPlayer[]): MatchPlayer[] {
  if (!players || players.length === 0) {
    return [];
  }

  const sorted = [...players].sort((a, b) => {
    const fpA = a.fantasy_points ?? 0;
    const fpB = b.fantasy_points ?? 0;

    if (fpB !== fpA) {
      return fpB - fpA;
    }

    const dispA = a.disposals ?? 0;
    const dispB = b.disposals ?? 0;
    return dispB - dispA;
  });

  return sorted.slice(0, 3);
}

export function groupMatchesByDay(matches: MatchSummary[]): DayGroup[] {
  if (!matches || matches.length === 0) {
    return [];
  }

  const grouped = new Map<string, DayGroup>();

  for (const match of matches) {
    const matchDate = match.date ?? "Unknown";

    if (!grouped.has(matchDate)) {
      grouped.set(matchDate, {
        season: match.season ?? 2025,
        round_number: match.round_number ?? 0,
        round_label: match.round_label ?? `R${match.round_number ?? 0}`,
        date: matchDate,
        matches: [],
      });
    }

    grouped.get(matchDate)!.matches.push(match);
  }

  return Array.from(grouped.values()).sort((a, b) => {
    if (a.date === "Unknown" && b.date !== "Unknown") return 1;
    if (a.date !== "Unknown" && b.date === "Unknown") return -1;
    if (a.date === "Unknown" && b.date === "Unknown") return 0;
    return a.date.localeCompare(b.date);
  });
}
