import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus, Lock, ArrowRight, Crown, CircleAlert as AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface MarketWatchRow {
  player_id: number;
  player_name: string;
  team: string;
  position: string | null;
  price: number | null;
  projection_final: number | null;
  edge_score: number | null;
  summary_short: string | null;
  is_bye: boolean | null;
  status: string | null;
  manual_status: string | null;
}

type SignalTier = "target" | "watch" | "avoid";

function getSignalTier(edgeScore: number | null): SignalTier {
  const s = edgeScore ?? 0;
  if (s > 5) return "target";
  if (s < -5) return "avoid";
  return "watch";
}

function formatPrice(price: number | null): string {
  if (!price) return "—";
  return `$${(price / 1000000).toFixed(2)}M`;
}

function shuffle<T>(array: T[]): T[] {
  return [...array].sort(() => Math.random() - 0.5);
}

function pickRandom<T>(arr: T[]): T | null {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
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

function SignalPill({ tier }: { tier: SignalTier }) {
  const config = {
    target: { label: "TARGET", bg: "bg-green-500/15",  text: "text-green-400",  border: "border-green-500/30",  icon: TrendingUp },
    watch:  { label: "WATCH",  bg: "bg-yellow-400/10", text: "text-yellow-300", border: "border-yellow-400/20", icon: Minus },
    avoid:  { label: "AVOID",  bg: "bg-red-500/15",    text: "text-red-400",    border: "border-red-500/30",    icon: TrendingDown },
  };
  const { label, bg, text, border, icon: Icon } = config[tier];
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${bg} ${border}`}>
      <Icon size={10} className={text} />
      <span className={`text-[10px] font-bold uppercase tracking-wide ${text}`}>{label}</span>
    </div>
  );
}

function PlayerRow({ player, index }: { player: MarketWatchRow; index: number }) {
  const valueGap = player.edge_score != null ? Math.round(player.edge_score) : null;
  const tier = getSignalTier(player.edge_score);
  const isInjured = player.status === "injured" || player.manual_status === "injured";
  const isBye = player.is_bye === true || player.status === "bye" || player.manual_status === "bye";
  const whyText = player.summary_short ?? null;

  return (
    <div className="group">
      <div className="grid grid-cols-[2rem_1fr_4.5rem_4.5rem_5rem] md:grid-cols-[2.5rem_1fr_5rem_5rem_6rem] gap-x-2.5 md:gap-x-3 px-3 md:px-4 py-3 border-b border-white/[0.04] bg-[#0c0c0c] hover:bg-[#111] transition-colors items-center">
        <span className="text-xs text-white/25 font-mono tabular-nums">{index}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold text-white truncate leading-tight">{player.player_name}</p>
            <InjuryPill isInjured={isInjured} />
            <StatusPill isBye={isBye} />
          </div>
          <p className="text-[10px] text-white/30 leading-tight truncate">{player.team}{player.position ? ` · ${player.position}` : ""}</p>
        </div>
        <span className="text-xs md:text-sm font-semibold text-white/60 text-center tabular-nums">
          {formatPrice(player.price)}
        </span>
        <span className={`text-sm font-bold text-center tabular-nums ${valueGap == null ? "text-white/30" : valueGap > 0 ? "text-green-400" : "text-red-400"}`}>
          {valueGap == null ? "—" : valueGap > 0 ? `+${valueGap}` : `${valueGap}`}
        </span>
        <div className="flex justify-end">
          <SignalPill tier={tier} />
        </div>
      </div>
      {whyText && (
        <div className="px-3 md:px-4 py-1.5 bg-[#0a0a0a] border-b border-white/[0.03]">
          <p className="text-[11px] text-white/35 leading-snug italic">{whyText}</p>
        </div>
      )}
    </div>
  );
}

function LockedRow({ index }: { index: number }) {
  return (
    <div className="grid grid-cols-[2rem_1fr_4.5rem_4.5rem_5rem] md:grid-cols-[2.5rem_1fr_5rem_5rem_6rem] gap-x-2.5 md:gap-x-3 px-3 md:px-4 py-3.5 border-b border-white/[0.04] bg-[#0c0c0c] items-center select-none">
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
        const [rankResult, poolResult] = await Promise.all([
          supabase
            .from("player_rankings_cache")
            .select("player_id")
            .gte("games_played", 3)
            .gt("projection_final", 50)
            .order("projection_final", { ascending: false })
            .limit(5),
          supabase
            .from("player_rankings_cache")
            .select("player_id, player_name, team, position, price, projection_final, edge_score, summary_short, is_bye, status, manual_status")
            .gte("games_played", 3)
            .gt("projection_final", 50)
            .order("projection_final", { ascending: false })
            .limit(50),
        ]);

        const rankingIds = new Set((rankResult.data ?? []).map((r: { player_id: number }) => r.player_id));

        const pool = shuffle(
          ((poolResult.data ?? []) as MarketWatchRow[]).filter(
            r => r.player_name && !rankingIds.has(r.player_id),
          ),
        );

        const targets = pool.filter(p => (p.edge_score ?? 0) > 5);
        const watches = pool.filter(p => (p.edge_score ?? 0) >= -5 && (p.edge_score ?? 0) <= 5);
        const avoids  = pool.filter(p => (p.edge_score ?? 0) < -5);

        const picks: MarketWatchRow[] = [
          pickRandom(targets),
          pickRandom(watches),
          pickRandom(avoids),
        ].filter((p): p is MarketWatchRow => p !== null);

        const pickedIds = new Set(picks.map(p => p.player_id));
        const remaining = pool.filter(p => !pickedIds.has(p.player_id));
        let i = 0;
        while (picks.length < 6 && i < remaining.length) {
          picks.push(remaining[i]);
          i++;
        }

        setPlayers(picks.slice(0, 6));
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
          <div className="grid grid-cols-[2rem_1fr_4.5rem_4.5rem_5rem] md:grid-cols-[2.5rem_1fr_5rem_5rem_6rem] gap-x-2.5 md:gap-x-3 px-3 md:px-4 py-3 text-[10px] font-semibold text-white/25 uppercase tracking-widest border-b border-white/[0.06] bg-[#0a0a0a]">
            <span>#</span>
            <span>Player</span>
            <span className="text-center">Price</span>
            <span className="text-center">Value Gap</span>
            <span className="text-right">Signal</span>
          </div>

          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="grid grid-cols-[2rem_1fr_4.5rem_4.5rem_5rem] md:grid-cols-[2.5rem_1fr_5rem_5rem_6rem] gap-x-2.5 md:gap-x-3 px-3 md:px-4 py-4 border-b border-white/[0.04] bg-[#0c0c0c]">
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
              <LockedRow index={players.length + 1} />
              <LockedRow index={players.length + 2} />
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
