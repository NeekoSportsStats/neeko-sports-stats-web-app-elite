import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { MarketingPlayer } from "./types";

export default function useMarketingPlayers() {
  const [players, setPlayers] = useState<MarketingPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("v_rankings_free")
        .select(
          "player_id, player_name, team, team_name, position, projection_final, ceiling, floor, consistency, form_score, matchup_rating, risk_rating, projection_confidence, neeko_rating, neeko_rating_scaled, price, prev_price, price_change, price_change_pct, value_score, best_value_score, value_tag, value_tier, consistency_tier, ai_recommendation, recommendation_strength, recommendation_color, recommendation_short, recommendation_why, summary_short, summary_long, games_played, status, manual_status, is_available, bye_round, is_bye"
        )
        .order("neeko_rating", { ascending: false })
        .limit(300);
      if (data) setPlayers(data as MarketingPlayer[]);
      setLoading(false);
    }
    load();
  }, []);

  return { players, loading };
}
