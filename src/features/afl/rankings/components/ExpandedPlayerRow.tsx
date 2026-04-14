import { useState, useEffect } from "react";
import { ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  Area,
  AreaChart,
  Tooltip,
  ReferenceLine,
  XAxis,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import { nameToSlug } from "@/lib/slugs";
import { RankingRow } from "./types";
import {
  fmtPrice,
  getConfidenceColor,
  getValueBandStyles,
  getCanonicalConfidenceStyles,
  formatCanonicalConfidenceLabel,
  fmtDecisionScore,
  getDecisionScoreColor,
} from "./helpers";

// ─── Custom tooltip ────────────────────────────────────────────────────────────

function SparkTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  return (
    <div className="rounded-md border border-white/10 bg-[#181818] px-2.5 py-1.5 shadow-lg">
      <p className="text-[11px] text-white/40 uppercase tracking-wide mb-0.5">Score</p>
      <p className="text-sm font-bold text-white tabular-nums">{val != null ? Math.round(val) : "—"}</p>
    </div>
  );
}

// ─── Full-width interactive sparkline ─────────────────────────────────────────

interface SparkPoint { score: number; label: string; }

interface FullSparklineProps {
  points: SparkPoint[];
  color: "green" | "red" | "neutral";
  projection?: number | null;
}

function FullSparkline({ points, color, projection }: FullSparklineProps) {
  const stroke =
    color === "green" ? "#4ade80" :
    color === "red"   ? "#f87171" :
                        "#94a3b8";

  const gradientId = `spark-fill-${color}`;
  const scores = points.map((p) => p.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const tickIndices: number[] = points.length <= 1 ? [0] : isMobile
    ? [0, Math.floor((points.length - 1) / 2), points.length - 1]
    : points.map((_, i) => i);

  const tickFormatter = (_: string, index: number) =>
    tickIndices.includes(index) ? points[index]?.label ?? "" : "";

  return (
    <div className="w-full">
      <div style={{ borderTop: "1px dashed rgba(255,255,255,0.08)" }}>
        <ResponsiveContainer width="100%" height={70}>
          <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 8, left: 4 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={stroke} stopOpacity={0.22} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>

            <ReferenceLine
              y={avg}
              stroke={stroke}
              strokeOpacity={0.15}
              strokeDasharray="4 4"
              strokeWidth={1}
            />

            <XAxis
              dataKey="label"
              tickFormatter={tickFormatter}
              tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              interval={0}
              height={16}
            />

            <Area
              type="monotone"
              dataKey="score"
              stroke={stroke}
              strokeWidth={1.8}
              dot={false}
              activeDot={{ r: 4, fill: stroke, strokeWidth: 0 }}
              fill={`url(#${gradientId})`}
              isAnimationActive
              animationDuration={500}
              animationEasing="ease-out"
            />

            <Tooltip
              content={<SparkTooltip />}
              cursor={{ stroke: stroke, strokeOpacity: 0.25, strokeWidth: 1, strokeDasharray: "3 3" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-between mt-1 px-1 border-t border-white/5 pt-1">
        <span className="text-[9px] text-white/20 tabular-nums">Low {Math.round(min)}</span>
        <span className="text-[9px] text-white/20 tabular-nums">Avg {Math.round(avg)}</span>
        <span className="text-[9px] text-white/20 tabular-nums">High {Math.round(max)}</span>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface ExpandedPlayerRowProps {
  row: RankingRow;
  colSpan: number;
  isPremium: boolean;
  onUpgrade: () => void;
}

function formatRoundLabel(week: number): string {
  if (week === 0) return "OR";
  if (week === 28) return "EF";
  if (week === 29) return "QF";
  if (week === 30) return "SF";
  if (week === 31) return "GF";
  return `R${week}`;
}

export function ExpandedPlayerRow({ row, colSpan, isPremium, onUpgrade }: ExpandedPlayerRowProps) {
  const navigate = useNavigate();
  const [scoreHistory, setScoreHistory] = useState<SparkPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setHistoryLoading(true);
      if (!row.player_id) {
        setHistoryLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc("get_player_score_history_by_id", {
          player_id_in: String(row.player_id),
          n_games: 10,
        });

        if (error) throw error;

        if (!cancelled && data && Array.isArray(data) && data.length > 0) {
          const pts: SparkPoint[] = (data as any[])
            .filter((d: any) => d.fantasy_points != null)
            .map((d: any) => ({
              score: Number(d.fantasy_points),
              label: d.round_label ?? formatRoundLabel(Number(d.round_number ?? 0)),
            }));
          setScoreHistory(pts);
          return;
        }

        // Fallback: query afl.player_games directly
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
          const pts: SparkPoint[] = [...fallback]
            .reverse()
            .map((d: any) => ({
              score: Number(d.fantasy_score),
              label: formatRoundLabel(Number(d.week ?? 0)),
            }));
          setScoreHistory(pts);
        }
      } catch {
        // sparkline is non-critical — fail silently
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [row.player_id, row.player_name]);

  // Derived values
  const scoreCount = scoreHistory.length;
  const proj = row.projection != null ? Math.round(row.projection) : null;
  const be = row.breakeven != null ? Math.round(row.breakeven) : null;
  const rawValue = !row.is_bye && row.value_score != null ? row.value_score : null;

  const valueSign = rawValue != null
    ? (rawValue > 40 ? "+40+" : rawValue < -40 ? "-40+" : rawValue > 0 ? `+${Math.round(rawValue)}` : String(Math.round(rawValue)))
    : null;

  const edgeLabel = rawValue != null && valueSign != null
    ? `${valueSign} vs Baseline — ${
        rawValue >= 15 ? "strong underpriced play"
        : rawValue >= 5 ? "moderate edge"
        : rawValue >= -5 ? "near breakeven"
        : "price risk"
      }`
    : null;

  const edgeHeadlineColor =
    rawValue == null        ? "text-white/50"
    : rawValue >= 15        ? "text-emerald-400"
    : rawValue >= 5         ? "text-green-300"
    : rawValue >= -5        ? "text-white/70"
    :                         "text-red-400";

  const sparkColor: "green" | "red" | "neutral" =
    rawValue != null && rawValue >= 5  ? "green"
    : rawValue != null && rawValue < -5 ? "red"
    :                                    "neutral";

  const aiText = row.why_long ?? row.why ?? null;

  const confidence = row.projection_confidence != null ? Math.round(row.projection_confidence) : null;
  const price      = row.price != null ? fmtPrice(row.price) : null;
  const rating     = row.neeko_rating != null ? Number(row.neeko_rating).toFixed(0) : null;
  const confColor  = getConfidenceColor(confidence);

  const TrendIcon =
    rawValue == null  ? Minus
    : rawValue >= 5   ? TrendingUp
    : rawValue < -5   ? TrendingDown
    :                   Minus;

  const trendIconColor =
    rawValue == null  ? "text-white/20"
    : rawValue >= 5   ? "text-emerald-400"
    : rawValue < -5   ? "text-red-400"
    :                   "text-white/30";

  function handleViewPlayer() {
    navigate(`/sports/afl/players/${nameToSlug(row.player_name)}`);
  }

  const hasMetrics = confidence != null || price != null || rating != null || row.confidence_label != null || row.value_band != null || row.decision_score != null;

  return (
    <tr className="border-b border-white/[0.04] bg-[#0c0c0c]">
      <td colSpan={colSpan} className="px-4 pb-4 pt-0">
        <div className="ml-10 rounded-xl border border-white/[0.07] bg-[#111] p-3">
          <div className="flex flex-col gap-2">

            {/* 1. Edge headline */}
            {edgeLabel && (
              <div className="flex items-center gap-2">
                <TrendIcon size={14} className={trendIconColor} />
                <p className={`text-sm font-semibold ${edgeHeadlineColor}`}>{edgeLabel}</p>
              </div>
            )}

            {/* 2. AI summary text */}
            {aiText ? (
              <p className="text-[13px] text-white/50 leading-relaxed line-clamp-3">
                {aiText}
              </p>
            ) : (
              <p className="text-[13px] text-white/25 leading-relaxed italic">
                AI analysis pending for this player.
              </p>
            )}

            {/* 2b. Premium reason signals */}
            {(row.action_reason_1 || row.action_reason_2) && (
              <div className="flex flex-col gap-1">
                {row.action_reason_1 && (
                  <p className="text-[11px] text-white/35 leading-snug">
                    <span className="text-white/20 mr-1">&#x25BA;</span>{row.action_reason_1}
                  </p>
                )}
                {row.action_reason_2 && (
                  <p className="text-[11px] text-white/35 leading-snug">
                    <span className="text-white/20 mr-1">&#x25BA;</span>{row.action_reason_2}
                  </p>
                )}
              </div>
            )}

            {/* 3. Full-width sparkline */}
            {(historyLoading || scoreCount >= 3) && (
            <div className="w-full">
              <p className="text-[9px] text-white/25 uppercase tracking-wider mb-1">
                Last {historyLoading ? "—" : scoreCount} games
              </p>

              {historyLoading ? (
                <div className="w-full rounded bg-white/[0.03] animate-pulse" style={{ height: 78 }} />
              ) : scoreCount >= 3 ? (
                <FullSparkline points={scoreHistory} color={sparkColor} projection={proj} />
              ) : null}
            </div>
            )}

            {!historyLoading && scoreCount < 3 && (
              <p className="text-[11px] text-white/20 italic">No recent games</p>
            )}

            {/* 4. Metrics row + CTA */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.05] pt-3">
              {row.confidence_label ? (
                <div>
                  <p className="text-[10px] text-white/25 uppercase tracking-wide mb-0.5">Confidence</p>
                  <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold ${getCanonicalConfidenceStyles(row.confidence_label)}`}>
                    {formatCanonicalConfidenceLabel(row.confidence_label)}
                  </span>
                </div>
              ) : confidence != null ? (
                <div>
                  <p className="text-[10px] text-white/25 uppercase tracking-wide mb-0.5">Confidence</p>
                  <p className={`text-sm font-semibold tabular-nums ${confColor}`}>{confidence}%</p>
                </div>
              ) : null}
              {row.value_band && (
                <div>
                  <p className="text-[10px] text-white/25 uppercase tracking-wide mb-0.5">Value</p>
                  <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold ${getValueBandStyles(row.value_band)}`}>
                    {row.value_band}
                  </span>
                </div>
              )}
              {row.decision_score != null && (
                <div>
                  <p className="text-[10px] text-white/25 uppercase tracking-wide mb-0.5">Decision Score</p>
                  <p className={`text-sm font-semibold tabular-nums ${getDecisionScoreColor(row.decision_score)}`}>
                    {fmtDecisionScore(row.decision_score)}
                  </p>
                </div>
              )}
              {price != null && (
                <div>
                  <p className="text-[10px] text-white/25 uppercase tracking-wide mb-0.5">Price</p>
                  <p className="text-sm font-semibold text-white/80 tabular-nums">{price}</p>
                </div>
              )}
              {rating != null && (
                <div>
                  <p className="text-[10px] text-white/25 uppercase tracking-wide mb-0.5">Neeko Rating</p>
                  <p className="text-sm font-semibold text-white/80 tabular-nums">{rating}</p>
                </div>
              )}

              <div className={hasMetrics ? "ml-auto" : "w-full flex justify-end"}>
                <button
                  onClick={handleViewPlayer}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/55 hover:border-white/20 hover:text-white/80 transition-colors"
                >
                  View full player analysis
                  <ExternalLink size={11} />
                </button>
              </div>
            </div>

          </div>
        </div>
      </td>
    </tr>
  );
}
