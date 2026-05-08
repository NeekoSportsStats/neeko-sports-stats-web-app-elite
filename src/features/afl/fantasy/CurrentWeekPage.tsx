import { useEffect, useState, useMemo, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  Crown, DollarSign, TriangleAlert as AlertTriangle,
  Lock, ChevronRight, ExternalLink, ShieldAlert, TrendingUp,
  Zap,
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
  buyValuePicks: CurrentRoundPlayer[];
  trapFadeAlerts: CurrentRoundPlayer[];
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

  const { captains, buyValuePicks, trapFadeAlerts } = useMemo(() => {
    if (rawRows.length === 0) {
      return { captains: [], buyValuePicks: [], trapFadeAlerts: [] };
    }
    return buildCurrentRoundPlayers(rawRows);
  }, [rawRows]);

  return { captains, buyValuePicks, trapFadeAlerts, roundLabel, updatedAt, loading, error };
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

// ── Deterministic reason generators ──────────────────────────────────────────

function getCaptainReason(p: RankingRow, tier: "LOCK" | "SAFE" | "POD"): string | null {
  const conf = (p.confidence_label ?? "").toUpperCase();
  const proj = typeof p.projection === "number" ? p.projection : null;
  const ceiling = typeof p.ceiling_estimate === "number" ? p.ceiling_estimate : null;
  const captainRating = (p.captain_rating ?? "").toUpperCase();
  const formScore = typeof p.form_score === "number" ? p.form_score : null;
  const matchupLabel = (p.matchup_label ?? "").toLowerCase();

  if (tier === "LOCK") {
    if (conf === "HIGH" || conf === "VERY HIGH") return "High confidence captain option";
    if (proj !== null && ceiling !== null && ceiling >= proj * 1.25) return "Strong ceiling profile this round";
    if (captainRating === "ELITE" || captainRating === "PREMIUM") return "Elite captain rating";
    return "Top projection this round";
  }

  if (tier === "SAFE") {
    if (matchupLabel.includes("favourable") || matchupLabel.includes("favorable")) return "Favourable matchup this round";
    if (conf === "HIGH" || conf === "MEDIUM") return "Consistent captain option";
    if (formScore !== null && formScore >= 70) return "Strong recent form";
    return "Reliable captain option";
  }

  // POD
  if (ceiling !== null && proj !== null && ceiling >= proj * 1.3) return "High ceiling POD option";
  if (matchupLabel.includes("favourable") || matchupLabel.includes("favorable")) return "POD with favourable matchup";
  if (captainRating === "VALUE") return "Value POD captain play";
  return "POD captain option";
}

function getBuyValueReason(p: RankingRow): string | null {
  const valueScore = typeof p.value_score === "number" ? p.value_score : null;
  const projection = typeof p.projection === "number" ? p.projection : null;
  const breakeven = typeof p.breakeven === "number" ? p.breakeven : null;
  const edge = typeof p.edge_canonical === "number" ? p.edge_canonical : null;
  const action = (p.action_canonical ?? p.signal_tag ?? "").toUpperCase();
  const formDelta = typeof p.form_delta === "number" ? p.form_delta : null;
  const trendSignal = (p.trend_signal ?? "").toUpperCase();
  const matchupLabel = (p.matchup_label ?? "").toLowerCase();
  const pricePct = typeof p.price_change_pct === "number" ? p.price_change_pct : null;

  if (action === "STRONG_START" || action === "START") return "Strong start signal this round";
  if (valueScore !== null && valueScore > 3) return "High value score above price";
  if (valueScore !== null && valueScore > 0) return "Positive value above current price";
  if (edge !== null && edge > 10) return "Projected well above breakeven";
  if (projection !== null && breakeven !== null && projection > breakeven + 5) return "Projected above breakeven";
  if (trendSignal === "UP" || trendSignal === "STRONG_UP") return "Rising form trend";
  if (formDelta !== null && formDelta > 5) return "Form improving this stretch";
  if (pricePct !== null && pricePct < -5) return "Price drop creates entry opportunity";
  if (matchupLabel.includes("favourable") || matchupLabel.includes("favorable")) return "Favourable matchup this round";
  if (action === "BUY" || action === "VALUE") return "Value signal active";
  return null;
}

function getTrapFadeReason(p: RankingRow): string | null {
  const edge = typeof p.edge_canonical === "number" ? p.edge_canonical : null;
  const projection = typeof p.projection === "number" ? p.projection : null;
  const breakeven = typeof p.breakeven === "number" ? p.breakeven : null;
  const conf = (p.confidence_label ?? "").toUpperCase();
  const action = (p.action_canonical ?? p.signal_tag ?? "").toUpperCase();
  const riskRating = typeof p.risk_rating === "number" ? p.risk_rating : null;
  const formDelta = typeof p.form_delta === "number" ? p.form_delta : null;
  const trendSignal = (p.trend_signal ?? "").toUpperCase();
  const matchupLabel = (p.matchup_label ?? "").toLowerCase();
  const pricePct = typeof p.price_change_pct === "number" ? p.price_change_pct : null;

  if (action === "STRONG_SIT") return "Strong sit signal — avoid this round";
  if (edge !== null && edge < -10) return "Projected well below breakeven";
  if (projection !== null && breakeven !== null && projection < breakeven - 5) return "Projected below breakeven";
  if (riskRating !== null && riskRating >= 70) return "High risk rating active";
  if (conf === "LOW") return "Low confidence warning";
  if (trendSignal === "DOWN" || trendSignal === "STRONG_DOWN") return "Declining form trend";
  if (formDelta !== null && formDelta < -5) return "Form declining this stretch";
  if (pricePct !== null && pricePct > 8) return "Overpriced relative to projection";
  if (matchupLabel.includes("tough") || matchupLabel.includes("difficult")) return "Tough matchup this round";
  if (action === "SIT" || action === "FADE") return "Sit or fade signal active";
  if (edge !== null && edge < 0) return "Negative edge versus baseline";
  return null;
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

// ── Tier badge ────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: "LOCK" | "SAFE" | "POD" }) {
  const styles =
    tier === "LOCK"
      ? "text-[#F5C84C] bg-[#F5C84C]/[0.10] border border-[#F5C84C]/25"
      : tier === "SAFE"
      ? "text-sky-400 bg-sky-500/[0.08] border border-sky-500/20"
      : "text-white/38 bg-white/[0.04] border border-white/[0.06]";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-[700] uppercase tracking-wider ${styles}`}>
      {tier}
    </span>
  );
}

// ── Metric pill ───────────────────────────────────────────────────────────────

function MetricPill({
  value,
  label,
  accentColor,
}: {
  value: string;
  label: string;
  accentColor: string;
}) {
  return (
    <div className="text-right min-w-[52px]">
      <div className={`text-[13px] font-[800] tabular-nums leading-tight ${accentColor}`}>{value}</div>
      <div className="text-[9px] text-white/22 uppercase tracking-wider leading-none mt-px">{label}</div>
    </div>
  );
}

// ── Unified player row ────────────────────────────────────────────────────────

interface EnrichedRowProps {
  player: CurrentRoundPlayer;
  rank: number;
  isFirst: boolean;
  // Badge shown inline next to name (tier / action label)
  nameBadge?: React.ReactNode;
  // Secondary badge shown on right before metric (value score, edge etc.)
  rightBadge?: React.ReactNode;
  // Primary metric on the right
  metric: { value: string; label: string } | null;
  accentColor: string;
  // Deterministic reason string (null = don't show)
  reason: string | null;
}

function EnrichedRow({
  player: p,
  rank,
  isFirst,
  nameBadge,
  rightBadge,
  metric,
  accentColor,
  reason,
}: EnrichedRowProps) {
  const href = playerHref(p);
  const isLinked = href !== "#";

  const inner = (
    <div
      className={`flex items-start gap-3 py-3 px-4 transition-colors group cursor-pointer hover:bg-white/[0.028] ${
        isFirst ? "" : "border-t border-white/[0.04]"
      }`}
    >
      {/* Rank */}
      <span className="text-[11px] font-[700] text-white/18 w-5 shrink-0 text-right tabular-nums mt-0.5">
        {rank}
      </span>

      {/* Player info block */}
      <div className="flex-1 min-w-0">
        {/* Name row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-[700] text-white/88 leading-tight">{p.player_name}</span>
          {p.team && (
            <span className="text-[10px] text-white/32 font-[500] shrink-0 bg-white/[0.04] px-1.5 py-px rounded border border-white/[0.05]">
              {p.team}
            </span>
          )}
          {p.position && (
            <span className="text-[10px] text-white/22 font-[500] shrink-0">{p.position}</span>
          )}
          {nameBadge}
        </div>

        {/* Reason line — deterministic, never shown if null */}
        {reason && (
          <p className="text-[11px] text-white/35 leading-snug mt-1 pr-4">{reason}</p>
        )}
      </div>

      {/* Right side: badges + metric + link icon */}
      <div className="flex items-center gap-2.5 shrink-0 mt-0.5">
        <ConfidenceBadge label={p.confidence_label} />
        {rightBadge}
        {metric && (
          <MetricPill value={metric.value} label={metric.label} accentColor={accentColor} />
        )}
        {isLinked && (
          <ExternalLink
            className="h-3 w-3 text-white/12 group-hover:text-white/30 transition-colors shrink-0"
            aria-hidden
          />
        )}
      </div>
    </div>
  );

  return isLinked ? (
    <Link to={href} className="block">
      {inner}
    </Link>
  ) : (
    <div>{inner}</div>
  );
}

// ── Lock row ──────────────────────────────────────────────────────────────────

function LockRow({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="border-t border-white/[0.04]">
      <Link
        to="/neeko-plus"
        className="group flex items-center gap-4 px-5 py-4 hover:bg-[#F5C84C]/[0.04] transition-colors"
      >
        <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-[#F5C84C]/[0.08] border border-[#F5C84C]/20 shrink-0 group-hover:border-[#F5C84C]/35 transition-colors">
          <Lock className="h-4 w-4 text-[#F5C84C]/70" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-[700] text-white/60 group-hover:text-white/80 transition-colors leading-tight">
            Unlock {count} more weekly {count === 1 ? "call" : "calls"} with Neeko+
          </p>
          <p className="text-[11px] text-white/28 mt-0.5">
            Full captain picks, value targets and trap alerts every round.
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-[#F5C84C]/30 bg-[#F5C84C]/[0.10] px-3.5 py-1.5 text-[11px] font-[700] text-[#F5C84C] group-hover:bg-[#F5C84C]/[0.18] group-hover:border-[#F5C84C]/50 transition-colors">
          Upgrade
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </Link>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

interface SectionConfig {
  title: string;
  description: string;
  accentBar: string;
  headerIcon: React.ReactNode;
  players: CurrentRoundPlayer[];
  isPremium: boolean;
  renderPlayer: (p: CurrentRoundPlayer, i: number) => React.ReactNode;
  emptyMessage?: string;
}

function Section({
  title,
  description,
  accentBar,
  headerIcon,
  players,
  isPremium,
  renderPlayer,
  emptyMessage,
}: SectionConfig) {
  const visible = isPremium ? players : players.slice(0, FREE_LIMIT);
  const hidden = isPremium ? 0 : Math.max(0, players.length - FREE_LIMIT);
  const total = players.length;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0A0D12] overflow-hidden shadow-[0_1px_24px_rgba(0,0,0,0.35)]">
      <div className="flex items-start gap-3.5 px-5 py-4 border-b border-white/[0.06] bg-white/[0.015] relative">
        <div className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full ${accentBar}`} />
        <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-white/[0.04] border border-white/[0.06] shrink-0">
          {headerIcon}
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[15px] font-[800] text-white/90 leading-tight tracking-tight">{title}</h2>
            {total > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-[600] text-white/28 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-full">
                {total} pick{total !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-[11px] text-white/32 mt-0.5 leading-snug">{description}</p>
        </div>
      </div>

      <div>
        {visible.length === 0 ? (
          <p className="text-[12px] text-white/25 px-5 py-5">
            {emptyMessage ?? "Live data not available for this round yet."}
          </p>
        ) : (
          <>
            <div>{visible.map((p, i) => renderPlayer(p, i))}</div>
            <LockRow count={hidden} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Summary card skeleton ─────────────────────────────────────────────────────

function SummaryCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0A0D12] p-5 flex flex-col gap-4 shadow-[0_1px_24px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-white/[0.04] animate-pulse" />
        <div className="h-2.5 w-20 rounded-full bg-white/[0.04] animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-28 rounded bg-white/[0.05] animate-pulse" />
        <div className="h-3 w-16 rounded bg-white/[0.03] animate-pulse" />
      </div>
      <div className="flex items-end justify-between">
        <div className="h-7 w-12 rounded bg-white/[0.06] animate-pulse" />
        <div className="h-5 w-14 rounded-lg bg-white/[0.04] animate-pulse" />
      </div>
    </div>
  );
}

// ── Captain Lock summary card ─────────────────────────────────────────────────

function CaptainLockCard({ player }: { player: CurrentRoundPlayer | null }) {
  const href = player ? playerHref(player) : "#";

  const inner = (
    <div className="rounded-2xl border border-[#F5C84C]/18 bg-[#0A0D12] p-5 flex flex-col gap-3 h-full shadow-[0_1px_24px_rgba(0,0,0,0.35)] hover:border-[#F5C84C]/32 hover:shadow-[0_4px_32px_rgba(245,200,76,0.06)] transition-all duration-200 group relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#F5C84C]/[0.03] to-transparent pointer-events-none" />
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-[#F5C84C]/[0.10] border border-[#F5C84C]/20">
            <Crown className="h-3.5 w-3.5 text-[#F5C84C]/80" aria-hidden />
          </div>
          <span className="text-[10px] font-[800] tracking-[0.14em] uppercase text-[#F5C84C]/55">Captain Lock</span>
        </div>
        {player && href !== "#" && (
          <ExternalLink className="h-3 w-3 text-white/15 group-hover:text-white/35 transition-colors" aria-hidden />
        )}
      </div>
      {player ? (
        <div className="relative flex flex-col gap-2 flex-1">
          <div>
            <p className="text-[16px] font-[800] text-white/92 leading-tight tracking-tight">{player.player_name}</p>
            <div className="flex items-center gap-1.5 mt-1">
              {player.team && (
                <span className="text-[10px] text-white/32 font-[500] bg-white/[0.04] px-1.5 py-px rounded border border-white/[0.05]">
                  {player.team}
                </span>
              )}
              {player.position && <span className="text-[10px] text-white/22 font-[500]">{player.position}</span>}
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 mt-auto pt-1">
            <div className="flex flex-col gap-px">
              {player.projection != null && (
                <>
                  <span className="text-[26px] font-[900] text-[#F5C84C] leading-none tabular-nums">
                    {fmt(player.projection, 0)}
                  </span>
                  <span className="text-[9px] text-white/25 uppercase tracking-wider font-[600]">projected pts</span>
                </>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-[800] uppercase tracking-wider text-[#F5C84C] bg-[#F5C84C]/[0.12] border border-[#F5C84C]/25">
                LOCK
              </span>
              {player.confidence_label && <ConfidenceBadge label={player.confidence_label} />}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-white/25 flex-1 flex items-center relative">Live data not available yet.</p>
      )}
    </div>
  );

  return player && href !== "#" ? <Link to={href} className="block h-full">{inner}</Link> : inner;
}

// ── Best Value summary card ───────────────────────────────────────────────────

function BestValueCard({ player }: { player: CurrentRoundPlayer | null }) {
  const href = player ? playerHref(player) : "#";

  const inner = (
    <div className="rounded-2xl border border-emerald-500/18 bg-[#0A0D12] p-5 flex flex-col gap-3 h-full shadow-[0_1px_24px_rgba(0,0,0,0.35)] hover:border-emerald-500/32 hover:shadow-[0_4px_32px_rgba(52,211,153,0.05)] transition-all duration-200 group relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.025] to-transparent pointer-events-none" />
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-emerald-500/[0.10] border border-emerald-500/20">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400/80" aria-hidden />
          </div>
          <span className="text-[10px] font-[800] tracking-[0.14em] uppercase text-emerald-400/55">Best Value</span>
        </div>
        {player && href !== "#" && (
          <ExternalLink className="h-3 w-3 text-white/15 group-hover:text-white/35 transition-colors" aria-hidden />
        )}
      </div>
      {player ? (
        <div className="relative flex flex-col gap-2 flex-1">
          <div>
            <p className="text-[16px] font-[800] text-white/92 leading-tight tracking-tight">{player.player_name}</p>
            <div className="flex items-center gap-1.5 mt-1">
              {player.team && (
                <span className="text-[10px] text-white/32 font-[500] bg-white/[0.04] px-1.5 py-px rounded border border-white/[0.05]">
                  {player.team}
                </span>
              )}
              {player.position && <span className="text-[10px] text-white/22 font-[500]">{player.position}</span>}
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 mt-auto pt-1">
            <div className="flex flex-col gap-px">
              {player.price != null && player.price > 0 ? (
                <>
                  <span className="text-[26px] font-[900] text-emerald-400 leading-none tabular-nums">{fmtPrice(player.price)}</span>
                  <span className="text-[9px] text-white/25 uppercase tracking-wider font-[600]">price</span>
                </>
              ) : player.projection != null ? (
                <>
                  <span className="text-[26px] font-[900] text-emerald-400 leading-none tabular-nums">{fmt(player.projection, 0)}</span>
                  <span className="text-[9px] text-white/25 uppercase tracking-wider font-[600]">proj pts</span>
                </>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {player.value_score != null && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-[800] tabular-nums text-emerald-400 bg-emerald-500/[0.12] border border-emerald-500/25">
                  +{fmt(player.value_score, 1)} val
                </span>
              )}
              {player.confidence_label && <ConfidenceBadge label={player.confidence_label} />}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-white/25 flex-1 flex items-center relative">Live data not available yet.</p>
      )}
    </div>
  );

  return player && href !== "#" ? <Link to={href} className="block h-full">{inner}</Link> : inner;
}

// ── Biggest Trap summary card ─────────────────────────────────────────────────

function BiggestTrapCard({ player }: { player: CurrentRoundPlayer | null }) {
  const href = player ? playerHref(player) : "#";
  const edge = player
    ? (player.edge_canonical ?? (((player.projection ?? 0) - (player.breakeven ?? 0)) || null))
    : null;
  const edgeStr = edge != null && !isNaN(edge) ? `${edge > 0 ? "+" : ""}${Math.round(edge)}` : null;

  const inner = (
    <div className="rounded-2xl border border-red-500/18 bg-[#0A0D12] p-5 flex flex-col gap-3 h-full shadow-[0_1px_24px_rgba(0,0,0,0.35)] hover:border-red-500/32 hover:shadow-[0_4px_32px_rgba(239,68,68,0.05)] transition-all duration-200 group relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-red-500/[0.025] to-transparent pointer-events-none" />
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-red-500/[0.10] border border-red-500/20">
            <ShieldAlert className="h-3.5 w-3.5 text-red-400/80" aria-hidden />
          </div>
          <span className="text-[10px] font-[800] tracking-[0.14em] uppercase text-red-400/55">Biggest Trap</span>
        </div>
        {player && href !== "#" && (
          <ExternalLink className="h-3 w-3 text-white/15 group-hover:text-white/35 transition-colors" aria-hidden />
        )}
      </div>
      {player ? (
        <div className="relative flex flex-col gap-2 flex-1">
          <div>
            <p className="text-[16px] font-[800] text-white/92 leading-tight tracking-tight">{player.player_name}</p>
            <div className="flex items-center gap-1.5 mt-1">
              {player.team && (
                <span className="text-[10px] text-white/32 font-[500] bg-white/[0.04] px-1.5 py-px rounded border border-white/[0.05]">
                  {player.team}
                </span>
              )}
              {player.position && <span className="text-[10px] text-white/22 font-[500]">{player.position}</span>}
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 mt-auto pt-1">
            <div className="flex flex-col gap-px">
              {player.projection != null && (
                <>
                  <span className="text-[26px] font-[900] text-red-400 leading-none tabular-nums">{fmt(player.projection, 0)}</span>
                  <span className="text-[9px] text-white/25 uppercase tracking-wider font-[600]">proj pts</span>
                </>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {edgeStr && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-[800] tabular-nums text-red-400 bg-red-500/[0.12] border border-red-500/25">
                  {edgeStr} edge
                </span>
              )}
              {player.action_canonical && <ActionBadge action={player.action_canonical} />}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-white/25 flex-1 flex items-center relative">Live data not available yet.</p>
      )}
    </div>
  );

  return player && href !== "#" ? <Link to={href} className="block h-full">{inner}</Link> : inner;
}

// ── Section loading skeleton ──────────────────────────────────────────────────

function SectionSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0A0D12] overflow-hidden shadow-[0_1px_24px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-3.5 px-5 py-4 border-b border-white/[0.06] bg-white/[0.015]">
        <div className="h-9 w-9 rounded-xl bg-white/[0.04] animate-pulse shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-4 w-32 rounded bg-white/[0.04] animate-pulse" />
          <div className="h-2.5 w-48 rounded bg-white/[0.03] animate-pulse" />
        </div>
      </div>
      <div>
        {Array.from({ length: FREE_LIMIT }).map((_, j) => (
          <div key={j} className={`flex items-start gap-3 py-3 px-4 ${j > 0 ? "border-t border-white/[0.04]" : ""}`}>
            <div className="h-3 w-4 rounded bg-white/[0.03] animate-pulse shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-36 rounded bg-white/[0.04] animate-pulse" />
              <div className="h-2.5 w-48 rounded bg-white/[0.03] animate-pulse" />
            </div>
            <div className="space-y-1 shrink-0">
              <div className="h-5 w-12 rounded bg-white/[0.03] animate-pulse" />
              <div className="h-3 w-10 rounded bg-white/[0.02] animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CurrentWeekPage() {
  const { isPremium, isAdmin, loading: authLoading } = useAuth();
  const hasFullAccess = isPremium || isAdmin;
  const data = useRoundData();

  const topCaptain = data.captains[0] ?? null;
  const topValue   = data.buyValuePicks[0] ?? null;
  const topTrap    = data.trapFadeAlerts[0] ?? null;

  return (
    <>
      <Helmet>
        <title>AFL Fantasy Current Week Picks | Neeko Sports Stats</title>
        <meta
          name="description"
          content="AFL Fantasy weekly calls — captain picks, buy and value picks, and trap alerts for the current round."
        />
        <link rel="canonical" href="https://neekostats.com.au/fantasy/current-week" />
        <meta property="og:url" content="https://neekostats.com.au/fantasy/current-week" />
        <meta property="og:title" content="AFL Fantasy Current Week Picks | Neeko Sports Stats" />
        <meta name="twitter:title" content="AFL Fantasy Current Week Picks | Neeko Sports Stats" />
      </Helmet>

      <div className="min-h-screen bg-[#05070A] text-white overflow-x-hidden">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-16 sm:pb-24">

          {/* ── Hero ────────────────────────────────────────────────────────── */}
          <div className="mb-8 sm:mb-10">
            <div className="flex items-center gap-2 mb-5">
              <span className="inline-flex items-center gap-1.5">
                <Zap className="h-3 w-3 text-emerald-500/60" aria-hidden />
                <span className="text-[9px] font-[900] tracking-[0.46em] uppercase text-emerald-500/60">
                  Fantasy Hub
                </span>
              </span>
              {data.roundLabel && !data.loading && (
                <>
                  <span className="text-white/15 text-[9px]">·</span>
                  <span className="text-[9px] font-[700] tracking-[0.2em] uppercase text-white/28 bg-white/[0.04] px-2 py-0.5 rounded-full border border-white/[0.06]">
                    {data.roundLabel}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
              <div className="flex-1 min-w-0">
                <h1 className="text-[clamp(1.6rem,4.8vw,2.4rem)] font-[900] tracking-tight text-[#F5F5F5] leading-[1.15]">
                  This Round's AFL Fantasy
                  <br />
                  <span className="text-[#F5C84C]">Cheat Sheet</span>
                </h1>
              </div>
              {data.updatedAt && !data.loading && (
                <span className="text-[10px] text-white/18 shrink-0 pt-1.5 tabular-nums">
                  {fmtUpdatedAt(data.updatedAt)}
                </span>
              )}
            </div>

            <p className="text-[clamp(12px,1.8vw,14px)] text-white/38 leading-[1.75] max-w-[560px]">
              Live Neeko projections, captain calls, value targets and trap alerts for the current AFL Fantasy round.
            </p>
          </div>

          {/* ── Error state ─────────────────────────────────────────────────── */}
          {data.error && !data.loading && (
            <div className="rounded-2xl border border-white/[0.07] bg-[#0A0D12] px-6 py-10 text-center mb-8 shadow-[0_1px_24px_rgba(0,0,0,0.35)]">
              <p className="text-[13px] text-white/35">
                Could not load round data. Please try again later.
              </p>
            </div>
          )}

          {/* ── Summary cards ───────────────────────────────────────────────── */}
          {!data.error && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              {data.loading ? (
                <><SummaryCardSkeleton /><SummaryCardSkeleton /><SummaryCardSkeleton /></>
              ) : (
                <>
                  <CaptainLockCard player={topCaptain} />
                  <BestValueCard   player={topValue} />
                  <BiggestTrapCard player={topTrap} />
                </>
              )}
            </div>
          )}

          {/* ── Divider ─────────────────────────────────────────────────────── */}
          {!data.error && !data.loading && (
            <div className="flex items-center gap-4 mb-6">
              <div className="h-px flex-1 bg-white/[0.055]" />
              <span className="text-[9px] font-[800] tracking-[0.40em] uppercase text-white/20">Full picks</span>
              <div className="h-px flex-1 bg-white/[0.055]" />
            </div>
          )}

          {/* ── Section skeletons (shown while auth or data resolves) ────────── */}
          {(data.loading || authLoading) && (
            <div className="space-y-5">
              <SectionSkeleton />
              <SectionSkeleton />
              <SectionSkeleton />
            </div>
          )}

          {/* ── 3 sections ──────────────────────────────────────────────────── */}
          {!data.error && !data.loading && !authLoading && (
            <div className="space-y-5">

              {/* 1. Captain Picks */}
              <Section
                title="Captain Picks"
                description="Top projected scorers for the captain multiplier — ranked by Neeko projection."
                accentBar="bg-[#F5C84C]/50"
                headerIcon={<Crown className="h-4 w-4 text-[#F5C84C]/80" aria-hidden />}
                players={data.captains}
                isPremium={hasFullAccess}
                emptyMessage="Live data not available for this round yet."
                renderPlayer={(p, i) => {
                  const captScore = p.captain_score ?? getCaptainScore(p);
                  void getCaptainConfidence(captScore);
                  const tier: "LOCK" | "SAFE" | "POD" =
                    i === 0 ? "LOCK" : i < 3 ? "SAFE" : "POD";
                  const reason = getCaptainReason(p, tier);

                  return (
                    <EnrichedRow
                      key={p.player_id ?? i}
                      player={p}
                      rank={i + 1}
                      isFirst={i === 0}
                      nameBadge={<TierBadge tier={tier} />}
                      rightBadge={null}
                      metric={
                        p.projection != null
                          ? { value: fmt(p.projection, 0), label: "proj" }
                          : null
                      }
                      accentColor="text-[#F5C84C]"
                      reason={reason}
                    />
                  );
                }}
              />

              {/* 2. Buy / Value Picks */}
              <Section
                title="Buy / Value Picks"
                description="Players exceeding their breakeven with strong projected upside — trade targets and holds."
                accentBar="bg-emerald-500/50"
                headerIcon={<TrendingUp className="h-4 w-4 text-emerald-400/80" aria-hidden />}
                players={data.buyValuePicks}
                isPremium={hasFullAccess}
                emptyMessage="Live data not available for this round yet."
                renderPlayer={(p, i) => {
                  const reason = getBuyValueReason(p);

                  // Right badge: value score pill or action badge
                  const rightBadge =
                    p.value_score != null ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-[700] text-emerald-400 bg-emerald-500/[0.08] border border-emerald-500/20 tabular-nums">
                        +{fmt(p.value_score, 1)} val
                      </span>
                    ) : (
                      <ActionBadge action={p.action_canonical} />
                    );

                  // Main metric: prefer price over projection
                  const metric =
                    p.price != null && p.price > 0
                      ? { value: fmtPrice(p.price), label: "price" }
                      : p.projection != null
                      ? { value: fmt(p.projection, 0), label: "proj" }
                      : null;

                  return (
                    <EnrichedRow
                      key={p.player_id ?? i}
                      player={p}
                      rank={i + 1}
                      isFirst={i === 0}
                      nameBadge={null}
                      rightBadge={rightBadge}
                      metric={metric}
                      accentColor="text-emerald-400"
                      reason={reason}
                    />
                  );
                }}
              />

              {/* 3. Trap / Fade Alerts */}
              <Section
                title="Trap / Fade Alerts"
                description="Overpriced or underperforming players to avoid or trade out before the round locks."
                accentBar="bg-red-500/50"
                headerIcon={<ShieldAlert className="h-4 w-4 text-red-400/80" aria-hidden />}
                players={data.trapFadeAlerts}
                isPremium={hasFullAccess}
                emptyMessage="Live data not available for this round yet."
                renderPlayer={(p, i) => {
                  const reason = getTrapFadeReason(p);

                  const edge =
                    p.edge_canonical ??
                    (((p.projection ?? 0) - (p.breakeven ?? 0)) || null);
                  const edgeStr =
                    edge != null && !isNaN(edge)
                      ? `${edge > 0 ? "+" : ""}${Math.round(edge)}`
                      : null;

                  const rightBadge = <ActionBadge action={p.action_canonical} />;

                  const metric = edgeStr
                    ? { value: edgeStr, label: "edge" }
                    : p.projection != null
                    ? { value: fmt(p.projection, 0), label: "proj" }
                    : null;

                  return (
                    <EnrichedRow
                      key={p.player_id ?? i}
                      player={p}
                      rank={i + 1}
                      isFirst={i === 0}
                      nameBadge={null}
                      rightBadge={rightBadge}
                      metric={metric}
                      accentColor="text-red-400"
                      reason={reason}
                    />
                  );
                }}
              />

            </div>
          )}

          {/* ── Footer CTAs ──────────────────────────────────────────────────── */}
          {!data.loading && !authLoading && !data.error && (
            <div className="mt-6 space-y-3">
              <div className="rounded-2xl border border-white/[0.07] bg-[#0A0D12] px-5 py-4 flex items-center gap-4 shadow-[0_1px_24px_rgba(0,0,0,0.35)]">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-[700] text-white/72 leading-tight">Need a Start/Sit decision?</p>
                  <p className="text-[11px] text-white/30 mt-0.5">
                    Get a personalised call for any two players you're comparing.
                  </p>
                </div>
                <Link
                  to="/fantasy/start-sit"
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.04] px-4 py-2 text-[12px] font-[700] text-white/60 hover:text-white/85 hover:border-white/[0.18] hover:bg-white/[0.07] transition-colors"
                >
                  Start/Sit Tool
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden />
                </Link>
              </div>

              {!hasFullAccess && (
                <div className="rounded-2xl border border-[#F5C84C]/20 bg-[#0A0D12] px-5 py-4 flex items-center gap-4 shadow-[0_1px_24px_rgba(0,0,0,0.35)] relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-[#F5C84C]/[0.03] to-transparent pointer-events-none" />
                  <div className="relative flex items-center justify-center h-9 w-9 rounded-xl bg-[#F5C84C]/[0.08] border border-[#F5C84C]/20 shrink-0">
                    <Crown className="h-4 w-4 text-[#F5C84C]/70" aria-hidden />
                  </div>
                  <div className="relative flex-1 min-w-0">
                    <p className="text-[13px] font-[700] text-white/75 leading-tight">Unlock all picks with Neeko+</p>
                    <p className="text-[11px] text-white/30 mt-0.5">
                      See every captain option, value target, and trap alert for this round.
                    </p>
                  </div>
                  <Link
                    to="/neeko-plus"
                    className="relative shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-[#F5C84C]/30 bg-[#F5C84C]/[0.10] px-4 py-2 text-[12px] font-[700] text-[#F5C84C] hover:bg-[#F5C84C]/[0.18] hover:border-[#F5C84C]/48 transition-colors"
                  >
                    Upgrade
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  </Link>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
