import { useState, useEffect, useMemo } from "react";
import { toBlob } from "html-to-image";
import { supabase } from "@/lib/supabaseClient";

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
  last_5_avg: string | null;
  last_3_avg: string | null;
  position_group: string | null;
  player_status: string;
  is_locked: boolean;
}

type FormWindow = "L5" | "L3";
type StoryType = "All" | "HitRates" | "Form";

interface FormRow {
  player_name: string;
  team_name: string;
  opponent_team_name: string;
  position: string;
  season_avg: number;
  last_5_avg: number;
  last_3_avg: number;
  games_played: number;
  player_status: string;
  delta: number;
  tag: "HOT" | "COLD";
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

function makeBrief(r: RankedRow): string {
  const tag = statusTag(r.player_status).label;
  const opp = r.opponent_team_name ?? "—";
  const avg = r.season_avg !== null ? ` | season avg ${r.season_avg.toFixed(1)} ${fmtGap(r.gap)}` : "";
  return `${r.player_name} | ${r.team_name} v ${opp} | ${r.threshold}+ ${r.lens} | ${r.hits}/${r.games} (${r.rate}%)${avg} | ${tag}`;
}

function buildHooks(r: RankedRow): [string, string][] {
  const lensUpper = r.lens.toUpperCase();
  const t = r.threshold;
  if (r.rate === 100) {
    return [
      ["HE HASN'T MISSED.", "ONCE."],
      [`${r.hits} FROM ${r.games}.`, `${t}+ ${lensUpper}.`],
      ["PERFECT SEASON.", `${t}+ ${lensUpper}.`],
    ];
  }
  const misses = r.games - r.hits;
  return [
    [`${r.hits} OF HIS LAST ${r.games}.`, `${t}+ ${lensUpper}.`],
    [`${r.rate}%.`, `${t}+ ${lensUpper}.`],
    [`ONLY ${misses} MISSES.`, "ALL SEASON."],
  ];
}

function NeekoCard({ row, hook }: { row: RankedRow; hook: [string, string] }) {
  const accent = row.rate >= 90 ? "#22C55E" : "#F5C442";
  const avg = row.season_avg !== null ? row.season_avg.toFixed(1) : "—";
  const fit = (s: string) => (s.length <= 14 ? 112 : s.length <= 20 ? 88 : 68);
  return (
    <div
      id="neeko-card"
      style={{
        width: 1080,
        height: 1920,
        position: "relative",
        background:
          "radial-gradient(900px 700px at 12% 4%, rgba(28,22,9,0.92) 0%, #050505 62%), #050505",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        letterSpacing: "-0.02em",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 150, width: 1080, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <div style={{ color: "#FFFFFF", fontSize: fit(hook[0]), fontWeight: 800, lineHeight: 1, textAlign: "center" }}>{hook[0]}</div>
        <div style={{ color: accent, fontSize: fit(hook[1]), fontWeight: 800, lineHeight: 1, textAlign: "center" }}>{hook[1]}</div>
      </div>
      <div style={{ position: "absolute", left: 0, top: 450, width: 1080, textAlign: "center", color: "#8A8F96", fontSize: 32 }}>
        {row.player_name} · {row.team_name} · v {row.opponent_team_name}
      </div>

      <div
        style={{
          position: "absolute",
          left: 100,
          top: 540,
          width: 880,
          height: 360,
          borderRadius: 30,
          background: "#0D0E11",
          border: "1px solid #202226",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 50, width: 880, textAlign: "center", color: "#8A8F96", fontSize: 30 }}>HIT RATE</div>
        <div style={{ position: "absolute", left: 0, top: 94, width: 880, textAlign: "center", color: accent, fontSize: 142, fontWeight: 800, lineHeight: 1 }}>
          {row.rate}%
        </div>
        <div style={{ position: "absolute", left: 0, top: 260, width: 880, textAlign: "center", color: "#8A8F96", fontSize: 32 }}>
          {row.hits} games from {row.games} this season
        </div>
      </div>

      <div style={{ position: "absolute", left: 0, top: 960, width: 1080, textAlign: "center", color: "#565A60", fontSize: 32 }}>
        Season average {avg}
      </div>

      <div style={{ position: "absolute", left: 0, top: 1070, width: 1080, textAlign: "center" }}>
        <span
          style={{
            display: "inline-block",
            background: "#F5C442",
            borderRadius: 44,
            padding: "22px 56px",
            color: "#080808",
            fontSize: 36,
            fontWeight: 800,
          }}
        >
          FREE ON THE APP STORE
        </span>
      </div>

      <div style={{ position: "absolute", left: 0, top: 1180, width: 1080, textAlign: "center", color: "#565A60", fontSize: 26 }}>
        NEEKO STATS
      </div>
    </div>
  );
}

function buildFormHooks(r: FormRow): [string, string][] {
  const surname = (r.player_name.split(" ").pop() ?? r.player_name).toUpperCase();
  if (r.tag === "COLD") {
    return [
      ["CHECK YOUR TEAM.", "HE'S COOKED."],
      ["THE BIGGEST FALL", "IN THE GAME."],
      [`${surname} IS`, "IN FREEFALL."],
    ];
  }
  return [
    ["NOBODY'S TALKING", "ABOUT THIS."],
    ["THE BIGGEST RISER", "IN THE GAME."],
    ["HE'S FOUND", "SOMETHING."],
  ];
}

function FormCard({ row, formWindow, hook }: { row: FormRow; formWindow: FormWindow; hook: [string, string] }) {
  const accent = row.delta < 0 ? "#EF4444" : "#22C55E";
  const deltaStr = (row.delta >= 0 ? "+" : "") + row.delta.toFixed(1);
  const lastLabel = formWindow === "L3" ? "LAST 3" : "LAST 5";
  const lastVal = formWindow === "L3" ? row.last_3_avg.toFixed(1) : row.last_5_avg.toFixed(1);
  const fit = (s: string) => (s.length <= 14 ? 112 : s.length <= 20 ? 88 : 68);
  return (
    <div
      id="neeko-card"
      style={{
        width: 1080,
        height: 1920,
        position: "relative",
        background:
          "radial-gradient(900px 700px at 12% 4%, rgba(28,22,9,0.92) 0%, #050505 62%), #050505",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        letterSpacing: "-0.02em",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 150, width: 1080, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <div style={{ color: "#FFFFFF", fontSize: fit(hook[0]), fontWeight: 800, lineHeight: 1, textAlign: "center" }}>{hook[0]}</div>
        <div style={{ color: accent, fontSize: fit(hook[1]), fontWeight: 800, lineHeight: 1, textAlign: "center" }}>{hook[1]}</div>
      </div>
      <div style={{ position: "absolute", left: 0, top: 400, width: 1080, textAlign: "center", color: "#8A8F96", fontSize: 32 }}>
        {row.player_name} · {row.team_name} · {row.position}
      </div>

      <div
        style={{
          position: "absolute",
          left: 100,
          top: 480,
          width: 880,
          height: 440,
          borderRadius: 30,
          background: "#0D0E11",
          border: "1px solid #202226",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 40, width: 880, textAlign: "center", color: "#8A8F96", fontSize: 30 }}>SEASON</div>
        <div style={{ position: "absolute", left: 0, top: 80, width: 880, textAlign: "center", color: "#FFFFFF", fontSize: 118, fontWeight: 800, lineHeight: 1 }}>
          {row.season_avg.toFixed(1)}
        </div>
        <div style={{ position: "absolute", left: 0, top: 230, width: 880, textAlign: "center", color: "#8A8F96", fontSize: 30 }}>{lastLabel}</div>
        <div style={{ position: "absolute", left: 0, top: 270, width: 880, textAlign: "center", color: accent, fontSize: 118, fontWeight: 800, lineHeight: 1 }}>
          {lastVal}
        </div>
      </div>

      <div style={{ position: "absolute", left: 0, top: 970, width: 1080, textAlign: "center", color: accent, fontSize: 96, fontWeight: 800, lineHeight: 1 }}>
        {deltaStr}
      </div>

      <div style={{ position: "absolute", left: 0, top: 1120, width: 1080, textAlign: "center" }}>
        <span
          style={{
            display: "inline-block",
            background: "#F5C442",
            borderRadius: 44,
            padding: "22px 56px",
            color: "#080808",
            fontSize: 36,
            fontWeight: 800,
          }}
        >
          SEE ALL 477 FREE
        </span>
      </div>

      <div style={{ position: "absolute", left: 0, top: 1230, width: 1080, textAlign: "center", color: "#565A60", fontSize: 26 }}>
        NEEKO STATS
      </div>
    </div>
  );
}

function FormCardModal({ row, formWindow, onClose }: { row: FormRow; formWindow: FormWindow; onClose: () => void }) {
  const hooks = useMemo(() => buildFormHooks(row), [row]);
  const [hookIdx, setHookIdx] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const hook = hooks[hookIdx];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleDownload() {
    const node = document.getElementById("neeko-card");
    if (!node) return;
    setDownloading(true);
    try {
      const blob = await toBlob(node, {
        width: 1080,
        height: 1920,
        pixelRatio: 1,
        backgroundColor: "#050505",
        style: { transform: "scale(1)", transformOrigin: "top left" },
      });
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = `${row.player_name}_form_${formWindow}.png`.replace(/\s+/g, "_");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div onClick={(e) => e.stopPropagation()} className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Hook</label>
          <select
            value={hookIdx}
            onChange={(e) => setHookIdx(Number(e.target.value))}
            className="flex-1 bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          >
            {hooks.map((h, i) => (
              <option key={i} value={i}>
                {h[0]} {h[1]}
              </option>
            ))}
          </select>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 text-lg leading-none">
            ✕
          </button>
        </div>

        <div style={{ width: 346, height: 615, overflow: "hidden", borderRadius: 12 }}>
          <div style={{ transform: "scale(0.32)", transformOrigin: "top left" }}>
            <FormCard row={row} formWindow={formWindow} hook={hook} />
          </div>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-semibold rounded-lg transition-colors"
        >
          {downloading ? "Rendering…" : "Download PNG"}
        </button>
      </div>
    </div>
  );
}

function CardModal({ row, onClose }: { row: RankedRow; onClose: () => void }) {
  const hooks = useMemo(() => buildHooks(row), [row]);
  const [hookIdx, setHookIdx] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const hook = hooks[hookIdx];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleDownload() {
    const node = document.getElementById("neeko-card");
    if (!node) return;
    setDownloading(true);
    try {
      const blob = await toBlob(node, {
        width: 1080,
        height: 1920,
        pixelRatio: 1,
        backgroundColor: "#050505",
        style: { transform: "scale(1)", transformOrigin: "top left" },
      });
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = `${row.player_name}_${row.lens}_${row.threshold}.png`.replace(/\s+/g, "_");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div onClick={(e) => e.stopPropagation()} className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Hook</label>
          <select
            value={hookIdx}
            onChange={(e) => setHookIdx(Number(e.target.value))}
            className="flex-1 bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          >
            {hooks.map((h, i) => (
              <option key={i} value={i}>
                {h[0]} {h[1]}
              </option>
            ))}
          </select>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 text-lg leading-none">
            ✕
          </button>
        </div>

        <div style={{ width: 346, height: 615, overflow: "hidden", borderRadius: 12 }}>
          <div style={{ transform: "scale(0.32)", transformOrigin: "top left" }}>
            <NeekoCard row={row} hook={hook} />
          </div>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-semibold rounded-lg transition-colors"
        >
          {downloading ? "Rendering…" : "Download PNG"}
        </button>
      </div>
    </div>
  );
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
  const [storyType, setStoryType] = useState<StoryType>("All");
  const [lensFilter, setLensFilter] = useState<Lens | "All">("All");
  const [formWindow, setFormWindow] = useState<FormWindow>("L5");
  const [hideOut, setHideOut] = useState(false);
  const [copyState, setCopyState] = useState<string | null>(null);
  const [cardRow, setCardRow] = useState<RankedRow | null>(null);
  const [formCardRow, setFormCardRow] = useState<FormRow | null>(null);

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

  const formRows = useMemo<FormRow[]>(() => {
    const byPlayer = new Map<string, StatBoardPlayer>();
    for (const p of players) {
      if (p.lens !== "fantasy") continue;
      if (byPlayer.has(p.player_name)) continue;
      byPlayer.set(p.player_name, p);
    }
    const out: FormRow[] = [];
    for (const p of byPlayer.values()) {
      if (p.games_played < 10) continue;
      const sa = Number(p.season_avg);
      const l5 = Number(p.last_5_avg);
      const l3 = Number(p.last_3_avg);
      if (!isFinite(sa) || !isFinite(l5) || !isFinite(l3)) continue;
      const deltaL5 = l5 - sa;
      const deltaL3 = l3 - sa;
      const delta = formWindow === "L3" ? deltaL3 : deltaL5;
      if (Math.abs(delta) < 12) continue;
      out.push({
        player_name: p.player_name,
        team_name: p.team_name,
        opponent_team_name: p.opponent_team_name,
        position: (p.position_group ?? "").toUpperCase(),
        season_avg: sa,
        last_5_avg: l5,
        last_3_avg: l3,
        games_played: p.games_played,
        player_status: p.player_status,
        delta,
        tag: delta > 0 ? "HOT" : "COLD",
      });
    }
    out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return out.slice(0, 15);
  }, [players, formWindow]);

  const visibleRows = useMemo(
    () => (lensFilter === "All" ? rankedRows : rankedRows.filter((r) => r.lens === lensFilter)),
    [rankedRows, lensFilter]
  );

  const hideOutFilter = <T extends { player_status: string }>(rows: T[]): T[] =>
    hideOut ? rows.filter((r) => (r.player_status ?? "").toLowerCase() === "active") : rows;

  const visibleHitRateRows = hideOutFilter(visibleRows);
  const visibleFormRows = hideOutFilter(formRows);

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

      {/* Filter bar — STORY / LENS / WINDOW + Hide OUT */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mr-1">Story</span>
          {(["All", "HitRates", "Form"] as StoryType[]).map((s) => (
            <button
              key={s}
              onClick={() => setStoryType(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                storyType === s
                  ? "bg-zinc-700 text-zinc-100"
                  : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {s === "HitRates" ? "Hit Rates" : s}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-xs text-zinc-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideOut}
              onChange={(e) => setHideOut(e.target.checked)}
              className="accent-zinc-500"
            />
            Hide OUT
          </label>
        </div>

        {storyType !== "Form" && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mr-1">Lens</span>
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
            <button
              onClick={copyAll}
              disabled={visibleHitRateRows.length === 0}
              className="ml-auto px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-200 transition-colors"
            >
              {copyState === "ALL" ? "Copied!" : "⧉ Copy All"}
            </button>
          </div>
        )}

        {storyType === "Form" && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mr-1">Window</span>
            {(["L5", "L3"] as FormWindow[]).map((w) => (
              <button
                key={w}
                onClick={() => setFormWindow(w)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  formWindow === w
                    ? "bg-zinc-700 text-zinc-100"
                    : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Rows */}
      {storyType === "Form" ? (
        visibleFormRows.length === 0 ? (
          <div className="py-10 text-center text-xs text-zinc-500">
            No form movers with ≥10 games and |Δ| ≥ 12 {formWindow}.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
              Form · {formWindow} (top {visibleFormRows.length})
            </div>
            {visibleFormRows.map((r, i) => {
              const status = statusTag(r.player_status);
              const copied = copyState === r.player_name + "form" + i;
              const lastVal = formWindow === "L3" ? r.last_3_avg.toFixed(1) : r.last_5_avg.toFixed(1);
              const lastLbl = formWindow === "L3" ? "L3" : "L5";
              const deltaStr = (r.delta >= 0 ? "+" : "") + r.delta.toFixed(1);
              const tagCls = r.tag === "HOT" ? "bg-green-900/60 text-green-300" : "bg-red-900/60 text-red-300";
              return (
                <div
                  key={`form-${r.player_name}-${i}`}
                  className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-lg px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 font-medium truncate">
                      {r.player_name}{" "}
                      <span className="text-zinc-500 font-normal">· {r.team_name} v {r.opponent_team_name ?? "—"}</span>
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      season {r.season_avg.toFixed(1)} → {lastLbl} {lastVal}
                    </div>
                    <div className="text-xs text-zinc-300 mt-0.5">
                      {deltaStr}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${tagCls}`}>
                    {r.tag}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${status.cls}`}>
                    {status.label}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${r.player_name} | ${r.team_name} v ${r.opponent_team_name ?? "—"} | season ${r.season_avg.toFixed(1)} → ${lastLbl} ${lastVal} | ${deltaStr} | ${r.tag} | ${status.label}`
                      ).then(() => {
                        setCopyState(r.player_name + "form" + i);
                        setTimeout(() => setCopyState(null), 1500);
                      });
                    }}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
                    title="Copy brief"
                  >
                    {copied ? "Copied!" : "⧉"}
                  </button>
                  <button
                    onClick={() => setFormCardRow(r)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
                    title="Export PNG"
                  >
                    PNG
                  </button>
                </div>
              );
            })}
          </div>
        )
      ) : visibleHitRateRows.length === 0 && allDone ? (
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
                        onClick={() => setCardRow(r)}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
                        title="Export PNG"
                      >
                        PNG
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {cardRow && <CardModal row={cardRow} onClose={() => setCardRow(null)} />}
      {formCardRow && (
        <FormCardModal row={formCardRow} formWindow={formWindow} onClose={() => setFormCardRow(null)} />
      )}
    </div>
  );
}
