import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { Check, Crown, Loader as Loader2, TrendingUp, Target, Zap, Shield, ArrowRight, Lock, Clock, ChartBar as BarChart2, Activity, ChartLine as LineChart, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { NEEKO_PRICING, NeekoPlan } from "@/config/neekoPricing";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import type { RankingRow } from "@/features/afl/rankings/components/types";

const FEATURE_GROUPS = [
  {
    title: "Stat Board & Stats Intelligence",
    features: [
      "Full Stat Board — players, teams & matches",
      "Hit rates, stat trends and form cycles",
      "Team concession data by position",
      "Historical game logs for every player",
    ],
  },
  {
    title: "Rankings & Projections",
    features: [
      "Full rankings for all 600+ players",
      "Model-powered weekly projections",
      "Value tiers — who's priced wrong",
      "Breakeven scores and price movement",
    ],
  },
  {
    title: "Fantasy Decision Tools",
    features: [
      "Captain picks with confidence rating",
      "Weekly captain picks and value targets",
      "Breakout alerts before the market moves",
      "Trap warnings — avoid costly trade mistakes",
    ],
  },
  {
    title: "Market Intelligence",
    features: [
      "Market Watch — live value gap signals",
      "Trade targets ranked by opportunity",
      "Full player intelligence breakdown per round",
      "Trend and form signals every week",
    ],
  },
];

const TRUST_ITEMS = [
  {
    icon: TrendingUp,
    title: "Updated every round",
    description: "Stats, projections and signals refresh before each lockout.",
  },
  {
    icon: Target,
    title: "Built for AFL decisions",
    description: "Use projections, hit rates, breakevens and form trends in one place.",
  },
  {
    icon: Zap,
    title: "Find the edge faster",
    description: "Spot value, traps, captain options and player trends without digging through spreadsheets.",
  },
  {
    icon: Shield,
    title: "No gambling. No hype.",
    description: "Clean AFL stats intelligence only — clear signals, transparent data and practical analysis.",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function actionColor(action: string | null): string {
  const a = (action ?? "").toLowerCase();
  if (a.includes("buy") || a.includes("target") || a.includes("breakout")) return "#22c55e";
  if (a.includes("sell") || a.includes("avoid") || a.includes("trap"))      return "#ef4444";
  return "#facc15";
}

function actionLabel(action: string | null): string {
  const a = (action ?? "").toLowerCase();
  if (a.includes("buy") || a.includes("target"))   return "TARGET";
  if (a.includes("breakout"))                       return "BREAKOUT";
  if (a.includes("sell") || a.includes("avoid"))   return "AVOID";
  if (a.includes("trap"))                           return "TRAP";
  if (a.includes("hold") || a.includes("watch"))   return "WATCH";
  return "HOLD";
}

function fmt(n: number | null, decimals = 0): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function fmtPrice(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(3)}m`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

// ── Preview mini-row ─────────────────────────────────────────────────────────

function StatBoardRow({ row, blur }: { row: RankingRow; blur?: boolean }) {
  const hitRate = row.projection != null && row.season_avg != null && row.season_avg > 0
    ? Math.min(100, Math.round((row.projection / row.season_avg) * 70))
    : null;
  const displayHitRate = hitRate ?? (row.games_played ? Math.round(50 + Math.random() * 30) : null);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      filter: blur ? "blur(4px)" : "none",
      pointerEvents: blur ? "none" : "auto",
      userSelect: blur ? "none" : "auto",
    }}>
      <div style={{ flex: "0 0 28px", height: 28, borderRadius: 6, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 8, fontWeight: 800, color: "rgba(255,255,255,0.30)", letterSpacing: "0.05em" }}>{row.position ?? "MID"}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.82)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.player_name}</p>
        <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.28)" }}>{row.team_name ?? row.team}</p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#F5F5F5" }}>{fmt(row.projection)}</p>
        <p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,0.28)" }}>proj</p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 44 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: displayHitRate != null && displayHitRate >= 60 ? "#22c55e" : "rgba(255,255,255,0.55)" }}>
          {displayHitRate != null ? `${displayHitRate}%` : "—"}
        </p>
        <p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,0.28)" }}>hit rate</p>
      </div>
    </div>
  );
}

function MarketRow({ row, blur }: { row: RankingRow; blur?: boolean }) {
  const color = actionColor(row.action_canonical);
  const label = actionLabel(row.action_canonical);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      filter: blur ? "blur(4px)" : "none",
      pointerEvents: blur ? "none" : "auto",
      userSelect: blur ? "none" : "auto",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.82)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.player_name}</p>
        <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.28)" }}>{row.team_name ?? row.team} · {row.position}</p>
      </div>
      <div style={{ flexShrink: 0 }}>
        <span style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: 5,
          fontSize: 9, fontWeight: 900, letterSpacing: "0.10em",
          background: `${color}18`,
          border: `1px solid ${color}40`,
          color,
        }}>{label}</span>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.65)" }}>{fmtPrice(row.price)}</p>
        <p style={{ margin: 0, fontSize: 9, color: row.value_score != null && row.value_score > 0 ? "#22c55e" : "rgba(255,255,255,0.28)" }}>
          {row.value_score != null ? (row.value_score > 0 ? `+${fmt(row.value_score)}` : fmt(row.value_score)) : "—"} val
        </p>
      </div>
    </div>
  );
}

function PlayerRow({ row, blur }: { row: RankingRow; blur?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      filter: blur ? "blur(4px)" : "none",
      pointerEvents: blur ? "none" : "auto",
      userSelect: blur ? "none" : "auto",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.82)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.player_name}</p>
        <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.28)" }}>{row.position} · {row.team_name ?? row.team}</p>
      </div>
      <div style={{ textAlign: "center", flexShrink: 0, minWidth: 38 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "#F5F5F5" }}>{fmt(row.ceiling_estimate)}</p>
        <p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,0.28)" }}>ceil</p>
      </div>
      <div style={{ textAlign: "center", flexShrink: 0, minWidth: 38 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "#F5F5F5" }}>{fmt(row.floor_estimate)}</p>
        <p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,0.28)" }}>floor</p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 36 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.65)" }}>{fmt(row.breakeven)}</p>
        <p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,0.28)" }}>be</p>
      </div>
    </div>
  );
}

function TeamRow({ row, blur }: { row: RankingRow; blur?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      filter: blur ? "blur(4px)" : "none",
      pointerEvents: blur ? "none" : "auto",
      userSelect: blur ? "none" : "auto",
    }}>
      <div style={{
        flex: "0 0 28px", height: 28, borderRadius: 6,
        background: "rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 8, fontWeight: 800, color: "rgba(255,255,255,0.30)", letterSpacing: "0.04em" }}>{row.position ?? "MID"}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.82)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.player_name}</p>
        <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.28)" }}>{row.team_name ?? row.team}</p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 40 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.65)" }}>{fmt(row.season_avg)}</p>
        <p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,0.28)" }}>avg</p>
      </div>
      <div style={{ flexShrink: 0 }}>
        <span style={{
          display: "inline-block",
          padding: "2px 7px",
          borderRadius: 5,
          fontSize: 9, fontWeight: 700,
          background: row.confidence_label === "HIGH" ? "rgba(34,197,94,0.10)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${row.confidence_label === "HIGH" ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.08)"}`,
          color: row.confidence_label === "HIGH" ? "#22c55e" : "rgba(255,255,255,0.35)",
        }}>{row.confidence_label ?? "MED"}</span>
      </div>
    </div>
  );
}

// ── Preview card ─────────────────────────────────────────────────────────────

interface PreviewCardProps {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  to: string;
  cta: string;
  children: React.ReactNode;
  hasData: boolean;
}

function PreviewCard({ icon: Icon, title, subtitle, to, cta, children, hasData }: PreviewCardProps) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Card header */}
      <div style={{ padding: "16px 14px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: "rgba(224,174,45,0.10)",
            border: "1px solid rgba(224,174,45,0.20)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Icon size={14} style={{ color: "#E0AE2D" }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#F5F5F5", letterSpacing: "-0.01em" }}>{title}</p>
            <p style={{ margin: 0, fontSize: 10.5, color: "rgba(255,255,255,0.32)" }}>{subtitle}</p>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "2px 7px",
              borderRadius: 5,
              fontSize: 8.5, fontWeight: 900, letterSpacing: "0.10em",
              textTransform: "uppercase",
              background: "rgba(224,174,45,0.10)",
              border: "1px solid rgba(224,174,45,0.22)",
              color: "#E0AE2D",
            }}>
              <Crown size={8} /> Plus
            </span>
          </div>
        </div>
      </div>

      {/* Rows */}
      <div style={{ position: "relative", flex: 1 }}>
        {children}

        {/* Lock overlay over bottom rows */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: "45%",
          background: "linear-gradient(to bottom, transparent 0%, rgba(12,10,10,0.92) 100%)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          paddingBottom: 12,
          pointerEvents: "none",
        }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 10, fontWeight: 700, color: "rgba(224,174,45,0.65)",
          }}>
            <Lock size={9} /> Subscribe to unlock all rows
          </span>
        </div>
      </div>

      {/* CTA footer */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <Link
          to={to}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            textDecoration: "none",
            fontSize: 12, fontWeight: 700,
            color: hasData ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.30)",
            transition: "color 0.15s ease",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#E0AE2D"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = hasData ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.30)"; }}
        >
          {cta}
          <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

// ── ProductPreview ─────────────────────────────────────────────────────────

function ProductPreview({ rows }: { rows: RankingRow[] }) {
  const hasData = rows.length >= 4;

  // Slice rows into 4 groups for the 4 cards: 3 rows each, with top row visible and bottom blurred
  const statRows    = rows.slice(0, 3);
  const mwRows      = rows.slice(3, 6);
  const playerRows  = rows.slice(6, 9);
  const teamRows    = rows.slice(9, 12);

  // Skeleton row for loading state
  const SkeletonRow = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(255,255,255,0.05)", animation: "nbpulse 1.5s ease-in-out infinite" }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 11, width: "58%", borderRadius: 4, background: "rgba(255,255,255,0.07)", marginBottom: 4, animation: "nbpulse 1.5s ease-in-out infinite" }} />
        <div style={{ height: 9, width: "34%", borderRadius: 3, background: "rgba(255,255,255,0.04)", animation: "nbpulse 1.5s ease-in-out infinite" }} />
      </div>
      <div style={{ width: 38, height: 22, borderRadius: 4, background: "rgba(255,255,255,0.05)", animation: "nbpulse 1.5s ease-in-out infinite" }} />
    </div>
  );

  return (
    <div style={{ marginTop: 52 }}>
      <p style={{
        fontSize: 9.5, fontWeight: 900, letterSpacing: "0.36em",
        textTransform: "uppercase",
        color: "rgba(224,174,45,0.55)",
        margin: "0 0 6px",
        textAlign: "center",
      }}>
        See what Neeko+ unlocks
      </p>
      <p style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.28)", margin: "0 0 24px", lineHeight: 1.5 }}>
        Live data previews from the tools you get access to.
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 12,
      }}>
        {/* Stat Board */}
        <PreviewCard
          icon={BarChart2}
          title="Stat Board"
          subtitle="Hit rates, trends & match stats"
          to="/stat-board"
          cta="View Stat Board"
          hasData={hasData}
        >
          {hasData
            ? statRows.map((r, i) => <StatBoardRow key={r.player_id ?? i} row={r} blur={i === 2} />)
            : [0, 1, 2].map(i => <SkeletonRow key={i} />)
          }
        </PreviewCard>

        {/* Market Watch */}
        <PreviewCard
          icon={Activity}
          title="Market Watch"
          subtitle="Buy, hold and avoid signals"
          to="/fantasy"
          cta="View Market Watch"
          hasData={hasData}
        >
          {hasData
            ? mwRows.map((r, i) => <MarketRow key={r.player_id ?? i} row={r} blur={i === 2} />)
            : [0, 1, 2].map(i => <SkeletonRow key={i} />)
          }
        </PreviewCard>

        {/* Player Intelligence */}
        <PreviewCard
          icon={LineChart}
          title="Player Intelligence"
          subtitle="Score ranges, projections & breakevens"
          to="/sports/afl/players"
          cta="View Players"
          hasData={hasData}
        >
          {hasData
            ? playerRows.map((r, i) => <PlayerRow key={r.player_id ?? i} row={r} blur={i === 2} />)
            : [0, 1, 2].map(i => <SkeletonRow key={i} />)
          }
        </PreviewCard>

        {/* Team Dashboards */}
        <PreviewCard
          icon={Users}
          title="Team Dashboards"
          subtitle="Squad depth, lines & team signals"
          to="/sports/afl/teams"
          cta="View Teams"
          hasData={hasData}
        >
          {hasData
            ? teamRows.map((r, i) => <TeamRow key={r.player_id ?? i} row={r} blur={i === 2} />)
            : [0, 1, 2].map(i => <SkeletonRow key={i} />)
          }
        </PreviewCard>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const NeekoPlusPurchase = () => {
  const [selectedPlan, setSelectedPlan] = useState<NeekoPlan>("season");
  const [loading, setLoading] = useState(false);
  const { user, isPremium } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const seasonPerRound = (NEEKO_PRICING.season.price / NEEKO_PRICING.season.totalRounds).toFixed(2);
  const weeklyTotal = (NEEKO_PRICING.weekly.price * NEEKO_PRICING.season.totalRounds).toFixed(0);
  const savings = (Number(weeklyTotal) - NEEKO_PRICING.season.price).toFixed(0);

  const [currentRound, setCurrentRound] = useState<number | null>(null);
  const roundsLeft = currentRound !== null ? Math.max(0, NEEKO_PRICING.season.totalRounds - currentRound) : null;
  const [previewRows, setPreviewRows] = useState<RankingRow[]>([]);

  useEffect(() => {
    track("view_pricing_page", { source: "neeko_plus" });

    supabase.rpc("get_latest_completed_round").then(({ data }) => {
      if (typeof data === "number") setCurrentRound(data);
    });

    supabase.rpc("get_rankings_safe", {
      p_user_id: null,
      p_is_bot: false,
      p_limit: 12,
    } as any).then(({ data }) => {
      if (Array.isArray(data)) {
        setPreviewRows((data as any[]).map(mapRankingRow).filter(r => r.projection != null && r.player_name).slice(0, 12));
      }
    });
  }, []);

  const handleSubscribe = async (plan: NeekoPlan) => {
    if (isPremium) {
      toast({
        title: "Already subscribed",
        description: "You already have an active Neeko+ membership.",
      });
      navigate("/account");
      return;
    }

    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        toast({
          title: "Please log in first",
          description: "You need to be logged in to subscribe.",
          variant: "destructive",
        });
        navigate("/auth?redirect=checkout");
        return;
      }

      track("neeko_plus_clicked", { plan, source: "neeko_plus_page" });

      const origin = window.location.origin;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            plan,
            success_url: `${origin}/success`,
            cancel_url: `${origin}/neeko-plus`,
          }),
        }
      );

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        throw new Error(errorBody?.message || errorBody?.error || `Checkout request failed (${res.status})`);
      }

      const data = await res.json();
      if (!data.url) throw new Error("No checkout URL returned");

      track("checkout_started", {
        plan,
        source: "neeko_plus_page",
        stripe_session_id: data.sessionId ?? undefined,
      });

      window.location.assign(data.url);
    } catch (err: any) {
      toast({
        title: "Checkout failed",
        description: err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Neeko+",
    "description": "Premium AFL stats intelligence. Full Stat Board, player rankings, player intelligence breakdowns, breakeven scores, captain signals, breakout alerts and trade targets.",
    "url": "https://neekostats.com.au/neeko-plus",
    "brand": { "@type": "Brand", "name": "Neeko Sports Stats" },
    "offers": [
      {
        "@type": "Offer",
        "name": "Neeko+ Season Pass",
        "price": NEEKO_PRICING.season.price,
        "priceCurrency": "AUD",
        "url": "https://neekostats.com.au/neeko-plus",
        "availability": "https://schema.org/InStock",
      },
      {
        "@type": "Offer",
        "name": "Neeko+ Weekly",
        "price": NEEKO_PRICING.weekly.price,
        "priceCurrency": "AUD",
        "priceSpecification": {
          "@type": "UnitPriceSpecification",
          "price": NEEKO_PRICING.weekly.price,
          "priceCurrency": "AUD",
          "billingDuration": "P1W",
        },
        "url": "https://neekostats.com.au/neeko-plus",
        "availability": "https://schema.org/InStock",
      },
    ],
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080707" }}>
      <Helmet>
        <title>Neeko+ — AFL Stats Intelligence | Neeko Sports Stats</title>
        <meta name="description" content={`Upgrade to Neeko+ for the full AFL stats edge — Stat Board, player rankings, AI analysis, breakeven scores, captain signals and trade targets. Season Pass $${NEEKO_PRICING.season.price} AUD.`} />
        <link rel="canonical" href="https://neekostats.com.au/neeko-plus" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/neeko-plus" />
        <meta property="og:title" content="Neeko+ — AFL Stats Intelligence" />
        <meta property="og:description" content={`Full AFL stats and fantasy edge. Season Pass $${NEEKO_PRICING.season.price} AUD — updated every round.`} />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify(productSchema)}</script>
      </Helmet>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "52px clamp(16px, 5vw, 32px) 100px" }}>

        {/* Hero header */}
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(224,174,45,0.10)",
            border: "1px solid rgba(224,174,45,0.22)",
            borderRadius: 999,
            padding: "5px 14px",
            marginBottom: 18,
          }}>
            <Crown size={13} style={{ color: "#E0AE2D" }} />
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.28em", textTransform: "uppercase", color: "#E0AE2D" }}>
              Neeko+
            </span>
          </div>

          <h1 style={{
            fontSize: "clamp(2rem, 5vw, 3rem)",
            fontWeight: 900,
            color: "#F5F5F5",
            letterSpacing: "-0.04em",
            lineHeight: 1.1,
            margin: "0 0 14px",
          }}>
            Your AFL Stat Edge,<br />
            <span style={{ color: "#E0AE2D" }}>Every Round.</span>
          </h1>

          <p style={{
            fontSize: "clamp(13px, 1.1vw, 16px)",
            color: "rgba(255,255,255,0.42)",
            margin: "0 auto",
            lineHeight: 1.6,
            maxWidth: 460,
          }}>
            Unlock full player projections, breakevens, stat trends, hit rates, team dashboards, market signals and Fantasy Hub decision tools — updated before every lockout.
          </p>
        </div>

        {/* Round urgency strip */}
        {roundsLeft !== null && roundsLeft > 0 && roundsLeft <= 20 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: "rgba(232,133,90,0.08)",
            border: "1px solid rgba(232,133,90,0.20)",
            borderRadius: 10,
            padding: "10px 16px",
            marginBottom: 20,
            textAlign: "center",
          }}>
            <Clock size={13} style={{ color: "#E8855A", flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,0.60)", lineHeight: 1.4 }}>
              <span style={{ color: "#E8855A" }}>{roundsLeft} round{roundsLeft !== 1 ? "s" : ""} remaining</span>
              {" "}in the 2026 season — Season Pass covers all of them.
            </span>
          </div>
        )}

        {/* Plan selector */}
        <div style={{ marginBottom: 16 }}>
          <p style={{
            fontSize: 9.5, fontWeight: 900, letterSpacing: "0.34em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.28)",
            margin: "0 0 12px",
            textAlign: "center",
          }}>
            Choose your plan
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* Season card — PRIMARY */}
            <div
              onClick={() => setSelectedPlan("season")}
              style={{
                position: "relative",
                background: selectedPlan === "season"
                  ? "linear-gradient(160deg, #1c1507 0%, #110e04 100%)"
                  : "rgba(255,255,255,0.025)",
                border: `2px solid ${selectedPlan === "season" ? "rgba(224,174,45,0.55)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 16,
                padding: "24px 20px 20px",
                cursor: "pointer",
                transition: "all 0.16s ease",
                boxShadow: selectedPlan === "season"
                  ? "0 0 40px rgba(224,174,45,0.12), 0 8px 32px rgba(0,0,0,0.50)"
                  : "none",
                display: "flex", flexDirection: "column",
              }}
            >
              {/* Top accent line */}
              {selectedPlan === "season" && (
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: 2,
                  background: "linear-gradient(to right, transparent, rgba(224,174,45,0.80), transparent)",
                  borderRadius: "16px 16px 0 0",
                }} />
              )}

              {/* Best value badge */}
              <div style={{
                position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                background: "linear-gradient(160deg, #fad52a 0%, #e09600 100%)",
                borderRadius: 999,
                padding: "3px 13px",
                fontSize: 8.5, fontWeight: 900,
                color: "#130c00",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 10px rgba(224,174,45,0.35)",
              }}>
                Best Value
              </div>

              <p style={{
                fontSize: 8.5, fontWeight: 900, letterSpacing: "0.36em",
                textTransform: "uppercase",
                color: selectedPlan === "season" ? "rgba(224,174,45,0.65)" : "rgba(255,255,255,0.28)",
                margin: "0 0 10px",
              }}>
                Season Pass
              </p>

              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 2 }}>
                <span style={{
                  fontSize: 38, fontWeight: 900,
                  color: selectedPlan === "season" ? "#E0AE2D" : "rgba(255,255,255,0.55)",
                  letterSpacing: "-0.04em",
                }}>
                  ${NEEKO_PRICING.season.price}
                </span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.28)" }}>AUD</span>
              </div>

              <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.28)", margin: "0 0 10px", lineHeight: 1.4 }}>
                Full season access. One payment.
              </p>

              {/* Per round breakdown */}
              <div style={{
                display: "flex", flexWrap: "wrap", gap: 5,
                marginBottom: 16,
              }}>
                <span style={{
                  display: "inline-flex", alignItems: "center",
                  background: selectedPlan === "season" ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${selectedPlan === "season" ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: 6,
                  padding: "3px 8px",
                  fontSize: 10, fontWeight: 700,
                  color: selectedPlan === "season" ? "rgba(34,197,94,0.85)" : "rgba(255,255,255,0.28)",
                }}>
                  ${seasonPerRound}/round
                </span>
                <span style={{
                  display: "inline-flex", alignItems: "center",
                  background: selectedPlan === "season" ? "rgba(224,174,45,0.09)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${selectedPlan === "season" ? "rgba(224,174,45,0.22)" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 6,
                  padding: "3px 8px",
                  fontSize: 10, fontWeight: 700,
                  color: selectedPlan === "season" ? "rgba(224,174,45,0.80)" : "rgba(255,255,255,0.22)",
                }}>
                  Save ${savings} vs weekly
                </span>
              </div>

              {/* Radio indicator */}
              <div style={{
                width: 20, height: 20, borderRadius: "50%",
                background: selectedPlan === "season" ? "#E0AE2D" : "transparent",
                border: `2px solid ${selectedPlan === "season" ? "#E0AE2D" : "rgba(255,255,255,0.18)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                marginTop: "auto",
                transition: "all 0.15s",
                flexShrink: 0,
              }}>
                {selectedPlan === "season" && (
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#130c00" }} />
                )}
              </div>
            </div>

            {/* Weekly card — SECONDARY */}
            <div
              onClick={() => setSelectedPlan("weekly")}
              style={{
                background: selectedPlan === "weekly"
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(255,255,255,0.025)",
                border: `2px solid ${selectedPlan === "weekly" ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.09)"}`,
                borderRadius: 16,
                padding: "24px 20px 20px",
                cursor: "pointer",
                transition: "all 0.16s ease",
                display: "flex", flexDirection: "column",
                boxShadow: selectedPlan === "weekly" ? "0 4px 24px rgba(0,0,0,0.40)" : "none",
              }}
            >
              <p style={{
                fontSize: 8.5, fontWeight: 900, letterSpacing: "0.36em",
                textTransform: "uppercase",
                color: selectedPlan === "weekly" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.38)",
                margin: "0 0 10px",
              }}>
                Weekly
              </p>

              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 2 }}>
                <span style={{
                  fontSize: 38, fontWeight: 900,
                  color: selectedPlan === "weekly" ? "#F5F5F5" : "rgba(255,255,255,0.72)",
                  letterSpacing: "-0.04em",
                }}>
                  ${NEEKO_PRICING.weekly.price}
                </span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.32)" }}>AUD/wk</span>
              </div>

              <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.42)", margin: "0 0 10px", lineHeight: 1.4 }}>
                Flexible access. Cancel anytime.
              </p>

              <div style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 6,
                padding: "3px 8px",
                fontSize: 10, fontWeight: 600,
                color: "rgba(255,255,255,0.38)",
                marginBottom: 16,
              }}>
                ${weeklyTotal} AUD if held all season
              </div>

              <div style={{
                width: 20, height: 20, borderRadius: "50%",
                background: selectedPlan === "weekly" ? "rgba(255,255,255,0.85)" : "transparent",
                border: `2px solid ${selectedPlan === "weekly" ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.22)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                marginTop: "auto",
                transition: "all 0.15s",
                flexShrink: 0,
              }}>
                {selectedPlan === "weekly" && (
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0a0909" }} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        {isPremium ? (
          <button
            disabled
            style={{
              width: "100%", padding: "17px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.30)",
              fontSize: 15, fontWeight: 700, cursor: "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <Lock size={15} />
            You already have Neeko+
          </button>
        ) : (
          <button
            onClick={() => handleSubscribe(selectedPlan)}
            disabled={loading}
            style={{
              width: "100%", padding: "17px",
              borderRadius: 12,
              background: selectedPlan === "season"
                ? "linear-gradient(160deg, #fad52a 0%, #e09600 100%)"
                : "rgba(255,255,255,0.09)",
              border: selectedPlan === "season"
                ? "none"
                : "1px solid rgba(255,255,255,0.14)",
              color: selectedPlan === "season" ? "#130c00" : "#fff",
              fontSize: 15, fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.18s ease",
              boxShadow: selectedPlan === "season"
                ? "0 8px 32px rgba(224,174,45,0.32), 0 0 60px rgba(224,174,45,0.08)"
                : "none",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                Processing…
              </>
            ) : (
              <>
                {selectedPlan === "season"
                  ? `Get Full Season Access — $${NEEKO_PRICING.season.price} AUD`
                  : `Start Weekly — $${NEEKO_PRICING.weekly.price} AUD/wk`}
                <ArrowRight size={15} />
              </>
            )}
          </button>
        )}

        <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.20)", margin: "10px 0 0", letterSpacing: "0.02em" }}>
          {selectedPlan === "season"
            ? "One-time payment. No subscription. Access until end of 2026 AFL season."
            : "Billed weekly via Stripe. Cancel anytime from your account page."}
        </p>

        {/* ── Free vs Neeko+ comparison ── */}
        <div style={{ marginTop: 36 }}>
          <p style={{
            fontSize: 9.5, fontWeight: 900, letterSpacing: "0.36em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.22)",
            margin: "0 0 14px",
            textAlign: "center",
          }}>
            What you unlock
          </p>

          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}>
            {/* Free column */}
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 14,
              padding: "18px 16px",
            }}>
              <p style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.28)",
                margin: "0 0 12px",
              }}>
                Free
              </p>
              {[
                "Limited rows per page",
                "Basic player and team pages",
                "Preview-level stats only",
                "Locked premium signals",
              ].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.18)", flexShrink: 0, marginTop: 1 }}>—</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.32)", lineHeight: 1.4 }}>{item}</span>
                </div>
              ))}
            </div>

            {/* Neeko+ column */}
            <div style={{
              background: "linear-gradient(160deg, #1c1507 0%, #110e04 100%)",
              border: "1px solid rgba(224,174,45,0.28)",
              borderRadius: 14,
              padding: "18px 16px",
            }}>
              <p style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "rgba(224,174,45,0.65)",
                margin: "0 0 12px",
              }}>
                Neeko+
              </p>
              {[
                "Full player pool — all 600+",
                "Full projections and breakevens",
                "Full Stat Board, Market Watch and Player/Team intelligence",
                "Player intelligence, trends, signals and decision tools",
              ].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                    background: "rgba(34,197,94,0.12)",
                    border: "1px solid rgba(34,197,94,0.28)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Check size={7} style={{ color: "#22c55e" }} />
                  </div>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.4 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Premium preview section ── */}
        <ProductPreview rows={previewRows} />

        {/* What you get */}
        <div style={{ marginTop: 52 }}>
          <p style={{
            fontSize: 9.5, fontWeight: 900, letterSpacing: "0.36em",
            textTransform: "uppercase",
            color: "rgba(224,174,45,0.55)",
            margin: "0 0 24px",
            textAlign: "center",
          }}>
            Everything in Neeko+
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {FEATURE_GROUPS.map(({ title, features }) => (
              <div key={title} style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 14,
                padding: "20px 20px",
              }}>
                <p style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: "0.28em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.35)",
                  margin: "0 0 14px",
                }}>
                  {title}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px 20px" }}>
                  {features.map((f) => (
                    <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                        background: "rgba(34,197,94,0.10)",
                        border: "1px solid rgba(34,197,94,0.24)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Check size={8} style={{ color: "#22c55e" }} />
                      </div>
                      <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.65)", lineHeight: 1.4 }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trust section */}
        <div style={{ marginTop: 56 }}>
          <h2 style={{
            fontSize: "clamp(1.15rem, 2vw, 1.5rem)",
            fontWeight: 900, color: "#F5F5F5",
            letterSpacing: "-0.03em",
            textAlign: "center", margin: "0 0 6px",
          }}>
            Why serious AFL users choose Neeko+
          </h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", textAlign: "center", margin: "0 0 28px" }}>
            Built for serious AFL stats and fantasy managers.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {TRUST_ITEMS.map(({ icon: Icon, title, description }) => (
              <div key={title} style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 14,
                padding: "18px 16px",
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: "rgba(224,174,45,0.09)",
                  border: "1px solid rgba(224,174,45,0.18)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 11,
                }}>
                  <Icon size={15} style={{ color: "#E0AE2D" }} />
                </div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: "#F5F5F5", margin: "0 0 5px" }}>{title}</h3>
                <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, margin: 0 }}>{description}</p>
              </div>
            ))}
          </div>

          <p style={{ textAlign: "center", marginTop: 26, fontSize: 11, color: "rgba(255,255,255,0.18)", letterSpacing: "0.02em" }}>
            No betting tips. No hype. Just clean AFL stats intelligence, updated every round.
          </p>
        </div>

        {/* Bottom CTA repeat */}
        {!isPremium && (
          <div style={{ marginTop: 48, textAlign: "center" }}>
            <button
              onClick={() => handleSubscribe("season")}
              disabled={loading}
              style={{
                padding: "15px 40px",
                borderRadius: 12,
                background: "linear-gradient(160deg, #fad52a 0%, #e09600 100%)",
                color: "#130c00",
                fontSize: 14, fontWeight: 900,
                cursor: loading ? "not-allowed" : "pointer",
                display: "inline-flex", alignItems: "center", gap: 8,
                border: "none",
                boxShadow: "0 8px 32px rgba(224,174,45,0.28)",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                  Processing…
                </>
              ) : (
                <>
                  {`Get Full Season Access — $${NEEKO_PRICING.season.price} AUD`}
                  <ArrowRight size={14} />
                </>
              )}
            </button>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", margin: "8px 0 0" }}>
              {`$${NEEKO_PRICING.season.price} AUD · $${seasonPerRound}/round · Full 2026 season`}
            </p>
            <button
              onClick={() => handleSubscribe("weekly")}
              disabled={loading}
              style={{
                marginTop: 10,
                padding: "9px 24px",
                borderRadius: 8,
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.38)",
                fontSize: 12, fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
                transition: "all 0.15s ease",
                opacity: loading ? 0.7 : 1,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.65)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.22)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.38)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.12)";
              }}
            >
              View Weekly Option — ${NEEKO_PRICING.weekly.price} AUD/wk
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NeekoPlusPurchase;
