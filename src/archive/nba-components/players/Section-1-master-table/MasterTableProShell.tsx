import React from "react";
import SectionDividerGlow from "@/components/ui/SectionDividerGlow";
import FilterBarPro from "../Section-7-filtration/FilterBarPro";
import type { StatConfig } from "@/lib/stats/types";

interface FilterValues {
  team: string;
  pos: string;
  round: string;
}

interface Props {
  teamList: string[];
  posList: string[];
  roundList: string[];
  values: FilterValues;
  onFilterChange: (v: Partial<FilterValues>) => void;

  /** 🔑 CONFIG-DRIVEN */
  statConfig: StatConfig;
  selectedStat: string;
  onStatChange: (v: string) => void;

  selectedYear: number;
  onYearChange: (y: number) => void;

  totalPlayers: number;
  showingPlayers: number;
  isPremium: boolean;
}

export default function MasterTableProShell({
  teamList,
  posList,
  roundList,
  values,
  onFilterChange,

  statConfig,
  selectedStat,
  onStatChange,

  selectedYear,
  onYearChange,
  totalPlayers,
  showingPlayers,
  isPremium,
}: Props) {
  return (
    <div className="mt-12 space-y-4">
      <SectionDividerGlow color="gold" />

      <div className="flex justify-between items-start md:items-center gap-4 flex-col md:flex-row">
        <div>
          <h2 className="text-lg font-bold">📚 Master Player Table</h2>
          <p className="text-xs text-neutral-500">
            Season overview, trends and volatility.
          </p>
        </div>

        {!isPremium && (
          <a
            href="https://www.neekostats.com.au/neeko-plus"
            className="rounded-full bg-yellow-400 text-black px-4 py-1.5 text-xs shadow-[0_0_18px_rgba(250,204,21,0.7)]"
          >
            Unlock full table →
          </a>
        )}
      </div>

      <FilterBarPro
        teams={teamList}
        positions={posList}
        rounds={roundList}
        values={values}
        onChange={onFilterChange}
        isPremium={isPremium}
      />

      {/* ================= STAT + YEAR SELECTORS ================= */}
      <div className="flex gap-2 flex-wrap">
        {/* 🔑 STAT LENS — CONFIG DRIVEN */}
        <select
          className="px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-700 text-xs"
          value={selectedStat}
          onChange={(e) => onStatChange(e.target.value)}
        >
          {statConfig.availableStats.map((stat) => (
            <option key={stat} value={stat}>
              {statConfig.labels[stat]}
            </option>
          ))}
        </select>

        {/* 🔑 YEAR SELECTOR */}
        <select
          className="px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-700 text-xs"
          value={selectedYear}
          onChange={(e) => onYearChange(Number(e.target.value))}
        >
          {statConfig.seasons
            ? [statConfig.seasons.current, statConfig.seasons.past].map(
                (y) => (
                  <option key={y} value={Number(y.slice(0, 4))}>
                    {y}
                  </option>
                )
              )
            : null}
        </select>
      </div>

      <p className="text-[11px] text-neutral-500">
        Showing{" "}
        <span className="text-neutral-200">{showingPlayers}</span> of{" "}
        <span className="text-neutral-200">{totalPlayers}</span> players
      </p>
    </div>
  );
}
