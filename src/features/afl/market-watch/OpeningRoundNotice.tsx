import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export function OpeningRoundNotice() {
  const [hasStats, setHasStats] = useState<boolean | null>(null);

  useEffect(() => {
    supabase
      .from("player_game_stats_2026_raw")
      .select("vendor_game_id", { count: "exact", head: true })
      .then(({ count }) => {
        setHasStats((count ?? 0) > 0);
      });
  }, []);

  if (hasStats === null || hasStats === true) return null;

  return (
    <div className="mb-6 rounded-xl border border-yellow-400/30 bg-yellow-400/[0.04] px-5 py-5 flex flex-col items-center text-center gap-2">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-400/10 border border-yellow-400/20 mb-1">
        <TrendingUp className="h-5 w-5 text-yellow-400" />
      </div>
      <p className="text-sm font-bold text-yellow-300 uppercase tracking-wider">
        Market Watch Activates After Opening Round
      </p>
      <p className="text-[13px] text-white/50 max-w-md leading-relaxed">
        Trade intelligence requires live 2026 match data. Signals will begin generating once Opening Round statistics are available.
      </p>
    </div>
  );
}
