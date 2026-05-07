import { useEffect, useState, useMemo, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  TrendingUp, Crown, DollarSign, TriangleAlert as AlertTriangle,
  ShieldAlert, Zap, Lock, ChevronRight, ExternalLink,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import { applyDecisionFields } from "@/lib/decisionEngine";
import { buildCurrentRoundPlayers, type CurrentRoundPlayer } from "@/features/afl/current-round/engine";
import {
  fmt, fmtPrice, fmtUpdatedAt,
  getCanonicalConfidenceStyles,
  formatCanonicalConfidenceLabel,
  getActionDisplayStyles,
  formatActionLabel,
} from "@/features/afl/rankings/components/helpers";
import { getCaptainScore, getCaptainConfidence } from "@/features/afl/shared/data/captainScoring";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { playerToSlug } from "@/lib/slugs";

// ── Constants ─────────────────────────────────────────────────────────────────

const FREE_LIMIT = 2;

// ── Data hook ─────────────────────────────────────────────────────────────────

interface RoundData {
  captains: CurrentRoundPlayer[];
  mustBuys: CurrentRoundPlayer[];
  valuePicks: CurrentRoundPlayer[];
  traps: CurrentRoundPlayer[];
  riskPicks: CurrentRoundPlayer[];
  roundLabel: string | null;
  updatedAt: string | null;
  loading: boolean;
  error: boolean;
}

function useRoundData(): RoundData {
  const { user, isPremium, loading: authLoading } = useAuth();
  const [rawRows, setRawRows] = useState<RankingRow[]>([]);
  const [roundLabel, setRoundLabel] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rankRes, metaRes] = await Promise.all([
        supabase.rpc("get_rankings_safe", {
          p_user_id: user?.id ?? null,
          p_is_bot: false,
          p_limit: isPremium ? 400 : 80,
        }),
        supabase.rpc("get_rankings_updated_at"),
      ]);

      const rows: RankingRow[] = (rankRes.data ?? []).map(mapRankingRow).map(r =>
        applyDecisionFields([r])[0]
      );
      setRawRows(rows);

      if (metaRes.data && Array.isArray(metaRes.data) && metaRes.data.length > 0) {
        const d = metaRes.data[0] as { round_label?: string; updated_at?: string };
        setRoundLabel(d.round_label ?? null);
        setUpdatedAt(d.updated_at ?? null);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isPremium]);

  useEffect(() => {
    if (!authLoading) load();
  }, [load, authLoading]);

  const { captains, mustBuys, budgetPicks, riskPicks, traps } = useMemo(() => {
    if (rawRows.length === 0) {
      return { captains: [], mustBuys: [], budgetPicks: [], riskPicks: [], traps: [] };
    }
    return buildCurrentRoundPlayers(rawRows);
  }, [rawRows]);

  // Value picks: budget picks are already value-focused; supplement with high value_score
  const valuePicks = useMemo(() => {
    if (rawRows.length === 0) return [];
    const budgetIds = new Set(budgetPicks.map(p => p.player_id));
    const extras = rawRows
      .filter(p =>
        p.player_id &&
        !budgetIds.has(p.player_id) &&
        (p.value_score ?? 0) > 0 &&
        (p.projection ?? 0) > 50 &&
        !p.is_injured &&
        !p.is_bye
      )
      .map(p => ({ ...p, overallRank: 999, isFeaturedPick: false }) as CurrentRoundPlayer)
      .sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0));

    return [...budgetPicks, ...extras].slice(0, 10);
  }, [rawRows, budgetPicks]);

  return { captains, mustBuys, valuePicks, traps, riskPicks, roundLabel, updatedAt, loading, error };
}

// ── Player slug helper ────────────────────────────────────────────────────────

function playerHref(p: CurrentRoundPlayer): string {
  if (!p.player_name) return "#";
  try {
    return `/sports/afl/players/${playerToSlug(p.player_name, p.team ?? "")}`;
  } catch {
    return "#";
  }
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function ConfidenceBadge({ label }: { label: string | null | undefined }) {
  if (!label) return null;
  const styles = getCanonicalConfidenceStyles(label);
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-[700] uppercase tracking-wider ${styles}`}>
      {formatCanonicalConfidenceLabel(label)}
    </span>
  );
}

function ActionBadge({ action }: { action: string | null | undefined }) {
  if (!action) return null;
  const styles = getActionDisplayStyles(action);
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-[700] uppercase tracking-wider ${styles}`}>
      {formatActionLabel(action)}
    </span>
  );
}

interface PlayerRowProps {
  player: CurrentRoundPlayer;
  rank?: number;
  statLabel?: string;
  statValue?: string | null;
  accentColor?: string;
  extraBadge?: React.ReactNode;
}

function PlayerRow({ player: p, rank, statLabel, statValue, accentColor = "text-white/55", extraBadge }: PlayerRowProps) {
  const href = playerHref(p);
  const isLinked = href !== "#";

  const inner = (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/[0.035] transition-colors group">
      {rank != null && (
        <span className="text-[11px] font-[700] text-white/20 w-4 shrink-0 text-right tabular-nums">{rank}</span>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-[700] text-white/90 leading-tight truncate">{p.player_name}</span>
          {p.team && <span className="text-[10px] text-white/30 font-[500] shrink-0">{p.team}</span>}
          {p.position && <span className="text-[10px] text-white/25 font-[500] shrink-0">{p.position}</span>}
          {extraBadge}
        </div>
        {p.summary_short && (
          <p className="text-[11px] text-white/38 leading-snug mt-0.5 line-clamp-1">{p.summary_short}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <ConfidenceBadge label={p.confidence_label} />
        {statLabel && statValue && (
          <div className="text-right">
            <div className={`text-[12px] font-[700] tabular-nums ${accentColor}`}>{statValue}</div>
            <div className="text-[9px] text-white/22 uppercase tracking-wider leading-none">{statLabel}</div>
          </div>
        )}
        {isLinked && (
          <ExternalLink className="h-3 w-3 text-white/15 group-hover:text-white/35 transition-colors shrink-0" aria-hidden />
        )}
      </div>
    </div>
  );

  return isLinked ? (
    <Link to={href} className="block">{inner}</Link>
  ) : (
    <div>{inner}</div>
  );
}

function LockRow({ count, onUpgrade }: { count: number; onUpgrade?: () => void }) {
  if (count <= 0) return null;
  return (
    <div
      className="flex items-center gap-2 py-2.5 px-3 rounded-xl border border-dashed border-white/[0.08] cursor-pointer hover:border-[#F5C84C]/20 hover:bg-[#F5C84C]/[0.03] transition-colors"
      onClick={onUpgrade}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onUpgrade?.()}
    >
      <Lock className="h-3 w-3 text-[#F5C84C]/40 shrink-0" aria-hidden />
      <span className="text-[12px] text-white/28 flex-1">
        +{count} more hidden
      </span>
      <Link
        to="/neeko-plus"
        onClick={e => e.stopPropagation()}
        className="text-[11px] font-[700] text-[#F5C84C]/70 hover:text-[#F5C84C] transition-colors flex items-center gap-1"
      >
        Unlock <ChevronRight className="h-3 w-3" aria-hidden />
      </Link>
    </div>
  );
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  players: CurrentRoundPlayer[];
  isPremium: boolean;
  renderPlayer: (p: CurrentRoundPlayer, i: number) => React.ReactNode;
  emptyMessage?: string;
}

function Section({ title, icon, iconBg, players, isPremium, renderPlayer, emptyMessage }: SectionProps) {
  const visible = isPremium ? players : players.slice(0, FREE_LIMIT);
  const hidden = isPremium ? 0 : Math.max(0, players.length - FREE_LIMIT);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.05]">
        <div className={`flex items-center justify-center h-7 w-7 rounded-lg ${iconBg} shrink-0`}>
          {icon}
        </div>
        <span className="text-[14px] font-[800] text-white/88">{title}</span>
        {players.length > 0 && (
          <span className="ml-auto text-[11px] text-white/22 font-[500] tabular-nums">{players.length}</span>
        )}
      </div>
      <div className="px-1 py-1">
        {visible.length === 0 ? (
          <p className="text-[12px] text-white/25 px-3 py-3">
            {emptyMessage ?? "No data available for this round."}
          </p>
        ) : (
          <>
            {visible.map((p, i) => renderPlayer(p, i))}
            <LockRow count={hidden} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CurrentWeekPage() {
  const { isPremium } = useAuth();
  const data = useRoundData();

  return (
    <>
      <Helmet>
        <title>AFL Fantasy Current Week Picks | Neeko Sports Stats</title>
        <meta
          name="description"
          content="AFL Fantasy weekly calls — must buys, trap alerts, captain picks, value picks and risk watch for the current round."
        />
        <link rel="canonical" href="https://neekostats.com.au/fantasy/current-week" />
        <meta property="og:url" content="https://neekostats.com.au/fantasy/current-week" />
        <meta property="og:title" content="AFL Fantasy Current Week Picks | Neeko Sports Stats" />
        <meta name="twitter:title" content="AFL Fantasy Current Week Picks | Neeko Sports Stats" />
      </Helmet>

      <div className="min-h-screen bg-[#05070A] text-white overflow-x-hidden">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-8 sm:pt-12 pb-16 sm:pb-24">

          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <div className="mb-8 sm:mb-10">
            <p className="text-[9px] font-[900] tracking-[0.46em] uppercase text-emerald-500/60 mb-3">
              Fantasy Hub
            </p>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-[clamp(1.6rem,5vw,2.25rem)] font-[900] tracking-tight text-[#F5F5F5] leading-[1.18] mb-2">
                  Current Week
                  {data.roundLabel && (
                    <span className="ml-3 text-[clamp(0.9rem,2.5vw,1.1rem)] font-[600] text-white/35">
                      {data.roundLabel}
                    </span>
                  )}
                </h1>
                <p className="text-[clamp(13px,2vw,15px)] text-white/45 leading-[1.7] max-w-[480px]">
                  Weekly fantasy calls — must buys, traps, captains and value picks for this round.
                </p>
              </div>
              {data.updatedAt && (
                <span className="text-[10px] text-white/20 shrink-0 pt-1">
                  {fmtUpdatedAt(data.updatedAt)}
                </span>
              )}
            </div>
          </div>

          {/* ── Error state ───────────────────────────────────────────────── */}
          {data.error && !data.loading && (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-8 text-center mb-6">
              <p className="text-[13px] text-white/35">
                Could not load round data. Please try again later.
              </p>
            </div>
          )}

          {/* ── Sections ──────────────────────────────────────────────────── */}
          {!data.error && (
            <div className="space-y-4">

              {/* Must Buys */}
              <Section
                title="Must Buys"
                icon={<Zap className="h-3.5 w-3.5 text-emerald-400" aria-hidden />}
                iconBg="bg-emerald-500/[0.12]"
                players={data.mustBuys}
                isPremium={isPremium}
                emptyMessage="No must buy picks identified this round."
                renderPlayer={(p, i) => (
                  <PlayerRow
                    key={p.player_id ?? i}
                    player={p}
                    rank={i + 1}
                    statLabel="proj"
                    statValue={data.loading ? "—" : fmt(p.projection, 0)}
                    accentColor="text-emerald-400"
                    extraBadge={<ActionBadge action={p.action_canonical} />}
                  />
                )}
              />

              {/* Captain Picks */}
              <Section
                title="Captain Picks"
                icon={<Crown className="h-3.5 w-3.5 text-[#F5C84C]" aria-hidden />}
                iconBg="bg-[#F5C84C]/[0.10]"
                players={data.captains}
                isPremium={isPremium}
                emptyMessage="No captain picks available for this round."
                renderPlayer={(p, i) => {
                  const captScore = p.captain_score ?? getCaptainScore(p);
                  const captConf  = getCaptainConfidence(captScore);
                  const tier = i === 0 ? "LOCK" : i < 3 ? "SAFE" : "POD";
                  const tierColor = tier === "LOCK"
                    ? "text-[#F5C84C] bg-[#F5C84C]/[0.10]"
                    : tier === "SAFE"
                    ? "text-sky-400 bg-sky-500/[0.08]"
                    : "text-white/40 bg-white/[0.04]";
                  void captConf;
                  return (
                    <PlayerRow
                      key={p.player_id ?? i}
                      player={p}
                      rank={i + 1}
                      statLabel="proj"
                      statValue={data.loading ? "—" : fmt(p.projection, 0)}
                      accentColor="text-[#F5C84C]"
                      extraBadge={
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-[700] uppercase tracking-wider ${tierColor}`}>
                          {tier}
                        </span>
                      }
                    />
                  );
                }}
              />

              {/* Value Picks */}
              <Section
                title="Value Picks"
                icon={<DollarSign className="h-3.5 w-3.5 text-sky-400" aria-hidden />}
                iconBg="bg-sky-500/[0.08]"
                players={data.valuePicks}
                isPremium={isPremium}
                emptyMessage="No value picks identified this round."
                renderPlayer={(p, i) => (
                  <PlayerRow
                    key={p.player_id ?? i}
                    player={p}
                    rank={i + 1}
                    statLabel={p.price != null ? "price" : "proj"}
                    statValue={
                      data.loading
                        ? "—"
                        : p.price != null
                        ? fmtPrice(p.price)
                        : fmt(p.projection, 0)
                    }
                    accentColor="text-sky-400"
                    extraBadge={
                      p.value_score != null ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-[700] text-sky-400 bg-sky-500/[0.08]">
                          +{fmt(p.value_score, 1)} val
                        </span>
                      ) : undefined
                    }
                  />
                )}
              />

              {/* Trap Alerts */}
              <Section
                title="Trap Alerts"
                icon={<AlertTriangle className="h-3.5 w-3.5 text-red-400" aria-hidden />}
                iconBg="bg-red-500/[0.10]"
                players={data.traps}
                isPremium={isPremium}
                emptyMessage="No trap alerts for this round."
                renderPlayer={(p, i) => {
                  const edge = p.edge_canonical ?? (((p.projection ?? 0) - (p.breakeven ?? 0)) || null);
                  const edgeStr = edge != null && !isNaN(edge)
                    ? `${edge > 0 ? "+" : ""}${Math.round(edge)}`
                    : null;
                  return (
                    <PlayerRow
                      key={p.player_id ?? i}
                      player={p}
                      rank={i + 1}
                      statLabel={edgeStr ? "edge" : "proj"}
                      statValue={
                        data.loading
                          ? "—"
                          : edgeStr ?? fmt(p.projection, 0)
                      }
                      accentColor="text-red-400"
                      extraBadge={<ActionBadge action={p.action_canonical} />}
                    />
                  );
                }}
              />

              {/* Risk Watch */}
              <Section
                title="Risk Watch"
                icon={<ShieldAlert className="h-3.5 w-3.5 text-amber-400" aria-hidden />}
                iconBg="bg-amber-500/[0.08]"
                players={data.riskPicks}
                isPremium={isPremium}
                emptyMessage="No risk watch players this round."
                renderPlayer={(p, i) => (
                  <PlayerRow
                    key={p.player_id ?? i}
                    player={p}
                    rank={i + 1}
                    statLabel="proj"
                    statValue={data.loading ? "—" : fmt(p.projection, 0)}
                    accentColor="text-amber-400"
                    extraBadge={<TrendingUp className="h-3 w-3 text-red-400/60 rotate-180 shrink-0" aria-hidden />}
                  />
                )}
              />

            </div>
          )}

          {/* ── Loading skeleton ──────────────────────────────────────────── */}
          {data.loading && (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.05]">
                    <div className="h-7 w-7 rounded-lg bg-white/[0.04] animate-pulse" />
                    <div className="h-4 w-24 rounded bg-white/[0.04] animate-pulse" />
                  </div>
                  <div className="px-1 py-1 space-y-0.5">
                    {Array.from({ length: FREE_LIMIT }).map((_, j) => (
                      <div key={j} className="flex items-center gap-3 py-2.5 px-3 rounded-xl">
                        <div className="h-3.5 w-3 rounded bg-white/[0.03] animate-pulse" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3.5 w-32 rounded bg-white/[0.04] animate-pulse" />
                          <div className="h-2.5 w-48 rounded bg-white/[0.03] animate-pulse" />
                        </div>
                        <div className="h-5 w-12 rounded bg-white/[0.03] animate-pulse" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Start/Sit CTA ─────────────────────────────────────────────── */}
          {!data.loading && !data.error && (
            <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.015] px-5 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-[700] text-white/75 leading-tight">
                  Need a Start/Sit decision?
                </p>
                <p className="text-[11px] text-white/30 mt-0.5">
                  Get a personalised call for any two players you're comparing.
                </p>
              </div>
              <Link
                to="/fantasy/rankings"
                className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-white/[0.12] bg-white/[0.04] px-3.5 py-2 text-[12px] font-[700] text-white/65 hover:text-white/88 hover:border-white/[0.20] hover:bg-white/[0.07] transition-colors"
              >
                Start/Sit Tool
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden />
              </Link>
            </div>
          )}

          {/* ── Upgrade prompt for free users ─────────────────────────────── */}
          {!isPremium && !data.loading && !data.error && (
            <div className="mt-4 rounded-2xl border border-[#F5C84C]/20 bg-[#F5C84C]/[0.04] px-5 py-4 flex items-center gap-4">
              <Crown className="h-5 w-5 text-[#F5C84C]/60 shrink-0" aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-[700] text-white/75 leading-tight">
                  Unlock full sections with Neeko+
                </p>
                <p className="text-[11px] text-white/30 mt-0.5">
                  See all must buys, captains, value picks and risk watch players.
                </p>
              </div>
              <Link
                to="/neeko-plus"
                className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-[#F5C84C]/30 bg-[#F5C84C]/[0.10] px-3.5 py-2 text-[12px] font-[700] text-[#F5C84C] hover:bg-[#F5C84C]/[0.18] hover:border-[#F5C84C]/50 transition-colors"
              >
                Upgrade
                <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </Link>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
