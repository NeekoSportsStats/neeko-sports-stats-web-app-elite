import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Lock, ArrowRight, Crown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface MarketWatchRow {
  player_id: string;
  player_name: string;
  team: string;
  position: string | null;
  projection_final: number | null;
  breakeven: number | null;
  value_gap: number | null;
  category: string | null;
  price: number | null;
}

function CategoryPill({ category }: { category: string | null }) {
  if (!category) return null;

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
      icon: TrendingUp,
    },
  };

  const style = styles[category] ?? styles["HOLD"];
  const Icon = style.icon;

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${style.bg} ${style.border}`}>
      <Icon size={10} className={style.text} />
      <span className={`text-[10px] font-bold uppercase tracking-wide ${style.text}`}>
        {category}
      </span>
    </div>
  );
}

function PlayerRow({ player, index }: { player: MarketWatchRow; index: number }) {
  const projection = player.projection_final != null ? Math.round(player.projection_final) : "—";
  const breakeven = player.breakeven != null ? Math.round(player.breakeven) : "—";
  const valueGap = player.value_gap != null ? (player.value_gap > 0 ? `+${Math.round(player.value_gap)}` : Math.round(player.value_gap).toString()) : "—";
  const valueGapNum = player.value_gap ?? 0;

  const explanation = (() => {
    if (player.category === "BUY" && valueGapNum > 0) {
      return `${valueGap} value gap with ${projection} projection — underpriced opportunity`;
    }
    if (player.category === "SELL" && valueGapNum < 0) {
      return `${valueGap} value gap — priced above current output`;
    }
    return `Projection: ${projection} · Breakeven: ${breakeven}`;
  })();

  return (
    <div className="group">
      <div className="grid grid-cols-[2.5rem_1fr_5rem_4.5rem_5rem] md:grid-cols-[2.5rem_1fr_6rem_5rem_6rem] gap-x-3 md:gap-x-4 px-4 py-3.5 border-b border-white/[0.04] bg-[#0c0c0c] hover:bg-[#111] transition-colors items-center">
        <span className="text-xs text-white/25 font-mono tabular-nums">{index}</span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate leading-tight">{player.player_name}</p>
          <p className="text-[10px] text-white/30 leading-tight">{player.team}{player.position ? ` · ${player.position}` : ""}</p>
        </div>
        <span className="text-sm font-bold text-[#F5C84C] text-center tabular-nums">
          {projection}
        </span>
        <span className="text-sm font-bold text-white/60 text-center tabular-nums">
          {breakeven}
        </span>
        <div className="flex justify-end">
          <CategoryPill category={player.category} />
        </div>
      </div>
      <div className="px-4 py-1.5 bg-[#0a0a0a] border-b border-white/[0.03]">
        <p className="text-[11px] text-white/25 leading-snug">{explanation}</p>
      </div>
    </div>
  );
}

function LockedRow({ index }: { index: number }) {
  return (
    <div className="grid grid-cols-[2.5rem_1fr_5rem_4.5rem_5rem] md:grid-cols-[2.5rem_1fr_6rem_5rem_6rem] gap-x-3 md:gap-x-4 px-4 py-3.5 border-b border-white/[0.04] bg-[#0c0c0c] items-center select-none">
      <span className="text-xs text-white/15 font-mono tabular-nums">{index}</span>
      <div className="flex items-center gap-2">
        <Lock size={11} className="text-white/20 shrink-0" />
        <span className="text-sm font-bold text-white/20 blur-[3px]">Premium Player</span>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#F5C84C]/10 border border-[#F5C84C]/20 text-[9px] font-bold text-[#F5C84C]/60 uppercase tracking-wide shrink-0">
          Neeko+
        </span>
      </div>
      <span className="text-xs text-white/15 text-center blur-[3px]">—</span>
      <span className="text-xs text-white/15 text-center blur-[3px]">—</span>
      <span className="text-xs text-white/15 text-right blur-[3px]">—</span>
    </div>
  );
}

export function LandingMarketWatchSample() {
  const [targets, setTargets] = useState<MarketWatchRow[]>([]);
  const [avoids, setAvoids] = useState<MarketWatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("v_mw_free")
        .select("player_id, player_name, team, position, projection_final, breakeven, value_gap, category, price")
        .order("value_gap", { ascending: false, nullsFirst: false });

      const rows = (data ?? []) as MarketWatchRow[];

      const targetRows = rows.filter(r => r.category === "BUY").slice(0, 3);
      const avoidRows = rows.filter(r => r.category === "SELL").slice(0, 3);

      setTargets(targetRows);
      setAvoids(avoidRows);
      setLoading(false);
    })();
  }, []);

  const allPlayers = [...targets, ...avoids];

  return (
    <section className="py-10 md:py-14 bg-[#070707] border-t border-white/[0.05]">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#F5C84C]/25 bg-[#F5C84C]/10 text-[#F5C84C] text-[10px] font-bold uppercase tracking-widest mb-3">
            Live Product Data
          </div>
          <h2 className="text-2xl md:text-4xl font-extrabold text-white leading-tight mb-3">
            This Week's Market Watch Signals
          </h2>
          <div className="flex justify-center my-3">
            <div className="w-10 h-0.5 rounded-full bg-[#F5C84C]/30" />
          </div>
          <p className="text-sm text-white/40 max-w-lg mx-auto leading-relaxed">
            Real player data from Market Watch — updated weekly to spot underpriced targets and overpriced traps.
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
          <div className="grid grid-cols-[2.5rem_1fr_5rem_4.5rem_5rem] md:grid-cols-[2.5rem_1fr_6rem_5rem_6rem] gap-x-3 md:gap-x-4 px-4 py-3 text-[10px] font-semibold text-white/25 uppercase tracking-widest border-b border-white/[0.06] bg-[#0a0a0a]">
            <span>#</span>
            <span>Player</span>
            <span className="text-center text-[#F5C84C]/60">Proj.</span>
            <span className="text-center">BE</span>
            <span className="text-right">Signal</span>
          </div>

          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse grid grid-cols-[2.5rem_1fr_5rem_4.5rem_5rem] md:grid-cols-[2.5rem_1fr_6rem_5rem_6rem] gap-x-3 md:gap-x-4 px-4 py-4 border-b border-white/[0.04] bg-[#0c0c0c]">
                {Array.from({ length: 5 }).map((__, j) => (
                  <div key={j} className="h-4 bg-white/[0.06] rounded" />
                ))}
              </div>
            ))
          ) : allPlayers.length > 0 ? (
            <>
              {allPlayers.map((player, idx) => (
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

        <div className="mt-5 rounded-xl border border-[#F5C84C]/20 bg-[#0d0d0d] px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ boxShadow: "0 0 24px rgba(245,200,76,0.04)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#F5C84C]/10 border border-[#F5C84C]/20 flex items-center justify-center shrink-0">
              <Lock size={14} className="text-[#F5C84C]" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">Find Every Value Pick — Not Just These</p>
              <p className="text-[11px] text-white/35 leading-tight mt-0.5">600+ players with full trade signals · Updated before lockout</p>
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
            View Full Market Watch Preview
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </section>
  );
}
