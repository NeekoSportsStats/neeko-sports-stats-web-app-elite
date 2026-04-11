import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  Crown, ArrowRight, Check, TrendingUp, TriangleAlert as AlertTriangle,
  Star, ChartBar as BarChart3, GitCompare, ArrowUp, ArrowDown, Bookmark,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { NEEKO_PRICING } from "@/config/neekoPricing";
import MobileUpgradeBar from "@/components/mobile/MobileUpgradeBar";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";

// ─── Signal helpers ──────────────────────────────────────────────────────────

const BUY_SIGNALS   = ["STRONG_UP","STRONG_BUY","MUST_HAVE","BREAKOUT","UP","BUY"];
const AVOID_SIGNALS = ["STRONG_DOWN","STRONG_SELL","AVOID","DO_NOT_START","DOWN","SELL"];

function resolveSignal(row: RankingRow): string {
  return ((row.action ?? row.signal_tag ?? row.signal ?? "")).toUpperCase();
}
function isBuy(row: RankingRow)   { return BUY_SIGNALS.includes(resolveSignal(row)); }
function isAvoid(row: RankingRow) { return AVOID_SIGNALS.includes(resolveSignal(row)); }
function isPlayable(p: RankingRow): boolean {
  const ms = (p.manual_status ?? "").toUpperCase();
  return ms !== "OUT" && ms !== "INJURED" && !p.is_bye && !p.is_injured;
}

// ─── Mock fallback ────────────────────────────────────────────────────────────

const MOCK_CARDS = {
  mustBuy: { player_name: "Rowan Marshall",  team: "St Kilda Saints", position: "RUC", projection: 114, why: "Dominant ruck. Soft matchup. Underpriced vs output." },
  trap:    { player_name: "Zac Bailey",      team: "Brisbane Lions",  position: "MID", projection: 82,  why: "Overpriced — role shift risk. Fade this round." },
  captain: { player_name: "Dayne Zorko",     team: "Brisbane Lions",  position: "DEF", projection: 132, why: "Elite ceiling. Lock matchup. Highest confidence." },
  value:   { player_name: "Finn Callaghan",  team: "GWS Giants",      position: "MID", projection: 120, why: "Premium output at mid-price. Best value this round." },
};

// ─── Grain texture overlay ────────────────────────────────────────────────────

function GrainOverlay() {
  return (
    <svg
      className="fixed inset-0 w-full h-full pointer-events-none select-none"
      style={{ zIndex: 1, opacity: 0.028, mixBlendMode: "multiply" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  );
}

// ─── Chalkboard hero section ──────────────────────────────────────────────────

function ChalkLines() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
      style={{ opacity: 0.09 }}
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker id="ch-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="rgba(255,255,255,0.7)" />
        </marker>
      </defs>
      {/* Oval circle */}
      <ellipse cx="50%" cy="55%" rx="220" ry="85" stroke="white" strokeWidth="1.5" fill="none" strokeDasharray="12 8" />
      {/* Play arrows */}
      <line x1="18%" y1="70%" x2="35%" y2="55%" stroke="white" strokeWidth="1.5" markerEnd="url(#ch-arrow)" />
      <line x1="78%" y1="68%" x2="62%" y2="53%" stroke="white" strokeWidth="1.5" markerEnd="url(#ch-arrow)" />
      <line x1="50%" y1="30%" x2="50%" y2="45%" stroke="white" strokeWidth="1.5" markerEnd="url(#ch-arrow)" />
      {/* X and O marks */}
      <text x="15%" y="42%" fontSize="18" fontFamily="serif" fill="white">✕</text>
      <text x="80%" y="38%" fontSize="16" fontFamily="serif" fill="white">○</text>
      <text x="12%" y="78%" fontSize="16" fontFamily="serif" fill="white">○</text>
      <text x="82%" y="75%" fontSize="18" fontFamily="serif" fill="white">✕</text>
      {/* Horizontal rule lines */}
      {[20, 40, 60, 80, 100].map(y => (
        <line key={y} x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`} stroke="white" strokeWidth="0.5" opacity="0.3" />
      ))}
    </svg>
  );
}

// ─── Coach markings on whiteboard ─────────────────────────────────────────────

function BoardMarkings() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
      style={{ opacity: 0.05 }}
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker id="bm-arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#5c4020" />
        </marker>
      </defs>
      <path d="M 60 280 Q 180 160 340 260" stroke="#5c4020" strokeWidth="1.5" fill="none" strokeDasharray="8 6" />
      <path d="M 560 80 Q 680 200 590 340" stroke="#5c4020" strokeWidth="1.5" fill="none" strokeDasharray="6 5" />
      <text x="42" y="140" fontSize="20" fontFamily="serif" fill="#5c4020">✕</text>
      <text x="610" y="250" fontSize="18" fontFamily="serif" fill="#5c4020">○</text>
      <line x1="70" y1="220" x2="130" y2="260" stroke="#5c4020" strokeWidth="1.2" markerEnd="url(#bm-arrow)" />
    </svg>
  );
}

// ─── Push pin ─────────────────────────────────────────────────────────────────

function PushPin({ color }: { color: string }) {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-30 flex flex-col items-center"
      style={{ top: -14 }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: `radial-gradient(circle at 35% 30%, ${color}ee 0%, ${color} 55%, ${color}99 100%)`,
          boxShadow: `0 2px 5px ${color}66, 0 1px 2px rgba(0,0,0,0.3)`,
          border: "1px solid rgba(0,0,0,0.15)",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", top: 4, left: 4, width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.5)" }} />
      </div>
      <div style={{ width: 2, height: 8, borderRadius: "0 0 2px 2px", background: `${color}88` }} />
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

type CardPlayer = {
  player_name: string;
  team: string;
  position?: string | null;
  projection?: number | null;
  why?: string | null;
};

interface StatCardProps {
  label: string;
  labelIcon: React.ReactNode;
  accentColor: string;
  headerBg: string;
  pinColor: string;
  player: CardPlayer;
  alsoPlayers?: string[];
  ctaLabel: string;
  ctaTo: string;
  trend?: "up" | "down" | null;
  trendValue?: string;
  rotation?: number;
  badgeText?: string;
}

function StatCard({
  label, labelIcon, accentColor, headerBg, pinColor,
  player, alsoPlayers = [], ctaLabel, ctaTo,
  trend, trendValue, rotation = 0, badgeText,
}: StatCardProps) {
  const proj = player.projection != null ? Math.round(player.projection) : null;

  return (
    <div
      className="relative flex-1 min-w-0"
      style={{ transform: `rotate(${rotation}deg)`, transformOrigin: "top center" }}
    >
      <PushPin color={pinColor} />
      <Link to={ctaTo} className="block outline-none group">
        <div
          className="rounded-xl overflow-hidden transition-all duration-200 group-hover:-translate-y-1.5 group-hover:shadow-2xl"
          style={{
            background: "#fff",
            border: "1px solid rgba(0,0,0,0.09)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.08), 0 8px 20px rgba(0,0,0,0.10), 0 20px 40px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
          }}
        >
          {/* Header strip */}
          <div
            className="px-3 py-2 flex items-center gap-2"
            style={{ background: headerBg }}
          >
            <span style={{ color: accentColor, display: "flex", alignItems: "center" }}>{labelIcon}</span>
            <span
              className="text-[10px] font-black uppercase tracking-[0.14em] flex-1"
              style={{ color: accentColor }}
            >
              {label}
            </span>
            {player.position && (
              <span
                className="text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{ background: `${accentColor}20`, color: accentColor }}
              >
                {player.position}
              </span>
            )}
            {badgeText && (
              <span
                className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded"
                style={{ background: accentColor, color: "#fff" }}
              >
                {badgeText}
              </span>
            )}
          </div>

          {/* Player info */}
          <div className="px-3 pt-2.5 pb-1">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <p className="text-[14px] font-extrabold leading-tight tracking-tight text-[#1a1508] truncate">
                  {player.player_name}
                </p>
                <p className="text-[9px] text-[#8a7a62] mt-0.5 font-semibold truncate">
                  {player.team}
                </p>
              </div>
            </div>
          </div>

          {/* Big score */}
          <div className="px-3 pt-1 pb-1.5 flex items-end gap-1.5">
            {proj != null ? (
              <>
                <span
                  className="text-[26px] font-black tabular-nums leading-none"
                  style={{ color: accentColor }}
                >
                  {proj}
                </span>
                <span className="text-[10px] text-[#9a8a70] font-semibold mb-0.5">pts</span>
              </>
            ) : (
              <span className="text-[13px] text-[#bbb] font-bold">—</span>
            )}
            {trend && trendValue && (
              <span
                className="ml-auto flex items-center gap-0.5 text-[9px] font-bold mb-0.5 px-1.5 py-0.5 rounded"
                style={{
                  color: trend === "up" ? "#2e7d32" : "#c62828",
                  background: trend === "up" ? "#e8f5e9" : "#ffebee",
                }}
              >
                {trend === "up" ? <ArrowUp size={7} /> : <ArrowDown size={7} />}
                {trendValue}
              </span>
            )}
          </div>

          {/* Also list */}
          {alsoPlayers.length > 0 && (
            <div className="px-3 pb-2 flex flex-col gap-1">
              {alsoPlayers.map((name, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div
                    className="w-1 h-1 rounded-full shrink-0"
                    style={{ background: accentColor }}
                  />
                  <span className="text-[9px] text-[#6a5a42] font-semibold leading-none">{name}</span>
                </div>
              ))}
            </div>
          )}

          {/* CTA button */}
          <div className="px-2.5 pb-2.5">
            <div
              className="text-[9px] font-bold text-center py-1.5 rounded-lg transition-all group-hover:brightness-[1.05]"
              style={{
                background: headerBg,
                color: accentColor,
                border: `1px solid ${accentColor}30`,
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

// ─── Action pill button ────────────────────────────────────────────────────────

function ActionPill({ to, label, color }: { to: string; label: string; color: string }) {
  return (
    <Link
      to={to}
      className="flex-1 min-w-0 text-center transition-all hover:brightness-[0.95] active:scale-[0.97]"
      style={{
        fontSize: 11,
        fontWeight: 700,
        color,
        background: `${color}14`,
        border: `1px solid ${color}28`,
        borderRadius: 8,
        padding: "7px 10px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {label} ›
    </Link>
  );
}

// ─── Pricing feature list ─────────────────────────────────────────────────────

const NEEKO_FEATURES = [
  "Full weekly game plan",
  "Must Buys + Trap Alerts",
  "Captain picks + confidence",
  "Market Watch 600+ players",
  "Breakout alerts",
  "Full rankings + projections",
  "Start/Sit engine",
  "Updated before lockout",
];

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Index() {
  const { isPremium } = useAuth();
  const [players, setPlayers]               = useState<RankingRow[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_rankings_safe", {
        p_user_id: null,
        p_is_bot:  false,
        p_limit:   200,
      });
      if (error) { setPlayersLoading(false); return; }
      setPlayers(((data ?? []) as Record<string, unknown>[]).map(mapRankingRow));
      setPlayersLoading(false);
    })();
  }, []);

  const { mustBuyPlayer, trapPlayer, captainPlayer, valuePlayer } = useMemo(() => {
    const available = players.filter(p => isPlayable(p) && p.projection != null);
    const buyPool   = available.filter(isBuy).sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0));
    const byValue   = [...available].sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0));
    const avoidPool = available.filter(isAvoid).sort((a, b) => (a.value_score ?? 0) - (b.value_score ?? 0));
    const byCaptain = [...available].sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0));

    const mustBuyPlayer = buyPool[0] ?? byValue[0] ?? null;
    const trapPlayer    = avoidPool[0] ?? null;
    const captainPlayer = byCaptain.find(p =>
      p.player_id !== mustBuyPlayer?.player_id && p.player_id !== trapPlayer?.player_id
    ) ?? null;
    const valuePlayer = buyPool.find(p =>
      p.player_id !== mustBuyPlayer?.player_id && p.price != null && p.price < 600_000
    ) ?? buyPool[1] ?? null;

    return { mustBuyPlayer, trapPlayer, captainPlayer, valuePlayer };
  }, [players]);

  const mustBuy  = mustBuyPlayer  ?? MOCK_CARDS.mustBuy as Partial<RankingRow>;
  const trap     = trapPlayer     ?? MOCK_CARDS.trap    as Partial<RankingRow>;
  const captain  = captainPlayer  ?? MOCK_CARDS.captain as Partial<RankingRow>;
  const value    = valuePlayer    ?? MOCK_CARDS.value   as Partial<RankingRow>;

  const mustBuyAlso   = players.filter(isBuy).filter(p => p.player_id !== mustBuyPlayer?.player_id).slice(0, 2).map(p => p.player_name);
  const trapAlso      = players.filter(isAvoid).filter(p => p.player_id !== trapPlayer?.player_id).slice(0, 1).map(p => p.player_name).concat("+5 more");
  const captainAlso   = players.filter(p => p.player_id !== captainPlayer?.player_id).sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0)).slice(0, 1).map(p => p.player_name).concat("+2 more");
  const valueAlso     = ["+3 more"];

  const cards = [
    {
      label: "Must Buy",
      labelIcon: <TrendingUp size={11} />,
      accentColor: "#2e6b30",
      headerBg: "linear-gradient(135deg, #e8f5e9 0%, #dceede 100%)",
      pinColor: "#c0392b",
      player: mustBuy as CardPlayer,
      alsoPlayers: mustBuyAlso.length > 0 ? mustBuyAlso : ["Rowan Marshall","Will Ashcroft"],
      ctaLabel: "View Must Buys",
      ctaTo: "/sports/afl/current-round",
      trend: "up" as const,
      trendValue: "+$18k",
      rotation: -0.8,
      badgeText: undefined,
    },
    {
      label: "Trap Alerts",
      labelIcon: <AlertTriangle size={11} />,
      accentColor: "#b71c1c",
      headerBg: "linear-gradient(135deg, #ffebee 0%, #fddede 100%)",
      pinColor: "#e74c3c",
      player: trap as CardPlayer,
      alsoPlayers: trapAlso,
      ctaLabel: "View Trap Alerts",
      ctaTo: "/sports/afl/current-round",
      trend: "down" as const,
      trendValue: "-$22k",
      rotation: 0.6,
      badgeText: undefined,
    },
    {
      label: "Captain Picks",
      labelIcon: <Star size={11} />,
      accentColor: "#7a5500",
      headerBg: "linear-gradient(135deg, #fff8e1 0%, #fdeec5 100%)",
      pinColor: "#f39c12",
      player: captain as CardPlayer,
      alsoPlayers: captainAlso,
      ctaLabel: "View Captains",
      ctaTo: "/sports/afl/captains",
      trend: null,
      trendValue: undefined,
      rotation: -0.5,
      badgeText: "CAPTAIN",
    },
    {
      label: "Best Value",
      labelIcon: <BarChart3 size={11} />,
      accentColor: "#1a5c8a",
      headerBg: "linear-gradient(135deg, #e3f2fd 0%, #d0e8f8 100%)",
      pinColor: "#2980b9",
      player: value as CardPlayer,
      alsoPlayers: valueAlso,
      ctaLabel: "Open Market Watch",
      ctaTo: "/sports/afl/market-watch",
      trend: "up" as const,
      trendValue: "+17",
      rotation: 0.9,
      badgeText: undefined,
    },
  ];

  return (
    <div
      className="min-h-screen pb-[80px] sm:pb-0"
      style={{
        background: "#e6e0d0",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      <GrainOverlay />

      <Helmet>
        <title>Neeko Sports Stats — AFL Fantasy Coach's Whiteboard</title>
        <meta name="description" content="Win your AFL Fantasy week in 30 seconds. Trade targets, trap warnings, and captain picks powered by real AFL data." />
        <link rel="canonical" href="https://neekostats.com.au/" />
        <meta property="og:title" content="Neeko Sports Stats — AFL Fantasy Coach's Whiteboard" />
        <meta property="og:description" content="Win your AFL Fantasy week in 30 seconds. Trade targets, trap warnings, and captain picks powered by real AFL data." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/" />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="robots" content="index, follow" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "Neeko Sports Stats",
          "applicationCategory": "SportsApplication",
          "operatingSystem": "Web",
          "url": "https://neekostats.com.au",
          "description": "AI-powered AFL Fantasy analytics",
          "offers": { "@type": "Offer", "price": "9.99", "priceCurrency": "AUD" },
          "publisher": { "@type": "Organization", "name": "Neeko Sports Stats", "url": "https://neekostats.com.au" },
        })}</script>
      </Helmet>

      {/* ════════════════════════════════════════════════════════════════════
          FULL-PAGE CANVAS — warm room environment
      ════════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "0 16px 64px",
          position: "relative",
          zIndex: 2,
          /* top lighting gradient */
          background: "linear-gradient(180deg, #d8d0be 0%, #e6e0d0 18%, #e8e2d4 60%, #ddd7c8 100%)",
        }}
      >

        {/* ─── CHALKBOARD HERO ─────────────────────────────────────── */}
        <div
          style={{
            width: "100%",
            maxWidth: 1100,
            marginTop: 20,
            borderRadius: "14px 14px 0 0",
            overflow: "hidden",
            /* wooden frame top */
            boxShadow: "0 4px 0 0 #8a6030, 0 8px 32px rgba(0,0,0,0.28), inset 0 -2px 8px rgba(0,0,0,0.15)",
            border: "6px solid #7a5428",
            borderBottom: "none",
          }}
        >
          {/* Chalkboard surface */}
          <div
            style={{
              position: "relative",
              background: "linear-gradient(175deg, #2c3028 0%, #252820 45%, #2a2e24 100%)",
              padding: "36px 28px 32px",
              overflow: "hidden",
            }}
          >
            <ChalkLines />

            {/* Content */}
            <div className="relative z-10 text-center max-w-xl mx-auto">
              <h1
                className="text-[2rem] sm:text-[2.6rem] font-extrabold leading-[1.08] tracking-tight text-white mb-3"
                style={{ textShadow: "0 2px 20px rgba(0,0,0,0.7)" }}
              >
                Win Your{" "}
                <span style={{ color: "#F5C84C" }}>AFL Fantasy</span>
                <br />Week in 30 Seconds
              </h1>
              <p
                className="text-[14px] md:text-[15px] font-medium mb-7 leading-relaxed"
                style={{ color: "rgba(255,255,255,0.52)" }}
              >
                Trades, targets, captains, and traps — powered by data, just like an AFL coach.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-5">
                <Link
                  to="/auth"
                  className="flex items-center justify-center gap-2 font-bold text-[13px] px-7 rounded-lg transition-all min-h-[44px] w-full sm:w-auto hover:brightness-[1.08] active:scale-[0.97]"
                  style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.22)" }}
                >
                  Get Started Free
                  <ArrowRight size={13} />
                </Link>
                {!isPremium && (
                  <Link
                    to="/neeko-plus"
                    className="flex items-center justify-center gap-2 font-bold text-[13px] px-7 rounded-lg transition-all min-h-[44px] w-full sm:w-auto hover:brightness-[1.08] active:scale-[0.97]"
                    style={{ background: "#F5C84C", color: "#1a1200", boxShadow: "0 4px 20px rgba(245,200,76,0.35)" }}
                  >
                    <Crown size={13} />
                    Unlock Full Access
                  </Link>
                )}
              </div>

              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                Updated before every AFL Fantasy round lockout — 630n players fully analysed weekly.
              </p>
            </div>
          </div>
        </div>

        {/* ─── WHITEBOARD ──────────────────────────────────────────── */}
        <div
          style={{
            width: "100%",
            maxWidth: 1100,
            background: "linear-gradient(170deg, #f5f2e8 0%, #ede9d8 55%, #e7e2ce 100%)",
            boxShadow:
              "inset 0 3px 12px rgba(0,0,0,0.09), inset 2px 0 8px rgba(0,0,0,0.05), inset -2px 0 8px rgba(0,0,0,0.05), 0 0 0 6px #7a5428, 0 12px 40px rgba(0,0,0,0.30)",
            position: "relative",
            overflow: "hidden",
            borderTop: "none",
          }}
        >
          <BoardMarkings />

          {/* Ruled lines */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 28px, rgba(90,70,40,0.05) 28px, rgba(90,70,40,0.05) 29px)",
            }}
          />

          <div className="relative z-10 px-6 pt-6 pb-5">
            {/* Board title */}
            <div className="text-center mb-5">
              <p
                className="text-[11px] font-black uppercase tracking-[0.3em]"
                style={{ color: "rgba(90,60,20,0.45)" }}
              >
                Coach's Whiteboard
              </p>
            </div>

            {/* ── CARDS: desktop horizontal row ── */}
            <div className="hidden md:flex gap-4 items-start pt-4 pb-2">
              {playersLoading ? (
                [0,1,2,3].map(i => (
                  <div
                    key={i}
                    className="flex-1 rounded-xl animate-pulse"
                    style={{
                      height: 250,
                      background: "rgba(255,255,255,0.7)",
                      border: "1px solid rgba(0,0,0,0.08)",
                      transform: `rotate(${[-0.8, 0.6, -0.5, 0.9][i]}deg)`,
                    }}
                  />
                ))
              ) : (
                cards.map(card => (
                  <StatCard key={card.label} {...card} />
                ))
              )}
            </div>

            {/* ── CARDS: mobile vertical stack ── */}
            <div className="md:hidden flex flex-col gap-6 pt-4 pb-2">
              {playersLoading ? (
                [0,1,2,3].map(i => (
                  <div
                    key={i}
                    className="rounded-xl animate-pulse"
                    style={{
                      height: 200,
                      background: "rgba(255,255,255,0.7)",
                      border: "1px solid rgba(0,0,0,0.08)",
                    }}
                  />
                ))
              ) : (
                cards.map(card => (
                  <StatCard key={card.label} {...card} rotation={0} />
                ))
              )}
            </div>

            {/* ── ACTION PILL BUTTONS ── */}
            <div className="hidden md:flex gap-2.5 mt-4">
              <ActionPill to="/sports/afl/current-round" label="View Must Buys"   color="#2e6b30" />
              <ActionPill to="/sports/afl/current-round" label="View Trap Alerts" color="#b71c1c" />
              <ActionPill to="/sports/afl/captains"      label="View Captains"    color="#7a5500" />
              <ActionPill to="/sports/afl/market-watch"  label="Open Market Watch" color="#1a5c8a" />
            </div>

            {/* ── QUICK ICON ACTIONS ── */}
            <div className="mt-4 pt-3.5 flex flex-wrap items-center justify-center gap-x-6 gap-y-3" style={{ borderTop: "1px solid rgba(90,70,40,0.10)" }}>
              {[
                { to: "/sports/afl/current-round", icon: <GitCompare size={16} />, label: "Compare Players", color: "#2e6b30" },
                { to: "/sports/afl/rankings",      icon: <Bookmark size={16} />,   label: "Watchlist",       color: "#7a5500" },
                { to: "/sports/afl/current-round", icon: <AlertTriangle size={16} />, label: "Trap Alerts",  color: "#b71c1c" },
                { to: "/sports/afl/rankings",      icon: <Star size={16} />,       label: "Full Rankings",   color: "#1a5c8a" },
              ].map(({ to, icon, label, color }) => (
                <Link
                  key={label}
                  to={to}
                  className="flex items-center gap-2 transition-all hover:opacity-80 active:scale-[0.97]"
                  style={{ color: "rgba(60,40,15,0.55)", fontSize: 13, fontWeight: 700 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = color; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(60,40,15,0.55)"; }}
                >
                  <span style={{ color }}>{icon}</span>
                  {label}
                </Link>
              ))}
              <Link
                to="/sports/afl/rankings"
                className="text-[13px] font-bold"
                style={{ color: "rgba(60,40,15,0.35)" }}
              >
                ›
              </Link>
            </div>

            {/* ── MICRO TRUST ROW ── */}
            <div className="mt-3.5 flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5">
              {[
                "Updated before every round lockout",
                "630+ players fully analysed weekly",
                "Gives you edge, not opinion",
              ].map(text => (
                <span
                  key={text}
                  className="flex items-center gap-1.5 text-[10px] font-semibold"
                  style={{ color: "rgba(60,40,15,0.38)" }}
                >
                  <Check size={9} style={{ color: "#5a8a5a" }} />
                  {text}
                </span>
              ))}
            </div>
          </div>

          {/* Marker tray */}
          <div
            style={{
              height: 20,
              background: "linear-gradient(180deg, #c8bda0 0%, #b8ad88 100%)",
              display: "flex",
              alignItems: "center",
              paddingLeft: 20,
              gap: 8,
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.10)",
            }}
          >
            {["#e74c3c","#2ecc71","#3498db","#1a1208"].map((c, i) => (
              <div
                key={i}
                style={{
                  height: 10,
                  width: 30,
                  borderRadius: 3,
                  background: c,
                  transform: `rotate(${i % 2 === 0 ? -1.5 : 1}deg)`,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.20)",
                }}
              />
            ))}
          </div>
        </div>

        {/* Wooden bottom rail */}
        <div
          style={{
            width: "100%",
            maxWidth: 1100,
            height: 22,
            background: "linear-gradient(180deg, #8a6030 0%, #5a3c18 100%)",
            boxShadow: "0 6px 0 0 #4a2c0c, 0 12px 28px rgba(0,0,0,0.35)",
            borderRadius: "0 0 10px 10px",
          }}
        />

        {/* ═══════════════════════════════════════════════════════════
            BELOW BOARD — continuous canvas, no sections
        ═══════════════════════════════════════════════════════════ */}

        {/* "Win in 3 Easy Steps" — same page, open layout */}
        <div
          style={{
            width: "100%",
            maxWidth: 1100,
            marginTop: 72,
            paddingBottom: 16,
          }}
        >
          <div className="text-center mb-10">
            <h2
              className="text-[1.7rem] md:text-[2.2rem] font-extrabold leading-tight tracking-tight"
              style={{ color: "#2a2016" }}
            >
              Win Your AFL Fantasy Week in 3 Easy Steps
            </h2>
            <p
              className="text-[14px] mt-3 max-w-lg mx-auto leading-relaxed"
              style={{ color: "rgba(42,32,22,0.50)" }}
            >
              Driven by data, our insights help you make better trades, choose captains wisely, and spot costly traps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                num: "1.",
                title: "See Expert Analysis",
                body: "Get weekly Must Buys, Trap Alerts, Captain Picks, and more, all backed by data.",
                color: "#2e6b30",
              },
              {
                num: "2.",
                title: "Make Informed Trades",
                body: "Trade in form players and avoid failing traps, supported by our trending trade numbers.",
                color: "#7a5500",
              },
              {
                num: "3.",
                title: "Dominate Your League",
                body: "Consistent weekly edges compound. Our members average better transfers every round.",
                color: "#1a5c8a",
              },
            ].map(({ num, title, body, color }) => (
              <div
                key={num}
                className="rounded-xl p-6"
                style={{
                  background: "rgba(255,255,255,0.45)",
                  border: "1px solid rgba(0,0,0,0.07)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                }}
              >
                <p className="text-[13px] font-black mb-2" style={{ color }}>
                  {num}
                </p>
                <h3
                  className="text-[16px] font-extrabold mb-2 leading-snug"
                  style={{ color: "#2a2016" }}
                >
                  {title}
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ color: "rgba(42,32,22,0.55)" }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── PRICING BLOCK ── same continuous canvas ── */}
        <div
          style={{
            width: "100%",
            maxWidth: 1100,
            marginTop: 72,
          }}
        >
          <div className="text-center mb-10">
            <h2
              className="text-[1.7rem] md:text-[2.2rem] font-extrabold leading-tight tracking-tight"
              style={{ color: "#2a2016" }}
            >
              Unlock the Full Neeko Stats Suite
            </h2>
            <p
              className="text-[14px] mt-3 max-w-sm mx-auto"
              style={{ color: "rgba(42,32,22,0.50)" }}
            >
              Try our full premium AFL Fantasy features. Instant access, cancel anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Sample card 1 */}
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: "#fff",
                border: "1px solid rgba(0,0,0,0.09)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
              }}
            >
              <div className="px-3 py-2 flex items-center gap-1.5" style={{ background: "#e8f5e9", borderBottom: "1px solid #c8e6c9" }}>
                <TrendingUp size={10} style={{ color: "#2e6b30" }} />
                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#2e6b30" }}>Must Buy</span>
                <span className="ml-auto text-[7px] font-black uppercase px-1.5 py-0.5 rounded" style={{ background: "#2e6b3020", color: "#2e6b30" }}>RUC</span>
              </div>
              <div className="px-4 pt-3 pb-1">
                <p className="text-[15px] font-extrabold text-[#1a1508]">Christian Petracca</p>
                <p className="text-[9px] text-[#8a7a62] font-semibold mt-0.5">B. Kelde Lions — RUC</p>
              </div>
              <div className="px-4 pt-1 pb-1.5">
                <span className="text-[26px] font-black leading-none" style={{ color: "#2e6b30" }}>114</span>
                <span className="text-[10px] text-[#9a8a70] font-semibold ml-1">pts</span>
              </div>
              <div className="px-4 pb-2 flex flex-col gap-1">
                <div className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-[#2e6b30]" /><span className="text-[9px] text-[#6a5a42] font-semibold">Vinitica Apprient</span></div>
                <div className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-[#2e6b30]" /><span className="text-[9px] text-[#6a5a42] font-semibold">J+ Rinze Gepoott</span></div>
              </div>
              <div className="px-3 pb-3">
                <Link to="/sports/afl/current-round" className="block text-center text-[9px] font-bold py-1.5 rounded-lg" style={{ background: "#e8f5e9", color: "#2e6b30", border: "1px solid #c8e6c9" }}>
                  View Must Buys ›
                </Link>
              </div>
            </div>

            {/* Sample card 2 */}
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: "#fff",
                border: "1px solid rgba(0,0,0,0.09)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
              }}
            >
              <div className="px-3 py-2 flex items-center gap-1.5" style={{ background: "#ffebee", borderBottom: "1px solid #ffcdd2" }}>
                <AlertTriangle size={10} style={{ color: "#b71c1c" }} />
                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#b71c1c" }}>Trap Alert</span>
                <span className="ml-auto text-[7px] font-black uppercase px-1.5 py-0.5 rounded" style={{ background: "#b71c1c20", color: "#b71c1c" }}>DEF</span>
              </div>
              <div className="px-4 pt-3 pb-1">
                <p className="text-[15px] font-extrabold text-[#1a1508]">Nick Daicos</p>
                <p className="text-[9px] text-[#8a7a62] font-semibold mt-0.5">5 Kelde Lions — DEF</p>
              </div>
              <div className="px-4 pt-1 pb-1.5">
                <span className="text-[26px] font-black leading-none" style={{ color: "#b71c1c" }}>82</span>
                <span className="text-[10px] text-[#9a8a70] font-semibold ml-1">pts</span>
              </div>
              <div className="px-4 pb-2 flex flex-col gap-1">
                <div className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-[#b71c1c]" /><span className="text-[9px] text-[#6a5a42] font-semibold">x2 more</span></div>
                <div className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-[#b71c1c]" /><span className="text-[9px] text-[#6a5a42] font-semibold">+3 trades</span></div>
              </div>
              <div className="px-3 pb-3">
                <Link to="/sports/afl/current-round" className="block text-center text-[9px] font-bold py-1.5 rounded-lg" style={{ background: "#ffebee", color: "#b71c1c", border: "1px solid #ffcdd2" }}>
                  View Trap Alerts ›
                </Link>
              </div>
            </div>

            {/* Pricing panel */}
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: "linear-gradient(160deg, #f5f2e8 0%, #ede8d5 100%)",
                border: "1px solid rgba(90,60,20,0.20)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
              }}
            >
              <div
                className="px-4 py-2.5 flex items-center justify-between"
                style={{ borderBottom: "1px solid rgba(90,60,20,0.12)", background: "rgba(90,60,20,0.06)" }}
              >
                <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: "rgba(90,60,20,0.55)" }}>
                  Complete Roundpack
                </span>
                <div className="w-3 h-3 rounded-full" style={{ background: "#c0392b" }} />
              </div>
              <div className="px-5 pt-4 pb-2">
                <div className="flex items-end gap-2 mb-3">
                  <span className="text-[16px] font-bold" style={{ color: "rgba(42,32,22,0.40)" }}>Free</span>
                  <span className="text-[28px] font-extrabold" style={{ color: "#2a2016" }}>
                    ${NEEKO_PRICING.yearly.monthlyEquivalent}
                    <span className="text-[13px] font-semibold" style={{ color: "rgba(42,32,22,0.45)" }}>/month</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-4">
                  {["Updated", "BonuDios.", "Must Buys.", "Trap Rusts", "Treaps", "Captain Picks", "Captains.", "Full Rankings"].map(f => (
                    <div key={f} className="flex items-center gap-1.5">
                      <Check size={9} style={{ color: "#5a8a5a" }} />
                      <span className="text-[10px] font-semibold" style={{ color: "rgba(42,32,22,0.60)" }}>{f}</span>
                    </div>
                  ))}
                </div>
                <Link
                  to="/neeko-plus"
                  className="flex items-center justify-center gap-1.5 font-bold text-[12px] py-2.5 rounded-lg transition-all hover:brightness-[1.05] active:scale-[0.97]"
                  style={{ background: "#F5C84C", color: "#1a1200", boxShadow: "0 2px 12px rgba(245,200,76,0.30)" }}
                >
                  <Crown size={11} />
                  Unlock Full Access ›
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── FOOTER ── continuous, no hard border ── */}
        <div
          style={{
            width: "100%",
            maxWidth: 1100,
            marginTop: 64,
            paddingTop: 24,
            borderTop: "1px solid rgba(42,32,22,0.10)",
          }}
        >
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-[11px]" style={{ color: "rgba(42,32,22,0.30)" }}>
              © {new Date().getFullYear()} Neeko Sports Stats. All rights reserved.
            </p>
            <div className="flex gap-5">
              {[
                { label: "Policies", to: "/policies" },
                { label: "Contact",  to: "/contact" },
                { label: "About",    to: "/about" },
                { label: "FAQ",      to: "/faq" },
              ].map(l => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="text-[11px] transition-colors"
                  style={{ color: "rgba(42,32,22,0.30)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(42,32,22,0.65)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(42,32,22,0.30)"; }}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!isPremium && <MobileUpgradeBar />}
    </div>
  );
}
