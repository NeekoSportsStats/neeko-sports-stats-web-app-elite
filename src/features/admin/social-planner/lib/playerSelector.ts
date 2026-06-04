/**
 * Player selector — chooses which players to feature in a given slot.
 * Rules:
 * - Match board: filtered by team name (not gameId — RPC returns season-wide stats)
 * - open_free_game: up to thuFriMaxRows total rows
 * - preview_blurred: up to satSunTotalRows total rows (first satSunVisibleRows clear, rest blurred)
 * - Player spotlight: top 1 player by sample strength
 * - Player spotlight duo: top 2 players
 * - Round review/ahead: top players across all teams
 * - No thin samples on covers (gamesPlayed <= 4)
 * - Dedup across slots within same week
 */

import type { AFLPlayerStat, ContentType, ContentVisibilityMode, PlannerSettings } from "../types";
import type { ScheduleSlot } from "./scheduleEngine";
import { sortPlayersBySampleStrength, isThinSample } from "./statFormatter";

export function selectPlayersForSlot(
  slot: ScheduleSlot,
  allPlayers: AFLPlayerStat[],
  settings: PlannerSettings
): AFLPlayerStat[] {
  switch (slot.contentType) {
    case "match_stat_board":
      return selectMatchBoardPlayers(slot, allPlayers, settings);

    case "player_spotlight":
      return selectSpotlightPlayers(allPlayers, 1, slot.homeTeam, slot.awayTeam);

    case "player_spotlight_duo":
      return selectSpotlightPlayers(allPlayers, 2, slot.homeTeam, slot.awayTeam);

    case "round_review":
    case "round_ahead_watch":
      return selectTopPlayers(allPlayers, 5);

    case "product_education":
    case "story_extra":
      return [];
  }
}

function selectMatchBoardPlayers(
  slot: ScheduleSlot,
  allPlayers: AFLPlayerStat[],
  settings: PlannerSettings
): AFLPlayerStat[] {
  if (!slot.homeTeam || !slot.awayTeam) return [];

  const visibilityMode: ContentVisibilityMode = slot.visibilityMode ?? "preview_blurred";
  const maxPerTeamDisposals = visibilityMode === "open_free_game"
    ? Math.ceil(settings.thuFriMaxRows / 4)  // distribute across 4 sections
    : Math.ceil(settings.satSunTotalRows / 4);
  const maxPerTeamGoals = visibilityMode === "open_free_game"
    ? Math.ceil(settings.thuFriMaxRows / 4)
    : Math.ceil(settings.satSunTotalRows / 4);

  // Filter by team name (not gameId — RPC returns season-wide stats without gameId)
  const homeDisposals = allPlayers
    .filter(p => p.statType === "disposals" && p.team === slot.homeTeam && !isThinSample(p))
    .sort(bySampleStrength)
    .slice(0, maxPerTeamDisposals);

  const awayDisposals = allPlayers
    .filter(p => p.statType === "disposals" && p.team === slot.awayTeam && !isThinSample(p))
    .sort(bySampleStrength)
    .slice(0, maxPerTeamDisposals);

  const homeGoals = allPlayers
    .filter(p => p.statType === "goals" && p.team === slot.homeTeam && !isThinSample(p))
    .sort(bySampleStrength)
    .slice(0, maxPerTeamGoals);

  const awayGoals = allPlayers
    .filter(p => p.statType === "goals" && p.team === slot.awayTeam && !isThinSample(p))
    .sort(bySampleStrength)
    .slice(0, maxPerTeamGoals);

  return [...homeDisposals, ...awayDisposals, ...homeGoals, ...awayGoals];
}

function selectSpotlightPlayers(
  allPlayers: AFLPlayerStat[],
  count: number,
  homeTeam?: string,
  awayTeam?: string
): AFLPlayerStat[] {
  let pool = allPlayers.filter(p => !isThinSample(p));

  if (homeTeam && awayTeam) {
    // Prefer players from this matchup
    const gamePool = pool.filter(p => p.team === homeTeam || p.team === awayTeam);
    if (gamePool.length >= count) pool = gamePool;
  }

  return sortPlayersBySampleStrength(pool).slice(0, count);
}

function selectTopPlayers(
  allPlayers: AFLPlayerStat[],
  count: number
): AFLPlayerStat[] {
  const pool = allPlayers.filter(p => !isThinSample(p));
  return sortPlayersBySampleStrength(pool).slice(0, count);
}

function bySampleStrength(a: AFLPlayerStat, b: AFLPlayerStat): number {
  if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
  if (b.percent !== a.percent) return b.percent - a.percent;
  return b.l5Avg - a.l5Avg;
}

/** Remove players already used in earlier posts this week */
export function deduplicatePlayers(
  candidates: AFLPlayerStat[],
  usedPlayerIds: Set<string>
): AFLPlayerStat[] {
  return candidates.filter(p => !usedPlayerIds.has(p.playerId));
}

/** Collect all player IDs from a set of posts */
export function collectUsedPlayerIds(posts: { selectedPlayers: AFLPlayerStat[] }[]): Set<string> {
  const ids = new Set<string>();
  for (const post of posts) {
    for (const p of post.selectedPlayers) {
      ids.add(p.playerId);
    }
  }
  return ids;
}
