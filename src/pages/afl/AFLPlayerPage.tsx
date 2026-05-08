import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Zap, Lock, Users, ChartBar as BarChart2, CircleAlert as AlertCircle, ChevronDown, ChevronUp, Activity, Target, ChartBar as BarChart3 } from 'lucide-react';
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
  player_position: string | null;
  price: number | null;
  projection: number | null;
  edge_canonical: number | null;
  action_canonical: string | null;
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

/** Similar player row */
function SimilarPlayerRow({ player, isPremium }: { player: SimilarPlayer; isPremium: boolean }) {
  const slug     = playerToSlug(player.player_name, player.team ?? undefined);
  const isLocked = !isPremium && player.is_locked;
  const meta     = getActionMeta(player.action_canonical);
  const actionCls =
    meta.isStart ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/28' :
    meta.isSit   ? 'bg-orange-500/10 text-orange-400 border-orange-500/22'   :
                   'bg-white/[0.03] text-white/28 border-white/[0.07]';

  return (
    <Link
      to={`/sports/afl/players/${slug}`}
      className="flex items-center gap-3 rounded-xl bg-[#0c0c0c] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.025] transition-all px-3.5 py-2.5 group"
    >
      <span className="shrink-0">
        {isLocked
          ? <Minus size={11} className="text-white/15" />
          : meta.isStart
          ? <TrendingUp size={11} className="text-emerald-400" />
          : meta.isSit
          ? <TrendingDown size={11} className="text-orange-400" />
          : <Minus size={11} className="text-white/18" />
        }
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-white/75 group-hover:text-white transition-colors truncate">
          {player.player_name}
        </p>
        <p className="text-[10px] text-white/28 mt-0.5 tabular-nums">
          {player.team ?? '—'} · {fmtPriceHelper(player.price)}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {!isLocked ? (
          <>
            {player.projection != null && (
              <span className="text-[12px] font-bold text-white/60 tabular-nums">{Math.round(player.projection)}</span>
            )}
            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${actionCls}`}>
              {meta.label}
            </span>
          </>
        ) : (
          <LockedChip label="+" />
        )}
        <ChevronRight size={10} className="text-white/15 group-hover:text-white/35 transition-colors" />
      </div>
    </Link>
  );
}

/** Nav card for Team / Position */
function NavCard({ to, label, detail, icon }: {
  to: string; label: string; detail: string; icon: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-[#0c0c0c] px-4 py-3 hover:bg-white/[0.025] hover:border-white/[0.12] transition-all group"
    >
      <span className="text-white/20 group-hover:text-white/38 transition-colors shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] uppercase tracking-widest text-white/22 mb-0.5">{label}</p>
        <p className="text-[12px] font-semibold text-white/60 group-hover:text-white/82 transition-colors truncate">{detail}</p>
      </div>
      <ChevronRight size={11} className="text-white/15 group-hover:text-white/38 transition-colors shrink-0" />
    </Link>
  );
}

/** Compact premium Decision module for the sidebar */
function DecisionSidebar({
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
      <div className="rounded-2xl border border-white/[0.07] bg-[#0c0c0c] overflow-hidden">
        {/* Blurred preview */}
        <div className="relative select-none pointer-events-none" style={{ filter: 'blur(3.5px)', opacity: 0.4 }}>
          <div className="px-4 pt-4 pb-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-400" />
                <span className="text-[16px] font-black text-emerald-400 uppercase">START</span>
              </div>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded border text-emerald-400 border-emerald-500/30 bg-emerald-500/10 uppercase tracking-wider">High conf</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[['Projection', '108'], ['Breakeven', '81'], ['Floor', '86'], ['Ceiling', '134']].map(([l, v]) => (
                <div key={l} className="rounded-lg border border-white/[0.07] bg-black/30 p-2.5">
                  <p className="text-[8px] uppercase tracking-widest text-white/25 mb-1">{l}</p>
                  <p className="text-[18px] font-black text-white">{v}</p>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 pt-0.5">
              <div className="flex justify-between"><span className="text-[11px] text-white/40">Proj vs BE</span><span className="text-[11px] font-bold text-emerald-400">+27 pts</span></div>
              <div className="flex justify-between"><span className="text-[11px] text-white/40">Edge Score</span><span className="text-[11px] font-bold text-emerald-400">+9.8</span></div>
            </div>
          </div>
        </div>
        {/* CTA */}
        <div className="border-t border-amber-500/20 bg-gradient-to-b from-amber-500/[0.06] to-[#0c0c0c] px-4 py-4">
          <p className="text-[13px] font-black text-white mb-1">Fantasy Decision Centre</p>
          <p className="text-[11px] text-white/38 mb-3 leading-snug">Projection, breakeven, edge score, floor/ceiling and AI reasoning for every player.</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/upgrade" className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-4 py-2 text-[11px] font-black text-black">
              <Zap size={11} /> Unlock Neeko+
            </Link>
            <Link to="/auth" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] transition-colors px-3 py-2 text-[11px] text-white/40 hover:text-white">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{
        borderColor: `${actionMeta.color}28`,
        background: `linear-gradient(160deg, ${actionMeta.color}06 0%, #0b0b0b 55%)`,
      }}
    >
      <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${actionMeta.color}55, transparent 70%)` }} />
      <div className="p-4 space-y-4">

        {/* Action header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-lg border shrink-0"
              style={{ background: `${actionMeta.color}0e`, borderColor: `${actionMeta.color}35` }}
            >
              {actionMeta.isStart
                ? <TrendingUp size={15} style={{ color: actionMeta.color }} />
                : actionMeta.isSit
                ? <TrendingDown size={15} style={{ color: actionMeta.color }} />
                : <Minus size={15} className="text-white/30" />
              }
            </div>
            <div>
              <p className="text-[8px] uppercase tracking-widest text-white/28">Neeko Action</p>
              <p className="text-[17px] font-black uppercase leading-none" style={{ color: actionMeta.color }}>
                {player.action_display ?? actionMeta.label}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {player.confidence_label && (
              <span className={`text-[8px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                player.confidence_label.toUpperCase() === 'HIGH'
                  ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                  : player.confidence_label.toUpperCase() === 'MEDIUM'
                  ? 'text-yellow-400 border-yellow-500/25 bg-yellow-500/[0.08]'
                  : 'text-white/35 border-white/10 bg-white/[0.04]'
              }`}>
                {player.confidence_label}
              </span>
            )}
            {player.value_band && (
              <span className="text-[8px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider text-emerald-300 border-emerald-500/25 bg-emerald-500/[0.07]">
                {player.value_band}
              </span>
            )}
          </div>
        </div>

        {/* 2×2 metric grid */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-lg border border-white/[0.07] bg-black/30 p-2.5 flex flex-col gap-1">
            <p className="text-[8px] uppercase tracking-widest text-white/25">Projection</p>
            <p className="text-[20px] font-black text-white tabular-nums leading-none">
              {player.projection != null ? Math.round(player.projection) : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.07] bg-black/30 p-2.5 flex flex-col gap-1">
            <p className="text-[8px] uppercase tracking-widest text-white/25">Breakeven</p>
            <p className={`text-[20px] font-black tabular-nums leading-none ${
              player.breakeven != null && player.avg_last_3 != null
                ? player.avg_last_3 >= player.breakeven ? 'text-emerald-400' : 'text-red-400'
                : 'text-white/60'
            }`}>
              {player.breakeven != null ? Math.round(player.breakeven) : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.07] bg-black/30 p-2.5 flex flex-col gap-1">
            <p className="text-[8px] uppercase tracking-widest text-white/25">Floor</p>
            <p className="text-[17px] font-black text-red-400/75 tabular-nums leading-none">
              {player.floor_estimate != null ? Math.round(player.floor_estimate) : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.07] bg-black/30 p-2.5 flex flex-col gap-1">
            <p className="text-[8px] uppercase tracking-widest text-white/25">Ceiling</p>
            <p className="text-[17px] font-black text-emerald-400 tabular-nums leading-none">
              {player.ceiling_estimate != null ? Math.round(player.ceiling_estimate) : '—'}
            </p>
          </div>
        </div>

        {/* Key signal rows */}
        <div className="rounded-lg border border-white/[0.05] bg-black/20 divide-y divide-white/[0.04]">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[10px] text-white/38">Proj vs Breakeven</span>
            <span className={`text-[11px] font-bold tabular-nums ${
              bevsProj != null ? (bevsProj >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-white/30'
            }`}>
              {bevsProj != null ? `${bevsProj >= 0 ? '+' : ''}${bevsProj} pts` : '—'}
            </span>
          </div>
          {player.edge_canonical != null && (
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[10px] text-white/38">Edge Score</span>
              <span className={`text-[11px] font-bold tabular-nums ${getEdgeColor(player.edge_canonical)}`}>
                {fmtEdge(player.edge_canonical)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[10px] text-white/38">Form</span>
            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${getFormStyles(formLabel)}`}>
              {formLabel}
            </span>
          </div>
        </div>

        {/* AI reasoning */}
        {(player.why || player.action_reason_1) && (
          <div className="space-y-2">
            <p className="text-[8px] uppercase tracking-widest text-white/22 font-bold">AI Reasoning</p>
            {player.why && (
              <p className="text-[11.5px] text-white/62 leading-relaxed">{player.why}</p>
            )}
            {player.action_reason_1 && (
              <div className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full shrink-0 mt-[5px]" style={{ background: `${actionMeta.color}80` }} />
                <span className="text-[11px] text-white/45 leading-snug">{player.action_reason_1}</span>
              </div>
            )}
            {player.action_reason_2 && (
              <div className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-white/18 shrink-0 mt-[5px]" />
                <span className="text-[11px] text-white/32 leading-snug">{player.action_reason_2}</span>
              </div>
            )}
            {player.why_long && (
              <>
                <button
                  onClick={onToggleAI}
                  className="flex items-center gap-1.5 text-[10px] text-white/28 hover:text-white/55 transition-colors"
                >
                  {showFullAI ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  {showFullAI ? 'Less' : 'Full analysis'}
                </button>
                {showFullAI && (
                  <p className="text-[11px] text-white/38 leading-relaxed border-t border-white/[0.05] pt-2">
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
            <Link to="/fantasy/start-sit" className="text-white/28 hover:text-white/52 transition-colors underline underline-offset-2 decoration-white/14">Start / Sit</Link>
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
  const [chartHighLow, setChartHighLow] = useState<{ high: number | null }>({ high: null });

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

        const sim = await getSimilarPlayersSafe(
          raw.player_id, raw.player_position, raw.projection, user?.id ?? null,
        );
        setSimilar(sim.filter((s: any) => s.player_id !== mapped.player_id).slice(0, 5));
      } catch (err) {
        console.error('[AFLPlayerPage]', playerName, err);
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [playerName, user?.id]);

  // ── Fetch high score from last 10 games for stat strip ───────────────────
  useEffect(() => {
    if (!player) return;
    (async () => {
      try {
        const { data: res } = await supabase.rpc('get_player_chart_data', {
          p_player_id: String(player.player_id),
          n_games: 10,
        });
        const scores = ((res as any[]) ?? [])
          .filter((r: any) => !r.is_future && r.actual_score != null)
          .map((r: any) => Number(r.actual_score));
        if (scores.length > 0) {
          setChartHighLow({ high: Math.max(...scores) });
        } else {
          const { data: byName } = await supabase.rpc('get_player_score_history', {
            player_name_in: player.player_name,
            n_games: 10,
          });
          const nameScores = ((byName as any[]) ?? [])
            .filter((r: any) => r.fantasy_points != null)
            .map((r: any) => Number(r.fantasy_points));
          if (nameScores.length > 0) setChartHighLow({ high: Math.max(...nameScores) });
        }
      } catch { /* silently skip */ }
    })();
  }, [player?.player_id, player?.player_name]);

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
  const pageTitle       = `${player.player_name}${player.team ? ` (${player.team})` : ''} AFL Fantasy 2026 | ${posName} Stats & History | Neeko`;
  const pageDescription = `${player.player_name} AFL Fantasy 2026. Season avg: ${player.season_avg != null ? Math.round(player.season_avg) : 'TBC'} pts. Price: ${fmtPriceHelper(player.price)}. ${player.games_played ?? 0} games played. Updated weekly.`;
  const pageUrl         = `https://neekostats.com.au/sports/afl/players/${slug}`;

  const delta3 = player.avg_last_3 != null && player.season_avg != null
    ? Math.round(player.avg_last_3 - player.season_avg) : null;

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description"          content={pageDescription} />
        <meta name="keywords"             content={`${player.player_name}, AFL Fantasy, AFL Fantasy 2026, ${player.team ?? ''}, ${posName}, ${player.player_name} stats, fantasy 2026`} />
        <meta property="og:title"         content={pageTitle} />
        <meta property="og:description"   content={pageDescription} />
        <meta property="og:type"          content="website" />
        <meta property="og:url"           content={pageUrl} />
        <meta property="og:site_name"     content="Neeko Sports" />
        <link rel="canonical"             href={pageUrl} />
        <meta name="robots"               content="index, follow" />
        <meta name="twitter:card"         content="summary_large_image" />
        <meta name="twitter:title"        content={pageTitle} />
        <meta name="twitter:description"  content={pageDescription} />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: player.player_name,
          description: pageDescription,
          url: pageUrl,
          memberOf: player.team ? { '@type': 'SportsTeam', name: player.team } : undefined,
          publisher: { '@type': 'Organization', name: 'Neeko Sports', url: 'https://neekostats.com.au' },
          breadcrumb: {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home',         item: 'https://neekostats.com.au' },
              { '@type': 'ListItem', position: 2, name: 'AFL Rankings', item: 'https://neekostats.com.au/fantasy/rankings' },
              { '@type': 'ListItem', position: 3, name: player.player_name, item: pageUrl },
            ],
          },
        })}</script>
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
                  {/* Form delta */}
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

                {/* Neeko rating badge — always visible */}
                {player.neeko_rating != null && (
                  <div
                    className="flex flex-col items-center justify-center w-[68px] h-[68px] rounded-xl shrink-0 border text-center"
                    style={{ background: `${accent}0a`, borderColor: `${accent}30` }}
                  >
                    <span className="text-[8px] uppercase tracking-widest mb-0.5" style={{ color: `${accent}80` }}>Rating</span>
                    <span className="text-[22px] font-black leading-none" style={{ color: accent }}>
                      {Number(player.neeko_rating).toFixed(1)}
                    </span>
                  </div>
                )}
              </div>

              {/* Stat strip — always visible */}
              <div className="grid grid-cols-5 divide-x divide-white/[0.06] rounded-xl border border-white/[0.07] bg-black/20 overflow-hidden">
                {[
                  { label: 'Price',      val: <span className="text-white/80">{fmtPriceHelper(player.price)}</span> },
                  { label: 'Season Avg', val: <span className="text-white/82">{fmtAvg(player.season_avg)}</span> },
                  { label: 'Last 3',     val: <span className={delta3 != null ? (delta3 >= 0 ? 'text-emerald-400' : 'text-red-400/85') : 'text-white/65'}>{fmtAvg(player.avg_last_3)}</span> },
                  { label: 'Last 5',     val: <span className="text-white/58">{fmtAvg(player.avg_last_5)}</span> },
                  { label: 'Games',      val: <span className="text-white/50">{player.games_played ?? '—'}</span> },
                ].map(({ label, val }) => (
                  <div key={label} className="flex flex-col items-center justify-center py-3 px-2 gap-0.5">
                    <span className="text-[15px] font-black tabular-nums leading-tight">{val}</span>
                    <span className="text-[8px] uppercase tracking-widest text-white/24 text-center leading-tight">{label}</span>
                  </div>
                ))}
              </div>
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

              {/* Position context */}
              {player.season_avg != null && (
                <div>
                  <SectionLabel icon={<Target size={13} />} title="Position Context" />
                  <div className="rounded-xl border border-white/[0.07] bg-[#0c0c0c] px-4 py-4 space-y-3.5">
                    <PositionComparisonBar value={player.season_avg} label="Season Average" posLabel={posName} />
                    {player.avg_last_3 != null && (
                      <PositionComparisonBar value={player.avg_last_3} label="Last 3 Average" posLabel={posName} />
                    )}
                    {player.avg_last_5 != null && (
                      <PositionComparisonBar value={player.avg_last_5} label="Last 5 Average" posLabel={posName} />
                    )}
                    <p className="text-[9px] text-white/20 pt-0.5">
                      Position avg is estimated from typical {posName.replace(/s$/, '')} scoring ranges in AFL Fantasy 2026.
                    </p>
                  </div>
                </div>
              )}

              {/* SEO block — bottom of main column on desktop */}
              <div className="hidden lg:block">
                <PlayerSEOBlock player={player} teamSlug={teamSlug} posSlug={posSlug} />
              </div>
            </div>

            {/* ── SIDEBAR COLUMN ──────────────────────── */}
            <div className="space-y-4">

              {/* Fantasy Decision Centre */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-white/25"><Target size={13} /></span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.38em] text-white/30">Decision Centre</span>
                  <span className="ml-auto text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/[0.07] text-amber-400/65">
                    Neeko+
                  </span>
                </div>
                <DecisionSidebar
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
                  <div className="flex items-center justify-between mb-3">
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
                  <div className="space-y-1.5">
                    {similar.map(s => (
                      <SimilarPlayerRow key={s.player_id} player={s} isPremium={isPremium} />
                    ))}
                  </div>
                </div>
              )}

              {/* Team + Position nav cards */}
              {(teamSlug || posSlug) && (
                <div className={`grid gap-2 ${teamSlug && posSlug ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {teamSlug && (
                    <NavCard to={`/sports/afl/teams/${teamSlug}`} label="Team" detail={player.team ?? ''} icon={<Users size={12} />} />
                  )}
                  {posSlug && (
                    <NavCard to={`/sports/afl/positions/${posSlug}`} label="Position" detail={posName} icon={<BarChart2 size={12} />} />
                  )}
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
