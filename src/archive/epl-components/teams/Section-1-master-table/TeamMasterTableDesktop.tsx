import React, { useMemo, useState } from "react";
import {
  Lock,
  ChevronRight,
  ArrowRight,
  Search,
  X,
} from "lucide-react";
import type { TeamRow } from "../data/mockTeams";
import type { StatLens } from "./TeamMasterTable";
import type { StatConfig, EPLStatKey } from "@/lib/stats/types";

const FREE_ROW_LIMIT = 8;
const LOCKED_PREVIEW_ROWS = 2;

const LEFT_COL_W = 220;
const ROUND_COL_W = 48;
const RIGHT_COL_W = 260;
const ROW_H = 84;

const cx = (...c: Array<string | false | undefined>) =>
  c.filter(Boolean).join(" ");

function getValues(team: TeamRow, stat: StatLens): number[] {
  const values = (team as any)[stat];
  return Array.isArray(values) ? values : [];
}

function calcStats(values: number[]) {
  if (!values.length) {
    return { avg: 0, min: 0, max: 0, gms: 0 };
  }
  const total = values.reduce((a, b) => a + b, 0);
  return {
    avg: Math.round(total / values.length),
    min: Math.min(...values),
    max: Math.max(...values),
    gms: values.length,
  };
}

function calcHitRate(values: number[], threshold: number) {
  if (!values.length) return 0;
  const hits = values.filter((v) => v >= threshold).length;
  return Math.round((hits / values.length) * 100);
}

export default function TeamMasterTableDesktop({
  teams,
  selectedStat,
  setSelectedStat,
  isPremium,
  query,
  setQuery,
  onSelectTeam,
  statConfig,
}: {
  teams: TeamRow[];
  selectedStat: StatLens;
  setSelectedStat: (s: StatLens) => void;
  isPremium: boolean;
  query: string;
  setQuery: (v: string) => void;
  onSelectTeam: (t: TeamRow) => void;
  statConfig: StatConfig<EPLStatKey>;
}) {
  const [search, setSearch] = useState("");
  const [compact, setCompact] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const ROUND_LABELS = useMemo(() => {
    return ["OR", ...(statConfig.sportMeta.roundLabels ?? [])];
  }, [statConfig]);

  const hitThresholds = useMemo(() => {
    return statConfig.teamThresholds[selectedStat] ?? [];
  }, [statConfig, selectedStat]);

  const rows = useMemo(() => {
    return teams.map((t) => {
      const values = getValues(t, selectedStat);
      return {
        team: t,
        values,
        stats: calcStats(values),
        searchIndex: `${t.name} ${t.code}`.toLowerCase(),
      };
    });
  }, [teams, selectedStat]);

  const filtered = useMemo(() => {
    if (!isPremium || !search.trim()) return rows;
    const q = search.toLowerCase().trim();
    return rows.filter((r) => r.searchIndex.includes(q));
  }, [rows, search, isPremium]);

  const visibleRows =
    isPremium && expanded ? filtered : filtered.slice(0, FREE_ROW_LIMIT);

  const lockedRows =
    !isPremium && filtered.length > FREE_ROW_LIMIT
      ? filtered.slice(
          FREE_ROW_LIMIT,
          FREE_ROW_LIMIT + LOCKED_PREVIEW_ROWS
        )
      : [];

  return (
    <>
      <div className="mt-10 rounded-3xl border border-neutral-800 bg-black shadow-2xl overflow-hidden">
        <div className="px-6 py-6 border-b border-neutral-800">
          <div className="flex justify-between items-start">
            <div>
              <div className="inline-flex rounded-full border border-yellow-500/60 px-3 py-1 text-xs text-yellow-200 uppercase tracking-[0.18em]">
                Teams Master Table
              </div>
              <h2 className="mt-3 text-xl font-semibold text-neutral-50">
                Full-season team trends
              </h2>
              <p className="text-xs text-neutral-400">
                Season-long totals, averages and hit-rate performance
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2 rounded-full border border-neutral-700 bg-black p-1">
                {(statConfig.availableStats as readonly StatLens[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedStat(s)}
                    className={cx(
                      "px-4 py-1.5 text-xs rounded-full transition",
                      selectedStat === s
                        ? "bg-yellow-400 text-black shadow-[0_0_16px_rgba(250,204,21,0.6)]"
                        : "text-neutral-300 hover:bg-neutral-800"
                    )}
                  >
                    {statConfig.labels[s]}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setCompact((v) => !v)}
                  className={cx(
                    "px-3 py-1 text-xs rounded-full border transition",
                    compact
                      ? "bg-yellow-400 text-black"
                      : "border-neutral-700 text-neutral-300"
                  )}
                >
                  Compact
                </button>

                <div
                  className={cx(
                    "flex items-center gap-2 rounded-xl border px-3 py-2",
                    isPremium
                      ? "border-neutral-700 bg-black"
                      : "border-neutral-800 bg-neutral-900"
                  )}
                >
                  <Search className="h-4 w-4 text-neutral-500" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    disabled={!isPremium}
                    placeholder="Search team"
                    className="bg-transparent text-sm text-neutral-200 outline-none w-40 disabled:cursor-not-allowed"
                  />
                  {!isPremium && <Lock className="h-4 w-4 text-neutral-500" />}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative overflow-x-auto">
          <div
            className="flex text-[11px]"
            style={{
              minWidth: compact
                ? LEFT_COL_W + RIGHT_COL_W * 2
                : LEFT_COL_W +
                  ROUND_LABELS.length * ROUND_COL_W +
                  RIGHT_COL_W,
            }}
          >
            <div
              className="sticky left-0 z-20 border-r border-neutral-800 bg-black"
              style={{ width: LEFT_COL_W }}
            >
              <div className="sticky top-0 px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-neutral-500 border-b border-neutral-800 bg-black">
                Team
              </div>

              {visibleRows.map(({ team }) => (
                <button
                  key={team.id}
                  onClick={() => onSelectTeam(team)}
                  className="group w-full px-5 border-t border-neutral-800 flex items-center justify-between hover:bg-neutral-900/40"
                  style={{ height: ROW_H }}
                >
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-neutral-50">
                      {team.name}
                      <ChevronRight className="h-4 w-4 text-neutral-600 group-hover:text-neutral-300 transition" />
                    </div>
                    <div className="mt-[1px] text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                      {team.code}
                    </div>
                  </div>
                </button>
              ))}

              {!isPremium &&
                lockedRows.map((_, i) => (
                  <div
                    key={i}
                    className="group relative px-5 border-t border-neutral-800 overflow-hidden cursor-pointer"
                    style={{ height: ROW_H }}
                    onClick={() => setShowUpgrade(true)}
                  >
                    <div className="space-y-2 pt-4 opacity-40">
                      <div className="h-4 w-3/4 rounded bg-neutral-800" />
                      <div className="h-3 w-1/3 rounded bg-neutral-900" />
                    </div>

                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400/20 to-transparent animate-[shimmer_2.2s_linear_infinite]" />
                    <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/20 via-black/80 to-black/90 backdrop-blur-md" />

                    <div className="absolute inset-0 flex items-center justify-center opacity-70 group-hover:opacity-100 transition">
                      <div className="flex items-center gap-2 text-yellow-300">
                        <Lock className="h-4 w-4" />
                        <span className="text-xs tracking-wide">
                          Unlock insights
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            {!compact && (
              <div>
                <div className="sticky top-0 z-10 flex border-b border-neutral-800 bg-black">
                  {ROUND_LABELS.map((r) => (
                    <div
                      key={r}
                      className="py-3 text-center text-[10px] uppercase tracking-[0.18em] text-neutral-500"
                      style={{ width: ROUND_COL_W }}
                    >
                      {r}
                    </div>
                  ))}
                </div>

                {visibleRows.map(({ team, values }) => (
                  <div
                    key={team.id}
                    className="flex border-t border-neutral-800"
                    style={{ height: ROW_H }}
                  >
                    {values.map((v, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-center text-sm text-neutral-100"
                        style={{ width: ROUND_COL_W }}
                      >
                        {v}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div
              className="sticky right-0 z-10 border-l border-neutral-800 bg-black"
              style={{ width: compact ? RIGHT_COL_W * 2 : RIGHT_COL_W }}
            >
              <div className="sticky top-0 px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-neutral-500 border-b border-neutral-800 bg-black">
                Stats & hit rate
              </div>

              {visibleRows.map(({ team, stats, values }) => (
                <div
                  key={team.id}
                  className="px-4 border-t border-neutral-800"
                  style={{ height: ROW_H }}
                >
                  <div className="grid grid-cols-[108px_1px_1fr] h-full items-center">
                    <div className="space-y-[2px]">
                      <div className="text-[11px]">
                        <span className="text-neutral-500">AVG</span>{" "}
                        <span className="text-yellow-300 font-semibold">
                          {stats.avg}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        MIN {stats.min}
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        MAX {stats.max}
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        GMS {stats.gms}
                      </div>
                    </div>

                    <div className="bg-yellow-500/10 h-full w-px" />

                    <div className="space-y-1 pl-3">
                      {hitThresholds.map((t) => {
                        const r = calcHitRate(values, t);
                        return (
                          <div key={t} className="flex items-center gap-2">
                            <span className="w-10 text-[10px] text-neutral-400">
                              {t}+
                            </span>
                            <div className="flex-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-emerald-400 via-yellow-300 to-orange-400"
                                style={{ width: `${r}%` }}
                              />
                            </div>
                            <span className="w-8 text-right text-[10px] text-neutral-300">
                              {r}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="h-px bg-neutral-800 w-full" />
        </div>

        <div className="py-10 flex justify-center border-t border-neutral-800">
          {!isPremium ? (
            <button
              onClick={() => setShowUpgrade(true)}
              className="group max-w-lg w-full rounded-3xl border border-yellow-500/30
                         bg-gradient-to-r from-yellow-500/25 via-yellow-500/10 to-transparent
                         px-6 py-4 shadow-2xl flex items-center justify-between
                         transition hover:shadow-[0_0_32px_rgba(250,204,21,0.6)]"
            >
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-yellow-300">
                  Neeko+
                </div>
                <div className="text-sm font-semibold text-yellow-100">
                  Unlock full teams table
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-yellow-300 transition group-hover:translate-x-0.5" />
            </button>
          ) : !expanded ? (
            <button
              onClick={() => setExpanded(true)}
              className="text-sm text-neutral-300 hover:text-yellow-300"
            >
              Show more
            </button>
          ) : null}
        </div>
      </div>

      {showUpgrade && (
        <div className="fixed inset-0 z-[100]">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowUpgrade(false)}
          />

          <div className="fixed inset-0 z-[101] flex items-center justify-center px-4">
            <div className="rounded-3xl border border-yellow-500/30 bg-black/95 shadow-2xl max-w-md w-full">
              <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-yellow-300">
                    Neeko+
                  </div>
                  <div className="text-lg font-semibold text-neutral-50">
                    Unlock full teams table
                  </div>
                </div>

                <button
                  onClick={() => setShowUpgrade(false)}
                  className="rounded-full p-2 text-neutral-400 hover:bg-neutral-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="px-5 py-5 space-y-4">
                <p className="text-sm text-neutral-300">
                  Access full-season team trends, advanced hit-rate analysis,
                  and deeper matchup insights across every EPL club.
                </p>

                <button
                  className="mt-4 w-full rounded-2xl
                             bg-gradient-to-r from-yellow-400 to-yellow-500
                             py-3 text-sm font-semibold text-black
                             shadow-[0_0_24px_rgba(250,204,21,0.6)]"
                  onClick={() =>
                    (window.location.href =
                      "https://www.neekostats.com.au/neeko-plus")
                  }
                >
                  Upgrade to Neeko+
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
