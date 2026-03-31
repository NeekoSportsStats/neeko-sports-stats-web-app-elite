import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, TrendingUp, Users, Star } from "lucide-react";

interface BrownlowPlayer {
  player_id: number | null;
  player_name: string;
  team: string;
  position: string;
  season: number;
  games_played: number;
  avg_disposals: number | null;
  avg_clearances: number | null;
  avg_tackles: number | null;
  avg_marks: number | null;
  avg_goals: number | null;
  avg_fantasy: number | null;
  votes_per_game_est: number | null;
  projected_season_votes: number | null;
  vote_rank: number | null;
  percentile: number | null;
  tier: string | null;
}

const TIER_COLORS: Record<string, string> = {
  Elite: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  Premium: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  Mid: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  Value: "text-slate-400 bg-slate-400/10 border-slate-400/20",
};

const fmt1 = (n: number | null) => (n != null ? Number(n).toFixed(1) : "—");
const fmt0 = (n: number | null) => (n != null ? Math.round(Number(n)).toString() : "—");

export default function AdminBrownlowLab() {
  const [players, setPlayers] = useState<BrownlowPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("v_brownlow_predictions")
        .select("*")
        .order("vote_rank", { ascending: true })
        .limit(200);

      if (!error && data) setPlayers(data as BrownlowPlayer[]);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = players.filter((p) => {
    const matchSearch =
      !search ||
      p.player_name.toLowerCase().includes(search.toLowerCase()) ||
      p.team.toLowerCase().includes(search.toLowerCase());
    const matchTier = tierFilter === "all" || p.tier === tierFilter;
    return matchSearch && matchTier;
  });

  const top3 = players.slice(0, 3);
  const totalPlayers = players.length;
  const avgVotes = players.length
    ? (players.reduce((s, p) => s + (p.votes_per_game_est ?? 0), 0) / players.length).toFixed(2)
    : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="h-5 w-5 text-amber-400" />
        <div>
          <h2 className="text-lg font-semibold">Brownlow Lab</h2>
          <p className="text-xs text-muted-foreground">
            Estimated Brownlow votes per game — weighted model (disposals, clearances, goals)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Players Modelled</div>
          <div className="text-2xl font-bold tabular-nums">{totalPlayers}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Avg Votes / Game</div>
          <div className="text-2xl font-bold tabular-nums">{avgVotes}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Leader</div>
          <div className="text-base font-bold truncate">{top3[0]?.player_name ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{top3[0]?.team}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Top Votes Est.</div>
          <div className="text-2xl font-bold tabular-nums text-amber-400">
            {fmt1(top3[0]?.projected_season_votes ?? null)}
          </div>
        </div>
      </div>

      {top3.length >= 3 && (
        <div className="grid grid-cols-3 gap-4">
          {top3.map((p, i) => (
            <div
              key={p.player_id}
              className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    i === 0
                      ? "bg-amber-500/20 text-amber-400"
                      : i === 1
                      ? "bg-slate-400/20 text-slate-300"
                      : "bg-orange-600/20 text-orange-400"
                  }`}
                >
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{p.player_name}</div>
                  <div className="text-xs text-muted-foreground">{p.team}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Votes/game</span>
                <span className="font-medium tabular-nums text-right">{fmt1(p.votes_per_game_est)}</span>
                <span className="text-muted-foreground">Season proj.</span>
                <span className="font-medium tabular-nums text-right">{fmt1(p.projected_season_votes)}</span>
                <span className="text-muted-foreground">Avg disposal</span>
                <span className="font-medium tabular-nums text-right">{fmt1(p.avg_disposals)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search player or team..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          {["all", "Elite", "Premium", "Mid", "Value"].map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                tierFilter === t
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "all" ? "All" : t}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-10">#</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Player</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Team</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tier</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Gms</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Disp</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Clr</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Tkl</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Gls</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Votes/Gm</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Proj Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No players found
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.player_id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{p.vote_rank}</td>
                    <td className="px-4 py-3 font-medium">{p.player_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.team}</td>
                    <td className="px-4 py-3">
                      {p.tier && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${TIER_COLORS[p.tier] ?? ""}`}>
                          {p.tier}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.games_played}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt1(p.avg_disposals)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt1(p.avg_clearances)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt1(p.avg_tackles)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt1(p.avg_goals)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-amber-400">
                      {fmt1(p.votes_per_game_est)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      {fmt1(p.projected_season_votes)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
