import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  Crown, ArrowRight, Check, TrendingUp, TriangleAlert as AlertTriangle,
  Star, ChartBar as BarChart3, GitCompare, Bookmark, ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { NEEKO_PRICING } from "@/config/neekoPricing";
import MobileUpgradeBar from "@/components/mobile/MobileUpgradeBar";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";

const BUY_SIGNALS   = ["STRONG_UP","STRONG_BUY","MUST_HAVE","BREAKOUT","UP","BUY"];
const AVOID_SIGNALS = ["STRONG_DOWN","STRONG_SELL","AVOID","DO_NOT_START","DOWN","SELL"];
function resolveSignal(r: RankingRow) { return ((r.action ?? r.signal_tag ?? r.signal ?? "")).toUpperCase(); }
function isBuy(r: RankingRow)   { return BUY_SIGNALS.includes(resolveSignal(r)); }
function isAvoid(r: RankingRow) { return AVOID_SIGNALS.includes(resolveSignal(r)); }
function isPlayable(p: RankingRow) {
  const ms = (p.manual_status ?? "").toUpperCase();
  return ms !== "OUT" && ms !== "INJURED" && !p.is_bye && !p.is_injured;
}

const MOCK = {
  mustBuy: { player_name: "Rowan Marshall",  team: "St Kilda Saints", position: "RUC", projection: 114, season_avg: 98, price_change: 15000 },
  trap:    { player_name: "Zac Bailey",      team: "Brisbane Lions",  position: "MID", projection: 82,  season_avg: 105, price_change: -12000 },
  captain: { player_name: "Dayne Zorko",     team: "Brisbane Lions",  position: "DEF", projection: 132, season_avg: 118, price_change: 8000 },
  value:   { player_name: "Finn Callaghan",  team: "GWS Giants",      position: "MID", projection: 120, season_avg: 109, price_change: 17000 },
};

function WallTexture() {
  return (
    <svg style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0, opacity: 0.045 }} xmlns="http://www.w3.org/2000/svg">
      <filter id="wn">
        <feTurbulence type="fractalNoise" baseFrequency="0.62" numOctaves="4" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#wn)" />
    </svg>
  );
}

function ChalkDiagram() {
  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 900 280"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="rgba(255,255,255,0.5)" />
        </marker>
        <filter id="chalk">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" />
        </filter>
      </defs>

      {/* Field lines - left side mostly */}
      <line x1="30" y1="140" x2="130" y2="70" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" markerEnd="url(#arr)" filter="url(#chalk)" />
      <line x1="30" y1="200" x2="130" y2="160" stroke="rgba(255,255,255,0.22)" strokeWidth="1.3" markerEnd="url(#arr)" filter="url(#chalk)" />
      <line x1="30" y1="60" x2="100" y2="110" stroke="rgba(255,255,255,0.20)" strokeWidth="1.2" strokeDasharray="5,4" markerEnd="url(#arr)" />

      {/* Ellipse field */}
      <ellipse cx="155" cy="140" rx="100" ry="70" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" fill="none" strokeDasharray="10,7" filter="url(#chalk)" />

      {/* X/O marks */}
      <text x="20" y="55" fontSize="18" fontFamily="serif" fill="rgba(255,255,255,0.50)" filter="url(#chalk)">✕</text>
      <text x="20" y="100" fontSize="14" fontFamily="serif" fill="rgba(255,255,255,0.40)">○</text>
      <text x="25" y="155" fontSize="16" fontFamily="serif" fill="rgba(255,255,255,0.45)" filter="url(#chalk)">✕</text>
      <text x="22" y="220" fontSize="14" fontFamily="serif" fill="rgba(255,255,255,0.35)">○</text>
      <text x="140" y="48" fontSize="14" fontFamily="serif" fill="rgba(255,255,255,0.38)">✕</text>
      <text x="220" y="60" fontSize="14" fontFamily="serif" fill="rgba(255,255,255,0.35)">○</text>

      {/* Right side arrows */}
      <line x1="870" y1="60" x2="820" y2="120" stroke="rgba(255,255,255,0.22)" strokeWidth="1.3" markerEnd="url(#arr)" strokeDasharray="5,4" />
      <line x1="870" y1="200" x2="800" y2="150" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" markerEnd="url(#arr)" />
      <text x="835" y="55" fontSize="16" fontFamily="serif" fill="rgba(255,255,255,0.40)">○</text>
      <text x="855" y="180" fontSize="14" fontFamily="serif" fill="rgba(255,255,255,0.35)">✕</text>

      {/* Zone labels */}
      <text x="8" y="25" fontSize="8.5" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif" fontWeight="600" letterSpacing="1">BACKS</text>
      <text x="8" y="130" fontSize="8.5" fill="rgba(255,255,255,0.30)" fontFamily="sans-serif" fontWeight="600" letterSpacing="1">1MLTBACK</text>
      <text x="8" y="190" fontSize="8.5" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif" fontWeight="600" letterSpacing="1">CENTER</text>

      {/* Horizontal dividers */}
      <line x1="0" y1="40" x2="280" y2="40" stroke="rgba(255,255,255,0.12)" strokeWidth="0.6" />
      <line x1="0" y1="145" x2="280" y2="145" stroke="rgba(255,255,255,0.10)" strokeWidth="0.6" />
      <line x1="0" y1="230" x2="280" y2="230" stroke="rgba(255,255,255,0.08)" strokeWidth="0.6" />
    </svg>
  );
}

function BoardGrain() {
  return (
    <>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.022 }} xmlns="http://www.w3.org/2000/svg">
        <filter id="bg2">
          <feTurbulence type="fractalNoise" baseFrequency="0.80" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#bg2)" />
      </svg>
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 30px, rgba(70,48,18,0.038) 30px, rgba(70,48,18,0.038) 31px)",
      }} />
    </>
  );
}

function Pin({ color }: { color: string }) {
  return (
    <div style={{ position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 30 }}>
      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        background: `radial-gradient(circle at 32% 28%, #fff8 0%, ${color} 45%, ${color}bb 100%)`,
        boxShadow: `0 3px 8px ${color}66, 0 1px 3px rgba(0,0,0,0.40)`,
        border: "1.5px solid rgba(0,0,0,0.18)",
        position: "relative",
      }}>
        <div style={{ position: "absolute", top: 4, left: 4, width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.52)" }} />
      </div>
      <div style={{ width: 3, height: 11, background: `${color}aa`, borderRadius: "0 0 2px 2px" }} />
    </div>
  );
}

function PlayerAvatar({ name, accentColor }: { name: string; accentColor: string }) {
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{
      width: 46, height: 46, borderRadius: "50%",
      background: `linear-gradient(135deg, ${accentColor}22 0%, ${accentColor}44 100%)`,
      border: `2px solid ${accentColor}40`,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
      boxShadow: `0 2px 8px ${accentColor}30`,
      overflow: "hidden",
      position: "relative",
    }}>
      <div style={{
        position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: 30, height: 36,
        background: `linear-gradient(180deg, ${accentColor}33 0%, ${accentColor}66 100%)`,
        borderRadius: "50% 50% 0 0",
      }} />
      <div style={{
        position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)",
        width: 20, height: 20, borderRadius: "50%",
        background: `linear-gradient(135deg, ${accentColor}66 0%, ${accentColor}99 100%)`,
      }} />
      <span style={{
        position: "relative", zIndex: 1,
        fontSize: 11, fontWeight: 900, color: accentColor,
        letterSpacing: "-0.02em", marginTop: 12,
      }}>{initials}</span>
    </div>
  );
}

type CardData = {
  label: string;
  labelIcon: React.ReactNode;
  accentColor: string;
  headerBg: string;
  borderColor: string;
  pinColor: string;
  playerName: string;
  team: string;
  position?: string | null;
  projection?: number | null;
  priceChange?: number | null;
  alsoList: string[];
  ctaLabel: string;
  ctaTo: string;
  rotation: number;
  badge?: string;
};

function PrintedCard({ label, labelIcon, accentColor, headerBg, borderColor, pinColor, playerName, team, position, projection, priceChange, alsoList, ctaLabel, ctaTo, rotation, badge }: CardData) {
  const pts = projection != null ? Math.round(projection) : null;
  const priceUp = priceChange != null && priceChange > 0;
  const priceStr = priceChange != null ? `${priceUp ? "+" : ""}${Math.round(priceChange / 1000)}` : null;

  return (
    <div style={{ position: "relative", flex: "1 1 0", minWidth: 0, paddingTop: 22, transform: `rotate(${rotation}deg)`, transformOrigin: "top center" }}>
      <Pin color={pinColor} />
      <Link to={ctaTo} style={{ display: "block", textDecoration: "none" }}>
        <div
          style={{
            background: "#fefdf8",
            border: `1px solid ${borderColor}`,
            boxShadow: "2px 3px 6px rgba(0,0,0,0.08), 4px 8px 20px rgba(0,0,0,0.10), 0 20px 40px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.95)",
            transition: "transform 0.18s, box-shadow 0.18s",
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.transform = "translateY(-6px)";
            el.style.boxShadow = "3px 6px 12px rgba(0,0,0,0.12), 6px 14px 32px rgba(0,0,0,0.16), 0 30px 60px rgba(0,0,0,0.10)";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.transform = "";
            el.style.boxShadow = "2px 3px 6px rgba(0,0,0,0.08), 4px 8px 20px rgba(0,0,0,0.10), 0 20px 40px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.95)";
          }}
        >
          {/* Header strip */}
          <div style={{
            background: headerBg,
            padding: "6px 8px 5px",
            borderBottom: `2px solid ${accentColor}25`,
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{ color: accentColor, display: "flex", alignItems: "center" }}>{labelIcon}</span>
            <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: accentColor, flex: 1 }}>{label}</span>
            {position && (
              <span style={{ fontSize: 7, fontWeight: 900, textTransform: "uppercase", background: `${accentColor}22`, color: accentColor, padding: "1px 5px", borderRadius: 2 }}>{position}</span>
            )}
            {badge && (
              <span style={{ fontSize: 7, fontWeight: 900, textTransform: "uppercase", background: accentColor, color: "#fff", padding: "2px 5px", borderRadius: 2 }}>{badge}</span>
            )}
          </div>

          {/* Player row */}
          <div style={{ padding: "8px 8px 2px", display: "flex", alignItems: "center", gap: 7 }}>
            <PlayerAvatar name={playerName} accentColor={accentColor} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13.5, fontWeight: 800, color: "#1a1208", lineHeight: 1.15, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{playerName}</p>
              <p style={{ fontSize: 8, color: "#9a8060", marginTop: 2, fontWeight: 600 }}>{team}</p>
            </div>
          </div>

          {/* Score row */}
          <div style={{ padding: "2px 8px 5px", display: "flex", alignItems: "baseline", gap: 5 }}>
            {pts != null ? (
              <>
                <span style={{ fontSize: 30, fontWeight: 900, color: accentColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{pts}</span>
                <span style={{ fontSize: 9.5, color: "#b09070", fontWeight: 700 }}>pts</span>
                {priceStr && (
                  <span style={{ fontSize: 9, fontWeight: 800, color: priceUp ? "#2a7a38" : "#a81e1e", marginLeft: 4, background: priceUp ? "#e8f5ea" : "#fce8e8", padding: "1px 5px", borderRadius: 2 }}>
                    {priceUp ? "▲" : "▼"}{priceStr}
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize: 14, color: "#ccc", fontWeight: 700 }}>—</span>
            )}
          </div>

          {/* Also list */}
          <div style={{ padding: "0 8px 6px", display: "flex", flexDirection: "column", gap: 3 }}>
            {alsoList.map((name, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 5, height: 5, background: `${accentColor}70`, borderRadius: 1, flexShrink: 0 }} />
                <span style={{ fontSize: 8, color: "#7a6040", fontWeight: 600 }}>{name}</span>
                <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.06)", marginLeft: 2 }} />
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{ padding: "0 7px 8px" }}>
            <div style={{
              background: accentColor,
              color: "#fff",
              fontSize: 8.5, fontWeight: 800,
              textAlign: "center",
              padding: "6px 8px",
              letterSpacing: "0.05em",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
            }}>
              {ctaLabel} <ChevronRight size={8} />
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

function StickyNote({ text, color, style }: { text: string; color: string; style?: React.CSSProperties }) {
  return (
    <div style={{
      position: "absolute",
      background: color,
      padding: "7px 8px",
      fontSize: 7, fontWeight: 700,
      color: "rgba(0,0,0,0.58)",
      lineHeight: 1.5,
      boxShadow: "2px 4px 10px rgba(0,0,0,0.18)",
      maxWidth: 76,
      ...style,
    }}>{text}</div>
  );
}

function MarkerPen({ color, left, rotate = 0 }: { color: string; left: number; rotate?: number }) {
  return (
    <div style={{
      position: "absolute", left, bottom: 5,
      width: 56, height: 14,
      borderRadius: "3px 9px 9px 3px",
      background: `linear-gradient(180deg, ${color}ee 0%, ${color} 50%, ${color}cc 100%)`,
      transform: `rotate(${rotate}deg)`,
      boxShadow: "0 2px 5px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.28)",
      transformOrigin: "center",
    }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 9, background: "rgba(0,0,0,0.18)", borderRadius: "3px 0 0 3px" }} />
      <div style={{ position: "absolute", right: 0, top: 2, bottom: 2, width: 5, background: "rgba(0,0,0,0.22)", borderRadius: "0 4px 4px 0" }} />
    </div>
  );
}

export default function Index() {
  const { isPremium } = useAuth();
  const [players, setPlayers] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_rankings_safe", { p_user_id: null, p_is_bot: false, p_limit: 200 });
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
    const captainP = byCap.find(p => p.player_id !== mustBuyP?.player_id && p.player_id !== trapP?.player_id) ?? null;
    const valueP   = buys.find(p => p.player_id !== mustBuyP?.player_id && (p.price ?? 999999) < 650000) ?? buys[1] ?? null;
    return { mustBuyP, trapP, captainP, valueP };
  }, [players]);

  const mustBuy = mustBuyP ?? MOCK.mustBuy;
  const trap    = trapP    ?? MOCK.trap;
  const captain = captainP ?? MOCK.captain;
  const value   = valueP   ?? MOCK.value;

  const buyAlso  = players.filter(isBuy).filter(p => p.player_id !== mustBuyP?.player_id).slice(0, 1).map(p => p.player_name);
  const trapAlso = players.filter(isAvoid).filter(p => p.player_id !== trapP?.player_id).slice(0, 1).map(p => p.player_name);
  const capAlso  = players.filter(p => p.player_id !== captainP?.player_id).sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0)).slice(0, 1).map(p => p.player_name);

  const cards: CardData[] = [
    {
      label: "Must Buy", labelIcon: <TrendingUp size={10} />,
      accentColor: "#1a6628", headerBg: "linear-gradient(135deg, #e4f3e5 0%, #ceebd1 100%)",
      borderColor: "rgba(26,102,40,0.20)", pinColor: "#c0392b",
      playerName: mustBuy.player_name, team: mustBuy.team ?? "", position: mustBuy.position,
      projection: mustBuy.projection, priceChange: (mustBuy as RankingRow).price_change ?? (MOCK.mustBuy as typeof MOCK.mustBuy & { price_change?: number }).price_change,
      alsoList: buyAlso.length > 0 ? [buyAlso[0], "Will Aschroft"] : ["Clayton Oliver", "Will Aschroft"],
      ctaLabel: "View Must Buys", ctaTo: "/sports/afl/current-round", rotation: -1.2,
    },
    {
      label: "Trap Alerts", labelIcon: <AlertTriangle size={10} />,
      accentColor: "#9e1c1c", headerBg: "linear-gradient(135deg, #fce8e8 0%, #f5d2d2 100%)",
      borderColor: "rgba(158,28,28,0.18)", pinColor: "#c0392b",
      playerName: trap.player_name, team: trap.team ?? "", position: trap.position,
      projection: trap.projection, priceChange: (trap as RankingRow).price_change ?? -12000,
      alsoList: trapAlso.length > 0 ? [trapAlso[0], "+5 more"] : ["Clayton Oliver", "+5 more"],
      ctaLabel: "View Trap Alerts", ctaTo: "/sports/afl/current-round", rotation: 0.7,
    },
    {
      label: "Captain Picks", labelIcon: <Star size={10} />, badge: "CAPTAIN",
      accentColor: "#7a4e00", headerBg: "linear-gradient(135deg, #fdf4dc 0%, #f8e8b0 100%)",
      borderColor: "rgba(122,78,0,0.18)", pinColor: "#e67e22",
      playerName: captain.player_name, team: captain.team ?? "", position: captain.position,
      projection: captain.projection, priceChange: (captain as RankingRow).price_change ?? 8000,
      alsoList: capAlso.length > 0 ? [capAlso[0], "+2 more"] : ["Harry Sheezel", "+2 more"],
      ctaLabel: "View Captains", ctaTo: "/sports/afl/captains", rotation: -0.5,
    },
    {
      label: "Best Value", labelIcon: <BarChart3 size={10} />,
      accentColor: "#124e7a", headerBg: "linear-gradient(135deg, #e0eef9 0%, #c8e0f4 100%)",
      borderColor: "rgba(18,78,122,0.18)", pinColor: "#2471a3",
      playerName: value.player_name, team: value.team ?? "", position: value.position,
      projection: value.projection, priceChange: (value as RankingRow).price_change ?? 17000,
      alsoList: ["Harry Sheezel", "+3 more"],
      ctaLabel: "Open Market Watch", ctaTo: "/sports/afl/market-watch", rotation: 1.0,
    },
  ];

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#e5dfd3", overflowX: "hidden" }}>
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

      <WallTexture />

      {/* Vignette */}
      <div style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none", background: "radial-gradient(ellipse at 50% 35%, transparent 50%, rgba(0,0,0,0.16) 100%)" }} />

      {/* ══ MAIN SCENE ══ */}
      <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px 0" }}>

        {/* ══ BOARD WRAPPER ══ */}
        <div style={{ width: "100%", maxWidth: 1140, position: "relative" }}>

          {/* Sticky notes on left side of frame */}
          <StickyNote
            text={"Round 7\nAnalysis\nComplete\n✓ Done"}
            color="#fde68a"
            style={{ left: -18, top: 60, zIndex: 10, transform: "rotate(-3deg)" }}
          />
          <StickyNote
            text={"Clayton\nOliver\nWatch!"}
            color="#a7f3d0"
            style={{ left: -14, top: 170, zIndex: 10, transform: "rotate(2deg)" }}
          />
          {/* Right side */}
          <StickyNote
            text={"Breakout\nAlerts\nLive"}
            color="#fca5a5"
            style={{ right: -14, top: 80, zIndex: 10, transform: "rotate(3deg)" }}
          />

          {/* ── OUTER WOODEN FRAME ── */}
          <div style={{
            background: "linear-gradient(155deg, #7e5522 0%, #5e3c10 35%, #6c4618 65%, #7e5522 100%)",
            padding: "11px 11px 0",
            borderRadius: 8,
            boxShadow: "0 7px 0 #3a1e04, 0 12px 48px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,255,255,0.11), inset 0 -1px 0 rgba(0,0,0,0.28)",
            position: "relative",
          }}>
            {/* Wood grain */}
            <div style={{
              position: "absolute", inset: 0, borderRadius: 8, pointerEvents: "none",
              backgroundImage: "repeating-linear-gradient(91deg, transparent 0px, transparent 20px, rgba(0,0,0,0.035) 20px, rgba(0,0,0,0.035) 21px)",
            }} />
            {/* Inner bevel */}
            <div style={{
              position: "absolute", inset: 0, borderRadius: 8, pointerEvents: "none",
              boxShadow: "inset 5px 5px 14px rgba(0,0,0,0.32), inset -4px -4px 10px rgba(0,0,0,0.18)",
            }} />

            {/* ── CHALKBOARD HEADER PANEL ── */}
            <div style={{
              position: "relative",
              background: "linear-gradient(175deg, #252e1f 0%, #1c2318 50%, #23291d 100%)",
              padding: "28px 24px 26px",
              overflow: "hidden",
            }}>
              <ChalkDiagram />

              {/* Bottom chalk dust smear */}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 10, background: "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.025) 100%)", pointerEvents: "none" }} />

              {/* Hero content — centered, takes up right ~65% so diagram fits left */}
              <div style={{ position: "relative", zIndex: 10, textAlign: "center", maxWidth: 600, margin: "0 auto" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14 }}>
                  <img src="/logo.png" alt="Neeko" style={{ height: 26, opacity: 0.88 }} />
                </div>

                <h1 style={{
                  fontSize: "clamp(1.7rem, 3.8vw, 2.55rem)",
                  fontWeight: 900, lineHeight: 1.06, letterSpacing: "-0.02em",
                  color: "#fff", textShadow: "0 2px 28px rgba(0,0,0,0.65)",
                  marginBottom: 10,
                }}>
                  Win Your <span style={{ color: "#F5C84C" }}>AFL Fantasy</span>
                  <br />Week in 30 Seconds
                </h1>

                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.48)", marginBottom: 22, lineHeight: 1.55, fontWeight: 500 }}>
                  Trades, targets, captains, and traps — powered by data, just like an AFL coach.
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 16 }}>
                  <Link to="/auth" style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "#F5C84C", color: "#1a0e00",
                    fontWeight: 800, fontSize: 13,
                    padding: "10px 26px", borderRadius: 4, textDecoration: "none",
                    boxShadow: "0 3px 14px rgba(245,200,76,0.45), inset 0 1px 0 rgba(255,255,255,0.32)",
                    border: "1px solid rgba(245,200,76,0.6)", letterSpacing: "0.02em",
                  }}>
                    Get Started Free <ArrowRight size={13} />
                  </Link>
                  {!isPremium && (
                    <Link to="/neeko-plus" style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: "rgba(245,200,76,0.10)", color: "#F5C84C",
                      fontWeight: 800, fontSize: 13,
                      padding: "10px 26px", borderRadius: 4, textDecoration: "none",
                      border: "1.5px solid rgba(245,200,76,0.38)", letterSpacing: "0.02em",
                    }}>
                      <Crown size={13} /> Unlock Full Access
                    </Link>
                  )}
                </div>

                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", letterSpacing: "0.03em" }}>
                  Updated before every AFL Fantasy round lockout — 630+ players fully analysed weekly.
                </p>
              </div>
            </div>

            {/* ── WHITEBOARD SURFACE ── */}
            <div style={{ position: "relative", background: "linear-gradient(165deg, #f3efe2 0%, #ece6d0 55%, #e6e0c8 100%)", overflow: "hidden" }}>
              <BoardGrain />

              {/* Coach's Whiteboard label */}
              <p style={{
                textAlign: "center", fontSize: 10.5, fontWeight: 900,
                letterSpacing: "0.40em", textTransform: "uppercase",
                color: "rgba(72,45,12,0.36)", paddingTop: 16, marginBottom: 14,
                position: "relative", zIndex: 10,
              }}>
                Coach's Whiteboard
              </p>

              {/* ── CARDS ROW ── */}
              <div style={{ position: "relative", zIndex: 10, padding: "0 16px" }}>

                {/* Desktop */}
                <div className="hidden md:flex" style={{ gap: 12, alignItems: "flex-start" }}>
                  {loading
                    ? [0,1,2,3].map(i => (
                        <div key={i} style={{
                          flex: "1 1 0", height: 280,
                          background: "rgba(255,255,255,0.60)", border: "1px solid rgba(0,0,0,0.06)",
                          transform: `rotate(${[-1.2, 0.7, -0.5, 1.0][i]}deg)`, marginTop: 22,
                        }} className="animate-pulse" />
                      ))
                    : cards.map(c => <PrintedCard key={c.label} {...c} />)
                  }
                </div>

                {/* Mobile */}
                <div className="md:hidden flex flex-col" style={{ gap: 28 }}>
                  {loading
                    ? [0,1,2,3].map(i => (
                        <div key={i} style={{ height: 220, background: "rgba(255,255,255,0.60)", border: "1px solid rgba(0,0,0,0.06)" }} className="animate-pulse" />
                      ))
                    : cards.map(c => <PrintedCard key={c.label} {...c} rotation={0} />)
                  }
                </div>
              </div>

              {/* ── BUTTON ROW ── */}
              <div className="hidden md:flex" style={{ gap: 8, padding: "14px 16px 0", position: "relative", zIndex: 10 }}>
                {[
                  { label: "View Must Buys",    to: "/sports/afl/current-round", color: "#1a6628" },
                  { label: "View Trap Alerts",  to: "/sports/afl/current-round", color: "#9e1c1c" },
                  { label: "View Captains",     to: "/sports/afl/captains",      color: "#7a4e00" },
                  { label: "Open Market Watch", to: "/sports/afl/market-watch",  color: "#124e7a" },
                ].map(({ label, to, color }) => (
                  <Link key={label} to={to} style={{
                    flex: 1, textAlign: "center",
                    fontSize: 10.5, fontWeight: 700, color,
                    background: `${color}0e`,
                    border: `1px solid ${color}28`,
                    padding: "6px 8px", textDecoration: "none",
                    letterSpacing: "0.04em", borderRadius: 3,
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55), 0 1px 3px rgba(0,0,0,0.07)",
                  }}>
                    {label} ›
                  </Link>
                ))}
              </div>

              {/* ── ICON ROW ── */}
              <div style={{
                display: "flex", flexWrap: "wrap", gap: "8px 20px",
                justifyContent: "center", alignItems: "center",
                padding: "12px 16px 0",
                borderTop: "1px solid rgba(72,45,12,0.09)", marginTop: 12,
                position: "relative", zIndex: 10,
              }}>
                {[
                  { to: "/sports/afl/current-round", icon: <GitCompare size={15} />, label: "Compare Players", color: "#1a6628" },
                  { to: "/sports/afl/rankings",      icon: <Bookmark size={15} />,   label: "Watchlist",       color: "#7a4e00" },
                  { to: "/sports/afl/current-round", icon: <AlertTriangle size={15} />, label: "Trap Alerts", color: "#9e1c1c" },
                  { to: "/sports/afl/rankings",      icon: <Star size={15} />,       label: "Full Rankings",   color: "#124e7a" },
                ].map(({ to, icon, label, color }) => (
                  <Link key={label} to={to} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    fontSize: 12, fontWeight: 700, color: "rgba(50,30,8,0.48)",
                    textDecoration: "none", transition: "color 0.15s",
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = color; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(50,30,8,0.48)"; }}
                  >
                    <span style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 26, height: 26, borderRadius: "50%",
                      background: `${color}18`, border: `1.5px solid ${color}35`, color,
                    }}>{icon}</span>
                    {label}
                  </Link>
                ))}
                <span style={{ fontSize: 15, color: "rgba(50,30,8,0.25)", fontWeight: 700 }}>›</span>
              </div>

              {/* ── MICRO TRUST ROW ── */}
              <div style={{
                display: "flex", flexWrap: "wrap", gap: "5px 20px",
                justifyContent: "center", padding: "10px 16px 14px",
                position: "relative", zIndex: 10,
              }}>
                {[
                  "Updated before every round lockout",
                  "630+ players fully analysed weekly",
                  "Gives you edge, not opinion",
                ].map(t => (
                  <span key={t} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    fontSize: 9.5, fontWeight: 600, color: "rgba(50,30,8,0.30)",
                  }}>
                    <Check size={8} style={{ color: "#3a8040" }} /> {t}
                  </span>
                ))}
              </div>

              {/* Marker tray */}
              <div style={{
                height: 30, position: "relative",
                background: "linear-gradient(180deg, #b8a87a 0%, #a89460 100%)",
                boxShadow: "inset 0 3px 7px rgba(0,0,0,0.13), inset 0 -1px 0 rgba(0,0,0,0.08)",
                display: "flex", alignItems: "center",
              }}>
                <MarkerPen color="#e74c3c" left={22} rotate={-1.5} />
                <MarkerPen color="#27ae60" left={88} rotate={0.8} />
                <MarkerPen color="#2980b9" left={154} rotate={-2} />
                <MarkerPen color="#1a1208" left={220} rotate={1} />
                {/* Eraser */}
                <div style={{
                  position: "absolute", right: 44, bottom: 6,
                  width: 62, height: 16,
                  background: "linear-gradient(90deg, #e8dfc2 0%, #f0e8d0 50%, #e0d6bc 100%)",
                  borderRadius: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                  transform: "rotate(-1deg)",
                }} />
              </div>
            </div>

            {/* Bottom wooden rail */}
            <div style={{
              height: 18,
              background: "linear-gradient(180deg, #8c6430 0%, #5e3e12 100%)",
              boxShadow: "inset 0 -2px 5px rgba(0,0,0,0.22)",
            }} />
          </div>

          {/* Frame bottom shadow */}
          <div style={{
            height: 14,
            background: "linear-gradient(180deg, rgba(0,0,0,0.20) 0%, transparent 100%)",
            borderRadius: "0 0 5px 5px",
          }} />
        </div>

        {/* ══════════════════════════════════════════════
            CONTINUOUS SCENE — steps, pricing, footer
        ══════════════════════════════════════════════ */}

        {/* Steps section */}
        <div style={{ width: "100%", maxWidth: 1140, marginTop: 72 }}>
          <div style={{ textAlign: "center", marginBottom: 38 }}>
            <h2 style={{
              fontSize: "clamp(1.5rem, 3vw, 2.1rem)",
              fontWeight: 900, letterSpacing: "-0.025em", color: "#241808",
              textShadow: "0 1px 2px rgba(0,0,0,0.06)",
            }}>
              Win Your AFL Fantasy Week in 3 Easy Steps
            </h2>
            <p style={{ fontSize: 14, color: "rgba(36,24,8,0.46)", marginTop: 10, lineHeight: 1.6, maxWidth: 560, margin: "10px auto 0" }}>
              Driven by data, our insights help you make better trades, choose captains wisely, and spot costly traps.
            </p>
          </div>

          {/* Steps layout — laptop mockup left + 2 text blocks right */}
          <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 16, alignItems: "start" }}>
            {/* Laptop mockup */}
            <div style={{
              background: "rgba(255,255,255,0.38)", border: "1px solid rgba(0,0,0,0.07)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.07)", borderRadius: 4, padding: "16px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
            }}>
              {/* Laptop */}
              <div style={{ width: "100%", maxWidth: 200, position: "relative" }}>
                <div style={{
                  background: "linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)",
                  borderRadius: "6px 6px 0 0", padding: "6px 6px 0",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.30)",
                }}>
                  <div style={{
                    background: "#f3efe2", borderRadius: 3,
                    height: 120, overflow: "hidden", position: "relative",
                  }}>
                    {/* Mini ranking UI simulation */}
                    <div style={{ padding: "6px 8px" }}>
                      {[
                        { name: "Clayton Oliver", score: 128, color: "#1a6628" },
                        { name: "Celest Asilley", score: 102, color: "#9e1c1c" },
                      ].map((p, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, background: "rgba(255,255,255,0.8)", padding: "4px 6px", borderRadius: 2, border: "1px solid rgba(0,0,0,0.06)" }}>
                          <div style={{ width: 20, height: 20, borderRadius: "50%", background: `${p.color}33`, border: `1.5px solid ${p.color}50`, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 7, fontWeight: 700, color: "#1a1208" }}>{p.name}</div>
                            <div style={{ fontSize: 6, color: "#9a8060" }}>MID</div>
                          </div>
                          <div style={{ fontSize: 9, fontWeight: 900, color: p.color }}>{p.score}</div>
                          <div style={{ fontSize: 7, fontWeight: 800, color: "white", background: p.color, padding: "1px 4px", borderRadius: 2 }}>
                            {i === 0 ? "BUY" : "SELL"}
                          </div>
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        {["Must Buy", "Trap"].map((l, i) => (
                          <div key={i} style={{ flex: 1, background: i === 0 ? "#1a6628" : "#9e1c1c", color: "#fff", fontSize: 6, fontWeight: 800, textAlign: "center", padding: "3px 0", borderRadius: 2 }}>{l}</div>
                        ))}
                      </div>
                      <p style={{ fontSize: 6, color: "#9a8060", marginTop: 4 }}>Pafyn</p>
                    </div>
                  </div>
                </div>
                <div style={{ background: "#333", height: 8, borderRadius: "0 0 4px 4px", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }} />
                <div style={{ background: "#2a2a2a", height: 4, borderRadius: "0 0 6px 6px", margin: "0 16px" }} />
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.40)", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: "22px 20px", borderRadius: 4 }}>
              <p style={{ fontSize: 11.5, fontWeight: 900, color: "#1a6628", marginBottom: 8, letterSpacing: "0.04em" }}>1.</p>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: "#241808", marginBottom: 10, letterSpacing: "-0.01em" }}>See Expert Analysis</h3>
              <p style={{ fontSize: 13, color: "rgba(36,24,8,0.50)", lineHeight: 1.65 }}>Get weekly Must Buys, Trap Alerts, Captain Picks, and more, all backed by data.</p>
            </div>

            <div style={{ background: "rgba(255,255,255,0.40)", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: "22px 20px", borderRadius: 4 }}>
              <p style={{ fontSize: 11.5, fontWeight: 900, color: "#7a4e00", marginBottom: 8, letterSpacing: "0.04em" }}>2.</p>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: "#241808", marginBottom: 10, letterSpacing: "-0.01em" }}>Make Informed Trades</h3>
              <p style={{ fontSize: 13, color: "rgba(36,24,8,0.50)", lineHeight: 1.65 }}>Trade in form players and avoid failing traps, supported by our trending trade numbers.</p>
            </div>
          </div>
        </div>

        {/* Pricing section */}
        <div style={{ width: "100%", maxWidth: 1140, marginTop: 72 }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2.1rem)", fontWeight: 900, letterSpacing: "-0.025em", color: "#241808" }}>
              Unlock the Full Neeko Stats Suite
            </h2>
            <p style={{ fontSize: 13.5, color: "rgba(36,24,8,0.44)", marginTop: 10 }}>
              Try our full premium AFL Fantasy features. Instant access, cancel anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 16 }}>
            {/* Must Buy sample */}
            <div style={{
              background: "#fefdf8", border: "1px solid rgba(26,102,40,0.15)",
              boxShadow: "2px 3px 8px rgba(0,0,0,0.08), 5px 10px 22px rgba(0,0,0,0.08)",
              borderRadius: 3, overflow: "hidden",
            }}>
              <div style={{ background: "linear-gradient(135deg, #e4f3e5 0%, #ceebd1 100%)", padding: "6px 10px 5px", display: "flex", alignItems: "center", gap: 5, borderBottom: "1px solid rgba(26,102,40,0.15)" }}>
                <TrendingUp size={9} style={{ color: "#1a6628" }} />
                <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "#1a6628", flex: 1 }}>Must Buy</span>
                <span style={{ fontSize: 7, fontWeight: 900, background: "#1a662822", color: "#1a6628", padding: "1px 5px" }}>RUC</span>
              </div>
              <div style={{ padding: "8px 10px 3px", display: "flex", alignItems: "center", gap: 7 }}>
                <PlayerAvatar name="Christian Petracca" accentColor="#1a6628" />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "#1a1208" }}>Christian Petracca</p>
                  <p style={{ fontSize: 8, color: "#9a8060", fontWeight: 600 }}>B. Keldie Lions — RUC</p>
                </div>
              </div>
              <div style={{ padding: "2px 10px 5px", display: "flex", alignItems: "baseline", gap: 5 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: "#1a6628", lineHeight: 1 }}>114</span>
                <span style={{ fontSize: 9, color: "#b09070", fontWeight: 700 }}>pts</span>
              </div>
              <div style={{ padding: "0 10px 6px", display: "flex", flexDirection: "column", gap: 3 }}>
                {["Vinitica Apprient", "J+ Rinze Gepoott"].map((n, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Check size={8} style={{ color: "#1a6628" }} />
                    <span style={{ fontSize: 8, color: "#7a6040", fontWeight: 600 }}>{n}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: "0 8px 10px" }}>
                <Link to="/sports/afl/current-round" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, fontSize: 8.5, fontWeight: 800, color: "#fff", background: "#1a6628", padding: "6px 8px", textDecoration: "none" }}>
                  View Must Buys <ChevronRight size={8} />
                </Link>
              </div>
            </div>

            {/* Trap Alert sample */}
            <div style={{
              background: "#fefdf8", border: "1px solid rgba(158,28,28,0.15)",
              boxShadow: "2px 3px 8px rgba(0,0,0,0.08), 5px 10px 22px rgba(0,0,0,0.08)",
              borderRadius: 3, overflow: "hidden",
            }}>
              <div style={{ background: "linear-gradient(135deg, #fce8e8 0%, #f5d2d2 100%)", padding: "6px 10px 5px", display: "flex", alignItems: "center", gap: 5, borderBottom: "1px solid rgba(158,28,28,0.15)" }}>
                <AlertTriangle size={9} style={{ color: "#9e1c1c" }} />
                <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "#9e1c1c", flex: 1 }}>1Team Modfray</span>
                <span style={{ fontSize: 7, fontWeight: 900, background: "#9e1c1c22", color: "#9e1c1c", padding: "1px 5px" }}>RUC</span>
              </div>
              <div style={{ padding: "8px 10px 3px", display: "flex", alignItems: "center", gap: 7 }}>
                <PlayerAvatar name="Nick Daicos" accentColor="#9e1c1c" />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "#1a1208" }}>Nick Daicos</p>
                  <p style={{ fontSize: 8, color: "#9a8060", fontWeight: 600 }}>5 Keldie Lions — DEF</p>
                </div>
              </div>
              <div style={{ padding: "2px 10px 5px", display: "flex", alignItems: "baseline", gap: 5 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: "#9e1c1c", lineHeight: 1 }}>82</span>
                <span style={{ fontSize: 9, color: "#b09070", fontWeight: 700 }}>pts</span>
              </div>
              <div style={{ padding: "0 10px 6px", display: "flex", flexDirection: "column", gap: 3 }}>
                {["x2 more", "+3 trades"].map((n, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 5, height: 5, background: "#9e1c1c70", borderRadius: 1 }} />
                    <span style={{ fontSize: 8, color: "#7a6040", fontWeight: 600 }}>{n}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: "0 8px 10px" }}>
                <Link to="/sports/afl/current-round" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, fontSize: 8.5, fontWeight: 800, color: "#fff", background: "#9e1c1c", padding: "6px 8px", textDecoration: "none" }}>
                  View Trap Alerts <ChevronRight size={8} />
                </Link>
              </div>
            </div>

            {/* Pricing panel */}
            <div style={{
              background: "linear-gradient(160deg, #f4eed8 0%, #ece4c0 100%)",
              border: "1px solid rgba(90,58,14,0.20)",
              boxShadow: "2px 3px 8px rgba(0,0,0,0.08), 5px 10px 22px rgba(0,0,0,0.08)",
              borderRadius: 3, overflow: "hidden",
            }}>
              <div style={{ background: "rgba(80,48,10,0.09)", padding: "8px 14px", borderBottom: "1px solid rgba(80,48,10,0.12)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(70,42,8,0.55)" }}>
                  Complett Roundpack
                </span>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#c0392b" }} />
              </div>
              <div style={{ padding: "14px 16px 6px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(36,24,8,0.32)", textDecoration: "line-through" }}>Free</span>
                  <span style={{ fontSize: 27, fontWeight: 900, color: "#241808", lineHeight: 1 }}>${NEEKO_PRICING.yearly.monthlyEquivalent}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(36,24,8,0.38)" }}>/month</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 10px", marginBottom: 14 }}>
                  {[
                    ["Updated", "BonuDios."],
                    ["Must Buys.", "Trap Rusts"],
                    ["Treaps", "Captain Picks"],
                    ["Captaite.", "Full Rowdings"],
                  ].flat().map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Check size={8} style={{ color: "#3a7a40", flexShrink: 0 }} />
                      <span style={{ fontSize: 9.5, fontWeight: 600, color: "rgba(36,24,8,0.56)" }}>{f}</span>
                    </div>
                  ))}
                </div>
                <Link to="/neeko-plus" style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: "#F5C84C", color: "#1a0e00", fontWeight: 800, fontSize: 12,
                  padding: "9px 14px", borderRadius: 3, textDecoration: "none",
                  boxShadow: "0 2px 10px rgba(245,200,76,0.40), inset 0 1px 0 rgba(255,255,255,0.32)",
                  border: "1px solid rgba(245,200,76,0.55)", letterSpacing: "0.04em",
                }}>
                  <Crown size={11} /> Unlock Full Access ›
                </Link>
              </div>
              {/* Sticky note on pricing card */}
              <div style={{ padding: "6px 8px 10px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["REMIDIS", "All the Math:\nOur formula\nBeats the rest"].map((t, i) => (
                  <div key={i} style={{
                    background: i === 0 ? "#fde68a" : "#fde68a",
                    padding: "4px 6px", fontSize: 6.5, fontWeight: 700,
                    color: "rgba(0,0,0,0.55)", lineHeight: 1.4,
                    boxShadow: "1px 2px 4px rgba(0,0,0,0.12)",
                    transform: `rotate(${i === 0 ? -2 : 1}deg)`,
                  }}>{t}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          width: "100%", maxWidth: 1140,
          marginTop: 56, paddingTop: 18, paddingBottom: 18,
          borderTop: "1px solid rgba(36,24,8,0.08)",
          display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12,
        }}>
          <p style={{ fontSize: 10.5, color: "rgba(36,24,8,0.26)" }}>© {new Date().getFullYear()} Neeko Sports Stats</p>
          <div style={{ display: "flex", gap: 20 }}>
            {[{ l: "Policies", t: "/policies" },{ l: "Contact", t: "/contact" },{ l: "About", t: "/about" },{ l: "FAQ", t: "/faq" }].map(x => (
              <Link key={x.t} to={x.t} style={{ fontSize: 10.5, color: "rgba(36,24,8,0.26)", textDecoration: "none" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(36,24,8,0.58)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(36,24,8,0.26)"; }}
              >{x.l}</Link>
            ))}
          </div>
        </div>
      </div>

      {/* ══ WOODEN DESK (bottom) ══ */}
      <div style={{
        position: "relative", zIndex: 3,
        height: 115,
        background: "linear-gradient(180deg, #8c6430 0%, #6c4c1a 28%, #5c3e12 65%, #4c3008 100%)",
        boxShadow: "0 -8px 36px rgba(0,0,0,0.32), inset 0 3px 0 rgba(255,255,255,0.055)",
        overflow: "hidden",
      }}>
        {/* Wood grain */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(90deg, transparent 0px, transparent 24px, rgba(0,0,0,0.038) 24px, rgba(0,0,0,0.038) 25px)" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(180deg, transparent 0px, transparent 9px, rgba(255,255,255,0.012) 9px, rgba(255,255,255,0.012) 10px)" }} />
        {/* Top shadow edge */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 16, background: "linear-gradient(180deg, rgba(0,0,0,0.24) 0%, transparent 100%)" }} />

        {/* Desk items */}
        <div style={{ position: "relative", height: "100%", maxWidth: 1140, margin: "0 auto", padding: "0 24px" }}>
          {/* Whistle */}
          <div style={{
            position: "absolute", right: 90, top: 20,
            width: 58, height: 18,
            background: "linear-gradient(135deg, #d8ac24 0%, #bc9014 50%, #cca420 100%)",
            borderRadius: "8px 3px 3px 8px",
            boxShadow: "0 2px 7px rgba(0,0,0,0.32)", transform: "rotate(-26deg)",
          }}>
            <div style={{ position: "absolute", right: -9, top: 3, width: 15, height: 12, borderRadius: 6, background: "#a07c08", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.3)" }} />
          </div>
          {/* Lanyard */}
          <div style={{ position: "absolute", right: 116, top: 28, width: 28, height: 18, border: "1.5px solid rgba(200,160,40,0.60)", borderBottom: "none", borderRadius: "0 0 8px 8px", transform: "rotate(-26deg)" }} />

          {/* Oval football */}
          <div style={{
            position: "absolute", right: 18, top: 14,
            width: 74, height: 50,
            background: "radial-gradient(ellipse at 38% 32%, #a06428 0%, #7c4018 48%, #5c2c0e 100%)",
            borderRadius: "50% 55% 55% 50% / 40% 45% 45% 40%",
            boxShadow: "2px 4px 16px rgba(0,0,0,0.42), inset -3px -3px 9px rgba(0,0,0,0.28), inset 2px 2px 6px rgba(255,255,255,0.055)",
            transform: "rotate(-10deg)",
          }}>
            <div style={{ position: "absolute", top: "44%", left: "28%", right: "28%", height: 1.5, background: "rgba(255,255,255,0.28)", borderRadius: 1 }} />
            <div style={{ position: "absolute", top: "30%", left: "46%", width: 1.5, height: "34%", background: "rgba(255,255,255,0.22)", borderRadius: 1 }} />
          </div>

          {/* Clipboard */}
          <div style={{
            position: "absolute", left: 20, top: 6,
            width: 66, height: 85,
            background: "linear-gradient(175deg, #d4c8a0 0%, #c6b888 100%)",
            borderRadius: "3px 3px 2px 2px",
            boxShadow: "2px 3px 11px rgba(0,0,0,0.32)", transform: "rotate(5deg)",
          }}>
            <div style={{ position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)", width: 26, height: 11, background: "#8a7850", borderRadius: "3px 3px 0 0", boxShadow: "0 1px 4px rgba(0,0,0,0.28)" }} />
            <div style={{ position: "absolute", top: 15, left: 7, right: 7 }}>
              {[0,1,2,3,4].map(i => <div key={i} style={{ height: 1.5, background: "rgba(0,0,0,0.11)", marginBottom: 8, borderRadius: 1 }} />)}
            </div>
          </div>
        </div>
      </div>

      {!isPremium && <MobileUpgradeBar />}
    </div>
  );
}
