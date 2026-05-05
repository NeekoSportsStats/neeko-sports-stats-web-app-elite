import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ArrowRight, Zap } from "lucide-react";
import { NEEKO_PRICING } from "@/config/neekoPricing";

const FREE_FEATURES = [
  { text: "First matches preview", included: true },
  { text: "Disposals and goals", included: true },
  { text: "Limited access", included: true },
  { text: "No card required", included: true },
];

const PREMIUM_FEATURES = [
  "Full round access",
  "All matches",
  "Full Stat Board",
  "Player trends and projections",
  "Hit rates and consistency labels",
  "Fantasy Hub included",
  "Must Buys, Trap Alerts, Captain Picks",
  "Full player history",
];

type Plan = "season" | "weekly";

export default function LandingPricing() {
  const [hoveredPlan, setHoveredPlan] = useState<Plan | null>(null);
  const [freeCTAHovered, setFreeCTAHovered] = useState(false);

  const seasonPerRound = (NEEKO_PRICING.season.price / NEEKO_PRICING.season.totalRounds).toFixed(2);

  return (
    <section style={{
      background: "#06080C",
      padding: "clamp(44px, 5vw, 72px) clamp(20px, 5vw, 40px)",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <p style={{
            fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
            textTransform: "uppercase",
            color: "rgba(224,174,45,0.65)",
            margin: "0 0 8px",
          }}>
            Pricing
          </p>
          <h2 style={{
            fontSize: "clamp(1.6rem, 2.6vw, 2.2rem)",
            fontWeight: 900, letterSpacing: "-0.03em",
            color: "#F5F5F5", lineHeight: 1.2,
            margin: "0 0 10px",
          }}>
            Free lets you explore the first matches.
          </h2>
          <p style={{
            fontSize: "clamp(13px, 0.95vw, 15px)",
            color: "rgba(255,255,255,0.45)",
            margin: "0 auto",
            lineHeight: 1.55,
            maxWidth: 440,
          }}>
            <span style={{ color: "rgba(224,174,45,0.80)", fontWeight: 600 }}>
              Neeko+ unlocks the full round.
            </span>
          </p>
        </div>

        {/* Two-column comparison */}
        <div
          className="pricing-columns"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.08fr",
            gap: 18,
            alignItems: "stretch",
          }}
        >
          {/* Free column */}
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 20,
            padding: "28px 24px",
            display: "flex",
            flexDirection: "column",
          }}>
            <div style={{ marginBottom: 20 }}>
              <p style={{
                fontSize: 9, fontWeight: 900, letterSpacing: "0.40em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.38)",
                margin: "0 0 10px",
              }}>
                Free
              </p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{
                  fontSize: 36, fontWeight: 900,
                  color: "rgba(255,255,255,0.60)",
                  letterSpacing: "-0.04em",
                }}>
                  $0
                </span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>/forever</span>
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.32)", marginTop: 5 }}>
                No card required.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
              {FREE_FEATURES.map(({ text, included }) => (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    background: included ? "rgba(34,197,94,0.08)" : "transparent",
                    border: `1px solid ${included ? "rgba(34,197,94,0.22)" : "rgba(255,255,255,0.08)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {included && <Check size={9} style={{ color: "#4ade80" }} />}
                  </div>
                  <span style={{
                    fontSize: 13,
                    color: included ? "rgba(255,255,255,0.68)" : "rgba(255,255,255,0.28)",
                    lineHeight: 1.4,
                  }}>
                    {text}
                  </span>
                </div>
              ))}
            </div>

            <Link
              to="/stat-board/players"
              onMouseEnter={() => setFreeCTAHovered(true)}
              onMouseLeave={() => setFreeCTAHovered(false)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                marginTop: 24,
                padding: "13px 20px",
                borderRadius: 10,
                border: `1px solid ${freeCTAHovered ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.14)"}`,
                background: freeCTAHovered ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                color: freeCTAHovered ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.65)",
                fontSize: 13, fontWeight: 700,
                textDecoration: "none",
                letterSpacing: "0.01em",
                transition: "all 0.15s ease",
              }}
            >
              Open Stat Board Free <ArrowRight size={13} />
            </Link>
          </div>

          {/* Neeko+ column */}
          <div style={{
            background: "linear-gradient(160deg, #1c1507 0%, #110e04 100%)",
            border: "1px solid rgba(224,174,45,0.30)",
            borderRadius: 20,
            padding: "28px 24px",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 0 0 1px rgba(224,174,45,0.06) inset, 0 24px 56px rgba(0,0,0,0.55)",
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
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.40)" }}>AUD</span>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.42)", marginTop: 2 }}>
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
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.38)" }}>AUD</span>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", marginTop: 2 }}>
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

            <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "10px 0 0", letterSpacing: "0.02em" }}>
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
