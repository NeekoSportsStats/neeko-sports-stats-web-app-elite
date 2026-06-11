import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { trackLandingCTA, trackNeekoPlus } from "@/lib/analytics";

export default function LandingFinalCTA() {
  const [primaryHovered, setPrimaryHovered] = useState(false);
  const [primaryActive, setPrimaryActive] = useState(false);
  const [secondaryHovered, setSecondaryHovered] = useState(false);
  const [secondaryActive, setSecondaryActive] = useState(false);

  return (
    <section style={{
      background: "#05070A",
      padding: "clamp(44px, 4.5vw, 80px) clamp(20px, 5vw, 40px)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Subtle blue glow */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse 60% 50% at 50% 65%, rgba(59,130,246,0.06) 0%, transparent 70%)",
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
          color: "rgba(59,130,246,0.65)",
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
          Unlock this round's full<br />
          <span style={{ color: "#60a5fa" }}>AFL stats for $9.99</span>
        </h2>

        <p style={{
          fontSize: "clamp(13px, 0.95vw, 15px)",
          color: "rgba(255,255,255,0.40)",
          lineHeight: 1.6, maxWidth: 440,
          margin: "0 auto 36px",
        }}>
          7 days of premium access. One-time payment. No subscription required.
        </p>

        <div style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 14,
        }}>
          <Link
            to="/neeko-plus"
            onClick={() => {
              trackNeekoPlus({ source: "final_cta", button_text: "Start 7-Day Access — $9.99 AUD", plan: "round_pass_7d" });
              trackLandingCTA({ button_text: "Start 7-Day Access — $9.99 AUD", section: "final_cta", target_url: "/neeko-plus" });
            }}
            onMouseEnter={() => setPrimaryHovered(true)}
            onMouseLeave={() => { setPrimaryHovered(false); setPrimaryActive(false); }}
            onMouseDown={() => setPrimaryActive(true)}
            onMouseUp={() => setPrimaryActive(false)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              background: "linear-gradient(160deg, #3b82f6 0%, #1d4ed8 100%)",
              color: "#eff6ff",
              fontWeight: 900, fontSize: "clamp(14px, 1vw, 16px)",
              padding: "16px 40px",
              borderRadius: 10,
              textDecoration: "none",
              letterSpacing: "0.01em",
              boxShadow: primaryActive
                ? "0 4px 16px rgba(59,130,246,0.22), 0 2px 6px rgba(0,0,0,0.60)"
                : primaryHovered
                  ? "0 16px 52px rgba(59,130,246,0.45), 0 4px 12px rgba(0,0,0,0.60)"
                  : "0 10px 40px rgba(59,130,246,0.28), 0 4px 12px rgba(0,0,0,0.55)",
              transform: primaryActive ? "translateY(0) scale(0.985)" : primaryHovered ? "translateY(-3px) scale(1.01)" : "translateY(0) scale(1)",
              transition: "all 0.18s cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            Start 7-Day Access — $9.99 AUD <ArrowRight size={16} />
          </Link>

          <Link
            to="/stat-board/players"
            onClick={() => trackLandingCTA({ button_text: "Open Stat Board Free", section: "final_cta", target_url: "/stat-board/players" })}
            onMouseEnter={() => setSecondaryHovered(true)}
            onMouseLeave={() => { setSecondaryHovered(false); setSecondaryActive(false); }}
            onMouseDown={() => setSecondaryActive(true)}
            onMouseUp={() => setSecondaryActive(false)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: secondaryHovered ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: `1px solid ${secondaryHovered ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.12)"}`,
              color: secondaryHovered ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.45)",
              fontWeight: 700, fontSize: "clamp(12px, 0.88vw, 14px)",
              padding: "13px 28px",
              borderRadius: 10,
              textDecoration: "none",
              whiteSpace: "nowrap",
              transform: secondaryActive ? "scale(0.985)" : "scale(1)",
              transition: "all 0.20s ease",
            }}
          >
            Open Stat Board Free
          </Link>
        </div>
      </div>
    </section>
  );
}
