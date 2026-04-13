import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChevronRight,
  TrendingUp,
  Zap,
  Star,
  ChartBar as BarChart3,
  GitCompare,
  Users,
  Target,
  Check,
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
  reason: string;
  ctaLabel: string;
  ctaTo: string;
}

const FREE_PREVIEW = 5;

const NAV_ITEMS = [
  { label: "Current Week", to: "/sports/afl/current-round", primary: true },
  { label: "Market Watch", to: "/sports/afl/market-watch" },
  { label: "Captains", to: "/sports/afl/captains" },
  { label: "Rankings", to: "/sports/afl/rankings" },
  { label: "Players", to: "/sports/afl/players" },
] as const;

const TOOLS = [
  { icon: <BarChart3 size={18} />, title: "Rankings", to: "/sports/afl/rankings", color: "#E0AE2D" },
  { icon: <TrendingUp size={18} />, title: "Market Watch", to: "/sports/afl/market-watch", color: "#22C55E" },
  { icon: <Zap size={18} />, title: "Edge Board", to: "/sports/afl/current-round", color: "#60A5FA" },
  { icon: <GitCompare size={18} />, title: "Start / Sit", to: "/sports/afl/start-sit", color: "#F87171" },
  { icon: <Star size={18} />, title: "Captains", to: "/sports/afl/captains", color: "#E0AE2D" },
  { icon: <Users size={18} />, title: "Player Profiles", to: "/sports/afl/players", color: "#60A5FA" },
] as const;

const WORKFLOW = [
  { num: "1", icon: <Target size={16} />, title: "Find the Right Plays", desc: "Top projected scorers before lockout — must buys and captain options.", color: "#E0AE2D", to: "/sports/afl/rankings" },
  { num: "2", icon: <TrendingUp size={16} />, title: "Trade With Confidence", desc: "Spot undervalued players early. Avoid overpriced traps before lockout.", color: "#22C55E", to: "/sports/afl/market-watch" },
  { num: "3", icon: <Zap size={16} />, title: "Make Faster Decisions", desc: "Rankings, edge board, and signals — one clear weekly workflow.", color: "#60A5FA", to: "/sports/afl/current-round" },
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

  return (
    <Link to={card.ctaTo} style={{ textDecoration: "none", display: "block", width: 260, flexShrink: 0 }}>
      <div style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: `1px solid ${card.color}25`, borderRadius: 14, padding: "18px 16px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right, transparent, ${card.color}70, transparent)` }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.28em", textTransform: "uppercase", color: `${card.color}AA` }}>{card.label}</span>
          {card.position && (
            <span style={{ fontSize: 8, fontWeight: 800, color: card.color, background: `${card.color}15`, border: `1px solid ${card.color}25`, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase" }}>{card.position}</span>
          )}
        </div>

        <p style={{ fontSize: 15, fontWeight: 800, color: "#F5F5F5", marginBottom: 4, letterSpacing: "-0.02em", lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.playerName}</p>
        <p style={{ fontSize: 11, color: "#555", marginBottom: 12 }}>{card.team}</p>

        {pts != null && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 10 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: card.color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{pts}</span>
            <span style={{ fontSize: 9, color: "#555", fontWeight: 600 }}>proj pts</span>
          </div>
        )}

        {card.reason && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, color: "#606060", lineHeight: 1.5, fontStyle: "italic" }}>{card.reason}</p>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: card.color }}>
          {card.ctaLabel} <ChevronRight size={11} />
        </div>
      </div>
    </Link>
  );
}

function SkeletonHeroCard() {
  return (
    <div style={{ width: 260, flexShrink: 0, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "18px 16px" }}>
      <div style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 3, width: "40%", marginBottom: 16 }} />
      <div style={{ height: 15, background: "rgba(255,255,255,0.07)", borderRadius: 3, width: "75%", marginBottom: 8 }} />
      <div style={{ height: 11, background: "rgba(255,255,255,0.04)", borderRadius: 3, width: "50%", marginBottom: 16 }} />
      <div style={{ height: 32, background: "rgba(255,255,255,0.05)", borderRadius: 3, width: "45%", marginBottom: 12 }} />
      <div style={{ height: 11, background: "rgba(255,255,255,0.04)", borderRadius: 3, width: "70%" }} />
    </div>
  );
}

export default function MobileLanding({ loading, topRows, cards, showSkeleton, isPremium }: Props) {
  const [activeNav, setActiveNav] = useState<string>("/sports/afl/current-round");

  return (
    <div style={{ background: "#0a0908", overflowX: "hidden" }}>

      {/* ─── STICKY TOP BAR ─── */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(10,9,8,0.92)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link to="/" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: "#E0AE2D", letterSpacing: "-0.02em" }}>Neeko</span>
          <span style={{ fontSize: 15, fontWeight: 400, color: "#555", letterSpacing: "-0.02em" }}> Stats</span>
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/auth" style={{ fontSize: 12, fontWeight: 700, color: "#888", textDecoration: "none", padding: "7px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", minHeight: 36, display: "flex", alignItems: "center" }}>Login</Link>
          <Link to="/auth" style={{ fontSize: 12, fontWeight: 800, color: "#1a0900", textDecoration: "none", padding: "7px 14px", borderRadius: 8, background: "#E0AE2D", minHeight: 36, display: "flex", alignItems: "center" }}>Get Started</Link>
        </div>
      </div>

      {/* ─── SECTION 1 — HERO ─── */}
      <section style={{ position: "relative", background: "radial-gradient(circle at 50% 28%, rgba(255,200,0,0.08), transparent 60%), linear-gradient(to bottom, #050505, #000000)", minHeight: "70vh", display: "flex", flexDirection: "column", justifyContent: "flex-start" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 30%, rgba(255,200,0,0.05), transparent 70%)", zIndex: 1, pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 10, padding: "36px 16px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(224,174,45,0.70)", marginBottom: 12 }}>AFL Fantasy Intelligence</p>
          <h1 style={{ fontSize: "1.85rem", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.025em", color: "#ffffff", textShadow: "0 2px 20px rgba(0,0,0,0.9)", marginBottom: 14 }}>
            Stop Guessing.<br />
            <span style={{ color: "#E0AE2D" }}>Start Winning</span> Your<br />
            AFL Fantasy Week.
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.80)", marginBottom: 22, lineHeight: 1.6, textShadow: "0 1px 6px rgba(0,0,0,0.90)" }}>
            Trades, captains, and traps — powered by 600+ player projections updated every round.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch", marginBottom: 20 }}>
            <Link to="/auth" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#E0AE2D", color: "#1a0900", fontWeight: 900, fontSize: 15, padding: "15px 20px", borderRadius: 10, textDecoration: "none", boxShadow: "0 4px 20px rgba(224,174,45,0.35)", minHeight: 52, letterSpacing: "0.01em" }}>
              Unlock This Week's Game Plan <ArrowRight size={15} />
            </Link>
            <Link to="/sports/afl/current-round" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.85)", fontWeight: 700, fontSize: 14, padding: "14px 20px", borderRadius: 10, textDecoration: "none", minHeight: 52 }}>
              View Free Picks
            </Link>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
            {["Updated weekly", "Real AFL data", "30-sec game plan"].map(t => (
              <span key={t} style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: "rgba(224,174,45,0.70)", fontSize: 10 }}>•</span> {t}
              </span>
            ))}
          </div>
        </div>

        {/* Hero card carousel */}
        <div style={{ position: "relative", zIndex: 10, paddingBottom: 32 }}>
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.32em", textTransform: "uppercase", color: "rgba(224,174,45,0.55)", textAlign: "center", marginBottom: 14, paddingTop: 8 }}>This Week's Game Plan</p>
          <div style={{ overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", display: "flex", gap: 12, paddingLeft: 16, paddingRight: 16, paddingBottom: 8, scrollbarWidth: "none" }}>
            <style>{`.mobile-card-scroll::-webkit-scrollbar { display: none; }`}</style>
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
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: "0.10em" }}>← swipe →</span>
          </div>
        </div>
      </section>

      {/* ─── SECTION 2 — QUICK NAV STRIP ─── */}
      <div style={{ background: "#0d0b09", borderBottom: "1px solid rgba(255,255,255,0.05)", overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
        <div style={{ display: "flex", gap: 8, padding: "12px 16px", minWidth: "max-content" }}>
          {NAV_ITEMS.map(({ label, to, primary }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setActiveNav(to)}
              style={{ display: "inline-flex", alignItems: "center", padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", minHeight: 38, background: (primary || activeNav === to) ? "rgba(224,174,45,0.14)" : "rgba(255,255,255,0.04)", border: `1px solid ${(primary || activeNav === to) ? "rgba(224,174,45,0.35)" : "rgba(255,255,255,0.07)"}`, color: (primary || activeNav === to) ? "#E0AE2D" : "#777" }}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* ─── SECTION 3 — HOW IT HELPS ─── */}
      <section style={{ background: "#0f0e0c", padding: "56px 16px" }}>
        <div style={{ marginBottom: 36, textAlign: "center" }}>
          <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(224,174,45,0.60)", marginBottom: 10 }}>Your Weekly Workflow</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 900, letterSpacing: "-0.025em", color: "#F5F5F5", lineHeight: 1.15 }}>
            How Neeko Helps You Win
          </h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {WORKFLOW.map(({ num, icon, title, desc, color, to }) => (
            <Link key={num} to={to} style={{ textDecoration: "none" }}>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "18px 16px", display: "flex", gap: 14, alignItems: "flex-start", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: `linear-gradient(to right, transparent, ${color}40, transparent)` }} />
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: `${color}15`, border: `1.5px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
                  {icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 800, color: "#EAEAEA", letterSpacing: "-0.01em" }}>{title}</h3>
                    <span style={{ fontSize: 8, fontWeight: 900, color: `${color}80`, letterSpacing: "0.04em" }}>{num}</span>
                  </div>
                  <p style={{ fontSize: 12.5, color: "#666", lineHeight: 1.55 }}>{desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── SECTION 4 — THIS WEEK'S EDGE (TOP 5) ─── */}
      <section style={{ background: "#0a0908", padding: "56px 16px" }}>
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(224,174,45,0.60)", marginBottom: 10 }}>Live Data</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 900, letterSpacing: "-0.025em", color: "#F5F5F5", lineHeight: 1.15 }}>
            This Week's Edge
          </h2>
        </div>

        <div style={{ background: "rgba(255,255,255,0.025)", borderRadius: 14, border: "1px solid rgba(224,174,45,0.12)", overflow: "hidden" }}>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ width: 22, height: 11, background: "rgba(255,255,255,0.05)", borderRadius: 3 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 13, background: "rgba(255,255,255,0.07)", borderRadius: 3, width: "55%", marginBottom: 5 }} />
                  <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 3, width: "35%" }} />
                </div>
                <div style={{ width: 36, height: 11, background: "rgba(255,255,255,0.05)", borderRadius: 3 }} />
                <div style={{ width: 38, height: 18, background: "rgba(255,255,255,0.05)", borderRadius: 10 }} />
              </div>
            ))
          ) : topRows.length === 0 ? (
            <p style={{ padding: "28px 16px", textAlign: "center", color: "#444", fontSize: 13 }}>Rankings unavailable.</p>
          ) : (
            topRows.slice(0, FREE_PREVIEW + 2).map((player, i) => {
              const locked = i >= FREE_PREVIEW;
              const sig = signalFromRow(player);
              const proj = player.projection != null ? Math.round(player.projection) : null;

              return (
                <div
                  key={player.player_id ?? i}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", filter: locked ? "blur(4px)" : "none", userSelect: locked ? "none" : "auto", pointerEvents: locked ? "none" : "auto" }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#333", width: 22, textAlign: "right", flexShrink: 0 }}>#{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: "#EAEAEA", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{player.player_name}</p>
                    <p style={{ fontSize: 11, color: "#444", marginTop: 1 }}>{proj != null ? `${proj} pts` : "—"} {player.team ? `· ${player.team}` : ""}</p>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: sig.color, background: `${sig.color}18`, padding: "4px 9px", borderRadius: 999, border: `1px solid ${sig.color}28`, flexShrink: 0, letterSpacing: "0.04em" }}>{sig.label}</span>
                </div>
              );
            })
          )}

          <div style={{ padding: "16px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            {!loading && (
              <p style={{ fontSize: 11, color: "#3A3A3A", textAlign: "center" }}>
                Showing {FREE_PREVIEW} of {topRows[0]?.total_count ?? "630"}+ players
              </p>
            )}
            <Link to="/sports/afl/rankings" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "#E0AE2D", color: "#1a0900", fontWeight: 900, fontSize: 14, padding: "14px 20px", borderRadius: 10, textDecoration: "none", boxShadow: "0 4px 18px rgba(224,174,45,0.28)", minHeight: 50 }}>
              Unlock Full Rankings <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── SECTION 5 — TOOLS GRID ─── */}
      <section style={{ background: "#0d0b09", padding: "56px 16px" }}>
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(224,174,45,0.60)", marginBottom: 10 }}>Neeko+</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 900, letterSpacing: "-0.025em", color: "#F5F5F5", lineHeight: 1.15 }}>
            Everything in One System
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {TOOLS.map(({ icon, title, to, color }) => (
            <Link key={title} to={to} style={{ textDecoration: "none" }}>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 14px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, minHeight: 80 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: `${color}15`, border: `1px solid ${color}25`, display: "flex", alignItems: "center", justifyContent: "center", color }}>
                  {icon}
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#EAEAEA", letterSpacing: "-0.01em" }}>{title}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── SECTION 6 — TRUST BLOCK ─── */}
      <section style={{ background: "#0a0908", padding: "48px 16px" }}>
        <h2 style={{ fontSize: "1.35rem", fontWeight: 900, letterSpacing: "-0.025em", color: "#F5F5F5", lineHeight: 1.2, marginBottom: 20, textAlign: "center" }}>
          Built for Serious Fantasy Players
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            "630+ players analysed every round",
            "Updated before every round lockout",
            "Built on real AFL Fantasy data",
            "Designed for winning decisions",
          ].map(item => (
            <div key={item} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Check size={11} style={{ color: "#22C55E" }} />
              </div>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "#AAAAAA" }}>{item}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── SECTION 7 — PRICING ─── */}
      <section style={{ background: "linear-gradient(180deg, #0d0b09 0%, #111009 100%)", padding: "56px 16px" }}>
        <div style={{ background: "linear-gradient(160deg, #1c1507 0%, #110e04 100%)", border: "1px solid rgba(224,174,45,0.25)", borderRadius: 18, padding: "28px 22px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(to right, transparent, rgba(224,174,45,0.70), transparent)" }} />
          <div style={{ position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle, rgba(224,174,45,0.08) 0%, transparent 70%)" }} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.35em", textTransform: "uppercase", color: "#E0AE2D" }}>Neeko+</p>
            <span style={{ fontSize: 8, fontWeight: 900, background: "#E0AE2D", color: "#1a0900", padding: "3px 8px", borderRadius: 4, letterSpacing: "0.08em" }}>BEST VALUE</span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 38, fontWeight: 900, color: "#E0AE2D", letterSpacing: "-0.04em" }}>${NEEKO_PRICING.yearly.monthlyEquivalent}</span>
            <span style={{ fontSize: 13, color: "#444" }}>/mo</span>
          </div>
          <p style={{ fontSize: 11, color: "#333", marginBottom: 22 }}>Billed ${NEEKO_PRICING.yearly.price}/yr · Save {NEEKO_PRICING.savingsPercent}%</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 24 }}>
            {["Full rankings — 630+ players", "Market Watch & trade signals", "Edge Board every round", "Captain picks with AI context", "Start/Sit decisions", "Updated before every lockout"].map(f => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Check size={12} style={{ color: "#E0AE2D", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.60)" }}>{f}</span>
              </div>
            ))}
          </div>

          <Link to="/pricing" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#E0AE2D", color: "#1a0900", fontWeight: 900, fontSize: 15, padding: "15px 20px", borderRadius: 10, textDecoration: "none", boxShadow: "0 4px 24px rgba(224,174,45,0.30)", minHeight: 52, letterSpacing: "0.01em" }}>
            Unlock Full Access <ArrowRight size={15} />
          </Link>

          <p style={{ fontSize: 11, color: "#2A2A2A", textAlign: "center", marginTop: 12 }}>Monthly ${NEEKO_PRICING.monthly.price}/mo · Cancel anytime</p>
        </div>
      </section>

      {/* ─── SECTION 8 — FINAL CTA ─── */}
      <section style={{ background: "linear-gradient(180deg, #111009 0%, #080604 100%)", padding: "64px 16px 80px" }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "1.75rem", fontWeight: 900, letterSpacing: "-0.03em", color: "#F5F5F5", lineHeight: 1.1, marginBottom: 12 }}>
            Start Winning<br />This Week
          </h2>
          <p style={{ fontSize: 14, color: "#555", lineHeight: 1.65, marginBottom: 28 }}>
            Every tool you need to dominate your AFL Fantasy league — in one place.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch" }}>
            <Link to="/pricing" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#E0AE2D", color: "#1a0900", fontWeight: 900, fontSize: 15, padding: "16px 20px", borderRadius: 12, textDecoration: "none", boxShadow: "0 4px 32px rgba(224,174,45,0.30)", minHeight: 54, letterSpacing: "0.01em" }}>
              Unlock Full Access <ArrowRight size={15} />
            </Link>
            <Link to="/sports/afl/rankings" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#444", textDecoration: "none", padding: "12px", minHeight: 44 }}>
              View free picks first
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer style={{ background: "#060504", borderTop: "1px solid rgba(255,255,255,0.04)", padding: "20px 16px" }}>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.12)", textAlign: "center", marginBottom: 10 }}>© {new Date().getFullYear()} Neeko Sports Stats</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 18, flexWrap: "wrap" }}>
          {[{ l: "Policies", t: "/policies" }, { l: "Contact", t: "/contact" }, { l: "About", t: "/about" }, { l: "FAQ", t: "/faq" }].map(x => (
            <Link key={x.t} to={x.t} style={{ fontSize: 11, color: "rgba(255,255,255,0.14)", textDecoration: "none" }}>{x.l}</Link>
          ))}
        </div>
      </footer>

      {!isPremium && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, background: "rgba(10,9,8,0.96)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(224,174,45,0.18)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: "#E0AE2D", marginBottom: 1 }}>Unlock Neeko+</p>
            <p style={{ fontSize: 11, color: "#555" }}>Full access from ${NEEKO_PRICING.yearly.monthlyEquivalent}/mo</p>
          </div>
          <Link to="/pricing" style={{ display: "flex", alignItems: "center", gap: 6, background: "#E0AE2D", color: "#1a0900", fontWeight: 900, fontSize: 12, padding: "10px 16px", borderRadius: 8, textDecoration: "none", whiteSpace: "nowrap", minHeight: 40 }}>
            Get Started <ArrowRight size={12} />
          </Link>
        </div>
      )}
    </div>
  );
}
