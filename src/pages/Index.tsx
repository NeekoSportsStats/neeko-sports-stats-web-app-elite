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
const STICKY_PAPERS: Record<number, { bg: string; lines: string; headerBorder: string }> = {
  0: { bg: "#edf5eb", lines: "rgba(30,100,44,0.06)",   headerBorder: "rgba(30,100,44,0.18)" },
  1: { bg: "#f7eded", lines: "rgba(130,30,30,0.06)",   headerBorder: "rgba(130,30,30,0.18)" },
  2: { bg: "#f7f3e4", lines: "rgba(140,110,0,0.06)",   headerBorder: "rgba(140,110,0,0.18)" },
  3: { bg: "#eaeff8", lines: "rgba(20,70,148,0.06)",   headerBorder: "rgba(20,70,148,0.18)" },
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
      width: "2.6vw", height: "2.6vw", minWidth: 22, minHeight: 22,
      borderRadius: "50%", flexShrink: 0,
      background: `${color}1a`, border: `1.5px solid ${color}38`,
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", position: "relative",
    }}>
      <div style={{ position: "absolute", bottom: -2, left: "50%", transform: "translateX(-50%)", width: "55%", height: "65%", background: `${color}28`, borderRadius: "50% 50% 0 0" }} />
      <div style={{ position: "absolute", top: "15%", left: "50%", transform: "translateX(-50%)", width: "36%", height: "36%", borderRadius: "50%", background: `${color}44` }} />
      <span style={{ position: "relative", zIndex: 1, fontSize: "0.55vw", fontWeight: 900, color, letterSpacing: "-0.02em", marginTop: "25%" }}>{initials}</span>
    </div>
  );
}

function StickyPin({ color }: { color: string }) {
  return (
    <div style={{ position: "absolute", top: "-0.7vw", left: "50%", transform: "translateX(-50%)", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>
      <div style={{ width: "0.9vw", height: "0.9vw", minWidth: 8, minHeight: 8, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.6) 0%, ${color} 50%, rgba(0,0,0,0.25) 100%)`, border: "1px solid rgba(0,0,0,0.22)" }} />
      <div style={{ width: 2, height: "0.5vw", minHeight: 4, background: "linear-gradient(to bottom, rgba(110,90,70,0.9), rgba(50,40,30,0.55))", marginTop: -1 }} />
    </div>
  );
}

function WhiteboardCard(p: CardProps) {
  const [hovered, setHovered] = useState(false);
  const pts = p.projection != null ? Math.round(p.projection) : null;
  const rotation = CARD_ROTATIONS[p.index ?? 0] ?? -1.8;
  const paper    = STICKY_PAPERS[p.index ?? 0] ?? STICKY_PAPERS[0];

  return (
    <Link to={p.ctaTo} style={{ textDecoration: "none", display: "block", paddingTop: "1vw" }}>
      <div style={{ position: "relative" }}>
        <StickyPin color={p.color} />
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            background: paper.bg,
            backgroundImage: `repeating-linear-gradient(transparent, transparent 1.1vw, ${paper.lines} 1.1vw, ${paper.lines} calc(1.1vw + 1px))`,
            borderRadius: 2, border: "1px solid rgba(0,0,0,0.10)",
            boxShadow: hovered
              ? "0 4px 8px rgba(0,0,0,0.28), 0 12px 28px rgba(0,0,0,0.30), 0 24px 50px rgba(0,0,0,0.20)"
              : "0 2px 5px rgba(0,0,0,0.18), 0 6px 18px rgba(0,0,0,0.22), 0 14px 32px rgba(0,0,0,0.18)",
            transform: hovered ? `rotate(${rotation}deg) translateY(-0.6vw) scale(1.03)` : `rotate(${rotation}deg) translateY(0)`,
            transition: "all 0.22s ease", overflow: "visible", position: "relative",
          }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: "linear-gradient(to bottom, rgba(255,255,255,0.55), transparent)", borderRadius: "2px 2px 0 0", pointerEvents: "none" }} />

          {/* Category label */}
          <div style={{ borderBottom: `1px solid ${paper.headerBorder}`, padding: "0.65vw 0.9vw 0.5vw", display: "flex", alignItems: "center", gap: "0.4vw" }}>
            <span style={{ color: p.color, display: "flex", alignItems: "center", flexShrink: 0 }}>{p.icon}</span>
            <span style={{ fontSize: "0.52vw", fontWeight: 900, letterSpacing: "0.26em", textTransform: "uppercase", color: p.color, flex: 1 }}>{p.label}</span>
            {p.position && (
              <span style={{ fontSize: "0.48vw", fontWeight: 800, textTransform: "uppercase", background: `${p.color}16`, color: p.color, padding: "0.12vw 0.32vw", borderRadius: 3, border: `1px solid ${p.color}25` }}>{p.position}</span>
            )}
            {p.badge && (
              <span style={{ fontSize: "0.48vw", fontWeight: 900, textTransform: "uppercase", background: p.color, color: "#fff", padding: "0.12vw 0.38vw", borderRadius: 3 }}>{p.badge}</span>
            )}
          </div>

          {/* Player name + team */}
          <div style={{ padding: "0.75vw 0.9vw 0.2vw", display: "flex", alignItems: "center", gap: "0.55vw" }}>
            <PlayerAvatar name={p.playerName} color={p.color} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "1.0vw", fontWeight: 900, color: "#1c1208", lineHeight: 1.15, letterSpacing: "-0.025em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.playerName}</p>
              <p style={{ fontSize: "0.6vw", color: "#7a6050", marginTop: "0.1vw", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.team}</p>
            </div>
          </div>

          {/* Main stat */}
          <div style={{ padding: "0.1vw 0.9vw 0.3vw", display: "flex", alignItems: "baseline", gap: "0.3vw" }}>
            {pts != null ? (
              <>
                <span style={{ fontSize: "2.5vw", fontWeight: 900, color: p.color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{pts}</span>
                <span style={{ fontSize: "0.62vw", color: "#a08060", fontWeight: 700 }}>proj pts</span>
              </>
            ) : (
              <span style={{ fontSize: "1.1vw", color: "#bbb", fontWeight: 700 }}>—</span>
            )}
          </div>

          {/* Reason line */}
          <div style={{ padding: "0.25vw 0.9vw 0.75vw" }}>
            <p style={{ fontSize: "0.55vw", color: "#4a3828", fontWeight: 600, lineHeight: 1.5, margin: 0, fontStyle: "italic" }}>{p.reason}</p>
          </div>

          {/* CTA */}
          <div style={{ padding: "0 0.8vw 0.9vw" }}>
            <div style={{ background: `linear-gradient(to bottom, ${p.color}ee, ${p.color})`, color: "#fff", fontSize: "0.52vw", fontWeight: 800, textAlign: "center", padding: "0.55vw 0.7vw", borderRadius: 4, letterSpacing: "0.07em", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 6px rgba(0,0,0,0.28)", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3vw" }}>
              {p.ctaLabel} <ChevronRight size={9} />
            </div>
          </div>

          <div style={{ position: "absolute", bottom: -2, right: 6, width: "38%", height: 5, boxShadow: "4px 5px 9px rgba(0,0,0,0.20)", borderRadius: "0 0 50% 50%", transform: "rotate(1.5deg)", pointerEvents: "none" }} />
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return <div style={{ paddingBottom: "130%", borderRadius: 4, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.08)" }} />;
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
      const { data, error } = await supabase.rpc("get_rankings_safe", {
        p_user_id: null, p_is_bot: false, p_limit: 200,
      });
      if (!error && data) setPlayers((data as Record<string, unknown>[]).map(mapRankingRow));
      setLoading(false);
    })();
  }, []);

  // ── All classification via canonical engine ────────────────────────────────
  const { mustBuyP, trapP, captainP, breakoutP, topRows, mwBuys, mwHolds, mwSells } = useMemo(() => {
    const mwInput: MWPlayerRow[] = players.map(toMWRow);
    const { buys, holds, sells } = classifyPlayers(mwInput);

    // Signal-tag based selections
    const allWithProjection = players.filter(p => p.projection != null && !p.is_injured && !p.is_bye);

    // Must Buy: signal_tag STRONG_UP or UP, highest projection
    const mustBuyP = allWithProjection
      .filter(p => ["STRONG_UP", "UP"].includes(p.signal_tag ?? ""))
      .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))[0] ?? null;

    // Trap Alert: signal_tag DOWN or STRONG_DOWN, lowest projection
    const trapP = allWithProjection
      .filter(p => ["DOWN", "STRONG_DOWN"].includes(p.signal_tag ?? ""))
      .sort((a, b) => (a.projection ?? 0) - (b.projection ?? 0))[0] ?? null;

    // Captain Pick: highest projection among non-mustBuy players
    const captainP = allWithProjection
      .filter(p => p.player_id !== mustBuyP?.player_id)
      .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))[0] ?? null;

    // Breakout Pick: positive trend_score, highest trend_score, different from above
    const usedIds = new Set([mustBuyP?.player_id, trapP?.player_id, captainP?.player_id].filter(Boolean));
    const breakoutP = allWithProjection
      .filter(p => !usedIds.has(p.player_id) && (p.trend_score ?? 0) > 0)
      .sort((a, b) => (b.trend_score ?? 0) - (a.trend_score ?? 0))[0] ?? null;

    // Rankings preview — top 12 sorted by neeko_rating
    const topRows = players
      .filter(p => p.projection != null)
      .sort((a, b) => (b.neeko_rating ?? b.projection ?? 0) - (a.neeko_rating ?? a.projection ?? 0))
      .slice(0, 12);

    return { mustBuyP, trapP, captainP, breakoutP, topRows, mwBuys: buys, mwHolds: holds, mwSells: sells };
  }, [players]);

  // ── Hero card reason derivation — one clean sentence per card ────────────
  function mustBuyReason(): string {
    if (!mustBuyP) return "";
    if (mustBuyP.why) return mustBuyP.why;
    if (mustBuyP.season_avg != null && mustBuyP.projection != null && mustBuyP.projection > mustBuyP.season_avg) {
      return `Projecting ${Math.round(mustBuyP.projection - mustBuyP.season_avg)}pts above season average this round.`;
    }
    return "Strong upward signal — positive edge this week.";
  }

  function trapReason(): string {
    if (!trapP) return "";
    if (trapP.why) return trapP.why;
    if (trapP.breakeven != null && trapP.projection != null && trapP.projection < trapP.breakeven) {
      return "Scoring below breakeven — price drop risk this round.";
    }
    return "Negative edge signal — risky play this week.";
  }

  function captainReason(): string {
    if (!captainP) return "";
    if (captainP.why) return captainP.why;
    return "Top captain projection this week.";
  }

  function breakoutReason(): string {
    if (!breakoutP) return "";
    if (breakoutP.why) return breakoutP.why;
    return "Trending up with strong breakout potential this round.";
  }

  const FREE_PREVIEW = 5;

  const trustBar = [
    { icon: <Zap size={11} />,      text: "Updated before every round lockout" },
    { icon: <Database size={11} />, text: "Built from real AFL Fantasy data" },
    { icon: <Clock size={11} />,    text: "Takes 30 seconds to plan your week" },
  ];

  const allHeroReady = mustBuyP && trapP && captainP && breakoutP;

  const cards: CardProps[] = !loading && allHeroReady ? [
    {
      label: "Must Buy", icon: <TrendingUp size={9} />,
      color: "#1a6028",
      playerName: mustBuyP.player_name, team: mustBuyP.team ?? "", position: mustBuyP.position,
      projection: mustBuyP.projection,
      reason: mustBuyReason(),
      ctaLabel: "View Must Buys", ctaTo: "/sports/afl/current-round", index: 0,
    },
    {
      label: "Trap Alert", icon: <AlertTriangle size={9} />,
      color: "#881818",
      playerName: trapP.player_name, team: trapP.team ?? "", position: trapP.position,
      projection: trapP.projection,
      reason: trapReason(),
      ctaLabel: "See Trap Alerts", ctaTo: "/sports/afl/current-round", index: 1,
    },
    {
      label: "Captain Pick", icon: <Star size={9} />, badge: "C",
      color: "#7a4800",
      playerName: captainP.player_name, team: captainP.team ?? "", position: captainP.position,
      projection: captainP.projection,
      reason: captainReason(),
      ctaLabel: "View Captains", ctaTo: "/sports/afl/captains", index: 2,
    },
    {
      label: "Breakout Pick", icon: <ZapIcon size={9} />,
      color: "#0d4278",
      playerName: breakoutP.player_name, team: breakoutP.team ?? "", position: breakoutP.position,
      projection: breakoutP.projection,
      reason: breakoutReason(),
      ctaLabel: "Explore Rankings", ctaTo: "/sports/afl/rankings", index: 3,
    },
  ] : [];

  const showSkeleton = loading || (!loading && !allHeroReady);

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
          paddingTop: "8%",
          paddingLeft: "3vw",
          paddingRight: "3vw",
        }}>
          {/* Eyebrow */}
          <p style={{ fontSize: "0.6vw", fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(245,196,81,0.70)", marginBottom: "1%", textAlign: "center", textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
            AFL Fantasy Intelligence
          </p>

          {/* Headline block */}
          <div style={{ width: "58%", textAlign: "center" }}>
            <h1 style={{ margin: 0, fontSize: "3.5vw", fontWeight: 900, lineHeight: 1.08, letterSpacing: "-0.025em", color: "#f5f5f5", textShadow: "0 2px 4px rgba(0,0,0,0.70), 0 8px 22px rgba(0,0,0,0.50)" }}>
              Stop Guessing. <span style={{ color: C.gold }}>Start Winning</span>
              <br />Your AFL Fantasy Week.
            </h1>
            <p style={{ marginTop: "1%", marginBottom: 0, fontSize: "1.1vw", color: "#ffffff", lineHeight: 1.6, textShadow: "0 1px 8px rgba(0,0,0,0.95)", fontWeight: 600 }}>
              Trades, captains, and traps — powered by 600+ player projections updated every round.
            </p>
          </div>

          {/* CTA buttons */}
          <div style={{ display: "flex", gap: "1%", justifyContent: "center", marginTop: "1.8%", marginBottom: "0.8%", flexWrap: "nowrap" }}>
            <Link to="/auth" style={{ display: "flex", alignItems: "center", gap: "0.5vw", background: "linear-gradient(to bottom, #fad52a, #d09800)", color: "#1a1000", fontWeight: 800, fontSize: "1vw", padding: "0.8vw 2vw", borderRadius: 7, textDecoration: "none", border: "1px solid rgba(0,0,0,0.20)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.42), 0 2px 0 rgba(0,0,0,0.32), 0 6px 20px rgba(0,0,0,0.35)", letterSpacing: "0.01em", whiteSpace: "nowrap" }}>
              Get This Week's Game Plan <ArrowRight size="1.1vw" />
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
          bottom: "10%",
          left: 0, right: 0,
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingLeft: "3vw",
          paddingRight: "3vw",
        }}>
          {/* Round label */}
          <div style={{ marginBottom: "1.1%", width: "65vw", display: "flex", alignItems: "center", gap: "1vw" }}>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(255,255,255,0.28))" }} />
            <span style={{ fontSize: "0.78vw", fontWeight: 900, letterSpacing: "0.32em", textTransform: "uppercase", color: C.gold, whiteSpace: "nowrap", textShadow: "0 1px 6px rgba(0,0,0,0.65)" }}>Round 6</span>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(255,255,255,0.28))" }} />
          </div>

          {/* Cards row */}
          <div style={{ width: "65vw", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "2.2vw" }}>
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
