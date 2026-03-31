import { useState, useEffect, useCallback } from "react";
import { Zap, RefreshCw, Star, TrendingUp, Gem, TriangleAlert as AlertTriangle, Flame, TrendingDown, ChevronRight } from "lucide-react";
import { getContentOpportunities, type ContentOpportunity, type ContentCategory } from "./opportunitiesService";
import ContentPackModal from "./ContentPackModal";

const CATEGORY_META: Record<
  ContentCategory,
  { label: string; color: string; bg: string; border: string; icon: React.ElementType }
> = {
  captain:  { label: "CAPTAIN",  color: "text-blue-700 dark:text-blue-300",    bg: "bg-blue-500/10",    border: "border-blue-500/30",    icon: Star },
  breakout: { label: "BREAKOUT", color: "text-orange-700 dark:text-orange-300", bg: "bg-orange-500/10",  border: "border-orange-500/30",  icon: Zap },
  value:    { label: "VALUE",    color: "text-emerald-700 dark:text-emerald-300",bg: "bg-emerald-500/10",border: "border-emerald-500/30", icon: Gem },
  trap:     { label: "TRAP",     color: "text-yellow-700 dark:text-yellow-300", bg: "bg-yellow-500/10",  border: "border-yellow-500/30",  icon: AlertTriangle },
  momentum: { label: "HOT FORM", color: "text-red-700 dark:text-red-300",       bg: "bg-red-500/10",     border: "border-red-500/30",     icon: Flame },
  sell:     { label: "SELL",     color: "text-slate-700 dark:text-slate-300",   bg: "bg-slate-500/10",   border: "border-slate-500/30",   icon: TrendingDown },
};

const ALL_CATEGORIES: ContentCategory[] = ["captain", "breakout", "value", "trap", "momentum", "sell"];

const posColor = (pos: string | null) => {
  switch (pos) {
    case "MID": return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
    case "DEF": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "FWD": return "bg-orange-500/15 text-orange-700 dark:text-orange-300";
    case "RUC": return "bg-slate-500/15 text-slate-700 dark:text-slate-300";
    default: return "bg-muted text-muted-foreground";
  }
};

const fmtPrice = (n: number | null) =>
  n != null ? `$${(n / 1000).toFixed(0)}k` : "—";

const fmtNum = (n: number | null, suffix = "") =>
  n != null ? `${Math.round(n)}${suffix}` : "—";

function OpportunityCard({
  opp,
  onGenerate,
}: {
  opp: ContentOpportunity;
  onGenerate: (opp: ContentOpportunity) => void;
}) {
  const meta = CATEGORY_META[opp.category];
  const Icon = meta.icon;

  return (
    <div className={`rounded-lg border ${meta.border} ${meta.bg} p-4 flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${meta.bg} ${meta.color} border ${meta.border}`}>
              <Icon className="h-3 w-3" />
              {meta.label}
            </span>
            {opp.position && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${posColor(opp.position)}`}>
                {opp.position}
              </span>
            )}
          </div>
          <p className="font-semibold text-sm leading-tight">{opp.player_name}</p>
          <p className="text-xs text-muted-foreground">{opp.team}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        {opp.projection != null && (
          <div>
            <span className="text-muted-foreground block">Proj</span>
            <span className="font-semibold">{fmtNum(opp.projection, " pts")}</span>
          </div>
        )}
        {opp.value_score != null && (
          <div>
            <span className="text-muted-foreground block">Value</span>
            <span className="font-semibold">{opp.value_score.toFixed(1)}</span>
          </div>
        )}
        {opp.price != null && (
          <div>
            <span className="text-muted-foreground block">Price</span>
            <span className="font-semibold">{fmtPrice(opp.price)}</span>
          </div>
        )}
        {opp.form_score != null && (
          <div>
            <span className="text-muted-foreground block">Form</span>
            <span className="font-semibold">{fmtNum(opp.form_score)}</span>
          </div>
        )}
        {opp.captain_score != null && opp.category === "captain" && (
          <div>
            <span className="text-muted-foreground block">Cap Score</span>
            <span className="font-semibold">{fmtNum(opp.captain_score)}</span>
          </div>
        )}
        {opp.upside_pct != null && ["breakout", "value"].includes(opp.category) && (
          <div>
            <span className="text-muted-foreground block">Upside</span>
            <span className="font-semibold">{Math.round(opp.upside_pct)}%</span>
          </div>
        )}
        {opp.risk_rating != null && ["trap", "sell"].includes(opp.category) && (
          <div>
            <span className="text-muted-foreground block">Risk</span>
            <span className="font-semibold">{fmtNum(opp.risk_rating)}</span>
          </div>
        )}
      </div>

      {opp.summary_short && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 border-t border-border/50 pt-2">
          {opp.summary_short}
        </p>
      )}

      <button
        onClick={() => onGenerate(opp)}
        className="mt-auto flex items-center justify-center gap-2 w-full py-2 px-3 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
      >
        <Zap className="h-3.5 w-3.5" />
        Generate Content Pack
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function ContentDashboard() {
  const [opportunities, setOpportunities] = useState<ContentOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ContentCategory | "all">("all");
  const [selectedOpp, setSelectedOpp] = useState<ContentOpportunity | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const opps = await getContentOpportunities();
      setOpportunities(opps);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load opportunities");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered =
    activeCategory === "all"
      ? opportunities
      : opportunities.filter((o) => o.category === activeCategory);

  const counts = ALL_CATEGORIES.reduce<Record<string, number>>((acc, cat) => {
    acc[cat] = opportunities.filter((o) => o.category === cat).length;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">Today's Content Opportunities</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {loading ? "Loading..." : `${opportunities.length} opportunities across ${ALL_CATEGORIES.length} categories`}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-xs hover:bg-accent transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        <button
          onClick={() => setActiveCategory("all")}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
            activeCategory === "all"
              ? "bg-foreground text-background border-foreground"
              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
          }`}
        >
          All
          <span className="text-[10px] opacity-70">({opportunities.length})</span>
        </button>
        {ALL_CATEGORIES.map((cat) => {
          const meta = CATEGORY_META[cat];
          const Icon = meta.icon;
          const active = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                active
                  ? `${meta.bg} ${meta.color} ${meta.border}`
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
              <span className="text-[10px] opacity-70">({counts[cat] ?? 0})</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-xs text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-lg border border-border animate-pulse bg-muted/30" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No opportunities found for this category.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((opp, i) => (
            <OpportunityCard
              key={`${opp.player_id}-${opp.category}-${i}`}
              opp={opp}
              onGenerate={setSelectedOpp}
            />
          ))}
        </div>
      )}

      {selectedOpp && (
        <ContentPackModal
          opp={selectedOpp}
          onClose={() => setSelectedOpp(null)}
        />
      )}
    </div>
  );
}
