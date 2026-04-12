import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  Crown, ArrowRight, Check, TrendingUp,
  TriangleAlert as AlertTriangle, Star,
  ChartBar as BarChart3, GitCompare, Bookmark, ChevronRight,
  Zap, Database, Clock, ListChecks,
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
      width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
      background: `${color}1a`,
      border: `1.5px solid ${color}38`,
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", position: "relative",
    }}>
      <div style={{
        position: "absolute", bottom: -2, left: "50%", transform: "translateX(-50%)",
        width: 22, height: 26,
        background: `${color}28`,
        borderRadius: "50% 50% 0 0",
      }} />
      <div style={{
        position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)",
        width: 14, height: 14, borderRadius: "50%",
        background: `${color}44`,
      }} />
      <span style={{ position: "relative", zIndex: 1, fontSize: 9, fontWeight: 900, color, letterSpacing: "-0.02em", marginTop: 9 }}>{initials}</span>
    </div>
  );
}

type CardProps = {
  label: string;
  icon: React.ReactNode;
  color: string;
  paperBg: string;
  playerName: string;
  team: string;
  position?: string | null;
  projection?: number | null;
  priceChange?: number | null;
  bullets: string[];
  ctaLabel: string;
  ctaTo: string;
  badge?: string;
  confidence?: number;
  index?: number;
};

const CARD_ROTATIONS = [-1.8, 1.4, -1.2, 1.6];

const STICKY_PAPERS: Record<number, { bg: string; lines: string; headerBorder: string }> = {
  0: { bg: "#edf5eb", lines: "rgba(30,100,44,0.06)",  headerBorder: "rgba(30,100,44,0.18)" },
  1: { bg: "#f7eded", lines: "rgba(130,30,30,0.06)",  headerBorder: "rgba(130,30,30,0.18)" },
  2: { bg: "#f7f3e4", lines: "rgba(140,110,0,0.06)",  headerBorder: "rgba(140,110,0,0.18)" },
  3: { bg: "#eaeff8", lines: "rgba(20,70,148,0.06)",  headerBorder: "rgba(20,70,148,0.18)" },
};

function StickyPin({ color }: { color: string }) {
  return (
    <div style={{
      position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
      zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center",
      filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
    }}>
      <div style={{
        width: 13, height: 13, borderRadius: "50%",
        background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.6) 0%, ${color} 50%, rgba(0,0,0,0.25) 100%)`,
        border: "1px solid rgba(0,0,0,0.22)",
      }} />
      <div style={{
        width: 2, height: 7,
        background: "linear-gradient(to bottom, rgba(110,90,70,0.9), rgba(50,40,30,0.55))",
        marginTop: -1,
      }} />
    </div>
  );
}

function WhiteboardCard(p: CardProps) {
  const [hovered, setHovered] = useState(false);
  const pts = p.projection != null ? Math.round(p.projection) : null;
  const up  = (p.priceChange ?? 0) > 0;
  const priceStr = p.priceChange != null
    ? `${up ? "+" : ""}${Math.round(p.priceChange / 1000)}k`
    : null;
  const rotation = CARD_ROTATIONS[p.index ?? 0] ?? -1.8;
  const paper = STICKY_PAPERS[p.index ?? 0] ?? STICKY_PAPERS[0];

  return (
    <Link to={p.ctaTo} style={{ textDecoration: "none", display: "block", paddingTop: 14 }}>
      <div style={{ position: "relative" }}>
        <StickyPin color={p.color} />
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            background: paper.bg,
            backgroundImage: `repeating-linear-gradient(transparent, transparent 17px, ${paper.lines} 17px, ${paper.lines} 18px)`,
            borderRadius: 2,
            border: `1px solid rgba(0,0,0,0.10)`,
            boxShadow: hovered
              ? `0 2px 4px rgba(0,0,0,0.22), 0 10px 24px rgba(0,0,0,0.26), 0 20px 44px rgba(0,0,0,0.18), 5px 16px 28px rgba(0,0,0,0.14)`
              : `0 1px 3px rgba(0,0,0,0.16), 0 5px 14px rgba(0,0,0,0.20), 0 12px 28px rgba(0,0,0,0.16), 3px 10px 18px rgba(0,0,0,0.12)`,
            transform: hovered
              ? `rotate(${rotation}deg) translateY(-7px) scale(1.025)`
              : `rotate(${rotation}deg) translateY(0)`,
            transition: "all 0.22s ease",
            overflow: "visible",
            position: "relative",
          }}
        >
          {/* Top edge highlight */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 1.5,
            background: "linear-gradient(to bottom, rgba(255,255,255,0.55), transparent)",
            borderRadius: "2px 2px 0 0",
            pointerEvents: "none",
          }} />

          {/* Header */}
          <div style={{
            borderBottom: `1px solid ${paper.headerBorder}`,
            padding: "7px 10px 6px",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{ color: p.color, display: "flex", alignItems: "center", flexShrink: 0 }}>{p.icon}</span>
            <span style={{ fontSize: 7.5, fontWeight: 900, letterSpacing: "0.24em", textTransform: "uppercase", color: p.color, flex: 1 }}>{p.label}</span>
            {p.confidence != null && (
              <span style={{
                fontSize: 7, fontWeight: 800, color: p.color,
                background: `${p.color}14`, border: `1px solid ${p.color}28`,
                padding: "1px 5px", borderRadius: 3,
              }}>{p.confidence}%</span>
            )}
            {p.position && (
              <span style={{ fontSize: 7, fontWeight: 800, textTransform: "uppercase", background: `${p.color}16`, color: p.color, padding: "1px 4px", borderRadius: 3, border: `1px solid ${p.color}25` }}>{p.position}</span>
            )}
            {p.badge && (
              <span style={{ fontSize: 7, fontWeight: 900, textTransform: "uppercase", background: p.color, color: "#fff", padding: "1px 5px", borderRadius: 3 }}>{p.badge}</span>
            )}
          </div>

          {/* Player */}
          <div style={{ padding: "8px 10px 2px", display: "flex", alignItems: "center", gap: 7 }}>
            <PlayerAvatar name={p.playerName} color={p.color} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11.5, fontWeight: 800, color: "#1c1208", lineHeight: 1.2, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.playerName}</p>
              <p style={{ fontSize: 8, color: "#857060", marginTop: 1, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.team}</p>
            </div>
          </div>

          {/* Score */}
          <div style={{ padding: "1px 10px 4px", display: "flex", alignItems: "baseline", gap: 4 }}>
            {pts != null ? (
              <>
                <span style={{ fontSize: 26, fontWeight: 900, color: p.color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{pts}</span>
                <span style={{ fontSize: 8.5, color: "#a08060", fontWeight: 700 }}>pts</span>
                {priceStr && (
                  <span style={{
                    fontSize: 7.5, fontWeight: 800,
                    color: up ? "#1a5e22" : "#7a1818",
                    background: up ? "#d8eed8" : "#f2dada",
                    padding: "1px 4px", borderRadius: 3, marginLeft: 2,
                    border: up ? "1px solid #b4d8b4" : "1px solid #e0b8b8",
                  }}>
                    {up ? "▲" : "▼"}{priceStr}
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize: 13, color: "#bbb", fontWeight: 700 }}>—</span>
            )}
          </div>

          {/* Bullets */}
          <div style={{ padding: "2px 10px 7px", display: "flex", flexDirection: "column", gap: 3.5 }}>
            {p.bullets.map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                <div style={{
                  width: 4, height: 4, borderRadius: "50%",
                  background: `${p.color}50`, flexShrink: 0, marginTop: 4,
                  border: `1px solid ${p.color}30`,
                }} />
                <span style={{ fontSize: 7.5, color: "#4a3828", fontWeight: 600, lineHeight: 1.45 }}>{b}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{ padding: "0 9px 10px" }}>
            <div style={{
              background: `linear-gradient(to bottom, ${p.color}ee, ${p.color})`,
              color: "#fff",
              fontSize: 7.5, fontWeight: 800, textAlign: "center",
              padding: "6px 8px", borderRadius: 4,
              letterSpacing: "0.07em",
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 6px rgba(0,0,0,0.28)`,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
            }}>
              {p.ctaLabel} <ChevronRight size={7} />
            </div>
          </div>

          {/* Curl shadow */}
          <div style={{
            position: "absolute", bottom: -2, right: 6, width: "38%", height: 5,
            boxShadow: "4px 5px 9px rgba(0,0,0,0.20)",
            borderRadius: "0 0 50% 50%",
            transform: "rotate(1.5deg)",
            pointerEvents: "none",
          }} />
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div style={{
      height: 220, borderRadius: 4,
      background: "rgba(255,255,255,0.12)",
      border: "1px solid rgba(255,255,255,0.08)",
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

  const mBPriceChange = (mB as RankingRow).price_change ?? MOCK.mustBuy.price_change;
  const mBPriceK = mBPriceChange != null ? Math.round(Math.abs(mBPriceChange) / 1000) : null;

  const cards: CardProps[] = [
    {
      label: "Must Buy", icon: <TrendingUp size={9} />,
      color: "#1a6028", paperBg: "#edf5eb",
      playerName: mB.player_name, team: mB.team ?? "", position: mB.position,
      projection: mB.projection, priceChange: mBPriceChange,
      confidence: 87,
      bullets: [
        mBPriceK != null ? `+${mBPriceK}k above breakeven — price surge incoming` : "Above breakeven — price surge incoming",
        ...(buyAlso.length ? [buyAlso[0]] : ["Strong form last 3 rounds"]),
      ],
      ctaLabel: "View Must Buys", ctaTo: "/sports/afl/current-round",
      index: 0,
    },
    {
      label: "Trap Alert", icon: <AlertTriangle size={9} />,
      color: "#881818", paperBg: "#f7eded",
      playerName: tr.player_name, team: tr.team ?? "", position: tr.position,
      projection: tr.projection, priceChange: (tr as RankingRow).price_change ?? MOCK.trap.price_change,
      confidence: 82,
      bullets: [
        "Overpriced vs projection — avoid this week",
        ...(trapAlso.length ? [trapAlso[0]] : ["Tough matchup, high ownership risk"]),
      ],
      ctaLabel: "View Trap Alerts", ctaTo: "/sports/afl/current-round",
      index: 1,
    },
    {
      label: "Captain Pick", icon: <Star size={9} />, badge: "C",
      color: "#7a4800", paperBg: "#f7f3e4",
      playerName: cp.player_name, team: cp.team ?? "", position: cp.position,
      projection: cp.projection, priceChange: (cp as RankingRow).price_change ?? MOCK.captain.price_change,
      confidence: 79,
      bullets: [
        "Top projected scorer this round",
        ...(capAlso.length ? [capAlso[0]] : ["Elite ceiling, premium matchup"]),
      ],
      ctaLabel: "View Captains", ctaTo: "/sports/afl/captains",
      index: 2,
    },
    {
      label: "Best Value", icon: <BarChart3 size={9} />,
      color: "#0d4278", paperBg: "#eaeff8",
      playerName: vl.player_name, team: vl.team ?? "", position: vl.position,
      projection: vl.projection, priceChange: (vl as RankingRow).price_change ?? MOCK.value.price_change,
      confidence: 74,
      bullets: [
        "Underpriced vs projection — strong value",
        "Rising ownership trend this week",
      ],
      ctaLabel: "Open Market Watch", ctaTo: "/sports/afl/market-watch",
      index: 3,
    },
  ];

  const quickActions = [
    {
      to: "/sports/afl/current-round",
      icon: <GitCompare size={13} />,
      label: "Compare Players",
      desc: "Head-to-head breakdowns",
      color: "#1a6028",
    },
    {
      to: "/sports/afl/rankings",
      icon: <Bookmark size={13} />,
      label: "Watchlist",
      desc: "Track your trade targets",
      color: "#7a4800",
    },
    {
      to: "/sports/afl/current-round",
      icon: <AlertTriangle size={13} />,
      label: "Trap Alerts",
      desc: "Avoid costly mistakes",
      color: "#881818",
    },
    {
      to: "/sports/afl/rankings",
      icon: <ListChecks size={13} />,
      label: "Full Rankings",
      desc: "600+ players by projection",
      color: "#0d4278",
    },
  ];

  const trustBar = [
    { icon: <Zap size={11} />, text: "Updated before every round lockout" },
    { icon: <Database size={11} />, text: "Built from real AFL Fantasy data" },
    { icon: <Clock size={11} />, text: "Takes 30 seconds to plan your week" },
  ];

  return (
    <div style={{ background: "#0a0a0a", overflowX: "hidden" }}>
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
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.52)", zIndex: 1 }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "30%", background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(10,10,10,0.92) 70%, #0a0a0a 100%)", zIndex: 2 }} />

          <div style={{ position: "relative", zIndex: 10, padding: "52px 20px 24px", textAlign: "center" }}>
            <img src="/logo.png" alt="Neeko" style={{ height: 22, marginBottom: 14, opacity: 0.88 }} />
            <h1 style={{ fontSize: "1.75rem", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.025em", color: "#ffffff", textShadow: "0 2px 20px rgba(0,0,0,0.9)", marginBottom: 10 }}>
              Stop Guessing.<br />
              <span style={{ color: "#F5C451" }}>Start Winning</span> Your<br />
              AFL Fantasy Week.
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", marginBottom: 20, lineHeight: 1.6, maxWidth: 320, margin: "0 auto 20px" }}>
              Trades, captains, and traps — powered by 600+ player projections updated every round.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, alignItems: "center", marginBottom: 28 }}>
              <Link to="/auth" style={{ display: "flex", alignItems: "center", gap: 7, background: "#F5C451", color: "#1a0e00", fontWeight: 800, fontSize: 14, padding: "12px 28px", borderRadius: 6, textDecoration: "none", letterSpacing: "0.02em", boxShadow: "0 4px 18px rgba(245,196,81,0.38)" }}>
                Unlock This Week's Game Plan <ArrowRight size={14} />
              </Link>
              {!isPremium && (
                <Link to="/sports/afl/current-round" style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)", fontWeight: 700, fontSize: 13, padding: "11px 24px", borderRadius: 6, textDecoration: "none", border: "1px solid rgba(255,255,255,0.20)", letterSpacing: "0.02em" }}>
                  View Free Picks
                </Link>
              )}
            </div>
          </div>

          <div style={{ position: "relative", zIndex: 10, padding: "0 16px 0" }}>
            {/* Round context bar */}
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(245,196,81,0.6)", marginBottom: 3 }}>
                This Week's Game Plan
              </p>
              <p style={{ fontSize: 9, color: "rgba(255,255,255,0.30)", fontWeight: 600, letterSpacing: "0.04em" }}>
                Updated Today · Data from 600+ players
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
              {loading ? [0,1,2,3].map(i => <SkeletonCard key={i} />) : cards.map(c => <WhiteboardCard key={c.label} {...c} />)}
            </div>

            {/* Trust bar mobile */}
            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 7, alignItems: "center" }}>
              {trustBar.map(({ icon, text }) => (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: 600 }}>
                  <span style={{ color: "rgba(245,196,81,0.60)" }}>{icon}</span>{text}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center", marginTop: 16 }}>
              {quickActions.map(({ to, icon, label, color }) => (
                <Link key={label} to={to} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)", textDecoration: "none", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", padding: "6px 12px", borderRadius: 24 }}>
                  <span style={{ color }}>{icon}</span>{label}
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : (
        /* ── DESKTOP ── */
        <section style={{
          position: "relative",
          width: "100%",
          height: 800,
          overflow: "hidden",
          background: "#1a1008",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: "url('/hero/image.png')",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center 38%",
            zIndex: 0,
          }} />

          {/* Darker overlay for text contrast */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.64) 0%, rgba(0,0,0,0.44) 32%, rgba(0,0,0,0.22) 55%, rgba(0,0,0,0.80) 100%)",
            zIndex: 1,
            pointerEvents: "none",
          }} />

          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.32) 100%)",
            zIndex: 2,
            pointerEvents: "none",
          }} />

          <div style={{
            position: "relative", zIndex: 20,
            width: "100%", maxWidth: 900,
            margin: "0 auto",
            textAlign: "center",
            paddingTop: 138,
          }}>

            {/* Eyebrow */}
            <p style={{
              fontSize: 9, fontWeight: 900, letterSpacing: "0.40em",
              textTransform: "uppercase", color: "rgba(245,196,81,0.70)",
              marginBottom: 10,
              textShadow: "0 1px 3px rgba(0,0,0,0.6)",
            }}>
              AFL Fantasy Intelligence
            </p>

            {/* Headline */}
            <h1 style={{
              margin: 0,
              fontSize: "clamp(1.98rem, 3.24vw, 2.79rem)",
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: "-0.025em",
              color: "#f5f5f5",
              textShadow: "0 2px 4px rgba(0,0,0,0.70), 0 8px 22px rgba(0,0,0,0.50)",
            }}>
              Stop Guessing. <span style={{ color: "#f4c542" }}>Start Winning</span>
              <br />Your AFL Fantasy Week.
            </h1>

            {/* Subheading */}
            <p style={{
              marginTop: 10,
              fontSize: 16,
              color: "rgba(255,255,255,0.72)",
              lineHeight: 1.6,
              textShadow: "0 1px 4px rgba(0,0,0,0.70)",
              maxWidth: 560,
              margin: "10px auto 0",
            }}>
              Trades, captains, and traps — powered by 600+ player projections updated every round.
            </p>

            {/* CTAs */}
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 14 }}>
              <Link to="/auth" style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "linear-gradient(to bottom, #fad52a, #d09800)",
                color: "#1a1000",
                fontWeight: 800, fontSize: 14,
                padding: "13px 26px", borderRadius: 7, textDecoration: "none",
                border: "1px solid rgba(0,0,0,0.20)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.42), 0 2px 0 rgba(0,0,0,0.32), 0 6px 16px rgba(0,0,0,0.30)",
                letterSpacing: "0.01em",
              }}>
                Unlock This Week's Game Plan <ArrowRight size={14} />
              </Link>
              <Link to="/sports/afl/current-round" style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "rgba(255,255,255,0.12)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                border: "1px solid rgba(255,255,255,0.24)",
                color: "#ffffff",
                fontWeight: 700, fontSize: 14,
                padding: "13px 26px", borderRadius: 7, textDecoration: "none",
                letterSpacing: "0.01em",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 12px rgba(0,0,0,0.30)",
              }}>
                View Free Picks
              </Link>
            </div>

            {/* Lockout note */}
            <p style={{ marginTop: 8, fontSize: 10.5, color: "rgba(255,255,255,0.28)", letterSpacing: "0.02em" }}>
              Updated before every AFL Fantasy round lockout · 630+ players fully analysed weekly
            </p>

            {/* ── WHITEBOARD ZONE ── */}
            <div style={{ marginTop: -10, maxWidth: 1020, marginLeft: "auto", marginRight: "auto" }}>

              {/* Cards */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 20,
                width: "100%",
                alignItems: "end",
              }}>
                {loading
                  ? [0,1,2,3].map(i => <SkeletonCard key={i} />)
                  : cards.map((c, i) => <WhiteboardCard key={c.label} {...c} index={i} />)
                }
              </div>

              {/* Trust bar */}
              <div style={{
                display: "flex", justifyContent: "center", alignItems: "center",
                gap: 28, marginTop: 14,
              }}>
                {trustBar.map(({ icon, text }) => (
                  <div key={text} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "rgba(255,255,255,0.36)", fontWeight: 600 }}>
                    <span style={{ color: "rgba(244,197,66,0.55)" }}>{icon}</span>
                    {text}
                  </div>
                ))}
              </div>

              {/* ── GO DEEPER ── */}
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 7.5, fontWeight: 900, letterSpacing: "0.32em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", marginBottom: 9, textAlign: "center" }}>
                  Go Deeper
                </p>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 10,
                }}>
                  {quickActions.map(({ to, icon, label, desc, color }) => (
                    <Link
                      key={label} to={to}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
                        textDecoration: "none",
                        background: "rgba(255,255,255,0.07)",
                        border: "1px solid rgba(255,255,255,0.11)",
                        padding: "10px 12px", borderRadius: 6,
                        transition: "all 0.15s ease",
                        textAlign: "center",
                      }}
                      onMouseEnter={e => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.background = "rgba(255,255,255,0.12)";
                        el.style.borderColor = "rgba(255,255,255,0.20)";
                      }}
                      onMouseLeave={e => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.background = "rgba(255,255,255,0.07)";
                        el.style.borderColor = "rgba(255,255,255,0.11)";
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                        <span style={{ color }}>{icon}</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.75)", letterSpacing: "0.01em" }}>{label}</span>
                        <ChevronRight size={9} style={{ color: "rgba(255,255,255,0.25)" }} />
                      </div>
                      <span style={{ fontSize: 8.5, color: "rgba(255,255,255,0.28)", fontWeight: 500, lineHeight: 1.3 }}>{desc}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </section>
      )}

      {/* ── DARK SECTION ── */}
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

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 72 }}>
            {[
              { num: "01", title: "Check Your Gameplan", color: "#1a6028", icon: <BarChart3 size={22} />, desc: "Get weekly Must Buys, Trap Alerts, and Captain Picks — all backed by real AFL performance data." },
              { num: "02", title: "Make Smarter Trades",  color: "#7a4800", icon: <TrendingUp size={22} />, desc: "Trade in form players before price rises. Our value engine spots underpriced stars early." },
              { num: "03", title: "Avoid Costly Traps",   color: "#881818", icon: <AlertTriangle size={22} />, desc: "Skip the players everyone else is picking. Our trap alerts flag over-owned risks before lockout." },
            ].map(({ num, title, color, icon, desc }) => (
              <div
                key={num}
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "28px 24px", transition: "all 0.2s ease" }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = "rgba(255,255,255,0.07)";
                  el.style.borderColor = `${color}35`;
                  el.style.boxShadow = `0 8px 32px ${color}10`;
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = "rgba(255,255,255,0.04)";
                  el.style.borderColor = "rgba(255,255,255,0.07)";
                  el.style.boxShadow = "none";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 9, background: `${color}18`, border: `1px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
                    {icon}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 900, color: `${color}65`, letterSpacing: "0.04em" }}>{num}</span>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 10, letterSpacing: "-0.01em" }}>{title}</h3>
                <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.36)", lineHeight: 1.65 }}>{desc}</p>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, alignItems: "start" }}>

            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, padding: "28px 24px" }}>
              <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.26em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 14 }}>Free Plan</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 22 }}>
                <span style={{ fontSize: 38, fontWeight: 900, color: "#fff" }}>$0</span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>/month</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 22 }}>
                {["Basic rankings (top 20 players)", "Must Buy snapshot", "Round summary"].map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Check size={12} style={{ color: "#2e8836", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>{f}</span>
                  </div>
                ))}
              </div>
              <Link to="/auth" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.55)", fontWeight: 700, fontSize: 13, padding: "10px 16px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.11)", textDecoration: "none", letterSpacing: "0.03em" }}>
                Get Started Free
              </Link>
            </div>

            <div style={{ background: "linear-gradient(160deg, #1a1206 0%, #120d04 100%)", border: "1.5px solid rgba(245,196,81,0.30)", borderRadius: 10, padding: "28px 24px", boxShadow: "0 10px 44px rgba(245,196,81,0.08)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(245,196,81,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.26em", textTransform: "uppercase", color: "#F5C451" }}>Neeko Plus</p>
                <span style={{ fontSize: 8.5, fontWeight: 800, background: "#F5C451", color: "#1a0e00", padding: "3px 8px", borderRadius: 4, letterSpacing: "0.08em" }}>BEST VALUE</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 38, fontWeight: 900, color: "#fff" }}>${NEEKO_PRICING.yearly.monthlyEquivalent}</span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>/month</span>
              </div>
              <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.20)", marginBottom: 22 }}>Billed yearly. Cancel anytime.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 24 }}>
                {["Full rankings — 630+ players", "Must Buys & Trap Alerts", "Captain Picks with confidence score", "Market Watch & price changes", "Start/Sit AI decisions", "Updated before every round lockout"].map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Check size={12} style={{ color: "#F5C451", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.58)" }}>{f}</span>
                  </div>
                ))}
              </div>
              <Link to="/neeko-plus" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "#F5C451", color: "#1a0e00", fontWeight: 800, fontSize: 14, padding: "12px 16px", borderRadius: 6, textDecoration: "none", boxShadow: "0 4px 18px rgba(245,196,81,0.30), inset 0 1px 0 rgba(255,255,255,0.26)", letterSpacing: "0.03em" }}>
                <Crown size={13} /> Unlock Full Access
              </Link>
            </div>

            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "28px 24px", display: "flex", flexDirection: "column", gap: 22 }}>
              <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.26em", textTransform: "uppercase", color: "rgba(255,255,255,0.20)" }}>Why coaches use Neeko</p>
              {[
                { q: "Made my best trade of the season using the Must Buy list.", from: "AFL Fantasy manager" },
                { q: "The trap alerts saved me from a 40-point disaster.", from: "SuperCoach player" },
              ].map(({ q, from }) => (
                <div key={from} style={{ borderLeft: "2px solid rgba(245,196,81,0.22)", paddingLeft: 14 }}>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.44)", lineHeight: 1.65, fontStyle: "italic", marginBottom: 6 }}>"{q}"</p>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", fontWeight: 600 }}>— {from}</p>
                </div>
              ))}
              <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {["Real AFL data, not guesses", "Updated weekly, every season", "Used by 1,000+ coaches"].map(t => (
                  <div key={t} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <Check size={11} style={{ color: "#2e8836" }} />
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.34)", fontWeight: 600 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: "#07090d", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "20px clamp(16px, 4vw, 32px)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.14)" }}>© {new Date().getFullYear()} Neeko Sports Stats</p>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            {[{ l: "Policies", t: "/policies" }, { l: "Contact", t: "/contact" }, { l: "About", t: "/about" }, { l: "FAQ", t: "/faq" }].map(x => (
              <Link key={x.t} to={x.t}
                style={{ fontSize: 11, color: "rgba(255,255,255,0.16)", textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.48)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.16)"; }}
              >{x.l}</Link>
            ))}
          </div>
        </div>
      </footer>

      {!isPremium && <MobileUpgradeBar />}
    </div>
  );
}
