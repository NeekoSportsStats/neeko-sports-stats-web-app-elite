import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function LandingFinalCTA() {
  return (
    <section style={{ background: "linear-gradient(180deg, #0d0b09 0%, #080604 100%)", padding: "80px clamp(16px, 5vw, 40px)", position: "relative", overflow: "hidden" }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at 50% 70%, rgba(224,174,45,0.07) 0%, transparent 65%)",
        pointerEvents: "none",
      }} />
      <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
        <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(224,174,45,0.65)", margin: "0 0 18px" }}>
          Get Started
        </p>
        <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 900, letterSpacing: "-0.04em", color: "#F5F5F5", lineHeight: 1.05, margin: "0 0 14px" }}>
          Stop guessing.<br />Start winning.
        </h2>
        <p style={{ fontSize: 14.5, color: "rgba(255,255,255,0.42)", lineHeight: 1.65, maxWidth: 480, margin: "0 auto 40px" }}>
          Every tool you need to dominate your AFL Fantasy league — rankings, signals, trade intel, and AI analysis — all in one place.
        </p>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <Link
            to="/neeko-plus"
            style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              background: "linear-gradient(160deg, #fad52a 0%, #e09600 100%)",
              color: "#1a0900",
              fontWeight: 900, fontSize: 15,
              padding: "15px 36px",
              borderRadius: 12,
              textDecoration: "none",
              boxShadow: "0 8px 40px rgba(224,174,45,0.30), 0 0 0 1px rgba(224,174,45,0.16) inset",
              letterSpacing: "0.01em",
              transition: "all 0.22s ease",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.transform = "translateY(-2px)";
              el.style.boxShadow = "0 12px 48px rgba(224,174,45,0.38), 0 0 0 1px rgba(224,174,45,0.20) inset";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.transform = "none";
              el.style.boxShadow = "0 8px 40px rgba(224,174,45,0.30), 0 0 0 1px rgba(224,174,45,0.16) inset";
            }}
          >
            Unlock Full Access <ArrowRight size={16} />
          </Link>
          <Link
            to="/sports/afl/rankings"
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.35)",
              textDecoration: "none",
              letterSpacing: "0.01em",
              transition: "color 0.18s ease",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.65)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.35)"; }}
          >
            View free picks first
          </Link>
        </div>
      </div>
    </section>
  );
}
