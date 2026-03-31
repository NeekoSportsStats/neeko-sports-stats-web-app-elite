import React, { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { MatchScatterPoint } from "./types";

interface Props {
  scatterData: MatchScatterPoint[];
  homeTeam?: string;
  awayTeam?: string;
  homeColor?: string;
  awayColor?: string;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export default function MatchScatter({ scatterData, homeTeam, awayTeam, homeColor, awayColor }: Props) {
  const data = (scatterData ?? []).filter(
    (d) => d.x_disposals_vs_avg !== 0 || d.y_fantasy_vs_avg !== 0
  );

  const { homeData, awayData } = useMemo(() => {
    if (!homeTeam || !awayTeam || data.length === 0) {
      return { homeData: data, awayData: [] };
    }
    const homeLower = homeTeam.toLowerCase();
    const awayLower = awayTeam.toLowerCase();
    const home: MatchScatterPoint[] = [];
    const away: MatchScatterPoint[] = [];
    for (const d of data) {
      const team = (d.player_team ?? "").toLowerCase();
      if (team.includes(homeLower) || homeLower.includes(team)) {
        home.push(d);
      } else if (team.includes(awayLower) || awayLower.includes(team)) {
        away.push(d);
      } else {
        home.push(d);
      }
    }
    return { homeData: home, awayData: away };
  }, [data, homeTeam, awayTeam]);

  if (data.length === 0) return null;

  const resolvedHomeColor = homeColor || "#F5C84C";
  const resolvedAwayColor = awayColor || "#60A5FA";
  const hasTwoTeams = awayData.length > 0;

  return (
    <div className="rounded-xl md:rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-xl p-5 md:p-6 hover:border-white/[0.12] transition-colors duration-300">
      <div className="mb-5 md:mb-6">
        <div className="flex items-center gap-2 mb-2.5 md:mb-2">
          <div className="w-1 h-6 md:h-6 bg-[#F5C84C] rounded-full" />
          <h3 className="text-lg md:text-lg font-bold text-white">
            Player Impact vs Average
          </h3>
        </div>
        <p className="text-sm md:text-sm text-white/60 leading-[1.7]">
          Disposals and fantasy points compared to season average
        </p>
        {hasTwoTeams && (
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-5 mt-4 md:mt-4">
            <div className="flex items-center gap-2.5 md:gap-2">
              <div className="w-4 h-4 md:w-3.5 md:h-3.5 rounded-full shadow-lg" style={{ backgroundColor: resolvedHomeColor, boxShadow: `0 0 10px ${resolvedHomeColor}80` }} />
              <span className="text-sm md:text-sm text-white/70 font-semibold">{homeTeam}</span>
            </div>
            <div className="flex items-center gap-2.5 md:gap-2">
              <div className="w-4 h-4 md:w-3.5 md:h-3.5 rounded-full" style={{ backgroundColor: resolvedAwayColor }} />
              <span className="text-sm md:text-sm text-white/60 font-medium">{awayTeam}</span>
            </div>
          </div>
        )}
      </div>

      <div className="h-[260px] sm:h-[400px] px-2 sm:px-0 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, bottom: 30, left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.5} />
            <XAxis
              type="number"
              dataKey="x_disposals_vs_avg"
              name="Disposals vs Avg"
              stroke="#999"
              tick={{ fontSize: 11 }}
              label={{
                value: "Disposals vs Avg",
                position: "bottom",
                offset: 10,
                style: { fill: "#999", fontSize: "11px" },
              }}
              height={40}
            />
            <YAxis
              type="number"
              dataKey="y_fantasy_vs_avg"
              name="Fantasy vs Avg"
              stroke="#999"
              tick={{ fontSize: 11 }}
              label={{
                value: "Fantasy vs Avg",
                angle: -90,
                position: "left",
                offset: 0,
                style: { fill: "#999", fontSize: "11px" },
              }}
              width={40}
            />

            <ReferenceLine x={0} stroke="#555" strokeDasharray="3 3" />
            <ReferenceLine y={0} stroke="#555" strokeDasharray="3 3" />

            <Tooltip
              cursor={{ strokeDasharray: "3 3", strokeWidth: 2 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as MatchScatterPoint;
                const disposalDiff = d.disposals - d.avg_disposals;
                const fantasyDiff = d.fantasy_points - d.avg_fantasy;
                return (
                  <div className="rounded-lg border border-[#F5C84C]/40 bg-black/98 backdrop-blur-xl p-3 md:p-3.5 shadow-2xl w-[200px] md:min-w-[200px] max-w-[calc(100vw-32px)]">
                    <div className="font-bold text-white text-base mb-1.5 truncate">{d.player}</div>
                    <div className="text-xs text-[#F5C84C]/80 font-semibold mb-2 pb-2 border-b border-white/10 truncate">{d.player_team}</div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-white/50 font-medium">Disposals:</span>
                        <span className="text-sm font-bold text-white">{d.disposals}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-white/40">vs Avg:</span>
                        <span className={`text-xs font-semibold ${disposalDiff > 0 ? 'text-green-400' : disposalDiff < 0 ? 'text-red-400' : 'text-white/60'}`}>
                          {disposalDiff > 0 ? '+' : ''}{round2(disposalDiff)}
                        </span>
                      </div>
                    </div>
                    <div className="h-px bg-white/10 my-2" />
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-white/50 font-medium">Fantasy Pts:</span>
                        <span className="text-sm font-bold text-[#F5C84C]">{d.fantasy_points}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-white/40">vs Avg:</span>
                        <span className={`text-xs font-semibold ${fantasyDiff > 0 ? 'text-green-400' : fantasyDiff < 0 ? 'text-red-400' : 'text-white/60'}`}>
                          {fantasyDiff > 0 ? '+' : ''}{round2(fantasyDiff)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />

            {hasTwoTeams ? (
              <>
                <Scatter
                  data={homeData}
                  fill={resolvedHomeColor}
                  opacity={1}
                  shape={(props: Record<string, unknown>) => {
                    const { cx, cy, payload } = props as { cx: number; cy: number; payload: MatchScatterPoint };
                    const fantasyDiff = payload.y_fantasy_vs_avg;
                    const isStandout = fantasyDiff > 20;
                    const opacity = isStandout ? 1 : Math.max(0.75, Math.min(1, 0.75 + fantasyDiff / 100));
                    return (
                      <>
                        {isStandout && (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={10}
                            fill={resolvedHomeColor}
                            fillOpacity={0.15}
                          />
                        )}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill={resolvedHomeColor}
                          fillOpacity={opacity}
                          stroke="rgba(0,0,0,0.5)"
                          strokeWidth={1}
                        />
                      </>
                    );
                  }}
                />
                <Scatter
                  data={awayData}
                  fill={resolvedAwayColor}
                  opacity={1}
                  shape={(props: Record<string, unknown>) => {
                    const { cx, cy, payload } = props as { cx: number; cy: number; payload: MatchScatterPoint };
                    const fantasyDiff = payload.y_fantasy_vs_avg;
                    const isStandout = fantasyDiff > 20;
                    const opacity = isStandout ? 0.95 : Math.max(0.65, Math.min(0.85, 0.65 + fantasyDiff / 100));
                    return (
                      <>
                        {isStandout && (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={10}
                            fill={resolvedAwayColor}
                            fillOpacity={0.12}
                          />
                        )}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill={resolvedAwayColor}
                          fillOpacity={opacity}
                          stroke="rgba(0,0,0,0.4)"
                          strokeWidth={1}
                        />
                      </>
                    );
                  }}
                />
              </>
            ) : (
              <Scatter
                data={data}
                fill={resolvedHomeColor}
                opacity={1}
                shape={(props: Record<string, unknown>) => {
                  const { cx, cy, payload } = props as { cx: number; cy: number; payload: MatchScatterPoint };
                  const fantasyDiff = payload.y_fantasy_vs_avg;
                  const isStandout = fantasyDiff > 20;
                  const opacity = isStandout ? 1 : Math.max(0.75, Math.min(1, 0.75 + fantasyDiff / 100));
                  return (
                    <>
                      {isStandout && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={10}
                          fill={resolvedHomeColor}
                          fillOpacity={0.15}
                        />
                      )}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill={resolvedHomeColor}
                        fillOpacity={opacity}
                        stroke="rgba(0,0,0,0.4)"
                        strokeWidth={1}
                      />
                    </>
                  );
                }}
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
