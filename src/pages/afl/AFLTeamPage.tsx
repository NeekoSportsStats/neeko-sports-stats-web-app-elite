import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft, ChevronRight, TrendingUp, TrendingDown, Minus,
  Lock, Crown, Users, Zap, ChartBar as BarChart2,
  Star, CircleAlert as AlertCircle, Flame, Target,
  TriangleAlert, Shield, Activity, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { nameToSlug, POSITION_NAMES, TEAM_SLUG_TO_NAME } from '@/lib/slugs';
import { getTeamPlayersSafe } from '@/lib/playerAccess';
import { useAuth } from '@/lib/auth';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { getTeamAccentColour } from '@/config/aflTeamColours';
import { PlayerStatusPill } from '@/features/afl/rankings/components/PlayerStatusPill';
import { getValueScoreColor, getValueTagStyle, resolveRecommendationColor } from '@/features/afl/rankings/components/helpers';

interface TeamPlayer {
  player_id?: number;
  player_name: string;
  player_position: string;
  position_group?: string;
  team?: string;
  neeko_rating: number;
  neeko_rating_scaled?: number | null;
  projection_final: number;
  value_score: number | null;
  value_tag?: string | null;
  recommendation_strength: number | null;
  price: number;
  prev_price?: number | null;
  price_change?: number | null;
  breakeven?: number | null;
  ai_recommendation: string | null;
  summary_short: string | null;
  summary_long?: string | null;
  projection_confidence?: number | null;
  consistency?: number | null;
  matchup_rating?: string | null;
  is_locked?: boolean;
  status?: string | null;
  manual_status?: string | null;
  is_bye?: boolean | null;
  bye_round?: number | null;
  bye_next_round?: boolean | null;
}

const FREE_TABLE_ROWS = 12;
const FREE_GRID_ROWS  = 12;

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return Math.round(Number(n)).toString();
}

function fmtPrice(p: number | null | undefined) {
  if (!p) return '—';
  const n = Number(p);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(3)}M`;
  return `$${Math.floor(n / 1000)}K`;
}

function fmtValue(v: number | null | undefined) {
  if (v == null) return '—';
  const n = Number(v);
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
}

function isBuyRec(rec: string | null): boolean {
  if (!rec) return false;
  const u = rec.toUpperCase();
  return u === 'BUY' || u === 'STRONG_BUY' || u === 'STRONG BUY';
}

function isSellRec(rec: string | null): boolean {
  if (!rec) return false;
  const u = rec.toUpperCase();
  return u === 'SELL' || u === 'STRONG_SELL' || u === 'STRONG SELL';
}

function recHex(rec: string | null) {
  if (!rec) return '#94a3b8';
  const u = rec.toUpperCase();
  if (u === 'STRONG_BUY' || u === 'STRONG BUY') return '#34d399';
  if (u === 'BUY')        return '#10b981';
  if (u === 'STRONG_SELL' || u === 'STRONG SELL') return '#f43f5e';
  if (u === 'SELL')       return '#ef4444';
  return '#64748b';
}

function recLabel(rec: string | null): string {
  if (!rec) return 'HOLD';
  const u = rec.toUpperCase();
  if (u === 'STRONG_BUY' || u === 'STRONG BUY')   return 'STRONG BUY';
  if (u === 'BUY')                                  return 'BUY';
  if (u === 'STRONG_SELL' || u === 'STRONG SELL')  return 'STRONG SELL';
  if (u === 'SELL')                                 return 'SELL';
  return 'HOLD';
}

function RecBadge({ rec, small }: { rec: string | null; small?: boolean }) {
  if (!rec) return null;
  const hex = recHex(rec);
  const label = recLabel(rec);
  const cls = small
    ? 'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide shrink-0'
    : 'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0';
  return (
    <span className={cls} style={{ background: `${hex}18`, color: hex, border: `1px solid ${hex}40` }}>
      {label}
    </span>
  );
}

/* ─────────────────────────────────────────────
   HERO
───────────────────────────────────────────── */
function TeamHero({
  teamName, players, accentHex, nextRound,
}: {
  teamName: string;
  players: TeamPlayer[];
  accentHex: string;
  nextRound: number;
}) {
  const projValues = players.map(p => Number(p.projection_final) || 0);
  const maxProj    = Math.max(...projValues, 1);
  const avgProj    = players.length > 0
    ? Math.round(projValues.reduce((a, b) => a + b, 0) / players.length)
    : 0;
  const buyCt = players.filter(p => isBuyRec(p.ai_recommendation)).length;

  return (
    <div
      className="rounded-2xl border border-white/[0.07] px-5 py-4 relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${accentHex}12 0%, #111 60%)` }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top left, ${accentHex}14 0%, transparent 60%)` }}
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/30 mb-0.5">AFL Fantasy 2026</p>
            <h1 className="text-xl font-bold text-white leading-tight">{teamName}</h1>
            <p className="text-[11px] text-white/40 mt-0.5">
              AI Fantasy Breakdown — Round {nextRound}
            </p>
          </div>
          <div
            className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
            style={{ background: `${accentHex}20`, border: `1px solid ${accentHex}30` }}
          >
            <Users size={16} style={{ color: accentHex }} />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {[
            { label: 'Players',     value: players.length,          color: 'text-white/70' },
            { label: 'Avg Proj',    value: avgProj,                  color: 'text-white/60' },
            { label: 'Top Proj',    value: Math.round(maxProj),      color: 'text-emerald-400' },
            { label: 'BUY Signals', value: buyCt, color: buyCt > 0 ? 'text-emerald-400' : 'text-white/30' },
          ].map(({ label, value, color }, i, arr) => (
            <div key={label} className="flex items-center gap-3">
              <div>
                <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
                <p className="text-[9px] uppercase tracking-wider text-white/25">{label}</p>
              </div>
              {i < arr.length - 1 && <div className="w-px h-5 bg-white/[0.07]" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   TOP PLAYERS TABLE — SEO driver
───────────────────────────────────────────── */
function TopPlayersTable({
  players, isPremium, accentHex,
}: {
  players: TeamPlayer[];
  isPremium: boolean;
  accentHex: string;
}) {
  const rows = players.slice(0, FREE_TABLE_ROWS);

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
          Top Players — Projections & Signals
        </h2>
        <span className="text-[9px] text-white/20 uppercase tracking-wide">by projection</span>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-[#111] overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 px-3 py-2 border-b border-white/[0.06]">
          <span className="text-[9px] text-white/30 uppercase tracking-wide">Player</span>
          <span className="text-[9px] text-white/30 uppercase tracking-wide w-10 text-center">Price</span>
          <span className="text-[9px] text-white/30 uppercase tracking-wide w-10 text-center">Proj</span>
          <span className="text-[9px] text-white/30 uppercase tracking-wide w-12 text-center hidden sm:block">Value</span>
          <span className="text-[9px] text-white/30 uppercase tracking-wide w-16 text-right">Signal</span>
        </div>

        {/* Rows */}
        {rows.map((player, i) => {
          const locked = !!player.is_locked;
          const proj   = Number(player.projection_final) || 0;
          const valN   = Number(player.value_score);
          const valColor = !locked && player.value_score != null
            ? getValueScoreColor(valN)
            : 'text-white/20';

          const rowContent = (
            <div
              className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 px-3 py-2.5 items-center border-b border-white/[0.04] last:border-0 ${!locked ? 'hover:bg-white/[0.03] transition-colors' : 'opacity-60'}`}
            >
              {/* Player */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[9px] text-white/20 font-mono w-4 shrink-0">#{i + 1}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[12px] font-semibold truncate ${locked ? 'text-white/40' : 'text-white'}`}>
                      {player.player_name}
                    </span>
                    <span
                      className="text-[8px] font-bold px-1 py-0.5 rounded shrink-0"
                      style={{
                        background: `${accentHex}18`,
                        color: accentHex,
                        border: `1px solid ${accentHex}30`,
                      }}
                    >
                      {player.player_position}
                    </span>
                  </div>
                  {!locked && (
                    <PlayerStatusPill
                      row={{
                        status: player.status ?? null,
                        manual_status: player.manual_status ?? null,
                        is_bye: player.is_bye ?? null,
                        bye_next_round: player.bye_next_round ?? null,
                        bye_round: player.bye_round ?? null,
                      }}
                      showUpcomingBye
                    />
                  )}
                </div>
              </div>

              {/* Price */}
              <div className="w-10 text-center">
                {locked
                  ? <span className="text-[10px] text-white/15">—</span>
                  : <span className="text-[10px] text-white/45 tabular-nums">{fmtPrice(player.price)}</span>
                }
              </div>

              {/* Projection */}
              <div className="w-10 text-center">
                <span className={`text-[14px] font-bold tabular-nums ${locked ? 'text-white/20' : 'text-white/90'}`}>
                  {locked ? '—' : fmt(proj)}
                </span>
              </div>

              {/* Value — hidden on mobile */}
              <div className="w-12 text-center hidden sm:block">
                {locked || player.value_score == null
                  ? <span className="text-[10px] text-white/15">{locked ? <Lock size={9} className="inline text-white/15" /> : '—'}</span>
                  : <span className={`text-[11px] font-semibold tabular-nums ${valColor}`}>{fmtValue(player.value_score)}</span>
                }
              </div>

              {/* Signal */}
              <div className="w-16 flex justify-end">
                {locked
                  ? <Lock size={10} className="text-white/15" />
                  : <RecBadge rec={player.ai_recommendation} small />
                }
              </div>
            </div>
          );

          if (locked) return <div key={player.player_id ?? player.player_name}>{rowContent}</div>;
          return (
            <Link
              key={player.player_id ?? player.player_name}
              to={`/sports/afl/players/${nameToSlug(player.player_name)}`}
            >
              {rowContent}
            </Link>
          );
        })}

        {/* Premium extras hint */}
        {!isPremium && (
          <div className="px-3 py-2.5 border-t border-white/[0.04] flex items-center justify-between">
            <span className="text-[9px] text-white/20 uppercase tracking-wide">
              Premium adds: Confidence % · Break-even · Trend
            </span>
            <Link to="/neeko-plus" className="text-[9px] text-amber-400/60 hover:text-amber-400 transition-colors font-semibold uppercase tracking-wide">
              Unlock
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   TEAM INSIGHTS — compact single row
───────────────────────────────────────────── */
function TeamInsights({
  players, accentHex,
}: { players: TeamPlayer[]; accentHex: string }) {
  const all    = players;
  if (all.length === 0) return null;

  const buys   = all.filter(p => isBuyRec(p.ai_recommendation));
  const holds  = all.filter(p => !isBuyRec(p.ai_recommendation) && !isSellRec(p.ai_recommendation));
  const sells  = all.filter(p => isSellRec(p.ai_recommendation));
  const total  = all.length;

  const pB = Math.round((buys.length  / total) * 100);
  const pH = Math.round((holds.length / total) * 100);
  const pS = 100 - pB - pH;

  const posGroups: Record<string, TeamPlayer[]> = {};
  all.forEach(p => {
    const g = p.position_group ?? p.player_position ?? 'OTHER';
    if (!posGroups[g]) posGroups[g] = [];
    posGroups[g].push(p);
  });

  const strongestGroup = Object.entries(posGroups)
    .map(([pos, ps]) => ({
      pos,
      avgProj: ps.reduce((s, p) => s + (Number(p.projection_final) || 0), 0) / ps.length,
    }))
    .sort((a, b) => b.avgProj - a.avgProj)[0];

  const shortPosName: Record<string, string> = {
    DEF: 'DEF', MID: 'MID', FWD: 'FWD', RUC: 'RUC',
  };

  const highRisk = all.filter(p => isSellRec(p.ai_recommendation)).length;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#111] p-3">
      {/* Signal bar */}
      <div className="flex rounded-full overflow-hidden h-1.5 mb-3 gap-0.5">
        {pB > 0 && <div className="bg-emerald-400/75 rounded-l-full" style={{ width: `${pB}%` }} />}
        {pH > 0 && <div className="bg-white/[0.18]"               style={{ width: `${pH}%` }} />}
        {pS > 0 && <div className="bg-red-400/75 rounded-r-full"  style={{ width: `${pS}%` }} />}
      </div>

      <div className="grid grid-cols-5 gap-0 divide-x divide-white/[0.05]">
        <div className="pr-3 text-center">
          <p className="text-base font-bold text-emerald-400 tabular-nums">{pB}%</p>
          <p className="text-[8px] text-white/30 uppercase tracking-wide">BUY</p>
        </div>
        <div className="px-3 text-center">
          <p className="text-base font-bold text-white/40 tabular-nums">{pH}%</p>
          <p className="text-[8px] text-white/30 uppercase tracking-wide">HOLD</p>
        </div>
        <div className="px-3 text-center">
          <p className="text-base font-bold text-red-400 tabular-nums">{pS}%</p>
          <p className="text-[8px] text-white/30 uppercase tracking-wide">SELL</p>
        </div>
        <div className="px-3 text-center">
          <p className="text-base font-bold text-white/70 tabular-nums">
            {strongestGroup ? (shortPosName[strongestGroup.pos] ?? strongestGroup.pos) : '—'}
          </p>
          <p className="text-[8px] text-white/30 uppercase tracking-wide">Strength</p>
        </div>
        <div className="pl-3 text-center">
          <p className={`text-base font-bold tabular-nums ${highRisk > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {highRisk > 0 ? `${highRisk}` : '0'}
          </p>
          <p className="text-[8px] text-white/30 uppercase tracking-wide">Risk</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   KEY PICKS — value / projection / trap
───────────────────────────────────────────── */
function KeyPicks({
  players, isPremium, accentHex,
}: { players: TeamPlayer[]; isPremium: boolean; accentHex: string }) {
  const unlocked = players.filter(p => !p.is_locked);

  const valuePick = [...unlocked]
    .filter(p => p.value_score != null)
    .sort((a, b) => (Number(b.value_score) || 0) - (Number(a.value_score) || 0))[0] ?? null;

  const projPick = [...unlocked]
    .filter(p => p.player_id !== valuePick?.player_id)
    .sort((a, b) => (Number(b.projection_final) || 0) - (Number(a.projection_final) || 0))[0] ?? null;

  const trapPick = [...unlocked]
    .filter(p => p.value_score != null)
    .sort((a, b) => (Number(a.value_score) || 0) - (Number(b.value_score) || 0))[0] ?? null;

  const picks = [
    {
      label: 'Best Value',
      icon: <Flame size={13} />,
      hex: '#10b981',
      player: valuePick,
      stat: valuePick ? `${fmt(valuePick.projection_final)} proj · ${fmtPrice(valuePick.price)}` : null,
      badge: valuePick?.ai_recommendation,
    },
    {
      label: 'Top Projection',
      icon: <Star size={13} />,
      hex: accentHex,
      player: projPick,
      stat: projPick ? `${fmt(projPick.projection_final)} proj · ${fmtPrice(projPick.price)}` : null,
      badge: projPick?.ai_recommendation,
    },
    {
      label: 'Trap Alert',
      icon: <TriangleAlert size={13} />,
      hex: '#ef4444',
      player: trapPick,
      stat: trapPick ? `${fmt(trapPick.projection_final)} proj · ${fmtPrice(trapPick.price)}` : null,
      badge: trapPick?.ai_recommendation,
    },
  ];

  return (
    <div>
      <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2.5">Key Picks</h2>
      <div className="grid grid-cols-3 gap-2">
        {picks.map(({ label, icon, hex, player, stat, badge }) => (
          <div
            key={label}
            className="rounded-xl border bg-[#111] p-2.5 flex flex-col gap-1.5"
            style={{ borderColor: player ? `${hex}25` : 'rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center gap-1">
              <span style={{ color: hex }}>{icon}</span>
              <span className="text-[8px] font-semibold uppercase tracking-wide text-white/35">{label}</span>
            </div>
            {player ? (
              <Link to={`/sports/afl/players/${nameToSlug(player.player_name)}`} className="group">
                <p className="text-[11px] font-bold text-white leading-tight group-hover:text-white/80 transition-colors line-clamp-2">
                  {player.player_name}
                </p>
                {stat && (
                  <p className="text-[9px] mt-0.5 text-white/35 tabular-nums">{stat}</p>
                )}
                {badge && <RecBadge rec={badge} small />}
              </Link>
            ) : (
              <div>
                <div className="h-2.5 w-20 rounded bg-white/[0.06] mb-1" />
                <div className="h-2 w-12 rounded bg-white/[0.04]" />
              </div>
            )}
          </div>
        ))}
      </div>
      {!isPremium && (
        <p className="text-[9px] text-white/20 mt-1.5 text-center">
          Based on unlocked players only —{' '}
          <Link to="/neeko-plus" className="text-amber-400/70 hover:text-amber-400 transition-colors">
            unlock all with Neeko+
          </Link>
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   POSITION BREAKDOWN
───────────────────────────────────────────── */
const POS_ORDER = ['DEF', 'MID', 'RUC', 'FWD'];
const POS_LABEL: Record<string, string> = { DEF: 'Defenders', MID: 'Midfielders', RUC: 'Rucks', FWD: 'Forwards' };
const POS_ICON: Record<string, React.ReactNode> = {
  DEF: <Shield size={11} />, MID: <Activity size={11} />, RUC: <Users size={11} />, FWD: <Flame size={11} />,
};

function PositionBreakdown({ players, accentHex }: { players: TeamPlayer[]; accentHex: string }) {
  const groups: Record<string, TeamPlayer[]> = {};
  players.forEach(p => {
    const g = p.position_group ?? p.player_position ?? 'OTHER';
    if (!groups[g]) groups[g] = [];
    groups[g].push(p);
  });

  const orderedGroups = POS_ORDER.filter(g => groups[g]?.length > 0);
  if (orderedGroups.length === 0) return null;

  return (
    <div>
      <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2.5">Position Breakdown</h2>
      <div className="space-y-1.5">
        {orderedGroups.map(pos => {
          const ps      = groups[pos] ?? [];
          const buys    = ps.filter(p => isBuyRec(p.ai_recommendation)).length;
          const sells   = ps.filter(p => isSellRec(p.ai_recommendation)).length;
          const avgProj = ps.length
            ? Math.round(ps.reduce((s, p) => s + (Number(p.projection_final) || 0), 0) / ps.length)
            : 0;
          const bestPlayer = [...ps].sort((a, b) => (Number(b.projection_final) || 0) - (Number(a.projection_final) || 0))[0];

          return (
            <div
              key={pos}
              className="rounded-xl border border-white/[0.07] bg-[#111] px-3 py-2.5 flex items-center gap-3"
            >
              <div className="flex items-center gap-1.5 w-24 shrink-0">
                <span style={{ color: accentHex }}>{POS_ICON[pos]}</span>
                <span className="text-[11px] font-semibold text-white/70">{POS_LABEL[pos] ?? pos}</span>
              </div>

              <div className="flex items-center gap-0.5 flex-1">
                <div
                  className="h-1.5 rounded-full bg-emerald-400/60"
                  style={{ width: `${ps.length > 0 ? (buys / ps.length) * 100 : 0}%`, minWidth: buys > 0 ? 3 : 0 }}
                />
                <div
                  className="h-1.5 rounded-full bg-white/[0.12]"
                  style={{ width: `${ps.length > 0 ? ((ps.length - buys - sells) / ps.length) * 100 : 100}%` }}
                />
                <div
                  className="h-1.5 rounded-full bg-red-400/60"
                  style={{ width: `${ps.length > 0 ? (sells / ps.length) * 100 : 0}%`, minWidth: sells > 0 ? 3 : 0 }}
                />
              </div>

              <div className="flex items-center gap-3 shrink-0 text-right">
                <div className="hidden sm:block">
                  <p className="text-[10px] font-semibold text-white/40 tabular-nums">{avgProj} avg</p>
                  {bestPlayer && !bestPlayer.is_locked && (
                    <p className="text-[8px] text-white/25 truncate max-w-[80px]">
                      {bestPlayer.player_name.split(' ')[1] ?? bestPlayer.player_name}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {buys  > 0 && <span className="text-[8px] font-bold text-emerald-400">{buys}B</span>}
                  {sells > 0 && <span className="text-[8px] font-bold text-red-400">{sells}S</span>}
                  <span className="text-[8px] text-white/25">{ps.length}p</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   FULL SQUAD GRID — compact cards
───────────────────────────────────────────── */
function PlayerGridCard({
  player, rank,
}: { player: TeamPlayer; rank: number }) {
  const proj   = Number(player.projection_final) || 0;
  const locked = !!player.is_locked;

  const cardContent = (
    <div
      className={`
        relative rounded-xl border bg-[#111] p-2.5 flex flex-col gap-1.5 min-h-[88px]
        ${locked
          ? 'border-white/[0.05] opacity-55'
          : 'border-white/[0.07] hover:border-white/[0.13] hover:bg-white/[0.03] transition-all duration-150 group cursor-pointer'}
      `}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-bold leading-tight truncate ${locked ? 'text-white/40' : 'text-white group-hover:text-white/85 transition-colors'}`}>
            {player.player_name}
          </p>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <span className="text-[8px] text-white/30">{player.player_position}</span>
            {!locked && (
              <PlayerStatusPill
                row={{
                  status: player.status ?? null,
                  manual_status: player.manual_status ?? null,
                  is_bye: player.is_bye ?? null,
                  bye_next_round: player.bye_next_round ?? null,
                  bye_round: player.bye_round ?? null,
                }}
                showUpcomingBye
              />
            )}
          </div>
        </div>
        {locked
          ? <Lock size={10} className="text-white/15 shrink-0 mt-0.5" />
          : <RecBadge rec={player.ai_recommendation} small />
        }
      </div>

      <div className="flex items-end justify-between mt-auto gap-1.5">
        <div>
          <p className="text-[8px] text-white/20 uppercase tracking-wide">Proj</p>
          <p className={`text-[14px] font-bold tabular-nums leading-none ${locked ? 'text-white/20' : 'text-white/85'}`}>
            {locked ? '—' : fmt(proj)}
          </p>
        </div>
        {!locked && player.price > 0 && (
          <div className="text-right">
            <p className="text-[8px] text-white/20 uppercase tracking-wide">Price</p>
            <p className="text-[10px] font-semibold text-white/40 tabular-nums">{fmtPrice(player.price)}</p>
          </div>
        )}
      </div>

      <span className="absolute top-2 right-2 text-[7px] text-white/12 font-mono">#{rank}</span>
    </div>
  );

  if (locked) return <div>{cardContent}</div>;

  return (
    <Link to={`/sports/afl/players/${nameToSlug(player.player_name)}`}>
      {cardContent}
    </Link>
  );
}

function FullSquadGrid({
  players, isPremium,
}: { players: TeamPlayer[]; isPremium: boolean }) {
  const visible     = isPremium ? players : players.slice(0, FREE_GRID_ROWS);
  const hiddenCount = isPremium ? 0 : Math.max(0, players.length - FREE_GRID_ROWS);

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
          Full Squad — {players.length} Players
        </h2>
        <span className="text-[9px] text-white/20 uppercase tracking-wide">by projection</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {visible.map((p, i) => (
          <PlayerGridCard
            key={p.player_id ?? p.player_name}
            player={p}
            rank={i + 1}
          />
        ))}
      </div>

      {hiddenCount > 0 && (
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[...Array(Math.min(3, hiddenCount))].map((_, i) => (
            <div
              key={`ghost-${i}`}
              className="rounded-xl border border-white/[0.04] bg-[#0f0f0f] p-2.5 min-h-[88px] flex flex-col justify-between"
              style={{ opacity: 0.35 - i * 0.08 }}
            >
              <div className="space-y-1">
                <div className="h-2.5 w-20 rounded bg-white/[0.06]" />
                <div className="h-2 w-10 rounded bg-white/[0.04]" />
              </div>
              <Lock size={9} className="text-white/12" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   UPGRADE CTA
───────────────────────────────────────────── */
function UnlockCTA({ teamName, hiddenCount }: { teamName: string; hiddenCount: number }) {
  if (hiddenCount <= 0) return null;
  return (
    <Link
      to="/neeko-plus"
      className="flex items-center justify-between rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-4 hover:bg-amber-400/[0.09] transition-all duration-150 group"
    >
      <div className="flex items-center gap-3">
        <Crown size={16} className="text-amber-400 shrink-0" />
        <div>
          <p className="text-[14px] font-bold text-white">
            Unlock Full {teamName} AI Breakdown
          </p>
          <p className="text-[11px] text-white/40 mt-0.5">
            {hiddenCount} more players — full projections, AI signals, value scores & breakevens
          </p>
        </div>
      </div>
      <ChevronRight size={16} className="text-amber-400/60 group-hover:text-amber-400 transition-colors shrink-0" />
    </Link>
  );
}

/* ─────────────────────────────────────────────
   INTERNAL LINKS
───────────────────────────────────────────── */
function InternalLinks({ teamName, teamSlug }: { teamName: string; teamSlug: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#111] p-3">
      <p className="text-[9px] text-white/30 uppercase tracking-wider mb-2.5">Explore AFL Tools</p>
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { to: '/sports/afl/rankings',     icon: <BarChart2 size={12} />,   label: 'Player Rankings' },
          { to: '/sports/afl/market-watch', icon: <TrendingUp size={12} />,  label: 'Market Watch' },
          { to: '/sports/afl/edge-board',   icon: <Zap size={12} />,         label: 'Edge Board' },
          { to: '/sports/afl/start-sit',    icon: <Target size={12} />,      label: 'Start / Sit' },
        ].map(({ to, icon, label }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-2 text-[11px] text-white/55 hover:text-white/75 hover:bg-white/[0.05] transition-all"
          >
            {icon}{label}
          </Link>
        ))}
      </div>
      <div className="mt-2.5 pt-2.5 border-t border-white/[0.05]">
        <p className="text-[9px] text-white/20 mb-1.5">More AFL Teams</p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(TEAM_SLUG_TO_NAME)
            .filter(([slug]) => slug !== teamSlug)
            .slice(0, 10)
            .map(([slug, name]) => (
              <Link
                key={slug}
                to={`/sports/afl/teams/${slug}`}
                className="text-[9px] text-white/25 border border-white/[0.06] rounded px-1.5 py-0.5 hover:text-white/55 hover:border-white/[0.12] transition-all"
              >
                {name.split(' ').pop()}
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SEO CONTENT BLOCK — always visible
───────────────────────────────────────────── */
function TeamSEOSection({ teamName, players }: { teamName: string; players: TeamPlayer[] }) {
  const shortName  = teamName.split(' ')[0];
  const topPlayer  = players[0];
  const topProj    = topPlayer ? Math.round(Number(topPlayer.projection_final)) : 0;
  const buys       = players.filter(p => isBuyRec(p.ai_recommendation));
  const topBuy     = buys[0];
  const isHistoric = ['Adelaide', 'Hawthorn', 'Geelong', 'Richmond', 'Carlton', 'Collingwood'].includes(shortName);

  const keyPlayerLines = players
    .slice(0, 5)
    .map(p => `${p.player_name} (${p.player_position}, proj: ${Math.round(Number(p.projection_final))})`)
    .join(', ');

  const tags = [
    'AFL Fantasy tips',
    `${teamName} fantasy`,
    'fantasy projections 2026',
    'best buys AFL Fantasy',
    `${shortName} players ranked`,
    `${shortName} AFL Fantasy 2026`,
  ];

  return (
    <div className="border-t border-white/[0.05] pt-5">
      <h2 className="text-sm font-semibold text-white/50 mb-3">
        {teamName} AFL Fantasy 2026 Guide
      </h2>

      <p className="text-[12px] text-white/35 leading-relaxed mb-3">
        The {teamName} are one of the AFL's {isHistoric ? 'most historic' : 'competitive'} clubs,
        with a roster presenting significant AFL Fantasy opportunities in 2026.
        {topPlayer && ` ${topPlayer.player_name} leads the squad with a projected ${topProj} points`},
        making them a strong consideration for coaches.{' '}
        {topBuy && `${topBuy.player_name} is currently flagged as a BUY signal, projecting significant upside relative to current price. `}
        Neeko's projection engine analyses form, matchup difficulty, venue factors, and price efficiency
        to rank every {teamName} player by expected fantasy output.
        BUY signals identify underpriced players whose projected scores exceed their breakeven,
        while SELL signals flag overpriced options where value has peaked.
        Key {teamName} players to target include {keyPlayerLines}.
        For AFL Fantasy coaches targeting {shortName} players, the most important metrics are
        Neeko Rating, projection confidence, and value score — measuring price efficiency relative to projected output.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {tags.map(tag => (
          <span key={tag} className="text-[9px] text-white/18 border border-white/[0.05] rounded px-1.5 py-0.5">
            {tag}
          </span>
        ))}
      </div>

      <p className="sr-only">
        Complete {teamName} AFL Fantasy player rankings, projections, price analysis and AI recommendations for 2026.
        Every {teamName} player with buy/hold/sell signals, breakeven scores, and value picks — updated weekly.
        Top {teamName} fantasy players: {keyPlayerLines}.
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SKELETON
───────────────────────────────────────────── */
function TeamPageSkeleton() {
  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="h-4 w-20 rounded bg-white/[0.05] animate-pulse" />
        <div className="h-24 rounded-2xl bg-white/[0.04] animate-pulse" />
        <div className="h-16 rounded-xl bg-white/[0.04] animate-pulse" />
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-white/[0.04] animate-pulse" />)}
        </div>
        <div className="h-48 rounded-xl bg-white/[0.04] animate-pulse" />
        <div className="space-y-1.5">
          {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-xl bg-white/[0.04] animate-pulse" />)}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-[88px] rounded-xl bg-white/[0.04] animate-pulse" />)}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────── */
export default function AFLTeamPage() {
  const { team } = useParams<{ team: string }>();
  const teamName = team ? TEAM_SLUG_TO_NAME[team] : '';
  const { user } = useAuth();
  const { isPremium } = useSubscriptionStatus();
  const navigate = useNavigate();

  const { data: players, isLoading, error } = useQuery({
    queryKey: ['team-players-safe', teamName, user?.id],
    queryFn: async () => {
      const data = await getTeamPlayersSafe(teamName, user?.id ?? null);
      return data as TeamPlayer[];
    },
    enabled: !!teamName,
  });

  if (isLoading) return <TeamPageSkeleton />;

  if (error || !players || !teamName) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <AlertCircle size={36} className="text-white/20 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-white mb-2">Team Not Found</h2>
          <p className="text-white/40 mb-6 text-sm">Could not load data for: {teamName || team}</p>
          <button
            onClick={() => navigate('/sports/afl/rankings')}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Rankings
          </button>
        </div>
      </div>
    );
  }

  const accentColor = getTeamAccentColour(teamName.split(' ')[0]) ?? '#4ade80';
  const accentSafe  = accentColor === '#FFD200' ? '#F5C84C' : accentColor;

  const hiddenCount = isPremium ? 0 : Math.max(0, players.length - FREE_GRID_ROWS);

  const topProj = Math.round(Math.max(...players.map(p => Number(p.projection_final) || 0), 1));
  const buyCt   = players.filter(p => isBuyRec(p.ai_recommendation)).length;
  const nextRound = 1;

  const pageTitle       = `${teamName} AFL Fantasy Players & Rankings 2026 | Neeko`;
  const pageDescription = `Complete ${teamName} AFL Fantasy roster for 2026. Top projection: ${topProj} pts. ${buyCt} BUY signals identified. AI-powered buy/sell/hold recommendations for every player.`;
  const pageUrl         = `https://neekostats.com.au/sports/afl/teams/${team}`;
  const shortName       = teamName.split(' ')[0];
  const keyPlayerLines  = players
    .slice(0, 5)
    .map(p => `${p.player_name} (${p.player_position}, proj: ${Math.round(Number(p.projection_final))})`)
    .join(', ');

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content={`${teamName}, AFL Fantasy, AFL Fantasy 2026, ${teamName} players, fantasy projections, buy sell hold, captain picks, ${teamName} fantasy tips 2026, ${shortName} AFL Fantasy`} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:site_name" content="Neeko Sports" />
        <link rel="canonical" href={pageUrl} />
        <meta name="robots" content="index, follow" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
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
              { '@type': 'ListItem', position: 1, name: 'Home',                 item: 'https://neekostats.com.au' },
              { '@type': 'ListItem', position: 2, name: 'AFL Fantasy Rankings', item: 'https://neekostats.com.au/sports/afl/rankings' },
              { '@type': 'ListItem', position: 3, name: teamName,               item: pageUrl },
            ],
          },
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-[#0e0e0e]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5 space-y-4">

          {/* Back nav */}
          <button
            onClick={() => navigate('/sports/afl/rankings')}
            className="flex items-center gap-1.5 text-white/35 hover:text-white/65 transition-colors text-[11px]"
          >
            <ArrowLeft size={13} />
            Rankings
          </button>

          {/* 1. HERO */}
          <TeamHero
            teamName={teamName}
            players={players}
            accentHex={accentSafe}
            nextRound={nextRound}
          />

          {/* 2. TOP PLAYERS TABLE */}
          <TopPlayersTable players={players} isPremium={isPremium} accentHex={accentSafe} />

          {/* 3. TEAM INSIGHTS */}
          <TeamInsights players={players} accentHex={accentSafe} />

          {/* 4. KEY PICKS */}
          <KeyPicks players={players} isPremium={isPremium} accentHex={accentSafe} />

          {/* 5. POSITION BREAKDOWN */}
          <PositionBreakdown players={players} accentHex={accentSafe} />

          {/* 6. FULL SQUAD */}
          <FullSquadGrid players={players} isPremium={isPremium} />

          {/* 7. UPGRADE CTA */}
          <UnlockCTA teamName={teamName} hiddenCount={hiddenCount} />

          {/* 8. INTERNAL LINKS */}
          <InternalLinks teamName={teamName} teamSlug={team ?? ''} />

          {/* 9. SEO BLOCK */}
          <TeamSEOSection teamName={teamName} players={players} />

        </div>
      </div>
    </>
  );
}
