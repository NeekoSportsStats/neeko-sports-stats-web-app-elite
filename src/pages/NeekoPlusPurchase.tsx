import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { Check, Crown, Loader as Loader2, ArrowLeft, TrendingUp, Target, Zap, Users, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { NEEKO_PRICING, NeekoPlan } from "@/config/neekoPricing";

const features = [
  "Full rankings + projections for every player",
  "Market Watch — value gaps and trade targets",
  "Captain picks before lockout",
  "Breakout alerts and trap warnings",
  "Full AI player breakdowns",
  "Weekly start/sit decision tools",
];

const trustFeatures = [
  {
    icon: TrendingUp,
    title: "Real projections every round",
    description: "Updated before each lockout using live AFL data — not guesswork.",
  },
  {
    icon: Target,
    title: "Fantasy-first analysis",
    description: "Every metric tuned for fantasy relevance — value tiers, ceiling projections, and trap alerts.",
  },
  {
    icon: Zap,
    title: "Decisions in 30 seconds",
    description: "Know who to trade, captain, and avoid before your mates even open the app.",
  },
  {
    icon: Users,
    title: "Used every week",
    description: "A growing base of serious AFL Fantasy coaches rely on Neeko+ every round.",
  },
];

const NeekoPlusPurchase = () => {
  const [selectedPlan, setSelectedPlan] = useState<NeekoPlan>("season");
  const [loading, setLoading] = useState(false);
  const { user, isPremium } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    track("view_pricing_page", { source: "neeko_plus" });
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
    "description": "Premium AFL Fantasy analytics. Unlock full player rankings, AI player breakdowns, captain signals, breakout alerts and trade targets.",
    "url": "https://neekostats.com.au/neeko-plus",
    "brand": { "@type": "Brand", "name": "Neeko Sports Stats" },
    "offers": [
      {
        "@type": "Offer",
        "name": "Neeko+ Season",
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
    <div style={{ minHeight: "100vh", background: "#0a0909" }}>
      <Helmet>
        <title>Neeko+ — AFL Fantasy Analytics | Neeko Sports Stats</title>
        <meta name="description" content={`Upgrade to Neeko+ for full AFL Fantasy rankings, AI player analysis, captain signals, breakout alerts and trade targets. From $${NEEKO_PRICING.weekly.price} AUD/week.`} />
        <link rel="canonical" href="https://neekostats.com.au/neeko-plus" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/neeko-plus" />
        <meta property="og:title" content="Neeko+ — AFL Fantasy Analytics" />
        <meta property="og:description" content={`Upgrade to Neeko+ for full AFL Fantasy rankings, AI player analysis, captain signals, breakout alerts and trade targets. From $${NEEKO_PRICING.weekly.price} AUD/week.`} />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Neeko+ — AFL Fantasy Analytics" />
        <meta name="twitter:description" content={`AFL Fantasy edge. Trade smarter, captain better, avoid traps. From $${NEEKO_PRICING.weekly.price}/week.`} />
        <script type="application/ld+json">{JSON.stringify(productSchema)}</script>
      </Helmet>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px clamp(16px, 5vw, 32px) 80px" }}>
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "transparent", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.35)", fontSize: 13, fontWeight: 600,
            padding: "4px 0", marginBottom: 32,
          }}
        >
          <ArrowLeft size={14} />
          Back
        </button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "rgba(224,174,45,0.15)",
              border: "1px solid rgba(224,174,45,0.30)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Crown size={20} style={{ color: "#E0AE2D" }} />
            </div>
            <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 900, color: "#F5F5F5", letterSpacing: "-0.04em", margin: 0 }}>
              Neeko+
            </h1>
          </div>
          <p style={{ fontSize: "clamp(13px, 1vw, 16px)", color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.5 }}>
            Make better AFL Fantasy calls every week — trades, captains, start/sit.
          </p>
        </div>

        {/* Plan Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
          {/* Season card — PRIMARY */}
          <div
            onClick={() => setSelectedPlan("season")}
            style={{
              position: "relative",
              background: selectedPlan === "season"
                ? "linear-gradient(160deg, #1c1507 0%, #110e04 100%)"
                : "rgba(255,255,255,0.03)",
              border: `2px solid ${selectedPlan === "season" ? "rgba(224,174,45,0.50)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 18,
              padding: "28px 24px",
              cursor: "pointer",
              transition: "all 0.18s ease",
              boxShadow: selectedPlan === "season" ? "0 0 40px rgba(224,174,45,0.12), 0 8px 32px rgba(0,0,0,0.50)" : "none",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Top gold line on selected */}
            {selectedPlan === "season" && (
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 2,
                background: "linear-gradient(to right, transparent, rgba(224,174,45,0.75), transparent)",
                borderRadius: "18px 18px 0 0",
              }} />
            )}

            {/* Best value badge */}
            <div style={{
              position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)",
              background: "linear-gradient(160deg, #fad52a 0%, #e09600 100%)",
              borderRadius: 999,
              padding: "3px 12px",
              fontSize: 9, fontWeight: 900,
              color: "#130c00",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}>
              Best Value
            </div>

            <p style={{
              fontSize: 8.5, fontWeight: 900, letterSpacing: "0.40em",
              textTransform: "uppercase",
              color: "rgba(224,174,45,0.60)",
              margin: "0 0 10px",
            }}>
              Season Pass
            </p>

            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 36, fontWeight: 900, color: "#E0AE2D", letterSpacing: "-0.04em" }}>
                ${NEEKO_PRICING.season.price}
              </span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>AUD</span>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", margin: "0 0 20px", lineHeight: 1.4 }}>
              One-time payment. Full season access.
            </p>

            <div style={{
              width: 20, height: 20, borderRadius: "50%",
              background: selectedPlan === "season" ? "#E0AE2D" : "transparent",
              border: `2px solid ${selectedPlan === "season" ? "#E0AE2D" : "rgba(255,255,255,0.20)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              marginTop: "auto",
              transition: "all 0.15s",
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
                ? "rgba(255,255,255,0.06)"
                : "rgba(255,255,255,0.025)",
              border: `2px solid ${selectedPlan === "weekly" ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.07)"}`,
              borderRadius: 18,
              padding: "28px 24px",
              cursor: "pointer",
              transition: "all 0.18s ease",
              display: "flex", flexDirection: "column",
            }}
          >
            <p style={{
              fontSize: 8.5, fontWeight: 900, letterSpacing: "0.40em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.35)",
              margin: "0 0 10px",
            }}>
              Weekly
            </p>

            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 36, fontWeight: 900, color: "rgba(255,255,255,0.75)", letterSpacing: "-0.04em" }}>
                ${NEEKO_PRICING.weekly.price}
              </span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>AUD</span>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", margin: "0 0 20px", lineHeight: 1.4 }}>
              Per week. Cancel anytime.
            </p>

            <div style={{
              width: 20, height: 20, borderRadius: "50%",
              background: selectedPlan === "weekly" ? "rgba(255,255,255,0.80)" : "transparent",
              border: `2px solid ${selectedPlan === "weekly" ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.20)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              marginTop: "auto",
              transition: "all 0.15s",
            }}>
              {selectedPlan === "weekly" && (
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#0a0909" }} />
              )}
            </div>
          </div>
        </div>

        {/* CTA button */}
        {isPremium ? (
          <button
            disabled
            style={{
              width: "100%", padding: "16px", borderRadius: 12,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.35)",
              fontSize: 15, fontWeight: 700, cursor: "not-allowed",
            }}
          >
            You already have Neeko+
          </button>
        ) : (
          <button
            onClick={() => handleSubscribe(selectedPlan)}
            disabled={loading}
            style={{
              width: "100%", padding: "16px",
              borderRadius: 12,
              background: selectedPlan === "season"
                ? "linear-gradient(160deg, #fad52a 0%, #e09600 100%)"
                : "rgba(255,255,255,0.10)",
              border: selectedPlan === "season"
                ? "none"
                : "1px solid rgba(255,255,255,0.15)",
              color: selectedPlan === "season" ? "#130c00" : "#fff",
              fontSize: 15, fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.18s ease",
              boxShadow: selectedPlan === "season" ? "0 8px 32px rgba(224,174,45,0.30)" : "none",
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

        <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.22)", margin: "12px 0 0", letterSpacing: "0.02em" }}>
          {selectedPlan === "season"
            ? "One-time payment. No subscription. Access until end of 2026 AFL season."
            : "Billed weekly via Stripe. Cancel anytime from your account."}
        </p>

        {/* Features list */}
        <div style={{
          marginTop: 40,
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 16,
          padding: "24px 24px",
        }}>
          <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.36em", textTransform: "uppercase", color: "rgba(224,174,45,0.55)", margin: "0 0 16px" }}>
            Everything in Neeko+
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px" }}>
            {features.map((f) => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{
                  width: 17, height: 17, borderRadius: "50%", flexShrink: 0,
                  background: "rgba(34,197,94,0.12)",
                  border: "1px solid rgba(34,197,94,0.28)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Check size={9} style={{ color: "#22c55e" }} />
                </div>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.70)", lineHeight: 1.35 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trust grid */}
        <div style={{ marginTop: 56 }}>
          <h2 style={{ fontSize: "clamp(1.2rem, 2.2vw, 1.6rem)", fontWeight: 900, color: "#F5F5F5", letterSpacing: "-0.03em", textAlign: "center", margin: "0 0 8px" }}>
            Why serious coaches use Neeko+
          </h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)", textAlign: "center", margin: "0 0 32px" }}>
            Built for decision-makers, not spectators.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {trustFeatures.map(({ icon: Icon, title, description }) => (
              <div key={title} style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 14,
                padding: "20px 18px",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "rgba(224,174,45,0.10)",
                  border: "1px solid rgba(224,174,45,0.20)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 12,
                }}>
                  <Icon size={16} style={{ color: "#E0AE2D" }} />
                </div>
                <h3 style={{ fontSize: 13.5, fontWeight: 700, color: "#F5F5F5", margin: "0 0 6px" }}>{title}</h3>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", lineHeight: 1.5, margin: 0 }}>{description}</p>
              </div>
            ))}
          </div>

          <p style={{ textAlign: "center", marginTop: 28, fontSize: 11, color: "rgba(255,255,255,0.22)", letterSpacing: "0.02em" }}>
            No hype. No betting tips. Just structured AFL Fantasy intelligence.
          </p>
        </div>
      </div>
    </div>
  );
};

export default NeekoPlusPurchase;
