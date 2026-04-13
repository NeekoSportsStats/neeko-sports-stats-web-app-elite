import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function LandingFinalCTA() {
  const [primaryHovered, setPrimaryHovered] = useState(false);
  const [secondaryHovered, setSecondaryHovered] = useState(false);

  return (
    <section style={{
      background: "linear-gradient(180deg, #0a0909 0%, #060504 100%)",
      padding: "96px clamp(16px, 5vw, 40px)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Subtle gold glow behind CTA */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse 60% 50% at 50% 65%, rgba(224,174,45,0.08) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{
        maxWidth: 680, margin: "0 auto",
        textAlign: "center",
        position: "relative", zIndex: 1,
      }}>
        <p style={{
          fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
          textTransform: "uppercase",
          color: "rgba(224,174,45,0.65)",
          margin: "0 0 18px",
        }}>
          Get Started
        </p>

        <h2 style={{
          fontSize: "clamp(1.8rem, 3.8vw, 3rem)",
          fontWeight: 900, letterSpacing: "-0.04em",
          color: "#F5F5F5", lineHeight: 1.05,
          margin: "0 0 16px",
        }}>
          Stop Guessing.<br />
          <span style={{ color: "#E0AE2D" }}>Start Winning</span> Your AFL Fantasy Week.
        </h2>

        <p style={{
          fontSize: "clamp(13px, 0.95vw, 15px)",
          color: "rgba(255,255,255,0.38)",
          lineHeight: 1.6, maxWidth: 480,
          margin: "0 auto 44px",
        }}>
          Use real projections, value signals, and matchup context to make better weekly decisions.
        </p>

        <div style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 14,
        }}>
          <Link
            to="/neeko-plus"
            onMouseEnter={() => setPrimaryHovered(true)}
            onMouseLeave={() => setPrimaryHovered(false)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              background: "linear-gradient(160deg, #fad52a 0%, #e09600 100%)",
              color: "#130c00",
              fontWeight: 900, fontSize: "clamp(13px, 1vw, 15px)",
              padding: "15px 36px",
              borderRadius: 12,
              textDecoration: "none",
              letterSpacing: "0.01em",
              boxShadow: primaryHovered
                ? "0 14px 48px rgba(224,174,45,0.40), 0 4px 12px rgba(0,0,0,0.60)"
                : "0 8px 36px rgba(224,174,45,0.28), 0 4px 12px rgba(0,0,0,0.55)",
              transform: primaryHovered ? "translateY(-2px)" : "none",
              transition: "all 0.22s ease",
            }}
          >
            Start Winning With Neeko+ <ArrowRight size={15} />
          </Link>

          <Link
            to="/sports/afl/rankings"
            onMouseEnter={() => setSecondaryHovered(true)}
            onMouseLeave={() => setSecondaryHovered(false)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: secondaryHovered ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: `1px solid ${secondaryHovered ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.10)"}`,
              color: secondaryHovered ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.55)",
              fontWeight: 600, fontSize: "clamp(12px, 0.88vw, 14px)",
              padding: "13px 28px",
              borderRadius: 10,
              textDecoration: "none",
              whiteSpace: "nowrap",
              transition: "all 0.20s ease",
            }}
          >
            View Free Rankings
          </Link>
        </div>
      </div>
    </section>
  );
}
