import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowRight, TrendingUp, TriangleAlert as AlertTriangle, Star, Zap as ZapIcon, ChevronRight, Zap, Database, Clock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import MobileUpgradeBar from "@/components/mobile/MobileUpgradeBar";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import { classifyPlayers } from "@/features/afl/market-watch/engine";
import type { MWPlayerRow } from "@/features/afl/market-watch/types";
import LandingWorkflowSection from "@/features/afl/landing/LandingWorkflowSection";
import LandingTopRankings from "@/features/afl/landing/LandingTopRankings";
import LandingToolsGrid from "@/features/afl/landing/LandingToolsGrid";
import LandingTrust from "@/features/afl/landing/LandingTrust";
import LandingPricing from "@/features/afl/landing/LandingPricing";
import LandingFinalCTA from "@/features/afl/landing/LandingFinalCTA";
import MobileLanding from "@/features/afl/landing/MobileLanding";

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bgDark:    "#0B0F14",
  bgLight:   "#F5F5F3",
  bgSection: "#11161C",
  textPrim:  "#EAEAEA",
  textSec:   "#9CA3AF",
  textDark:  "#1A1A1A",
  gold:      "#F4C542",
  green:     "#22C55E",
  red:       "#EF4444",
  border:    "rgba(255,255,255,0.08)",
};

// ── Whiteboard card (hero) ─────────────────────────────────────────────────────
const CARD_ROTATIONS = [-1.8, 1.4, -1.2, 1.6];

const CARD_THEMES: Record<number, {
  bg: string;
  bgGrad: string;
  lines: string;
  headerBg: string;
  headerBorder: string;
  accentBorder: string;
  numberGlow: string;
}> = {
  0: {
    bg: "#eef6ec",
    bgGrad: "linear-gradient(160deg, #f2f9f0 0%, #e8f4e6 100%)",
    lines: "rgba(30,100,44,0.055)",
    headerBg: "linear-gradient(to right, rgba(26,96,40,0.10), rgba(26,96,40,0.04))",
    headerBorder: "rgba(26,96,40,0.16)",
    accentBorder: "rgba(26,96,40,0.22)",
    numberGlow: "rgba(26,96,40,0.18)",
  },
  1: {
    bg: "#f8edec",
    bgGrad: "linear-gradient(160deg, #faf2f1 0%, #f3e5e4 100%)",
    lines: "rgba(136,24,24,0.055)",
    headerBg: "linear-gradient(to right, rgba(136,24,24,0.10), rgba(136,24,24,0.04))",
    headerBorder: "rgba(136,24,24,0.16)",
    accentBorder: "rgba(136,24,24,0.22)",
    numberGlow: "rgba(136,24,24,0.18)",
  },
  2: {
    bg: "#f8f3e3",
    bgGrad: "linear-gradient(160deg, #faf6e8 0%, #f2ead4 100%)",
    lines: "rgba(122,72,0,0.055)",
    headerBg: "linear-gradient(to right, rgba(122,72,0,0.10), rgba(122,72,0,0.04))",
    headerBorder: "rgba(122,72,0,0.16)",
    accentBorder: "rgba(122,72,0,0.22)",
    numberGlow: "rgba(122,72,0,0.18)",
  },
  3: {
    bg: "#eaf0f9",
    bgGrad: "linear-gradient(160deg, #eef3fb 0%, #e2ecf6 100%)",
    lines: "rgba(13,66,120,0.055)",
    headerBg: "linear-gradient(to right, rgba(13,66,120,0.10), rgba(13,66,120,0.04))",
    headerBorder: "rgba(13,66,120,0.16)",
    accentBorder: "rgba(13,66,120,0.22)",
    numberGlow: "rgba(13,66,120,0.18)",
  },
};

type CardProps = {
  label: string;
  icon: React.ReactNode;
  color: string;
  playerName: string;
  team: string;
  position?: string | null;
  projection?: number | null;
  reason: string;
  ctaLabel: string;
  ctaTo: string;
  badge?: string;
  index?: number;
};

function PlayerAvatar({ name, color }: { name: string; color: string }) {
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{
      width: "2.8vw", height: "2.8vw", minWidth: 26, minHeight: 26,
      borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg, ${color}22 0%, ${color}10 100%)`,
      border: `1.5px solid ${color}40`,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 6px ${color}18`,
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative",
    }}>
      <div style={{ position: "absolute", bottom: -1, left: "50%", transform: "translateX(-50%)", width: "60%", height: "62%", background: `${color}20`, borderRadius: "50% 50% 0 0" }} />
      <div style={{ position: "absolute", top: "14%", left: "50%", transform: "translateX(-50%)", width: "38%", height: "38%", borderRadius: "50%", background: `${color}35` }} />
      <span style={{ position: "relative", zIndex: 1, fontSize: "0.58vw", fontWeight: 900, color, letterSpacing: "-0.01em", marginTop: "22%" }}>{initials}</span>
    </div>
  );
}

function StickyPin({ color }: { color: string }) {
  return (
    <div style={{ position: "absolute", top: "-0.85vw", left: "50%", transform: "translateX(-50%)", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.55))" }}>
      <div style={{ width: "1.0vw", height: "1.0vw", minWidth: 9, minHeight: 9, borderRadius: "50%", background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.72) 0%, ${color} 48%, rgba(0,0,0,0.28) 100%)`, border: "1px solid rgba(0,0,0,0.24)", boxShadow: `0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.4)` }} />
      <div style={{ width: 2, height: "0.55vw", minHeight: 5, background: "linear-gradient(to bottom, rgba(100,80,60,0.95), rgba(50,38,28,0.50))", marginTop: -1 }} />
    </div>
  );
}

function WhiteboardCard(p: CardProps) {
  const [hovered, setHovered] = useState(false);
  const pts = p.projection != null ? Math.round(p.projection) : null;
  const rotation = CARD_ROTATIONS[p.index ?? 0] ?? -1.8;
  const theme = CARD_THEMES[p.index ?? 0] ?? CARD_THEMES[0];

  return (
    <Link to={p.ctaTo} style={{ textDecoration: "none", display: "block", paddingTop: "1.1vw" }}>
      <div style={{ position: "relative" }}>
        <StickyPin color={p.color} />
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            background: theme.bgGrad,
            backgroundImage: `${theme.bgGrad}, repeating-linear-gradient(transparent, transparent 1.15vw, ${theme.lines} 1.15vw, ${theme.lines} calc(1.15vw + 1px))`,
            borderRadius: 5,
            border: `1px solid ${theme.accentBorder}`,
            boxShadow: hovered
              ? `0 6px 12px rgba(0,0,0,0.26), 0 16px 36px rgba(0,0,0,0.28), 0 30px 60px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.70)`
              : `0 2px 6px rgba(0,0,0,0.16), 0 8px 22px rgba(0,0,0,0.20), 0 18px 40px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.60)`,
            transform: hovered ? `rotate(${rotation}deg) translateY(-0.7vw) scale(1.035)` : `rotate(${rotation}deg) translateY(0)`,
            transition: "all 0.24s cubic-bezier(0.34,1.42,0.64,1)",
            overflow: "visible", position: "relative",
            display: "flex", flexDirection: "column",
          }}
        >
          {/* Top sheen */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(to bottom, rgba(255,255,255,0.70), transparent)", borderRadius: "5px 5px 0 0", pointerEvents: "none" }} />

          {/* ZONE 1 — HEADER STRIP */}
          <div style={{
            background: theme.headerBg,
            borderBottom: `1px solid ${theme.headerBorder}`,
            padding: "0.62vw 0.95vw 0.52vw",
            display: "flex", alignItems: "center", gap: "0.4vw",
            borderRadius: "5px 5px 0 0",
          }}>
            <span style={{ color: p.color, display: "flex", alignItems: "center", flexShrink: 0, filter: `drop-shadow(0 0 3px ${theme.numberGlow})` }}>{p.icon}</span>
            <span style={{ fontSize: "0.54vw", fontWeight: 900, letterSpacing: "0.28em", textTransform: "uppercase", color: p.color, flex: 1, textShadow: "0 1px 0 rgba(255,255,255,0.5)" }}>{p.label}</span>
            {p.position && (
              <span style={{ fontSize: "0.48vw", fontWeight: 800, textTransform: "uppercase", background: `${p.color}18`, color: p.color, padding: "0.14vw 0.34vw", borderRadius: 3, border: `1px solid ${p.color}28` }}>{p.position}</span>
            )}
            {p.badge && (
              <span style={{ fontSize: "0.5vw", fontWeight: 900, textTransform: "uppercase", background: `linear-gradient(to bottom, ${p.color}ee, ${p.color})`, color: "#fff", padding: "0.14vw 0.4vw", borderRadius: 3, boxShadow: "0 1px 3px rgba(0,0,0,0.22)" }}>{p.badge}</span>
            )}
          </div>

          {/* ZONE 2 — PLAYER ROW */}
          <div style={{ padding: "0.85vw 0.95vw 0.3vw", display: "flex", alignItems: "center", gap: "0.6vw" }}>
            <PlayerAvatar name={p.playerName} color={p.color} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "1.05vw", fontWeight: 900, color: "#1a110a", lineHeight: 1.12, letterSpacing: "-0.028em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 1px 0 rgba(255,255,255,0.5)" }}>{p.playerName}</p>
              <p style={{ fontSize: "0.58vw", color: "#6e5542", marginTop: "0.12vw", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "0.02em" }}>{p.team}</p>
            </div>
          </div>

          {/* ZONE 3 — SCORE BLOCK (focal point) */}
          <div style={{ padding: "0.2vw 0.95vw 0.1vw", display: "flex", alignItems: "baseline", gap: "0.35vw" }}>
            {pts != null ? (
              <>
                <span style={{
                  fontSize: "3.6vw", fontWeight: 900, color: p.color, lineHeight: 0.92,
                  fontVariantNumeric: "tabular-nums", letterSpacing: "-0.045em",
                  textShadow: `0 2px 0 rgba(0,0,0,0.08), 0 0 22px ${theme.numberGlow}`,
                  filter: `drop-shadow(0 1px 3px ${theme.numberGlow})`,
                }}>{pts}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.05vw", paddingBottom: "0.2vw" }}>
                  <span style={{ fontSize: "0.55vw", color: "#8a6e58", fontWeight: 700, lineHeight: 1, textTransform: "uppercase", letterSpacing: "0.06em" }}>proj</span>
                  <span style={{ fontSize: "0.55vw", color: "#8a6e58", fontWeight: 700, lineHeight: 1, textTransform: "uppercase", letterSpacing: "0.06em" }}>pts</span>
                </div>
              </>
            ) : (
              <span style={{ fontSize: "1.4vw", color: "#bbb", fontWeight: 700 }}>—</span>
            )}
          </div>

          {/* Divider under score */}
          <div style={{ margin: "0.3vw 0.95vw 0", height: 1, background: `linear-gradient(to right, ${p.color}30, transparent)` }} />

          {/* ZONE 4 — INSIGHT TEXT */}
          <div style={{ padding: "0.38vw 0.95vw 0.5vw", flex: 1 }}>
            <p style={{ fontSize: "0.6vw", color: "#3a2a1e", fontWeight: 700, lineHeight: 1.45, margin: 0, fontStyle: "normal", opacity: 0.90, letterSpacing: "0.005em" }}>{p.reason}</p>
          </div>

          {/* ZONE 5 — CTA FOOTER */}
          <div style={{ padding: "0 0.85vw 0.95vw" }}>
            <div style={{
              background: `linear-gradient(to bottom, ${p.color}f2, ${p.color}dd)`,
              color: "#fff",
              fontSize: "0.54vw", fontWeight: 800,
              textAlign: "center",
              padding: "0.6vw 0.7vw",
              borderRadius: 4,
              letterSpacing: "0.08em",
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 8px rgba(0,0,0,0.28), 0 0 0 1px ${p.color}40`,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3vw",
              textShadow: "0 1px 2px rgba(0,0,0,0.25)",
            }}>
              {p.ctaLabel} <ChevronRight size={9} />
            </div>
          </div>

          {/* Bottom edge shadow for depth */}
          <div style={{ position: "absolute", bottom: -3, left: "8%", right: "8%", height: 6, background: "rgba(0,0,0,0.12)", borderRadius: "0 0 50% 50%", filter: "blur(4px)", pointerEvents: "none" }} />
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div style={{ paddingTop: "1.1vw" }}>
      <div style={{ paddingBottom: "148%", borderRadius: 5, background: "rgba(255,255,255,0.11)", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }} />
    </div>
  );
}

// ── Helpers — all classification delegated to canonical engine ─────────────────
function toMWRow(r: RankingRow): MWPlayerRow {
  const rawSignal = r.action ?? r.signal_tag ?? r.signal ?? null;
  return {
    ...r,
    player_id:      Number(r.player_id) || 0,
    is_bye:         r.is_bye ?? false,
    is_injured:     r.is_injured ?? false,
    display_signal: (rawSignal as MWPlayerRow["display_signal"]) ?? "WATCH",
    access_tier:    r.access_tier ?? "locked",
    team_name:      r.team_name ?? r.team ?? "",
    games_played:   r.games_played ?? null,
    cached_at:      r.cached_at ?? null,
    price:          r.price ?? 0,
  };
}

// ── Main component ─────────────────────────────────────────────────────────────
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
      console.log("HERO CARDS COMPONENT MOUNTED — fetching rankings");
      const { data, error } = await supabase.rpc("get_rankings_safe", {
        p_user_id: null, p_is_bot: false, p_limit: 200,
      });
      if (error) {
        console.error("Hero cards fetch error:", error);
      }
      if (data) {
        console.log("Hero cards raw data length:", (data as unknown[]).length);
        setPlayers((data as Record<string, unknown>[]).map(mapRankingRow));
      }
      setLoading(false);
    })();
  }, []);

  // ── All classification via canonical engine ────────────────────────────────
  const { mustBuyP, trapP, captainP, breakoutP, topRows, mwBuys, mwHolds, mwSells } = useMemo(() => {
    const mwInput: MWPlayerRow[] = players.map(toMWRow);
    const { buys, holds, sells } = classifyPlayers(mwInput);

    // Pool: active players with a projection
    const allWithProjection = players.filter(p => p.projection != null && !p.is_injured && !p.is_bye);
    const byProjectionDesc = [...allWithProjection].sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0));

    // Must Buy: prefer STRONG_UP/UP signal + highest projection, fallback to highest positive value_score
    const mustBuyP =
      allWithProjection.filter(p => ["STRONG_UP", "UP"].includes(p.signal_tag ?? "")).sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))[0]
      ?? allWithProjection.filter(p => (p.value_score ?? 0) > 0).sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0))[0]
      ?? byProjectionDesc[0]
      ?? null;

    // Trap Alert: prefer DOWN/STRONG_DOWN signal, fallback to lowest value_score
    const trapP =
      allWithProjection.filter(p => ["DOWN", "STRONG_DOWN"].includes(p.signal_tag ?? "")).sort((a, b) => (a.projection ?? 0) - (b.projection ?? 0))[0]
      ?? allWithProjection.filter(p => p.player_id !== mustBuyP?.player_id).sort((a, b) => (a.value_score ?? 0) - (b.value_score ?? 0))[0]
      ?? byProjectionDesc[byProjectionDesc.length - 1]
      ?? null;

    // Captain Pick: highest projection among players not already used
    const usedIds1 = new Set([mustBuyP?.player_id, trapP?.player_id].filter(Boolean));
    const captainP =
      byProjectionDesc.filter(p => !usedIds1.has(p.player_id))[0]
      ?? byProjectionDesc[0]
      ?? null;

    // Breakout Pick: prefer positive trend_score, fallback to next highest projection
    const usedIds2 = new Set([mustBuyP?.player_id, trapP?.player_id, captainP?.player_id].filter(Boolean));
    const breakoutP =
      allWithProjection.filter(p => !usedIds2.has(p.player_id) && (p.trend_score ?? 0) > 0).sort((a, b) => (b.trend_score ?? 0) - (a.trend_score ?? 0))[0]
      ?? byProjectionDesc.filter(p => !usedIds2.has(p.player_id))[0]
      ?? byProjectionDesc[3]
      ?? null;

    console.log("Hero cards selected:", {
      mustBuy: mustBuyP?.player_name,
      trap: trapP?.player_name,
      captain: captainP?.player_name,
      breakout: breakoutP?.player_name,
    });

    // Rankings preview — top 12 sorted by neeko_rating
    const topRows = players
      .filter(p => p.projection != null)
      .sort((a, b) => (b.neeko_rating ?? b.projection ?? 0) - (a.neeko_rating ?? a.projection ?? 0))
      .slice(0, 12);

    return { mustBuyP, trapP, captainP, breakoutP, topRows, mwBuys: buys, mwHolds: holds, mwSells: sells };
  }, [players]);

  // ── Hero card reason derivation — short, punchy, scannable ───────────────
  function mustBuyReason(): string {
    if (!mustBuyP) return "";
    const be = mustBuyP.breakeven;
    const proj = mustBuyP.projection;
    if (be != null && proj != null && proj > be) {
      const gap = Math.round(proj - be);
      return `+${gap} above breakeven — strong buy.`;
    }
    if (mustBuyP.season_avg != null && proj != null && proj > mustBuyP.season_avg) {
      return `+${Math.round(proj - mustBuyP.season_avg)} on season avg — buy now.`;
    }
    return "Strong upside signal — buy this week.";
  }

  function trapReason(): string {
    if (!trapFallback) return "";
    const be = trapFallback.breakeven;
    const proj = trapFallback.projection;
    if (be != null && proj != null && proj < be) {
      return "Scoring below breakeven — avoid this week.";
    }
    return "Overpriced for output — avoid this week.";
  }

  function captainReason(): string {
    if (!captainP) return "";
    const pts = captainP.projection != null ? Math.round(captainP.projection) : null;
    return pts != null ? `Top projected captain — ${pts}pts doubled = ${pts * 2}.` : "Top projected captain this week.";
  }

  function bestValueReason(): string {
    if (!breakoutFallback) return "";
    const price = breakoutFallback.price;
    const proj = breakoutFallback.projection;
    if (price != null && price > 0 && proj != null) {
      const pricePer = (price / 1000).toFixed(0);
      return `$${pricePer}k — undervalued for projected output.`;
    }
    return "Undervalued price — strong upside this round.";
  }

  const FREE_PREVIEW = 5;

  const trustBar = [
    { icon: <Zap size={11} />,      text: "Updated before every round lockout" },
    { icon: <Database size={11} />, text: "Built from real AFL Fantasy data" },
    { icon: <Clock size={11} />,    text: "Takes 30 seconds to plan your week" },
  ];

  const allHeroReady = !loading && players.length > 0 && mustBuyP && captainP;

  const trapFallback = trapP ?? captainP;
  const breakoutFallback = breakoutP ?? captainP;

  const cards: CardProps[] = allHeroReady ? [
    {
      label: "Must Buy", icon: <TrendingUp size={9} />,
      color: "#1a6028",
      playerName: mustBuyP!.player_name, team: mustBuyP!.team ?? "", position: mustBuyP!.position,
      projection: mustBuyP!.projection,
      reason: mustBuyReason(),
      ctaLabel: "View Must Buys", ctaTo: "/sports/afl/current-round", index: 0,
    },
    {
      label: "Trap Alert", icon: <AlertTriangle size={9} />,
      color: "#881818",
      playerName: trapFallback!.player_name, team: trapFallback!.team ?? "", position: trapFallback!.position,
      projection: trapFallback!.projection,
      reason: trapReason(),
      ctaLabel: "See Trap Alerts", ctaTo: "/sports/afl/current-round", index: 1,
    },
    {
      label: "Captain Pick", icon: <Star size={9} />, badge: "C",
      color: "#7a4800",
      playerName: captainP!.player_name, team: captainP!.team ?? "", position: captainP!.position,
      projection: captainP!.projection,
      reason: captainReason(),
      ctaLabel: "View Captains", ctaTo: "/sports/afl/captains", index: 2,
    },
    {
      label: "Best Value", icon: <ZapIcon size={9} />,
      color: "#0d4278",
      playerName: breakoutFallback!.player_name, team: breakoutFallback!.team ?? "", position: breakoutFallback!.position,
      projection: breakoutFallback!.projection,
      reason: bestValueReason(),
      ctaLabel: "Open Market Watch", ctaTo: "/sports/afl/market-watch", index: 3,
    },
  ] : [];

  const showSkeleton = loading || cards.length === 0;

  // ── Mobile hero cards mapped to MobileLanding's HeroCard shape ──────────────
  const mobileCards = cards.map(c => ({
    label: c.label,
    color: c.color,
    playerName: c.playerName,
    team: c.team,
    position: c.position,
    projection: c.projection,
    reason: c.reason,
    ctaLabel: c.ctaLabel,
    ctaTo: c.ctaTo,
  }));

  // ── Render ─────────────────────────────────────────────────────────────────
  const helmet = (
    <Helmet>
      <title>Neeko Sports Stats — AFL Fantasy Coach's Desk</title>
      <meta name="description" content="Stop guessing. Win your AFL Fantasy week in 30 seconds. Trade targets, trap warnings, and captain picks powered by 600+ player projections — updated before every lockout." />
      <link rel="canonical" href="https://neekostats.com.au/" />
      <meta property="og:title" content="Neeko Sports Stats — AFL Fantasy Coach's Desk" />
      <meta property="og:description" content="Stop guessing. Win your AFL Fantasy week with trade targets, captain picks, and trap alerts powered by real AFL data." />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://neekostats.com.au/" />
      <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="robots" content="index, follow" />
    </Helmet>
  );

  if (isMobile) {
    return (
      <div style={{ background: "#0a0908", overflowX: "hidden" }}>
        {helmet}
        <MobileLanding
          loading={loading}
          topRows={topRows}
          mwBuys={mwBuys}
          mwSells={mwSells}
          cards={mobileCards}
          showSkeleton={showSkeleton}
          isPremium={isPremium}
        />
      </div>
    );
  }

  return (
    <div style={{ background: C.bgDark, overflowX: "hidden" }}>
      {helmet}

      {/* ══════════════════════════════════════════════════════
          SECTION 0 — HERO (desktop, full-width)
      ══════════════════════════════════════════════════════ */}
      {/* Hero: aspect-ratio box — image is 1536x1024 (3:2), so height = 66.667% of width.
          paddingTop trick forces the section to always be exactly that tall at any viewport width.
          All content is absolutely positioned, so it moves 1:1 with the background. */}
      <section style={{
        width: "100%",
        position: "relative",
        paddingTop: "66.667%",
        backgroundImage: "url('/hero/image.png')",
        backgroundSize: "100% 130%",
        backgroundPosition: "0% 28%",
        backgroundRepeat: "no-repeat",
        overflow: "hidden",
      }}>
        {/* Depth overlays */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.55) 100%)", zIndex: 1, pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.22) 100%)", zIndex: 2, pointerEvents: "none" }} />

        {/* Bottom fade — only the very bottom tray, well below the card shelf */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "14%", background: "linear-gradient(to bottom, transparent 0%, rgba(11,10,9,0.65) 70%, rgba(11,10,9,0.92) 100%)", zIndex: 3, pointerEvents: "none" }} />

        {/* ── ZONE A: Headline + CTA — sits in the upper-mid board writing area ── */}
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "13%",
          paddingLeft: "3vw",
          paddingRight: "3vw",
        }}>
          {/* Eyebrow */}
          <p style={{ fontSize: "0.6vw", fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "#F4C542", marginBottom: "1%", textAlign: "center", textShadow: "0 1px 8px rgba(0,0,0,0.90), 0 0 20px rgba(244,197,66,0.30)" }}>
            AFL Fantasy Intelligence
          </p>

          {/* Headline block */}
          <div style={{ width: "58%", textAlign: "center" }}>
            <h1 style={{ margin: 0, fontSize: "3.5vw", fontWeight: 900, lineHeight: 1.08, letterSpacing: "-0.025em", color: "#f5f5f5", textShadow: "0 2px 4px rgba(0,0,0,0.70), 0 8px 22px rgba(0,0,0,0.50)" }}>
              Stop Guessing. <span style={{ color: C.gold }}>Start Winning</span>
              <br />Your AFL Fantasy Week.
            </h1>
            <p style={{ marginTop: "1%", marginBottom: 0, fontSize: "1.1vw", color: "#F4C542", lineHeight: 1.6, textShadow: "0 1px 10px rgba(0,0,0,0.98), 0 0 28px rgba(0,0,0,0.85)", fontWeight: 700 }}>
              Trades, captains, and traps — powered by 600+ player projections updated every round.
            </p>
          </div>

          {/* CTA buttons */}
          <div style={{ display: "flex", gap: "1%", justifyContent: "center", marginTop: "1.8%", marginBottom: "2%", flexWrap: "nowrap" }}>
            <Link to="/neeko-plus" style={{ display: "flex", alignItems: "center", gap: "0.5vw", background: "linear-gradient(to bottom, #fad52a, #d09800)", color: "#1a1000", fontWeight: 800, fontSize: "1vw", padding: "0.8vw 2vw", borderRadius: 7, textDecoration: "none", border: "1px solid rgba(0,0,0,0.20)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.42), 0 2px 0 rgba(0,0,0,0.32), 0 6px 20px rgba(0,0,0,0.35)", letterSpacing: "0.01em", whiteSpace: "nowrap" }}>
              Unlock This Week's Game Plan <ArrowRight size="1.1vw" />
            </Link>
            <Link to="/sports/afl/current-round" style={{ display: "flex", alignItems: "center", gap: "0.5vw", background: "rgba(255,255,255,0.08)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.80)", fontWeight: 600, fontSize: "1vw", padding: "0.8vw 2vw", borderRadius: 7, textDecoration: "none", letterSpacing: "0.01em", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 12px rgba(0,0,0,0.25)", whiteSpace: "nowrap" }}>
              View Free Picks
            </Link>
          </div>

          {/* Trust strip */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "2vw", flexWrap: "nowrap" }}>
            {trustBar.map(({ icon, text }) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: "0.4vw", fontSize: "0.85vw", color: "rgba(255,255,255,0.70)", fontWeight: 600, whiteSpace: "nowrap" }}>
                <span style={{ color: "rgba(244,197,66,0.90)" }}>{icon}</span>{text}
              </div>
            ))}
          </div>
        </div>

        {/* ── ZONE B: Round label + cards — anchored to the lower board shelf ── */}
        <div style={{
          position: "absolute",
          bottom: "15%",
          left: 0, right: 0,
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingLeft: "3vw",
          paddingRight: "3vw",
        }}>
          {/* Round label */}
          <div style={{ marginBottom: "1.1%", width: "68vw", display: "flex", alignItems: "center", gap: "1vw" }}>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(255,255,255,0.28))" }} />
            <span style={{ fontSize: "0.78vw", fontWeight: 900, letterSpacing: "0.32em", textTransform: "uppercase", color: C.gold, whiteSpace: "nowrap", textShadow: "0 1px 6px rgba(0,0,0,0.65)" }}>Round 6</span>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(255,255,255,0.28))" }} />
          </div>

          {/* Cards row */}
          <div style={{ width: "68vw", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "2.2vw" }}>
            {showSkeleton
              ? [0,1,2,3].map(i => <SkeletonCard key={i} />)
              : cards.map(c => <WhiteboardCard key={c.label} {...c} />)
            }
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          GOLD TRANSITION BAND — hero → content bridge
      ══════════════════════════════════════════════════════ */}
      <div style={{ width: "100%", height: 2, background: "linear-gradient(to right, transparent 0%, rgba(224,174,45,0.15) 15%, rgba(224,174,45,0.45) 40%, rgba(224,174,45,0.45) 60%, rgba(224,174,45,0.15) 85%, transparent 100%)" }} />

      <LandingWorkflowSection />
      <LandingTopRankings loading={loading} rows={topRows} freePreview={FREE_PREVIEW} />
      <LandingToolsGrid />
      <LandingTrust />
      <LandingPricing />
      <LandingFinalCTA />

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer style={{ background: "#080604", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "22px clamp(16px, 4vw, 32px)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.12)" }}>© {new Date().getFullYear()} Neeko Sports Stats</p>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            {[{ l: "Policies", t: "/policies" }, { l: "Contact", t: "/contact" }, { l: "About", t: "/about" }, { l: "FAQ", t: "/faq" }].map(x => (
              <Link key={x.t} to={x.t}
                style={{ fontSize: 11, color: "rgba(255,255,255,0.14)", textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.14)"; }}
              >{x.l}</Link>
            ))}
          </div>
        </div>
      </footer>

      {!isPremium && <MobileUpgradeBar />}
    </div>
  );
}
