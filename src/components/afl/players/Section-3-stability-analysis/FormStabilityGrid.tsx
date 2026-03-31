import React, { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Sparkles, ChevronDown, TrendingUp, Minus, TrendingDown } from "lucide-react";
import { SectionHeader } from "@/components/sports/shared/SectionHeader";
import type { StatConfig, StatKey } from "@/lib/stats/types";
import {
  getFormStabilityGridData,
  type FormStabilityRow,
} from "@/features/afl/players/data/getFormStabilityGridData";

type Tone = "hot" | "stable" | "cold";

function getStabilityBandColor(stabilityBand: string): string {
  const lower = stabilityBand.toLowerCase();

  if (lower.includes("elite")) {
    return "bg-yellow-400/30 text-yellow-200 border-yellow-400/40";
  }
  if (lower.includes("reliable")) {
    return "bg-yellow-500/25 text-yellow-300 border-yellow-500/35";
  }
  if (lower.includes("moderate")) {
    return "bg-amber-500/25 text-amber-300 border-amber-500/35";
  }
  if (lower.includes("volatile")) {
    return "bg-orange-500/25 text-orange-300 border-orange-500/35";
  }
  if (lower.includes("chaos")) {
    return "bg-red-500/25 text-red-300 border-red-500/35";
  }

  return "bg-white/[0.08] text-white/70 border-white/10";
}

function getConfidenceBadgeColor(confidenceLabel: string): string {
  const lower = confidenceLabel.toLowerCase();

  if (lower.includes("very high") || lower.includes("elite")) {
    return "bg-emerald-500/25 text-emerald-200 border-emerald-500/35";
  }
  if (lower.includes("high")) {
    return "bg-green-500/25 text-green-200 border-green-500/35";
  }
  if (lower.includes("medium") || lower.includes("moderate")) {
    return "bg-blue-500/25 text-blue-200 border-blue-500/35";
  }
  if (lower.includes("low")) {
    return "bg-orange-500/25 text-orange-200 border-orange-500/35";
  }
  if (lower.includes("very low")) {
    return "bg-red-500/25 text-red-200 border-red-500/35";
  }

  return "bg-white/[0.08] text-white/70 border-white/10";
}

function formatTrendDiff(diff: number, statType: string): string {
  const abs = Math.abs(diff);
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";

  if (statType === "goals") {
    return `${sign}${abs.toFixed(1)}`;
  }
  return `${sign}${Math.round(abs)}`;
}

function getTrendDiffColor(diff: number): string {
  if (diff > 5) return "bg-emerald-500/25 text-emerald-200 border-emerald-500/40";
  if (diff > 0) return "bg-green-500/25 text-green-200 border-green-500/40";
  if (diff < -5) return "bg-red-500/25 text-red-200 border-red-500/40";
  if (diff < 0) return "bg-orange-500/25 text-orange-200 border-orange-500/40";
  return "bg-white/[0.08] text-white/70 border-white/10";
}

function PlayerCard({
  player,
  tone,
  title,
  statType,
  isOpen,
  onToggle,
}: {
  player: FormStabilityRow;
  tone: Tone;
  title: string;
  statType: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const glow =
    tone === "hot"
      ? "shadow-[0_0_18px_rgba(239,68,68,0.40)]"
      : tone === "stable"
      ? "shadow-[0_0_18px_rgba(250,204,21,0.38)]"
      : "shadow-[0_0_18px_rgba(56,189,248,0.40)]";

  const border =
    tone === "hot"
      ? "border-red-500/35"
      : tone === "stable"
      ? "border-yellow-400/32"
      : "border-cyan-400/35";

  const badgeBg =
    tone === "hot"
      ? "bg-red-500/25 text-red-200"
      : tone === "stable"
      ? "bg-yellow-500/25 text-yellow-100"
      : "bg-cyan-500/25 text-cyan-100";

  const trendIcon =
    tone === "hot" ? (
      <TrendingUp className="h-3 w-3" />
    ) : tone === "stable" ? (
      <Minus className="h-3 w-3" />
    ) : (
      <TrendingDown className="h-3 w-3" />
    );

  return (
    <button
      onClick={onToggle}
      className={cn(
        "relative w-full rounded-xl border px-4 py-3 md:px-5 md:py-4",
        "bg-black/55 backdrop-blur-xl transition-all duration-200",
        "hover:-translate-y-[2px] text-left",
        glow,
        border
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-xl opacity-55",
          tone === "hot" &&
            "bg-gradient-to-b from-red-500/20 via-transparent to-red-500/10",
          tone === "stable" &&
            "bg-gradient-to-b from-yellow-500/20 via-transparent to-yellow-500/10",
          tone === "cold" &&
            "bg-gradient-to-b from-sky-400/20 via-transparent to-sky-400/8"
        )}
      />

      <div className="relative space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em]",
                  badgeBg
                )}
              >
                {trendIcon}
                {title}
              </span>
            </div>

            <div>
              <p className="text-sm font-semibold text-white">{player.player_name}</p>
            </div>
          </div>

          <div className="text-right space-y-1">
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold",
                getTrendDiffColor(player.trend_diff)
              )}
            >
              {formatTrendDiff(player.trend_diff, statType)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div
            className={cn(
              "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
              getStabilityBandColor(player.stability_band)
            )}
          >
            {player.stability_band}
          </div>

          <div className="text-[11px] text-white/60">
            Stability{" "}
            <span className="font-semibold text-white/80">
              {player.stability_score.toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-white/65">
            {tone === "hot" && "Recent surge in output"}
            {tone === "stable" && "Consistent output with minimal variance"}
            {tone === "cold" && "Recent decline in output"}
          </p>

          <div className="flex items-center gap-1 text-[11px] text-white/60">
            <span>{isOpen ? "Hide" : "Show"}</span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                isOpen && "rotate-180"
              )}
            />
          </div>
        </div>

        {isOpen && (
          <div className="mt-3 border-t border-white/10 pt-3 space-y-2 animate-in fade-in slide-in-from-top-1">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-white/50 text-[10px] uppercase tracking-wider mb-0.5">
                  Recent Avg
                </p>
                <p className="font-semibold text-white">
                  {statType === "goals"
                    ? player.recent_avg.toFixed(1)
                    : Math.round(player.recent_avg)}
                </p>
              </div>

              <div>
                <p className="text-white/50 text-[10px] uppercase tracking-wider mb-0.5">
                  Season Avg
                </p>
                <p className="font-semibold text-white">
                  {statType === "goals"
                    ? player.season_avg.toFixed(1)
                    : Math.round(player.season_avg)}
                </p>
              </div>

              <div>
                <p className="text-white/50 text-[10px] uppercase tracking-wider mb-0.5">
                  Variance
                </p>
                <p className="font-semibold text-white">
                  {player.variance.toFixed(1)}
                </p>
              </div>

              <div>
                <p className="text-white/50 text-[10px] uppercase tracking-wider mb-0.5">
                  Games Used
                </p>
                <p className="font-semibold text-white">{player.games_used}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
              <p className="text-white/50 text-[10px] uppercase tracking-wider">
                Confidence:
              </p>
              <div
                className={cn(
                  "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                  getConfidenceBadgeColor(player.confidence_label)
                )}
              >
                {player.confidence_label}
              </div>
            </div>

            <div className="pt-2 border-t border-white/5">
              <p className="text-[11px] leading-relaxed text-white/70">
                <span className="font-semibold text-white/85">
                  {player.player_name}
                </span>{" "}
                {tone === "hot" &&
                  `is showing strong recent form with output ${formatTrendDiff(
                    player.trend_diff,
                    statType
                  )} above their season baseline.`}
                {tone === "stable" &&
                  `demonstrates consistent output with a stability score of ${player.stability_score.toFixed(
                    0
                  )}% and minimal variance.`}
                {tone === "cold" &&
                  `has experienced a recent dip, performing ${formatTrendDiff(
                    Math.abs(player.trend_diff),
                    statType
                  )} below their usual baseline.`}
              </p>
            </div>
          </div>
        )}
      </div>
    </button>
  );
}

function ColumnShell({
  tone,
  title,
  subtitle,
  children,
}: {
  tone: Tone;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const headingColor =
    tone === "hot"
      ? "text-red-200"
      : tone === "stable"
      ? "text-yellow-200"
      : "text-cyan-100";

  const icon =
    tone === "hot" ? (
      <span className="text-lg">🔥</span>
    ) : tone === "stable" ? (
      <span className="text-lg">🟡</span>
    ) : (
      <span className="text-lg">❄️</span>
    );

  return (
    <div className="relative space-y-4">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          {icon}
          <p className={cn("text-xs font-semibold uppercase tracking-[0.17em]", headingColor)}>
            {title}
          </p>
        </div>
        <p className="text-[11px] text-white/65 md:text-xs">{subtitle}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export default function FormStabilityGrid({ statConfig }: { statConfig: StatConfig }) {
  const [selectedStat, setSelectedStat] = useState<StatKey>(statConfig.defaultStat);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [data, setData] = useState<FormStabilityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const currentSeason = 2025;

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      setLoading(true);
      try {
        const result = await getFormStabilityGridData({
          season: currentSeason,
          stat: selectedStat,
        });

        if (mounted) {
          setData(result.rows);
          setOpenKey(null);
        }
      } catch (error) {
        console.error("Error fetching form stability grid:", error);
        if (mounted) {
          setData([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      mounted = false;
    };
  }, [selectedStat, currentSeason]);

  const filteredData = useMemo(() => {
    return data.filter(
      (row) => row.games_used >= 5 && row.season_avg > 0
    );
  }, [data]);

  const trendingUp = useMemo(() => {
    return [...filteredData]
      .sort((a, b) => b.trend_diff - a.trend_diff)
      .slice(0, 5);
  }, [filteredData]);

  const stable = useMemo(() => {
    return [...filteredData]
      .sort((a, b) => Math.abs(a.trend_diff) - Math.abs(b.trend_diff))
      .slice(0, 5);
  }, [filteredData]);

  const trendingDown = useMemo(() => {
    return [...filteredData]
      .sort((a, b) => a.trend_diff - b.trend_diff)
      .slice(0, 5);
  }, [filteredData]);

  const statLabel = statConfig.labels[selectedStat] || selectedStat;

  const makeKey = (tone: Tone, playerId: string) => `${tone}-${playerId}`;

  return (
    <section
      className={cn(
        "relative rounded-3xl border border-white/10 px-4 py-6 md:px-6 md:py-8",
        "bg-gradient-to-br from-[#050507] via-black to-[#111010]",
        "shadow-[0_0_80px_rgba(0,0,0,0.75)] overflow-hidden"
      )}
    >
      <div className="pointer-events-none absolute inset-x-[-60px] top-28 bottom-[-60px] bg-gradient-to-r from-red-500/18 via-yellow-400/18 to-sky-400/20 blur-2xl opacity-55" />

      <div className="pointer-events-none absolute -top-32 left-1/2 h-48 w-[420px] -translate-x-1/2 rounded-full bg-yellow-500/18 blur-3xl" />

      <div className="relative space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <SectionHeader
              pillLabel="Form Stability Grid"
              title="Hot risers, rock-solid anchors & form slumps"
              description={`Last 5 rounds of ${statLabel.toLowerCase()} — split into recent surges, stability leaders and cooling risks.`}
              icon={Sparkles}
            />
          </div>

          <div className="flex flex-col items-start gap-2 md:items-end">
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/45">
              Stat lens
            </span>

            <div className="flex flex-wrap gap-1.5">
              {statConfig.availableStats.map((s) => {
                const active = selectedStat === s;
                return (
                  <button
                    key={s}
                    onClick={() => {
                      setSelectedStat(s);
                    }}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-xs md:text-[13px] border transition-all backdrop-blur-sm",
                      active
                        ? "bg-yellow-400 text-black border-yellow-300 font-semibold shadow-[0_0_15px_rgba(250,204,21,0.6)] ring-1 ring-yellow-500/40"
                        : "bg-white/5 text-white/70 border-white/12 hover:bg-white/10"
                    )}
                  >
                    {statConfig.labels[s]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-sm text-white/50">Loading stability data...</div>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-sm text-white/50">No stability data available</div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            <ColumnShell
              tone="hot"
              title="Trending Up"
              subtitle="Biggest recent surges vs season baseline."
            >
              {trendingUp.length > 0 ? (
                trendingUp.map((player) => {
                  const key = makeKey("hot", player.player_id);
                  return (
                    <PlayerCard
                      key={key}
                      player={player}
                      tone="hot"
                      title="Hot Form"
                      statType={selectedStat}
                      isOpen={openKey === key}
                      onToggle={() => setOpenKey(openKey === key ? null : key)}
                    />
                  );
                })
              ) : (
                <p className="text-xs text-white/40 italic">No trending up players</p>
              )}
            </ColumnShell>

            <ColumnShell
              tone="stable"
              title="Stable"
              subtitle="Most consistent output with minimal variance."
            >
              {stable.length > 0 ? (
                stable.map((player) => {
                  const key = makeKey("stable", player.player_id);
                  return (
                    <PlayerCard
                      key={key}
                      player={player}
                      tone="stable"
                      title="Stability"
                      statType={selectedStat}
                      isOpen={openKey === key}
                      onToggle={() => setOpenKey(openKey === key ? null : key)}
                    />
                  );
                })
              ) : (
                <p className="text-xs text-white/40 italic">No stable players</p>
              )}
            </ColumnShell>

            <ColumnShell
              tone="cold"
              title="Trending Down"
              subtitle="Biggest recent declines vs season baseline."
            >
              {trendingDown.length > 0 ? (
                trendingDown.map((player) => {
                  const key = makeKey("cold", player.player_id);
                  return (
                    <PlayerCard
                      key={key}
                      player={player}
                      tone="cold"
                      title="Cooling"
                      statType={selectedStat}
                      isOpen={openKey === key}
                      onToggle={() => setOpenKey(openKey === key ? null : key)}
                    />
                  );
                })
              ) : (
                <p className="text-xs text-white/40 italic">No trending down players</p>
              )}
            </ColumnShell>
          </div>
        )}
      </div>
    </section>
  );
}
