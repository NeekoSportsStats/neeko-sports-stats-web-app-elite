import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus, Lock, ArrowRight, Crown, CircleAlert as AlertCircle } from "lucide-react";
import type { DerivedPlayer } from "@/features/afl/market-watch/engine";

function formatPrice(price: number | null | undefined): string {
  if (!price) return "—";
  return `$${(price / 1000000).toFixed(2)}M`;
}

function formatProj(v: number | null | undefined): string {
  if (v == null) return "—";
  return Math.round(Number(v)).toString();
}

type DisplaySignal = "TARGET" | "WATCH" | "AVOID";

function SignalPill({ tier, locked }: { tier: DisplaySignal; locked?: boolean }) {
  const config = {
    TARGET: { label: "TARGET", bg: "bg-green-500/15",  text: "text-green-400",  border: "border-green-500/30",  icon: TrendingUp },
    WATCH:  { label: "WATCH",  bg: "bg-yellow-400/10", text: "text-yellow-300", border: "border-yellow-400/20", icon: Minus },
    AVOID:  { label: "AVOID",  bg: "bg-red-500/15",    text: "text-red-400",    border: "border-red-500/30",    icon: TrendingDown },
  };
  const { label, bg, text, border, icon: Icon } = config[tier];
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${bg} ${border} ${locked ? "opacity-50" : ""}`}>
      {locked ? <Lock size={9} className={text} /> : <Icon size={10} className={text} />}
      <span className={`text-[10px] font-bold uppercase tracking-wide ${text}`}>{label}</span>
    </div>
  );
}

function formatValueScore(v: number | null | undefined): { label: string; textClass: string; isLocked: boolean } {
  if (v == null) return { label: "Unlock", isLocked: true, textClass: "text-white/30" };
  const n = Number(v);
  if (isNaN(n)) return { label: "Unlock", isLocked: true, textClass: "text-white/30" };
  const sign = n > 0 ? "+" : "";
  const formatted = `${sign}${n.toFixed(1)}`;
  if (n >= 15) return { label: formatted, isLocked: false, textClass: "text-green-400" };
  if (n >= 5)  return { label: formatted, isLocked: false, textClass: "text-yellow-300" };
  if (n >= -5) return { label: formatted, isLocked: false, textClass: "text-white/50" };
  return { label: formatted, isLocked: false, textClass: "text-red-400" };
}

function buildInsightLine(player: DerivedPlayer): { proj: string | null; be: string | null; edge: string | null; locked: boolean } {
  const proj = player.projection != null ? `${Math.round(Number(player.projection))}` : null;
  const be   = player.breakeven != null ? `${Math.round(Number(player.breakeven))}` : null;
  const vs   = player.value_score != null ? (() => {
    const n = Number(player.value_score);
    return `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
  })() : null;
  const locked = !be || !vs;
  return { proj, be, edge: vs, locked };
}

/* ─── Mobile Card ─────────────────────────────────────────────────────────── */

function MobilePlayerCard({ player, index }: { player: DerivedPlayer; index: number }) {
  const tier = (player.display_signal ?? "WATCH") as DisplaySignal;
  const { label: vLabel, textClass: vClass, isLocked } = formatValueScore(player.value_score);
  const isInjured = (player.status ?? "").toLowerCase() === "injured" || (player.manual_status ?? "").toLowerCase() === "injured";
  const isBye = player.is_bye === true;
  const { proj, be, edge, locked: insightLocked } = buildInsightLine(player);

  return (
    <div className="bg-white/[0.04] rounded-xl p-3.5 mb-3 border border-white/[0.06] hover:border-white/[0.1] transition-colors">
      {/* Top row: name + signal */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-white/25 font-mono tabular-nums">{index}</span>
            <p className="text-sm font-bold text-white leading-tight">{player.player_name}</p>
            {isInjured && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-[9px] font-bold uppercase tracking-wide">
                <AlertCircle size={7} />INJ
              </span>
            )}
            {isBye && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[9px] font-bold uppercase tracking-wide">
                BYE
              </span>
            )}
          </div>
          <p className="text-[11px] text-white/35 mt-0.5">
            {player.team}{player.position ? ` · ${player.position}` : ""}
          </p>
        </div>
        <SignalPill tier={tier} locked={isLocked} />
      </div>

      {/* Middle: key metrics row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 rounded-lg bg-[#F5C84C]/[0.06] border border-[#F5C84C]/15 px-2.5 py-1.5 text-center">
          <p className="text-[9px] text-white/35 uppercase tracking-wider mb-0.5">Projection</p>
          <p className="text-sm font-extrabold text-[#F5C84C] tabular-nums">
            {formatProj(player.projection)}
          </p>
        </div>

        <div className="flex-1 rounded-lg bg-white/[0.03] border border-white/[0.06] px-2.5 py-1.5 text-center">
          <p className="text-[9px] text-white/35 uppercase tracking-wider mb-0.5">Price</p>
          <p className="text-sm font-semibold text-white/60 tabular-nums">
            {formatPrice(player.price)}
          </p>
        </div>

        <div className="flex-1 rounded-lg bg-white/[0.03] border border-white/[0.06] px-2.5 py-1.5 text-center">
          <p className="text-[9px] text-white/35 uppercase tracking-wider mb-0.5">Edge</p>
          {isLocked ? (
            <span className="flex items-center justify-center gap-1 text-[10px] text-white/25">
              <Lock size={8} className="shrink-0" />
              <span>+</span>
            </span>
          ) : (
            <p className={`text-sm font-bold tabular-nums ${vClass}`}>{vLabel}</p>
          )}
        </div>
      </div>

      {/* Bottom: insight line */}
      <div className="mt-2.5 pt-2.5 border-t border-white/[0.05]">
        {insightLocked ? (
          <p className="text-[11px] leading-snug flex items-center gap-1.5 font-mono">
            {proj && <span className="text-white/35">Proj {proj}</span>}
            {proj && <span className="text-white/15">·</span>}
            <span className="inline-flex items-center gap-1 text-[#F5C84C]/40">
              <Lock size={8} />
              <span>Unlock BE &amp; Edge data</span>
            </span>
          </p>
        ) : (
          <p className="text-[11px] text-white/35 font-mono leading-snug">
            Proj {proj}
            {be && <> · BE <span className="text-white/45">{be}</span></>}
            {edge && <> · Edge <span className={vClass}>{edge}</span></>}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Mobile Locked Card ──────────────────────────────────────────────────── */

function MobileLockedCard({ index, tier }: { index: number; tier: DisplaySignal }) {
  const tierConfig: Record<DisplaySignal, { color: string }> = {
    TARGET: { color: "text-green-400/40" },
    WATCH:  { color: "text-yellow-300/40" },
    AVOID:  { color: "text-red-400/40" },
  };
  const { color } = tierConfig[tier];

  return (
    <div className="bg-white/[0.02] rounded-xl p-3.5 mb-3 border border-white/[0.04] opacity-50 select-none">
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-white/15 font-mono">{index}</span>
            <Lock size={10} className="text-white/20 shrink-0" />
            <span className="text-sm font-bold text-white/20 blur-[3px]">Locked Player</span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#F5C84C]/10 border border-[#F5C84C]/20 text-[9px] font-bold text-[#F5C84C]/60 uppercase tracking-wide shrink-0">
              +
            </span>
          </div>
          <p className="text-[11px] text-white/15 mt-0.5 blur-[2px]">Team · POS</p>
        </div>
        <span className={`text-[10px] font-bold uppercase blur-[3px] ${color}`}>{tier}</span>
      </div>

      <div className="flex items-center justify-between gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex-1 rounded-lg bg-white/[0.02] border border-white/[0.04] px-2.5 py-1.5 text-center">
            <div className="h-2 w-8 bg-white/[0.05] rounded mx-auto mb-1" />
            <div className={`h-4 w-10 rounded mx-auto blur-[4px] ${i === 0 ? "bg-[#F5C84C]/15" : i === 2 ? `bg-green-400/15` : "bg-white/10"}`} />
          </div>
        ))}
      </div>

      <div className="mt-2.5 pt-2.5 border-t border-white/[0.04]">
        <p className="text-[11px] font-mono flex items-center gap-1 text-[#F5C84C]/30">
          <Lock size={8} />
          <span>Premium signal locked</span>
        </p>
      </div>
    </div>
  );
}

/* ─── Desktop Row (original grid layout) ─────────────────────────────────── */

function DesktopPlayerRow({ player, index }: { player: DerivedPlayer; index: number }) {
  const tier = (player.display_signal ?? "WATCH") as DisplaySignal;
  const { label: vLabel, textClass: vClass, isLocked } = formatValueScore(player.value_score);
  const isInjured = (player.status ?? "").toLowerCase() === "injured" || (player.manual_status ?? "").toLowerCase() === "injured";
  const isBye = player.is_bye === true;
  const { proj, be, edge, locked: insightLocked } = buildInsightLine(player);

  return (
    <div className={`group ${isLocked ? "opacity-80" : ""}`}>
      <div className="grid grid-cols-[2.5rem_1fr_4rem_4.5rem_5rem_6rem] gap-x-3 px-4 py-3 border-b border-white/[0.04] bg-[#0c0c0c] hover:bg-[#111] transition-colors items-center">
        <span className="text-xs text-white/25 font-mono tabular-nums">{index}</span>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold text-white truncate leading-tight">{player.player_name}</p>
            {isInjured && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-[9px] font-bold uppercase tracking-wide">
                <AlertCircle size={8} />INJ
              </span>
            )}
            {isBye && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[9px] font-bold uppercase tracking-wide">
                BYE
              </span>
            )}
          </div>
          <p className="text-[10px] text-white/30 leading-tight truncate">
            {player.team}{player.position ? ` · ${player.position}` : ""}
          </p>
        </div>

        <span className="text-sm font-bold text-white tabular-nums text-center">
          {formatProj(player.projection)}
        </span>

        <span className="text-sm font-semibold text-white/50 text-center tabular-nums">
          {formatPrice(player.price)}
        </span>

        {isLocked ? (
          <span className="flex items-center justify-center gap-1 text-[10px] text-white/30">
            <Lock size={9} className="text-white/25 shrink-0" />
            <span>Unlock</span>
          </span>
        ) : (
          <span className={`text-[11px] font-semibold text-center tabular-nums ${vClass}`}>
            {vLabel}
          </span>
        )}

        <div className="flex justify-end">
          <SignalPill tier={tier} locked={isLocked} />
        </div>
      </div>

      <div className="px-4 py-1.5 bg-[#0a0a0a] border-b border-white/[0.03]">
        {insightLocked ? (
          <p className="text-[11px] font-mono leading-snug flex items-center gap-1.5">
            {proj && <span className="text-white/35">Proj {proj}</span>}
            {proj && <span className="text-white/20">|</span>}
            <span className="inline-flex items-center gap-1 text-[#F5C84C]/40">
              <Lock size={8} />
              <span>Unlock full edge data</span>
            </span>
          </p>
        ) : (
          <p className="text-[11px] text-white/35 leading-snug font-mono">
            Proj {proj}{be ? ` | BE ${be}` : ""}{edge ? ` | Edge ${edge}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function DesktopLockedRow({ index, tier }: { index: number; tier: DisplaySignal }) {
  const tierConfig: Record<DisplaySignal, { color: string }> = {
    TARGET: { color: "text-green-400/40" },
    WATCH:  { color: "text-yellow-300/40" },
    AVOID:  { color: "text-red-400/40" },
  };
  const { color } = tierConfig[tier];

  return (
    <div>
      <div className="grid grid-cols-[2.5rem_1fr_4rem_4.5rem_5rem_6rem] gap-x-3 px-4 py-3 border-b border-white/[0.04] bg-[#0c0c0c] items-center select-none opacity-50">
        <span className="text-xs text-white/15 font-mono tabular-nums">{index}</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <Lock size={10} className="text-white/20 shrink-0" />
          <span className="text-sm font-bold text-white/20 blur-[3px] truncate select-none">Locked Player Name</span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#F5C84C]/10 border border-[#F5C84C]/20 text-[9px] font-bold text-[#F5C84C]/60 uppercase tracking-wide shrink-0">
            +
          </span>
        </div>
        <span className="text-xs text-white/15 text-center blur-[4px] select-none">112</span>
        <span className="text-xs text-white/15 text-center blur-[4px] select-none">$1.05M</span>
        <span className={`text-[10px] text-center blur-[4px] select-none ${color}`}>+18.4</span>
        <div className="flex justify-end">
          <span className={`text-[10px] font-bold uppercase blur-[4px] select-none ${color}`}>{tier}</span>
        </div>
      </div>
      <div className="px-4 py-1.5 bg-[#0a0a0a] border-b border-white/[0.03]">
        <p className="text-[11px] font-mono leading-snug flex items-center gap-1.5 opacity-50">
          <span className="text-white/20 blur-[3px] select-none">Proj 112</span>
          <span className="text-white/15">|</span>
          <span className="inline-flex items-center gap-1 text-[#F5C84C]/35">
            <Lock size={8} />
            <span>Premium signal locked</span>
          </span>
        </p>
      </div>
    </div>
  );
}

/* ─── Category Header ─────────────────────────────────────────────────────── */

function CategoryHeader({ tier, lockedCount, isMobile }: { tier: DisplaySignal; lockedCount: number; isMobile?: boolean }) {
  const config = {
    TARGET: { label: "Target Buys",  dot: "bg-green-400",  text: "text-green-400/80",  note: "Best underpriced picks" },
    WATCH:  { label: "Watch List",   dot: "bg-yellow-300", text: "text-yellow-300/80", note: "Monitor for moves" },
    AVOID:  { label: "Traps",        dot: "bg-red-400",    text: "text-red-400/80",    note: lockedCount > 0 ? "Premium traps hidden" : "Overpriced to avoid" },
  };
  const { label, dot, text, note } = config[tier];

  if (isMobile) {
    return (
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${dot}`} />
          <h2 className="text-base font-semibold text-white">{label}</h2>
        </div>
        <span className="text-xs text-white/40">{note}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-[#080808] border-b border-white/[0.05]">
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${dot} opacity-70`} />
        <span className={`text-[10px] font-bold uppercase tracking-widest ${text}`}>{label}</span>
      </div>
      <span className="text-[9px] text-white/20 uppercase tracking-wide">{note}</span>
    </div>
  );
}

/* ─── Mobile CTA Block ────────────────────────────────────────────────────── */

function MobileCTABlock() {
  return (
    <div className="mt-6 px-1">
      <Link
        to="/neeko-plus"
        className="block w-full rounded-xl p-4 text-black"
        style={{ background: "linear-gradient(135deg, #F5C84C 0%, #e6b430 100%)" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Crown size={14} className="shrink-0" />
          <span className="text-sm font-bold">Neeko+ — $9.99/month</span>
        </div>
        <p className="text-xs text-black/60 mb-3 leading-snug">
          Unlock 600+ players, full projections, edge scores &amp; trade insights
        </p>
        <div className="w-full bg-black text-white rounded-lg py-2.5 text-sm font-bold text-center">
          Unlock Now
        </div>
      </Link>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────────────── */

interface LandingMarketWatchSampleProps {
  buys: DerivedPlayer[];
  holds: DerivedPlayer[];
  sells: DerivedPlayer[];
  loading: boolean;
}

export function LandingMarketWatchSample({ buys, holds, sells, loading }: LandingMarketWatchSampleProps) {
  const allPlayers = [...buys, ...holds, ...sells];

  const available = allPlayers.filter(p => {
    if ((p.status ?? "").toLowerCase() === "out") return false;
    if ((p.manual_status ?? "").toLowerCase() === "out") return false;
    if ((p.manual_status ?? "").toLowerCase() === "injured") return false;
    if (p.is_bye === true) return false;
    if ((p.games_played ?? 0) < 3) return false;
    if ((p.projection ?? 0) <= 50) return false;
    return true;
  });

  const CARDS_PER_CAT = 2;

  const targets = available.filter(p => p.display_signal === "TARGET").slice(0, CARDS_PER_CAT);
  const watches = available.filter(p => p.display_signal === "WATCH").slice(0, CARDS_PER_CAT);
  const avoids  = available.filter(p => p.display_signal === "AVOID").slice(0, CARDS_PER_CAT);

  const targetLocked = Math.max(0, CARDS_PER_CAT - targets.length);
  const watchLocked  = Math.max(0, CARDS_PER_CAT - watches.length);
  const avoidLocked  = Math.max(0, CARDS_PER_CAT - avoids.length);

  let rowIndex = 0;

  const skeletonRows = Array.from({ length: CARDS_PER_CAT * 3 });

  return (
    <section className="py-10 md:py-14 bg-[#070707] border-t border-white/[0.05]">
      <div className="max-w-4xl mx-auto px-4">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#F5C84C]/25 bg-[#F5C84C]/10 text-[#F5C84C] text-[10px] font-bold uppercase tracking-widest mb-3">
            Live Product Data
          </div>
          <h2 className="text-2xl md:text-4xl font-extrabold text-white leading-tight mb-3">
            See the Edge Before Everyone Else
          </h2>
          <div className="flex justify-center my-3">
            <div className="w-10 h-0.5 rounded-full bg-[#F5C84C]/30" />
          </div>
          <p className="text-sm text-white/40 max-w-lg mx-auto leading-relaxed">
            Real Market Watch data showing this week's best trades and traps — updated weekly using live projections.
          </p>
        </div>

        {/* Unlock teaser banner */}
        <div className="mb-4 px-3 py-2.5 rounded-lg bg-[#F5C84C]/[0.04] border border-[#F5C84C]/15 flex items-center gap-2">
          <Lock size={11} className="text-[#F5C84C]/50 shrink-0" />
          <p className="text-[11px] text-white/40 leading-snug">
            Top trade targets shown.{" "}
            <span className="text-[#F5C84C]/60 font-semibold">
              Neeko+ unlocks full signals, edge scores and traps for all 600+ players.
            </span>
          </p>
        </div>

        {/* ── MOBILE CARD LAYOUT ───────────────────────────────────────────── */}
        <div className="md:hidden">
          {loading ? (
            skeletonRows.map((_, i) => (
              <div key={i} className="bg-white/[0.03] rounded-xl p-3.5 mb-3 border border-white/[0.05] animate-pulse">
                <div className="flex justify-between mb-3">
                  <div className="h-4 w-32 bg-white/[0.06] rounded" />
                  <div className="h-5 w-16 bg-white/[0.06] rounded-md" />
                </div>
                <div className="flex gap-2 mb-3">
                  {[0, 1, 2].map((j) => (
                    <div key={j} className="flex-1 h-12 bg-white/[0.04] rounded-lg" />
                  ))}
                </div>
                <div className="h-3 w-40 bg-white/[0.04] rounded pt-2" />
              </div>
            ))
          ) : (
            <>
              {/* Target Buys */}
              <div className="mb-6">
                <CategoryHeader tier="TARGET" lockedCount={targetLocked} isMobile />
                {targets.map((p) => {
                  rowIndex++;
                  return <MobilePlayerCard key={p.player_id} player={p} index={rowIndex} />;
                })}
                {Array.from({ length: targetLocked }).map((_, i) => {
                  rowIndex++;
                  return <MobileLockedCard key={`tl-${i}`} index={rowIndex} tier="TARGET" />;
                })}
              </div>

              <div className="h-px bg-white/[0.05] mb-6" />

              {/* Watch List */}
              <div className="mb-6">
                <CategoryHeader tier="WATCH" lockedCount={watchLocked} isMobile />
                {watches.map((p) => {
                  rowIndex++;
                  return <MobilePlayerCard key={p.player_id} player={p} index={rowIndex} />;
                })}
                {Array.from({ length: watchLocked }).map((_, i) => {
                  rowIndex++;
                  return <MobileLockedCard key={`wl-${i}`} index={rowIndex} tier="WATCH" />;
                })}
              </div>

              <div className="h-px bg-white/[0.05] mb-6" />

              {/* Traps */}
              <div className="mb-2">
                <CategoryHeader tier="AVOID" lockedCount={avoidLocked} isMobile />
                {avoids.map((p) => {
                  rowIndex++;
                  return <MobilePlayerCard key={p.player_id} player={p} index={rowIndex} />;
                })}
                {Array.from({ length: avoidLocked }).map((_, i) => {
                  rowIndex++;
                  return <MobileLockedCard key={`al-${i}`} index={rowIndex} tier="AVOID" />;
                })}
              </div>

              <MobileCTABlock />
            </>
          )}

          <div className="mt-4 text-center">
            <Link
              to="/sports/afl/market-watch"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F5C84C]/70 hover:text-[#F5C84C] transition-colors"
            >
              View Full Market Watch
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {/* ── DESKTOP TABLE LAYOUT ─────────────────────────────────────────── */}
        <div className="hidden md:block">
          <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
            <div className="grid grid-cols-[2.5rem_1fr_4rem_4.5rem_5rem_6rem] gap-x-3 px-4 py-2.5 text-[10px] font-semibold text-white/25 uppercase tracking-widest border-b border-white/[0.06] bg-[#0a0a0a]">
              <span>#</span>
              <span>Player</span>
              <span className="text-center">Proj</span>
              <span className="text-center">Price</span>
              <span className="text-center">Edge</span>
              <span className="text-right">Signal</span>
            </div>

            {loading ? (
              skeletonRows.map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="grid grid-cols-[2.5rem_1fr_4rem_4.5rem_5rem_6rem] gap-x-3 px-4 py-4 border-b border-white/[0.04] bg-[#0c0c0c]">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <div key={j} className="h-4 bg-white/[0.06] rounded" />
                    ))}
                  </div>
                  <div className="px-4 py-2 bg-[#0a0a0a] border-b border-white/[0.03]">
                    <div className="h-3 bg-white/[0.05] rounded w-3/4" />
                  </div>
                </div>
              ))
            ) : (
              <>
                <CategoryHeader tier="TARGET" lockedCount={targetLocked} />
                {targets.map((p) => {
                  rowIndex++;
                  return <DesktopPlayerRow key={p.player_id} player={p} index={rowIndex} />;
                })}
                {Array.from({ length: targetLocked }).map((_, i) => {
                  rowIndex++;
                  return <DesktopLockedRow key={`tl-${i}`} index={rowIndex} tier="TARGET" />;
                })}

                <CategoryHeader tier="WATCH" lockedCount={watchLocked} />
                {watches.map((p) => {
                  rowIndex++;
                  return <DesktopPlayerRow key={p.player_id} player={p} index={rowIndex} />;
                })}
                {Array.from({ length: watchLocked }).map((_, i) => {
                  rowIndex++;
                  return <DesktopLockedRow key={`wl-${i}`} index={rowIndex} tier="WATCH" />;
                })}

                <CategoryHeader tier="AVOID" lockedCount={avoidLocked} />
                {avoids.map((p) => {
                  rowIndex++;
                  return <DesktopPlayerRow key={p.player_id} player={p} index={rowIndex} />;
                })}
                {Array.from({ length: avoidLocked }).map((_, i) => {
                  rowIndex++;
                  return <DesktopLockedRow key={`al-${i}`} index={rowIndex} tier="AVOID" />;
                })}
              </>
            )}

            <div className="px-4 py-3.5 bg-[#090909] border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-[11px] text-white/30 leading-snug">
                Unlock full trade intelligence for all{" "}
                <span className="text-white/50 font-semibold">600+ players</span> — edge scores, traps, breakevens and AI breakdowns.
              </p>
              <Link
                to="/neeko-plus"
                className="shrink-0 inline-flex items-center justify-center gap-1.5 bg-[#F5C84C] text-black font-bold text-xs px-4 py-2 rounded-lg hover:brightness-110 transition-all whitespace-nowrap"
              >
                <Crown size={11} />
                Unlock Neeko+
              </Link>
            </div>
          </div>

          <div className="mt-3 text-center">
            <Link
              to="/sports/afl/market-watch"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F5C84C]/70 hover:text-[#F5C84C] transition-colors"
            >
              View Full Market Watch
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>

      </div>
    </section>
  );
}
