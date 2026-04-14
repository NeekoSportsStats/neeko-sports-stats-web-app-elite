import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft, ChevronRight, TrendingUp, TrendingDown, Minus,
  Zap, ChartBar as BarChart2, Star, CircleAlert as AlertCircle,
  Lock, Users, GitCompare, ChevronDown, ChevronUp,
} from 'lucide-react';
import { slugToName, nameToSlug, POSITION_SLUGS, POSITION_NAMES, TEAM_SLUG_TO_NAME } from '@/lib/slugs';
import { getPlayerDetailSafe, getSimilarPlayersSafe } from '@/lib/playerAccess';
import { useAuth } from '@/lib/auth';
import { useAccessState } from '@/hooks/useAccessState';
import { PlayerStatusPill } from '@/features/afl/rankings/components/PlayerStatusPill';
import { signalFromField, formatEdgeSignalLabel, getEdgeSignalColor } from '@/utils/aflEdgeSignal';
import {
  getFormStyles, fmtPrice as fmtPriceHelper,
  getValueScoreColor, fmtValueScore,
} from '@/features/afl/rankings/components/helpers';

const ScoreHistoryChart = lazy(() => import('@/features/afl/rankings/components/ScoreHistoryChart'));

interface PlayerData {
  player_id: number;
  player_name: string;
  team: string | null;
  player_position: string | null;
  position_group?: string | null;
  price: number | null;
  projection: number | null;
  breakeven: number | null;
  value_score: number | null;
  signal: string | null;
  signal_tag: string | null;
  signal_display: string | null;
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
  edge: number | null;
  action: string | null;
  is_locked: boolean | null;
}

interface SimilarPlayer {
  player_id: number;
  player_name: string;
  team: string | null;
  player_position: string | null;
  price: number | null;
  projection: number | null;
  value_score: number | null;
  signal: string | null;
  signal_tag: string | null;
  is_locked: boolean | null;
}

function fmtProj(p: number | null | undefined) {
  if (p == null) return '—';
  return Math.round(Number(p)).toString();
}

function getPositionSlug(positionCode: string | null | undefined): string | null {
  if (!positionCode) return null;
  return POSITION_SLUGS[positionCode] ?? null;
}

function getPositionName(positionCode: string | null | undefined): string {
  if (!positionCode) return 'Unknown';
  return POSITION_NAMES[positionCode] ?? positionCode;
}

function deriveFormLabel(avg3: number | null, seasonAvg: number | null): string {
  if (avg3 == null || seasonAvg == null || seasonAvg === 0) return 'Neutral';
  const delta = avg3 - seasonAvg;
  if (delta >= 12) return 'HOT';
  if (delta >= 4)  return 'Rising';
  if (delta > -4)  return 'Neutral';
  if (delta > -12) return 'Dropping';
  return 'Cold';
}

function getActionColor(action: string | null): string {
  if (!action) return '#94a3b8';
  if (action === 'START') return '#10b981';
  if (action === 'HOLD')  return '#94a3b8';
  if (action === 'SIT')   return '#f59e0b';
  return '#94a3b8';
}

function ActionBadge({ action }: { action: string | null }) {
  const label = (action ?? "HOLD").toUpperCase();
  const cls =
    label === "START" ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" :
    label === "SIT"   ? "text-orange-400 border-orange-500/25 bg-orange-500/10" :
                        "text-white/55 border-white/15 bg-white/5";
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest border ${cls}`}>
      {label}
    </span>
  );
}

function SignalBadge({ signal }: { signal: string | null }) {
  const sig = signalFromField(signal);
  const color = getEdgeSignalColor(sig);
  const label = formatEdgeSignalLabel(sig);
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide shrink-0"
      style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}
    >
      {label}
    </span>
  );
}

function MetricPill({
  label, value, color = 'text-white/80', sub,
}: {
  label: string; value: string | number; color?: string; sub?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[60px]">
      <span className={`text-[18px] font-bold tabular-nums leading-tight ${color}`}>{value}</span>
      <span className="text-[9px] uppercase tracking-widest text-white/30">{label}</span>
      {sub && <span className="text-[9px] text-white/20 mt-0.5">{sub}</span>}
    </div>
  );
}

function FormChip({ avg3, seasonAvg }: { avg3: number | null; seasonAvg: number | null }) {
  const label = deriveFormLabel(avg3, seasonAvg);
  const styleClass = getFormStyles(label);
  const delta = avg3 != null && seasonAvg != null ? avg3 - seasonAvg : null;
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[60px]">
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${styleClass} uppercase tracking-wide`}>
        {label}
      </span>
      <span className="text-[9px] uppercase tracking-widest text-white/30">Form</span>
      {delta != null && (
        <span className={`text-[9px] ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {delta >= 0 ? '+' : ''}{Math.round(delta)} vs avg
        </span>
      )}
    </div>
  );
}

function SimilarPlayerRow({ player }: { player: SimilarPlayer }) {
  const slug = nameToSlug(player.player_name);
  const sig = signalFromField(player.signal_tag ?? player.signal);
  const color = getEdgeSignalColor(sig);
  return (
    <Link
      to={`/sports/afl/players/${slug}`}
      className="flex items-center justify-between rounded-xl bg-[#111] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all px-4 py-3 group"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {sig === 'STRONG_BUY' || sig === 'BUY'
          ? <TrendingUp size={13} className="text-emerald-400 shrink-0" />
          : sig === 'STRONG_SELL' || sig === 'SELL'
          ? <TrendingDown size={13} className="text-red-400 shrink-0" />
          : <Minus size={13} className="text-white/25 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate group-hover:text-white/90 transition-colors">
            {player.player_name}
          </p>
          <p className="text-[10px] text-white/35 mt-0.5">
            {player.team ?? '—'} · {fmtPriceHelper(player.price)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="text-right">
          <p className="text-sm font-bold text-white/80 tabular-nums">{fmtProj(player.projection)}</p>
          <p className="text-[9px] text-white/25 uppercase">proj</p>
        </div>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded"
          style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}
        >
          {formatEdgeSignalLabel(sig)}
        </span>
        <ChevronRight size={13} className="text-white/20 group-hover:text-white/40 transition-colors" />
      </div>
    </Link>
  );
}

function InternalLinks({ position, team }: { position: string | null; team: string | null }) {
  const posSlug = getPositionSlug(position);
  const teamEntries = Object.entries(TEAM_SLUG_TO_NAME).slice(0, 8);
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#111] p-4">
      <p className="text-[10px] text-white/35 uppercase tracking-wider mb-3">Explore More</p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Link
          to="/sports/afl/rankings"
          className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-[12px] text-white/60 hover:text-white/80 hover:bg-white/[0.06] transition-all"
        >
          <BarChart2 size={13} className="shrink-0" />
          All Rankings
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
          Start / Sit
        </Link>
      </div>
      {posSlug && (
        <div className="mb-3 pt-3 border-t border-white/[0.05]">
          <Link
            to={`/sports/afl/positions/${posSlug}`}
            className="flex items-center gap-2 text-[11px] text-white/40 hover:text-white/70 transition-colors"
          >
            <ChevronRight size={12} />
            View all {getPositionName(position)} rankings
          </Link>
        </div>
      )}
      <div className="pt-3 border-t border-white/[0.05]">
        <p className="text-[10px] text-white/25 mb-2">More AFL Teams</p>
        <div className="flex flex-wrap gap-1.5">
          {teamEntries.map(([slug, name]) => (
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

function PlayerSEOBlock({ player }: { player: PlayerData }) {
  const posName = getPositionName(player.player_position);
  const team = player.team ?? 'their AFL club';
  const proj = player.projection != null ? Math.round(player.projection) : null;
  const sig = signalFromField(player.signal_tag ?? player.signal);
  const sigLabel = formatEdgeSignalLabel(sig);

  return (
    <section className="border-t border-white/[0.05] pt-8 pb-2">
      <h2 className="text-base font-semibold text-white/60 mb-4">
        {player.player_name} AFL Fantasy 2026 Guide
      </h2>
      <div className="space-y-4 text-[13px] text-white/40 leading-relaxed">
        <div>
          <h3 className="text-[12px] font-semibold text-white/50 uppercase tracking-wider mb-1">
            {player.player_name} Overview
          </h3>
          <p>
            {player.player_name} is a {posName.replace(/s$/, '')} for the {team} in the 2026 AFL season.
            {proj != null && ` Their current projected score is ${proj} fantasy points.`}
            {` Current signal: ${sigLabel}.`}
          </p>
        </div>
        <div>
          <h3 className="text-[12px] font-semibold text-white/50 uppercase tracking-wider mb-1">
            Fantasy Analysis
          </h3>
          <p>
            Neeko's projection engine analyses {player.player_name}'s recent form, opponent concession rates,
            venue factors, and role stability to generate a weekly fantasy projection.
            {player.price != null && ` At ${fmtPriceHelper(player.price)}, `}
            {player.breakeven != null && `their breakeven score is ${Math.round(player.breakeven)} points.`}
            {!player.breakeven && ' Breakeven data will update with each price change.'}
          </p>
        </div>
      </div>
      <p className="sr-only">
        {player.player_name} AFL Fantasy 2026 — {posName}, {team}.
        Projection: {proj ?? 'TBC'} pts. Signal: {sigLabel}.
        Price: {fmtPriceHelper(player.price)}. Breakeven: {player.breakeven != null ? Math.round(player.breakeven) : 'TBC'}.
        Updated weekly by Neeko Sports fantasy analytics.
      </p>
    </section>
  );
}

export default function AFLPlayerPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPremium } = useAccessState();

  const playerName = useMemo(() => (slug ? slugToName(slug) : ''), [slug]);

  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [similar, setSimilar] = useState<SimilarPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);

  useEffect(() => {
    if (!playerName) { setError(true); setLoading(false); return; }

    (async () => {
      try {
        const raw = await getPlayerDetailSafe(playerName, user?.id ?? null);
        if (!raw) { setError(true); setLoading(false); return; }

        const mapped: PlayerData = {
          player_id: raw.player_id ?? 0,
          player_name: raw.player_name ?? playerName,
          team: raw.team ?? raw.team_name ?? null,
          player_position: raw.player_position ?? null,
          position_group: raw.position_group ?? null,
          price: raw.price != null ? Number(raw.price) : null,
          projection: raw.projection != null ? Number(raw.projection) : null,
          breakeven: raw.breakeven != null ? Number(raw.breakeven) : null,
          value_score: raw.value_score != null ? Number(raw.value_score) : null,
          signal: raw.signal ?? null,
          signal_tag: raw.signal_tag ?? null,
          signal_display: raw.signal_display ?? null,
          status: raw.status ?? null,
          manual_status: raw.manual_status ?? null,
          is_bye: raw.is_bye != null ? Boolean(raw.is_bye) : null,
          bye_next_round: raw.bye_next_round != null ? Boolean(raw.bye_next_round) : null,
          bye_round: raw.bye_round != null ? Number(raw.bye_round) : null,
          games_played: raw.games_played != null ? Number(raw.games_played) : null,
          avg_last_3: raw.avg_last_3 != null ? Number(raw.avg_last_3) : null,
          avg_last_5: raw.avg_last_5 != null ? Number(raw.avg_last_5) : null,
          season_avg: raw.season_avg != null ? Number(raw.season_avg) : null,
          why: raw.why ?? null,
          why_long: raw.why_long ?? null,
          neeko_rating: raw.neeko_rating != null ? Number(raw.neeko_rating) : null,
          edge: raw.edge != null ? Number(raw.edge) : null,
          action: raw.action != null ? (raw.action as string).toUpperCase() : null,
          is_locked: raw.is_locked != null ? Boolean(raw.is_locked) : null,
        };

        setPlayer(mapped);
        setLoading(false);

        if (mapped.player_id && mapped.player_position && mapped.projection != null) {
          const proj = mapped.projection;
          const similarData = await getSimilarPlayersSafe(
            mapped.player_id,
            mapped.player_position,
            Math.max(0, proj - 20),
            proj + 20,
            user?.id ?? null,
            5,
          );
          const mappedSimilar = ((similarData ?? []) as any[]).map((s: any): SimilarPlayer => ({
            player_id: s.player_id ?? 0,
            player_name: s.player_name ?? '',
            team: s.team ?? s.team_name ?? null,
            player_position: s.player_position ?? null,
            price: s.price != null ? Number(s.price) : null,
            projection: s.projection != null ? Number(s.projection) : null,
            value_score: s.value_score != null ? Number(s.value_score) : null,
            signal: s.signal ?? null,
            signal_tag: s.signal_tag ?? null,
            is_locked: s.is_locked != null ? Boolean(s.is_locked) : null,
          }));
          setSimilar(mappedSimilar);
        }
      } catch (err) {
        console.error('[AFLPlayerPage] fetch failed:', playerName, err);
        setError(true);
        setLoading(false);
      }
    })();
  }, [playerName, user?.id]);

  const posSlug = player ? getPositionSlug(player.player_position) : null;
  const posName = player ? getPositionName(player.player_position) : '';
  const sig = player ? signalFromField(player.signal_tag ?? player.signal) : 'HOLD';
  const sigColor = getEdgeSignalColor(sig);
  const sigLabel = formatEdgeSignalLabel(sig);

  const action = player?.action ?? 'HOLD';
  const actionColor = getActionColor(action);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e0e0e]">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          <div className="h-5 w-28 rounded bg-white/[0.05] animate-pulse" />
          <div className="h-40 rounded-2xl bg-white/[0.04] animate-pulse" />
          <div className="h-16 rounded-xl bg-white/[0.04] animate-pulse" />
          <div className="h-48 rounded-xl bg-white/[0.04] animate-pulse" />
          <div className="h-32 rounded-xl bg-white/[0.04] animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <AlertCircle size={40} className="text-white/20 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Player Not Found</h2>
          <p className="text-white/40 mb-6 text-sm">
            Could not load data for: {playerName || slug}
          </p>
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

  const pageTitle = `${player.player_name}${player.team ? ` (${player.team})` : ''} AFL Fantasy 2026 | ${posName} Rankings & Projection | Neeko`;
  const pageDescription = `${player.player_name} AFL Fantasy stats for 2026. Projected score: ${fmtProj(player.projection)} pts. Price: ${fmtPriceHelper(player.price)}. Signal: ${sigLabel}. Updated weekly by Neeko.`;
  const pageUrl = `https://neekostats.com.au/sports/afl/players/${slug}`;
  const teamSlug = Object.entries(TEAM_SLUG_TO_NAME).find(([, name]) => name === player.team)?.[0];

  const hasAI = !!(player.why || player.why_long);
  const isLocked = player.is_locked || (!isPremium && !hasAI);

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content={`${player.player_name}, AFL Fantasy, AFL Fantasy 2026, ${player.team ?? ''}, ${posName}, fantasy projections, buy sell hold, ${player.player_name} price, ${player.player_name} projection`} />
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
          '@type': 'Person',
          'name': player.player_name,
          'description': pageDescription,
          'url': pageUrl,
          'memberOf': player.team ? { '@type': 'SportsTeam', 'name': player.team } : undefined,
          'publisher': { '@type': 'Organization', 'name': 'Neeko Sports', 'url': 'https://neekostats.com.au' },
          'breadcrumb': {
            '@type': 'BreadcrumbList',
            'itemListElement': [
              { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://neekostats.com.au' },
              { '@type': 'ListItem', 'position': 2, 'name': 'AFL Fantasy Rankings', 'item': 'https://neekostats.com.au/sports/afl/rankings' },
              { '@type': 'ListItem', 'position': 3, 'name': player.player_name, 'item': pageUrl },
            ],
          },
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-[#0e0e0e]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

          {/* ── BACK ── */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors text-[12px]"
          >
            <ArrowLeft size={14} />
            Back
          </button>

          {/* ── HEADER ── */}
          <div
            className="rounded-2xl border border-white/[0.07] p-5 relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${sigColor}12 0%, #111 65%)` }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at top left, ${sigColor}14 0%, transparent 60%)` }}
            />
            <div className="relative space-y-4">
              {/* Name + Status */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-[10px] uppercase tracking-widest text-white/35">
                      {player.team ?? 'AFL'} · {posName.replace(/s$/, '')}
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
                  <h1 className="text-[26px] font-bold text-white leading-tight tracking-tight">
                    {player.player_name}
                  </h1>
                </div>
                {/* Action indicator */}
                {action && (
                  <div
                    className="flex flex-col items-center justify-center w-14 h-14 rounded-xl shrink-0 border"
                    style={{ background: `${actionColor}15`, borderColor: `${actionColor}30` }}
                  >
                    <span className="text-[9px] uppercase tracking-widest" style={{ color: `${actionColor}90` }}>Signal</span>
                    <span className="text-[13px] font-black uppercase tracking-wider" style={{ color: actionColor }}>{action}</span>
                  </div>
                )}
              </div>

              {/* Signal badge + Rating */}
              <div className="flex items-center gap-2 flex-wrap">
                <SignalBadge signal={player.signal_tag ?? player.signal} />
                {player.neeko_rating != null && (
                  <span className="text-[11px] font-bold text-[#F5C84C] tabular-nums">
                    {Number(player.neeko_rating).toFixed(1)} Rating
                  </span>
                )}
              </div>

              {/* Key metrics strip */}
              <div className="flex items-center gap-4 flex-wrap pt-1">
                <MetricPill
                  label="Proj"
                  value={fmtProj(player.projection)}
                  color="text-white"
                />
                <div className="w-px h-7 bg-white/[0.07]" />
                <MetricPill
                  label="Price"
                  value={fmtPriceHelper(player.price)}
                />
                <div className="w-px h-7 bg-white/[0.07]" />
                <MetricPill
                  label="Breakeven"
                  value={isPremium && player.breakeven != null ? Math.round(player.breakeven) : '—'}
                  color={
                    isPremium && player.breakeven != null && player.avg_last_3 != null
                      ? player.avg_last_3 >= player.breakeven ? 'text-emerald-400' : 'text-red-400'
                      : 'text-white/50'
                  }
                />
                <div className="w-px h-7 bg-white/[0.07]" />
                <MetricPill
                  label="Games"
                  value={player.games_played ?? '—'}
                  color="text-white/60"
                />
                <div className="w-px h-7 bg-white/[0.07]" />
                <FormChip avg3={player.avg_last_3} seasonAvg={player.season_avg} />
              </div>

              {/* Compare Player button */}
              <div className="pt-1">
                <button
                  onClick={() => navigate('/sports/afl/start-sit', { state: { playerA: player.player_name } })}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/[0.10] bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/[0.18] transition-all px-4 py-2 text-[12px] text-white/60 hover:text-white/90"
                >
                  <GitCompare size={13} className="shrink-0" />
                  Compare Player
                </button>
              </div>
            </div>
          </div>

          {/* ── VALUE SCORE (premium only) ── */}
          {isPremium && player.value_score != null && (
            <div className="rounded-xl border border-white/[0.07] bg-[#111] px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Value Score</p>
                <p className={`text-xl font-bold tabular-nums ${getValueScoreColor(player.value_score)}`}>
                  {fmtValueScore(player.value_score)}
                </p>
              </div>
              {player.edge != null && (
                <>
                  <div className="w-px h-8 bg-white/[0.07] shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Edge vs BE</p>
                    <p className={`text-xl font-bold tabular-nums ${player.edge > 0 ? 'text-emerald-400' : player.edge < 0 ? 'text-red-400' : 'text-white/50'}`}>
                      {player.edge > 0 ? '+' : ''}{Math.round(player.edge)}
                    </p>
                  </div>
                </>
              )}
              <div className="ml-auto text-right">
                <p className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Season Avg</p>
                <p className="text-xl font-bold tabular-nums text-white/70">
                  {player.season_avg != null ? Math.round(player.season_avg) : '—'}
                </p>
              </div>
            </div>
          )}

          {/* ── SCORE HISTORY CHART ── */}
          <div className="rounded-xl border border-white/[0.07] bg-[#111] overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <p className="text-[10px] uppercase tracking-wider text-white/30">Last 10 Games</p>
            </div>
            <Suspense fallback={
              <div className="h-48 flex items-center justify-center">
                <div className="h-32 w-full mx-4 rounded bg-white/[0.03] animate-pulse" />
              </div>
            }>
              <ScoreHistoryChart
                playerName={player.player_name}
                playerId={String(player.player_id)}
              />
            </Suspense>
          </div>

          {/* ── AI EXPLANATION ── */}
          {hasAI && (
            <div className="rounded-xl border border-white/[0.07] bg-[#111] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-white/30">AI Analysis</p>
                {player.why_long && (
                  <button
                    onClick={() => setShowFullAnalysis(v => !v)}
                    className="flex items-center gap-1 text-[10px] text-white/35 hover:text-white/60 transition-colors"
                  >
                    {showFullAnalysis ? (
                      <><ChevronUp size={11} /> Less</>
                    ) : (
                      <><ChevronDown size={11} /> Full analysis</>
                    )}
                  </button>
                )}
              </div>
              {player.why && (
                <p className="text-[14px] font-medium text-white/85 leading-relaxed">
                  {player.why}
                </p>
              )}
              {showFullAnalysis && player.why_long && (
                <div className="border-t border-white/[0.06] pt-3">
                  <p className="text-[13px] text-white/55 leading-relaxed whitespace-pre-line">
                    {player.why_long}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── PREMIUM CTA (free + no AI) ── */}
          {!isPremium && (
            <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] to-[#111] p-6 text-center">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 mx-auto mb-3">
                <Lock size={18} className="text-amber-400" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">
                Unlock full {player.player_name} analysis
              </h3>
              <p className="text-[12px] text-white/45 mb-4">
                AI recommendations, value scores, breakeven analysis, price projections and more
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
          )}

          {/* ── SIMILAR PLAYERS ── */}
          {similar.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-semibold text-white/80">
                  Similar {posName}
                </h2>
                {posSlug && (
                  <Link
                    to={`/sports/afl/positions/${posSlug}`}
                    className="flex items-center gap-1 text-[11px] text-white/35 hover:text-white/60 transition-colors"
                  >
                    View all
                    <ChevronRight size={11} />
                  </Link>
                )}
              </div>
              <div className="space-y-2">
                {similar.map(s => (
                  <SimilarPlayerRow key={s.player_id} player={s} />
                ))}
              </div>
            </div>
          )}

          {/* ── QUICK LINKS ── */}
          <div className="grid grid-cols-2 gap-3">
            {teamSlug && (
              <Link
                to={`/sports/afl/teams/${teamSlug}`}
                className="rounded-xl border border-white/[0.07] bg-[#111] p-4 hover:bg-white/[0.04] hover:border-white/[0.12] transition-all group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Users size={13} className="text-white/30 shrink-0" />
                  <p className="text-[10px] uppercase tracking-wider text-white/30">Team</p>
                </div>
                <p className="text-sm font-semibold text-white group-hover:text-white/90 transition-colors truncate">
                  {player.team}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <p className="text-[10px] text-white/30">View roster</p>
                  <ChevronRight size={10} className="text-white/20 group-hover:text-white/40 transition-colors" />
                </div>
              </Link>
            )}
            {posSlug && (
              <Link
                to={`/sports/afl/positions/${posSlug}`}
                className="rounded-xl border border-white/[0.07] bg-[#111] p-4 hover:bg-white/[0.04] hover:border-white/[0.12] transition-all group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <BarChart2 size={13} className="text-white/30 shrink-0" />
                  <p className="text-[10px] uppercase tracking-wider text-white/30">Position</p>
                </div>
                <p className="text-sm font-semibold text-white group-hover:text-white/90 transition-colors truncate">
                  {posName}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <p className="text-[10px] text-white/30">View rankings</p>
                  <ChevronRight size={10} className="text-white/20 group-hover:text-white/40 transition-colors" />
                </div>
              </Link>
            )}
          </div>

          {/* ── INTERNAL LINKS ── */}
          <InternalLinks position={player.player_position} team={player.team} />

          {/* ── SEO BLOCK ── */}
          <PlayerSEOBlock player={player} />

        </div>
      </div>
    </>
  );
}
