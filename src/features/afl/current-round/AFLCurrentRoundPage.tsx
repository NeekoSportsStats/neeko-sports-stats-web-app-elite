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
  Flame,
  DollarSign,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import {
  fmt,
  fmtPrice,
  fmtUpdatedAt,
  normalisePosition,
} from "@/features/afl/rankings/components/helpers";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { PlayerDetailModal, UpgradeModal } from "@/features/afl/rankings/components/RankingsModals";
import { PlayerStatusPill } from "@/features/afl/rankings/components/PlayerStatusPill";
import type { RowTier } from "@/features/afl/rankings/components/types";
import { buildCurrentRoundPlayers, type CurrentRoundPlayer } from "@/features/afl/current-round/engine";

// ─── LIMITS ──────────────────────────────────────────────────────────────────
const FREE_VISIBLE = 2;
const PREMIUM_VISIBLE = 5;


function normalizeRow(raw: Record<string, unknown>): RankingRow {
  const proj = raw.projection != null ? Number(raw.projection) : null;
  return {
    player_id:             (raw.player_id as string) ?? null,
    player_name:           (raw.player_name as string) ?? "",
    team:                  (raw.team as string) ?? "",
    team_name:             null,
    position:              normalisePosition((raw.player_position ?? raw.position) as string | null),
    position_group:        null,
    projection:            proj,
    ceiling_estimate:      null,
    floor_estimate:        null,
    matchup_rating:        null,
    matchup_label:         null,
    matchup_multiplier:    null,
    upside_rating:         null,
    upside_pct:            null,
    risk_rating:           null,
    form_score:            null,
    projection_confidence: null,
    captain_score:         null,
    captain_rating:        null,
    neeko_rating:          null,
    neeko_rating_scaled:   null,
    price:                 raw.price != null ? Number(raw.price) : null,
    prev_price:            null,
    price_change:          null,
    price_change_pct:      null,
    breakeven:             null,
    edge:                  null,
    value_score:           null,
    signal:                (raw.signal as string) ?? null,
    category:              null,
    action:                null,
    why:                   null,
    why_long:              null,
    recommendation_strength: null,
    recommendation_color:  null,
    consistency:           null,
    consistency_tier:      null,
    total_count:           null,
    ai_updated_at:         null,
    cached_at:             null,
    games_played:          raw.games_played != null ? Number(raw.games_played) : null,
    season_avg:            null,
    last_3_avg:            null,
    last_5_avg:            null,
    status:                (raw.status as string) ?? null,
    manual_status:         null,
    is_available:          null,
    bye_round:             null,
    is_bye:                raw.is_bye != null ? Boolean(raw.is_bye) : null,
    bye_next_round:        null,
    trend_score:           null,
    trend_signal:          null,
    form_delta:            null,
    form_label:            null,
    access_tier:           "locked",
  };
}

// ─── FEATURED BADGE ──────────────────────────────────────────────────────────

function FeaturedBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded border border-orange-400/40 bg-orange-400/10 text-orange-400 shrink-0 leading-none">
      <Flame className="w-2.5 h-2.5" />
      Edge Pick
    </span>
  );
}

// ─── COMPACT PLAYER ROW ───────────────────────────────────────────────────────

interface PlayerRowProps {
  row: CurrentRoundPlayer;
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
          {row.isFeaturedPick && <FeaturedBadge />}
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
          <div className="text-sm font-bold text-white tabular-nums">{fmt(row.projection, 0)}</div>
          <div className="text-[9px] text-white/25">proj</div>
        </div>
        <ChevronRight className="w-3 h-3 text-white/15 group-hover:text-white/40 transition-colors" />
      </div>
    </button>
  );
}

// ─── LOCKED PICK ROW ─────────────────────────────────────────────────────────

function BlurredRow({ rank }: { row: CurrentRoundPlayer; rank: number; metric?: React.ReactNode }) {
  return (
    <div className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg select-none pointer-events-none">
      <span className="text-[11px] text-white/20 w-4 text-right shrink-0 font-mono tabular-nums">{rank}</span>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <Lock className="w-3 h-3 text-white/15 shrink-0" />
        <div className="h-2.5 w-24 rounded bg-white/[0.06]" />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="h-2.5 w-10 rounded bg-white/[0.04]" />
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
  description: string;
  icon: React.ReactNode;
  accentColor: string;
  players: CurrentRoundPlayer[];
  freeLimit: number;
  isPremiumUser: boolean;
  onOpenRow: (row: CurrentRoundPlayer, rank: number) => void;
  onUpgrade: () => void;
  hiddenCopy: string;
  lockedCta?: string;
  lockedSubtext?: string;
  blurCtaLabel?: string;
  blurBadgeText?: string;
  footerLink?: { label: string; to: string };
  renderMetric?: (row: CurrentRoundPlayer) => React.ReactNode;
  premiumLocked?: boolean;
}

function DecisionCard({
  title,
  description,
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

  const borderColor = hovered ? `${accentColor}60` : `${accentColor}35`;
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
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
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
        className="px-4 pt-3 pb-2.5"
        style={{ borderBottom: `1px solid ${accentColor}18` }}
      >
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
          <span style={{ color: accentColor }}>{icon}</span>
          <h2 className="text-sm font-bold text-white flex-1">{title}</h2>
          {!isPremiumUser && totalHidden > 0 && (
            <span className="text-[10px] text-white/25">{freeLimit} of {players.length}</span>
          )}
        </div>
        <p className="text-[11px] text-white/35 mt-1 ml-4 leading-relaxed">{description}</p>
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
        style={{ maxHeight: open ? "1100px" : "0px", opacity: open ? 1 : 0 }}
      >
        <div className="px-4 pb-5 space-y-5">
          <p className="text-[12px] text-white/40 leading-relaxed pt-3">
            This page surfaces the best AFL Fantasy picks for {roundLabel} — captain options, top selections, value plays, safe picks and risk alerts — powered by Neeko's AI projection model and trend engine. Every player is scored on projected output, form trajectory, matchup difficulty, consistency and role stability.
          </p>

          <div className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/30">How Each Section Works</h3>
            <ul className="space-y-3 text-[12px] text-white/35 leading-relaxed">
              <li>
                <strong className="text-white/55">Captain Picks</strong> — The best AFL Fantasy captains for {roundLabel}. Ranked by a composite captain score combining projected points, consistency rating and matchup advantage. The players here are best for doubling — high ceiling, proven reliability, and favourable opposition.
              </li>
              <li>
                <strong className="text-white/55">Top Picks</strong> — Highest projected scorers ranked by overall output. Your foundation lineup picks for {roundLabel} based on recent form, role security and Neeko's projection model.
              </li>
              <li>
                <strong className="text-white/55">Value Picks</strong> — Underpriced players with upside. These players project significantly above their breakeven score, making them strong trade-in targets with asymmetric price growth potential.
              </li>
              <li>
                <strong className="text-white/55">Safe Picks</strong> — Consistent performers with a stable or rising trend signal. Dependable selections for building a solid round score without volatility risk.
              </li>
              <li>
                <strong className="text-white/55">Risk Picks</strong> — Players flagged as trending down this round. Recent form is below baseline expectations — consider monitoring or replacing before {roundLabel} locks.
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/30">AFL Fantasy Strategy for {roundLabel}</h3>
            <p className="text-[12px] text-white/35 leading-relaxed">
              Winning AFL Fantasy rounds comes down to three decisions: picking the right captain, identifying underpriced value before the round, and avoiding form risks. Neeko's AI analyses every player's recent performance trend, upcoming matchup difficulty, role consistency and baseline performance to surface the highest-conviction plays each round.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/30">About the Projection Model</h3>
            <p className="text-[12px] text-white/35 leading-relaxed">
              Projections are calculated using weighted recent-game performance, positional matchup data, venue factors and role stability signals. Trend signals are derived by comparing a player's projection against their weighted baseline. Value scores are calculated by comparing projected output against current breakeven requirements. All data updates weekly following each round.
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
  const [players, setPlayers] = useState<RankingRow[]>([]);
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
      const { data, error } = await supabase.rpc("get_rankings_safe", {
        p_user_id: null,
        p_is_bot: false,
        p_limit: 300,
      });

      if (error) {
        console.error("Current Round fetch error:", error);
      } else if (data) {
        setPlayers((data as Record<string, unknown>[]).map(normalizeRow));
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
  }, []);

  useEffect(() => {
    fetchData();
    track("current_round_page_view");
  }, [fetchData]);

  // ── ENGINE — derive all sections from canonical engine ────────────────────
  const edgeBoardIds = useMemo<Set<string>>(() => {
    const ids = (window as any).__neekoEdgeBoardIds;
    return ids instanceof Set ? ids : new Set<string>();
  }, []);

  const { captains, topPicks, valuePicks, safePicks, riskPicks } = useMemo(
    () => buildCurrentRoundPlayers(players, edgeBoardIds),
    [players, edgeBoardIds]
  );

  // ── HERO STATS ──────────────────────────────────────────────────────────────
  const topCaptainProj = captains[0]?.projection ?? null;
  const topCaptainName = captains[0]?.player_name ?? null;
  const strongUpCount = valuePicks.length;
  const riskCount = riskPicks.length;

  // ── AI SUMMARY LINES ────────────────────────────────────────────────────────
  const aiLines = useMemo((): AiCallLine[] => {
    const lines: AiCallLine[] = [];
    const usedIds = new Set<string | null>();

    const topPick = topPicks[0];
    if (topPick) {
      usedIds.add(topPick.player_id);
      lines.push({
        label: "Top Pick",
        text: `${topPick.player_name} leads this round — projected ${fmt(topPick.projection, 0)} pts with strong matchup and consistency.`,
        color: "#ffffff",
      });
    }

    const captain = captains.find((r) => !usedIds.has(r.player_id));
    if (captain) {
      usedIds.add(captain.player_id);
      lines.push({
        label: "Captain",
        text: `${captain.player_name} is the standout captain — ${fmt(captain.projection, 0)} pts projected. Best doubler this week.`,
        color: "#F5C84C",
      });
    }

    const valuePick = valuePicks.find((r) => !usedIds.has(r.player_id));
    if (valuePick) {
      usedIds.add(valuePick.player_id);
      lines.push({
        label: "Value",
        text: `${valuePick.player_name} is underpriced — edge of ${fmt(valuePick.edge, 0)} pts above breakeven. Strong trade target this week.`,
        color: "#a78bfa",
      });
    }

    const safePick = safePicks.find((r) => !usedIds.has(r.player_id));
    if (safePick) {
      usedIds.add(safePick.player_id);
      lines.push({
        label: "Safe Pick",
        text: `${safePick.player_name} is a reliable hold — trending stable at ${fmt(safePick.projection, 0)} pts projected with consistent recent form.`,
        color: "#4ade80",
      });
    }

    const riskPick = riskPicks.find((r) => !usedIds.has(r.player_id));
    if (riskPick) {
      lines.push({
        label: "Risk Alert",
        text: `Monitor ${riskPick.player_name} this round — projection at ${fmt(riskPick.projection, 0)} pts with negative edge. Consider alternatives.`,
        color: "#f87171",
      });
    }

    return lines;
  }, [topPicks, captains, valuePicks, safePicks, riskPicks]);

  // ── SEO ─────────────────────────────────────────────────────────────────────
  const pageTitle = `AFL Fantasy ${roundLabel} Tips, Captain Picks & Value Players | Neeko Sports`;
  const roundNum = roundLabel.replace(/[^0-9]/g, "");

  function openRow(row: CurrentRoundPlayer, rank: number) {
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
                  Captain picks, value plays &amp; risk alerts — browse all players, sorted by Neeko rating
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
                  <span className="text-[10px] uppercase tracking-wider text-white/30 font-medium">Value</span>
                </div>
                <div className="text-xl font-bold text-green-400 tabular-nums">{strongUpCount}</div>
                <div className="text-[10px] text-white/25 mt-px">value plays found</div>
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

          {/* ── EDGE BOARD CTA ──────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-white">Want Neeko's top 3 picks only?</p>
              <p className="text-[12px] text-white/40 mt-0.5">See the highest-conviction plays with no noise — just decisions.</p>
            </div>
            <Link
              to="/sports/afl/edge-board"
              className="shrink-0 flex items-center gap-1.5 text-[12px] font-bold text-white/70 hover:text-white border border-white/[0.12] hover:border-white/[0.25] px-3 py-2 rounded-lg transition-all"
            >
              Edge Board
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* ── SEO COLLAPSIBLE ────────────────────────────────────────────── */}
          <CollapsibleSEO roundLabel={roundLabel} roundNum={roundNum} />

          {/* ── CAPTAIN + TOP PICKS ROW ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DecisionCard
              title="Captain Picks"
              description="Best options to double this round based on projection and matchup."
              icon={<Crown className="w-4 h-4" />}
              accentColor="#F5C84C"
              players={captains}
              freeLimit={FREE_VISIBLE}
              isPremiumUser={isPremium}
              onOpenRow={openRow}
              onUpgrade={() => setShowUpgradeModal(true)}
              hiddenCopy="Who to double this round based on projection + matchup."
              blurCtaLabel="Unlock full captain strategy →"
              blurBadgeText="+3 captain options hidden"
              footerLink={{ label: "Full rankings", to: "/sports/afl/rankings" }}
            />

            <DecisionCard
              title="Top Picks"
              description="Highest projected scorers this round — your foundation lineup."
              icon={<Star className="w-4 h-4" fill="currentColor" />}
              accentColor="#3b82f6"
              players={topPicks}
              freeLimit={FREE_VISIBLE}
              isPremiumUser={isPremium}
              onOpenRow={openRow}
              onUpgrade={() => setShowUpgradeModal(true)}
              hiddenCopy="See all top picks for this round with Neeko+."
              blurCtaLabel="Unlock full rankings & AI insights →"
              blurBadgeText="+3 picks hidden"
              footerLink={{ label: "Full rankings", to: "/sports/afl/rankings" }}
            />
          </div>

          {/* ── VALUE PICKS (full width) ─────────────────────────────────────── */}
          <DecisionCard
            title="Value Picks"
            description="Underpriced players with upside — projecting above breakeven, strong trade targets."
            icon={<DollarSign className="w-4 h-4" />}
            accentColor="#a78bfa"
            players={valuePicks}
            freeLimit={FREE_VISIBLE}
            isPremiumUser={isPremium}
            onOpenRow={openRow}
            onUpgrade={() => setShowUpgradeModal(true)}
            hiddenCopy="Unlock value picks with price growth potential this week."
            blurCtaLabel="Unlock all value plays →"
            blurBadgeText="+3 value picks hidden"
            footerLink={{ label: "Market Watch", to: "/sports/afl/market-watch" }}
            renderMetric={(row) =>
              row.edge != null ? (
                <div className="text-right hidden sm:block">
                  <div className={`text-xs font-bold tabular-nums ${row.edge > 0 ? "text-[#a78bfa]" : "text-white/40"}`}>
                    {row.edge > 0 ? "+" : ""}{fmt(row.edge, 0)}
                  </div>
                  <div className="text-[9px] text-white/25">edge</div>
                </div>
              ) : undefined
            }
          />

          {/* ── SAFE + RISK PICKS ROW ────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DecisionCard
              title="Safe Picks"
              description="Consistent performers trending stable or up — low-volatility holds."
              icon={<TrendingUp className="w-4 h-4" />}
              accentColor="#4ade80"
              players={safePicks}
              freeLimit={FREE_VISIBLE}
              isPremiumUser={isPremium}
              onOpenRow={openRow}
              onUpgrade={() => setShowUpgradeModal(true)}
              hiddenCopy="Consistent performers trending stable. Unlock with Neeko+."
              blurCtaLabel="See all safe picks →"
              footerLink={{ label: "Full rankings", to: "/sports/afl/rankings" }}
              renderMetric={(row) =>
                row.signal_tag != null ? (
                  <div className="text-right hidden sm:block">
                    <div className="text-[10px] font-bold tabular-nums text-green-400">{row.signal_tag}</div>
                    <div className="text-[9px] text-white/25">conf</div>
                  </div>
                ) : undefined
              }
            />

            <DecisionCard
              title="Risk Picks"
              description="Players likely to underperform — trending down or below baseline."
              icon={<AlertTriangle className="w-4 h-4" />}
              accentColor="#f87171"
              players={riskPicks}
              freeLimit={FREE_VISIBLE}
              isPremiumUser={isPremium}
              onOpenRow={openRow}
              onUpgrade={() => setShowUpgradeModal(true)}
              hiddenCopy="Players trending down — consider alternatives this round."
              blurCtaLabel="Reveal all risk flags →"
              blurBadgeText="+3 risks hidden"
              footerLink={{ label: "Full rankings", to: "/sports/afl/rankings" }}
              renderMetric={(row) =>
                row.edge != null ? (
                  <div className="text-right hidden sm:block">
                    <div className="text-[10px] font-bold tabular-nums text-red-400">{fmt(row.edge, 0)}</div>
                    <div className="text-[9px] text-white/25">edge</div>
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
                  <span className="hidden sm:inline text-[11px] text-white/30 ml-2">— full captain picks, AI insights &amp; value plays</span>
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
