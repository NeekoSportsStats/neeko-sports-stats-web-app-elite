import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChevronRight,
  TrendingUp,
  Zap,
  Star,
  Target,
  Check,
  Crown,
} from "lucide-react";
import { NEEKO_PRICING } from "@/config/neekoPricing";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import type { MWPlayerRow } from "@/features/afl/market-watch/types";

interface Props {
  loading: boolean;
  topRows: RankingRow[];
  mwBuys: MWPlayerRow[];
  mwSells: MWPlayerRow[];
  cards: HeroCard[];
  showSkeleton: boolean;
  isPremium: boolean;
}

interface HeroCard {
  label: string;
  color: string;
  playerName: string;
  team: string;
  position?: string | null;
  projection?: number | null;
  seasonAvg?: number | null;
  confidenceLabel?: string | null;
  reason: string;
  ctaLabel: string;
  ctaTo: string;
}

const FREE_PREVIEW = 3;

const NAV_ITEMS = [
  { label: "This Week", to: "/sports/afl/current-round" },
  { label: "Market", to: "/sports/afl/market-watch" },
  { label: "Captains", to: "/sports/afl/captains" },
  { label: "Rankings", to: "/sports/afl/rankings" },
  { label: "Players", to: "/sports/afl/players" },
] as const;


const WORKFLOW = [
  { num: "1", icon: <Target size={15} />, title: "Find the Right Plays", desc: "Top projected scorers + must buys before lockout.", color: "#E0AE2D", to: "/sports/afl/rankings" },
  { num: "2", icon: <TrendingUp size={15} />, title: "Trade With Confidence", desc: "Spot undervalued players. Avoid overpriced traps.", color: "#22C55E", to: "/sports/afl/market-watch" },
  { num: "3", icon: <Zap size={15} />, title: "Make Faster Decisions", desc: "Rankings, signals, edge board — one clear workflow.", color: "#60A5FA", to: "/sports/afl/current-round" },
] as const;

function signalFromRow(row: RankingRow): { label: string; color: string } {
  const raw = (row.signal_tag ?? row.action ?? row.signal ?? "").toUpperCase();
  if (raw === "STRONG_START" || raw === "START" || raw === "UP" || raw === "STRONG_UP")
    return { label: "BUY", color: "#22C55E" };
  if (raw === "STRONG_SIT" || raw === "SIT" || raw === "DOWN" || raw === "STRONG_DOWN")
    return { label: "AVOID", color: "#EF4444" };
  return { label: "HOLD", color: "#E0AE2D" };
}

function MobileHeroCard({ card }: { card: HeroCard }) {
  const pts = card.projection != null ? Math.round(card.projection) : null;
  const avg = card.seasonAvg != null ? Math.round(card.seasonAvg) : null;
  const vsAvgDiff = pts != null && avg != null ? pts - avg : null;
  const vsAvgStr = vsAvgDiff != null
    ? (vsAvgDiff >= 0 ? `+${vsAvgDiff}` : `${vsAvgDiff}`) + " vs avg"
    : null;

  return (
    <Link to={card.ctaTo} style={{ textDecoration: "none", display: "block", width: "82vw", maxWidth: 300, flexShrink: 0 }}>
      <div style={{
        background: "rgba(255,255,255,0.055)",
        border: `1px solid ${card.color}22`,
        borderRadius: 14,
        padding: "14px 14px 14px",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: card.color, opacity: 0.65 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9 }}>
          <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.26em", textTransform: "uppercase", color: `${card.color}BB`, flex: 1 }}>{card.label}</span>
          {card.position && (
            <span style={{ fontSize: 8, fontWeight: 800, color: card.color, background: `${card.color}15`, border: `1px solid ${card.color}25`, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase", flexShrink: 0 }}>{card.position}</span>
          )}
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 7.5, fontWeight: 700, letterSpacing: "0.12em", color: "#22c55e", flexShrink: 0 }}>
            <span className="live-dot" style={{ width: 4, height: 4, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
            LIVE
          </span>
        </div>

        <p style={{ fontSize: 15, fontWeight: 800, color: "#F0F0F0", marginBottom: 2, letterSpacing: "-0.02em", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.playerName}</p>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", marginBottom: 9, fontWeight: 500 }}>{card.team}</p>

        {pts != null && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 3 }}>
              <span style={{ fontSize: 34, fontWeight: 900, color: card.color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{pts}</span>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", fontWeight: 600, letterSpacing: "0.08em" }}>proj pts</span>
              {vsAvgStr != null && (
                <span style={{
                  fontSize: 8.5, fontWeight: 700,
                  color: vsAvgDiff! >= 0 ? "#4ade80" : "#f87171",
                  background: vsAvgDiff! >= 0 ? "rgba(74,222,128,0.10)" : "rgba(248,113,113,0.10)",
                  padding: "1px 5px", borderRadius: 4, letterSpacing: "0.04em", flexShrink: 0,
                }}>
                  {vsAvgStr}
                </span>
              )}
            </div>
            {card.confidenceLabel && (
              <span style={{
                fontSize: 8, fontWeight: 700,
                color: card.confidenceLabel === "High" ? "#22c55e" : card.confidenceLabel === "Medium" ? "#E0AE2D" : "rgba(255,255,255,0.40)",
                background: card.confidenceLabel === "High" ? "rgba(34,197,94,0.10)" : card.confidenceLabel === "Medium" ? "rgba(224,174,45,0.10)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${card.confidenceLabel === "High" ? "rgba(34,197,94,0.20)" : card.confidenceLabel === "Medium" ? "rgba(224,174,45,0.20)" : "rgba(255,255,255,0.08)"}`,
                padding: "2px 7px", borderRadius: 999, letterSpacing: "0.08em", textTransform: "uppercase" as const,
              }}>
                {card.confidenceLabel} Confidence
              </span>
            )}
          </div>
        )}

        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", lineHeight: 1.5, marginBottom: 11 }}>{card.reason}</p>

        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: card.color }}>
          {card.ctaLabel} <ChevronRight size={10} />
        </div>
      </div>
    </Link>
  );
}

function SkeletonHeroCard() {
  return (
    <div style={{ width: "82vw", maxWidth: 300, flexShrink: 0, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "16px 14px" }}>
      <div style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 3, width: "38%", marginBottom: 14 }} />
      <div style={{ height: 15, background: "rgba(255,255,255,0.07)", borderRadius: 3, width: "72%", marginBottom: 6 }} />
      <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 3, width: "45%", marginBottom: 14 }} />
      <div style={{ height: 34, background: "rgba(255,255,255,0.05)", borderRadius: 3, width: "40%", marginBottom: 10 }} />
      <div style={{ height: 11, background: "rgba(255,255,255,0.04)", borderRadius: 3, width: "65%" }} />
    </div>
  );
}

export default function MobileLanding({ loading, topRows, cards, showSkeleton, isPremium }: Props) {
  return (
    <div style={{ background: "#0a0908", overflowX: "hidden", paddingBottom: isPremium ? 0 : 68 }}>

      {/* ─── HERO ─── */}
      <section style={{
        position: "relative",
        background: "linear-gradient(160deg, #0d0b08 0%, #070503 100%)",
        padding: "32px 16px 0",
        overflow: "hidden",
      }}>
        {/* Ambient gold glow */}
        <div style={{ position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)", width: 320, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,200,0,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(224,174,45,0.65)", marginBottom: 10 }}>
            AFL Fantasy Intelligence
          </p>
          <h1 style={{
            fontSize: "clamp(1.75rem, 8vw, 2.1rem)",
            fontWeight: 900, lineHeight: 1.08, letterSpacing: "-0.028em",
            color: "#ffffff", marginBottom: 12,
          }}>
            Stop Guessing.<br />
            <span style={{ color: "#E0AE2D" }}>Start Winning</span><br />
            AFL Fantasy.
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.72)", marginBottom: 22, lineHeight: 1.55, maxWidth: 300, margin: "0 auto 22px" }}>
            Trades, captains &amp; traps — powered by 600+ player projections updated every round.
          </p>

          {/* CTAs — stacked full-width */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
            <Link to="/auth" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "linear-gradient(160deg, #fad52a, #e09600)",
              color: "#1a0900", fontWeight: 900, fontSize: 15,
              padding: "15px 20px", borderRadius: 10, textDecoration: "none",
              boxShadow: "0 4px 24px rgba(224,174,45,0.32)",
              minHeight: 52, letterSpacing: "0.01em",
            }}>
              Unlock This Week's Game Plan <ArrowRight size={15} />
            </Link>
            <Link to="/sports/afl/current-round" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)",
              color: "rgba(255,255,255,0.78)", fontWeight: 700, fontSize: 14,
              padding: "13px 20px", borderRadius: 10, textDecoration: "none", minHeight: 48,
            }}>
              View Free Picks
            </Link>
          </div>

          {/* Trust micro-row */}
          <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap", padding: "14px 0 20px" }}>
            {["Updated weekly", "Real AFL data", "30-sec picks"].map(t => (
              <span key={t} style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: "rgba(224,174,45,0.55)", fontSize: 8 }}>•</span> {t}
              </span>
            ))}
          </div>
        </div>

        {/* Hero card carousel */}
        <div style={{ position: "relative", zIndex: 2, marginBottom: 0 }}>
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.30em", textTransform: "uppercase", color: "rgba(224,174,45,0.50)", textAlign: "center", marginBottom: 12 }}>
            This Week's Game Plan
          </p>
          <div style={{
            overflowX: "auto", scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
            display: "flex", gap: 12,
            paddingLeft: 16, paddingRight: 16, paddingBottom: 12,
            scrollbarWidth: "none",
          }}
            className="mobile-card-scroll"
          >
            {showSkeleton
              ? [0, 1, 2, 3].map(i => <SkeletonHeroCard key={i} />)
              : cards.map(c => (
                <div key={c.label} style={{ scrollSnapAlign: "start", flexShrink: 0 }}>
                  <MobileHeroCard card={c} />
                </div>
              ))
            }
            <div style={{ width: 4, flexShrink: 0 }} />
          </div>
          <p style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.18)", letterSpacing: "0.10em", marginBottom: 0, paddingBottom: 24 }}>← swipe →</p>
        </div>
      </section>

      {/* ─── QUICK NAV STRIP ─── */}
      <div style={{
        background: "#0d0b09",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        overflowX: "auto", scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      }}>
        <div style={{ display: "flex", gap: 8, padding: "10px 16px", minWidth: "max-content" }}>
          {NAV_ITEMS.map(({ label, to }) => (
            <Link key={to} to={to} style={{
              display: "inline-flex", alignItems: "center",
              padding: "8px 14px", borderRadius: 999,
              fontSize: 12.5, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap",
              minHeight: 36,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.55)",
            }}>
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* ─── THIS WEEK'S EDGE ─── */}
      <section style={{ background: "#0a0908", padding: "56px 16px" }}>
        <div style={{ marginBottom: 24, textAlign: "center" }}>
          <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(224,174,45,0.55)", marginBottom: 8 }}>Live Data</p>
          <h2 style={{ fontSize: "1.45rem", fontWeight: 900, letterSpacing: "-0.025em", color: "#F0F0F0", lineHeight: 1.15 }}>
            This Week's Edge
          </h2>
        </div>

        <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 14, border: "1px solid rgba(224,174,45,0.10)", overflow: "hidden" }}>
          {loading ? (
            Array.from({ length: FREE_PREVIEW + 1 }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ width: 20, height: 10, background: "rgba(255,255,255,0.05)", borderRadius: 3 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 12, background: "rgba(255,255,255,0.07)", borderRadius: 3, width: "55%", marginBottom: 5 }} />
                  <div style={{ height: 9, background: "rgba(255,255,255,0.04)", borderRadius: 3, width: "35%" }} />
                </div>
                <div style={{ width: 38, height: 18, background: "rgba(255,255,255,0.05)", borderRadius: 10 }} />
              </div>
            ))
          ) : topRows.length === 0 ? (
            <p style={{ padding: "28px 16px", textAlign: "center", color: "#444", fontSize: 13 }}>Rankings unavailable.</p>
          ) : (
            topRows.slice(0, FREE_PREVIEW + 1).map((player, i) => {
              const locked = i >= FREE_PREVIEW;
              const sig = signalFromRow(player);
              const proj = player.projection != null ? Math.round(player.projection) : null;

              return (
                <div
                  key={player.player_id ?? i}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "13px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)",
                    filter: locked ? "blur(5px)" : "none",
                    userSelect: locked ? "none" : "auto",
                    pointerEvents: locked ? "none" : "auto",
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.20)", width: 20, textAlign: "right", flexShrink: 0 }}>#{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: "#E8E8E8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{player.player_name}</p>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 2 }}>
                      {proj != null ? `${proj} pts` : "—"}{player.team ? ` · ${player.team}` : ""}
                    </p>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: sig.color, background: `${sig.color}18`, padding: "4px 9px", borderRadius: 999, border: `1px solid ${sig.color}28`, flexShrink: 0, letterSpacing: "0.04em" }}>{sig.label}</span>
                </div>
              );
            })
          )}

          {/* Gate + CTA */}
          <div style={{ padding: "16px 14px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 10 }}>
            {!loading && (
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", textAlign: "center" }}>
                Showing {FREE_PREVIEW} of {topRows[0]?.total_count ?? "630"}+ players
              </p>
            )}
            <Link to="/sports/afl/rankings" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              background: "linear-gradient(160deg, #fad52a, #e09600)",
              color: "#1a0900", fontWeight: 900, fontSize: 14,
              padding: "14px 20px", borderRadius: 10, textDecoration: "none",
              boxShadow: "0 4px 18px rgba(224,174,45,0.28)", minHeight: 50,
            }}>
              Unlock Full Rankings <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── YOUR WEEKLY WORKFLOW ─── */}
      <section style={{ background: "#0f0e0c", padding: "56px 16px" }}>
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(224,174,45,0.55)", marginBottom: 8 }}>Your Weekly Workflow</p>
          <h2 style={{ fontSize: "1.45rem", fontWeight: 900, letterSpacing: "-0.025em", color: "#F0F0F0", lineHeight: 1.15 }}>
            Win Your Week in 3 Steps
          </h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {WORKFLOW.map(({ num, icon, title, desc, color, to }) => (
            <Link key={num} to={to} style={{ textDecoration: "none" }}>
              <div style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 14, padding: "16px 14px",
                display: "flex", gap: 14, alignItems: "flex-start",
                position: "relative", overflow: "hidden",
              }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(to right, transparent, ${color}38, transparent)` }} />
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: `${color}12`, border: `1.5px solid ${color}28`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color, flexShrink: 0,
                }}>
                  {icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 800, color: "#E8E8E8", letterSpacing: "-0.01em" }}>{title}</h3>
                    <span style={{ fontSize: 18, fontWeight: 900, color: `${color}18`, letterSpacing: "-0.04em", lineHeight: 1, flexShrink: 0 }}>{num}</span>
                  </div>
                  <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.38)", lineHeight: 1.5 }}>{desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── TRUST BLOCK ─── */}
      <section style={{ background: "#0a0908", padding: "48px 16px" }}>
        <h2 style={{ fontSize: "1.3rem", fontWeight: 900, letterSpacing: "-0.025em", color: "#F0F0F0", lineHeight: 1.2, marginBottom: 18, textAlign: "center" }}>
          Built for Serious Fantasy Players
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            "630+ players analysed every round",
            "Updated before every round lockout",
            "Built on real AFL Fantasy data",
            "Designed for winning decisions",
          ].map(item => (
            <div key={item} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 14px",
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10,
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: "50%",
                background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.22)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <Check size={10} style={{ color: "#22C55E" }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.58)" }}>{item}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section style={{ background: "linear-gradient(180deg, #0d0b09 0%, #100e08 100%)", padding: "56px 16px" }}>
        <div style={{ marginBottom: 24, textAlign: "center" }}>
          <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(224,174,45,0.55)", marginBottom: 8 }}>Pricing</p>
          <h2 style={{ fontSize: "1.45rem", fontWeight: 900, letterSpacing: "-0.025em", color: "#F0F0F0", lineHeight: 1.15 }}>
            Go Beyond Free Rankings
          </h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
            Free shows you players. <span style={{ color: "rgba(224,174,45,0.75)", fontWeight: 600 }}>Neeko+ tells you what to do.</span>
          </p>
        </div>

        {/* Free tier — compact */}
        <div style={{
          background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 14, padding: "18px 16px", marginBottom: 12,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.32em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: 4 }}>Free</p>
            <p style={{ fontSize: 24, fontWeight: 900, color: "rgba(255,255,255,0.45)", letterSpacing: "-0.04em" }}>$0</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.20)", marginTop: 2 }}>Basic rankings only</p>
          </div>
          <Link to="/sports/afl/rankings" style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "10px 16px", borderRadius: 9,
            border: "1px solid rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.38)", fontSize: 12, fontWeight: 700,
            textDecoration: "none", whiteSpace: "nowrap",
          }}>
            View Free
          </Link>
        </div>

        {/* Neeko+ — primary */}
        <div style={{
          background: "linear-gradient(160deg, #1c1507 0%, #110e04 100%)",
          border: "1px solid rgba(224,174,45,0.28)",
          borderRadius: 16, padding: "22px 16px",
          position: "relative", overflow: "hidden",
          boxShadow: "0 8px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(224,174,45,0.06) inset",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(to right, transparent, rgba(224,174,45,0.70), transparent)" }} />

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.32em", textTransform: "uppercase", color: "#E0AE2D", marginBottom: 6 }}>Neeko+</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 36, fontWeight: 900, color: "#E0AE2D", letterSpacing: "-0.04em" }}>${NEEKO_PRICING.yearly.monthlyEquivalent}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.30)" }}>/mo</span>
              </div>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 3 }}>Billed ${NEEKO_PRICING.yearly.price}/yr · Save {NEEKO_PRICING.savingsPercent}%</p>
            </div>
            <span style={{ fontSize: 8, fontWeight: 900, background: "#E0AE2D", color: "#1a0900", padding: "3px 8px", borderRadius: 5, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>BEST VALUE</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 20 }}>
            {[
              "Full rankings — 630+ players",
              "Market Watch & trade signals",
              "Edge Board every round",
              "Captain picks & start/sit tools",
              "Updated before every lockout",
            ].map(f => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Check size={11} style={{ color: "#E0AE2D", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.62)" }}>{f}</span>
              </div>
            ))}
          </div>

          <Link to="/neeko-plus" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: "linear-gradient(160deg, #fad52a, #e09600)",
            color: "#1a0900", fontWeight: 900, fontSize: 15,
            padding: "15px 20px", borderRadius: 10, textDecoration: "none",
            boxShadow: "0 4px 24px rgba(224,174,45,0.30)", minHeight: 52,
          }}>
            <Crown size={14} /> Start Winning With Neeko+
          </Link>

          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", textAlign: "center", marginTop: 10 }}>
            Monthly ${NEEKO_PRICING.monthly.price}/mo · Cancel anytime
          </p>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section style={{
        background: "linear-gradient(180deg, #100e08 0%, #070503 100%)",
        padding: "56px 16px 64px",
      }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "1.75rem", fontWeight: 900, letterSpacing: "-0.03em", color: "#F5F5F5", lineHeight: 1.08, marginBottom: 10 }}>
            Start Winning<br />This Week
          </h2>
          <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.6, marginBottom: 24, maxWidth: 280, margin: "0 auto 24px" }}>
            Every tool you need to dominate your AFL Fantasy league.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Link to="/neeko-plus" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "linear-gradient(160deg, #fad52a, #e09600)",
              color: "#1a0900", fontWeight: 900, fontSize: 16,
              padding: "17px 20px", borderRadius: 12, textDecoration: "none",
              boxShadow: "0 6px 36px rgba(224,174,45,0.32)", minHeight: 56,
            }}>
              Unlock Full Access <ArrowRight size={16} />
            </Link>
            <Link to="/sports/afl/rankings" style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, color: "rgba(255,255,255,0.30)", textDecoration: "none",
              padding: "12px", minHeight: 44,
            }}>
              View free picks first
            </Link>
          </div>
        </div>
      </section>

      {/* ─── STICKY BOTTOM BAR ─── */}
      {!isPremium && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
          background: "rgba(10,9,8,0.97)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderTop: "1px solid rgba(224,174,45,0.20)",
          padding: "10px 16px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: "#E0AE2D", marginBottom: 1 }}>Start Winning With Neeko+</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>From ${NEEKO_PRICING.yearly.monthlyEquivalent}/mo</p>
          </div>
          <Link to="/neeko-plus" style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "linear-gradient(160deg, #fad52a, #e09600)",
            color: "#1a0900", fontWeight: 900, fontSize: 12,
            padding: "10px 16px", borderRadius: 8, textDecoration: "none",
            whiteSpace: "nowrap", minHeight: 40,
          }}>
            Get Started <ArrowRight size={12} />
          </Link>
        </div>
      )}

      <style>{`
        .mobile-card-scroll::-webkit-scrollbar { display: none; }
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        .live-dot { animation: livePulse 1.8s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
