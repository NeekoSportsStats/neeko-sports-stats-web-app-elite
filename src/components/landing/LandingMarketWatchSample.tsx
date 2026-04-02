import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus, Lock, ArrowRight, Crown, CircleAlert as AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { mapMarketLabel } from "@/utils/marketLabels";

interface MarketWatchRow {
  player_id: number;
  player_name: string;
  team: string;
  position: string | null;
  projection: number | null;
  breakeven: number | null;
  value_score: number | null;
  category: string | null;
  action?: string | null;
  price: number | null;
  is_injured: boolean | null;
  is_bye: boolean | null;
  status: string | null;
  manual_status: string | null;
  value_label: string | null;
  matchup_label: string | null;
  recommendation_short: string | null;
}

function StatusPill({ isInjured, isBye }: { isInjured: boolean; isBye: boolean }) {
  if (isInjured) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-[9px] font-bold uppercase tracking-wide">
        <AlertCircle size={8} />
        INJ
      </span>
    );
  }
  if (isBye) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[9px] font-bold uppercase tracking-wide">
        BYE
      </span>
    );
  }
  return null;
}

function CategoryPill({ category }: { category: string | null }) {
  if (!category) return null;

  const cat = category.toUpperCase();

  // Map both old (TARGET/WATCH/AVOID) and new (BUY/HOLD/SELL) to friendly labels
  const normalizedCategory = cat === "TARGET" || cat === "BUY" ? "BUY"
    : cat === "AVOID" || cat === "SELL" ? "SELL"
    : "HOLD";

  const mapped = mapMarketLabel(normalizedCategory);

  const styles: Record<string, { bg: string; text: string; border: string; icon: typeof TrendingUp }> = {
    "BUY": {
      bg: "bg-green-400/10",
      text: "text-green-400",
      border: "border-green-400/30",
      icon: TrendingUp,
    },
    "SELL": {
      bg: "bg-red-400/10",
      text: "text-red-400",
      border: "border-red-400/30",
      icon: TrendingDown,
    },
    "HOLD": {
      bg: "bg-[#F5C84C]/10",
      text: "text-[#F5C84C]",
      border: "border-[#F5C84C]/30",
      icon: Minus,
    },
  };

  const style = styles[normalizedCategory];
  const Icon = style.icon;

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${style.bg} ${style.border}`}>
      <Icon size={10} className={style.text} />
      <span className={`text-[10px] font-bold uppercase tracking-wide ${style.text}`}>
        {mapped.label.toUpperCase()}
      </span>
    </div>
  );
}

function PlayerRow({ player, index }: { player: MarketWatchRow; index: number }) {
  const projection = player.projection != null ? Math.round(player.projection) : "—";
  const breakeven = player.breakeven != null ? Math.round(player.breakeven) : "—";
  const valueGap = useMemo(() => {
    if (player.projection == null || player.breakeven == null) return null;
    return Math.round(player.projection - player.breakeven);
  }, [player.projection, player.breakeven]);

  const isInjured = player.is_injured === true || player.status === 'injured' || player.manual_status === 'injured';
  const isBye = player.is_bye === true || player.status === 'bye' || player.manual_status === 'bye';

  const aiWhy = useMemo(() => {
    const cat = (player.category ?? '').toUpperCase();
    const gap = valueGap ?? 0;
    const proj = projection !== "—" ? projection : 0;

    // Support both old (TARGET/WATCH/AVOID) and new (BUY/HOLD/SELL) values
    if ((cat === 'TARGET' || cat === 'BUY') && gap > 0) {
      return `+${gap} value gap with ${proj} projection — underpriced opportunity`;
    }
    if ((cat === 'AVOID' || cat === 'SELL') && gap < 0) {
      return `${gap} value gap — priced above current output`;
    }
    if (cat === 'WATCH' || cat === 'HOLD') {
      if (player.recommendation_short) {
        return player.recommendation_short;
      }
      return `Projection: ${proj} · Breakeven: ${breakeven}`;
    }
    return `Projection: ${proj} · Breakeven: ${breakeven}`;
  }, [player.category, valueGap, projection, breakeven, player.recommendation_short]);

  return (
    <div className="group">
      <div className="grid grid-cols-[2rem_1fr_4.5rem_4rem_5rem] md:grid-cols-[2.5rem_1fr_5rem_4.5rem_6rem] gap-x-2.5 md:gap-x-3 px-3 md:px-4 py-3 border-b border-white/[0.04] bg-[#0c0c0c] hover:bg-[#111] transition-colors items-center">
        <span className="text-xs text-white/25 font-mono tabular-nums">{index}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold text-white truncate leading-tight">{player.player_name}</p>
            <StatusPill isInjured={isInjured} isBye={isBye} />
          </div>
          <p className="text-[10px] text-white/30 leading-tight truncate">{player.team}{player.position ? ` · ${player.position}` : ""}</p>
        </div>
        <span className="text-sm font-bold text-[#F5C84C] text-center tabular-nums">
          {projection}
        </span>
        <span className="text-xs md:text-sm font-bold text-white/60 text-center tabular-nums">
          {breakeven}
        </span>
        <div className="flex justify-end">
          <CategoryPill category={player.category} />
        </div>
      </div>
      <div className="px-3 md:px-4 py-1.5 bg-[#0a0a0a] border-b border-white/[0.03]">
        <p className="text-[11px] text-white/35 leading-snug italic">{aiWhy}</p>
      </div>
    </div>
  );
}

function LockedRow({ index }: { index: number }) {
  return (
    <div className="grid grid-cols-[2rem_1fr_4.5rem_4rem_5rem] md:grid-cols-[2.5rem_1fr_5rem_4.5rem_6rem] gap-x-2.5 md:gap-x-3 px-3 md:px-4 py-3.5 border-b border-white/[0.04] bg-[#0c0c0c] items-center select-none">
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
      <span className="text-xs text-white/15 text-right blur-[3px]">—</span>
    </div>
  );
}

export function LandingMarketWatchSample() {
  const [players, setPlayers] = useState<MarketWatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Try v_mw_free first (already balanced: 3 TARGET + 3 WATCH + 3 AVOID)
        let { data, error } = await supabase
          .from("v_mw_free")
          .select("player_id, player_name, team, position, projection, breakeven, value_score, category, price, is_injured, is_bye, status, manual_status, value_label, matchup_label, recommendation_short, action");

        // Fallback to v_mw_premium if v_mw_free fails
        if (error || !data || data.length === 0) {
          console.log("[LandingMW] Falling back to v_mw_premium");
          const premiumResult = await supabase
            .from("v_mw_premium")
            .select("player_id, player_name, team, position, projection, breakeven, value_score, action, price, ai_recommendation, recommendation_short, matchup_label")
            .limit(6);

          data = (premiumResult.data ?? []).map(p => ({
            ...p,
            category: p.action, // Map action to category
            is_injured: false,
            is_bye: false,
            status: null,
            manual_status: null,
            value_label: null,
          }));
        }

        // Filter out injured/bye players for cleaner sample
        const availableRows = (data ?? []).filter((r: any) => !r.is_injured && !r.is_bye) as MarketWatchRow[];

        // Take 2 from each category for 6 total display
        // Support both old (TARGET/WATCH/AVOID) and new (BUY/HOLD/SELL) values
        const targets = availableRows.filter(r => {
          const cat = (r.category ?? '').toUpperCase();
          return cat === 'TARGET' || cat === 'BUY';
        }).slice(0, 2);
        const watches = availableRows.filter(r => {
          const cat = (r.category ?? '').toUpperCase();
          return cat === 'WATCH' || cat === 'HOLD';
        }).slice(0, 2);
        const avoids = availableRows.filter(r => {
          const cat = (r.category ?? '').toUpperCase();
          return cat === 'AVOID' || cat === 'SELL';
        }).slice(0, 2);

        const selected = [...targets, ...watches, ...avoids];

        setPlayers(selected);
      } catch (err) {
        console.error("[LandingMW] Error:", err);
        setPlayers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
          <div className="grid grid-cols-[2rem_1fr_4.5rem_4rem_5rem] md:grid-cols-[2.5rem_1fr_5rem_4.5rem_6rem] gap-x-2.5 md:gap-x-3 px-3 md:px-4 py-3 text-[10px] font-semibold text-white/25 uppercase tracking-widest border-b border-white/[0.06] bg-[#0a0a0a]">
            <span>#</span>
            <span>Player</span>
            <span className="text-center text-[#F5C84C]/60">Proj.</span>
            <span className="text-center">BE</span>
            <span className="text-right">Signal</span>
          </div>

          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="grid grid-cols-[2rem_1fr_4.5rem_4rem_5rem] md:grid-cols-[2.5rem_1fr_5rem_4.5rem_6rem] gap-x-2.5 md:gap-x-3 px-3 md:px-4 py-4 border-b border-white/[0.04] bg-[#0c0c0c]">
                  {Array.from({ length: 5 }).map((__, j) => (
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
              <LockedRow index={7} />
              <LockedRow index={8} />
            </>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-white/25 bg-[#0c0c0c]">
              Market Watch data will be available when round projections are processed.
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
              <p className="text-[11px] text-white/35 leading-tight mt-0.5">Complete value analysis for all 600+ players · Updated before lockout</p>
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
