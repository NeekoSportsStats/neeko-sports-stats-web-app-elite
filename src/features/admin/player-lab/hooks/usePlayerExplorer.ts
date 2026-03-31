import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { PlayerRow, PlayerSignals, PlayerEdge, SortDir } from "../types";

const ADMIN_COMMAND_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-command`;

export function usePlayerExplorer() {
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [signalsMap, setSignalsMap] = useState<Map<number, PlayerSignals>>(new Map());
  const [edgeMap, setEdgeMap] = useState<Map<number, PlayerEdge>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("ALL");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [recoFilter, setRecoFilter] = useState("ALL");
  const [quickFilter, setQuickFilter] = useState<"all" | "high_edge" | "high_confidence" | "high_risk" | "signals_3plus">("all");
  const [activeSignalFilters, setActiveSignalFilters] = useState<string[]>([]);
  const [hideOut, setHideOut] = useState(true);
  const [sortCol, setSortCol] = useState<string>("neeko_rating");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [explorerRes, signalsRes, edgeRes] = await Promise.allSettled([
        supabase.from("v_player_lab_explorer").select("*").order("neeko_rating", { ascending: false }).limit(1000),
        supabase.from("v_player_signals_master").select("player_id,signal_tags,signal_count,signal_strength_score").limit(1000),
        supabase.from("v_player_edge_scores").select("player_id,value_edge,matchup_edge,role_edge,form_edge,risk_penalty,edge_total").limit(1000),
      ]);
      if (explorerRes.status === "fulfilled") {
        const explorerData = (explorerRes.value.data as PlayerRow[]) ?? [];
        console.log("Player Lab status sample:", explorerData.slice(0, 5).map(p => ({ name: p.player_name, status: p.status, is_available: p.is_available })));
        setRows(explorerData);
      }
      if (signalsRes.status === "fulfilled") {
        const sMap = new Map<number, PlayerSignals>();
        ((signalsRes.value.data ?? []) as PlayerSignals[]).forEach(s => sMap.set(s.player_id, s));
        setSignalsMap(sMap);
      }
      if (edgeRes.status === "fulfilled") {
        const eMap = new Map<number, PlayerEdge>();
        ((edgeRes.value.data ?? []) as PlayerEdge[]).forEach(e => eMap.set(e.player_id, e));
        setEdgeMap(eMap);
      }
    } catch (err) {
      console.error("Player Lab explorer fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener("neeko:prices-applied", handler);
    return () => window.removeEventListener("neeko:prices-applied", handler);
  }, [fetchData]);

  const positions = useMemo(() => ["ALL", ...Array.from(new Set(rows.map(r => r.position).filter(Boolean))).sort()], [rows]);
  const teams = useMemo(() => ["ALL", ...Array.from(new Set(rows.map(r => r.team).filter(Boolean))).sort()], [rows]);
  const recos = useMemo(() => ["ALL", ...Array.from(new Set(rows.map(r => r.ai_recommendation).filter(Boolean))).sort()], [rows]);

  const filtered = useMemo(() => {
    let res = rows;
    if (hideOut) res = res.filter(r => r.status !== "OUT");
    if (search) res = res.filter(r => r.player_name?.toLowerCase().includes(search.toLowerCase()) || r.team?.toLowerCase().includes(search.toLowerCase()));
    if (posFilter !== "ALL") res = res.filter(r => r.position === posFilter);
    if (teamFilter !== "ALL") res = res.filter(r => r.team === teamFilter);
    if (recoFilter !== "ALL") res = res.filter(r => r.ai_recommendation === recoFilter);
    if (quickFilter === "high_edge")       res = res.filter(r => r.edge_score > 60);
    if (quickFilter === "high_confidence") res = res.filter(r => ["LOCK", "STRONG"].includes(r.confidence_label));
    if (quickFilter === "high_risk")       res = res.filter(r => r.risk_rating > 60);
    if (quickFilter === "signals_3plus")   res = res.filter(r => (signalsMap.get(r.player_id)?.signal_count ?? 0) >= 3);
    if (activeSignalFilters.length > 0) {
      res = res.filter(r => {
        const tags = signalsMap.get(r.player_id)?.signal_tags ?? [];
        return activeSignalFilters.every(f => tags.includes(f));
      });
    }
    return [...res].sort((a, b) => {
      if (sortCol === "signal_count") {
        const av = signalsMap.get(a.player_id)?.signal_count ?? 0;
        const bv = signalsMap.get(b.player_id)?.signal_count ?? 0;
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const av = (a as Record<string, unknown>)[sortCol] as number ?? 0;
      const bv = (b as Record<string, unknown>)[sortCol] as number ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rows, search, posFilter, teamFilter, recoFilter, quickFilter, activeSignalFilters, sortCol, sortDir, signalsMap, hideOut]);

  function handleSort(col: string) {
    if (col === sortCol) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  function toggleExpand(id: number) {
    setExpandedId(prev => prev === id ? null : id);
  }

  function toggleSignalFilter(signal: string) {
    setActiveSignalFilters(prev =>
      prev.includes(signal) ? prev.filter(s => s !== signal) : [...prev, signal]
    );
  }

  function clearSignalFilters() {
    setActiveSignalFilters([]);
  }

  async function updatePlayerStatus(playerId: number, status: string | null): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
    const res = await fetch(ADMIN_COMMAND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ command: "update_player_status", payload: { player_id: playerId, status } }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? "Failed to update player status");
    }
    setRows(prev => prev.map(r =>
      r.player_id === playerId
        ? { ...r, manual_status: status, status: status ?? r.status }
        : r
    ));
  }

  return {
    rows, signalsMap, edgeMap, loading, filtered,
    search, setSearch,
    posFilter, setPosFilter,
    teamFilter, setTeamFilter,
    recoFilter, setRecoFilter,
    quickFilter, setQuickFilter,
    activeSignalFilters, toggleSignalFilter, clearSignalFilters,
    hideOut, setHideOut,
    sortCol, sortDir, handleSort,
    expandedId, toggleExpand,
    positions, teams, recos,
    fetchData,
    updatePlayerStatus,
  };
}
