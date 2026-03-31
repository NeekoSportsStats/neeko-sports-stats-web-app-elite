import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Users, TrendingUp, TrendingDown, TriangleAlert as AlertTriangle, Gem, Flame, Shield, Crown, ChevronDown, ChevronUp, ChartBar as BarChart3, Database, DollarSign, Swords } from "lucide-react";
import { FantasyPricesTab } from "../price-ingest/FantasyPricesTab";
import { NameResolverTab } from "../price-ingest/NameResolverTab";
import { PriceChangeDebugTab } from "../price-ingest/PriceChangeDebugTab";
import { FantasyPlayerMatchingTab } from "../price-ingest/FantasyPlayerMatchingTab";

type MainTab = "players" | "projections" | "rankings-source" | "fantasy-prices" | "player-metrics";

const MAIN_TABS: { id: MainTab; label: string; icon: React.ElementType }[] = [
  { id: "players",         label: "Players",         icon: Users },
  { id: "projections",     label: "Projections",     icon: TrendingUp },
  { id: "rankings-source", label: "Rankings Source", icon: Database },
  { id: "fantasy-prices",  label: "Fantasy Prices",  icon: DollarSign },
  { id: "player-metrics",  label: "Player Metrics",  icon: BarChart3 },
];

interface PlayerRow {
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  projection_final: number;
  projection: number;
  ceiling: number;
  floor: number;
  price: number;
  neeko_rating: number;
  value_score: number;
  value_tag: string;
  consistency: number;
  form_score: number;
  captain_score: number;
  captain_rating: string;
  upside_rating: string;
  upside_pct: number;
  risk_rating: string;
  matchup_rating: string;
  matchup_multiplier: number;
  ai_recommendation: string;
  recommendation_strength: string;
  recommendation_color: string;
  recommendation_short: string;
  market_watch_category: string;
  best_value_score: number;
}

interface ProjectionRow {
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  projection_final: number;
  ceiling: number;
  floor: number;
  consistency: number;
  form_score: number;
  upside_pct: number;
  matchup_multiplier: number;
  neeko_rating: number;
}

interface RankingsSourceRow {
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  neeko_rating: number;
  value_score: number;
  captain_score: number;
  ai_recommendation: string;
  recommendation_short: string;
  recommendation_strength: string;
  recommendation_color: string;
  market_watch_category: string;
  best_value_score: number;
  price: number;
}

type PriceSubTab = "prices" | "name-resolver" | "player-matching" | "price-debug";

type MetricTabKey =
  | "hot" | "cold" | "overrated" | "undervalued"
  | "breakout" | "high_risk" | "consistency" | "captain"
  | "price_drop" | "price_rise";

interface MetricTabDef {
  key: MetricTabKey;
  label: string;
  icon: React.ElementType;
  description: string;
}

const METRIC_TABS: MetricTabDef[] = [
  { key: "hot",         label: "Hot",          icon: Flame,        description: "High projection + strong form + rising value" },
  { key: "cold",        label: "Cold",          icon: TrendingDown, description: "Declining projection + poor form" },
  { key: "overrated",   label: "Overrated",     icon: AlertTriangle,description: "High price but projection below breakeven" },
  { key: "undervalued", label: "Undervalued",   icon: Gem,          description: "Strong value score + projection beats price expectation" },
  { key: "breakout",    label: "Breakout Watch",icon: TrendingUp,   description: "High upside + strong ceiling relative to price" },
  { key: "high_risk",   label: "High Risk",     icon: Shield,       description: "High volatility / low confidence players" },
  { key: "consistency", label: "Consistency",   icon: BarChart3,    description: "Most consistent performers by consistency score" },
  { key: "captain",     label: "Captain",       icon: Crown,        description: "Top captain score players" },
  { key: "price_drop",  label: "Price Drops",   icon: ChevronDown,  description: "Biggest expected price decreases" },
  { key: "price_rise",  label: "Price Rises",   icon: ChevronUp,    description: "Biggest expected price increases" },
];

function fmtPrice(p: number) {
  if (!p) return "—";
  if (p >= 1_000_000) return `$${(p / 1_000_000).toFixed(2)}M`;
  if (p >= 1_000) return `$${(p / 1_000).toFixed(0)}k`;
  return `$${p}`;
}

function fmtNum(n: number | null | undefined, dec = 1) {
  if (n === null || n === undefined) return "—";
  return n.toFixed(dec);
}

function PosBadge({ pos }: { pos: string }) {
  const cls = pos === "FWD" ? "bg-red-500/15 text-red-400 border-red-500/25"
    : pos === "MID" ? "bg-sky-500/15 text-sky-400 border-sky-500/25"
    : pos === "DEF" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
    : "bg-amber-500/15 text-amber-400 border-amber-500/25";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border ${cls}`}>{pos}</span>
  );
}

function RatingBadge({ label }: { label: string | null | undefined }) {
  if (!label) return <span className="text-muted-foreground text-xs">—</span>;
  const up = label.toUpperCase();
  const cls = up.includes("ELITE") || up.includes("STRONG") || up.includes("BUY") ? "text-emerald-400"
    : up.includes("HIGH") || up.includes("RISKY") || up.includes("SELL") ? "text-red-400"
    : up.includes("MED") || up.includes("HOLD") || up.includes("MODERATE") ? "text-amber-400"
    : "text-muted-foreground";
  return <span className={`text-xs font-medium ${cls}`}>{label}</span>;
}

function TabStrip({ tabs, activeId, onChange }: {
  tabs: { id: string; label: string; icon?: React.ElementType }[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto border-b border-border pb-0" style={{ scrollbarWidth: "none" }}>
      <div className="flex gap-0 min-w-max">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeId === id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayersTab({ players, loading, onRefresh }: {
  players: PlayerRow[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return players.filter(p => {
      const matchSearch = !search || p.player_name.toLowerCase().includes(search.toLowerCase()) || p.team.toLowerCase().includes(search.toLowerCase());
      const matchPos = posFilter === "all" || p.position === posFilter;
      return matchSearch && matchPos;
    });
  }, [players, search, posFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search player or team..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-border rounded-md px-3 py-1.5 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-56"
        />
        <div className="flex gap-1">
          {["all", "FWD", "MID", "DEF", "RUC"].map(pos => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                posFilter === pos ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {pos === "all" ? "All" : pos}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} players</span>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">#</th>
                <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Player</th>
                <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Team</th>
                <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Pos</th>
                <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Proj</th>
                <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Neeko</th>
                <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Price</th>
                <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Value</th>
                <th className="text-left py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">AI Reco</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((p, i) => (
                <tr key={p.player_id ?? i} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="py-1.5 pr-3 text-muted-foreground tabular-nums text-xs">{i + 1}</td>
                  <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{p.player_name}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground text-xs whitespace-nowrap">{p.team}</td>
                  <td className="py-1.5 pr-3"><PosBadge pos={p.position} /></td>
                  <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-emerald-400">{fmtNum(p.projection_final)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmtNum(p.neeko_rating, 0)}</td>
                  <td className="py-1.5 pr-3 text-right text-muted-foreground text-xs">{fmtPrice(p.price)}</td>
                  <td className="py-1.5 pr-3"><RatingBadge label={p.value_tag} /></td>
                  <td className="py-1.5"><RatingBadge label={p.recommendation_short || p.ai_recommendation} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 200 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">Showing 200 of {filtered.length} — refine search to see more</p>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectionsTab({ players, loading }: { players: PlayerRow[]; loading: boolean }) {
  const sorted = useMemo(() => {
    return [...players].sort((a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0)).slice(0, 100);
  }, [players]);

  return loading ? (
    <div className="space-y-2">{[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40">
            <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">#</th>
            <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Player</th>
            <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Team</th>
            <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Pos</th>
            <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Projection</th>
            <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Ceiling</th>
            <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Floor</th>
            <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Range</th>
            <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Upside%</th>
            <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Form</th>
            <th className="text-right py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Matchup</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const range = (p.ceiling ?? 0) - (p.floor ?? 0);
            return (
              <tr key={p.player_id ?? i} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                <td className="py-1.5 pr-3 text-muted-foreground tabular-nums text-xs">{i + 1}</td>
                <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{p.player_name}</td>
                <td className="py-1.5 pr-3 text-muted-foreground text-xs whitespace-nowrap">{p.team}</td>
                <td className="py-1.5 pr-3"><PosBadge pos={p.position} /></td>
                <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-emerald-400">{fmtNum(p.projection_final)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmtNum(p.ceiling)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-red-600 dark:text-red-400">{fmtNum(p.floor)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-amber-400">{fmtNum(range, 0)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{fmtNum(p.upside_pct, 0)}%</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{fmtNum(p.form_score, 1)}</td>
                <td className="py-1.5 text-right tabular-nums">{fmtNum(p.matchup_multiplier, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-2">Top 100 players by projection · Source: v_rankings_master</p>
    </div>
  );
}

function RankingsSourceTab({ players, loading }: { players: PlayerRow[]; loading: boolean }) {
  const RECO_ORDER = ["BUY", "HOLD", "SELL", "AVOID", "WATCH"];
  const grouped = useMemo(() => {
    const g: Record<string, PlayerRow[]> = {};
    for (const p of players) {
      const key = (p.ai_recommendation || "Unknown").toUpperCase();
      const bucket = RECO_ORDER.find(r => key.includes(r)) ?? "OTHER";
      if (!g[bucket]) g[bucket] = [];
      g[bucket].push(p);
    }
    return g;
  }, [players]);

  if (loading) {
    return <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
        {RECO_ORDER.map(reco => {
          const count = grouped[reco]?.length ?? 0;
          const color = reco === "BUY" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5"
            : reco === "SELL" || reco === "AVOID" ? "text-red-400 border-red-500/30 bg-red-500/5"
            : reco === "HOLD" ? "text-amber-400 border-amber-500/30 bg-amber-500/5"
            : "text-muted-foreground border-border bg-muted/20";
          return (
            <div key={reco} className={`rounded-lg border px-4 py-3 text-center ${color}`}>
              <div className="text-2xl font-bold tabular-nums">{count}</div>
              <div className="text-xs font-medium mt-0.5">{reco}</div>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40">
              <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">#</th>
              <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Player</th>
              <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Team</th>
              <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Pos</th>
              <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Neeko</th>
              <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Capt.</th>
              <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Value</th>
              <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">AI Reco</th>
              <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Short</th>
              <th className="text-left py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">MW Cat.</th>
            </tr>
          </thead>
          <tbody>
            {players.slice(0, 200).map((p, i) => (
              <tr key={p.player_id ?? i} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                <td className="py-1.5 pr-3 text-muted-foreground tabular-nums text-xs">{i + 1}</td>
                <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{p.player_name}</td>
                <td className="py-1.5 pr-3 text-muted-foreground text-xs whitespace-nowrap">{p.team}</td>
                <td className="py-1.5 pr-3"><PosBadge pos={p.position} /></td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{fmtNum(p.neeko_rating, 0)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{fmtNum(p.captain_score, 0)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{fmtNum(p.best_value_score, 1)}</td>
                <td className="py-1.5 pr-3"><RatingBadge label={p.ai_recommendation} /></td>
                <td className="py-1.5 pr-3 text-xs text-muted-foreground max-w-[200px] truncate">{p.recommendation_short || "—"}</td>
                <td className="py-1.5 text-xs">{p.market_watch_category || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground mt-2">Top 200 · Source: v_rankings_master</p>
      </div>
    </div>
  );
}

const PRICE_SUB_TABS: { id: PriceSubTab; label: string }[] = [
  { id: "prices",           label: "Fantasy Prices" },
  { id: "player-matching",  label: "Player Matching" },
  { id: "name-resolver",    label: "Name Resolver" },
  { id: "price-debug",      label: "Price Change Debug" },
];

function FantasyPricesSection() {
  const [subTab, setSubTab] = useState<PriceSubTab>("prices");
  return (
    <div className="space-y-4">
      <TabStrip
        tabs={PRICE_SUB_TABS}
        activeId={subTab}
        onChange={id => setSubTab(id as PriceSubTab)}
      />
      {subTab === "prices"          && <FantasyPricesTab />}
      {subTab === "player-matching" && <FantasyPlayerMatchingTab />}
      {subTab === "name-resolver"   && <NameResolverTab />}
      {subTab === "price-debug"     && <PriceChangeDebugTab />}
    </div>
  );
}

const METRIC_TAB_LIMITS: Record<MetricTabKey, number> = {
  hot: 20, cold: 20, overrated: 25, undervalued: 25,
  breakout: 20, high_risk: 20, consistency: 20, captain: 20,
  price_drop: 20, price_rise: 20,
};

function PlayerMetricsTab({ players, loading }: { players: PlayerRow[]; loading: boolean }) {
  const [activeMetricTab, setActiveMetricTab] = useState<MetricTabKey>("hot");

  const tabData = useMemo((): PlayerRow[] => {
    const limit = METRIC_TAB_LIMITS[activeMetricTab];
    const sorted = [...players];
    switch (activeMetricTab) {
      case "hot":
        return sorted.sort((a, b) => (b.neeko_rating ?? 0) - (a.neeko_rating ?? 0)).slice(0, limit);
      case "cold":
        return sorted.filter(p => (p.form_score ?? 0) < 50).sort((a, b) => (a.neeko_rating ?? 0) - (b.neeko_rating ?? 0)).slice(0, limit);
      case "overrated":
        return sorted.filter(p => p.price > 700_000).sort((a, b) => {
          const edgeA = (a.projection_final ?? 0) - (a.price / 7200);
          const edgeB = (b.projection_final ?? 0) - (b.price / 7200);
          return edgeA - edgeB;
        }).slice(0, limit);
      case "undervalued":
        return sorted.filter(p => (p.best_value_score ?? 0) > 0).sort((a, b) => (b.best_value_score ?? 0) - (a.best_value_score ?? 0)).slice(0, limit);
      case "breakout":
        return sorted.sort((a, b) => (b.upside_pct ?? 0) - (a.upside_pct ?? 0)).slice(0, limit);
      case "high_risk":
        return sorted.filter(p => ((p.ceiling ?? 0) - (p.floor ?? 0)) > 60).sort((a, b) => {
          return ((b.ceiling ?? 0) - (b.floor ?? 0)) - ((a.ceiling ?? 0) - (a.floor ?? 0));
        }).slice(0, limit);
      case "consistency":
        return sorted.filter(p => (p.consistency ?? 0) > 0).sort((a, b) => (b.consistency ?? 0) - (a.consistency ?? 0)).slice(0, limit);
      case "captain":
        return sorted.sort((a, b) => (b.captain_score ?? 0) - (a.captain_score ?? 0)).slice(0, limit);
      case "price_drop":
        return sorted.sort((a, b) => {
          const eA = (a.projection_final ?? 0) - (a.price / 7200);
          const eB = (b.projection_final ?? 0) - (b.price / 7200);
          return eA - eB;
        }).slice(0, limit);
      case "price_rise":
        return sorted.filter(p => (p.projection_final ?? 0) > (p.price / 7200)).sort((a, b) => {
          const eA = (a.projection_final ?? 0) - (a.price / 7200);
          const eB = (b.projection_final ?? 0) - (b.price / 7200);
          return eB - eA;
        }).slice(0, limit);
      default:
        return [];
    }
  }, [players, activeMetricTab]);

  const activeTabDef = METRIC_TABS.find(t => t.key === activeMetricTab)!;

  return (
    <div className="space-y-4">
      <TabStrip
        tabs={METRIC_TABS.map(t => ({ id: t.key, label: t.label, icon: t.icon }))}
        activeId={activeMetricTab}
        onChange={id => setActiveMetricTab(id as MetricTabKey)}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <activeTabDef.icon className="h-4 w-4 text-muted-foreground" />
            {activeTabDef.label}
            <span className="text-xs font-normal text-muted-foreground ml-1">— {activeTabDef.description}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
          ) : tabData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No players match this filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">#</th>
                    <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Player</th>
                    <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Team</th>
                    <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Pos</th>
                    <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Proj</th>
                    <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Neeko</th>
                    <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Price</th>
                    <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Ceil</th>
                    <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Floor</th>
                    <th className="text-left py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {tabData.map((p, i) => (
                    <tr key={p.player_id ?? i} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="py-1.5 pr-3 text-muted-foreground tabular-nums text-xs">{i + 1}</td>
                      <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{p.player_name}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground text-xs whitespace-nowrap">{p.team}</td>
                      <td className="py-1.5 pr-3"><PosBadge pos={p.position} /></td>
                      <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-emerald-400">{fmtNum(p.projection_final)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{fmtNum(p.neeko_rating, 0)}</td>
                      <td className="py-1.5 pr-3 text-right text-muted-foreground text-xs">{fmtPrice(p.price)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-emerald-400">{fmtNum(p.ceiling)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-red-400">{fmtNum(p.floor)}</td>
                      <td className="py-1.5"><RatingBadge label={p.value_tag} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-2">
                {tabData.length} players · Source: v_rankings_master
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminPlayersIntelligence() {
  const [activeTab, setActiveTab] = useState<MainTab>("players");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const hasLoaded = useRef(false);

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("v_rankings_master")
        .select("player_id,player_name,team,position,projection_final,projection,ceiling,floor,price,neeko_rating,value_score,value_tag,consistency,form_score,captain_score,captain_rating,upside_rating,upside_pct,risk_rating,matchup_rating,matchup_multiplier,ai_recommendation,recommendation_strength,recommendation_color,recommendation_short,market_watch_category,best_value_score")
        .limit(800);
      if (data) setPlayers(data as PlayerRow[]);
    } finally {
      setLoading(false);
      setLastRefreshed(new Date());
    }
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) {
      hasLoaded.current = true;
      fetchPlayers();
    }
  }, [fetchPlayers]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Player Data &amp; Stats</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lastRefreshed
              ? `${players.length.toLocaleString()} players loaded · ${lastRefreshed.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}`
              : "Real data from v_rankings_master"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPlayers} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <TabStrip
        tabs={MAIN_TABS.map(t => ({ id: t.id, label: t.label, icon: t.icon }))}
        activeId={activeTab}
        onChange={id => setActiveTab(id as MainTab)}
      />

      <div>
        {activeTab === "players"         && <PlayersTab players={players} loading={loading} onRefresh={fetchPlayers} />}
        {activeTab === "projections"     && <ProjectionsTab players={players} loading={loading} />}
        {activeTab === "rankings-source" && <RankingsSourceTab players={players} loading={loading} />}
        {activeTab === "fantasy-prices"  && <FantasyPricesSection />}
        {activeTab === "player-metrics"  && <PlayerMetricsTab players={players} loading={loading} />}
      </div>
    </div>
  );
}
