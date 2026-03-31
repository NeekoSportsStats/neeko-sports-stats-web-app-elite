import React, { useMemo, useState } from "react";
import { ArrowRight, Flame, Info, Sparkles, TrendingUp } from "lucide-react";
import type { FixtureMatch } from "@/components/afl/match-center/types";
import type { PremiumMode } from "@/components/afl/ai-insights/data/types";
import { SectionHeader } from "@/components/sports/shared/SectionHeader";

import PlayerTrendBottomSheet from "./PlayerTrendBottomSheet";
import { usePlayerScatterData, type LensKey, type PlayerPoint } from "./usePlayerScatterData";

const W = 760;
const H = 420;
// Tighter padding so the plot feels larger on mobile (less empty edge space)
const PAD = 44;

const x = (v: number) => PAD + (v / 100) * (W - PAD * 2);
const y = (v: number) => PAD + (1 - v / 100) * (H - PAD * 2);

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function dotFill(side: "home" | "away") {
  return side === "home" ? "#60a5fa" : "#34d399";
}

export default function PlayerImpactHeroScatterMobile(props: {
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
    lean,
    volatility,
    whyLean,
  } = d;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);

  const handleDotClick = (id: string) => {
    if (!id) return;
    setOpenId(id);
  };

  const handleRowClick = (id: string) => {
    if (!id) return;
    setOpenId(id);
  };

  const playersVisibleMemo = useMemo(() => playersVisible, [playersVisible]);

  if (!playersVisible || playersVisible.length === 0) return null;

  return (
    <div className="rounded-3xl border border-amber-400/15 bg-gradient-to-b from-[#0b0b0b] to-black p-4">
      <SectionHeader
        eyebrow="Player Impact Map"
        title="Momentum vs Ceiling"
        subtitle={`${homeTeam} vs ${awayTeam}`}
        icon={TrendingUp}
      />

      <div className="flex flex-wrap items-center gap-2">
        {(["fantasy", "disposals", "goals"] as LensKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setLens(k)}
            className={
              "rounded-full border px-3 py-1 text-xs " +
              (lens === k
                ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                : "border-white/10 bg-black/20 text-white/70")
            }
          >
            {k === "fantasy" ? "Fantasy" : k === "disposals" ? "Disposals" : "Goals"}
          </button>
        ))}

        <div className="ml-auto flex gap-1.5">
          {(["both", "home", "away"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTeamFilter(k)}
              className={
                "rounded-full border px-3 py-1 text-xs " +
                (teamFilter === k
                  ? "border-white/25 bg-white/10 text-white"
                  : "border-white/10 bg-black/20 text-white/60")
              }
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* Lean meter */}
      <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-center justify-between text-xs text-white/60">
          <span className="truncate">{homeTeam}</span>
          <span className="text-white/40">Lean</span>
          <span className="truncate">{awayTeam}</span>
        </div>

        <div className="relative mt-2 h-3 overflow-hidden rounded-full border border-white/10 bg-black/30">
          <div
            className="h-full"
            style={{
              width: `${clamp(50 + lean.diff * 1.2, 8, 92)}%`,
              background: "linear-gradient(90deg, rgba(96,165,250,0.65), rgba(52,211,153,0.65))",
            }}
          />
          <div className="absolute left-1/2 top-0 h-full w-px bg-white/15" />
        </div>

        <div className="mt-1.5 text-[10px] text-white/35 text-center">
          Lean reflects avg momentum + ceiling
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-white/60">
            Δ {lean.diff > 0 ? "+" : ""}
            {lean.diff.toFixed(1)} · Volatility {volatility.label}
          </span>

          <div className="relative">
            <button
              onClick={() => setWhyOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-white/70"
            >
              <Info className="h-3.5 w-3.5" />
              Why?
            </button>

            {whyOpen && (
              <div className="absolute right-0 z-30 mt-2 w-[300px] rounded-2xl border border-white/10 bg-[#0b0b0b] p-3 shadow-2xl">
                <div className="text-xs font-medium text-white/90">{whyLean.title}</div>
                <ul className="mt-2 space-y-1 text-xs text-white/65">
                  {whyLean.lines.slice(0, 3).map((ln, i) => (
                    <li key={i}>• {ln}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Plot (bigger, less dead space) */}
      <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/20" style={{ touchAction: "manipulation" }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[360px] w-full">
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

          <text x={PAD + 8} y={PAD + 18} fill="rgba(255,255,255,0.55)" fontSize="13">
            Volatile
          </text>
          <text x={W - PAD - 80} y={PAD + 18} fill="rgba(251,191,36,0.95)" fontSize="13" fontWeight="500">
            Finale
          </text>
          <text x={PAD + 8} y={H - PAD - 10} fill="rgba(255,255,255,0.45)" fontSize="13">
            Low impact
          </text>
          <text x={W - PAD - 60} y={H - PAD - 10} fill="rgba(255,255,255,0.45)" fontSize="13">
            Safe
          </text>

          {playersVisibleMemo.map((p) => {
            const cx = x(p.momentum);
            const cy = y(p.ceiling);
            const isSel = p.id === openId;

            return (
              <g key={p.id} style={{ cursor: "pointer" }}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={16}
                  fill="transparent"
                  pointerEvents="all"
                  onClick={() => handleDotClick(p.id)}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={isSel ? 8 : 6.5}
                  fill={dotFill(p.teamSide)}
                  opacity={openId && openId !== p.id ? 0.45 : 0.98}
                  pointerEvents="none"
                />
                {isSel && (
                  <>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={13}
                      fill="transparent"
                      stroke="rgba(251,191,36,0.80)"
                      strokeWidth={3}
                      pointerEvents="none"
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={13}
                      fill="transparent"
                      stroke="rgba(251,191,36,0.25)"
                      strokeWidth={9}
                      pointerEvents="none"
                    />
                  </>
                )}
                {isSel && (
                  <text x={cx + 10} y={cy + 4} className="fill-white/80 text-[11px]">
                    {p.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected Player Preview */}
      {selected ? (
        <div className="mt-3 rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-400/[0.08] to-amber-400/[0.04] p-4">
          <div className="mb-3">
            <div className="text-xs uppercase tracking-[0.18em] text-amber-300/70 mb-1">Selected Player</div>
            <div className="text-base font-bold text-white">{selected.name}</div>
            <div className="text-sm text-white/60">{selected.teamName}</div>
            <div className="text-xs text-white/45 mt-1">View trend & projection (Neeko+)</div>
          </div>

          <button
            onClick={() => setSheetOpen(true)}
            className="w-full rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-3 text-sm font-bold text-black shadow-[0_0_20px_rgba(251,191,36,0.4)] hover:shadow-[0_0_28px_rgba(251,191,36,0.6)] transition-all duration-300 flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            View Trend
            <ArrowRight className="h-4 w-4" />
          </button>

          <div className="mt-3 flex items-center gap-3 text-xs">
            <span className="rounded-full bg-white/10 px-3 py-1.5">
              <span className="text-white/60">Momentum:</span> <span className="text-white font-semibold ml-1">{selected.momentum}</span>
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1.5">
              <span className="text-white/60">Ceiling:</span> <span className="text-white font-semibold ml-1">{selected.ceiling}</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-6 flex flex-col items-center justify-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 mb-3">
            <Sparkles className="h-7 w-7 text-white/40" />
          </div>
          <div className="text-sm text-white/50 max-w-[200px] font-medium">
            Tap a player on the chart to view their trend
          </div>
        </div>
      )}

      <Top3Panel players={playersVisibleMemo} onSelectPlayer={handleRowClick} openId={openId} />
      <Bottom3Panel players={playersVisibleMemo} onSelectPlayer={handleRowClick} openId={openId} />

      <PlayerTrendBottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        player={selected}
        allPlayers={d.playersAll}
        lens={lens}
        locked={!isPremium}
      />
    </div>
  );
}

function Top3Panel(props: {
  players: PlayerPoint[];
  onSelectPlayer: (id: string) => void;
  openId: string | null;
}) {
  const { players, onSelectPlayer, openId } = props;

  const top3 = useMemo(() => {
    const sorted = [...players].sort((a, b) => {
      const scoreA = a.momentum + a.ceiling;
      const scoreB = b.momentum + b.ceiling;
      return scoreB - scoreA;
    });
    return sorted.slice(0, 3);
  }, [players]);

  if (top3.length < 3) return null;

  return (
    <div className="mt-3 rounded-2xl border border-amber-400/20 bg-black/20 p-3">
      <div className="text-xs uppercase tracking-[0.18em] text-white/40 mb-2">Top 3 Impact</div>

      <div className="space-y-2">
        {top3.map((player, idx) => {
          const isSelected = player.id === openId;
          const isFirst = idx === 0;

          return (
            <button
              key={player.id}
              onClick={() => onSelectPlayer(player.id)}
              className={`w-full rounded-lg border p-3 text-left transition-all active:scale-[0.98] ${
                isSelected
                  ? "border-amber-400/40 bg-amber-400/10"
                  : "border-white/10 bg-black/30 active:bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{
                      background: player.teamSide === "home" ? "#60a5fa" : "#34d399",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                      {player.name}
                      {isFirst && <Flame className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                    </div>
                    <div className="text-xs text-white/50">{player.teamName}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/60 shrink-0">
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

function Bottom3Panel(props: {
  players: PlayerPoint[];
  onSelectPlayer: (id: string) => void;
  openId: string | null;
}) {
  const { players, onSelectPlayer, openId } = props;

  const bottom3 = useMemo(() => {
    const sorted = [...players].sort((a, b) => {
      const scoreA = a.momentum + a.ceiling;
      const scoreB = b.momentum + b.ceiling;
      return scoreA - scoreB;
    });
    return sorted.slice(0, 3);
  }, [players]);

  if (bottom3.length < 3) return null;

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-xs uppercase tracking-[0.18em] text-white/35 mb-2">Bottom 3 — Low Impact</div>

      <div className="space-y-2">
        {bottom3.map((player) => {
          const isSelected = player.id === openId;

          return (
            <button
              key={player.id}
              onClick={() => onSelectPlayer(player.id)}
              className={`w-full rounded-lg border p-3 text-left transition-all active:scale-[0.98] ${
                isSelected
                  ? "border-amber-400/40 bg-amber-400/10"
                  : "border-white/10 bg-black/30 active:bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0 opacity-70"
                    style={{
                      background: player.teamSide === "home" ? "#60a5fa" : "#34d399",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white/80 truncate">
                      {player.name}
                    </div>
                    <div className="text-xs text-white/40">{player.teamName}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/50 shrink-0">
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
