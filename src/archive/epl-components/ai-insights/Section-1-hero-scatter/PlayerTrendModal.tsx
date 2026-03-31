import React, { useEffect, useMemo, useState } from "react";
import { Lock, X } from "lucide-react";
import type { LensKey, PlayerPoint, PlayerTrendPoint } from "./usePlayerScatterData";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function mean(vals: number[]) {
  if (!vals.length) return 0;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function stdev(vals: number[]) {
  if (!vals.length) return 0;
  const m = mean(vals);
  const v = vals.reduce((s, x) => s + (x - m) * (x - m), 0) / Math.max(1, vals.length - 1);
  return Math.sqrt(v);
}

function asSeries(trend?: PlayerTrendPoint[]) {
  const t = trend?.length ? trend : [];
  const xs = t.map((_, i) => i);
  const ys = t.map((p) => p.value);
  return { xs, ys, t };
}

function pathFrom(ys: number[], w: number, h: number, pad: number) {
  if (!ys.length) return "";
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scaleX = (i: number) => pad + (i / Math.max(1, ys.length - 1)) * (w - pad * 2);
  const scaleY = (v: number) => pad + (1 - (v - minY) / Math.max(1, maxY - minY)) * (h - pad * 2);

  return ys
    .map((v, i) => `${i === 0 ? "M" : "L"} ${scaleX(i).toFixed(2)} ${scaleY(v).toFixed(2)}`)
    .join(" ");
}

export default function PlayerTrendModal(props: {
  open: boolean;
  onClose: () => void;
  player: PlayerPoint | null;
  allPlayers: PlayerPoint[];
  lens: LensKey;
  locked: boolean;
}) {
  const { open, onClose, player, allPlayers, locked, lens } = props;

  const [compareId, setCompareId] = useState<string>("");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!open) setCompareId("");
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  const compare = useMemo(
    () => allPlayers.find((p) => p.id === compareId) ?? null,
    [allPlayers, compareId]
  );

  const series = useMemo(() => asSeries(player?.trend), [player]);
  const series2 = useMemo(() => asSeries(compare?.trend), [compare]);

  const projection = useMemo(() => {
    const ys = series.ys;
    if (!ys.length) return { low: 0, mid: 0, high: 0 };
    const tail = ys.slice(-5);
    const m = mean(tail);
    const s = stdev(tail);
    const low = Math.round(clamp(m - 0.9 * s, 20, 140));
    const mid = Math.round(clamp(m, 20, 140));
    const high = Math.round(clamp(m + 0.9 * s, 20, 140));
    return { low, mid, high };
  }, [series.ys]);

  const aiLine = useMemo(() => {
    if (!player) return "";
    if (player.ceiling >= 85) return "Upside is strong, but week-to-week range is wide.";
    if (player.momentum >= 75) return "Role and output remain stable week-to-week.";
    return "Monitor role signals — current profile is sensitive to matchup conditions.";
  }, [player]);

  if (!open || !player || !player.trend || player.trend.length === 0) return null;

  const statLabel = lens === "fantasy" ? "Fantasy" : lens === "goals" ? "Goals" : lens === "assists" ? "Assists" : lens;

  const CH_W = 760;
  const CH_H = 340;
  const PAD = 28;

  const mainPath = pathFrom(series.ys, CH_W, CH_H, PAD);
  const comparePath = compare ? pathFrom(series2.ys, CH_W, CH_H, PAD) : "";

  const handleChartInteraction = (e: React.MouseEvent<SVGRectElement> | React.TouchEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const mouseX = clientX - rect.left;
    const chartWidth = rect.width;
    const plotWidth = chartWidth - (PAD * 2 * chartWidth / CH_W);
    const plotStartX = PAD * chartWidth / CH_W;
    const relativeX = mouseX - plotStartX;
    const normalized = clamp(relativeX / plotWidth, 0, 1);
    const idx = Math.round(normalized * Math.max(0, series.ys.length - 1));
    const clampedIdx = clamp(idx, 0, series.ys.length - 1);

    if (hoverIdx === clampedIdx) {
      setHoverIdx(null);
    } else {
      setHoverIdx(clampedIdx);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const chartWidth = rect.width;
    const plotWidth = chartWidth - (PAD * 2 * chartWidth / CH_W);
    const plotStartX = PAD * chartWidth / CH_W;
    const relativeX = mouseX - plotStartX;
    const normalized = clamp(relativeX / plotWidth, 0, 1);
    const idx = Math.round(normalized * Math.max(0, series.ys.length - 1));
    const clampedIdx = clamp(idx, 0, series.ys.length - 1);
    setHoverIdx(clampedIdx);
  };

  const handleMouseLeave = () => {
    setHoverIdx(null);
  };

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-3xl -translate-x-1/2 -translate-y-1/2">
        <div className="max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0b0b] shadow-2xl">
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Player Trend</div>
              <div className="mt-0.5 text-2xl font-semibold text-white">{player.name}</div>
              <div className="mt-0.5 text-sm text-white/55">Weekly {statLabel} output</div>
            </div>

            <button
              onClick={onClose}
              className="rounded-full border border-white/10 bg-black/20 p-2 text-white/70 hover:bg-white/5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1">
                <select
                  value={compareId}
                  onChange={(e) => setCompareId(e.target.value)}
                  disabled={locked}
                  className={`w-full rounded-xl border border-white/10 px-3 py-2 text-sm outline-none ${
                    locked
                      ? "bg-black/10 text-white/40 cursor-not-allowed"
                      : "bg-black/20 text-white/80"
                  }`}
                >
                  <option value="">Compare to another player…</option>
                  {allPlayers
                    .filter((p) => p.id !== player.id)
                    .slice(0, 40)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.teamName})
                      </option>
                    ))}
                </select>
                {locked && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <Lock className="h-3.5 w-3.5 text-white/40" />
                  </div>
                )}
              </div>
            </div>
            {locked && (
              <div className="mt-1.5 text-xs text-white/45">
                Neeko+ required to compare players
              </div>
            )}

            <div className="mt-2.5 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
              <div className="relative">
                <svg viewBox={`0 0 ${CH_W} ${CH_H}`} className="h-[320px] w-full">
                  {/* Horizontal grid lines */}
                  {Array.from({ length: 5 }).map((_, i) => {
                    const gy = PAD + ((CH_H - PAD * 2) / 4) * i;
                    return (
                      <line
                        key={i}
                        x1={PAD}
                        y1={gy}
                        x2={CH_W - PAD}
                        y2={gy}
                        stroke="rgba(255,255,255,0.08)"
                        strokeWidth={1}
                      />
                    );
                  })}

                  {/* Y-axis labels */}
                  {(() => {
                    const allVals = [...series.ys, ...(compare ? series2.ys : [])];
                    const min = Math.min(...allVals);
                    const max = Math.max(...allVals);
                    const mid = Math.round((min + max) / 2);
                    return (
                      <>
                        <text x={PAD - 8} y={PAD + 5} fill="rgba(255,255,255,0.48)" fontSize="10" textAnchor="end">
                          {Math.round(max)}
                        </text>
                        <text x={PAD - 8} y={PAD + (CH_H - PAD * 2) / 2 + 4} fill="rgba(255,255,255,0.48)" fontSize="10" textAnchor="end">
                          {mid}
                        </text>
                        <text x={PAD - 8} y={CH_H - PAD + 4} fill="rgba(255,255,255,0.48)" fontSize="10" textAnchor="end">
                          {Math.round(min)}
                        </text>
                      </>
                    );
                  })()}

                  {/* X-axis labels (rounds) */}
                  {player.trend && player.trend.slice(0, 12).map((pt, i) => {
                    const totalPoints = Math.min(player.trend.length, 12);
                    const xPos = PAD + ((CH_W - PAD * 2) / (totalPoints - 1)) * i;
                    return (
                      <text
                        key={i}
                        x={xPos}
                        y={CH_H - PAD + 16}
                        fill="rgba(255,255,255,0.48)"
                        fontSize="10"
                        textAnchor="middle"
                      >
                        {pt.week}
                      </text>
                    );
                  })}

                  {compare && (
                    <path
                      d={comparePath}
                      fill="none"
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth={3}
                      strokeDasharray="7 7"
                    />
                  )}

                  <path d={mainPath} fill="none" stroke="#facc15" strokeWidth={4} />

                  {!locked && (
                    <>
                      <rect
                        x={CH_W - 70}
                        y={PAD}
                        width={46}
                        height={CH_H - PAD * 2}
                        fill="rgba(251,191,36,0.16)"
                      />
                      <circle
                        cx={CH_W - 47}
                        cy={PAD + 18}
                        r={6}
                        fill="rgba(251,191,36,0.85)"
                      />
                    </>
                  )}

                  {hoverIdx !== null && series.ys[hoverIdx] !== undefined && (() => {
                    const minY = Math.min(...series.ys);
                    const maxY = Math.max(...series.ys);
                    const scaleX = (i: number) => PAD + (i / Math.max(1, series.ys.length - 1)) * (CH_W - PAD * 2);
                    const scaleY = (v: number) => PAD + (1 - (v - minY) / Math.max(1, maxY - minY)) * (CH_H - PAD * 2);
                    const xPos = scaleX(hoverIdx);
                    const yPos = scaleY(series.ys[hoverIdx]);

                    return (
                      <>
                        <line
                          x1={xPos}
                          y1={PAD}
                          x2={xPos}
                          y2={CH_H - PAD}
                          stroke="rgba(250,204,21,0.3)"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                        />
                        <circle
                          cx={xPos}
                          cy={yPos}
                          r={5}
                          fill="#facc15"
                          stroke="#000"
                          strokeWidth={2}
                        />
                      </>
                    );
                  })()}

                  <rect
                    x={PAD}
                    y={PAD}
                    width={CH_W - PAD * 2}
                    height={CH_H - PAD * 2}
                    fill="transparent"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    onClick={handleChartInteraction}
                    onTouchStart={handleChartInteraction}
                    style={{ cursor: 'crosshair' }}
                  />
                </svg>

                {locked && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm text-white/70">
                      <Lock className="h-4 w-4" />
                      Neeko+ Projection (locked)
                    </span>
                  </div>
                )}

                {hoverIdx !== null && series.t[hoverIdx] && (() => {
                  const point = series.t[hoverIdx];
                  const value = series.ys[hoverIdx];
                  const delta = hoverIdx > 0 ? value - series.ys[hoverIdx - 1] : null;

                  const minY = Math.min(...series.ys);
                  const maxY = Math.max(...series.ys);
                  const scaleX = (i: number) => PAD + (i / Math.max(1, series.ys.length - 1)) * (CH_W - PAD * 2);
                  const scaleY = (v: number) => PAD + (1 - (v - minY) / Math.max(1, maxY - minY)) * (CH_H - PAD * 2);
                  const xPos = scaleX(hoverIdx);
                  const yPos = scaleY(value);
                  const xPercent = (xPos / CH_W) * 100;
                  const yPercent = (yPos / CH_H) * 100;

                  const flipHorizontal = xPercent > 70;
                  const flipVertical = yPercent < 25;

                  const tooltipStyles: React.CSSProperties = {
                    position: 'absolute',
                    pointerEvents: 'none',
                    zIndex: 50,
                  };

                  if (flipHorizontal) {
                    tooltipStyles.right = `${100 - xPercent + 2}%`;
                    tooltipStyles.transform = 'translateX(50%)';
                  } else {
                    tooltipStyles.left = `${xPercent}%`;
                    tooltipStyles.transform = 'translateX(-50%)';
                  }

                  if (flipVertical) {
                    tooltipStyles.top = `${yPercent}%`;
                    tooltipStyles.marginTop = '12px';
                  } else {
                    tooltipStyles.top = `${yPercent}%`;
                    tooltipStyles.marginTop = '-12px';
                    tooltipStyles.transform = (tooltipStyles.transform || '') + ' translateY(-100%)';
                  }

                  return (
                    <div style={tooltipStyles}>
                      <div className="rounded-xl border border-amber-400/30 bg-black/95 backdrop-blur-sm px-3 py-2 shadow-2xl whitespace-nowrap">
                        <div className="text-xs font-semibold text-amber-200">{point.week}</div>
                        <div className="mt-0.5 text-sm text-white">
                          {statLabel}: <span className="font-semibold">{value}</span>
                        </div>
                        {delta !== null && (
                          <div className="mt-0.5 text-xs text-white/60">
                            Δ {delta > 0 ? '+' : ''}{delta.toFixed(0)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="mt-2.5 rounded-2xl border border-white/10 bg-black/20 px-3.5 py-2 text-sm text-white/75">
              <span className="text-amber-200">AI Insight:</span> {aiLine}
            </div>

            {locked ? (
              <div className="mt-2.5 rounded-2xl border border-white/10 bg-black/20 px-3.5 py-2">
                <div className="inline-flex items-center gap-2 text-sm text-white/70">
                  <Lock className="h-4 w-4" />
                  <span className="font-medium">Premium includes:</span>
                </div>
                <ul className="mt-1.5 space-y-0.5 text-sm text-white/55">
                  <li>• Projection range (low / expected / high)</li>
                  <li>• Role stability note + matchup context</li>
                  <li>• Trend acceleration / cooling flag</li>
                </ul>
                <div className="mt-1.5 text-xs text-white/40">
                  You're seeing deterministic preview output only (safe for free users).
                </div>
              </div>
            ) : (
              <div className="mt-2.5 rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] px-3.5 py-2 text-sm text-amber-100/90">
                Projection bands: low <span className="font-semibold">{projection.low}</span> · expected{" "}
                <span className="font-semibold">{projection.mid}</span> · high{" "}
                <span className="font-semibold">{projection.high}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
