import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Lock, Crown, Users, Zap, ChartBar as BarChart2, ChevronDown, ChevronUp, Star, CircleAlert as AlertCircle, ShieldCheck } from 'lucide-react';
import { nameToSlug, POSITION_NAMES, TEAM_SLUG_TO_NAME } from '@/lib/slugs';
import { getTeamPlayersSafe } from '@/lib/playerAccess';
import { useAuth } from '@/lib/auth';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { getTeamAccentColour } from '@/config/aflTeamColours';

interface TeamPlayer {
  player_id?: number;
  player_name: string;
  player_position: string;
  team?: string;
  neeko_rating: number;
  projection_final: number;
  value_score: number | null;
  price: number;
  ai_recommendation: string | null;
  recommendation_color?: string;
  summary_short: string | null;
  summary_long?: string | null;
  is_locked?: boolean;
}

const FREE_VISIBLE = 8;

function fmtPrice(p: number) {
  return `$${Math.round(p / 1000)}k`;
}

function fmtProj(p: number) {
  return Math.round(p).toString();
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
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
      style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}
    >
      {rec}
    </span>
  );
}

function RecIcon({ rec }: { rec: string | null }) {
  if (rec === 'BUY')  return <TrendingUp size={13} className="text-emerald-400" />;
  if (rec === 'SELL') return <TrendingDown size={13} className="text-red-400" />;
  return <Minus size={13} className="text-white/30" />;
}

function MiniSparkbar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1 w-16 rounded-full bg-white/[0.07] overflow-hidden">
      <div
        className="h-full rounded-full bg-emerald-400/60 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatPill({
  label, value, color = 'text-white',
}: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
      <span className="text-[9px] uppercase tracking-wider text-white/30">{label}</span>
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
        {pctBuy  > 0 && <div className="bg-emerald-400/70 transition-all" style={{ width: `${pctBuy}%` }} />}
        {pctHold > 0 && <div className="bg-white/20 transition-all"       style={{ width: `${pctHold}%` }} />}
        {pctSell > 0 && <div className="bg-red-400/70 transition-all"     style={{ width: `${pctSell}%` }} />}
      </div>
      <div className="flex justify-between text-[10px]">
        <span className="text-emerald-400 font-semibold">{pctBuy}% BUY</span>
        <span className="text-white/30">{pctHold}% HOLD</span>
        <span className="text-red-400 font-semibold">{pctSell}% SELL</span>
      </div>
    </div>
  );
}

function TeamInsights({ players, teamName }: { players: TeamPlayer[]; teamName: string }) {
  const unlocked = players.filter(p => !p.is_locked);
  const buys  = players.filter(p => p.ai_recommendation === 'BUY');
  const sells = players.filter(p => p.ai_recommendation === 'SELL');
  const highVal = unlocked.filter(p => p.value_score != null && p.value_score > 8);
  const avgProj = players.length > 0
    ? players.reduce((s, p) => s + (parseFloat(String(p.projection_final)) || 0), 0) / players.length
    : 0;

  const insights: { icon: React.ReactNode; text: string; color: string }[] = [];

  if (buys.length > 0) {
    insights.push({
      icon: <TrendingUp size={13} />,
      text: `${buys.length} BUY candidate${buys.length > 1 ? 's' : ''} identified this round`,
      color: 'text-emerald-400',
    });
  }
  if (sells.length > 0) {
    insights.push({
      icon: <TrendingDown size={13} />,
      text: `${sells.length} player${sells.length > 1 ? 's' : ''} flagged as trade-out targets`,
      color: 'text-red-400',
    });
  }
  if (highVal.length > 0) {
    insights.push({
      icon: <Zap size={13} />,
      text: `${highVal.length} underpriced value pick${highVal.length > 1 ? 's' : ''} in this squad`,
      color: 'text-amber-400',
    });
  }
  if (avgProj > 0) {
    insights.push({
      icon: <BarChart2 size={13} />,
      text: `Team avg projection: ${Math.round(avgProj)} pts — ${avgProj >= 80 ? 'above' : 'below'} league average`,
      color: avgProj >= 80 ? 'text-emerald-400' : 'text-white/50',
    });
  }

  if (insights.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#111] p-4">
      <p className="text-[10px] text-white/35 uppercase tracking-wider mb-3">Team Intelligence</p>
      <div className="flex flex-col gap-2.5">
        {insights.map((ins, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className={`mt-px shrink-0 ${ins.color}`}>{ins.icon}</span>
            <p className={`text-[12px] leading-snug ${ins.color}`}>{ins.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeaturedPlayers({
  players, isPremium,
}: { players: TeamPlayer[]; isPremium: boolean }) {
  const unlockedPlayers = players.filter(p => !p.is_locked);

  const topBuy  = unlockedPlayers.find(p => p.ai_recommendation === 'BUY');
  const topSell = unlockedPlayers.find(p => p.ai_recommendation === 'SELL');
  const topHold = unlockedPlayers.find(
    p => p.ai_recommendation === 'HOLD' && p !== topBuy && p !== topSell
  );

  const featured = [
    topBuy  ? { player: topBuy,  label: 'Top BUY',  icon: <TrendingUp size={12} />,  accent: '#4ade80' } : null,
    topHold ? { player: topHold, label: 'Top HOLD', icon: <ShieldCheck size={12} />, accent: '#94a3b8' } : null,
    topSell ? { player: topSell, label: 'Top SELL', icon: <TrendingDown size={12} />, accent: '#f87171' } : null,
  ].filter(Boolean) as { player: TeamPlayer; label: string; icon: React.ReactNode; accent: string }[];

  if (featured.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] text-white/35 uppercase tracking-wider mb-3">Key Decisions This Round</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {featured.map(({ player, label, icon, accent }) => (
          <Link
            key={player.player_name}
            to={`/sports/afl/players/${nameToSlug(player.player_name)}`}
            className="group rounded-xl border bg-[#111] p-3.5 flex flex-col gap-2 hover:bg-white/[0.04] transition-all duration-150"
            style={{ borderColor: `${accent}30` }}
          >
            <div className="flex items-center justify-between">
              <span
                className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{ color: accent, background: `${accent}18` }}
              >
                {icon}{label}
              </span>
              <span className="text-[9px] text-white/25 uppercase">
                {POSITION_NAMES[player.player_position] ?? player.player_position}
              </span>
            </div>

            <div>
              <p className="text-sm font-bold text-white leading-tight mb-0.5 group-hover:text-white/90 transition-colors">
                {player.player_name}
              </p>
              <p className="text-[11px] text-white/40">{fmtPrice(player.price)}</p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] text-white/30 uppercase tracking-wide">Projection</p>
                <p className="text-base font-bold tabular-nums" style={{ color: accent }}>
                  {fmtProj(parseFloat(String(player.projection_final)))}
                </p>
              </div>
              {player.value_score != null && (
                <div className="text-right">
                  <p className="text-[9px] text-white/30 uppercase tracking-wide">Value</p>
                  <p className="text-sm font-semibold text-amber-400 tabular-nums">
                    +{parseFloat(String(player.value_score)).toFixed(1)}
                  </p>
                </div>
              )}
            </div>

            {player.summary_short && (
              <p className="text-[11px] text-white/40 leading-relaxed line-clamp-2 border-t border-white/[0.05] pt-2">
                {player.summary_short}
              </p>
            )}
          </Link>
        ))}
      </div>

      {!isPremium && (
        <p className="mt-2 text-[10px] text-white/25 text-center">
          Upgrade to see key decisions for all players
        </p>
      )}
    </div>
  );
}

function PlayerRow({
  player, rank, maxProj, isPremium,
}: { player: TeamPlayer; rank: number; maxProj: number; isPremium: boolean }) {
  const proj = parseFloat(String(player.projection_final));
  const isLocked = player.is_locked && !isPremium;

  if (isLocked) {
    return (
      <div className="flex items-center justify-between rounded-xl bg-[#0f0f0f] border border-white/[0.05] px-4 py-3.5 opacity-60">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-sm font-bold text-white/15 w-6 shrink-0 text-center">{rank}</span>
          <div className="flex-1 min-w-0">
            <div className="h-3 w-28 rounded bg-white/[0.06] mb-1.5" />
            <div className="h-2 w-14 rounded bg-white/[0.04]" />
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="h-3 w-8 rounded bg-white/[0.06]" />
          <Lock size={12} className="text-white/20" />
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
        <div className="flex items-center gap-2 shrink-0">
          <RecIcon rec={player.ai_recommendation} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate group-hover:text-white/90 transition-colors">
            {player.player_name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-white/35">
              {POSITION_NAMES[player.player_position] ?? player.player_position}
            </span>
            <span className="text-[10px] text-white/20">·</span>
            <span className="text-[10px] text-white/35">{fmtPrice(player.price)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div className="hidden sm:flex flex-col items-end gap-1.5">
          <MiniSparkbar value={proj} max={maxProj} />
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
      to="/pricing"
      className="flex items-center justify-between rounded-xl border border-amber-400/20 bg-amber-400/[0.04] px-4 py-4 hover:bg-amber-400/[0.07] transition-all duration-150 group"
    >
      <div className="flex items-center gap-3">
        <Crown size={16} className="text-amber-400 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-white">Unlock full {teamName} analysis</p>
          <p className="text-[11px] text-white/40">
            See all players, AI signals, and value picks
          </p>
        </div>
      </div>
      <ChevronRight size={16} className="text-amber-400/60 group-hover:text-amber-400 transition-colors shrink-0" />
    </Link>
  );
}

function TeamSEOSection({ teamName }: { teamName: string }) {
  const [open, setOpen] = useState(false);
  const shortName = teamName.split(' ')[0];

  const content = `The ${teamName} are one of the AFL's ${shortName === 'Adelaide' || shortName === 'Hawthorn' || shortName === 'Geelong' || shortName === 'Richmond' ? 'historic' : 'competitive'} clubs, with a roster that presents significant AFL Fantasy opportunities each season. This page provides a complete breakdown of every ${teamName} player's fantasy projection, price, and AI-generated trade recommendation for the 2026 AFL Fantasy season.

Neeko's projection engine analyses recent form, matchup difficulty, venue factors, and price efficiency to rank each ${teamName} player by expected fantasy output. BUY signals identify underpriced players whose projected scores exceed their breakeven, while SELL signals flag overpriced options where value has peaked.

For AFL Fantasy coaches targeting ${teamName} players, key metrics include the Neeko Rating (an overall fantasy value score), projection confidence, and value score — which measures how efficiently a player scores relative to their current price point. Players with high value scores and BUY recommendations represent the strongest trade-in targets from this squad.`;

  return (
    <div className="border-t border-white/[0.05] pt-6">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full text-left group"
        aria-expanded={open}
      >
        <h2 className="text-sm font-semibold text-white/50 group-hover:text-white/70 transition-colors">
          AFL Fantasy {teamName} Team Guide 2026
        </h2>
        {open
          ? <ChevronUp size={15} className="text-white/30 shrink-0" />
          : <ChevronDown size={15} className="text-white/30 shrink-0" />
        }
      </button>

      <div className={open ? 'mt-4' : 'hidden'} aria-hidden={!open}>
        <p className="text-[13px] text-white/40 leading-relaxed whitespace-pre-line">{content}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {['AFL Fantasy tips', `${teamName} fantasy`, 'fantasy projections 2026',
            'best buys AFL Fantasy', `${shortName} players ranked`, 'AFL Fantasy value picks'].map(tag => (
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
        Includes every {teamName} player with buy/hold/sell signals updated weekly.
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
          <div className="h-24 rounded-xl bg-white/[0.04] animate-pulse" />
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-white/[0.04] animate-pulse" />)}
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
  const maxProj      = Math.max(...projValues);
  const topProj      = Math.round(maxProj);
  const avgProj      = players.length > 0 ? Math.round(projValues.reduce((a,b)=>a+b,0) / players.length) : 0;
  const ratingValues = players.map(p => parseFloat(String(p.neeko_rating)) || 0);
  const avgRating    = players.length > 0 ? (ratingValues.reduce((a,b)=>a+b,0) / players.length).toFixed(1) : '—';
  const buyCt        = players.filter(p => p.ai_recommendation === 'BUY').length;

  const visiblePlayers  = isPremium ? players : players.slice(0, FREE_VISIBLE);
  const hiddenCount     = isPremium ? 0 : Math.max(0, players.length - FREE_VISIBLE);
  const topPlayer       = players[0];

  const accentColor = getTeamAccentColour(teamName.split(' ')[0]) ?? '#4ade80';
  const accentSafe  = accentColor === '#FFD200' ? '#F5C84C' : accentColor;

  const pageTitle       = `${teamName} AFL Fantasy Players & Rankings 2026 | Neeko`;
  const pageDescription = `Complete ${teamName} AFL Fantasy roster for 2026. ${topPlayer?.player_name ?? ''} leads with a ${topProj} projection. ${buyCt} BUY signals identified. AI-powered recommendations for every player.`;
  const pageUrl         = `https://neekostats.com.au/sports/afl/teams/${team}`;

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content={`${teamName}, AFL Fantasy, AFL Fantasy 2026, ${teamName} players, fantasy projections, buy sell hold, captain picks, ${teamName} fantasy tips 2026`} />
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

          {/* Back nav */}
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
                  <p className="text-[12px] text-white/40 mt-0.5">Team Intelligence Breakdown</p>
                </div>
                <div
                  className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                  style={{ background: `${accentSafe}20`, border: `1px solid ${accentSafe}30` }}
                >
                  <Users size={18} style={{ color: accentSafe }} />
                </div>
              </div>

              {/* Top-line metrics */}
              <div className="flex items-center gap-6 flex-wrap">
                <StatPill label="Players" value={players.length} />
                <div className="w-px h-6 bg-white/[0.07]" />
                <StatPill label="Top Proj" value={topProj} color="text-emerald-400" />
                <div className="w-px h-6 bg-white/[0.07]" />
                <StatPill label="Avg Proj" value={avgProj} color="text-white/70" />
                <div className="w-px h-6 bg-white/[0.07]" />
                <StatPill label="Avg Rating" value={avgRating} color="text-white/70" />
                <div className="w-px h-6 bg-white/[0.07]" />
                <StatPill
                  label="BUY Signals"
                  value={buyCt}
                  color={buyCt > 0 ? 'text-emerald-400' : 'text-white/40'}
                />
              </div>
            </div>
          </div>

          {/* ── TEAM INTELLIGENCE INSIGHTS ── */}
          <TeamInsights players={players} teamName={teamName} />

          {/* ── SIGNAL DISTRIBUTION ── */}
          <DistributionBar players={players} />

          {/* ── FEATURED PLAYERS — KEY DECISIONS ── */}
          <FeaturedPlayers players={players} isPremium={isPremium} />

          {/* ── PLAYER ROSTER ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-semibold text-white/80">
                {isPremium ? 'Full Roster' : `Top ${FREE_VISIBLE} Players`}
              </h2>
              <div className="flex items-center gap-2">
                <Star size={11} className="text-white/20" />
                <span className="text-[10px] text-white/25 uppercase tracking-wide">by projection</span>
              </div>
            </div>

            <div className="space-y-2">
              {visiblePlayers.map((player, idx) => (
                <PlayerRow
                  key={player.player_id ?? player.player_name}
                  player={player}
                  rank={idx + 1}
                  maxProj={maxProj}
                  isPremium={isPremium}
                />
              ))}

              {/* Locked rows hint */}
              {!isPremium && hiddenCount > 0 && (
                <>
                  {[...Array(Math.min(3, hiddenCount))].map((_, i) => (
                    <div
                      key={`locked-hint-${i}`}
                      className="flex items-center justify-between rounded-xl bg-[#0f0f0f] border border-white/[0.04] px-4 py-3.5"
                      style={{ opacity: 0.5 - i * 0.12 }}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="text-sm font-bold text-white/10 w-6 text-center">
                          {FREE_VISIBLE + i + 1}
                        </span>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="h-3 w-32 rounded bg-white/[0.05]" />
                          <div className="h-2 w-16 rounded bg-white/[0.03]" />
                        </div>
                      </div>
                      <Lock size={11} className="text-white/15" />
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Upgrade gate */}
            {!isPremium && hiddenCount > 0 && (
              <div className="mt-3 space-y-2">
                <UpgradeGate teamName={teamName} />
                <p className="text-center text-[10px] text-white/20">
                  {hiddenCount} more players locked
                </p>
              </div>
            )}
          </div>

          {/* ── BOTTOM CTA ── */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <Link
              to="/sports/afl/rankings"
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm font-semibold text-white/60 hover:text-white/80 hover:bg-white/[0.07] transition-all duration-150"
            >
              <BarChart2 size={14} />
              All Rankings
            </Link>
            <Link
              to="/sports/afl/market-watch"
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm font-semibold text-white/60 hover:text-white/80 hover:bg-white/[0.07] transition-all duration-150"
            >
              <TrendingUp size={14} />
              Market Watch
            </Link>
          </div>

          {/* ── SEO SECTION ── */}
          <TeamSEOSection teamName={teamName} />

        </div>
      </div>
    </>
  );
}
