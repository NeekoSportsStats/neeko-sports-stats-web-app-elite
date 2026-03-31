import React, { useMemo, useState } from "react";
import { Search, Lock, X, ArrowRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TeamRow } from "../data/mockTeams";
import type { StatLens } from "./TeamMasterTable";
import { NBA_STAT_CONFIG } from "@/lib/stats/nba/statConfig";

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function cx(...parts: Array<string | false | undefined | null>) {
  return parts.filter(Boolean).join(" ");
}

/* skeleton helper (mirrors Players exactly) */
const skeletonValue = () => Math.floor(1800 + Math.random() * 400);

const ROUND_LABELS = ["OR", ...Array.from({ length: 23 }, (_, i) => `R${i + 1}`)];
const PAGE_SIZE = 8;

const LEFT_COL_W = 124;
const CELL_W = 52;
const CELL_GAP = 4;

const STATS_ROW_CLASS = "flex gap-[4px] px-1.5";

/* -------------------------------------------------------------------------- */
/* TEAM MASTER TABLE MOBILE                                                   */
/* -------------------------------------------------------------------------- */

export default function TeamMasterTableMobile({
  teams,
  selectedStat,
  setSelectedStat,
  conference,
  setConference,
  isPremium,
  query,
  setQuery,
  onSelectTeam,
}: {
  teams: TeamRow[];
  selectedStat: StatLens;
  setSelectedStat: (s: StatLens) => void;
  conference: "East" | "West";
  setConference: (c: "East" | "West") => void;
  isPremium: boolean;
  query: string;
  setQuery: (v: string) => void;
  onSelectTeam: (t: TeamRow) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showUpgrade, setShowUpgrade] = useState(false);

  /* ---------------------------------------------------------------------- */
  /* FILTERING                                                               */
  /* ---------------------------------------------------------------------- */

  const conferenceTeams = useMemo(() => {
    return teams.filter((t) => t.conference === conference);
  }, [teams, conference]);

  const filtered = useMemo(() => {
    let result = conferenceTeams;

    if (isPremium && query.trim()) {
      result = result.filter((t) =>
        t.name.toLowerCase().includes(query.toLowerCase())
      );
    }

    return result;
  }, [conferenceTeams, query, isPremium]);

  const visibleTeams = filtered.slice(0, visibleCount);

  const tableWidth = LEFT_COL_W + 24 * CELL_W + 23 * CELL_GAP + 16;

  /* ---------------------------------------------------------------------- */
  /* RENDER                                                                  */
  /* ---------------------------------------------------------------------- */

  return (
    <>
      {/* ================= HEADER CARD ================= */}
      <div className="relative mt-6">
        <div className="absolute inset-0 backdrop-blur-[14px]" />
        <div className="relative rounded-3xl border border-neutral-800 bg-black/80 px-4 py-4 shadow-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-yellow-200">
              Teams Master Table
            </span>
          </div>

          <h3 className="mt-3 text-lg font-semibold text-neutral-50">
            {conference}ern Conference
          </h3>

          <p className="mt-1 text-xs text-neutral-400">
            Round-by-round team production.
          </p>

          <div className="mt-3 flex gap-2">
            {(["East", "West"] as const).map((conf) => (
              <button
                key={conf}
                onClick={() => setConference(conf)}
                className={cx(
                  "px-3 py-1.5 text-xs rounded-full border transition-all",
                  conference === conf
                    ? "border-yellow-400/40 bg-yellow-400/10 text-yellow-200"
                    : "border-neutral-700 bg-neutral-900/50 text-neutral-400"
                )}
              >
                {conf}
              </button>
            ))}
          </div>

          <div className="mt-4 flex gap-2 rounded-full border border-neutral-700 bg-black/80 px-2 py-1 text-[11px]">
            {NBA_STAT_CONFIG.availableStats.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedStat(s as StatLens)}
                className={cx(
                  "rounded-full px-3 py-1.5 transition",
                  selectedStat === s
                    ? "bg-yellow-400 text-black shadow-[0_0_16px_rgba(250,204,21,0.6)]"
                    : "bg-neutral-900 text-neutral-300"
                )}
              >
                {NBA_STAT_CONFIG.labels[s]}
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
                  placeholder="Search teams…"
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
        <div className="relative overflow-x-auto scrollbar-none">
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
                        Unlock full teams table
                      </div>
                      <div className="mt-1 text-xs text-neutral-300">
                        Full season trends & team insights.
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
                  Team
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
              {visibleTeams.map((t, idx) => {
                const gated = !isPremium && idx >= 8;

                return (
                  <div key={t.id} className="relative flex" style={{ width: tableWidth }}>
                    <button
                      disabled={gated}
                      onClick={() => onSelectTeam(t)}
                      className="px-4 py-4 flex items-center justify-between text-left sticky left-0 z-10 bg-black/90"
                      style={{ width: LEFT_COL_W }}
                    >
                      <span className="text-[15px] font-semibold text-neutral-50 whitespace-nowrap">
                        {t.name}
                      </span>
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

      {/* ================= SHOW MORE ================= */}
      {visibleTeams.length < filtered.length && (
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
                    Unlock Teams Master Table
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
                  <li>• Full season round-by-round team stats</li>
                  <li>• Advanced trends & comparisons</li>
                  <li>• AI-driven insights</li>
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
