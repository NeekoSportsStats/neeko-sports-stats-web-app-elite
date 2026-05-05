import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type {
  StatBoardMatch,
  StatBoardPlayer,
  StatBoardHistoryRow,
  StatLens,
  PositionFilter,
} from "./types";
import { defaultThreshold } from "./types";

const SEASON = 2026;

// ── Matches ──────────────────────────────────────────────────────────────────

export function useStatBoardMatches() {
  const [matches, setMatches] = useState<StatBoardMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) { setError("Supabase not initialised"); setLoading(false); return; }

    supabase
      .rpc("get_stat_board_matches", { p_season: SEASON, p_round: null })
      .then(({ data, error: err }) => {
        if (err) {
          console.error("[StatBoard] get_stat_board_matches error:", err);
          setError(err.message);
        } else {
          setMatches((data as StatBoardMatch[]) ?? []);
        }
        setLoading(false);
      });
  }, []);

  return { matches, loading, error };
}

// ── Players ───────────────────────────────────────────────────────────────────

interface UseStatBoardPlayersOptions {
  matchId: number | null;
  lens: StatLens;
  threshold: number;
  positionFilter: PositionFilter;
  search: string;
}

export function useStatBoardPlayers({
  matchId,
  lens,
  threshold,
  positionFilter,
  search,
}: UseStatBoardPlayersOptions) {
  const [players, setPlayers] = useState<StatBoardPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!supabase || matchId === null) return;
    setLoading(true);
    setError(null);

    const params: Record<string, unknown> = {
      p_season: SEASON,
      p_round: null,
      p_match_id: matchId,
      p_lens: lens,
      p_threshold: threshold,
      p_limit: 200,
      p_offset: 0,
    };
    if (positionFilter !== "ALL") {
      params.p_position_group = positionFilter === "RUCK" ? "RUCK" : positionFilter;
    }
    if (search.trim()) {
      params.p_search = search.trim();
    }

    const { data, error: err } = await supabase.rpc("get_stat_board_players", params);

    if (err) {
      console.error("[StatBoard] get_stat_board_players error:", err);
      setError(err.message);
      setPlayers([]);
    } else {
      setPlayers((data as StatBoardPlayer[]) ?? []);
    }
    setLoading(false);
  }, [matchId, lens, threshold, positionFilter, search]);

  useEffect(() => { fetch(); }, [fetch]);

  return { players, loading, error, refetch: fetch };
}

// ── Player History ────────────────────────────────────────────────────────────

export function useStatBoardPlayerHistory(playerId: number | null) {
  const [history, setHistory] = useState<StatBoardHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (id: number) => {
    if (!supabase) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase.rpc("get_stat_board_player_history", {
      p_player_id: id,
      p_season: SEASON,
      p_limit: 10,
    });

    if (err) {
      console.error("[StatBoard] get_stat_board_player_history error:", err);
      setError(err.message);
      setHistory([]);
    } else {
      setHistory((data as StatBoardHistoryRow[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (playerId !== null) fetch(playerId);
    else { setHistory([]); setLoading(false); }
  }, [playerId, fetch]);

  return { history, loading, error };
}

// ── Player AI Insight ─────────────────────────────────────────────────────────

export interface StatBoardPlayerAiInsight {
  player_id: number;
  summary_short: string | null;
  summary_long: string | null;
  recommendation_short: string | null;
  recommendation_color: string | null;
}

export function useStatBoardPlayerAiInsight(playerId: number | null) {
  const [insight, setInsight] = useState<StatBoardPlayerAiInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (id: number) => {
    if (!supabase) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase.rpc("get_stat_board_player_ai_insight", {
      p_player_id: id,
    });

    if (err) {
      console.error("[StatBoard] get_stat_board_player_ai_insight error:", err);
      setError(err.message);
      setInsight(null);
    } else {
      const rows = data as StatBoardPlayerAiInsight[] | null;
      setInsight(rows?.[0] ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (playerId !== null) fetch(playerId);
    else { setInsight(null); setLoading(false); }
  }, [playerId, fetch]);

  return { insight, loading, error };
}

// Re-export for page use
export { defaultThreshold };
