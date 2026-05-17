import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ChevronRight, ChevronDown, TrendingUp, TrendingDown, Minus, Users, Zap, ChartBar as BarChart2, Star, CircleAlert as AlertCircle, Flame, Trophy, DollarSign, Lock, Activity, Target, Shield, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { nameToSlug, POSITION_NAMES, TEAM_SLUG_TO_NAME } from '@/lib/slugs';
import { getTeamPlayersSafe } from '@/lib/playerAccess';
import { useAuth } from '@/lib/auth';
import { getTeamAccentColour } from '@/config/aflTeamColours';
import { PlayerStatusPill } from '@/features/afl/rankings/components/PlayerStatusPill';
import { fmtEdge, getEdgeColor } from '@/features/afl/rankings/components/helpers';
import { useAccessState } from '@/hooks/useAccessState';
import { useTeamIntelligence } from '@/hooks/useTeamIntelligence';
import { TeamIntelligencePanel } from '@/components/afl/TeamIntelligencePanel';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  Cell, ReferenceLine,
} from 'recharts';

const FREE_PLAYER_LIMIT = 8;

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamPlayer {
  player_id: string | null;
  player_name: string;
  team: string | null;
  position: string | null;
  position_group: string | null;
  price: number | null;
  prev_price: number | null;
  price_change: number | null;
  projection: number | null;
  ceiling_estimate: number | null;
  floor_estimate: number | null;
  breakeven: number | null;
  value_score: number | null;
  edge_canonical: number | null;
  neeko_rating: number | null;
  consistency: number | null;
  form_score: number | null;
  season_avg: number | null;
  last_3_avg: number | null;
  last_5_avg: number | null;
  signal: string | null;
  signal_display: string | null;
  action_canonical: string | null;
  action_display: string | null;
  why: string | null;
  action_reason_1: string | null;
  action_reason_2: string | null;
  matchup_label: string | null;
  status: string | null;
  is_bye: boolean | null;
  is_injured: boolean | null;
  games_played: number | null;
  is_locked: boolean | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(p: number | null) {
  if (!p) return '—';
  if (Math.abs(p) >= 1_000_000) {
    const m = p / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(2).replace(/\.?0+$/, '')}M`;
  }
  return `$${Math.round(p / 1000)}K`;
}

function fmtProj(p: number | null | undefined) {
  if (p == null) return '—';
  return Math.round(Number(p)).toString();
}

function fmtAvg(v: number | null | undefined) {
  if (v == null) return '—';
  return Math.round(Number(v)).toString();
}

// Short position abbreviations for compact table cells
const POS_ABBR: Record<string, string> = {
  DEF: 'DEF', MID: 'MID', FWD: 'FWD', RUC: 'RUC',
  // handle any alternate raw codes that come through
  D: 'DEF', M: 'MID', F: 'FWD', R: 'RUC',
};
function posAbbr(raw: string | null | undefined): string {
  const key = (raw ?? '').toUpperCase().trim();
  return POS_ABBR[key] ?? (key.slice(0, 3) || '—');
}

// ─── Shared small components ──────────────────────────────────────────────────

function SectionLabel({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-white/25">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">{title}</span>
      <div className="flex-1 h-px bg-white/[0.05]" />
    </div>
  );
}

function CollapsibleSection({
  icon, title, children, defaultOpen = false,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        className="sm:hidden w-full flex items-center justify-between mb-3"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="text-white/25">{icon}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.38em] text-white/30">{title}</span>
          <div className="flex-1 h-px bg-white/[0.05]" />
        </div>
        <ChevronDown
          size={13}
          className="text-white/20 transition-transform duration-200 shrink-0 ml-2"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      <div className="hidden sm:block">
        <SectionLabel icon={icon} title={title} />
      </div>
      <div className={`sm:block ${open ? 'block' : 'hidden'}`}>
        {children}
      </div>
    </div>
  );
}


function ActionIcon({ action }: { action: string | null }) {
  const ac = (action ?? 'HOLD').toUpperCase();
  if (ac === 'START' || ac === 'SMASH_START')
    return <TrendingUp size={12} className="text-emerald-400 shrink-0" />;
  if (ac === 'SIT' || ac === 'HARD_SIT')
    return <TrendingDown size={12} className="text-orange-400 shrink-0" />;
  return <Minus size={12} className="text-white/25 shrink-0" />;
}

function ActionBadge({ action, actionDisplay }: { action: string | null; actionDisplay?: string | null }) {
  const canonical = (action ?? 'HOLD').toUpperCase();
  const isStart = canonical === 'SMASH_START' || canonical === 'START';
  const isSit   = canonical === 'HARD_SIT'   || canonical === 'SIT';
  const cls =
    isStart ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
    isSit   ? 'bg-orange-500/10 text-orange-400 border-orange-500/25' :
              'bg-white/[0.04] text-white/35 border-white/[0.08]';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide shrink-0 border ${cls}`}>
      {actionDisplay ?? canonical}
    </span>
  );
}

function LockedField({ size = 'sm' }: { size?: 'xs' | 'sm' | 'md' }) {
  const textCls = size === 'xs' ? 'text-[8px]' : size === 'md' ? 'text-[12px]' : 'text-[10px]';
  const iconSz  = size === 'xs' ? 7 : size === 'md' ? 11 : 9;
  return (
    <span className={`inline-flex items-center gap-1 ${textCls} text-amber-400/40 select-none`}>
      <Lock size={iconSz} className="shrink-0 text-amber-400/50" />
      <span className="blur-[3.5px] text-white/30 font-mono">000</span>
    </span>
  );
}

/** Full locked cell — used where a column would otherwise show a value */
function LockedCell({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/[0.06] border border-amber-500/[0.12] text-[8px] text-amber-400/50 select-none whitespace-nowrap">
      <Lock size={7} className="shrink-0" />
      {label ?? 'Neeko+'}
    </span>
  );
}

// ─── Metric card (hero stat strip) ───────────────────────────────────────────

function MetricCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 rounded-xl border border-white/[0.06] bg-black/20">
      <span className="text-[20px] font-black tabular-nums leading-none" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
      <span className="text-[9px] uppercase tracking-widest text-white/28 leading-tight">{label}</span>
      {sub && <span className="text-[9px] text-white/20 leading-tight">{sub}</span>}
    </div>
  );
}

// ─── Insight card (dashboard highlight) ──────────────────────────────────────

function InsightCard({
  icon, label, playerName, stat, statLabel, sub, context, slug, accentColor, dimStat,
}: {
  icon: React.ReactNode;
  label: string;
  playerName: string;
  stat: string | null;   // null = locked/gated
  statLabel: string;
  sub?: string;
  context?: string;
  slug: string;
  accentColor: string;
  dimStat?: boolean;
}) {
  const isLocked = stat === null;
  return (
    <Link
      to={`/sports/afl/players/${slug}`}
      className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] p-3 sm:p-4 hover:bg-white/[0.03] hover:border-white/[0.12] transition-all group flex flex-col gap-2"
      style={{ minWidth: 0, overflow: "hidden" }}
    >
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span style={{ color: accentColor, opacity: dimStat ? 0.7 : 1 }}>{icon}</span>
          <span className="text-[9px] uppercase tracking-widest text-white/28">{label}</span>
        </div>
        <ChevronRight size={10} className="text-white/12 group-hover:text-white/35 transition-colors" />
      </div>
      {/* player name */}
      <p className="text-[13px] font-semibold text-white/80 truncate group-hover:text-white transition-colors leading-tight">
        {playerName}
      </p>
      {/* key stat + label */}
      <div className="flex items-end justify-between gap-2">
        {isLocked ? (
          <LockedCell label="Neeko+" />
        ) : (
          <span
            className="text-[22px] font-black tabular-nums leading-none"
            style={{ color: dimStat ? 'rgba(255,255,255,0.35)' : accentColor }}
          >
            {stat}
          </span>
        )}
        <div className="text-right shrink-0">
          <span className="text-[8px] text-white/25 uppercase tracking-wide block leading-tight">{statLabel}</span>
          {sub && <span className="text-[8px] text-white/38 block leading-tight mt-0.5">{sub}</span>}
        </div>
      </div>
      {/* context line */}
      {context && (
        <p className="text-[9px] text-white/30 leading-snug border-t border-white/[0.05] pt-2 mt-auto">
          {context}
        </p>
      )}
    </Link>
  );
}

// ─── Roster depth chart ───────────────────────────────────────────────────────

function RosterDepthChart({
  players,
  accentColor,
  isPremium,
}: {
  players: TeamPlayer[];
  accentColor: string;
  isPremium: boolean;
}) {
  if (!isPremium) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
        <Lock size={16} className="text-amber-400/40" />
        <div>
          <p className="text-[11px] font-semibold text-white/40">Projection Depth Chart</p>
          <p className="text-[10px] text-white/25 mt-0.5 leading-snug">Per-player projected scores and signals.</p>
        </div>
        <Link to="/upgrade" className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-400 transition-colors px-3 py-1.5 text-[10px] font-black text-black">
          <Zap size={9} /> Unlock
        </Link>
      </div>
    );
  }
  const data = players
    .slice(0, 15)
    .map((p, i) => {
      const ac = (p.action_canonical ?? '').toUpperCase();
      const isStart = ac === 'START' || ac === 'SMASH_START';
      const isSit   = ac === 'SIT'   || ac === 'HARD_SIT';
      return {
        name: p.player_name.split(' ').slice(-1)[0], // last name only
        proj: p.projection != null ? Math.round(Number(p.projection)) : 0,
        avg:  p.season_avg  != null ? Math.round(Number(p.season_avg))  : 0,
        signal: isStart ? 'start' : isSit ? 'sit' : 'hold',
        rank: i + 1,
      };
    });

  const avg = data.length
    ? Math.round(data.reduce((s, d) => s + d.proj, 0) / data.length)
    : 0;

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="rounded-lg border border-white/[0.10] bg-[#111] px-3 py-2 text-[11px] shadow-xl">
        <p className="font-semibold text-white mb-0.5">{d.name}</p>
        <p className="text-white/55">Proj: <span className="text-white font-bold">{d.proj}</span></p>
        {d.avg > 0 && <p className="text-white/40">2026 avg: {d.avg}</p>}
      </div>
    );
  };

  return (
    <div style={{ width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box", overflowX: "hidden" }}>
      <div className="flex items-center justify-between mb-3" style={{ minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">Projection Depth</p>
          <p className="text-[9px] text-white/22 mt-0.5">Top 15 by projected score · squad average ref</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1 text-[8px] text-white/30">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: accentColor, opacity: 0.9 }} />
            Start
          </span>
          <span className="flex items-center gap-1 text-[8px] text-white/30">
            <span className="w-2 h-2 rounded-sm inline-block bg-white/20" />
            Hold
          </span>
          <span className="flex items-center gap-1 text-[8px] text-white/30">
            <span className="w-2 h-2 rounded-sm inline-block bg-orange-400/60" />
            Sit
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={185}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -26 }} barSize={13} barGap={2}>
          <XAxis
            dataKey="name"
            tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 8 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            width={28}
            tick={{ fill: 'rgba(255,255,255,0.22)', fontSize: 8 }}
            tickLine={false}
            axisLine={false}
            tickCount={4}
            domain={[0, 'dataMax + 10']}
          />
          <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          {avg > 0 && (
            <ReferenceLine
              y={avg}
              stroke="rgba(255,255,255,0.18)"
              strokeDasharray="4 3"
              label={{ value: `avg ${avg}`, fill: 'rgba(255,255,255,0.28)', fontSize: 8, position: 'insideTopRight' }}
            />
          )}
          <Bar dataKey="proj" radius={[3, 3, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.rank}
                fill={
                  entry.signal === 'start'
                    ? accentColor
                    : entry.signal === 'sit'
                    ? 'rgba(251,146,60,0.55)'
                    : 'rgba(255,255,255,0.18)'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Action mix donut chart ───────────────────────────────────────────────────

function ActionMixChart({
  startCt, holdCt, sitCt, hardSitCt, totalPlayers, isPremium,
}: {
  startCt: number; holdCt: number; sitCt: number; hardSitCt: number; totalPlayers: number; isPremium: boolean;
}) {
  if (!isPremium) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
        <Lock size={16} className="text-amber-400/40" />
        <div>
          <p className="text-[11px] font-semibold text-white/40">Signal Distribution</p>
          <p className="text-[10px] text-white/25 mt-0.5 leading-snug">Round action signals across the full squad.</p>
        </div>
        <Link to="/upgrade" className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-400 transition-colors px-3 py-1.5 text-[10px] font-black text-black">
          <Zap size={9} /> Unlock
        </Link>
      </div>
    );
  }
  const segments = [
    { label: 'Start',     count: startCt,              color: '#34d399', desc: 'Projection clears breakeven target' },
    { label: 'Hold',      count: holdCt - hardSitCt,   color: 'rgba(255,255,255,0.25)', desc: 'No decisive signal — monitor' },
    { label: 'Sit',       count: sitCt,                color: '#fb923c', desc: 'Projection falls below breakeven' },
    { label: 'Hard Sit',  count: hardSitCt,            color: '#ef4444', desc: 'Strong avoidance signal' },
  ].filter(s => s.count > 0);

  // SVG donut via stroke-dasharray
  const size  = 120;
  const cx    = size / 2;
  const cy    = size / 2;
  const r     = 46;
  const circ  = 2 * Math.PI * r;
  const gap   = 3; // px gap between segments

  let offset = -circ * 0.25; // start at top
  const rings = segments.map(s => {
    const pct  = totalPlayers > 0 ? s.count / totalPlayers : 0;
    const dash = Math.max(0, circ * pct - gap);
    const item = { ...s, pct, dash, offset };
    offset += circ * pct;
    return item;
  });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">Signal Distribution</p>
        <p className="text-[9px] text-white/22 mt-0.5">Round action signals across the full squad</p>
      </div>

      <div className="flex items-center gap-4" style={{ minWidth: 0 }}>
        {/* SVG donut */}
        <div className="shrink-0">
          <svg width={size} height={size}>
            {/* track */}
            <circle
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={14}
            />
            {/* segments */}
            {rings.map((s) => (
              <circle
                key={s.label}
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={14}
                strokeDasharray={`${s.dash} ${circ}`}
                strokeDashoffset={-s.offset}
                strokeLinecap="butt"
              />
            ))}
            {/* centre text */}
            <text x={cx} y={cy - 6} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize={18} fontWeight={900} fontFamily="inherit">
              {totalPlayers}
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(255,255,255,0.28)" fontSize={8} fontFamily="inherit" letterSpacing="1">
              PLAYERS
            </text>
          </svg>
        </div>

        {/* legend */}
        <div className="flex-1 min-w-0 space-y-2.5">
          {rings.map((s) => (
            <div key={s.label}>
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-[10px] text-white/55">{s.label}</span>
                </div>
                <span className="text-[11px] font-bold tabular-nums text-white/70">{s.count}</span>
              </div>
              <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${totalPlayers > 0 ? Math.round((s.count / totalPlayers) * 100) : 0}%`,
                    backgroundColor: s.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* insight line — signal counts are premium */}
    </div>
  );
}

// ─── Mini bar for form/value comparison ──────────────────────────────────────

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// ─── Line summary card (header stat strip for Squad Breakdown) ────────────────

const LINE_META: Record<string, { label: string; abbr: string; icon: React.ReactNode }> = {
  MID: { label: 'Midfielders', abbr: 'MID', icon: <Activity size={13} /> },
  DEF: { label: 'Defenders',   abbr: 'DEF', icon: <Shield size={13} /> },
  FWD: { label: 'Forwards',    abbr: 'FWD', icon: <TrendingUp size={13} /> },
  RUC: { label: 'Rucks',       abbr: 'RUC', icon: <Target size={13} /> },
};

function LineSummaryCard({
  lineKey, players, accentColor, isPremium,
}: {
  lineKey: string;
  players: TeamPlayer[];
  accentColor: string;
  isPremium: boolean;
}) {
  if (!players.length) return null;
  const meta     = LINE_META[lineKey] ?? { label: lineKey, abbr: lineKey, icon: null };
  const topPlayer = players[0];
  const avgProj   = Math.round(players.reduce((s, p) => s + (p.projection ?? 0), 0) / players.length);
  const startCt   = players.filter(p => {
    const ac = (p.action_canonical ?? '').toUpperCase();
    return ac === 'START' || ac === 'SMASH_START';
  }).length;
  const sitCt = players.filter(p => {
    const ac = (p.action_canonical ?? '').toUpperCase();
    return ac === 'SIT' || ac === 'HARD_SIT';
  }).length;
  const holdCt = players.length - startCt - sitCt;

  // signal bar widths
  const total = players.length || 1;
  const startPct = Math.round((startCt / total) * 100);
  const sitPct   = Math.round((sitCt   / total) * 100);
  const holdPct  = 100 - startPct - sitPct;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] overflow-hidden flex flex-col">
      {/* ── line header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]"
        style={{ background: `linear-gradient(90deg, ${accentColor}10 0%, transparent 100%)` }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: accentColor }}>{meta.icon}</span>
          <span className="text-[12px] font-bold text-white/80 tracking-wide">{meta.label}</span>
        </div>
        <span
          className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded"
          style={{ color: accentColor, background: `${accentColor}18` }}
        >
          {meta.abbr}
        </span>
      </div>

      {/* ── 4 key metrics ── */}
      <div className="grid grid-cols-4 divide-x divide-white/[0.04] border-b border-white/[0.05]">
        {[
          { label: 'Players', value: players.length, color: undefined, locked: false },
          { label: 'Avg Proj', value: avgProj,        color: undefined, locked: !isPremium },
          { label: 'Start',   value: startCt,         color: startCt > 0 ? '#34d399' : undefined, locked: !isPremium },
          { label: 'Sit',     value: sitCt,           color: sitCt   > 0 ? '#fb923c' : undefined, locked: !isPremium },
        ].map(({ label, value, color, locked }) => (
          <div key={label} className="flex flex-col items-center py-2.5 gap-0.5">
            {locked ? (
              <Lock size={10} className="text-amber-400/35 mb-0.5" />
            ) : (
              <span
                className="text-[16px] font-black tabular-nums leading-none"
                style={color ? { color } : { color: 'rgba(255,255,255,0.70)' }}
              >
                {value}
              </span>
            )}
            <span className="text-[7px] uppercase tracking-widest text-white/25 leading-tight text-center">{label}</span>
          </div>
        ))}
      </div>

      {/* ── signal bar ── */}
      <div className="px-4 py-2.5 border-b border-white/[0.04] space-y-1.5">
        <span className="text-[7px] uppercase tracking-widest text-white/22">Action signals</span>
        {isPremium ? (
          <>
            <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
              {startPct > 0 && <div className="rounded-l-full" style={{ width: `${startPct}%`, backgroundColor: '#34d399' }} />}
              {holdPct  > 0 && <div style={{ width: `${holdPct}%`,  backgroundColor: 'rgba(255,255,255,0.15)' }} />}
              {sitPct   > 0 && <div className="rounded-r-full" style={{ width: `${sitPct}%`,   backgroundColor: '#fb923c' }} />}
            </div>
            <div className="flex items-center gap-3">
              {startCt > 0 && <span className="text-[8px] text-emerald-400/70">{startCt} Start</span>}
              <span className="text-[8px] text-white/25">{holdCt} Hold</span>
              {sitCt > 0   && <span className="text-[8px] text-orange-400/70">{sitCt} Sit</span>}
            </div>
          </>
        ) : (
          <div className="h-1.5 rounded-full bg-white/[0.06] flex items-center justify-center">
            <Lock size={8} className="text-amber-400/30" />
          </div>
        )}
      </div>

      {/* ── top player callout ── */}
      {topPlayer && (
        <Link
          to={`/sports/afl/players/${nameToSlug(topPlayer.player_name)}`}
          className="flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.03] transition-colors group"
        >
          <div className="min-w-0">
            <p className="text-[8px] uppercase tracking-widest text-white/22 mb-0.5">Leading scorer</p>
            <p className="text-[12px] font-semibold text-white/75 group-hover:text-white transition-colors truncate">
              {topPlayer.player_name}
            </p>
            <p className="text-[8px] text-white/30 mt-0.5">
              {posAbbr(topPlayer.position)}
              {topPlayer.price != null ? ` · ${fmtPrice(topPlayer.price)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isPremium ? (
              <div className="text-right">
                <p className="text-[15px] font-black tabular-nums leading-none" style={{ color: accentColor }}>
                  {fmtProj(topPlayer.projection)}
                </p>
                <p className="text-[7px] text-white/22 uppercase tracking-wide">proj</p>
              </div>
            ) : (
              <LockedCell />
            )}
            <ChevronRight size={11} className="text-white/12 group-hover:text-white/38 transition-colors" />
          </div>
        </Link>
      )}
    </div>
  );
}

// ─── Line detail rows (expandable player list per line) ────────────────────────

function LineDetailRows({
  lineKey, players, accentColor, isPremium,
}: {
  lineKey: string;
  players: TeamPlayer[];
  accentColor: string;
  isPremium: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!players.length) return null;
  const meta    = LINE_META[lineKey] ?? { label: lineKey, abbr: lineKey, icon: null };
  const maxProj = Math.max(...players.map(p => p.projection ?? 0)) || 1;
  const visible = expanded ? players : players.slice(0, 5);

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] overflow-hidden">
      {/* section label */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3.5 rounded-full" style={{ backgroundColor: accentColor, opacity: 0.7 }} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">{meta.label}</span>
          <span className="text-[9px] text-white/22">{players.length}</span>
        </div>
        {players.length > 5 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[8px] text-white/28 hover:text-white/55 transition-colors uppercase tracking-wide"
          >
            {expanded ? 'Show less' : `+${players.length - 5} more`}
          </button>
        )}
      </div>
      <div className="divide-y divide-white/[0.03]">
        {visible.map(p => {
          const proj = p.projection ?? 0;
          return (
            <Link
              key={p.player_id ?? p.player_name}
              to={`/sports/afl/players/${nameToSlug(p.player_name)}`}
              className="flex items-center gap-3 px-3 py-2 sm:px-4 sm:py-2.5 hover:bg-white/[0.03] transition-colors group"
            >
              <ActionIcon action={isPremium ? p.action_canonical : null} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[12px] font-semibold text-white/78 group-hover:text-white transition-colors truncate">
                    {p.player_name}
                  </span>
                  <PlayerStatusPill
                    row={{
                      status: p.status ?? null,
                      manual_status: null,
                      is_bye: p.is_bye ?? null,
                      bye_next_round: null,
                      bye_round: null,
                    }}
                    showUpcomingBye
                  />
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] text-white/28">{fmtPrice(p.price)}</span>
                  {isPremium
                    ? p.breakeven != null && (
                        <span className="text-[9px] text-white/22">BE {Math.round(p.breakeven)}</span>
                      )
                    : <LockedField size="xs" />
                  }
                  <MiniBar value={isPremium ? proj : 0} max={maxProj} color={accentColor} />
                </div>
              </div>
              <div className="text-right shrink-0">
                {isPremium ? (
                  <>
                    <span className="text-[13px] font-bold tabular-nums text-white/72">{fmtProj(p.projection)}</span>
                    <p className="text-[7px] text-white/20 uppercase tracking-wide">proj</p>
                  </>
                ) : (
                  <LockedCell />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Compact roster row ───────────────────────────────────────────────────────

// Shared column widths — single source of truth used by both header and row
const COL = {
  rank:   'w-5 shrink-0 hidden sm:block',
  icon:   'w-4 shrink-0',
  pos:    'w-9 shrink-0 hidden sm:block',
  price:  'w-14 shrink-0 hidden sm:block',
  be:     'w-12 shrink-0 hidden md:block',
  edge:   'w-12 shrink-0 hidden md:block',
  proj:   'w-10 shrink-0',
  signal: 'w-16 shrink-0',
  chev:   'w-3 shrink-0',
};

/** Two-line metric cell: value on top, sub-label below — same height as LockedCell */
function MetricCell({ value, label, colorCls = 'text-white/45' }: { value: string; label: string; colorCls?: string }) {
  return (
    <div className="text-right">
      <p className={`text-[10px] font-semibold tabular-nums leading-tight ${colorCls}`}>{value}</p>
      <p className="text-[7px] text-white/18 uppercase tracking-wider leading-tight mt-0.5">{label}</p>
    </div>
  );
}

function RosterRow({ player, rank, isPremium }: { player: TeamPlayer; rank: number; isPremium: boolean }) {
  const slug = nameToSlug(player.player_name);
  const pos  = posAbbr(player.position);

  return (
    <Link
      to={`/sports/afl/players/${slug}`}
      className="flex items-center gap-3 rounded-xl bg-[#0d0d0d] border border-white/[0.05] hover:bg-white/[0.03] hover:border-white/[0.10] transition-all duration-150 px-3 py-2.5 sm:px-4 sm:py-3 group"
    >
      {/* rank */}
      <span className={`${COL.rank} text-[9px] font-bold text-white/16 text-center tabular-nums`}>
        {rank}
      </span>

      {/* action icon — direction only, not the labelled badge */}
      <span className={COL.icon}>
        <ActionIcon action={isPremium ? player.action_canonical : null} />
      </span>

      {/* name + status — fills remaining space */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[13px] font-semibold text-white/80 truncate group-hover:text-white transition-colors leading-tight">
            {player.player_name}
          </p>
          <PlayerStatusPill
            row={{
              status: player.status ?? null,
              manual_status: null,
              is_bye: player.is_bye ?? null,
              bye_next_round: null,
              bye_round: null,
            }}
            showUpcomingBye
          />
        </div>
        {/* mobile sub-line — shows pos + price when columns are hidden */}
        <p className="sm:hidden text-[9px] text-white/28 mt-0.5 tabular-nums">
          {pos} · {fmtPrice(player.price)}
        </p>
      </div>

      {/* pos — desktop only */}
      <span className={`${COL.pos} text-[9px] font-medium text-white/30 text-center tracking-wide`}>
        {pos}
      </span>

      {/* price — desktop only, always visible */}
      <span className={`${COL.price} text-[10px] text-white/38 text-right tabular-nums`}>
        {fmtPrice(player.price)}
      </span>

      {/* breakeven — desktop, premium only */}
      <div className={`${COL.be} flex items-center justify-end`}>
        {isPremium
          ? <MetricCell value={player.breakeven != null ? String(Math.round(player.breakeven)) : '—'} label="BE" />
          : <LockedCell />
        }
      </div>

      {/* edge — desktop, premium only */}
      <div className={`${COL.edge} flex items-center justify-end`}>
        {isPremium
          ? <MetricCell
              value={player.edge_canonical != null ? fmtEdge(player.edge_canonical) : '—'}
              label="Edge"
              colorCls={player.edge_canonical != null ? getEdgeColor(player.edge_canonical) : 'text-white/28'}
            />
          : <LockedCell />
        }
      </div>

      {/* projection — premium only */}
      <div className={`${COL.proj} flex items-center justify-end`}>
        {isPremium ? (
          <div className="text-right">
            <p className="text-[14px] font-bold tabular-nums text-white/78 leading-tight">{fmtProj(player.projection)}</p>
            <p className="text-[7px] text-white/20 uppercase tracking-wider leading-tight mt-0.5">proj</p>
          </div>
        ) : (
          <LockedCell />
        )}
      </div>

      {/* action badge — premium; free gets locked pill */}
      <div className={`${COL.signal} flex justify-end`}>
        {isPremium
          ? <ActionBadge action={player.action_canonical} actionDisplay={player.action_display} />
          : <LockedCell label="Signal" />
        }
      </div>

      <ChevronRight size={11} className={`${COL.chev} text-white/12 group-hover:text-white/38 transition-colors`} />
    </Link>
  );
}

// ─── Roster section with line filters and freemium gating ────────────────────

const LINE_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'MID', label: 'MID' },
  { key: 'DEF', label: 'DEF' },
  { key: 'FWD', label: 'FWD' },
  { key: 'RUC', label: 'RUC' },
] as const;

type LineFilter = typeof LINE_FILTERS[number]['key'];

const FREE_ROSTER_LIMIT = 8;

function RosterSection({
  players, isPremium, teamName, accentColor,
}: {
  players: TeamPlayer[];
  isPremium: boolean;
  teamName: string;
  accentColor: string;
}) {
  const [activeFilter, setActiveFilter] = useState<LineFilter>('ALL');

  const filtered = useMemo(() => {
    if (activeFilter === 'ALL') return players;
    return players.filter(p => {
      const pg = (p.position_group ?? p.position ?? '').toUpperCase();
      if (activeFilter === 'MID') return pg.startsWith('MID') || pg === 'C';
      if (activeFilter === 'DEF') return pg.startsWith('DEF') || pg === 'D';
      if (activeFilter === 'FWD') return pg.startsWith('FWD') || pg === 'F';
      if (activeFilter === 'RUC') return pg === 'RUC' || pg === 'R';
      return true;
    });
  }, [players, activeFilter]);

  const hasRucks = players.some(p => {
    const pg = (p.position_group ?? p.position ?? '').toUpperCase();
    return pg === 'RUC' || pg === 'R';
  });

  // free users: show first 8, then gate
  const visibleRows = isPremium ? filtered : filtered.slice(0, FREE_ROSTER_LIMIT);
  const gatedCount  = !isPremium && filtered.length > FREE_ROSTER_LIMIT
    ? filtered.length - FREE_ROSTER_LIMIT
    : 0;

  // column header labels — widths mirror COL constants in RosterRow
  const colHeaders: { label: string; className: string }[] = [
    { label: '',                          className: COL.rank },              // rank spacer
    { label: '',                          className: COL.icon },              // icon spacer
    { label: 'Player',                    className: 'flex-1 text-left' },
    { label: 'Pos',                       className: `${COL.pos} text-center` },
    { label: 'Price',                     className: `${COL.price} text-right` },
    { label: isPremium ? 'BE'     : '',   className: `${COL.be} text-right` },
    { label: isPremium ? 'Edge'   : '',   className: `${COL.edge} text-right` },
    { label: isPremium ? 'Proj' : '',      className: `${COL.proj} text-right` },
    { label: isPremium ? 'Signal' : '',   className: `${COL.signal} text-right` },
    { label: '',                          className: COL.chev },              // chevron spacer
  ];

  return (
    <div>
      {/* section header + filters */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-white/25"><Users size={13} /></span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">Roster Outlook</span>
      </div>
      {/* line filter chips — scrollable on mobile */}
      <div className="flex overflow-x-auto gap-1.5 mb-3 pb-0.5 no-scrollbar">
        {LINE_FILTERS.filter(f => f.key !== 'RUC' || hasRucks).map(f => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={[
              'shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all',
              activeFilter === f.key
                ? 'text-black'
                : 'text-white/35 bg-white/[0.04] border border-white/[0.07] hover:text-white/60 hover:bg-white/[0.07]',
            ].join(' ')}
            style={activeFilter === f.key ? { backgroundColor: accentColor, border: `1px solid ${accentColor}` } : {}}
          >
            {f.label}
          </button>
        ))}
      </div>

      {players.length === 0 ? (
        <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] px-4 py-8 text-center">
          <p className="text-sm text-white/40">No player data available yet.</p>
          <p className="text-[11px] text-white/25 mt-1">Check back after round data is processed.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] overflow-hidden" style={{ minWidth: 0, width: "100%", boxSizing: "border-box" }}>
          {/* column header row */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-white/[0.05]">
            {colHeaders.map((h, i) => (
              <span
                key={i}
                className={`text-[7px] uppercase tracking-widest text-white/22 ${h.className}`}
              >
                {h.label}
              </span>
            ))}
          </div>

          {/* visible rows */}
          <div className="divide-y divide-white/[0.03]">
            {visibleRows.map((player, idx) => (
              <RosterRow
                key={player.player_id ?? player.player_name}
                player={player}
                rank={idx + 1}
                isPremium={isPremium}
              />
            ))}
          </div>

          {/* freemium gate */}
          {gatedCount > 0 && (
            <>
              {/* blurred ghost rows */}
              <div className="relative overflow-hidden">
                <div className="divide-y divide-white/[0.03] pointer-events-none select-none" aria-hidden>
                  {filtered.slice(FREE_ROSTER_LIMIT, FREE_ROSTER_LIMIT + 3).map((player, idx) => (
                    <div
                      key={player.player_id ?? player.player_name}
                      className="flex items-center gap-3 px-4 py-2.5 opacity-30 blur-[2px]"
                    >
                      <span className="text-[10px] text-white/18 w-4">{FREE_ROSTER_LIMIT + idx + 1}</span>
                      <div className="w-3 h-3 rounded-full bg-white/10 shrink-0" />
                      <div className="flex-1 h-3 rounded bg-white/8" />
                      <div className="w-12 h-3 rounded bg-white/8" />
                      <div className="w-8 h-3 rounded bg-white/8" />
                    </div>
                  ))}
                </div>
                {/* gradient fade */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0d0d0d]/60 to-[#0d0d0d]" />
              </div>

              {/* unlock block */}
              <div className="px-4 pt-2 pb-5 text-center border-t border-white/[0.05] space-y-3">
                <div className="flex items-center justify-center gap-1.5">
                  <Lock size={13} className="text-amber-400/70" />
                  <p className="text-[12px] font-semibold text-white/60">
                    {gatedCount} more {teamName.split(' ')[0]} players in the full squad
                  </p>
                </div>
                <p className="text-[10px] text-white/32 leading-relaxed max-w-[280px] mx-auto">
                  Upgrade for the complete roster — projection model, scoring range, value signals and player intelligence.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Link
                    to="/upgrade"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-4 py-2 text-[12px] font-bold text-black"
                  >
                    <Zap size={12} />
                    Unlock Neeko+
                  </Link>
                  <Link
                    to="/auth"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors px-4 py-2 text-[12px] text-white/45 hover:text-white"
                  >
                    Sign in
                  </Link>
                </div>
              </div>
            </>
          )}

          {/* premium: empty filter result */}
          {isPremium && filtered.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-[12px] text-white/35">No {activeFilter} players listed for this squad.</p>
            </div>
          )}

          {/* premium: result count footer */}
          {isPremium && filtered.length > 0 && (
            <div className="px-4 py-2 border-t border-white/[0.05] flex items-center justify-between">
              <span className="text-[8px] text-white/20 uppercase tracking-widest">
                {filtered.length} player{filtered.length !== 1 ? 's' : ''}
                {activeFilter !== 'ALL' ? ` · ${activeFilter}` : ''}
              </span>
              <span className="text-[8px] text-white/20 uppercase tracking-widest">ordered by projected score</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Premium CTA ──────────────────────────────────────────────────────────────

function PremiumCTA({ teamName }: { teamName: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.05] to-[#0d0d0d] p-6 text-center">
      <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 mx-auto mb-3">
        <Lock size={16} className="text-amber-400" />
      </div>
      <h3 className="text-[15px] font-bold text-white mb-1">
        Full {teamName} squad
      </h3>
      <p className="text-[11px] text-white/40 mb-4 leading-relaxed">
        Unlock projection model, scoring range, value signals and player intelligence for every player.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <Link
          to="/upgrade"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-5 py-2.5 text-[13px] font-bold text-black"
        >
          <Zap size={13} />
          Unlock Neeko+
        </Link>
        <Link
          to="/auth"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] transition-colors px-5 py-2.5 text-[13px] text-white/55 hover:text-white"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}

// ─── Related links / SEO section ─────────────────────────────────────────────

function TeamSEOBlock({ teamName, teamSlug, players, isPremium }: { teamName: string; teamSlug: string; players: TeamPlayer[]; isPremium: boolean }) {
  const shortName = teamName.split(' ')[0];
  const isHistoric = ['Adelaide', 'Hawthorn', 'Geelong', 'Richmond', 'Carlton', 'Collingwood'].includes(shortName);

  const top5Names = players.slice(0, 5).map(p => p.player_name).join(', ');
  const topPlayer = players[0];

  return (
    <section className="border-t border-white/[0.05] pt-6 pb-4 space-y-4">
      <h2 className="text-[12px] font-bold text-white/28 leading-snug">
        {teamName} — 2026 AFL Season Stats &amp; Analysis
      </h2>

      <div className="space-y-3 text-[11px] text-white/26 leading-relaxed">
        <p>
          The {teamName} are one of the AFL's {isHistoric ? 'most historic' : 'competitive'} clubs.
          This page tracks every {teamName} player's fantasy value, price, and scoring profile for the 2026 AFL season.
          {topPlayer && ` ${topPlayer.player_name} is the top-ranked player in the ${teamName} squad.`}
        </p>

        <p>
          Top {teamName} players by fantasy ranking: {top5Names}.
          Rankings are calculated using recent form, matchup difficulty, venue factors, and price efficiency —
          updated weekly following each AFL round.
        </p>

        <p>
          Each player's profile is computed using Neeko's statistical model — combining season averages,
          last-3-match form, opponent position concession rates, venue multipliers, and role stability signals.
          View the full{' '}
          <Link to="/fantasy/rankings" className="text-white/36 hover:text-white/55 transition-colors underline underline-offset-2 decoration-white/14">AFL Rankings</Link>
          ,{' '}
          <Link to="/fantasy/market-watch" className="text-white/36 hover:text-white/55 transition-colors underline underline-offset-2 decoration-white/14">Market Watch</Link>
          , or{' '}
          <Link to="/fantasy/current-week" className="text-white/36 hover:text-white/55 transition-colors underline underline-offset-2 decoration-white/14">Edge Board</Link>
          {' '}for league-wide analysis.
        </p>
      </div>

      <p className="sr-only">
        Complete {teamName} AFL player stats, price analysis and fantasy rankings
        for the 2026 AFL season. Includes every {teamName} player with scoring profiles, price data
        and squad depth — updated weekly. Top {teamName} players: {top5Names}.
      </p>
    </section>
  );
}

// ─── Price change indicator ───────────────────────────────────────────────────

function PriceChange({ change }: { change: number | null }) {
  if (change == null || change === 0) return null;
  const up = change > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold tabular-nums ${up ? 'text-emerald-400' : 'text-red-400/80'}`}>
      {up ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
      {fmtPrice(Math.abs(change))}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AFLTeamPage() {
  const { team } = useParams<{ team: string }>();
  const teamName = team ? TEAM_SLUG_TO_NAME[team] : '';
  const navigate = useNavigate();
  const { isPremium } = useAccessState();
  const { user } = useAuth();

  const [players, setPlayers] = useState<TeamPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const { intelligence: teamIntelligence, loading: teamIntelligenceLoading } = useTeamIntelligence(teamName || null);

  useEffect(() => {
    if (!teamName) { setError(true); setLoading(false); return; }
    (async () => {
      try {
        const data = await getTeamPlayersSafe(teamName, user?.id ?? null);
        const mapped = ((data ?? []) as any[]).map((r: any): TeamPlayer => ({
          player_id:       r.player_id ?? null,
          player_name:     r.player_name ?? '',
          team:            r.team ?? r.team_name ?? null,
          position:        r.player_position ?? r.position ?? null,
          position_group:  r.position_group ?? null,
          price:           r.price != null ? Number(r.price) : null,
          prev_price:      r.prev_price != null ? Number(r.prev_price) : null,
          price_change:    r.price_change != null ? Number(r.price_change) : null,
          projection:      r.projection != null ? Number(r.projection) : null,
          ceiling_estimate: r.ceiling_estimate != null ? Number(r.ceiling_estimate) : null,
          floor_estimate:  r.floor_estimate != null ? Number(r.floor_estimate) : null,
          breakeven:       r.breakeven != null ? Number(r.breakeven) : null,
          value_score:     r.value_score != null ? Number(r.value_score) : null,
          edge_canonical:  r.edge_canonical != null ? Number(r.edge_canonical) : (r.edge != null ? Number(r.edge) : null),
          neeko_rating:    r.neeko_rating != null ? Number(r.neeko_rating) : null,
          consistency:     r.consistency != null ? Number(r.consistency) : null,
          form_score:      r.form_score != null ? Number(r.form_score) : null,
          season_avg:      r.season_avg != null ? Number(r.season_avg) : null,
          last_3_avg:      r.last_3_avg != null ? Number(r.last_3_avg) : null,
          last_5_avg:      r.last_5_avg != null ? Number(r.last_5_avg) : null,
          signal:          r.signal ?? null,
          signal_display:  r.signal_display ?? null,
          action_canonical: r.action_canonical != null ? String(r.action_canonical).toUpperCase() : (r.action != null ? String(r.action).toUpperCase() : null),
          action_display:  r.action_display ?? null,
          why:             r.why ?? null,
          action_reason_1: r.action_reason_1 ?? null,
          action_reason_2: r.action_reason_2 ?? null,
          matchup_label:   r.matchup_label ?? null,
          status:          r.status ?? null,
          is_bye:          r.is_bye != null ? Boolean(r.is_bye) : null,
          is_injured:      r.is_injured != null ? Boolean(r.is_injured) : null,
          games_played:    r.games_played != null ? Number(r.games_played) : null,
          is_locked:       r.is_locked != null ? Boolean(r.is_locked) : null,
        }));
        setPlayers(mapped);
        setLoading(false);
      } catch (err) {
        console.error('TEAM QUERY FAILED:', teamName, err);
        setError(true);
        setLoading(false);
      }
    })();
  }, [teamName, user?.id]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!players.length) return {
      totalPlayers: 0, topProj: 0, avgProj: 0, avgSeasonAvg: 0,
      topPlayer: null, mostExpensivePlayer: null, topValuePlayer: null,
      worstValuePlayer: null, bestBudgetPlayer: null, premiumCount: 0, premiumAvgProj: 0,
      startCt: 0, sitCt: 0, holdCt: 0, hardSitCt: 0,
      avgFormScore: 0, avgConsistency: 0,
    };

    const active = players.filter(p => !p.is_injured && !p.is_bye);
    const projValues = players.map(p => Number(p.projection) || 0);
    const topProj = Math.max(...projValues);
    const avgProj = Math.round(projValues.reduce((a, b) => a + b, 0) / players.length);

    const seasonAvgs = players.map(p => p.season_avg ?? 0).filter(v => v > 0);
    const avgSeasonAvg = seasonAvgs.length
      ? Math.round(seasonAvgs.reduce((a, b) => a + b, 0) / seasonAvgs.length)
      : 0;

    const topPlayer = players[0];
    const mostExpensivePlayer = [...players].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0))[0];

    // Best value: highest value_score among active players (start signals preferred)
    const topValuePlayer = [...active]
      .filter(p => p.value_score != null)
      .sort((a, b) => (Number(b.value_score) || 0) - (Number(a.value_score) || 0))[0] ?? null;

    // Worst value / trap: lowest value_score with a meaningful price (>200k)
    const worstValuePlayer = [...active]
      .filter(p => p.value_score != null && (p.price ?? 0) > 200000)
      .sort((a, b) => (Number(a.value_score) || 0) - (Number(b.value_score) || 0))[0] ?? null;

    // Best budget: highest projection among players priced under $450k
    const BUDGET_CEILING = 450000;
    const bestBudgetPlayer = [...active]
      .filter(p => (p.price ?? 0) > 0 && (p.price ?? 0) < BUDGET_CEILING)
      .sort((a, b) => (Number(b.projection) || 0) - (Number(a.projection) || 0))[0] ?? null;

    // Premium count: players priced above $700k
    const PREMIUM_FLOOR = 700000;
    const premiumPlayers = players.filter(p => (p.price ?? 0) >= PREMIUM_FLOOR);
    const premiumCount = premiumPlayers.length;
    const premiumAvgProj = premiumPlayers.length
      ? Math.round(premiumPlayers.reduce((s, p) => s + (p.projection ?? 0), 0) / premiumPlayers.length)
      : 0;

    const startCt = players.filter(p => {
      const ac = (p.action_canonical ?? '').toUpperCase();
      return ac === 'START' || ac === 'SMASH_START';
    }).length;
    const hardSitCt = players.filter(p =>
      (p.action_canonical ?? '').toUpperCase() === 'HARD_SIT'
    ).length;
    const sitCt = players.filter(p => {
      const ac = (p.action_canonical ?? '').toUpperCase();
      return ac === 'SIT' || ac === 'HARD_SIT';
    }).length;
    const holdCt = players.length - startCt - sitCt;

    const formScores = players.map(p => p.form_score ?? 0).filter(v => v > 0);
    const avgFormScore = formScores.length
      ? Math.round(formScores.reduce((a, b) => a + b, 0) / formScores.length)
      : 0;

    const consistencyVals = players.map(p => p.consistency ?? 0).filter(v => v > 0);
    const avgConsistency = consistencyVals.length
      ? Math.round(consistencyVals.reduce((a, b) => a + b, 0) / consistencyVals.length)
      : 0;

    return {
      totalPlayers: players.length, topProj: Math.round(topProj), avgProj, avgSeasonAvg,
      topPlayer, mostExpensivePlayer, topValuePlayer,
      worstValuePlayer, bestBudgetPlayer, premiumCount, premiumAvgProj,
      startCt, sitCt, holdCt, hardSitCt,
      avgFormScore, avgConsistency,
    };
  }, [players]);

  // ── Line groups ────────────────────────────────────────────────────────────
  const lineGroups = useMemo(() => {
    const groups: Record<string, TeamPlayer[]> = { MID: [], DEF: [], FWD: [], RUC: [] };
    players.forEach(p => {
      const pg = (p.position_group ?? p.position ?? '').toUpperCase();
      if (pg.includes('MID')) groups.MID.push(p);
      else if (pg.includes('DEF')) groups.DEF.push(p);
      else if (pg.includes('FWD')) groups.FWD.push(p);
      else if (pg.includes('RUC') || pg.includes('RK')) groups.RUC.push(p);
      else groups.MID.push(p); // fallback
    });
    return groups;
  }, [players]);

  const accentColor = getTeamAccentColour(teamName.split(' ')[0]) ?? '#4ade80';
  const accentSafe  = accentColor === '#FFD200' ? '#F5C84C' : accentColor;


  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-dvh bg-[#080808]">
        <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-8 py-6 space-y-4">
          <div className="h-4 w-16 rounded bg-white/[0.05] animate-pulse" />
          <div className="h-44 rounded-2xl bg-white/[0.04] animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl bg-white/[0.04] animate-pulse" />)}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1,2,3].map(i => <div key={i} className="h-28 rounded-xl bg-white/[0.04] animate-pulse" />)}
          </div>
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-14 rounded-xl bg-white/[0.04] animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error || !teamName) {
    return (
      <div className="min-h-dvh bg-[#080808] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <AlertCircle size={40} className="text-white/20 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Team Not Found</h2>
          <p className="text-white/40 mb-6 text-sm">Could not load data for: {teamName || team}</p>
          <button
            onClick={() => navigate('/sports/afl/teams')}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <ArrowLeft size={15} />
            All Teams
          </button>
        </div>
      </div>
    );
  }

  const shortName   = teamName.split(' ')[0];
  const pageTitle   = `${teamName} — AFL Fantasy Intelligence 2026 | Neeko`;
  const pageDescription = `${teamName} squad analysis for AFL Fantasy 2026. Fantasy prices, breakeven targets, and scoring data for all ${stats.totalPlayers} players — updated each round.`;
  const pageUrl     = `https://neekostats.com.au/sports/afl/teams/${team}`;

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description"         content={pageDescription} />
        <meta name="keywords"            content={`${teamName}, AFL Fantasy, AFL Fantasy 2026, ${teamName} players, fantasy projections, start sit hold, captain picks, ${teamName} fantasy tips 2026, ${shortName} AFL Fantasy`} />
        <meta property="og:title"        content={pageTitle} />
        <meta property="og:description"  content={pageDescription} />
        <meta property="og:type"         content="website" />
        <meta property="og:url"          content={pageUrl} />
        <meta property="og:site_name"    content="Neeko Sports Stats" />
        <link rel="canonical"            href={pageUrl} />
        <meta name="robots"              content="index, follow" />
        <meta property="og:image"         content="https://neekostats.com.au/og-default.png" />
        <meta property="og:image:width"  content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:title"       content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <meta name="twitter:image"       content="https://neekostats.com.au/og-default.png" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: pageTitle,
          description: pageDescription,
          url: pageUrl,
          dateModified: new Date().toISOString().slice(0, 10),
          publisher: { '@type': 'Organization', name: 'Neeko Sports', url: 'https://neekostats.com.au' },
          breadcrumb: {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home',         item: 'https://neekostats.com.au' },
              { '@type': 'ListItem', position: 2, name: 'AFL Rankings', item: 'https://neekostats.com.au/fantasy/rankings' },
              { '@type': 'ListItem', position: 3, name: teamName,       item: pageUrl },
            ],
          },
        })}</script>
      </Helmet>

      <div className="min-h-dvh bg-[#080808] overflow-x-hidden">
        <div className="mx-auto w-full max-w-[1120px] px-3 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4 sm:space-y-7" style={{ minWidth: 0, boxSizing: "border-box" }}>

          {/* Back nav */}
          <button
            onClick={() => navigate('/sports/afl/teams')}
            className="flex items-center gap-1.5 text-white/35 hover:text-white/65 transition-colors text-[11px]"
          >
            <ArrowLeft size={13} />
            All Teams
          </button>

          {/* ══════════════════════════════════════════
              HERO
          ══════════════════════════════════════════ */}
          <div
            className="rounded-2xl border border-white/[0.07] relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${accentSafe}16 0%, #0a0a0a 60%)` }}
          >
            {/* ambient glow layers */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at top left, ${accentSafe}20 0%, transparent 52%)` }}
            />
            <div
              className="absolute bottom-0 right-0 w-64 h-64 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at bottom right, ${accentSafe}08 0%, transparent 70%)` }}
            />

            <div className="relative px-3 sm:px-8 pt-4 sm:pt-6 pb-0">

              {/* ── top row: eyebrow / title / badge ── */}
              <div className="flex items-start justify-between gap-3 mb-3 sm:mb-5">
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-widest text-white/28 mb-1.5 sm:mb-2">
                    AFL Fantasy 2026 · Squad Intelligence
                  </p>
                  <h1 className="text-[22px] sm:text-[34px] font-black text-white leading-tight tracking-tight">
                    {teamName}
                  </h1>
                  <p className="hidden sm:block text-[12px] text-white/42 mt-1.5 leading-snug max-w-sm">
                    Recent scoring profile, player depth, role balance, form trends and squad output — refreshed weekly.
                  </p>
                </div>
                {/* accent badge */}
                <div
                  className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-2xl shrink-0 mt-0.5"
                  style={{ background: `${accentSafe}18`, border: `1.5px solid ${accentSafe}35` }}
                >
                  <Users size={20} style={{ color: accentSafe }} />
                </div>
              </div>

              {/* ── 6-metric stat grid ── */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2 mb-3 sm:mb-5">
                {[
                  { label: 'Squad Size',    value: stats.totalPlayers,                          accent: undefined,                                        locked: false },
                  { label: 'Ceiling',       value: stats.topProj,                               accent: '#34d399',                                        locked: !isPremium },
                  { label: 'Avg Proj',      value: stats.avgProj,                               accent: undefined,                                        locked: !isPremium },
                  { label: 'Season Avg',    value: stats.avgSeasonAvg,                          accent: undefined,                                        locked: false },
                  { label: 'Start',         value: stats.startCt,                               accent: stats.startCt > 0 ? '#34d399' : undefined,        locked: !isPremium },
                  { label: 'Sit / Hold',    value: `${stats.sitCt} / ${stats.holdCt}`,          accent: stats.sitCt > 3 ? '#fb923c' : undefined,          locked: !isPremium },
                ].map(({ label, value, accent, locked }) => (
                  <div
                    key={label}
                    className="flex flex-col gap-0.5 px-2 py-2 sm:px-3 sm:py-2.5 rounded-xl border border-white/[0.06] bg-black/25"
                  >
                    {locked ? (
                      <span className="flex items-center gap-1 text-[13px] sm:text-[16px] leading-none">
                        <Lock size={11} className="text-amber-400/40 shrink-0" />
                      </span>
                    ) : (
                      <span
                        className="text-[16px] sm:text-[20px] font-black tabular-nums leading-none"
                        style={accent ? { color: accent } : { color: 'rgba(255,255,255,0.82)' }}
                      >
                        {value}
                      </span>
                    )}
                    <span className="text-[7px] sm:text-[8px] uppercase tracking-widest text-white/25 leading-tight">{label}</span>
                  </div>
                ))}
              </div>

              {/* ── top 3 mini-player strip ── */}
              {players.length > 0 && (
                <div className="border-t border-white/[0.06] py-3 flex items-center gap-1 overflow-x-auto scrollbar-hide">
                  <span className="text-[8px] uppercase tracking-widest text-white/22 shrink-0 mr-2">Top scorers</span>
                  {players.slice(0, 3).map((p, i) => {
                    const slug = nameToSlug(p.player_name);
                    const ac   = (p.action_canonical ?? '').toUpperCase();
                    const isStart = ac === 'START' || ac === 'SMASH_START';
                    const isSit   = ac === 'SIT'   || ac === 'HARD_SIT';
                    const signalColor = isStart ? '#34d399' : isSit ? '#fb923c' : 'rgba(255,255,255,0.35)';
                    return (
                      <Link
                        key={p.player_id ?? p.player_name}
                        to={`/sports/afl/players/${slug}`}
                        className="flex items-center gap-2.5 shrink-0 rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all px-3 py-2 group"
                      >
                        {/* rank dot */}
                        <span
                          className="text-[10px] font-black tabular-nums w-4 text-center shrink-0"
                          style={{ color: accentSafe }}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-white/80 group-hover:text-white transition-colors leading-tight truncate max-w-[100px]">
                            {p.player_name}
                          </p>
                          <p className="text-[8px] text-white/30 leading-tight">
                            {POSITION_NAMES[p.position ?? ''] ?? p.position ?? '—'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {isPremium ? (
                            <>
                              <p className="text-[13px] font-black tabular-nums leading-none" style={{ color: signalColor }}>
                                {fmtProj(p.projection)}
                              </p>
                              <p className="text-[7px] text-white/22 uppercase tracking-wide">proj</p>
                            </>
                          ) : (
                            <Lock size={10} className="text-amber-400/35" />
                          )}
                        </div>
                      </Link>
                    );
                  })}
                  {/* most expensive */}
                  {stats.mostExpensivePlayer && !players.slice(0, 3).some(p => p.player_id === stats.mostExpensivePlayer!.player_id) && (
                    <Link
                      to={`/sports/afl/players/${nameToSlug(stats.mostExpensivePlayer.player_name)}`}
                      className="flex items-center gap-2.5 shrink-0 rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all px-3 py-2 group"
                    >
                      <DollarSign size={11} style={{ color: accentSafe }} className="shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-white/80 group-hover:text-white transition-colors leading-tight truncate max-w-[100px]">
                          {stats.mostExpensivePlayer.player_name}
                        </p>
                        <p className="text-[8px] text-white/30 leading-tight">
                          {POSITION_NAMES[stats.mostExpensivePlayer.position ?? ''] ?? stats.mostExpensivePlayer.position ?? '—'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[12px] font-black tabular-nums leading-none" style={{ color: accentSafe }}>
                          {fmtPrice(stats.mostExpensivePlayer.price)}
                        </p>
                        <p className="text-[7px] text-white/22 uppercase tracking-wide">price</p>
                      </div>
                    </Link>
                  )}
                  <Link
                    to="/fantasy/rankings"
                    className="shrink-0 ml-1 flex items-center gap-1 text-[9px] text-white/25 hover:text-white/50 transition-colors whitespace-nowrap"
                  >
                    All players <ChevronRight size={9} />
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════
              TEAM INTELLIGENCE (pre-generated AI)
          ══════════════════════════════════════════ */}
          <TeamIntelligencePanel
            intelligence={teamIntelligence}
            loading={teamIntelligenceLoading}
            isPremium={isPremium}
            teamName={teamName ?? ''}
            stats={{
              topPlayerName: stats.topPlayer?.player_name ?? null,
              topProjection: stats.topProj,
              avgProjection: stats.avgProj,
              avgSeasonAvg: stats.avgSeasonAvg,
              startCount: stats.startCt,
              sitCount: stats.sitCt,
              midCount: players.filter(p => (p.position_group ?? '').toUpperCase().startsWith('MID')).length,
              defCount: players.filter(p => (p.position_group ?? '').toUpperCase().startsWith('DEF')).length,
              fwdCount: players.filter(p => (p.position_group ?? '').toUpperCase().startsWith('FWD')).length,
              rucCount: players.filter(p => (p.position_group ?? '').toUpperCase() === 'RUC').length,
            }}
          />

          {/* ══════════════════════════════════════════
              TEAM ANALYTICS
          ══════════════════════════════════════════ */}
          {players.length > 0 && (
            <CollapsibleSection icon={<BarChart2 size={13} />} title="Scoring Profile" defaultOpen={false}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">

                {/* Left — scoring depth chart */}
                <div
                  className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] px-3 sm:px-5 py-3 sm:py-4"
                  style={{ width: "100%", minWidth: 0, boxSizing: "border-box", overflowX: "hidden" }}
                >
                  <RosterDepthChart players={players} accentColor={accentSafe} isPremium={isPremium} />
                </div>

                {/* Right — action mix */}
                <div
                  className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] px-3 sm:px-5 py-3 sm:py-4"
                  style={{ width: "100%", minWidth: 0, boxSizing: "border-box", overflowX: "hidden" }}
                >
                  <ActionMixChart
                    startCt={stats.startCt}
                    holdCt={stats.holdCt}
                    sitCt={stats.sitCt}
                    hardSitCt={stats.hardSitCt}
                    totalPlayers={stats.totalPlayers}
                    isPremium={isPremium}
                  />
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* ══════════════════════════════════════════
              TEAM INSIGHT CARDS
          ══════════════════════════════════════════ */}
          {players.length > 0 && (
            <CollapsibleSection icon={<Flame size={13} />} title="Key Indicators" defaultOpen={true}>
              <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(160px, 100%), 1fr))" }}>

                {/* 1 — Top projected */}
                {stats.topPlayer && (
                  <InsightCard
                    icon={<Trophy size={14} />}
                    label="Squad Leader"
                    playerName={stats.topPlayer.player_name}
                    stat={isPremium ? fmtProj(stats.topPlayer.projection) : null}
                    statLabel="projected pts"
                    sub={
                      stats.topPlayer.season_avg != null
                        ? `2026 avg · ${fmtAvg(stats.topPlayer.season_avg)} pts`
                        : undefined
                    }
                    context={
                      isPremium && stats.topPlayer.last_3_avg != null
                        ? `Last 3 avg: ${fmtAvg(stats.topPlayer.last_3_avg)}`
                        : undefined
                    }
                    slug={nameToSlug(stats.topPlayer.player_name)}
                    accentColor="#34d399"
                  />
                )}

                {/* 2 — Best value target */}
                {stats.topValuePlayer && (
                  <InsightCard
                    icon={<Star size={14} />}
                    label="Value Pick"
                    playerName={stats.topValuePlayer.player_name}
                    stat={
                      isPremium && stats.topValuePlayer.value_score != null
                        ? stats.topValuePlayer.value_score.toFixed(1)
                        : null
                    }
                    statLabel="value score"
                    sub={
                      stats.topValuePlayer.price != null
                        ? `Priced at ${fmtPrice(stats.topValuePlayer.price)}`
                        : undefined
                    }
                    context={
                      isPremium && stats.topValuePlayer.projection != null && stats.topValuePlayer.breakeven != null
                        ? `Proj ${fmtProj(stats.topValuePlayer.projection)} vs BE ${Math.round(stats.topValuePlayer.breakeven)}`
                        : undefined
                    }
                    slug={nameToSlug(stats.topValuePlayer.player_name)}
                    accentColor="#F5C84C"
                  />
                )}

                {/* 3 — Biggest trap */}
                {stats.worstValuePlayer && (
                  <InsightCard
                    icon={<AlertCircle size={14} />}
                    label="Avoid This Week"
                    playerName={stats.worstValuePlayer.player_name}
                    stat={
                      isPremium && stats.worstValuePlayer.value_score != null
                        ? stats.worstValuePlayer.value_score.toFixed(1)
                        : null
                    }
                    statLabel="value score"
                    sub={
                      stats.worstValuePlayer.price != null
                        ? `Priced at ${fmtPrice(stats.worstValuePlayer.price)}`
                        : undefined
                    }
                    context={
                      isPremium && stats.worstValuePlayer.projection != null && stats.worstValuePlayer.breakeven != null
                        ? `Proj ${fmtProj(stats.worstValuePlayer.projection)} vs BE ${Math.round(stats.worstValuePlayer.breakeven)}`
                        : isPremium ? 'Overpriced relative to output' : undefined
                    }
                    slug={nameToSlug(stats.worstValuePlayer.player_name)}
                    accentColor="#f87171"
                    dimStat
                  />
                )}

                {/* 4 — Most expensive */}
                {stats.mostExpensivePlayer && (
                  <InsightCard
                    icon={<DollarSign size={14} />}
                    label="Premium Asset"
                    playerName={stats.mostExpensivePlayer.player_name}
                    stat={fmtPrice(stats.mostExpensivePlayer.price)}
                    statLabel="price"
                    sub={
                      stats.mostExpensivePlayer.price_change != null &&
                      stats.mostExpensivePlayer.price_change !== 0
                        ? `${stats.mostExpensivePlayer.price_change > 0 ? '+' : ''}${fmtPrice(stats.mostExpensivePlayer.price_change)} this round`
                        : 'No price change'
                    }
                    context={
                      isPremium && stats.mostExpensivePlayer.projection != null
                        ? `Projected ${fmtProj(stats.mostExpensivePlayer.projection)} pts`
                        : undefined
                    }
                    slug={nameToSlug(stats.mostExpensivePlayer.player_name)}
                    accentColor={accentSafe}
                  />
                )}

                {/* 5 — Best budget option */}
                {stats.bestBudgetPlayer && (
                  <InsightCard
                    icon={<Zap size={14} />}
                    label="Cash Cow"
                    playerName={stats.bestBudgetPlayer.player_name}
                    stat={isPremium ? fmtProj(stats.bestBudgetPlayer.projection) : null}
                    statLabel="projected pts"
                    sub={
                      stats.bestBudgetPlayer.price != null
                        ? `Only ${fmtPrice(stats.bestBudgetPlayer.price)}`
                        : undefined
                    }
                    context={
                      isPremium && stats.bestBudgetPlayer.breakeven != null
                        ? `BE: ${Math.round(stats.bestBudgetPlayer.breakeven)} — best u/$450k`
                        : isPremium ? 'Best output under $450k' : undefined
                    }
                    slug={nameToSlug(stats.bestBudgetPlayer.player_name)}
                    accentColor="#60a5fa"
                  />
                )}

                {/* 6 — Premium count */}
                <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] p-3 sm:p-4 flex flex-col gap-2 sm:gap-3">
                  <div className="flex items-center gap-2">
                    <Activity size={14} className="text-white/30" />
                    <span className="text-[9px] uppercase tracking-widest text-white/30">Premium Depth</span>
                  </div>
                  <div>
                    <p className="text-[22px] font-black tabular-nums leading-none" style={{ color: accentSafe }}>
                      {stats.premiumCount}
                    </p>
                    <p className="text-[8px] uppercase tracking-widest text-white/25 mt-0.5">players priced over $700k</p>
                  </div>
                  <div className="space-y-1.5 mt-auto">
                    {isPremium ? (
                      <p className="text-[10px] text-white/45 leading-snug">
                        Premium avg projection: <span className="text-white/65 font-semibold">{stats.premiumAvgProj} pts</span>
                      </p>
                    ) : (
                      <p className="text-[10px] text-white/30 leading-snug flex items-center gap-1">
                        <Lock size={8} className="text-amber-400/35 shrink-0" />
                        <span>Avg projection — Neeko+</span>
                      </p>
                    )}
                    <p className="text-[9px] text-white/28 leading-snug">
                      {stats.premiumCount === 0
                        ? `No ${shortName} players currently priced above $700k.`
                        : stats.premiumCount <= 3
                        ? `${shortName} has a thin premium core — value likely sits in the mid-price bracket.`
                        : `${shortName} has a deep premium core — high ceiling, but budget flexibility is limited.`}
                    </p>
                  </div>
                </div>

              </div>
            </CollapsibleSection>
          )}

          {/* ══════════════════════════════════════════
              SQUAD SIGNAL SUMMARY
          ══════════════════════════════════════════ */}
          {players.length > 0 && (
            <CollapsibleSection icon={<Target size={13} />} title="Round Signals" defaultOpen={false}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                {/* Action breakdown */}
                <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] px-4 py-3.5 space-y-3">
                  <p className="text-[9px] uppercase tracking-widest text-white/28 font-semibold">Signal Breakdown</p>
                  {isPremium ? (
                    <div className="space-y-2">
                      {[
                        { label: 'Start', count: stats.startCt, color: '#34d399' },
                        { label: 'Hold',  count: stats.holdCt,  color: '#ffffff55' },
                        { label: 'Sit',   count: stats.sitCt,   color: '#f97316' },
                      ].map(({ label, count, color }) => (
                        <div key={label} className="flex items-center gap-2.5">
                          <span className="text-[10px] text-white/40 w-8 shrink-0">{label}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${stats.totalPlayers > 0 ? Math.round((count / stats.totalPlayers) * 100) : 0}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                          <span className="text-[11px] font-semibold tabular-nums text-white/55 w-5 text-right shrink-0">{count}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-4 gap-2 text-center">
                      <Lock size={13} className="text-amber-400/35" />
                      <p className="text-[10px] text-white/28">Unlock Start/Hold/Sit signals with Neeko+</p>
                      <Link to="/upgrade" className="inline-flex items-center gap-1 rounded-lg bg-amber-500/90 hover:bg-amber-400 transition-colors px-2.5 py-1 text-[9px] font-black text-black">
                        <Zap size={8} /> Unlock
                      </Link>
                    </div>
                  )}
                </div>

                {/* Form summary */}
                <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] px-4 py-3.5 space-y-3">
                  <p className="text-[9px] uppercase tracking-widest text-white/28 font-semibold">Form &amp; Consistency</p>
                  <div className="space-y-2.5">
                    <div>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-[9px] text-white/32">Form Score</span>
                        <span className="text-[9px] font-semibold text-white/50">{stats.avgFormScore}</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500/60" style={{ width: `${Math.min(100, stats.avgFormScore)}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-[9px] text-white/32">Consistency</span>
                        <span className="text-[9px] font-semibold text-white/50">{stats.avgConsistency}%</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full bg-sky-500/60" style={{ width: `${Math.min(100, stats.avgConsistency)}%` }} />
                      </div>
                    </div>
                    {isPremium ? (
                      <div>
                        <div className="flex justify-between mb-0.5">
                          <span className="text-[9px] text-white/32">Start %</span>
                          <span className="text-[9px] font-semibold text-white/50">
                            {stats.totalPlayers > 0 ? Math.round((stats.startCt / stats.totalPlayers) * 100) : 0}%
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500/70"
                            style={{ width: `${stats.totalPlayers > 0 ? Math.round((stats.startCt / stats.totalPlayers) * 100) : 0}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex justify-between mb-0.5">
                          <span className="text-[9px] text-white/32">Start %</span>
                          <Lock size={8} className="text-amber-400/35" />
                        </div>
                        <div className="h-1 rounded-full bg-white/[0.06]" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Price movers */}
                <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] px-4 py-3.5 space-y-2">
                  <p className="text-[9px] uppercase tracking-widest text-white/28 font-semibold mb-1">Price Movement</p>
                  {players
                    .filter(p => p.price_change != null && p.price_change !== 0)
                    .sort((a, b) => Math.abs(b.price_change ?? 0) - Math.abs(a.price_change ?? 0))
                    .slice(0, 4)
                    .map(p => (
                      <Link
                        key={p.player_id ?? p.player_name}
                        to={`/sports/afl/players/${nameToSlug(p.player_name)}`}
                        className="flex items-center justify-between hover:opacity-80 transition-opacity"
                      >
                        <span className="text-[10px] text-white/55 truncate flex-1 mr-2">{p.player_name}</span>
                        <PriceChange change={p.price_change} />
                      </Link>
                    ))}
                  {players.filter(p => p.price_change != null && p.price_change !== 0).length === 0 && (
                    <p className="text-[10px] text-white/25">No price movement recorded this round.</p>
                  )}
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* ══════════════════════════════════════════
              SQUAD BREAKDOWN BY LINE
          ══════════════════════════════════════════ */}
          {players.length > 0 && (
            <CollapsibleSection icon={<Shield size={13} />} title="Line Breakdown" defaultOpen={false}>
              <div className="space-y-3 sm:space-y-4">

              {/* Tier 1 — summary stat cards (one per line) */}
              <div className={`grid gap-2 sm:gap-3 ${lineGroups.RUC.length > 0 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
                {(['MID', 'DEF', 'FWD'] as const).map(key => (
                  <LineSummaryCard
                    key={key}
                    lineKey={key}
                    players={lineGroups[key]}
                    accentColor={accentSafe}
                    isPremium={isPremium}
                  />
                ))}
                {lineGroups.RUC.length > 0 && (
                  <LineSummaryCard
                    lineKey="RUC"
                    players={lineGroups.RUC}
                    accentColor={accentSafe}
                    isPremium={isPremium}
                  />
                )}
              </div>

              {/* Tier 2 — detailed player rows per line */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3">
                {(['MID', 'DEF', 'FWD', 'RUC'] as const).map(key =>
                  lineGroups[key].length > 0 ? (
                    <LineDetailRows
                      key={key}
                      lineKey={key}
                      players={lineGroups[key]}
                      accentColor={accentSafe}
                      isPremium={isPremium}
                    />
                  ) : null
                )}
              </div>
              </div>
            </CollapsibleSection>
          )}

          {/* ══════════════════════════════════════════
              ROSTER
          ══════════════════════════════════════════ */}
          <RosterSection
            players={players}
            isPremium={isPremium}
            teamName={teamName}
            accentColor={accentSafe}
          />

          {/* ══════════════════════════════════════════
              QUICK LINKS
          ══════════════════════════════════════════ */}
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
            <span className="text-[8px] uppercase tracking-widest text-white/20 mr-1">Explore</span>
            {[
              { to: '/sports/afl/teams',       label: 'All Teams'    },
              { to: '/fantasy/rankings',        label: 'Rankings'     },
              { to: '/fantasy/market-watch',    label: 'Market Watch' },
              { to: '/fantasy/current-week',    label: 'Edge Board'   },
              { to: '/sports/afl/players',      label: 'Top Players'  },
            ].map(({ to, label }, i, arr) => (
              <span key={to} className="flex items-center gap-x-1">
                <Link
                  to={to}
                  className="text-[10px] text-white/32 hover:text-white/60 transition-colors"
                >
                  {label}
                </Link>
                {i < arr.length - 1 && (
                  <span className="text-white/12 text-[10px]">·</span>
                )}
              </span>
            ))}
          </div>

          {/* ══════════════════════════════════════════
              SEO BLOCK
          ══════════════════════════════════════════ */}
          <TeamSEOBlock teamName={teamName} teamSlug={team ?? ''} players={players} isPremium={isPremium} />

        </div>
      </div>
    </>
  );
}
