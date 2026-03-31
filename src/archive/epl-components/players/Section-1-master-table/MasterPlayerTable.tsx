import React, { useState, Fragment } from "react";
import {
  Player,
  StatKey,
  getSeriesForStat,
  average,
  stdDev,
  stabilityMeta,
} from "../data/useEPLMockData";
import TrendSparklineMini from "../Section-3-stability-analysis/TrendSparklineMini";
import FormArrowBadge from "../Section-3-stability-analysis/FormArrowBadge";

const FREE_ROWS = 25;

interface Props {
  players: Player[];
  statKey: StatKey;
  isPremium: boolean;
}

export default function MasterPlayerTable({
  players,
  statKey,
  isPremium,
}: Props) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const rows = players.map((p) => {
    const series = getSeriesForStat(p, statKey);
    const avgVal = average(series);
    const vol = stdDev(series);
    const meta = stabilityMeta(vol);
    const delta = series.length >= 2 ? series.at(-1)! - series.at(-2)! : 0;

    return { p, series, avgVal, vol, meta, delta };
  });

  const toggle = (id: number) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="mt-4 overflow-x-auto border border-neutral-800 rounded-xl bg-neutral-950/95">
      <table className="min-w-[860px] w-full text-left text-xs">
        <thead className="bg-neutral-900/90 border-b border-neutral-800 sticky top-0 z-10">
          <tr>
            <th className="px-3 py-2">Player</th>
            <th className="px-3 py-2">Pos</th>
            <th className="px-3 py-2">Team</th>
            <th className="px-3 py-2 text-right">Avg</th>
            <th className="px-3 py-2 text-right">Trend</th>
            <th className="px-3 py-2 text-right">Vol</th>
            <th className="px-3 py-2 text-right">Stability</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row, i) => {
            const locked = !isPremium && i >= FREE_ROWS;
            const isOpen = expanded[row.p.id];

            return (
              <Fragment key={row.p.id}>
                <tr
                  className={`border-b border-neutral-900 ${
                    locked ? "opacity-40 blur-[1px]" : "hover:bg-neutral-900/70"
                  }`}
                >
                  <td
                    className="px-3 py-2 cursor-pointer text-neutral-100"
                    onClick={() => !locked && toggle(row.p.id)}
                  >
                    <span className="mr-2 text-neutral-500 text-[10px]">
                      {isOpen ? "▼" : "▶"}
                    </span>
                    {row.p.name}
                  </td>
                  <td className="px-3 py-2 text-neutral-400">
                    {row.p.pos}
                  </td>
                  <td className="px-3 py-2 text-neutral-400">
                    {row.p.team}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {Math.round(row.avgVal)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <FormArrowBadge delta={row.delta} size={12} />
                      {row.delta}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.vol.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right text-[10px]">
                    <span className={row.meta.colour}>{row.meta.label}</span>
                  </td>
                </tr>

                {isOpen && !locked && (
                  <tr>
                    <td colSpan={7} className="px-4 py-4 bg-neutral-950">
                      <TrendSparklineMini values={row.series} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
