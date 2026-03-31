import React, { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { MOCK_TEAMS } from "../data/mockTeams";
import { TrendingUp, Shield, Target, Zap, Users } from "lucide-react";

/* -------------------------------------------------------------------------- */
/*                               Tooltip helpers                              */
/* -------------------------------------------------------------------------- */

function inferUnit(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes("%") || lower.includes("efficiency")) return "%";
  if (lower.includes("points") || lower.includes("score") || lower.includes("conceded"))
    return "pts";
  if (lower.includes("assists")) return "ast";
  if (lower.includes("rebounds")) return "reb";
  if (lower.includes("steals")) return "stl";
  if (lower.includes("blocks")) return "blk";
  if (lower.includes("threes") || lower.includes("3pt")) return "3PM";
  if (lower.includes("turnovers")) return "TO";
  if (lower.includes("trend")) return "index";
  return "";
}

function formatTooltipValue(value: number, unit: string): string {
  const v = value.toFixed(1);
  if (unit === "%") return `${v}%`;
  if (!unit) return v;
  return `${v} ${unit}`;
}

function formatTooltipDelta(delta: number | null, unit: string): string {
  if (delta === null) return "Δ —";
  if (Math.abs(delta) < 0.05) return "Δ 0.0";
  const sign = delta > 0 ? "+" : "−";
  const mag = Math.abs(delta).toFixed(1);
  if (unit === "%") return `Δ ${sign}${mag}%`;
  if (!unit) return `Δ ${sign}${mag}`;
  return `Δ ${sign}${mag} ${unit}`;
}

/* -------------------------------------------------------------------------- */
/*                      Tooltip payload + portal component                    */
/* -------------------------------------------------------------------------- */

type TooltipPayload = {
  x: number;
  y: number;
  value: number;
  delta: number | null;
  round: number;
  unit: string;
};

function TrendTooltipPortal({ tooltip }: { tooltip: TooltipPayload | null }) {
  if (typeof document === "undefined" || !tooltip) return null;

  return createPortal(
    <div
      className="
        pointer-events-none fixed z-[9999]
        rounded-md border border-white/10
        bg-black/90 backdrop-blur-md
        px-2 py-1 text-[10px] text-neutral-200
        whitespace-nowrap
      "
      style={{
        left: tooltip.x,
        top: tooltip.y,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="text-[8px] uppercase tracking-wider text-neutral-400">
        Game {tooltip.round}
      </div>
      <div className="font-semibold">
        {formatTooltipValue(tooltip.value, tooltip.unit)}
      </div>
      {tooltip.delta !== null && (
        <div className="text-[9px] text-neutral-400">
          {formatTooltipDelta(tooltip.delta, tooltip.unit)}
        </div>
      )}
    </div>,
    document.body
  );
}

/* -------------------------------------------------------------------------- */
/*                    SparklineLarge — desktop hover + mobile tap             */
/*                SINGLE ROW on mobile with adaptive compression              */
/* -------------------------------------------------------------------------- */

type SparklineProps = {
  values: number[];
  color: string;
  label: string;
  onShowTooltip?: (payload: TooltipPayload) => void;
  onHideTooltip?: () => void;
};

function SparklineLarge({
  values,
  color,
  label,
  onShowTooltip,
  onHideTooltip,
}: SparklineProps) {
  const recent = useMemo(
    () => (values.length > 12 ? values.slice(-12) : values),
    [values]
  );
  const startIndex = values.length - recent.length;

  const unit = inferUnit(label);

  const min = Math.min(...recent);
  const max = Math.max(...recent);
  const range = max - min || 1;

  const isTouchDevice =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches;

  function showFromElement(
    el: HTMLElement,
    value: number,
    delta: number | null,
    index: number
  ) {
    try {
      const rect = el.getBoundingClientRect();
      const offset = isTouchDevice ? 4 : 6;
      onShowTooltip?.({
        x: rect.left + rect.width / 2,
        y: rect.top - offset,
        value,
        delta,
        round: index + 1,
        unit,
      });
    } catch {
      // fail-safe
    }
  }

  return (
    <div
      className="
        relative
        h-[44px] sm:h-[54px]
        w-full rounded-xl overflow-hidden
        bg-gradient-to-b from-neutral-800/40 via-neutral-900/90 to-black
        border border-slate-400/20 shadow-[0_6px_14px_rgba(0,0,0,0.55)]
        px-[4px] sm:px-[6px]
      "
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[40%] bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),transparent_65%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-black/80 via-black/0" />

      <div className="relative z-10 flex h-full w-full items-end gap-[3px] sm:gap-[2px]">
        {recent.map((v, i) => {
          const norm = (v - min) / range;
          const height = 6 + norm * 34;
          const index = startIndex + i;
          const prev = index > 0 ? values[index - 1] : null;
          const delta = prev != null ? v - prev : null;

          return (
            <div
              key={i}
              data-sparkline-bar="true"
              className="flex-1 flex items-end justify-center h-full"
              onMouseEnter={(e) => {
                if (isTouchDevice) return;
                showFromElement(e.currentTarget as HTMLElement, v, delta, index);
              }}
              onMouseLeave={() => {
                if (isTouchDevice) return;
                onHideTooltip?.();
              }}
              onTouchStart={(e) => {
                const target = e.currentTarget as HTMLElement | null;
                if (!target) return;
                showFromElement(target, v, delta, index);
              }}
            >
              <div
                className="
                  w-[5px] sm:w-[4px]
                  rounded-sm sm:rounded-full
                  transition-transform duration-150 will-change-transform
                "
                style={{
                  height: `${height}px`,
                  background: `linear-gradient(to top, ${color}22, ${color}88, ${color})`,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                         Metric summary logic                               */
/* -------------------------------------------------------------------------- */

type TrendDirection = "up" | "down" | "flat";

type MetricSummary = {
  current: number;
  deltaPct: number | null;
  direction: TrendDirection;
  isGood: boolean | null;
};

function average(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function computeMetricSummary(
  values: number[],
  goodDirection: "up" | "down"
): MetricSummary {
  if (!values.length) {
    return { current: 0, deltaPct: null, direction: "flat", isGood: null };
  }

  if (values.length < 10) {
    return { current: average(values), deltaPct: null, direction: "flat", isGood: null };
  }

  const last5 = values.slice(-5);
  const prev5 = values.slice(-10, -5);

  const lastAvg = average(last5);
  const prevAvg = average(prev5);

  if (prevAvg === 0) {
    return { current: lastAvg, deltaPct: null, direction: "flat", isGood: null };
  }

  let deltaPct = ((lastAvg - prevAvg) / prevAvg) * 100;
  deltaPct = Math.max(-15, Math.min(15, deltaPct));

  let direction: TrendDirection = "flat";
  if (deltaPct > 0.1) direction = "up";
  else if (deltaPct < -0.1) direction = "down";

  const isGood = goodDirection === "up" ? deltaPct >= 0 : deltaPct <= 0;

  return { current: lastAvg, deltaPct, direction, isGood };
}

function formatNumber(value: number, isPercentMetric: boolean): string {
  return isPercentMetric ? `${value.toFixed(1)}%` : value.toFixed(1);
}

/* -------------------------------------------------------------------------- */
/*                               TrendBlock                                   */
/* -------------------------------------------------------------------------- */

type TrendSeries = {
  label: string;
  values: number[];
  goodDirection: "up" | "down";
};

type TrendBlockProps = {
  title: string;
  icon: React.ReactNode;
  description: string;
  accent: string;
  series: TrendSeries[];
  onShowTooltip: (payload: TooltipPayload) => void;
  onHideTooltip: () => void;
};

function TrendBlock({
  title,
  icon,
  description,
  accent,
  series,
  onShowTooltip,
  onHideTooltip,
}: TrendBlockProps) {
  return (
    <div
      className="
        group relative rounded-3xl border border-neutral-800/70
        bg-gradient-to-b from-neutral-900/85 via-black to-black/95
        p-3 sm:p-4 md:p-5 shadow-[0_18px_48px_rgba(0,0,0,0.85)]
      "
    >
      <div
        className="
          pointer-events-none absolute -inset-px
          rounded-[26px] blur-xl opacity-0
          transition-opacity duration-300 group-hover:opacity-100
        "
        style={{
          background: `radial-gradient(circle_at_top, ${accent}14, transparent 60%)`,
        }}
      />

      <div className="relative">
        <div className="flex items-center gap-3">
          <div
            className="h-4 w-[1.5px] rounded-full"
            style={{
              background: `linear-gradient(to bottom, ${accent}, transparent)`,
              boxShadow: `0 0 8px ${accent}44`,
            }}
          />
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-base md:text-lg font-semibold text-neutral-50">
              {title}
            </h3>
          </div>
        </div>

        <p className="mt-1 max-w-xl text-[11px] md:text-xs text-neutral-300 leading-snug">
          {description}
        </p>

        <div className="mt-3 sm:mt-4 border-t border-neutral-800/70 pt-2 sm:pt-3" />

        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 md:gap-x-6 md:gap-y-5">
          {series.map((s, idx) => {
            const summary = computeMetricSummary(s.values, s.goodDirection);
            const isPercent = s.label.includes("%");
            const isTrendLabel = s.label.toLowerCase() === "trend";

            let deltaLabel = "– 0.0%";
            let deltaClass = "text-neutral-400";

            if (summary.deltaPct !== null) {
              const abs = Math.abs(summary.deltaPct);
              if (abs >= 0.1) {
                const arrow = summary.deltaPct > 0 ? "▲" : "▼";
                deltaLabel = `${arrow} ${abs.toFixed(1)}%`;
                const good = summary.isGood ?? false;
                deltaClass = good ? "text-emerald-400" : "text-rose-400";
              }
            }

            return (
              <div
                key={s.label}
                className={
                  idx % 2 === 1
                    ? "space-y-2 md:border-l md:border-neutral-900/70 md:pl-4"
                    : "space-y-2 md:pr-4"
                }
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div
                    className={`text-[9px] md:text-[10px] uppercase tracking-[0.16em] ${
                      isTrendLabel ? "text-neutral-400" : "text-neutral-500"
                    }`}
                  >
                    {isTrendLabel && (
                      <span
                        className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                        style={{
                          background: accent,
                          boxShadow: `0 0 8px ${accent}a0`,
                        }}
                      />
                    )}
                    {s.label}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] md:text-xs font-mono tabular-nums whitespace-nowrap">
                    <span className="text-neutral-100 font-semibold">
                      {formatNumber(summary.current, isPercent)}
                    </span>
                    <span className={deltaClass} style={{ opacity: 0.9 }}>
                      {deltaLabel}
                    </span>
                  </div>
                </div>

                <div className="mt-1 h-[44px] sm:h-[54px] rounded-xl overflow-hidden">
                  <SparklineLarge
                    values={s.values}
                    color={accent}
                    label={s.label}
                    onShowTooltip={onShowTooltip}
                    onHideTooltip={onHideTooltip}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Data generation                                */
/* -------------------------------------------------------------------------- */

function buildPressureSeries(length: number): number[] {
  const out: number[] = [];
  let base = 55;
  for (let i = 0; i < length; i++) {
    base = base + (Math.random() - 0.5) * 2 + Math.sin(i / 4);
    out.push(Math.round(base));
  }
  return out;
}

function buildPercentSeries(length: number, base: number, swing: number): number[] {
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < length; i++) {
    const drift = Math.sin(i / 6) * swing * 0.3;
    const noise = (Math.random() - 0.5) * swing * 0.35;
    v = v + drift * 0.04 + noise * 0.15;
    out.push(Math.max(0, Math.min(100, v)));
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                               TeamTrends                                   */
/* -------------------------------------------------------------------------- */

export default function TeamTrends() {
  const games = 82;
  const [tooltip, setTooltip] = useState<TooltipPayload | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handlePointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-sparkline-bar='true']")) return;
      setTooltip(null);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  /* ------------------------------- POINT GUARD -------------------------------- */

  const pgPoints = useMemo(() => {
    const arr: number[] = [];
    for (let g = 0; g < games; g++) {
      const scores = MOCK_TEAMS.map((t) => t.scores[g]);
      arr.push(Math.round(scores.reduce((a, b) => a + b, 0) / scores.length));
    }
    return arr;
  }, [games]);

  const pgAssists = useMemo(
    () => Array.from({ length: games }, (_, i) =>
      Math.round(22 + Math.sin(i / 3) * 3 + (Math.random() * 4 - 2))
    ),
    [games]
  );

  const pgTurnovers = useMemo(() => buildPercentSeries(games, 12, 6), [games]);
  const pgTrend = useMemo(() => buildPercentSeries(games, 68, 10), [games]);

  /* ------------------------------ SHOOTING GUARD -------------------------------- */

  const sgPoints = useMemo(() => {
    const arr: number[] = [];
    for (let g = 0; g < games; g++) {
      const conceded = MOCK_TEAMS.map((t) => t.scores[g] - t.margins[g]);
      arr.push(Math.round(conceded.reduce((a, b) => a + b, 0) / conceded.length));
    }
    return arr;
  }, [games]);

  const sgThrees = useMemo(
    () => Array.from({ length: games }, (_, i) =>
      Math.round(10 + Math.sin(i / 4) * 2 + (Math.random() * 3 - 1.5))
    ),
    [games]
  );

  const sgFgPct = useMemo(() => buildPercentSeries(games, 45, 8), [games]);
  const sgTrend = useMemo(() => buildPercentSeries(games, 65, 11), [games]);

  /* ------------------------------ SMALL FORWARD ------------------------------- */

  const sfPoints = useMemo(() => {
    const arr: number[] = [];
    for (let g = 0; g < games; g++) {
      const rebounds = MOCK_TEAMS.map((t) => {
        if (Array.isArray(t.rebounds) && t.rebounds[g] != null) {
          return t.rebounds[g] + (t.margins[g] || 0) / 3;
        }
        return 0;
      });
      arr.push(Math.round(rebounds.reduce((a, b) => a + b, 0) / rebounds.length));
    }
    return arr;
  }, [games]);

  const sfRebounds = useMemo(
    () => Array.from({ length: games }, (_, i) =>
      Math.round(6 + Math.sin(i / 3.5) * 2 + (Math.random() * 2 - 1))
    ),
    [games]
  );

  const sfSteals = useMemo(() => buildPercentSeries(games, 52, 10), [games]);
  const sfTrend = useMemo(() => buildPercentSeries(games, 66, 9), [games]);

  /* -------------------------------- POWER FORWARD --------------------------------- */

  const pfPoints = useMemo(
    () =>
      Array.from({ length: games }, (_, i) =>
        Math.round(18 + Math.sin(i / 3) * 3 + (Math.random() * 4 - 2))
      ),
    [games]
  );

  const pfRebounds = useMemo(
    () =>
      Array.from({ length: games }, (_, i) =>
        Math.round(9 + Math.sin(i / 4) * 2 + (Math.random() * 3 - 1.5))
      ),
    [games]
  );

  const pfBlocks = useMemo(
    () =>
      Array.from({ length: games }, (_, i) =>
        Math.round(1.5 + Math.sin(i / 3.5) * 0.5 + (Math.random() * 1 - 0.5))
      ),
    [games]
  );

  const pfTrend = useMemo(() => buildPercentSeries(games, 60, 10), [games]);

  /* -------------------------------- CENTER --------------------------------- */

  const cPoints = useMemo(
    () =>
      Array.from({ length: games }, (_, i) =>
        Math.round(15 + Math.sin(i / 3.2) * 2 + (Math.random() * 3 - 1.5))
      ),
    [games]
  );

  const cRebounds = useMemo(
    () =>
      Array.from({ length: games }, (_, i) =>
        Math.round(11 + Math.sin(i / 4) * 2.5 + (Math.random() * 3 - 1.5))
      ),
    [games]
  );

  const cBlocks = useMemo(
    () =>
      Array.from({ length: games }, (_, i) =>
        Math.round(2 + Math.sin(i / 3.5) * 0.6 + (Math.random() * 1 - 0.5))
      ),
    [games]
  );

  const cTrend = useMemo(() => buildPercentSeries(games, 62, 10), [games]);

  /* ---------------------------------------------------------------------- */

  return (
    <section className="mt-10">
      <div
        className="
          relative overflow-hidden
          rounded-[32px] border border-yellow-500/30
          bg-[radial-gradient(circle_at_top,_rgba(12,12,13,0.85),_rgba(3,3,4,0.95)_60%,_black_90%)]
          px-3 py-4 sm:px-4 sm:py-5 md:px-7 md:py-7
          shadow-[0_24px_72px_rgba(0,0,0,0.9)] backdrop-blur-2xl
        "
      >
        <div className="pointer-events-none absolute -inset-px rounded-[34px] bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.16),transparent_55%)] opacity-60" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/25 bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.18),transparent_55%)] px-3 py-1 shadow-[0_0_10px_rgba(250,204,21,0.3)]">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-300 shadow-[0_0_8px_rgba(250,204,21,0.85)]" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-yellow-100/90">
              Position Trends
            </span>
          </div>

          <h2 className="mt-4 text-2xl md:text-3xl font-semibold text-neutral-50">
            League-wide evolution across all five positions
          </h2>

          <p className="mt-2 max-w-2xl text-xs text-neutral-400">
            Rolling trends highlighting scoring, playmaking, defense and rebounding across NBA positions.
          </p>

          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">
            League averages • Last 82 games • Positional trend lenses
          </p>

          <div className="mt-8 grid gap-8 md:grid-cols-2 lg:gap-10">
            <TrendBlock
              title="Point Guard"
              icon={<TrendingUp className="h-4 w-4 text-yellow-300" />}
              accent="#FACC15"
              description="Scoring output, playmaking and ball control from the point."
              series={[
                { label: "Points Scored", values: pgPoints, goodDirection: "up" },
                { label: "Assists", values: pgAssists, goodDirection: "up" },
                { label: "Turnovers", values: pgTurnovers, goodDirection: "down" },
                { label: "Trend", values: pgTrend, goodDirection: "up" },
              ]}
              onShowTooltip={setTooltip}
              onHideTooltip={() => setTooltip(null)}
            />

            <TrendBlock
              title="Shooting Guard"
              icon={<Target className="h-4 w-4 text-cyan-200" />}
              accent="#22D3EE"
              description="Perimeter scoring, three-point shooting and field goal efficiency."
              series={[
                { label: "Points Scored", values: sgPoints, goodDirection: "up" },
                { label: "Three-Pointers", values: sgThrees, goodDirection: "up" },
                { label: "FG% Efficiency", values: sgFgPct, goodDirection: "up" },
                { label: "Trend", values: sgTrend, goodDirection: "up" },
              ]}
              onShowTooltip={setTooltip}
              onHideTooltip={() => setTooltip(null)}
            />

            <TrendBlock
              title="Small Forward"
              icon={<Zap className="h-4 w-4 text-orange-300" />}
              accent="#FB923C"
              description="Versatile scoring, rebounding and defensive pressure."
              series={[
                { label: "Points Scored", values: sfPoints, goodDirection: "up" },
                { label: "Rebounds", values: sfRebounds, goodDirection: "up" },
                { label: "Steals", values: sfSteals, goodDirection: "up" },
                { label: "Trend", values: sfTrend, goodDirection: "up" },
              ]}
              onShowTooltip={setTooltip}
              onHideTooltip={() => setTooltip(null)}
            />

            <TrendBlock
              title="Power Forward"
              icon={<Shield className="h-4 w-4 text-violet-200" />}
              accent="#A78BFA"
              description="Interior scoring, rebounding dominance and rim protection."
              series={[
                { label: "Points Scored", values: pfPoints, goodDirection: "up" },
                { label: "Rebounds", values: pfRebounds, goodDirection: "up" },
                { label: "Blocks", values: pfBlocks, goodDirection: "up" },
                { label: "Trend", values: pfTrend, goodDirection: "up" },
              ]}
              onShowTooltip={setTooltip}
              onHideTooltip={() => setTooltip(null)}
            />

            <TrendBlock
              title="Center"
              icon={<Users className="h-4 w-4 text-emerald-200" />}
              accent="#10B981"
              description="Paint presence, rebounding control and shot blocking."
              series={[
                { label: "Points Scored", values: cPoints, goodDirection: "up" },
                { label: "Rebounds", values: cRebounds, goodDirection: "up" },
                { label: "Blocks", values: cBlocks, goodDirection: "up" },
                { label: "Trend", values: cTrend, goodDirection: "up" },
              ]}
              onShowTooltip={setTooltip}
              onHideTooltip={() => setTooltip(null)}
            />
          </div>
        </div>
      </div>

      <TrendTooltipPortal tooltip={tooltip} />
    </section>
  );
}
