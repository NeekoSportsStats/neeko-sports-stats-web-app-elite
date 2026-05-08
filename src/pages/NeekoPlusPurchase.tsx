import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import {
  Check,
  Crown,
  Loader as Loader2,
  ArrowLeft,
  TrendingUp,
  Target,
  Zap,
  Shield,
  ArrowRight,
  Lock,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { NEEKO_PRICING, NeekoPlan } from "@/config/neekoPricing";

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
      "AI-powered weekly projections",
      "Value tiers — who's priced wrong",
      "Breakeven scores and price movement",
    ],
  },
  {
    title: "Fantasy Decision Tools",
    features: [
      "Captain picks with confidence rating",
      "Weekly start/sit recommendations",
      "Breakout alerts before the market moves",
      "Trap warnings — avoid costly trade mistakes",
    ],
  },
  {
    title: "Market Intelligence",
    features: [
      "Market Watch — live value gap signals",
      "Trade targets ranked by opportunity",
      "Full AI player breakdown per round",
      "Trend and form signals every week",
    ],
  },
];

const TRUST_ITEMS = [
  {
    icon: TrendingUp,
    title: "Updated every round",
    description: "Projections and signals rebuilt before each lockout using live AFL data.",
  },
  {
    icon: Target,
    title: "Stats and fantasy in one place",
    description: "Stat trends, hit rates, matchup data, projections and fantasy signals — all connected.",
  },
  {
    icon: Zap,
    title: "Decisions in 30 seconds",
    description: "Know who to trade, captain, and bench before lockout closes.",
  },
  {
    icon: Shield,
    title: "No gambling, no hype",
    description: "Structured analytics only. Clean interface, clear signals.",
  },
];

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

  useEffect(() => {
    track("view_pricing_page", { source: "neeko_plus" });

    supabase.rpc("get_latest_completed_round").then(({ data }) => {
      if (typeof data === "number") setCurrentRound(data);
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

      track("start_checkout", { plan, source: "neeko_plus_page" });

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
    "description": "Premium AFL stats intelligence. Full Stat Board, player rankings, AI breakdowns, breakeven scores, captain signals, breakout alerts and trade targets.",
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

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "28px clamp(16px, 5vw, 32px) 100px" }}>
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "transparent", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.30)", fontSize: 13, fontWeight: 600,
            padding: "4px 0", marginBottom: 36,
          }}
        >
          <ArrowLeft size={14} />
          Back
        </button>

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
            Your AFL Stats<br />
            <span style={{ color: "#E0AE2D" }}>Edge, Every Round.</span>
          </h1>

          <p style={{
            fontSize: "clamp(13px, 1.1vw, 16px)",
            color: "rgba(255,255,255,0.42)",
            margin: "0 auto",
            lineHeight: 1.6,
            maxWidth: 420,
          }}>
            Unlock full player projections, breakevens, stat trends, hit rates, team dashboards, market signals and fantasy decision tools — updated before every lockout.
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
                display: "inline-flex", alignItems: "center", gap: 4,
                background: selectedPlan === "season" ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${selectedPlan === "season" ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 6,
                padding: "3px 8px",
                fontSize: 10, fontWeight: 700,
                color: selectedPlan === "season" ? "rgba(34,197,94,0.85)" : "rgba(255,255,255,0.28)",
                marginBottom: 16,
              }}>
                ${seasonPerRound}/round · save ${savings} vs weekly
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
                  ? "rgba(255,255,255,0.055)"
                  : "rgba(255,255,255,0.02)",
                border: `2px solid ${selectedPlan === "weekly" ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 16,
                padding: "24px 20px 20px",
                cursor: "pointer",
                transition: "all 0.16s ease",
                display: "flex", flexDirection: "column",
              }}
            >
              <p style={{
                fontSize: 8.5, fontWeight: 900, letterSpacing: "0.36em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.30)",
                margin: "0 0 10px",
              }}>
                Weekly
              </p>

              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 2 }}>
                <span style={{
                  fontSize: 38, fontWeight: 900,
                  color: "rgba(255,255,255,0.65)",
                  letterSpacing: "-0.04em",
                }}>
                  ${NEEKO_PRICING.weekly.price}
                </span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>AUD</span>
              </div>

              <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.25)", margin: "0 0 10px", lineHeight: 1.4 }}>
                Per week. Cancel anytime.
              </p>

              <div style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 6,
                padding: "3px 8px",
                fontSize: 10, fontWeight: 600,
                color: "rgba(255,255,255,0.25)",
                marginBottom: 16,
              }}>
                ${weeklyTotal} AUD for full season
              </div>

              <div style={{
                width: 20, height: 20, borderRadius: "50%",
                background: selectedPlan === "weekly" ? "rgba(255,255,255,0.80)" : "transparent",
                border: `2px solid ${selectedPlan === "weekly" ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.18)"}`,
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
                  : `Unlock This Week — $${NEEKO_PRICING.weekly.price} AUD/wk`}
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
            Why coaches trust Neeko+
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

        {/* Sticky CTA repeat */}
        {!isPremium && (
          <div style={{ marginTop: 48, textAlign: "center" }}>
            <button
              onClick={() => handleSubscribe(selectedPlan)}
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
                  {selectedPlan === "season"
                    ? `Get Neeko+ — Season Pass`
                    : `Get Neeko+ — Weekly Access`}
                  <ArrowRight size={14} />
                </>
              )}
            </button>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", margin: "8px 0 0" }}>
              {selectedPlan === "season"
                ? `$${NEEKO_PRICING.season.price} AUD · $${seasonPerRound}/round · Full 2026 season`
                : `$${NEEKO_PRICING.weekly.price} AUD/wk · Cancel anytime`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NeekoPlusPurchase;
