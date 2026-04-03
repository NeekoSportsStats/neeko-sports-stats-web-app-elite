import { useState, useEffect } from "react";
import { ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  Area,
  AreaChart,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import { nameToSlug } from "@/lib/slugs";
import { RankingRow } from "./types";
import { fmtPrice, getConfidenceColor } from "./helpers";

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

interface FullSparklineProps {
  points: number[];
  color: "green" | "red" | "neutral";
  projection?: number | null;
}

function FullSparkline({ points, color, projection }: FullSparklineProps) {
  const stroke =
    color === "green" ? "#4ade80" :
    color === "red"   ? "#f87171" :
                        "#94a3b8";

  const gradientId = `spark-fill-${color}`;

  const data = points.map((v, i) => ({ game: i + 1, score: v }));

  const min = Math.min(...points);
  const max = Math.max(...points);
  const avg = points.reduce((a, b) => a + b, 0) / points.length;

  return (
    <div className="w-full" style={{ height: 80 }}>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
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

      {/* Min / avg / max labels */}
      <div className="flex justify-between mt-0.5 px-1">
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

export function ExpandedPlayerRow({ row, colSpan, isPremium, onUpgrade }: ExpandedPlayerRowProps) {
  const navigate = useNavigate();
  const [scoreHistory, setScoreHistory] = useState<number[]>([]);
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
          const pts = (data as any[])
            .filter((d: any) => d.fantasy_points != null)
            .map((d: any) => Number(d.fantasy_points));
          console.log(row.player_name, pts);
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
          const pts = [...fallback]
            .reverse()
            .map((d: any) => Number(d.fantasy_score));
          console.log(row.player_name, "(fallback)", pts);
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
  const proj = row.projection_final != null ? Math.round(row.projection_final) : null;
  const be   = row.breakeven != null ? Math.round(parseFloat(String(row.breakeven))) : null;
  const rawEdge = proj != null && be != null && !row.is_bye ? proj - be : null;

  const edgeSign = rawEdge != null
    ? (rawEdge > 40 ? "+40+" : rawEdge < -40 ? "-40+" : rawEdge > 0 ? `+${rawEdge}` : String(rawEdge))
    : null;

  const edgeLabel = rawEdge != null && edgeSign != null
    ? `${edgeSign} vs BE — ${
        rawEdge >= 15 ? "strong underpriced play"
        : rawEdge >= 5 ? "moderate edge"
        : rawEdge >= -5 ? "near breakeven"
        : "price risk"
      }`
    : null;

  const edgeHeadlineColor =
    rawEdge == null         ? "text-white/50"
    : rawEdge >= 15         ? "text-emerald-400"
    : rawEdge >= 5          ? "text-green-300"
    : rawEdge >= -5         ? "text-white/70"
    :                         "text-red-400";

  const sparkColor: "green" | "red" | "neutral" =
    rawEdge != null && rawEdge >= 5  ? "green"
    : rawEdge != null && rawEdge < -5 ? "red"
    :                                   "neutral";

  const aiText = row.long ?? row.why ?? null;

  const confidence = row.projection_confidence != null ? Math.round(row.projection_confidence) : null;
  const price      = row.price != null ? fmtPrice(row.price) : null;
  const rating     = row.neeko_rating != null ? Number(row.neeko_rating).toFixed(0) : null;
  const confColor  = getConfidenceColor(confidence);

  const TrendIcon =
    rawEdge == null  ? Minus
    : rawEdge >= 5   ? TrendingUp
    : rawEdge < -5   ? TrendingDown
    :                  Minus;

  const trendIconColor =
    rawEdge == null  ? "text-white/20"
    : rawEdge >= 5   ? "text-emerald-400"
    : rawEdge < -5   ? "text-red-400"
    :                  "text-white/30";

  function handleViewPlayer() {
    navigate(`/sports/afl/players/${nameToSlug(row.player_name)}`);
  }

  const hasMetrics = confidence != null || price != null || rating != null;

  return (
    <tr className="border-b border-white/[0.04] bg-[#0c0c0c]">
      <td colSpan={colSpan} className="px-4 pb-4 pt-0">
        <div className="ml-10 rounded-xl border border-white/[0.07] bg-[#111] p-4">
          <div className="flex flex-col gap-3">

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

            {/* 3. Full-width sparkline */}
            {(historyLoading || scoreHistory.length >= 3) && (
            <div className="w-full">
              <p className="text-[9px] text-white/25 uppercase tracking-wider mb-1.5">
                Last {historyLoading ? "—" : scoreHistory.length} games
              </p>

              {historyLoading ? (
                <div className="w-full rounded bg-white/[0.03] animate-pulse" style={{ height: 80 }} />
              ) : scoreHistory.length >= 3 ? (
                <FullSparkline points={scoreHistory} color={sparkColor} projection={proj} />
              ) : null}
            </div>
            )}

            {!historyLoading && scoreHistory.length < 3 && (
              <p className="text-[11px] text-white/20 italic">No recent games</p>
            )}

            {/* 4. Metrics row + CTA */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.05] pt-3">
              {confidence != null && (
                <div>
                  <p className="text-[10px] text-white/25 uppercase tracking-wide mb-0.5">Confidence</p>
                  <p className={`text-sm font-semibold tabular-nums ${confColor}`}>{confidence}%</p>
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
