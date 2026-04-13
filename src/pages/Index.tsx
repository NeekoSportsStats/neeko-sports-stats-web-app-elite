import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowRight, TrendingUp, TriangleAlert as AlertTriangle, Star, ChartBar as BarChart3, ChevronRight, Zap, Database, Clock, CalendarDays } from "lucide-react";
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

// ── Hero nav pills ─────────────────────────────────────────────────────────────
const NAV_PILLS = [
  { label: "Current Week", icon: <CalendarDays size={14} />, to: "/sports/afl/current-round", primary: true },
  { label: "Market Watch", icon: <TrendingUp size={14} />,   to: "/sports/afl/market-watch" },
  { label: "Captains",     icon: <Star size={14} />,          to: "/sports/afl/captains" },
  { label: "Rankings",     icon: <BarChart3 size={14} />,     to: "/sports/afl/rankings" },
] as const;

function HeroNavPills({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{
      overflowX: "auto",
      scrollbarWidth: "none",
      msOverflowStyle: "none",
      WebkitOverflowScrolling: "touch",
      ...style,
    }}>
      <div style={{
        display: "flex",
        gap: 10,
        justifyContent: "center",
        padding: "2px 0",
        minWidth: "max-content",
        margin: "0 auto",
      }}>
        {NAV_PILLS.map(({ label, icon, to, primary }) => (
          <Link
            key={to}
            to={to}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 16px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
              whiteSpace: "nowrap",
              transition: "background 0.15s, border-color 0.15s",
              background: primary ? "rgba(244,197,66,0.14)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${primary ? "rgba(244,197,66,0.32)" : "rgba(255,255,255,0.08)"}`,
              color: primary ? "#F4C542" : "#EAEAEA",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.background = primary ? "rgba(244,197,66,0.22)" : "rgba(255,255,255,0.12)";
              el.style.borderColor = primary ? "rgba(244,197,66,0.45)" : "rgba(255,255,255,0.15)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.background = primary ? "rgba(244,197,66,0.14)" : "rgba(255,255,255,0.06)";
              el.style.borderColor = primary ? "rgba(244,197,66,0.32)" : "rgba(255,255,255,0.08)";
            }}
          >
            <span style={{ opacity: 0.7, display: "flex", alignItems: "center" }}>{icon}</span>
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

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
  priceChange?: number | null;
  bullets: string[];
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
  const up  = (p.priceChange ?? 0) > 0;
  const priceStr = p.priceChange != null ? `${up ? "+" : ""}${Math.round(p.priceChange / 1000)}k` : null;
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
              ? "0 2px 4px rgba(0,0,0,0.22), 0 10px 24px rgba(0,0,0,0.26), 0 20px 44px rgba(0,0,0,0.18)"
              : "0 1px 3px rgba(0,0,0,0.16), 0 5px 14px rgba(0,0,0,0.20), 0 12px 28px rgba(0,0,0,0.16)",
            transform: hovered ? `rotate(${rotation}deg) translateY(-0.5vw) scale(1.025)` : `rotate(${rotation}deg) translateY(0)`,
            transition: "all 0.22s ease", overflow: "visible", position: "relative",
          }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: "linear-gradient(to bottom, rgba(255,255,255,0.55), transparent)", borderRadius: "2px 2px 0 0", pointerEvents: "none" }} />

          {/* Header */}
          <div style={{ borderBottom: `1px solid ${paper.headerBorder}`, padding: "0.7vw 1vw 0.5vw", display: "flex", alignItems: "center", gap: "0.4vw" }}>
            <span style={{ color: p.color, display: "flex", alignItems: "center", flexShrink: 0 }}>{p.icon}</span>
            <span style={{ fontSize: "0.55vw", fontWeight: 900, letterSpacing: "0.24em", textTransform: "uppercase", color: p.color, flex: 1 }}>{p.label}</span>
            {p.position && (
              <span style={{ fontSize: "0.5vw", fontWeight: 800, textTransform: "uppercase", background: `${p.color}16`, color: p.color, padding: "0.15vw 0.35vw", borderRadius: 3, border: `1px solid ${p.color}25` }}>{p.position}</span>
            )}
            {p.badge && (
              <span style={{ fontSize: "0.5vw", fontWeight: 900, textTransform: "uppercase", background: p.color, color: "#fff", padding: "0.15vw 0.4vw", borderRadius: 3 }}>{p.badge}</span>
            )}
          </div>

          {/* Player */}
          <div style={{ padding: "0.7vw 1vw 0.3vw", display: "flex", alignItems: "center", gap: "0.6vw" }}>
            <PlayerAvatar name={p.playerName} color={p.color} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "0.9vw", fontWeight: 800, color: "#1c1208", lineHeight: 1.2, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.playerName}</p>
              <p style={{ fontSize: "0.65vw", color: "#857060", marginTop: "0.15vw", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.team}</p>
            </div>
          </div>

          {/* Score */}
          <div style={{ padding: "0.15vw 1vw 0.4vw", display: "flex", alignItems: "baseline", gap: "0.35vw" }}>
            {pts != null ? (
              <>
                <span style={{ fontSize: "2.2vw", fontWeight: 900, color: p.color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{pts}</span>
                <span style={{ fontSize: "0.65vw", color: "#a08060", fontWeight: 700 }}>pts</span>
                {priceStr && (
                  <span style={{ fontSize: "0.55vw", fontWeight: 800, color: up ? "#1a5e22" : "#7a1818", background: up ? "#d8eed8" : "#f2dada", padding: "0.15vw 0.35vw", borderRadius: 3, marginLeft: "0.15vw", border: up ? "1px solid #b4d8b4" : "1px solid #e0b8b8" }}>
                    {up ? "▲" : "▼"}{priceStr}
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize: "1.1vw", color: "#bbb", fontWeight: 700 }}>—</span>
            )}
          </div>

          {/* Bullets */}
          {p.bullets.length > 0 && (
            <div style={{ padding: "0.3vw 1vw 0.7vw", display: "flex", flexDirection: "column", gap: "0.35vw" }}>
              {p.bullets.map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.4vw" }}>
                  <div style={{ width: "0.35vw", height: "0.35vw", borderRadius: "50%", background: `${p.color}50`, flexShrink: 0, marginTop: "0.3vw", border: `1px solid ${p.color}30` }} />
                  <span style={{ fontSize: "0.55vw", color: "#4a3828", fontWeight: 600, lineHeight: 1.45 }}>{b}</span>
                </div>
              ))}
            </div>
          )}

          {/* CTA */}
          <div style={{ padding: "0 0.8vw 1vw" }}>
            <div style={{ background: `linear-gradient(to bottom, ${p.color}ee, ${p.color})`, color: "#fff", fontSize: "0.55vw", fontWeight: 800, textAlign: "center", padding: "0.55vw 0.7vw", borderRadius: 4, letterSpacing: "0.07em", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 6px rgba(0,0,0,0.28)", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3vw" }}>
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
  const { mustBuyP, trapP, captainP, valueP, topRows, mwBuys, mwHolds, mwSells } = useMemo(() => {
    const mwInput: MWPlayerRow[] = players.map(toMWRow);
    const { buys, holds, sells } = classifyPlayers(mwInput);

    // Players eligible for hero selection: in engine buy or hold buckets, with a projection
    const playable = [...buys, ...holds].filter(p => p.projection != null);

    // Hero card selections
    const buysSorted = buys.filter(p => p.projection != null).sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0));
    const sellsSorted = sells.filter(p => p.projection != null).sort((a, b) => (a.value_score ?? 0) - (b.value_score ?? 0));
    const byCap = [...playable].sort((a, b) => (b.captain_score ?? b.projection ?? 0) - (a.captain_score ?? a.projection ?? 0));

    const mustBuyP = buysSorted[0] ?? null;
    const trapP    = sellsSorted[0] ?? null;
    const captainP = byCap.find(p => p.player_id !== mustBuyP?.player_id) ?? null;
    const valueP   = buysSorted.find(p => p.player_id !== mustBuyP?.player_id) ?? null;

    // Rankings preview — top 12 sorted by neeko_rating
    const topRows = players
      .filter(p => p.projection != null)
      .sort((a, b) => (b.neeko_rating ?? b.projection ?? 0) - (a.neeko_rating ?? a.projection ?? 0))
      .slice(0, 12);

    return { mustBuyP, trapP, captainP, valueP, topRows, mwBuys: buys, mwHolds: holds, mwSells: sells };
  }, [players]);

  // ── Hero card bullet derivation — only from real fields ───────────────────
  function mustBuyBullets(): string[] {
    if (!mustBuyP) return [];
    const bullets: string[] = [];
    if (mustBuyP.price_change != null && mustBuyP.price_change > 0) {
      bullets.push(`+${Math.round(mustBuyP.price_change / 1000)}k above breakeven — price rise likely`);
    } else if (mustBuyP.season_avg != null && mustBuyP.projection != null && mustBuyP.projection > mustBuyP.season_avg) {
      bullets.push(`${Math.round(mustBuyP.projection - mustBuyP.season_avg)}pts above season avg — in form`);
    }
    const also = mwBuys.find(p => p.player_id !== mustBuyP.player_id);
    if (also) bullets.push(`Also consider: ${also.player_name}`);
    return bullets;
  }

  function trapBullets(): string[] {
    if (!trapP) return [];
    const bullets: string[] = [];
    if (trapP.breakeven != null && trapP.projection != null && trapP.projection < trapP.breakeven) {
      bullets.push(`Scoring below breakeven — price drop risk`);
    }
    const also = mwSells.find(p => p.player_id !== trapP.player_id);
    if (also) bullets.push(`Also flagged: ${also.player_name}`);
    return bullets;
  }

  function captainBullets(): string[] {
    if (!captainP) return [];
    const bullets: string[] = [];
    if (captainP.captain_rating) bullets.push(`${captainP.captain_rating} — top ranked captain`);
    const also = mwBuys.find(p => p.player_id !== captainP.player_id && p.player_id !== mustBuyP?.player_id);
    if (also) bullets.push(`Alt: ${also.player_name}`);
    return bullets;
  }

  function valueBullets(): string[] {
    if (!valueP) return [];
    const bullets: string[] = [];
    if (valueP.price != null && valueP.price > 0) {
      bullets.push(`Priced at $${Math.round(valueP.price / 1000)}k — strong value for projection`);
    }
    if (valueP.value_score != null && valueP.value_score > 0) {
      bullets.push(`Value score: ${valueP.value_score.toFixed(1)} — above-market edge`);
    }
    return bullets;
  }

  const FREE_PREVIEW = 5;

  const trustBar = [
    { icon: <Zap size={11} />,      text: "Updated before every round lockout" },
    { icon: <Database size={11} />, text: "Built from real AFL Fantasy data" },
    { icon: <Clock size={11} />,    text: "Takes 30 seconds to plan your week" },
  ];

  const allHeroReady = mustBuyP && trapP && captainP && valueP;

  const cards: CardProps[] = !loading && allHeroReady ? [
    {
      label: "Must Buy", icon: <TrendingUp size={9} />,
      color: "#1a6028",
      playerName: mustBuyP.player_name, team: mustBuyP.team ?? "", position: mustBuyP.position,
      projection: mustBuyP.projection, priceChange: mustBuyP.price_change,
      bullets: mustBuyBullets(),
      ctaLabel: "View Must Buys", ctaTo: "/sports/afl/current-round", index: 0,
    },
    {
      label: "Trap Alert", icon: <AlertTriangle size={9} />,
      color: "#881818",
      playerName: trapP.player_name, team: trapP.team ?? "", position: trapP.position,
      projection: trapP.projection, priceChange: trapP.price_change,
      bullets: trapBullets(),
      ctaLabel: "View Trap Alerts", ctaTo: "/sports/afl/current-round", index: 1,
    },
    {
      label: "Captain Pick", icon: <Star size={9} />, badge: "C",
      color: "#7a4800",
      playerName: captainP.player_name, team: captainP.team ?? "", position: captainP.position,
      projection: captainP.projection, priceChange: captainP.price_change,
      bullets: captainBullets(),
      ctaLabel: "View Captains", ctaTo: "/sports/afl/captains", index: 2,
    },
    {
      label: "Best Value", icon: <BarChart3 size={9} />,
      color: "#0d4278",
      playerName: valueP.player_name, team: valueP.team ?? "", position: valueP.position,
      projection: valueP.projection, priceChange: valueP.price_change,
      bullets: valueBullets(),
      ctaLabel: "Open Market Watch", ctaTo: "/sports/afl/market-watch", index: 3,
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
    priceChange: c.priceChange,
    bullets: c.bullets,
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
        backgroundPosition: "0% 30%",
        backgroundRepeat: "no-repeat",
      }}>
        {/* Depth overlays */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.60) 100%)", zIndex: 1, pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.25) 100%)", zIndex: 2, pointerEvents: "none" }} />

        {/* Bottom fade into next section */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "8%", background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.90))", zIndex: 3, pointerEvents: "none" }} />

        {/* Content layer — absolutely fills the section. All sizing in vw so it scales 1:1 with the hero image at every viewport width. */}
        <div style={{
          position: "absolute",
          inset: 0,
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: "8%",
          paddingBottom: "0%",
          paddingLeft: "3vw",
          paddingRight: "3vw",
        }}>
          <div style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
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
              <p style={{ marginTop: "1%", marginBottom: 0, fontSize: "1.1vw", color: "rgba(255,255,255,0.90)", lineHeight: 1.6, textShadow: "0 1px 6px rgba(0,0,0,0.90)" }}>
                Trades, captains, and traps — powered by 600+ player projections updated every round.
              </p>
            </div>

            {/* CTA buttons */}
            <div style={{ display: "flex", gap: "1%", justifyContent: "center", marginTop: "2%", marginBottom: "1%", flexWrap: "nowrap" }}>
              <Link to="/auth" style={{ display: "flex", alignItems: "center", gap: "0.5vw", background: "linear-gradient(to bottom, #fad52a, #d09800)", color: "#1a1000", fontWeight: 800, fontSize: "1vw", padding: "0.8vw 1.8vw", borderRadius: 7, textDecoration: "none", border: "1px solid rgba(0,0,0,0.20)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.42), 0 2px 0 rgba(0,0,0,0.32), 0 6px 20px rgba(0,0,0,0.35)", letterSpacing: "0.01em", whiteSpace: "nowrap" }}>
                Unlock This Week's Game Plan <ArrowRight size="1.1vw" />
              </Link>
              <Link to="/sports/afl/current-round" style={{ display: "flex", alignItems: "center", gap: "0.5vw", background: "rgba(255,255,255,0.11)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.22)", color: "#ffffff", fontWeight: 700, fontSize: "1vw", padding: "0.8vw 1.8vw", borderRadius: 7, textDecoration: "none", letterSpacing: "0.01em", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 4px 12px rgba(0,0,0,0.30)", whiteSpace: "nowrap" }}>
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

            {/* Current Week heading */}
            <div style={{ marginTop: "3.5%", width: "62vw", display: "flex", alignItems: "center", gap: "1vw" }}>
              <div style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(255,255,255,0.35))" }} />
              <span style={{ fontSize: "0.9vw", fontWeight: 900, letterSpacing: "0.30em", textTransform: "uppercase", color: C.gold, whiteSpace: "nowrap", textShadow: "0 1px 6px rgba(0,0,0,0.60)" }}>Current Week</span>
              <div style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(255,255,255,0.35))" }} />
            </div>

            {/* Cards row */}
            <div style={{ width: "62vw", margin: "1.2% auto 0", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1.2vw" }}>
              {showSkeleton
                ? [0,1,2,3].map(i => <SkeletonCard key={i} />)
                : cards.map(c => <WhiteboardCard key={c.label} {...c} />)
              }
            </div>

            {/* Nav pills */}
            <div style={{ display: "flex", justifyContent: "center", marginTop: "1.5%" }}>
              <HeroNavPills style={{ width: "fit-content" }} />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          GOLD TRANSITION BAND — hero → content bridge
      ══════════════════════════════════════════════════════ */}
      <div style={{ width: "100%", height: 3, background: "linear-gradient(to right, transparent 0%, rgba(224,174,45,0.18) 15%, rgba(224,174,45,0.55) 40%, rgba(224,174,45,0.55) 60%, rgba(224,174,45,0.18) 85%, transparent 100%)" }} />
      <div style={{ width: "100%", height: 56, background: "linear-gradient(to bottom, #1A1411 0%, #0d0b09 100%)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, rgba(224,174,45,0.07) 0%, transparent 70%)" }} />
      </div>

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
