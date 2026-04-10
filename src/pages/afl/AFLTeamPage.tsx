import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft, ChevronRight, TrendingUp, TrendingDown, Minus,
  Users, Zap, ChartBar as BarChart2, Star, CircleAlert as AlertCircle,
  Flame, Trophy, DollarSign, Lock,
} from 'lucide-react';
import { nameToSlug, POSITION_NAMES, TEAM_SLUG_TO_NAME } from '@/lib/slugs';
import { getTeamPlayersSafe } from '@/lib/playerAccess';
import { useAuth } from '@/lib/auth';
import { getTeamAccentColour } from '@/config/aflTeamColours';
import { PlayerStatusPill } from '@/features/afl/rankings/components/PlayerStatusPill';
import { signalFromField, formatEdgeSignalLabel, getEdgeSignalColor } from '@/utils/aflEdgeSignal';
import { useAccessState } from '@/hooks/useAccessState';

const FREE_PLAYER_LIMIT = 8;

interface TeamPlayer {
  player_id: string | null;
  player_name: string;
  team: string | null;
  position: string | null;
  price: number | null;
  projection: number | null;
  breakeven: number | null;
  value_score: number | null;
  signal: string | null;
  status: string | null;
  is_bye: boolean | null;
  games_played: number | null;
}

function fmtPrice(p: number | null) {
  if (!p) return '—';
  return `$${Math.round(p / 1000)}k`;
}

function fmtProj(p: number | null | undefined) {
  if (p == null) return '—';
  return Math.round(Number(p)).toString();
}

function SignalBadge({ signal }: { signal: string | null }) {
  const sig = signalFromField(signal);
  const color = getEdgeSignalColor(sig);
  const label = formatEdgeSignalLabel(sig);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0"
      style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}
    >
      {label}
    </span>
  );
}

function SignalIcon({ signal }: { signal: string | null }) {
  const sig = signalFromField(signal);
  if (sig === 'STRONG_BUY' || sig === 'BUY')
    return <TrendingUp size={13} className="text-emerald-400 shrink-0" />;
  if (sig === 'STRONG_SELL' || sig === 'SELL')
    return <TrendingDown size={13} className="text-red-400 shrink-0" />;
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

function SnapshotCard({
  icon, label, playerName, stat, statLabel, slug, accentColor,
}: {
  icon: React.ReactNode;
  label: string;
  playerName: string;
  stat: string;
  statLabel: string;
  slug: string;
  accentColor: string;
}) {
  return (
    <Link
      to={`/sports/afl/players/${slug}`}
      className="rounded-xl border border-white/[0.07] bg-[#111] p-4 hover:bg-white/[0.04] hover:border-white/[0.12] transition-all group flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <span style={{ color: accentColor }}>{icon}</span>
        <span className="text-[10px] uppercase tracking-wider text-white/35">{label}</span>
      </div>
      <p className="text-sm font-semibold text-white truncate group-hover:text-white/90 transition-colors">
        {playerName}
      </p>
      <div className="flex items-end justify-between">
        <span className="text-xl font-bold tabular-nums" style={{ color: accentColor }}>{stat}</span>
        <span className="text-[9px] text-white/30 uppercase tracking-wide">{statLabel}</span>
      </div>
    </Link>
  );
}

function LockedField() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-white/20 select-none">
      <Lock size={9} className="shrink-0" />
      <span className="blur-[3px]">000</span>
    </span>
  );
}

function RosterRow({ player, rank, isPremium }: { player: TeamPlayer; rank: number; isPremium: boolean }) {
  const proj = player.projection;
  const slug = nameToSlug(player.player_name);

  return (
    <Link
      to={`/sports/afl/players/${slug}`}
      className="flex items-center justify-between rounded-xl bg-[#111] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-150 px-4 py-3.5 group"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="text-sm font-bold text-white/20 w-6 shrink-0 text-center tabular-nums">{rank}</span>
        <SignalIcon signal={player.signal} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-white truncate group-hover:text-white/90 transition-colors">
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
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-white/35">
              {POSITION_NAMES[player.position ?? ''] ?? player.position ?? '—'}
            </span>
            <span className="text-[10px] text-white/20">·</span>
            <span className="text-[10px] text-white/35">{fmtPrice(player.price)}</span>
            {isPremium && player.breakeven != null && (
              <>
                <span className="text-[10px] text-white/20">·</span>
                <span className="text-[10px] text-white/40">BE: {Math.round(player.breakeven)}</span>
              </>
            )}
            {!isPremium && (
              <>
                <span className="text-[10px] text-white/20">·</span>
                <span className="text-[10px] text-white/25">BE: <LockedField /></span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {isPremium && player.value_score != null && (
          <div className="text-right hidden sm:block">
            <p className="text-[9px] text-white/25 uppercase tracking-wide">Value</p>
            <p className="text-xs font-semibold text-amber-400 tabular-nums">
              {player.value_score > 0 ? '+' : ''}{Number(player.value_score).toFixed(1)}
            </p>
          </div>
        )}
        {!isPremium && (
          <div className="text-right hidden sm:block">
            <p className="text-[9px] text-white/25 uppercase tracking-wide">Value</p>
            <p className="text-xs text-white/20"><LockedField /></p>
          </div>
        )}
        <div className="text-right min-w-[40px]">
          <p className="text-sm font-bold text-white/80 tabular-nums">{fmtProj(proj)}</p>
          <p className="text-[9px] text-white/25 uppercase tracking-wide">proj</p>
        </div>
        <SignalBadge signal={player.signal} />
        <ChevronRight size={14} className="text-white/20 group-hover:text-white/40 transition-colors" />
      </div>
    </Link>
  );
}

function PremiumCTA({ teamName }: { teamName: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] to-[#111] p-6 text-center">
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 mx-auto mb-3">
        <Lock size={18} className="text-amber-400" />
      </div>
      <h3 className="text-base font-bold text-white mb-1">
        Unlock full {teamName} analysis
      </h3>
      <p className="text-[12px] text-white/45 mb-4">
        View all players + breakeven scores, value ratings, and AI recommendations
      </p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <Link
          to="/upgrade"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-5 py-2.5 text-sm font-bold text-black"
        >
          <Zap size={14} />
          Unlock Neeko+
        </Link>
        <Link
          to="/auth"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-colors px-5 py-2.5 text-sm text-white/60 hover:text-white"
        >
          Sign in
        </Link>
      </div>
    </div>
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
            .slice(0, 10)
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

function TeamSEOBlock({ teamName, players }: { teamName: string; players: TeamPlayer[] }) {
  const shortName = teamName.split(' ')[0];
  const isHistoric = ['Adelaide', 'Hawthorn', 'Geelong', 'Richmond', 'Carlton', 'Collingwood'].includes(shortName);

  const top5 = players
    .slice(0, 5)
    .map(p => `${p.player_name} (${p.position ?? '—'}, proj: ${fmtProj(p.projection)})`)
    .join(', ');

  const topPlayer = players[0];
  const topProj = topPlayer ? fmtProj(topPlayer.projection) : '—';

  const buys = players.filter(p => { const sig = signalFromField(p.signal_tag); return sig === 'STRONG_BUY' || sig === 'BUY'; });
  const valuePickNames = buys.slice(0, 3).map(p => p.player_name).join(', ');

  return (
    <section className="border-t border-white/[0.05] pt-8 pb-2">
      <h2 className="text-base font-semibold text-white/60 mb-4">
        {teamName} AFL Fantasy 2026 Guide
      </h2>

      <div className="space-y-4 text-[13px] text-white/40 leading-relaxed">
        <div>
          <h3 className="text-[12px] font-semibold text-white/50 uppercase tracking-wider mb-1">
            {teamName} Team Overview
          </h3>
          <p>
            The {teamName} are one of the AFL's {isHistoric ? 'most historic' : 'competitive'} clubs,
            providing significant AFL Fantasy opportunities each season. This page shows every {teamName} player's
            fantasy projection, price, and AI-generated trade recommendation for the 2026 AFL Fantasy season.
            {topPlayer && ` ${topPlayer.player_name} currently leads the squad with a projected ${topProj} points.`}
          </p>
        </div>

        <div>
          <h3 className="text-[12px] font-semibold text-white/50 uppercase tracking-wider mb-1">
            Top {teamName} Fantasy Players
          </h3>
          <p>
            Key {teamName} players ranked by projected output include {top5}.
            All projections are calculated by Neeko's engine, which analyses recent form, matchup difficulty,
            venue factors, and price efficiency. Projections are updated weekly following each AFL round.
          </p>
        </div>

        {valuePickNames && (
          <div>
            <h3 className="text-[12px] font-semibold text-white/50 uppercase tracking-wider mb-1">
              {teamName} Value Picks
            </h3>
            <p>
              Current Start signals from the {teamName} squad include {valuePickNames}.
              Start signals identify underpriced players whose projected scores exceed their breakeven,
              meaning they are expected to increase in price. These represent the strongest trade-in
              targets from the {shortName} roster right now.
            </p>
          </div>
        )}

        <div>
          <h3 className="text-[12px] font-semibold text-white/50 uppercase tracking-wider mb-1">
            How {shortName} Projections Work
          </h3>
          <p>
            Each {teamName} player's projection is computed using Neeko's statistical model, combining
            season averages, last-3-game form, opponent position concession rates, venue multipliers,
            and role stability signals. Click any player's name to view their full analysis,
            historical scores, and detailed AI breakdown.
          </p>
        </div>
      </div>

      <p className="sr-only">
        Complete {teamName} AFL Fantasy player rankings, projections, price analysis and AI recommendations
        for the 2026 AFL season. Includes every {teamName} player with buy/hold/sell signals, breakeven
        scores, and value picks — updated weekly. Top {teamName} fantasy players: {top5}.
      </p>
    </section>
  );
}

export default function AFLTeamPage() {
  const { team } = useParams<{ team: string }>();
  const teamName = team ? TEAM_SLUG_TO_NAME[team] : '';
  const navigate = useNavigate();
  const { isPremium } = useAccessState();
  const { user } = useAuth();

  const [players, setPlayers] = useState<TeamPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!teamName) { setError(true); setLoading(false); return; }

    (async () => {
      try {
        const data = await getTeamPlayersSafe(teamName, user?.id ?? null);
        const mapped = ((data ?? []) as any[]).map((r: any): TeamPlayer => ({
          player_id: r.player_id ?? null,
          player_name: r.player_name ?? '',
          team: r.team ?? r.team_name ?? null,
          position: r.player_position ?? r.position ?? null,
          price: r.price != null ? Number(r.price) : null,
          projection: r.projection != null ? Number(r.projection) : null,
          breakeven: r.breakeven != null ? Number(r.breakeven) : null,
          value_score: r.value_score != null ? Number(r.value_score) : null,
          signal: r.signal ?? null,
          status: r.status ?? null,
          is_bye: r.is_bye != null ? Boolean(r.is_bye) : null,
          games_played: r.games_played != null ? Number(r.games_played) : null,
        }));
        setPlayers(mapped);
        setLoading(false);
      } catch (err) {
        console.error("TEAM QUERY FAILED:", teamName, err);
        setError(true);
        setLoading(false);
      }
    })();
  }, [teamName, user?.id]);

  const stats = useMemo(() => {
    if (!players.length) return { totalPlayers: 0, topProj: 0, avgProj: 0, topPlayer: null, mostExpensivePlayer: null };

    const projValues = players.map(p => Number(p.projection) || 0);
    const topProj = Math.max(...projValues);
    const avgProj = Math.round(projValues.reduce((a, b) => a + b, 0) / players.length);
    const topPlayer = players[0];
    const mostExpensivePlayer = [...players].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0))[0];

    return { totalPlayers: players.length, topProj: Math.round(topProj), avgProj, topPlayer, mostExpensivePlayer };
  }, [players]);

  const accentColor = getTeamAccentColour(teamName.split(' ')[0]) ?? '#4ade80';
  const accentSafe = accentColor === '#FFD200' ? '#F5C84C' : accentColor;

  const buyCt = useMemo(() =>
    players.filter(p => { const sig = signalFromField(p.signal_tag); return sig === 'STRONG_BUY' || sig === 'BUY'; }).length,
    [players]
  );

  const visiblePlayers = isPremium ? players : players.slice(0, FREE_PLAYER_LIMIT);
  const hasMore = !isPremium && players.length > FREE_PLAYER_LIMIT;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e0e0e]">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          <div className="h-6 w-32 rounded bg-white/[0.05] animate-pulse" />
          <div className="h-28 rounded-2xl bg-white/[0.04] animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[1,2,3].map(i => <div key={i} className="h-24 rounded-xl bg-white/[0.04] animate-pulse" />)}
          </div>
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-16 rounded-xl bg-white/[0.04] animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error || !teamName) {
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

  const pageTitle = `${teamName} AFL Fantasy Players 2026 | Neeko`;
  const pageDescription = `${teamName} AFL Fantasy players for 2026. Projected scores, prices, and rankings for every ${teamName} player this round. ${stats.totalPlayers} players listed, ${buyCt} Start signals identified.`;
  const pageUrl = `https://neekostats.com.au/sports/afl/teams/${team}`;

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
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://neekostats.com.au" },
              { "@type": "ListItem", "position": 2, "name": "AFL Fantasy Rankings", "item": "https://neekostats.com.au/sports/afl/rankings" },
              { "@type": "ListItem", "position": 3, "name": teamName, "item": pageUrl },
            ],
          },
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
                  <h1 className="text-2xl font-bold text-white leading-tight">
                    {teamName} AFL Fantasy Players 2026
                  </h1>
                  <p className="text-[12px] text-white/40 mt-0.5">
                    Projected players, prices, and rankings for {teamName} this round.
                  </p>
                </div>
                <div
                  className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                  style={{ background: `${accentSafe}20`, border: `1px solid ${accentSafe}30` }}
                >
                  <Users size={18} style={{ color: accentSafe }} />
                </div>
              </div>

              <div className="flex items-center gap-5 flex-wrap">
                <StatPill label="Players" value={stats.totalPlayers} />
                <div className="w-px h-6 bg-white/[0.07]" />
                <StatPill label="Top Proj" value={stats.topProj} color="text-emerald-400" />
                <div className="w-px h-6 bg-white/[0.07]" />
                <StatPill label="Avg Proj" value={stats.avgProj} color="text-white/70" />
                <div className="w-px h-6 bg-white/[0.07]" />
                <StatPill label="Start Signals" value={buyCt} color={buyCt > 0 ? 'text-emerald-400' : 'text-white/40'} />
              </div>
            </div>
          </div>

          {/* ── SNAPSHOT CARDS ── */}
          {players.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {stats.topPlayer && (
                <SnapshotCard
                  icon={<Trophy size={14} />}
                  label="Top Projected"
                  playerName={stats.topPlayer.player_name}
                  stat={fmtProj(stats.topPlayer.projection)}
                  statLabel="projection"
                  slug={nameToSlug(stats.topPlayer.player_name)}
                  accentColor="#34d399"
                />
              )}
              {stats.topPlayer && (
                <SnapshotCard
                  icon={<Flame size={14} />}
                  label="Team Avg Projection"
                  playerName={`${teamName.split(' ')[0]} squad`}
                  stat={String(stats.avgProj)}
                  statLabel="avg pts"
                  slug={nameToSlug(stats.topPlayer.player_name)}
                  accentColor="#F5C84C"
                />
              )}
              {stats.mostExpensivePlayer && (
                <SnapshotCard
                  icon={<DollarSign size={14} />}
                  label="Most Expensive"
                  playerName={stats.mostExpensivePlayer.player_name}
                  stat={fmtPrice(stats.mostExpensivePlayer.price)}
                  statLabel="price"
                  slug={nameToSlug(stats.mostExpensivePlayer.player_name)}
                  accentColor={accentSafe}
                />
              )}
            </div>
          )}

          {/* ── ROSTER TABLE ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-semibold text-white/80">
                {isPremium ? 'Full' : 'Top'} {teamName} Roster
              </h2>
              <span className="text-[10px] text-white/25 uppercase tracking-wide">
                sorted by projection
              </span>
            </div>

            {players.length === 0 ? (
              <div className="rounded-xl border border-white/[0.07] bg-[#111] px-4 py-8 text-center">
                <p className="text-sm text-white/40">No player data available yet.</p>
                <p className="text-[11px] text-white/25 mt-1">Check back after round data is processed.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {visiblePlayers.map((player, idx) => (
                  <RosterRow
                    key={player.player_id ?? player.player_name}
                    player={player}
                    rank={idx + 1}
                    isPremium={isPremium}
                  />
                ))}

                {hasMore && (
                  <PremiumCTA teamName={teamName} />
                )}
              </div>
            )}
          </div>

          {/* ── INTERNAL LINKS ── */}
          <InternalLinks teamName={teamName} teamSlug={team ?? ''} />

          {/* ── SEO BLOCK ── */}
          <TeamSEOBlock teamName={teamName} players={players} />

        </div>
      </div>
    </>
  );
}
