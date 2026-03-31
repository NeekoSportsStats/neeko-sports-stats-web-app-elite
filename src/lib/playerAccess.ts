/**
 * Player Access Control - Global Source of Truth
 *
 * Prevents freemium bypasses via team pages, similar players, navigation
 * All access checks MUST go through these functions
 *
 * CRITICAL: Bots (search engines) are ALWAYS treated as free users
 * This prevents premium data leakage in search results while maintaining SEO
 */

import { supabase } from './supabaseClient';
import { isBot } from './botDetection';

let cachedFreePlayerIds: number[] | null = null;
let cacheTimestamp: number | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface AccessContext {
  isPremium: boolean;
  isBot: boolean;
  freePlayerIds: number[];
  userId: string | null;
}

/**
 * Get unified access context (single source of truth)
 * Returns: isPremium, isBot, freePlayerIds
 * Bot requests ALWAYS get isPremium: false
 */
export async function getAccessContext(userId: string | null): Promise<AccessContext> {
  const isBotRequest = isBot();

  const { data, error } = await supabase
    .rpc('get_access_context', {
      p_user_id: userId,
      p_is_bot: isBotRequest
    });

  if (error) {
    console.error('[Access Context] Error fetching access context:', error);
    // Safe fallback: treat as free user
    return {
      isPremium: false,
      isBot: isBotRequest,
      freePlayerIds: cachedFreePlayerIds ?? [],
      userId: null
    };
  }

  return {
    isPremium: data?.is_premium ?? false,
    isBot: data?.is_bot ?? isBotRequest,
    freePlayerIds: data?.free_player_ids ?? [],
    userId: data?.user_id ?? null
  };
}

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
 * Bots: ALWAYS treated as free users (only top 8)
 * Premium users: all players accessible
 * Free users: only top 8 by neeko_rating
 *
 * NEW: Now uses database-level access check for data-level protection
 */
export async function isPlayerAccessible(
  playerId: number,
  userId: string | null = null
): Promise<boolean> {
  const isBotRequest = isBot();

  const { data, error } = await supabase
    .rpc('is_player_accessible', {
      p_player_id: playerId,
      p_user_id: userId,
      p_is_bot: isBotRequest
    });

  if (error) {
    console.error('[Player Access] Error checking player accessibility:', error);
    // Safe fallback: check if in free tier
    const freeIds = await getFreePlayerIds();
    return freeIds.includes(playerId);
  }

  return data ?? false;
}

/**
 * Filter player list to only show accessible players' full data
 * Non-accessible players get locked status
 * Bots: ALWAYS treated as free users
 */
export function markLockedPlayers<T extends { player_id?: number | null }>(
  players: T[],
  isPremium: boolean,
  freePlayerIds: number[]
): (T & { is_locked?: boolean })[] {
  // Bots are ALWAYS free users
  const isBotRequest = isBot();
  const effectiveIsPremium = isBotRequest ? false : isPremium;

  return players.map(player => {
    const playerId = player.player_id;
    const isAccessible = effectiveIsPremium || (playerId !== null && playerId !== undefined && freePlayerIds.includes(playerId));

    return {
      ...player,
      is_locked: !isAccessible,
    };
  });
}

/**
 * Strip advanced stats from locked players
 * Used for team pages, similar players, etc.
 * Bots: ALWAYS treated as free users (premium stats stripped)
 */
export function sanitizeLockedPlayerData<T extends {
  player_id?: number | null;
  summary_short?: string | null;
  summary_long?: string | null;
  ai_recommendation?: string | null;
  value_score?: number | null;
  best_value_score?: number | null;
  avg_last_3?: number | null;
  avg_last_5?: number | null;
}>(
  player: T,
  isPremium: boolean,
  freePlayerIds: number[]
): T & { is_locked: boolean } {
  // Bots are ALWAYS free users
  const isBotRequest = isBot();
  const effectiveIsPremium = isBotRequest ? false : isPremium;

  const playerId = player.player_id;
  const isAccessible = effectiveIsPremium || (playerId !== null && playerId !== undefined && freePlayerIds.includes(playerId));

  if (isAccessible) {
    return {
      ...player,
      is_locked: false,
    };
  }

  // Strip advanced stats for locked players (includes bot requests)
  return {
    ...player,
    summary_short: null,
    summary_long: null,
    ai_recommendation: null,
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
 * Bot-aware: Bots get free tier access only
 */
export async function getTeamPlayersSafe(
  team: string,
  userId: string | null
) {
  const isBotRequest = isBot();

  const { data, error } = await supabase
    .rpc('get_team_players_safe', {
      p_team: team,
      p_user_id: userId,
      p_is_bot: isBotRequest
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
 * Bot-aware: Bots get free tier access only
 */
export async function getSimilarPlayersSafe(
  playerId: number,
  position: string,
  projectionMin: number,
  projectionMax: number,
  userId: string | null,
  limit: number = 5
) {
  const isBotRequest = isBot();

  const { data, error } = await supabase
    .rpc('get_similar_players_safe', {
      p_player_id: playerId,
      p_position: position,
      p_projection_min: projectionMin,
      p_projection_max: projectionMax,
      p_user_id: userId,
      p_limit: limit,
      p_is_bot: isBotRequest
    });

  if (error) {
    console.error('[Player Access] Error fetching similar players:', error);
    throw error;
  }

  return data ?? [];
}

/**
 * Get player rankings with access control
 * Uses database RPC for data-level protection
 * Bot-aware: Bots get free tier access only
 */
export async function getRankingsSafe(
  userId: string | null,
  limit: number = 50
) {
  const isBotRequest = isBot();

  const { data, error } = await supabase
    .rpc('get_rankings_safe', {
      p_user_id: userId,
      p_is_bot: isBotRequest,
      p_limit: limit
    });

  if (error) {
    console.error('[Player Access] Error fetching rankings:', error);
    throw error;
  }

  return data ?? [];
}

/**
 * Get market watch data with access control
 * Uses database RPC for data-level protection
 * Bot-aware: Bots get free tier access only
 */
export async function getMarketWatchSafe(
  userId: string | null,
  category: string | null = null
) {
  const isBotRequest = isBot();

  const { data, error } = await supabase
    .rpc('get_market_watch_safe', {
      p_user_id: userId,
      p_is_bot: isBotRequest,
      p_category: category
    });

  if (error) {
    console.error('[Player Access] Error fetching market watch:', error);
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
