import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Crown, ArrowRight, Check, TrendingUp, TriangleAlert as AlertTriangle, Star, Shield, Clock, Users, ChevronRight, Zap, ChartBar as BarChart3, GitCompare } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { NEEKO_PRICING } from "@/config/neekoPricing";
import MobileUpgradeBar from "@/components/mobile/MobileUpgradeBar";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";

// ─── Static config ─────────────────────────────────────────────────────────────

const FOOTER_LINKS = [
  { label: "Policies", to: "/policies" },
  { label: "Contact",  to: "/contact" },
  { label: "About",    to: "/about" },
  { label: "FAQ",      to: "/faq" },
];

const NEEKO_FEATURES = [
  "Full weekly game plan before lockout",
  "Complete buy, sell & trap signals",
  "Captain picks with tier confidence",
  "Market Watch — 600+ players",
  "Breakout alerts and risk flags",
  "Full projections, ceilings & floors",
  "Start/Sit decision engine",
  "Updated before every round lockout",
];

// ─── Signal helpers ────────────────────────────────────────────────────────────

const BUY_SIGNALS   = ["STRONG_UP", "STRONG_BUY", "MUST_HAVE", "BREAKOUT", "UP", "BUY"];
const AVOID_SIGNALS = ["STRONG_DOWN", "STRONG_SELL", "AVOID", "DO_NOT_START", "DOWN", "SELL"];

function resolveSignal(row: RankingRow): string {
  return ((row.action ?? row.signal_tag ?? row.signal ?? "")).toUpperCase();
}

function isBuy(row: RankingRow)   { return BUY_SIGNALS.includes(resolveSignal(row)); }
function isAvoid(row: RankingRow) { return AVOID_SIGNALS.includes(resolveSignal(row)); }

function isPlayable(p: RankingRow): boolean {
  const ms = (p.manual_status ?? "").toUpperCase();
  return ms !== "OUT" && ms !== "INJURED" && !p.is_bye && !p.is_injured;
}

// ─── Mock data fallback ────────────────────────────────────────────────────────

const MOCK_CARDS = {
  mustBuy: { player_name: "Rowan Marshall", team: "St Kilda", position: "RUC", projection: 114, price: 620000, why: "Dominant ruck, soft matchup, underpriced vs output." },
  trap:    { player_name: "Zac Bailey",     team: "Brisbane Lions", position: "MID", projection: 82,  price: 710000, why: "Overpriced, role shift risk, fade this round." },
  captain: { player_name: "Dayne Zorko",    team: "Brisbane Lions", position: "DEF", projection: 132, price: 890000, why: "Elite ceiling, lock matchup, highest confidence captain." },
  value:   { player_name: "Finn Callaghan", team: "GWS Giants",     position: "MID", projection: 120, price: 580000, why: "Premium output at mid-price — strong value buy this week." },
};

// ─── Chalk texture SVG background ─────────────────────────────────────────────

function ChalkNoise() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#noise)" />
    </svg>
  );
}

// ─── Chalk diagram lines (decorative) ─────────────────────────────────────────

function ChalkDiagram({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 300 200"
      className={`pointer-events-none select-none ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" fill="none" strokeLinecap="round">
        <circle cx="150" cy="100" r="55" strokeDasharray="6 4" />
        <line x1="30" y1="40" x2="80" y2="90" />
        <line x1="270" y1="40" x2="220" y2="90" />
        <polyline points="55,60 90,100 55,140" />
        <polyline points="245,60 210,100 245,140" />
        <line x1="150" y1="20" x2="150" y2="45" />
        <circle cx="150" cy="100" r="12" strokeDasharray="3 3" />
      </g>
      <g fill="rgba(255,255,255,0.10)" fontSize="10" fontFamily="sans-serif">
        <text x="20" y="30">×</text>
        <text x="265" y="30">×</text>
        <text x="140" y="180">○</text>
        <text x="60" y="100">→</text>
        <text x="225" y="100">←</text>
      </g>
    </svg>
  );
}

// ─── Pin decoration ────────────────────────────────────────────────────────────

function Pin({ color = "#c0392b" }: { color?: string }) {
  return (
    <div
      className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full z-20 shadow-md"
      style={{ background: color, boxShadow: `0 2px 6px ${color}80` }}
    >
      <div className="w-1.5 h-1.5 rounded-full bg-white/40 absolute top-1 left-1" />
    </div>
  );
}

// ─── Whiteboard card ───────────────────────────────────────────────────────────

interface WhiteboardCardProps {
  label: string;
  labelColor: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  player: { player_name: string; team: string; position?: string | null; projection?: number | null; why?: string | null };
  secondaryPlayers?: string[];
  ctaLabel: string;
  ctaTo: string;
  rotation?: number;
  pinColor?: string;
  badge?: string;
  badgeColor?: string;
  valueTag?: string;
}

function WhiteboardCard({
  label, labelColor, bgColor, borderColor, icon,
  player, secondaryPlayers = [], ctaLabel, ctaTo,
  rotation = 0, pinColor, badge, badgeColor, valueTag,
}: WhiteboardCardProps) {
  const proj = player.projection != null ? Math.round(player.projection) : null;

  return (
    <div
      className="relative group cursor-pointer"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <Pin color={pinColor} />
      <Link to={ctaTo} className="block">
        <div
          className="rounded-xl overflow-hidden shadow-xl transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-2xl"
          style={{
            background: bgColor,
            border: `1.5px solid ${borderColor}`,
            boxShadow: `0 6px 24px rgba(0,0,0,0.28), 0 1px 0 rgba(255,255,255,0.06)`,
          }}
        >
          {/* Card header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b" style={{ borderColor }}>
            <div className="flex items-center gap-1.5">
              <span style={{ color: labelColor }}>{icon}</span>
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: labelColor }}>
                {label}
              </span>
            </div>
            {badge && (
              <span
                className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{ background: `${badgeColor}22`, color: badgeColor, border: `1px solid ${badgeColor}44` }}
              >
                {badge}
              </span>
            )}
          </div>

          {/* Player */}
          <div className="px-3.5 pt-3 pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[15px] font-extrabold text-[#1a1a1a] leading-tight">{player.player_name}</p>
                <p className="text-[10px] text-[#555] mt-0.5">{player.team}{player.position ? ` · ${player.position}` : ""}</p>
              </div>
              {valueTag && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#2e7d32]/15 text-[#2e7d32] border border-[#2e7d32]/25 shrink-0 mt-0.5">
                  {valueTag}
                </span>
              )}
            </div>

            {proj != null && (
              <div className="mt-2.5 mb-1">
                <span className="text-2xl font-black tabular-nums" style={{ color: labelColor }}>
                  {proj} pts
                </span>
              </div>
            )}
          </div>

          {/* Secondary players */}
          {secondaryPlayers.length > 0 && (
            <div className="px-3.5 pb-2 space-y-1.5 border-t border-black/[0.07] pt-2.5">
              {secondaryPlayers.map((name, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-1 h-1 rounded-full" style={{ background: labelColor }} />
                  <span className="text-[11px] text-[#444]">{name}</span>
                </div>
              ))}
            </div>
          )}

          {/* CTA */}
          <div className="px-3.5 pb-3.5 pt-2">
            <div
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold transition-all"
              style={{ background: `${labelColor}18`, color: labelColor, border: `1px solid ${labelColor}30` }}
            >
              {ctaLabel}
              <ChevronRight size={11} />
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

// ─── Quick action pill ─────────────────────────────────────────────────────────

function QuickAction({ icon, label, to }: { icon: React.ReactNode; label: string; to: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 hover:border-white/20 transition-all group"
    >
      <div className="w-7 h-7 rounded-lg bg-[#F5C84C]/15 border border-[#F5C84C]/25 flex items-center justify-center shrink-0 group-hover:bg-[#F5C84C]/22 transition-all">
        <span className="text-[#F5C84C]">{icon}</span>
      </div>
      <span className="text-[13px] font-semibold text-white/75 group-hover:text-white transition-colors">{label}</span>
      <ChevronRight size={12} className="ml-auto text-white/25 group-hover:text-white/50 transition-colors" />
    </Link>
  );
}

// ─── Trust tick ───────────────────────────────────────────────────────────────

function TrustTick({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 rounded-full bg-[#2e7d32]/20 border border-[#2e7d32]/40 flex items-center justify-center shrink-0">
        <Check size={8} className="text-[#4caf50]" />
      </div>
      <span className="text-[12px] text-[#555] font-medium">{children}</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

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
      if (error) {
        console.error("[LandingPlayers] fetch error:", error.message);
        setPlayersLoading(false);
        return;
      }
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

    const mustBuyPlayer  = buyPool[0] ?? byValue[0] ?? null;
    const trapPlayer     = avoidPool[0] ?? null;
    const captainPlayer  = byCaptain.find(p =>
      p.player_id !== mustBuyPlayer?.player_id && p.player_id !== trapPlayer?.player_id
    ) ?? null;
    const valuePlayer    = buyPool.find(p =>
      p.player_id !== mustBuyPlayer?.player_id && p.price != null && (p.price < 600_000)
    ) ?? buyPool[1] ?? null;

    return { mustBuyPlayer, trapPlayer, captainPlayer, valuePlayer };
  }, [players]);

  const showMock = playersLoading || !mustBuyPlayer;

  const mustBuy  = mustBuyPlayer  ?? MOCK_CARDS.mustBuy as Partial<RankingRow>;
  const trap     = trapPlayer     ?? MOCK_CARDS.trap    as Partial<RankingRow>;
  const captain  = captainPlayer  ?? MOCK_CARDS.captain as Partial<RankingRow>;
  const value    = valuePlayer    ?? MOCK_CARDS.value   as Partial<RankingRow>;

  const mustBuySecondary  = players.filter(isBuy).filter(p => p.player_id !== mustBuyPlayer?.player_id).slice(0, 1).map(p => p.player_name);
  const trapSecondary     = players.filter(isAvoid).filter(p => p.player_id !== trapPlayer?.player_id).slice(0, 1).map(p => p.player_name);
  const captainSecondary  = players.filter(p => p.player_id !== captainPlayer?.player_id && p.player_id !== mustBuyPlayer?.player_id).sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0)).slice(0, 1).map(p => p.player_name);

  const moreCount = Math.max(0, players.filter(isBuy).length - 3);

  return (
    <div className="min-h-screen bg-[#1c1a16] text-white pb-[80px] sm:pb-0">
      <Helmet>
        <title>Neeko Sports Stats — AFL Fantasy Coach's Whiteboard</title>
        <meta name="description" content="Win your AFL Fantasy week in 30 seconds. Trade targets, trap warnings, and captain picks powered by real AFL data. Updated before every round lockout." />
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
          "description": "AI-powered AFL Fantasy analytics — weekly game plans, captain picks, buy/sell signals and trap warnings for AFL Fantasy coaches.",
          "offers": { "@type": "Offer", "price": "9.99", "priceCurrency": "AUD" },
          "publisher": { "@type": "Organization", "name": "Neeko Sports Stats", "url": "https://neekostats.com.au" },
        })}</script>
      </Helmet>

      {/* ══════════════════════════════════════════════════════════════════════════
          1. BLACKBOARD HERO
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden" style={{ background: "linear-gradient(160deg, #1a1a14 0%, #14120e 50%, #0f0e0b 100%)" }}>
        <ChalkNoise />

        {/* Chalk diagram — left */}
        <ChalkDiagram className="absolute left-0 top-0 w-64 md:w-96 opacity-60" />

        {/* Chalk diagram — right (mirrored) */}
        <div className="absolute right-0 top-0 w-64 md:w-96 opacity-40 scale-x-[-1]">
          <ChalkDiagram className="w-full" />
        </div>

        {/* Warm vignette */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(245,200,76,0.04) 0%, transparent 65%)" }} />

        {/* Board frame top edge */}
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "linear-gradient(90deg, #5c3d1a, #8b6914, #5c3d1a)" }} />

        <div className="relative z-10 max-w-4xl mx-auto px-5 pt-14 pb-10 md:pt-20 md:pb-14 text-center">
          {/* Live badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#F5C84C]/30 bg-[#F5C84C]/8 text-[#F5C84C] text-[10px] font-bold uppercase tracking-widest mb-7">
            <div className="w-1.5 h-1.5 rounded-full bg-[#F5C84C] animate-pulse" />
            AFL 2026 — Updated Before Lockout
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1.06] tracking-tight text-white mb-5" style={{ textShadow: "0 2px 20px rgba(0,0,0,0.6)" }}>
            Win Your <span style={{ color: "#F5C84C" }}>AFL Fantasy</span><br className="hidden sm:block" /> Week in 30 Seconds
          </h1>

          <p className="text-base md:text-lg text-white/55 font-medium max-w-xl mx-auto leading-relaxed mb-10">
            Trades, targets, captains, and traps — powered by data, just like an AFL coach.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center sm:items-center mb-8">
            <Link
              to="/auth"
              className="flex items-center justify-center gap-2 font-bold text-[15px] px-8 rounded-xl transition-all min-h-[52px] w-full sm:w-auto"
              style={{ background: "#F5C84C", color: "#111", boxShadow: "0 4px 28px rgba(245,200,76,0.30)" }}
            >
              Get Started Free
              <ArrowRight size={15} />
            </Link>
            {!isPremium && (
              <Link
                to="/neeko-plus"
                className="flex items-center justify-center gap-2 border border-[#F5C84C]/35 text-[#F5C84C]/80 hover:text-[#F5C84C] hover:border-[#F5C84C]/55 font-semibold text-[15px] px-8 rounded-xl transition-all min-h-[52px] w-full sm:w-auto"
              >
                <Crown size={14} />
                Unlock Full Access
              </Link>
            )}
          </div>

          <p className="text-[11px] text-white/22 tracking-wide">
            Updated before every AFL Fantasy round lockout — 600+ players analysed weekly
          </p>
        </div>

        {/* Board ledge */}
        <div className="absolute bottom-0 left-0 right-0 h-3 pointer-events-none" style={{ background: "linear-gradient(0deg, rgba(92,61,26,0.5), transparent)" }} />
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
          2. COACH'S WHITEBOARD
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="relative" style={{ background: "linear-gradient(180deg, #0f0e0b 0%, #18160f 100%)" }}>
        {/* Wooden frame top */}
        <div className="w-full h-6 md:h-8" style={{ background: "linear-gradient(180deg, #4a3010 0%, #6b4a1a 40%, #8b6124 60%, #5c3d16 100%)" }}>
          <div className="max-w-5xl mx-auto h-full flex items-center px-6 gap-3">
            {["#c0392b","#27ae60","#3498db"].map((c, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ background: c }} />
            ))}
          </div>
        </div>

        {/* Whiteboard surface */}
        <div
          className="relative mx-2 md:mx-6 lg:mx-auto lg:max-w-5xl rounded-b-2xl overflow-hidden shadow-2xl"
          style={{
            background: "linear-gradient(160deg, #f4f1e8 0%, #ede9db 40%, #e8e4d6 100%)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(0,0,0,0.08)",
          }}
        >
          {/* Subtle board texture */}
          <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(0,0,0,0.3) 60px, rgba(0,0,0,0.3) 61px)" }} />

          <div className="relative z-10 px-4 md:px-8 pt-6 pb-8">
            {/* Board title */}
            <div className="text-center mb-6">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#8a7a5a] mb-1">Coach's Whiteboard</p>
              <h2 className="text-xl md:text-2xl font-extrabold text-[#2a2218]">Your Gameplan For This Week</h2>
            </div>

            {/* 4 pinned cards */}
            {playersLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5 mb-6">
                {[0,1,2,3].map(i => (
                  <div key={i} className="relative rounded-xl bg-white/60 border border-black/10 p-4 animate-pulse min-h-[200px]">
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[#c0392b]/50" />
                    <div className="h-2.5 w-16 bg-black/10 rounded mb-3" />
                    <div className="h-5 w-28 bg-black/12 rounded mb-1.5" />
                    <div className="h-3 w-20 bg-black/8 rounded mb-4" />
                    <div className="h-8 bg-black/6 rounded mb-3" />
                    <div className="h-8 bg-black/[0.05] rounded" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5 mb-6 pt-4">
                <WhiteboardCard
                  label="Must Buy"
                  labelColor="#2e7d32"
                  bgColor="linear-gradient(160deg, #f0fff2 0%, #f7f5ee 100%)"
                  borderColor="rgba(46,125,50,0.25)"
                  icon={<TrendingUp size={12} />}
                  player={mustBuy as { player_name: string; team: string; position?: string | null; projection?: number | null; why?: string | null }}
                  secondaryPlayers={mustBuySecondary.length > 0 ? [...mustBuySecondary, `+${Math.max(0, moreCount)} more`] : []}
                  ctaLabel="View Must Buys"
                  ctaTo="/sports/afl/current-round"
                  rotation={-1.5}
                  pinColor="#2e7d32"
                  badge="RUC"
                  badgeColor="#2e7d32"
                />

                <WhiteboardCard
                  label="Trap Alerts"
                  labelColor="#c62828"
                  bgColor="linear-gradient(160deg, #fff5f5 0%, #f7f5ee 100%)"
                  borderColor="rgba(198,40,40,0.22)"
                  icon={<AlertTriangle size={12} />}
                  player={trap as { player_name: string; team: string; position?: string | null; projection?: number | null; why?: string | null }}
                  secondaryPlayers={trapSecondary.length > 0 ? [...trapSecondary, "+5 more"] : ["+5 more"]}
                  ctaLabel="View Trap Alerts"
                  ctaTo="/sports/afl/current-round"
                  rotation={1.0}
                  pinColor="#c62828"
                  badge="MID"
                  badgeColor="#c62828"
                />

                <WhiteboardCard
                  label="Captain Picks"
                  labelColor="#b8860b"
                  bgColor="linear-gradient(160deg, #fffdf0 0%, #f7f5ee 100%)"
                  borderColor="rgba(184,134,11,0.25)"
                  icon={<Star size={12} />}
                  player={captain as { player_name: string; team: string; position?: string | null; projection?: number | null; why?: string | null }}
                  secondaryPlayers={captainSecondary.length > 0 ? [...captainSecondary, "+2 more"] : ["+2 more"]}
                  ctaLabel="View Captains"
                  ctaTo="/sports/afl/captains"
                  rotation={-0.8}
                  pinColor="#b8860b"
                  badge="CAPT"
                  badgeColor="#b8860b"
                />

                <WhiteboardCard
                  label="Best Value"
                  labelColor="#1565c0"
                  bgColor="linear-gradient(160deg, #f0f5ff 0%, #f7f5ee 100%)"
                  borderColor="rgba(21,101,192,0.22)"
                  icon={<BarChart3 size={12} />}
                  player={value as { player_name: string; team: string; position?: string | null; projection?: number | null; why?: string | null }}
                  secondaryPlayers={["+3 more"]}
                  ctaLabel="Open Market Watch"
                  ctaTo="/sports/afl/market-watch"
                  rotation={1.8}
                  pinColor="#1565c0"
                  badge="DEF"
                  badgeColor="#1565c0"
                  valueTag={value.projection != null ? `+17` : undefined}
                />
              </div>
            )}

            {/* Shimmer loading indicator for mock data */}
            {showMock && !playersLoading && (
              <div className="text-center mb-4">
                <span className="text-[10px] text-[#8a7a5a]/60 font-medium">Live data loads Monday evening after match completion</span>
              </div>
            )}

            {/* Quick action row */}
            <div className="border-t border-black/[0.08] pt-5">
              <div className="flex items-center flex-wrap gap-2 md:gap-4 justify-center mb-4">
                <Link to="/sports/afl/current-round" className="flex items-center gap-2 text-[12px] font-semibold text-[#2a2218] hover:text-[#2e7d32] transition-colors px-3 py-2 rounded-lg hover:bg-[#2e7d32]/8">
                  <GitCompare size={14} className="text-[#2e7d32]" />
                  Compare Players
                </Link>
                <div className="w-px h-4 bg-black/10 hidden md:block" />
                <Link to="/sports/afl/market-watch" className="flex items-center gap-2 text-[12px] font-semibold text-[#2a2218] hover:text-[#1565c0] transition-colors px-3 py-2 rounded-lg hover:bg-[#1565c0]/8">
                  <BarChart3 size={14} className="text-[#1565c0]" />
                  Market Watch
                </Link>
                <div className="w-px h-4 bg-black/10 hidden md:block" />
                <Link to="/sports/afl/current-round" className="flex items-center gap-2 text-[12px] font-semibold text-[#2a2218] hover:text-[#c62828] transition-colors px-3 py-2 rounded-lg hover:bg-[#c62828]/8">
                  <AlertTriangle size={14} className="text-[#c62828]" />
                  Trap Alerts
                </Link>
                <div className="w-px h-4 bg-black/10 hidden md:block" />
                <Link to="/sports/afl/rankings" className="flex items-center gap-2 text-[12px] font-semibold text-[#2a2218] hover:text-[#b8860b] transition-colors px-3 py-2 rounded-lg hover:bg-[#b8860b]/8">
                  <Star size={14} className="text-[#b8860b]" />
                  Full Rankings
                  <ChevronRight size={11} className="text-black/30" />
                </Link>
              </div>

              {/* Trust ticks */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6">
                <TrustTick>Updated before every round lockout</TrustTick>
                <TrustTick>630+ players fully analysed weekly</TrustTick>
                <TrustTick>Gives you edge, not opinion</TrustTick>
              </div>
            </div>
          </div>

          {/* Marker tray at bottom */}
          <div className="relative h-5 md:h-6" style={{ background: "linear-gradient(180deg, #d4c9a8 0%, #c8bc98 100%)" }}>
            <div className="absolute left-6 top-1 flex gap-2">
              {["#e74c3c","#2ecc71","#3498db","#1a1a1a"].map((c, i) => (
                <div key={i} className="h-3.5 w-7 rounded-sm shadow-sm" style={{ background: c, transform: `rotate(${i % 2 === 0 ? -1 : 1}deg)` }} />
              ))}
            </div>
          </div>
        </div>

        {/* Wooden frame bottom */}
        <div className="mx-2 md:mx-6 lg:mx-auto lg:max-w-5xl h-4 md:h-5 rounded-b-xl" style={{ background: "linear-gradient(180deg, #6b4a1a 0%, #4a3010 100%)" }} />

        {/* Board shadow on floor */}
        <div className="mx-2 md:mx-6 lg:mx-auto lg:max-w-5xl h-3 rounded-b-full opacity-40" style={{ background: "rgba(0,0,0,0.4)", filter: "blur(6px)" }} />

        <div className="pb-12" />
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
          3. WIN YOUR WEEK — 3 STEPS
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-16 md:py-24 bg-[#0f0e0b] border-t border-white/[0.04]">
        <div className="max-w-4xl mx-auto px-5">
          <div className="text-center mb-12">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#F5C84C]/45 mb-3">How It Works</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-4">
              Win Your AFL Fantasy Week in 3 Easy Steps
            </h2>
            <p className="text-white/45 text-base max-w-xl mx-auto leading-relaxed">
              Driven by data, our insights help you make better trades, choose captains wisely, and spot costly traps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                num: "1",
                title: "See Expert Analysis",
                body: "Get weekly Must Buys, Trap Alerts, Captain Picks, and more, all backed by data — not opinion.",
                icon: <Zap size={18} className="text-[#F5C84C]" />,
              },
              {
                num: "2",
                title: "Make Informed Trades",
                body: "Trade in form players and avoid failing traps, supported by our trending trade numbers and projections.",
                icon: <TrendingUp size={18} className="text-[#F5C84C]" />,
              },
              {
                num: "3",
                title: "Avoid the Traps",
                body: "Know which players are overpriced, out of form, or risky before you lock in. Edge over your league every round.",
                icon: <Shield size={18} className="text-[#F5C84C]" />,
              },
            ].map(({ num, title, body, icon }) => (
              <div
                key={num}
                className="rounded-2xl p-7 border border-white/[0.07] relative overflow-hidden"
                style={{ background: "linear-gradient(160deg, #161410 0%, #111009 100%)" }}
              >
                <div className="absolute top-5 right-5 text-[52px] font-black text-white/[0.03] leading-none select-none">
                  {num}
                </div>
                <div className="w-11 h-11 rounded-xl bg-[#F5C84C]/10 border border-[#F5C84C]/20 flex items-center justify-center mb-5">
                  {icon}
                </div>
                <h3 className="text-lg font-extrabold text-white mb-2">{num}. {title}</h3>
                <p className="text-sm text-white/45 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
          4. WHY NEEKO WORKS
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-12 md:py-16 border-t border-white/[0.04]" style={{ background: "linear-gradient(180deg, #111009 0%, #0f0e0b 100%)" }}>
        <div className="max-w-4xl mx-auto px-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: Clock,  title: "Updated Weekly",     body: "Fresh projections, signals, and prices before every round lockout." },
              { icon: BarChart3, title: "Data-Driven",     body: "Every signal is backed by 600+ player models — not gut feel or social media." },
              { icon: Users,  title: "Designed for Decisions", body: "Not a stats site. A decision engine. Know what to do, not just what happened." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex items-start gap-4 rounded-2xl border border-white/[0.06] bg-[#0e0e0e] px-5 py-5">
                <div className="w-9 h-9 rounded-lg bg-[#F5C84C]/10 border border-[#F5C84C]/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={16} className="text-[#F5C84C]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white mb-1">{title}</p>
                  <p className="text-[12px] text-white/40 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
          5. QUICK ACTIONS (MOBILE CTA ROW)
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-10 bg-[#0a0908] border-t border-white/[0.04]">
        <div className="max-w-lg mx-auto px-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/25 text-center mb-5">Jump In</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <QuickAction icon={<TrendingUp size={14} />} label="This Week's Game Plan" to="/sports/afl/current-round" />
            <QuickAction icon={<BarChart3 size={14} />}  label="Market Watch"           to="/sports/afl/market-watch" />
            <QuickAction icon={<Star size={14} />}       label="Captain Picks"          to="/sports/afl/captains" />
            <QuickAction icon={<Zap size={14} />}        label="Full Player Rankings"   to="/sports/afl/rankings" />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
          6. PRICING
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-16 md:py-24 bg-[#0f0e0b] border-t border-white/[0.04]">
        <div className="max-w-lg mx-auto px-5 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#F5C84C]/45 mb-3">Pricing</p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-4">
            Unlock the Full Neeko System
          </h2>
          <div className="w-10 h-0.5 rounded-full bg-[#F5C84C]/30 mx-auto mb-5" />
          <p className="text-white/50 text-sm mb-2 max-w-sm mx-auto leading-relaxed">
            Free gives you the headlines. Neeko+ gives you the complete weekly edge.
          </p>
          <p className="text-white/25 text-xs mb-11 max-w-sm mx-auto">
            Every insight updated before round lockout. Cancel anytime.
          </p>

          {/* Yearly hero plan */}
          <div
            className="relative rounded-2xl p-8 mb-5 text-left"
            style={{
              border: "1px solid rgba(245,200,76,0.38)",
              background: "linear-gradient(160deg, #141210 0%, #0e0d0b 100%)",
              boxShadow: "0 0 60px rgba(245,200,76,0.06)",
            }}
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-[#F5C84C] text-black text-[10px] font-black px-3.5 py-0.5 rounded-full uppercase tracking-wider">
                Best Value
              </span>
            </div>

            <p className="text-[10px] font-bold uppercase tracking-widest text-[#F5C84C]/55 mb-3">Neeko+ Yearly</p>
            <div className="flex items-end gap-1.5 mb-1">
              <span className="text-4xl font-extrabold text-white">${NEEKO_PRICING.yearly.price}</span>
              <span className="text-sm text-white/30 mb-1">AUD / year</span>
            </div>
            <p className="text-xs text-[#F5C84C]/45 mb-7">
              ${NEEKO_PRICING.yearly.monthlyEquivalent}/month equivalent · Save {NEEKO_PRICING.savingsPercent}%
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-7">
              {NEEKO_FEATURES.map(f => (
                <div key={f} className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-[#F5C84C]/12 border border-[#F5C84C]/28 flex items-center justify-center shrink-0 mt-0.5">
                    <Check size={8} className="text-[#F5C84C]" />
                  </div>
                  <span className="text-xs text-white/55 leading-snug">{f}</span>
                </div>
              ))}
            </div>

            <Link
              to="/neeko-plus"
              className="flex items-center justify-center gap-2 font-bold text-sm py-3.5 rounded-xl hover:brightness-110 transition-all min-h-[48px]"
              style={{ background: "#F5C84C", color: "#111" }}
            >
              <Crown size={14} />
              Unlock Full Access
            </Link>
          </div>

          {/* Monthly secondary */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#0d0c0a] p-6 text-left">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-3">Monthly</p>
            <div className="flex items-end gap-1.5 mb-1">
              <span className="text-3xl font-extrabold text-white">${NEEKO_PRICING.monthly.price}</span>
              <span className="text-sm text-white/30 mb-1">AUD / month</span>
            </div>
            <p className="text-xs text-white/22 mb-5">{NEEKO_PRICING.monthly.billingNote}</p>
            <Link
              to="/neeko-plus"
              className="flex items-center justify-center border border-[#F5C84C]/35 text-[#F5C84C]/80 hover:text-[#F5C84C] font-semibold text-sm py-3 rounded-xl hover:bg-[#F5C84C]/8 transition-all min-h-[44px]"
            >
              Start Monthly
            </Link>
          </div>

          <p className="text-[11px] text-white/18 mt-5">No lock-in. Cancel anytime.</p>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.05] bg-[#0a0908] py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-white/18">
              © {new Date().getFullYear()} Neeko Sports Stats. All rights reserved.
            </p>
            <div className="flex gap-5 text-xs">
              {FOOTER_LINKS.map(l => (
                <Link key={l.to} to={l.to} className="text-white/22 hover:text-white/55 transition-colors">
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {!isPremium && <MobileUpgradeBar />}
    </div>
  );
}
