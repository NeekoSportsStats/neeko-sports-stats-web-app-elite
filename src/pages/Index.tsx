import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  Crown, ArrowRight, Check, TrendingUp, TriangleAlert as AlertTriangle,
  Star, ChartBar as BarChart3, GitCompare, ArrowUp, ArrowDown,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { NEEKO_PRICING } from "@/config/neekoPricing";
import MobileUpgradeBar from "@/components/mobile/MobileUpgradeBar";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";

// ─── Static config ──────────────────────────────────────────────────────────

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

// ─── Signal helpers ──────────────────────────────────────────────────────────

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

// ─── Mock data fallback ──────────────────────────────────────────────────────

const MOCK_CARDS = {
  mustBuy: { player_name: "Rowan Marshall",  team: "St Kilda",       position: "RUC", projection: 114, why: "Dominant ruck. Soft matchup. Underpriced vs output." },
  trap:    { player_name: "Zac Bailey",      team: "Brisbane Lions", position: "MID", projection: 82,  why: "Overpriced — role shift risk. Fade this round." },
  captain: { player_name: "Dayne Zorko",     team: "Brisbane Lions", position: "DEF", projection: 132, why: "Elite ceiling. Lock matchup. Highest confidence captain." },
  value:   { player_name: "Finn Callaghan",  team: "GWS Giants",     position: "MID", projection: 120, why: "Premium output at mid-price. Best value this round." },
};

// ─── Coach markings SVG overlay ─────────────────────────────────────────────

function CoachMarkings() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.055 }}
      preserveAspectRatio="xMidYMid slice"
    >
      {/* Dashed arcs */}
      <path d="M 80 320 Q 200 180 380 300" stroke="#5c4020" strokeWidth="1.5" fill="none" strokeDasharray="8 6" />
      <path d="M 560 100 Q 680 240 580 380" stroke="#5c4020" strokeWidth="1.5" fill="none" strokeDasharray="6 5" />
      <path d="M 300 50 Q 420 120 500 60" stroke="#5c4020" strokeWidth="1.2" fill="none" strokeDasharray="5 4" />

      {/* X and O marks */}
      <text x="55" y="170" fontSize="22" fontFamily="serif" fill="#5c4020">✕</text>
      <text x="620" y="280" fontSize="18" fontFamily="serif" fill="#5c4020">○</text>
      <text x="310" y="410" fontSize="20" fontFamily="serif" fill="#5c4020">✕</text>
      <text x="480" y="350" fontSize="16" fontFamily="serif" fill="#5c4020">○</text>

      {/* Faint arrow lines */}
      <line x1="90" y1="250" x2="150" y2="290" stroke="#5c4020" strokeWidth="1" markerEnd="url(#arrow)" />
      <line x1="590" y1="150" x2="540" y2="200" stroke="#5c4020" strokeWidth="1" markerEnd="url(#arrow)" />

      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#5c4020" />
        </marker>
      </defs>

      {/* Ruled horizontal lines */}
      {[80, 160, 240, 320, 400].map(y => (
        <line key={y} x1="0" y1={y} x2="900" y2={y} stroke="#5c4020" strokeWidth="0.6" opacity="0.4" />
      ))}
    </svg>
  );
}

// ─── Chalk hero background texture ──────────────────────────────────────────

function ChalkHeroMarkings() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.07 }}
      preserveAspectRatio="xMidYMid slice"
    >
      <g stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeDasharray="10 8">
        <circle cx="80" cy="80" r="55" />
        <circle cx="80" cy="80" r="22" />
        <line x1="80" y1="18" x2="80" y2="25" />
        <line x1="80" y1="135" x2="80" y2="142" />
        <polyline points="25,50 60,78 25,110" />
        <line x1="135" y1="80" x2="100" y2="80" />
      </g>
      <g stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeDasharray="10 8">
        <circle cx="88%" cy="100" r="55" />
        <circle cx="88%" cy="100" r="22" />
      </g>
      {[60, 120, 180, 240, 300].map(y => (
        <line key={y} x1="0" y1={y} x2="2000" y2={y} stroke="rgba(255,255,255,0.35)" strokeWidth="0.5" />
      ))}
    </svg>
  );
}

// ─── Push pin ───────────────────────────────────────────────────────────────

function PushPin({ color }: { color: string }) {
  return (
    <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center">
      <div
        className="w-5 h-5 rounded-full border border-black/20"
        style={{
          background: `radial-gradient(circle at 35% 30%, ${color}dd 0%, ${color} 60%, ${color}88 100%)`,
          boxShadow: `0 2px 6px ${color}55, 0 1px 2px rgba(0,0,0,0.35)`,
        }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-white/55 absolute top-1 left-1" />
      </div>
      <div className="w-0.5 h-2 rounded-b" style={{ background: `${color}99` }} />
    </div>
  );
}

// ─── Pinned paper card ───────────────────────────────────────────────────────

type CardPlayer = {
  player_name: string;
  team: string;
  position?: string | null;
  projection?: number | null;
  why?: string | null;
};

interface PinnedCardProps {
  label: string;
  accentColor: string;
  pinColor: string;
  icon: React.ReactNode;
  player: CardPlayer;
  also?: string[];
  ctaLabel: string;
  ctaTo: string;
  trend?: "up" | "down" | null;
  trendLabel?: string;
  // Absolute positioning
  pos?: React.CSSProperties;
  rotation?: number;
}

function PinnedCard({
  label, accentColor, pinColor, icon, player, also = [],
  ctaLabel, ctaTo, trend, trendLabel,
  pos, rotation = 0,
}: PinnedCardProps) {
  const proj = player.projection != null ? Math.round(player.projection) : null;

  return (
    <div
      className="absolute"
      style={{
        ...pos,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "top center",
        width: 190,
        zIndex: 10,
      }}
    >
      <PushPin color={pinColor} />
      <Link to={ctaTo} className="block outline-none group">
        <div
          className="rounded-lg overflow-hidden transition-all duration-200 ease-out group-hover:-translate-y-2 group-hover:scale-[1.04] group-hover:z-20"
          style={{
            background: "linear-gradient(165deg, #faf8f2 0%, #f2ede0 100%)",
            border: "1px solid rgba(0,0,0,0.12)",
            boxShadow: `
              0 2px 4px rgba(0,0,0,0.10),
              0 8px 24px rgba(0,0,0,0.14),
              0 16px 40px rgba(0,0,0,0.10),
              inset 0 1px 0 rgba(255,255,255,0.80)
            `,
          }}
        >
          {/* Label strip */}
          <div
            className="px-3 py-2 flex items-center justify-between"
            style={{
              background: `${accentColor}14`,
              borderBottom: `1.5px solid ${accentColor}28`,
            }}
          >
            <div className="flex items-center gap-1.5">
              <span style={{ color: accentColor }}>{icon}</span>
              <span className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: accentColor }}>
                {label}
              </span>
            </div>
            {player.position && (
              <span
                className="text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{ background: `${accentColor}18`, color: accentColor }}
              >
                {player.position}
              </span>
            )}
          </div>

          {/* Player */}
          <div className="px-3 pt-3 pb-1">
            <p className="text-[15px] font-extrabold leading-tight tracking-tight text-[#1a1508]">
              {player.player_name}
            </p>
            <p className="text-[10px] text-[#7a6a52] mt-0.5 font-semibold">{player.team}</p>
          </div>

          {/* Projection */}
          {proj != null && (
            <div className="px-3 pt-1.5 pb-1 flex items-end gap-2">
              <span className="text-[28px] font-black tabular-nums leading-none" style={{ color: accentColor }}>
                {proj}
              </span>
              <span className="text-[10px] text-[#9a8a70] font-semibold mb-1">pts</span>
              {trend && trendLabel && (
                <span
                  className="ml-auto flex items-center gap-0.5 text-[9px] font-bold mb-1 px-1 py-0.5 rounded"
                  style={{
                    color: trend === "up" ? "#2e7d32" : "#c62828",
                    background: trend === "up" ? "#2e7d3215" : "#c6282815",
                  }}
                >
                  {trend === "up" ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
                  {trendLabel}
                </span>
              )}
            </div>
          )}

          {/* Why text */}
          {player.why && (
            <div className="px-3 pt-1 pb-2.5">
              <p className="text-[10px] leading-snug text-[#7a6a52]">{player.why}</p>
            </div>
          )}

          {/* Also consider */}
          {also.length > 0 && (
            <div
              className="px-3 pt-2 pb-2 mx-3 mb-2 rounded"
              style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.06)" }}
            >
              <p className="text-[8px] font-black uppercase tracking-wider text-[#9a8a70] mb-1.5">Also</p>
              {also.map((name, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-1 h-1 rounded-full" style={{ background: accentColor }} />
                  <span className="text-[9px] text-[#5a4a32] font-semibold">{name}</span>
                </div>
              ))}
            </div>
          )}

          {/* CTA link */}
          <div className="px-3 pb-3">
            <div
              className="text-[9px] font-bold flex items-center justify-center gap-1 py-1.5 rounded transition-all group-hover:brightness-[1.06]"
              style={{
                background: `${accentColor}14`,
                color: accentColor,
                border: `1px solid ${accentColor}22`,
              }}
            >
              {ctaLabel} →
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

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
    const valuePlayer = buyPool.find(p =>
      p.player_id !== mustBuyPlayer?.player_id && p.price != null && p.price < 600_000
    ) ?? buyPool[1] ?? null;

    return { mustBuyPlayer, trapPlayer, captainPlayer, valuePlayer };
  }, [players]);

  const mustBuy  = mustBuyPlayer  ?? MOCK_CARDS.mustBuy as Partial<RankingRow>;
  const trap     = trapPlayer     ?? MOCK_CARDS.trap    as Partial<RankingRow>;
  const captain  = captainPlayer  ?? MOCK_CARDS.captain as Partial<RankingRow>;
  const value    = valuePlayer    ?? MOCK_CARDS.value   as Partial<RankingRow>;

  const mustBuySecondary = players.filter(isBuy).filter(p => p.player_id !== mustBuyPlayer?.player_id).slice(0, 2).map(p => p.player_name);
  const trapSecondary    = players.filter(isAvoid).filter(p => p.player_id !== trapPlayer?.player_id).slice(0, 1).map(p => p.player_name);
  const captainSecondary = players.filter(p => p.player_id !== captainPlayer?.player_id && p.player_id !== mustBuyPlayer?.player_id).sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0)).slice(0, 1).map(p => p.player_name);

  return (
    <div className="min-h-screen bg-[#111009] text-white pb-[80px] sm:pb-0">
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

      {/* ════════════════════════════════════════════════════════════════════════
          HERO — chalkboard feel
      ════════════════════════════════════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden"
        style={{
          background: "#0f0e0b",
          borderBottom: "3px solid rgba(92,61,26,0.55)",
        }}
      >
        {/* Chalk rule lines + play diagram overlay */}
        <ChalkHeroMarkings />

        {/* Subtle warm centre glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(245,200,76,0.04) 0%, transparent 70%)" }}
        />

        {/* Gold top rail */}
        <div
          className="absolute top-0 left-0 right-0 h-[3px]"
          style={{ background: "linear-gradient(90deg, #3a2008, #b8860b, #8b6124, #b8860b, #3a2008)" }}
        />

        <div className="relative z-10 max-w-2xl mx-auto px-5 pt-16 pb-14 md:pt-24 md:pb-18 text-center">
          {/* Season badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-widest mb-8"
            style={{ borderColor: "rgba(245,200,76,0.25)", background: "rgba(245,200,76,0.06)", color: "#F5C84C" }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-[#F5C84C] animate-pulse" />
            AFL 2026 — Updated Before Lockout
          </div>

          <h1
            className="text-[2.5rem] sm:text-5xl md:text-[3.5rem] font-extrabold leading-[1.06] tracking-tight text-white mb-5"
            style={{ textShadow: "0 2px 24px rgba(0,0,0,0.8)" }}
          >
            Win Your <span style={{ color: "#F5C84C" }}>AFL Fantasy</span><br />
            Week in 30 Seconds
          </h1>

          <p className="text-[15px] md:text-[17px] font-medium max-w-md mx-auto leading-relaxed mb-10" style={{ color: "rgba(255,255,255,0.42)" }}>
            Trades, captains, traps — powered by real data, delivered like a coach's game plan.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center sm:items-center mb-6">
            {!isPremium && (
              <Link
                to="/neeko-plus"
                className="flex items-center justify-center gap-2.5 font-bold text-[15px] px-9 rounded-xl transition-all min-h-[54px] w-full sm:w-auto hover:brightness-[1.08] active:scale-[0.98]"
                style={{ background: "#F5C84C", color: "#111", boxShadow: "0 4px 28px rgba(245,200,76,0.30)" }}
              >
                <Crown size={14} />
                Unlock Full Access
              </Link>
            )}
            <Link
              to="/auth"
              className="flex items-center justify-center gap-2 font-semibold text-[14px] px-8 rounded-xl transition-all min-h-[54px] w-full sm:w-auto border hover:border-white/30 hover:text-white active:scale-[0.98]"
              style={{ borderColor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.55)" }}
            >
              Get Started Free
              <ArrowRight size={13} />
            </Link>
          </div>

          <p className="text-[11px] tracking-wide" style={{ color: "rgba(255,255,255,0.16)" }}>
            600+ players analysed · No lock-in
          </p>
        </div>

        {/* Bottom shadow ledge */}
        <div
          className="absolute bottom-0 left-0 right-0 h-6 pointer-events-none"
          style={{ background: "linear-gradient(0deg, rgba(70,45,15,0.40), transparent)" }}
        />
      </section>

      {/* ════════════════════════════════════════════════════════════════════════
          COACH'S WHITEBOARD — physical pinned layout
      ════════════════════════════════════════════════════════════════════════ */}
      <section
        className="relative py-10 md:py-14"
        style={{ background: "linear-gradient(180deg, #0f0e0b 0%, #171410 100%)" }}
      >
        {/* Ambient glow */}
        <div
          className="absolute inset-x-0 top-10 pointer-events-none flex justify-center"
          style={{ zIndex: 0 }}
        >
          <div
            className="w-full max-w-5xl h-24 blur-3xl"
            style={{ background: "rgba(200,175,100,0.12)" }}
          />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4">
          {/* Label */}
          <div className="text-center mb-6">
            <p className="text-[9px] font-black uppercase tracking-[0.28em]" style={{ color: "rgba(245,200,76,0.35)" }}>
              Coach's Whiteboard
            </p>
          </div>

          {/* ── WOODEN FRAME ── */}
          <div
            style={{
              borderRadius: 18,
              boxShadow: "0 28px 72px rgba(0,0,0,0.65), 0 8px 20px rgba(0,0,0,0.45)",
              overflow: "visible",
            }}
          >
            {/* Top rail */}
            <div
              style={{
                borderRadius: "18px 18px 0 0",
                height: 36,
                background: "linear-gradient(180deg, #6b4a20 0%, #8a6030 35%, #a07838 55%, #7a5428 80%, #4a3010 100%)",
                display: "flex",
                alignItems: "center",
                paddingLeft: 20,
                paddingRight: 20,
                gap: 10,
              }}
            >
              {/* Coloured pin dots on rail */}
              {["#c0392b","#f39c12","#27ae60"].map((c, i) => (
                <div
                  key={i}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: c,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                  }}
                />
              ))}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.22em", color: "rgba(255,255,255,0.22)" }}>
                Game Plan · Round {new Date().getFullYear()}
              </span>
            </div>

            {/* Board surface — off-white paper/cork feel */}
            <div
              style={{
                position: "relative",
                background: "linear-gradient(170deg, #f5f2e8 0%, #ede8d5 50%, #e4dfc8 100%)",
                boxShadow: "inset 0 3px 10px rgba(0,0,0,0.10), inset 2px 0 8px rgba(0,0,0,0.06), inset -2px 0 8px rgba(0,0,0,0.06), inset 0 -3px 10px rgba(0,0,0,0.08)",
                minHeight: 480,
                overflow: "hidden",
              }}
            >
              {/* Coach markings overlay */}
              <CoachMarkings />

              {/* Ruled lines texture */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 32px, rgba(90,70,40,0.06) 32px, rgba(90,70,40,0.06) 33px)",
                }}
              />

              {/* ─── DESKTOP: absolute positioned cards ─── */}
              <div className="hidden md:block" style={{ position: "relative", minHeight: 480 }}>
                {playersLoading ? (
                  /* Loading skeletons at same positions */
                  <>
                    {[
                      { top: 28, left: 48, rot: -2 },
                      { top: 48, left: 268, rot: 1.5 },
                      { top: 16, right: 240, rot: -1 },
                      { top: 64, right: 48, rot: 2 },
                    ].map(({ top, left, right, rot }, i) => (
                      <div
                        key={i}
                        style={{
                          position: "absolute",
                          top,
                          left: left ?? undefined,
                          right: right ?? undefined,
                          width: 190,
                          transform: `rotate(${rot}deg)`,
                          transformOrigin: "top center",
                        }}
                      >
                        <div
                          className="animate-pulse rounded-lg"
                          style={{
                            height: 240,
                            background: "linear-gradient(165deg, #f0ece0, #e8e2cc)",
                            border: "1px solid rgba(0,0,0,0.10)",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                          }}
                        >
                          <div style={{ height: 32, background: "rgba(0,0,0,0.06)", borderRadius: "8px 8px 0 0" }} />
                          <div style={{ padding: "12px 12px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ height: 10, width: "75%", background: "rgba(0,0,0,0.08)", borderRadius: 4 }} />
                            <div style={{ height: 8, width: "50%", background: "rgba(0,0,0,0.06)", borderRadius: 4 }} />
                            <div style={{ height: 32, width: "40%", background: "rgba(0,0,0,0.07)", borderRadius: 4, marginTop: 4 }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <PinnedCard
                      label="Must Buy"
                      accentColor="#2e7d32"
                      pinColor="#c0392b"
                      icon={<TrendingUp size={10} />}
                      player={mustBuy as CardPlayer}
                      also={mustBuySecondary.slice(0, 2)}
                      ctaLabel="View Must Buys"
                      ctaTo="/sports/afl/current-round"
                      trend="up"
                      trendLabel="+$18k"
                      pos={{ top: 28, left: 48 }}
                      rotation={-2}
                    />

                    <PinnedCard
                      label="Trap Alert"
                      accentColor="#c62828"
                      pinColor="#e74c3c"
                      icon={<AlertTriangle size={10} />}
                      player={trap as CardPlayer}
                      also={trapSecondary.slice(0, 1).concat("+5 more")}
                      ctaLabel="See Trap Alerts"
                      ctaTo="/sports/afl/current-round"
                      trend="down"
                      trendLabel="-$22k"
                      pos={{ top: 48, left: 268 }}
                      rotation={1.5}
                    />

                    <PinnedCard
                      label="Captain Pick"
                      accentColor="#9a6c00"
                      pinColor="#f39c12"
                      icon={<Star size={10} />}
                      player={captain as CardPlayer}
                      also={captainSecondary.slice(0, 1).concat("+2 more")}
                      ctaLabel="Full Captain Picks"
                      ctaTo="/sports/afl/captains"
                      pos={{ top: 16, right: 240 }}
                      rotation={-1}
                    />

                    <PinnedCard
                      label="Best Value"
                      accentColor="#1565c0"
                      pinColor="#2980b9"
                      icon={<BarChart3 size={10} />}
                      player={value as CardPlayer}
                      also={["+3 more"]}
                      ctaLabel="Open Market Watch"
                      ctaTo="/sports/afl/market-watch"
                      trend="up"
                      trendLabel="+17 avg"
                      pos={{ top: 64, right: 48 }}
                      rotation={2}
                    />
                  </>
                )}
              </div>

              {/* ─── MOBILE: stacked slightly rotated cards ─── */}
              <div className="md:hidden px-5 pt-8 pb-4 flex flex-col gap-8 items-center">
                {playersLoading ? (
                  [0,1,2,3].map(i => (
                    <div
                      key={i}
                      className="animate-pulse rounded-lg w-full max-w-xs"
                      style={{
                        height: 200,
                        background: "linear-gradient(165deg, #f0ece0, #e8e2cc)",
                        border: "1px solid rgba(0,0,0,0.10)",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                        transform: `rotate(${[-1.5, 1.2, -0.8, 1.8][i]}deg)`,
                      }}
                    />
                  ))
                ) : (
                  <>
                    {[
                      { label: "Must Buy", accentColor: "#2e7d32", pinColor: "#c0392b", icon: <TrendingUp size={10} />, player: mustBuy as CardPlayer, also: mustBuySecondary.slice(0,2), ctaLabel: "View Must Buys", ctaTo: "/sports/afl/current-round", trend: "up" as const, trendLabel: "+$18k", rotation: -1.5 },
                      { label: "Trap Alert", accentColor: "#c62828", pinColor: "#e74c3c", icon: <AlertTriangle size={10} />, player: trap as CardPlayer, also: trapSecondary.slice(0,1).concat("+5 more"), ctaLabel: "See Trap Alerts", ctaTo: "/sports/afl/current-round", trend: "down" as const, trendLabel: "-$22k", rotation: 1.2 },
                      { label: "Captain Pick", accentColor: "#9a6c00", pinColor: "#f39c12", icon: <Star size={10} />, player: captain as CardPlayer, also: captainSecondary.slice(0,1).concat("+2 more"), ctaLabel: "Full Captain Picks", ctaTo: "/sports/afl/captains", trend: null, trendLabel: undefined, rotation: -0.8 },
                      { label: "Best Value", accentColor: "#1565c0", pinColor: "#2980b9", icon: <BarChart3 size={10} />, player: value as CardPlayer, also: ["+3 more"], ctaLabel: "Market Watch", ctaTo: "/sports/afl/market-watch", trend: "up" as const, trendLabel: "+17 avg", rotation: 1.8 },
                    ].map(({ rotation, ...props }) => (
                      <div key={props.label} className="relative w-full max-w-xs" style={{ transform: `rotate(${rotation}deg)`, transformOrigin: "top center" }}>
                        <PushPin color={props.pinColor} />
                        <Link to={props.ctaTo} className="block outline-none group">
                          <div
                            className="rounded-lg overflow-hidden"
                            style={{
                              background: "linear-gradient(165deg, #faf8f2 0%, #f2ede0 100%)",
                              border: "1px solid rgba(0,0,0,0.12)",
                              boxShadow: "0 4px 16px rgba(0,0,0,0.14), 0 12px 32px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.80)",
                            }}
                          >
                            <div
                              className="px-4 py-2.5 flex items-center justify-between"
                              style={{ background: `${props.accentColor}14`, borderBottom: `1.5px solid ${props.accentColor}28` }}
                            >
                              <div className="flex items-center gap-1.5">
                                <span style={{ color: props.accentColor }}>{props.icon}</span>
                                <span className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: props.accentColor }}>{props.label}</span>
                              </div>
                              {props.player.position && (
                                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded" style={{ background: `${props.accentColor}18`, color: props.accentColor }}>
                                  {props.player.position}
                                </span>
                              )}
                            </div>
                            <div className="px-4 pt-3 pb-1">
                              <p className="text-[16px] font-extrabold leading-tight text-[#1a1508]">{props.player.player_name}</p>
                              <p className="text-[11px] text-[#7a6a52] mt-0.5 font-semibold">{props.player.team}</p>
                            </div>
                            {props.player.projection != null && (
                              <div className="px-4 pt-1.5 pb-1 flex items-end gap-2">
                                <span className="text-[30px] font-black tabular-nums leading-none" style={{ color: props.accentColor }}>
                                  {Math.round(props.player.projection)}
                                </span>
                                <span className="text-[11px] text-[#9a8a70] font-semibold mb-1">pts</span>
                                {props.trend && props.trendLabel && (
                                  <span
                                    className="ml-auto flex items-center gap-0.5 text-[9px] font-bold mb-1 px-1.5 py-0.5 rounded"
                                    style={{ color: props.trend === "up" ? "#2e7d32" : "#c62828", background: props.trend === "up" ? "#2e7d3215" : "#c6282815" }}
                                  >
                                    {props.trend === "up" ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
                                    {props.trendLabel}
                                  </span>
                                )}
                              </div>
                            )}
                            {props.player.why && (
                              <div className="px-4 pt-1 pb-3">
                                <p className="text-[11px] leading-snug text-[#7a6a52]">{props.player.why}</p>
                              </div>
                            )}
                          </div>
                        </Link>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Marker tray at bottom of board */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 22,
                  background: "linear-gradient(180deg, #ccc0a0 0%, #b8ae88 100%)",
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 20,
                  gap: 8,
                }}
              >
                {[
                  { c: "#e74c3c" },
                  { c: "#2ecc71" },
                  { c: "#3498db" },
                  { c: "#1a1208" },
                ].map(({ c }, i) => (
                  <div
                    key={i}
                    style={{
                      height: 11,
                      width: 32,
                      borderRadius: 3,
                      background: c,
                      transform: `rotate(${i % 2 === 0 ? -1.5 : 1}deg)`,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.20)",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Bottom rail */}
            <div
              style={{
                borderRadius: "0 0 18px 18px",
                height: 18,
                background: "linear-gradient(180deg, #8a6030 0%, #4a3010 100%)",
              }}
            />
          </div>

          {/* Board drop shadow on floor */}
          <div
            style={{
              height: 8,
              borderRadius: "0 0 50% 50%",
              background: "rgba(0,0,0,0.50)",
              filter: "blur(10px)",
              marginTop: 2,
              marginLeft: "5%",
              marginRight: "5%",
              opacity: 0.30,
            }}
          />

          {/* Quick actions — minimal text links below the board */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
            {[
              { to: "/sports/afl/current-round", icon: <GitCompare size={12} />, label: "Compare Players",  color: "#2e7d32" },
              { to: "/sports/afl/market-watch",  icon: <BarChart3 size={12} />, label: "Market Watch",      color: "#1565c0" },
              { to: "/sports/afl/current-round", icon: <AlertTriangle size={12} />, label: "Trap Alerts",   color: "#c62828" },
              { to: "/sports/afl/rankings",      icon: <Star size={12} />,      label: "Full Rankings",     color: "#9a6c00" },
            ].map(({ to, icon, label, color }, i, arr) => (
              <div key={label} className="flex items-center gap-2">
                <Link
                  to={to}
                  className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-lg transition-all duration-150 hover:scale-[1.04] active:scale-[0.97]"
                  style={{ color: "rgba(255,255,255,0.38)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = color; (e.currentTarget as HTMLElement).style.background = `${color}12`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.38)"; (e.currentTarget as HTMLElement).style.background = ""; }}
                >
                  <span style={{ color }}>{icon}</span>
                  {label} →
                </Link>
                {i < arr.length - 1 && <span style={{ color: "rgba(255,255,255,0.10)", fontSize: 12 }}>·</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════════
          PRICING
      ════════════════════════════════════════════════════════════════════════ */}
      <section
        className="py-20 md:py-28 border-t"
        style={{ background: "#0d0c09", borderColor: "rgba(255,255,255,0.04)" }}
      >
        <div className="max-w-md mx-auto px-5 text-center">
          <p className="text-[9px] font-black uppercase tracking-[0.24em] mb-3" style={{ color: "rgba(245,200,76,0.38)" }}>
            Pricing
          </p>
          <h2 className="text-[1.9rem] md:text-[2.4rem] font-extrabold text-white leading-tight mb-4">
            Unlock the Full System
          </h2>
          <p className="text-[14px] mb-10 leading-relaxed max-w-xs mx-auto" style={{ color: "rgba(255,255,255,0.38)" }}>
            Free gives you the headlines. Neeko+ gives you the complete edge every round.
          </p>

          {/* Yearly card */}
          <div
            className="relative rounded-2xl p-8 mb-5 text-left"
            style={{
              border: "1px solid rgba(245,200,76,0.32)",
              background: "linear-gradient(160deg, #151310 0%, #0e0d0b 100%)",
              boxShadow: "0 0 60px rgba(245,200,76,0.06)",
            }}
          >
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span
                className="text-[9px] font-black px-4 py-1 rounded-full uppercase tracking-wider"
                style={{ background: "#F5C84C", color: "#111" }}
              >
                Best Value — Save {NEEKO_PRICING.savingsPercent}%
              </span>
            </div>

            <p className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(245,200,76,0.48)" }}>
              Neeko+ Yearly
            </p>
            <div className="flex items-end gap-1.5 mb-1">
              <span className="text-[2.4rem] font-extrabold text-white leading-none">${NEEKO_PRICING.yearly.price}</span>
              <span className="text-[13px] mb-1" style={{ color: "rgba(255,255,255,0.26)" }}>AUD / year</span>
            </div>
            <p className="text-[11px] mb-8" style={{ color: "rgba(245,200,76,0.40)" }}>
              ${NEEKO_PRICING.yearly.monthlyEquivalent}/mo equivalent
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-8">
              {NEEKO_FEATURES.map(f => (
                <div key={f} className="flex items-start gap-2">
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "rgba(245,200,76,0.10)", border: "1px solid rgba(245,200,76,0.22)" }}
                  >
                    <Check size={8} style={{ color: "#F5C84C" }} />
                  </div>
                  <span className="text-[12px] leading-snug" style={{ color: "rgba(255,255,255,0.50)" }}>{f}</span>
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
            <p className="text-[11px] text-center mt-3" style={{ color: "rgba(255,255,255,0.18)" }}>
              Full rankings · Weekly game plan · Trade insights
            </p>
          </div>

          {/* Monthly card */}
          <div
            className="rounded-2xl border p-6 text-left mb-5"
            style={{ background: "#0c0b09", borderColor: "rgba(255,255,255,0.07)" }}
          >
            <p className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.20)" }}>Monthly</p>
            <div className="flex items-end gap-1.5 mb-1">
              <span className="text-[2rem] font-extrabold text-white leading-none">${NEEKO_PRICING.monthly.price}</span>
              <span className="text-[13px] mb-1" style={{ color: "rgba(255,255,255,0.26)" }}>AUD / month</span>
            </div>
            <p className="text-[11px] mb-5" style={{ color: "rgba(255,255,255,0.18)" }}>{NEEKO_PRICING.monthly.billingNote}</p>
            <Link
              to="/neeko-plus"
              className="flex items-center justify-center font-semibold text-[13px] py-3 rounded-xl border transition-all min-h-[44px] hover:brightness-[1.08] active:scale-[0.98]"
              style={{ borderColor: "rgba(245,200,76,0.28)", color: "rgba(245,200,76,0.68)" }}
            >
              Start Monthly
            </Link>
          </div>

          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.14)" }}>No lock-in. Cancel anytime.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer
        className="border-t py-8"
        style={{ background: "#090808", borderColor: "rgba(255,255,255,0.05)" }}
      >
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.14)" }}>
              © {new Date().getFullYear()} Neeko Sports Stats. All rights reserved.
            </p>
            <div className="flex gap-5">
              {FOOTER_LINKS.map(l => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="text-[12px] transition-colors hover:text-white/50"
                  style={{ color: "rgba(255,255,255,0.18)" }}
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
