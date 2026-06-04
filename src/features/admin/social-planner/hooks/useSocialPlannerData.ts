/**
 * Data-access hook for the Social Content Planner.
 *
 * Provides:
 *  - fetchCurrentRound()  — resolves week + season from v_current_afl_round
 *  - fetchGames()         — AFL games for a given round via RPC
 *  - fetchPlayerStats()   — player threshold hit-rates via RPC
 *  - loadPosts()          — load saved posts for a round from DB
 *  - savePosts()          — bulk-replace posts for a round in DB
 *  - upsertPost()         — save a single edited post
 *  - updateStatus()       — quick status flip without a full re-save
 */
import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { SocialPost, AFLGame, AFLPlayerStat, PostStatus } from "../types";
import {
  dbGameToAFLGame, dbStatToAFLPlayerStat,
  dbToPost, postToDb,
  type DbGame, type DbPlayerStat, type DbPost,
} from "../lib/dbAdapter";

interface CurrentRound {
  week: number;
  season: number;
}

interface UseSocialPlannerDataReturn {
  isLoading: boolean;
  error: string | null;
  fetchCurrentRound: () => Promise<CurrentRound | null>;
  fetchGames: (week: number, season: number) => Promise<AFLGame[]>;
  fetchPlayerStats: (season: number) => Promise<AFLPlayerStat[]>;
  loadPosts: (round: number, season: number) => Promise<SocialPost[]>;
  savePosts: (posts: SocialPost[], round: number, season: number) => Promise<void>;
  upsertPost: (post: SocialPost) => Promise<void>;
  updateStatus: (id: string, status: PostStatus) => Promise<void>;
}

export function useSocialPlannerData(): UseSocialPlannerDataReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withLoading = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    setIsLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchCurrentRound = useCallback((): Promise<CurrentRound | null> => {
    return withLoading(async () => {
      const { data, error: err } = await supabase
        .from("v_current_afl_round")
        .select("current_round, current_season")
        .maybeSingle();
      if (err) throw new Error(err.message);
      if (!data) return null;
      return {
        week: (data as Record<string, unknown>).current_round as number,
        season: (data as Record<string, unknown>).current_season as number,
      };
    });
  }, [withLoading]);

  const fetchGames = useCallback((week: number, season: number): Promise<AFLGame[]> => {
    return withLoading(async () => {
      const { data, error: err } = await supabase
        .rpc("get_social_planner_games", { p_week: week, p_season: season });
      if (err) throw new Error(err.message);
      return ((data ?? []) as DbGame[]).map(dbGameToAFLGame);
    });
  }, [withLoading]);

  const fetchPlayerStats = useCallback((season: number): Promise<AFLPlayerStat[]> => {
    return withLoading(async () => {
      const { data, error: err } = await supabase
        .rpc("get_social_planner_player_stats", { p_season: season, p_min_games: 3 });
      if (err) throw new Error(err.message);
      return ((data ?? []) as DbPlayerStat[]).map(dbStatToAFLPlayerStat);
    });
  }, [withLoading]);

  const loadPosts = useCallback((round: number, season: number): Promise<SocialPost[]> => {
    return withLoading(async () => {
      const { data, error: err } = await supabase
        .from("social_content_posts")
        .select("*")
        .eq("round", round)
        .eq("season", season)
        .order("date", { ascending: true });
      if (err) throw new Error(err.message);
      return ((data ?? []) as DbPost[]).map(dbToPost);
    });
  }, [withLoading]);

  const savePosts = useCallback((posts: SocialPost[], round: number, season: number): Promise<void> => {
    return withLoading(async () => {
      // Delete existing posts for this round then insert fresh
      const { error: delErr } = await supabase
        .from("social_content_posts")
        .delete()
        .eq("round", round)
        .eq("season", season);
      if (delErr) throw new Error(delErr.message);

      if (posts.length === 0) return;

      const rows = posts.map(p => postToDb(p));
      const { error: insErr } = await supabase
        .from("social_content_posts")
        .insert(rows);
      if (insErr) throw new Error(insErr.message);
    });
  }, [withLoading]);

  const upsertPost = useCallback((post: SocialPost): Promise<void> => {
    return withLoading(async () => {
      const row = postToDb(post);
      const { error: err } = await supabase
        .from("social_content_posts")
        .upsert(row, { onConflict: "id" });
      if (err) throw new Error(err.message);
    });
  }, [withLoading]);

  const updateStatus = useCallback((id: string, status: PostStatus): Promise<void> => {
    return withLoading(async () => {
      const { error: err } = await supabase
        .from("social_content_posts")
        .update({ status })
        .eq("id", id);
      if (err) throw new Error(err.message);
    });
  }, [withLoading]);

  return {
    isLoading,
    error,
    fetchCurrentRound,
    fetchGames,
    fetchPlayerStats,
    loadPosts,
    savePosts,
    upsertPost,
    updateStatus,
  };
}
