import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CircleCheck as CheckCircle, Search, Link, TriangleAlert as AlertTriangle, ShieldCheck, ChartBar as BarChart3 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { resolvePlayerName } from "./usePriceIngest";
import { fmtPrice } from "./parseUtils";
import type { PlayerOption } from "./types";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MatchedRow {
  id: string;
  external_name: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  team: string | null;
  price: number | null;
  avg_score: number | null;
  games_played: number | null;
  season: number;
  round_number: number | null;
  ingested_at: string | null;
  player_id: number | null;
  canonical_name: string | null;
  position_group: string | null;
  match_confidence: number;
  match_method: "manual_override" | "exact" | "fuzzy_surname" | "unmatched";
  match_reviewed: boolean;
  is_matched: boolean;
  needs_review: boolean;
}

interface MatchingStats {
  unmatched_count: number;
  low_confidence_count: number;
  verified_maps: number;
  total_maps: number;
}

interface RowState {
  selectedPlayerId: number | null;
  resolving: boolean;
  resolved: boolean;
  resolvedPlayerName: string | null;
  error: string | null;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useMatchedRows() {
  const [rows, setRows] = useState<MatchedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("v_fantasy_player_matched" as never)
        .select("*")
        .order("ingested_at", { ascending: false })
        .limit(300) as unknown as { data: MatchedRow[] | null; error: { message: string } | null };

      if (err) throw new Error(err.message);
      setRows(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { rows, loading, error, refresh: fetch };
}

function useMatchingStats() {
  const [stats, setStats] = useState<MatchingStats | null>(null);

  const fetch = useCallback(async () => {
    const { data } = await supabase.rpc("get_matching_stats") as unknown as { data: MatchingStats | null };
    if (data) setStats(data);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { stats, refresh: fetch };
}

function usePlayerOptions(): PlayerOption[] {
  const [players, setPlayers] = useState<PlayerOption[]>([]);

  useEffect(() => {
    supabase
      .schema("afl" as never)
      .from("players" as never)
      .select("player_id,player_name,position_group")
      .eq("active" as never, true)
      .order("player_name" as never)
      .limit(1000)
      .then(({ data }) => {
        if (data) setPlayers(data as unknown as PlayerOption[]);
      });
  }, []);

  return players;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlayerSearch({
  players,
  value,
  onChange,
}: {
  players: PlayerOption[];
  value: number | null;
  onChange: (id: number | null, name?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected = players.find(p => p.player_id === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return players.slice(0, 20);
    const q = query.toLowerCase();
    return players.filter(p => p.player_name.toLowerCase().includes(q)).slice(0, 30);
  }, [players, query]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleSelect(p: PlayerOption) {
    onChange(p.player_id, p.player_name);
    setQuery(p.player_name);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(null); setOpen(true); }}
          onFocus={() => { setOpen(true); if (selected) setQuery(""); }}
          onBlur={() => {
            setTimeout(() => {
              if (!wrapperRef.current?.contains(document.activeElement)) {
                setOpen(false);
                if (!value) setQuery("");
                else setQuery(selected?.player_name ?? "");
              }
            }, 150);
          }}
          placeholder="Search player…"
          className="w-full pl-7 pr-3 py-1.5 border border-border rounded-md text-xs bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {filtered.map(p => (
            <button
              key={p.player_id}
              onMouseDown={() => handleSelect(p)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60 flex items-center gap-2 transition-colors"
            >
              <span className="font-medium">{p.player_name}</span>
              {p.position_group && (
                <span className="text-[10px] text-muted-foreground">{p.position_group}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ confidence, method }: { confidence: number; method: string }) {
  if (method === "manual_override") {
    return (
      <Badge className="bg-sky-500/15 text-sky-400 border-sky-500/25 text-[10px] gap-1">
        <ShieldCheck className="h-2.5 w-2.5" /> VERIFIED
      </Badge>
    );
  }
  if (confidence >= 1.0) {
    return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 text-[10px]">EXACT</Badge>;
  }
  if (confidence >= 0.6) {
    return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/25 text-[10px]">{Math.round(confidence * 100)}%</Badge>;
  }
  if (confidence > 0) {
    return <Badge className="bg-red-500/15 text-red-400 border-red-500/25 text-[10px]">{Math.round(confidence * 100)}%</Badge>;
  }
  return <Badge className="bg-zinc-500/15 text-zinc-400 border-zinc-500/25 text-[10px]">NO MATCH</Badge>;
}

function StatsBar({ stats }: { stats: MatchingStats | null }) {
  if (!stats) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "Unmatched", value: stats.unmatched_count, color: stats.unmatched_count > 0 ? "text-red-400" : "text-emerald-400" },
        { label: "Low Confidence", value: stats.low_confidence_count, color: stats.low_confidence_count > 0 ? "text-amber-400" : "text-emerald-400" },
        { label: "Verified Maps", value: stats.verified_maps, color: "text-sky-400" },
        { label: "Total Maps", value: stats.total_maps, color: "text-foreground" },
      ].map(s => (
        <div key={s.label} className="rounded-lg border border-border bg-muted/20 px-4 py-3">
          <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function FantasyPlayerMatchingTab() {
  const { rows, loading, error, refresh: refreshRows } = useMatchedRows();
  const { stats, refresh: refreshStats } = useMatchingStats();
  const players = usePlayerOptions();
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [sessionMapped, setSessionMapped] = useState(0);
  const [activeFilter, setActiveFilter] = useState<"all" | "unmatched" | "needs_review" | "verified">("unmatched");

  function getState(id: string): RowState {
    return rowStates[id] ?? {
      selectedPlayerId: null,
      resolving: false,
      resolved: false,
      resolvedPlayerName: null,
      error: null,
    };
  }

  function setRowField<K extends keyof RowState>(id: string, key: K, val: RowState[K]) {
    setRowStates(prev => ({ ...prev, [id]: { ...getState(id), [key]: val } }));
  }

  async function handleMap(row: MatchedRow) {
    const state = getState(row.id);
    if (!state.selectedPlayerId) return;

    setRowField(row.id, "resolving", true);
    setRowField(row.id, "error", null);

    const result = await resolvePlayerName(row.external_name, state.selectedPlayerId);

    if (result.success) {
      setRowField(row.id, "resolved", true);
      setRowField(row.id, "resolving", false);
      setRowField(row.id, "resolvedPlayerName", state.selectedPlayerId
        ? (players.find(p => p.player_id === state.selectedPlayerId)?.player_name ?? null)
        : null
      );
      setSessionMapped(n => n + 1);
      refreshStats();
    } else {
      setRowField(row.id, "resolving", false);
      setRowField(row.id, "error", result.error ?? "Failed");
    }
  }

  function handleRefreshAll() {
    refreshRows();
    refreshStats();
  }

  const filteredRows = useMemo(() => {
    switch (activeFilter) {
      case "unmatched":   return rows.filter(r => !r.is_matched && !getState(r.id).resolved);
      case "needs_review": return rows.filter(r => r.needs_review && !getState(r.id).resolved);
      case "verified":    return rows.filter(r => r.match_method === "manual_override");
      default:            return rows.filter(r => !getState(r.id).resolved);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, activeFilter, rowStates]);

  const unmatchedCount  = rows.filter(r => !r.is_matched && !getState(r.id).resolved).length;
  const needsReviewCount = rows.filter(r => r.needs_review && !getState(r.id).resolved).length;
  const verifiedCount   = rows.filter(r => r.match_method === "manual_override").length;

  const resolvedThisSession = rows.filter(r => getState(r.id).resolved);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">
            Fantasy Player Matching
            {sessionMapped > 0 && (
              <span className="text-emerald-400 ml-2 text-xs">· {sessionMapped} mapped this session</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Review auto-matched names, override with correct player, and save verified mappings.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats bar */}
      <StatsBar stats={stats} />

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-0">
        {(
          [
            { key: "unmatched",    label: "Unmatched",    count: unmatchedCount },
            { key: "needs_review", label: "Needs Review", count: needsReviewCount },
            { key: "verified",     label: "Verified Maps", count: verifiedCount },
            { key: "all",          label: "All",          count: rows.length },
          ] as const
        ).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
              activeFilter === tab.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            <span className={`ml-1.5 rounded px-1 py-0.5 text-[10px] ${
              activeFilter === tab.key ? "bg-foreground/10" : "bg-muted"
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/25 bg-red-950/15 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {/* Empty state */}
      {!loading && filteredRows.length === 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 px-6 py-10 text-center">
          <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-medium">
            {activeFilter === "unmatched" ? "No unmatched players" : "Nothing to show"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {activeFilter === "unmatched"
              ? "All players in the import queue have been matched."
              : "Switch filters above to see other entries."}
          </p>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filteredRows.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-[1.5fr_100px_1fr_1fr_80px_auto] gap-0 border-b border-border/60 bg-muted/20 px-3 py-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Source Name</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Price / Pos</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Auto Match</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Override Player</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Confidence</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-16" />
          </div>

          {filteredRows.map(row => {
            const state = getState(row.id);
            if (state.resolved) return null;

            return (
              <div
                key={row.id}
                className="grid grid-cols-[1.5fr_100px_1fr_1fr_80px_auto] gap-0 items-center border-b border-border/20 last:border-0 px-3 py-2.5 hover:bg-muted/10 transition-colors"
              >
                {/* Source name */}
                <div>
                  <p className="text-xs font-mono font-semibold">{row.external_name}</p>
                  {row.team && (
                    <p className="text-[10px] text-muted-foreground">{row.team}</p>
                  )}
                </div>

                {/* Price + Position */}
                <div>
                  <p className="text-xs tabular-nums font-mono text-muted-foreground">
                    {fmtPrice(row.price)}
                  </p>
                  {row.position && (
                    <p className="text-[10px] text-muted-foreground">{row.position}</p>
                  )}
                </div>

                {/* Auto-matched canonical name */}
                <div>
                  {row.canonical_name ? (
                    <>
                      <p className="text-xs font-medium">{row.canonical_name}</p>
                      {row.position_group && (
                        <p className="text-[10px] text-muted-foreground">{row.position_group}</p>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No match found</span>
                  )}
                </div>

                {/* Manual override search */}
                <div className="pr-3">
                  <PlayerSearch
                    players={players}
                    value={state.selectedPlayerId}
                    onChange={(id, name) => {
                      setRowField(row.id, "selectedPlayerId", id);
                      setRowField(row.id, "resolvedPlayerName", name ?? null);
                    }}
                  />
                  {state.error && (
                    <p className="text-[10px] text-red-400 mt-0.5">{state.error}</p>
                  )}
                </div>

                {/* Confidence */}
                <div>
                  <ConfidenceBadge confidence={row.match_confidence} method={row.match_method} />
                </div>

                {/* Map button */}
                <div className="w-16 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleMap(row)}
                    disabled={!state.selectedPlayerId || state.resolving}
                    className="text-xs h-7 px-3"
                  >
                    {state.resolving ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <><Link className="h-3 w-3 mr-1" />Save</>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Resolved this session */}
      {resolvedThisSession.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Mapped This Session
          </p>
          <div className="space-y-1.5">
            {resolvedThisSession.map(row => {
              const state = getState(row.id);
              return (
                <div
                  key={row.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 bg-emerald-950/15 border border-emerald-900/30 text-xs"
                >
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span className="font-mono text-muted-foreground">{row.external_name}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium text-emerald-400">
                    {state.resolvedPlayerName ?? `Player #${state.selectedPlayerId}`}
                  </span>
                  <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 text-[10px] ml-auto">
                    VERIFIED
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Confidence legend */}
      <div className="rounded-lg border border-border/50 bg-muted/10 px-4 py-3">
        <div className="flex items-center gap-1.5 mb-2">
          <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Confidence Guide</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {[
            { label: "VERIFIED",    cls: "bg-sky-500/15 text-sky-400 border-sky-500/25",      desc: "Manual override saved" },
            { label: "EXACT",       cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", desc: "Full name match" },
            { label: "70%+",        cls: "bg-amber-500/15 text-amber-400 border-amber-500/25", desc: "Surname match (unique)" },
            { label: "50%+",        cls: "bg-amber-500/15 text-amber-400 border-amber-500/25", desc: "Surname match (multiple)" },
            { label: "NO MATCH",    cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",   desc: "Needs manual selection" },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border ${item.cls}`}>
                {item.label}
              </span>
              <span className="text-[10px] text-muted-foreground">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Re-import reminder */}
      {sessionMapped > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-3 text-sm text-amber-300 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {sessionMapped} name{sessionMapped > 1 ? "s" : ""} mapped. Go to the{" "}
            <strong>Fantasy Prices</strong> tab and re-run the import — newly verified names will now resolve automatically.
          </span>
        </div>
      )}
    </div>
  );
}
