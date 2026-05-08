import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Users, Zap, ChartBar as BarChart2, Star, CircleAlert as AlertCircle, Flame, Trophy, DollarSign, Lock, Activity, Target, Shield, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { nameToSlug, POSITION_NAMES, TEAM_SLUG_TO_NAME } from '@/lib/slugs';
import { getTeamPlayersSafe } from '@/lib/playerAccess';
import { useAuth } from '@/lib/auth';
import { getTeamAccentColour } from '@/config/aflTeamColours';
import { PlayerStatusPill } from '@/features/afl/rankings/components/PlayerStatusPill';
import { fmtEdge, getEdgeColor } from '@/features/afl/rankings/components/helpers';
import { useAccessState } from '@/hooks/useAccessState';

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
  return `$${Math.round(p / 1000)}k`;
}

function fmtProj(p: number | null | undefined) {
  if (p == null) return '—';
  return Math.round(Number(p)).toString();
}

function fmtAvg(v: number | null | undefined) {
  if (v == null) return '—';
  return Math.round(Number(v)).toString();
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

function StatPill({ label, value, color = 'text-white' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
      <span className="text-[9px] uppercase tracking-wider text-white/30">{label}</span>
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

function LockedField() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-white/20 select-none">
      <Lock size={9} className="shrink-0" />
      <span className="blur-[3px]">000</span>
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
  icon, label, playerName, stat, statLabel, sub, slug, accentColor,
}: {
  icon: React.ReactNode;
  label: string;
  playerName: string;
  stat: string;
  statLabel: string;
  sub?: string;
  slug: string;
  accentColor: string;
}) {
  return (
    <Link
      to={`/sports/afl/players/${slug}`}
      className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] p-4 hover:bg-white/[0.03] hover:border-white/[0.12] transition-all group flex flex-col gap-2.5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: accentColor }}>{icon}</span>
          <span className="text-[9px] uppercase tracking-widest text-white/30">{label}</span>
        </div>
        <ChevronRight size={11} className="text-white/15 group-hover:text-white/35 transition-colors" />
      </div>
      <p className="text-[13px] font-semibold text-white/85 truncate group-hover:text-white transition-colors leading-tight">
        {playerName}
      </p>
      <div className="flex items-end justify-between">
        <span className="text-[22px] font-black tabular-nums leading-none" style={{ color: accentColor }}>{stat}</span>
        <div className="text-right">
          <span className="text-[8px] text-white/25 uppercase tracking-wide block">{statLabel}</span>
          {sub && <span className="text-[8px] text-white/18 block">{sub}</span>}
        </div>
      </div>
    </Link>
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

// ─── Line group card (Mids / Defs / Fwds / Rucks) ─────────────────────────────

function LineCard({
  title, players, accentColor, isPremium,
}: {
  title: string;
  players: TeamPlayer[];
  accentColor: string;
  isPremium: boolean;
}) {
  if (!players.length) return null;
  const maxProj = Math.max(...players.map(p => p.projection ?? 0));
  const avgProj = Math.round(players.reduce((s, p) => s + (p.projection ?? 0), 0) / players.length);
  const startCt = players.filter(p => {
    const ac = (p.action_canonical ?? '').toUpperCase();
    return ac === 'START' || ac === 'SMASH_START';
  }).length;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] overflow-hidden">
      {/* line header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-4 rounded-full" style={{ backgroundColor: accentColor }} />
          <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider">{title}</span>
          <span className="text-[9px] text-white/25">{players.length} players</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] text-white/25">avg proj <span className="text-white/45 font-semibold">{avgProj}</span></span>
          {startCt > 0 && (
            <span className="text-[9px] text-emerald-400/70">{startCt} start</span>
          )}
        </div>
      </div>
      {/* player rows */}
      <div className="divide-y divide-white/[0.03]">
        {players.slice(0, 6).map(p => {
          const slug = nameToSlug(p.player_name);
          const proj = p.projection ?? 0;
          return (
            <Link
              key={p.player_id ?? p.player_name}
              to={`/sports/afl/players/${slug}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors group"
            >
              <ActionIcon action={p.action_canonical} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[12px] font-semibold text-white/80 group-hover:text-white transition-colors truncate">
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
                  <span className="text-[9px] text-white/30">{fmtPrice(p.price)}</span>
                  {isPremium && p.breakeven != null && (
                    <span className="text-[9px] text-white/25">BE: {Math.round(p.breakeven)}</span>
                  )}
                  <MiniBar value={proj} max={maxProj || 1} color={accentColor} />
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[13px] font-bold tabular-nums text-white/75">{fmtProj(p.projection)}</span>
                <p className="text-[8px] text-white/22 uppercase tracking-wide">proj</p>
              </div>
            </Link>
          );
        })}
        {players.length > 6 && (
          <div className="px-4 py-2 text-center">
            <span className="text-[9px] text-white/22">+{players.length - 6} more in full roster</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Full roster row ──────────────────────────────────────────────────────────

function RosterRow({ player, rank, isPremium }: { player: TeamPlayer; rank: number; isPremium: boolean }) {
  const slug = nameToSlug(player.player_name);
  return (
    <Link
      to={`/sports/afl/players/${slug}`}
      className="flex items-center justify-between rounded-xl bg-[#0d0d0d] border border-white/[0.05] hover:bg-white/[0.03] hover:border-white/[0.10] transition-all duration-150 px-4 py-3 group"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="text-[11px] font-bold text-white/18 w-5 shrink-0 text-center tabular-nums">{rank}</span>
        <ActionIcon action={player.action_canonical} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[13px] font-semibold text-white/80 truncate group-hover:text-white transition-colors">
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
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[9px] text-white/30">
              {POSITION_NAMES[player.position ?? ''] ?? player.position ?? '—'}
            </span>
            <span className="text-[9px] text-white/18">·</span>
            <span className="text-[9px] text-white/30">{fmtPrice(player.price)}</span>
            {isPremium && player.breakeven != null && (
              <>
                <span className="text-[9px] text-white/18">·</span>
                <span className="text-[9px] text-white/35">BE: {Math.round(player.breakeven)}</span>
              </>
            )}
            {!isPremium && (
              <>
                <span className="text-[9px] text-white/18">·</span>
                <span className="text-[9px] text-white/22">BE: <LockedField /></span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {isPremium && player.edge_canonical != null && (
          <div className="text-right hidden sm:block">
            <p className="text-[8px] text-white/22 uppercase tracking-wide">Edge</p>
            <p className={`text-[11px] font-semibold tabular-nums ${getEdgeColor(player.edge_canonical)}`}>
              {fmtEdge(player.edge_canonical)}
            </p>
          </div>
        )}
        {!isPremium && (
          <div className="text-right hidden sm:block">
            <p className="text-[8px] text-white/22 uppercase tracking-wide">Edge</p>
            <p className="text-[11px] text-white/18"><LockedField /></p>
          </div>
        )}
        <div className="text-right min-w-[38px]">
          <p className="text-[13px] font-bold text-white/75 tabular-nums">{fmtProj(player.projection)}</p>
          <p className="text-[8px] text-white/22 uppercase tracking-wide">proj</p>
        </div>
        <ActionBadge action={player.action_canonical} actionDisplay={player.action_display} />
        <ChevronRight size={13} className="text-white/15 group-hover:text-white/38 transition-colors" />
      </div>
    </Link>
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
        Unlock breakeven scores, edge ratings, value signals, and AI analysis for every player.
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

function TeamSEOBlock({ teamName, teamSlug, players }: { teamName: string; teamSlug: string; players: TeamPlayer[] }) {
  const shortName = teamName.split(' ')[0];
  const isHistoric = ['Adelaide', 'Hawthorn', 'Geelong', 'Richmond', 'Carlton', 'Collingwood'].includes(shortName);

  const top5 = players
    .slice(0, 5)
    .map(p => `${p.player_name} (${p.position ?? '—'}, proj: ${fmtProj(p.projection)})`)
    .join(', ');

  const topPlayer = players[0];
  const topProj = topPlayer ? fmtProj(topPlayer.projection) : '—';
  const startPlayers = players.filter(p => {
    const ac = (p.action_canonical ?? '').toUpperCase();
    return ac === 'START' || ac === 'SMASH_START';
  });
  const startNames = startPlayers.slice(0, 3).map(p => p.player_name).join(', ');

  return (
    <section className="border-t border-white/[0.05] pt-8 pb-4 space-y-6">
      <h2 className="text-[13px] font-bold text-white/30 leading-snug">
        {teamName} — 2026 AFL Season Stats &amp; Analysis
      </h2>

      <div className="space-y-4 text-[12px] text-white/28 leading-relaxed">
        <div>
          <h3 className="text-[9px] font-bold text-white/26 uppercase tracking-widest mb-1.5">Team Overview</h3>
          <p>
            The {teamName} are one of the AFL's {isHistoric ? 'most historic' : 'competitive'} clubs.
            This page tracks every {teamName} player's projected score, price, and signal for the 2026 AFL season.
            {topPlayer && ` ${topPlayer.player_name} currently leads the squad with a projected ${topProj} points.`}
          </p>
        </div>

        <div>
          <h3 className="text-[9px] font-bold text-white/26 uppercase tracking-widest mb-1.5">Key Players</h3>
          <p>
            {teamName} players ranked by projected output: {top5}.
            Projections are calculated using recent form, matchup difficulty, venue factors, and price efficiency —
            updated weekly following each AFL round.
          </p>
        </div>

        {startNames && (
          <div>
            <h3 className="text-[9px] font-bold text-white/26 uppercase tracking-widest mb-1.5">Start Signals</h3>
            <p>
              Current Start signals from the {teamName} squad: {startNames}.
              Start signals identify players whose projected score exceeds their breakeven, indicating likely price growth.
            </p>
          </div>
        )}

        <div>
          <h3 className="text-[9px] font-bold text-white/26 uppercase tracking-widest mb-1.5">How Projections Work</h3>
          <p>
            Each player's projection is computed using Neeko's statistical model — combining season averages,
            last-3-match form, opponent position concession rates, venue multipliers, and role stability signals.
            Click any player to view their full scoring history, statistical profile, and AI analysis.
          </p>
        </div>

        <div>
          <h3 className="text-[9px] font-bold text-white/26 uppercase tracking-widest mb-2">More Stats</h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <Link to="/fantasy/rankings" className="text-white/28 hover:text-white/52 transition-colors underline underline-offset-2 decoration-white/14">AFL Rankings</Link>
            <Link to="/fantasy/market-watch" className="text-white/28 hover:text-white/52 transition-colors underline underline-offset-2 decoration-white/14">Market Watch</Link>
            <Link to="/sports/afl/players" className="text-white/28 hover:text-white/52 transition-colors underline underline-offset-2 decoration-white/14">All AFL Players</Link>
            <Link to="/fantasy/current-week" className="text-white/28 hover:text-white/52 transition-colors underline underline-offset-2 decoration-white/14">Edge Board</Link>
          </div>
        </div>
      </div>

      {/* Other teams */}
      <div>
        <p className="text-[9px] text-white/22 uppercase tracking-widest mb-2">More AFL Teams</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(TEAM_SLUG_TO_NAME)
            .filter(([slug]) => slug !== teamSlug)
            .slice(0, 12)
            .map(([slug, name]) => (
              <Link
                key={slug}
                to={`/sports/afl/teams/${slug}`}
                className="text-[9px] text-white/28 border border-white/[0.06] rounded px-2 py-0.5 hover:text-white/55 hover:border-white/[0.12] transition-all"
              >
                {name.split(' ')[0]}
              </Link>
            ))}
        </div>
      </div>

      <p className="sr-only">
        Complete {teamName} AFL player stats, projections, price analysis and recommendations
        for the 2026 AFL season. Includes every {teamName} player with start/hold/sit signals, breakeven
        scores, and value picks — updated weekly. Top {teamName} players: {top5}.
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
      startCt: 0, sitCt: 0, holdCt: 0,
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
    const topValuePlayer = [...active]
      .filter(p => p.value_score != null)
      .sort((a, b) => (Number(b.value_score) || 0) - (Number(a.value_score) || 0))[0] ?? null;

    const startCt = players.filter(p => {
      const ac = (p.action_canonical ?? '').toUpperCase();
      return ac === 'START' || ac === 'SMASH_START';
    }).length;
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
      startCt, sitCt, holdCt,
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

  const visiblePlayers = isPremium ? players : players.slice(0, FREE_PLAYER_LIMIT);
  const hasMore = !isPremium && players.length > FREE_PLAYER_LIMIT;

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#080808]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
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
      <div className="min-h-screen bg-[#080808] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <AlertCircle size={40} className="text-white/20 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Team Not Found</h2>
          <p className="text-white/40 mb-6 text-sm">Could not load data for: {teamName || team}</p>
          <button
            onClick={() => navigate('/fantasy/rankings')}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <ArrowLeft size={15} />
            Back to Rankings
          </button>
        </div>
      </div>
    );
  }

  const shortName   = teamName.split(' ')[0];
  const pageTitle   = `${teamName} AFL Fantasy Players 2026 | Neeko`;
  const pageDescription = `${teamName} AFL Fantasy players for 2026. Projected scores, prices, and rankings for every ${teamName} player this round. ${stats.totalPlayers} players listed, ${stats.startCt} Start signals identified.`;
  const pageUrl     = `https://neekostats.com.au/sports/afl/teams/${team}`;

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description"         content={pageDescription} />
        <meta name="keywords"            content={`${teamName}, AFL Fantasy, AFL Fantasy 2026, ${teamName} players, fantasy projections, buy sell hold, captain picks, ${teamName} fantasy tips 2026, ${shortName} AFL Fantasy`} />
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

      <div className="min-h-screen bg-[#080808]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-7">

          {/* Back nav */}
          <button
            onClick={() => navigate('/fantasy/rankings')}
            className="flex items-center gap-1.5 text-white/35 hover:text-white/65 transition-colors text-[11px]"
          >
            <ArrowLeft size={13} />
            Rankings
          </button>

          {/* ══════════════════════════════════════════
              HERO
          ══════════════════════════════════════════ */}
          <div
            className="rounded-2xl border border-white/[0.07] relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${accentSafe}14 0%, #0d0d0d 55%)` }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at top left, ${accentSafe}18 0%, transparent 55%)` }}
            />
            <div className="relative px-5 sm:px-7 py-6">

              {/* eyebrow + title */}
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-white/28 mb-1.5">AFL 2026 · Team Dashboard</p>
                  <h1 className="text-[26px] sm:text-[30px] font-black text-white leading-tight tracking-tight">
                    {teamName}
                  </h1>
                  <p className="text-[12px] text-white/40 mt-1">
                    {stats.totalPlayers} players tracked · {stats.startCt} start signal{stats.startCt !== 1 ? 's' : ''} · sorted by projection
                  </p>
                </div>
                <div
                  className="flex items-center justify-center w-11 h-11 rounded-xl shrink-0"
                  style={{ background: `${accentSafe}1a`, border: `1px solid ${accentSafe}30` }}
                >
                  <Users size={20} style={{ color: accentSafe }} />
                </div>
              </div>

              {/* stat strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <MetricCard label="Top Projection"  value={stats.topProj}       accent="#34d399" />
                <MetricCard label="Squad Avg Proj"  value={stats.avgProj}       />
                <MetricCard label="2026 Avg Score"  value={stats.avgSeasonAvg}  />
                <MetricCard label="Start Signals"   value={stats.startCt}       accent={stats.startCt > 0 ? '#34d399' : undefined} />
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════
              INTELLIGENCE CARDS
          ══════════════════════════════════════════ */}
          {players.length > 0 && (
            <div>
              <SectionLabel icon={<Flame size={13} />} title="Squad Highlights" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {stats.topPlayer && (
                  <InsightCard
                    icon={<Trophy size={14} />}
                    label="Top Projected"
                    playerName={stats.topPlayer.player_name}
                    stat={fmtProj(stats.topPlayer.projection)}
                    statLabel="projected pts"
                    sub={stats.topPlayer.season_avg != null ? `2026 avg ${fmtAvg(stats.topPlayer.season_avg)}` : undefined}
                    slug={nameToSlug(stats.topPlayer.player_name)}
                    accentColor="#34d399"
                  />
                )}
                {stats.mostExpensivePlayer && (
                  <InsightCard
                    icon={<DollarSign size={14} />}
                    label="Highest Priced"
                    playerName={stats.mostExpensivePlayer.player_name}
                    stat={fmtPrice(stats.mostExpensivePlayer.price)}
                    statLabel="current price"
                    sub={stats.mostExpensivePlayer.price_change != null && stats.mostExpensivePlayer.price_change !== 0
                      ? `${stats.mostExpensivePlayer.price_change > 0 ? '+' : ''}${fmtPrice(stats.mostExpensivePlayer.price_change)} last round`
                      : undefined}
                    slug={nameToSlug(stats.mostExpensivePlayer.player_name)}
                    accentColor={accentSafe}
                  />
                )}
                {stats.topValuePlayer ? (
                  <InsightCard
                    icon={<Star size={14} />}
                    label="Best Value Signal"
                    playerName={stats.topValuePlayer.player_name}
                    stat={stats.topValuePlayer.value_score != null ? stats.topValuePlayer.value_score.toFixed(1) : '—'}
                    statLabel="value score"
                    sub={stats.topValuePlayer.price != null ? fmtPrice(stats.topValuePlayer.price) : undefined}
                    slug={nameToSlug(stats.topValuePlayer.player_name)}
                    accentColor="#F5C84C"
                  />
                ) : stats.topPlayer ? (
                  <InsightCard
                    icon={<Activity size={14} />}
                    label="Squad Avg Projection"
                    playerName={`${shortName} squad`}
                    stat={String(stats.avgProj)}
                    statLabel="avg projected pts"
                    slug={nameToSlug(stats.topPlayer.player_name)}
                    accentColor="#60a5fa"
                  />
                ) : null}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              SQUAD SIGNAL SUMMARY
          ══════════════════════════════════════════ */}
          {players.length > 0 && (
            <div>
              <SectionLabel icon={<Target size={13} />} title="Signal Distribution" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Action breakdown */}
                <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] px-4 py-3.5 space-y-3">
                  <p className="text-[9px] uppercase tracking-widest text-white/28 font-semibold">Round Signals</p>
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
                </div>

                {/* Form summary */}
                <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] px-4 py-3.5 space-y-3">
                  <p className="text-[9px] uppercase tracking-widest text-white/28 font-semibold">Squad Form</p>
                  <div className="space-y-2.5">
                    <div>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-[9px] text-white/32">Avg Form Score</span>
                        <span className="text-[9px] font-semibold text-white/50">{stats.avgFormScore}</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500/60" style={{ width: `${Math.min(100, stats.avgFormScore)}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-[9px] text-white/32">Avg Consistency</span>
                        <span className="text-[9px] font-semibold text-white/50">{stats.avgConsistency}%</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full bg-sky-500/60" style={{ width: `${Math.min(100, stats.avgConsistency)}%` }} />
                      </div>
                    </div>
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
                  </div>
                </div>

                {/* Price movers */}
                <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] px-4 py-3.5 space-y-2">
                  <p className="text-[9px] uppercase tracking-widest text-white/28 font-semibold mb-1">Recent Price Movers</p>
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
                    <p className="text-[10px] text-white/25">No price changes this round.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              SQUAD BY LINE
          ══════════════════════════════════════════ */}
          {players.length > 0 && (
            <div>
              <SectionLabel icon={<Shield size={13} />} title="Squad by Line" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <LineCard title="Midfielders" players={lineGroups.MID} accentColor={accentSafe} isPremium={isPremium} />
                <LineCard title="Defenders"   players={lineGroups.DEF} accentColor={accentSafe} isPremium={isPremium} />
                <LineCard title="Forwards"    players={lineGroups.FWD} accentColor={accentSafe} isPremium={isPremium} />
                {lineGroups.RUC.length > 0 && (
                  <LineCard title="Rucks" players={lineGroups.RUC} accentColor={accentSafe} isPremium={isPremium} />
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              FULL ROSTER
          ══════════════════════════════════════════ */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-white/25"><Users size={13} /></span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">Full Roster</span>
              <div className="flex-1 h-px bg-white/[0.05]" />
              <span className="text-[9px] text-white/22 uppercase tracking-wide">sorted by projection</span>
            </div>

            {players.length === 0 ? (
              <div className="rounded-xl border border-white/[0.07] bg-[#0d0d0d] px-4 py-8 text-center">
                <p className="text-sm text-white/40">No player data available yet.</p>
                <p className="text-[11px] text-white/25 mt-1">Check back after round data is processed.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {visiblePlayers.map((player, idx) => (
                  <RosterRow
                    key={player.player_id ?? player.player_name}
                    player={player}
                    rank={idx + 1}
                    isPremium={isPremium}
                  />
                ))}
                {hasMore && (
                  <div className="pt-2">
                    <PremiumCTA teamName={teamName} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════
              EXPLORE / RELATED
          ══════════════════════════════════════════ */}
          <div>
            <SectionLabel icon={<BarChart2 size={13} />} title="Explore" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { to: '/fantasy/rankings',     icon: <BarChart2 size={13} />, label: 'AFL Rankings'   },
                { to: '/fantasy/market-watch', icon: <TrendingUp size={13} />, label: 'Market Watch'  },
                { to: '/fantasy/current-week', icon: <Zap size={13} />,       label: 'Edge Board'    },
                { to: '/sports/afl/players',   icon: <Users size={13} />,     label: 'All Players'   },
              ].map(({ to, icon, label }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#0d0d0d] px-3 py-2.5 text-[11px] text-white/45 hover:text-white/75 hover:bg-white/[0.04] hover:border-white/[0.10] transition-all"
                >
                  <span className="text-white/22 shrink-0">{icon}</span>
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* ══════════════════════════════════════════
              SEO BLOCK
          ══════════════════════════════════════════ */}
          <TeamSEOBlock teamName={teamName} teamSlug={team ?? ''} players={players} />

        </div>
      </div>
    </>
  );
}
