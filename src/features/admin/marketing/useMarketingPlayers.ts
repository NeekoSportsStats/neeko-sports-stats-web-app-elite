import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { MarketingPlayer } from "./types";

export default function useMarketingPlayers() {
  const [players, setPlayers] = useState<MarketingPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { user } = await supabase.auth.getUser();
      const { data } = await supabase.rpc("get_rankings_safe", {
        p_user_id: user?.user?.id ?? null,
        p_is_bot: false,
        p_limit: 300,
      });
      if (data) setPlayers(data as MarketingPlayer[]);
      setLoading(false);
    }
    load();
  }, []);

  return { players, loading };
}
