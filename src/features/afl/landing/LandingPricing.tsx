import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, ArrowRight, Zap } from "lucide-react";
import { NEEKO_PRICING } from "@/config/neekoPricing";

const FREE_FEATURES = [
  { text: "Basic rankings (limited)", included: true },
  { text: "2 players preview per tab", included: true },
  { text: "Market Watch access", included: false },
  { text: "Captain picks before lockout", included: false },
  { text: "Breakout & trap alerts", included: false },
  { text: "AI player breakdowns", included: false },
  { text: "Trade targets & value gaps", included: false },
  { text: "Weekly start/sit tools", included: false },
];

const PREMIUM_FEATURES = [
  "Full rankings + projections",
  "Market Watch — value gaps and traps",
  "Captain picks before lockout",
  "Breakout alerts and trap warnings",
  "Full AI player breakdowns",
  "Trade targets and value tiers",
  "Weekly start/sit decision tools",
  "Full player history and trends",
];

type Plan = "season" | "weekly";

export default function LandingPricing() {
  const [hoveredPlan, setHoveredPlan] = useState<Plan | null>(null);

  const seasonPerRound = (NEEKO_PRICING.season.price / NEEKO_PRICING.season.totalRounds).toFixed(2);

  return (
    <section style={{
      background: "#06080C",
      padding: "clamp(80px, 7vw, 120px) clamp(20px, 5vw, 40px)",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <p style={{
            fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
            textTransform: "uppercase",
            color: "rgba(224,174,45,0.65)",
            margin: "0 0 8px",
          }}>
            Pricing
          </p>
          <h2 style={{
            fontSize: "clamp(1.7rem, 2.8vw, 2.4rem)",
            fontWeight: 900, letterSpacing: "-0.03em",
            color: "#F5F5F5", lineHeight: 1.2,
            margin: "0 0 10px",
          }}>
            Stop Guessing. Start Winning.
          </h2>
          <p style={{
            fontSize: "clamp(13px, 0.95vw, 15px)",
            color: "rgba(255,255,255,0.38)",
            margin: "0 auto",
            lineHeight: 1.55,
            maxWidth: 440,
          }}>
            Free shows you players.{" "}
            <span style={{ color: "rgba(224,174,45,0.75)", fontWeight: 600 }}>
              Neeko+ tells you exactly who to trade, captain, and avoid.
            </span>
          </p>
        </div>

        {/* Two-column comparison */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.08fr",
            gap: 20,
            alignItems: "stretch",
          }}
        >
          {/* Free column */}
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 20,
            padding: "32px 28px",
            display: "flex",
            flexDirection: "column",
          }}>
            <div style={{ marginBottom: 24 }}>
              <p style={{
                fontSize: 9, fontWeight: 900, letterSpacing: "0.40em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.28)",
                margin: "0 0 10px",
              }}>
                Free
              </p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{
                  fontSize: 38, fontWeight: 900,
                  color: "rgba(255,255,255,0.45)",
                  letterSpacing: "-0.04em",
                }}>
                  $0
                </span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.22)" }}>/forever</span>
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.20)", marginTop: 6 }}>
                No card required. Limited access.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 11, flex: 1 }}>
              {FREE_FEATURES.map(({ text, included }) => (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    background: included ? "rgba(255,255,255,0.05)" : "rgba(239,68,68,0.07)",
                    border: `1px solid ${included ? "rgba(255,255,255,0.09)" : "rgba(239,68,68,0.15)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {included
                      ? <Check size={9} style={{ color: "rgba(255,255,255,0.35)" }} />
                      : <X size={9} style={{ color: "#f87171" }} />
                    }
                  </div>
                  <span style={{
                    fontSize: 13,
                    color: included ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.20)",
                    lineHeight: 1.4,
                  }}>
                    {text}
                  </span>
                </div>
              ))}
            </div>

            <Link
              to="/sports/afl/rankings"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                marginTop: 28,
                padding: "13px 20px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "transparent",
                color: "rgba(255,255,255,0.38)",
                fontSize: 13, fontWeight: 700,
                textDecoration: "none",
                letterSpacing: "0.01em",
              }}
            >
              Browse Free Rankings
            </Link>
          </div>

          {/* Neeko+ column */}
          <div style={{
            background: "linear-gradient(160deg, #1c1507 0%, #110e04 100%)",
            border: "1px solid rgba(224,174,45,0.30)",
            borderRadius: 20,
            padding: "32px 28px",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 0 0 1px rgba(224,174,45,0.06) inset, 0 28px 64px rgba(0,0,0,0.60)",
          }}>
            {/* Top gold line */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 2,
              background: "linear-gradient(to right, transparent, rgba(224,174,45,0.80), transparent)",
            }} />
            {/* Ambient glow */}
            <div style={{
              position: "absolute", top: -60, right: -60,
              width: 200, height: 200, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(224,174,45,0.07) 0%, transparent 70%)",
              pointerEvents: "none",
            }} />

            {/* Best value badge */}
            <div style={{
              position: "absolute", top: 18, right: 20,
              background: "linear-gradient(135deg, rgba(224,174,45,0.20), rgba(224,174,45,0.10))",
              border: "1px solid rgba(224,174,45,0.35)",
              borderRadius: 999,
              padding: "3px 11px",
              fontSize: 9.5, fontWeight: 900,
              color: "#E0AE2D",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
            }}>
              Best Value
            </div>

            {/* Plan toggle */}
            <div style={{ marginBottom: 24, position: "relative" }}>
              <p style={{
                fontSize: 9, fontWeight: 900, letterSpacing: "0.40em",
                textTransform: "uppercase",
                color: "rgba(224,174,45,0.65)",
                margin: "0 0 14px",
              }}>
                Neeko+
              </p>

              {/* Pricing options */}
              <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                {/* Season option */}
                <button
                  onClick={() => setHoveredPlan(null)}
                  style={{
                    flex: 1,
                    background: hoveredPlan !== "weekly" ? "rgba(224,174,45,0.10)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${hoveredPlan !== "weekly" ? "rgba(224,174,45,0.30)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.25em", color: hoveredPlan !== "weekly" ? "rgba(224,174,45,0.70)" : "rgba(255,255,255,0.25)", textTransform: "uppercase", marginBottom: 4 }}>
                    Season Pass
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                    <span style={{ fontSize: 22, fontWeight: 900, color: hoveredPlan !== "weekly" ? "#E0AE2D" : "rgba(255,255,255,0.45)", letterSpacing: "-0.03em" }}>
                      ${NEEKO_PRICING.season.price}
                    </span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>AUD</span>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", marginTop: 2 }}>
                    ${seasonPerRound}/round
                  </div>
                </button>

                {/* Weekly option */}
                <button
                  onClick={() => setHoveredPlan("weekly")}
                  style={{
                    flex: 1,
                    background: hoveredPlan === "weekly" ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.025)",
                    border: `1px solid ${hoveredPlan === "weekly" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)"}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.25em", color: "rgba(255,255,255,0.30)", textTransform: "uppercase", marginBottom: 4 }}>
                    Weekly
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                    <span style={{ fontSize: 22, fontWeight: 900, color: "rgba(255,255,255,0.60)", letterSpacing: "-0.03em" }}>
                      ${NEEKO_PRICING.weekly.price}
                    </span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.22)" }}>AUD</span>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", marginTop: 2 }}>
                    per week
                  </div>
                </button>
              </div>

              {/* Per round cost callout */}
              {hoveredPlan !== "weekly" && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  background: "rgba(34,197,94,0.08)",
                  border: "1px solid rgba(34,197,94,0.18)",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11, fontWeight: 700,
                  color: "rgba(34,197,94,0.85)",
                }}>
                  <Zap size={10} style={{ color: "#22c55e" }} />
                  Save vs weekly — ${((NEEKO_PRICING.weekly.price * NEEKO_PRICING.season.totalRounds) - NEEKO_PRICING.season.price).toFixed(0)} cheaper for the full season
                </div>
              )}
            </div>

            {/* Features */}
            <div style={{ display: "flex", flexDirection: "column", gap: 11, flex: 1, position: "relative" }}>
              {PREMIUM_FEATURES.map(text => (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    background: "rgba(34,197,94,0.10)",
                    border: "1px solid rgba(34,197,94,0.24)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Check size={9} style={{ color: "#22c55e" }} />
                  </div>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", lineHeight: 1.4 }}>
                    {text}
                  </span>
                </div>
              ))}
            </div>

            <Link
              to="/neeko-plus"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                marginTop: 28,
                padding: "15px 20px",
                borderRadius: 11,
                background: "linear-gradient(160deg, #fad52a 0%, #e09600 100%)",
                color: "#130c00",
                fontSize: 14, fontWeight: 900,
                textDecoration: "none",
                letterSpacing: "0.01em",
                boxShadow: "0 6px 28px rgba(224,174,45,0.30), 0 0 40px rgba(255,200,0,0.08)",
                position: "relative",
              }}
            >
              Get Neeko+ — Full Season Access <ArrowRight size={14} />
            </Link>

            <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.20)", margin: "10px 0 0", letterSpacing: "0.02em" }}>
              One-time payment. Access until end of 2026 AFL season.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .pricing-columns {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}
