import { useState, useEffect, useCallback } from "react";
import { TrendingUp, TrendingDown, Lock, ArrowRight, Flame, ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { ProjectedMover, MovementLabel, MoverSignal } from "./types";
import { positionBadge } from "./helpers";

// ─── Label config ─────────────────────────────────────────────────────────────

const MOVEMENT_META: Record<MovementLabel, {
  label: string;
  colorCls: string;
  bgCls: string;
  borderCls: string;
  barCls: string;
}> = {
  BIG_RISE: {
    label: "Big Rise",
    colorCls: "text-emerald-300",
    bgCls:    "bg-emerald-400/[0.07]",
    borderCls:"border-emerald-400/25",
    barCls:   "bg-emerald-400",
  },
  RISE: {
    label: "Rise",
    colorCls: "text-green-400",
    bgCls:    "bg-green-400/[0.05]",
    borderCls:"border-green-400/20",
    barCls:   "bg-green-400",
  },
  FLAT: {
    label: "Flat",
    colorCls: "text-white/35",
    bgCls:    "bg-white/[0.02]",
    borderCls:"border-white/8",
    barCls:   "bg-white/20",
  },
  DROP: {
    label: "Drop",
    colorCls: "text-red-400",
    bgCls:    "bg-red-400/[0.05]",
    borderCls:"border-red-400/20",
    barCls:   "bg-red-400",
  },
  BIG_DROP: {
    label: "Big Drop",
    colorCls: "text-rose-300",
    bgCls:    "bg-rose-400/[0.07]",
    borderCls:"border-rose-400/25",
    barCls:   "bg-rose-400",
  },
};

const SIGNAL_META: Record<MoverSignal, { label: string; colorCls: string; icon: JSX.Element | null }> = {
  BUY_BEFORE_RISE: {
    label:    "Buy Before Rise",
    colorCls: "text-emerald-300 bg-emerald-400/10 border-emerald-400/25",
    icon:     <Flame className="h-3 w-3" />,
  },
  RISING: {
    label:    "Rising",
    colorCls: "text-green-400 bg-green-400/8 border-green-400/20",
    icon:     <TrendingUp className="h-3 w-3" />,
  },
  TRAP: {
    label:    "Trap",
    colorCls: "text-orange-300 bg-orange-400/10 border-orange-400/25",
    icon:     <ShieldAlert className="h-3 w-3" />,
  },
  FALLING: {
    label:    "Falling",
    colorCls: "text-red-400 bg-red-400/8 border-red-400/20",
    icon:     <TrendingDown className="h-3 w-3" />,
  },
  FLAT: {
    label:    "Flat",
    colorCls: "text-white/30 bg-white/4 border-white/8",
    icon:     null,
  },
};

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  if (!n) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}m`;
  return `$${(abs / 1_000).toFixed(0)}k`;
}

function fmtChange(n: number): string {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? `${(abs / 1_000).toFixed(0)}k` : `${abs}`;
  return n > 0 ? `+$${s}` : `-$${s}`;
}

function fmtPct(n: number): string {
  return n > 0 ? `+${n.toFixed(1)}%` : `${n.toFixed(1)}%`;
}

// ─── Bar width (capped at 100%) ───────────────────────────────────────────────

function barWidth(change: number, max = 120000): number {
  return Math.min(100, (Math.abs(change) / max) * 100);
}

// ─── Locked placeholder card ─────────────────────────────────────────────────

function LockedCard({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div
      className="relative rounded-xl border border-white/8 bg-white/[0.02] p-4 overflow-hidden cursor-pointer select-none min-h-[148px]"
      onClick={onUnlock}
    >
      <div className="blur-[3px] pointer-events-none space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="h-2.5 w-28 rounded bg-white/10" />
          <div className="h-4 w-16 rounded-full bg-white/8" />
        </div>
        <div className="h-2 w-20 rounded bg-white/7" />
        <div className="flex items-center gap-2 mt-3">
          <div className="h-5 w-16 rounded bg-white/8" />
          <div className="h-3 w-3 rounded-full bg-white/6" />
          <div className="h-5 w-16 rounded bg-white/8" />
          <div className="ml-auto h-5 w-12 rounded bg-white/8" />
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/6 mt-1" />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <Lock className="h-4 w-4 text-white/40" />
        <span className="text-[11px] text-white/45 font-semibold tracking-wide">Neeko+ Only</span>
      </div>
    </div>
  );
}

// ─── Player card ──────────────────────────────────────────────────────────────

interface CardProps {
  player: ProjectedMover;
  rank: number;
  direction: "rise" | "fall";
}

function ProjectedMoverCard({ player, rank, direction }: CardProps) {
  const label    = player.movement_label as MovementLabel;
  const meta     = MOVEMENT_META[label] ?? MOVEMENT_META.FLAT;
  const sigMeta  = SIGNAL_META[player.signal] ?? SIGNAL_META.FLAT;
  const isRising = direction === "rise";
  const changeColor = isRising ? "text-emerald-400" : "text-red-400";
  const width = barWidth(player.projected_price_change);

  return (
    <div className={`rounded-xl border ${meta.borderCls} ${meta.bgCls} p-4 hover:brightness-110 transition-all duration-150`}>

      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] text-white/25 tabular-nums">#{rank}</span>
            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border ${positionBadge(player.player_position)}`}>
              {player.player_position}
            </span>
          </div>
          <p className="text-[13px] font-bold text-white leading-tight truncate">{player.player_name}</p>
          <p className="text-[11px] text-white/35 mt-0.5 truncate">{player.team}</p>
        </div>

        {/* Signal badge */}
        <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold border ${sigMeta.colorCls}`}>
          {sigMeta.icon}
          {sigMeta.label}
        </span>
      </div>

      {/* Price row: current → projected */}
      <div className="flex items-center gap-2 mt-3">
        <div className="flex-1 min-w-0">
          <p className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">Current</p>
          <p className="text-[13px] font-semibold text-white/75 tabular-nums">{fmtK(player.current_price)}</p>
        </div>

        <ArrowRight className="h-3.5 w-3.5 text-white/20 shrink-0" />

        <div className="flex-1 min-w-0">
          <p className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">Projected</p>
          <p className={`text-[13px] font-bold tabular-nums ${changeColor}`}>{fmtK(player.projected_price)}</p>
        </div>

        <div className="text-right shrink-0 pl-1 border-l border-white/[0.07]">
          <p className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">Change</p>
          <p className={`text-[13px] font-extrabold tabular-nums ${changeColor}`}>
            {fmtChange(player.projected_price_change)}
          </p>
          <p className={`text-[10px] tabular-nums ${changeColor} opacity-70`}>
            {fmtPct(Number(player.projected_price_pct))}
          </p>
        </div>
      </div>

      {/* Momentum bar */}
      <div className="mt-3 h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={`h-full rounded-full ${meta.barCls} transition-all duration-500`}
          style={{ width: `${width}%` }}
        />
      </div>

      {/* Footer: Proj vs Avg + value score */}
      <div className="flex items-center justify-between mt-2.5">
        <p className="text-[10px] text-white/35">
          Proj <span className="text-white/60 font-medium">{Number(player.projection).toFixed(0)}</span>
          <span className="mx-1 text-white/15">vs</span>
          Avg <span className="text-white/60 font-medium">{Number(player.recent_avg).toFixed(0)}</span>
        </p>
        {player.value_score != null && player.value_score > 0 && (
          <p className="text-[10px] text-white/35">
            VS <span className={`font-semibold ${Number(player.value_score) >= 60 ? "text-emerald-400/80" : "text-white/50"}`}>
              {Number(player.value_score).toFixed(0)}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Section summary bar ─────────────────────────────────────────────────────

function SummaryBar({ players, direction }: { players: ProjectedMover[]; direction: "rise" | "fall" }) {
  if (!players.length) return null;
  const bigMoves = players.filter(p =>
    direction === "rise" ? p.movement_label === "BIG_RISE" : p.movement_label === "BIG_DROP"
  ).length;
  const buyBeforeRise = players.filter(p => p.signal === "BUY_BEFORE_RISE").length;
  const traps         = players.filter(p => p.signal === "TRAP").length;

  if (direction === "rise") {
    return (
      <div className="flex items-center gap-3 flex-wrap text-[11px]">
        {bigMoves > 0 && (
          <span className="text-emerald-400/70">
            <span className="font-bold text-emerald-400">{bigMoves}</span> big risers
          </span>
        )}
        {buyBeforeRise > 0 && (
          <span className="text-emerald-300/70 flex items-center gap-1">
            <Flame className="h-3 w-3" />
            <span className="font-bold text-emerald-300">{buyBeforeRise}</span> buy-before-rise
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px]">
      {bigMoves > 0 && (
        <span className="text-rose-400/70">
          <span className="font-bold text-rose-400">{bigMoves}</span> big fallers
        </span>
      )}
      {traps > 0 && (
        <span className="text-orange-300/70 flex items-center gap-1">
          <ShieldAlert className="h-3 w-3" />
          <span className="font-bold text-orange-300">{traps}</span> traps detected
        </span>
      )}
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

interface Props {
  isPremium: boolean;
  onShowUpgrade: () => void;
}

const FREE_VISIBLE = 3;
const FETCH_LIMIT  = 15;

export function ProjectedMoversSection({ isPremium, onShowUpgrade }: Props) {
  const [risers,    setRisers]    = useState<ProjectedMover[]>([]);
  const [fallers,   setFallers]   = useState<ProjectedMover[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<"rise" | "fall">("rise");

  const fetchMovers = useCallback(async () => {
    setLoading(true);
    try {
      const [r, f] = await Promise.all([
        supabase.rpc("get_projected_price_movers", { p_limit: FETCH_LIMIT, p_direction: "rise" }),
        supabase.rpc("get_projected_price_movers", { p_limit: FETCH_LIMIT, p_direction: "fall" }),
      ]);
      if (r.data) setRisers(r.data as ProjectedMover[]);
      if (f.data) setFallers(f.data as ProjectedMover[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMovers(); }, [fetchMovers]);

  const players      = activeTab === "rise" ? risers : fallers;
  const visibleCount = isPremium ? players.length : FREE_VISIBLE;
  const lockedCount  = !isPremium ? Math.max(0, players.length - FREE_VISIBLE) : 0;

  return (
    <div className="space-y-4">

      {/* Section header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[13px] font-bold text-white flex items-center gap-2">
            {activeTab === "rise"
              ? <TrendingUp  className="h-4 w-4 text-emerald-400" />
              : <TrendingDown className="h-4 w-4 text-red-400" />}
            Projected Price Movement
          </h3>
          <p className="text-[11px] text-white/35 mt-0.5">
            Next-round estimates · requires 2+ games · model: (proj − avg) × 3,500
          </p>
        </div>
        {!isPremium && (
          <button
            onClick={onShowUpgrade}
            className="shrink-0 text-[11px] font-semibold text-[#F5C84C]/80 border border-[#F5C84C]/20 bg-[#F5C84C]/[0.05] rounded-full px-3 py-1 hover:bg-[#F5C84C]/10 transition-colors"
          >
            Unlock all {FETCH_LIMIT}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-white/[0.07]">
        {(["rise", "fall"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === tab
                ? tab === "rise"
                  ? "border-emerald-400 text-emerald-400"
                  : "border-red-400 text-red-400"
                : "border-transparent text-white/30 hover:text-white/55"
            }`}
          >
            {tab === "rise"
              ? <TrendingUp  className="h-3.5 w-3.5" />
              : <TrendingDown className="h-3.5 w-3.5" />}
            {tab === "rise" ? "Projected Risers" : "Projected Fallers"}
            {!loading && players.length > 0 && (
              <span className="ml-0.5 text-[10px] text-white/25">
                ({tab === "rise" ? risers.length : fallers.length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Summary bar */}
      {!loading && players.length > 0 && (
        <SummaryBar players={players} direction={activeTab} />
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/8 bg-white/[0.02] p-4 animate-pulse space-y-2.5">
              <div className="flex justify-between">
                <div className="h-3 w-28 rounded bg-white/10" />
                <div className="h-5 w-20 rounded-full bg-white/8" />
              </div>
              <div className="h-2.5 w-20 rounded bg-white/7" />
              <div className="flex gap-2 mt-3">
                <div className="h-5 w-16 rounded bg-white/8" />
                <div className="h-4 w-4 rounded bg-white/5" />
                <div className="h-5 w-16 rounded bg-white/8" />
                <div className="ml-auto h-5 w-14 rounded bg-white/8" />
              </div>
              <div className="h-1 w-full rounded-full bg-white/6" />
            </div>
          ))}
        </div>
      ) : players.length === 0 ? (
        <div className="rounded-xl border border-white/8 bg-white/[0.02] px-6 py-10 text-center">
          <p className="text-sm text-white/40">No projected {activeTab === "rise" ? "risers" : "fallers"} available.</p>
          <p className="text-xs text-white/25 mt-1.5">Price projections require at least 2 games played this season.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {players.slice(0, visibleCount).map((p, i) => (
            <ProjectedMoverCard
              key={p.player_id}
              player={p}
              rank={i + 1}
              direction={activeTab}
            />
          ))}
          {Array.from({ length: lockedCount }).map((_, i) => (
            <LockedCard key={`locked-${i}`} onUnlock={onShowUpgrade} />
          ))}
        </div>
      )}

      {/* Footnote */}
      {!loading && players.length > 0 && (
        <p className="text-[10px] text-white/20 text-center">
          Projected change = (projection − 3-game avg) × 3,500 · capped ±$120k · premium feature
        </p>
      )}
    </div>
  );
}
