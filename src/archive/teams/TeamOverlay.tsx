import React, { useMemo, useEffect, useRef } from "react";
import { X, TrendingUp, Activity, Target } from "lucide-react";
import { TeamData, StatLens } from "./getTeams";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useNavigate } from "react-router-dom";

const fmt1 = (v: any): string => {
  const num = Number(v);
  return Number.isFinite(num) ? num.toFixed(1) : "—";
};

interface TeamOverlayProps {
  team: TeamData;
  lens: StatLens;
  onLensChange: (lens: StatLens) => void;
  onClose: () => void;
}

interface TeamPerformanceSummaryProps {
  team: TeamData;
  lens: StatLens;
  hitRates: { threshold: number; count: number; percentage: number }[];
}

function TeamPerformanceSummary({ team, lens, hitRates }: TeamPerformanceSummaryProps) {
  const avg = lens === "goals" ? parseFloat(fmt1(team.stats.avg)) : Math.round(team.stats.avg);
  const min = lens === "goals" ? parseFloat(fmt1(team.stats.min)) : Math.round(team.stats.min);
  const max = lens === "goals" ? parseFloat(fmt1(team.stats.max)) : Math.round(team.stats.max);
  const games = team.stats.games;
  const volatility = lens === "goals" ? parseFloat(fmt1(team.stats.volatility)) : Math.round(team.stats.volatility);

  const lensLabel = lens === "fantasy" ? "fantasy points" : lens;

  if (lens === "fantasy") {
    const hr1500 = hitRates.find(h => h.threshold === 1500)?.percentage ?? 0;
    const hr1600 = hitRates.find(h => h.threshold === 1600)?.percentage ?? 0;

    const volatilityDescriptor =
      volatility < 80
        ? "very stable scoring output"
        : volatility < 130
        ? "moderate scoring fluctuations"
        : "high scoring volatility";

    const profileDescriptor =
      avg > 1600 ? "elite scoring" : avg > 1500 ? "strong scoring" : "inconsistent scoring";

    const ceilingDescriptor =
      max > 1750 ? "genuine match-winning upside" : "moderate ceiling potential";

    const consistencyDescriptor =
      hr1500 > 75 ? "excellent consistency" : "variable consistency";

    const finalAssessment =
      avg > 1600
        ? "one of the top performing teams this season"
        : "a competitive but matchup-dependent team";

    return (
      <div className="space-y-3 text-white/80 leading-relaxed text-[14px]">
        <p>
          {team.name} has played {games} games this season, producing an average of {avg} fantasy points, highlighting their overall scoring strength.
        </p>
        <p>
          Their ceiling of {max} demonstrates their ability to produce elite match-winning scores, while the floor of {min} shows their lowest output when underperforming.
        </p>
        <p>
          Consistency has been a key factor, with the team exceeding 1500 points in {Math.round(hr1500)}% of matches and surpassing 1600 in {Math.round(hr1600)}%, confirming their ability to regularly deliver competitive fantasy totals.
        </p>
        <p>
          A volatility rating of {volatility} indicates {volatilityDescriptor}, reflecting how stable or unpredictable their weekly performance has been.
        </p>
        <p>
          Overall, {team.name} profiles as a {profileDescriptor} team with {ceilingDescriptor} and {consistencyDescriptor}, making them {finalAssessment}.
        </p>
      </div>
    );
  }

  if (lens === "disposals") {
    const hr300 = hitRates.find(h => h.threshold === 300)?.percentage ?? 0;
    const hr325 = hitRates.find(h => h.threshold === 325)?.percentage ?? 0;

    const volatilityDescriptor =
      volatility < 15
        ? "very stable disposal output"
        : volatility < 30
        ? "moderate disposal fluctuations"
        : "high disposal volatility";

    const profileDescriptor =
      avg > 325 ? "elite ball-winning" : avg > 300 ? "strong disposal" : "inconsistent disposal";

    const ceilingDescriptor =
      max > 360 ? "genuine high-disposal upside" : "moderate ceiling potential";

    const consistencyDescriptor =
      hr300 > 75 ? "excellent disposal consistency" : "variable disposal output";

    const finalAssessment =
      avg > 325
        ? "one of the top disposal teams this season"
        : "a competitive but matchup-dependent disposal team";

    return (
      <div className="space-y-3 text-white/80 leading-relaxed text-[14px]">
        <p>
          {team.name} has played {games} games this season, averaging {avg} disposals, highlighting their overall ball movement strength.
        </p>
        <p>
          Their ceiling of {max} disposals demonstrates their capacity for dominant possession games, while their floor of {min} reflects their lowest output when pressured.
        </p>
        <p>
          The team has exceeded 300 disposals in {Math.round(hr300)}% of matches and surpassed 325 in {Math.round(hr325)}%, indicating their baseline ball-winning reliability.
        </p>
        <p>
          A volatility rating of {volatility} signals {volatilityDescriptor}, showing how consistently they control possession week to week.
        </p>
        <p>
          Overall, {team.name} profiles as a {profileDescriptor} team with {ceilingDescriptor} and {consistencyDescriptor}, making them {finalAssessment}.
        </p>
      </div>
    );
  }

  const hr12 = hitRates.find(h => h.threshold === 12)?.percentage ?? 0;
  const hr14 = hitRates.find(h => h.threshold === 14)?.percentage ?? 0;

  const volatilityDescriptor =
    volatility < 3
      ? "very stable scoring output"
      : volatility < 5
      ? "moderate scoring fluctuations"
      : "high scoring volatility";

  const profileDescriptor =
    avg > 14 ? "elite goal-kicking" : avg > 12 ? "strong scoring" : "inconsistent scoring";

  const ceilingDescriptor =
    max > 18 ? "genuine high-scoring upside" : "moderate ceiling potential";

  const consistencyDescriptor =
    hr12 > 75 ? "excellent scoring consistency" : "variable scoring output";

  const finalAssessment =
    avg > 14
      ? "one of the most potent attacking teams this season"
      : "a competitive but matchup-dependent attacking team";

  return (
    <div className="space-y-3 text-white/80 leading-relaxed text-[14px]">
      <p>
        {team.name} has played {games} games this season, averaging {avg} goals, reflecting their overall attacking output.
      </p>
      <p>
        Their scoring ceiling of {max} goals demonstrates their ability to put up big totals in favourable matchups, while their floor of {min} highlights their lowest attacking performance.
      </p>
      <p>
        The team has kicked 12 or more goals in {Math.round(hr12)}% of matches and surpassed 14 in {Math.round(hr14)}%, indicating how reliably they convert forward entries into scores.
      </p>
      <p>
        A volatility rating of {volatility} indicates {volatilityDescriptor}, showing how predictable their attacking output is from week to week.
      </p>
      <p>
        Overall, {team.name} profiles as a {profileDescriptor} team with {ceilingDescriptor} and {consistencyDescriptor}, making them {finalAssessment}.
      </p>
    </div>
  );
}

export default function TeamOverlay({ team, lens, onLensChange, onClose }: TeamOverlayProps) {
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
    if (lens === "fantasy") return [1400, 1500, 1600, 1700, 1800];
    if (lens === "disposals") return [275, 300, 325, 350, 375];
    return [10, 12, 14, 16, 18];
  }, [lens]);

  const recalculatedHitRates = useMemo(() => {
    const playedGames = team.games.filter(g => g.played && g.score != null);
    const values = playedGames.map(g => g.score as number);
    const totalGames = playedGames.length;

    return hitRateThresholds.map((threshold) => {
      const count = values.filter((v) => v >= threshold).length;
      const percentage = totalGames > 0 ? (count / totalGames) * 100 : 0;
      return { threshold, count, percentage };
    });
  }, [team.games, hitRateThresholds]);

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
    const games = [...team.games]
      .filter(g => g.score != null)
      .sort((a, b) => {
        if (a.round_number !== b.round_number) return a.round_number - b.round_number;
        return a.match_index - b.match_index;
      })
      .slice(-5);

    return games.map(game => ({
      roundNum: game.round_number,
      displayLabel: game.display_label,
      score: game.score
    }));
  }, [team.games]);

  const chartData = useMemo(() => {
    return team.games
      .filter(g => g.score != null)
      .sort((a, b) => {
        if (a.round_number !== b.round_number) return a.round_number - b.round_number;
        return a.match_index - b.match_index;
      })
      .map(game => ({
        round: game.display_label,
        score: game.score as number,
      }));
  }, [team.games]);

  const handleViewAIAnalysis = () => {
    navigate("/sports/afl/ai-analysis");
  };

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
                style={{ backgroundColor: team.teamColor || "#666" }}
              />
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white">{team.name}</h2>
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
                      return score >= 1700 ? "text-emerald-400" : score >= 1500 ? "text-yellow-400" : "text-red-400";
                    }

                    if (lens === "disposals") {
                      return score >= 300 ? "text-emerald-400" : score >= 270 ? "text-yellow-400" : "text-red-400";
                    }

                    return score >= 14 ? "text-emerald-400" : score >= 11 ? "text-yellow-400" : "text-red-400";
                  };

                  return (
                    <div
                      key={`${round.roundNum}_${round.displayLabel}`}
                      className="flex flex-col items-center gap-2 px-4 py-3 rounded-lg border border-white/10 bg-white/5"
                    >
                      <span className="text-xs text-white/50">{round.displayLabel}</span>
                      <span className={`text-2xl font-bold ${getColor()}`}>
                        {score == null ? "—" : lens === "goals" ? fmt1(score) : Math.round(score)}
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
                        domain={[0, "dataMax + 100"]}
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
                        {lens === "goals" ? fmt1(team.stats.avg) : Math.round(team.stats.avg)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Minimum</span>
                      <span className="text-lg font-semibold text-white">
                        {lens === "goals" ? fmt1(team.stats.min) : Math.round(team.stats.min)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Maximum</span>
                      <span className="text-lg font-semibold text-white">
                        {lens === "goals" ? fmt1(team.stats.max) : Math.round(team.stats.max)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Games Played</span>
                      <span className="text-lg font-semibold text-white">{team.stats.games}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Total</span>
                      <span className="text-lg font-semibold text-white">
                        {lens === "goals" ? fmt1(team.stats.total) : Math.round(team.stats.total)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/10 pt-4">
                      <span className="text-white/60">Volatility</span>
                      <span className="text-lg font-semibold text-orange-400">
                        {lens === "goals" ? fmt1(team.stats.volatility) : Math.round(team.stats.volatility)}
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
                    const playedGames = team.games.filter(g => g.played && g.score != null).length;
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
                    <h3 className="text-lg font-semibold text-white">Team Performance</h3>
                  </div>
                  <TeamPerformanceSummary team={team} lens={lens} hitRates={recalculatedHitRates} />
                </div>
              </div>

              <button
                onClick={handleViewAIAnalysis}
                className="w-full py-3 px-6 rounded-lg bg-yellow-400 text-black font-semibold hover:bg-yellow-300 transition-all shadow-[0_0_30px_rgba(250,204,21,0.5)] hover:shadow-[0_0_40px_rgba(250,204,21,0.7)]"
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
