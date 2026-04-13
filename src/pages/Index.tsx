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
  shadowColor: string;
  pinColor: string;
}> = {
  0: {
    bg: "#f0f7ee",
    bgGrad: "linear-gradient(162deg, #f3f9f1 0%, #e9f4e7 60%, #e4f0e2 100%)",
    lines: "rgba(22,88,36,0.045)",
    headerBg: "linear-gradient(to right, rgba(22,86,36,0.12), rgba(22,86,36,0.03))",
    headerBorder: "rgba(22,86,36,0.18)",
    accentBorder: "rgba(22,86,36,0.20)",
    numberGlow: "rgba(22,86,36,0.22)",
    shadowColor: "rgba(22,86,36,0.14)",
    pinColor: "#2d7a3a",
  },
  1: {
    bg: "#f9eeed",
    bgGrad: "linear-gradient(162deg, #fbf3f2 0%, #f5e6e5 60%, #f0dedd 100%)",
    lines: "rgba(120,20,20,0.045)",
    headerBg: "linear-gradient(to right, rgba(118,20,20,0.12), rgba(118,20,20,0.03))",
    headerBorder: "rgba(118,20,20,0.18)",
    accentBorder: "rgba(118,20,20,0.20)",
    numberGlow: "rgba(118,20,20,0.22)",
    shadowColor: "rgba(118,20,20,0.12)",
    pinColor: "#922020",
  },
  2: {
    bg: "#f9f4e2",
    bgGrad: "linear-gradient(162deg, #fbf7e9 0%, #f4ecd5 60%, #eee5c8 100%)",
    lines: "rgba(110,64,0,0.045)",
    headerBg: "linear-gradient(to right, rgba(108,64,0,0.12), rgba(108,64,0,0.03))",
    headerBorder: "rgba(108,64,0,0.18)",
    accentBorder: "rgba(108,64,0,0.20)",
    numberGlow: "rgba(108,64,0,0.22)",
    shadowColor: "rgba(108,64,0,0.12)",
    pinColor: "#8a5200",
  },
  3: {
    bg: "#ebf1f9",
    bgGrad: "linear-gradient(162deg, #eef4fb 0%, #e3edf8 60%, #d9e6f4 100%)",
    lines: "rgba(10,58,108,0.045)",
    headerBg: "linear-gradient(to right, rgba(10,58,108,0.12), rgba(10,58,108,0.03))",
    headerBorder: "rgba(10,58,108,0.18)",
    accentBorder: "rgba(10,58,108,0.20)",
    numberGlow: "rgba(10,58,108,0.22)",
    shadowColor: "rgba(10,58,108,0.12)",
    pinColor: "#0d4278",
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

function StickyPin({ color, pinColor }: { color: string; pinColor: string }) {
  return (
    <div style={{ position: "absolute", top: "-1.05vw", left: "50%", transform: "translateX(-50%)", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.60))" }}>
      <div style={{ width: "1.15vw", height: "1.15vw", minWidth: 10, minHeight: 10, borderRadius: "50%", background: `radial-gradient(circle at 30% 26%, rgba(255,255,255,0.80) 0%, ${pinColor} 46%, rgba(0,0,0,0.32) 100%)`, border: "1px solid rgba(0,0,0,0.28)", boxShadow: `0 2px 4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.45)` }} />
      <div style={{ width: 2, height: "0.6vw", minHeight: 6, background: "linear-gradient(to bottom, rgba(80,60,40,0.96), rgba(40,28,16,0.45))", marginTop: -1 }} />
    </div>
  );
}

function WhiteboardCard(p: CardProps) {
  const [hovered, setHovered] = useState(false);
  const pts = p.projection != null ? Math.round(p.projection) : null;
  const rotation = CARD_ROTATIONS[p.index ?? 0] ?? -1.8;
  const theme = CARD_THEMES[p.index ?? 0] ?? CARD_THEMES[0];

  return (
    <Link to={p.ctaTo} style={{ textDecoration: "none", display: "block", paddingTop: "1.25vw" }}>
      <div style={{ position: "relative" }}>
        <StickyPin color={p.color} pinColor={theme.pinColor} />

        {/* Lift shadow underneath — adds physical depth */}
        <div style={{
          position: "absolute",
          bottom: "-0.5vw", left: "6%", right: "6%",
          height: "1vw",
          background: `radial-gradient(ellipse at center, ${theme.shadowColor} 0%, transparent 70%)`,
          filter: "blur(6px)",
          transform: hovered ? "scaleX(1.08) translateY(0.3vw)" : "scaleX(1)",
          transition: "all 0.24s ease",
          pointerEvents: "none",
          zIndex: 0,
        }} />

        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            position: "relative",
            zIndex: 1,
            /* Base paper: gradient + ruled lines + subtle noise via svg data-uri */
            background: theme.bgGrad,
            backgroundImage: [
              theme.bgGrad,
              `repeating-linear-gradient(transparent, transparent 1.35vw, ${theme.lines} 1.35vw, ${theme.lines} calc(1.35vw + 1px))`,
              `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.028'/%3E%3C/svg%3E")`,
            ].join(", "),
            borderRadius: 6,
            border: `1px solid ${theme.accentBorder}`,
            boxShadow: hovered
              ? `0 4px 10px rgba(0,0,0,0.22), 0 14px 32px rgba(0,0,0,0.26), 0 28px 56px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.82), inset 0 0 0 1px rgba(255,255,255,0.18)`
              : `0 2px 5px rgba(0,0,0,0.14), 0 7px 20px rgba(0,0,0,0.18), 0 16px 36px rgba(0,0,0,0.13), inset 0 1px 0 rgba(255,255,255,0.75), inset 0 0 0 1px rgba(255,255,255,0.14)`,
            transform: hovered
              ? `rotate(${rotation}deg) translateY(-0.8vw) scale(1.032)`
              : `rotate(${rotation}deg) translateY(0)`,
            transition: "transform 0.22s cubic-bezier(0.34,1.42,0.64,1), box-shadow 0.22s ease",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Top edge sheen */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(to bottom, rgba(255,255,255,0.78), transparent)", borderRadius: "6px 6px 0 0", pointerEvents: "none", zIndex: 2 }} />
          {/* Right edge sheen */}
          <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 2, background: "linear-gradient(to right, transparent, rgba(255,255,255,0.30))", borderRadius: "0 6px 6px 0", pointerEvents: "none", zIndex: 2 }} />

          {/* ── ZONE 1: CATEGORY LABEL STRIP ── */}
          <div style={{
            background: theme.headerBg,
            borderBottom: `1px solid ${theme.headerBorder}`,
            padding: "0.70vw 0.90vw 0.56vw",
            display: "flex", alignItems: "center", gap: "0.42vw",
          }}>
            <span style={{ color: p.color, display: "flex", alignItems: "center", flexShrink: 0 }}>{p.icon}</span>
            <span style={{ fontSize: "0.56vw", fontWeight: 900, letterSpacing: "0.30em", textTransform: "uppercase", color: p.color, flex: 1, textShadow: "0 1px 0 rgba(255,255,255,0.55)" }}>{p.label}</span>
            {p.position && (
              <span style={{ fontSize: "0.46vw", fontWeight: 800, textTransform: "uppercase", background: `${p.color}1a`, color: p.color, padding: "0.13vw 0.32vw", borderRadius: 3, border: `1px solid ${p.color}26`, letterSpacing: "0.08em" }}>{p.position}</span>
            )}
            {p.badge && (
              <span style={{ fontSize: "0.52vw", fontWeight: 900, background: `linear-gradient(to bottom, ${p.color}ee, ${p.color}cc)`, color: "#fff", padding: "0.14vw 0.4vw", borderRadius: 3, boxShadow: "0 1px 3px rgba(0,0,0,0.20)", letterSpacing: "0.04em" }}>{p.badge}</span>
            )}
          </div>

          {/* ── ZONE 2: PLAYER NAME ── */}
          <div style={{ padding: "0.80vw 0.90vw 0.18vw" }}>
            <p style={{ fontSize: "1.0vw", fontWeight: 900, color: "#17100a", lineHeight: 1.10, letterSpacing: "-0.030em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 1px 0 rgba(255,255,255,0.60)", margin: 0 }}>{p.playerName}</p>
            <p style={{ fontSize: "0.52vw", color: "#6a5040", marginTop: "0.18vw", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "0.04em", margin: 0 }}>{p.team}</p>
          </div>

          {/* ── ZONE 3: PROJECTION NUMBER (dominant focal point) ── */}
          <div style={{ padding: "0.28vw 0.90vw 0", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            {pts != null ? (
              <>
                <span style={{
                  fontSize: "3.8vw", fontWeight: 900, color: p.color,
                  lineHeight: 0.90, letterSpacing: "-0.048em",
                  fontVariantNumeric: "tabular-nums",
                  textShadow: `0 2px 0 rgba(0,0,0,0.07), 0 0 24px ${theme.numberGlow}`,
                  filter: `drop-shadow(0 2px 4px ${theme.numberGlow})`,
                }}>{pts}</span>
                <span style={{ fontSize: "0.50vw", color: "#7a6050", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: "0.10vw", lineHeight: 1 }}>Projected pts</span>
              </>
            ) : (
              <span style={{ fontSize: "1.6vw", color: "#bbb", fontWeight: 700, lineHeight: 1 }}>—</span>
            )}
          </div>

          {/* Hairline divider */}
          <div style={{ margin: "0.42vw 0.90vw 0", height: 1, background: `linear-gradient(to right, ${p.color}38, transparent 85%)` }} />

          {/* ── ZONE 4: VERDICT LINE (single punchy line) ── */}
          <div style={{ padding: "0.38vw 0.90vw 0.44vw", flex: 1 }}>
            <p style={{ fontSize: "0.58vw", color: "#2e1e14", fontWeight: 700, lineHeight: 1.4, margin: 0, letterSpacing: "0.008em", opacity: 0.88 }}>{p.reason}</p>
          </div>

          {/* ── ZONE 5: CTA BUTTON ── */}
          <div style={{ padding: "0 0.80vw 0.90vw" }}>
            <div style={{
              background: `linear-gradient(165deg, ${p.color}f0 0%, ${p.color}d8 100%)`,
              color: "#fff",
              fontSize: "0.52vw", fontWeight: 800,
              textAlign: "center",
              padding: "0.58vw 0.6vw",
              borderRadius: 4,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.24), 0 2px 8px rgba(0,0,0,0.26), 0 0 0 1px ${p.color}38`,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "0.28vw",
              textShadow: "0 1px 2px rgba(0,0,0,0.28)",
            }}>
              {p.ctaLabel} <ChevronRight size={8} />
            </div>
          </div>
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

  function tradeTargetReason(): string {
    if (!breakoutFallback) return "";
    const price = breakoutFallback.price;
    const proj = breakoutFallback.projection;
    const be = breakoutFallback.breakeven;
    if (price != null && price > 0 && proj != null && be != null && proj > be) {
      const gap = Math.round(proj - be);
      return `+${gap} above breakeven — strong trade target.`;
    }
    if (price != null && price > 0 && proj != null) {
      const pricePer = (price / 1000).toFixed(0);
      return `Undervalued at $${pricePer}k — strong upside.`;
    }
    return "Undervalued for projected output — trade now.";
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
      label: "Trade Target", icon: <ZapIcon size={9} />,
      color: "#0d4278",
      playerName: breakoutFallback!.player_name, team: breakoutFallback!.team ?? "", position: breakoutFallback!.position,
      projection: breakoutFallback!.projection,
      reason: tradeTargetReason(),
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
