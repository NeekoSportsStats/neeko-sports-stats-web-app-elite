/**
 * Player Access Control - Global Source of Truth
 *
 * Prevents freemium bypasses via team pages, similar players, navigation
 * All access checks MUST go through these functions
 */

import { supabase } from './supabaseClient';

let cachedFreePlayerIds: number[] | null = null;
let cacheTimestamp: number | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get free player IDs (top 8 by neeko_rating)
 * Cached for 5 minutes to avoid excessive DB calls
 */
export async function getFreePlayerIds(): Promise<number[]> {
  const now = Date.now();

  // Return cached value if still valid
  if (cachedFreePlayerIds && cacheTimestamp && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedFreePlayerIds;
  }

  // Fetch from database
  const { data, error } = await supabase
    .rpc('get_free_player_ids');

  if (error) {
    console.error('[Player Access] Error fetching free player IDs:', error);
    return cachedFreePlayerIds ?? []; // Return stale cache on error
  }

  cachedFreePlayerIds = data ?? [];
  cacheTimestamp = now;

  return cachedFreePlayerIds;
}

/**
 * Check if a player is accessible to the current user
 * Premium users: all players accessible
 * Free users: only top 8 by neeko_rating
 */
export async function isPlayerAccessible(
  playerId: number,
  isPremium: boolean
): Promise<boolean> {
  if (isPremium) {
    return true;
  }

  const freeIds = await getFreePlayerIds();
  return freeIds.includes(playerId);
}

/**
 * Filter player list to only show accessible players' full data
 * Non-accessible players get locked status
 */
export function markLockedPlayers<T extends { player_id?: number | null }>(
  players: T[],
  isPremium: boolean,
  freePlayerIds: number[]
): (T & { is_locked?: boolean })[] {
  return players.map(player => {
    const playerId = player.player_id;
    const isAccessible = isPremium || (playerId !== null && playerId !== undefined && freePlayerIds.includes(playerId));

    return {
      ...player,
      is_locked: !isAccessible,
    };
  });
}

/**
 * Strip advanced stats from locked players
 * Used for team pages, similar players, etc.
 */
export function sanitizeLockedPlayerData<T extends {
  player_id?: number | null;
  summary_short?: string | null;
  summary_long?: string | null;
  value_score?: number | null;
  best_value_score?: number | null;
  avg_last_3?: number | null;
  avg_last_5?: number | null;
}>(
  player: T,
  isPremium: boolean,
  freePlayerIds: number[]
): T & { is_locked: boolean } {
  const playerId = player.player_id;
  const isAccessible = isPremium || (playerId !== null && playerId !== undefined && freePlayerIds.includes(playerId));

  if (isAccessible) {
    return {
      ...player,
      is_locked: false,
    };
  }

  // Strip advanced stats for locked players
  return {
    ...player,
    summary_short: null,
    summary_long: null,
    value_score: null,
    best_value_score: null,
    avg_last_3: null,
    avg_last_5: null,
    is_locked: true,
  };
}

/**
 * Get team players with access control
 * Uses database RPC for server-side filtering
 */
export async function getTeamPlayersSafe(
  team: string,
  userId: string | null
) {
  const { data, error } = await supabase
    .rpc('get_team_players_safe', {
      p_team: team,
      p_user_id: userId,
    });

  if (error) {
    console.error('[Player Access] Error fetching team players:', error);
    throw error;
  }

  return data ?? [];
}

/**
 * Get similar players with access control
 * Uses database RPC for server-side filtering
 */
export async function getSimilarPlayersSafe(
  playerId: number,
  position: string,
  projectionMin: number,
  projectionMax: number,
  userId: string | null,
  limit: number = 5
) {
  const { data, error } = await supabase
    .rpc('get_similar_players_safe', {
      p_player_id: playerId,
      p_position: position,
      p_projection_min: projectionMin,
      p_projection_max: projectionMax,
      p_user_id: userId ?? null,
      p_limit: limit,
      p_is_bot: false,
    });

  if (error) {
    console.error('[Player Access] Error fetching similar players:', error);
    return []; // Safe fallback - don't crash page
  }

  return data ?? [];
}

/**
 * Get player detail with access control
 * Uses database RPC for server-side filtering
 */
export async function getPlayerDetailSafe(
  playerName: string,
  userId: string | null
) {
  const { data, error } = await supabase
    .rpc('get_player_detail_safe', {
      p_player_name: playerName,
      p_user_id: userId,
    });

  if (error) {
    console.error('[Player Access] Error fetching player detail:', error);
    throw error;
  }

  return data && data.length > 0 ? data[0] : null;
}

/**
 * Get position players with access control
 * Uses database RPC for server-side filtering
 */
export async function getPositionPlayersSafe(
  positionCode: string,
  userId: string | null,
  limit: number = 50
) {
  const { data, error } = await supabase
    .rpc('get_position_players_safe', {
      p_position_code: positionCode,
      p_user_id: userId,
      p_limit: limit,
    });

  if (error) {
    console.error('[Player Access] Error fetching position players:', error);
    throw error;
  }

  return data ?? [];
}

/**
 * Clear the free player IDs cache
 * Call this when rankings update
 */
export function clearFreePlayerCache() {
  cachedFreePlayerIds = null;
  cacheTimestamp = null;
}
