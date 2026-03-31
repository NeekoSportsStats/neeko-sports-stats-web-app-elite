import React, { useEffect, useRef, useState } from "react";
import { X, Lock, Crown } from "lucide-react";
import { usePlayerScatterData, type LensKey, type PlayerPoint } from "./usePlayerScatterData";

interface PlayerTrendBottomSheetProps {
  open: boolean;
  onClose: () => void;
  player: PlayerPoint | null;
  allPlayers: PlayerPoint[];
  lens: LensKey;
  locked: boolean;
}

const DRAG_THRESHOLD = 12;
const DISMISS_DISTANCE_RATIO = 0.3;
const DISMISS_VELOCITY = 0.5;

export default function PlayerTrendBottomSheet(props: PlayerTrendBottomSheetProps) {
  const { open, onClose, player, allPlayers, lens, locked } = props;
  const [isDragging, setIsDragging] = useState(false);
  const [dragStarted, setDragStarted] = useState(false);
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [startY, setStartY] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [lastY, setLastY] = useState(0);
  const [velocity, setVelocity] = useState(0);
  const [dragEnabled, setDragEnabled] = useState(true);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setDragY(0);
      setDragStarted(false);
      setIsDragging(false);
      setIsSheetDragging(false);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!dragEnabled) return;
    if (contentRef.current && contentRef.current.scrollTop > 0) {
      return;
    }

    const touch = e.touches[0];
    setIsDragging(true);
    setDragStarted(false);
    setStartY(touch.clientY);
    setLastY(touch.clientY);
    setStartTime(Date.now());
    setVelocity(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    if (contentRef.current && contentRef.current.scrollTop > 0) {
      setIsDragging(false);
      setDragStarted(false);
      setIsSheetDragging(false);
      return;
    }

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY;

    if (!dragStarted && Math.abs(diff) < DRAG_THRESHOLD) {
      return;
    }

    if (!dragStarted) {
      setDragStarted(true);
      setIsSheetDragging(true);
    }

    if (diff > 0) {
      const now = Date.now();
      const timeDelta = now - startTime;
      const yDelta = currentY - lastY;

      if (timeDelta > 0) {
        setVelocity(yDelta / timeDelta);
      }

      setLastY(currentY);
      setDragY(diff);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    setDragStarted(false);
    setIsSheetDragging(false);

    const sheetHeight = sheetRef.current?.offsetHeight || window.innerHeight * 0.8;
    const dismissDistance = sheetHeight * DISMISS_DISTANCE_RATIO;
    const shouldDismiss = dragY > dismissDistance || velocity > DISMISS_VELOCITY;

    if (shouldDismiss) {
      onClose();
    } else {
      setDragY(0);
    }

    setVelocity(0);
  };

  if (!open || !player) return null;

  const trendData = player.trend?.length
    ? player.trend.map((pt) => ({
        round: pt.label,
        value: pt.value,
        predicted: pt.kind === "projected",
      }))
    : generateTrendData(player, lens);
  const insight = generateInsight(player, lens, locked);

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        style={{ opacity: open ? 1 : 0, transition: "opacity 0.3s" }}
      />

      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl border-t border-white/10 bg-[#0b0b0b] shadow-2xl"
        style={{
          height: "80vh",
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? "none" : "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div
          ref={handleRef}
          className="sticky top-0 z-10 flex flex-col border-b border-white/10 bg-[#0b0b0b] px-4 pb-3 pt-2 cursor-grab active:cursor-grabbing"
          style={{ touchAction: "pan-y" }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="mx-auto mb-2 h-1 w-12 rounded-full bg-white/30 transition-colors" />

          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold text-white truncate">{player.name}</div>
              <div className="text-sm text-white/60">{player.teamName}</div>
            </div>

            <button
              onClick={onClose}
              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto px-4 py-4"
          style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
          onPointerDown={() => setDragEnabled(false)}
          onPointerUp={() => setDragEnabled(true)}
          onPointerCancel={() => setDragEnabled(true)}
        >
          <div className="mb-4">
            <div className="text-xs uppercase tracking-wider text-white/50 mb-2">Trend Chart</div>
            <TrendChart data={trendData} player={player} lens={lens} isSheetDragging={isSheetDragging} locked={locked} />
          </div>

          <div className="mb-4">
            <div className="text-xs uppercase tracking-wider text-white/50 mb-2">AI Insight</div>
            <AIInsightText insight={insight} locked={locked} />
          </div>
        </div>

        {locked && (
          <div className="sticky bottom-0 z-10 border-t border-white/10 bg-[#0b0b0b] px-4 py-3">
            <button
              onClick={onClose}
              className="w-full rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-3 text-sm font-bold text-black shadow-[0_0_20px_rgba(251,191,36,0.4)] hover:shadow-[0_0_28px_rgba(251,191,36,0.6)] transition-all duration-300 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <Crown className="h-4 w-4" />
              Unlock projected score range
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function TrendChart(props: { data: any[]; player: PlayerPoint; lens: LensKey; isSheetDragging: boolean; locked: boolean }) {
  const { data, player, lens, isSheetDragging, locked } = props;
  const [activePoint, setActivePoint] = useState<number | null>(null);
  const [showLockedPreview, setShowLockedPreview] = useState(false);

  const W = 320;
  const H = 200;
  const PAD = 24;

  const trendValues = data.map((d) => d.value);
  const yMin = Math.min(...trendValues);
  const yMax = Math.max(...trendValues);
  const yPadding = (yMax - yMin) * 0.05 || 5;
  const yDomainMin = Math.max(0, yMin - yPadding);
  const yDomainMax = yMax + yPadding;

  const xDomain = [0, data.length - 1];

  const x = (i: number) => PAD + (i / xDomain[1]) * (W - PAD * 2);
  const y = (v: number) => {
    const range = yDomainMax - yDomainMin;
    return H - PAD - ((v - yDomainMin) / Math.max(1, range)) * (H - PAD * 2);
  };

  const projectionStartIndex = data.findIndex((d) => d.predicted);
  const hasProjection = projectionStartIndex !== -1;

  const historicalPath = data
    .slice(0, hasProjection ? projectionStartIndex + 1 : data.length)
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.value)}`)
    .join(" ");

  const projectionPath = hasProjection
    ? data
        .slice(projectionStartIndex)
        .map((d, i) => `${i === 0 ? "M" : "L"} ${x(projectionStartIndex + i)} ${y(d.value)}`)
        .join(" ")
    : "";

  const handlePointTap = (index: number) => {
    if (isSheetDragging) return;
    if (locked && data[index]?.predicted) {
      setShowLockedPreview(!showLockedPreview);
      return;
    }
    setActivePoint(activePoint === index ? null : index);
  };

  return (
    <div
      className="relative rounded-xl border border-white/10 bg-black/20 p-3"
      style={{ pointerEvents: isSheetDragging ? "none" : "auto" }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-[200px]"
        style={{ touchAction: "none" }}
      >
        <defs>
          <linearGradient id="trendGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(251,191,36,0.3)" />
            <stop offset="100%" stopColor="rgba(251,191,36,0.05)" />
          </linearGradient>
          <linearGradient id="lockedGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(251,191,36,0.1)" />
            <stop offset="100%" stopColor="rgba(251,191,36,0.02)" />
          </linearGradient>
        </defs>

        {hasProjection && locked && (
          <rect
            x={x(projectionStartIndex)}
            y={PAD}
            width={x(data.length - 1) - x(projectionStartIndex)}
            height={H - PAD * 2}
            fill="rgba(0,0,0,0.15)"
            stroke="rgba(251,191,36,0.15)"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
        )}

        <path
          d={`${historicalPath} L ${x(hasProjection ? projectionStartIndex : data.length - 1)} ${H - PAD} L ${x(0)} ${H - PAD} Z`}
          fill="url(#trendGradient)"
        />

        <path d={historicalPath} fill="none" stroke="rgba(251,191,36,0.8)" strokeWidth={2.5} />

        {hasProjection && projectionPath && (
          <>
            <path
              d={`${projectionPath} L ${x(data.length - 1)} ${H - PAD} L ${x(projectionStartIndex)} ${H - PAD} Z`}
              fill={locked ? "url(#lockedGradient)" : "url(#trendGradient)"}
              opacity={locked ? 0.4 : 1}
            />
            <path
              d={projectionPath}
              fill="none"
              stroke={locked ? "rgba(251,191,36,0.4)" : "rgba(251,191,36,0.8)"}
              strokeWidth={2.5}
              strokeDasharray={locked ? "6,4" : "0"}
              opacity={locked ? 0.6 : 1}
            />
          </>
        )}

        {data.map((d, i) => {
          const cx = x(i);
          const cy = y(d.value);
          const isLocked = locked && d.predicted;

          return (
            <g key={i}>
              <circle
                cx={cx}
                cy={cy}
                r={16}
                fill="transparent"
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handlePointTap(i);
                }}
                style={{ cursor: "pointer" }}
              />
              <circle
                cx={cx}
                cy={cy}
                r={activePoint === i ? 5 : 3.5}
                fill={isLocked ? "rgba(251,191,36,0.3)" : d.predicted ? "rgba(251,191,36,0.6)" : "rgba(251,191,36,0.95)"}
                stroke={activePoint === i ? "rgba(255,255,255,0.5)" : "none"}
                strokeWidth={2}
                pointerEvents="none"
                opacity={isLocked ? 0.5 : 1}
              />
            </g>
          );
        })}

        {hasProjection && locked && (
          <text
            x={x(projectionStartIndex) + (x(data.length - 1) - x(projectionStartIndex)) / 2}
            y={PAD + 16}
            textAnchor="middle"
            className="text-[10px] fill-white/40 font-medium"
          >
            <tspan x={x(projectionStartIndex) + (x(data.length - 1) - x(projectionStartIndex)) / 2}>🔒 Next round projection</tspan>
          </text>
        )}
      </svg>

      {activePoint !== null && !isSheetDragging && !data[activePoint]?.predicted && (
        <div
          className="absolute z-20 rounded-lg border border-white/20 bg-[#0b0b0b] px-3 py-2 shadow-xl pointer-events-none"
          style={{
            left: Math.min(x(activePoint), W - 100),
            top: Math.max(y(data[activePoint].value) - 60, 10),
          }}
        >
          <div className="text-xs text-white/60">{data[activePoint].round}</div>
          <div className="text-sm font-semibold text-white">{data[activePoint].value}</div>
        </div>
      )}

      {showLockedPreview && locked && !isSheetDragging && (
        <div className="absolute inset-x-3 bottom-3 z-20 rounded-xl border border-amber-400/30 bg-[#0b0b0b]/95 p-4 shadow-2xl backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-white mb-1">Next Round Projection</div>
              <div className="text-xs text-white/60 mb-2">
                Expected range: <span className="text-white/40">🔒 Hidden</span>
              </div>
              <div className="text-xs text-white/60">
                Confidence: <span className="text-white/40">🔒 Hidden</span>
              </div>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowLockedPreview(false);
            }}
            className="mt-3 w-full rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-400/15 transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function generateTrendData(player: PlayerPoint, lens: LensKey) {
  const rounds = 5;
  const base = lens === "fantasy" ? player.momentum * 8 : lens === "goals" ? 1.8 : lens === "assists" ? 1.2 : 2.5;

  return Array.from({ length: rounds + 2 }, (_, i) => ({
    round: `R${i + 1}`,
    value: Math.round(base + Math.random() * base * 0.3),
    predicted: i >= rounds,
  }));
}

function generateInsight(player: PlayerPoint, lens: LensKey, locked: boolean) {
  if (player.momentum > 70 && player.ceiling > 70) {
    return `${player.name} shows elite momentum and ceiling. Strong slate correlation likely with consistent scoring across multiple categories.`;
  }

  if (player.momentum > 60) {
    return `${player.name} trending upward with solid recent form. Expected to maintain trajectory in favorable matchups.`;
  }

  return `${player.name} shows steady baseline with room for ceiling spike. Monitor opponent defensive rankings for breakout potential.`;
}

function AIInsightText(props: { insight: string; locked: boolean }) {
  const { insight, locked } = props;

  if (!locked) {
    return <div className="text-sm text-white/85 leading-relaxed">{insight}</div>;
  }

  const firstSentence = insight.split(". ")[0] + ".";

  return (
    <div className="relative">
      <div className="text-sm text-white/85 leading-relaxed">
        {firstSentence}
        <span className="text-white/30"> Full insight & matchup context available with Neeko+</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400/80">
        <Lock className="h-3 w-3" />
        <span>Unlock complete analysis</span>
      </div>
    </div>
  );
}
