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
          border: `1px solid ${hovered ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: hovered
            ? `0 0 0 1px ${accent.dim}30, 0 14px 36px rgba(0,0,0,0.65), 0 4px 12px rgba(0,0,0,0.35)`
            : "0 2px 18px rgba(0,0,0,0.42), 0 1px 3px rgba(0,0,0,0.25)",
          transform: hovered ? "translateY(-4px) translateZ(0)" : "translateY(0) translateZ(0)",
          transition: "all 0.20s ease",
          willChange: "transform",
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
        <div style={{ padding: "14px 16px 4px" }}>
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
        <div style={{ padding: "8px 16px 0", flexShrink: 0 }}>
          {pts != null ? (
            <>
              <span style={{
                display: "block",
                fontSize: "clamp(38px, 3.6vw, 64px)",
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
        <div style={{ padding: "0 14px 16px", flexShrink: 0 }}>
          <div style={{
            height: 32,
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 5,
            background: hovered ? `${accent.dim}60` : `${accent.dim}42`,
            border: `1px solid ${hovered ? accent.color + "45" : accent.color + "25"}`,
            color: hovered ? accent.color : accent.label,
            fontSize: "clamp(8px, 0.50vw, 10px)",
            fontWeight: 800,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            borderRadius: 7,
            transition: "all 0.18s ease",
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
    <div
      className="skeleton-shimmer"
      style={{
        height: "100%", minHeight: 240,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    />
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
    const els = document.querySelectorAll<HTMLElement>(".scroll-reveal");
    if (!els.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const delay = el.dataset.revealDelay ?? "0";
            setTimeout(() => el.classList.add("revealed"), Number(delay));
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.10, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [loading]);

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
    return "Projected well above price — one of the best value plays this week.";
  }

  function trapReason(): string {
    if (!trapFallback) return "";
    return "Overpriced for this week — high risk of underperforming.";
  }

  function captainReason(): string {
    if (!captainP) return "";
    return "Top projected scorer this round — safest captain option.";
  }

  function tradeTargetReason(): string {
    if (!breakoutFallback) return "";
    return "Underpriced for current form — strong trade-in this week.";
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
        minHeight: "74vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
      }}>
        {/* Layer 1 — base dark gradient */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(circle at 50% 30%, rgba(255,200,0,0.08), transparent 60%), linear-gradient(to bottom, #050505, #000000)",
          zIndex: 0,
        }} />

        {/* Layer 2 — subtle gold glow */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(circle at 50% 32%, rgba(255,200,0,0.05), transparent 70%)",
          zIndex: 1, pointerEvents: "none",
        }} />

        {/* Headline + CTA */}
        <div style={{
          position: "relative", zIndex: 10,
          width: "100%", maxWidth: 760,
          textAlign: "center",
          padding: "clamp(56px, 7.5vw, 100px) 24px 0",
        }}>
          {/* Eyebrow */}
          <p className="hero-eyebrow" style={{
            fontSize: 10, fontWeight: 800,
            letterSpacing: "0.40em",
            textTransform: "uppercase",
            color: GOLD,
            marginBottom: 12,
            textShadow: "0 0 24px rgba(244,197,66,0.35)",
          }}>
            AFL Fantasy Intelligence
          </p>

          {/* H1 */}
          <h1 className="hero-h1" style={{
            margin: "0 0 14px",
            fontSize: "clamp(30px, 3.8vw, 58px)",
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
          <p className="hero-sub" style={{
            margin: "0 auto 22px",
            fontSize: "clamp(13px, 1.05vw, 17px)",
            color: "rgba(255,255,255,0.88)",
            lineHeight: 1.5,
            fontWeight: 500,
            textShadow: "0 2px 10px rgba(0,0,0,0.6)",
            maxWidth: 520,
          }}>
            Know who to trade, captain, and avoid — before lockout.
          </p>

          {/* CTAs — wrapped in glass container */}
          <div className="hero-ctas" style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
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

          {/* Micro-proof line */}
          <p style={{
            fontSize: 11, fontWeight: 600,
            color: "rgba(255,255,255,0.28)",
            letterSpacing: "0.03em",
            margin: "0 0 18px",
          }}>
            Used by serious AFL Fantasy coaches every week.
          </p>

          {/* Trust row */}
          <div className="hero-trust" style={{
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
          marginTop: "clamp(18px, 2.2vw, 30px)",
          marginBottom: "-80px",
        }}>
          {/* Section header */}
          <div style={{ marginBottom: 18, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: "0 0 5px", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em", textTransform: "uppercase", color: "rgba(244,197,66,0.82)" }}>
                This Week's Edge
              </p>
              <h2 style={{ margin: "0 0 4px", fontSize: "clamp(15px, 1.45vw, 21px)", fontWeight: 900, color: "#f4f4f4", letterSpacing: "-0.025em", lineHeight: 1.15 }}>
                The exact plays to win your week — backed by real projections.
              </h2>
              <p style={{ margin: 0, fontSize: "clamp(11px, 0.70vw, 12px)", color: "rgba(255,255,255,0.55)", fontWeight: 500, lineHeight: 1.4 }}>
                Every pick is based on this week's data, pricing, and matchups.
              </p>
            </div>
            <Link
              to="/sports/afl/current-round"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 11, fontWeight: 700,
                color: "rgba(244,197,66,0.72)",
                textDecoration: "none",
                whiteSpace: "nowrap",
                border: "1px solid rgba(244,197,66,0.20)",
                padding: "6px 12px",
                borderRadius: 7,
                background: "rgba(244,197,66,0.05)",
                flexShrink: 0,
                letterSpacing: "0.03em",
                marginTop: 3,
                transition: "all 0.15s ease",
              }}
            >
              View All <ChevronRight size={11} />
            </Link>
          </div>

          {/* 4-column card grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 14,
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
      <div style={{ height: 72, background: DARK }} />

      {/* ── GOLD DIVIDER ────────────────────────────────────────────── */}
      <div style={{ width: "100%", height: 1, background: "linear-gradient(to right, transparent, rgba(244,197,66,0.20) 20%, rgba(244,197,66,0.45) 50%, rgba(244,197,66,0.20) 80%, transparent)" }} />

      <div className="scroll-reveal" data-reveal-delay="0"><LandingWorkflowSection /></div>
      <div className="scroll-reveal" data-reveal-delay="50"><LandingProductProof rankingsPlayers={players} rankingsLoading={loading} /></div>
      <div className="scroll-reveal" data-reveal-delay="0"><LandingSecondaryCTA /></div>
      <div className="scroll-reveal" data-reveal-delay="0"><LandingTopRankings loading={loading} rows={topRows} freePreview={FREE_PREVIEW} /></div>
      <div className="scroll-reveal" data-reveal-delay="0"><LandingToolsGrid /></div>
      <div className="scroll-reveal" data-reveal-delay="0"><LandingTrust /></div>
      <div className="scroll-reveal" data-reveal-delay="0"><LandingPricing /></div>
      <div className="scroll-reveal" data-reveal-delay="0"><LandingFinalCTA /></div>

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
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes heroFadeUp {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes scrollReveal {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .edge-card-enter {
          animation: fadeUp 0.32s ease forwards;
        }
        .edge-card-enter:nth-child(1) { animation-delay: 0.04s; }
        .edge-card-enter:nth-child(2) { animation-delay: 0.10s; }
        .edge-card-enter:nth-child(3) { animation-delay: 0.16s; }
        .edge-card-enter:nth-child(4) { animation-delay: 0.22s; }

        .hero-eyebrow {
          opacity: 0;
          animation: heroFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.10s forwards;
        }
        .hero-h1 {
          opacity: 0;
          animation: heroFadeUp 0.60s cubic-bezier(0.22,1,0.36,1) 0.22s forwards;
        }
        .hero-sub {
          opacity: 0;
          animation: heroFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.34s forwards;
        }
        .hero-ctas {
          opacity: 0;
          animation: heroFadeUp 0.50s cubic-bezier(0.22,1,0.36,1) 0.46s forwards;
        }
        .hero-trust {
          opacity: 0;
          animation: heroFadeUp 0.45s cubic-bezier(0.22,1,0.36,1) 0.56s forwards;
        }

        .scroll-reveal {
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.30s cubic-bezier(0.22,1,0.36,1), transform 0.30s cubic-bezier(0.22,1,0.36,1);
          will-change: transform;
        }
        .scroll-reveal.revealed {
          opacity: 1;
          transform: translateY(0);
        }

        .skeleton-shimmer {
          background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
