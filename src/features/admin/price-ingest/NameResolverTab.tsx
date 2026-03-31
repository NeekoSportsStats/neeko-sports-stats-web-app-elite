import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, CircleCheck as CheckCircle, Search, Link,
  TriangleAlert as AlertTriangle,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { resolvePlayerName } from "./usePriceIngest";
import { fmtPrice } from "./parseUtils";
import type { UnmatchedRow, PlayerOption } from "./types";

function useUnmatched() {
  const [rows, setRows] = useState<UnmatchedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .schema("afl" as never)
        .from("unmatched_player_names" as never)
        .select("id,source_name,normalized_source_name,example_price,resolved,resolved_player_id,created_at")
        .eq("resolved" as never, false)
        .order("created_at", { ascending: false })
        .limit(200) as unknown as { data: UnmatchedRow[] | null; error: { message: string } | null };

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

function usePlayerOptions() {
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

function PlayerSearch({
  players,
  value,
  onChange,
}: {
  players: PlayerOption[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    onChange(p.player_id);
    setQuery(p.player_name);
    setOpen(false);
  }

  function handleFocus() {
    setOpen(true);
    if (selected) setQuery("");
  }

  function handleBlur() {
    setTimeout(() => {
      if (!wrapperRef.current?.contains(document.activeElement)) {
        setOpen(false);
        if (!value) setQuery("");
        else setQuery(selected?.player_name ?? "");
      }
    }, 150);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(null); setOpen(true); }}
          onFocus={handleFocus}
          onBlur={handleBlur}
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

interface RowState {
  selectedPlayerId: number | null;
  resolving: boolean;
  resolved: boolean;
  error: string | null;
}

export function NameResolverTab() {
  const { rows, loading, error, refresh } = useUnmatched();
  const players = usePlayerOptions();
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [globalSuccess, setGlobalSuccess] = useState(0);

  function getState(id: string): RowState {
    return rowStates[id] ?? { selectedPlayerId: null, resolving: false, resolved: false, error: null };
  }

  function setRowField<K extends keyof RowState>(id: string, key: K, val: RowState[K]) {
    setRowStates(prev => ({
      ...prev,
      [id]: { ...getState(id), [key]: val },
    }));
  }

  async function handleMap(row: UnmatchedRow) {
    const state = getState(row.id);
    if (!state.selectedPlayerId) return;

    setRowField(row.id, "resolving", true);
    setRowField(row.id, "error", null);

    const result = await resolvePlayerName(row.normalized_source_name, state.selectedPlayerId);

    if (result.success) {
      setRowField(row.id, "resolved", true);
      setRowField(row.id, "resolving", false);
      setGlobalSuccess(n => n + 1);
    } else {
      setRowField(row.id, "resolving", false);
      setRowField(row.id, "error", result.error ?? "Failed");
    }
  }

  const unresolvedRows = rows.filter(r => !getState(r.id).resolved);
  const resolvedThisSession = rows.filter(r => getState(r.id).resolved);

  return (
    <div className="space-y-5">

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">
            {loading ? "Loading…" : `${unresolvedRows.length} unresolved names`}
            {globalSuccess > 0 && (
              <span className="text-emerald-400 ml-2 text-xs">· {globalSuccess} mapped this session</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Map each abbreviated/variant name to the correct player, then re-run the price import to resolve them.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/25 bg-red-950/15 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {!loading && unresolvedRows.length === 0 && resolvedThisSession.length === 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 px-6 py-10 text-center">
          <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-medium">No unresolved names</p>
          <p className="text-xs text-muted-foreground mt-1">All player names have been matched. Run the price import to use new mappings.</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {unresolvedRows.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-0 border-b border-border/60 bg-muted/20 px-3 py-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Source Name</span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Example Price</span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Map to Player</span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-16 text-right"></span>
              </div>

              {unresolvedRows.map(row => {
                const state = getState(row.id);
                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-[1fr_1fr_1fr_auto] gap-0 items-center border-b border-border/20 last:border-0 px-3 py-2.5 hover:bg-muted/10 transition-colors"
                  >
                    <div>
                      <p className="text-xs font-mono font-semibold">{row.source_name}</p>
                      <p className="text-[10px] text-muted-foreground">{row.normalized_source_name}</p>
                    </div>
                    <div>
                      <span className="text-xs tabular-nums font-mono">
                        {fmtPrice(row.example_price)}
                      </span>
                    </div>
                    <div className="pr-3">
                      <PlayerSearch
                        players={players}
                        value={state.selectedPlayerId}
                        onChange={id => setRowField(row.id, "selectedPlayerId", id)}
                      />
                      {state.error && (
                        <p className="text-[10px] text-red-400 mt-0.5">{state.error}</p>
                      )}
                    </div>
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
                          <><Link className="h-3 w-3 mr-1" />Map</>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {resolvedThisSession.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Mapped This Session</p>
              <div className="space-y-1.5">
                {resolvedThisSession.map(row => {
                  const state = getState(row.id);
                  const player = players.find(p => p.player_id === state.selectedPlayerId);
                  return (
                    <div key={row.id} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-emerald-950/15 border border-emerald-900/30 text-xs">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span className="font-mono text-muted-foreground">{row.source_name}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium text-emerald-400">{player?.player_name ?? `Player #${state.selectedPlayerId}`}</span>
                      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 text-[10px] ml-auto">MAPPED</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {unresolvedRows.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-3 text-sm text-amber-300 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                After mapping names, go back to the <strong>Fantasy Prices</strong> tab and re-run the import. The newly mapped names will now resolve correctly.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
