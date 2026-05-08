import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft, ChevronRight, TrendingUp, TrendingDown, Minus,
  Zap, Lock, Users, ChartBar as BarChart2,
  CircleAlert as AlertCircle, ChevronDown, ChevronUp,
  Activity, Target, DollarSign, Brain,
} from 'lucide-react';
import {
  slugToPlayerName, playerToSlug,
  POSITION_SLUGS, POSITION_NAMES, TEAM_SLUG_TO_NAME,
} from '@/lib/slugs';
import { getPlayerDetailSafe, getSimilarPlayersSafe } from '@/lib/playerAccess';
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

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionLabel({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-white/25">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.38em] text-white/30">{title}</span>
    </div>
  );
}

/** A single cell in a stat strip */
function StatCell({
  label, value, last = false,
}: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex-1 flex flex-col items-center justify-center py-3 px-2 gap-0.5 ${!last ? 'border-r border-white/[0.06]' : ''}`}>
      <span className="text-[15px] font-bold tabular-nums leading-tight">{value}</span>
      <span className="text-[9px] uppercase tracking-widest text-white/25 text-center leading-tight">{label}</span>
    </div>
  );
}

/** A locked premium metric card shown in the hero for free users */
function LockedMetricCard({
  label, icon, accentColor,
}: { label: string; icon?: React.ReactNode; accentColor?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-amber-500/[0.18] bg-amber-500/[0.04] py-3 px-3 text-center min-h-[68px]">
      <div className="flex items-center gap-1">
        <Lock size={10} className="text-amber-400/45" />
        {icon && <span className="text-amber-400/30">{icon}</span>}
      </div>
      <span className="text-[9px] uppercase tracking-widest text-amber-400/45 leading-tight font-semibold">{label}</span>
    </div>
  );
}

/** The locked premium-field badge shown inline (blurred chip style). */
function LockedChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-500/20 bg-amber-500/[0.06] text-[9px] font-bold uppercase tracking-wider text-amber-400/50 select-none">
      <Lock size={8} className="text-amber-400/40" />
      {label}
    </span>
  );
}

function DecisionRow({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center gap-2.5">
        <span className="text-white/22 shrink-0">{icon}</span>
        <span className="text-[12px] text-white/45">{label}</span>
      </div>
      <div className="text-right">
        <span className="text-[13px] font-semibold tabular-nums">{value}</span>
        {sub && <p className="text-[9px] text-white/25 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/** Upgrade prompt used for Decision Centre and AI Analysis when free. */
function PremiumCallout({ title, desc, playerName }: { title: string; desc: string; playerName?: string }) {
  return (
    <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.05] to-[#0d0d0d] p-5">
      <div className="flex items-start gap-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 shrink-0 mt-0.5">
          <Lock size={16} className="text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-white mb-1">{title}</p>
          <p className="text-[12px] text-white/38 leading-relaxed mb-4">
            {desc}{playerName ? ` for ${playerName}` : ''}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/upgrade"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-4 py-2 text-[12px] font-bold text-black"
            >
              <Zap size={12} />
              Unlock Neeko+
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] transition-colors px-4 py-2 text-[12px] text-white/50 hover:text-white"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Similar player row — free version hides projection / action on locked players. */
function SimilarPlayerRow({ player, isPremium }: { player: SimilarPlayer; isPremium: boolean }) {
  const slug = playerToSlug(player.player_name, player.team ?? undefined);
  const isLocked = !isPremium && player.is_locked;
  const meta = getActionMeta(player.action_canonical);
  const badgeCls =
    meta.isStart ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
    meta.isSit   ? 'bg-orange-500/10 text-orange-400 border-orange-500/25'   :
                   'bg-white/[0.04] text-white/30 border-white/[0.07]';

  return (
    <Link
      to={`/sports/afl/players/${slug}`}
      className="flex items-center justify-between rounded-xl bg-[#0d0d0d] border border-white/[0.06] hover:bg-white/[0.03] hover:border-white/[0.11] transition-all px-4 py-3 group"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {!isLocked && (
          meta.isStart
            ? <TrendingUp size={12} className="text-emerald-400 shrink-0" />
            : meta.isSit
            ? <TrendingDown size={12} className="text-orange-400 shrink-0" />
            : <Minus size={12} className="text-white/20 shrink-0" />
        )}
        {isLocked && <Minus size={12} className="text-white/15 shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white/80 truncate group-hover:text-white transition-colors">
            {player.player_name}
          </p>
          <p className="text-[10px] text-white/30 mt-0.5">
            {player.team ?? '—'} · {fmtPriceHelper(player.price)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        {!isLocked ? (
          <>
            <div className="text-right">
              <p className="text-[13px] font-bold text-white/70 tabular-nums">
                {player.projection != null ? Math.round(player.projection) : '—'}
              </p>
              <p className="text-[9px] text-white/25 uppercase tracking-wide">proj</p>
            </div>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${badgeCls}`}>
              {meta.label}
            </span>
          </>
        ) : (
          <LockedChip label="Premium" />
        )}
        <ChevronRight size={12} className="text-white/15 group-hover:text-white/35 transition-colors" />
      </div>
    </Link>
  );
}

function QuickNavCard({ to, icon, title, subtitle }: {
  to: string; icon: React.ReactNode; title: string; subtitle: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] p-4 hover:bg-white/[0.03] hover:border-white/[0.12] transition-all group"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-white/25 group-hover:text-white/38 transition-colors">{icon}</span>
        <p className="text-[9px] uppercase tracking-widest text-white/28">{title}</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-white/65 group-hover:text-white/85 transition-colors truncate">
          {subtitle}
        </p>
        <ChevronRight size={12} className="text-white/15 group-hover:text-white/40 transition-colors shrink-0" />
      </div>
    </Link>
  );
}

/** SEO block — safe version that never leaks premium predictive fields. */
function PlayerSEOBlock({ player, isPremium }: { player: PlayerData; isPremium: boolean }) {
  const posName  = getPositionName(player.player_position);
  const team     = player.team ?? 'their AFL club';
  const lastName = player.player_name.split(' ').slice(-1)[0];

  return (
    <section className="border-t border-white/[0.05] pt-7 pb-4 space-y-4">
      <h2 className="text-[13px] font-semibold text-white/38">
        {player.player_name} — AFL Fantasy 2026 Guide
      </h2>
      <div className="space-y-4 text-[12.5px] text-white/32 leading-relaxed">
        <div>
          <h3 className="text-[10px] font-bold text-white/38 uppercase tracking-wider mb-1.5">Overview</h3>
          <p>
            {player.player_name} is a {posName.replace(/s$/, '')} for {team} in the 2026 AFL Fantasy season.
            {player.games_played != null && ` ${player.games_played} games played this season.`}
            {player.season_avg != null && ` Season average: ${Math.round(player.season_avg)} points.`}
          </p>
        </div>
        <div>
          <h3 className="text-[10px] font-bold text-white/38 uppercase tracking-wider mb-1.5">Historical Form</h3>
          <p>
            {player.avg_last_3 != null && `3-game average: ${Math.round(player.avg_last_3)} pts. `}
            {player.avg_last_5 != null && `5-game average: ${Math.round(player.avg_last_5)} pts. `}
            {player.avg_last_3 != null && player.season_avg != null && (
              player.avg_last_3 > player.season_avg
                ? `${lastName} is scoring above their season average over the last 3 rounds.`
                : player.avg_last_3 < player.season_avg
                ? `${lastName} has been scoring below their season average over the last 3 rounds.`
                : `${lastName}'s recent form is in line with their season average.`
            )}
          </p>
        </div>
        {isPremium && player.breakeven != null && (
          <div>
            <h3 className="text-[10px] font-bold text-white/38 uppercase tracking-wider mb-1.5">Price Outlook</h3>
            <p>
              {player.price != null && `At ${fmtPriceHelper(player.price)}, `}
              the breakeven score is {Math.round(player.breakeven)} — meaning {lastName} needs to score above
              this to increase in price. Neeko's projection engine models expected fantasy output using recent form,
              opponent position concession rates, and venue factors.
            </p>
          </div>
        )}
      </div>
      <p className="sr-only">
        {player.player_name} AFL Fantasy 2026 — {posName}, {team}.
        Price: {fmtPriceHelper(player.price)}.
        Season avg: {player.season_avg != null ? Math.round(player.season_avg) : 'TBC'}.
        3-game avg: {player.avg_last_3 != null ? Math.round(player.avg_last_3) : 'TBC'}.
        5-game avg: {player.avg_last_5 != null ? Math.round(player.avg_last_5) : 'TBC'}.
        {player.games_played != null ? ` ${player.games_played} games played.` : ''}
        Updated weekly by Neeko Sports fantasy analytics engine.
      </p>
    </section>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[#080808]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="h-4 w-16 rounded bg-white/[0.05] animate-pulse" />
        <div className="h-52 rounded-2xl bg-white/[0.04] animate-pulse" />
        <div className="h-52 rounded-xl bg-white/[0.04] animate-pulse" />
        <div className="h-40 rounded-xl bg-white/[0.04] animate-pulse" />
        <div className="space-y-1.5">
          {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />)}
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

  const [player,     setPlayer]     = useState<PlayerData | null>(null);
  const [similar,    setSimilar]    = useState<SimilarPlayer[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);
  const [showFullAI, setShowFullAI] = useState(false);

  useEffect(() => {
    if (!playerName) { setError(true); setLoading(false); return; }

    (async () => {
      try {
        const raw = await getPlayerDetailSafe(playerName, user?.id ?? null);
        if (!raw) { setError(true); setLoading(false); return; }

        const mapped: PlayerData = {
          player_id:        raw.player_id ?? 0,
          player_name:      raw.player_name ?? playerName,
          team:             raw.team ?? raw.team_name ?? null,
          player_position:  raw.player_position ?? null,
          price:            raw.price         != null ? Number(raw.price)        : null,
          projection:       raw.projection    != null ? Number(raw.projection)   : null,
          breakeven:        raw.breakeven     != null ? Number(raw.breakeven)    : null,
          edge_canonical:   raw.edge_canonical != null ? Number(raw.edge_canonical) : (raw.edge != null ? Number(raw.edge) : null),
          action_canonical: raw.action_canonical != null
            ? (raw.action_canonical as string).toUpperCase()
            : (raw.action != null ? (raw.action as string).toUpperCase() : null),
          action_display:   raw.action_display   ?? null,
          confidence_label: raw.confidence_label ?? null,
          value_band:       raw.value_band       ?? null,
          decision_score:   raw.decision_score   != null ? Number(raw.decision_score) : null,
          action_reason_1:  raw.action_reason_1  ?? null,
          action_reason_2:  raw.action_reason_2  ?? null,
          status:           raw.status        ?? null,
          manual_status:    raw.manual_status ?? null,
          is_bye:           raw.is_bye        != null ? Boolean(raw.is_bye)        : null,
          bye_next_round:   raw.bye_next_round != null ? Boolean(raw.bye_next_round) : null,
          bye_round:        raw.bye_round     != null ? Number(raw.bye_round)     : null,
          games_played:     raw.games_played  != null ? Number(raw.games_played)  : null,
          avg_last_3:       raw.avg_last_3    != null ? Number(raw.avg_last_3)    : null,
          avg_last_5:       raw.avg_last_5    != null ? Number(raw.avg_last_5)    : null,
          season_avg:       raw.season_avg    != null ? Number(raw.season_avg)    : null,
          why:              raw.why      ?? null,
          why_long:         raw.why_long ?? null,
          neeko_rating:     raw.neeko_rating != null ? Number(raw.neeko_rating) : null,
          is_locked:        raw.is_locked    != null ? Boolean(raw.is_locked)   : null,
        };

        setPlayer(mapped);
        setLoading(false);

        // Fetch similar players — use season_avg as fallback range if no projection
        const rangeCenter = mapped.projection ?? mapped.season_avg ?? 80;
        if (mapped.player_id && mapped.player_position) {
          const sim = await getSimilarPlayersSafe(
            mapped.player_id,
            mapped.player_position,
            Math.max(0, rangeCenter - 20),
            rangeCenter + 20,
            user?.id ?? null,
            5,
          );
          setSimilar(((sim ?? []) as any[]).map((s: any): SimilarPlayer => ({
            player_id:        s.player_id ?? 0,
            player_name:      s.player_name ?? '',
            team:             s.team ?? s.team_name ?? null,
            player_position:  s.player_position ?? null,
            price:            s.price       != null ? Number(s.price)       : null,
            projection:       s.projection  != null ? Number(s.projection)  : null,
            edge_canonical:   s.edge_canonical != null ? Number(s.edge_canonical) : (s.edge != null ? Number(s.edge) : null),
            action_canonical: s.action_canonical != null
              ? (s.action_canonical as string).toUpperCase()
              : (s.action != null ? (s.action as string).toUpperCase() : null),
            is_locked:        s.is_locked != null ? Boolean(s.is_locked) : null,
          })));
        }
      } catch (err) {
        console.error('[AFLPlayerPage]', playerName, err);
        setError(true);
        setLoading(false);
      }
    })();
  }, [playerName, user?.id]);

  // ── Derived values ────────────────────────────────────────────────────────
  const posSlug  = player ? getPositionSlug(player.player_position) : null;
  const posName  = player ? getPositionName(player.player_position) : '';
  const teamSlug = Object.entries(TEAM_SLUG_TO_NAME).find(([, n]) => n === player?.team)?.[0];

  const accentRaw = getTeamAccentColour(player?.team?.split(' ')[0] ?? null) ?? '#4ade80';
  const accent    = accentRaw === '#FFD200' ? '#C9A800' : accentRaw === '#1A1A1A' ? '#6b7280' : accentRaw;

  const actionMeta = getActionMeta(player?.action_canonical ?? null);
  const formLabel  = deriveFormLabel(player?.avg_last_3 ?? null, player?.season_avg ?? null);
  const hasAI      = !!(player?.why || player?.why_long);

  const bevsProj = useMemo(() => {
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

  // ── SEO metadata ─────────────────────────────────────────────────────────
  const pageTitle = `${player.player_name}${player.team ? ` (${player.team})` : ''} AFL Fantasy 2026 | ${posName} Stats & History | Neeko`;
  const pageDescription = `${player.player_name} AFL Fantasy 2026. Season avg: ${player.season_avg != null ? Math.round(player.season_avg) : 'TBC'} pts. Price: ${fmtPriceHelper(player.price)}. ${player.games_played ?? 0} games played. Updated weekly.`;
  const pageUrl = `https://neekostats.com.au/sports/afl/players/${slug}`;

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content={`${player.player_name}, AFL Fantasy, AFL Fantasy 2026, ${player.team ?? ''}, ${posName}, ${player.player_name} stats, ${player.player_name} price, fantasy history 2026`} />
        <meta property="og:title"        content={pageTitle} />
        <meta property="og:description"  content={pageDescription} />
        <meta property="og:type"         content="website" />
        <meta property="og:url"          content={pageUrl} />
        <meta property="og:site_name"    content="Neeko Sports" />
        <link rel="canonical"            href={pageUrl} />
        <meta name="robots"              content="index, follow" />
        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:title"       content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
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
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">

          {/* Back */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-white/30 hover:text-white/60 transition-colors text-[12px]"
          >
            <ArrowLeft size={13} />
            Back
          </button>

          {/* ══════════════════════════════════════════
              1. HERO — Player Identity
          ══════════════════════════════════════════ */}
          <div
            className="rounded-2xl border border-white/[0.07] relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${accent}0d 0%, #0c0c0c 60%)` }}
          >
            {/* Top accent bar */}
            <div
              className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
              style={{ background: `linear-gradient(90deg, ${accent}80, transparent 70%)` }}
            />
            {/* Ambient glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at top left, ${accent}0d 0%, transparent 55%)` }}
            />

            <div className="relative p-5 space-y-4">

              {/* ── Identity row ── */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Team · Position · Status */}
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
                        status: player.status ?? null,
                        manual_status: player.manual_status ?? null,
                        is_bye: player.is_bye ?? null,
                        bye_next_round: player.bye_next_round ?? null,
                        bye_round: player.bye_round ?? null,
                      }}
                      showUpcomingBye
                    />
                  </div>

                  {/* Name */}
                  <h1 className="text-[26px] sm:text-[30px] font-black text-white leading-none tracking-tight">
                    {player.player_name}
                  </h1>

                  {/* Form delta — always visible, no predictive label */}
                  {player.avg_last_3 != null && player.season_avg != null && (() => {
                    const delta = Math.round(player.avg_last_3 - player.season_avg);
                    const isUp  = delta >= 0;
                    return (
                      <div className="flex items-center gap-1.5 mt-2">
                        {isPremium && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${getFormStyles(formLabel)}`}>
                            {formLabel}
                          </span>
                        )}
                        <span className={`text-[11px] font-semibold tabular-nums ${isUp ? 'text-emerald-400/80' : 'text-red-400/75'}`}>
                          {isUp ? '+' : ''}{delta} vs season avg
                        </span>
                        <span className="text-[10px] text-white/25">last 3</span>
                      </div>
                    );
                  })()}
                </div>

                {/* Action signal badge — premium shows signal, free shows locked */}
                <div
                  className="flex flex-col items-center justify-center w-[60px] h-[60px] rounded-xl shrink-0 border text-center"
                  style={isPremium
                    ? { background: `${actionMeta.color}0d`, borderColor: `${actionMeta.color}40` }
                    : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }
                  }
                >
                  {isPremium ? (
                    <>
                      <span className="text-[7px] uppercase tracking-[0.15em] mb-0.5" style={{ color: `${actionMeta.color}80` }}>Signal</span>
                      <span className="text-[12px] font-black uppercase leading-none" style={{ color: actionMeta.color }}>
                        {actionMeta.label}
                      </span>
                    </>
                  ) : (
                    <>
                      <Lock size={14} className="text-white/15 mb-0.5" />
                      <span className="text-[7px] uppercase tracking-widest text-white/20">Signal</span>
                    </>
                  )}
                </div>
              </div>

              {/* ── Primary stat strip — FREE: Price | Games | Season Avg | Last 3 | Last 5 ── */}
              <div className="flex items-stretch rounded-xl border border-white/[0.07] overflow-hidden bg-black/20">
                <StatCell label="Price"      value={<span className="text-white/80">{fmtPriceHelper(player.price)}</span>} />
                <StatCell label="Games"      value={<span className="text-white/65">{player.games_played ?? '—'}</span>} />
                <StatCell label="Season Avg" value={<span className="text-white/80">{fmtAvg(player.season_avg)}</span>} />
                <StatCell label="Last 3"     value={<span className="text-white/65">{fmtAvg(player.avg_last_3)}</span>} />
                <StatCell label="Last 5"     value={<span className="text-white/55">{fmtAvg(player.avg_last_5)}</span>} last />
              </div>

              {/* ── Premium metrics grid — PREMIUM: Projection + Breakeven + Confidence + Value
                  FREE: same layout but each card shows a locked amber chip instead ── */}
              {isPremium ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {/* Projection */}
                  <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5 flex flex-col gap-1">
                    <span className="text-[9px] uppercase tracking-widest text-white/28 font-semibold">Projection</span>
                    <span className="text-[18px] font-black text-white tabular-nums leading-none">
                      {player.projection != null ? Math.round(player.projection) : '—'}
                    </span>
                    {player.neeko_rating != null && (
                      <span className="text-[9px] font-medium" style={{ color: `${accent}aa` }}>
                        Rating {Number(player.neeko_rating).toFixed(1)}
                      </span>
                    )}
                  </div>

                  {/* Breakeven */}
                  <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5 flex flex-col gap-1">
                    <span className="text-[9px] uppercase tracking-widest text-white/28 font-semibold">Breakeven</span>
                    <span className={`text-[18px] font-black tabular-nums leading-none ${
                      player.breakeven != null && player.avg_last_3 != null
                        ? player.avg_last_3 >= player.breakeven ? 'text-emerald-400' : 'text-red-400'
                        : 'text-white/60'
                    }`}>
                      {player.breakeven != null ? Math.round(player.breakeven) : '—'}
                    </span>
                    <span className="text-[9px] text-white/22">to hold price</span>
                  </div>

                  {/* Confidence */}
                  <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5 flex flex-col gap-1">
                    <span className="text-[9px] uppercase tracking-widest text-white/28 font-semibold">Confidence</span>
                    <span className={`text-[13px] font-black uppercase leading-none mt-0.5 ${
                      player.confidence_label?.toUpperCase() === 'HIGH'
                        ? 'text-emerald-400'
                        : player.confidence_label?.toUpperCase() === 'MEDIUM'
                        ? 'text-yellow-400'
                        : 'text-white/45'
                    }`}>
                      {player.confidence_label ?? '—'}
                    </span>
                    {player.edge_canonical != null && (
                      <span className={`text-[9px] font-semibold ${getEdgeColor(player.edge_canonical)}`}>
                        Edge {fmtEdge(player.edge_canonical)}
                      </span>
                    )}
                  </div>

                  {/* Value */}
                  <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5 flex flex-col gap-1">
                    <span className="text-[9px] uppercase tracking-widest text-white/28 font-semibold">Value</span>
                    <span className="text-[13px] font-black text-emerald-300 uppercase leading-none mt-0.5">
                      {player.value_band ?? '—'}
                    </span>
                    {bevsProj != null && (
                      <span className={`text-[9px] font-semibold ${bevsProj >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
                        Proj vs BE {bevsProj >= 0 ? '+' : ''}{bevsProj}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                /* FREE: locked premium metric cards + upgrade CTA */
                <div className="space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <LockedMetricCard label="Projection" />
                    <LockedMetricCard label="Breakeven" />
                    <LockedMetricCard label="Confidence" />
                    <LockedMetricCard label="Value" />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Zap size={13} className="text-amber-400/70 shrink-0" />
                      <span className="text-[12px] font-semibold text-white/65">
                        Unlock projections, breakevens and AI analysis
                      </span>
                    </div>
                    <Link
                      to="/upgrade"
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-3.5 py-1.5 text-[11px] font-bold text-black whitespace-nowrap"
                    >
                      Neeko+
                    </Link>
                  </div>
                </div>
              )}

              {/* Compare player CTA — premium only */}
              {isPremium && (
                <div className="pt-0.5">
                  <Link
                    to="/fantasy/rankings"
                    className="inline-flex items-center gap-1.5 text-[11px] text-white/28 hover:text-white/55 transition-colors"
                  >
                    <Users size={11} />
                    Compare in Rankings
                    <ChevronRight size={11} />
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════
              2. RECENT FANTASY SCORES
              FREE:    actual scores only, no projection overlay, no confidence panel
              PREMIUM: full chart with projection line + confidence reliability
          ══════════════════════════════════════════ */}
          <div>
            <SectionLabel icon={<Activity size={13} />} title="Recent Fantasy Scores" />
            <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] overflow-hidden">
              <Suspense fallback={
                <div className="h-48 flex items-center justify-center">
                  <div className="h-32 w-full mx-4 rounded bg-white/[0.03] animate-pulse" />
                </div>
              }>
                <ScoreHistoryChart
                  playerName={player.player_name}
                  playerId={String(player.player_id)}
                  hideProjection={!isPremium}
                />
              </Suspense>
            </div>
            {/* Free: contextual note below chart */}
            {!isPremium && (
              <p className="text-[10px] text-white/25 mt-2 px-1 flex items-center gap-1.5">
                <Lock size={9} className="text-amber-400/40 shrink-0" />
                Projection line and confidence analysis available on Neeko+.{' '}
                <Link to="/upgrade" className="text-amber-400/60 hover:text-amber-400 transition-colors underline underline-offset-2">
                  Upgrade
                </Link>
              </p>
            )}
          </div>

          {/* ══════════════════════════════════════════
              3. DECISION CENTRE — PREMIUM ONLY
              Free: upgrade callout showing what's inside
          ══════════════════════════════════════════ */}
          <div>
            <SectionLabel icon={<Target size={13} />} title="Decision Centre" />

            {isPremium ? (
              <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] overflow-hidden">
                {/* Action signal header */}
                <div
                  className="px-4 py-3.5 border-b border-white/[0.05] flex items-center justify-between gap-3"
                  style={{ background: `${actionMeta.color}07` }}
                >
                  <div className="flex items-center gap-3">
                    {actionMeta.isStart
                      ? <TrendingUp size={16} style={{ color: actionMeta.color }} />
                      : actionMeta.isSit
                      ? <TrendingDown size={16} style={{ color: actionMeta.color }} />
                      : <Minus size={16} className="text-white/25" />
                    }
                    <div>
                      <p className="text-[9px] uppercase tracking-widest text-white/28 mb-0.5">Neeko Action</p>
                      <p className="text-[15px] font-black uppercase tracking-wider leading-none" style={{ color: actionMeta.color }}>
                        {player.action_display ?? actionMeta.label}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {player.confidence_label && (
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                        player.confidence_label.toUpperCase() === 'HIGH'
                          ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                          : player.confidence_label.toUpperCase() === 'MEDIUM'
                          ? 'text-yellow-400 border-yellow-500/25 bg-yellow-500/[0.07]'
                          : 'text-white/30 border-white/10 bg-white/[0.03]'
                      }`}>
                        {player.confidence_label} conf
                      </span>
                    )}
                    {player.value_band && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider text-emerald-300 border-emerald-500/25 bg-emerald-500/[0.07]">
                        {player.value_band}
                      </span>
                    )}
                  </div>
                </div>

                {/* Metric rows */}
                <div className="px-4">
                  <DecisionRow
                    icon={<Target size={13} />}
                    label="Breakeven"
                    value={
                      <span className={
                        player.breakeven != null && player.avg_last_3 != null
                          ? player.avg_last_3 >= player.breakeven ? 'text-emerald-400' : 'text-red-400'
                          : 'text-white/60'
                      }>
                        {player.breakeven != null ? Math.round(player.breakeven) : '—'}
                      </span>
                    }
                    sub={player.breakeven != null ? 'score needed to hold price' : undefined}
                  />
                  <DecisionRow
                    icon={<Zap size={13} />}
                    label="Proj vs Breakeven"
                    value={
                      bevsProj != null
                        ? <span className={bevsProj >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {bevsProj >= 0 ? '+' : ''}{bevsProj} pts
                          </span>
                        : <span className="text-white/35">—</span>
                    }
                    sub={bevsProj != null ? (bevsProj >= 0 ? 'on track to rise in price' : 'at risk of price drop') : undefined}
                  />
                  {player.edge_canonical != null && (
                    <DecisionRow
                      icon={<Activity size={13} />}
                      label="Edge Score"
                      value={
                        <span className={getEdgeColor(player.edge_canonical)}>
                          {fmtEdge(player.edge_canonical)}
                        </span>
                      }
                      sub="projection vs market expectation"
                    />
                  )}
                  <DecisionRow
                    icon={<TrendingUp size={13} />}
                    label="3-Game Average"
                    value={
                      <span className={
                        player.avg_last_3 != null && player.season_avg != null
                          ? player.avg_last_3 >= player.season_avg ? 'text-emerald-400' : 'text-orange-400'
                          : 'text-white/60'
                      }>
                        {fmtAvg(player.avg_last_3)}
                      </span>
                    }
                    sub={player.season_avg != null ? `season avg ${Math.round(player.season_avg)}` : undefined}
                  />
                  <DecisionRow
                    icon={<DollarSign size={13} />}
                    label="Price"
                    value={<span className="text-white/65">{fmtPriceHelper(player.price)}</span>}
                  />
                </div>
              </div>
            ) : (
              /* Free: teaser card listing what's locked */
              <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] overflow-hidden">
                {/* Blurred preview rows */}
                <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between opacity-40 pointer-events-none select-none" style={{ filter: 'blur(3px)' }}>
                  <span className="text-[12px] text-white/45">Neeko Action Signal</span>
                  <span className="text-[13px] font-bold text-emerald-400">START</span>
                </div>
                <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between opacity-40 pointer-events-none select-none" style={{ filter: 'blur(3px)' }}>
                  <span className="text-[12px] text-white/45">Breakeven</span>
                  <span className="text-[13px] font-bold text-white/70">74</span>
                </div>
                <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between opacity-40 pointer-events-none select-none" style={{ filter: 'blur(3px)' }}>
                  <span className="text-[12px] text-white/45">Projection vs Breakeven</span>
                  <span className="text-[13px] font-bold text-emerald-400">+11 pts</span>
                </div>
                <div className="px-4 py-3 flex items-center justify-between opacity-40 pointer-events-none select-none" style={{ filter: 'blur(3px)' }}>
                  <span className="text-[12px] text-white/45">Edge Score</span>
                  <span className="text-[13px] font-bold text-emerald-400">+8.2</span>
                </div>
                {/* CTA overlay */}
                <div className="border-t border-amber-500/15 bg-gradient-to-b from-amber-500/[0.04] to-[#0d0d0d] px-4 py-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0">
                      <Lock size={13} className="text-amber-400" />
                    </div>
                    <div>
                      <p className="text-[12px] font-bold text-white leading-tight">Decision Centre</p>
                      <p className="text-[10px] text-white/38 mt-0.5">Action · Breakeven · Edge · Projection</p>
                    </div>
                  </div>
                  <Link
                    to="/upgrade"
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 transition-colors px-3.5 py-2 text-[11px] font-bold text-black"
                  >
                    <Zap size={11} />
                    Unlock
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════
              4. AI ANALYSIS — PREMIUM ONLY
          ══════════════════════════════════════════ */}
          {isPremium ? (
            hasAI && (
              <div>
                <SectionLabel icon={<Brain size={13} />} title="AI Analysis" />
                <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] p-4 space-y-3">
                  {player.why && (
                    <p className="text-[14px] font-medium text-white/82 leading-relaxed">{player.why}</p>
                  )}
                  {(player.action_reason_1 || player.action_reason_2) && (
                    <div className="space-y-2 pt-0.5">
                      {player.action_reason_1 && (
                        <div className="flex items-start gap-2.5">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-[5px]" style={{ background: `${actionMeta.color}80` }} />
                          <span className="text-[12.5px] text-white/50 leading-snug">{player.action_reason_1}</span>
                        </div>
                      )}
                      {player.action_reason_2 && (
                        <div className="flex items-start gap-2.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-white/18 shrink-0 mt-[5px]" />
                          <span className="text-[12.5px] text-white/38 leading-snug">{player.action_reason_2}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {player.why_long && (
                    <>
                      <button
                        onClick={() => setShowFullAI(v => !v)}
                        className="flex items-center gap-1.5 text-[11px] text-white/28 hover:text-white/55 transition-colors pt-0.5"
                      >
                        {showFullAI ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        {showFullAI ? 'Show less' : 'Full analysis'}
                      </button>
                      {showFullAI && (
                        <div className="border-t border-white/[0.05] pt-3">
                          <p className="text-[12.5px] text-white/45 leading-relaxed whitespace-pre-line">
                            {player.why_long}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          ) : (
            /* Free: compact AI teaser — no blurred text to avoid leaking content */
            <div>
              <SectionLabel icon={<Brain size={13} />} title="AI Analysis" />
              <PremiumCallout
                title="AI Analysis — Premium"
                desc={`Unlock the weekly Neeko AI summary, action reasoning, and full outlook`}
                playerName={player.player_name}
              />
            </div>
          )}

          {/* ══════════════════════════════════════════
              5. SIMILAR PLAYERS
              Free: show rows but mask premium fields on locked players
          ══════════════════════════════════════════ */}
          {similar.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <SectionLabel icon={<Users size={13} />} title={`Similar ${posName}`} />
                {posSlug && (
                  <Link
                    to={`/sports/afl/positions/${posSlug}`}
                    className="flex items-center gap-1 text-[11px] text-white/28 hover:text-white/55 transition-colors mb-3"
                  >
                    All {posName} <ChevronRight size={11} />
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

          {/* ══════════════════════════════════════════
              6. TEAM + POSITION CARDS (always visible)
          ══════════════════════════════════════════ */}
          {(teamSlug || posSlug) && (
            <div className={`grid gap-3 ${teamSlug && posSlug ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {teamSlug && (
                <QuickNavCard
                  to={`/sports/afl/teams/${teamSlug}`}
                  icon={<Users size={13} />}
                  title="Team"
                  subtitle={player.team ?? ''}
                />
              )}
              {posSlug && (
                <QuickNavCard
                  to={`/sports/afl/positions/${posSlug}`}
                  icon={<BarChart2 size={13} />}
                  title="Position"
                  subtitle={posName}
                />
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════
              7. SEO GUIDE (always visible, no premium leakage)
          ══════════════════════════════════════════ */}
          <PlayerSEOBlock player={player} isPremium={isPremium} />

        </div>
      </div>
    </>
  );
}
