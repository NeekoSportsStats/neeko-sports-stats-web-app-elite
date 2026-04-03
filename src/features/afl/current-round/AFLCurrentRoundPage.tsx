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
  fmtValueScore,
  fmtUpdatedAt,
  normalisePosition,
  getValueScoreColor,
  resolveRecommendationColor,
} from "@/features/afl/rankings/components/helpers";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { PlayerDetailModal, UpgradeModal } from "@/features/afl/rankings/components/RankingsModals";
import type { RowTier } from "@/features/afl/rankings/components/types";

// ─── LIMITS ──────────────────────────────────────────────────────────────────
const FREE_VISIBLE = 2;
const PREMIUM_VISIBLE = 5;

const COLUMNS =
  "player_id,player_name,team,position," +
  "projection_final,ceiling_estimate,floor_estimate," +
  "consistency_score,form_rating,matchup_rating," +
  "upside_rating,risk_rating,form_score," +
  "projection_confidence,captain_score,captain_rating," +
  "neeko_rating,neeko_rating_scaled," +
  "price,prev_price,price_change,price_change_pct," +
  "breakeven,value_score,best_value_score,value_tag,value_tier," +
  "ai_recommendation,recommendation_strength," +
  "recommendation_color,consistency_tier," +
  "why,long,ai_summary,ai_updated_at," +
  "start_sit_decision,edge_score,edge_tier," +
  "market_watch_category,upside_pct," +
  "status,manual_status,is_available," +
  "bye_round,is_bye,bye_next_round,games_played";

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

// ─── COMPACT PLAYER ROW ───────────────────────────────────────────────────────

interface PlayerRowProps {
  row: RankingRow;
  rank: number;
  metric?: React.ReactNode;
  isPremiumUser: boolean;
  onClick: () => void;
}

function PlayerRow({ row, rank, metric, isPremiumUser, onClick }: PlayerRowProps) {
  const recColor = resolveRecommendationColor(row.recommendation_color, row.ai_recommendation);

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/[0.05] transition-all duration-150 group"
    >
      <span className="text-[11px] text-white/20 w-4 text-right shrink-0 font-mono tabular-nums">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-white truncate leading-tight">{row.player_name}</span>
          {row.ai_recommendation && isPremiumUser && (
            <span
              className="text-[9px] px-1 py-px rounded border shrink-0 font-medium leading-none"
              style={{ color: recColor, borderColor: `${recColor}40`, backgroundColor: `${recColor}15` }}
            >
              {row.ai_recommendation}
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
        <div className="text-sm font-semibold text-white truncate leading-tight">{row.player_name}</div>
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

// ─── BLUR OVERLAY CTA ─────────────────────────────────────────────────────────

function BlurOverlayCTA({
  hiddenCount,
  accentColor,
  onUpgrade,
}: {
  hiddenCount: number;
  accentColor: string;
  onUpgrade: () => void;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 z-10">
      <div
        className="absolute inset-0 rounded-b-xl"
        style={{
          background: `linear-gradient(to bottom, transparent 0%, #0a0a0a88 30%, #0a0a0aee 100%)`,
        }}
      />
      <div className="relative flex flex-col items-center gap-2">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
          style={{ backgroundColor: `${accentColor}18`, border: `1px solid ${accentColor}40`, color: accentColor }}
        >
          <Lock className="w-3 h-3" />
          +{hiddenCount} elite picks hidden
        </div>
        <button
          onClick={onUpgrade}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-black transition-all hover:brightness-110 active:scale-[0.97]"
          style={{ backgroundColor: accentColor }}
        >
          Unlock full list
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
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
  footerLink,
  renderMetric,
  premiumLocked = false,
}: DecisionCardProps) {
  const visible = isPremiumUser ? players.slice(0, PREMIUM_VISIBLE) : players.slice(0, freeLimit);
  const hidden = isPremiumUser ? [] : players.slice(freeLimit, PREMIUM_VISIBLE);
  const totalHidden = isPremiumUser ? 0 : Math.max(0, players.length - freeLimit);

  if (premiumLocked && !isPremiumUser) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
          <span style={{ color: accentColor }}>{icon}</span>
          <h2 className="text-sm font-bold text-white">{title}</h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 text-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${accentColor}20` }}>
            <Lock className="w-4 h-4" style={{ color: accentColor }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/60 mb-1">{title} — Neeko+ Only</p>
            <p className="text-[11px] text-white/30 max-w-[180px] leading-relaxed">{hiddenCopy}</p>
          </div>
          <button
            onClick={onUpgrade}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all"
            style={{ backgroundColor: `${accentColor}20`, color: accentColor, border: `1px solid ${accentColor}40` }}
          >
            Unlock →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
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
          <div className="relative">
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
            />
          </div>
        )}
      </div>

      {footerLink && (
        <div className="px-4 py-2.5 border-t border-white/[0.05]">
          <Link
            to={footerLink.to}
            className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/60 transition-colors"
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
        <span className="text-[12px] text-white/40 font-medium">What this page shows ↓</span>
        <ChevronDown className={`w-3.5 h-3.5 text-white/25 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        className="border-t border-white/[0.05] overflow-hidden transition-all duration-200"
        style={{ maxHeight: open ? "600px" : "0px", opacity: open ? 1 : 0 }}
      >
        <div className="px-4 pb-4 space-y-4">
          <p className="text-[12px] text-white/40 leading-relaxed pt-3">
            This page surfaces the best AFL Fantasy picks for {roundLabel} — captain options, value plays and trap alerts — using Neeko's AI projection model.
            Every player is scored on projected output, price value, matchup difficulty, and role stability.
          </p>
          <ul className="space-y-2 text-[12px] text-white/35 leading-relaxed">
            <li><strong className="text-white/55">Captain Picks</strong> — Best ceiling players for doubling up. Scored by projection, consistency and matchup.</li>
            <li><strong className="text-white/55">Top Picks</strong> — Highest-rated players overall. Your must-starts.</li>
            <li><strong className="text-white/55">Value Plays</strong> — Underpriced players whose projected output exceeds their price. Prime trade-in targets.</li>
            <li><strong className="text-white/55">Trap Alerts</strong> — Overpriced players whose projection falls short. Consider trading out before lockout.</li>
          </ul>
          {roundNum && (
            <Link
              to={`/sports/afl/round/${roundNum}`}
              className="inline-flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/70 underline underline-offset-2 transition-colors"
            >
              View Full Round {roundNum} Breakdown
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
      setRefreshing(false);
    }
  }, [isPremium]);

  useEffect(() => {
    fetchData();
    track("current_round_page_view");
  }, [fetchData]);

  // ── DERIVED LISTS — sorted by projection DESC ───────────────────────────────
  const topPicks = useMemo(
    () => [...rows].sort((a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0)).slice(0, 10),
    [rows]
  );

  const captainPicks = useMemo(
    () =>
      [...rows]
        .filter((r) => (r.projection_final ?? 0) >= 100 && (r.projection_confidence ?? 0) >= 60)
        .sort((a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0))
        .slice(0, 8),
    [rows]
  );

  const valuePlays = useMemo(
    () =>
      [...rows]
        .filter((r) => r.value_score != null && r.price != null && r.price > 0 && (r.games_played ?? 0) >= 1 && (r.value_score ?? 0) > 0)
        .sort((a, b) => (b.projection_final ?? 0) - (a.projection_final ?? 0))
        .slice(0, 10),
    [rows]
  );

  const trapAlerts = useMemo(
    () =>
      [...rows]
        .filter((r) => r.value_score != null && r.price != null && r.price > 0 && (r.games_played ?? 0) >= 1 && (r.value_score ?? 0) < 0)
        .sort((a, b) => (a.value_score ?? 0) - (b.value_score ?? 0))
        .slice(0, 8),
    [rows]
  );

  // ── HERO STATS ──────────────────────────────────────────────────────────────
  const topCaptainProj = captainPicks[0]?.projection_final ?? topPicks[0]?.projection_final ?? null;
  const topCaptainName = captainPicks[0]?.player_name ?? topPicks[0]?.player_name ?? null;
  const bestValueScore = valuePlays[0]?.value_score ?? null;
  const trapCount = trapAlerts.length;

  // ── AI SUMMARY LINES ────────────────────────────────────────────────────────
  const aiLines = useMemo((): AiCallLine[] => {
    const lines: AiCallLine[] = [];

    const topPick = topPicks[0];
    if (topPick) {
      lines.push({
        label: "Top Pick",
        text: `${topPick.player_name} leads this round — projected ${fmt(topPick.projection_final, 0)} pts with strong matchup and consistency.`,
        color: "#ffffff",
        bgColor: "rgba(255,255,255,0.05)",
      });
    }

    const captain = captainPicks[0];
    if (captain) {
      const ceilTxt = captain.ceiling_estimate ? ` (ceiling ${fmt(captain.ceiling_estimate, 0)})` : "";
      lines.push({
        label: "Captain",
        text: `${captain.player_name} is the standout captain — ${fmt(captain.projection_final, 0)} pts projected${ceilTxt}. Best doubler this week.`,
        color: "#F5C84C",
        bgColor: "rgba(245,200,76,0.05)",
      });
    }

    const value = valuePlays[0];
    if (value) {
      lines.push({
        label: "Value",
        text: `${value.player_name} is the best value play (score: ${fmtValueScore(value.value_score)}) — projected ${fmt(value.projection_final, 0)} pts, priced below expected output.`,
        color: "#4ade80",
        bgColor: "rgba(74,222,128,0.05)",
      });
    }

    const trap = trapAlerts[0];
    if (trap) {
      lines.push({
        label: "Trap Alert",
        text: `Fade ${trap.player_name} this round — value score ${fmtValueScore(trap.value_score)} signals overpriced relative to projection.`,
        color: "#f87171",
        bgColor: "rgba(248,113,113,0.05)",
      });
    }

    return lines;
  }, [topPicks, captainPicks, valuePlays, trapAlerts]);

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
                  <span className="text-[10px] uppercase tracking-wider text-white/30 font-medium">Best Value</span>
                </div>
                <div className="text-xl font-bold text-green-400 tabular-nums">{bestValueScore != null ? fmtValueScore(bestValueScore) : "—"}</div>
                <div className="text-[10px] text-white/25 mt-px">{valuePlays[0]?.player_name ?? "value score"}</div>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-3 h-3 text-red-400" />
                  <span className="text-[10px] uppercase tracking-wider text-white/30 font-medium">Traps</span>
                </div>
                <div className="text-xl font-bold text-red-400 tabular-nums">{trapCount}</div>
                <div className="text-[10px] text-white/25 mt-px">players to avoid</div>
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
              hiddenCopy={`${captainPicks.length} captain options identified this round. Unlock to see who to double up on.`}
              premiumLocked={true}
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
              accentColor="#ffffff"
              players={topPicks}
              freeLimit={FREE_VISIBLE}
              isPremiumUser={isPremium}
              onOpenRow={(row, rank) => openRow(row, rank)}
              onUpgrade={() => setShowUpgradeModal(true)}
              hiddenCopy="See all top picks for this round with Neeko+."
              footerLink={{ label: "Full rankings", to: "/sports/afl/rankings" }}
            />

            <DecisionCard
              title="Value Plays"
              icon={<TrendingUp className="w-4 h-4" />}
              accentColor="#4ade80"
              players={valuePlays}
              freeLimit={FREE_VISIBLE}
              isPremiumUser={isPremium}
              onOpenRow={(row, rank) => openRow(row, rank)}
              onUpgrade={() => setShowUpgradeModal(true)}
              hiddenCopy="Underpriced players primed to rise. Unlock with Neeko+."
              footerLink={{ label: "Market Watch", to: "/sports/afl/market-watch" }}
              renderMetric={(row) =>
                row.value_score != null ? (
                  <div className="text-right hidden sm:block">
                    <div className={`text-xs font-bold tabular-nums ${getValueScoreColor(row.value_score)}`}>{fmtValueScore(row.value_score)}</div>
                    <div className="text-[9px] text-white/25">value</div>
                  </div>
                ) : undefined
              }
            />

            <DecisionCard
              title="Trap Alerts"
              icon={<AlertTriangle className="w-4 h-4" />}
              accentColor="#f87171"
              players={trapAlerts}
              freeLimit={FREE_VISIBLE}
              isPremiumUser={isPremium}
              onOpenRow={(row, rank) => openRow(row, rank)}
              onUpgrade={() => setShowUpgradeModal(true)}
              hiddenCopy="Know who to avoid before lockout. Neeko+ reveals all trap alerts."
              premiumLocked={true}
              footerLink={{ label: "Market Watch", to: "/sports/afl/market-watch" }}
              renderMetric={(row) =>
                row.value_score != null ? (
                  <div className="text-right hidden sm:block">
                    <div className="text-xs font-bold text-red-400 tabular-nums">{fmtValueScore(row.value_score)}</div>
                    <div className="text-[9px] text-white/25">value</div>
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
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-6 text-center space-y-3">
              <div className="inline-block px-2.5 py-1 bg-[#F5C84C]/15 border border-[#F5C84C]/30 rounded-full text-[10px] font-bold text-[#F5C84C] uppercase tracking-wider">
                Neeko+
              </div>
              <h3 className="text-lg font-bold text-white">
                Win your round with Neeko+
              </h3>
              <p className="text-sm text-white/40 max-w-sm mx-auto">
                Unlock full insights before lockout — captain picks, trap alerts, value plays and AI analysis for every player.
              </p>
              <a
                href="/neeko-plus"
                className="inline-flex items-center gap-2 mt-1 px-5 py-2.5 bg-[#F5C84C] text-black font-bold rounded-xl hover:brightness-105 active:scale-[0.98] transition-all text-sm"
              >
                Upgrade to Neeko+
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
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
