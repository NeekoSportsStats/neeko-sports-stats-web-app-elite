import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function LandingFinalCTA() {
  return (
    <section style={{ background: "linear-gradient(180deg, #0d0b09 0%, #080604 100%)", padding: "96px clamp(16px, 5vw, 40px)" }}>
      <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
        <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(224,174,45,0.60)", marginBottom: 20 }}>Get Started</p>
        <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 900, letterSpacing: "-0.04em", color: "#F5F5F5", lineHeight: 1.05, marginBottom: 16 }}>
          Stop guessing.<br />Start winning.
        </h2>
        <p style={{ fontSize: 15, color: "#555", lineHeight: 1.7, marginBottom: 40, maxWidth: 480, margin: "0 auto 40px" }}>
          Every tool you need to dominate your AFL Fantasy league — rankings, signals, trade intel, and AI analysis — all in one place.
        </p>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <Link
            to="/pricing"
            style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "#E0AE2D", color: "#1a0900", fontWeight: 900, fontSize: 15, padding: "16px 36px", borderRadius: 12, textDecoration: "none", boxShadow: "0 4px 40px rgba(224,174,45,0.32), 0 0 0 1px rgba(224,174,45,0.18) inset", letterSpacing: "0.01em" }}
          >
            Unlock Full Access <ArrowRight size={16} />
          </Link>
          <Link
            to="/sports/afl/rankings"
            style={{ fontSize: 13, color: "#3A3A3A", textDecoration: "none", letterSpacing: "0.01em" }}
          >
            View free picks first
          </Link>
        </div>
      </div>
    </section>
  );
}
