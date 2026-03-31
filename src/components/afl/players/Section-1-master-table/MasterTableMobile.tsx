import React, { useMemo, useState } from "react";
import { Search, Lock, X, ArrowRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StatConfig } from "@/lib/stats/types";
import type { PlayerRow, StatLens } from "./MasterTable";

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function cx(...parts: Array<string | false | undefined | null>) {
  return parts.filter(Boolean).join(" ");
}

/* ✅ ADDED — skeleton helper (non-invasive) */
const skeletonValue = () => Math.floor(70 + Math.random() * 40);

const ROUND_LABELS = ["OR", ...Array.from({ length: 23 }, (_, i) => `R${i + 1}`)];
const PAGE_SIZE = 10;

const LEFT_COL_W = 140;
const CELL_W = 52;
const CELL_GAP = 4;

// Shared stats row layout (header + body must match exactly)
const STATS_ROW_CLASS = "flex gap-[4px] px-1.5";

/* -------------------------------------------------------------------------- */
/* MASTER TABLE MOBILE                                                         */
/* -------------------------------------------------------------------------- */

export default function MasterTableMobile({
  players,
  selectedStat,
  setSelectedStat,
  isPremium,
  query,
  setQuery,
  onSelectPlayer,
  statConfig,
}: {
  players: PlayerRow[];
  selectedStat: StatLens;
  setSelectedStat: (s: StatLens) => void;
  isPremium: boolean;
  query: string;
  setQuery: (v: string) => void;
  onSelectPlayer: (p: PlayerRow) => void;
  statConfig: StatConfig;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);

  /* ---------------------------------------------------------------------- */
  /* FILTERING                                                               */
  /* ---------------------------------------------------------------------- */

  const filtered = useMemo(() => {
    let result = players;

    if (isPremium && query.trim()) {
      result = result.filter((p) =>
        p.name.toLowerCase().includes(query.toLowerCase())
      );
    }

    if (isPremium && teamFilter) {
      result = result.filter((p) => p.team === teamFilter);
    }

    return result;
  }, [players, query, isPremium, teamFilter]);

  const visiblePlayers = filtered.slice(0, visibleCount);

  /* ---------------------------------------------------------------------- */
  /* RENDER                                                                  */
  /* ---------------------------------------------------------------------- */

  const tableWidth = LEFT_COL_W + 24 * CELL_W + 23 * CELL_GAP + 16;

  const TEAMS = useMemo(
    () => Array.from(new Set(players.map((p) => p.team))).sort(),
    [players]
  );

  return (
    <>
      {/* ================= HEADER CARD ================= */}
      <div className="relative mt-6">
        <div className="absolute inset-0 backdrop-blur-[14px]" />
        <div className="relative rounded-3xl border border-neutral-800 bg-black/80 px-4 py-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-yellow-200">
                Master Table
              </span>
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  if (!isPremium) {
                    setShowUpgrade(true);
                    return;
                  }
                  setShowTeamDropdown((v) => !v);
                }}
                className="flex items-center gap-1 rounded-full border border-neutral-700 bg-black/80 px-3 py-1 text-[11px] text-neutral-300"
              >
                {!isPremium && <Lock className="h-3 w-3" />}
                {teamFilter ?? "Select Team"}
              </button>

              {showTeamDropdown && isPremium && (
                <div className="absolute right-0 z-50 mt-2 w-44 rounded-2xl border border-neutral-700 bg-black/95 p-1 shadow-xl">
                  <button
                    onClick={() => {
                      setTeamFilter(null);
                      setShowTeamDropdown(false);
                    }}
                    className="w-full rounded-xl px-3 py-2 text-left text-xs text-neutral-300 hover:bg-neutral-800"
                  >
                    All teams
                  </button>

                  {TEAMS.map((team) => (
                    <button
                      key={team}
                      onClick={() => {
                        setTeamFilter(team);
                        setShowTeamDropdown(false);
                      }}
                      className="w-full rounded-xl px-3 py-2 text-left text-xs text-neutral-200 hover:bg-neutral-800"
                    >
                      {team}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <h3 className="mt-3 text-lg font-semibold text-neutral-50">
            Full-season player trends
          </h3>

          <p className="mt-1 text-xs text-neutral-400">
            Round-by-round production.
          </p>

          <div className="mt-4 flex gap-2 rounded-full border border-neutral-700 bg-black/80 px-2 py-1 text-[11px]">
            {statConfig.availableStats.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedStat(s)}
                className={cx(
                  "rounded-full px-3 py-1.5 transition",
                  selectedStat === s
                    ? "bg-yellow-400 text-black shadow-[0_0_16px_rgba(250,204,21,0.6)]"
                    : "bg-neutral-900 text-neutral-300"
                )}
              >
                {statConfig.labels[s]}
              </button>
            ))}
          </div>

          <div className="mt-3">
            {isPremium ? (
              <div className="flex items-center gap-2 rounded-2xl border border-neutral-800 bg-black/70 px-3 py-2">
                <Search className="h-4 w-4 text-neutral-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search players…"
                  className="w-full bg-transparent text-[12px] text-neutral-200 outline-none"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-2xl border border-neutral-800 bg-black/60 px-3 py-2">
                <Lock className="h-4 w-4 text-neutral-500" />
                <span className="text-[12px] text-neutral-500">
                  Search is Neeko+ only
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= TABLE ================= */}
      <div className="mt-4 rounded-3xl border border-neutral-800 bg-black/90 shadow-xl overflow-hidden">
        <div className="relative">
          <div className="overflow-x-auto overflow-y-visible scrollbar-none relative">
            {!isPremium && (
              <div
                className="absolute z-40 pointer-events-none"
                style={{
                  top: 8 * 64 - 32,
                  left: 0,
                  right: 0,
                  height: 128,
                }}
              >
                <div className="flex h-full items-center justify-center">
                  <button
                    onClick={() => setShowUpgrade(true)}
                    className="pointer-events-auto mx-4 w-full max-w-sm rounded-3xl
                               border border-yellow-500/30
                               bg-gradient-to-r from-yellow-500/25 via-yellow-500/10 to-transparent
                               px-5 py-4 text-left shadow-xl"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-yellow-200/80">
                          Neeko+
                        </div>
                        <div className="mt-1 text-sm font-semibold text-yellow-100">
                          Unlock full player table
                        </div>
                        <div className="mt-1 text-xs text-neutral-300">
                          Full season trends, team filters & AI insights.
                        </div>
                      </div>

                      <ArrowRight className="h-5 w-5 text-yellow-300 shrink-0" />
                    </div>
                  </button>
                </div>
              </div>
            )}

            <div style={{ width: tableWidth }}>
              <div className="flex border-b border-neutral-800/80">
                <div
                  className="px-4 py-4 sticky left-0 z-20 bg-black/90"
                  style={{ width: LEFT_COL_W }}
                >
                  <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                    Player
                  </div>
                </div>

                <div className={`${STATS_ROW_CLASS} py-4`}>
                  {ROUND_LABELS.map((r) => (
                    <div
                      key={r}
                      className="text-center text-[10px] uppercase tracking-[0.18em] text-neutral-500 translate-y-[1px]"
                      style={{ width: CELL_W }}
                    >
                      {r}
                    </div>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-neutral-800/70">
                {visiblePlayers.map((p, idx) => {
                  const gated = !isPremium && idx >= 8;

                  return (
                    <div key={p.id} className="relative flex" style={{ width: tableWidth }}>
                      <button
                        disabled={gated}
                        onClick={() => onSelectPlayer(p)}
                        className="px-4 py-4 flex items-center justify-between text-left sticky left-0 z-10 bg-black/90"
                        style={{ width: LEFT_COL_W }}
                      >
                        <div className="max-w-[108px] text-[13px] font-semibold text-neutral-50 whitespace-normal leading-tight break-words">
                          {p.name}
                        </div>
                        {!gated && (
                          <ChevronRight className="h-4 w-4 text-neutral-500" />
                        )}
                      </button>

                      <div className={`${STATS_ROW_CLASS} py-4`}>
                        {ROUND_LABELS.map((_, i) => (
                          <div
                            key={i}
                            className="text-center text-[15px] text-neutral-100"
                            style={{ width: CELL_W }}
                          >
                            {gated ? (
                              <span className="inline-block w-6 h-4 rounded-sm bg-neutral-600/40 animate-pulse" />
                            ) : (
                              skeletonValue()
                            )}
                          </div>
                        ))}
                      </div>

                      {gated && (
                        <div className="absolute inset-0 z-10">
                          <div className="absolute inset-0 backdrop-blur-[16px]" />
                          <div className="absolute inset-0 bg-black/45" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= SHOW MORE ================= */}
      {visiblePlayers.length < filtered.length && (
        <div className="mt-4 flex justify-center">
          <Button
            onClick={() =>
              setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length))
            }
            className="rounded-full bg-neutral-800 px-6 py-2 text-neutral-200"
          >
            Show more
          </Button>
        </div>
      )}

      {/* ================= SHOW LESS (premium only) ================= */}
      {isPremium && visibleCount > PAGE_SIZE && (
        <div className="mt-2 flex justify-center">
          <button
            onClick={() => setVisibleCount(PAGE_SIZE)}
            className="text-xs text-neutral-500 hover:text-neutral-300"
          >
            Show less
          </button>
        </div>
      )}

      {/* ================= UPGRADE MODAL ================= */}
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
                    Unlock Master Table
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
                <ul className="space-y-3 text-sm text-neutral-300">
                  <li>• Full season round-by-round stats</li>
                  <li>• Team filtering & search</li>
                  <li>• Player insights & AI analysis</li>
                  <li>• Premium-only table interactions</li>
                </ul>

                <button
                  className="mt-4 w-full rounded-2xl
                             bg-gradient-to-r from-yellow-400 to-yellow-500
                             py-3 text-sm font-semibold text-black
                             shadow-[0_0_24px_rgba(250,204,21,0.6)]
                             transition active:scale-[0.98]"
                  onClick={() => {
                    window.location.href = "https://www.neekostats.com.au/neeko-plus";
                  }}
                >
                  Upgrade to Neeko+
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { scrollbar-width: none; }
      `}</style>
    </>
  );
}