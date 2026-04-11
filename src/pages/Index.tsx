import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  Crown, ArrowRight, Check, TrendingUp, TriangleAlert as AlertTriangle,
  Star, ChartBar as BarChart3, GitCompare, ArrowUp, Bookmark,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { NEEKO_PRICING } from "@/config/neekoPricing";
import MobileUpgradeBar from "@/components/mobile/MobileUpgradeBar";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";

// ─── Signal logic ─────────────────────────────────────────────────────────────
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
  mustBuy: { player_name: "Rowan Marshall",  team: "St Kilda Saints", position: "RUC", projection: 114 },
  trap:    { player_name: "Zac Bailey",      team: "Brisbane Lions",  position: "MID", projection: 82  },
  captain: { player_name: "Dayne Zorko",     team: "Brisbane Lions",  position: "DEF", projection: 132 },
  value:   { player_name: "Finn Callaghan",  team: "GWS Giants",      position: "MID", projection: 120 },
};

// ─── Wall texture ─────────────────────────────────────────────────────────────
function WallTexture() {
  return (
    <svg
      style={{
        position: "fixed", inset: 0, width: "100%", height: "100%",
        pointerEvents: "none", zIndex: 0, opacity: 0.04,
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <filter id="wall-noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="4" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#wall-noise)" />
    </svg>
  );
}

// ─── Chalk drawing lines on dark panel ────────────────────────────────────────
function ChalkDiagram() {
  return (
    <svg
      style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        pointerEvents: "none", opacity: 0.12,
      }}
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="white" />
        </marker>
      </defs>
      <ellipse cx="50%" cy="60%" rx="28%" ry="22%" stroke="white" strokeWidth="1.2" fill="none" strokeDasharray="10 7" />
      <line x1="12%" y1="75%" x2="28%" y2="58%" stroke="white" strokeWidth="1.2" markerEnd="url(#arr)" />
      <line x1="85%" y1="72%" x2="70%" y2="56%" stroke="white" strokeWidth="1.2" markerEnd="url(#arr)" />
      <line x1="50%" y1="20%" x2="50%" y2="38%" stroke="white" strokeWidth="1.2" markerEnd="url(#arr)" />
      <line x1="22%" y1="30%" x2="38%" y2="45%" stroke="white" strokeWidth="1" strokeDasharray="4 4" />
      <line x1="78%" y1="28%" x2="62%" y2="44%" stroke="white" strokeWidth="1" strokeDasharray="4 4" />
      <text x="9%" y="38%" fontSize="16" fontFamily="serif" fill="white" opacity="0.8">✕</text>
      <text x="83%" y="35%" fontSize="14" fontFamily="serif" fill="white" opacity="0.8">○</text>
      <text x="9%" y="82%" fontSize="14" fontFamily="serif" fill="white" opacity="0.7">○</text>
      <text x="85%" y="80%" fontSize="16" fontFamily="serif" fill="white" opacity="0.8">✕</text>
      <line x1="0" y1="15%" x2="100%" y2="15%" stroke="white" strokeWidth="0.4" opacity="0.3" />
      <line x1="0" y1="85%" x2="100%" y2="85%" stroke="white" strokeWidth="0.4" opacity="0.3" />
      <text x="2%" y="14%" fontSize="9" fill="white" opacity="0.5" fontFamily="sans-serif">BACKS</text>
      <text x="2%" y="52%" fontSize="9" fill="white" opacity="0.5" fontFamily="sans-serif">CENTER</text>
      <text x="2%" y="84%" fontSize="9" fill="white" opacity="0.5" fontFamily="sans-serif">FORWARD</text>
    </svg>
  );
}

// ─── Board grain / ruled lines texture ────────────────────────────────────────
function BoardTexture() {
  return (
    <>
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.025 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="board-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#board-grain)" />
      </svg>
      <div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 28px, rgba(80,55,20,0.045) 28px, rgba(80,55,20,0.045) 29px)",
        }}
      />
    </>
  );
}

// ─── Board corner markings (coach scribbles) ──────────────────────────────────
function BoardScribbles() {
  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.07 }}
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M 40 350 Q 120 280 200 340 Q 280 400 200 460" stroke="#4a3010" strokeWidth="1.5" fill="none" strokeDasharray="6 5" />
      <path d="M 820 60 Q 900 140 860 220" stroke="#4a3010" strokeWidth="1.5" fill="none" strokeDasharray="5 5" />
      <text x="20" y="180" fontSize="18" fontFamily="serif" fill="#4a3010">✕</text>
      <text x="850" y="320" fontSize="16" fontFamily="serif" fill="#4a3010">○</text>
    </svg>
  );
}

// ─── Push pin component ───────────────────────────────────────────────────────
function Pin({ color }: { color: string }) {
  return (
    <div style={{ position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 30 }}>
      <div style={{
        width: 20, height: 20, borderRadius: "50%",
        background: `radial-gradient(circle at 33% 28%, ${color}ff 0%, ${color} 50%, ${color}99 100%)`,
        boxShadow: `0 3px 6px ${color}55, 0 1px 3px rgba(0,0,0,0.35)`,
        border: "1.5px solid rgba(0,0,0,0.18)",
        position: "relative",
      }}>
        <div style={{ position: "absolute", top: 4, left: 4, width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.55)" }} />
      </div>
      <div style={{ width: 2.5, height: 10, background: `${color}99`, borderRadius: "0 0 2px 2px" }} />
    </div>
  );
}

// ─── Paper clip ───────────────────────────────────────────────────────────────
function Clip() {
  return (
    <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", zIndex: 30 }}>
      <svg width="28" height="20" viewBox="0 0 28 20">
        <path d="M 4 18 L 4 6 Q 4 2 8 2 L 20 2 Q 24 2 24 6 L 24 18" stroke="#999" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M 8 18 L 8 8 Q 8 5 11 5 L 17 5 Q 20 5 20 8 L 20 18" stroke="#bbb" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ─── Printed card ─────────────────────────────────────────────────────────────
type CardData = {
  label: string;
  icon: React.ReactNode;
  accentColor: string;
  headerBg: string;
  headerText: string;
  pinColor: string;
  playerName: string;
  team: string;
  position?: string | null;
  projection?: number | null;
  alsoList: string[];
  ctaLabel: string;
  ctaTo: string;
  rotation: number;
  badge?: string;
};

function PrintedCard({
  label, icon, accentColor, headerBg, headerText, pinColor,
  playerName, team, position, projection, alsoList,
  ctaLabel, ctaTo, rotation, badge,
}: CardData) {
  const pts = projection != null ? Math.round(projection) : null;
  return (
    <div
      className="relative flex-1 min-w-[190px]"
      style={{ transform: `rotate(${rotation}deg)`, transformOrigin: "top center", paddingTop: 20 }}
    >
      <Pin color={pinColor} />
      <Link to={ctaTo} className="block group outline-none">
        <div
          className="rounded-none"
          style={{
            background: "#fefdf8",
            border: "1px solid rgba(0,0,0,0.12)",
            boxShadow: "1px 2px 4px rgba(0,0,0,0.07), 3px 6px 14px rgba(0,0,0,0.09), 0 16px 32px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.95)",
            transition: "transform 0.18s, box-shadow 0.18s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-5px)"; (e.currentTarget as HTMLElement).style.boxShadow = "2px 4px 8px rgba(0,0,0,0.10), 4px 10px 24px rgba(0,0,0,0.14), 0 24px 48px rgba(0,0,0,0.10)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = "1px 2px 4px rgba(0,0,0,0.07), 3px 6px 14px rgba(0,0,0,0.09), 0 16px 32px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.95)"; }}
        >
          {/* Colored header strip */}
          <div
            style={{
              background: headerBg,
              padding: "7px 10px 6px",
              borderBottom: `2px solid ${accentColor}22`,
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <span style={{ color: accentColor, display: "flex" }}>{icon}</span>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.15em", textTransform: "uppercase", color: accentColor, flex: 1 }}>
              {label}
            </span>
            {position && (
              <span style={{ fontSize: 7, fontWeight: 900, textTransform: "uppercase", background: `${accentColor}22`, color: accentColor, padding: "1px 5px", borderRadius: 3 }}>
                {position}
              </span>
            )}
            {badge && (
              <span style={{ fontSize: 7, fontWeight: 900, textTransform: "uppercase", background: accentColor, color: "#fff", padding: "2px 5px", borderRadius: 3 }}>
                {badge}
              </span>
            )}
          </div>

          {/* Player name + team */}
          <div style={{ padding: "9px 10px 4px" }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: "#1a1208", lineHeight: 1.2, letterSpacing: "-0.02em" }}>{playerName}</p>
            <p style={{ fontSize: 8.5, color: "#9a8060", marginTop: 2, fontWeight: 600 }}>{team}</p>
          </div>

          {/* Big score */}
          <div style={{ padding: "2px 10px 6px", display: "flex", alignItems: "baseline", gap: 4 }}>
            {pts != null ? (
              <>
                <span style={{ fontSize: 28, fontWeight: 900, color: accentColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{pts}</span>
                <span style={{ fontSize: 9.5, color: "#a09070", fontWeight: 700 }}>pts</span>
              </>
            ) : (
              <span style={{ fontSize: 13, color: "#ccc", fontWeight: 700 }}>—</span>
            )}
          </div>

          {/* Also list */}
          <div style={{ padding: "0 10px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
            {alsoList.map((name, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 5, height: 5, background: `${accentColor}88`, borderRadius: 1, flexShrink: 0 }} />
                <span style={{ fontSize: 8.5, color: "#6a5030", fontWeight: 600 }}>{name}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{ padding: "0 8px 9px" }}>
            <div
              style={{
                background: headerBg,
                border: `1px solid ${accentColor}30`,
                color: accentColor,
                fontSize: 8.5,
                fontWeight: 800,
                textAlign: "center",
                padding: "5px 8px",
                letterSpacing: "0.05em",
              }}
            >
              {ctaLabel} ›
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

// ─── Small sticky note in corner ──────────────────────────────────────────────
function StickyNote({ text, color, style }: { text: string; color: string; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        position: "absolute",
        background: color,
        padding: "6px 8px",
        fontSize: 7.5,
        fontWeight: 700,
        color: "rgba(0,0,0,0.55)",
        lineHeight: 1.4,
        boxShadow: "2px 3px 8px rgba(0,0,0,0.15)",
        transform: `rotate(${Math.random() > 0.5 ? 2 : -2}deg)`,
        maxWidth: 80,
        ...style,
      }}
    >
      {text}
    </div>
  );
}

// ─── Marker pen ───────────────────────────────────────────────────────────────
function MarkerPen({ color, rotate = 0, left = 0 }: { color: string; rotate?: number; left?: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left,
        bottom: 4,
        width: 52,
        height: 13,
        borderRadius: "3px 8px 8px 3px",
        background: `linear-gradient(180deg, ${color}dd 0%, ${color} 50%, ${color}bb 100%)`,
        transform: `rotate(${rotate}deg)`,
        boxShadow: "0 2px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.25)",
        transformOrigin: "center",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, background: "rgba(0,0,0,0.15)", borderRadius: "3px 0 0 3px" }} />
      <div style={{ position: "absolute", right: 0, top: 2, bottom: 2, width: 4, background: "rgba(0,0,0,0.2)", borderRadius: "0 3px 3px 0" }} />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Index() {
  const { isPremium } = useAuth();
  const [players, setPlayers]     = useState<RankingRow[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_rankings_safe", { p_user_id: null, p_is_bot: false, p_limit: 200 });
      if (!error && data) setPlayers((data as Record<string, unknown>[]).map(mapRankingRow));
      setLoading(false);
    })();
  }, []);

  const { mustBuyP, trapP, captainP, valueP } = useMemo(() => {
    const avail = players.filter(p => isPlayable(p) && p.projection != null);
    const buys  = avail.filter(isBuy).sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0));
    const byV   = [...avail].sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0));
    const avoids = avail.filter(isAvoid).sort((a, b) => (a.value_score ?? 0) - (b.value_score ?? 0));
    const byCap = [...avail].sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0));
    const mustBuyP = buys[0] ?? byV[0] ?? null;
    const trapP    = avoids[0] ?? null;
    const captainP = byCap.find(p => p.player_id !== mustBuyP?.player_id && p.player_id !== trapP?.player_id) ?? null;
    const valueP   = buys.find(p => p.player_id !== mustBuyP?.player_id && (p.price ?? 999999) < 650000) ?? buys[1] ?? null;
    return { mustBuyP, trapP, captainP, valueP };
  }, [players]);

  const mustBuy  = mustBuyP  ?? MOCK.mustBuy;
  const trap     = trapP     ?? MOCK.trap;
  const captain  = captainP  ?? MOCK.captain;
  const value    = valueP    ?? MOCK.value;

  const buyAlso     = players.filter(isBuy).filter(p => p.player_id !== mustBuyP?.player_id).slice(0,2).map(p => p.player_name);
  const trapAlso    = players.filter(isAvoid).filter(p => p.player_id !== trapP?.player_id).slice(0,1).map(p => p.player_name);
  const capAlso     = players.filter(p => p.player_id !== captainP?.player_id).sort((a,b)=>(b.projection??0)-(a.projection??0)).slice(0,1).map(p => p.player_name);

  const cards: CardData[] = [
    {
      label: "Must Buy", icon: <TrendingUp size={10} />, badge: undefined,
      accentColor: "#1d6b28", headerBg: "linear-gradient(135deg, #e6f4e6 0%, #d4ead5 100%)",
      headerText: "MUST BUY", pinColor: "#e74c3c",
      playerName: mustBuy.player_name, team: mustBuy.team ?? "", position: mustBuy.position, projection: mustBuy.projection,
      alsoList: buyAlso.length >= 2 ? buyAlso : ["Clayton Oliver", "+5 more"],
      ctaLabel: "View Must Buys", ctaTo: "/sports/afl/current-round", rotation: -1.2,
    },
    {
      label: "Trap Alerts", icon: <AlertTriangle size={10} />, badge: undefined,
      accentColor: "#a81e1e", headerBg: "linear-gradient(135deg, #fbe8e8 0%, #f5d4d4 100%)",
      headerText: "TRAP ALERTS", pinColor: "#e74c3c",
      playerName: trap.player_name, team: trap.team ?? "", position: trap.position, projection: trap.projection,
      alsoList: [...trapAlso.slice(0,1), "+5 more"].slice(0,2).length < 2 ? ["Harry Sheezel", "+5 more"] : [...trapAlso.slice(0,1), "+5 more"],
      ctaLabel: "View Trap Alerts", ctaTo: "/sports/afl/current-round", rotation: 0.8,
    },
    {
      label: "Captain Picks", icon: <Star size={10} />, badge: "CAPTAIN",
      accentColor: "#7a5200", headerBg: "linear-gradient(135deg, #fdf5e0 0%, #f8e9c0 100%)",
      headerText: "CAPTAIN PICKS", pinColor: "#f39c12",
      playerName: captain.player_name, team: captain.team ?? "", position: captain.position, projection: captain.projection,
      alsoList: capAlso.length > 0 ? [...capAlso, "+2 more"] : ["Harry Sheezel", "+2 more"],
      ctaLabel: "View Captains", ctaTo: "/sports/afl/captains", rotation: -0.6,
    },
    {
      label: "Best Value", icon: <BarChart3 size={10} />, badge: undefined,
      accentColor: "#135c8a", headerBg: "linear-gradient(135deg, #e2f0fb 0%, #cde3f5 100%)",
      headerText: "BEST VALUE", pinColor: "#2980b9",
      playerName: value.player_name, team: value.team ?? "", position: value.position, projection: value.projection,
      alsoList: ["Harry Sheezel", "+3 more"],
      ctaLabel: "Open Market Watch", ctaTo: "/sports/afl/market-watch", rotation: 1.1,
    },
  ];

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "#e8e2d6",
        overflowX: "hidden",
        paddingBottom: 0,
      }}
    >
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

      {/* LAYER 1 — Wall texture */}
      <WallTexture />

      {/* Vignette */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none",
          background: "radial-gradient(ellipse at 50% 40%, transparent 55%, rgba(0,0,0,0.18) 100%)",
        }}
      />

      {/* ══════════════════════════════════════════════════════════════
          MAIN SCENE
      ══════════════════════════════════════════════════════════════ */}
      <div
        style={{
          position: "relative", zIndex: 2,
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "24px 20px 0",
        }}
      >

        {/* ─── LAYER 3+4+5: WOODEN FRAMED WHITEBOARD ─────────────── */}
        <div
          style={{
            width: "100%",
            maxWidth: 1080,
            position: "relative",
          }}
        >
          {/* Sticky notes on corners */}
          <StickyNote
            text={"Round 7\nAnalysis\nComplete"}
            color="#fde68a"
            style={{ top: 30, left: -28, zIndex: 10, transform: "rotate(-4deg)" }}
          />
          <StickyNote
            text={"Clayton\nOliver\nWatch!"}
            color="#a7f3d0"
            style={{ top: 90, right: -22, zIndex: 10, transform: "rotate(3deg)" }}
          />

          {/* Outer wooden frame */}
          <div
            style={{
              background: "linear-gradient(160deg, #7a5220 0%, #5c3a0e 40%, #6b4418 70%, #7a5220 100%)",
              padding: "10px 10px 0",
              borderRadius: 6,
              boxShadow: "0 6px 0 #3a1e04, 0 10px 40px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.3)",
              position: "relative",
            }}
          >
            {/* Wood grain lines */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 6,
                pointerEvents: "none",
                backgroundImage: "repeating-linear-gradient(92deg, transparent 0px, transparent 18px, rgba(0,0,0,0.04) 18px, rgba(0,0,0,0.04) 19px)",
              }}
            />

            {/* Inner bevel — dark shadow inside frame */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 6,
                pointerEvents: "none",
                boxShadow: "inset 4px 4px 12px rgba(0,0,0,0.35), inset -4px -4px 12px rgba(0,0,0,0.20)",
              }}
            />

            {/* ── CHALKBOARD PANEL (hero / header) ── */}
            <div
              style={{
                position: "relative",
                background: "linear-gradient(172deg, #282e22 0%, #1e2419 50%, #262b1f 100%)",
                padding: "32px 24px 28px",
                overflow: "hidden",
                marginBottom: 0,
              }}
            >
              <ChalkDiagram />

              {/* Chalk dust smear at bottom of dark panel */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0, left: 0, right: 0, height: 12,
                  background: "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.03) 100%)",
                  pointerEvents: "none",
                }}
              />

              {/* Content */}
              <div style={{ position: "relative", zIndex: 10, textAlign: "center", maxWidth: 580, margin: "0 auto" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 }}>
                  <img src="/logo.png" alt="Neeko" style={{ height: 28, opacity: 0.9 }} />
                </div>

                <h1
                  style={{
                    fontSize: "clamp(1.65rem, 4vw, 2.5rem)",
                    fontWeight: 900,
                    lineHeight: 1.06,
                    letterSpacing: "-0.02em",
                    color: "#fff",
                    textShadow: "0 2px 24px rgba(0,0,0,0.7)",
                    marginBottom: 10,
                  }}
                >
                  Win Your <span style={{ color: "#F5C84C" }}>AFL Fantasy</span>
                  <br />Week in 30 Seconds
                </h1>

                <p
                  style={{
                    fontSize: 13.5,
                    color: "rgba(255,255,255,0.45)",
                    marginBottom: 22,
                    lineHeight: 1.55,
                    fontWeight: 500,
                  }}
                >
                  Trades, targets, captains, and traps — powered by data, just like an AFL coach.
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 16 }}>
                  <Link
                    to="/auth"
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: "#F5C84C",
                      color: "#1a0e00",
                      fontWeight: 800, fontSize: 12.5,
                      padding: "9px 22px",
                      borderRadius: 4,
                      textDecoration: "none",
                      boxShadow: "0 3px 12px rgba(245,200,76,0.40), inset 0 1px 0 rgba(255,255,255,0.30)",
                      border: "1px solid rgba(245,200,76,0.6)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    Get Started Free <ArrowRight size={12} />
                  </Link>
                  {!isPremium && (
                    <Link
                      to="/neeko-plus"
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: "rgba(245,200,76,0.12)",
                        color: "#F5C84C",
                        fontWeight: 800, fontSize: 12.5,
                        padding: "9px 22px",
                        borderRadius: 4,
                        textDecoration: "none",
                        border: "1.5px solid rgba(245,200,76,0.35)",
                        letterSpacing: "0.02em",
                      }}
                    >
                      <Crown size={12} />
                      Unlock Full Access
                    </Link>
                  )}
                </div>

                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", letterSpacing: "0.02em" }}>
                  Updated before every AFL Fantasy round lockout — 630+ players fully analysed weekly.
                </p>
              </div>
            </div>

            {/* ── WHITEBOARD SURFACE ── */}
            <div
              style={{
                position: "relative",
                background: "linear-gradient(168deg, #f4f0e4 0%, #ede8d4 50%, #e8e2cc 100%)",
                overflow: "hidden",
              }}
            >
              <BoardTexture />
              <BoardScribbles />

              <div style={{ position: "relative", zIndex: 10, padding: "20px 18px 12px" }}>

                {/* Board label */}
                <p
                  style={{
                    textAlign: "center",
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: "0.35em",
                    textTransform: "uppercase",
                    color: "rgba(80,50,15,0.38)",
                    marginBottom: 18,
                  }}
                >
                  Coach's Whiteboard
                </p>

                {/* Cards row — desktop */}
                <div className="hidden md:flex" style={{ gap: 14, alignItems: "flex-start" }}>
                  {loading ? (
                    [0,1,2,3].map(i => (
                      <div
                        key={i}
                        style={{
                          flex: 1, height: 260,
                          background: "rgba(255,255,255,0.65)",
                          border: "1px solid rgba(0,0,0,0.07)",
                          transform: `rotate(${[-1.2, 0.8, -0.6, 1.1][i]}deg)`,
                          marginTop: 20,
                        }}
                        className="animate-pulse"
                      />
                    ))
                  ) : (
                    cards.map(c => <PrintedCard key={c.label} {...c} />)
                  )}
                </div>

                {/* Cards — mobile stack */}
                <div className="md:hidden flex flex-col" style={{ gap: 28 }}>
                  {loading ? (
                    [0,1,2,3].map(i => (
                      <div key={i} style={{ height: 200, background: "rgba(255,255,255,0.65)", border: "1px solid rgba(0,0,0,0.07)" }} className="animate-pulse" />
                    ))
                  ) : (
                    cards.map(c => <PrintedCard key={c.label} {...c} rotation={0} />)
                  )}
                </div>

                {/* Button row */}
                <div className="hidden md:flex" style={{ gap: 8, marginTop: 16 }}>
                  {[
                    { label: "View Must Buys",    to: "/sports/afl/current-round", color: "#1d6b28" },
                    { label: "View Trap Alerts",  to: "/sports/afl/current-round", color: "#a81e1e" },
                    { label: "View Captains",     to: "/sports/afl/captains",      color: "#7a5200" },
                    { label: "Open Market Watch", to: "/sports/afl/market-watch",  color: "#135c8a" },
                  ].map(({ label, to, color }) => (
                    <Link
                      key={label}
                      to={to}
                      style={{
                        flex: 1, textAlign: "center",
                        fontSize: 10.5, fontWeight: 700,
                        color,
                        background: `${color}10`,
                        border: `1px solid ${color}28`,
                        padding: "6px 8px",
                        textDecoration: "none",
                        letterSpacing: "0.04em",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 3px rgba(0,0,0,0.07)",
                        transition: "filter 0.15s",
                        borderRadius: 3,
                      }}
                    >
                      {label} ›
                    </Link>
                  ))}
                </div>

                {/* Quick icon row */}
                <div
                  style={{
                    display: "flex", flexWrap: "wrap", gap: "10px 24px",
                    justifyContent: "center", alignItems: "center",
                    marginTop: 14,
                    paddingTop: 12,
                    borderTop: "1px solid rgba(80,50,15,0.10)",
                  }}
                >
                  {[
                    { to: "/sports/afl/current-round", icon: <GitCompare size={14} />, label: "Compare Players", color: "#1d6b28" },
                    { to: "/sports/afl/rankings",      icon: <Bookmark size={14} />,   label: "Watchlist",       color: "#7a5200" },
                    { to: "/sports/afl/current-round", icon: <AlertTriangle size={14} />, label: "Trap Alerts",  color: "#a81e1e" },
                    { to: "/sports/afl/rankings",      icon: <Star size={14} />,       label: "Full Rankings",   color: "#135c8a" },
                  ].map(({ to, icon, label, color }) => (
                    <Link
                      key={label}
                      to={to}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        fontSize: 11.5, fontWeight: 700,
                        color: "rgba(55,35,10,0.50)",
                        textDecoration: "none",
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = color; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(55,35,10,0.50)"; }}
                    >
                      <span style={{ color }}>{icon}</span>
                      {label}
                    </Link>
                  ))}
                  <span style={{ fontSize: 14, color: "rgba(55,35,10,0.28)", fontWeight: 700 }}>›</span>
                </div>

                {/* Micro trust row */}
                <div
                  style={{
                    display: "flex", flexWrap: "wrap", gap: "6px 22px",
                    justifyContent: "center", marginTop: 12,
                  }}
                >
                  {[
                    "Updated before every round lockout",
                    "630+ players fully analysed weekly",
                    "Gives you edge, not opinion",
                  ].map(t => (
                    <span
                      key={t}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        fontSize: 9.5, fontWeight: 600,
                        color: "rgba(55,35,10,0.32)",
                      }}
                    >
                      <Check size={8} style={{ color: "#4a8a50" }} />
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Marker tray — attached to bottom of whiteboard surface */}
              <div
                style={{
                  height: 28,
                  background: "linear-gradient(180deg, #b8a880 0%, #a89868 100%)",
                  boxShadow: "inset 0 3px 6px rgba(0,0,0,0.12), inset 0 -1px 0 rgba(0,0,0,0.08)",
                  position: "relative",
                  display: "flex", alignItems: "center",
                  paddingLeft: 18, gap: 10,
                }}
              >
                <MarkerPen color="#e74c3c" rotate={-1.5} left={18} />
                <MarkerPen color="#2ecc71" rotate={0.8}  left={80} />
                <MarkerPen color="#3498db" rotate={-2}   left={142} />
                <MarkerPen color="#1a1208" rotate={1}    left={204} />
                {/* Chalk / eraser */}
                <div
                  style={{
                    position: "absolute", right: 40, bottom: 5,
                    width: 60, height: 16,
                    background: "linear-gradient(90deg, #e8e0c8 0%, #f0e8d5 50%, #e0d8c0 100%)",
                    borderRadius: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                    transform: "rotate(-1deg)",
                  }}
                />
              </div>
            </div>

            {/* Bottom wooden rail */}
            <div
              style={{
                height: 16,
                background: "linear-gradient(180deg, #8a6228 0%, #5c3c10 100%)",
                boxShadow: "inset 0 -2px 4px rgba(0,0,0,0.25)",
              }}
            />
          </div>

          {/* Drop shadow / frame bottom */}
          <div
            style={{
              height: 12,
              background: "linear-gradient(180deg, rgba(0,0,0,0.22) 0%, transparent 100%)",
              borderRadius: "0 0 4px 4px",
            }}
          />
        </div>

        {/* ═══════════════════════════════════════════════════════════
            CONTINUOUS SCENE — below board, same warm wall
        ═══════════════════════════════════════════════════════════ */}

        {/* Steps section */}
        <div style={{ width: "100%", maxWidth: 1080, marginTop: 68 }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <h2
              style={{
                fontSize: "clamp(1.45rem, 3vw, 2rem)",
                fontWeight: 900, letterSpacing: "-0.02em",
                color: "#2a1c08",
                textShadow: "0 1px 2px rgba(0,0,0,0.06)",
              }}
            >
              Win Your AFL Fantasy Week in 3 Easy Steps
            </h2>
            <p style={{ fontSize: 13.5, color: "rgba(42,28,8,0.48)", marginTop: 10, lineHeight: 1.55, maxWidth: 500, margin: "10px auto 0" }}>
              Driven by data, our insights help you make better trades, choose captains wisely, and spot costly traps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 16 }}>
            {[
              { num: "1.", title: "See Expert Analysis", body: "Get weekly Must Buys, Trap Alerts, Captain Picks, and more, all backed by data.", color: "#1d6b28" },
              { num: "2.", title: "Make Informed Trades", body: "Trade in form players and avoid failing traps, supported by our trending trade numbers.", color: "#7a5200" },
              { num: "3.", title: "Dominate Your League", body: "Consistent weekly edges compound. Our members make better transfers every single round.", color: "#135c8a" },
            ].map(({ num, title, body, color }) => (
              <div
                key={num}
                style={{
                  background: "rgba(255,255,255,0.42)",
                  border: "1px solid rgba(0,0,0,0.065)",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.055), inset 0 1px 0 rgba(255,255,255,0.7)",
                  padding: "22px 20px",
                  borderRadius: 3,
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 900, color, marginBottom: 8, letterSpacing: "0.04em" }}>{num}</p>
                <h3 style={{ fontSize: 15.5, fontWeight: 800, color: "#2a1c08", marginBottom: 8, letterSpacing: "-0.01em" }}>{title}</h3>
                <p style={{ fontSize: 12.5, color: "rgba(42,28,8,0.52)", lineHeight: 1.6 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing section */}
        <div style={{ width: "100%", maxWidth: 1080, marginTop: 68 }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <h2
              style={{
                fontSize: "clamp(1.45rem, 3vw, 2rem)",
                fontWeight: 900, letterSpacing: "-0.02em",
                color: "#2a1c08",
              }}
            >
              Unlock the Full Neeko Stats Suite
            </h2>
            <p style={{ fontSize: 13, color: "rgba(42,28,8,0.45)", marginTop: 10 }}>
              Try our full premium AFL Fantasy features. Instant access, cancel anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 16 }}>
            {/* Sample printed card — Must Buy */}
            <div
              style={{
                background: "#fefdf8",
                border: "1px solid rgba(0,0,0,0.10)",
                boxShadow: "1px 2px 4px rgba(0,0,0,0.07), 3px 6px 14px rgba(0,0,0,0.09)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div style={{ background: "linear-gradient(135deg, #e6f4e6 0%, #d4ead5 100%)", padding: "7px 10px 6px", display: "flex", alignItems: "center", gap: 5, borderBottom: "1px solid #c8e0c8" }}>
                <TrendingUp size={9} style={{ color: "#1d6b28" }} />
                <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.15em", textTransform: "uppercase", color: "#1d6b28", flex: 1 }}>Must Buy</span>
                <span style={{ fontSize: 7, fontWeight: 900, textTransform: "uppercase", background: "#1d6b2822", color: "#1d6b28", padding: "1px 5px" }}>RUC</span>
              </div>
              <div style={{ padding: "9px 12px 4px" }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: "#1a1208" }}>Christian Petracca</p>
                <p style={{ fontSize: 8.5, color: "#9a8060", marginTop: 2, fontWeight: 600 }}>B. Keldie Lions — RUC</p>
              </div>
              <div style={{ padding: "2px 12px 6px", display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: "#1d6b28", lineHeight: 1 }}>114</span>
                <span style={{ fontSize: 9.5, color: "#a09070", fontWeight: 700 }}>pts</span>
              </div>
              <div style={{ padding: "0 12px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 5, height: 5, background: "#1d6b2888", borderRadius: 1 }} /><span style={{ fontSize: 8.5, color: "#6a5030", fontWeight: 600 }}>Vinitica Apprient</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 5, height: 5, background: "#1d6b2888", borderRadius: 1 }} /><span style={{ fontSize: 8.5, color: "#6a5030", fontWeight: 600 }}>J+ Rinze Gepoott</span></div>
              </div>
              <div style={{ padding: "0 8px 10px" }}>
                <Link to="/sports/afl/current-round" style={{ display: "block", textAlign: "center", fontSize: 8.5, fontWeight: 800, color: "#1d6b28", background: "linear-gradient(135deg, #e6f4e6 0%, #d4ead5 100%)", border: "1px solid #1d6b2830", padding: "5px 8px", textDecoration: "none" }}>
                  View Must Buys ›
                </Link>
              </div>
            </div>

            {/* Sample printed card — Trap */}
            <div
              style={{
                background: "#fefdf8",
                border: "1px solid rgba(0,0,0,0.10)",
                boxShadow: "1px 2px 4px rgba(0,0,0,0.07), 3px 6px 14px rgba(0,0,0,0.09)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div style={{ background: "linear-gradient(135deg, #fbe8e8 0%, #f5d4d4 100%)", padding: "7px 10px 6px", display: "flex", alignItems: "center", gap: 5, borderBottom: "1px solid #e8c0c0" }}>
                <AlertTriangle size={9} style={{ color: "#a81e1e" }} />
                <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.15em", textTransform: "uppercase", color: "#a81e1e", flex: 1 }}>Trap Alert</span>
                <span style={{ fontSize: 7, fontWeight: 900, textTransform: "uppercase", background: "#a81e1e22", color: "#a81e1e", padding: "1px 5px" }}>DEF</span>
              </div>
              <div style={{ padding: "9px 12px 4px" }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: "#1a1208" }}>Nick Daicos</p>
                <p style={{ fontSize: 8.5, color: "#9a8060", marginTop: 2, fontWeight: 600 }}>5 Keldie Lions — DEF</p>
              </div>
              <div style={{ padding: "2px 12px 6px", display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: "#a81e1e", lineHeight: 1 }}>82</span>
                <span style={{ fontSize: 9.5, color: "#a09070", fontWeight: 700 }}>pts</span>
              </div>
              <div style={{ padding: "0 12px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 5, height: 5, background: "#a81e1e88", borderRadius: 1 }} /><span style={{ fontSize: 8.5, color: "#6a5030", fontWeight: 600 }}>x2 more</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 5, height: 5, background: "#a81e1e88", borderRadius: 1 }} /><span style={{ fontSize: 8.5, color: "#6a5030", fontWeight: 600 }}>+3 trades</span></div>
              </div>
              <div style={{ padding: "0 8px 10px" }}>
                <Link to="/sports/afl/current-round" style={{ display: "block", textAlign: "center", fontSize: 8.5, fontWeight: 800, color: "#a81e1e", background: "linear-gradient(135deg, #fbe8e8 0%, #f5d4d4 100%)", border: "1px solid #a81e1e30", padding: "5px 8px", textDecoration: "none" }}>
                  View Trap Alerts ›
                </Link>
              </div>
            </div>

            {/* Pricing panel — looks like a printed sheet pinned to desk */}
            <div
              style={{
                background: "linear-gradient(160deg, #f5f0e2 0%, #ede6cc 100%)",
                border: "1px solid rgba(90,60,15,0.18)",
                boxShadow: "1px 2px 4px rgba(0,0,0,0.07), 3px 6px 14px rgba(0,0,0,0.09)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div style={{ background: "rgba(80,50,10,0.07)", padding: "8px 14px", borderBottom: "1px solid rgba(80,50,10,0.10)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(80,50,10,0.50)" }}>
                  Complete Roundpack
                </span>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#c0392b" }} />
              </div>
              <div style={{ padding: "16px 16px 6px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(42,28,8,0.35)", textDecoration: "line-through" }}>Free</span>
                  <span style={{ fontSize: 26, fontWeight: 900, color: "#2a1c08", lineHeight: 1 }}>
                    ${NEEKO_PRICING.yearly.monthlyEquivalent}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(42,28,8,0.40)" }}>/month</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginBottom: 14 }}>
                  {["Updated","BonuDios.","Must Buys.","Trap Alerts","Captains","Captain Picks","Full Rowdings","Breakouts"].map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Check size={8} style={{ color: "#3a7a40", flexShrink: 0 }} />
                      <span style={{ fontSize: 9.5, fontWeight: 600, color: "rgba(42,28,8,0.58)" }}>{f}</span>
                    </div>
                  ))}
                </div>
                <Link
                  to="/neeko-plus"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    background: "#F5C84C",
                    color: "#1a0e00",
                    fontWeight: 800, fontSize: 11.5,
                    padding: "9px 14px",
                    borderRadius: 3,
                    textDecoration: "none",
                    boxShadow: "0 2px 8px rgba(245,200,76,0.35), inset 0 1px 0 rgba(255,255,255,0.30)",
                    letterSpacing: "0.04em",
                    border: "1px solid rgba(245,200,76,0.5)",
                  }}
                >
                  <Crown size={11} />
                  Unlock Full Access ›
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Footer — minimal, same wall */}
        <div
          style={{
            width: "100%", maxWidth: 1080,
            marginTop: 56,
            paddingTop: 20, paddingBottom: 20,
            borderTop: "1px solid rgba(42,28,8,0.09)",
            display: "flex", flexWrap: "wrap",
            justifyContent: "space-between", alignItems: "center",
            gap: 12,
          }}
        >
          <p style={{ fontSize: 10.5, color: "rgba(42,28,8,0.28)" }}>
            © {new Date().getFullYear()} Neeko Sports Stats
          </p>
          <div style={{ display: "flex", gap: 20 }}>
            {[{ l: "Policies", t: "/policies" },{ l: "Contact", t: "/contact" },{ l: "About", t: "/about" },{ l: "FAQ", t: "/faq" }].map(x => (
              <Link key={x.t} to={x.t} style={{ fontSize: 10.5, color: "rgba(42,28,8,0.28)", textDecoration: "none" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(42,28,8,0.60)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(42,28,8,0.28)"; }}
              >
                {x.l}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          LAYER 2 — WOODEN DESK SURFACE (fixed at bottom)
      ══════════════════════════════════════════════════════════════ */}
      <div
        style={{
          position: "relative",
          zIndex: 3,
          height: 110,
          background: "linear-gradient(180deg, #8a6228 0%, #6a4a18 30%, #5a3c10 70%, #4a2e08 100%)",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.30), inset 0 3px 0 rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        {/* Wood grain */}
        <div
          style={{
            position: "absolute", inset: 0,
            backgroundImage: "repeating-linear-gradient(90deg, transparent 0px, transparent 22px, rgba(0,0,0,0.04) 22px, rgba(0,0,0,0.04) 23px)",
          }}
        />
        <div
          style={{
            position: "absolute", inset: 0,
            backgroundImage: "repeating-linear-gradient(180deg, transparent 0px, transparent 8px, rgba(255,255,255,0.015) 8px, rgba(255,255,255,0.015) 9px)",
          }}
        />
        {/* Top shadow edge */}
        <div
          style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 14,
            background: "linear-gradient(180deg, rgba(0,0,0,0.22) 0%, transparent 100%)",
          }}
        />

        {/* Desk items */}
        <div style={{ position: "relative", height: "100%", maxWidth: 1080, margin: "0 auto", padding: "0 24px" }}>
          {/* Whistle */}
          <div
            style={{
              position: "absolute",
              right: 80, top: 18,
              width: 55, height: 18,
              background: "linear-gradient(135deg, #d4a820 0%, #b88c10 50%, #c8a018 100%)",
              borderRadius: "8px 3px 3px 8px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.30)",
              transform: "rotate(-28deg)",
            }}
          >
            <div style={{ position: "absolute", right: -8, top: 3, width: 14, height: 12, borderRadius: 6, background: "#a07808", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.3)" }} />
          </div>

          {/* Oval football */}
          <div
            style={{
              position: "absolute",
              right: 16, top: 12,
              width: 70, height: 48,
              background: "radial-gradient(ellipse at 40% 35%, #a06028 0%, #7a4018 50%, #5a2c0c 100%)",
              borderRadius: "50% 55% 55% 50% / 40% 45% 45% 40%",
              boxShadow: "2px 4px 14px rgba(0,0,0,0.40), inset -3px -3px 8px rgba(0,0,0,0.25), inset 2px 2px 6px rgba(255,255,255,0.06)",
              transform: "rotate(-12deg)",
            }}
          >
            {/* Lace */}
            <div style={{ position: "absolute", top: "42%", left: "30%", right: "30%", height: 1.5, background: "rgba(255,255,255,0.30)", borderRadius: 1 }} />
            <div style={{ position: "absolute", top: "35%", left: "44%", width: 1.5, height: "30%", background: "rgba(255,255,255,0.25)", borderRadius: 1 }} />
          </div>

          {/* Clipboard */}
          <div
            style={{
              position: "absolute",
              left: 18, top: 8,
              width: 62, height: 80,
              background: "linear-gradient(175deg, #d4c8a0 0%, #c8bc90 100%)",
              borderRadius: "3px 3px 2px 2px",
              boxShadow: "2px 3px 10px rgba(0,0,0,0.30)",
              transform: "rotate(5deg)",
            }}
          >
            <div style={{ position: "absolute", top: -5, left: "50%", transform: "translateX(-50%)", width: 24, height: 10, background: "#8a7a50", borderRadius: "3px 3px 0 0", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
            <div style={{ position: "absolute", top: 14, left: 6, right: 6 }}>
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{ height: 1.5, background: "rgba(0,0,0,0.12)", marginBottom: 7, borderRadius: 1 }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {!isPremium && <MobileUpgradeBar />}
    </div>
  );
}
