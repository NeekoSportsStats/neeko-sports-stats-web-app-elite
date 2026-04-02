import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ChevronRight, TrendingUp, AlertTriangle, Crown, Zap, Lock, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import {
  fmt,
  fmtPrice,
  fmtValueScore,
  fmtUpdatedAt,
  normalisePosition,
  getNeekoRatingBadge,
  getConfidenceColor,
  getValueScoreColor,
  getConfidenceLabel,
  resolveRecommendationColor,
} from "@/features/afl/rankings/components/helpers";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { PlayerDetailModal, UpgradeModal } from "@/features/afl/rankings/components/RankingsModals";
import type { RowTier } from "@/features/afl/rankings/components/types";

const FREE_ROWS = 8;

const COLUMNS = `
  player_id, player_name, team, position,
  projection_final, ceiling_estimate, floor_estimate,
  consistency_score, form_rating, matchup_rating,
  upside_rating, risk_rating, form_score,
  projection_confidence, captain_score, captain_rating,
  neeko_rating, neeko_rating_scaled,
  price, prev_price, price_change, price_change_pct,
  breakeven, value_score, best_value_score, value_tag, value_tier,
  ai_recommendation, recommendation_strength,
  recommendation_color, consistency_tier,
  why, long, ai_summary, ai_updated_at,
  start_sit_decision, edge_score, edge_tier,
  market_watch_category, upside_pct,
  status, manual_status, is_available,
  bye_round, is_bye, bye_next_round,
  games_played
`.trim();

function normalizeRow(raw: Record<string, unknown>): RankingRow {
  return {
    player_id: (raw.player_id as string) ?? null,
    player_name: (raw.player_name as string) ?? "",
    team: (raw.team as string) ?? "",
    position: normalisePosition(raw.position as string | null),
    projection_final: raw.projection_final != null ? Number(raw.projection_final) : null,
    ceiling_estimate: raw.ceiling_estimate != null ? Number(raw.ceiling_estimate) : null,
    floor_estimate: raw.floor_estimate != null ? Number(raw.floor_estimate) : null,
    consistency_score: raw.consistency_score != null ? Number(raw.consistency_score) : null,
    form_rating: raw.form_rating != null ? Number(raw.form_rating) : null,
    matchup_rating: (raw.matchup_rating as string | number) ?? null,
    upside_rating: raw.upside_rating != null ? Number(raw.upside_rating) : null,
    risk_rating: raw.risk_rating != null ? Number(raw.risk_rating) : null,
    form_score: raw.form_score != null ? Number(raw.form_score) : null,
    projection_confidence: raw.projection_confidence != null ? Number(raw.projection_confidence) : null,
    captain_score: raw.captain_score != null ? Number(raw.captain_score) : null,
    captain_rating: (raw.captain_rating as string) ?? null,
    neeko_rating: raw.neeko_rating != null ? Number(raw.neeko_rating) : null,
    neeko_rating_scaled: raw.neeko_rating_scaled != null ? Number(raw.neeko_rating_scaled) : null,
    price: raw.price != null ? Number(raw.price) : null,
    prev_price: raw.prev_price != null ? Number(raw.prev_price) : null,
    price_change: raw.price_change != null ? Number(raw.price_change) : null,
    price_change_pct: raw.price_change_pct != null ? Number(raw.price_change_pct) : null,
    breakeven: raw.breakeven != null ? Number(raw.breakeven) : null,
    value_score: raw.value_score != null ? Number(raw.value_score) : null,
    best_value_score: raw.best_value_score != null ? Number(raw.best_value_score) : null,
    value_tag: (raw.value_tag as string) ?? null,
    value_tier: (raw.value_tier as string) ?? null,
    ai_recommendation: (raw.ai_recommendation as string) ?? null,
    recommendation_strength: (raw.recommendation_strength as string) ?? null,
    ai_updated_at: (raw.ai_updated_at as string) ?? null,
    recommendation_color: (raw.recommendation_color as string) ?? null,
    consistency_tier: (raw.consistency_tier as string) ?? null,
    total_count: null,
    games_played: raw.games_played != null ? Number(raw.games_played) : null,
    why: (raw.why as string) ?? null,
    long: (raw.long as string) ?? null,
    start_sit_decision: (raw.start_sit_decision as string) ?? null,
    edge_score: raw.edge_score != null ? Number(raw.edge_score) : null,
    edge_tier: (raw.edge_tier as string) ?? null,
    market_watch_category: (raw.market_watch_category as string) ?? null,
    upside_pct: raw.upside_pct != null ? Number(raw.upside_pct) : null,
    ai_summary: (raw.ai_summary as string) ?? null,
    status: (raw.status as string) ?? null,
    manual_status: (raw.manual_status as string) ?? null,
    is_available: raw.is_available != null ? Boolean(raw.is_available) : null,
    bye_round: raw.bye_round != null ? Number(raw.bye_round) : null,
    is_bye: raw.is_bye != null ? Boolean(raw.is_bye) : null,
    bye_next_round: raw.bye_next_round != null ? Boolean(raw.bye_next_round) : null,
  };
}

interface HeroStats {
  roundLabel: string;
  updatedAt: string | null;
  topCaptainProj: number | null;
  bestValueScore: number | null;
  trapCount: number;
}

function computeHeroStats(rows: RankingRow[], roundLabel: string, updatedAt: string | null): HeroStats {
  const captainRows = rows
    .filter((r) => r.captain_rating === "Elite Captain" || r.captain_rating === "Strong Captain")
    .sort((a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0));
  const topCaptainProj = captainRows[0]?.projection_final ?? null;
  const bestValueScore = rows.reduce<number | null>((best, r) => {
    const v = r.value_score ?? 0;
    return best == null || v > best ? v : best;
  }, null);
  const trapCount = rows.filter((r) => (r.value_score ?? 0) < -6).length;
  return { roundLabel, updatedAt, topCaptainProj, bestValueScore, trapCount };
}

interface PlayerCardProps {
  row: RankingRow;
  rank: number;
  badge?: React.ReactNode;
  showValueScore?: boolean;
  showBreakeven?: boolean;
  showCaptainBadge?: boolean;
  isFree: boolean;
  onClick: () => void;
}

function PlayerCard({ row, rank, badge, showValueScore, showBreakeven, showCaptainBadge, isFree, onClick }: PlayerCardProps) {
  const neekoB = getNeekoRatingBadge(row.neeko_rating_scaled ?? row.neeko_rating);
  const recColor = resolveRecommendationColor(row.recommendation_color, row.ai_recommendation);
  const confColor = getConfidenceColor(row.projection_confidence);

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] rounded-xl px-4 py-3 transition-all duration-150 group"
    >
      <div className="flex items-center gap-3">
        <span className="text-white/25 text-xs w-5 text-right shrink-0">{rank}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-white truncate">{row.player_name}</span>
            {showCaptainBadge && (row.captain_rating === "Elite Captain" || row.captain_rating === "Strong Captain") && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-400/15 text-yellow-300 border border-yellow-400/30 shrink-0">
                Captain Pick
              </span>
            )}
            {badge}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-white/40">
            <span>{normalisePosition(row.position) ?? "—"}</span>
            <span className="text-white/15">·</span>
            <span>{row.team}</span>
            {row.price && (
              <>
                <span className="text-white/15">·</span>
                <span>{fmtPrice(row.price)}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {showValueScore && (
            <div className="text-right hidden sm:block">
              <div className={`text-xs font-mono ${getValueScoreColor(row.value_score)}`}>
                {fmtValueScore(row.value_score)}
              </div>
              <div className="text-[10px] text-white/30">value</div>
            </div>
          )}
          {showBreakeven && isFree && (
            <div className="text-right hidden sm:block">
              <div className="text-xs font-mono text-white/60">{fmt(row.breakeven, 0)}</div>
              <div className="text-[10px] text-white/30">BE</div>
            </div>
          )}
          <div className="text-right">
            <div className="text-sm font-semibold text-white">{fmt(row.projection_final, 0)}</div>
            <div className="text-[10px] text-white/30">proj</div>
          </div>
          <div className="text-right hidden sm:block">
            <div className={`text-xs ${confColor}`}>{fmt(row.projection_confidence, 0)}%</div>
            <div className="text-[10px] text-white/30">conf</div>
          </div>
          <div className={`text-[10px] px-1.5 py-0.5 rounded border ${neekoB.bg} ${neekoB.border} ${neekoB.text} hidden md:block`}>
            {neekoB.label}
          </div>
          {row.ai_recommendation && (
            <div
              className="text-[10px] px-1.5 py-0.5 rounded border hidden lg:block"
              style={{ color: recColor, borderColor: `${recColor}44`, backgroundColor: `${recColor}18` }}
            >
              {row.ai_recommendation}
            </div>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 transition-colors" />
        </div>
      </div>

      {row.why && isFree && (
        <p className="mt-2 text-[11px] text-white/45 leading-relaxed pl-8 line-clamp-2">{row.why}</p>
      )}
    </button>
  );
}

function LockedPlayerCard({ rank }: { rank: number }) {
  return (
    <div className="w-full bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-3 flex items-center gap-3">
      <span className="text-white/15 text-xs w-5 text-right shrink-0">{rank}</span>
      <div className="flex-1 flex items-center gap-2">
        <Lock className="w-3 h-3 text-white/20 shrink-0" />
        <div className="h-2.5 w-32 rounded bg-white/[0.06]" />
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="h-2.5 w-10 rounded bg-white/[0.06]" />
        <div className="h-2.5 w-8 rounded bg-white/[0.06]" />
      </div>
    </div>
  );
}

function SectionCTA({ label, to, onClick }: { label: string; to?: string; onClick?: () => void }) {
  if (to) {
    return (
      <Link
        to={to}
        className="mt-3 flex items-center justify-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors py-2"
      >
        {label}
        <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    );
  }
  return (
    <button
      onClick={onClick}
      className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors py-2"
    >
      <Lock className="w-3 h-3" />
      {label}
    </button>
  );
}

export default function AFLCurrentRoundPage() {
  const { isPremium } = useAuth();
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [roundLabel, setRoundLabel] = useState("Current Round");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<{ row: RankingRow; rank: number; tier: RowTier; isUnlocked: boolean } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [aiSummaryExpanded, setAiSummaryExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (isPremium) {
        const { data, error } = await supabase
          .from("v_rankings_master")
          .select(COLUMNS)
          .order("neeko_rating_scaled", { ascending: false, nullsFirst: false })
          .limit(200);
        if (!error && data) {
          setRows((data as Record<string, unknown>[]).map(normalizeRow));
        }
      } else {
        const { data: authData } = await supabase.auth.getUser();
        const { data, error } = await supabase.rpc("get_rankings_safe", {
          p_user_id: authData?.user?.id ?? null,
          p_is_bot: false,
          p_limit: 200,
        });
        if (!error && data) {
          setRows((data as Record<string, unknown>[]).map(normalizeRow));
        }
      }

      try {
        const { data: metaData } = await supabase.rpc("get_rankings_updated_at");
        if (metaData && Array.isArray(metaData) && metaData[0]) {
          setRoundLabel(metaData[0].round_label ?? "Current Round");
          setUpdatedAt(metaData[0].updated_at ?? null);
        }
      } catch { /* ignore meta error */ }
    } finally {
      setLoading(false);
    }
  }, [isPremium]);

  useEffect(() => {
    fetchData();
    track("current_round_page_view");
  }, [fetchData]);

  const heroStats = useMemo(() => computeHeroStats(rows, roundLabel, updatedAt), [rows, roundLabel, updatedAt]);

  const topPicks = useMemo(
    () => [...rows].sort((a, b) => (b.neeko_rating_scaled ?? b.neeko_rating ?? 0) - (a.neeko_rating_scaled ?? a.neeko_rating ?? 0)).slice(0, 10),
    [rows]
  );

  const captainPicks = useMemo(
    () =>
      [...rows]
        .filter((r) => r.captain_rating === "Elite Captain" || r.captain_rating === "Strong Captain" || r.captain_rating === "Captain Option")
        .sort((a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0))
        .slice(0, 5),
    [rows]
  );

  const valuePlays = useMemo(
    () =>
      [...rows]
        .filter((r) => r.value_score != null && r.price != null && r.price > 0)
        .sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0))
        .slice(0, 8),
    [rows]
  );

  const trapAlerts = useMemo(
    () =>
      [...rows]
        .filter((r) => r.value_score != null && r.price != null && r.price > 0)
        .sort((a, b) => (a.value_score ?? 0) - (b.value_score ?? 0))
        .slice(0, 8),
    [rows]
  );

  const roundSummaryText = useMemo(() => {
    const summaries = rows.map((r) => r.ai_summary).filter(Boolean);
    if (summaries.length === 0) return null;
    const captainName = captainPicks[0]?.player_name ?? null;
    const topValueName = valuePlays[0]?.player_name ?? null;
    const trapName = trapAlerts[0]?.player_name ?? null;
    const parts: string[] = [];
    if (captainName) parts.push(`Top captain option this round is ${captainName}.`);
    if (topValueName) parts.push(`Best value play: ${topValueName} (score ${fmtValueScore(valuePlays[0]?.value_score)}).`);
    if (trapName) parts.push(`Trap alert: ${trapName} — value score ${fmtValueScore(trapAlerts[0]?.value_score)}, consider avoiding.`);
    parts.push(`${rows.length} players analysed this round.`);
    return parts.join(" ");
  }, [rows, captainPicks, valuePlays, trapAlerts]);

  function openRow(row: RankingRow, rank: number, isFreeVisible: boolean) {
    const tier: RowTier = isPremium ? "premium" : (isFreeVisible ? "full" : "locked");
    const isUnlocked = isPremium || isFreeVisible;
    if (!isUnlocked) {
      setShowUpgradeModal(true);
      return;
    }
    setSelectedRow({ row, rank, tier, isUnlocked });
    track("current_round_player_click", { player_name: row.player_name, player_id: row.player_id });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-white/40 text-sm animate-pulse">Loading current round data...</div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>AFL Fantasy Current Round Picks | Neeko Sports</title>
        <meta name="description" content="Top AFL Fantasy picks this round, including captain options, value plays, and trap alerts powered by AI." />
        <link rel="canonical" href="https://neekosports.com/sports/afl/current-round" />
        <meta property="og:title" content="AFL Fantasy Current Round Picks | Neeko Sports" />
        <meta property="og:description" content="Top AFL Fantasy picks this round, including captain options, value plays, and trap alerts powered by AI." />
      </Helmet>

      <div className="min-h-screen bg-[#0a0a0f] text-white">
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">

          {/* ── HERO ─────────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] uppercase tracking-widest text-white/30 font-medium">AFL Fantasy</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
              {heroStats.roundLabel}
            </h1>
            {heroStats.updatedAt && (
              <p className="text-[11px] text-white/30">
                Updated {fmtUpdatedAt(heroStats.updatedAt)}
              </p>
            )}

            <div className="grid grid-cols-3 gap-3 mt-5">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Crown className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-[10px] uppercase tracking-wider text-white/40">Top Captain Proj</span>
                </div>
                <div className="text-2xl font-bold text-white">
                  {heroStats.topCaptainProj != null ? fmt(heroStats.topCaptainProj, 0) : "—"}
                </div>
                <div className="text-[10px] text-white/30 mt-0.5">pts projected</div>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-[10px] uppercase tracking-wider text-white/40">Best Value</span>
                </div>
                <div className="text-2xl font-bold text-green-400">
                  {heroStats.bestValueScore != null ? fmtValueScore(heroStats.bestValueScore) : "—"}
                </div>
                <div className="text-[10px] text-white/30 mt-0.5">value score</div>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-[10px] uppercase tracking-wider text-white/40">Trap Alerts</span>
                </div>
                <div className="text-2xl font-bold text-red-400">{heroStats.trapCount}</div>
                <div className="text-[10px] text-white/30 mt-0.5">players to avoid</div>
              </div>
            </div>
          </div>

          {/* ── TOP PICKS ────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Top Picks This Round</h2>
                <p className="text-[11px] text-white/35 mt-0.5">Ranked by Neeko Rating — projection, matchup, volatility and AI verdict combined</p>
              </div>
            </div>
            <div className="space-y-2">
              {topPicks.map((row, idx) => {
                const isFree = isPremium || idx < FREE_ROWS;
                if (!isFree) {
                  return <LockedPlayerCard key={row.player_id ?? idx} rank={idx + 1} />;
                }
                return (
                  <PlayerCard
                    key={row.player_id ?? idx}
                    row={row}
                    rank={idx + 1}
                    showCaptainBadge
                    isFree={isFree}
                    onClick={() => openRow(row, idx + 1, isFree)}
                  />
                );
              })}
            </div>
            {!isPremium ? (
              <SectionCTA label="Unlock full rankings — 600+ players" onClick={() => setShowUpgradeModal(true)} />
            ) : (
              <SectionCTA label="View full rankings" to="/sports/afl/rankings" />
            )}
          </section>

          {/* ── CAPTAIN PICKS ────────────────────────────────────────── */}
          <section>
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-yellow-400" />
                <h2 className="text-lg font-semibold text-white">Captain Picks</h2>
              </div>
              <p className="text-[11px] text-white/35 mt-1">Top projected scorers with captain eligibility — sorted by projection</p>
            </div>
            <div className="space-y-2">
              {captainPicks.map((row, idx) => {
                const isFree = isPremium || idx < FREE_ROWS;
                return (
                  <PlayerCard
                    key={row.player_id ?? idx}
                    row={row}
                    rank={idx + 1}
                    showCaptainBadge
                    isFree={isFree}
                    onClick={() => openRow(row, idx + 1, isFree)}
                    badge={
                      row.ceiling_estimate != null ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/50 shrink-0">
                          Ceil {fmt(row.ceiling_estimate, 0)}
                        </span>
                      ) : undefined
                    }
                  />
                );
              })}
            </div>
            <SectionCTA label="View full rankings" to="/sports/afl/rankings" />
          </section>

          {/* ── VALUE PLAYS ──────────────────────────────────────────── */}
          <section>
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <h2 className="text-lg font-semibold text-white">Value Plays</h2>
              </div>
              <p className="text-[11px] text-white/35 mt-1">Underpriced players delivering strong projected output — sorted by Value Score</p>
            </div>
            <div className="space-y-2">
              {valuePlays.map((row, idx) => {
                const isFree = isPremium || idx < FREE_ROWS;
                if (!isFree) {
                  return <LockedPlayerCard key={row.player_id ?? idx} rank={idx + 1} />;
                }
                return (
                  <PlayerCard
                    key={row.player_id ?? idx}
                    row={row}
                    rank={idx + 1}
                    showValueScore
                    isFree={isFree}
                    onClick={() => openRow(row, idx + 1, isFree)}
                  />
                );
              })}
            </div>
            {!isPremium ? (
              <SectionCTA label="Unlock full value rankings" onClick={() => setShowUpgradeModal(true)} />
            ) : (
              <SectionCTA label="View Market Watch" to="/sports/afl/market-watch" />
            )}
          </section>

          {/* ── TRAP ALERTS ──────────────────────────────────────────── */}
          <section>
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h2 className="text-lg font-semibold text-white">Trap Alerts</h2>
              </div>
              <p className="text-[11px] text-white/35 mt-1">Overpriced or underperforming players to avoid this round — lowest value scores</p>
            </div>
            <div className="space-y-2">
              {trapAlerts.map((row, idx) => {
                const isFree = isPremium || idx < FREE_ROWS;
                if (!isFree) {
                  return <LockedPlayerCard key={row.player_id ?? idx} rank={idx + 1} />;
                }
                const trapLabel = (row.value_score ?? 0) < -6 ? "Avoid" : "Trap";
                return (
                  <PlayerCard
                    key={row.player_id ?? idx}
                    row={row}
                    rank={idx + 1}
                    showBreakeven
                    isFree={isFree}
                    onClick={() => openRow(row, idx + 1, isFree)}
                    badge={
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 shrink-0">
                        {trapLabel}
                      </span>
                    }
                  />
                );
              })}
            </div>
            {!isPremium ? (
              <SectionCTA label="See full trap analysis" onClick={() => setShowUpgradeModal(true)} />
            ) : (
              <SectionCTA label="View Market Watch" to="/sports/afl/market-watch" />
            )}
          </section>

          {/* ── AI ROUND SUMMARY ─────────────────────────────────────── */}
          <section className="pb-8">
            <div className="mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <h2 className="text-lg font-semibold text-white">AI Round Summary</h2>
              {!isPremium && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-400/10 border border-yellow-400/30 text-yellow-400">
                  Preview
                </span>
              )}
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
              {roundSummaryText ? (
                <>
                  <p className="text-sm text-white/70 leading-relaxed">
                    {isPremium || aiSummaryExpanded
                      ? roundSummaryText
                      : `${roundSummaryText.slice(0, 300)}${roundSummaryText.length > 300 ? "..." : ""}`}
                  </p>
                  {!isPremium && roundSummaryText.length > 300 && (
                    <button
                      onClick={() => {
                        if (!isPremium) {
                          setShowUpgradeModal(true);
                        } else {
                          setAiSummaryExpanded((v) => !v);
                        }
                      }}
                      className="mt-3 flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 transition-colors"
                    >
                      {aiSummaryExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {isPremium ? (aiSummaryExpanded ? "Show less" : "Show full summary") : "Unlock full AI analysis"}
                    </button>
                  )}
                </>
              ) : (
                <p className="text-sm text-white/35 italic">AI round summary will appear here once the round data is processed.</p>
              )}
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link
                to="/sports/afl/rankings"
                className="flex items-center justify-between bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] rounded-xl px-4 py-3 transition-all group"
              >
                <div>
                  <div className="text-sm font-medium text-white">Full Rankings</div>
                  <div className="text-[11px] text-white/35 mt-0.5">600+ players ranked by Neeko Rating</div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/25 group-hover:text-white/60 transition-colors" />
              </Link>
              <Link
                to="/sports/afl/market-watch"
                className="flex items-center justify-between bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] rounded-xl px-4 py-3 transition-all group"
              >
                <div>
                  <div className="text-sm font-medium text-white">Market Watch</div>
                  <div className="text-[11px] text-white/35 mt-0.5">Price movements, buy targets and trade alerts</div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/25 group-hover:text-white/60 transition-colors" />
              </Link>
            </div>
          </section>
        </div>
      </div>

      {selectedRow && (
        <PlayerDetailModal
          row={selectedRow.row}
          rank={selectedRow.rank}
          isPremium={isPremium}
          isUnlocked={selectedRow.isUnlocked}
          tier={selectedRow.tier}
          isFreeTop5={!isPremium && selectedRow.tier === "full"}
          onClose={() => setSelectedRow(null)}
        />
      )}

      {showUpgradeModal && (
        <UpgradeModal onClose={() => setShowUpgradeModal(false)} />
      )}
    </>
  );
}
