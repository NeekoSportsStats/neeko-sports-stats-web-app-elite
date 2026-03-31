import React, { useMemo, useEffect, useRef } from "react";
import { X, TrendingUp, Activity, Target } from "lucide-react";
import { PlayerData, StatLens } from "./getPlayers";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useNavigate } from "react-router-dom";
import { getRoundLabel } from "./utils";
import { getPerformanceSummaryText } from "./performanceSummary";

const fmt1 = (v: any): string => {
  const num = Number(v);
  return Number.isFinite(num) ? num.toFixed(1) : "—";
};

interface PlayerOverlayProps {
  player: PlayerData;
  lens: StatLens;
  onLensChange: (lens: StatLens) => void;
  onClose: () => void;
}

export default function PlayerOverlay({ player, lens, onLensChange, onClose }: PlayerOverlayProps) {
  const navigate = useNavigate();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = React.useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const lensOptions: { value: StatLens; label: string }[] = [
    { value: "fantasy", label: "Fantasy" },
    { value: "disposals", label: "Disposals" },
    { value: "goals", label: "Goals" },
  ];

  const hitRateThresholds = useMemo(() => {
    if (lens === "fantasy") return [60, 70, 80, 90, 100];
    if (lens === "disposals") return [15, 20, 25, 30, 35];
    return [1, 2, 3, 4, 5];
  }, [lens]);

  const recalculatedHitRates = useMemo(() => {
    const playedGames = player.games.filter(g => g.played && g.score != null);
    const values = playedGames.map(g => g.score as number);
    const totalGames = playedGames.length;

    return hitRateThresholds.map((threshold) => {
      const count = values.filter((v) => v >= threshold).length;
      const percentage = totalGames > 0 ? (count / totalGames) * 100 : 0;
      return { threshold, count, percentage };
    });
  }, [player.games, hitRateThresholds]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (overlayRef.current && e.target === overlayRef.current) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const recentRounds = useMemo(() => {
    const games = [...player.games]
      .filter(g => g.score != null)
      .sort((a, b) => {
        if (a.round_number !== b.round_number) return a.round_number - b.round_number;
        return a.game_index - b.game_index;
      })
      .slice(-5);

    return games.map(game => ({
      roundNum: game.round_number,
      displayLabel: game.display_label,
      score: game.score
    }));
  }, [player.games]);

  const chartData = useMemo(() => {
    return player.games
      .filter(g => g.score != null)
      .sort((a, b) => {
        if (a.round_number !== b.round_number) return a.round_number - b.round_number;
        return a.game_index - b.game_index;
      })
      .map(game => ({
        round: game.display_label,
        score: game.score as number,
      }));
  }, [player.games]);

  const handleViewAIAnalysis = () => {
    navigate("/sports/afl/ai-analysis");
  };

  const performanceSummary = useMemo(() => {
    const hit80 = recalculatedHitRates.find(h => h.threshold === 80)?.percentage ?? 0;
    const hit100 = recalculatedHitRates.find(h => h.threshold === 100)?.percentage ?? 0;
    return getPerformanceSummaryText({
      lens,
      playerName: player.name,
      avg: player.stats.avg,
      min: player.stats.min,
      max: player.stats.max,
      gamesPlayed: player.stats.games,
      volatility: player.stats.volatility,
      hitRate80: hit80,
      hitRate100: hit100,
    });
  }, [lens, player.stats, player.name, recalculatedHitRates]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl overflow-y-auto"
      onClick={onClose}
    >
      <div className="min-h-screen p-3 md:p-8">
        <div className="max-w-5xl mx-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between mb-4 md:mb-6">
            <div className="flex items-center gap-4">
              <div
                className="w-2 h-16 md:h-16 h-14 rounded-full"
                style={{ backgroundColor: player.teamColor || "#666" }}
              />
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white">{player.name}</h2>
                <div className="mt-0.5 md:mt-1 flex items-center gap-3 text-sm md:text-base text-white/60">
                  <span>{player.team}</span>
                  <span>·</span>
                  <span>{player.role}</span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 min-h-[44px] min-w-[44px] rounded-lg border border-white/10 bg-black/60 text-white/70 hover:text-white hover:border-red-400/60 hover:bg-red-500/10 transition-all flex items-center justify-center touch-manipulation"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-6 md:space-y-10">
            <div className="flex gap-2 flex-wrap">
              {lensOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onLensChange(option.value)}
                  className={`rounded-full border text-sm font-medium transition-all ${
                    isMobile ? 'px-3.5 py-1.5' : 'px-4 py-2'
                  } ${
                    lens === option.value
                      ? "bg-yellow-400 text-black border-yellow-300 shadow-[0_0_20px_rgba(250,204,21,0.7)]"
                      : "bg-black/40 border-white/20 text-white/70 hover:border-yellow-400/60"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl p-4">
              <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-4">
                Last 5 Rounds
              </h3>
              <div className="flex flex-wrap gap-3">
                {recentRounds.map((round) => {
                  const score = round.score;

                  const getColor = () => {
                    if (score == null) return "text-white/35";

                    if (lens === "fantasy") {
                      return score >= 80 ? "text-emerald-400" : score >= 60 ? "text-yellow-400" : "text-red-400";
                    }

                    if (lens === "disposals") {
                      return score >= 25 ? "text-emerald-400" : score >= 20 ? "text-yellow-400" : "text-red-400";
                    }

                    return score >= 2 ? "text-emerald-400" : score >= 1 ? "text-yellow-400" : "text-red-400";
                  };

                  return (
                    <div
                      key={`${round.roundNum}_${round.displayLabel}`}
                      className="flex flex-col items-center gap-2 px-4 py-3 rounded-lg border border-white/10 bg-white/5"
                    >
                      <span className="text-xs text-white/50">{round.displayLabel}</span>
                      <span className={`text-2xl font-bold ${getColor()}`}>
                        {score == null ? "—" : score}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl p-4">
              <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-4">
                Performance Trend
              </h3>

              {chartData.length === 0 ? (
                <div className="text-sm text-white/45">No trend data available.</div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis
                        dataKey="round"
                        stroke="#666"
                        style={{ fontSize: "12px" }}
                        tick={{ fill: "#999" }}
                      />
                      <YAxis
                        stroke="#666"
                        style={{ fontSize: "12px" }}
                        tick={{ fill: "#999" }}
                        domain={[0, "dataMax + 20"]}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#000",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "8px",
                        }}
                        labelStyle={{ color: "#fff" }}
                        itemStyle={{ color: "#FCD34D" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#FCD34D"
                        strokeWidth={3}
                        dot={{ fill: "#FCD34D", r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className={`grid grid-cols-1 ${!isMobile ? 'lg:grid-cols-2' : ''} gap-6`}>
              {!isMobile && (
                <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="h-5 w-5 text-yellow-400" />
                    <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
                      Season Summary
                    </h3>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Average</span>
                      <span className="text-2xl font-bold text-yellow-400">
                        {lens === "goals" ? fmt1(player.stats.avg) : player.stats.avg}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Minimum</span>
                      <span className="text-lg font-semibold text-white">{player.stats.min}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Maximum</span>
                      <span className="text-lg font-semibold text-white">{player.stats.max}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Games Played</span>
                      <span className="text-lg font-semibold text-white">{player.stats.games}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Total</span>
                      <span className="text-lg font-semibold text-white">
                        {lens === "goals" ? fmt1(player.stats.total) : player.stats.total}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/10 pt-4">
                      <span className="text-white/60">Volatility</span>
                      <span className="text-lg font-semibold text-orange-400">
                        {lens === "goals" ? fmt1(player.stats.volatility) : player.stats.volatility}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Target className="h-5 w-5 text-yellow-400" />
                  <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
                    Hit Rate Ladder
                  </h3>
                </div>

                <div className="space-y-4">
                  {recalculatedHitRates.map((hr, idx) => {
                    const playedGames = player.games.filter(g => g.played && g.score != null).length;
                    return (
                      <div key={`${hr.threshold}_${idx}`} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-white/60">{hr.threshold}+ </span>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-semibold">
                              {hr.count}/{playedGames}
                            </span>
                            <span className="text-yellow-400 font-bold">
                              {Math.round(hr.percentage)}%
                            </span>
                          </div>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-yellow-400 to-yellow-500 transition-all duration-500"
                            style={{ width: `${hr.percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-yellow-400/40 bg-gradient-to-br from-yellow-500/10 to-amber-500/10 backdrop-blur-xl p-5">
              <div className="flex items-start gap-3 mb-4">
                <TrendingUp className="h-6 w-6 text-yellow-400 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-white">Performance Summary</h3>
                    <span className="px-2 py-0.5 rounded-full bg-yellow-400/20 border border-yellow-400/40 text-yellow-300 text-[10px] font-medium uppercase tracking-wide">
                      Rule-based
                    </span>
                  </div>
                  <p className="text-white/80 leading-relaxed text-[14px]">
                    {performanceSummary}
                  </p>
                </div>
              </div>

              <button
                onClick={handleViewAIAnalysis}
                className="w-full py-3 px-6 rounded-lg bg-yellow-400 text-black font-semibold hover:bg-yellow-300 transition-all shadow-[0_0_30px_rgba(250,204,21,0.5)] hover:shadow-[0_0_40px_rgba(250,204,21,0.7)]"
                title="AI Insights coming soon"
              >
                View Full AI Analysis
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}