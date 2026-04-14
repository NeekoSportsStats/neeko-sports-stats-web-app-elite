import { useState, useEffect } from "react";
import { Lock, Crown, ChevronDown } from "lucide-react";
import {
  ResponsiveContainer,
  Area,
  AreaChart,
  Tooltip,
  ReferenceLine,
  XAxis,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import { RankingRow } from "./types";
import {
  fmt,
  fmtPrice,
  getTrendWhyText,
  getValueScoreColor,
  fmtValueScore,
  getActionDisplayStyles,
  getCanonicalConfidenceStyles,
  formatCanonicalConfidenceLabel,
  FREE_FULL_ROWS,
  PREMIUM_INITIAL_ROWS,
} from "./helpers";

// ─── Sparkline ─────────────────────────────────────────────────────────────────

interface SparkPoint { score: number; label: string; }

function formatRoundLabel(week: number): string {
  if (week === 0) return "OR";
  if (week === 28) return "EF";
  if (week === 29) return "QF";
  if (week === 30) return "SF";
  if (week === 31) return "GF";
  return `R${week}`;
}

function SparkTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  const label = payload[0]?.payload?.label;
  return (
    <div className="rounded-md border border-white/10 bg-[#181818] px-2 py-1 shadow-lg">
      {label && <p className="text-[9px] text-white/30 mb-0.5">{label}</p>}
      <p className="text-sm font-bold text-white tabular-nums">{val != null ? Math.round(val) : "—"}</p>
    </div>
  );
}

function MobileSparkline({ points, valueScore }: { points: SparkPoint[]; valueScore: number | null }) {
  const stroke =
    valueScore != null && valueScore >= 5 ? "#4ade80" :
    valueScore != null && valueScore < -5 ? "#f87171" :
    "#94a3b8";

  const scores = points.map((p) => p.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  const n = points.length;
  const tickIndices = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
  const tickFormatter = (_: string, index: number) =>
    tickIndices.includes(index) ? (points[index]?.label ?? "") : "";

  return (
    <div className="w-full" style={{ borderTop: "1px dashed rgba(255,255,255,0.08)" }}>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={points} margin={{ top: 4, right: 2, bottom: 16, left: 2 }}>
          <defs>
            <linearGradient id="mspark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.2} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <ReferenceLine y={avg} stroke={stroke} strokeOpacity={0.15} strokeDasharray="3 3" strokeWidth={1} />
          <XAxis
            dataKey="label"
            tickFormatter={tickFormatter}
            tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            interval={0}
            height={14}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke={stroke}
            strokeWidth={1.6}
            dot={false}
            activeDot={{ r: 3, fill: stroke, strokeWidth: 0 }}
            fill="url(#mspark)"
            isAnimationActive
            animationDuration={400}
            animationEasing="ease-out"
          />
          <Tooltip content={<SparkTooltip />} cursor={{ stroke, strokeOpacity: 0.2, strokeWidth: 1, strokeDasharray: "3 3" }} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex justify-between mt-0.5 px-0.5">
        <span className="text-[9px] text-white/20 tabular-nums">Low {Math.round(min)}</span>
        <span className="text-[9px] text-white/20 tabular-nums">Avg {Math.round(avg)}</span>
        <span className="text-[9px] text-white/20 tabular-nums">High {Math.round(max)}</span>
      </div>
    </div>
  );
}

// ─── Status badges ─────────────────────────────────────────────────────────────

function StatusBadges({ row }: { row: RankingRow }) {
  const badges = [];

  if (row.is_bye) {
    badges.push(
      <span key="bye" className="rounded-sm bg-[#F5C84C]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#F5C84C] uppercase tracking-wide border border-[#F5C84C]/25">BYE</span>
    );
  } else if (row.bye_next_round) {
    badges.push(
      <span key="byenext" className="rounded-sm bg-[#F5C84C]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[#F5C84C]/50 uppercase tracking-wide border border-[#F5C84C]/20">BYE R{row.bye_round}</span>
    );
  }

  const status = row.manual_status || row.status;
  if (status === "OUT" || status === "OMITTED") {
    badges.push(
      <span key="out" className="rounded-sm bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-red-400 uppercase tracking-wide border border-red-500/20">OUT</span>
    );
  } else if (status === "INJURED") {
    badges.push(
      <span key="inj" className="rounded-sm bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-red-400 uppercase tracking-wide border border-red-500/20">INJ</span>
    );
  } else if (status === "TEST") {
    badges.push(
      <span key="test" className="rounded-sm bg-orange-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-orange-400 uppercase tracking-wide border border-orange-500/20">TEST</span>
    );
  }

  return <>{badges}</>;
}

// ─── Action badge ─────────────────────────────────────────────────────────────

function ActionBadge({ row, isPremium, onUpgrade }: { row: RankingRow; isPremium: boolean; onUpgrade: () => void }) {
  if (!isPremium) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
        className="flex items-center gap-1 rounded-md border border-[#F5C84C]/30 bg-[#F5C84C]/[0.08] px-2 py-1"
      >
        <Lock size={8} className="text-[#F5C84C]/60" />
        <span className="text-[10px] font-semibold text-[#F5C84C]/70">Unlock</span>
      </button>
    );
  }

  const display = row.action_display ?? row.action ?? null;
  const label = display ?? "Hold";
  const cls = getActionDisplayStyles(label);
  return (
    <span className={`inline-block rounded-md border px-2 py-1 text-[11px] font-bold whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

// ─── Confidence bar ────────────────────────────────────────────────────────────

function ConfidenceBar({ row }: { row: RankingRow }) {
  const label = row.confidence_label ?? null;
  if (!label) return <span className="text-xs text-white/20">—</span>;

  const cls = getCanonicalConfidenceStyles(label);
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {formatCanonicalConfidenceLabel(label)}
    </span>
  );
}

// ─── Expanded card section ─────────────────────────────────────────────────────

function ExpandedSection({ row }: { row: RankingRow }) {
  const [history, setHistory] = useState<SparkPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      if (!row.player_id) { setLoading(false); return; }
      try {
        const { data, error } = await supabase.rpc("get_player_score_history_by_id", {
          player_id_in: String(row.player_id),
          n_games: 10,
        });
        if (error) throw error;
        if (!cancelled && data && Array.isArray(data) && data.length > 0) {
          const pts = (data as any[])
            .filter((d: any) => d.fantasy_points != null)
            .map((d: any) => ({
              score: Number(d.fantasy_points),
              label: d.round_label ?? formatRoundLabel(Number(d.round_number ?? 0)),
            }));
          setHistory(pts);
          return;
        }
        const { data: fallback } = await supabase
          .schema("afl" as any)
          .from("player_games")
          .select("week, fantasy_score, season")
          .eq("player_id", Number(row.player_id))
          .not("fantasy_score", "is", null)
          .gt("fantasy_score", 0)
          .order("season", { ascending: false })
          .order("week", { ascending: false })
          .limit(10);
        if (!cancelled && fallback && Array.isArray(fallback)) {
          const pts = [...fallback].reverse().map((d: any) => ({
            score: Number(d.fantasy_score),
            label: formatRoundLabel(Number(d.week ?? 0)),
          }));
          setHistory(pts);
        }
      } catch {
        // non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [row.player_id, row.player_name]);

  const valueScore = !row.is_bye && row.value_score != null ? row.value_score : null;
  const proj = row.projection != null ? Math.round(row.projection) : null;
  const be = row.breakeven != null ? Math.round(row.breakeven) : null;
  const confPct = row.projection_confidence != null ? Math.round(row.projection_confidence) : null;
  const confLabel = row.confidence_label ?? null;
  const price = row.price != null ? fmtPrice(row.price) : null;
  const aiText = row.why_long ?? row.why ?? null;

  return (
    <div className="mt-3 rounded-xl border border-white/[0.08] bg-[#111] p-4 flex flex-col gap-3">

      {/* AI analysis */}
      {aiText ? (
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-wide font-semibold mb-1">AI Analysis</p>
          <p className="text-[12px] text-white/55 leading-relaxed line-clamp-4">{aiText}</p>
        </div>
      ) : (
        <p className="text-[11px] text-white/20 italic">AI analysis pending for this player.</p>
      )}

      {/* Sparkline */}
      {(loading || history.length >= 3) && (
        <div className="border-t border-white/[0.05] pt-3">
          <p className="text-[10px] text-white/25 uppercase tracking-wide font-semibold mb-2">
            Last {loading ? "—" : history.length} games
          </p>
          {loading ? (
            <div className="w-full rounded bg-white/[0.03] animate-pulse" style={{ height: 80 }} />
          ) : history.length >= 3 ? (
            <MobileSparkline points={history} valueScore={valueScore} />
          ) : null}
        </div>
      )}
      {!loading && history.length < 3 && (
        <p className="text-[10px] text-white/20 italic border-t border-white/[0.05] pt-3">No recent games</p>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-2 border-t border-white/[0.05] pt-3">
        {confLabel != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-white/30">Confidence</span>
            <span className={`text-[12px] font-bold ${getCanonicalConfidenceStyles(confLabel).split(" ")[0]}`}>
              {formatCanonicalConfidenceLabel(confLabel)}
            </span>
          </div>
        )}
        {proj != null && !row.is_bye && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-white/30">Projection</span>
            <span className="text-[13px] font-bold text-[#F5C84C] tabular-nums">{proj}</span>
          </div>
        )}
        {be != null && !row.is_bye && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-white/30">Breakeven</span>
            <span className="text-[13px] font-bold text-white/60 tabular-nums">{be}</span>
          </div>
        )}
        {price != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-white/30">Price</span>
            <span className="text-[13px] font-bold text-white/60 tabular-nums">{price}</span>
          </div>
        )}
        {valueScore != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-white/30">Value</span>
            <span className={`text-[13px] font-bold tabular-nums ${getValueScoreColor(valueScore)}`}>
              {fmtValueScore(valueScore)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Player card ───────────────────────────────────────────────────────────────

interface PlayerCardProps {
  row: RankingRow;
  idx: number;
  isPremium: boolean;
  onTap: () => void;
  onUpgrade: () => void;
}

function PlayerCard({ row, idx, isPremium, onTap, onUpgrade }: PlayerCardProps) {
  const [expanded, setExpanded] = useState(false);
  const rank = idx + 1;
  const isTop3 = rank <= 3;

  const proj = row.projection;
  const valueScore = !row.is_bye && row.value_score != null ? row.value_score : null;
  const whyText = row.why ?? getTrendWhyText(row);

  const trendScore = row.trend_score;
  const trendDisplay =
    trendScore == null ? null :
    trendScore > 40 ? "+40+" :
    trendScore < -40 ? "-40+" :
    trendScore > 0 ? `+${trendScore.toFixed(1)}` :
    trendScore.toFixed(1);

  const l3 = row.last_3_avg;
  const avg = row.season_avg ?? row.last_5_avg;
  const formDelta = l3 != null && avg != null && avg !== 0 ? l3 - avg : null;
  const formLabel =
    formDelta == null ? null :
    formDelta >= 12 ? "HOT" :
    formDelta >= 4 ? "RISING" :
    formDelta > -4 ? "NEUTRAL" :
    formDelta > -12 ? "DROPPING" : "COLD";
  const formColor =
    formDelta == null ? "text-white/30" :
    formDelta >= 12 ? "text-orange-300 font-bold" :
    formDelta >= 4 ? "text-green-300 font-semibold" :
    formDelta > -4 ? "text-white/40" :
    formDelta > -12 ? "text-sky-400 font-semibold" :
    "text-sky-300 font-bold";

  function handleTap() {
    if (isPremium) {
      setExpanded((e) => !e);
    } else {
      onTap();
    }
  }

  return (
    <div
      className={`rounded-xl border bg-[#0e0e0e] p-4 flex flex-col gap-2.5 active:bg-white/[0.03] transition-colors cursor-pointer ${
        isTop3 ? "border-[#F5C84C]/15" : "border-white/[0.07]"
      }`}
      onClick={handleTap}
      style={{ touchAction: "manipulation" }}
    >
      {/* Row 1 — rank + name + action badge */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className={`text-xs tabular-nums w-5 shrink-0 text-right ${isTop3 ? "text-[#F5C84C]/70 font-bold" : "text-white/25"}`}>
            {rank}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[14px] font-semibold leading-tight truncate ${isTop3 ? "text-white" : "text-white/90"}`}>
                {row.player_name}
              </span>
              <StatusBadges row={row} />
            </div>
            <p className="text-[11px] text-white/35 mt-0.5 leading-none">
              {row.team}{row.position ? ` · ${row.position}` : ""}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <ActionBadge row={row} isPremium={isPremium} onUpgrade={onUpgrade} />
        </div>
      </div>

      {/* Row 2 — Proj | Confidence | Value | Trend | Form */}
      <div className="flex items-center gap-0 pl-7 flex-wrap">
        <div className="flex flex-col items-start pr-3">
          <span className="text-[10px] text-white/35 leading-none mb-0.5">Proj</span>
          <span className="text-[14px] font-bold text-[#F5C84C] tabular-nums">
            {row.is_bye ? "—" : fmt(proj, 0)}
          </span>
        </div>

        {row.confidence_label != null && (
          <>
            <span className="text-white/15 text-sm px-1.5">|</span>
            <div className="flex flex-col items-start px-2">
              <span className="text-[10px] text-white/35 leading-none mb-0.5">Conf</span>
              <ConfidenceBar row={row} />
            </div>
          </>
        )}

        {valueScore != null && (
          <>
            <span className="text-white/15 text-sm px-1.5">|</span>
            <div className="flex flex-col items-start px-2">
              <span className="text-[10px] text-white/35 leading-none mb-0.5">Value</span>
              <span className={`text-[13px] font-semibold tabular-nums ${getValueScoreColor(valueScore)}`}>
                {fmtValueScore(valueScore)}
              </span>
            </div>
          </>
        )}

        {trendDisplay != null && !row.is_bye && (
          <>
            <span className="text-white/15 text-sm px-1.5">|</span>
            <div className="flex flex-col items-start px-2">
              <span className="text-[10px] text-white/35 leading-none mb-0.5">Trend</span>
              <span className={`text-[12px] tabular-nums ${
                (trendScore ?? 0) >= 20 ? "text-emerald-400 font-bold" :
                (trendScore ?? 0) >= 8 ? "text-green-300 font-semibold" :
                (trendScore ?? 0) >= -5 ? "text-white/40" :
                (trendScore ?? 0) >= -15 ? "text-orange-400 font-semibold" :
                "text-red-400 font-bold"
              }`}>
                {trendDisplay}
              </span>
            </div>
          </>
        )}

        {formLabel != null && (
          <>
            <span className="text-white/15 text-sm px-1.5">|</span>
            <div className="flex flex-col items-start px-2">
              <span className="text-[10px] text-white/35 leading-none mb-0.5">Form</span>
              <span className={`text-[11px] ${formColor}`}>{formLabel}</span>
            </div>
          </>
        )}
      </div>

      {/* Row 3 — Why text + expand affordance */}
      {isPremium ? (
        <div className="pl-7 flex items-start justify-between gap-2">
          <span className="text-[12px] text-white/45 leading-snug line-clamp-2 max-w-[240px]">
            {whyText || <span className="italic text-white/20">—</span>}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-white/25">{expanded ? "Collapse" : "Details"}</span>
            <ChevronDown
              size={12}
              className={`text-white/20 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
          </div>
        </div>
      ) : (
        <p className="pl-7 text-[11px] text-white/25 leading-snug">
          AI insight locked —{" "}
          <button
            onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
            className="text-[#F5C84C]/50 hover:text-[#F5C84C]/80 transition-colors underline underline-offset-2"
          >
            unlock
          </button>
        </p>
      )}

      {/* Expanded section */}
      {expanded && isPremium && <ExpandedSection row={row} />}
    </div>
  );
}

// ─── Locked card ───────────────────────────────────────────────────────────────

function LockedCard({ idx, onUpgrade }: { idx: number; onUpgrade: () => void }) {
  return (
    <div
      className="rounded-xl border border-white/[0.04] bg-[#0e0e0e] p-4 cursor-pointer flex items-center gap-3"
      onClick={onUpgrade}
      style={{ touchAction: "manipulation" }}
    >
      <span className="text-xs text-white/20 w-5 tabular-nums shrink-0">{idx + 1}</span>
      <Lock size={12} className="text-white/15 shrink-0" />
      <div className="flex-1">
        <div className="h-3 w-28 bg-white/[0.06] rounded mb-1.5" />
        <div className="h-2 w-16 bg-white/[0.04] rounded" />
      </div>
      <span className="text-[10px] font-semibold text-[#F5C84C]/40 shrink-0">Unlock</span>
    </div>
  );
}

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function SkeletonCards() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/[0.04] bg-[#0e0e0e] p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-start gap-2.5 flex-1">
              <div className="h-3 w-4 animate-pulse rounded bg-white/[0.08] mt-0.5" />
              <div>
                <div className="h-4 w-28 animate-pulse rounded bg-white/10 mb-1.5" />
                <div className="h-2.5 w-16 animate-pulse rounded bg-white/[0.06]" />
              </div>
            </div>
            <div className="h-6 w-16 animate-pulse rounded-md bg-white/[0.08]" />
          </div>
          <div className="flex gap-4 pl-7">
            {[48, 40, 48].map((w, j) => (
              <div key={j} className="flex flex-col gap-1">
                <div className="h-2 w-8 animate-pulse rounded bg-white/5" />
                <div className="h-4 animate-pulse rounded bg-white/[0.08]" style={{ width: w }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Conversion wall ───────────────────────────────────────────────────────────

export function MobileConversionWall({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="py-4">
      <div
        className="flex flex-col items-center gap-3 rounded-xl border border-[#F5C84C]/25 bg-gradient-to-b from-[#F5C84C]/[0.07] to-[#0a0a0a] px-5 py-8 text-center cursor-pointer"
        onClick={onUpgrade}
      >
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#F5C84C]/15 border border-[#F5C84C]/30">
          <Crown size={18} className="text-[#F5C84C]" />
        </div>
        <div>
          <p className="text-base font-bold text-white leading-snug">Full rankings unlocked with Neeko+</p>
          <p className="text-sm text-white/45 mt-1.5 leading-relaxed">AI analysis, value scores &amp; edge signals for every player</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[#F5C84C] hover:brightness-110 px-6 py-2.5 text-sm font-bold text-[#070707] transition-all"
        >
          <Crown size={13} />
          Unlock Full Rankings
        </button>
        <span className="text-[11px] text-white/30">From $5.99/wk · Cancel anytime</span>
      </div>
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

interface MobileRankingsTableProps {
  rows: RankingRow[];
  loading: boolean;
  isPremium: boolean;
  onOpenRow: (row: RankingRow, idx: number) => void;
  onUpgrade: () => void;
}

const SHOW_MORE_STEP = 50;

export function MobileRankingsTable({
  rows,
  loading,
  isPremium,
  onOpenRow,
  onUpgrade,
}: MobileRankingsTableProps) {
  const [visibleCount, setVisibleCount] = useState(PREMIUM_INITIAL_ROWS);

  useEffect(() => {
    setVisibleCount(PREMIUM_INITIAL_ROWS);
  }, [rows]);

  const visibleRows = isPremium
    ? rows.slice(0, visibleCount)
    : rows.slice(0, FREE_FULL_ROWS);

  const hasMore = isPremium && visibleCount < rows.length;

  return (
    <div className="w-full pb-[80px]">
      {loading ? (
        <SkeletonCards />
      ) : (
        <div className="flex flex-col gap-2">
          {visibleRows.map((row, idx) => (
            <PlayerCard
              key={row.player_id ?? row.player_name}
              row={row}
              idx={idx}
              isPremium={isPremium}
              onTap={() => onOpenRow(row, idx)}
              onUpgrade={onUpgrade}
            />
          ))}

          {!isPremium && rows.length > FREE_FULL_ROWS && (
            <>
              {Array.from({ length: 5 }).map((_, i) => (
                <LockedCard key={i} idx={FREE_FULL_ROWS + i} onUpgrade={onUpgrade} />
              ))}
            </>
          )}
        </div>
      )}

      {!loading && hasMore && (
        <div className="pt-3">
          <button
            onClick={() => setVisibleCount((c) => Math.min(c + SHOW_MORE_STEP, rows.length))}
            className="w-full py-3 rounded-xl border border-white/10 text-xs font-semibold text-white/50 hover:border-white/20 hover:text-white/70 active:bg-white/[0.03] transition-all"
          >
            Show More ({visibleRows.length} of {rows.length} players)
          </button>
        </div>
      )}

      {!loading && isPremium && !hasMore && rows.length > PREMIUM_INITIAL_ROWS && (
        <div className="pt-3 pb-1">
          <p className="text-center text-[11px] text-white/25">All {rows.length} players loaded</p>
        </div>
      )}

      {!isPremium && !loading && (
        <MobileConversionWall onUpgrade={onUpgrade} />
      )}
    </div>
  );
}
