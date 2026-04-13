import { Link } from "react-router-dom";
import { Check, ArrowRight } from "lucide-react";
import { NEEKO_PRICING } from "@/config/neekoPricing";

const BENEFITS = [
  "630+ players ranked every round",
  "Trade signals and breakeven tracking",
  "Edge Board — must-have and avoid lists",
  "AI captain picks with matchup context",
  "Start / Sit decisions in seconds",
  "Player profiles with projections and form",
];

export default function LandingPricing() {
  return (
    <section style={{ background: "linear-gradient(180deg, #111009 0%, #0d0b09 100%)", padding: "96px clamp(16px, 5vw, 40px)" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(224,174,45,0.60)", marginBottom: 14 }}>Simple Pricing</p>
          <h2 style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 900, letterSpacing: "-0.03em", color: "#F5F5F5", lineHeight: 1.1, margin: 0 }}>
            One Price. Every Tool.
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "center" }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#EAEAEA", marginBottom: 22, letterSpacing: "-0.01em" }}>Everything you need to win your league:</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {BENEFITS.map(b => (
                <div key={b} style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.28)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    <Check size={10} style={{ color: "#22C55E" }} />
                  </div>
                  <span style={{ fontSize: 14, color: "#888", lineHeight: 1.55 }}>{b}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "linear-gradient(160deg, #1c1507 0%, #110e04 100%)", border: "1px solid rgba(224,174,45,0.22)", borderRadius: 18, padding: "36px 32px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(to right, transparent, rgba(224,174,45,0.70), transparent)" }} />
            <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(224,174,45,0.07) 0%, transparent 70%)" }} />

            <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(224,174,45,0.55)", marginBottom: 20 }}>Neeko+</p>

            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 42, fontWeight: 900, color: "#E0AE2D", letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}>
                ${NEEKO_PRICING.yearly.monthlyEquivalent}
              </span>
              <span style={{ fontSize: 14, color: "#555", marginLeft: 4 }}>/mo</span>
            </div>
            <p style={{ fontSize: 12, color: "#3A3A3A", marginBottom: 4 }}>
              Billed ${NEEKO_PRICING.yearly.price}/year — save {NEEKO_PRICING.savingsPercent}%
            </p>
            <p style={{ fontSize: 11, color: "#2A2A2A", marginBottom: 28 }}>Cancel anytime.</p>

            <Link
              to="/pricing"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#E0AE2D", color: "#1a0900", fontWeight: 900, fontSize: 14, padding: "14px 28px", borderRadius: 10, textDecoration: "none", boxShadow: "0 4px 28px rgba(224,174,45,0.28)", letterSpacing: "0.02em", marginBottom: 14 }}
            >
              Get Full Access <ArrowRight size={14} />
            </Link>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <Link to="/pricing" style={{ fontSize: 12, color: "#3A3A3A", textDecoration: "none" }}>
                Monthly ${NEEKO_PRICING.monthly.price}/mo
              </Link>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#2A2A2A" }} />
              <Link to="/pricing" style={{ fontSize: 12, color: "#3A3A3A", textDecoration: "none" }}>
                Free picks available
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
