import React, { useMemo, useState } from "react";
import { ArrowRight, Flame, Info, Lock, Sparkles, TrendingUp } from "lucide-react";
import type { FixtureMatch } from "@/components/afl/match-center/types";
import type { PremiumMode } from "@/components/afl/ai-insights/data/types";
import { SectionHeader } from "@/components/sports/shared/SectionHeader";

import PlayerTrendModal from "./PlayerTrendModal";
import { usePlayerScatterData, type LabelMode, type LensKey, type PlayerPoint } from "./usePlayerScatterData";

const W = 760;
const H = 420;
// Slightly tighter padding = bigger usable plot area (less "dead" edge space)
const PAD = 28;

const x = (v: number) => PAD + (v / 100) * (W - PAD * 2);
const y = (v: number) => PAD + (1 - v / 100) * (H - PAD * 2);

function cls(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

export default function PlayerImpactHeroScatterDesktop(props: {
  match?: FixtureMatch;
  mode: PremiumMode;
  initialLens?: LensKey;
}) {
  const { match, mode, initialLens } = props;
  const isPremium = mode === "premium";

  const d = usePlayerScatterData({ match, initialLens });
  const {
    homeTeam,
    awayTeam,
    lens,
    setLens,
    teamFilter,
    setTeamFilter,
    playersVisible,
    openId,
    setOpenId,
    selected,
    dominantQuadrant,
    lean,
    volatility,
    whyLean,
  } = d;

  const [modalOpen, setModalOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const shouldShowLabel = (p: PlayerPoint) => {
    return p.id === hoverId || p.id === openId;
  };

  const premiumNarrative = useMemo(() => {
    // tiny “sugar” line; stays tasteful
    if (dominantQuadrant === "finale") return "Finale targets often align with role stability and late-game scoring control.";
    if (dominantQuadrant === "volatile") return "Volatile ceiling profiles can win slates — but swing hard week-to-week.";
    if (dominantQuadrant === "safe") return "Safe floors reduce downside, but limit explosive upside.";
    return "Low-impact profiles require role change or matchup spike to matter.";
  }, [dominantQuadrant]);

  const handleDotClick = (id: string) => {
    if (!id) return;
    setOpenId(id);
  };

  const handleRowClick = (id: string) => {
    if (!id) return;
    setOpenId(id);
  };

  if (!playersVisible || playersVisible.length === 0) return null;

  return (
    <div className="rounded-3xl border border-amber-400/15 bg-gradient-to-b from-[#0b0b0b] to-black p-5 md:p-6">
      <SectionHeader
        eyebrow="Player Impact Map"
        title="Momentum vs Ceiling"
        subtitle={`${homeTeam} vs ${awayTeam} · ${lens === "fantasy" ? "Fantasy" : lens === "disposals" ? "Disposals" : "Goals"} lens`}
        icon={TrendingUp}
        rightSlot={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1.5">
              {(["fantasy", "disposals", "goals"] as LensKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setLens(k)}
                  className={cls(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    lens === k
                      ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                      : "border-white/10 bg-black/20 text-white/60 hover:bg-white/5"
                  )}
                >
                  {k === "fantasy" ? "Fantasy" : k === "disposals" ? "Disposals" : "Goals"}
                </button>
              ))}
            </div>

            <div className="h-5 w-px bg-white/10" />

            <div className="flex gap-1">
              {(["both", "home", "away"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setTeamFilter(k)}
                  className={cls(
                    "rounded-full border px-2.5 py-1 text-[11px] transition",
                    teamFilter === k
                      ? "border-white/25 bg-white/10 text-white"
                      : "border-white/10 bg-black/20 text-white/50 hover:bg-white/5"
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {/* Lean meter */}
      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="text-sm text-white">
            Lean:{" "}
            {lean.direction === "even" ? (
              <span className="text-white/60">Even</span>
            ) : (
              <>
                <span className="text-white/80">{lean.direction === "home" ? homeTeam : awayTeam}</span>
                <span className="text-amber-300 ml-1">
                  {lean.diff > 0 ? "+" : ""}
                  {lean.diff.toFixed(1)}
                </span>
              </>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setWhyOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-xs text-white/60 hover:bg-white/5 transition"
            >
              <Info className="h-3 w-3" />
              Why?
            </button>

            {whyOpen && (
              <div className="absolute right-0 z-30 mt-2 w-[320px] rounded-xl border border-white/10 bg-[#0b0b0b] p-3 shadow-2xl">
                <div className="text-xs font-medium text-white/90">{whyLean.title}</div>
                <ul className="mt-2 space-y-1 text-xs text-white/60">
                  {whyLean.lines.map((ln, i) => (
                    <li key={i}>• {ln}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="mt-3 grid grid-cols-12 gap-4">
        {/* Plot */}
        <div className="col-span-12 lg:col-span-9">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-3 text-xs text-white/60">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#3B82F6" }} />
                  {homeTeam}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: "#10B981" }} />
                  {awayTeam}
                </span>
              </div>

              <div className="text-[10px] text-white/40 uppercase tracking-wider">
                X: Momentum · Y: Ceiling
              </div>
            </div>

            <div className="relative">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="h-[560px] w-full"
                onClick={(e) => {
                  if (e.target === e.currentTarget) setOpenId(null);
                }}
              >
                {/* grid */}
                {Array.from({ length: 5 }).map((_, i) => {
                  const gx = PAD + ((W - PAD * 2) / 4) * i;
                  const gy = PAD + ((H - PAD * 2) / 4) * i;
                  return (
                    <g key={i}>
                      <line x1={gx} y1={PAD} x2={gx} y2={H - PAD} stroke="rgba(255,255,255,0.10)" />
                      <line x1={PAD} y1={gy} x2={W - PAD} y2={gy} stroke="rgba(255,255,255,0.10)" />
                    </g>
                  );
                })}
                <line x1={x(50)} y1={PAD} x2={x(50)} y2={H - PAD} stroke="rgba(255,255,255,0.16)" />
                <line x1={PAD} y1={y(50)} x2={W - PAD} y2={y(50)} stroke="rgba(255,255,255,0.16)" />

                {/* Axis direction hints */}
                <text x={PAD - 4} y={H - PAD + 14} fill="rgba(255,255,255,0.32)" fontSize="9" textAnchor="start">
                  Low
                </text>
                <text x={W - PAD + 4} y={H - PAD + 14} fill="rgba(255,255,255,0.32)" fontSize="9" textAnchor="end">
                  High
                </text>
                <text x={PAD - 4} y={PAD - 4} fill="rgba(255,255,255,0.32)" fontSize="9" textAnchor="start">
                  High
                </text>

                {/* quadrant labels */}
                <text x={PAD + 8} y={PAD + 18} fill="rgba(255,255,255,0.55)" fontSize="13">
                  Volatile
                </text>
                <text x={W - PAD - 120} y={PAD + 18} fill="rgba(251,191,36,0.95)" fontSize="13" fontWeight="500">
                  Finale
                </text>
                <text x={PAD + 8} y={H - PAD - 10} fill="rgba(255,255,255,0.45)" fontSize="13">
                  Low impact
                </text>
                <text x={W - PAD - 120} y={H - PAD - 10} fill="rgba(255,255,255,0.45)" fontSize="13">
                  Safe
                </text>

                {/* points */}
                {playersVisible.map((p) => {
                  const isSel = p.id === openId;
                  const isHovered = p.id === hoverId;
                  const showLabel = shouldShowLabel(p);

                  return (
                    <g key={p.id} style={{ cursor: "pointer" }}>
                      {/* Invisible hit target */}
                      <circle
                        cx={x(p.momentum)}
                        cy={y(p.ceiling)}
                        r={12}
                        fill="transparent"
                        pointerEvents="all"
                        onMouseEnter={(e) => {
                          setHoverId(p.id);
                          const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                          if (rect) {
                            setHoverPos({
                              x: e.clientX - rect.left,
                              y: e.clientY - rect.top,
                            });
                          }
                        }}
                        onMouseMove={(e) => {
                          const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                          if (rect) {
                            setHoverPos({
                              x: e.clientX - rect.left,
                              y: e.clientY - rect.top,
                            });
                          }
                        }}
                        onMouseLeave={() => {
                          setHoverId(null);
                          setHoverPos(null);
                        }}
                        onClick={() => handleDotClick(p.id)}
                      />
                      <circle
                        cx={x(p.momentum)}
                        cy={y(p.ceiling)}
                        r={isSel ? 7.5 : isHovered ? 7.5 : 6.5}
                        fill={p.teamSide === "home" ? "#3B82F6" : "#10B981"}
                        opacity={openId && !isSel ? 0.30 : isHovered ? 1 : 0.95}
                        stroke={isSel ? "rgba(245, 158, 11, 0.95)" : isHovered ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.12)"}
                        strokeWidth={isSel ? 3 : isHovered ? 2 : 1}
                        pointerEvents="none"
                      />
                      {/* Gold ring glow for selection */}
                      {isSel && (
                        <circle
                          cx={x(p.momentum)}
                          cy={y(p.ceiling)}
                          r={13}
                          fill="transparent"
                          stroke="rgba(245, 158, 11, 0.40)"
                          strokeWidth={10}
                          style={{ filter: "blur(0.8px)" }}
                          pointerEvents="none"
                        />
                      )}
                      {showLabel && (
                        <text
                          x={x(p.momentum) + 10}
                          y={y(p.ceiling) + 4}
                          className="fill-white/85 text-[11px]"
                          pointerEvents="none"
                        >
                          {p.name}
                        </text>
                      )}
                      {/* Subtle crosshair on hover */}
                      {isHovered && (
                        <>
                          <line
                            x1={PAD}
                            y1={y(p.ceiling)}
                            x2={W - PAD}
                            y2={y(p.ceiling)}
                            stroke="rgba(255,255,255,0.15)"
                            strokeWidth={1}
                            strokeDasharray="4 4"
                            pointerEvents="none"
                          />
                          <line
                            x1={x(p.momentum)}
                            y1={PAD}
                            x2={x(p.momentum)}
                            y2={H - PAD}
                            stroke="rgba(255,255,255,0.15)"
                            strokeWidth={1}
                            strokeDasharray="4 4"
                            pointerEvents="none"
                          />
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Hover tooltip */}
              {hoverId && hoverPos && (() => {
                const hoveredPlayer = playersVisible.find((p) => p.id === hoverId);
                if (!hoveredPlayer) return null;

                const tooltipOffset = 12;
                const tooltipWidth = 200;
                const tooltipHeight = 80;

                const containerRect = { width: 0, height: 0 };
                if (typeof document !== 'undefined') {
                  const container = document.querySelector('.h-\\[560px\\]');
                  if (container) {
                    const rect = container.getBoundingClientRect();
                    containerRect.width = rect.width;
                    containerRect.height = rect.height;
                  }
                }

                let left = hoverPos.x + tooltipOffset;
                let top = hoverPos.y;
                let transformX = '0';
                let transformY = '-50%';

                if (left + tooltipWidth > containerRect.width) {
                  left = hoverPos.x - tooltipOffset;
                  transformX = '-100%';
                }

                if (top - tooltipHeight / 2 < 0) {
                  transformY = '0';
                } else if (top + tooltipHeight / 2 > containerRect.height) {
                  transformY = '-100%';
                }

                return (
                  <div
                    className="absolute z-50 pointer-events-none"
                    style={{
                      left: `${left}px`,
                      top: `${top}px`,
                      transform: `translate(${transformX}, ${transformY})`,
                    }}
                  >
                    <div className="rounded-xl border border-amber-400/30 bg-black/95 backdrop-blur-sm px-3 py-2 shadow-xl whitespace-nowrap">
                      <div className="text-xs font-semibold text-white">{hoveredPlayer.name}</div>
                      <div className="mt-0.5 text-[11px] text-white/60">{hoveredPlayer.teamName}</div>
                      <div className="mt-1 flex items-center gap-3 text-[11px]">
                        <span className="text-white/70">
                          M: <span className="text-white font-medium">{hoveredPlayer.momentum}</span>
                        </span>
                        <span className="text-white/70">
                          C: <span className="text-white font-medium">{hoveredPlayer.ceiling}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Selected (right) */}
        <div className="col-span-12 lg:col-span-3">
          <div className="space-y-3 lg:sticky lg:top-24">
            <Top3ImpactPanel
              playersVisible={playersVisible}
              onSelectPlayer={handleRowClick}
              onHoverPlayer={setHoverId}
              openId={openId}
              hoverId={hoverId}
            />

            <Bottom3ImpactPanel
              playersVisible={playersVisible}
              onSelectPlayer={handleRowClick}
              onHoverPlayer={setHoverId}
              openId={openId}
              hoverId={hoverId}
            />

            <SelectedCard
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              selected={selected}
              isPremium={isPremium}
              onOpenTrend={() => setModalOpen(true)}
            />

            {isPremium && (
              <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] p-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Analyst note</div>
                <div className="mt-2 text-sm text-amber-100/90">{premiumNarrative}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      <PlayerTrendModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        player={selected}
        allPlayers={d.playersAll}
        lens={lens}
        locked={!isPremium}
      />
    </div>
  );
}

function Top3ImpactPanel(props: {
  playersVisible: PlayerPoint[];
  onSelectPlayer: (id: string) => void;
  onHoverPlayer: (id: string | null) => void;
  openId: string | null;
  hoverId: string | null;
}) {
  const { playersVisible, onSelectPlayer, onHoverPlayer, openId, hoverId } = props;

  const top3 = useMemo(() => {
    const sorted = [...playersVisible].sort((a, b) => {
      const scoreA = a.momentum + a.ceiling;
      const scoreB = b.momentum + b.ceiling;
      return scoreB - scoreA;
    });
    return sorted.slice(0, 3);
  }, [playersVisible]);

  if (top3.length < 3) return null;

  return (
    <div className="rounded-2xl border border-amber-400/20 bg-black/20 p-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Top 3 Impact</div>
      <div className="mt-0.5 text-xs text-white/50">Highest combined momentum + ceiling</div>

      <div className="mt-2 space-y-1">
        {top3.map((player, idx) => {
          const isSelected = player.id === openId;
          const isHovered = player.id === hoverId;
          const isFirst = idx === 0;

          return (
            <button
              key={player.id}
              onClick={() => onSelectPlayer(player.id)}
              onMouseEnter={() => onHoverPlayer(player.id)}
              onMouseLeave={() => onHoverPlayer(null)}
              className={cls(
                "w-full rounded-lg border p-2 text-left transition",
                isSelected
                  ? "border-amber-400/40 bg-amber-400/10"
                  : isHovered
                  ? "border-white/20 bg-white/5"
                  : "border-white/10 bg-black/20 hover:bg-white/5"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{
                      background: player.teamSide === "home" ? "#3B82F6" : "#10B981",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-white truncate flex items-center gap-1.5">
                      {player.name}
                      {isFirst && <Flame className="h-3 w-3 text-amber-400 shrink-0" />}
                    </div>
                    <div className="text-[10px] text-white/50">{player.teamName}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-white/60 shrink-0">
                  <span>M {player.momentum}</span>
                  <span className="text-white/30">·</span>
                  <span>C {player.ceiling}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Bottom3ImpactPanel(props: {
  playersVisible: PlayerPoint[];
  onSelectPlayer: (id: string) => void;
  onHoverPlayer: (id: string | null) => void;
  openId: string | null;
  hoverId: string | null;
}) {
  const { playersVisible, onSelectPlayer, onHoverPlayer, openId, hoverId } = props;

  const bottom3 = useMemo(() => {
    const sorted = [...playersVisible].sort((a, b) => {
      const scoreA = a.momentum + a.ceiling;
      const scoreB = b.momentum + b.ceiling;
      return scoreA - scoreB;
    });
    return sorted.slice(0, 3);
  }, [playersVisible]);

  if (bottom3.length < 3) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Bottom 3 — Low Impact</div>
      <div className="mt-0.5 text-xs text-white/40">Lowest combined momentum + ceiling</div>

      <div className="mt-2 space-y-1">
        {bottom3.map((player) => {
          const isSelected = player.id === openId;
          const isHovered = player.id === hoverId;

          return (
            <button
              key={player.id}
              onClick={() => onSelectPlayer(player.id)}
              onMouseEnter={() => onHoverPlayer(player.id)}
              onMouseLeave={() => onHoverPlayer(null)}
              className={cls(
                "w-full rounded-lg border p-2 text-left transition",
                isSelected
                  ? "border-amber-400/40 bg-amber-400/10"
                  : isHovered
                  ? "border-white/20 bg-white/5"
                  : "border-white/10 bg-black/20 hover:bg-white/5"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className="h-2 w-2 rounded-full shrink-0 opacity-70"
                    style={{
                      background: player.teamSide === "home" ? "#3B82F6" : "#10B981",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-white/80 truncate">
                      {player.name}
                    </div>
                    <div className="text-[10px] text-white/40">{player.teamName}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-white/50 shrink-0">
                  <span>M {player.momentum}</span>
                  <span className="text-white/25">·</span>
                  <span>C {player.ceiling}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SelectedCard(props: {
  homeTeam: string;
  awayTeam: string;
  selected: PlayerPoint | null;
  isPremium: boolean;
  onOpenTrend: () => void;
}) {
  const { selected, onOpenTrend } = props;
  const [hasSeenFirstSelection, setHasSeenFirstSelection] = React.useState(false);

  React.useEffect(() => {
    if (selected && !hasSeenFirstSelection) {
      setHasSeenFirstSelection(true);
    }
  }, [selected, hasSeenFirstSelection]);

  const showPulse = selected && !hasSeenFirstSelection;

  return (
    <div className={cls(
      "rounded-2xl border bg-black/20 p-3 transition-all duration-300",
      selected ? "border-amber-400/20" : "border-white/10"
    )}>
      {selected ? (
        <>
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">{selected.name}</div>
              <div className="text-xs text-white/55">{selected.teamName}</div>
              <div className="text-[11px] text-white/40 mt-0.5">View trend & projection (Neeko+)</div>
            </div>
          </div>

          <button
            onClick={onOpenTrend}
            className={cls(
              "w-full rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-300",
              "border-amber-400/40 bg-gradient-to-r from-amber-400 to-amber-500 text-black",
              "hover:from-amber-300 hover:to-amber-400",
              "shadow-[0_0_16px_rgba(251,191,36,0.4)] hover:shadow-[0_0_24px_rgba(251,191,36,0.6)]",
              "flex items-center justify-center gap-2",
              !hasSeenFirstSelection && "animate-[breathing_3s_ease-in-out_infinite]"
            )}
          >
            View Trend
            <ArrowRight className="h-4 w-4" />
          </button>

          <div className="mt-3 flex items-center gap-3 text-xs">
            <span className="rounded-full bg-white/5 px-2 py-1">
              <span className="text-white/60">M:</span> <span className="text-white font-medium">{selected.momentum}</span>
            </span>
            <span className="rounded-full bg-white/5 px-2 py-1">
              <span className="text-white/60">C:</span> <span className="text-white font-medium">{selected.ceiling}</span>
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 text-center group cursor-default">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5 mb-3 transition-all duration-300 group-hover:border-amber-400/30 group-hover:bg-amber-400/5 group-hover:shadow-[0_0_20px_rgba(251,191,36,0.15)] group-hover:-translate-y-1">
            <Sparkles className="h-6 w-6 text-white/40 transition-colors group-hover:text-amber-400/70" />
          </div>
          <div className="text-xs text-white/50 max-w-[180px] font-medium">
            Select a player to view trend & projection
          </div>
        </div>
      )}
    </div>
  );
}