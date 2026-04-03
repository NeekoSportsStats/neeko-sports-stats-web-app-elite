import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft, ChevronRight, TrendingUp, TrendingDown, Minus,
  Lock, Crown, Users, Zap, ChartBar as BarChart2, ChevronDown,
  ChevronUp, Star, CircleAlert as AlertCircle, Flame, Target,
  TriangleAlert, Shield, Activity,
} from 'lucide-react';
import { nameToSlug, POSITION_NAMES, TEAM_SLUG_TO_NAME } from '@/lib/slugs';
import { getTeamPlayersSafe } from '@/lib/playerAccess';
import { useAuth } from '@/lib/auth';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { getTeamAccentColour } from '@/config/aflTeamColours';
import { PlayerStatusPill } from '@/features/afl/rankings/components/PlayerStatusPill';

interface TeamPlayer {
  player_id?: number;
  player_name: string;
  player_position: string;
  position_group?: string;
  team?: string;
  neeko_rating: number;
  projection_final: number;
  value_score: number | null;
  recommendation_strength: number | null;
  price: number;
  breakeven?: number | null;
  ai_recommendation: string | null;
  summary_short: string | null;
  summary_long?: string | null;
  is_locked?: boolean;
  status?: string | null;
  manual_status?: string | null;
  is_bye?: boolean | null;
  bye_round?: number | null;
  bye_next_round?: boolean | null;
}

const FREE_VISIBLE = 7;

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return Math.round(Number(n)).toString();
}

function fmtPrice(p: number) {
  return `$${Math.round(p / 1000)}k`;
}

function isBuyRec(rec: string | null): boolean {
  return rec === 'BUY' || rec === 'STRONG_BUY';
}

function isSellRec(rec: string | null): boolean {
  return rec === 'SELL' || rec === 'STRONG_SELL';
}

function recHex(rec: string | null) {
  if (rec === 'STRONG_BUY') return '#34d399';
  if (rec === 'BUY')        return '#4ade80';
  if (rec === 'STRONG_SELL') return '#f43f5e';
  if (rec === 'SELL')       return '#f87171';
  return '#94a3b8';
}

function recLabel(rec: string | null): string {
  if (rec === 'STRONG_BUY')  return 'STRONG BUY';
  if (rec === 'BUY')         return 'BUY';
  if (rec === 'STRONG_SELL') return 'STRONG SELL';
  if (rec === 'SELL')        return 'SELL';
  return 'HOLD';
}

function RecBadge({ rec }: { rec: string | null }) {
  if (!rec) return null;
  const hex = recHex(rec);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0"
      style={{ background: `${hex}18`, color: hex, border: `1px solid ${hex}40` }}
    >
      {recLabel(rec)}
    </span>
  );
}

function RecIcon({ rec }: { rec: string | null }) {
  if (isBuyRec(rec))  return <TrendingUp size={13} className="text-emerald-400 shrink-0" />;
  if (isSellRec(rec)) return <TrendingDown size={13} className="text-red-400 shrink-0" />;
  return <Minus size={13} className="text-white/25 shrink-0" />;
}

/* ─────────────────────────────────────────────
   SIGNAL DISTRIBUTION BAR
───────────────────────────────────────────── */
function SignalBreakdown({ players }: { players: TeamPlayer[] }) {
  const all = players;
  if (all.length === 0) return null;

  const buys  = all.filter(p => isBuyRec(p.ai_recommendation)).length;
  const sells = all.filter(p => isSellRec(p.ai_recommendation)).length;
  const holds = all.length - buys - sells;
  const pB = Math.round((buys  / all.length) * 100);
  const pS = Math.round((sells / all.length) * 100);
  const pH = 100 - pB - pS;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#111] p-4">
      <p className="text-[10px] text-white/35 uppercase tracking-wider mb-3">Team Signal Distribution</p>
      <div className="flex rounded-full overflow-hidden h-2.5 mb-3 gap-0.5">
        {pB > 0 && <div className="bg-emerald-400/75 rounded-l-full transition-all" style={{ width: `${pB}%` }} />}
        {pH > 0 && <div className="bg-white/[0.18] transition-all" style={{ width: `${pH}%` }} />}
        {pS > 0 && <div className="bg-red-400/75 rounded-r-full transition-all" style={{ width: `${pS}%` }} />}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-base font-bold text-emerald-400 tabular-nums">{buys}</p>
          <p className="text-[9px] text-white/30 uppercase tracking-wide">{pB}% BUY</p>
        </div>
        <div>
          <p className="text-base font-bold text-white/50 tabular-nums">{holds}</p>
          <p className="text-[9px] text-white/30 uppercase tracking-wide">{pH}% HOLD</p>
        </div>
        <div>
          <p className="text-base font-bold text-red-400 tabular-nums">{sells}</p>
          <p className="text-[9px] text-white/30 uppercase tracking-wide">{pS}% SELL</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   KEY PICKS — value / premium / trap
───────────────────────────────────────────── */
function KeyPicks({
  players, isPremium, accentHex,
}: { players: TeamPlayer[]; isPremium: boolean; accentHex: string }) {
  const unlocked = players.filter(p => !p.is_locked);

  const valuePick = [...unlocked]
    .filter(p => p.value_score != null)
    .sort((a, b) => (Number(b.value_score) || 0) - (Number(a.value_score) || 0))[0] ?? null;

  const premiumPick = [...unlocked]
    .filter(p => p.player_id !== valuePick?.player_id)
    .sort((a, b) => (Number(b.projection_final) || 0) - (Number(a.projection_final) || 0))[0] ?? null;

  const trapPick = [...unlocked]
    .filter(p => p.value_score != null)
    .sort((a, b) => (Number(a.value_score) || 0) - (Number(b.value_score) || 0))[0] ?? null;

  const picks = [
    {
      label: 'Value Pick',
      sublabel: 'Best value score',
      icon: <Flame size={14} />,
      hex: '#4ade80',
      player: valuePick,
      stat: valuePick?.value_score != null
        ? `${Number(valuePick.value_score) > 0 ? '+' : ''}${Number(valuePick.value_score).toFixed(1)} value`
        : null,
    },
    {
      label: 'Premium Pick',
      sublabel: 'Highest projection',
      icon: <Star size={14} />,
      hex: accentHex,
      player: premiumPick,
      stat: premiumPick ? `${fmt(premiumPick.projection_final)} proj` : null,
    },
    {
      label: 'Trap Alert',
      sublabel: 'Worst value score',
      icon: <TriangleAlert size={14} />,
      hex: '#f87171',
      player: trapPick,
      stat: trapPick?.value_score != null
        ? `${Number(trapPick.value_score) > 0 ? '+' : ''}${Number(trapPick.value_score).toFixed(1)} value`
        : null,
    },
  ];

  return (
    <div>
      <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-3">Key Picks</h2>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {picks.map(({ label, sublabel, icon, hex, player, stat }) => (
          <div
            key={label}
            className="rounded-xl border border-white/[0.07] bg-[#111] p-3 flex flex-col gap-2"
            style={{ borderColor: player ? `${hex}25` : undefined }}
          >
            <div className="flex items-center gap-1.5">
              <span style={{ color: hex }}>{icon}</span>
              <span className="text-[9px] font-semibold uppercase tracking-wide text-white/40">{label}</span>
            </div>
            {player ? (
              <Link
                to={`/sports/afl/players/${nameToSlug(player.player_name)}`}
                className="group"
              >
                <p className="text-[12px] font-bold text-white leading-tight group-hover:text-white/80 transition-colors line-clamp-2">
                  {player.player_name}
                </p>
                {stat && (
                  <p className="text-[10px] mt-1 font-semibold tabular-nums" style={{ color: hex }}>{stat}</p>
                )}
                <p className="text-[9px] text-white/25 mt-0.5">{sublabel}</p>
              </Link>
            ) : (
              <div className="flex-1">
                <div className="h-3 w-20 rounded bg-white/[0.06] mb-1" />
                <p className="text-[9px] text-white/20">{sublabel}</p>
              </div>
            )}
          </div>
        ))}
      </div>
      {!isPremium && (
        <p className="text-[9px] text-white/20 mt-2 text-center">
          Key picks shown for unlocked players only — <Link to="/neeko-plus" className="text-amber-400/70 hover:text-amber-400 transition-colors">unlock all with Neeko+</Link>
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   TEAM INSIGHTS PANEL
───────────────────────────────────────────── */
function TeamInsights({
  players, teamName, accentHex,
}: { players: TeamPlayer[]; teamName: string; accentHex: string }) {
  const unlocked = players.filter(p => !p.is_locked);
  if (unlocked.length === 0) return null;

  const buys  = unlocked.filter(p => isBuyRec(p.ai_recommendation));
  const sells = unlocked.filter(p => isSellRec(p.ai_recommendation));

  const posGroups: Record<string, TeamPlayer[]> = {};
  unlocked.forEach(p => {
    const g = p.position_group ?? p.player_position ?? 'OTHER';
    if (!posGroups[g]) posGroups[g] = [];
    posGroups[g].push(p);
  });

  const strongestGroup = Object.entries(posGroups)
    .map(([pos, ps]) => ({
      pos,
      avgProj: ps.reduce((s, p) => s + (Number(p.projection_final) || 0), 0) / ps.length,
      buyCount: ps.filter(p => p.ai_recommendation === 'BUY').length,
    }))
    .sort((a, b) => b.avgProj - a.avgProj)[0];

  const shortPosName: Record<string, string> = {
    DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards', RUC: 'Rucks',
  };

  const insights = [
    {
      icon: <TrendingUp size={14} className="text-emerald-400" />,
      label: 'Buy signals',
      value: `${buys.length} player${buys.length !== 1 ? 's' : ''}`,
      sub: buys.length > 0 ? `Top: ${buys[0]?.player_name ?? '—'}` : 'None flagged',
    },
    {
      icon: <Activity size={14} style={{ color: accentHex }} />,
      label: 'Strongest position',
      value: strongestGroup ? (shortPosName[strongestGroup.pos] ?? strongestGroup.pos) : '—',
      sub: strongestGroup ? `${Math.round(strongestGroup.avgProj)} avg projection` : '',
    },
    {
      icon: <TriangleAlert size={14} className="text-red-400" />,
      label: 'Risk area',
      value: `${sells.length} player${sells.length !== 1 ? 's' : ''}`,
      sub: sells.length > 0 ? `Avoid: ${sells[0]?.player_name ?? '—'}` : 'No major risks',
    },
  ];

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#111] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={13} style={{ color: accentHex }} />
        <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
          Team Intelligence
        </h2>
      </div>
      <div className="grid grid-cols-3 gap-3 divide-x divide-white/[0.05]">
        {insights.map(({ icon, label, value, sub }) => (
          <div key={label} className="pl-3 first:pl-0">
            <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-[9px] text-white/30 uppercase tracking-wide">{label}</span></div>
            <p className="text-[13px] font-bold text-white leading-tight">{value}</p>
            <p className="text-[9px] text-white/30 mt-0.5 truncate">{sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   POSITION BREAKDOWN
───────────────────────────────────────────── */
const POS_ORDER = ['DEF', 'MID', 'RUC', 'FWD'];
const POS_LABEL: Record<string, string> = { DEF: 'Defenders', MID: 'Midfielders', RUC: 'Rucks', FWD: 'Forwards' };
const POS_ICON: Record<string, React.ReactNode> = {
  DEF: <Shield size={12} />,
  MID: <Activity size={12} />,
  RUC: <Users size={12} />,
  FWD: <Flame size={12} />,
};

function PositionBreakdown({
  players, isPremium, accentHex,
}: { players: TeamPlayer[]; isPremium: boolean; accentHex: string }) {
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
      <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-3">Position Breakdown</h2>
      <div className="space-y-2">
        {orderedGroups.map(pos => {
          const ps = groups[pos] ?? [];
          const buys  = ps.filter(p => isBuyRec(p.ai_recommendation)).length;
          const sells = ps.filter(p => isSellRec(p.ai_recommendation)).length;
          const avgProj = ps.length
            ? Math.round(ps.reduce((s, p) => s + (Number(p.projection_final) || 0), 0) / ps.length)
            : 0;

          return (
            <div
              key={pos}
              className="rounded-xl border border-white/[0.07] bg-[#111] px-4 py-3 flex items-center gap-4"
            >
              <div className="flex items-center gap-2 w-28 shrink-0">
                <span style={{ color: accentHex }}>{POS_ICON[pos]}</span>
                <span className="text-[12px] font-semibold text-white/70">{POS_LABEL[pos] ?? pos}</span>
              </div>
              <div className="flex items-center gap-1 flex-1">
                <div
                  className="h-1.5 rounded-full bg-emerald-400/60 transition-all"
                  style={{ width: `${ps.length > 0 ? (buys / ps.length) * 100 : 0}%`, minWidth: buys > 0 ? 4 : 0 }}
                />
                <div
                  className="h-1.5 rounded-full bg-white/[0.15] transition-all"
                  style={{ width: `${ps.length > 0 ? ((ps.length - buys - sells) / ps.length) * 100 : 100}%` }}
                />
                <div
                  className="h-1.5 rounded-full bg-red-400/60 transition-all"
                  style={{ width: `${ps.length > 0 ? (sells / ps.length) * 100 : 0}%`, minWidth: sells > 0 ? 4 : 0 }}
                />
              </div>
              <div className="flex items-center gap-3 shrink-0 text-right">
                <div className="hidden sm:block">
                  <p className="text-[10px] font-semibold text-white/40 tabular-nums">{avgProj} avg</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {buys > 0  && <span className="text-[9px] font-bold text-emerald-400">{buys}B</span>}
                  {sells > 0 && <span className="text-[9px] font-bold text-red-400">{sells}S</span>}
                  <span className="text-[9px] text-white/25">{ps.length}p</span>
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
   PLAYER GRID — compact card grid
───────────────────────────────────────────── */
function PlayerGridCard({
  player, isPremium, rank,
}: { player: TeamPlayer; rank: number; isPremium: boolean }) {
  const proj = Number(player.projection_final) || 0;
  const locked = !!player.is_locked;

  const cardContent = (
    <div
      className={`
        relative rounded-xl border bg-[#111] p-3 flex flex-col gap-2 min-h-[110px]
        ${locked
          ? 'border-white/[0.05] opacity-60'
          : 'border-white/[0.07] hover:border-white/[0.14] hover:bg-white/[0.04] transition-all duration-150 group cursor-pointer'}
      `}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <p className={`text-[12px] font-bold leading-tight truncate ${locked ? 'text-white/50' : 'text-white group-hover:text-white/90 transition-colors'}`}>
            {player.player_name}
          </p>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <span className="text-[9px] text-white/30">
              {player.player_position}
            </span>
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
          ? <Lock size={11} className="text-white/20 shrink-0 mt-0.5" />
          : <RecBadge rec={player.ai_recommendation} />
        }
      </div>

      <div className="flex items-end justify-between mt-auto gap-2">
        <div>
          <p className="text-[10px] text-white/25 uppercase tracking-wide">Proj</p>
          <p className={`text-[15px] font-bold tabular-nums ${locked ? 'text-white/30' : 'text-white/80'}`}>
            {locked ? '—' : fmt(proj)}
          </p>
        </div>
        {!locked && player.breakeven != null && (
          <div className="text-right">
            <p className="text-[9px] text-white/25 uppercase tracking-wide">BE</p>
            <p className="text-[12px] font-semibold text-white/50 tabular-nums">{Math.round(Number(player.breakeven))}</p>
          </div>
        )}
        {!locked && player.price > 0 && (
          <div className="text-right">
            <p className="text-[9px] text-white/25 uppercase tracking-wide">Price</p>
            <p className="text-[11px] font-semibold text-white/40 tabular-nums">{fmtPrice(player.price)}</p>
          </div>
        )}
      </div>

      <span className="absolute top-2.5 right-2.5 text-[8px] text-white/15 font-mono">#{rank}</span>
    </div>
  );

  if (locked) return <div>{cardContent}</div>;

  return (
    <Link to={`/sports/afl/players/${nameToSlug(player.player_name)}`}>
      {cardContent}
    </Link>
  );
}

function PlayerGrid({
  players, isPremium,
}: { players: TeamPlayer[]; isPremium: boolean }) {
  const visible = isPremium ? players : players.slice(0, FREE_VISIBLE);
  const hiddenCount = isPremium ? 0 : Math.max(0, players.length - FREE_VISIBLE);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {visible.map((p, i) => (
          <PlayerGridCard
            key={p.player_id ?? p.player_name}
            player={p}
            rank={i + 1}
            isPremium={isPremium}
          />
        ))}
      </div>

      {hiddenCount > 0 && (
        <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {[...Array(Math.min(3, hiddenCount))].map((_, i) => (
            <div
              key={`ghost-${i}`}
              className="rounded-xl border border-white/[0.04] bg-[#0f0f0f] p-3 min-h-[110px] flex flex-col justify-between"
              style={{ opacity: 0.4 - i * 0.1 }}
            >
              <div className="space-y-1.5">
                <div className="h-3 w-24 rounded bg-white/[0.06]" />
                <div className="h-2 w-10 rounded bg-white/[0.04]" />
              </div>
              <Lock size={10} className="text-white/15" />
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
          <p className="text-sm font-semibold text-white">
            Unlock full {teamName} analysis
          </p>
          <p className="text-[11px] text-white/40">
            {hiddenCount} more players — projections, AI signals, value scores
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
    <div className="rounded-xl border border-white/[0.07] bg-[#111] p-4">
      <p className="text-[10px] text-white/35 uppercase tracking-wider mb-3">Explore More</p>
      <div className="grid grid-cols-2 gap-2">
        {[
          { to: '/sports/afl/rankings',    icon: <BarChart2 size={13} />,  label: 'All Player Rankings' },
          { to: '/sports/afl/market-watch',icon: <TrendingUp size={13} />, label: 'Market Watch' },
          { to: '/sports/afl/edge-board',  icon: <Zap size={13} />,        label: 'Edge Board' },
          { to: '/sports/afl/start-sit',   icon: <Star size={13} />,       label: 'Start / Sit Tool' },
        ].map(({ to, icon, label }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-[12px] text-white/60 hover:text-white/80 hover:bg-white/[0.06] transition-all"
          >
            {icon}{label}
          </Link>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-white/[0.05]">
        <p className="text-[10px] text-white/25 mb-2">More AFL Teams</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(TEAM_SLUG_TO_NAME)
            .filter(([slug]) => slug !== teamSlug)
            .slice(0, 8)
            .map(([slug, name]) => (
              <Link
                key={slug}
                to={`/sports/afl/teams/${slug}`}
                className="text-[10px] text-white/30 border border-white/[0.06] rounded px-2 py-0.5 hover:text-white/60 hover:border-white/[0.12] transition-all"
              >
                {name.split(' ')[0]}
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SEO SECTION
───────────────────────────────────────────── */
function TeamSEOSection({ teamName, players }: { teamName: string; players: TeamPlayer[] }) {
  const [open, setOpen] = useState(false);
  const shortName  = teamName.split(' ')[0];
  const topPlayer  = players[0];
  const topProj    = topPlayer ? Math.round(Number(topPlayer.projection_final)) : 0;
  const buys       = players.filter(p => isBuyRec(p.ai_recommendation));
  const topBuy     = buys[0];
  const isHistoric = ['Adelaide', 'Hawthorn', 'Geelong', 'Richmond', 'Carlton', 'Collingwood'].includes(shortName);

  const keyPlayerLines = players
    .slice(0, 5)
    .map(p => `${p.player_name} (${p.player_position}, projection: ${Math.round(Number(p.projection_final))})`)
    .join(', ');

  const content = `The ${teamName} are one of the AFL's ${isHistoric ? 'most historic' : 'competitive'} clubs, with a roster that presents significant AFL Fantasy opportunities each season. This page provides a complete breakdown of every ${teamName} player's fantasy projection, price, and AI-generated trade recommendation for the 2026 AFL Fantasy season.

Key ${teamName} players to target include ${keyPlayerLines}. ${topPlayer ? `${topPlayer.player_name} leads the squad with a ${topProj}-point projection` : 'Multiple high-value options are available'}, making them a strong consideration for AFL Fantasy coaches.

${topBuy ? `${topBuy.player_name} is currently flagged as a BUY signal, meaning our model projects significant upside relative to their current price. ` : ''}Neeko's projection engine analyses recent form, matchup difficulty, venue factors, and price efficiency to rank each ${teamName} player by expected fantasy output. BUY signals identify underpriced players whose projected scores exceed their breakeven, while SELL signals flag overpriced options where value has peaked.

For AFL Fantasy coaches targeting ${teamName} players, key metrics include the Neeko Rating (an overall fantasy value score), projection confidence, and value score — which measures how efficiently a player scores relative to their current price point. Players with high value scores and BUY recommendations represent the strongest trade-in targets from this squad.`;

  const tags = [
    'AFL Fantasy tips',
    `${teamName} fantasy`,
    'fantasy projections 2026',
    'best buys AFL Fantasy',
    `${shortName} players ranked`,
    'AFL Fantasy value picks',
    `${shortName} AFL Fantasy 2026`,
  ];

  return (
    <div className="border-t border-white/[0.05] pt-6">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full text-left group"
        aria-expanded={open}
      >
        <h2 className="text-sm font-semibold text-white/50 group-hover:text-white/70 transition-colors">
          {teamName} AFL Fantasy 2026 Guide — Players, Rankings & Predictions
        </h2>
        {open
          ? <ChevronUp size={15} className="text-white/30 shrink-0" />
          : <ChevronDown size={15} className="text-white/30 shrink-0" />
        }
      </button>

      {open && (
        <div className="mt-4">
          <p className="text-[13px] text-white/40 leading-relaxed whitespace-pre-line">{content}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map(tag => (
              <span key={tag} className="text-[10px] text-white/20 border border-white/[0.06] rounded px-2 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="sr-only">
        Complete {teamName} AFL Fantasy player rankings, projections, price analysis and AI recommendations for the 2026 AFL season.
        Includes every {teamName} player with buy/hold/sell signals, breakeven scores, and value picks — updated weekly.
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
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <div className="h-5 w-24 rounded bg-white/[0.05] animate-pulse" />
        <div className="h-28 rounded-2xl bg-white/[0.04] animate-pulse" />
        <div className="h-20 rounded-xl bg-white/[0.04] animate-pulse" />
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-white/[0.04] animate-pulse" />)}
        </div>
        <div className="h-20 rounded-xl bg-white/[0.04] animate-pulse" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-xl bg-white/[0.04] animate-pulse" />)}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-[110px] rounded-xl bg-white/[0.04] animate-pulse" />)}
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
          <AlertCircle size={40} className="text-white/20 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Team Not Found</h2>
          <p className="text-white/40 mb-6 text-sm">Could not load data for: {teamName || team}</p>
          <button
            onClick={() => navigate('/sports/afl/rankings')}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <ArrowLeft size={15} />
            Back to Rankings
          </button>
        </div>
      </div>
    );
  }

  const projValues = players.map(p => Number(p.projection_final) || 0);
  const maxProj    = Math.max(...projValues, 1);
  const topProj    = Math.round(maxProj);
  const avgProj    = players.length > 0
    ? Math.round(projValues.reduce((a, b) => a + b, 0) / players.length)
    : 0;
  const buyCt      = players.filter(p => isBuyRec(p.ai_recommendation)).length;

  const accentColor = getTeamAccentColour(teamName.split(' ')[0]) ?? '#4ade80';
  const accentSafe  = accentColor === '#FFD200' ? '#F5C84C' : accentColor;

  const hiddenCount = isPremium ? 0 : Math.max(0, players.length - FREE_VISIBLE);

  const pageTitle       = `${teamName} AFL Fantasy Players & Rankings 2026 | Neeko`;
  const pageDescription = `Complete ${teamName} AFL Fantasy roster for 2026. Top projection: ${topProj} pts. ${buyCt} BUY signals identified. AI-powered buy/sell/hold recommendations for every player.`;
  const pageUrl         = `https://neekostats.com.au/sports/afl/teams/${team}`;

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content={`${teamName}, AFL Fantasy, AFL Fantasy 2026, ${teamName} players, fantasy projections, buy sell hold, captain picks, ${teamName} fantasy tips 2026, ${teamName.split(' ')[0]} AFL Fantasy`} />
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
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

          {/* Back nav */}
          <button
            onClick={() => navigate('/sports/afl/rankings')}
            className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors text-[12px]"
          >
            <ArrowLeft size={14} />
            Rankings
          </button>

          {/* ── HERO HEADER ── */}
          <div
            className="rounded-2xl border border-white/[0.07] p-5 relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${accentSafe}12 0%, #111 60%)` }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at top left, ${accentSafe}14 0%, transparent 60%)` }}
            />
            <div className="relative">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">AFL Fantasy 2026</p>
                  <h1 className="text-2xl font-bold text-white leading-tight">{teamName}</h1>
                  <p className="text-[12px] text-white/40 mt-0.5">AI Fantasy Intelligence Breakdown</p>
                </div>
                <div
                  className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                  style={{ background: `${accentSafe}20`, border: `1px solid ${accentSafe}30` }}
                >
                  <Users size={18} style={{ color: accentSafe }} />
                </div>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                {[
                  { label: 'Players',     value: players.length,                    color: 'text-white/70' },
                  { label: 'Top Proj',    value: topProj,                            color: 'text-emerald-400' },
                  { label: 'Avg Proj',    value: avgProj,                            color: 'text-white/60' },
                  { label: 'BUY Signals', value: buyCt, color: buyCt > 0 ? 'text-emerald-400' : 'text-white/30' },
                ].map(({ label, value, color }, i, arr) => (
                  <div key={label} className="flex items-center gap-4">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
                      <span className="text-[9px] uppercase tracking-wider text-white/25">{label}</span>
                    </div>
                    {i < arr.length - 1 && <div className="w-px h-6 bg-white/[0.07]" />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── SIGNAL BREAKDOWN ── */}
          <SignalBreakdown players={players} />

          {/* ── KEY PICKS ── */}
          <KeyPicks players={players} isPremium={isPremium} accentHex={accentSafe} />

          {/* ── TEAM INSIGHTS ── */}
          <TeamInsights players={players} teamName={teamName} accentHex={accentSafe} />

          {/* ── POSITION BREAKDOWN ── */}
          <PositionBreakdown players={players} isPremium={isPremium} accentHex={accentSafe} />

          {/* ── PLAYER GRID ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                Full Roster — {players.length} Players
              </h2>
              <span className="text-[9px] text-white/20 uppercase tracking-wide">by projection</span>
            </div>
            <PlayerGrid players={players} isPremium={isPremium} />
          </div>

          {/* ── UPGRADE CTA ── */}
          <UnlockCTA teamName={teamName} hiddenCount={hiddenCount} />

          {/* ── INTERNAL LINKS ── */}
          <InternalLinks teamName={teamName} teamSlug={team ?? ''} />

          {/* ── SEO SECTION ── */}
          <TeamSEOSection teamName={teamName} players={players} />

        </div>
      </div>
    </>
  );
}
