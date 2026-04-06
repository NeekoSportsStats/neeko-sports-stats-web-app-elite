import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { SignalMasterRow, LabPlayerRow } from "../types";

export type SignalCategory = "master" | "best_buys" | "breakout" | "high_upside" | "risky_traps" | "safe_picks";

export interface SignalInsightRow {
  signal_name: string;
  group: string;
  player_count: number;
  avg_projection: number;
}

export function useSignals() {
  const [masterRows, setMasterRows] = useState<SignalMasterRow[]>([]);
  const [labRows, setLabRows] = useState<LabPlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<SignalCategory>("master");
  const [activeSignalPills, setActiveSignalPills] = useState<string[]>([]);

  const fetchData = useCallback(async (cat: SignalCategory) => {
    setLoading(true);
    if (cat === "master") {
      const { data, error } = await supabase
        .from("v_player_signals_master")
        .select("player_id,player_name,team,position,price,projection_final,status,is_available,signal,value_score,edge,form_score,consistency,breakeven,market_watch_category,recommendation_color,cached_at")
        .not("signal", "is", null)
        .order("edge", { ascending: false })
        .limit(300);
      console.log("Signals master:", data?.length, "rows | error:", error);
      setMasterRows((data as SignalMasterRow[]) ?? []);
    } else {
      const viewMap: Record<Exclude<SignalCategory, "master">, string> = {
        best_buys:   "v_player_lab_best_buys",
        breakout:    "v_player_lab_breakout",
        high_upside: "v_player_lab_high_upside",
        risky_traps: "v_player_lab_risky_traps",
        safe_picks:  "v_player_lab_safe_picks",
      };
      const viewName = viewMap[cat as Exclude<SignalCategory, "master">];
      const { data, error } = await supabase
        .from(viewName)
        .select("*")
        .order("total_score", { ascending: false })
        .limit(50);
      console.log(`Signals [${cat}]:`, data?.length, "rows | error:", error);
      setLabRows((data as LabPlayerRow[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(category); }, [category, fetchData]);

  const signalDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    masterRows.forEach(r => {
      const sig = r.signal ?? "UNKNOWN";
      counts[sig] = (counts[sig] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, count]) => ({ name, count, group: name }));
  }, [masterRows]);

  const signalCountHistogram = useMemo(() => {
    const buckets: Record<string, number> = {};
    masterRows.forEach(r => {
      const cat = r.market_watch_category ?? "Unknown";
      buckets[cat] = (buckets[cat] ?? 0) + 1;
    });
    return Object.entries(buckets)
      .map(([k, v]) => ({ signals: k, players: v }))
      .sort((a, b) => b.players - a.players);
  }, [masterRows]);

  const categoryDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    masterRows.forEach(r => {
      const grp = r.market_watch_category ?? "Unknown";
      counts[grp] = (counts[grp] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [masterRows]);

  const signalInsights: SignalInsightRow[] = useMemo(() => {
    const map: Record<string, { count: number; projSum: number }> = {};
    masterRows.forEach(r => {
      const sig = r.signal ?? "UNKNOWN";
      if (!map[sig]) map[sig] = { count: 0, projSum: 0 };
      map[sig].count += 1;
      map[sig].projSum += r.projection_final ?? r.projection ?? 0;
    });
    return Object.entries(map)
      .map(([signal_name, { count, projSum }]) => ({
        signal_name,
        group: signal_name,
        player_count: count,
        avg_projection: count > 0 ? Math.round(projSum / count) : 0,
      }))
      .sort((a, b) => b.player_count - a.player_count);
  }, [masterRows]);

  const allSignalTypes = useMemo(() => {
    const types = new Set<string>();
    masterRows.forEach(r => { if (r.signal) types.add(r.signal); });
    return Array.from(types).sort();
  }, [masterRows]);

  const filteredMaster = useMemo(() => {
    if (activeSignalPills.length === 0) return masterRows;
    return masterRows.filter(r =>
      activeSignalPills.every(pill => r.signal === pill || r.market_watch_category === pill)
    );
  }, [masterRows, activeSignalPills]);

  const dataWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (masterRows.length === 0) return warnings;
    const total = masterRows.length;
    const top = signalDistribution[0];
    if (top && top.count / total > 0.8) {
      warnings.push(`Signal "${top.name}" is dominant (${top.count}/${total} players). Distribution may be skewed.`);
    }
    const noSignal = masterRows.filter(r => !r.signal).length;
    if (noSignal > total * 0.5) {
      warnings.push(`${noSignal} of ${total} players have no signal. Check signal engine.`);
    }
    return warnings;
  }, [masterRows, signalDistribution]);

  function togglePill(signal: string) {
    setActiveSignalPills(prev =>
      prev.includes(signal) ? prev.filter(s => s !== signal) : [...prev, signal]
    );
  }

  function clearPills() {
    setActiveSignalPills([]);
  }

  return {
    masterRows, labRows, loading, category, setCategory,
    activeSignalPills, togglePill, clearPills,
    allSignalTypes, filteredMaster,
    signalDistribution, signalCountHistogram, categoryDistribution,
    signalInsights, dataWarnings,
    fetchData,
  };
}
