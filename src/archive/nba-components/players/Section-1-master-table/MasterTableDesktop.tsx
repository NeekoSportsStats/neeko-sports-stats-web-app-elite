import React, { useMemo, useState } from "react";
import {
  Lock,
  ChevronRight,
  ArrowRight,
  ChevronDown,
  Search,
  X,
} from "lucide-react";
import type { StatConfig } from "@/lib/stats/types";
import type { PlayerRow, StatLens } from "./MasterTable";

/* -------------------------------------------------------------------------- */
/* CONSTANTS                                                                  */
/* -------------------------------------------------------------------------- */

const FREE_ROW_LIMIT = 8;
const PREMIUM_PAGE_SIZE = 20;

const GHOST_ROW_COUNT = 2;

const LEFT_COL_W = 220;
const GAME_COL_W = 48;
const RIGHT_COL_W = 260;
const ROW_H = 84;

const SPACING = {
  statsGapY: "space-y-[2px]",
  hitRateGapY: "space-y-1",
  dividerColor: "bg-yellow-500/10",
  col3Grid: "grid-cols-[108px_1px_1fr]",
};

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(" ");

function buildSearchIndex(p: PlayerRow) {
  return `${p.name} ${p.team} ${p.role}`.toLowerCase();
}

function getRowValues(key: string, stat: StatLens, gameLabels: string[]): number[] {
  let seed = 0;
  for (let i = 0; i < key.length; i++) seed += key.charCodeAt(i);

  const base = stat === "points" ? 18 : stat === "rebounds" ? 7 : stat === "assists" ? 4 : 2;
  const range = stat === "points" ? 25 : stat === "rebounds" ? 12 : stat === "assists" ? 10 : 5;

  return gameLabels.map((_, i) => base + ((seed + i * 13) % range));
}

function calcStats(values: number[]) {
  const total = values.reduce((a, b) => a + b, 0);
  return {
    total,
    avg: Math.round(total / values.length),
    min: Math.min(...values),
    max: Math.max(...values),
    gms: values.length,
  };
}

function calcHitRate(values: number[], threshold: number) {
  const hits = values.filter((v) => v >= threshold).length;
  return Math.round((hits / values.length) * 100);
}

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function MasterTableDesktop({
  players,
  selectedStat,
  setSelectedStat,
  isPremium,
  query,
  setQuery,
  onSelectPlayer,
  showHeader = true,
  statConfig,
}: {
  players: PlayerRow[];
  selectedStat: StatLens;
  setSelectedStat: (s: StatLens) => void;
  isPremium: boolean;
  query: string;
  setQuery: (v: string) => void;
  onSelectPlayer: (p: PlayerRow) => void;
  showHeader?: boolean;
  statConfig: StatConfig;
}) {

  const [team, setTeam] = useState("All");
  const [search, setSearch] = useState("");
  const [compact, setCompact] = useState(false);

  const [premiumVisible, setPremiumVisible] = useState(PREMIUM_PAGE_SIZE);

  const [ctaOpen, setCtaOpen] = useState(false);

  const gameLabels = statConfig.sportMeta.roundLabels;

  /* ---------------- DERIVED DATA ---------------- */

  const rows = useMemo(() => {
    return players
      .map((p) => {
        const values = p.stats[selectedStat] || [];
        return {
          player: p,
          values,
          stats: calcStats(values),
          searchIndex: buildSearchIndex(p),
        };
      })
      .sort((a, b) => b.stats.total - a.stats.total);
  }, [players, selectedStat]);

  const filtered = useMemo(() => {
    let list = rows;

    if (team !== "All") {
      list = list.filter((r) => r.player.team === team);
    }

    if (isPremium && search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((r) => r.searchIndex.includes(q));
    }

    return list;
  }, [rows, team, search, isPremium]);

  const visible = useMemo(() => {
    if (!isPremium) return filtered.slice(0, FREE_ROW_LIMIT);
    return filtered.slice(0, premiumVisible);
  }, [filtered, isPremium, premiumVisible]);

  const teams = useMemo(
    () => ["All", ...Array.from(new Set(players.map((p) => p.team)))],
    [players]
  );

  const hitThresholds = (statConfig.playerThresholds?.[selectedStat] || []).slice(0, 4);

  const nonCompactMinWidth =
    LEFT_COL_W + gameLabels.length * GAME_COL_W + RIGHT_COL_W;

  const ghostRows = useMemo(() => {
    if (isPremium) return [];
    return Array.from({ length: GHOST_ROW_COUNT }, (_, i) => i);
  }, [isPremium]);

  /* -------------------------------------------------------------------------- */
  /* SKELETON BLOCKS                                                            */
  /* -------------------------------------------------------------------------- */

  const SkeletonBar = ({ w }: { w: string }) => (
    <div className={cx("h-2 rounded-full bg-neutral-800/70", w)} />
  );

  const LockedOverlay = () => (
    <div className="absolute inset-0 bg-black/35 backdrop-blur-[6px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(250,204,21,0.12),transparent_55%)]" />
    </div>
  );

  /* -------------------------------------------------------------------------- */
  /* RENDER                                                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="mt-10 rounded-3xl border border-neutral-800 bg-black/90 shadow-2xl overflow-hidden">
      {/* ================= HEADER ================= */}
      <div className="px-6 py-6 border-b border-neutral-800 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/60 bg-black/80 px-3 py-1 text-xs text-yellow-200/90">
              <span className="uppercase tracking-[0.18em]">Master Table</span>
            </div>
            <h2 className="mt-3 text-xl font-semibold text-neutral-50">
              Full-season player performance
            </h2>
          </div>

          <div className="flex gap-2 rounded-full border border-neutral-700 bg-black/80 p-1">
            {statConfig.availableStats.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedStat(s)}
                className={cx(
                  "rounded-full px-4 py-1.5 text-xs transition",
                  selectedStat === s
                    ? "bg-yellow-400 text-black shadow-[0_0_16px_rgba(250,204,21,0.6)]"
                    : "text-neutral-300 hover:bg-neutral-800"
                )}
              >
                {statConfig.labels[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-neutral-400">
              Game-by-game totals, averages and hit-rate performance
            </p>

            <div
              className={cx(
                "relative flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                isPremium
                  ? "border-neutral-700 bg-black text-neutral-200"
                  : "border-neutral-800 bg-neutral-900 text-neutral-500"
              )}
            >
              <span className="text-xs">Team</span>
              <select
                disabled={!isPremium}
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="bg-transparent text-sm outline-none appearance-none pr-6"
              >
                {teams.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              {isPremium ? (
                <ChevronDown className="h-4 w-4 absolute right-2" />
              ) : (
                <Lock className="h-4 w-4 absolute right-2" />
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              onClick={() => setCompact((v) => !v)}
              className={cx(
                "rounded-full px-3 py-1 text-xs border transition",
                compact
                  ? "bg-yellow-400 text-black border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)]"
                  : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              )}
            >
              Compact
            </button>

            <div
              className={cx(
                "relative flex items-center rounded-xl border px-3 py-2",
                isPremium
                  ? "border-neutral-700 bg-black"
                  : "border-neutral-800 bg-neutral-900"
              )}
            >
              <Search className="h-4 w-4 text-neutral-500 mr-2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={!isPremium}
                placeholder="Search player, team or position"
                className="bg-transparent text-sm text-neutral-200 placeholder:text-neutral-500 outline-none w-48 disabled:cursor-not-allowed"
              />
              {!isPremium && <Lock className="h-4 w-4 text-neutral-500 ml-2" />}
            </div>
          </div>
        </div>
      </div>

      {/* ================= TABLE (SCROLL CONTAINER) ================= */}
      <div className="relative overflow-x-auto scrollbar-none">
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-black/90 to-transparent z-40" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-black/90 to-transparent z-40" />

        <div
          className="flex text-[11px]"
          style={{ minWidth: compact ? undefined : nonCompactMinWidth }}
        >
          {/* PLAYER COLUMN */}
          <div
            className="sticky left-0 z-30 bg-black/95 border-r border-neutral-800"
            style={{ width: LEFT_COL_W }}
          >
            <div className="sticky top-0 z-40 px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-neutral-500 border-b border-neutral-800 bg-black/95">
              Player
            </div>

            {visible.map(({ player }) => (
              <button
                key={player.id}
                onClick={() => onSelectPlayer(player)}
                className={cx(
                  "group w-full px-5 border-t border-neutral-800 flex items-center justify-between hover:bg-neutral-900/40 transition",
                  !isPremium && "hover:cursor-pointer"
                )}
                style={{ height: ROW_H }}
                title={!isPremium ? "Click player to preview (full insights via Neeko+)" : "Click player for insights"}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-neutral-50">
                    <span className="truncate">{player.name}</span>
                    <ChevronRight className="h-4 w-4 text-neutral-600 group-hover:text-neutral-200 transition" />
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500 truncate">
                    {player.team} · {player.role}
                  </div>
                </div>

                {!isPremium && (
                  <span className="opacity-0 group-hover:opacity-100 transition text-[10px] text-yellow-300/90 flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    Insights
                  </span>
                )}
              </button>
            ))}

            {ghostRows.map((i) => (
              <div
                key={`ghost-player-${i}`}
                className="relative px-5 border-t border-neutral-800"
                style={{ height: ROW_H }}
              >
                <div className="h-full flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <SkeletonBar w="w-24" />
                      <SkeletonBar w="w-10" />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <SkeletonBar w="w-12" />
                      <SkeletonBar w="w-16" />
                      <SkeletonBar w="w-10" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-yellow-300/80" />
                  </div>
                </div>

                <LockedOverlay />
              </div>
            ))}
          </div>

          {/* NON-COMPACT */}
          {!compact && (
            <>
              <div>
                <div className="sticky top-0 z-20 flex border-b border-neutral-800 bg-black/95">
                  {gameLabels.map((g) => (
                    <div
                      key={g}
                      className="py-3 text-center text-[10px] uppercase tracking-[0.18em] text-neutral-500"
                      style={{ width: GAME_COL_W }}
                    >
                      {g.replace("Game ", "G")}
                    </div>
                  ))}
                </div>

                {visible.map(({ player, values }) => (
                  <div
                    key={player.id}
                    className="flex border-t border-neutral-800"
                    style={{ height: ROW_H }}
                  >
                    {values.map((v, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-center text-sm text-neutral-100"
                        style={{ width: GAME_COL_W }}
                      >
                        {v}
                      </div>
                    ))}
                  </div>
                ))}

                {ghostRows.map((i) => (
                  <div
                    key={`ghost-games-${i}`}
                    className="relative flex border-t border-neutral-800"
                    style={{ height: ROW_H }}
                  >
                    {gameLabels.map((_, j) => (
                      <div
                        key={j}
                        className="flex items-center justify-center"
                        style={{ width: GAME_COL_W }}
                      >
                        <div className="h-4 w-6 rounded bg-neutral-800/70" />
                      </div>
                    ))}
                    <LockedOverlay />
                  </div>
                ))}
              </div>

              <div
                className="sticky right-0 z-20 bg-black/95 border-l border-neutral-800"
                style={{ width: RIGHT_COL_W }}
              >
                <div className="sticky top-0 z-30 px-4 py-3 bg-black/95 border-b border-neutral-800 text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                  Stats & hit rate
                </div>

                {visible.map(({ player, stats, values }) => (
                  <div
                    key={player.id}
                    className="px-4 border-t border-neutral-800"
                    style={{ height: ROW_H }}
                  >
                    <div className={cx("grid h-full items-center", SPACING.col3Grid)}>
                      <div className="flex flex-col justify-center space-y-[2px]">
                        {[
                          ["AVG", stats.avg],
                          ["MIN", stats.min],
                          ["MAX", stats.max],
                          ["GMS", stats.gms],
                        ].map(([l, v]) => (
                          <div
                            key={l}
                            className="grid grid-cols-[32px_auto] gap-2 text-[11px]"
                          >
                            <span className="text-neutral-500">{l}</span>
                            <span
                              className={cx(l === "AVG" && "text-yellow-300 font-semibold")}
                            >
                              {v}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className={SPACING.dividerColor} />

                      <div className="flex flex-col justify-center space-y-1 pl-3">
                        {hitThresholds.map((t) => {
                          const r = calcHitRate(values, t);
                          return (
                            <div key={t} className="flex items-center gap-2">
                              <span className="w-8 text-[10px] text-neutral-400">
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

                {ghostRows.map((i) => (
                  <div
                    key={`ghost-stats-${i}`}
                    className="relative px-4 border-t border-neutral-800"
                    style={{ height: ROW_H }}
                  >
                    <div className={cx("grid h-full items-center", SPACING.col3Grid)}>
                      <div className="flex flex-col justify-center space-y-[8px]">
                        <div className="grid grid-cols-[32px_auto] gap-2">
                          <SkeletonBar w="w-8" />
                          <SkeletonBar w="w-10" />
                        </div>
                        <div className="grid grid-cols-[32px_auto] gap-2">
                          <SkeletonBar w="w-8" />
                          <SkeletonBar w="w-10" />
                        </div>
                        <div className="grid grid-cols-[32px_auto] gap-2">
                          <SkeletonBar w="w-8" />
                          <SkeletonBar w="w-10" />
                        </div>
                      </div>

                      <div className={SPACING.dividerColor} />

                      <div className="flex flex-col justify-center space-y-2 pl-3">
                        {hitThresholds.map((t) => (
                          <div key={t} className="flex items-center gap-2">
                            <SkeletonBar w="w-8" />
                            <div className="flex-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
                              <div className="h-full w-1/2 bg-neutral-700/70" />
                            </div>
                            <SkeletonBar w="w-8" />
                          </div>
                        ))}
                      </div>
                    </div>

                    <LockedOverlay />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* COMPACT */}
          {compact && (
            <div className="flex-1 min-w-0 bg-black/95 border-l border-neutral-800">
              <div className="sticky top-0 z-30 px-4 py-3 bg-black/95 border-b border-neutral-800 text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                Stats & hit rate
              </div>

              {visible.map(({ player, stats, values }) => (
                <div
                  key={player.id}
                  className="px-4 border-t border-neutral-800"
                  style={{ height: ROW_H }}
                >
                  <div className="grid h-full items-center gap-6 [grid-template-columns:repeat(8,minmax(0,1fr))]">
                    {[
                      ["AVG", stats.avg],
                      ["MIN", stats.min],
                      ["MAX", stats.max],
                      ["GMS", stats.gms],
                    ].map(([l, v]) => (
                      <div key={l} className="flex items-center gap-1">
                        <span className="text-neutral-500">{l}</span>
                        <span className={cx(l === "AVG" && "text-yellow-300 font-semibold")}>
                          {v}
                        </span>
                      </div>
                    ))}

                    {hitThresholds.map((t) => {
                      const r = calcHitRate(values, t);
                      return (
                        <div key={t} className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] text-neutral-400">{t}+</span>
                          <div className="flex-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-400 via-yellow-300 to-orange-400"
                              style={{ width: `${r}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-neutral-300">{r}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {ghostRows.map((i) => (
                <div
                  key={`ghost-compact-${i}`}
                  className="relative px-4 border-t border-neutral-800"
                  style={{ height: ROW_H }}
                >
                  <div className="grid h-full items-center gap-6 [grid-template-columns:repeat(8,minmax(0,1fr))]">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <div key={j} className="flex items-center gap-2">
                        <SkeletonBar w="w-8" />
                        <SkeletonBar w="w-10" />
                      </div>
                    ))}

                    {Array.from({ length: 4 }).map((_, j) => (
                      <div key={j} className="flex items-center gap-2 min-w-0">
                        <SkeletonBar w="w-8" />
                        <div className="flex-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
                          <div className="h-full w-1/2 bg-neutral-700/70" />
                        </div>
                        <SkeletonBar w="w-8" />
                      </div>
                    ))}
                  </div>

                  <LockedOverlay />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!isPremium && (
        <div className="flex justify-center py-10 border-t border-neutral-800">
          <button
            onClick={() => setCtaOpen(true)}
            className="rounded-3xl border border-yellow-500/30 bg-gradient-to-r from-yellow-500/25 via-yellow-500/10 to-transparent px-6 py-4 shadow-2xl max-w-lg w-full flex items-center justify-between hover:brightness-110 transition"
          >
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-yellow-300">
                Neeko+
              </div>
              <div className="text-sm font-semibold text-yellow-100">
                Unlock full player table
              </div>
              <div className="text-xs text-neutral-300">
                Search, team filters & full season insights
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-yellow-300" />
          </button>
        </div>
      )}

      {isPremium && premiumVisible < filtered.length && (
        <div className="py-6 text-center">
          <button
            onClick={() =>
              setPremiumVisible((v) => Math.min(v + PREMIUM_PAGE_SIZE, filtered.length))
            }
            className="text-sm text-yellow-300 hover:underline"
          >
            Show more
          </button>
        </div>
      )}

      {!isPremium && ctaOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center px-6">
          <button
            className="absolute inset-0 bg-black/70"
            onClick={() => setCtaOpen(false)}
            aria-label="Close"
          />
          <div className="relative w-full max-w-lg rounded-3xl border border-yellow-500/25 bg-black/90 shadow-2xl overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(250,204,21,0.16),transparent_55%)]" />
            <div className="relative p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-yellow-300">
                    Neeko+
                  </div>
                  <div className="mt-1 text-lg font-semibold text-yellow-100">
                    Unlock the full player table
                  </div>
                  <div className="mt-2 text-sm text-neutral-300">
                    Get full-season access, filters, and player insights.
                  </div>
                </div>
                <button
                  onClick={() => setCtaOpen(false)}
                  className="rounded-full border border-neutral-700 bg-black/60 p-2 text-neutral-200 hover:bg-neutral-800 transition"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  onClick={() => setCtaOpen(false)}
                  className="rounded-xl border border-neutral-700 bg-black/60 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800 transition"
                >
                  Not now
                </button>
                <button
                  onClick={() => (window.location.href = "https://www.neekostats.com.au/neeko-plus")}
                  className="rounded-xl border border-yellow-500/40 bg-yellow-400 px-4 py-2 text-sm font-semibold text-black shadow-[0_0_18px_rgba(250,204,21,0.35)] hover:brightness-110 transition"
                >
                  Go to Neeko+
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
