// src/components/afl/teams/TeamFormStabilityGrid.tsx
import React, { useState } from "react";
import { Flame, Snowflake, Activity } from "lucide-react";
import { SectionHeader } from "@/components/sports/shared/SectionHeader";
import type { StatConfig, StatKey } from "@/lib/stats/types";

type TeamTrend = {
  team: string;
  value: number; // form index or L5 delta
};

const MOCK_HOT: TeamTrend[] = [
  { team: "Brisbane Lions", value: +14.8 },
  { team: "GWS Giants", value: +11.2 },
  { team: "Carlton", value: +9.5 },
];

const MOCK_STABLE: TeamTrend[] = [
  { team: "Sydney Swans", value: +2.1 },
  { team: "Melbourne", value: +1.4 },
  { team: "Geelong Cats", value: +0.9 },
];

const MOCK_COOLING: TeamTrend[] = [
  { team: "Richmond", value: -7.3 },
  { team: "Hawthorn", value: -6.1 },
  { team: "West Coast Eagles", value: -4.4 },
];

type StatType = StatKey;

const TeamFormStabilityGrid: React.FC<{ statConfig: StatConfig }> = ({ statConfig }) => {
  const [lens, setLens] = useState<StatType>(statConfig.defaultStat);

  const lensDescription =
    lens === "fantasy"
      ? "Fantasy scoring over the last 5 rounds"
      : lens === "disposals"
      ? "Ball-winning strength & possession profile"
      : "Goal-scoring momentum & forward impact";

  return (
    <section className="relative overflow-hidden rounded-3xl border border-yellow-500/30 bg-gradient-to-b from-black/90 via-black/95 to-black shadow-[0_0_40px_rgba(0,0,0,0.7)]">
      {/* Background glows */}
      <div className="pointer-events-none absolute -left-32 top-10 h-64 w-64 rounded-full bg-yellow-500/10 blur-3xl" />
      <div className="pointer-events-none absolute right-0 bottom-[-80px] h-64 w-64 rounded-full bg-yellow-500/10 blur-3xl" />

      <div className="relative px-5 py-10 md:px-8 md:py-12 lg:px-10">

        {/* Header */}
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:justify-between md:items-start">
          <div>
            <SectionHeader
              pillLabel="Team Form & Stability"
              title="Long-term momentum, role stability & performance consistency"
              description="Breaking down +5 round trajectories across fantasy scoring, disposals and goals. These indicators reflect role continuity, tactical stability and genuine scoring reliability."
              icon={Activity}
            />
          </div>

          {/* Stat lens selection */}
          <div className="flex flex-col items-start gap-2 md:items-end text-xs">
            <p className="uppercase tracking-[0.18em] text-yellow-200/80 font-semibold">
              Stat Lens
            </p>

            <div className="inline-flex flex-wrap gap-1.5 rounded-full bg-white/5 p-1">
              {statConfig.availableStats.map((type) => {
                const active = lens === type;
                return (
                  <button
                    key={type}
                    onClick={() => setLens(type)}
                    className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
                      active
                        ? "bg-yellow-400 text-black shadow-[0_0_22px_rgba(250,204,21,0.45)]"
                        : "bg-transparent text-neutral-300 hover:bg-white/10"
                    }`}
                  >
                    {statConfig.labels[type]}
                  </button>
                );
              })}
            </div>

            <p className="mt-1 text-[0.7rem] text-zinc-400">{lensDescription}</p>
          </div>
        </div>

        {/* Grid (Hot / Stable / Cooling) */}
        <div className="grid gap-6 md:grid-cols-3">

          {/* HOT */}
          <FormCard
            title="Hot Teams"
            color="from-red-500/20 to-red-700/20 border-red-500/40"
            icon={<Flame className="h-4 w-4 text-red-300" />}
            data={MOCK_HOT}
          />

          {/* STABLE */}
          <FormCard
            title="Stable Teams"
            color="from-green-500/20 to-green-700/20 border-green-500/40"
            icon={<Activity className="h-4 w-4 text-green-300" />}
            data={MOCK_STABLE}
          />

          {/* COOLING */}
          <FormCard
            title="Cooling Teams"
            color="from-blue-500/20 to-blue-700/20 border-blue-500/40"
            icon={<Snowflake className="h-4 w-4 text-blue-300" />}
            data={MOCK_COOLING}
          />

        </div>

        {/* Footer helper */}
        <p className="mt-10 text-[0.78rem] text-zinc-500 md:text-xs">
          These indicators reflect <span className="text-yellow-200">5-game form</span> 
          and <span className="text-yellow-200">volatility profiles</span>. 
          Teams may move between categories weekly depending on scoring texture, 
          role shifts, matchups and tactical adjustments.
        </p>
      </div>
    </section>
  );
};

export default TeamFormStabilityGrid;

//
// Sub-component: Hot / Stable / Cooling card
//

type CardProps = {
  title: string;
  color: string;
  icon: React.ReactNode;
  data: TeamTrend[];
};

const FormCard: React.FC<CardProps> = ({ title, color, icon, data }) => {
  return (
    <div
      className={`rounded-2xl border ${color} bg-gradient-to-br px-5 py-6 shadow-[0_0_28px_rgba(0,0,0,0.55)]`}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 ring-1 ring-white/10">
          {icon}
        </div>
      </div>

      {/* Team rows */}
      <div className="space-y-3">
        {data.map(({ team, value }) => (
          <div key={team}>
            <div className="flex items-center justify-between">
              <span className="text-[0.85rem] text-zinc-200">{team}</span>
              <span
                className={`text-[0.85rem] font-semibold ${
                  value > 0 ? "text-green-300" : "text-red-300"
                }`}
              >
                {value > 0 ? `+${value}` : value}
              </span>
            </div>

            {/* Progress bar */}
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/30">
              <div
                className={`h-full ${
                  value > 0
                    ? "bg-green-400/70"
                    : "bg-red-400/70"
                }`}
                style={{
                  width: `${Math.min(Math.abs(value) * 6, 100)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};