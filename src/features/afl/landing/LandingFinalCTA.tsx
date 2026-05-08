import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function LandingFinalCTA() {
  const [primaryHovered, setPrimaryHovered] = useState(false);
  const [primaryActive, setPrimaryActive] = useState(false);
  const [secondaryHovered, setSecondaryHovered] = useState(false);
  const [secondaryActive, setSecondaryActive] = useState(false);

  return (
    <section style={{
      background: "#05070A",
      padding: "clamp(80px, 7vw, 140px) clamp(20px, 5vw, 40px)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Subtle green glow */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse 60% 50% at 50% 65%, rgba(34,197,94,0.06) 0%, transparent 70%)",
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
          color: "rgba(34,197,94,0.65)",
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
          Ready to explore this<br />
          <span style={{ color: "#22c55e" }}>round's AFL stat trends?</span>
        </h2>

        <p style={{
          fontSize: "clamp(13px, 0.95vw, 15px)",
          color: "rgba(255,255,255,0.40)",
          lineHeight: 1.6, maxWidth: 440,
          margin: "0 auto 36px",
        }}>
          Open the Stat Board for free, or unlock the full round with Neeko+.
        </p>

        <div style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 14,
        }}>
          <Link
            to="/stat-board/players"
            onMouseEnter={() => setPrimaryHovered(true)}
            onMouseLeave={() => { setPrimaryHovered(false); setPrimaryActive(false); }}
            onMouseDown={() => setPrimaryActive(true)}
            onMouseUp={() => setPrimaryActive(false)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              background: "linear-gradient(160deg, #22c55e 0%, #16a34a 100%)",
              color: "#f0fff4",
              fontWeight: 900, fontSize: "clamp(14px, 1vw, 16px)",
              padding: "16px 40px",
              borderRadius: 10,
              textDecoration: "none",
              letterSpacing: "0.01em",
              boxShadow: primaryActive
                ? "0 4px 16px rgba(34,197,94,0.22), 0 2px 6px rgba(0,0,0,0.60)"
                : primaryHovered
                  ? "0 16px 52px rgba(34,197,94,0.45), 0 4px 12px rgba(0,0,0,0.60)"
                  : "0 10px 40px rgba(34,197,94,0.28), 0 4px 12px rgba(0,0,0,0.55)",
              transform: primaryActive ? "translateY(0) scale(0.985)" : primaryHovered ? "translateY(-3px) scale(1.01)" : "translateY(0) scale(1)",
              transition: "all 0.18s cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            Open Stat Board Free <ArrowRight size={16} />
          </Link>

          <Link
            to="/neeko-plus"
            onMouseEnter={() => setSecondaryHovered(true)}
            onMouseLeave={() => { setSecondaryHovered(false); setSecondaryActive(false); }}
            onMouseDown={() => setSecondaryActive(true)}
            onMouseUp={() => setSecondaryActive(false)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: secondaryHovered ? "rgba(224,174,45,0.10)" : "rgba(224,174,45,0.05)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: `1px solid ${secondaryHovered ? "rgba(224,174,45,0.32)" : "rgba(224,174,45,0.18)"}`,
              color: secondaryHovered ? "rgba(224,174,45,0.95)" : "rgba(224,174,45,0.70)",
              fontWeight: 700, fontSize: "clamp(12px, 0.88vw, 14px)",
              padding: "13px 28px",
              borderRadius: 10,
              textDecoration: "none",
              whiteSpace: "nowrap",
              transform: secondaryActive ? "scale(0.985)" : "scale(1)",
              transition: "all 0.20s ease",
            }}
          >
            Unlock Full Round with Neeko+
          </Link>
        </div>
      </div>
    </section>
  );
}
