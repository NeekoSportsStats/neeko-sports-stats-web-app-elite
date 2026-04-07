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

type SignalTier = "TARGET" | "WATCH" | "AVOID";

function SignalPill({ tier }: { tier: SignalTier }) {
  const config = {
    TARGET: { label: "TARGET", bg: "bg-green-500/15",  text: "text-green-400",  border: "border-green-500/30",  icon: TrendingUp },
    WATCH:  { label: "WATCH",  bg: "bg-yellow-400/10", text: "text-yellow-300", border: "border-yellow-400/20", icon: Minus },
    AVOID:  { label: "AVOID",  bg: "bg-red-500/15",    text: "text-red-400",    border: "border-red-500/30",    icon: TrendingDown },
  };
  const { label, bg, text, border, icon: Icon } = config[tier];
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${bg} ${border}`}>
      <Icon size={10} className={text} />
      <span className={`text-[10px] font-bold uppercase tracking-wide ${text}`}>{label}</span>
    </div>
  );
}

function StatusPill({ isBye }: { isBye: boolean }) {
  if (!isBye) return null;
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[9px] font-bold uppercase tracking-wide">
      BYE
    </span>
  );
}

function InjuryPill({ isInjured }: { isInjured: boolean }) {
  if (!isInjured) return null;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-[9px] font-bold uppercase tracking-wide">
      <AlertCircle size={8} />
      INJ
    </span>
  );
}

function formatValueScore(v: number | null | undefined): { label: string; textClass: string } {
  if (v == null) return { label: "—", textClass: "text-white/30" };
  const n = Number(v);
  if (isNaN(n)) return { label: "—", textClass: "text-white/30" };
  const sign = n > 0 ? "+" : "";
  const formatted = `${sign}${n.toFixed(1)}`;
  if (n >= 15) return { label: formatted, textClass: "text-green-400" };
  if (n >= 5)  return { label: formatted, textClass: "text-yellow-300" };
  if (n >= -5) return { label: formatted, textClass: "text-white/50" };
  return { label: formatted, textClass: "text-red-400" };
}

function buildInsightLine(player: DerivedPlayer): string | null {
  const parts: string[] = [];
  if (player.projection != null) parts.push(`Proj ${Math.round(Number(player.projection))}`);
  if (player.breakeven != null) parts.push(`BE ${Math.round(Number(player.breakeven))}`);
  const vs = player.value_score;
  if (vs != null) {
    const n = Number(vs);
    const sign = n >= 0 ? "+" : "";
    parts.push(`Edge ${sign}${n.toFixed(1)}`);
  }
  return parts.length > 0 ? parts.join(" | ") : null;
}

function PlayerRow({ player, index }: { player: DerivedPlayer; index: number }) {
  const tier = player.display_signal;
  const { label: vLabel, textClass: vClass } = formatValueScore(player.value_score);
  const isInjured = (player.status ?? "").toLowerCase() === "injured" || (player.manual_status ?? "").toLowerCase() === "injured";
  const isBye = player.is_bye === true;
  const insightLine = buildInsightLine(player);

  return (
    <div className="group">
      <div className="grid grid-cols-[2rem_1fr_3.5rem_4rem_4.5rem_5rem] md:grid-cols-[2.5rem_1fr_4rem_4.5rem_5rem_6rem] gap-x-2 md:gap-x-3 px-3 md:px-4 py-3 border-b border-white/[0.04] bg-[#0c0c0c] hover:bg-[#111] transition-colors items-center">
        <span className="text-xs text-white/25 font-mono tabular-nums">{index}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold text-white truncate leading-tight">{player.player_name}</p>
            <InjuryPill isInjured={isInjured} />
            <StatusPill isBye={isBye} />
          </div>
          <p className="text-[10px] text-white/30 leading-tight truncate">
            {player.team}{player.position ? ` · ${player.position}` : ""}
          </p>
        </div>
        <span className="text-xs md:text-sm font-bold text-white tabular-nums text-center">
          {formatProj(player.projection)}
        </span>
        <span className="text-xs md:text-sm font-semibold text-white/50 text-center tabular-nums">
          {formatPrice(player.price)}
        </span>
        <span className={`text-[11px] font-semibold text-center tabular-nums ${vClass}`}>
          {vLabel}
        </span>
        <div className="flex justify-end">
          <SignalPill tier={tier} />
        </div>
      </div>
      {insightLine && (
        <div className="px-3 md:px-4 py-1.5 bg-[#0a0a0a] border-b border-white/[0.03]">
          <p className="text-[11px] text-white/30 leading-snug font-mono">{insightLine}</p>
        </div>
      )}
    </div>
  );
}

function LockedRow({ index }: { index: number }) {
  return (
    <div className="grid grid-cols-[2rem_1fr_3.5rem_4rem_4.5rem_5rem] md:grid-cols-[2.5rem_1fr_4rem_4.5rem_5rem_6rem] gap-x-2 md:gap-x-3 px-3 md:px-4 py-3.5 border-b border-white/[0.04] bg-[#0c0c0c] items-center select-none">
      <span className="text-xs text-white/15 font-mono tabular-nums">{index}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <Lock size={10} className="text-white/20 shrink-0" />
        <span className="text-sm font-bold text-white/20 blur-[3px] truncate">Premium Player</span>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#F5C84C]/10 border border-[#F5C84C]/20 text-[9px] font-bold text-[#F5C84C]/60 uppercase tracking-wide shrink-0">
          +
        </span>
      </div>
      <span className="text-xs text-white/15 text-center blur-[3px]">—</span>
      <span className="text-xs text-white/15 text-center blur-[3px]">—</span>
      <span className="text-xs text-white/15 text-center blur-[3px]">—</span>
      <span className="text-xs text-white/15 text-right blur-[3px]">—</span>
    </div>
  );
}

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
  const watch   = available.filter(p => p.display_signal === "WATCH").slice(0, CARDS_PER_CAT);
  const avoid   = available.filter(p => p.display_signal === "AVOID").slice(0, CARDS_PER_CAT);

  const freeRowCount = targets.length + watch.length + avoid.length;
  const lockedRowCount = Math.max(0, 6 - freeRowCount);

  const players: DerivedPlayer[] = [...targets, ...watch, ...avoid];

  return (
    <section className="py-10 md:py-14 bg-[#070707] border-t border-white/[0.05]">
      <div className="max-w-4xl mx-auto px-4">
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

        <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
          <div className="grid grid-cols-[2rem_1fr_3.5rem_4rem_4.5rem_5rem] md:grid-cols-[2.5rem_1fr_4rem_4.5rem_5rem_6rem] gap-x-2 md:gap-x-3 px-3 md:px-4 py-3 text-[10px] font-semibold text-white/25 uppercase tracking-widest border-b border-white/[0.06] bg-[#0a0a0a]">
            <span>#</span>
            <span>Player</span>
            <span className="text-center">Proj</span>
            <span className="text-center">Price</span>
            <span className="text-center">Value</span>
            <span className="text-right">Signal</span>
          </div>

          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="grid grid-cols-[2rem_1fr_3.5rem_4rem_4.5rem_5rem] md:grid-cols-[2.5rem_1fr_4rem_4.5rem_5rem_6rem] gap-x-2 md:gap-x-3 px-3 md:px-4 py-4 border-b border-white/[0.04] bg-[#0c0c0c]">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <div key={j} className="h-4 bg-white/[0.06] rounded" />
                  ))}
                </div>
                <div className="px-3 md:px-4 py-2 bg-[#0a0a0a] border-b border-white/[0.03]">
                  <div className="h-3 bg-white/[0.05] rounded w-3/4" />
                </div>
              </div>
            ))
          ) : players.length > 0 ? (
            <>
              {players.map((player, idx) => (
                <PlayerRow key={player.player_id} player={player} index={idx + 1} />
              ))}
              {Array.from({ length: lockedRowCount }).map((_, i) => (
                <LockedRow key={`locked-${i}`} index={players.length + i + 1} />
              ))}
            </>
          ) : (
            <div className="px-4 py-10 text-center bg-[#0c0c0c]">
              <p className="text-sm text-white/30 mb-3">No market data available yet — check back after weekly price changes.</p>
              <Link
                to="/sports/afl/market-watch"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F5C84C]/70 hover:text-[#F5C84C] transition-colors"
              >
                View Market Watch
                <ArrowRight size={12} />
              </Link>
            </div>
          )}
        </div>

        <div className="mt-4 px-4 py-2.5 rounded-lg bg-[#0a0a0a] border border-white/[0.05]">
          <p className="text-[11px] text-white/30 text-center leading-relaxed">
            Updated weekly using live projections and pricing data · 600+ more players available with Neeko+
          </p>
        </div>

        <div className="mt-5 rounded-xl border border-[#F5C84C]/20 bg-[#0d0d0d] px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ boxShadow: "0 0 24px rgba(245,200,76,0.04)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#F5C84C]/10 border border-[#F5C84C]/20 flex items-center justify-center shrink-0">
              <Lock size={14} className="text-[#F5C84C]" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">Unlock Full Market Intelligence</p>
              <p className="text-[11px] text-white/35 leading-tight mt-0.5">Complete trade analysis for all 600+ players · Updated before lockout</p>
            </div>
          </div>
          <Link
            to="/neeko-plus"
            className="shrink-0 inline-flex items-center justify-center gap-2 bg-[#F5C84C] text-black font-bold text-sm px-6 py-2.5 rounded-xl hover:brightness-110 transition-all min-h-[44px] w-full sm:w-auto"
          >
            <Crown size={13} />
            Unlock Neeko+
          </Link>
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
    </section>
  );
}
