import { Link } from "react-router-dom";
import { Check, X, ArrowRight } from "lucide-react";

const FREE_FEATURES = [
  { text: "Basic rankings only", included: true },
  { text: "Limited player data", included: true },
  { text: "No weekly decision tools", included: false },
  { text: "No Market Watch", included: false },
  { text: "No captain picks", included: false },
  { text: "No trade targets", included: false },
];

const PREMIUM_FEATURES = [
  "Full rankings + projections",
  "Market Watch — value gaps and traps",
  "Captain picks before lockout",
  "Trade targets and breakout alerts",
  "Full player breakdowns",
  "Weekly decision tools — start/sit",
];

export default function LandingPricing() {
  return (
    <section style={{
      background: "linear-gradient(180deg, #0a0909 0%, #0d0c0a 100%)",
      padding: "80px clamp(16px, 5vw, 40px)",
    }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <p style={{
            fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
            textTransform: "uppercase",
            color: "rgba(224,174,45,0.65)",
            margin: "0 0 12px",
          }}>
            Pricing
          </p>
          <h2 style={{
            fontSize: "clamp(1.5rem, 2.6vw, 2.2rem)",
            fontWeight: 900, letterSpacing: "-0.03em",
            color: "#F5F5F5", lineHeight: 1.1,
            margin: "0 0 14px",
          }}>
            Go Beyond Free Rankings
          </h2>
          <p style={{
            fontSize: "clamp(12px, 0.90vw, 15px)",
            color: "rgba(255,255,255,0.38)",
            margin: 0,
            lineHeight: 1.5,
          }}>
            Free shows you players.{" "}
            <span style={{ color: "rgba(224,174,45,0.75)", fontWeight: 600 }}>Neeko+ tells you exactly what to do.</span>
          </p>
        </div>

        {/* Two-column comparison */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          alignItems: "stretch",
        }}>
          {/* Free column */}
          <div style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 18,
            padding: "32px 28px",
            display: "flex",
            flexDirection: "column",
          }}>
            <div style={{ marginBottom: 24 }}>
              <p style={{
                fontSize: 9, fontWeight: 900, letterSpacing: "0.40em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.30)",
                margin: "0 0 10px",
              }}>
                Free
              </p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{
                  fontSize: 34, fontWeight: 900,
                  color: "rgba(255,255,255,0.55)",
                  letterSpacing: "-0.04em",
                }}>
                  $0
                </span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>/forever</span>
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.22)", marginTop: 6 }}>
                Limited access. No card required.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
              {FREE_FEATURES.map(({ text, included }) => (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    background: included ? "rgba(255,255,255,0.06)" : "rgba(239,68,68,0.08)",
                    border: `1px solid ${included ? "rgba(255,255,255,0.10)" : "rgba(239,68,68,0.18)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {included
                      ? <Check size={10} style={{ color: "rgba(255,255,255,0.40)" }} />
                      : <X size={10} style={{ color: "#f87171" }} />
                    }
                  </div>
                  <span style={{
                    fontSize: 13.5,
                    color: included ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.22)",
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
                color: "rgba(255,255,255,0.40)",
                fontSize: 13, fontWeight: 700,
                textDecoration: "none",
                letterSpacing: "0.01em",
                transition: "all 0.16s",
              }}
            >
              View Free Rankings
            </Link>
          </div>

          {/* Neeko+ column */}
          <div style={{
            background: "linear-gradient(160deg, #1c1507 0%, #110e04 100%)",
            border: "1px solid rgba(224,174,45,0.28)",
            borderRadius: 18,
            padding: "32px 28px",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 0 0 1px rgba(224,174,45,0.08) inset, 0 24px 56px rgba(0,0,0,0.55)",
          }}>
            {/* Top gold line */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 2,
              background: "linear-gradient(to right, transparent, rgba(224,174,45,0.75), transparent)",
            }} />
            {/* Ambient glow */}
            <div style={{
              position: "absolute", top: -50, right: -50,
              width: 160, height: 160, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(224,174,45,0.08) 0%, transparent 70%)",
              pointerEvents: "none",
            }} />

            {/* Best value badge */}
            <div style={{
              position: "absolute", top: 18, right: 20,
              background: "rgba(224,174,45,0.15)",
              border: "1px solid rgba(224,174,45,0.30)",
              borderRadius: 999,
              padding: "3px 10px",
              fontSize: 9.5, fontWeight: 900,
              color: "#E0AE2D",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
            }}>
              Best Value
            </div>

            <div style={{ marginBottom: 24, position: "relative" }}>
              <p style={{
                fontSize: 9, fontWeight: 900, letterSpacing: "0.40em",
                textTransform: "uppercase",
                color: "rgba(224,174,45,0.65)",
                margin: "0 0 10px",
              }}>
                Neeko+
              </p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{
                  fontSize: 34, fontWeight: 900,
                  color: "#E0AE2D",
                  letterSpacing: "-0.04em",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  $59
                </span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>AUD</span>
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", marginTop: 6 }}>
                Full season. One payment. Or $5.99/wk if you prefer.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, position: "relative" }}>
              {PREMIUM_FEATURES.map(text => (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    background: "rgba(34,197,94,0.12)",
                    border: "1px solid rgba(34,197,94,0.28)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Check size={10} style={{ color: "#22c55e" }} />
                  </div>
                  <span style={{ fontSize: 13.5, color: "rgba(255,255,255,0.78)", lineHeight: 1.4 }}>
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
                padding: "14px 20px",
                borderRadius: 10,
                background: "linear-gradient(160deg, #fad52a 0%, #e09600 100%)",
                color: "#130c00",
                fontSize: 14, fontWeight: 900,
                textDecoration: "none",
                letterSpacing: "0.01em",
                boxShadow: "0 6px 28px rgba(224,174,45,0.28)",
                position: "relative",
                transition: "all 0.18s ease",
              }}
            >
              Start Winning With Neeko+ <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
