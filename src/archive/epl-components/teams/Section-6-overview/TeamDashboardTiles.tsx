// src/components/epl/teams/TeamDashboardTiles.tsx

import React from "react";
import { MOCK_TEAMS, EPLTeam } from "../data/mockTeams";
import {
  Activity,
  ShieldCheck,
  TrendingUp,
  ArrowRight,
  Gauge,
  Crown,
} from "lucide-react";

const avg = (arr: number[]): number =>
  arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

const lastN = (arr: number[], n: number) => arr.slice(-n);

type TileProps = {
  label: string;
  caption: string;
  value: string;
  team: EPLTeam;
  icon: React.ReactNode;
  leaderLabel?: string;
};

function GoldIconPlate({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-yellow-500/70 bg-gradient-to-b from-yellow-500/30 via-yellow-500/15 to-black/95 shadow-[0_0_26px_rgba(250,204,21,0.75)] transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:rotate-2 group-hover:scale-105">
      <div className="absolute inset-[2px] rounded-full bg-gradient-to-b from-black/80 via-black/65 to-black/90 opacity-90" />
      <div className="relative text-yellow-100 drop-shadow-[0_0_10px_rgba(250,204,21,0.95)]">
        {children}
      </div>
    </div>
  );
}

function TeamIdentityBar({ team }: { team: EPLTeam }) {
  return (
    <div className="mt-5 flex items-center justify-between rounded-full border border-yellow-500/25 bg-gradient-to-r from-black/70 via-black/45 to-black/65 px-3 py-1.5 shadow-[0_4px_14px_rgba(0,0,0,0.45)]">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{
            backgroundColor: team.colours.primary,
            boxShadow: `0 0 16px ${team.colours.primary}`,
          }}
        />
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-100">
          {team.name}
        </span>
      </div>

      <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">
        {team.code}
      </span>
    </div>
  );
}

function GoldRipple() {
  return (
    <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-20 transition duration-500">
      <div className="absolute inset-0 animate-[pulse_2.6s_ease-out_infinite] bg-[radial-gradient(circle_at_center,rgba(250,204,21,0.25),transparent_70%)]" />
    </div>
  );
}

function Tile({ label, caption, value, team, icon, leaderLabel }: TileProps) {
  return (
    <div
      className="group relative overflow-hidden rounded-3xl border border-yellow-500/15 bg-gradient-to-b from-black/95 via-neutral-950 to-black px-5 py-5 shadow-[0_0_70px_rgba(0,0,0,0.9)] transition-all duration-300 hover:-translate-y-[3px] hover:shadow-[0_0_95px_rgba(250,204,21,0.6)]"
      style={{
        boxShadow:
          "0 0 0 1px rgba(250,204,21,0.18), inset 0 0 0 0.5px rgba(250,204,21,0.25)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.1] group-hover:opacity-[0.18] transition-opacity duration-400"
        style={{
          background: `radial-gradient(circle at 18% 0%, ${team.colours.primary}, transparent 65%)`,
        }}
      />

      <div className="pointer-events-none absolute -top-24 -right-36 h-52 w-60 rounded-full bg-[radial-gradient(circle_at_center,rgba(250,204,21,0.28),transparent_68%)] opacity-80" />
      <div className="pointer-events-none absolute -bottom-20 -left-40 h-52 w-60 rounded-full bg-[radial-gradient(circle_at_center,rgba(250,204,21,0.17),transparent_70%)] opacity-70" />

      <GoldRipple />

      <div className="relative">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-[10px] uppercase tracking-[0.25em] text-yellow-300/95">
                {label}
              </div>

              {leaderLabel && (
                <div className="inline-flex items-center gap-1 rounded-full border border-yellow-500/60 bg-yellow-500/15 px-2 py-[2px] shadow-[0_0_10px_rgba(250,204,21,0.4)]">
                  <Crown className="h-3 w-3 text-yellow-200" />
                  <span className="text-[9px] uppercase tracking-[0.17em] text-yellow-100">
                    {leaderLabel}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-1 text-[11px] text-neutral-400">{caption}</div>
          </div>

          <GoldIconPlate>{icon}</GoldIconPlate>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <div className="relative inline-flex items-end gap-2">
              <span className="text-3xl font-semibold tracking-tight text-yellow-200 drop-shadow-[0_0_16px_rgba(250,204,21,0.9)] group-hover:text-yellow-50 transition">
                {value}
              </span>

              <div className="relative h-[2px] w-14 overflow-hidden rounded-full bg-gradient-to-r from-yellow-500/80 via-yellow-300/45 to-transparent group-hover:w-20 transition-all duration-300">
                <div className="absolute inset-0 -translate-x-full animate-[pulse_2.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-yellow-50 to-transparent" />
              </div>
            </div>
          </div>
        </div>

        <TeamIdentityBar team={team} />
      </div>
    </div>
  );
}

export default function TeamDashboardTiles() {
  const bestAttack = [...MOCK_TEAMS].sort((a, b) => b.attackRating - a.attackRating)[0];
  const bestDefence = [...MOCK_TEAMS].sort((a, b) => b.defenceRating - a.defenceRating)[0];
  const bestPossession = [...MOCK_TEAMS].sort((a, b) => avg(b.possessionDom) - avg(a.possessionDom))[0];
  const mostConsistent = [...MOCK_TEAMS].sort((a, b) => b.consistencyIndex - a.consistencyIndex)[0];
  const easiestFixtures = [...MOCK_TEAMS].sort((a, b) => a.fixtureDifficulty.score - b.fixtureDifficulty.score)[0];
  const bestMomentum = [...MOCK_TEAMS].sort(
    (a, b) => avg(lastN(b.margins, 6)) - avg(lastN(a.margins, 6))
  )[0];

  return (
    <section className="mt-10 rounded-3xl border border-yellow-500/15 bg-gradient-to-b from-neutral-950/95 via-black/96 to-black px-5 py-8 shadow-[0_0_80px_rgba(250,204,21,0.15)]">

      {/* STATIC GOLD BADGE PILL */}
      <div className="mb-7 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>

          <div className="inline-flex items-center gap-2 rounded-full
            border border-yellow-500/60
            bg-gradient-to-r from-yellow-600/25 via-yellow-700/15 to-black/70
            px-4 py-1.5
            shadow-[0_0_28px_rgba(250,204,21,0.28)]
          ">

            <span className="h-2 w-2 rounded-full bg-yellow-300/90"></span>

            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-yellow-200">
              Team Dashboard
            </span>

          </div>

          <h3 className="mt-3 text-xl font-semibold text-neutral-50 md:text-2xl">
            Snapshot of league-wide team performance
          </h3>

          <p className="mt-2 max-w-2xl text-xs text-neutral-400">
            Rolling form, attack and defence ratings, possession dominance and upcoming fixture difficulty – distilled into six premium, gold-tinted tiles.
          </p>

          <div className="mt-3 h-px w-40 bg-gradient-to-r from-yellow-500/90 via-yellow-300/60 to-transparent" />
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">

        <Tile
          label="Recent Form"
          caption="Last 6 matchweeks goal difference trend"
          value={avg(lastN(bestMomentum.margins, 6)).toFixed(1)}
          team={bestMomentum}
          icon={<TrendingUp className="h-4 w-4" />}
          leaderLabel="League Leader"
        />

        <Tile
          label="Attack Rating"
          caption="0–100 offensive quality index"
          value={bestAttack.attackRating.toString()}
          team={bestAttack}
          icon={<Activity className="h-4 w-4" />}
          leaderLabel="League Leader"
        />

        <Tile
          label="Defence Rating"
          caption="0–100 defensive solidity index"
          value={bestDefence.defenceRating.toString()}
          team={bestDefence}
          icon={<ShieldCheck className="h-4 w-4" />}
          leaderLabel="League Leader"
        />

        <Tile
          label="Possession Dominance"
          caption="Average possession % this season"
          value={`${avg(bestPossession.possessionDom).toFixed(1)}%`}
          team={bestPossession}
          icon={<ArrowRight className="h-4 w-4" />}
          leaderLabel="League Leader"
        />

        <Tile
          label="Consistency Index"
          caption="Lower volatility, tighter performance band"
          value={mostConsistent.consistencyIndex.toString()}
          team={mostConsistent}
          icon={<Gauge className="h-4 w-4" />}
          leaderLabel="League Leader"
        />

        <Tile
          label="Next Fixture Difficulty"
          caption="Next 3 opponents difficulty score (lower is easier)"
          value={easiestFixtures.fixtureDifficulty.score.toString()}
          team={easiestFixtures}
          icon={<ArrowRight className="h-4 w-4" />}
          leaderLabel="League Leader"
        />

      </div>
    </section>
  );
}
