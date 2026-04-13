import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function LandingSecondaryCTA() {
  return (
    <section style={{ background: "linear-gradient(180deg, #0e0c0a 0%, #0a0908 100%)", padding: "80px clamp(16px, 5vw, 40px)", position: "relative", overflow: "hidden" }}>
      {/* Subtle radial glow behind content */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at 50% 60%, rgba(224,174,45,0.06) 0%, transparent 65%)",
        pointerEvents: "none",
      }} />

      <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
        <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(224,174,45,0.65)", margin: "0 0 16px" }}>
          Ready?
        </p>
        <h2 style={{ fontSize: "clamp(1.9rem, 3.5vw, 2.8rem)", fontWeight: 900, letterSpacing: "-0.04em", color: "#F5F5F5", lineHeight: 1.06, margin: "0 0 16px" }}>
          Stop Guessing. Start Winning.
        </h2>
        <p style={{ fontSize: "clamp(13px, 0.95vw, 15px)", color: "rgba(255,255,255,0.38)", lineHeight: 1.6, maxWidth: 460, margin: "0 auto 40px" }}>
          Every tool you need to dominate your AFL Fantasy league — projections, value signals, and AI analysis — all in one place.
        </p>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
          <Link
            to="/neeko-plus"
            style={{
              display: "inline-flex", alignItems: "center", gap: 9,
              background: "linear-gradient(160deg, #fad52a 0%, #e09600 100%)",
              color: "#130c00",
              fontWeight: 800, fontSize: "clamp(13px, 0.95vw, 15px)",
              padding: "14px 30px",
              borderRadius: 10,
              textDecoration: "none",
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
              boxShadow: "0 12px 36px rgba(255,184,0,0.32), 0 4px 12px rgba(0,0,0,0.55)",
              transition: "all 0.22s ease",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.transform = "translateY(-2px)";
              el.style.boxShadow = "0 16px 44px rgba(255,184,0,0.38), 0 4px 12px rgba(0,0,0,0.6)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.transform = "none";
              el.style.boxShadow = "0 12px 36px rgba(255,184,0,0.32), 0 4px 12px rgba(0,0,0,0.55)";
            }}
          >
            Start Winning With Neeko+ <ArrowRight size={15} />
          </Link>

          <Link
            to="/sports/afl/rankings"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.06)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.75)",
              fontWeight: 700, fontSize: "clamp(12px, 0.88vw, 14px)",
              padding: "14px 24px",
              borderRadius: 10,
              textDecoration: "none",
              whiteSpace: "nowrap",
              transition: "all 0.22s ease",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.background = "rgba(255,255,255,0.09)";
              el.style.borderColor = "rgba(255,255,255,0.18)";
              el.style.color = "rgba(255,255,255,0.92)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.background = "rgba(255,255,255,0.06)";
              el.style.borderColor = "rgba(255,255,255,0.12)";
              el.style.color = "rgba(255,255,255,0.75)";
            }}
          >
            View Free Rankings
          </Link>
        </div>
      </div>
    </section>
  );
}
