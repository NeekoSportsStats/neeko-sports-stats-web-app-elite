import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import html2canvas from "html2canvas";

// ── Types ────────────────────────────────────────────────────────────────────

interface StatBoardMatch {
  game_id: number;
  week: number;
  label: string;
  game_date: string;
}

interface ThresholdHit {
  hits: number;
  rate: number;
  games: number;
}

interface StatBoardPlayer {
  player_id: number;
  player_name: string;
  team_name: string;
  opponent_team_name: string;
  match_id: number;
  match_label: string;
  is_home: boolean;
  lens: string;
  games_played: number;
  projection: number | null;
  threshold: number | null;
  hit_rate_last_10: number | null;
  season_threshold_hit_rates: Record<string, ThresholdHit> | null;
  season_avg: string | null;
  player_status: string;
  is_locked: boolean;
}

interface RankedRow {
  player_name: string;
  team_name: string;
  opponent_team_name: string;
  lens: string;
  threshold: number;
  hits: number;
  games: number;
  rate: number;
  season_avg: number | null;
  gap: number | null;
  player_status: string;
}

// ── Config ───────────────────────────────────────────────────────────────────

const LENSES = ["disposals", "goals", "marks", "tackles", "kicks", "fantasy"] as const;
type Lens = (typeof LENSES)[number];

const KEY_THRESHOLDS: Record<Lens, number[]> = {
  disposals: [15, 20, 25, 30],
  goals: [1, 2, 3],
  marks: [6, 8],
  tackles: [4, 6],
  kicks: [10, 15],
  fantasy: [80, 100, 120],
};

const LENS_LABELS: Record<Lens, string> = {
  disposals: "Disposals",
  goals: "Goals",
  marks: "Marks",
  tackles: "Tackles",
  kicks: "Kicks",
  fantasy: "Fantasy",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusTag(status: string): { label: string; cls: string } {
  const s = (status ?? "").toLowerCase();
  if (s === "out" || s === "injured") return { label: "OUT", cls: "bg-red-900/60 text-red-300" };
  if (s === "test") return { label: "TEST", cls: "bg-yellow-900/60 text-yellow-300" };
  return { label: "PLAYING", cls: "bg-green-900/60 text-green-300" };
}

function fmtGap(gap: number | null): string {
  if (gap === null) return "";
  const sign = gap >= 0 ? "+" : "";
  return `(${sign}${gap.toFixed(1)})`;
}

function hookOptions(r: RankedRow): [string, string][] {
  const LENS = r.lens.toUpperCase();
  const misses = r.games - r.hits;
  if (r.rate === 100) {
    return [
      [`HE HASN'T MISSED.`, `ONCE.`],
      [`${r.hits} FROM ${r.games}.`, `PERFECT SEASON.`],
      [`100%.`, `ALL ${r.games} GAMES.`],
    ];
  }
  return [
    [`${r.hits} OF HIS LAST ${r.games}.`, `${r.threshold}+ ${LENS}.`],
    [`${r.rate}%.`, `${r.threshold}+ ${LENS}.`],
    [`ONLY ${misses} MISSES.`, `ALL SEASON.`],
  ];
}

// ── PNG card ────────────────────────────────────────────────────────────────

function CardImage({ row, hookIdx }: { row: RankedRow; hookIdx: number }) {
  const LENS = row.lens.toUpperCase();
  const hooks = hookOptions(row);
  const [h1, h2] = hooks[hookIdx % hooks.length];
  return (
    <div
      style={{
        position: "absolute",
        left: "-9999px",
        top: 0,
        width: 1080,
        height: 1920,
        background: "#050505",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontWeight: 800,
        letterSpacing: "-0.02em",
        color: "#FFFFFF",
      }}
    >
      <div style={{ position: "absolute", top: 170, width: 1080, textAlign: "center", fontSize: 72, fontWeight: 800 }}>{h1}</div>
      <div style={{ position: "absolute", top: 262, width: 1080, textAlign: "center", fontSize: 96, fontWeight: 800, color: "#22C55E" }}>{h2}</div>
      <div style={{ position: "absolute", top: 400, width: 1080, textAlign: "center", fontSize: 32, color: "#8A8F96", fontWeight: 600 }}>
        {row.player_name} · {row.team_name} · v {row.opponent_team_name ?? "—"}
      </div>
      {/* Panel */}
      <div style={{ position: "absolute", left: 100, top: 500, width: 880, height: 420, borderRadius: 30, background: "#0D0E11", border: "1px solid #202226" }}>
        <div style={{ position: "absolute", top: 60, width: 880, textAlign: "center", fontSize: 40, color: "#F5C442", fontWeight: 700 }}>
          {row.threshold}+ {LENS}
        </div>
        <div style={{ position: "absolute", top: 140, width: 880, textAlign: "center", fontSize: 130, fontWeight: 800 }}>
          {row.hits}/{row.games}
        </div>
        <div style={{ position: "absolute", top: 310, width: 880, textAlign: "center", fontSize: 56, color: "#22C55E", fontWeight: 700 }}>
          {row.rate}%
        </div>
      </div>
      <div style={{ position: "absolute", top: 1000, width: 1080, textAlign: "center", fontSize: 34, color: "#8A8F96", fontWeight: 600 }}>
        Season average {row.season_avg !== null ? row.season_avg.toFixed(1) : "—"}
      </div>
      {/* CTA pill */}
      <div style={{ position: "absolute", top: 1120, width: 1080, display: "flex", justifyContent: "center" }}>
        <div style={{ background: "#F5C442", borderRadius: 44, padding: "22px 56px", color: "#080808", fontSize: 36, fontWeight: 800 }}>
          FREE ON THE APP STORE
        </div>
      </div>
      <div style={{ position: "absolute", top: 1230, width: 1080, textAlign: "center", fontSize: 26, color: "#565A60", fontWeight: 700 }}>
        NEEKO STATS
      </div>
    </div>
  );
}

function makeBrief(r: RankedRow): string {
  const tag = statusTag(r.player_status).label;
  const opp = r.opponent_team_name ?? "—";
  const avg = r.season_avg !== null ? ` | season avg ${r.season_avg.toFixed(1)} ${fmtGap(r.gap)}` : "";
  return `${r.player_name} | ${r.team_name} v ${opp} | ${r.threshold}+ ${r.lens} | ${r.hits}/${r.games} (${r.rate}%)${avg} | ${tag}`;
}

// ── Tab ───────────────────────────────────────────────────────────────────────

export default function ContentSheet() {
  const [round, setRound] = useState<number | null>(null);
  const [fixtures, setFixtures] = useState<StatBoardMatch[]>([]);
  const [completedCalls, setCompletedCalls] = useState(0);
  const [totalCalls, setTotalCalls] = useState(0);
  const [players, setPlayers] = useState<StatBoardPlayer[]>([]);
  const [loadingFixtures, setLoadingFixtures] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lensFilter, setLensFilter] = useState<Lens | "All">("All");
  const [copyState, setCopyState] = useState<string | null>(null);
  const [pngBusy, setPngBusy] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const cardHostRef = useRef<HTMLDivElement | null>(null);
  const [cardRow, setCardRow] = useState<RankedRow | null>(null);
  const [cardHookIdx, setCardHookIdx] = useState(0);

  // Step 1: resolve current round + fixtures
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: roundData, error: roundErr } = await supabase!.rpc(
          "get_current_afl_round_safe",
          { p_season: 2026 }
        );
        if (roundErr) { setError(roundErr.message); return; }
        const currentRound = roundData?.[0]?.current_round as number | undefined;
        if (!currentRound) { setError("Could not resolve current round"); return; }
        if (cancelled) return;
        setRound(currentRound);

        const { data: matchData, error: matchErr } = await supabase!.rpc(
          "get_stat_board_matches",
          { p_season: 2026, p_round: null }
        );
        if (matchErr) { setError(matchErr.message); return; }
        if (cancelled) return;
        const matches = (matchData ?? []) as StatBoardMatch[];
        const roundMatches = matches.filter((m) => m.week === currentRound);
        setFixtures(roundMatches);
        setLoadingFixtures(false);
      } finally {
        if (!cancelled) setLoadingFixtures(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Step 2: fire 54 calls (9 matches × 6 lenses), render progressively
  useEffect(() => {
    if (fixtures.length === 0) return;
    let cancelled = false;

    const total = fixtures.length * LENSES.length;
    setTotalCalls(total);
    setCompletedCalls(0);
    setPlayers([]);
    setError(null);

    (async () => {
      let done = 0;
      for (const fixture of fixtures) {
        for (const lens of LENSES) {
          if (cancelled) return;
          try {
            const { data, error: err } = await supabase!.rpc("get_stat_board_players", {
              p_season: 2026,
              p_match_id: fixture.game_id,
              p_lens: lens,
              p_limit: 500,
            });
            if (err) {
              setError(err.message);
            } else if (data) {
              const rows = (data as StatBoardPlayer[]).map((p) => ({ ...p, lens }));
              if (!cancelled) {
                setPlayers((prev) => [...prev, ...rows]);
              }
            }
          } catch {
            // per-call failure — continue remaining calls
          } finally {
            done++;
            if (!cancelled) setCompletedCalls(done);
          }
        }
      }
    })();

    return () => { cancelled = true; };
  }, [fixtures]);

  // Rank: one row per player per lens — their best (highest) qualifying threshold
  const rankedRows = useMemo<RankedRow[]>(() => {
    const stories: RankedRow[] = [];
    for (const lens of LENSES) {
      const lensPlayers = players.filter((p) => p.lens === lens);
      const headlines: RankedRow[] = [];
      for (const p of lensPlayers) {
        const sthr = p.season_threshold_hit_rates;
        if (!sthr) continue;
        const seasonAvg = p.season_avg !== null && p.season_avg !== undefined ? parseFloat(p.season_avg) : null;
        // Find the HIGHEST key threshold with rate >= 75% and games >= 10
        let best: { threshold: number; hit: ThresholdHit } | null = null;
        for (const threshold of KEY_THRESHOLDS[lens]) {
          const hit = sthr[String(threshold)];
          if (!hit) continue;
          if (hit.games < 10) continue;   // GUARD: exclude < 10 games
          if (hit.rate < 75) continue;    // must clear 75%
          if (best === null || threshold > best.threshold) {
            best = { threshold, hit };
          }
        }
        if (!best) continue; // no qualifying threshold — player does not appear
        const gap = seasonAvg !== null ? seasonAvg - best.threshold : null;
        headlines.push({
          player_name: p.player_name,
          team_name: p.team_name,
          opponent_team_name: p.opponent_team_name,
          lens,
          threshold: best.threshold,
          hits: best.hit.hits,
          games: best.hit.games,
          rate: best.hit.rate,
          season_avg: seasonAvg,
          gap,
          player_status: p.player_status,
        });
      }
      // Rank: threshold DESC, rate DESC, games DESC; OUT demoted below PLAYING
      headlines.sort((a, b) => {
        const aOut = statusTag(a.player_status).label === "OUT";
        const bOut = statusTag(b.player_status).label === "OUT";
        if (aOut !== bOut) return aOut ? 1 : -1;
        return b.threshold - a.threshold || b.rate - a.rate || b.games - a.games;
      });
      stories.push(...headlines.slice(0, 10));
    }
    return stories;
  }, [players]);

  const visibleRows = useMemo(
    () => (lensFilter === "All" ? rankedRows : rankedRows.filter((r) => r.lens === lensFilter)),
    [rankedRows, lensFilter]
  );

  function copyBrief(r: RankedRow) {
    navigator.clipboard.writeText(makeBrief(r)).then(() => {
      setCopyState(r.player_name + r.threshold);
      setTimeout(() => setCopyState(null), 1500);
    });
  }

  function copyAll() {
    const text = visibleRows.map(makeBrief).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopyState("ALL");
      setTimeout(() => setCopyState(null), 1500);
    });
  }

  // ── PNG export ──────────────────────────────────────────────────────────────

  const renderCardPng = useCallback(async (row: RankedRow, idx: number): Promise<Blob | null> => {
    setCardRow(row);
    setCardHookIdx(idx);
    // wait for DOM paint
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const node = cardHostRef.current?.querySelector("[data-card-root]") as HTMLElement | null;
    if (!node) return null;
    const canvas = await html2canvas(node, {
      width: 1080,
      height: 1920,
      scale: 1,
      backgroundColor: "#050505",
      useCORS: true,
    });
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  }, []);

  function downloadPng(row: RankedRow, hookIdx: number) {
    const key = row.player_name + row.lens + row.threshold;
    setPngBusy(key);
    renderCardPng(row, hookIdx).then((blob) => {
      setPngBusy(null);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${row.player_name.replace(/\s+/g, "_")}_${row.lens}_${row.threshold}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  async function downloadAllVisible() {
    const rows = visibleRows;
    setBulkProgress({ done: 0, total: rows.length });
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      setPngBusy(row.player_name + row.lens + row.threshold);
      const blob = await renderCardPng(row, 0);
      setPngBusy(null);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${row.player_name.replace(/\s+/g, "_")}_${row.lens}_${row.threshold}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      setBulkProgress({ done: i + 1, total: rows.length });
      await new Promise((r) => setTimeout(r, 200)); // throttle downloads
    }
    setBulkProgress(null);
  }

  // Group visible rows by lens for display
  const grouped = useMemo(() => {
    const map = new Map<Lens, RankedRow[]>();
    for (const r of visibleRows) {
      if (!map.has(r.lens as Lens)) map.set(r.lens as Lens, []);
      map.get(r.lens as Lens)!.push(r);
    }
    return map;
  }, [visibleRows]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loadingFixtures) {
    return <div className="py-20 text-center text-xs text-zinc-500">Loading fixtures…</div>;
  }
  if (error) {
    return <div className="py-10 text-center text-xs text-red-400">{error}</div>;
  }
  if (fixtures.length === 0) {
    return <div className="py-10 text-center text-xs text-zinc-500">No fixtures found for round {round}.</div>;
  }

  const allDone = completedCalls >= totalCalls && totalCalls > 0;

  return (
    <div className="space-y-5">
      {/* Progress bar */}
      <div className="flex items-center gap-3 bg-zinc-900 rounded-lg px-4 py-3">
        <div className="text-sm font-semibold text-zinc-200">
          {completedCalls} of {totalCalls}
        </div>
        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-zinc-400 transition-all duration-300"
            style={{ width: `${totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0}%` }}
          />
        </div>
        <div className="text-xs text-zinc-500">
          {allDone ? "Complete" : "Fetching…"}
        </div>
      </div>

      {/* Lens filter + Copy All */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setLensFilter("All")}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            lensFilter === "All"
              ? "bg-zinc-700 text-zinc-100"
              : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
          }`}
        >
          All
        </button>
        {LENSES.map((lens) => (
          <button
            key={lens}
            onClick={() => setLensFilter(lens)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              lensFilter === lens
                ? "bg-zinc-700 text-zinc-100"
                : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {LENS_LABELS[lens]}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {bulkProgress && (
            <span className="text-xs text-zinc-500">
              {bulkProgress.done}/{bulkProgress.total}
            </span>
          )}
          <button
            onClick={copyAll}
            disabled={visibleRows.length === 0 || !!bulkProgress}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-200 transition-colors"
          >
            {copyState === "ALL" ? "Copied!" : "⧉ Copy All"}
          </button>
          <button
            onClick={downloadAllVisible}
            disabled={visibleRows.length === 0 || !!bulkProgress}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-200 transition-colors"
          >
            {bulkProgress ? `↓ ${bulkProgress.done}/${bulkProgress.total}` : "↓ Download All Visible"}
          </button>
        </div>
      </div>

      {/* Rows */}
      {visibleRows.length === 0 && allDone ? (
        <div className="py-10 text-center text-xs text-zinc-500">
          No players with ≥10 games at key thresholds.
        </div>
      ) : (
        <div className="space-y-6">
          {LENSES.filter((l) => lensFilter === "All" || lensFilter === l).map((lens) => {
            const rows = grouped.get(lens);
            if (!rows || rows.length === 0) return null;
            return (
              <div key={lens} className="space-y-2">
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  {LENS_LABELS[lens]}
                </div>
                {rows.map((r, i) => {
                  const tag = statusTag(r.player_status);
                  const copied = copyState === r.player_name + r.threshold;
                  return (
                    <div
                      key={`${lens}-${r.player_name}-${r.threshold}-${i}`}
                      className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-lg px-4 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-200 font-medium truncate">
                          {r.player_name}{" "}
                          <span className="text-zinc-500 font-normal">· {r.team_name} v {r.opponent_team_name ?? "—"}</span>
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          {r.threshold}+ {r.lens}
                        </div>
                        <div className="text-xs text-zinc-300 mt-0.5">
                          {r.hits}/{r.games} · {r.rate}%
                        </div>
                        {r.season_avg !== null && (
                          <div className="text-xs text-zinc-500 mt-0.5">
                            season avg {r.season_avg.toFixed(1)} {fmtGap(r.gap)}
                          </div>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${tag.cls}`}>
                        {tag.label}
                      </span>
                      <button
                        onClick={() => copyBrief(r)}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
                        title="Copy brief"
                      >
                        {copied ? "Copied!" : "⧉"}
                      </button>
                      <button
                        onClick={() => downloadPng(r, 0)}
                        disabled={pngBusy === r.player_name + r.lens + r.threshold}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0 disabled:opacity-30"
                        title="Download PNG card"
                      >
                        {pngBusy === r.player_name + r.lens + r.threshold ? "…" : "↓ PNG"}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Hidden off-screen card host for PNG rendering */}
      <div ref={cardHostRef} aria-hidden style={{ position: "fixed", left: -9999, top: 0, pointerEvents: "none", opacity: 0 }}>
        {cardRow && (
          <div data-card-root>
            <CardImage row={cardRow} hookIdx={cardHookIdx} />
          </div>
        )}
      </div>
    </div>
  );
}
