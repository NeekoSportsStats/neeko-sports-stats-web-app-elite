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
import LandingTrust from "@/features/afl/landing/LandingTrust";
import LandingPricing from "@/features/afl/landing/LandingPricing";
import LandingFinalCTA from "@/features/afl/landing/LandingFinalCTA";
import LandingProductProof from "@/features/afl/landing/LandingProductProof";
import MobileLanding from "@/features/afl/landing/MobileLanding";

// ── Design tokens ───────────────────────────────────────────────────────────────
const DARK = "#05070A";
const GOLD = "#F4C542";

// ── Card accent colors ──────────────────────────────────────────────────────────
const CARD_ACCENTS = [
  { color: "#22c55e", dim: "#14532d", label: "#4ade80" },   // Must Buy — green
  { color: "#f87171", dim: "#7f1d1d", label: "#fca5a5" },   // Trap Alert — red
  { color: "#E0AE2D", dim: "#78480f", label: "#fcd34d" },   // Captain — gold
  { color: "#60a5fa", dim: "#1e3a8a", label: "#93c5fd" },   // Trade Target — blue
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
  seasonAvg?: number | null;
  confidenceLabel?: string | null;
  reason: string;
  ctaLabel: string;
  ctaTo: string;
  badge?: string;
};

// ── Edge Card — unified premium layout ─────────────────────────────────────────
function EdgeCard(p: CardProps) {
  const [hovered, setHovered] = useState(false);
  const accent = CARD_ACCENTS[p.accentIdx] ?? CARD_ACCENTS[0];
  const pts = p.projection != null ? Math.round(p.projection) : null;
  const avg = p.seasonAvg != null ? Math.round(p.seasonAvg) : null;
  const vsAvgDiff = pts != null && avg != null ? pts - avg : null;
  const vsAvgStr = vsAvgDiff != null
    ? (vsAvgDiff >= 0 ? `+${vsAvgDiff}` : `${vsAvgDiff}`) + " vs avg"
    : null;

  return (
    <Link to={p.ctaTo} style={{ textDecoration: "none", display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "rgba(10, 12, 16, 0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${hovered ? accent.color + "38" : "rgba(255,255,255,0.06)"}`,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: hovered
            ? `0 20px 48px rgba(0,0,0,0.65), 0 0 0 1px ${accent.color}28, 0 0 28px ${accent.color}10`
            : "0 4px 20px rgba(0,0,0,0.40)",
          transform: hovered ? "translateY(-4px) translateZ(0)" : "translateY(0) translateZ(0)",
          transition: "transform 0.20s ease, box-shadow 0.20s ease, border-color 0.18s ease",
          willChange: "transform",
        }}
      >
        {/* 1 — Top accent bar */}
        <div style={{
          height: 2,
          background: accent.color,
          opacity: hovered ? 0.9 : 0.7,
          flexShrink: 0,
          transition: "opacity 0.18s ease",
        }} />

        {/* 2 — Label row */}
        <div style={{
          padding: "10px 18px 9px",
          display: "flex", alignItems: "center", gap: 7,
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          flexShrink: 0,
        }}>
          <span style={{ color: accent.label, display: "flex", alignItems: "center", flexShrink: 0, opacity: 0.9 }}>
            {p.icon}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 800,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: accent.label,
            opacity: 0.85,
            flex: 1,
          }}>
            {p.label}
          </span>
          {p.position && (
            <span style={{
              fontSize: 8, fontWeight: 700,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.35)",
              background: "rgba(255,255,255,0.06)",
              padding: "2px 7px",
              borderRadius: 4,
              letterSpacing: "0.06em",
              flexShrink: 0,
            }}>
              {p.position}
            </span>
          )}
          {p.badge && (
            <span style={{
              fontSize: 9, fontWeight: 900,
              background: accent.color,
              color: "#000",
              padding: "2px 7px",
              borderRadius: 4,
              letterSpacing: "0.04em",
              flexShrink: 0,
              opacity: 0.9,
            }}>
              {p.badge}
            </span>
          )}
          {/* Live indicator */}
          <span style={{
            display: "flex", alignItems: "center", gap: 4,
            fontSize: 8, fontWeight: 700, letterSpacing: "0.12em",
            color: "#22c55e",
            flexShrink: 0,
          }}>
            <span className="live-dot" style={{
              width: 5, height: 5, borderRadius: "50%",
              background: "#22c55e",
              display: "inline-block",
              flexShrink: 0,
            }} />
            LIVE
          </span>
        </div>

        {/* 3 — Player name + team */}
        <div style={{ padding: "13px 18px 0", flexShrink: 0 }}>
          <p style={{
            margin: 0,
            fontSize: 17,
            fontWeight: 700,
            color: "#ededed",
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {p.playerName}
          </p>
          <p style={{
            margin: "3px 0 0",
            fontSize: 10,
            color: "rgba(255,255,255,0.32)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {p.team}
          </p>
        </div>

        {/* 4 — Projection number + vs avg */}
        <div style={{ padding: "11px 18px 0", flexShrink: 0 }}>
          {pts != null ? (
            <>
              <span style={{
                display: "block",
                fontSize: 50,
                fontWeight: 800,
                color: accent.color,
                lineHeight: 0.90,
                letterSpacing: "-0.04em",
                fontVariantNumeric: "tabular-nums",
              }}>
                {pts}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5 }}>
                <span style={{
                  fontSize: 8.5,
                  color: "rgba(255,255,255,0.25)",
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}>
                  Projected pts
                </span>
                {vsAvgStr != null && (
                  <span style={{
                    fontSize: 9, fontWeight: 700,
                    color: vsAvgDiff! >= 0 ? "#4ade80" : "#f87171",
                    background: vsAvgDiff! >= 0 ? "rgba(74,222,128,0.10)" : "rgba(248,113,113,0.10)",
                    padding: "1px 6px",
                    borderRadius: 4,
                    letterSpacing: "0.04em",
                  }}>
                    {vsAvgStr}
                  </span>
                )}
              </div>
            </>
          ) : (
            <span style={{ fontSize: 28, color: "rgba(255,255,255,0.18)", fontWeight: 700 }}>—</span>
          )}
        </div>

        {/* 4b — Confidence signal */}
        {p.confidenceLabel && (
          <div style={{ padding: "6px 18px 0", flexShrink: 0 }}>
            <span style={{
              fontSize: 9, fontWeight: 700,
              color: p.confidenceLabel === "High" ? "#22c55e" : p.confidenceLabel === "Medium" ? GOLD : "rgba(255,255,255,0.40)",
              background: p.confidenceLabel === "High" ? "rgba(34,197,94,0.10)" : p.confidenceLabel === "Medium" ? "rgba(244,197,66,0.10)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${p.confidenceLabel === "High" ? "rgba(34,197,94,0.22)" : p.confidenceLabel === "Medium" ? "rgba(244,197,66,0.22)" : "rgba(255,255,255,0.08)"}`,
              padding: "2px 9px",
              borderRadius: 999,
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
            }}>
              {p.confidenceLabel} Confidence
            </span>
          </div>
        )}

        {/* 5 — Hairline */}
        <div style={{
          margin: "11px 18px 0",
          height: 1,
          background: "rgba(255,255,255,0.05)",
          flexShrink: 0,
        }} />

        {/* 6 — Insight copy — grows to fill remaining space */}
        <div style={{ padding: "9px 18px 0", flex: 1, display: "flex", alignItems: "flex-start" }}>
          <p style={{
            margin: 0,
            fontSize: 12,
            color: "rgba(255,255,255,0.45)",
            fontWeight: 400,
            lineHeight: 1.55,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          } as React.CSSProperties}>
            {p.reason}
          </p>
        </div>

        {/* 7 — CTA — always pinned to bottom */}
        <div style={{ padding: "12px 18px 18px", flexShrink: 0 }}>
          <div style={{
            height: 34,
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 5,
            background: hovered ? `${accent.color}18` : "rgba(255,255,255,0.04)",
            border: `1px solid ${hovered ? accent.color + "40" : "rgba(255,255,255,0.08)"}`,
            color: hovered ? accent.label : "rgba(255,255,255,0.55)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            borderRadius: 8,
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
        height: "100%", minHeight: 320,
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
  const [currentRound, setCurrentRound] = useState<number | null>(null);

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
      const [rankingsRes, roundRes] = await Promise.all([
        supabase.rpc("get_rankings_safe", { p_user_id: null, p_is_bot: false, p_limit: 200 }),
        supabase.rpc("get_latest_completed_round"),
      ]);
      if (rankingsRes.error) console.error("Hero cards fetch error:", rankingsRes.error);
      if (rankingsRes.data) setPlayers((rankingsRes.data as Record<string, unknown>[]).map(mapRankingRow));
      if (roundRes.data != null) setCurrentRound(roundRes.data as number);
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

  // ── Confidence label helper ─────────────────────────────────────────────────
  function confidenceOf(p: RankingRow | null): string | null {
    if (!p) return null;
    const conf = p.projection_confidence ?? null;
    if (conf == null) return null;
    if (conf >= 70) return "High";
    if (conf >= 45) return "Medium";
    return "Low";
  }

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
      seasonAvg: mustBuyP!.last_5_avg ?? mustBuyP!.season_avg ?? null,
      confidenceLabel: confidenceOf(mustBuyP),
      reason: mustBuyReason(),
      ctaLabel: "View Must Buys", ctaTo: "/sports/afl/current-round",
    },
    {
      label: "Trap Alert", icon: <AlertTriangle size={11} />, accentIdx: 1,
      playerName: trapFallback!.player_name, team: trapFallback!.team ?? "", position: trapFallback!.position,
      projection: trapFallback!.projection,
      seasonAvg: trapFallback!.last_5_avg ?? trapFallback!.season_avg ?? null,
      confidenceLabel: confidenceOf(trapFallback),
      reason: trapReason(),
      ctaLabel: "See Trap Alerts", ctaTo: "/sports/afl/current-round",
    },
    {
      label: "Captain Pick", icon: <Star size={11} />, badge: "C", accentIdx: 2,
      playerName: captainP!.player_name, team: captainP!.team ?? "", position: captainP!.position,
      projection: captainP!.projection,
      seasonAvg: captainP!.last_5_avg ?? captainP!.season_avg ?? null,
      confidenceLabel: confidenceOf(captainP),
      reason: captainReason(),
      ctaLabel: "View Captains", ctaTo: "/sports/afl/captains",
    },
    {
      label: "Trade Target", icon: <ZapIcon size={11} />, accentIdx: 3,
      playerName: breakoutFallback!.player_name, team: breakoutFallback!.team ?? "", position: breakoutFallback!.position,
      projection: breakoutFallback!.projection,
      seasonAvg: breakoutFallback!.last_5_avg ?? breakoutFallback!.season_avg ?? null,
      confidenceLabel: confidenceOf(breakoutFallback),
      reason: tradeTargetReason(),
      ctaLabel: "Open Market Watch", ctaTo: "/sports/afl/market-watch",
    },
  ] : [];

  const mobileCards = cards.map(c => ({
    label: c.label, color: CARD_ACCENTS[c.accentIdx].color,
    playerName: c.playerName, team: c.team, position: c.position,
    projection: c.projection,
    seasonAvg: c.seasonAvg ?? null,
    confidenceLabel: c.confidenceLabel ?? null,
    reason: c.reason,
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
          HERO — true full-viewport first screen
      ═══════════════════════════════════════════════════ */}
      <section style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {/* Layer 1 — background image */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "url('/images/Fantasy_sports_war_room_setup.png')",
          backgroundSize: "cover",
          backgroundPosition: "center 30%",
          backgroundRepeat: "no-repeat",
          filter: "brightness(0.92) contrast(1.05)",
          zIndex: 0,
        }} />

        {/* Layer 2 — light directional overlay, NOT a full darken */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.45) 75%, #0B0F14 100%)",
          zIndex: 1,
        }} />

        {/* Layer 3 — localized text-area shadow (centered, soft) */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 65% 55% at 50% 48%, rgba(0,0,0,0.30) 0%, transparent 100%)",
          zIndex: 2, pointerEvents: "none",
        }} />

        {/* Layer 4 — faint gold brand glow */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 60% 45% at 50% 42%, rgba(255,200,0,0.08), transparent 70%)",
          zIndex: 3, pointerEvents: "none",
        }} />

        {/* Hero content block */}
        <div style={{
          position: "relative", zIndex: 20,
          width: "100%", maxWidth: 780,
          textAlign: "center",
          padding: "0 clamp(20px, 5vw, 40px)",
        }}>
          {/* Eyebrow */}
          <p className="hero-eyebrow" style={{
            fontSize: 10, fontWeight: 800,
            letterSpacing: "0.40em",
            textTransform: "uppercase",
            color: GOLD,
            marginBottom: 20,
            textShadow: "0 0 24px rgba(244,197,66,0.35)",
          }}>
            AFL Fantasy Intelligence
          </p>

          {/* H1 */}
          <h1 className="hero-h1" style={{
            margin: "0 0 24px",
            fontSize: "clamp(34px, 4.2vw, 64px)",
            fontWeight: 900,
            lineHeight: 1.07,
            letterSpacing: "-0.03em",
            color: "#f5f5f5",
            textShadow: "0 2px 12px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.5)",
          }}>
            Stop Guessing.{" "}
            <span style={{ color: "#FFD03A", textShadow: "0 0 32px rgba(255,184,0,0.45), 0 2px 8px rgba(0,0,0,0.6)" }}>Start Winning</span>
            <br />AFL Fantasy.
          </h1>

          {/* Sub */}
          <p className="hero-sub" style={{
            margin: "0 auto 36px",
            fontSize: "clamp(14px, 1.10vw, 18px)",
            color: "rgba(255,255,255,0.88)",
            lineHeight: 1.6,
            fontWeight: 500,
            textShadow: "0 2px 8px rgba(0,0,0,0.40)",
            maxWidth: 500,
          }}>
            Know who to trade, captain, and avoid — before lockout. Powered by 600+ player projections updated every round.
          </p>

          {/* CTAs */}
          <div className="hero-ctas" style={{ display: "flex", justifyContent: "center", marginBottom: 36 }}>
            <div style={{
              display: "inline-flex", gap: 12, flexWrap: "wrap", justifyContent: "center",
              padding: "14px 18px",
              borderRadius: 16,
              background: "rgba(0,0,0,0.22)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.30), 0 0 0 1px rgba(255,255,255,0.08) inset",
            }}>
              <HeroPrimaryBtn />
              <HeroSecondaryBtn />
            </div>
          </div>

          {/* Trust row */}
          <div className="hero-trust" style={{
            display: "flex", justifyContent: "center", alignItems: "center",
            gap: "clamp(16px, 2.5vw, 28px)",
            flexWrap: "wrap",
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
                  color: "rgba(244,197,66,0.80)",
                  filter: "drop-shadow(0 0 6px rgba(255,184,0,0.20))",
                  display: "flex",
                }}>{icon}</span>
                {text}
              </div>
            ))}
          </div>
        </div>

        {/* Hero bottom fade — blends into next section */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: 200,
          background: "linear-gradient(to bottom, transparent 0%, #05070A 100%)",
          zIndex: 15, pointerEvents: "none",
        }} />

        {/* Scroll hint */}
        <div style={{
          position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)",
          zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          opacity: 0.35,
        }}>
          <div style={{ width: 1, height: 32, background: "linear-gradient(to bottom, rgba(244,197,66,0.8), transparent)" }} />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          THIS WEEK'S EDGE — own section below the fold
      ═══════════════════════════════════════════════════ */}
      <section style={{
        background: "#05070A",
        backgroundImage: "radial-gradient(circle at 50% 0%, rgba(255,180,50,0.06), transparent 60%)",
        padding: "clamp(36px, 3vw, 48px) clamp(20px, 5vw, 40px) clamp(80px, 7vw, 120px)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* Section header */}
          <div style={{ marginBottom: 32, textAlign: "center" }}>
            <p style={{ margin: "0 0 6px", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em", textTransform: "uppercase", color: "rgba(244,197,66,0.82)" }}>
              This Week's Edge{currentRound != null ? ` — Round ${currentRound + 1} Picks` : ""}
            </p>
            <h2 style={{ margin: "0 0 8px", fontSize: "clamp(16px, 1.5vw, 22px)", fontWeight: 900, color: "#f4f4f4", letterSpacing: "-0.025em", lineHeight: 1.15 }}>
              The exact plays to win your week — backed by real projections.
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: "clamp(11px, 0.72vw, 13px)", color: "rgba(255,255,255,0.45)", fontWeight: 500, lineHeight: 1.4 }}>
              Every pick is based on this week's data, pricing, and matchups.
            </p>
            <Link
              to="/sports/afl/current-round"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 11, fontWeight: 700,
                color: "rgba(244,197,66,0.72)",
                textDecoration: "none",
                whiteSpace: "nowrap",
                border: "1px solid rgba(244,197,66,0.20)",
                padding: "7px 14px",
                borderRadius: 8,
                background: "rgba(244,197,66,0.05)",
                letterSpacing: "0.03em",
                transition: "all 0.15s ease",
              }}
            >
              View All <ChevronRight size={11} />
            </Link>
          </div>

          {/* 4-column card grid */}
          <div
            className="edge-cards-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 16,
              alignItems: "stretch",
              gridAutoRows: "1fr",
            }}
          >
            {showSkeleton
              ? [0,1,2,3].map(i => (
                  <div key={i} style={{ minHeight: 320 }}>
                    <SkeletonCard />
                  </div>
                ))
              : cards.map(c => (
                  <div key={c.label} className="edge-card-enter" style={{ opacity: 0, display: "flex", flexDirection: "column" }}>
                    <EdgeCard {...c} />
                  </div>
                ))
            }
          </div>
        </div>
      </section>

      <div className="scroll-reveal" data-reveal-delay="0"><LandingProductProof rankingsPlayers={players} rankingsLoading={loading} isPremium={isPremium} /></div>
      <div className="scroll-reveal" data-reveal-delay="50"><LandingTopRankings loading={loading} rows={topRows} freePreview={FREE_PREVIEW} /></div>
      <div className="scroll-reveal" data-reveal-delay="0"><LandingWorkflowSection /></div>
      <div className="scroll-reveal" data-reveal-delay="0"><LandingTrust /></div>
      <div className="scroll-reveal" data-reveal-delay="0"><LandingPricing /></div>
      <div className="scroll-reveal" data-reveal-delay="0"><LandingFinalCTA /></div>

      {!isPremium && <MobileUpgradeBar />}

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
        .live-dot {
          animation: livePulse 1.8s ease-in-out infinite;
        }
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

        /* ── Tablet responsive (768–900px) ── */
        @media (max-width: 900px) {
          .hero-ctas > div {
            flex-direction: column !important;
            align-items: stretch !important;
            width: 100% !important;
            max-width: 380px;
          }
          .hero-ctas a {
            justify-content: center;
          }
          .edge-cards-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .workflow-grid {
            grid-template-columns: 1fr !important;
          }
          .pricing-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
