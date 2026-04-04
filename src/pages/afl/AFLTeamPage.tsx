import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Lock, Crown, Users, Zap, ChartBar as BarChart2, ChevronDown, ChevronUp, Star, CircleAlert as AlertCircle, ShieldCheck, Flame, Target, TriangleAlert } from 'lucide-react';
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
  team?: string;
  neeko_rating: number;
  projection_final: number;
  value_score: number | null;
  best_value_score?: number | null;
  price: number;
  breakeven?: number | null;
  ai_recommendation: string | null;
  recommendation_color?: string;
  summary_short: string | null;
  summary_long?: string | null;
  is_locked?: boolean;
  status?: string | null;
  manual_status?: string | null;
  is_bye?: boolean | null;
  bye_round?: number | null;
  bye_next_round?: boolean | null;
}

const FREE_FULL = 2;
const FREE_PARTIAL = 5;

function fmtPrice(p: number) {
  return `$${Math.round(p / 1000)}k`;
}

function fmtProj(p: number | null | undefined) {
  if (p == null) return '—';
  return Math.round(Number(p)).toString();
}

function recColorHex(rec: string | null) {
  if (rec === 'BUY')  return '#4ade80';
  if (rec === 'SELL') return '#f87171';
  return '#94a3b8';
}

function RecBadge({ rec }: { rec: string | null }) {
  if (!rec) return null;
  const color = recColorHex(rec);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0"
      style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}
    >
      {rec}
    </span>
  );
}

function RecIcon({ rec }: { rec: string | null }) {
  if (rec === 'BUY')  return <TrendingUp size={13} className="text-emerald-400 shrink-0" />;
  if (rec === 'SELL') return <TrendingDown size={13} className="text-red-400 shrink-0" />;
  return <Minus size={13} className="text-white/30 shrink-0" />;
}

function StatPill({ label, value, color = 'text-white' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
      <span className="text-[9px] uppercase tracking-wider text-white/30">{label}</span>
    </div>
  );
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1 w-16 rounded-full bg-white/[0.07] overflow-hidden">
      <div className="h-full rounded-full bg-emerald-400/60 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function DistributionBar({ players }: { players: TeamPlayer[] }) {
  const unlocked = players.filter(p => !p.is_locked);
  if (unlocked.length === 0) return null;
  const buys  = unlocked.filter(p => p.ai_recommendation === 'BUY').length;
  const sells = unlocked.filter(p => p.ai_recommendation === 'SELL').length;
  const holds = unlocked.length - buys - sells;
  const pctBuy  = Math.round((buys  / unlocked.length) * 100);
  const pctSell = Math.round((sells / unlocked.length) * 100);
  const pctHold = 100 - pctBuy - pctSell;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#111] p-4">
      <p className="text-[10px] text-white/35 uppercase tracking-wider mb-3">Team Signal Distribution</p>
      <div className="flex rounded-full overflow-hidden h-2 mb-3 gap-px">
        {pctBuy  > 0 && <div className="bg-emerald-400/70" style={{ width: `${pctBuy}%` }} />}
        {pctHold > 0 && <div className="bg-white/20"       style={{ width: `${pctHold}%` }} />}
        {pctSell > 0 && <div className="bg-red-400/70"     style={{ width: `${pctSell}%` }} />}
      </div>
      <div className="flex justify-between text-[10px]">
        <span className="text-emerald-400 font-semibold">{pctBuy}% BUY</span>
        <span className="text-white/30">{pctHold}% HOLD</span>
        <span className="text-red-400 font-semibold">{pctSell}% SELL</span>
      </div>
    </div>
  );
}

function CategoryModule({
  title, icon, accent, players, isPremium, accentHex,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  players: TeamPlayer[];
  isPremium: boolean;
  accentHex: string;
}) {
  if (players.length === 0) return null;

  const visibleFull    = isPremium ? players.slice(0, 5) : players.slice(0, FREE_FULL);
  const visiblePartial = isPremium ? [] : players.slice(FREE_FULL, FREE_PARTIAL);
  const hiddenCount    = isPremium ? 0 : Math.max(0, players.length - FREE_PARTIAL);

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#111] overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.05]"
        style={{ background: `${accentHex}0a` }}>
        <span style={{ color: accentHex }}>{icon}</span>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="ml-auto text-[10px] text-white/25">{players.length} players</span>
      </div>

      <div className="divide-y divide-white/[0.04]">
        {visibleFull.map((player) => (
          <CategoryPlayerRow key={player.player_id ?? player.player_name} player={player} locked={false} />
        ))}

        {visiblePartial.map((player) => (
          <CategoryPlayerRow key={player.player_id ?? player.player_name} player={player} locked={true} partial />
        ))}

        {hiddenCount > 0 && (
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock size={12} className="text-white/20" />
              <span className="text-[12px] text-white/30">{hiddenCount} more players — Neeko+ only</span>
            </div>
            <Link
              to="/neeko-plus"
              className="text-[10px] font-semibold text-amber-400 hover:text-amber-300 transition-colors"
            >
              Unlock
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryPlayerRow({ player, locked, partial }: { player: TeamPlayer; locked: boolean; partial?: boolean }) {
  const proj = parseFloat(String(player.projection_final));

  const content = (
    <div className={`flex items-center gap-3 px-4 py-3 ${locked ? 'opacity-60' : 'group hover:bg-white/[0.03] transition-colors'}`}>
      <div className="shrink-0">
        <RecIcon rec={locked ? null : player.ai_recommendation} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-white truncate">
            {locked && partial ? player.player_name : player.player_name}
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
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-white/35">
            {POSITION_NAMES[player.player_position] ?? player.player_position}
          </span>
          {player.price > 0 && (
            <>
              <span className="text-[10px] text-white/20">·</span>
              <span className="text-[10px] text-white/35">{fmtPrice(player.price)}</span>
            </>
          )}
          {player.breakeven != null && !locked && (
            <>
              <span className="text-[10px] text-white/20">·</span>
              <span className="text-[10px] text-white/40">BE: {Math.round(player.breakeven)}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {locked && partial ? (
          <div className="flex items-center gap-2">
            <div className="h-4 w-8 rounded bg-white/[0.06]" />
            <Lock size={11} className="text-white/20" />
          </div>
        ) : (
          <>
            {player.value_score != null && (
              <div className="text-right hidden sm:block">
                <p className="text-[9px] text-white/25 uppercase tracking-wide">Value</p>
                <p className="text-xs font-semibold text-amber-400 tabular-nums">
                  {player.value_score > 0 ? '+' : ''}{Number(player.value_score).toFixed(1)}
                </p>
              </div>
            )}
            <div className="text-right min-w-[38px]">
              <p className="text-sm font-bold text-white/80 tabular-nums">{fmtProj(proj)}</p>
              <p className="text-[9px] text-white/25 uppercase tracking-wide">proj</p>
            </div>
            {!locked && <RecBadge rec={player.ai_recommendation} />}
            <ChevronRight size={13} className="text-white/20 group-hover:text-white/40 transition-colors" />
          </>
        )}
      </div>
    </div>
  );

  if (locked) return <div>{content}</div>;

  return (
    <Link to={`/sports/afl/players/${nameToSlug(player.player_name)}`}>
      {content}
    </Link>
  );
}

function FullPlayerRow({
  player, rank, maxProj, isPremium, index,
}: { player: TeamPlayer; rank: number; maxProj: number; isPremium: boolean; index: number }) {
  const proj   = parseFloat(String(player.projection_final));
  const isFull = isPremium || index < FREE_FULL;
  const isPartial = !isFull && index < FREE_PARTIAL;
  const isHidden  = !isFull && !isPartial;

  if (isHidden) return null;

  if (isPartial) {
    return (
      <div className="flex items-center justify-between rounded-xl bg-[#0f0f0f] border border-white/[0.05] px-4 py-3.5 opacity-70">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-sm font-bold text-white/15 w-6 shrink-0 text-center">{rank}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white/60 truncate">{player.player_name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-white/35">
                {POSITION_NAMES[player.player_position] ?? player.player_position}
              </span>
              {player.price > 0 && (
                <>
                  <span className="text-[10px] text-white/20">·</span>
                  <span className="text-[10px] text-white/35">{fmtPrice(player.price)}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="h-4 w-8 rounded bg-white/[0.06]" />
          <Lock size={11} className="text-white/20" />
        </div>
      </div>
    );
  }

  return (
    <Link
      to={`/sports/afl/players/${nameToSlug(player.player_name)}`}
      className="flex items-center justify-between rounded-xl bg-[#111] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-150 px-4 py-3.5 group"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="text-sm font-bold text-white/20 w-6 shrink-0 text-center">{rank}</span>
        <RecIcon rec={player.ai_recommendation} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-white truncate group-hover:text-white/90 transition-colors">
              {player.player_name}
            </p>
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
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-white/35">
              {POSITION_NAMES[player.player_position] ?? player.player_position}
            </span>
            <span className="text-[10px] text-white/20">·</span>
            <span className="text-[10px] text-white/35">{fmtPrice(player.price)}</span>
            {player.breakeven != null && (
              <>
                <span className="text-[10px] text-white/20">·</span>
                <span className="text-[10px] text-white/40">BE: {Math.round(player.breakeven)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div className="hidden sm:flex flex-col items-end gap-1.5">
          <MiniBar value={proj} max={maxProj} />
        </div>
        <div className="text-right min-w-[40px]">
          <p className="text-sm font-bold text-white/80 tabular-nums">{fmtProj(proj)}</p>
          <p className="text-[9px] text-white/25 uppercase tracking-wide">proj</p>
        </div>
        <RecBadge rec={player.ai_recommendation} />
        <ChevronRight size={14} className="text-white/20 group-hover:text-white/40 transition-colors" />
      </div>
    </Link>
  );
}

function UpgradeGate({ teamName }: { teamName: string }) {
  return (
    <Link
      to="/neeko-plus"
      className="flex items-center justify-between rounded-xl border border-amber-400/20 bg-amber-400/[0.04] px-4 py-4 hover:bg-amber-400/[0.07] transition-all duration-150 group"
    >
      <div className="flex items-center gap-3">
        <Crown size={16} className="text-amber-400 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-white">Unlock full {teamName} analysis</p>
          <p className="text-[11px] text-white/40">
            Projections, value scores, AI signals + all {teamName} players
          </p>
        </div>
      </div>
      <ChevronRight size={16} className="text-amber-400/60 group-hover:text-amber-400 transition-colors shrink-0" />
    </Link>
  );
}

function InternalLinks({ teamName, teamSlug }: { teamName: string; teamSlug: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#111] p-4">
      <p className="text-[10px] text-white/35 uppercase tracking-wider mb-3">Explore More</p>
      <div className="grid grid-cols-2 gap-2">
        <Link
          to="/sports/afl/rankings"
          className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-[12px] text-white/60 hover:text-white/80 hover:bg-white/[0.06] transition-all"
        >
          <BarChart2 size={13} className="shrink-0" />
          All Player Rankings
        </Link>
        <Link
          to="/sports/afl/market-watch"
          className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-[12px] text-white/60 hover:text-white/80 hover:bg-white/[0.06] transition-all"
        >
          <TrendingUp size={13} className="shrink-0" />
          Market Watch
        </Link>
        <Link
          to="/sports/afl/edge-board"
          className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-[12px] text-white/60 hover:text-white/80 hover:bg-white/[0.06] transition-all"
        >
          <Zap size={13} className="shrink-0" />
          Edge Board
        </Link>
        <Link
          to="/sports/afl/start-sit"
          className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-[12px] text-white/60 hover:text-white/80 hover:bg-white/[0.06] transition-all"
        >
          <Star size={13} className="shrink-0" />
          Start / Sit Tool
        </Link>
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

function TeamSEOSection({ teamName, players }: { teamName: string; players: TeamPlayer[] }) {
  const [open, setOpen] = useState(false);
  const shortName = teamName.split(' ')[0];
  const topPlayer = players[0];
  const topProj   = topPlayer ? Math.round(Number(topPlayer.projection_final)) : 0;
  const buys      = players.filter(p => p.ai_recommendation === 'BUY');
  const topBuy    = buys[0];

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

      <div className={open ? 'mt-4' : 'hidden'} aria-hidden={!open}>
        <p className="text-[13px] text-white/40 leading-relaxed whitespace-pre-line">{content}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map(tag => (
            <span
              key={tag}
              className="text-[10px] text-white/20 border border-white/[0.06] rounded px-2 py-0.5"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <p className="sr-only">
        Complete {teamName} AFL Fantasy player rankings, projections, price analysis and AI recommendations for the 2026 AFL season.
        Includes every {teamName} player with buy/hold/sell signals, breakeven scores, and value picks — updated weekly.
        Top {teamName} fantasy players: {keyPlayerLines}.
      </p>
    </div>
  );
}

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0e0e0e]">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          <div className="h-6 w-32 rounded bg-white/[0.05] animate-pulse" />
          <div className="h-28 rounded-2xl bg-white/[0.04] animate-pulse" />
          <div className="h-20 rounded-xl bg-white/[0.04] animate-pulse" />
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3].map(i => <div key={i} className="h-40 rounded-xl bg-white/[0.04] animate-pulse" />)}
          </div>
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-14 rounded-xl bg-white/[0.04] animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

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

  const projValues   = players.map(p => parseFloat(String(p.projection_final)) || 0);
  const maxProj      = Math.max(...projValues, 1);
  const topProj      = Math.round(maxProj);
  const avgProj      = players.length > 0 ? Math.round(projValues.reduce((a,b)=>a+b,0) / players.length) : 0;
  const ratingValues = players.map(p => parseFloat(String(p.neeko_rating)) || 0);
  const avgRating    = players.length > 0 ? (ratingValues.reduce((a,b)=>a+b,0) / players.length).toFixed(1) : '—';
  const buyCt        = players.filter(p => p.ai_recommendation === 'BUY').length;

  const topPlayer    = players[0];

  const accentColor = getTeamAccentColour(teamName.split(' ')[0]) ?? '#4ade80';
  const accentSafe  = accentColor === '#FFD200' ? '#F5C84C' : accentColor;

  const unlocked = players.filter(p => !p.is_locked);

  const valuePicks   = [...unlocked]
    .filter(p => p.ai_recommendation === 'BUY' && p.value_score != null)
    .sort((a, b) => (Number(b.value_score) || 0) - (Number(a.value_score) || 0));

  const premiumPicks = [...unlocked]
    .filter(p => p.neeko_rating > 0)
    .sort((a, b) => b.neeko_rating - a.neeko_rating)
    .slice(0, 8);

  const riskPlayers  = [...unlocked]
    .filter(p => p.ai_recommendation === 'SELL')
    .sort((a, b) => (Number(a.value_score) || 0) - (Number(b.value_score) || 0));

  const hiddenFull = !isPremium ? Math.max(0, players.length - FREE_PARTIAL) : 0;

  const pageTitle       = `${teamName} AFL Fantasy Players & Rankings 2026 | Neeko`;
  const pageDescription = `Complete ${teamName} AFL Fantasy roster for 2026. ${topPlayer?.player_name ?? ''} leads with a ${topProj} projection. ${buyCt} BUY signals identified. AI-powered recommendations for every player.`;
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
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "name": pageTitle,
          "description": pageDescription,
          "url": pageUrl,
          "dateModified": new Date().toISOString().slice(0, 10),
          "publisher": { "@type": "Organization", "name": "Neeko Sports", "url": "https://neekostats.com.au" },
          "breadcrumb": {
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home",                 "item": "https://neekostats.com.au" },
              { "@type": "ListItem", "position": 2, "name": "AFL Fantasy Rankings", "item": "https://neekostats.com.au/sports/afl/rankings" },
              { "@type": "ListItem", "position": 3, "name": teamName,               "item": pageUrl }
            ]
          }
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-[#0e0e0e]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

          <button
            onClick={() => navigate('/sports/afl/rankings')}
            className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors text-[12px]"
          >
            <ArrowLeft size={14} />
            Rankings
          </button>

          {/* ── HERO ── */}
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

              <div className="flex items-center gap-5 flex-wrap">
                <StatPill label="Players" value={players.length} />
                <div className="w-px h-6 bg-white/[0.07]" />
                <StatPill label="Top Proj" value={topProj} color="text-emerald-400" />
                <div className="w-px h-6 bg-white/[0.07]" />
                <StatPill label="Avg Proj" value={avgProj} color="text-white/70" />
                <div className="w-px h-6 bg-white/[0.07]" />
                <StatPill label="Avg Rating" value={avgRating} color="text-white/70" />
                <div className="w-px h-6 bg-white/[0.07]" />
                <StatPill label="BUY Signals" value={buyCt} color={buyCt > 0 ? 'text-emerald-400' : 'text-white/40'} />
              </div>
            </div>
          </div>

          {/* ── SIGNAL DISTRIBUTION ── */}
          <DistributionBar players={players} />

          {/* ── CATEGORY MODULES ── */}
          <div className="space-y-4">
            <CategoryModule
              title="Top Value Picks"
              icon={<Flame size={15} />}
              accent="text-emerald-400"
              accentHex="#4ade80"
              players={valuePicks}
              isPremium={isPremium}
            />

            <CategoryModule
              title="Premium Picks"
              icon={<Star size={15} />}
              accent="text-amber-400"
              accentHex="#F5C84C"
              players={premiumPicks}
              isPremium={isPremium}
            />

            <CategoryModule
              title="Risk / Avoid"
              icon={<TriangleAlert size={15} />}
              accent="text-red-400"
              accentHex="#f87171"
              players={riskPlayers}
              isPremium={isPremium}
            />
          </div>

          {/* ── FULL PLAYER ROSTER ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-semibold text-white/80">
                Full {teamName} Roster
              </h2>
              <div className="flex items-center gap-2">
                <Star size={11} className="text-white/20" />
                <span className="text-[10px] text-white/25 uppercase tracking-wide">by projection</span>
              </div>
            </div>

            <div className="space-y-2">
              {players.map((player, idx) => (
                <FullPlayerRow
                  key={player.player_id ?? player.player_name}
                  player={player}
                  rank={idx + 1}
                  maxProj={maxProj}
                  isPremium={isPremium}
                  index={idx}
                />
              ))}
            </div>

            {!isPremium && hiddenFull > 0 && (
              <div className="mt-3 space-y-2">
                {[...Array(Math.min(3, hiddenFull))].map((_, i) => (
                  <div
                    key={`hint-${i}`}
                    className="flex items-center justify-between rounded-xl bg-[#0f0f0f] border border-white/[0.04] px-4 py-3.5"
                    style={{ opacity: 0.45 - i * 0.1 }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-sm font-bold text-white/10 w-6 text-center">
                        {FREE_PARTIAL + i + 1}
                      </span>
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-32 rounded bg-white/[0.05]" />
                        <div className="h-2 w-16 rounded bg-white/[0.03]" />
                      </div>
                    </div>
                    <Lock size={11} className="text-white/15" />
                  </div>
                ))}
                <UpgradeGate teamName={teamName} />
                <p className="text-center text-[10px] text-white/20">
                  {hiddenFull} more players — unlock with Neeko+
                </p>
              </div>
            )}
          </div>

          {/* ── INTERNAL LINKS ── */}
          <InternalLinks teamName={teamName} teamSlug={team ?? ''} />

          {/* ── SEO SECTION ── */}
          <TeamSEOSection teamName={teamName} players={players} />

        </div>
      </div>
    </>
  );
}
