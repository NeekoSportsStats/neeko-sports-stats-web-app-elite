import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface PlayerIntelligence {
  player_id: number;
  summary_short: string | null;
  summary_long: string | null;
  ai_generated_at: string | null;
}

export function usePlayerIntelligence(playerId: number | null) {
  const [intelligence, setIntelligence] = useState<PlayerIntelligence | null>(null);
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
      setError(err.message);
      setIntelligence(null);
    } else {
      const rows = data as PlayerIntelligence[] | null;
      setIntelligence(rows?.[0] ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (playerId !== null) {
      fetch(playerId);
    } else {
      setIntelligence(null);
      setLoading(false);
    }
  }, [playerId, fetch]);

  return { intelligence, loading, error };
}
