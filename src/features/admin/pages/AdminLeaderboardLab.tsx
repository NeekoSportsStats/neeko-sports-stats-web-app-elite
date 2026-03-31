import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChartBar as BarChart3, TrendingUp, Users, Medal } from "lucide-react";

interface LeaderboardPlayer {
  player_id: number | null;
  player_name: string;
  team: string;
  position: string | null;
  projection_final: number | null;
  ceiling_estimate: number | null;
  floor_estimate: number | null;
  consistency_score: number | null;
  form_rating: number | null;
  neeko_rating: number | null;
  price: number | null;
  value_score: number | null;
  ai_recommendation: string | null;
  recommendation_short: string | null;
}

const RECO_COLORS: Record<string, string> = {
  "MUST START": "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  BUY: "text-green-400 bg-green-400/10 border-green-400/20",
  HOLD: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  SELL: "text-red-400 bg-red-400/10 border-red-400/20",
  DOWNGRADE: "text-orange-400 bg-orange-400/10 border-orange-400/20",
};

const fmtPrice = (n: number | null) =>
  n != null ? `$${(Number(n) / 1000).toFixed(0)}k` : "—";
const fmt1 = (n: number | null) => (n != null ? Number(n).toFixed(1) : "—");
const fmt0 = (n: number | null) => (n != null ? Math.round(Number(n)).toString() : "—");

type SortKey = "projection_final" | "neeko_rating" | "form_rating" | "value_score" | "ceiling_estimate";

export default function AdminLeaderboardLab() {
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("projection_final");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("v_rankings_content_engine")
        .select(
          "player_id, player_name, team, position, projection_final, ceiling_estimate, floor_estimate, consistency_score, form_rating, neeko_rating, price, value_score, ai_recommendation, recommendation_short"
        )
        .order("projection_final", { ascending: false })
        .limit(300);

      if (!error && data) setPlayers(data as LeaderboardPlayer[]);
      setLoading(false);
    }
    load();
  }, []);

  const positions = ["all", ...Array.from(new Set(players.map((p) => p.position ?? "").filter(Boolean))).sort()];

  const filtered = players
    .filter((p) => {
      const matchSearch =
        !search ||
        p.player_name.toLowerCase().includes(search.toLowerCase()) ||
        (p.team ?? "").toLowerCase().includes(search.toLowerCase());
      const matchPos = posFilter === "all" || p.position === posFilter;
      return matchSearch && matchPos;
    })
    .sort((a, b) => (Number(b[sortKey] ?? 0) - Number(a[sortKey] ?? 0)));

  const top1 = players[0];
  const avgProj = players.length
    ? (players.reduce((s, p) => s + (p.projection_final ?? 0), 0) / players.length).toFixed(1)
    : "—";
  const mustStarts = players.filter((p) => (p.recommendation_short ?? "").includes("MUST")).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-5 w-5 text-blue-400" />
        <div>
          <h2 className="text-lg font-semibold">Leaderboard Lab</h2>
          <p className="text-xs text-muted-foreground">
            Fantasy leaderboard analysis — projections, ratings, and AI recommendations
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Total Players</div>
          <div className="text-2xl font-bold tabular-nums">{players.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Avg Projection</div>
          <div className="text-2xl font-bold tabular-nums">{avgProj}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Top Scorer</div>
          <div className="text-base font-bold truncate">{top1?.player_name ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{top1?.team}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Must Starts</div>
          <div className="text-2xl font-bold tabular-nums text-emerald-400">{mustStarts}</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search player or team..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <select
          value={posFilter}
          onChange={(e) => setPosFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          {positions.map((p) => (
            <option key={p} value={p}>
              {p === "all" ? "All positions" : p}
            </option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="projection_final">Sort: Projection</option>
          <option value="neeko_rating">Sort: Neeko Rating</option>
          <option value="form_rating">Sort: Form</option>
          <option value="value_score">Sort: Value</option>
          <option value="ceiling_estimate">Sort: Ceiling</option>
        </select>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-10">#</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Player</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Team</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Pos</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Proj</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ceil</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Floor</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Form</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Rating</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Price</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Value</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reco</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No players found
                  </td>
                </tr>
              ) : (
                filtered.map((p, i) => {
                  const reco = p.recommendation_short ?? p.ai_recommendation ?? "";
                  const recoKey = Object.keys(RECO_COLORS).find((k) => reco.toUpperCase().includes(k)) ?? "";
                  return (
                    <tr key={p.player_id ?? i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{i + 1}</td>
                      <td className="px-4 py-3 font-medium">{p.player_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.team}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.position ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {fmt0(p.projection_final)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-blue-400">
                        {fmt0(p.ceiling_estimate)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {fmt0(p.floor_estimate)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmt0(p.form_rating)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-amber-400">
                        {fmt1(p.neeko_rating)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {fmtPrice(p.price)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmt1(p.value_score)}
                      </td>
                      <td className="px-4 py-3">
                        {recoKey && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${RECO_COLORS[recoKey]}`}>
                            {recoKey}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
