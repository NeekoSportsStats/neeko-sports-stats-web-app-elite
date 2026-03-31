import { useEffect, useMemo, useState } from "react";
import { Crown, Lock, ChartBar as BarChart2 } from "lucide-react";

interface PlayerData {
  player_id: string;
  player_name: string;
  team: string | null;
  projection_final: number | null;
  ceiling_estimate: number | null;
  floor_estimate: number | null;
  projection_confidence: number | null;
}

interface OutcomeDistributionChartProps {
  playerA: PlayerData;
  playerB: PlayerData;
  winnerPlayerId: string;
  isPremium: boolean;
  onUpgrade: () => void;
  embedded?: boolean;
}

type Buckets = Record<string, number>;

const BUCKET_LABELS = ["<60", "60–80", "80–100", "100–120", "120–140", "140+"];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function playerIdToSeed(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (Math.imul(31, hash) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

function randomNormal(rand: () => number, mean: number, stdDev: number): number {
  const u1 = rand();
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

function simulateScores(p: PlayerData): number[] {
  const mean = p.projection_final ?? 80;
  const ceil = p.ceiling_estimate ?? mean * 1.4;
  const floor = p.floor_estimate ?? mean * 0.6;
  const stdDev = Math.max((ceil - floor) / 4, 5);
  const lo = floor * 0.8;
  const hi = ceil * 1.2;

  const rand = seededRandom(playerIdToSeed(p.player_id));
  const scores: number[] = [];
  for (let i = 0; i < 100; i++) {
    const s = randomNormal(rand, mean, stdDev);
    scores.push(Math.max(lo, Math.min(hi, s)));
  }
  return scores;
}

function toBuckets(scores: number[]): Buckets {
  const counts: Record<string, number> = {
    "<60": 0,
    "60–80": 0,
    "80–100": 0,
    "100–120": 0,
    "120–140": 0,
    "140+": 0,
  };
  for (const s of scores) {
    if (s < 60) counts["<60"]++;
    else if (s < 80) counts["60–80"]++;
    else if (s < 100) counts["80–100"]++;
    else if (s < 120) counts["100–120"]++;
    else if (s < 140) counts["120–140"]++;
    else counts["140+"]++;
  }
  // Convert to %
  const result: Buckets = {};
  for (const k of BUCKET_LABELS) {
    result[k] = Math.round((counts[k] / scores.length) * 100);
  }
  return result;
}

function calcInsights(scores: number[]) {
  const bust = scores.filter((s) => s < 80).length;
  const ceiling = scores.filter((s) => s >= 120).length;
  const safe = scores.filter((s) => s >= 100).length;
  return {
    bustRisk: bust,
    ceilingChance: ceiling,
    safeScore: safe,
  };
}

interface PlayerDistributionProps {
  name: string;
  buckets: Buckets;
  isWinner: boolean;
  animated: boolean;
}

function PlayerDistribution({ name, buckets, isWinner, animated }: PlayerDistributionProps) {
  const max = Math.max(...Object.values(buckets), 1);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <div className={`h-2 w-2 rounded-full ${isWinner ? "bg-[#F5C84C]" : "bg-white/20"}`} />
        <p className={`text-xs font-bold truncate ${isWinner ? "text-[#F5C84C]" : "text-white/50"}`}>
          {name}
        </p>
      </div>
      {BUCKET_LABELS.map((label) => {
        const pct = buckets[label] ?? 0;
        const barWidth = animated ? `${(pct / max) * 100}%` : "0%";
        return (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[10px] text-white/30 w-14 shrink-0 text-right font-mono">
              {label}
            </span>
            <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${isWinner ? "bg-gradient-to-r from-[#F5C84C]/60 to-[#F5C84C]" : "bg-white/20"}`}
                style={{ width: barWidth }}
              />
            </div>
            <span className={`text-[10px] font-bold tabular-nums w-8 shrink-0 ${isWinner ? "text-[#F5C84C]/70" : "text-white/25"}`}>
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface InsightPillProps {
  label: string;
  aName: string;
  bName: string;
  aVal: number;
  bVal: number;
  aIsWinner: boolean;
}

function InsightRow({ label, aName, bName, aVal, bVal, aIsWinner }: InsightPillProps) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-2">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-extrabold tabular-nums ${aIsWinner ? "text-[#F5C84C]" : "text-white/40"}`}>
            {aVal}%
          </span>
          <span className="text-[10px] text-white/25 truncate max-w-[72px]">
            {aName.split(" ").pop()}
          </span>
        </div>
        <div className="h-3 w-px bg-white/[0.08]" />
        <div className="flex items-center gap-1.5 flex-row-reverse">
          <span className={`text-sm font-extrabold tabular-nums ${!aIsWinner ? "text-[#F5C84C]" : "text-white/40"}`}>
            {bVal}%
          </span>
          <span className="text-[10px] text-white/25 truncate max-w-[72px]">
            {bName.split(" ").pop()}
          </span>
        </div>
      </div>
    </div>
  );
}

export function OutcomeDistributionChart({
  playerA,
  playerB,
  winnerPlayerId,
  isPremium,
  onUpgrade,
  embedded = false,
}: OutcomeDistributionChartProps) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 120);
    return () => clearTimeout(t);
  }, []);

  const { bucketsA, bucketsB, insightsA, insightsB } = useMemo(() => {
    const scoresA = simulateScores(playerA);
    const scoresB = simulateScores(playerB);
    return {
      bucketsA: toBuckets(scoresA),
      bucketsB: toBuckets(scoresB),
      insightsA: calcInsights(scoresA),
      insightsB: calcInsights(scoresB),
    };
  }, [
    playerA.player_id,
    playerB.player_id,
    playerA.projection_final,
    playerB.projection_final,
  ]);

  const winnerIsA = String(winnerPlayerId) === String(playerA.player_id);

  return (
    <div className={embedded ? "" : "rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden"}>
      {/* Header — hidden when embedded in parent accordion */}
      {!embedded && (
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.05]">
          <div className="flex items-center gap-2">
            <BarChart2 size={12} className="text-[#F5C84C]" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">
              Outcome Distribution
            </span>
          </div>
          {!isPremium && (
            <span className="text-[10px] font-bold text-[#F5C84C]/60 bg-[#F5C84C]/[0.08] px-2.5 py-1 rounded-full">
              Neeko+
            </span>
          )}
        </div>
      )}

      {isPremium ? (
        <div className="px-5 py-4 space-y-5">
          <p className="text-[11px] text-white/25 leading-snug">
            Projected fantasy score range based on model simulation.
          </p>

          {/* Two-column distributions — stack on mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
            <PlayerDistribution
              name={playerA.player_name}
              buckets={bucketsA}
              isWinner={winnerIsA}
              animated={animated}
            />
            <PlayerDistribution
              name={playerB.player_name}
              buckets={bucketsB}
              isWinner={!winnerIsA}
              animated={animated}
            />
          </div>

          {/* Key insights */}
          <div className="space-y-2 pt-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/20 mb-3">
              Key Probabilities
            </p>
            <InsightRow
              label="Bust Risk (score < 80)"
              aName={playerA.player_name}
              bName={playerB.player_name}
              aVal={insightsA.bustRisk}
              bVal={insightsB.bustRisk}
              aIsWinner={winnerIsA}
            />
            <InsightRow
              label="Ceiling Chance (score 120+)"
              aName={playerA.player_name}
              bName={playerB.player_name}
              aVal={insightsA.ceilingChance}
              bVal={insightsB.ceilingChance}
              aIsWinner={winnerIsA}
            />
            <InsightRow
              label="Safe Score (score 100+)"
              aName={playerA.player_name}
              bName={playerB.player_name}
              aVal={insightsA.safeScore}
              bVal={insightsB.safeScore}
              aIsWinner={winnerIsA}
            />
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden">
          {/* Blurred preview */}
          <div className="px-5 py-4 blur-sm pointer-events-none select-none" aria-hidden>
            <div className="grid grid-cols-2 gap-6">
              {[
                { name: playerA.player_name, isWinner: winnerIsA },
                { name: playerB.player_name, isWinner: !winnerIsA },
              ].map(({ name, isWinner }) => (
                <div key={name} className="space-y-2">
                  <p className={`text-xs font-bold mb-3 ${isWinner ? "text-[#F5C84C]" : "text-white/50"}`}>
                    {name}
                  </p>
                  {BUCKET_LABELS.map((label, i) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="text-[10px] text-white/30 w-14 text-right font-mono">{label}</span>
                      <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isWinner ? "bg-[#F5C84C]/60" : "bg-white/20"}`}
                          style={{ width: `${[8, 18, 32, 26, 12, 4][i]}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-white/20 w-8">{[8, 18, 32, 26, 12, 4][i]}%</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Overlay CTA */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-[#070707]/55 px-6">
            <div className="flex items-center gap-2">
              <Lock size={12} className="text-white/35" />
              <p className="text-sm font-semibold text-white/55">Scoring Range Probabilities</p>
            </div>
            <p className="text-xs text-white/30 text-center leading-snug">
              Bust risk, ceiling chance and safe score floor — Neeko+
            </p>
            <button
              onClick={onUpgrade}
              className="flex items-center gap-1.5 bg-[#F5C84C] text-black font-bold text-xs px-4 py-2 rounded-lg hover:brightness-108 active:scale-[0.98] transition-all mt-0.5"
            >
              <Crown size={10} />
              Unlock with Neeko+
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
