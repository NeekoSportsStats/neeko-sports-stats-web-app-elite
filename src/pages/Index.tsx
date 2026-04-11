import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  Crown, ArrowRight, Check, TrendingUp, TriangleAlert as AlertTriangle,
  Star, Shield, Clock, Users, ChevronRight, Zap, ChartBar as BarChart3,
  GitCompare, ArrowUp, ArrowDown,
} from "lucide-react";
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
  trap:    { player_name: "Zac Bailey",     team: "Brisbane Lions", position: "MID", projection: 82,  price: 710000, why: "Overpriced — role shift risk. Fade this round." },
  captain: { player_name: "Dayne Zorko",    team: "Brisbane Lions", position: "DEF", projection: 132, price: 890000, why: "Elite ceiling, lock matchup. Highest confidence captain." },
  value:   { player_name: "Finn Callaghan", team: "GWS Giants",     position: "MID", projection: 120, price: 580000, why: "Premium output at mid-price. Strong value buy this week." },
};

// ─── Chalk texture SVG ────────────────────────────────────────────────────────

function ChalkNoise() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.025 }}>
      <filter id="chalkgrain">
        <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#chalkgrain)" />
    </svg>
  );
}

// ─── Chalk play diagram ───────────────────────────────────────────────────────

function ChalkDiagram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 220" className={`pointer-events-none select-none ${className}`} xmlns="http://www.w3.org/2000/svg">
      <g stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" fill="none" strokeLinecap="round">
        <circle cx="150" cy="110" r="60" strokeDasharray="7 5" />
        <line x1="25" y1="45" x2="78" y2="95" />
        <line x1="275" y1="45" x2="222" y2="95" />
        <polyline points="50,65 88,108 50,150" />
        <polyline points="250,65 212,108 250,150" />
        <line x1="150" y1="18" x2="150" y2="50" />
        <circle cx="150" cy="110" r="14" strokeDasharray="4 3" />
        <line x1="88" y1="108" x2="136" y2="110" />
        <line x1="212" y1="108" x2="164" y2="110" />
      </g>
      <g fill="rgba(255,255,255,0.09)" fontSize="11" fontFamily="monospace">
        <text x="18" y="35">×</text>
        <text x="264" y="35">×</text>
        <text x="140" y="196">○</text>
        <text x="54" y="112">→</text>
        <text x="228" y="112">←</text>
        <text x="143" y="12">↑</text>
      </g>
    </svg>
  );
}

// ─── Pin decoration ───────────────────────────────────────────────────────────

function Pin({ color = "#c0392b" }: { color?: string }) {
  return (
    <div
      className="absolute -top-3 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full z-20"
      style={{
        background: `radial-gradient(circle at 35% 35%, ${color}ee, ${color})`,
        boxShadow: `0 2px 8px ${color}66, 0 1px 2px rgba(0,0,0,0.3)`,
      }}
    >
      <div className="w-1.5 h-1.5 rounded-full bg-white/50 absolute top-1 left-1.5" />
    </div>
  );
}

// ─── Whiteboard card ──────────────────────────────────────────────────────────

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
  trend?: "up" | "down" | null;
  trendLabel?: string;
}

function WhiteboardCard({
  label, labelColor, bgColor, borderColor, icon,
  player, secondaryPlayers = [], ctaLabel, ctaTo,
  rotation = 0, pinColor, badge, badgeColor,
  trend, trendLabel,
}: WhiteboardCardProps) {
  const proj = player.projection != null ? Math.round(player.projection) : null;

  return (
    <div
      className="relative group"
      style={{ transform: `rotate(${rotation}deg)`, transformOrigin: "top center" }}
    >
      <Pin color={pinColor} />
      <Link to={ctaTo} className="block outline-none">
        <div
          className="rounded-xl overflow-hidden transition-all duration-200 ease-out group-hover:-translate-y-2 group-hover:scale-[1.02]"
          style={{
            background: bgColor,
            border: `1.5px solid ${borderColor}`,
            boxShadow: `0 4px 12px rgba(0,0,0,0.18), 0 14px 36px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.65), inset 0 -1px 0 rgba(0,0,0,0.06)`,
          }}
        >
          {/* Header strip */}
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{ background: `${labelColor}12`, borderBottom: `1.5px solid ${borderColor}` }}
          >
            <div className="flex items-center gap-1.5">
              <span style={{ color: labelColor }}>{icon}</span>
              <span className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: labelColor }}>
                {label}
              </span>
            </div>
            {badge && (
              <span
                className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{ background: `${badgeColor}18`, color: badgeColor, border: `1px solid ${badgeColor}35` }}
              >
                {badge}
              </span>
            )}
          </div>

          {/* Player block */}
          <div className="px-4 pt-3.5 pb-1">
            <p className="text-[16px] font-extrabold text-[#18160f] leading-tight tracking-tight">{player.player_name}</p>
            <p className="text-[11px] text-[#6b6050] mt-0.5 font-medium">{player.team}{player.position ? ` · ${player.position}` : ""}</p>
          </div>

          {/* Projection */}
          {proj != null && (
            <div className="px-4 pt-2 pb-1 flex items-end gap-2">
              <span className="text-[26px] font-black tabular-nums leading-none" style={{ color: labelColor }}>
                {proj}
              </span>
              <span className="text-[12px] text-[#8a7a62] font-semibold mb-0.5">pts proj.</span>
              {trend && trendLabel && (
                <span
                  className="ml-auto flex items-center gap-0.5 text-[10px] font-bold mb-0.5 px-1.5 py-0.5 rounded"
                  style={{
                    color: trend === "up" ? "#2e7d32" : "#c62828",
                    background: trend === "up" ? "#2e7d3215" : "#c6282815",
                  }}
                >
                  {trend === "up" ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
                  {trendLabel}
                </span>
              )}
            </div>
          )}

          {/* Why text */}
          {player.why && (
            <div className="px-4 pt-1.5 pb-2.5">
              <p className="text-[11px] text-[#6b6050] leading-snug">{player.why}</p>
            </div>
          )}

          {/* Divider + secondary */}
          {secondaryPlayers.length > 0 && (
            <div className="border-t mx-4 pt-2.5 pb-2 space-y-1.5" style={{ borderColor: `${borderColor}` }}>
              <p className="text-[9px] font-black uppercase tracking-wider text-[#8a7a62] mb-1.5">Also Consider</p>
              {secondaryPlayers.map((name, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: `${labelColor}80` }} />
                  <span className="text-[11px] text-[#4a3e30] font-medium">{name}</span>
                </div>
              ))}
            </div>
          )}

          {/* CTA */}
          <div className="px-4 pb-4 pt-2">
            <div
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold transition-all duration-150 group-hover:brightness-[1.08]"
              style={{ background: `${labelColor}16`, color: labelColor, border: `1px solid ${labelColor}28` }}
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

// ─── Quick action pill ────────────────────────────────────────────────────────

function QuickAction({ icon, label, sublabel, to }: { icon: React.ReactNode; label: string; sublabel?: string; to: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all duration-150 group"
      style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.09)" }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-150 group-hover:scale-105"
        style={{ background: "rgba(245,200,76,0.14)", border: "1px solid rgba(245,200,76,0.22)" }}>
        <span style={{ color: "#F5C84C" }}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-white/80 group-hover:text-white transition-colors leading-tight">{label}</p>
        {sublabel && <p className="text-[10px] text-white/30 leading-tight mt-0.5">{sublabel}</p>}
      </div>
      <ChevronRight size={13} className="text-white/20 group-hover:text-white/45 transition-colors shrink-0" />
    </Link>
  );
}

// ─── Trust tick ───────────────────────────────────────────────────────────────

function TrustTick({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "rgba(46,125,50,0.18)", border: "1px solid rgba(46,125,50,0.35)" }}>
        <Check size={8} style={{ color: "#4caf50" }} />
      </div>
      <span className="text-[12px] text-[#5c5040] font-semibold">{children}</span>
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

    const mustBuyPlayer = buyPool[0] ?? byValue[0] ?? null;
    const trapPlayer    = avoidPool[0] ?? null;
    const captainPlayer = byCaptain.find(p =>
      p.player_id !== mustBuyPlayer?.player_id && p.player_id !== trapPlayer?.player_id
    ) ?? null;
    const valuePlayer   = buyPool.find(p =>
      p.player_id !== mustBuyPlayer?.player_id && p.price != null && p.price < 600_000
    ) ?? buyPool[1] ?? null;

    return { mustBuyPlayer, trapPlayer, captainPlayer, valuePlayer };
  }, [players]);

  const showMock = playersLoading || !mustBuyPlayer;

  const mustBuy  = mustBuyPlayer  ?? MOCK_CARDS.mustBuy as Partial<RankingRow>;
  const trap     = trapPlayer     ?? MOCK_CARDS.trap    as Partial<RankingRow>;
  const captain  = captainPlayer  ?? MOCK_CARDS.captain as Partial<RankingRow>;
  const value    = valuePlayer    ?? MOCK_CARDS.value   as Partial<RankingRow>;

  const mustBuySecondary = players.filter(isBuy).filter(p => p.player_id !== mustBuyPlayer?.player_id).slice(0, 2).map(p => p.player_name);
  const trapSecondary    = players.filter(isAvoid).filter(p => p.player_id !== trapPlayer?.player_id).slice(0, 1).map(p => p.player_name);
  const captainSecondary = players.filter(p => p.player_id !== captainPlayer?.player_id && p.player_id !== mustBuyPlayer?.player_id).sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0)).slice(0, 1).map(p => p.player_name);

  const buyCount = players.filter(isBuy).length;
  const moreCount = Math.max(0, buyCount - 3);

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
      <section className="relative overflow-hidden" style={{ background: "linear-gradient(165deg, #1e1c15 0%, #14120d 55%, #0e0d0a 100%)" }}>
        <ChalkNoise />

        {/* Chalk diagrams */}
        <ChalkDiagram className="absolute left-0 top-0 w-72 md:w-[420px] opacity-70" />
        <div className="absolute right-0 top-0 w-72 md:w-[420px] opacity-50" style={{ transform: "scaleX(-1)" }}>
          <ChalkDiagram className="w-full" />
        </div>

        {/* Radial warmth */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 55% at 50% 45%, rgba(245,200,76,0.055) 0%, transparent 70%)" }} />

        {/* Gold top rail */}
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "linear-gradient(90deg, #4a3010, #b8860b, #8b6124, #b8860b, #4a3010)" }} />

        <div className="relative z-10 max-w-3xl mx-auto px-5 pt-16 pb-12 md:pt-24 md:pb-16 text-center">
          {/* Live badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-widest mb-8"
            style={{ borderColor: "rgba(245,200,76,0.28)", background: "rgba(245,200,76,0.07)", color: "#F5C84C" }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-[#F5C84C] animate-pulse" />
            AFL 2026 Season — Updated Before Lockout
          </div>

          <h1
            className="text-[2.6rem] sm:text-5xl md:text-[3.6rem] font-extrabold leading-[1.05] tracking-tight text-white mb-5"
            style={{ textShadow: "0 2px 30px rgba(0,0,0,0.7)" }}
          >
            Win Your <span style={{ color: "#F5C84C" }}>AFL Fantasy</span><br />
            Week in 30 Seconds
          </h1>

          <p className="text-[15px] md:text-[17px] text-white/50 font-medium max-w-lg mx-auto leading-relaxed mb-11">
            Trades, captains, traps — powered by real data, delivered like a coach's game plan.
          </p>

          {/* CTAs */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center sm:items-center mb-6">
            {!isPremium && (
              <Link
                to="/neeko-plus"
                className="flex items-center justify-center gap-2.5 font-bold text-[15px] px-9 rounded-xl transition-all min-h-[54px] w-full sm:w-auto hover:brightness-[1.08] active:scale-[0.98]"
                style={{ background: "#F5C84C", color: "#111", boxShadow: "0 4px 32px rgba(245,200,76,0.32)" }}
              >
                <Crown size={15} />
                Unlock Full Access
              </Link>
            )}
            <Link
              to="/auth"
              className="flex items-center justify-center gap-2 font-semibold text-[14px] px-8 rounded-xl transition-all min-h-[54px] w-full sm:w-auto border hover:border-white/30 hover:text-white active:scale-[0.98]"
              style={{ borderColor: "rgba(255,255,255,0.16)", color: "rgba(255,255,255,0.65)" }}
            >
              Get Started Free
              <ArrowRight size={14} />
            </Link>
          </div>

          <p className="text-[11px] text-white/18 tracking-wide">600+ players analysed weekly · No lock-in</p>
        </div>

        {/* Bottom ledge */}
        <div className="absolute bottom-0 left-0 right-0 h-4 pointer-events-none" style={{ background: "linear-gradient(0deg, rgba(92,61,26,0.55), transparent)" }} />
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
          2. COACH'S WHITEBOARD
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="relative pt-8 pb-16 md:pb-20" style={{ background: "linear-gradient(180deg, #100f0c 0%, #1a1710 100%)" }}>

        {/* Outer glow behind board */}
        <div className="absolute inset-x-0 top-8 flex justify-center pointer-events-none">
          <div className="w-full max-w-5xl h-32 opacity-25 blur-3xl" style={{ background: "rgba(210,185,120,0.18)" }} />
        </div>

        {/* Board wrapper */}
        <div className="relative mx-3 md:mx-8 lg:mx-auto lg:max-w-5xl" style={{ filter: "drop-shadow(0 24px 56px rgba(0,0,0,0.55))" }}>

          {/* Wooden frame top */}
          <div
            className="rounded-t-2xl h-7 md:h-9 flex items-center px-5 gap-3"
            style={{ background: "linear-gradient(180deg, #5c3d14 0%, #7a5220 35%, #9a6e2a 55%, #6b4a1a 80%, #4a3010 100%)" }}
          >
            {/* Screw decorations */}
            {["#c0392b","#27ae60","#3498db"].map((c, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full shadow-inner" style={{ background: c }} />
            ))}
            <div className="flex-1" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20">Coach's Whiteboard</span>
            <div className="w-3 h-0.5 bg-white/10 rounded" />
          </div>

          {/* Board surface */}
          <div
            className="relative overflow-hidden"
            style={{
              background: "linear-gradient(165deg, #f6f3ea 0%, #eee9d8 45%, #e6e1ce 100%)",
              boxShadow: "inset 0 2px 8px rgba(0,0,0,0.10), inset 2px 0 6px rgba(0,0,0,0.06), inset -2px 0 6px rgba(0,0,0,0.06), inset 0 -2px 8px rgba(0,0,0,0.08)",
            }}
          >
            {/* Ruled lines texture */}
            <div
              className="absolute inset-0 opacity-[0.018] pointer-events-none"
              style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 28px, rgba(90,70,40,0.8) 28px, rgba(90,70,40,0.8) 29px)" }}
            />
            {/* Subtle grain */}
            <div
              className="absolute inset-0 opacity-[0.012] pointer-events-none"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }}
            />

            <div className="relative z-10 px-5 md:px-10 pt-8 pb-6">
              {/* Board heading */}
              <div className="text-center mb-8">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] mb-2" style={{ color: "#8a7054" }}>
                  Your Gameplan This Round
                </p>
                <h2 className="text-xl md:text-2xl font-extrabold leading-tight" style={{ color: "#1e1a10" }}>
                  Know Who to Trade, Start & Captain
                </h2>
              </div>

              {/* 4 pinned cards */}
              {playersLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8 pt-5">
                  {[0,1,2,3].map(i => (
                    <div
                      key={i}
                      className="relative rounded-xl border min-h-[220px] animate-pulse"
                      style={{ background: "#f0ece0", borderColor: "rgba(0,0,0,0.10)" }}
                    >
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-[#c0392b]/35" />
                      <div className="p-4 space-y-3 mt-3">
                        <div className="h-2 w-14 rounded" style={{ background: "rgba(0,0,0,0.10)" }} />
                        <div className="h-5 w-28 rounded" style={{ background: "rgba(0,0,0,0.12)" }} />
                        <div className="h-3 w-20 rounded" style={{ background: "rgba(0,0,0,0.08)" }} />
                        <div className="h-8 w-16 rounded" style={{ background: "rgba(0,0,0,0.07)" }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8 pt-5">
                  <WhiteboardCard
                    label="Must Buy"
                    labelColor="#2e7d32"
                    bgColor="linear-gradient(160deg, #f0fdf2 0%, #f3f0e4 100%)"
                    borderColor="rgba(46,125,50,0.22)"
                    icon={<TrendingUp size={11} />}
                    player={mustBuy as { player_name: string; team: string; position?: string | null; projection?: number | null; why?: string | null }}
                    secondaryPlayers={mustBuySecondary.length ? [...mustBuySecondary, moreCount > 0 ? `+${moreCount} more` : ""].filter(Boolean) : []}
                    ctaLabel="View Must Buys"
                    ctaTo="/sports/afl/current-round"
                    rotation={-1.2}
                    pinColor="#2e7d32"
                    badge={(mustBuy as Partial<RankingRow>).position ?? "RUC"}
                    badgeColor="#2e7d32"
                    trend="up"
                    trendLabel="+$18k"
                  />

                  <WhiteboardCard
                    label="Trap Alert"
                    labelColor="#c62828"
                    bgColor="linear-gradient(160deg, #fff5f5 0%, #f3f0e4 100%)"
                    borderColor="rgba(198,40,40,0.20)"
                    icon={<AlertTriangle size={11} />}
                    player={trap as { player_name: string; team: string; position?: string | null; projection?: number | null; why?: string | null }}
                    secondaryPlayers={trapSecondary.length ? [...trapSecondary, "+5 more"] : ["+5 more"]}
                    ctaLabel="See Trap Alerts"
                    ctaTo="/sports/afl/current-round"
                    rotation={0.8}
                    pinColor="#c62828"
                    badge={(trap as Partial<RankingRow>).position ?? "MID"}
                    badgeColor="#c62828"
                    trend="down"
                    trendLabel="-$22k"
                  />

                  <WhiteboardCard
                    label="Captain Pick"
                    labelColor="#9a6c00"
                    bgColor="linear-gradient(160deg, #fffce8 0%, #f3f0e4 100%)"
                    borderColor="rgba(154,108,0,0.22)"
                    icon={<Star size={11} />}
                    player={captain as { player_name: string; team: string; position?: string | null; projection?: number | null; why?: string | null }}
                    secondaryPlayers={captainSecondary.length ? [...captainSecondary, "+2 more"] : ["+2 more"]}
                    ctaLabel="Full Captain Picks"
                    ctaTo="/sports/afl/captains"
                    rotation={-0.6}
                    pinColor="#9a6c00"
                    badge="CAPT"
                    badgeColor="#9a6c00"
                  />

                  <WhiteboardCard
                    label="Best Value"
                    labelColor="#1565c0"
                    bgColor="linear-gradient(160deg, #f0f6ff 0%, #f3f0e4 100%)"
                    borderColor="rgba(21,101,192,0.20)"
                    icon={<BarChart3 size={11} />}
                    player={value as { player_name: string; team: string; position?: string | null; projection?: number | null; why?: string | null }}
                    secondaryPlayers={["+3 more"]}
                    ctaLabel="Open Market Watch"
                    ctaTo="/sports/afl/market-watch"
                    rotation={1.4}
                    pinColor="#1565c0"
                    badge={(value as Partial<RankingRow>).position ?? "MID"}
                    badgeColor="#1565c0"
                    trend="up"
                    trendLabel="+17 avg"
                  />
                </div>
              )}

              {/* Mock data note */}
              {showMock && !playersLoading && (
                <div className="text-center mb-5 -mt-2">
                  <span className="text-[10px] font-medium" style={{ color: "#8a7054" }}>
                    Live data loads Monday evening after match completion
                  </span>
                </div>
              )}

              {/* Quick actions */}
              <div className="border-t pt-5 pb-1" style={{ borderColor: "rgba(90,70,40,0.12)" }}>
                <div className="flex flex-wrap items-center justify-center gap-1 md:gap-0 mb-5">
                  {[
                    { to: "/sports/afl/current-round", icon: <GitCompare size={13} />, label: "Compare Players",    color: "#2e7d32" },
                    { to: "/sports/afl/market-watch",  icon: <BarChart3 size={13} />,  label: "Market Watch",       color: "#1565c0" },
                    { to: "/sports/afl/current-round", icon: <AlertTriangle size={13} />, label: "Trap Alerts",     color: "#c62828" },
                    { to: "/sports/afl/rankings",      icon: <Star size={13} />,       label: "Full Rankings",      color: "#9a6c00" },
                  ].map(({ to, icon, label, color }, i, arr) => (
                    <div key={label} className="flex items-center">
                      <Link
                        to={to}
                        className="flex items-center gap-2 text-[12px] font-semibold px-4 py-2.5 rounded-lg transition-all duration-150 hover:scale-[1.03] active:scale-[0.97]"
                        style={{ color: "#2a1e0f" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${color}12`; (e.currentTarget as HTMLElement).style.color = color; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "#2a1e0f"; }}
                      >
                        <span style={{ color }}>{icon}</span>
                        {label}
                      </Link>
                      {i < arr.length - 1 && (
                        <div className="w-px h-4 hidden md:block" style={{ background: "rgba(90,70,40,0.15)" }} />
                      )}
                    </div>
                  ))}
                </div>

                {/* Trust ticks */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-7">
                  <TrustTick>Updated before every round lockout</TrustTick>
                  <TrustTick>630+ players fully analysed</TrustTick>
                  <TrustTick>Edge over your league, every round</TrustTick>
                </div>
              </div>
            </div>

            {/* Marker tray */}
            <div
              className="relative h-5 md:h-6 flex items-center px-6"
              style={{ background: "linear-gradient(180deg, #c8bc9a 0%, #b8ae8a 100%)" }}
            >
              <div className="flex gap-2">
                {[
                  { c: "#e74c3c", label: "Sell" },
                  { c: "#2ecc71", label: "Buy" },
                  { c: "#3498db", label: "Hold" },
                  { c: "#1a1a1a", label: "" },
                ].map(({ c }, i) => (
                  <div
                    key={i}
                    className="h-3 w-8 rounded-sm shadow-sm"
                    style={{ background: c, transform: `rotate(${i % 2 === 0 ? -1.5 : 1}deg)` }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Wooden frame bottom */}
          <div
            className="rounded-b-2xl h-4 md:h-5"
            style={{ background: "linear-gradient(180deg, #7a5220 0%, #4a3010 100%)" }}
          />
        </div>

        {/* Board shadow on floor */}
        <div
          className="mx-3 md:mx-8 lg:mx-auto lg:max-w-5xl h-2 rounded-b-full mt-0.5 opacity-25"
          style={{ background: "rgba(0,0,0,0.6)", filter: "blur(8px)" }}
        />
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
          3. THREE STEPS
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 border-t" style={{ background: "#0d0c09", borderColor: "rgba(255,255,255,0.04)" }}>
        <div className="max-w-4xl mx-auto px-5">
          <div className="text-center mb-14">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] mb-3" style={{ color: "rgba(245,200,76,0.40)" }}>How It Works</p>
            <h2 className="text-[1.9rem] md:text-[2.4rem] font-extrabold text-white leading-tight mb-4">
              Your Edge in 3 Steps
            </h2>
            <p className="text-white/40 text-[15px] max-w-md mx-auto leading-relaxed">
              Data-driven decisions before every lockout — no noise, no opinions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                num: "1",
                title: "Check the Gameplan",
                body: "Open your weekly Coach's Whiteboard. See who to trade in, who to avoid, and who to captain — all in one view.",
                icon: <Zap size={17} style={{ color: "#F5C84C" }} />,
              },
              {
                num: "2",
                title: "Make Smarter Trades",
                body: "Buy form. Sell risk. Spot breakout value before the market moves. Our signals are backed by 600+ player models.",
                icon: <TrendingUp size={17} style={{ color: "#F5C84C" }} />,
              },
              {
                num: "3",
                title: "Avoid Costly Traps",
                body: "Know which players are overpriced, out of form, or flagged as injury risks — before you lock in and lose points.",
                icon: <Shield size={17} style={{ color: "#F5C84C" }} />,
              },
            ].map(({ num, title, body, icon }) => (
              <div
                key={num}
                className="rounded-2xl p-7 border relative overflow-hidden"
                style={{ background: "linear-gradient(160deg, #141210 0%, #0f0e0c 100%)", borderColor: "rgba(255,255,255,0.07)" }}
              >
                <div className="absolute top-5 right-5 text-[60px] font-black leading-none select-none" style={{ color: "rgba(255,255,255,0.025)" }}>
                  {num}
                </div>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: "rgba(245,200,76,0.10)", border: "1px solid rgba(245,200,76,0.18)" }}
                >
                  {icon}
                </div>
                <h3 className="text-[15px] font-extrabold text-white mb-2.5">{num}. {title}</h3>
                <p className="text-[13px] text-white/40 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
          4. WHY NEEKO WORKS
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-14 md:py-16 border-t" style={{ background: "linear-gradient(180deg, #0e0d0a 0%, #0d0c09 100%)", borderColor: "rgba(255,255,255,0.04)" }}>
        <div className="max-w-4xl mx-auto px-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { Icon: Clock,    title: "Updated Every Round",        body: "Fresh signals and projections before every lockout. Never stale." },
              { Icon: BarChart3, title: "600+ Players Modelled",     body: "Not a blog. Every signal is backed by a real player model — not gut feel." },
              { Icon: Users,    title: "Built for Decisions",        body: "Know what action to take, not just what happened last week." },
            ].map(({ Icon, title, body }) => (
              <div
                key={title}
                className="flex items-start gap-4 rounded-2xl border px-5 py-5"
                style={{ background: "#0e0e0b", borderColor: "rgba(255,255,255,0.06)" }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: "rgba(245,200,76,0.09)", border: "1px solid rgba(245,200,76,0.18)" }}
                >
                  <Icon size={15} style={{ color: "#F5C84C" }} />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-white mb-1.5">{title}</p>
                  <p className="text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
          5. QUICK ACTIONS
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-12 border-t" style={{ background: "#090808", borderColor: "rgba(255,255,255,0.04)" }}>
        <div className="max-w-md mx-auto px-5">
          <p className="text-[10px] font-black uppercase tracking-[0.20em] text-center mb-6" style={{ color: "rgba(255,255,255,0.22)" }}>
            Jump In
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <QuickAction icon={<TrendingUp size={14} />} label="This Week's Game Plan" sublabel="Buys · Sells · Traps" to="/sports/afl/current-round" />
            <QuickAction icon={<BarChart3 size={14} />}  label="Market Watch"          sublabel="Price movements · Value" to="/sports/afl/market-watch" />
            <QuickAction icon={<Star size={14} />}       label="Captain Picks"         sublabel="Tier 1 · Tier 2 · Diffs" to="/sports/afl/captains" />
            <QuickAction icon={<Zap size={14} />}        label="Full Player Rankings"  sublabel="600+ players · Signals" to="/sports/afl/rankings" />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
          6. PRICING
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 border-t" style={{ background: "#0d0c09", borderColor: "rgba(255,255,255,0.04)" }}>
        <div className="max-w-md mx-auto px-5 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] mb-3" style={{ color: "rgba(245,200,76,0.40)" }}>Pricing</p>
          <h2 className="text-[1.9rem] md:text-[2.4rem] font-extrabold text-white leading-tight mb-4">
            Unlock the Full System
          </h2>
          <p className="text-[14px] mb-10 leading-relaxed max-w-xs mx-auto" style={{ color: "rgba(255,255,255,0.42)" }}>
            Free gives you the headlines. Neeko+ gives you the complete edge every round.
          </p>

          {/* Yearly plan */}
          <div
            className="relative rounded-2xl p-8 mb-5 text-left"
            style={{
              border: "1px solid rgba(245,200,76,0.35)",
              background: "linear-gradient(160deg, #151310 0%, #0e0d0b 100%)",
              boxShadow: "0 0 70px rgba(245,200,76,0.07)",
            }}
          >
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span
                className="text-[10px] font-black px-4 py-1 rounded-full uppercase tracking-wider"
                style={{ background: "#F5C84C", color: "#111" }}
              >
                Best Value — Save {NEEKO_PRICING.savingsPercent}%
              </span>
            </div>

            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(245,200,76,0.50)" }}>
              Neeko+ Yearly
            </p>
            <div className="flex items-end gap-1.5 mb-1">
              <span className="text-[2.4rem] font-extrabold text-white leading-none">${NEEKO_PRICING.yearly.price}</span>
              <span className="text-[13px] mb-1" style={{ color: "rgba(255,255,255,0.28)" }}>AUD / year</span>
            </div>
            <p className="text-[12px] mb-8" style={{ color: "rgba(245,200,76,0.42)" }}>
              ${NEEKO_PRICING.yearly.monthlyEquivalent}/mo equivalent
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-8">
              {NEEKO_FEATURES.map(f => (
                <div key={f} className="flex items-start gap-2">
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "rgba(245,200,76,0.10)", border: "1px solid rgba(245,200,76,0.24)" }}
                  >
                    <Check size={8} style={{ color: "#F5C84C" }} />
                  </div>
                  <span className="text-[12px] leading-snug" style={{ color: "rgba(255,255,255,0.52)" }}>{f}</span>
                </div>
              ))}
            </div>

            <Link
              to="/neeko-plus"
              className="flex items-center justify-center gap-2 font-bold text-[14px] py-3.5 rounded-xl transition-all min-h-[50px] hover:brightness-[1.08] active:scale-[0.98]"
              style={{ background: "#F5C84C", color: "#111" }}
            >
              <Crown size={14} />
              Unlock Full Access
            </Link>
            <p className="text-[11px] text-center mt-3" style={{ color: "rgba(255,255,255,0.20)" }}>
              Full rankings · Weekly game plan · Trade insights
            </p>
          </div>

          {/* Monthly plan */}
          <div
            className="rounded-2xl border p-6 text-left mb-5"
            style={{ background: "#0c0b09", borderColor: "rgba(255,255,255,0.08)" }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.22)" }}>Monthly</p>
            <div className="flex items-end gap-1.5 mb-1">
              <span className="text-[2rem] font-extrabold text-white leading-none">${NEEKO_PRICING.monthly.price}</span>
              <span className="text-[13px] mb-1" style={{ color: "rgba(255,255,255,0.28)" }}>AUD / month</span>
            </div>
            <p className="text-[11px] mb-5" style={{ color: "rgba(255,255,255,0.20)" }}>{NEEKO_PRICING.monthly.billingNote}</p>
            <Link
              to="/neeko-plus"
              className="flex items-center justify-center font-semibold text-[13px] py-3 rounded-xl border transition-all min-h-[44px] hover:border-opacity-60 active:scale-[0.98]"
              style={{ borderColor: "rgba(245,200,76,0.30)", color: "rgba(245,200,76,0.72)" }}
            >
              Start Monthly
            </Link>
          </div>

          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.16)" }}>No lock-in. Cancel anytime.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t py-8" style={{ background: "#090808", borderColor: "rgba(255,255,255,0.05)" }}>
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.16)" }}>
              © {new Date().getFullYear()} Neeko Sports Stats. All rights reserved.
            </p>
            <div className="flex gap-5">
              {FOOTER_LINKS.map(l => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="text-[12px] transition-colors hover:text-white/55"
                  style={{ color: "rgba(255,255,255,0.20)" }}
                >
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
