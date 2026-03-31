// src/components/afl/teams/TeamProfileGrid.tsx
import React from "react";
import { Flame, Shield, Target } from "lucide-react";

type Metric = {
  label: string;
  value: number; // 0–100 scale
};

type ProfileCardProps = {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  metrics: Metric[];
};

const ProfileCard: React.FC<ProfileCardProps> = ({
  title,
  subtitle,
  icon,
  color,
  metrics,
}) => {
  return (
    <div
      className={`
        rounded-2xl border ${color}
        bg-gradient-to-br from-black/80 via-neutral-950 to-black
        px-5 py-6 shadow-[0_0_32px_rgba(0,0,0,0.65)]
      `}
    >
      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="mt-0.5 text-[0.7rem] text-zinc-400">{subtitle}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/70 ring-1 ring-white/10">
          {icon}
        </div>
      </div>

      {/* Metrics */}
      <div className="space-y-3">
        {metrics.map(({ label, value }) => (
          <div key={label}>
            <div className="flex items-center justify-between">
              <p className="text-[0.85rem] text-zinc-200">{label}</p>
              <p className="text-[0.85rem] font-semibold text-yellow-300">
                {value}%
              </p>
            </div>

            {/* Progress bar */}
            <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-black/40">
              <div
                className="h-full bg-yellow-400/80"
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const TeamProfileGrid: React.FC = () => {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-yellow-500/25 bg-gradient-to-b from-black via-black/95 to-neutral-950 shadow-[0_0_40px_rgba(0,0,0,0.65)]">
      {/* Glow halos */}
      <div className="pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full bg-yellow-500/10 blur-3xl" />
      <div className="pointer-events-none absolute right-10 bottom-10 h-56 w-56 rounded-full bg-yellow-400/10 blur-3xl" />

      <div className="relative px-5 py-10 md:px-8 md:py-12 lg:px-10">
        {/* Header */}
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3 md:max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-600/60 bg-black/70 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-yellow-300 shadow-[0_0_18px_rgba(234,179,8,0.45)]">
              <Target className="h-3.5 w-3.5" />
              <span>Style &amp; Matchup Profiles</span>
            </div>

            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Tactical tendencies, scoring style & matchup difficulty
            </h2>

            <p className="text-sm text-zinc-300 md:text-[0.95rem]">
              Team-level style indicators reveal how clubs generate scoring
              chains, how often they restrict opposition ceilings, and which
              teams create favourable or challenging matchup contexts.
            </p>
          </div>

          <p className="max-w-sm text-xs text-zinc-400 md:text-[0.78rem]">
            These profiles operate on a{" "}
            <span className="text-yellow-300">0–100 scale</span> and update based
            on rolling form, opponent quality, territory control and scoring
            texture.
          </p>
        </div>

        {/* 3-column layout (mobile → stack) */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* ATTACK */}
          <ProfileCard
            title="Attack Profile"
            subtitle="Scoring style & chain creation"
            icon={<Flame className="h-4 w-4 text-red-300" />}
            color="border-red-500/40"
            metrics={[
              { label: "Inside 50 Efficiency", value: 78 },
              { label: "Corridor Usage", value: 67 },
              { label: "Scoring Chains", value: 82 },
            ]}
          />

          {/* DEFENCE */}
          <ProfileCard
            title="Defence Profile"
            subtitle="Restrictiveness & pressure layer"
            icon={<Shield className="h-4 w-4 text-blue-300" />}
            color="border-blue-500/40"
            metrics={[
              { label: "Pressure Rating", value: 71 },
              { label: "Ceiling Prevention", value: 69 },
              { label: "Defensive Chains", value: 74 },
            ]}
          />

          {/* MATCHUP */}
          <ProfileCard
            title="Matchup Lens"
            subtitle="Difficulty grading for roles"
            icon={<Target className="h-4 w-4 text-yellow-200" />}
            color="border-yellow-500/40"
            metrics={[
              { label: "MID Matchup Difficulty", value: 62 },
              { label: "FWD Matchup Difficulty", value: 58 },
              { label: "DEF Matchup Difficulty", value: 66 },
            ]}
          />
        </div>

        {/* Footer text */}
        <p className="mt-10 text-xs text-zinc-500 md:text-[0.78rem]">
          Matchup difficulty scores combine opponent restrictiveness, positional
          scoring trends and territory-weighted data to project role-specific
          suitability.
        </p>
      </div>
    </section>
  );
};

export default TeamProfileGrid;