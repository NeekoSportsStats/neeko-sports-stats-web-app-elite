import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Activity,
  TrendingUp,
  TrendingDown,
  Zap,
} from "lucide-react";
import { SectionHeader } from "@/components/sports/shared/SectionHeader";
import type { StatConfig } from "@/lib/stats/types";
import type { StatKey } from "@/lib/stats/types";
import {
  getPositionTrendData,
  type PositionPlayerMetrics,
  type PositionTrendData,
} from "@/features/afl/players/data/getPositionTrendData";

type PositionKey = "MID" | "FWD" | "DEF" | "RUC";

const POSITION_CONFIG: {
  key: PositionKey;
  label: string;
  description: string;
  toneClasses: {
    pill: string;
    glow: string;
    border: string;
    header: string;
  };
}[] = [
  {
    key: "MID",
    label: "Mids",
    description: "Inside/wing rotations and centre-square usage trends.",
    toneClasses: {
      pill: "bg-emerald-500/15 text-emerald-200 border-emerald-400/60",
      glow: "from-emerald-500/22 via-transparent to-emerald-400/12",
      border: "border-emerald-400/45",
      header: "text-emerald-100",
    },
  },
  {
    key: "FWD",
    label: "Forwards",
    description: "Forward-half threat, pressure roles and shot volume.",
    toneClasses: {
      pill: "bg-red-500/18 text-red-200 border-red-400/65",
      glow: "from-red-500/25 via-transparent to-orange-400/15",
      border: "border-red-400/45",
      header: "text-red-100",
    },
  },
  {
    key: "DEF",
    label: "Defenders",
    description: "Ball movement chains, intercept load and kick-out share.",
    toneClasses: {
      pill: "bg-sky-500/18 text-sky-100 border-sky-400/60",
      glow: "from-sky-500/25 via-transparent to-cyan-400/15",
      border: "border-sky-400/45",
      header: "text-sky-100",
    },
  },
  {
    key: "RUC",
    label: "Rucks",
    description: "Ruck share, stoppage work and around-the-ground impact.",
    toneClasses: {
      pill: "bg-purple-500/18 text-purple-100 border-purple-400/60",
      glow: "from-purple-500/25 via-transparent to-fuchsia-400/15",
      border: "border-purple-400/45",
      header: "text-purple-100",
    },
  },
];

function MiniSparkline({ data }: { data: number[] }) {
  if (!data.length) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const normalized = data.map((v) => ((v - min) / (max - min || 1)) * 100);
  const width = Math.max(normalized.length * 18, 64);

  const peakIndex = normalized.indexOf(Math.max(...normalized));
  const peakX = (peakIndex / Math.max(normalized.length - 1, 1)) * width;
  const peakY = 100 - normalized[peakIndex];

  return (
    <div className="relative h-10 w-full">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${width} 100`}
        preserveAspectRatio="none"
      >
        <polyline
          points={normalized
            .map((v, i) => `${(i / (normalized.length - 1)) * width},${100 - v}`)
            .join(" ")}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={4}
        />

        <polyline
          points={normalized
            .map((v, i) => `${(i / (normalized.length - 1)) * width},${100 - v}`)
            .join(" ")}
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={2}
        />

        <circle
          cx={peakX}
          cy={peakY}
          r={3.2}
          fill="rgba(255,255,255,0.9)"
          className="drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]"
        />
      </svg>
    </div>
  );
}

function inferRoleType(pos: string) {
  const p = pos.toUpperCase();
  if (p.includes("MID") && p.includes("FWD")) return "MID/FWD hybrid";
  if (p.includes("MID") && p.includes("DEF")) return "MID/DEF hybrid";
  if (p.includes("MID")) return "Inside/wing mid";
  if (p.includes("RUC") && p.includes("FWD")) return "Ruck/forward split";
  if (p.includes("RUC")) return "Primary ruck";
  if (p.includes("DEF")) return "Rebounding defender";
  if (p.includes("FWD")) return "Attacking forward";
  return "Versatile role";
}

function roleDirectionLabel(delta: number) {
  if (delta > 5) return { label: "Role trending up", tone: "text-emerald-300" };
  if (delta > 1.5) return { label: "Subtle uptick", tone: "text-emerald-200" };
  if (delta < -5) return { label: "Role trending down", tone: "text-red-300" };
  if (delta < -1.5) return { label: "Softening role", tone: "text-red-200" };
  return { label: "Role holding steady", tone: "text-zinc-300" };
}

function PositionPlayerCard({
  metric,
  variant,
}: {
  metric: PositionPlayerMetrics;
  variant: "hot" | "cold";
}) {
  const { label: directionLabel, tone } = roleDirectionLabel(
    metric.delta_vs_season
  );

  const compositeTone =
    variant === "hot" ? "text-emerald-300/80" : "text-red-300/80";

  const icon =
    variant === "hot" ? (
      <TrendingUp className="h-3.5 w-3.5 text-emerald-300" />
    ) : (
      <TrendingDown className="h-3.5 w-3.5 text-red-300" />
    );

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-white/10 bg-black/60 px-3.5 py-3 text-xs",
        "shadow-[0_0_18px_rgba(0,0,0,0.7)] backdrop-blur-xl md:px-4 md:py-3.5",
        "transition-all duration-200 hover:-translate-y-[1px]",
        variant === "hot"
          ? "hover:shadow-[0_0_20px_rgba(16,185,129,0.35)]"
          : "hover:shadow-[0_0_20px_rgba(239,68,68,0.32)]"
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/6 via-transparent to-transparent" />

      <div className="relative flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5">
              {icon}
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
                {variant === "hot" ? "Hot mover" : "Cooling signal"}
              </span>
            </div>

            <p className="text-sm font-semibold text-white">{metric.full_name}</p>
            <p className="text-[11px] text-white/55">
              {metric.team_abbr} • {metric.primary_position} •{" "}
              {inferRoleType(metric.primary_position)}
            </p>
          </div>

          <div className="text-right space-y-0.5">
            <p className="text-[11px] text-white/65">
              L5 avg{" "}
              <span className="font-semibold text-white">
                {metric.l5_avg.toFixed(1)}
              </span>
            </p>
            <p className="text-[11px] text-white/65">
              Season{" "}
              <span className="font-semibold text-white/90">
                {metric.season_avg.toFixed(1)}
              </span>
            </p>
            <p className={cn("text-[11px] font-medium", tone)}>
              {metric.delta_vs_season > 0
                ? `+${metric.delta_vs_season.toFixed(1)} vs avg`
                : `${metric.delta_vs_season.toFixed(1)} vs avg`}
            </p>
            <p className="text-[11px] text-white/60">
              Stability{" "}
              <span className="font-semibold text-yellow-300">
                {metric.stability_score.toFixed(0)}%
              </span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)] gap-2 pt-1">
          <MiniSparkline data={metric.last_5_values} />

          <div className="flex flex-col justify-center gap-1 text-[11px] text-white/70">
            <p className={tone}>{directionLabel}</p>
            <p className="text-white/55">
              Composite role trend{" "}
              <span className={cn("font-semibold", compositeTone)}>
                {metric.composite_score.toFixed(1)}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PositionTrends({ statConfig }: { statConfig: StatConfig }) {
  const [selectedPos, setSelectedPos] = useState<PositionKey>("MID");
  const [data, setData] = useState<PositionTrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await getPositionTrendData({
          season: 2025,
          stat: statConfig.defaultStat as StatKey,
        });
        setData(result);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        console.error("Failed to load position trend data:", errorMessage);
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [statConfig.defaultStat]);

  const config = POSITION_CONFIG.find((c) => c.key === selectedPos)!;
  const hot = data?.[selectedPos]?.hot ?? [];
  const cold = data?.[selectedPos]?.cold ?? [];

  return (
    <section
      className={cn(
        "relative mt-8 rounded-3xl border border-white/10",
        "bg-gradient-to-br from-[#050507] via-black to-[#101016]",
        "px-4 py-6 md:px-6 md:py-8",
        "shadow-[0_0_70px_rgba(0,0,0,0.75)] overflow-hidden"
      )}
    >
      <div className="pointer-events-none absolute inset-x-[-60px] top-24 bottom-[-60px] bg-gradient-to-r from-emerald-500/15 via-red-500/10 to-sky-500/18 blur-3xl opacity-60" />

      <div className="pointer-events-none absolute -top-32 left-1/2 h-44 w-[380px] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />

      <div className="relative space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <SectionHeader
              pillLabel="Position Trends"
              title="Role-driven trends by line"
              description="Blends recent fantasy output with stability and volatility to surface the most important movers and softening role signals across each position."
              icon={Sparkles}
            />
          </div>

          <div className="flex flex-col items-start gap-2 md:items-end">
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/45">
              Position lens
            </span>
            <div className="flex flex-wrap gap-1.5">
              {POSITION_CONFIG.map((pos) => {
                const active = pos.key === selectedPos;
                return (
                  <button
                    key={pos.key}
                    onClick={() => setSelectedPos(pos.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs md:text-[13px]",
                      "backdrop-blur-sm transition-all",
                      active
                        ? "bg-white text-black border-white shadow-[0_0_18px_rgba(250,250,250,0.65)]"
                        : "bg-white/5 text-white/70 border-white/15 hover:bg-white/10"
                    )}
                  >
                    <Activity className="h-3.5 w-3.5" />
                    <span>{pos.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-3">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-yellow-400 border-r-transparent"></div>
              <p className="text-sm text-white/60">Loading Position Trends...</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
            <p className="text-sm text-red-400">
              Failed to load position trends. Check console for details.
            </p>
          </div>
        )}

        {!loading && !error && data && (
          <div
            className={cn(
              "relative mt-1 rounded-2xl border bg-black/60 px-4 py-4 md:px-5 md:py-5",
              "overflow-hidden backdrop-blur-xl",
              config.toneClasses.border
            )}
          >
            <div
              className={cn(
                "pointer-events-none absolute inset-0 rounded-2xl opacity-65 bg-gradient-to-br",
                config.toneClasses.glow
              )}
            />

            <div className="relative space-y-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1.5">
                  <div
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]",
                      config.toneClasses.pill
                    )}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    <span>{config.label} – Role Tilt View</span>
                  </div>
                  <p
                    className={cn(
                      "text-xs md:text-sm",
                      config.toneClasses.header
                    )}
                  >
                    {config.description}
                  </p>
                </div>

                <div className="text-[11px] text-white/60 md:text-right">
                  <p className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                    Composite trend = L5 vs season × stability factor
                  </p>
                  <p className="mt-1">
                    Higher scores highlight players whose role and scoring profile
                    are shifting meaningfully.
                  </p>
                </div>
              </div>

              <div className="relative grid gap-4 md:grid-cols-2">
                <div className="pointer-events-none absolute inset-y-2 left-1/2 w-px bg-white/10" />

                <div className="space-y-2.5 md:pr-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15">
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-300" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">
                          Hot movers
                        </p>
                        <p className="text-[11px] text-white/70">
                          Rising form with improving role indicators.
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] text-white/45">
                      Top 5 by composite trend
                    </span>
                  </div>

                  {hot.length === 0 && (
                    <p className="text-[11px] text-white/50">
                      Not enough data yet.
                    </p>
                  )}

                  {hot.map((m) => (
                    <PositionPlayerCard
                      key={`hot-${selectedPos}-${m.player_id}`}
                      metric={m}
                      variant="hot"
                    />
                  ))}
                </div>

                <div className="space-y-2.5 md:pl-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15">
                        <TrendingDown className="h-3.5 w-3.5 text-red-300" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-100">
                          Cooling risks
                        </p>
                        <p className="text-[11px] text-white/70">
                          Softening trend lines that may signal role pressure.
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] text-white/45">
                      Bottom 5 by composite trend
                    </span>
                  </div>

                  {cold.length === 0 && (
                    <p className="text-[11px] text-white/50">
                      Not enough data yet.
                    </p>
                  )}

                  {cold.map((m) => (
                    <PositionPlayerCard
                      key={`cold-${selectedPos}-${m.player_id}`}
                      metric={m}
                      variant="cold"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
