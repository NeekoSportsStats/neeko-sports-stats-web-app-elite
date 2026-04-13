import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  ArrowRight, TrendingUp, TriangleAlert as AlertTriangle,
  Star, Zap as ZapIcon, ChevronRight, Zap, Database, Clock,
} from "lucide-react";
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
import LandingProductProof from "@/features/afl/landing/LandingProductProof";
import LandingSecondaryCTA from "@/features/afl/landing/LandingSecondaryCTA";
import MobileLanding from "@/features/afl/landing/MobileLanding";

// ── Design tokens ───────────────────────────────────────────────────────────────
const DARK = "#0B0F14";
const GOLD = "#F4C542";

// ── Card accent colors (dark, desaturated — readable on dark bg) ───────────────
const CARD_ACCENTS = [
  { color: "#34d170", dim: "#1a7040", label: "#22c966" },   // Must Buy — green
  { color: "#f87171", dim: "#7c2222", label: "#ef5050" },   // Trap Alert — red
  { color: "#fbbf24", dim: "#8a5a00", label: "#f59e0b" },   // Captain — amber
  { color: "#60a5fa", dim: "#1d4490", label: "#3b8ef5" },   // Trade Target — blue
];

// ── Card type ──────────────────────────────────────────────────────────────────
type CardProps = {
  label: string;
  icon: React.ReactNode;
  accentIdx: number;
  playerName: string;
  team: string;
  position?: string | null;
  projection?: number | null;
  reason: string;
  ctaLabel: string;
  ctaTo: string;
  badge?: string;
};

// ── Edge Card — clean dark glass ──────────────────────────────────────────────
function EdgeCard(p: CardProps) {
  const [hovered, setHovered] = useState(false);
  const accent = CARD_ACCENTS[p.accentIdx] ?? CARD_ACCENTS[0];
  const pts = p.projection != null ? Math.round(p.projection) : null;

  return (
    <Link to={p.ctaTo} style={{ textDecoration: "none", display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: hovered
            ? `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.42) 100%), rgba(22,28,38,0.95)`
            : `linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.40) 100%), rgba(18,23,32,0.88)`,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${hovered ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: hovered
            ? `0 0 0 1px rgba(255,255,255,0.05), 0 10px 30px rgba(0,0,0,0.60), 0 0 0 1px ${accent.dim}40`
            : "0 2px 14px rgba(0,0,0,0.35)",
          transform: hovered ? "translateY(-4px)" : "translateY(0)",
          transition: "all 0.20s ease",
        }}
      >
        {/* Top accent bar */}
        <div style={{
          height: 3,
          background: `linear-gradient(to right, ${accent.color}, ${accent.dim})`,
          flexShrink: 0,
        }} />

        {/* Category label strip */}
        <div style={{
          padding: "10px 16px 8px",
          display: "flex", alignItems: "center", gap: 7,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: `linear-gradient(to right, ${accent.dim}28, transparent)`,
          flexShrink: 0,
        }}>
          <span style={{ color: accent.label, display: "flex", alignItems: "center" }}>
            {p.icon}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 800,
            letterSpacing: "0.30em",
            textTransform: "uppercase",
            color: accent.label,
            flex: 1,
          }}>
            {p.label}
          </span>
          {p.position && (
            <span style={{
              fontSize: 9, fontWeight: 700,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.40)",
              background: "rgba(255,255,255,0.07)",
              padding: "2px 6px",
              borderRadius: 4,
              letterSpacing: "0.08em",
            }}>
              {p.position}
            </span>
          )}
          {p.badge && (
            <span style={{
              fontSize: 10, fontWeight: 900,
              background: `${accent.color}`,
              color: "#000",
              padding: "2px 7px",
              borderRadius: 4,
              letterSpacing: "0.04em",
            }}>
              {p.badge}
            </span>
          )}
        </div>

        {/* Player name */}
        <div style={{ padding: "18px 16px 4px" }}>
          <p style={{
            margin: 0,
            fontSize: "clamp(14px, 1.10vw, 20px)",
            fontWeight: 800,
            color: "#f0f0f0",
            lineHeight: 1.10,
            letterSpacing: "-0.025em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {p.playerName}
          </p>
          <p style={{
            margin: "4px 0 0",
            fontSize: "clamp(9px, 0.52vw, 11px)",
            color: "rgba(255,255,255,0.38)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {p.team}
          </p>
        </div>

        {/* Big projection number */}
        <div style={{ padding: "10px 16px 0", flexShrink: 0 }}>
          {pts != null ? (
            <>
              <span style={{
                display: "block",
                fontSize: "clamp(42px, 4.0vw, 72px)",
                fontWeight: 900,
                color: accent.color,
                lineHeight: 0.88,
                letterSpacing: "-0.050em",
                fontVariantNumeric: "tabular-nums",
                textShadow: `0 0 12px ${accent.color}40`,
              }}>
                {pts}
              </span>
              <span style={{
                display: "block",
                fontSize: "clamp(8px, 0.46vw, 10px)",
                color: "rgba(255,255,255,0.30)",
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginTop: 5,
              }}>
                Projected pts
              </span>
            </>
          ) : (
            <span style={{ fontSize: 28, color: "rgba(255,255,255,0.20)", fontWeight: 700 }}>—</span>
          )}
        </div>

        {/* Hairline divider */}
        <div style={{
          margin: "12px 16px 0",
          height: 1,
          background: `linear-gradient(to right, ${accent.color}30, transparent 80%)`,
          flexShrink: 0,
        }} />

        {/* Reason line */}
        <div style={{ padding: "8px 16px 10px", flex: 1, display: "flex", alignItems: "center" }}>
          <p style={{
            margin: 0,
            fontSize: "clamp(9px, 0.60vw, 12px)",
            color: "rgba(255,255,255,0.55)",
            fontWeight: 600,
            lineHeight: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
          }}>
            {p.reason}
          </p>
        </div>

        {/* CTA */}
        <div style={{ padding: "0 14px 18px", flexShrink: 0 }}>
          <div style={{
            height: 32,
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 5,
            background: `${accent.dim}45`,
            border: `1px solid ${accent.color}28`,
            color: accent.label,
            fontSize: "clamp(8px, 0.50vw, 10px)",
            fontWeight: 800,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            borderRadius: 7,
            transition: "all 0.20s ease",
          }}>
            {p.ctaLabel} <ChevronRight size={10} strokeWidth={2.5} />
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Skeleton card ──────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{
      height: "100%", minHeight: 240,
      borderRadius: 14,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.06)",
      animation: "pulse 1.8s ease-in-out infinite",
    }} />
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
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

// ── Hero CTA buttons with hover state ──────────────────────────────────────────
function HeroPrimaryBtn() {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to="/neeko-plus"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        background: "linear-gradient(160deg, #fad52a 0%, #e09600 100%)",
        color: "#130c00",
        fontWeight: 800, fontSize: "clamp(13px, 0.95vw, 16px)",
        padding: "13px 28px",
        borderRadius: 9,
        textDecoration: "none",
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
        boxShadow: hovered
          ? "0 12px 32px rgba(255,180,50,0.52), 0 4px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.32)"
          : "0 8px 26px rgba(255,180,50,0.36), 0 4px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.28)",
        transform: hovered ? "translateY(-2px) scale(1.01)" : "translateY(0)",
        transition: "all 0.25s ease",
      }}
    >
      Start Winning With Neeko+ <ArrowRight size={15} />
    </Link>
  );
}

function HeroSecondaryBtn() {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to="/sports/afl/rankings"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        background: hovered ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.08)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.15)",
        color: "rgba(255,255,255,0.82)",
        fontWeight: 600, fontSize: "clamp(13px, 0.95vw, 16px)",
        padding: "13px 28px",
        borderRadius: 9,
        textDecoration: "none",
        whiteSpace: "nowrap",
        transition: "all 0.25s ease",
      }}
    >
      View Free Rankings
    </Link>
  );
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
      const { data, error } = await supabase.rpc("get_rankings_safe", {
        p_user_id: null, p_is_bot: false, p_limit: 200,
      });
      if (error) console.error("Hero cards fetch error:", error);
      if (data) setPlayers((data as Record<string, unknown>[]).map(mapRankingRow));
      setLoading(false);
    })();
  }, []);

  // ── Classification ─────────────────────────────────────────────────────────
  const { mustBuyP, trapP, captainP, breakoutP, topRows, mwBuys, mwHolds, mwSells } = useMemo(() => {
    const mwInput: MWPlayerRow[] = players.map(toMWRow);
    const { buys, holds, sells } = classifyPlayers(mwInput);

    const allWithProjection = players.filter(p => p.projection != null && !p.is_injured && !p.is_bye);
    const byProjectionDesc = [...allWithProjection].sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0));

    const mustBuyP =
      allWithProjection.filter(p => ["STRONG_UP", "UP"].includes(p.signal_tag ?? "")).sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))[0]
      ?? allWithProjection.filter(p => (p.value_score ?? 0) > 0).sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0))[0]
      ?? byProjectionDesc[0]
      ?? null;

    const trapP =
      allWithProjection.filter(p => ["DOWN", "STRONG_DOWN"].includes(p.signal_tag ?? "")).sort((a, b) => (a.projection ?? 0) - (b.projection ?? 0))[0]
      ?? allWithProjection.filter(p => p.player_id !== mustBuyP?.player_id).sort((a, b) => (a.value_score ?? 0) - (b.value_score ?? 0))[0]
      ?? byProjectionDesc[byProjectionDesc.length - 1]
      ?? null;

    const usedIds1 = new Set([mustBuyP?.player_id, trapP?.player_id].filter(Boolean));
    const captainP =
      byProjectionDesc.filter(p => !usedIds1.has(p.player_id))[0]
      ?? byProjectionDesc[0]
      ?? null;

    const usedIds2 = new Set([mustBuyP?.player_id, trapP?.player_id, captainP?.player_id].filter(Boolean));
    const breakoutP =
      allWithProjection.filter(p => !usedIds2.has(p.player_id) && (p.trend_score ?? 0) > 0).sort((a, b) => (b.trend_score ?? 0) - (a.trend_score ?? 0))[0]
      ?? byProjectionDesc.filter(p => !usedIds2.has(p.player_id))[0]
      ?? byProjectionDesc[3]
      ?? null;

    const topRows = players
      .filter(p => p.projection != null)
      .sort((a, b) => (b.neeko_rating ?? b.projection ?? 0) - (a.neeko_rating ?? a.projection ?? 0))
      .slice(0, 12);

    return { mustBuyP, trapP, captainP, breakoutP, topRows, mwBuys: buys, mwHolds: holds, mwSells: sells };
  }, [players]);

  // ── Reason helpers ─────────────────────────────────────────────────────────
  const trapFallback = trapP ?? captainP;
  const breakoutFallback = breakoutP ?? captainP;

  function mustBuyReason(): string {
    if (!mustBuyP) return "";
    const be = mustBuyP.breakeven;
    const proj = mustBuyP.projection;
    if (be != null && proj != null && proj > be) return `+${Math.round(proj - be)} above breakeven — strong buy.`;
    if (mustBuyP.season_avg != null && proj != null && proj > mustBuyP.season_avg) return `+${Math.round(proj - mustBuyP.season_avg)} on season avg — buy now.`;
    return "Strong upside signal — buy this week.";
  }

  function trapReason(): string {
    if (!trapFallback) return "";
    const be = trapFallback.breakeven;
    const proj = trapFallback.projection;
    if (be != null && proj != null && proj < be) return "Scoring below breakeven — avoid this week.";
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
    if (price != null && price > 0 && proj != null && be != null && proj > be) return `+${Math.round(proj - be)} above breakeven — strong trade target.`;
    if (price != null && price > 0 && proj != null) return `Undervalued at $${(price / 1000).toFixed(0)}k — strong upside.`;
    return "Undervalued for projected output — trade now.";
  }

  const FREE_PREVIEW = 5;
  const allHeroReady = !loading && players.length > 0 && mustBuyP && captainP;
  const showSkeleton = loading || !allHeroReady;

  const cards: CardProps[] = allHeroReady ? [
    {
      label: "Must Buy", icon: <TrendingUp size={11} />, accentIdx: 0,
      playerName: mustBuyP!.player_name, team: mustBuyP!.team ?? "", position: mustBuyP!.position,
      projection: mustBuyP!.projection,
      reason: mustBuyReason(),
      ctaLabel: "View Must Buys", ctaTo: "/sports/afl/current-round",
    },
    {
      label: "Trap Alert", icon: <AlertTriangle size={11} />, accentIdx: 1,
      playerName: trapFallback!.player_name, team: trapFallback!.team ?? "", position: trapFallback!.position,
      projection: trapFallback!.projection,
      reason: trapReason(),
      ctaLabel: "See Trap Alerts", ctaTo: "/sports/afl/current-round",
    },
    {
      label: "Captain Pick", icon: <Star size={11} />, badge: "C", accentIdx: 2,
      playerName: captainP!.player_name, team: captainP!.team ?? "", position: captainP!.position,
      projection: captainP!.projection,
      reason: captainReason(),
      ctaLabel: "View Captains", ctaTo: "/sports/afl/captains",
    },
    {
      label: "Trade Target", icon: <ZapIcon size={11} />, accentIdx: 3,
      playerName: breakoutFallback!.player_name, team: breakoutFallback!.team ?? "", position: breakoutFallback!.position,
      projection: breakoutFallback!.projection,
      reason: tradeTargetReason(),
      ctaLabel: "Open Market Watch", ctaTo: "/sports/afl/market-watch",
    },
  ] : [];

  const mobileCards = cards.map(c => ({
    label: c.label, color: CARD_ACCENTS[c.accentIdx].color,
    playerName: c.playerName, team: c.team, position: c.position,
    projection: c.projection, reason: c.reason,
    ctaLabel: c.ctaLabel, ctaTo: c.ctaTo,
  }));

  const trustItems = [
    { icon: <Zap size={12} />,      text: "Updated before every round lockout" },
    { icon: <Database size={12} />, text: "600+ players ranked weekly" },
    { icon: <Clock size={12} />,    text: "Plan your week in 30 seconds" },
  ];

  const helmet = (
    <Helmet>
      <title>Neeko Sports Stats — AFL Fantasy Intelligence</title>
      <meta name="description" content="Stop guessing. Win your AFL Fantasy week in 30 seconds. Trade targets, trap warnings, and captain picks powered by 600+ player projections — updated before every lockout." />
      <link rel="canonical" href="https://neekostats.com.au/" />
      <meta property="og:title" content="Neeko Sports Stats — AFL Fantasy Intelligence" />
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
    <div style={{ background: DARK, overflowX: "hidden" }}>
      {helmet}

      {/* ═══════════════════════════════════════════════════
          HERO — full-viewport dark with image bg
      ═══════════════════════════════════════════════════ */}
      <section style={{
        position: "relative",
        minHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
      }}>
        {/* Layer 1 — background image, blurred and slightly dimmed */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "url('/images/Fantasy_sports_war_room_setup.png')",
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
          filter: "brightness(0.72) blur(5px)",
          transform: "scale(1.06)",
          zIndex: 0,
        }} />

        {/* Layer 2 — strong top-to-bottom darkening gradient */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.20) 40%, rgba(0,0,0,0.85) 100%)",
          zIndex: 1, pointerEvents: "none",
        }} />

        {/* Layer 3 — warm radial FOCUS LIGHT behind headline (not dark — light) */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(circle at 50% 38%, rgba(255,200,80,0.18) 0%, rgba(255,200,80,0.07) 28%, rgba(0,0,0,0.0) 62%)",
          zIndex: 2, pointerEvents: "none",
        }} />

        {/* Layer 4 — edge vignette to push focus to center */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.55) 100%)",
          zIndex: 3, pointerEvents: "none",
        }} />

        {/* Headline + CTA */}
        <div style={{
          position: "relative", zIndex: 10,
          width: "100%", maxWidth: 760,
          textAlign: "center",
          padding: "clamp(64px, 9vw, 116px) 24px 0",
        }}>
          {/* Eyebrow */}
          <p style={{
            fontSize: 11, fontWeight: 800,
            letterSpacing: "0.40em",
            textTransform: "uppercase",
            color: GOLD,
            marginBottom: 18,
            textShadow: "0 0 24px rgba(244,197,66,0.35)",
          }}>
            AFL Fantasy Intelligence
          </p>

          {/* H1 */}
          <h1 style={{
            margin: "0 0 20px",
            fontSize: "clamp(32px, 4.0vw, 60px)",
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            color: "#f5f5f5",
            textShadow: "0 3px 20px rgba(0,0,0,0.75), 0 1px 2px rgba(0,0,0,0.8)",
          }}>
            Stop Guessing.{" "}
            <span style={{ color: "#FFD03A", textShadow: "0 0 32px rgba(255,184,0,0.45), 0 2px 8px rgba(0,0,0,0.6)" }}>Start Winning</span>
            <br />AFL Fantasy.
          </h1>

          {/* Sub */}
          <p style={{
            margin: "0 0 30px",
            fontSize: "clamp(14px, 1.10vw, 18px)",
            color: "rgba(255,255,255,0.92)",
            lineHeight: 1.5,
            fontWeight: 500,
            textShadow: "0 2px 10px rgba(0,0,0,0.6)",
            maxWidth: 560,
            marginLeft: "auto",
            marginRight: "auto",
          }}>
            Projections, value signals, and matchup intelligence —<br />updated every round.
          </p>

          {/* CTAs — wrapped in glass container */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
            <div style={{
              display: "inline-flex", gap: 12, flexWrap: "wrap", justifyContent: "center",
              padding: "12px 16px",
              borderRadius: 14,
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06) inset",
            }}>
              <HeroPrimaryBtn />
              <HeroSecondaryBtn />
            </div>
          </div>

          {/* Trust row */}
          <div style={{
            display: "flex", justifyContent: "center", alignItems: "center",
            gap: "clamp(18px, 2.5vw, 22px)",
            flexWrap: "nowrap",
            opacity: 0.82,
          }}>
            {trustItems.map(({ icon, text }) => (
              <div key={text} style={{
                display: "flex", alignItems: "center", gap: 7,
                fontSize: "clamp(11px, 0.78vw, 13px)",
                color: "rgba(255,255,255,0.72)",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}>
                <span style={{
                  color: "rgba(244,197,66,0.85)",
                  filter: "drop-shadow(0 0 6px rgba(255,184,0,0.20))",
                  display: "flex",
                }}>{icon}</span>
                {text}
              </div>
            ))}
          </div>
        </div>

        {/* ── THIS WEEK'S EDGE — cards pulled up into hero ── */}
        <div style={{
          position: "relative", zIndex: 10,
          width: "100%",
          maxWidth: 1150,
          padding: "0 clamp(16px, 3vw, 32px)",
          marginTop: "clamp(24px, 2.8vw, 38px)",
          marginBottom: "-80px",
        }}>
          {/* Section header */}
          <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 900, letterSpacing: "0.42em", textTransform: "uppercase", color: "rgba(244,197,66,0.80)" }}>
                This Week's Edge
              </p>
              <h2 style={{ margin: "0 0 5px", fontSize: "clamp(16px, 1.5vw, 22px)", fontWeight: 900, color: "#f2f2f2", letterSpacing: "-0.025em", lineHeight: 1.15 }}>
                Real picks. Live projections. No guesswork.
              </h2>
              <p style={{ margin: 0, fontSize: "clamp(11px, 0.72vw, 12.5px)", color: "rgba(255,255,255,0.50)", fontWeight: 500, lineHeight: 1.4 }}>
                Powered by this week's projections, value signals, and matchup context.
              </p>
            </div>
            <Link to="/sports/afl/current-round" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: "rgba(244,197,66,0.75)", textDecoration: "none", whiteSpace: "nowrap", border: "1px solid rgba(244,197,66,0.22)", padding: "7px 14px", borderRadius: 7, background: "rgba(244,197,66,0.05)", flexShrink: 0, letterSpacing: "0.02em" }}>
              View All <ChevronRight size={12} />
            </Link>
          </div>

          {/* 4-column card grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            alignItems: "stretch",
          }}>
            {showSkeleton
              ? [0,1,2,3].map(i => (
                  <div key={i} style={{ minHeight: 260 }}>
                    <SkeletonCard />
                  </div>
                ))
              : cards.map(c => (
                  <div key={c.label} className="edge-card-enter" style={{ opacity: 0 }}>
                    <EdgeCard {...c} />
                  </div>
                ))
            }
          </div>
        </div>
        {/* Hero bottom fade — blends into page background */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: 200,
          background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(11,15,20,0.88) 78%, #0B0F14 100%)",
          zIndex: 5, pointerEvents: "none",
        }} />
      </section>

      {/* ── SPACER — lifts content below hero enough for card overlap ── */}
      <div style={{ height: 84, background: DARK }} />

      {/* ── GOLD DIVIDER ────────────────────────────────────────────── */}
      <div style={{ width: "100%", height: 1, background: "linear-gradient(to right, transparent, rgba(244,197,66,0.20) 20%, rgba(244,197,66,0.45) 50%, rgba(244,197,66,0.20) 80%, transparent)" }} />

      <LandingWorkflowSection />
      <LandingProductProof />
      <LandingSecondaryCTA />
      <LandingTopRankings loading={loading} rows={topRows} freePreview={FREE_PREVIEW} />
      <LandingToolsGrid />
      <LandingTrust />
      <LandingPricing />
      <LandingFinalCTA />

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <footer style={{ background: "#060708", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "22px clamp(16px, 4vw, 32px)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.12)" }}>
            © {new Date().getFullYear()} Neeko Sports Stats
          </p>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            {[
              { l: "Policies", t: "/policies" },
              { l: "Contact",  t: "/contact"  },
              { l: "About",    t: "/about"    },
              { l: "FAQ",      t: "/faq"      },
            ].map(x => (
              <Link key={x.t} to={x.t}
                style={{ fontSize: 11, color: "rgba(255,255,255,0.14)", textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.14)"; }}
              >
                {x.l}
              </Link>
            ))}
          </div>
        </div>
      </footer>

      {!isPremium && <MobileUpgradeBar />}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .edge-card-enter {
          animation: fadeUp 0.45s ease forwards;
        }
        .edge-card-enter:nth-child(1) { animation-delay: 0.05s; }
        .edge-card-enter:nth-child(2) { animation-delay: 0.12s; }
        .edge-card-enter:nth-child(3) { animation-delay: 0.19s; }
        .edge-card-enter:nth-child(4) { animation-delay: 0.26s; }
      `}</style>
    </div>
  );
}
