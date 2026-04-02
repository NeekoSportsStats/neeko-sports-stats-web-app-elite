import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ChevronRight, TrendingUp, TriangleAlert as AlertTriangle, Crown, Zap, Lock, Star, Clock, ChartBar as BarChart2, ArrowRight } from "lucide-react";
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
  resolveRecommendationColor,
  getCaptainStyle,
} from "@/features/afl/rankings/components/helpers";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { PlayerDetailModal, UpgradeModal } from "@/features/afl/rankings/components/RankingsModals";
import type { RowTier } from "@/features/afl/rankings/components/types";

const FREE_ROWS = 5;

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

// ─── PLAYER CARD (UPGRADED) ─────────────────────────────────────────────────

interface PlayerCardProps {
  row: RankingRow;
  rank: number;
  badge?: React.ReactNode;
  metricSlot?: React.ReactNode;
  showValueScore?: boolean;
  showCaptainCeiling?: boolean;
  isFree: boolean;
  onClick: () => void;
}

function PlayerCard({ row, rank, badge, metricSlot, showValueScore, showCaptainCeiling, isFree, onClick }: PlayerCardProps) {
  const neekoB = getNeekoRatingBadge(row.neeko_rating_scaled ?? row.neeko_rating);
  const recColor = resolveRecommendationColor(row.recommendation_color, row.ai_recommendation);
  const confColor = getConfidenceColor(row.projection_confidence);

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.14] rounded-xl px-4 py-4 transition-all duration-150 group hover:-translate-y-[1px] hover:shadow-[0_4px_24px_rgba(255,255,255,0.03)]"
    >
      <div className="flex items-center gap-3">
        <span className="text-white/20 text-xs w-5 text-right shrink-0 font-mono">{rank}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-white truncate">{row.player_name}</span>
            {badge}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-white/35">
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
          {metricSlot}

          {showValueScore && (
            <div className="text-right hidden sm:block">
              <div className={`text-xs font-mono font-bold ${getValueScoreColor(row.value_score)}`}>
                {fmtValueScore(row.value_score)}
              </div>
              <div className="text-[10px] text-white/25">value</div>
            </div>
          )}

          {showCaptainCeiling && row.ceiling_estimate != null && (
            <div className="text-right hidden sm:block">
              <div className="text-xs font-mono text-yellow-300 font-bold">{fmt(row.ceiling_estimate, 0)}</div>
              <div className="text-[10px] text-white/25">ceiling</div>
            </div>
          )}

          <div className="text-right">
            <div className="text-sm font-bold text-white">{fmt(row.projection_final, 0)}</div>
            <div className="text-[10px] text-white/25">proj</div>
          </div>

          <div className="text-right hidden sm:block">
            <div className={`text-xs font-mono ${confColor}`}>{fmt(row.projection_confidence, 0)}%</div>
            <div className="text-[10px] text-white/25">conf</div>
          </div>

          <div className={`text-[10px] px-1.5 py-0.5 rounded border ${neekoB.bg} ${neekoB.border} ${neekoB.text} hidden md:block`}>
            {neekoB.label}
          </div>

          {row.ai_recommendation && (
            <div
              className="text-[10px] px-1.5 py-0.5 rounded border hidden lg:block"
              style={{ color: recColor, borderColor: `${recColor}40`, backgroundColor: `${recColor}15` }}
            >
              {row.ai_recommendation}
            </div>
          )}

          <ChevronRight className="w-3.5 h-3.5 text-white/15 group-hover:text-white/45 transition-colors" />
        </div>
      </div>

      {row.why && isFree && (
        <p className="mt-2.5 text-[11px] text-white/40 leading-relaxed pl-8 line-clamp-2">{row.why}</p>
      )}
    </button>
  );
}

function LockedPlayerCard({ rank }: { rank: number }) {
  return (
    <div className="w-full bg-white/[0.015] border border-white/[0.04] rounded-xl px-4 py-4 flex items-center gap-3">
      <span className="text-white/10 text-xs w-5 text-right shrink-0">{rank}</span>
      <div className="flex-1 flex items-center gap-2">
        <Lock className="w-3 h-3 text-white/15 shrink-0" />
        <div className="h-2 w-28 rounded bg-white/[0.05]" />
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="h-2 w-10 rounded bg-white/[0.05]" />
        <div className="h-2 w-8 rounded bg-white/[0.05]" />
      </div>
    </div>
  );
}

function SectionCTA({ label, to, onClick }: { label: string; to?: string; onClick?: () => void }) {
  if (to) {
    return (
      <Link
        to={to}
        className="mt-4 flex items-center justify-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors py-2"
      >
        {label}
        <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    );
  }
  return (
    <button
      onClick={onClick}
      className="mt-4 w-full flex items-center justify-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors py-2"
    >
      <Lock className="w-3 h-3" />
      {label}
    </button>
  );
}

function SectionHeader({
  icon,
  iconClass,
  title,
  description,
  badge,
}: {
  icon: React.ReactNode;
  iconClass?: string;
  title: string;
  description: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className={iconClass ?? "text-white/60"}>{icon}</span>
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {badge}
      </div>
      <p className="text-[12px] text-white/40 leading-relaxed">{description}</p>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function AFLCurrentRoundPage() {
  const { isPremium } = useAuth();
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [roundLabel, setRoundLabel] = useState("Current Round");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<{ row: RankingRow; rank: number; tier: RowTier; isUnlocked: boolean } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

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
      } catch { /* ignore */ }
    } finally {
      setLoading(false);
    }
  }, [isPremium]);

  useEffect(() => {
    fetchData();
    track("current_round_page_view");
  }, [fetchData]);

  // ── DERIVED LISTS ────────────────────────────────────────────────────────
  const topPicks = useMemo(
    () =>
      [...rows]
        .sort((a, b) => (b.neeko_rating_scaled ?? b.neeko_rating ?? 0) - (a.neeko_rating_scaled ?? a.neeko_rating ?? 0))
        .slice(0, 10),
    [rows]
  );

  const captainPicks = useMemo(
    () =>
      [...rows]
        .filter(
          (r) =>
            r.captain_rating === "Elite Captain" ||
            r.captain_rating === "Strong Captain" ||
            r.captain_rating === "Captain Option"
        )
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

  // ── HERO STATS ────────────────────────────────────────────────────────────
  const topCaptainProj = captainPicks[0]?.projection_final ?? null;
  const bestValueScore = valuePlays[0]?.value_score ?? null;
  const trapCount = rows.filter((r) => (r.value_score ?? 0) < -6).length;

  // ── AI SUMMARY ────────────────────────────────────────────────────────────
  const aiSummary = useMemo(() => {
    const captainName = captainPicks[0]?.player_name ?? null;
    const captainProj = captainPicks[0]?.projection_final ?? null;
    const captainCeiling = captainPicks[0]?.ceiling_estimate ?? null;
    const topValueName = valuePlays[0]?.player_name ?? null;
    const topValueScore = valuePlays[0]?.value_score ?? null;
    const trapName = trapAlerts[0]?.player_name ?? null;
    const trapVS = trapAlerts[0]?.value_score ?? null;
    const topPickName = topPicks[0]?.player_name ?? null;

    const lines: { label: string; text: string; color: string }[] = [];
    if (topPickName) {
      lines.push({ label: "Top Pick", text: `${topPickName} leads this round on Neeko Rating — strong projection, favourable matchup, and AI-backed confidence.`, color: "text-white" });
    }
    if (captainName && captainProj != null) {
      const ceilText = captainCeiling != null ? ` with a ceiling of ${fmt(captainCeiling, 0)} pts` : "";
      lines.push({ label: "Captain Pick", text: `${captainName} is the standout captain option this week — projected ${fmt(captainProj, 0)} pts${ceilText}.`, color: "text-yellow-300" });
    }
    if (topValueName && topValueScore != null) {
      lines.push({ label: "Value Play", text: `${topValueName} is the best value this round (score: ${fmtValueScore(topValueScore)}) — priced below expected output.`, color: "text-green-400" });
    }
    if (trapName && trapVS != null) {
      lines.push({ label: "Trap Alert", text: `Avoid ${trapName} this round — value score ${fmtValueScore(trapVS)} signals the price doesn't match projected output.`, color: "text-red-400" });
    }
    return lines;
  }, [topPicks, captainPicks, valuePlays, trapAlerts]);

  // ── SEO TITLE ─────────────────────────────────────────────────────────────
  const pageTitle = `AFL Fantasy ${roundLabel} Tips, Captain Picks & Value Players | Neeko Sports`;
  const roundNum = roundLabel.replace(/[^0-9]/g, "");

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
        <div className="text-white/30 text-sm animate-pulse">Loading round data...</div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta
          name="description"
          content="Discover the best AFL Fantasy players for this round including captain picks, value plays and trap alerts powered by AI projections."
        />
        <link rel="canonical" href="https://neekostats.com.au/sports/afl/current-round" />
        <meta name="robots" content="index, follow" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content="AI-powered AFL Fantasy picks for this round — captain options, value plays, trap alerts and full projections." />
        <meta property="og:url" content="https://neekostats.com.au/sports/afl/current-round" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Neeko Sports" />
      </Helmet>

      <div className="min-h-screen bg-[#0a0a0f] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-14">

          {/* ── HERO ──────────────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <span className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">AFL Fantasy</span>
              <span className="h-px flex-1 bg-white/[0.06]" />
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#F5C84C] font-semibold px-2.5 py-1 bg-[#F5C84C]/10 border border-[#F5C84C]/25 rounded-full">
                <Clock className="w-3 h-3" />
                Upcoming Round Insights
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 leading-tight">
              AFL Fantasy {roundLabel} Picks & Predictions
            </h1>

            <p className="text-base text-white/55 mb-2 max-w-2xl leading-relaxed">
              AI-powered projections, captain picks, value plays and trap alerts for this week's AFL Fantasy round.
            </p>

            {updatedAt && (
              <p className="text-[11px] text-white/30 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Updated {fmtUpdatedAt(updatedAt)} using latest player data and projections
              </p>
            )}

            {/* Stats strip */}
            <div className="grid grid-cols-3 gap-3 mt-8">
              <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Crown className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-[10px] uppercase tracking-wider text-white/35 font-medium">Top Captain</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-white">
                  {topCaptainProj != null ? fmt(topCaptainProj, 0) : "—"}
                </div>
                <div className="text-[10px] text-white/25 mt-0.5">pts projected</div>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-[10px] uppercase tracking-wider text-white/35 font-medium">Best Value</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-green-400">
                  {bestValueScore != null ? fmtValueScore(bestValueScore) : "—"}
                </div>
                <div className="text-[10px] text-white/25 mt-0.5">value score</div>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-[10px] uppercase tracking-wider text-white/35 font-medium">Traps</span>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-red-400">{trapCount}</div>
                <div className="text-[10px] text-white/25 mt-0.5">players to avoid</div>
              </div>
            </div>
          </div>

          {/* ── SEO CONTENT BLOCK ─────────────────────────────────────────── */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-white">
              What to Expect {roundNum ? `in Round ${roundNum}` : "This Round"}
            </h2>
            <div className="space-y-3 text-sm text-white/55 leading-relaxed">
              <p>
                This page highlights the best AFL Fantasy players for the upcoming round, using Neeko's AI-powered projection model. Players are ranked based on projected score, price value, matchup difficulty, and role stability — giving you a complete picture before you lock in your team.
              </p>
              <p>
                The <strong className="text-white/75">Value Score</strong> measures how much a player is under or overpriced relative to their expected output. A positive value score means you're getting more points than you're paying for. A negative score signals a player priced beyond their likely return — the classic trap pick.
              </p>
              <p>
                Use the <strong className="text-white/75">Top Picks</strong> section for your must-starts, <strong className="text-white/75">Captain Picks</strong> for your double-scorer selection, <strong className="text-white/75">Value Plays</strong> for trade targets, and <strong className="text-white/75">Trap Alerts</strong> to identify the players to avoid bringing in this week.
              </p>
            </div>
          </div>

          {/* ── TOP PICKS ─────────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-3 mb-2 pb-4 border-b border-white/[0.06]">
              <Star className="w-5 h-5 text-yellow-400 shrink-0" fill="currentColor" />
              <div className="flex-1">
                <h2 className="text-xl font-bold text-white">Top Picks This Round</h2>
                <p className="text-[12px] text-white/40 mt-0.5">
                  Highest-rated players this round combining projection, matchup difficulty and AI consistency verdict
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {topPicks.map((row, idx) => {
                const isFree = isPremium || idx < FREE_ROWS;
                if (!isFree) return <LockedPlayerCard key={row.player_id ?? idx} rank={idx + 1} />;
                return (
                  <PlayerCard
                    key={row.player_id ?? idx}
                    row={row}
                    rank={idx + 1}
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

          {/* ── CAPTAIN PICKS ─────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-3 mb-2 pb-4 border-b border-white/[0.06]">
              <Crown className="w-5 h-5 text-yellow-400 shrink-0" />
              <div className="flex-1">
                <h2 className="text-xl font-bold text-white">Captain Picks</h2>
                <p className="text-[12px] text-white/40 mt-0.5">
                  Best captain options based on highest projected ceiling and scoring consistency — sorted by projection
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {captainPicks.map((row, idx) => {
                const captStyle = getCaptainStyle(row.captain_rating);
                return (
                  <PlayerCard
                    key={row.player_id ?? idx}
                    row={row}
                    rank={idx + 1}
                    showCaptainCeiling
                    isFree={isPremium || idx < FREE_ROWS}
                    onClick={() => openRow(row, idx + 1, true)}
                    badge={
                      row.captain_rating ? (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded border shrink-0"
                          style={{ color: captStyle.color, borderColor: `${captStyle.color}40`, backgroundColor: `${captStyle.color}15` }}
                        >
                          {row.captain_rating}
                        </span>
                      ) : undefined
                    }
                  />
                );
              })}
            </div>
            <SectionCTA label="View full rankings" to="/sports/afl/rankings" />
          </section>

          {/* ── VALUE PLAYS ───────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-3 mb-2 pb-4 border-b border-white/[0.06]">
              <TrendingUp className="w-5 h-5 text-green-400 shrink-0" />
              <div className="flex-1">
                <h2 className="text-xl font-bold text-white">Value Plays</h2>
                <p className="text-[12px] text-white/40 mt-0.5">
                  Undervalued players expected to outperform their price — best trade targets this round
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {valuePlays.map((row, idx) => {
                const isFree = isPremium || idx < FREE_ROWS;
                if (!isFree) return <LockedPlayerCard key={row.player_id ?? idx} rank={idx + 1} />;
                return (
                  <PlayerCard
                    key={row.player_id ?? idx}
                    row={row}
                    rank={idx + 1}
                    showValueScore
                    isFree={isFree}
                    onClick={() => openRow(row, idx + 1, isFree)}
                    badge={
                      (row.value_score ?? 0) >= 8 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/25 text-green-400 shrink-0">
                          Target
                        </span>
                      ) : undefined
                    }
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

          {/* ── TRAP ALERTS ───────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-3 mb-2 pb-4 border-b border-white/[0.06]">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <div className="flex-1">
                <h2 className="text-xl font-bold text-white">Trap Alerts</h2>
                <p className="text-[12px] text-white/40 mt-0.5">
                  Overpriced or risky players to avoid this round — negative value score signals price-to-output mismatch
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {trapAlerts.map((row, idx) => {
                const isFree = isPremium || idx < FREE_ROWS;
                if (!isFree) return <LockedPlayerCard key={row.player_id ?? idx} rank={idx + 1} />;
                return (
                  <PlayerCard
                    key={row.player_id ?? idx}
                    row={row}
                    rank={idx + 1}
                    showValueScore
                    isFree={isFree}
                    onClick={() => openRow(row, idx + 1, isFree)}
                    badge={
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/25 text-red-400 shrink-0">
                        {(row.value_score ?? 0) < -6 ? "Avoid" : "Caution"}
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

          {/* ── AI ROUND INSIGHTS ─────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-3 mb-2 pb-4 border-b border-white/[0.06]">
              <Zap className="w-5 h-5 text-[#F5C84C] shrink-0" />
              <div className="flex-1">
                <h2 className="text-xl font-bold text-white">AI Round Insights</h2>
                <p className="text-[12px] text-white/40 mt-0.5">
                  Key callouts for {roundLabel} — generated from player projection data
                </p>
              </div>
              {!isPremium && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F5C84C]/10 border border-[#F5C84C]/25 text-[#F5C84C] shrink-0">
                  Preview
                </span>
              )}
            </div>

            <div className="bg-white/[0.025] border border-white/[0.07] rounded-xl divide-y divide-white/[0.06]">
              {aiSummary.length > 0 ? (
                aiSummary.map((line, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-4">
                    <span className={`text-[10px] font-bold uppercase tracking-wider w-20 shrink-0 mt-0.5 ${line.color}`}>
                      {line.label}
                    </span>
                    <p className="text-sm text-white/65 leading-relaxed flex-1">{line.text}</p>
                  </div>
                ))
              ) : (
                <div className="px-5 py-4">
                  <p className="text-sm text-white/30 italic">AI insights will appear once round data is processed.</p>
                </div>
              )}
            </div>

            {!isPremium && (
              <div className="mt-4 px-5 py-3 bg-white/[0.015] border border-white/[0.06] rounded-xl flex items-center justify-between">
                <p className="text-[12px] text-white/40">
                  Full AI analysis available on individual player pages with premium access
                </p>
                <Lock className="w-3.5 h-3.5 text-white/20 shrink-0" />
              </div>
            )}
          </section>

          {/* ── NAVIGATION LINKS ──────────────────────────────────────────── */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              to="/sports/afl/rankings"
              className="flex items-center justify-between bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-white/[0.14] rounded-xl px-4 py-4 transition-all group"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <BarChart2 className="w-3.5 h-3.5 text-white/40" />
                  <div className="text-sm font-semibold text-white">Full Rankings</div>
                </div>
                <div className="text-[11px] text-white/35">600+ players ranked by Neeko Rating</div>
              </div>
              <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" />
            </Link>
            <Link
              to="/sports/afl/market-watch"
              className="flex items-center justify-between bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-white/[0.14] rounded-xl px-4 py-4 transition-all group"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-white/40" />
                  <div className="text-sm font-semibold text-white">Market Watch</div>
                </div>
                <div className="text-[11px] text-white/35">Price movements, buy targets and trade alerts</div>
              </div>
              <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" />
            </Link>
          </section>

          {/* ── BOTTOM CTA ────────────────────────────────────────────────── */}
          {!isPremium && (
            <section className="pb-6">
              <div className="bg-white/[0.025] border border-white/[0.08] rounded-2xl px-6 py-8 text-center space-y-4">
                <div className="inline-block px-3 py-1 bg-[#F5C84C]/15 border border-[#F5C84C]/30 rounded-full text-[10px] font-bold text-[#F5C84C] uppercase tracking-wider mb-2">
                  Premium
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white">
                  Get full access to rankings, advanced stats and AI insights
                </h3>
                <p className="text-sm text-white/50 max-w-md mx-auto">
                  Unlock 600+ player rankings, AI analysis, Market Watch trade signals, captain recommendations and more.
                </p>
                <a
                  href="/neeko-plus"
                  className="inline-flex items-center gap-2 mt-2 px-6 py-3 bg-[#F5C84C] text-black font-bold rounded-lg hover:bg-[#F5C84C]/90 active:scale-[0.98] transition-all"
                >
                  Upgrade to Neeko+
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </section>
          )}

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
