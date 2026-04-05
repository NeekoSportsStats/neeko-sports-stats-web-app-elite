import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  TriangleAlert as AlertTriangle,
  Crown,
  Zap,
  Lock,
  Star,
  Clock,
  ChartBar as BarChart2,
  ArrowRight,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import {
  fmt,
  fmtPrice,
  fmtUpdatedAt,
  normalisePosition,
  getTrendLabel,
  getTrendStyles,
} from "@/features/afl/rankings/components/helpers";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { PlayerDetailModal, UpgradeModal } from "@/features/afl/rankings/components/RankingsModals";
import { PlayerStatusPill } from "@/features/afl/rankings/components/PlayerStatusPill";
import type { RowTier } from "@/features/afl/rankings/components/types";

// ─── LIMITS ──────────────────────────────────────────────────────────────────
const FREE_VISIBLE = 2;
const PREMIUM_VISIBLE = 5;

const COLUMNS =
  "player_id,player_name,team,position," +
  "projection_final,ceiling_estimate,floor_estimate," +
  "matchup_rating,upside_rating,risk_rating,form_score," +
  "projection_confidence,captain_score,captain_rating," +
  "neeko_rating," +
  "price,prev_price,price_change,price_change_pct," +
  "breakeven,value_score,best_value_score,value_tag,value_tier," +
  "recommendation_strength,ai_summary,consistency_tier," +
  "signal_tag," +
  "market_watch_category,upside_pct," +
  "status,manual_status,is_available," +
  "bye_round,is_bye,bye_next_round,games_played," +
  "signal,baseline,edge,season_avg,last_3_avg,value_score," +
  "trend_score,trend_signal,value_signal," +
  "form_delta,form_label";

function normalizeRow(raw: Record<string, unknown>): RankingRow {
  return {
    player_id: (raw.player_id as string) ?? null,
    player_name: (raw.player_name as string) ?? "",
    team: (raw.team as string) ?? "",
    position: normalisePosition(raw.position as string | null),
    projection_final: raw.projection_final != null ? Number(raw.projection_final) : null,
    ceiling_estimate: raw.ceiling_estimate != null ? Number(raw.ceiling_estimate) : null,
    floor_estimate: raw.floor_estimate != null ? Number(raw.floor_estimate) : null,
    consistency_score: null,
    form_rating: raw.form_score != null ? Number(raw.form_score) : null,
    matchup_rating: (raw.matchup_rating as string | number) ?? null,
    upside_rating: raw.upside_rating != null ? Number(raw.upside_rating) : null,
    risk_rating: raw.risk_rating != null ? Number(raw.risk_rating) : null,
    form_score: raw.form_score != null ? Number(raw.form_score) : null,
    projection_confidence: raw.projection_confidence != null ? Number(raw.projection_confidence) : null,
    captain_score: raw.captain_score != null ? Number(raw.captain_score) : null,
    captain_rating: (raw.captain_rating as string) ?? null,
    neeko_rating: raw.neeko_rating != null ? Number(raw.neeko_rating) : null,
    neeko_rating_scaled: null,
    price: raw.price != null ? Number(raw.price) : null,
    prev_price: raw.prev_price != null ? Number(raw.prev_price) : null,
    price_change: raw.price_change != null ? Number(raw.price_change) : null,
    price_change_pct: raw.price_change_pct != null ? Number(raw.price_change_pct) : null,
    breakeven: raw.breakeven != null ? Number(raw.breakeven) : null,
    value_score: raw.value_score != null ? Number(raw.value_score) : null,
    best_value_score: raw.best_value_score != null ? Number(raw.best_value_score) : null,
    value_tag: (raw.value_tag as string) ?? null,
    value_tier: (raw.value_tier as string) ?? null,
    recommendation_strength: (raw.recommendation_strength as string) ?? null,
    ai_updated_at: null,
    recommendation_color: null,
    consistency_tier: (raw.consistency_tier as string) ?? null,
    total_count: null,
    games_played: raw.games_played != null ? Number(raw.games_played) : null,
    why: (raw.ai_summary as string) ?? null,
    long: (raw.ai_summary as string) ?? null,
    market_watch_category: (raw.market_watch_category as string) ?? null,
    upside_pct: raw.upside_pct != null ? Number(raw.upside_pct) : null,
    ai_summary: (raw.ai_summary as string) ?? null,
    status: (raw.status as string) ?? null,
    manual_status: (raw.manual_status as string) ?? null,
    is_available: raw.is_available != null ? Boolean(raw.is_available) : null,
    bye_round: raw.bye_round != null ? Number(raw.bye_round) : null,
    is_bye: raw.is_bye != null ? Boolean(raw.is_bye) : null,
    bye_next_round: raw.bye_next_round != null ? Boolean(raw.bye_next_round) : null,
    signal_tag: (raw.signal_tag as string) ?? null,
    signal:       (raw.signal as string) ?? null,
    baseline:     raw.baseline != null ? Number(raw.baseline) : null,
    edge:         raw.edge != null ? Number(raw.edge) : null,
    season_avg:   raw.season_avg != null ? Number(raw.season_avg) : null,
    last_3_avg:   raw.last_3_avg != null ? Number(raw.last_3_avg) : null,
    value_score:  raw.value_score != null ? Number(raw.value_score) : null,
    trend_score:  raw.trend_score != null ? Number(raw.trend_score) : null,
    trend_signal: (raw.trend_signal as string) ?? null,
    value_signal: (raw.value_signal as string) ?? null,
    form_delta:   raw.form_delta != null ? Number(raw.form_delta) : null,
    form_label:   (raw.form_label as string) ?? null,
  };
}

// ─── COMPACT PLAYER ROW ───────────────────────────────────────────────────────

interface PlayerRowProps {
  row: RankingRow;
  rank: number;
  metric?: React.ReactNode;
  isPremiumUser: boolean;
  onClick: () => void;
}

function PlayerRow({ row, rank, metric, isPremiumUser, onClick }: PlayerRowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/[0.05] transition-all duration-150 group"
    >
      <span className="text-[11px] text-white/20 w-4 text-right shrink-0 font-mono tabular-nums">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-white truncate leading-tight">{row.player_name}</span>
          <PlayerStatusPill row={row} showUpcomingBye />
          {row.trend_signal != null && isPremiumUser && (
            <span className={`text-[9px] px-1 py-px rounded border shrink-0 font-medium leading-none ${getTrendStyles(row.trend_signal)}`}>
              {getTrendLabel(row.trend_signal)}
            </span>
          )}
        </div>
        <div className="text-[10px] text-white/30 mt-px">
          {normalisePosition(row.position) ?? "—"} · {row.team}
          {row.price ? ` · ${fmtPrice(row.price)}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {metric}
        <div className="text-right">
          <div className="text-sm font-bold text-white tabular-nums">{fmt(row.projection_final, 0)}</div>
          <div className="text-[9px] text-white/25">proj</div>
        </div>
        <ChevronRight className="w-3 h-3 text-white/15 group-hover:text-white/40 transition-colors" />
      </div>
    </button>
  );
}

// ─── BLURRED ROW (replaces LockedRow) ─────────────────────────────────────────

function BlurredRow({ row, rank, metric }: { row: RankingRow; rank: number; metric?: React.ReactNode }) {
  return (
    <div
      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg select-none pointer-events-none"
      style={{ filter: "blur(4px)", opacity: 0.45 }}
      aria-hidden="true"
    >
      <span className="text-[11px] text-white/20 w-4 text-right shrink-0 font-mono tabular-nums">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-white truncate leading-tight">{row.player_name}</span>
          <PlayerStatusPill row={row} showUpcomingBye />
        </div>
        <div className="text-[10px] text-white/30 mt-px">
          {normalisePosition(row.position) ?? "—"} · {row.team}
          {row.price ? ` · ${fmtPrice(row.price)}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {metric}
        <div className="text-right">
          <div className="text-sm font-bold text-white tabular-nums">{fmt(row.projection_final, 0)}</div>
          <div className="text-[9px] text-white/25">proj</div>
        </div>
        <ChevronRight className="w-3 h-3 text-white/15" />
      </div>
    </div>
  );
}

// ─── INLINE LOCK STRIP CTA ────────────────────────────────────────────────────

function BlurOverlayCTA({
  hiddenCount,
  accentColor,
  onUpgrade,
  ctaLabel,
  badgeText,
}: {
  hiddenCount: number;
  accentColor: string;
  onUpgrade: () => void;
  ctaLabel?: string;
  badgeText?: string;
}) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <>
      <div
        className="absolute inset-0 rounded-b-xl pointer-events-none"
        style={{
          background: `linear-gradient(to bottom, transparent 0%, #0a0a0acc 55%, #0a0a0af5 100%)`,
        }}
      />
      <div className="absolute bottom-0 left-0 right-0 z-10 px-3 pb-3">
        <button
          onClick={onUpgrade}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200"
          style={{
            background: "rgba(255,255,255,0.025)",
            border: `1px solid ${hovered ? `${accentColor}30` : "rgba(255,255,255,0.06)"}`,
            transform: hovered ? "translateY(-1px)" : "translateY(0)",
            boxShadow: hovered ? `0 4px 16px ${accentColor}10` : "none",
          }}
        >
          <span className="flex items-center gap-1.5 text-[11px] text-white/40">
            <Lock className="w-3 h-3 shrink-0" style={{ color: `${accentColor}70` }} />
            {badgeText ?? `+${hiddenCount} picks hidden`}
          </span>
          <span
            className="flex items-center gap-1 text-[12px] font-semibold transition-all duration-200"
            style={{
              color: accentColor,
              transform: hovered ? "translateX(2px)" : "translateX(0)",
              opacity: hovered ? 0.9 : 0.75,
            }}
          >
            {ctaLabel ?? "Unlock full list →"}
          </span>
        </button>
      </div>
    </>
  );
}

// ─── DECISION CARD ────────────────────────────────────────────────────────────

interface DecisionCardProps {
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  players: RankingRow[];
  freeLimit: number;
  isPremiumUser: boolean;
  onOpenRow: (row: RankingRow, rank: number) => void;
  onUpgrade: () => void;
  hiddenCopy: string;
  lockedCta?: string;
  lockedSubtext?: string;
  blurCtaLabel?: string;
  blurBadgeText?: string;
  footerLink?: { label: string; to: string };
  renderMetric?: (row: RankingRow) => React.ReactNode;
  premiumLocked?: boolean;
}

function DecisionCard({
  title,
  icon,
  accentColor,
  players,
  freeLimit,
  isPremiumUser,
  onOpenRow,
  onUpgrade,
  hiddenCopy,
  lockedCta,
  lockedSubtext,
  blurCtaLabel,
  blurBadgeText,
  footerLink,
  renderMetric,
  premiumLocked = false,
}: DecisionCardProps) {
  const [hovered, setHovered] = useState(false);
  const visible = isPremiumUser ? players.slice(0, PREMIUM_VISIBLE) : players.slice(0, freeLimit);
  const hidden = isPremiumUser ? [] : players.slice(freeLimit, PREMIUM_VISIBLE);
  const totalHidden = isPremiumUser ? 0 : Math.max(0, players.length - freeLimit);

  const borderColor = hovered
    ? `${accentColor}60`
    : `${accentColor}35`;
  const bgTint = `${accentColor}06`;

  if (premiumLocked && !isPremiumUser) {
    return (
      <div
        className="rounded-2xl overflow-hidden flex flex-col transition-all duration-200"
        style={{
          border: `1px solid ${borderColor}`,
          background: `linear-gradient(135deg, ${bgTint} 0%, transparent 60%)`,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: `1px solid ${accentColor}18` }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: accentColor }}
          />
          <span style={{ color: accentColor }}>{icon}</span>
          <h2 className="text-sm font-bold text-white">{title}</h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 text-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${accentColor}20` }}>
            <Lock className="w-4 h-4" style={{ color: accentColor }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/60 mb-1">{title} — Neeko+ Only</p>
            <p className="text-[11px] text-white/30 max-w-[200px] leading-relaxed">
              {lockedSubtext ?? hiddenCopy}
            </p>
          </div>
          <button
            onClick={onUpgrade}
            className="text-[12px] font-bold px-4 py-2 rounded-lg transition-all hover:brightness-110 active:scale-[0.97]"
            style={{ backgroundColor: `${accentColor}22`, color: accentColor, border: `1px solid ${accentColor}50` }}
          >
            {lockedCta ?? "Unlock →"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col transition-all duration-200"
      style={{
        border: `1px solid ${borderColor}`,
        background: `linear-gradient(135deg, ${bgTint} 0%, transparent 60%)`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: `1px solid ${accentColor}18` }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: accentColor }}
        />
        <span style={{ color: accentColor }}>{icon}</span>
        <h2 className="text-sm font-bold text-white flex-1">{title}</h2>
        {!isPremiumUser && totalHidden > 0 && (
          <span className="text-[10px] text-white/25">{freeLimit} of {players.length}</span>
        )}
      </div>

      <div className="flex-1 py-1">
        {visible.map((row, idx) => (
          <PlayerRow
            key={row.player_id ?? idx}
            row={row}
            rank={idx + 1}
            isPremiumUser={isPremiumUser}
            onClick={() => onOpenRow(row, idx + 1)}
            metric={renderMetric ? renderMetric(row) : undefined}
          />
        ))}

        {hidden.length > 0 && (
          <div className="relative pb-12">
            {hidden.map((row, idx) => (
              <BlurredRow
                key={row.player_id ?? idx}
                row={row}
                rank={freeLimit + idx + 1}
                metric={renderMetric ? renderMetric(row) : undefined}
              />
            ))}
            <BlurOverlayCTA
              hiddenCount={totalHidden}
              accentColor={accentColor}
              onUpgrade={onUpgrade}
              ctaLabel={blurCtaLabel}
              badgeText={blurBadgeText}
            />
          </div>
        )}
      </div>

      {footerLink && (
        <div className="px-4 py-2.5" style={{ borderTop: `1px solid ${accentColor}12` }}>
          <Link
            to={footerLink.to}
            className="flex items-center gap-1 text-[11px] transition-colors"
            style={{ color: `${accentColor}60` }}
            onMouseEnter={(e) => (e.currentTarget.style.color = `${accentColor}99`)}
            onMouseLeave={(e) => (e.currentTarget.style.color = `${accentColor}60`)}
          >
            {footerLink.label}
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── COLLAPSIBLE SEO ─────────────────────────────────────────────────────────

function CollapsibleSEO({ roundLabel, roundNum }: { roundLabel: string; roundNum: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/[0.06] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
        aria-expanded={open}
      >
        <span className="text-[12px] text-white/40 font-medium">About these picks — {roundLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-white/25 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        className="border-t border-white/[0.05] overflow-hidden transition-all duration-200"
        style={{ maxHeight: open ? "900px" : "0px", opacity: open ? 1 : 0 }}
      >
        <div className="px-4 pb-5 space-y-5">
          <p className="text-[12px] text-white/40 leading-relaxed pt-3">
            This page surfaces the best AFL Fantasy picks for {roundLabel} — captain options, top selections, safe picks and risk alerts — powered by Neeko's AI projection model and trend engine. Every player is scored on projected output, form trajectory, matchup difficulty, consistency and role stability.
          </p>

          <div className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/30">How Each Section Works</h3>
            <ul className="space-y-3 text-[12px] text-white/35 leading-relaxed">
              <li>
                <strong className="text-white/55">Captain Picks</strong> — The best AFL Fantasy captains for {roundLabel}. Ranked by a composite score combining projected points, consistency rating and matchup advantage. The players here are best for doubling up — high ceiling, proven reliability, and favourable opposition.
              </li>
              <li>
                <strong className="text-white/55">Top Picks</strong> — Must-start players ranked by overall projected output. These are the highest-rated players heading into {roundLabel} based on recent form, role security and Neeko's projection model. Your foundation lineup picks.
              </li>
              <li>
                <strong className="text-white/55">Safe Picks</strong> — Reliable, consistent performers with a stable trend signal. These players are projecting on or above their baseline — dependable selections for building a solid round score without volatility risk.
              </li>
              <li>
                <strong className="text-white/55">Risk Picks</strong> — Players flagged as trending down this round. Their recent form is below baseline expectations — consider monitoring or replacing these players before {roundLabel} locks.
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/30">AFL Fantasy Strategy for {roundLabel}</h3>
            <p className="text-[12px] text-white/35 leading-relaxed">
              Winning AFL Fantasy rounds comes down to three decisions: picking the right captain, identifying players trending upward before the round, and avoiding form risks. Neeko's AI analyses every player's recent performance trend, upcoming matchup difficulty, role consistency and baseline performance to surface the highest-conviction plays each round.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/30">About the Projection Model</h3>
            <p className="text-[12px] text-white/35 leading-relaxed">
              Projections are calculated using weighted recent-game performance, positional matchup data, venue factors and role stability signals. Trend signals are derived by comparing a player's projection against their weighted baseline (season avg, last 5 games, last 3 games). All data updates weekly following each round.
            </p>
          </div>

          {roundNum && (
            <Link
              to={`/sports/afl/round/${roundNum}`}
              className="inline-flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/70 underline underline-offset-2 transition-colors"
            >
              View Full Round {roundNum} Match Breakdown
              <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AI QUICK CALL STRIP ─────────────────────────────────────────────────────

interface AiCallLine {
  label: string;
  text: string;
  color: string;
  bgColor: string;
}

function AIQuickCallStrip({ lines, isPremiumUser, onUpgrade }: { lines: AiCallLine[]; isPremiumUser: boolean; onUpgrade: () => void }) {
  if (lines.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <Zap className="w-4 h-4 text-[#F5C84C]" />
        <h2 className="text-sm font-bold text-white flex-1">AI Round Summary</h2>
        {!isPremiumUser && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#F5C84C]/10 border border-[#F5C84C]/25 text-[#F5C84C]">
            Preview
          </span>
        )}
      </div>

      <div className="divide-y divide-white/[0.05]">
        {lines.map((line, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3">
            <span
              className="text-[9px] font-bold uppercase tracking-wider shrink-0 mt-0.5 w-16 leading-tight"
              style={{ color: line.color }}
            >
              {line.label}
            </span>
            <p className="text-[12px] text-white/55 leading-relaxed flex-1">{line.text}</p>
          </div>
        ))}
      </div>

      {!isPremiumUser && (
        <div className="px-4 py-3 border-t border-white/[0.05] flex items-center justify-between gap-3">
          <p className="text-[11px] text-white/30 flex-1">Full AI reasoning per player available with Neeko+</p>
          <button
            onClick={onUpgrade}
            className="text-[10px] font-bold text-[#F5C84C] hover:text-[#F5C84C]/80 transition-colors flex items-center gap-1"
          >
            Unlock <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function AFLCurrentRoundPage() {
  const { isPremium } = useAuth();
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [roundLabel, setRoundLabel] = useState("Current Round");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<{ row: RankingRow; rank: number; tier: RowTier; isUnlocked: boolean } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      if (isPremium) {
        const { data, error } = await supabase
          .from("v_rankings_master")
          .select(COLUMNS)
          .order("projection_final", { ascending: false, nullsFirst: false })
          .limit(200);
        if (error) {
          console.error("Current Round error (premium):", error);
        } else if (data) {
          setRows((data as Record<string, unknown>[]).map(normalizeRow));
        }
      } else {
        const { data: authData } = await supabase.auth.getUser();
        const { data, error } = await supabase.rpc("get_rankings_safe", {
          p_user_id: authData?.user?.id ?? null,
          p_is_bot: false,
          p_limit: 200,
        });
        if (error) {
          console.error("Current Round error (free):", error);
        } else if (data) {
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
      setRefreshing(false);
    }
  }, [isPremium]);

  useEffect(() => {
    fetchData();
    track("current_round_page_view");
  }, [fetchData]);

  // ── DERIVED LISTS — all from same ranked dataset (canonical) ─────────────────

  const ranked = useMemo(
    () => [...rows].sort((a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0)),
    [rows]
  );

  // 1. Top Picks — top of ranked list
  const topPicks = useMemo(() => ranked.slice(0, 10), [ranked]);

  // 2. Captain Picks — positions 2-6 of ranked list (skip #1 used in Top Picks hero)
  const captainPicks = useMemo(() => {
    const pool = ranked.slice(1, 6);
    const result = pool.slice(0, 5);
    console.log("Captain Picks:", result.length);
    return result;
  }, [ranked]);

  // 3. Safe Picks — trend_signal = STABLE, sorted by projection desc, exclude Top Picks + Captain Picks
  const safePicks = useMemo(() => {
    const usedIds = new Set([...topPicks, ...captainPicks].map((r) => r.player_id));
    return [...ranked]
      .filter((r) => !usedIds.has(r.player_id) && r.trend_signal === "STABLE")
      .slice(0, 10);
  }, [ranked, topPicks, captainPicks]);

  // 4. Risk Picks — trend_signal = DOWN or STRONG_DOWN, sorted by projection desc, exclude Top Picks + Captain Picks
  const riskPicks = useMemo(() => {
    const usedIds = new Set([...topPicks, ...captainPicks].map((r) => r.player_id));
    return [...ranked]
      .filter((r) => !usedIds.has(r.player_id) && (r.trend_signal === "DOWN" || r.trend_signal === "STRONG_DOWN"))
      .slice(0, 8);
  }, [ranked, topPicks, captainPicks]);

  // ── HERO STATS ──────────────────────────────────────────────────────────────
  const topCaptainProj = captainPicks[0]?.projection_final ?? topPicks[0]?.projection_final ?? null;
  const topCaptainName = captainPicks[0]?.player_name ?? topPicks[0]?.player_name ?? null;
  const strongUpCount = ranked.filter((r) => r.trend_signal === "STRONG_UP" || r.trend_signal === "UP").length;
  const riskCount = riskPicks.length;

  // ── AI SUMMARY LINES — unique players across all four categories ────────────
  const aiLines = useMemo((): AiCallLine[] => {
    const lines: AiCallLine[] = [];
    const usedIds = new Set<string | null>();

    const topPick = topPicks[0];
    if (topPick) {
      usedIds.add(topPick.player_id);
      lines.push({
        label: "Top Pick",
        text: `${topPick.player_name} leads this round — projected ${fmt(topPick.projection_final, 0)} pts with strong matchup and consistency.`,
        color: "#ffffff",
        bgColor: "rgba(255,255,255,0.05)",
      });
    }

    const captain = captainPicks.find((r) => !usedIds.has(r.player_id));
    if (captain) {
      usedIds.add(captain.player_id);
      const ceilTxt = captain.ceiling_estimate ? ` (ceiling ${fmt(captain.ceiling_estimate, 0)})` : "";
      lines.push({
        label: "Captain",
        text: `${captain.player_name} is the standout captain — ${fmt(captain.projection_final, 0)} pts projected${ceilTxt}. Best doubler this week.`,
        color: "#F5C84C",
        bgColor: "rgba(245,200,76,0.05)",
      });
    }

    const safePick = safePicks.find((r) => !usedIds.has(r.player_id));
    if (safePick) {
      usedIds.add(safePick.player_id);
      lines.push({
        label: "Safe Pick",
        text: `${safePick.player_name} is a reliable hold — trending stable at ${fmt(safePick.projection_final, 0)} pts projected with consistent recent form.`,
        color: "#4ade80",
        bgColor: "rgba(74,222,128,0.05)",
      });
    }

    const riskPick = riskPicks.find((r) => !usedIds.has(r.player_id));
    if (riskPick) {
      lines.push({
        label: "Risk Alert",
        text: `Monitor ${riskPick.player_name} this round — trending ${getTrendLabel(riskPick.trend_signal)} with projection at ${fmt(riskPick.projection_final, 0)} pts. Consider alternatives.`,
        color: "#f87171",
        bgColor: "rgba(248,113,113,0.05)",
      });
    }

    return lines;
  }, [topPicks, captainPicks, safePicks, riskPicks]);

  // ── SEO ─────────────────────────────────────────────────────────────────────
  const pageTitle = `AFL Fantasy ${roundLabel} Tips, Captain Picks & Value Players | Neeko Sports`;
  const roundNum = roundLabel.replace(/[^0-9]/g, "");

  function openRow(row: RankingRow, rank: number, isVisible = true) {
    if (!isVisible) { setShowUpgradeModal(true); return; }
    const tier: RowTier = isPremium ? "premium" : "full";
    setSelectedRow({ row, rank, tier, isUnlocked: true });
    track("current_round_player_click", { player_name: row.player_name, player_id: row.player_id });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center">
        <div className="text-white/30 text-sm animate-pulse">Loading round data...</div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content="Discover the best AFL Fantasy players for this round including captain picks, value plays and trap alerts powered by AI projections." />
        <link rel="canonical" href="https://neekostats.com.au/sports/afl/current-round" />
        <meta name="robots" content="index, follow" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content="AI-powered AFL Fantasy picks for this round — captain options, value plays, trap alerts and full projections." />
        <meta property="og:url" content="https://neekostats.com.au/sports/afl/current-round" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Neeko Sports" />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content="AI-powered AFL Fantasy picks for this round — captain options, value plays, trap alerts and full projections." />
        <meta name="twitter:image" content="https://neekostats.com.au/og-default.png" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": pageTitle,
          "description": `Best AFL Fantasy picks for ${roundLabel} — captain picks, value plays and trap alerts.`,
          "url": "https://neekostats.com.au/sports/afl/current-round",
          "publisher": { "@type": "Organization", "name": "Neeko Sports", "url": "https://neekostats.com.au" },
          "breadcrumb": {
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://neekostats.com.au" },
              { "@type": "ListItem", "position": 2, "name": "AFL Fantasy", "item": "https://neekostats.com.au/sports/afl" },
              { "@type": "ListItem", "position": 3, "name": "Current Round", "item": "https://neekostats.com.au/sports/afl/current-round" }
            ]
          }
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-[#070707] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

          {/* ── HERO ──────────────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between gap-4 mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-white/25 font-semibold">AFL Fantasy</span>
                  <span className="h-px w-6 bg-white/[0.06]" />
                  <span className="text-[10px] uppercase tracking-wider text-[#F5C84C] font-semibold">
                    {roundLabel}
                  </span>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                  Round Picks &amp; Predictions
                </h1>
                <p className="text-sm text-white/40 mt-1">
                  Captain, value &amp; trap alerts — AI-powered, sorted by projection
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {updatedAt && (
                  <div className="hidden sm:flex items-center gap-1 text-[10px] text-white/25">
                    <Clock className="w-3 h-3" />
                    {fmtUpdatedAt(updatedAt)}
                  </div>
                )}
                <button
                  onClick={() => fetchData(true)}
                  disabled={refreshing}
                  className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors disabled:opacity-40"
                  title="Refresh data"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-white/40 ${refreshing ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* STAT PILLS */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Crown className="w-3 h-3 text-yellow-400" />
                  <span className="text-[10px] uppercase tracking-wider text-white/30 font-medium">Top Captain</span>
                </div>
                <div className="text-xl font-bold text-white tabular-nums">{topCaptainProj != null ? fmt(topCaptainProj, 0) : "—"}</div>
                <div className="text-[10px] text-white/25 mt-px truncate">{topCaptainName ?? "pts projected"}</div>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-3 h-3 text-green-400" />
                  <span className="text-[10px] uppercase tracking-wider text-white/30 font-medium">Rising</span>
                </div>
                <div className="text-xl font-bold text-green-400 tabular-nums">{strongUpCount}</div>
                <div className="text-[10px] text-white/25 mt-px">players trending up</div>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-3 h-3 text-red-400" />
                  <span className="text-[10px] uppercase tracking-wider text-white/30 font-medium">Risk</span>
                </div>
                <div className="text-xl font-bold text-red-400 tabular-nums">{riskCount}</div>
                <div className="text-[10px] text-white/25 mt-px">players trending down</div>
              </div>
            </div>
          </div>

          {/* ── SEO COLLAPSIBLE ────────────────────────────────────────────── */}
          <CollapsibleSEO roundLabel={roundLabel} roundNum={roundNum} />

          {/* ── 2×2 DECISION GRID ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <DecisionCard
              title="Captain Picks"
              icon={<Crown className="w-4 h-4" />}
              accentColor="#F5C84C"
              players={captainPicks}
              freeLimit={FREE_VISIBLE}
              isPremiumUser={isPremium}
              onOpenRow={(row, rank) => openRow(row, rank)}
              onUpgrade={() => setShowUpgradeModal(true)}
              hiddenCopy="Who to double this round based on projection + matchup."
              blurCtaLabel="Unlock full captain strategy →"
              blurBadgeText="+3 captain options hidden"
              footerLink={{ label: "Full rankings", to: "/sports/afl/rankings" }}
              renderMetric={(row) =>
                row.ceiling_estimate != null ? (
                  <div className="text-right hidden sm:block">
                    <div className="text-xs font-bold text-yellow-300 tabular-nums">{fmt(row.ceiling_estimate, 0)}</div>
                    <div className="text-[9px] text-white/25">ceil</div>
                  </div>
                ) : undefined
              }
            />

            <DecisionCard
              title="Top Picks"
              icon={<Star className="w-4 h-4" fill="currentColor" />}
              accentColor="#3b82f6"
              players={topPicks}
              freeLimit={FREE_VISIBLE}
              isPremiumUser={isPremium}
              onOpenRow={(row, rank) => openRow(row, rank)}
              onUpgrade={() => setShowUpgradeModal(true)}
              hiddenCopy="See all top picks for this round with Neeko+."
              blurCtaLabel="Unlock full rankings & AI insights →"
              blurBadgeText="+8 picks hidden"
              footerLink={{ label: "Full rankings", to: "/sports/afl/rankings" }}
            />

            <DecisionCard
              title="Safe Picks"
              icon={<TrendingUp className="w-4 h-4" />}
              accentColor="#4ade80"
              players={safePicks}
              freeLimit={FREE_VISIBLE}
              isPremiumUser={isPremium}
              onOpenRow={(row, rank) => openRow(row, rank)}
              onUpgrade={() => setShowUpgradeModal(true)}
              hiddenCopy="Consistent performers trending stable. Unlock with Neeko+."
              blurCtaLabel="See all safe picks →"
              footerLink={{ label: "Full rankings", to: "/sports/afl/rankings" }}
              renderMetric={(row) =>
                row.trend_signal != null ? (
                  <div className="text-right hidden sm:block">
                    <div className={`text-[10px] font-bold tabular-nums ${getTrendStyles(row.trend_signal)}`}>{getTrendLabel(row.trend_signal)}</div>
                    <div className="text-[9px] text-white/25">form</div>
                  </div>
                ) : undefined
              }
            />

            <DecisionCard
              title="Risk Picks"
              icon={<AlertTriangle className="w-4 h-4" />}
              accentColor="#f87171"
              players={riskPicks}
              freeLimit={FREE_VISIBLE}
              isPremiumUser={isPremium}
              onOpenRow={(row, rank) => openRow(row, rank)}
              onUpgrade={() => setShowUpgradeModal(true)}
              hiddenCopy="Players trending down — consider alternatives this round."
              blurCtaLabel="Reveal all risk flags →"
              blurBadgeText="+6 risks hidden"
              footerLink={{ label: "Full rankings", to: "/sports/afl/rankings" }}
              renderMetric={(row) =>
                row.trend_signal != null ? (
                  <div className="text-right hidden sm:block">
                    <div className={`text-[10px] font-bold tabular-nums ${getTrendStyles(row.trend_signal)}`}>{getTrendLabel(row.trend_signal)}</div>
                    <div className="text-[9px] text-white/25">form</div>
                  </div>
                ) : undefined
              }
            />
          </div>

          {/* ── AI QUICK CALL STRIP ─────────────────────────────────────────── */}
          <AIQuickCallStrip
            lines={aiLines}
            isPremiumUser={isPremium}
            onUpgrade={() => setShowUpgradeModal(true)}
          />

          {/* ── NAV LINKS ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Link
              to="/sports/afl/rankings"
              className="flex items-center justify-between bg-white/[0.025] hover:bg-white/[0.05] border border-white/[0.06] hover:border-white/[0.12] rounded-xl px-4 py-3 transition-all group"
            >
              <div className="flex items-center gap-2">
                <BarChart2 className="w-3.5 h-3.5 text-white/35" />
                <div>
                  <div className="text-sm font-semibold text-white">Full Rankings</div>
                  <div className="text-[10px] text-white/30">600+ players ranked by projection</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all" />
            </Link>
            <Link
              to="/sports/afl/market-watch"
              className="flex items-center justify-between bg-white/[0.025] hover:bg-white/[0.05] border border-white/[0.06] hover:border-white/[0.12] rounded-xl px-4 py-3 transition-all group"
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-white/35" />
                <div>
                  <div className="text-sm font-semibold text-white">Market Watch</div>
                  <div className="text-[10px] text-white/30">Price movements &amp; trade signals</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all" />
            </Link>
          </div>

          {/* ── BOTTOM CTA (free only) ─────────────────────────────────────── */}
          {!isPremium && (
            <a
              href="/neeko-plus"
              className="group flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-200 hover:border-[#F5C84C]/20"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.035)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.02)"; }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(245,200,76,0.12)", border: "1px solid rgba(245,200,76,0.2)" }}>
                  <Crown className="w-3.5 h-3.5 text-[#F5C84C]" />
                </div>
                <div>
                  <span className="text-[12px] font-semibold text-white/70">Win your round with Neeko+</span>
                  <span className="hidden sm:inline text-[11px] text-white/30 ml-2">— full captain picks, AI insights &amp; trap alerts</span>
                </div>
              </div>
              <span className="text-[12px] font-semibold text-[#F5C84C]/70 group-hover:text-[#F5C84C] transition-colors flex items-center gap-1 shrink-0">
                Upgrade →
              </span>
            </a>
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
