import { useState, useEffect } from "react";
import { ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { nameToSlug } from "@/lib/slugs";
import { RankingRow } from "./types";
import { fmtPrice, getConfidenceColor } from "./helpers";

// ─── Tiny sparkline drawn with SVG ────────────────────────────────────────────

function MiniSparkline({
  points,
  color,
}: {
  points: number[];
  color: "green" | "red" | "neutral";
}) {
  if (points.length < 2) return null;

  const W = 160;
  const H = 56;
  const PAD = 4;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const xs = points.map((_, i) => PAD + (i / (points.length - 1)) * (W - PAD * 2));
  const ys = points.map((v) => H - PAD - ((v - min) / range) * (H - PAD * 2));

  const pathD = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const areaD = `${pathD} L${xs[xs.length - 1].toFixed(1)},${H} L${xs[0].toFixed(1)},${H} Z`;

  const stroke = color === "green" ? "#4ade80" : color === "red" ? "#f87171" : "#94a3b8";
  const fillStart = color === "green" ? "rgba(74,222,128,0.18)" : color === "red" ? "rgba(248,113,113,0.18)" : "rgba(148,163,184,0.12)";

  const lastX = xs[xs.length - 1];
  const lastY = ys[ys.length - 1];

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none" className="overflow-visible">
      <defs>
        <linearGradient id={`sg-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillStart} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#sg-${color})`} />
      <path d={pathD} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="3" fill={stroke} />
    </svg>
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
        const { data } = await supabase.rpc("get_player_score_history_by_id", {
          p_player_id: row.player_id,
          p_limit: 10,
        });

        if (!cancelled && data && Array.isArray(data)) {
          const pts = (data as any[])
            .filter((d: any) => d.fantasy_points != null && !d.is_future)
            .map((d: any) => Number(d.fantasy_points));
          setScoreHistory(pts.slice(-8));
        }
      } catch {
        // silently ignore — sparkline is non-critical
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [row.player_id]);

  // Derived values
  const proj = row.projection_final != null ? Math.round(row.projection_final) : null;
  const be = row.breakeven != null ? Math.round(parseFloat(String(row.breakeven))) : null;
  const rawEdge = proj != null && be != null && !row.is_bye ? proj - be : null;
  const edgeSign = rawEdge != null
    ? (rawEdge > 40 ? "+40+" : rawEdge < -40 ? "-40+" : (rawEdge > 0 ? `+${rawEdge}` : String(rawEdge)))
    : null;

  const edgeLabel = rawEdge != null && edgeSign != null
    ? `${edgeSign} vs BE — ${rawEdge >= 15 ? "strong underpriced play" : rawEdge >= 5 ? "moderate edge" : rawEdge >= -5 ? "near breakeven" : "price risk"}`
    : null;

  const edgeHeadlineColor = rawEdge == null
    ? "text-white/50"
    : rawEdge >= 15 ? "text-emerald-400"
    : rawEdge >= 5 ? "text-green-300"
    : rawEdge >= -5 ? "text-white/70"
    : "text-red-400";

  const sparkColor: "green" | "red" | "neutral" =
    rawEdge != null && rawEdge >= 5 ? "green"
    : rawEdge != null && rawEdge < -5 ? "red"
    : "neutral";

  const aiText = row.long ?? row.why ?? null;

  const confidence = row.projection_confidence != null ? Math.round(row.projection_confidence) : null;
  const price = row.price != null ? fmtPrice(row.price) : null;
  const rating = row.neeko_rating != null ? Number(row.neeko_rating).toFixed(0) : null;
  const confColor = getConfidenceColor(confidence);

  // Trend icon
  const TrendIcon = rawEdge == null
    ? Minus
    : rawEdge >= 5 ? TrendingUp
    : rawEdge < -5 ? TrendingDown
    : Minus;
  const trendIconColor = rawEdge == null
    ? "text-white/20"
    : rawEdge >= 5 ? "text-emerald-400"
    : rawEdge < -5 ? "text-red-400"
    : "text-white/30";

  function handleViewPlayer() {
    const slug = nameToSlug(row.player_name);
    navigate(`/afl/player/${slug}`);
  }

  return (
    <tr className="border-b border-white/[0.04] bg-[#0c0c0c]">
      <td colSpan={colSpan} className="px-4 pb-4 pt-0">
        <div className="ml-10 rounded-xl border border-white/[0.07] bg-[#111] p-4">
          <div className="flex flex-col gap-3">

            {/* Edge headline */}
            {edgeLabel && (
              <div className="flex items-center gap-2">
                <TrendIcon size={14} className={trendIconColor} />
                <p className={`text-sm font-semibold ${edgeHeadlineColor}`}>{edgeLabel}</p>
              </div>
            )}

            {/* Graph + AI text row */}
            <div className="flex items-start gap-4">

              {/* Sparkline */}
              <div className="shrink-0">
                <p className="text-[9px] text-white/25 uppercase tracking-wider mb-1.5">Last {scoreHistory.length} games</p>
                {historyLoading ? (
                  <div className="w-[160px] h-[56px] rounded bg-white/[0.03] animate-pulse" />
                ) : scoreHistory.length >= 2 ? (
                  <MiniSparkline points={scoreHistory} color={sparkColor} />
                ) : (
                  <div className="w-[160px] h-[56px] flex items-center justify-center">
                    <span className="text-[11px] text-white/20">No history</span>
                  </div>
                )}
                {!historyLoading && scoreHistory.length >= 2 && (
                  <div className="flex justify-between mt-1 w-[160px]">
                    <span className="text-[9px] text-white/20 tabular-nums">
                      {Math.min(...scoreHistory).toFixed(0)}
                    </span>
                    <span className="text-[9px] text-white/20 tabular-nums">
                      {Math.max(...scoreHistory).toFixed(0)}
                    </span>
                  </div>
                )}
              </div>

              {/* AI text */}
              {aiText && (
                <p className="text-[13px] text-white/50 leading-relaxed line-clamp-3 flex-1">
                  {aiText}
                </p>
              )}
              {!aiText && (
                <p className="text-[13px] text-white/25 leading-relaxed flex-1 italic">
                  AI analysis pending for this player.
                </p>
              )}
            </div>

            {/* Metrics row */}
            {(confidence != null || price != null || rating != null) && (
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

                {/* CTA — pushed to the right */}
                <div className="ml-auto">
                  <button
                    onClick={handleViewPlayer}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/55 hover:border-white/20 hover:text-white/80 transition-colors"
                  >
                    View full player analysis
                    <ExternalLink size={11} />
                  </button>
                </div>
              </div>
            )}

            {/* CTA only (no metrics) */}
            {confidence == null && price == null && rating == null && (
              <div className="flex justify-end border-t border-white/[0.05] pt-3">
                <button
                  onClick={handleViewPlayer}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/55 hover:border-white/20 hover:text-white/80 transition-colors"
                >
                  View full player analysis
                  <ExternalLink size={11} />
                </button>
              </div>
            )}

          </div>
        </div>
      </td>
    </tr>
  );
}
