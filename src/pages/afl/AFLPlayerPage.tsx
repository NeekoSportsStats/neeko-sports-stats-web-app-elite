import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Zap, Lock, Users, ChartBar as BarChart2, CircleAlert as AlertCircle, ChevronDown, ChevronUp, Activity, Target, ChartBar as BarChart3, FlameKindling as Flame, Shield } from 'lucide-react';
import {
  slugToPlayerName, playerToSlug,
  POSITION_SLUGS, POSITION_NAMES, TEAM_SLUG_TO_NAME,
} from '@/lib/slugs';
import { getPlayerDetailSafe, getSimilarPlayersSafe } from '@/lib/playerAccess';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import { useAccessState } from '@/hooks/useAccessState';
import { PlayerStatusPill } from '@/features/afl/rankings/components/PlayerStatusPill';
import {
  getFormStyles, fmtPrice as fmtPriceHelper, fmtEdge, getEdgeColor,
} from '@/features/afl/rankings/components/helpers';
import { getTeamAccentColour } from '@/config/aflTeamColours';

const ScoreHistoryChart = lazy(() => import('@/features/afl/rankings/components/ScoreHistoryChart'));

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerData {
  player_id: number;
  player_name: string;
  team: string | null;
  player_position: string | null;
  price: number | null;
  projection: number | null;
  breakeven: number | null;
  edge_canonical: number | null;
  action_canonical: string | null;
  action_display: string | null;
  confidence_label: string | null;
  value_band: string | null;
  decision_score: number | null;
  action_reason_1: string | null;
  action_reason_2: string | null;
  status: string | null;
  manual_status: string | null;
  is_bye: boolean | null;
  bye_next_round: boolean | null;
  bye_round: number | null;
  games_played: number | null;
  avg_last_3: number | null;
  avg_last_5: number | null;
  season_avg: number | null;
  why: string | null;
  why_long: string | null;
  neeko_rating: number | null;
  is_locked: boolean | null;
  floor_estimate: number | null;
  ceiling_estimate: number | null;
}

interface SimilarPlayer {
  player_id: number;
  player_name: string;
  team: string | null;
  position: string | null;
  price: number | null;
  season_avg: number | null;
  projection: number | null;
  value_score: number | null;
  signal: string | null;
  signal_display: string | null;
  neeko_rating: number | null;
  is_injured: boolean | null;
  is_locked: boolean | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPositionSlug(pos: string | null | undefined): string | null {
  if (!pos) return null;
  return POSITION_SLUGS[pos] ?? null;
}

function getPositionName(pos: string | null | undefined): string {
  if (!pos) return 'Player';
  return POSITION_NAMES[pos] ?? pos;
}

function deriveFormLabel(avg3: number | null, seasonAvg: number | null): string {
  if (avg3 == null || seasonAvg == null || seasonAvg === 0) return 'Neutral';
  const d = avg3 - seasonAvg;
  if (d >= 12) return 'HOT';
  if (d >= 4)  return 'Rising';
  if (d > -4)  return 'Neutral';
  if (d > -12) return 'Dropping';
  return 'Cold';
}

function getActionMeta(action: string | null) {
  const a = (action ?? 'HOLD').toUpperCase();
  const isStart = a === 'SMASH_START' || a === 'START';
  const isSit   = a === 'HARD_SIT'   || a === 'SIT';
  return {
    color:   isStart ? '#10b981' : isSit ? '#f59e0b' : '#64748b',
    label:   isStart ? 'START'   : isSit ? 'SIT'    : 'HOLD',
    isStart,
    isSit,
  };
}

function fmtAvg(v: number | null): string {
  return v != null ? Math.round(v).toString() : '—';
}

// ─── Score Stats ──────────────────────────────────────────────────────────────

interface ScoreStats {
  scores:       number[];   // raw scores used for all calcs
  high:         number;
  low:          number;
  range:        number;
  rate80plus:   number;     // % of games >= 80
  rate100plus:  number;     // % of games >= 100
  rateBelow60:  number;     // % of games < 60
  consistency:  number;     // % of games within ±15 of season avg
  volatility:   'Low' | 'Medium' | 'High';
  stdDev:       number;
}

function computeScoreStats(scores: number[]): ScoreStats {
  const n    = scores.length;
  const high = Math.max(...scores);
  const low  = Math.min(...scores);
  const mean = scores.reduce((a, b) => a + b, 0) / n;
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev   = Math.sqrt(variance);

  const rate  = (pred: (v: number) => boolean) => Math.round((scores.filter(pred).length / n) * 100);
  const consistency = rate(v => Math.abs(v - mean) <= 15);

  const volatility: ScoreStats['volatility'] =
    stdDev < 18  ? 'Low' :
    stdDev < 30  ? 'Medium' :
                   'High';

  return {
    scores,
    high,
    low,
    range:       high - low,
    rate80plus:  rate(v => v >= 80),
    rate100plus: rate(v => v >= 100),
    rateBelow60: rate(v => v < 60),
    consistency,
    volatility,
    stdDev,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-white/25">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.38em] text-white/30">{title}</span>
    </div>
  );
}

function LockedChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-500/20 bg-amber-500/[0.06] text-[9px] font-bold uppercase tracking-wider text-amber-400/50 select-none">
      <Lock size={8} className="text-amber-400/40" />
      {label}
    </span>
  );
}

/** Stat summary tile used in the scoring profile */
function StatTile({ label, value, sub, coloured }: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  coloured?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/[0.07] bg-[#0c0c0c] px-3.5 py-3">
      <span className="text-[9px] uppercase tracking-widest text-white/25 font-semibold">{label}</span>
      <span className={`text-[22px] font-black tabular-nums leading-none ${coloured ? '' : 'text-white/80'}`}>
        {value}
      </span>
      {sub && <span className="text-[9px] text-white/25 leading-tight">{sub}</span>}
    </div>
  );
}

/** Form trend mini-bar — fills left to right based on last3 vs season avg */
function FormBar({ avg3, avg5, seasonAvg }: { avg3: number | null; avg5: number | null; seasonAvg: number | null }) {
  if (seasonAvg == null || (avg3 == null && avg5 == null)) return null;
  const ref = seasonAvg;
  const vals = [avg5, avg3].filter((v): v is number => v != null);
  const min = Math.min(ref * 0.7, ...vals);
  const max = Math.max(ref * 1.3, ...vals);
  const pct = (v: number) => Math.max(4, Math.min(96, ((v - min) / (max - min)) * 100));

  return (
    <div className="relative h-7 bg-white/[0.04] rounded-lg overflow-hidden">
      {/* Season avg reference line */}
      <div
        className="absolute top-0 bottom-0 w-px bg-white/20"
        style={{ left: `${pct(ref)}%` }}
      />
      {/* Avg5 bar */}
      {avg5 != null && (
        <div
          className="absolute top-1.5 bottom-1.5 rounded-sm bg-white/15"
          style={{ left: `${Math.min(pct(avg5), pct(ref))}%`, right: `${100 - Math.max(pct(avg5), pct(ref))}%` }}
        />
      )}
      {/* Avg3 marker */}
      {avg3 != null && (
        <div
          className={`absolute top-1 bottom-1 w-1.5 rounded-sm ${avg3 >= ref ? 'bg-emerald-400' : 'bg-red-400/80'}`}
          style={{ left: `calc(${pct(avg3)}% - 3px)` }}
        />
      )}
      <div className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none">
        <span className="text-[8px] text-white/20">Low</span>
        <span className="text-[8px] text-white/20">High</span>
      </div>
    </div>
  );
}

/** Compact scoring comparison bar — position this player vs league average context */
function PositionComparisonBar({ value, label, posLabel }: {
  value: number | null;
  label: string;
  posLabel: string;
}) {
  if (value == null) return null;
  // Rough league calibration: mid = 80 for typical FWD/MID, 60 for DEF/RUC
  const midPts = posLabel.includes('Def') ? 65 : posLabel.includes('Ruc') ? 70 : 82;
  const rangeLo = midPts * 0.5;
  const rangeHi = midPts * 1.8;
  const pct = Math.max(4, Math.min(96, ((value - rangeLo) / (rangeHi - rangeLo)) * 100));
  const refPct = Math.max(4, Math.min(96, ((midPts - rangeLo) / (rangeHi - rangeLo)) * 100));
  const aboveAvg = value >= midPts;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/35">{label}</span>
        <span className={`text-[11px] font-bold tabular-nums ${aboveAvg ? 'text-emerald-400' : 'text-red-400/80'}`}>
          {Math.round(value)}
          <span className="text-white/25 font-normal text-[9px] ml-1">
            {aboveAvg ? '+' : ''}{Math.round(value - midPts)} vs pos avg
          </span>
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={`absolute top-0 bottom-0 rounded-full ${aboveAvg ? 'bg-emerald-500/60' : 'bg-red-500/50'}`}
          style={aboveAvg
            ? { left: `${refPct}%`, right: `${100 - pct}%` }
            : { left: `${pct}%`, right: `${100 - refPct}%` }
          }
        />
        <div className="absolute top-0 bottom-0 w-px bg-white/30" style={{ left: `${refPct}%` }} />
        <div
          className="absolute top-0 bottom-0 w-1.5 rounded-full bg-white/80"
          style={{ left: `calc(${pct}% - 3px)` }}
        />
      </div>
    </div>
  );
}

// ─── Position Comparison types & component ────────────────────────────────────

interface PosCompRow {
  metric:          string;
  player_value:    number;
  position_count:  number;
  percentile:      number;
  position_label:  string;
}

const METRIC_LABELS: Record<string, string> = {
  season_avg: 'Season Average',
  last3_avg:  'Last 3 Average',
  last5_avg:  'Last 5 Average',
  price:      'Price',
  consistency:'Consistency',
};

function PercentileBar({
  label,
  playerValue,
  percentile,
  positionLabel,
  positionCount,
  formatValue,
}: {
  label:          string;
  playerValue:    number;
  percentile:     number;
  positionLabel:  string;
  positionCount:  number;
  formatValue:    (v: number) => string;
}) {
  const isStrong  = percentile >= 70;
  const isMid     = percentile >= 40;
  const barColor  = isStrong ? '#10b981' : isMid ? '#60a5fa' : '#f87171';
  const qualifier = percentile >= 85 ? 'Elite' : percentile >= 70 ? 'Above average' :
                    percentile >= 45 ? 'Average' : percentile >= 25 ? 'Below average' : 'Low';

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[10px] text-white/40">{label}</span>
        </div>
        <div className="text-right shrink-0">
          <span className="text-[11px] font-bold tabular-nums" style={{ color: barColor }}>
            Top {100 - percentile}%
          </span>
          <span className="ml-1.5 text-[9px] text-white/28">
            {qualifier} among {positionLabel.toLowerCase()}
          </span>
        </div>
      </div>
      <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{ width: `${percentile}%`, background: barColor, opacity: 0.7 }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-white/30 rounded-full"
          style={{ left: '50%' }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-white/20 tabular-nums">{formatValue(playerValue)}</span>
        <span className="text-[9px] text-white/15">{positionCount} {positionLabel.toLowerCase()} with data</span>
      </div>
    </div>
  );
}

function PositionComparisonSection({
  rows,
  isPremium,
}: {
  rows:       PosCompRow[];
  isPremium:  boolean;
}) {
  if (rows.length === 0) return null;

  const positionLabel = rows[0]?.position_label ?? 'Players';

  // Metrics visible to free users
  const FREE_METRICS  = ['season_avg', 'price'];
  const freeRows      = rows.filter(r => FREE_METRICS.includes(r.metric) && r.percentile != null);
  const premiumRows   = rows.filter(r => !FREE_METRICS.includes(r.metric) && r.percentile != null);

  if (freeRows.length === 0 && premiumRows.length === 0) return null;

  function fmtVal(metric: string, val: number): string {
    if (metric === 'price') return `$${(val / 1000).toFixed(0)}k`;
    if (metric === 'consistency') return `${Math.round(val)}%`;
    return `${Math.round(val)} pts`;
  }

  const visibleFree    = freeRows;
  const visiblePremium = isPremium ? premiumRows : [];
  const lockedCount    = isPremium ? 0 : premiumRows.length;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0c0c0c] px-4 py-4 space-y-4">
      {/* Free rows */}
      {visibleFree.map(r => (
        <PercentileBar
          key={r.metric}
          label={METRIC_LABELS[r.metric] ?? r.metric}
          playerValue={r.player_value}
          percentile={r.percentile}
          positionLabel={positionLabel}
          positionCount={r.position_count}
          formatValue={v => fmtVal(r.metric, v)}
        />
      ))}

      {/* Premium rows */}
      {visiblePremium.map(r => (
        <PercentileBar
          key={r.metric}
          label={METRIC_LABELS[r.metric] ?? r.metric}
          playerValue={r.player_value}
          percentile={r.percentile}
          positionLabel={positionLabel}
          positionCount={r.position_count}
          formatValue={v => fmtVal(r.metric, v)}
        />
      ))}

      {/* Locked gate for free users */}
      {!isPremium && lockedCount > 0 && (
        <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-3.5 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wider">
              {lockedCount} more comparison{lockedCount > 1 ? 's' : ''} on Neeko+
            </p>
            <p className="text-[9px] text-white/25 mt-0.5">
              Last 3, Last 5, Consistency vs {positionLabel.toLowerCase()}
            </p>
          </div>
          <Link
            to="/upgrade"
            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] text-[9px] font-bold uppercase tracking-wider text-amber-400/80 hover:text-amber-400 hover:bg-amber-500/[0.14] transition-colors"
          >
            <Lock size={8} />
            Upgrade
          </Link>
        </div>
      )}

      <p className="text-[9px] text-white/18 pt-0.5">
        Percentiles calculated from active {positionLabel.toLowerCase()} with 3+ games in 2026.
      </p>
    </div>
  );
}

/** Similar player row — free/premium split */
function SimilarPlayerRow({ player, isPremium }: { player: SimilarPlayer; isPremium: boolean }) {
  const slug   = playerToSlug(player.player_name, player.team ?? undefined);
  const signal = (player.signal ?? '').toUpperCase();
  const isStart = signal === 'ELITE' || signal === 'RISING';
  const isSit   = signal === 'CAUTION' || signal === 'AVOID';
  const signalColor = isStart ? '#10b981' : isSit ? '#f87171' : '#64748b';
  const signalLabel = player.signal_display ?? player.signal ?? null;

  return (
    <Link
      to={`/sports/afl/players/${slug}`}
      className="flex items-center gap-3 rounded-xl bg-[#0c0c0c] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.025] transition-all px-3 py-2.5 group"
    >
      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-white/75 group-hover:text-white transition-colors truncate">
          {player.player_name}
        </p>
        <p className="text-[10px] text-white/28 mt-0.5 truncate">
          {player.team ?? '—'}
          {player.price != null && <span className="tabular-nums"> · {fmtPriceHelper(player.price)}</span>}
        </p>
      </div>

      {/* Right column: differs by tier */}
      <div className="flex items-center gap-2 shrink-0">
        {isPremium ? (
          /* Premium: projection + signal badge */
          <>
            {player.projection != null && (
              <span className="text-[12px] font-bold tabular-nums text-white/65">
                {Math.round(player.projection)}
              </span>
            )}
            {signalLabel && (
              <span
                className="text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider"
                style={{
                  color: signalColor,
                  borderColor: `${signalColor}35`,
                  background: `${signalColor}10`,
                }}
              >
                {signalLabel}
              </span>
            )}
          </>
        ) : (
          /* Free: season avg only */
          player.season_avg != null && (
            <span className="text-[12px] font-bold tabular-nums text-white/45">
              {Math.round(player.season_avg)}
              <span className="text-[9px] font-normal text-white/22 ml-0.5">avg</span>
            </span>
          )
        )}
        <ChevronRight size={10} className="text-white/15 group-hover:text-white/35 transition-colors" />
      </div>
    </Link>
  );
}


/** Compact Fantasy Decision module */
function FantasyDecision({
  player,
  isPremium,
  actionMeta,
  formLabel,
  bevsProj,
  showFullAI,
  onToggleAI,
}: {
  player: PlayerData;
  isPremium: boolean;
  actionMeta: ReturnType<typeof getActionMeta>;
  formLabel: string;
  bevsProj: number | null;
  showFullAI: boolean;
  onToggleAI: () => void;
}) {
  if (!isPremium) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-[#0c0c0c] px-4 py-3.5 flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg border border-amber-500/20 bg-amber-500/[0.07] shrink-0">
          <Lock size={12} className="text-amber-400/70" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-white/55 leading-snug">
            Unlock projection, breakeven, edge and AI reasoning with Neeko+.
          </p>
        </div>
        <Link
          to="/upgrade"
          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-2.5 py-1.5 text-[9px] font-black text-black uppercase tracking-wide whitespace-nowrap"
        >
          <Zap size={9} />
          Unlock
        </Link>
      </div>
    );
  }

  const confCls =
    player.confidence_label?.toUpperCase() === 'HIGH'
      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
      : player.confidence_label?.toUpperCase() === 'MEDIUM'
      ? 'text-yellow-400 border-yellow-500/25 bg-yellow-500/[0.08]'
      : 'text-white/35 border-white/10 bg-white/[0.04]';

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: `${actionMeta.color}22`, background: `linear-gradient(160deg, ${actionMeta.color}05 0%, #0b0b0b 60%)` }}
    >
      <div className="h-[1.5px]" style={{ background: `linear-gradient(90deg, ${actionMeta.color}50, transparent 65%)` }} />
      <div className="px-4 pt-3.5 pb-3 space-y-3">

        {/* Action row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center w-7 h-7 rounded-lg border shrink-0"
              style={{ background: `${actionMeta.color}0d`, borderColor: `${actionMeta.color}30` }}
            >
              {actionMeta.isStart
                ? <TrendingUp size={12} style={{ color: actionMeta.color }} />
                : actionMeta.isSit
                ? <TrendingDown size={12} style={{ color: actionMeta.color }} />
                : <Minus size={12} className="text-white/30" />}
            </div>
            <p className="text-[15px] font-black uppercase leading-none" style={{ color: actionMeta.color }}>
              {player.action_display ?? actionMeta.label}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {player.confidence_label && (
              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${confCls}`}>
                {player.confidence_label}
              </span>
            )}
            {player.value_band && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider text-emerald-300 border-emerald-500/22 bg-emerald-500/[0.06]">
                {player.value_band}
              </span>
            )}
          </div>
        </div>

        {/* Metrics row: 4 compact cells */}
        <div className="grid grid-cols-4 gap-1">
          {([
            { label: 'Proj',    value: player.projection,     color: 'text-white' },
            { label: 'BE',      value: player.breakeven,
              color: player.breakeven != null && player.avg_last_3 != null
                ? player.avg_last_3 >= player.breakeven ? 'text-emerald-400' : 'text-red-400'
                : 'text-white/55' },
            { label: 'Floor',   value: player.floor_estimate,   color: 'text-red-400/70' },
            { label: 'Ceil',    value: player.ceiling_estimate, color: 'text-emerald-400' },
          ] as { label: string; value: number | null; color: string }[]).map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border border-white/[0.07] bg-black/25 px-2 py-2 flex flex-col gap-0.5">
              <p className="text-[7px] uppercase tracking-widest text-white/22">{label}</p>
              <p className={`text-[15px] font-black tabular-nums leading-none ${color}`}>
                {value != null ? Math.round(value) : '—'}
              </p>
            </div>
          ))}
        </div>

        {/* Signal strip */}
        <div className="rounded-lg border border-white/[0.05] bg-black/15 divide-y divide-white/[0.04]">
          {bevsProj != null && (
            <div className="flex items-center justify-between px-2.5 py-1.5">
              <span className="text-[10px] text-white/32">Proj vs BE</span>
              <span className={`text-[10px] font-bold tabular-nums ${bevsProj >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {bevsProj >= 0 ? '+' : ''}{bevsProj} pts
              </span>
            </div>
          )}
          {player.edge_canonical != null && (
            <div className="flex items-center justify-between px-2.5 py-1.5">
              <span className="text-[10px] text-white/32">Edge</span>
              <span className={`text-[10px] font-bold tabular-nums ${getEdgeColor(player.edge_canonical)}`}>
                {fmtEdge(player.edge_canonical)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <span className="text-[10px] text-white/32">Form</span>
            <span className={`text-[7.5px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${getFormStyles(formLabel)}`}>
              {formLabel}
            </span>
          </div>
        </div>

        {/* AI summary — short only, with optional expand */}
        {(player.why || player.action_reason_1) && (
          <div className="space-y-1.5">
            <p className="text-[7.5px] uppercase tracking-widest text-white/20 font-bold">AI Summary</p>
            {player.why && (
              <p className="text-[11px] text-white/50 leading-relaxed">{player.why}</p>
            )}
            <div className="space-y-1">
              {player.action_reason_1 && (
                <div className="flex items-start gap-1.5">
                  <div className="w-1 h-1 rounded-full shrink-0 mt-1.5" style={{ background: `${actionMeta.color}70` }} />
                  <span className="text-[10px] text-white/38 leading-snug">{player.action_reason_1}</span>
                </div>
              )}
              {player.action_reason_2 && (
                <div className="flex items-start gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-white/16 shrink-0 mt-1.5" />
                  <span className="text-[10px] text-white/28 leading-snug">{player.action_reason_2}</span>
                </div>
              )}
            </div>
            {player.why_long && (
              <>
                <button
                  onClick={onToggleAI}
                  className="flex items-center gap-1 text-[9.5px] text-white/25 hover:text-white/50 transition-colors mt-0.5"
                >
                  {showFullAI ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                  {showFullAI ? 'Show less' : 'Full analysis'}
                </button>
                {showFullAI && (
                  <p className="text-[10.5px] text-white/35 leading-relaxed border-t border-white/[0.05] pt-2">
                    {player.why_long}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** SEO guide — player overview, 2026 outlook, internal links */
function PlayerSEOBlock({ player, teamSlug, posSlug }: {
  player: PlayerData;
  teamSlug: string | undefined;
  posSlug: string | null;
}) {
  const posName  = getPositionName(player.player_position);
  const posLabel = posName.replace(/s$/, '');
  const team     = player.team ?? 'their AFL club';
  const lastName = player.player_name.split(' ').slice(-1)[0];

  const formSentence = (() => {
    if (player.avg_last_3 == null || player.season_avg == null) return null;
    const d = player.avg_last_3 - player.season_avg;
    if (d >= 6)  return `${lastName} is currently scoring above their season average — positive recent form.`;
    if (d <= -6) return `${lastName} has dipped below their season average across the last 3 rounds.`;
    return `${lastName}'s recent form is consistent with their season average.`;
  })();

  return (
    <section className="border-t border-white/[0.05] pt-6 pb-2 space-y-5">
      <h2 className="text-[13px] font-bold text-white/32 leading-snug">
        {player.player_name} — AFL Fantasy 2026
      </h2>
      <div className="space-y-4 text-[12px] text-white/28 leading-relaxed">
        <div>
          <h3 className="text-[9px] font-bold text-white/26 uppercase tracking-widest mb-1.5">Overview</h3>
          <p>
            {player.player_name} is a {posLabel} for {team} in the 2026 AFL Fantasy season.
            {player.season_avg != null && ` Season average: ${Math.round(player.season_avg)} pts.`}
            {formSentence && ` ${formSentence}`}
          </p>
        </div>
        <div>
          <h3 className="text-[9px] font-bold text-white/26 uppercase tracking-widest mb-1.5">2026 Fantasy Outlook</h3>
          <p>
            {player.price != null && `Currently priced at ${fmtPriceHelper(player.price)}.`}
            {player.games_played != null && ` ${player.games_played} games played this season.`}
            {player.avg_last_3 != null && ` Last 3 average: ${Math.round(player.avg_last_3)} pts.`}
            {player.avg_last_5 != null && ` Last 5 average: ${Math.round(player.avg_last_5)} pts.`}
            {' '}Neeko models expected fantasy output using recent form, opponent concession rates, and venue factors.
          </p>
        </div>
        <div>
          <h3 className="text-[9px] font-bold text-white/26 uppercase tracking-widest mb-2">Explore</h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <Link to="/fantasy/rankings" className="text-white/28 hover:text-white/52 transition-colors underline underline-offset-2 decoration-white/14">AFL Fantasy Rankings</Link>
            {teamSlug && <Link to={`/sports/afl/teams/${teamSlug}`} className="text-white/28 hover:text-white/52 transition-colors underline underline-offset-2 decoration-white/14">{player.team} players</Link>}
            {posSlug && <Link to={`/sports/afl/positions/${posSlug}`} className="text-white/28 hover:text-white/52 transition-colors underline underline-offset-2 decoration-white/14">{posName} rankings</Link>}
            <Link to="/fantasy/market-watch" className="text-white/28 hover:text-white/52 transition-colors underline underline-offset-2 decoration-white/14">Market Watch</Link>
          </div>
        </div>
      </div>
      <p className="sr-only">
        {player.player_name} AFL Fantasy 2026 — {posLabel}, {team}.
        Price: {fmtPriceHelper(player.price)}.
        Season avg: {player.season_avg != null ? Math.round(player.season_avg) : 'TBC'}.
        Last 3: {player.avg_last_3 != null ? Math.round(player.avg_last_3) : 'TBC'}.
        Last 5: {player.avg_last_5 != null ? Math.round(player.avg_last_5) : 'TBC'}.
        {player.games_played != null ? ` ${player.games_played} games played.` : ''}
        Updated weekly by Neeko Sports.
      </p>
    </section>
  );
}

/** Rate bar: a horizontal fill gauge for percentage metrics */
function RateBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden mt-1.5">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all"
        style={{ width: `${value}%`, background: color }}
      />
    </div>
  );
}

/** Single stat card used inside the statistical profile */
function ProfileCard({
  label, value, sub, barValue, barColor, highlight,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  barValue?: number;
  barColor?: string;
  highlight?: 'positive' | 'negative' | 'neutral';
}) {
  const textCls =
    highlight === 'positive' ? 'text-emerald-400' :
    highlight === 'negative' ? 'text-red-400/85' :
    'text-white/75';

  return (
    <div className="flex flex-col rounded-xl border border-white/[0.07] bg-[#0c0c0c] px-3 py-2.5 gap-0.5">
      <span className="text-[8.5px] uppercase tracking-widest text-white/24 font-semibold leading-tight">{label}</span>
      <span className={`text-[19px] font-black tabular-nums leading-none ${textCls}`}>{value}</span>
      {sub && <span className="text-[9px] text-white/22 leading-tight">{sub}</span>}
      {barValue != null && barColor && <RateBar value={barValue} color={barColor} />}
    </div>
  );
}

/** Volatility pill */
function VolatilityBadge({ level }: { level: ScoreStats['volatility'] }) {
  const cfg = {
    Low:    { cls: 'text-emerald-400 border-emerald-500/28 bg-emerald-500/[0.07]', label: 'Low' },
    Medium: { cls: 'text-yellow-400 border-yellow-500/25 bg-yellow-500/[0.07]',   label: 'Medium' },
    High:   { cls: 'text-red-400 border-red-500/22 bg-red-500/[0.06]',            label: 'High' },
  }[level];
  return (
    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

/**
 * Statistical Profile section.
 * Free users: basic rate metrics (80+, 100+, sub-60, consistency).
 * Premium users: full profile including score range, std dev, volatility, and pct-change vs avg.
 */
function StatisticalProfile({
  stats,
  isPremium,
  player,
}: {
  stats: ScoreStats;
  isPremium: boolean;
  player: { season_avg: number | null; avg_last_3: number | null; avg_last_5: number | null };
}) {
  const n = stats.scores.length;
  const MIN_GAMES_RATES    = 3;   // need at least 3 games for rate metrics
  const MIN_GAMES_FULL     = 5;   // need at least 5 for premium profile completeness
  const enoughForRates     = n >= MIN_GAMES_RATES;
  const enoughForFull      = n >= MIN_GAMES_FULL;

  // Pct change vs season avg — only if we have both
  const pctChange3 = (player.avg_last_3 != null && player.season_avg != null && player.season_avg > 0)
    ? Math.round(((player.avg_last_3 - player.season_avg) / player.season_avg) * 100)
    : null;
  const pctChange5 = (player.avg_last_5 != null && player.season_avg != null && player.season_avg > 0)
    ? Math.round(((player.avg_last_5 - player.season_avg) / player.season_avg) * 100)
    : null;

  if (!enoughForRates) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-[#0c0c0c] px-4 py-4 text-center">
        <p className="text-[11px] text-white/30">Not enough games yet for statistical profile.</p>
        <p className="text-[10px] text-white/18 mt-0.5">{n} of {MIN_GAMES_RATES} minimum games played</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* Free tier: rate metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <ProfileCard
          label="80+ Score Rate"
          value={`${stats.rate80plus}%`}
          sub={`${stats.scores.filter(v => v >= 80).length} of ${n} games`}
          barValue={stats.rate80plus}
          barColor="rgba(52,211,153,0.7)"
          highlight={stats.rate80plus >= 50 ? 'positive' : stats.rate80plus >= 30 ? 'neutral' : 'negative'}
        />
        <ProfileCard
          label="100+ Score Rate"
          value={`${stats.rate100plus}%`}
          sub={`${stats.scores.filter(v => v >= 100).length} of ${n} games`}
          barValue={stats.rate100plus}
          barColor="rgba(52,211,153,0.6)"
          highlight={stats.rate100plus >= 35 ? 'positive' : stats.rate100plus >= 15 ? 'neutral' : 'negative'}
        />
        <ProfileCard
          label="Sub-60 Rate"
          value={`${stats.rateBelow60}%`}
          sub={`${stats.scores.filter(v => v < 60).length} of ${n} games`}
          barValue={stats.rateBelow60}
          barColor="rgba(248,113,113,0.65)"
          highlight={stats.rateBelow60 <= 15 ? 'positive' : stats.rateBelow60 <= 35 ? 'neutral' : 'negative'}
        />
        <ProfileCard
          label="Consistency"
          value={`${stats.consistency}%`}
          sub="within ±15 of avg"
          barValue={stats.consistency}
          barColor="rgba(250,204,21,0.65)"
          highlight={stats.consistency >= 65 ? 'positive' : stats.consistency >= 45 ? 'neutral' : 'negative'}
        />
      </div>

      {/* Premium tier: extended metrics */}
      {isPremium ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <ProfileCard
              label="High Score (L10)"
              value={Math.round(stats.high)}
              highlight="positive"
            />
            <ProfileCard
              label="Low Score (L10)"
              value={Math.round(stats.low)}
              highlight="negative"
            />
            <ProfileCard
              label="Score Range"
              value={stats.range}
              sub="high minus low"
            />
            <ProfileCard
              label="Std Deviation"
              value={stats.stdDev.toFixed(1)}
              sub={<span className="flex items-center gap-1 mt-0.5"><VolatilityBadge level={stats.volatility} /></span>}
            />
          </div>

          {/* Pct-change vs season avg — only if we have both */}
          {(pctChange3 != null || pctChange5 != null) && (
            <div className="rounded-xl border border-white/[0.06] bg-[#0c0c0c] px-4 py-3 space-y-2.5">
              <p className="text-[8.5px] uppercase tracking-widest text-white/22 font-semibold">Form vs Season Average</p>
              {pctChange3 != null && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-white/38">Last 3 avg vs season avg</span>
                  <span className={`text-[12px] font-bold tabular-nums ${pctChange3 >= 0 ? 'text-emerald-400' : 'text-red-400/85'}`}>
                    {pctChange3 >= 0 ? '+' : ''}{pctChange3}%
                  </span>
                </div>
              )}
              {pctChange5 != null && enoughForFull && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-white/38">Last 5 avg vs season avg</span>
                  <span className={`text-[12px] font-bold tabular-nums ${pctChange5 >= 0 ? 'text-emerald-400' : 'text-red-400/85'}`}>
                    {pctChange5 >= 0 ? '+' : ''}{pctChange5}%
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Volatility summary row */}
          <div className="rounded-xl border border-white/[0.06] bg-[#0c0c0c] px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Shield size={13} className="text-white/22 shrink-0" />
              <div>
                <p className="text-[10px] text-white/38 leading-tight">Volatility Rating</p>
                <p className="text-[9px] text-white/20 leading-tight">
                  {stats.volatility === 'Low'    && 'Consistent performer — predictable week to week.'}
                  {stats.volatility === 'Medium' && 'Some score variance — moderate unpredictability.'}
                  {stats.volatility === 'High'   && 'High variance — difficult to predict game-to-game.'}
                </p>
              </div>
            </div>
            <VolatilityBadge level={stats.volatility} />
          </div>
        </div>
      ) : (
        /* Free: soft upsell for premium extended profile */
        <div className="rounded-xl border border-white/[0.06] bg-[#0c0c0c] px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Lock size={11} className="text-amber-400/40 shrink-0" />
            <div>
              <p className="text-[11px] text-white/42 font-semibold">Full Statistical Profile</p>
              <p className="text-[10px] text-white/25 leading-snug">
                High / low scores, score range, std deviation, volatility rating, and form % vs season avg.
              </p>
            </div>
          </div>
          <Link
            to="/upgrade"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-400 transition-colors px-3 py-1.5 text-[10px] font-black text-black"
          >
            <Zap size={9} /> Unlock
          </Link>
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[#080808]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="h-4 w-16 rounded bg-white/[0.05] animate-pulse" />
        <div className="h-44 rounded-2xl bg-white/[0.04] animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <div className="space-y-4">
            <div className="h-52 rounded-xl bg-white/[0.04] animate-pulse" />
            <div className="h-36 rounded-xl bg-white/[0.03] animate-pulse" />
          </div>
          <div className="space-y-4">
            <div className="h-72 rounded-2xl bg-white/[0.04] animate-pulse" />
            <div className="space-y-1.5">
              {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-xl bg-white/[0.03] animate-pulse" />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AFLPlayerPage() {
  const { slug }      = useParams<{ slug: string }>();
  const navigate      = useNavigate();
  const { user }      = useAuth();
  const { isPremium } = useAccessState();

  const playerName = useMemo(() => (slug ? slugToPlayerName(slug) : ''), [slug]);

  const [player,       setPlayer]       = useState<PlayerData | null>(null);
  const [similar,      setSimilar]      = useState<SimilarPlayer[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(false);
  const [showFullAI,   setShowFullAI]   = useState(false);
  const [scoreStats,   setScoreStats]   = useState<ScoreStats | null>(null);
  const [posComp,      setPosComp]      = useState<PosCompRow[]>([]);

  // ── Main data fetch ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!playerName) { setError(true); setLoading(false); return; }

    (async () => {
      try {
        const raw = await getPlayerDetailSafe(playerName, user?.id ?? null);
        if (!raw) { setError(true); setLoading(false); return; }

        const mapped: PlayerData = {
          player_id:        raw.player_id ?? 0,
          player_name:      raw.player_name ?? playerName,
          team:             raw.team ?? null,
          player_position:  raw.player_position ?? null,
          price:            raw.price != null ? Number(raw.price) : null,
          projection:       raw.projection != null ? Number(raw.projection) : null,
          breakeven:        raw.breakeven != null ? Number(raw.breakeven) : null,
          edge_canonical:   raw.edge_canonical != null ? Number(raw.edge_canonical) : null,
          action_canonical: raw.action_canonical ?? null,
          action_display:   raw.action_display ?? null,
          confidence_label: raw.confidence_label ?? null,
          value_band:       raw.value_band ?? null,
          decision_score:   raw.decision_score != null ? Number(raw.decision_score) : null,
          action_reason_1:  raw.action_reason_1 ?? null,
          action_reason_2:  raw.action_reason_2 ?? null,
          status:           raw.status ?? null,
          manual_status:    raw.manual_status ?? null,
          is_bye:           raw.is_bye != null ? Boolean(raw.is_bye) : null,
          bye_next_round:   raw.bye_next_round != null ? Boolean(raw.bye_next_round) : null,
          bye_round:        raw.bye_round != null ? Number(raw.bye_round) : null,
          games_played:     raw.games_played != null ? Number(raw.games_played) : null,
          avg_last_3:       raw.avg_last_3 != null ? Number(raw.avg_last_3) : null,
          avg_last_5:       raw.avg_last_5 != null ? Number(raw.avg_last_5) : null,
          season_avg:       raw.season_avg != null ? Number(raw.season_avg) : null,
          why:              raw.why ?? null,
          why_long:         raw.why_long ?? null,
          neeko_rating:     raw.neeko_rating != null ? Number(raw.neeko_rating) : null,
          is_locked:        raw.is_locked != null ? Boolean(raw.is_locked) : null,
          floor_estimate:   raw.floor_estimate != null ? Number(raw.floor_estimate) : null,
          ceiling_estimate: raw.ceiling_estimate != null ? Number(raw.ceiling_estimate) : null,
        };

        setPlayer(mapped);

        const proj      = raw.projection != null ? Number(raw.projection) : 0;
        const projRange = Math.max(20, proj * 0.35);
        const sim = await getSimilarPlayersSafe(
          raw.player_id,
          raw.player_position ?? '',
          proj - projRange,
          proj + projRange,
          user?.id ?? null,
        );
        setSimilar(sim.filter((s: any) => String(s.player_id) !== String(mapped.player_id)).slice(0, 5));
      } catch (err) {
        console.error('[AFLPlayerPage]', playerName, err);
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [playerName, user?.id]);

  // ── Fetch scores and compute statistical profile ──────────────────────────
  useEffect(() => {
    if (!player) return;
    (async () => {
      try {
        const { data: res } = await supabase.rpc('get_player_chart_data', {
          p_player_id: String(player.player_id),
          n_games: 10,
        });
        let scores = ((res as any[]) ?? [])
          .filter((r: any) => !r.is_future && r.actual_score != null)
          .map((r: any) => Number(r.actual_score));

        if (scores.length === 0) {
          const { data: byName } = await supabase.rpc('get_player_score_history', {
            player_name_in: player.player_name,
            n_games: 10,
          });
          scores = ((byName as any[]) ?? [])
            .filter((r: any) => r.fantasy_points != null)
            .map((r: any) => Number(r.fantasy_points));
        }

        if (scores.length > 0) {
          setScoreStats(computeScoreStats(scores));
        }
      } catch { /* silently skip */ }
    })();
  }, [player?.player_id, player?.player_name]);

  // ── Fetch position comparison percentiles ────────────────────────────────
  useEffect(() => {
    if (!player?.player_id) return;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_position_comparison_safe', {
          p_player_id: String(player.player_id),
          p_user_id:   user?.id ?? null,
        });
        const rows = ((data as any[]) ?? []).filter(
          (r: any) => r.percentile != null && r.position_count >= 3
        ) as PosCompRow[];
        setPosComp(rows);
      } catch { /* silently skip */ }
    })();
  }, [player?.player_id, user?.id]);

  // ── Derived values ────────────────────────────────────────────────────────
  const posSlug  = player ? getPositionSlug(player.player_position) : null;
  const posName  = player ? getPositionName(player.player_position) : '';
  const teamSlug = Object.entries(TEAM_SLUG_TO_NAME).find(([, n]) => n === player?.team)?.[0];

  const accentRaw = getTeamAccentColour(player?.team?.split(' ')[0] ?? null) ?? '#4ade80';
  const accent    = accentRaw === '#FFD200' ? '#C9A800' : accentRaw === '#1A1A1A' ? '#6b7280' : accentRaw;

  const actionMeta = getActionMeta(player?.action_canonical ?? null);
  const formLabel  = deriveFormLabel(player?.avg_last_3 ?? null, player?.season_avg ?? null);
  const bevsProj   = useMemo(() => {
    if (player?.breakeven == null || player?.projection == null) return null;
    return Math.round(player.projection - player.breakeven);
  }, [player?.breakeven, player?.projection]);

  if (loading) return <LoadingSkeleton />;

  if (error || !player) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <AlertCircle size={36} className="text-white/15 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-white mb-2">Player Not Found</h2>
          <p className="text-white/35 mb-6 text-[13px]">Could not load data for: {playerName || slug}</p>
          <button
            onClick={() => navigate('/fantasy/rankings')}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-4 py-2 text-[13px] text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <ArrowLeft size={13} />
            Back to Rankings
          </button>
        </div>
      </div>
    );
  }

  // ── SEO ───────────────────────────────────────────────────────────────────
  const pageUrl         = `https://neekostats.com.au/sports/afl/players/${slug}`;
  const pageTitle       = `${player.player_name} AFL Fantasy 2026 Stats, Form & Projection | Neeko Sports Stats`;
  const pageDescription = `View ${player.player_name} AFL Fantasy 2026 stats, recent form, price, season average, projection and fantasy analysis with Neeko Sports Stats.`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': pageUrl,
        url: pageUrl,
        name: pageTitle,
        description: pageDescription,
        inLanguage: 'en-AU',
        isPartOf: { '@id': 'https://neekostats.com.au/#website' },
        about: {
          '@type': 'Person',
          name: player.player_name,
          ...(player.team       ? { memberOf: { '@type': 'SportsTeam', name: player.team, sport: 'Australian Rules Football' } } : {}),
          ...(posName           ? { jobTitle: `${posName} – AFL Fantasy` } : {}),
        },
        publisher: {
          '@type': 'Organization',
          '@id': 'https://neekostats.com.au/#organization',
          name: 'Neeko Sports Stats',
          url: 'https://neekostats.com.au',
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home',         item: 'https://neekostats.com.au' },
          { '@type': 'ListItem', position: 2, name: 'AFL Rankings', item: 'https://neekostats.com.au/fantasy/rankings' },
          ...(posName && posSlug ? [{ '@type': 'ListItem', position: 3, name: `${posName} Rankings`, item: `https://neekostats.com.au/sports/afl/positions/${posSlug}` }] : []),
          { '@type': 'ListItem', position: posName && posSlug ? 4 : 3, name: player.player_name, item: pageUrl },
        ],
      },
    ],
  };

  const delta3 = player.avg_last_3 != null && player.season_avg != null
    ? Math.round(player.avg_last_3 - player.season_avg) : null;

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description"         content={pageDescription} />
        <meta name="keywords"            content={`${player.player_name}, AFL Fantasy 2026, ${player.team ?? ''}, ${posName}, ${player.player_name} stats, AFL Fantasy stats, Neeko Sports Stats`} />
        <link rel="canonical"            href={pageUrl} />
        <meta name="robots"              content="index, follow" />
        <meta property="og:type"         content="website" />
        <meta property="og:url"          content={pageUrl} />
        <meta property="og:title"        content={pageTitle} />
        <meta property="og:description"  content={pageDescription} />
        <meta property="og:site_name"    content="Neeko Sports Stats" />
        <meta name="twitter:card"        content="summary" />
        <meta name="twitter:title"       content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <div className="min-h-screen bg-[#080808]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

          {/* Back nav */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-white/28 hover:text-white/60 transition-colors text-[12px] mb-5"
          >
            <ArrowLeft size={13} />
            Back
          </button>

          {/* ══════════════════════════════════════════
              HERO — Player identity + key stats
          ══════════════════════════════════════════ */}
          <div
            className="rounded-2xl border border-white/[0.07] relative overflow-hidden mb-5"
            style={{ background: `linear-gradient(135deg, ${accent}0d 0%, #0c0c0c 65%)` }}
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
              style={{ background: `linear-gradient(90deg, ${accent}70, transparent 70%)` }} />
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at top left, ${accent}0a 0%, transparent 55%)` }} />

            <div className="relative px-5 pt-5 pb-4 sm:px-6">
              {/* Identity row */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span
                      className="text-[9px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 rounded-full border"
                      style={{ color: `${accent}cc`, borderColor: `${accent}30`, background: `${accent}0d` }}
                    >
                      {player.team ?? 'AFL'}
                    </span>
                    <span className="text-[9px] uppercase tracking-widest text-white/28 font-semibold">
                      {posName.replace(/s$/, '')}
                    </span>
                    <PlayerStatusPill
                      row={{
                        status:         player.status ?? null,
                        manual_status:  player.manual_status ?? null,
                        is_bye:         player.is_bye ?? null,
                        bye_next_round: player.bye_next_round ?? null,
                        bye_round:      player.bye_round ?? null,
                      }}
                      showUpcomingBye
                    />
                  </div>
                  <h1 className="text-[28px] sm:text-[34px] font-black text-white leading-none tracking-tight mb-2">
                    {player.player_name}
                  </h1>
                  {/* Form label + delta — derived from real scoring, always visible if data present */}
                  {delta3 != null && (
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${getFormStyles(formLabel)}`}>
                        {formLabel}
                      </span>
                      <span className={`text-[11px] font-semibold tabular-nums ${delta3 >= 0 ? 'text-emerald-400/80' : 'text-red-400/75'}`}>
                        {delta3 >= 0 ? '+' : ''}{delta3} vs season avg
                      </span>
                      <span className="text-[10px] text-white/22">last 3</span>
                    </div>
                  )}
                </div>

                {/* Premium-only action signal badge */}
                {isPremium && player.action_canonical != null && (
                  <div
                    className="flex flex-col items-center justify-center w-[72px] shrink-0 rounded-xl border px-2 py-2.5 text-center gap-0.5"
                    style={{
                      background: `${actionMeta.color}0c`,
                      borderColor: `${actionMeta.color}30`,
                    }}
                  >
                    <span className="text-[7px] uppercase tracking-widest font-bold" style={{ color: `${actionMeta.color}80` }}>Action</span>
                    <span className="text-[13px] font-black uppercase leading-tight" style={{ color: actionMeta.color }}>
                      {actionMeta.label}
                    </span>
                    {player.confidence_label && (
                      <span className="text-[7px] uppercase tracking-wider text-white/32 font-semibold leading-tight">
                        {player.confidence_label}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Stat strip — stats-first, no premium fields */}
              {(() => {
                const cells: { label: string; val: React.ReactNode }[] = [
                  { label: 'Price',      val: <span className="text-white/80">{fmtPriceHelper(player.price)}</span> },
                  { label: 'Season Avg', val: <span className="text-white/82">{fmtAvg(player.season_avg)}</span> },
                  { label: 'Last 3',     val: <span className={delta3 != null ? (delta3 >= 0 ? 'text-emerald-400' : 'text-red-400/85') : 'text-white/65'}>{fmtAvg(player.avg_last_3)}</span> },
                  ...(player.avg_last_5 != null ? [{ label: 'Last 5', val: <span className="text-white/60">{Math.round(player.avg_last_5)}</span> }] : []),
                  { label: 'Games',      val: <span className="text-white/50">{player.games_played ?? '—'}</span> },
                  ...(scoreStats?.high != null ? [{ label: 'High (L10)', val: <span className="text-emerald-400/75">{Math.round(scoreStats.high)}</span> }] : []),
                  ...(scoreStats?.low  != null ? [{ label: 'Low (L10)',  val: <span className="text-red-400/60">{Math.round(scoreStats.low)}</span> }] : []),
                ];
                return (
                  <div
                    className="grid divide-x divide-white/[0.06] rounded-xl border border-white/[0.07] bg-black/20 overflow-hidden"
                    style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
                  >
                    {cells.map(({ label, val }) => (
                      <div key={label} className="flex flex-col items-center justify-center py-3 px-1.5 gap-0.5">
                        <span className="text-[14px] sm:text-[15px] font-black tabular-nums leading-tight">{val}</span>
                        <span className="text-[7px] sm:text-[8px] uppercase tracking-widest text-white/24 text-center leading-tight">{label}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ══════════════════════════════════════════
              TWO-COLUMN LAYOUT
              Left (main): chart + scoring profile + position context
              Right (sidebar): Decision Centre + similar players + nav cards
          ══════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_308px] gap-5">

            {/* ── MAIN COLUMN ─────────────────────────── */}
            <div className="space-y-5 min-w-0">

              {/* Fantasy Scoring History */}
              <div>
                <SectionLabel icon={<Activity size={13} />} title="Fantasy Scoring History" />
                <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] overflow-hidden px-3 pt-3 pb-2">
                  <Suspense fallback={<div className="h-[190px] animate-pulse rounded-lg bg-white/[0.03]" />}>
                    <ScoreHistoryChart
                      playerName={player.player_name}
                      playerId={String(player.player_id)}
                      hideProjection={!isPremium}
                      seasonAvg={player.season_avg}
                    />
                  </Suspense>
                </div>
                {!isPremium && (
                  <p className="text-[10px] text-white/20 mt-1.5 px-1 flex items-center gap-1.5">
                    <Lock size={9} className="text-amber-400/35 shrink-0" />
                    Projection overlay available on Neeko+.{' '}
                    <Link to="/upgrade" className="text-amber-400/52 hover:text-amber-400 transition-colors underline underline-offset-2">Upgrade</Link>
                  </p>
                )}
              </div>

              {/* Statistical Profile */}
              {scoreStats != null && (
                <div>
                  <SectionLabel icon={<Flame size={13} />} title="Statistical Profile" />
                  <StatisticalProfile
                    stats={scoreStats}
                    isPremium={isPremium}
                    player={{
                      season_avg:  player.season_avg,
                      avg_last_3:  player.avg_last_3,
                      avg_last_5:  player.avg_last_5,
                    }}
                  />
                </div>
              )}

              {/* Scoring Profile */}
              <div>
                <SectionLabel icon={<BarChart3 size={13} />} title="Scoring Profile" />
                <div className="space-y-3">
                  {/* Stat tiles */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <StatTile
                      label="Season Avg"
                      value={<span className="text-white/80">{fmtAvg(player.season_avg)}</span>}
                      sub="2026 season"
                    />
                    <StatTile
                      label="Last 3"
                      value={
                        <span className={delta3 != null ? (delta3 >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-white/70'}>
                          {fmtAvg(player.avg_last_3)}
                        </span>
                      }
                      sub={delta3 != null ? `${delta3 >= 0 ? '+' : ''}${delta3} vs avg` : undefined}
                    />
                    <StatTile
                      label="Last 5"
                      value={<span className="text-white/65">{fmtAvg(player.avg_last_5)}</span>}
                      sub="5-game window"
                    />
                    <StatTile
                      label="High (L10)"
                      value={<span className="text-white/55">{chartHighLow.high != null ? Math.round(chartHighLow.high) : '—'}</span>}
                      sub="last 10 games"
                    />
                  </div>

                  {/* Form trend bar */}
                  {(player.avg_last_3 != null || player.avg_last_5 != null) && player.season_avg != null && (
                    <div className="rounded-xl border border-white/[0.07] bg-[#0c0c0c] px-4 py-3 space-y-2">
                      <p className="text-[9px] uppercase tracking-widest text-white/25 font-semibold">Form Trend</p>
                      <FormBar avg3={player.avg_last_3} avg5={player.avg_last_5} seasonAvg={player.season_avg} />
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-sm bg-white/15" />
                          <span className="text-[9px] text-white/28">5-game range</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-sm ${delta3 != null && delta3 >= 0 ? 'bg-emerald-400' : 'bg-red-400/80'}`} />
                          <span className="text-[9px] text-white/28">Last 3 avg</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-px h-3 bg-white/22" />
                          <span className="text-[9px] text-white/28">Season avg</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Position Comparison */}
              {posComp.length > 0 && (
                <div>
                  <SectionLabel icon={<Target size={13} />} title="Position Comparison" />
                  <PositionComparisonSection rows={posComp} isPremium={isPremium} />
                </div>
              )}

              {/* Related Links */}
              <div>
                <SectionLabel icon={<ChevronRight size={13} />} title="Related" />
                <div className="flex flex-wrap gap-x-5 gap-y-2 px-0.5">
                  {teamSlug && (
                    <Link
                      to={`/sports/afl/teams/${teamSlug}`}
                      className="flex items-center gap-1.5 text-[11px] text-white/38 hover:text-white/70 transition-colors"
                    >
                      <Users size={10} className="shrink-0 text-white/22" />
                      {player.team} players
                    </Link>
                  )}
                  {posSlug && (
                    <Link
                      to={`/sports/afl/positions/${posSlug}`}
                      className="flex items-center gap-1.5 text-[11px] text-white/38 hover:text-white/70 transition-colors"
                    >
                      <BarChart2 size={10} className="shrink-0 text-white/22" />
                      {posName} rankings
                    </Link>
                  )}
                  <Link
                    to="/fantasy/rankings"
                    className="flex items-center gap-1.5 text-[11px] text-white/38 hover:text-white/70 transition-colors"
                  >
                    <Activity size={10} className="shrink-0 text-white/22" />
                    AFL Rankings
                  </Link>
                  <Link
                    to="/fantasy/market-watch"
                    className="flex items-center gap-1.5 text-[11px] text-white/38 hover:text-white/70 transition-colors"
                  >
                    <TrendingUp size={10} className="shrink-0 text-white/22" />
                    Market Watch
                  </Link>
                </div>
              </div>

              {/* SEO block — bottom of main column on desktop */}
              <div className="hidden lg:block">
                <PlayerSEOBlock player={player} teamSlug={teamSlug} posSlug={posSlug} />
              </div>
            </div>

            {/* ── SIDEBAR COLUMN ──────────────────────── */}
            <div className="space-y-4">

              {/* Fantasy Decision */}
              <div>
                <SectionLabel icon={<Target size={13} />} title="Fantasy Decision" />
                <FantasyDecision
                  player={player}
                  isPremium={isPremium}
                  actionMeta={actionMeta}
                  formLabel={formLabel}
                  bevsProj={bevsProj}
                  showFullAI={showFullAI}
                  onToggleAI={() => setShowFullAI(v => !v)}
                />
              </div>

              {/* Similar Players */}
              {similar.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <SectionLabel icon={<Users size={13} />} title={`Similar ${posName}`} />
                    {posSlug && (
                      <Link
                        to={`/sports/afl/positions/${posSlug}`}
                        className="flex items-center gap-1 text-[11px] text-white/25 hover:text-white/52 transition-colors mb-3"
                      >
                        All <ChevronRight size={10} />
                      </Link>
                    )}
                  </div>

                  {/* One-line upgrade note for free users */}
                  {!isPremium && (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 mb-2 rounded-lg border border-white/[0.05] bg-white/[0.02]">
                      <p className="text-[10px] text-white/30">Projection &amp; signal on Neeko+</p>
                      <Link
                        to="/upgrade"
                        className="text-[9px] font-bold text-amber-400/70 hover:text-amber-400 transition-colors uppercase tracking-wider whitespace-nowrap"
                      >
                        Upgrade
                      </Link>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {similar.map(s => (
                      <SimilarPlayerRow key={s.player_id} player={s} isPremium={isPremium} />
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* SEO block — shown below both columns on mobile */}
          <div className="lg:hidden mt-5">
            <PlayerSEOBlock player={player} teamSlug={teamSlug} posSlug={posSlug} />
          </div>

        </div>
      </div>
    </>
  );
}
