import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  Crown, ArrowRight, Check, TrendingUp,
  TriangleAlert as AlertTriangle, Star,
  ChartBar as BarChart3, GitCompare, Bookmark, ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { NEEKO_PRICING } from "@/config/neekoPricing";
import MobileUpgradeBar from "@/components/mobile/MobileUpgradeBar";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";

const BUY_SIGNALS   = ["STRONG_UP","STRONG_BUY","MUST_HAVE","BREAKOUT","UP","BUY"];
const AVOID_SIGNALS = ["STRONG_DOWN","STRONG_SELL","AVOID","DO_NOT_START","DOWN","SELL"];

function resolveSignal(r: RankingRow) {
  return ((r.action ?? r.signal_tag ?? r.signal ?? "") as string).toUpperCase();
}
function isBuy(r: RankingRow)   { return BUY_SIGNALS.includes(resolveSignal(r)); }
function isAvoid(r: RankingRow) { return AVOID_SIGNALS.includes(resolveSignal(r)); }
function isPlayable(p: RankingRow) {
  const ms = (p.manual_status ?? "").toUpperCase();
  return ms !== "OUT" && ms !== "INJURED" && !p.is_bye && !p.is_injured;
}

const MOCK = {
  mustBuy: { player_name: "Rowan Marshall",  team: "St Kilda Saints", position: "RUC", projection: 114, price_change: 15000 },
  trap:    { player_name: "Zac Bailey",      team: "Brisbane Lions",  position: "MID", projection: 82,  price_change: -12000 },
  captain: { player_name: "Dayne Zorko",     team: "Brisbane Lions",  position: "DEF", projection: 132, price_change: 8000 },
  value:   { player_name: "Finn Callaghan",  team: "GWS Giants",      position: "MID", projection: 120, price_change: 17000 },
};

function PlayerAvatar({ name, color }: { name: string; color: string }) {
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{
      width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg, ${color}18 0%, ${color}36 100%)`,
      border: `1.5px solid ${color}40`,
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", position: "relative",
    }}>
      <div style={{
        position: "absolute", bottom: -2, left: "50%", transform: "translateX(-50%)",
        width: 24, height: 28,
        background: `linear-gradient(180deg, ${color}30 0%, ${color}58 100%)`,
        borderRadius: "50% 50% 0 0",
      }} />
      <div style={{
        position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)",
        width: 16, height: 16, borderRadius: "50%",
        background: `linear-gradient(135deg, ${color}58 0%, ${color}88 100%)`,
      }} />
      <span style={{ position: "relative", zIndex: 1, fontSize: 9, fontWeight: 900, color, letterSpacing: "-0.02em", marginTop: 10 }}>{initials}</span>
    </div>
  );
}

type CardProps = {
  label: string;
  icon: React.ReactNode;
  color: string;
  headerBg: string;
  playerName: string;
  team: string;
  position?: string | null;
  projection?: number | null;
  priceChange?: number | null;
  bullets: string[];
  ctaLabel: string;
  ctaTo: string;
  badge?: string;
};

function WhiteboardCard(p: CardProps) {
  const [hovered, setHovered] = useState(false);
  const pts = p.projection != null ? Math.round(p.projection) : null;
  const up  = (p.priceChange ?? 0) > 0;
  const priceStr = p.priceChange != null
    ? `${up ? "+" : ""}${Math.round(p.priceChange / 1000)}k`
    : null;

  return (
    <Link to={p.ctaTo} style={{ textDecoration: "none", display: "block" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: "#f8f6f2",
          borderRadius: 10,
          border: `1.5px solid ${p.color}20`,
          boxShadow: hovered
            ? `0 18px 48px rgba(0,0,0,0.32)`
            : "0 12px 30px rgba(0,0,0,0.25)",
          transform: hovered ? "translateY(-4px)" : "translateY(0)",
          transition: "all 0.2s ease",
          overflow: "hidden",
        }}
      >
        <div style={{
          background: p.headerBg,
          padding: "8px 10px",
          borderBottom: `1px solid ${p.color}18`,
          display: "flex", alignItems: "center", gap: 5,
        }}>
          <span style={{ color: p.color, display: "flex", alignItems: "center", flexShrink: 0 }}>{p.icon}</span>
          <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: p.color, flex: 1 }}>{p.label}</span>
          {p.position && (
            <span style={{ fontSize: 7, fontWeight: 800, textTransform: "uppercase", background: `${p.color}18`, color: p.color, padding: "2px 4px", borderRadius: 3 }}>{p.position}</span>
          )}
          {p.badge && (
            <span style={{ fontSize: 7, fontWeight: 900, textTransform: "uppercase", background: p.color, color: "#fff", padding: "2px 4px", borderRadius: 3 }}>{p.badge}</span>
          )}
        </div>

        <div style={{ padding: "9px 10px 3px", display: "flex", alignItems: "center", gap: 7 }}>
          <PlayerAvatar name={p.playerName} color={p.color} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: "#1a1208", lineHeight: 1.2, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.playerName}</p>
            <p style={{ fontSize: 8, color: "#9a8060", marginTop: 1, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.team}</p>
          </div>
        </div>

        <div style={{ padding: "2px 10px 5px", display: "flex", alignItems: "baseline", gap: 4 }}>
          {pts != null ? (
            <>
              <span style={{ fontSize: 28, fontWeight: 900, color: p.color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{pts}</span>
              <span style={{ fontSize: 9, color: "#b09070", fontWeight: 700 }}>pts</span>
              {priceStr && (
                <span style={{ fontSize: 8, fontWeight: 800, color: up ? "#1f6e2a" : "#8b1a1a", background: up ? "#e6f4ea" : "#fbe8e8", padding: "1px 4px", borderRadius: 3, marginLeft: 2 }}>
                  {up ? "▲" : "▼"}{priceStr}
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: 13, color: "#ccc", fontWeight: 700 }}>—</span>
          )}
        </div>

        <div style={{ padding: "0 10px 7px", display: "flex", flexDirection: "column", gap: 3 }}>
          {p.bullets.map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
              <div style={{ width: 4, height: 4, borderRadius: 1, background: `${p.color}55`, flexShrink: 0, marginTop: 3 }} />
              <span style={{ fontSize: 8, color: "#6a5040", fontWeight: 600, lineHeight: 1.4 }}>{b}</span>
            </div>
          ))}
        </div>

        <div style={{ padding: "0 9px 9px" }}>
          <div style={{
            background: p.color, color: "#fff",
            fontSize: 8, fontWeight: 800, textAlign: "center",
            padding: "6px 8px", borderRadius: 5,
            letterSpacing: "0.06em",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
          }}>
            {p.ctaLabel} <ChevronRight size={7} />
          </div>
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div style={{
      height: 230, borderRadius: 10,
      background: "rgba(255,255,255,0.15)",
      border: "1px solid rgba(255,255,255,0.10)",
      animation: "pulse 1.5s ease-in-out infinite",
    }} />
  );
}

export default function Index() {
  const { isPremium } = useAuth();
  const [players, setPlayers] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_rankings_safe", {
        p_user_id: null, p_is_bot: false, p_limit: 200,
      });
      if (!error && data) setPlayers((data as Record<string, unknown>[]).map(mapRankingRow));
      setLoading(false);
    })();
  }, []);

  const { mustBuyP, trapP, captainP, valueP } = useMemo(() => {
    const avail  = players.filter(p => isPlayable(p) && p.projection != null);
    const buys   = avail.filter(isBuy).sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0));
    const byV    = [...avail].sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0));
    const avoids = avail.filter(isAvoid).sort((a, b) => (a.value_score ?? 0) - (b.value_score ?? 0));
    const byCap  = [...avail].sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0));
    const mustBuyP = buys[0] ?? byV[0] ?? null;
    const trapP    = avoids[0] ?? null;
    const captainP = byCap.find(p => p.player_id !== mustBuyP?.player_id) ?? null;
    const valueP   = buys.find(p => p.player_id !== mustBuyP?.player_id && (p.price ?? 999999) < 650000) ?? buys[1] ?? null;
    return { mustBuyP, trapP, captainP, valueP };
  }, [players]);

  const mB = mustBuyP ?? MOCK.mustBuy;
  const tr = trapP    ?? MOCK.trap;
  const cp = captainP ?? MOCK.captain;
  const vl = valueP   ?? MOCK.value;

  const buyAlso  = players.filter(isBuy).filter(p => p.player_id !== mustBuyP?.player_id).slice(0, 1).map(p => p.player_name);
  const trapAlso = players.filter(isAvoid).filter(p => p.player_id !== trapP?.player_id).slice(0, 1).map(p => p.player_name);
  const capAlso  = players.filter(p => p.player_id !== captainP?.player_id).sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0)).slice(0, 1).map(p => p.player_name);

  const cards: CardProps[] = [
    {
      label: "Must Buy", icon: <TrendingUp size={10} />,
      color: "#1a6628", headerBg: "linear-gradient(135deg, #eaf4eb 0%, #ceebd1 100%)",
      playerName: mB.player_name, team: mB.team ?? "", position: mB.position,
      projection: mB.projection, priceChange: (mB as RankingRow).price_change ?? MOCK.mustBuy.price_change,
      bullets: buyAlso.length ? [buyAlso[0], "Strong form last 3 rounds", "Price rising"] : ["Strong form last 3 rounds", "Price rising fast"],
      ctaLabel: "View Must Buys", ctaTo: "/sports/afl/current-round",
    },
    {
      label: "Trap Alert", icon: <AlertTriangle size={10} />,
      color: "#8b1a1a", headerBg: "linear-gradient(135deg, #fceaea 0%, #f5d2d2 100%)",
      playerName: tr.player_name, team: tr.team ?? "", position: tr.position,
      projection: tr.projection, priceChange: (tr as RankingRow).price_change ?? MOCK.trap.price_change,
      bullets: trapAlso.length ? [trapAlso[0], "Tough matchup this week"] : ["Tough matchup this week", "Ownership risk"],
      ctaLabel: "View Trap Alerts", ctaTo: "/sports/afl/current-round",
    },
    {
      label: "Captain Pick", icon: <Star size={10} />, badge: "C",
      color: "#7a4e00", headerBg: "linear-gradient(135deg, #fdf5e0 0%, #f8e8b0 100%)",
      playerName: cp.player_name, team: cp.team ?? "", position: cp.position,
      projection: cp.projection, priceChange: (cp as RankingRow).price_change ?? MOCK.captain.price_change,
      bullets: capAlso.length ? [capAlso[0], "Premium matchup this round"] : ["Premium matchup this round", "Elite ceiling"],
      ctaLabel: "View Captains", ctaTo: "/sports/afl/captains",
    },
    {
      label: "Best Value", icon: <BarChart3 size={10} />,
      color: "#0e4a7a", headerBg: "linear-gradient(135deg, #e4eef8 0%, #c8ddf2 100%)",
      playerName: vl.player_name, team: vl.team ?? "", position: vl.position,
      projection: vl.projection, priceChange: (vl as RankingRow).price_change ?? MOCK.value.price_change,
      bullets: ["Underpriced vs projection", "Rising ownership trend"],
      ctaLabel: "Open Market Watch", ctaTo: "/sports/afl/market-watch",
    },
  ];

  const quickActions = [
    { to: "/sports/afl/current-round", icon: <GitCompare size={12} />, label: "Compare Players", color: "#1a6628" },
    { to: "/sports/afl/rankings",      icon: <Bookmark size={12} />,   label: "Watchlist",       color: "#7a4e00" },
    { to: "/sports/afl/current-round", icon: <AlertTriangle size={12} />, label: "Trap Alerts",  color: "#8b1a1a" },
    { to: "/sports/afl/rankings",      icon: <Star size={12} />,       label: "Full Rankings",   color: "#0e4a7a" },
  ];

  return (
    <div style={{ background: "#0a0a0a", overflowX: "hidden" }}>
      <Helmet>
        <title>Neeko Sports Stats — AFL Fantasy Coach's Desk</title>
        <meta name="description" content="Win your AFL Fantasy week in 30 seconds. Trade targets, trap warnings, and captain picks powered by real AFL data — updated before every lockout." />
        <link rel="canonical" href="https://neekostats.com.au/" />
        <meta property="og:title" content="Neeko Sports Stats — AFL Fantasy Coach's Desk" />
        <meta property="og:description" content="Win your AFL Fantasy week in 30 seconds. Trade targets, trap warnings, and captain picks powered by real AFL data." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/" />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="robots" content="index, follow" />
      </Helmet>

      {/* ══════════════════════════════════════════════════════════════
          HERO — coach's board background
          New image: /hero/image.png — 1536 × 1024px (landscape 3:2)

          ZONE MAP (% of image height = 1024px):
            Wood top rail:       0  – 12%  (~0–123px)
            Chalkboard (dark):  12% – 45%  (~123–461px) ← headline here
            Whiteboard (white): 45% – 75%  (~461–768px) ← cards here
            Tray + football:    75% – 90%  (~768–922px) ← visible at bottom
            Bottom wood:        90% – 100%

          STRATEGY: background-size: cover, background-position: center 18%
            → at any viewport width the image fills edge-to-edge
            → 18% vertical offset means the chalkboard sits in the upper-centre
               of the viewport, whiteboard in the mid-section, tray fully visible
      ══════════════════════════════════════════════════════════════ */}
      {isMobile ? (
        /* ── MOBILE ── */
        <section style={{
          position: "relative",
          backgroundImage: "url('/hero/image.png')",
          backgroundSize: "cover",
          backgroundPosition: "center 20%",
          backgroundRepeat: "no-repeat",
          paddingBottom: 48,
          minHeight: 600,
        }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1 }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "30%", background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(10,10,10,0.92) 70%, #0a0a0a 100%)", zIndex: 2 }} />

          <div style={{ position: "relative", zIndex: 10, padding: "56px 20px 32px", textAlign: "center" }}>
            <img src="/logo.png" alt="Neeko" style={{ height: 24, marginBottom: 16, opacity: 0.88 }} />
            <h1 style={{ fontSize: "1.9rem", fontWeight: 900, lineHeight: 1.08, letterSpacing: "-0.025em", color: "#ffffff", textShadow: "0 2px 24px rgba(0,0,0,0.9)", marginBottom: 12 }}>
              Win Your <span style={{ color: "#F5C451" }}>AFL Fantasy</span><br />Week in 30 Seconds
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginBottom: 24, lineHeight: 1.6, maxWidth: 340, margin: "0 auto 24px" }}>
              Trades, targets, captains, and traps — powered by real data.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", marginBottom: 32 }}>
              <Link to="/auth" style={{ display: "flex", alignItems: "center", gap: 7, background: "#F5C451", color: "#1a0e00", fontWeight: 800, fontSize: 14, padding: "12px 32px", borderRadius: 7, textDecoration: "none", letterSpacing: "0.02em", boxShadow: "0 4px 18px rgba(245,196,81,0.40)" }}>
                Get Started Free <ArrowRight size={14} />
              </Link>
              {!isPremium && (
                <Link to="/neeko-plus" style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(245,196,81,0.10)", color: "#F5C451", fontWeight: 800, fontSize: 14, padding: "12px 32px", borderRadius: 7, textDecoration: "none", border: "1.5px solid rgba(245,196,81,0.35)", letterSpacing: "0.02em" }}>
                  <Crown size={14} /> Unlock Full Access
                </Link>
              )}
            </div>
          </div>

          <div style={{ position: "relative", zIndex: 10, padding: "0 16px 0" }}>
            <p style={{ textAlign: "center", fontSize: 9, fontWeight: 900, letterSpacing: "0.36em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: 14 }}>
              Coach's Whiteboard
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
              {loading ? [0,1,2,3].map(i => <SkeletonCard key={i} />) : cards.map(c => <WhiteboardCard key={c.label} {...c} />)}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 16 }}>
              {quickActions.map(({ to, icon, label, color }) => (
                <Link key={label} to={to} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.58)", textDecoration: "none", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.13)", padding: "6px 13px", borderRadius: 24 }}>
                  <span style={{ color }}>{icon}</span>{label}
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : (
        /* ── DESKTOP: full-bleed hero — physically grounded in the board ── */
        <section style={{
          position: "relative",
          width: "100%",
          height: "clamp(860px, 96vh, 1020px)",
          overflow: "hidden",
          background: "#1a1008",
        }}>
          {/* BACKGROUND: image fills from top, board zones align to content */}
          <div style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url('/hero/image.png')",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center 38%",
            zIndex: 0,
          }} />

          {/* VIGNETTE: depth, makes content feel grounded */}
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.52) 100%)",
            zIndex: 1, pointerEvents: "none",
          }} />

          {/* BOTTOM fade into page */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: "14%",
            background: "linear-gradient(to bottom, transparent 0%, rgba(10,8,4,0.85) 60%, #0a0a0a 100%)",
            zIndex: 2, pointerEvents: "none",
          }} />

          {/* ── HEADLINE BLOCK: locked to chalkboard zone ── */}
          <div style={{
            position: "absolute",
            top: 110,
            left: "50%",
            transform: "translateX(-50%)",
            textAlign: "center",
            width: "min(820px, 82vw)",
            zIndex: 10,
          }}>
            <h1 style={{
              fontSize: "clamp(2.4rem, 3.8vw, 3.2rem)",
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: "#f5f5f5",
              textShadow: "0 2px 6px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.4)",
              marginBottom: 0,
            }}>
              Win Your <span style={{ color: "#facc15" }}>AFL Fantasy</span>
              <br />Week in 30 Seconds
            </h1>

            <p style={{
              marginTop: 14,
              fontSize: 18,
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1.6,
              textShadow: "0 1px 3px rgba(0,0,0,0.5)",
            }}>
              Trades, targets, captains, and traps — powered by data, just like an AFL coach.
            </p>

            <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 22 }}>
              <Link to="/auth" style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "linear-gradient(to bottom, #facc15, #eab308)",
                color: "#111",
                fontWeight: 700, fontSize: 14,
                padding: "14px 28px", borderRadius: 10, textDecoration: "none",
                boxShadow: "0 4px 10px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)",
                letterSpacing: "0.02em",
              }}>
                Get Started Free <ArrowRight size={14} />
              </Link>
              {!isPremium && (
                <Link to="/neeko-plus" style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "rgba(255,255,255,0.08)",
                  backdropFilter: "blur(6px)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "#ffffff",
                  fontWeight: 700, fontSize: 14,
                  padding: "14px 28px", borderRadius: 10, textDecoration: "none",
                  letterSpacing: "0.02em",
                }}>
                  <Crown size={14} /> Unlock Full Access
                </Link>
              )}
            </div>

            <p style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.32)", letterSpacing: "0.03em" }}>
              Updated before every AFL Fantasy round lockout · 630+ players fully analysed weekly
            </p>
          </div>

          {/* ── CARDS: sit on whiteboard zone ── */}
          <div style={{
            position: "absolute",
            top: 370,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            textAlign: "center",
            width: "min(1140px, 90vw)",
          }}>
            <p style={{
              fontSize: 8.5, fontWeight: 900, letterSpacing: "0.42em",
              textTransform: "uppercase", color: "rgba(80,58,18,0.40)",
              marginBottom: 10,
            }}>
              Coach's Whiteboard
            </p>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 13,
            }}>
              {loading
                ? [0,1,2,3].map(i => <SkeletonCard key={i} />)
                : cards.map(c => <WhiteboardCard key={c.label} {...c} />)
              }
            </div>
          </div>

          {/* ── QUICK ACTIONS: above tray ── */}
          <div style={{
            position: "absolute",
            top: 650,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            justifyContent: "center",
            gap: 12,
            zIndex: 10,
            width: "min(1140px, 90vw)",
            flexWrap: "wrap",
          }}>
            {quickActions.map(({ to, icon, label, color }) => (
              <Link
                key={label} to={to}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 12, fontWeight: 700, color: "rgba(30,20,5,0.72)",
                  textDecoration: "none",
                  background: "rgba(252,246,228,0.75)",
                  border: "1px solid rgba(160,125,55,0.22)",
                  padding: "7px 18px", borderRadius: 24,
                  backdropFilter: "blur(6px)",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = "rgba(255,252,238,0.96)";
                  el.style.color = "#1a1208";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = "rgba(252,246,228,0.75)";
                  el.style.color = "rgba(30,20,5,0.72)";
                }}
              >
                <span style={{ color }}>{icon}</span>{label}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════
          DARK SECTION — normal flow resumes here
      ══════════════════════════════════════════════ */}
      <section style={{ background: "#0a0a0a", padding: "48px clamp(16px, 4vw, 32px) clamp(64px, 9vw, 104px)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>

          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.32em", textTransform: "uppercase", color: "#F5C451", marginBottom: 12 }}>Your Weekly Gameplan</p>
            <h2 style={{
              fontSize: "clamp(1.7rem, 3.6vw, 2.5rem)",
              fontWeight: 900, letterSpacing: "-0.025em",
              color: "#ffffff", lineHeight: 1.1, marginBottom: 14,
            }}>
              Dominate Your AFL Fantasy This Round
            </h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.38)", maxWidth: 500, margin: "0 auto", lineHeight: 1.65 }}>
              Weekly must buys, traps, targets and captains — powered by AFL data. Updated before every lockout.
            </p>
          </div>

          {/* 3 feature cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 72 }}>
            {[
              { num: "01", title: "Check Your Gameplan", color: "#1a6628", icon: <BarChart3 size={22} />, desc: "Get weekly Must Buys, Trap Alerts, and Captain Picks — all backed by real AFL performance data." },
              { num: "02", title: "Make Smarter Trades",  color: "#7a4e00", icon: <TrendingUp size={22} />, desc: "Trade in form players before price rises. Our value engine spots underpriced stars early." },
              { num: "03", title: "Avoid Costly Traps",   color: "#8b1a1a", icon: <AlertTriangle size={22} />, desc: "Skip the players everyone else is picking. Our trap alerts flag over-owned risks before lockout." },
            ].map(({ num, title, color, icon, desc }) => (
              <div
                key={num}
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "28px 24px", transition: "all 0.2s ease" }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = "rgba(255,255,255,0.07)";
                  el.style.borderColor = `${color}38`;
                  el.style.boxShadow = `0 8px 32px ${color}12`;
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = "rgba(255,255,255,0.04)";
                  el.style.borderColor = "rgba(255,255,255,0.08)";
                  el.style.boxShadow = "none";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 10, background: `${color}1e`, border: `1px solid ${color}32`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
                    {icon}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 900, color: `${color}70`, letterSpacing: "0.04em" }}>{num}</span>
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginBottom: 10, letterSpacing: "-0.01em" }}>{title}</h3>
                <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.38)", lineHeight: 1.65 }}>{desc}</p>
              </div>
            ))}
          </div>

          {/* Pricing */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, alignItems: "start" }}>

            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: "28px 24px" }}>
              <p style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.26em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: 14 }}>Free Plan</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 22 }}>
                <span style={{ fontSize: 38, fontWeight: 900, color: "#fff" }}>$0</span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>/month</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 22 }}>
                {["Basic rankings (top 20 players)", "Must Buy snapshot", "Round summary"].map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Check size={12} style={{ color: "#3a9040", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.48)" }}>{f}</span>
                  </div>
                ))}
              </div>
              <Link to="/auth" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.60)", fontWeight: 700, fontSize: 13, padding: "10px 16px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.13)", textDecoration: "none", letterSpacing: "0.03em" }}>
                Get Started Free
              </Link>
            </div>

            <div style={{ background: "linear-gradient(160deg, #1a1206 0%, #120d04 100%)", border: "1.5px solid rgba(245,196,81,0.32)", borderRadius: 12, padding: "28px 24px", boxShadow: "0 10px 44px rgba(245,196,81,0.09)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(245,196,81,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <p style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.26em", textTransform: "uppercase", color: "#F5C451" }}>Neeko Plus</p>
                <span style={{ fontSize: 8.5, fontWeight: 800, background: "#F5C451", color: "#1a0e00", padding: "3px 8px", borderRadius: 4, letterSpacing: "0.08em" }}>BEST VALUE</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 38, fontWeight: 900, color: "#fff" }}>${NEEKO_PRICING.yearly.monthlyEquivalent}</span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>/month</span>
              </div>
              <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.22)", marginBottom: 22 }}>Billed yearly. Cancel anytime.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 24 }}>
                {["Full rankings — 630+ players", "Must Buys & Trap Alerts", "Captain Picks with confidence score", "Market Watch & price changes", "Start/Sit AI decisions", "Updated before every round lockout"].map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Check size={12} style={{ color: "#F5C451", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.60)" }}>{f}</span>
                  </div>
                ))}
              </div>
              <Link to="/neeko-plus" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "#F5C451", color: "#1a0e00", fontWeight: 800, fontSize: 14, padding: "12px 16px", borderRadius: 7, textDecoration: "none", boxShadow: "0 4px 18px rgba(245,196,81,0.32), inset 0 1px 0 rgba(255,255,255,0.28)", letterSpacing: "0.03em" }}>
                <Crown size={13} /> Unlock Full Access
              </Link>
            </div>

            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "28px 24px", display: "flex", flexDirection: "column", gap: 22 }}>
              <p style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.26em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)" }}>Why coaches use Neeko</p>
              {[
                { q: "Made my best trade of the season using the Must Buy list.", from: "AFL Fantasy manager" },
                { q: "The trap alerts saved me from a 40-point disaster.", from: "SuperCoach player" },
              ].map(({ q, from }) => (
                <div key={from} style={{ borderLeft: "2px solid rgba(245,196,81,0.25)", paddingLeft: 14 }}>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.48)", lineHeight: 1.65, fontStyle: "italic", marginBottom: 6 }}>"{q}"</p>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", fontWeight: 600 }}>— {from}</p>
                </div>
              ))}
              <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {["Real AFL data, not guesses", "Updated weekly, every season", "Used by 1,000+ coaches"].map(t => (
                  <div key={t} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <Check size={11} style={{ color: "#3a9040" }} />
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.36)", fontWeight: 600 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: "#07090d", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "20px clamp(16px, 4vw, 32px)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.16)" }}>© {new Date().getFullYear()} Neeko Sports Stats</p>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            {[{ l: "Policies", t: "/policies" }, { l: "Contact", t: "/contact" }, { l: "About", t: "/about" }, { l: "FAQ", t: "/faq" }].map(x => (
              <Link key={x.t} to={x.t}
                style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.52)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.18)"; }}
              >{x.l}</Link>
            ))}
          </div>
        </div>
      </footer>

      {!isPremium && <MobileUpgradeBar />}
    </div>
  );
}
