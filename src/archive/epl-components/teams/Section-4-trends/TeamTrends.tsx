// src/components/epl/teams/TeamTrends.tsx

import React, { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { MOCK_TEAMS } from "../data/mockTeams";
import { TrendingUp, Shield, Activity, Target } from "lucide-react";

/* -------------------------------------------------------------------------- */
/*                               Tooltip helpers                              */
/* -------------------------------------------------------------------------- */

function inferUnit(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes("%") || lower.includes("efficiency")) return "%";
  if (lower.includes("goals") || lower.includes("scored") || lower.includes("conceded"))
    return "goals";
  if (lower.includes("possession")) return "%";
  if (lower.includes("passes")) return "passes";
  if (lower.includes("saves")) return "saves";
  if (lower.includes("tackles")) return "tackles";
  if (lower.includes("influence")) return "rating";
  if (lower.includes("pressure")) return "index";
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
        Matchweek {tooltip.round}
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
      {/* highlights */}
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
  const rounds = 38;
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

  /* ------------------------------- FORWARD -------------------------------- */

  const forwardGoals = useMemo(() => {
    const arr: number[] = [];
    for (let r = 0; r < rounds; r++) {
      const scores = MOCK_TEAMS.map((t) => t.scores[r]);
      arr.push(Math.round(scores.reduce((a, b) => a + b, 0) / scores.length));
    }
    return arr;
  }, [rounds]);

  const forwardExpected = useMemo(
    () => forwardGoals.map((v, i) => (v + (forwardGoals[i - 1] ?? v)) / 2),
    [forwardGoals]
  );

  const forwardEfficiency = useMemo(() => buildPercentSeries(rounds, 56, 12), [rounds]);
  const forwardTrend = useMemo(() => buildPercentSeries(rounds, 68, 10), [rounds]);

  /* ------------------------------ DEFENCE -------------------------------- */

  const defenceConceded = useMemo(() => {
    const arr: number[] = [];
    for (let r = 0; r < rounds; r++) {
      const conceded = MOCK_TEAMS.map((t) => t.scores[r] - t.margins[r]);
      arr.push(Math.round(conceded.reduce((a, b) => a + b, 0) / conceded.length));
    }
    return arr;
  }, [rounds]);

  const pressureIndex = useMemo(() => buildPressureSeries(rounds), [rounds]);
  const tacklesWon = useMemo(() => buildPercentSeries(rounds, 60, 14), [rounds]);
  const defenceTrend = useMemo(() => buildPercentSeries(rounds, 65, 11), [rounds]);

  /* ------------------------------ MIDFIELD ------------------------------- */

  const midfieldPossession = useMemo(() => {
    const arr: number[] = [];
    for (let r = 0; r < rounds; r++) {
      const poss = MOCK_TEAMS.map(
        (t) => t.possessionDom[r] + t.margins[r] / 5
      );
      arr.push(Math.round(poss.reduce((a, b) => a + b, 0) / poss.length));
    }
    return arr;
  }, [rounds]);

  const passCompletion = useMemo(
    () => midfieldPossession.map((v) => v - (5 - Math.random() * 6)),
    [midfieldPossession]
  );

  const keyPasses = useMemo(() => buildPercentSeries(rounds, 52, 10), [rounds]);
  const midfieldTrend = useMemo(() => buildPercentSeries(rounds, 66, 9), [rounds]);

  /* ------------------------------- GK ------------------------------------ */

  const gkSaves = useMemo(
    () =>
      Array.from({ length: rounds }, (_, i) =>
        Math.round(4 + Math.sin(i / 3) * 1.5 + (Math.random() * 2 - 1))
      ),
    [rounds]
  );

  const gkSavePercentage = useMemo(() => buildPercentSeries(rounds, 68, 12), [rounds]);

  const gkCleanSheets = useMemo(
    () =>
      Array.from({ length: rounds }, (_, i) =>
        Math.round(0.3 + Math.sin(i / 4) * 0.2 + (Math.random() * 0.3))
      ),
    [rounds]
  );

  const gkTrend = useMemo(() => buildPercentSeries(rounds, 60, 10), [rounds]);

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
          {/* header pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/25 bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.18),transparent_55%)] px-3 py-1 shadow-[0_0_10px_rgba(250,204,21,0.3)]">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-300 shadow-[0_0_8px_rgba(250,204,21,0.85)]" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-yellow-100/90">
              Team Trends
            </span>
          </div>

          <h2 className="mt-4 text-2xl md:text-3xl font-semibold text-neutral-50">
            League-wide evolution across all four key positions
          </h2>

          <p className="mt-2 max-w-2xl text-xs text-neutral-400">
            Rolling trends highlighting attacking quality, defensive solidity, midfield control and
            goalkeeper performance.
          </p>

          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">
            League averages • Last 38 matchweeks • Synthetic positional trend lenses
          </p>

          <div className="mt-8 grid gap-8 md:grid-cols-2 lg:gap-10">
            <TrendBlock
              title="Forward Trend"
              icon={<TrendingUp className="h-4 w-4 text-yellow-300" />}
              accent="#FACC15"
              description="Goal output, expected conversion and attacking efficiency."
              series={[
                { label: "Goals Scored", values: forwardGoals, goodDirection: "up" },
                { label: "Expected Goals", values: forwardExpected, goodDirection: "up" },
                { label: "Efficiency (%)", values: forwardEfficiency, goodDirection: "up" },
                { label: "Trend", values: forwardTrend, goodDirection: "up" },
              ]}
              onShowTooltip={setTooltip}
              onHideTooltip={() => setTooltip(null)}
            />

            <TrendBlock
              title="Defence Trend"
              icon={<Shield className="h-4 w-4 text-cyan-200" />}
              accent="#22D3EE"
              description="Conceded goals, pressure indicators and tackles won."
              series={[
                { label: "Goals Conceded", values: defenceConceded, goodDirection: "down" },
                { label: "Pressure Index", values: pressureIndex, goodDirection: "up" },
                { label: "Tackles Won", values: tacklesWon, goodDirection: "up" },
                { label: "Trend", values: defenceTrend, goodDirection: "down" },
              ]}
              onShowTooltip={setTooltip}
              onHideTooltip={() => setTooltip(null)}
            />

            <TrendBlock
              title="Midfield Trend"
              icon={<Activity className="h-4 w-4 text-orange-300" />}
              accent="#FB923C"
              description="Possession control, pass completion and creative output."
              series={[
                { label: "Possession (%)", values: midfieldPossession, goodDirection: "up" },
                { label: "Pass Completion", values: passCompletion, goodDirection: "up" },
                { label: "Key Passes", values: keyPasses, goodDirection: "up" },
                { label: "Trend", values: midfieldTrend, goodDirection: "up" },
              ]}
              onShowTooltip={setTooltip}
              onHideTooltip={() => setTooltip(null)}
            />

            <TrendBlock
              title="Goalkeeper Trend"
              icon={<Target className="h-4 w-4 text-violet-200" />}
              accent="#A78BFA"
              description="Save quality, clean sheets and overall goalkeeper performance."
              series={[
                { label: "Saves", values: gkSaves, goodDirection: "up" },
                { label: "Save Percentage (%)", values: gkSavePercentage, goodDirection: "up" },
                { label: "Clean Sheets", values: gkCleanSheets, goodDirection: "up" },
                { label: "Trend", values: gkTrend, goodDirection: "up" },
              ]}
              onShowTooltip={setTooltip}
              onHideTooltip={() => setTooltip(null)}
            />
          </div>
        </div>
      </div>

      {/* global tooltip portal */}
      <TrendTooltipPortal tooltip={tooltip} />
    </section>
  );
}
