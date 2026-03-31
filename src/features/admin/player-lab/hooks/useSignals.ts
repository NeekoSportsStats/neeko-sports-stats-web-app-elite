import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { SignalMasterRow, LabPlayerRow } from "../types";
import { SIGNAL_CATEGORY_MAP } from "../constants";

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
        .select("*")
        .gt("signal_count", 0)
        .order("signal_count", { ascending: false })
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
      (r.signal_tags ?? []).forEach(tag => {
        counts[tag] = (counts[tag] ?? 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, count]) => ({ name, count, group: SIGNAL_CATEGORY_MAP[name] ?? "Other" }));
  }, [masterRows]);

  const signalCountHistogram = useMemo(() => {
    const buckets: Record<number, number> = {};
    masterRows.forEach(r => {
      const sc = r.signal_count ?? 0;
      buckets[sc] = (buckets[sc] ?? 0) + 1;
    });
    return Object.entries(buckets)
      .map(([k, v]) => ({ signals: Number(k), players: v }))
      .sort((a, b) => a.signals - b.signals);
  }, [masterRows]);

  const categoryDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    masterRows.forEach(r => {
      (r.signal_tags ?? []).forEach(tag => {
        const grp = SIGNAL_CATEGORY_MAP[tag] ?? "Other";
        counts[grp] = (counts[grp] ?? 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [masterRows]);

  const signalInsights: SignalInsightRow[] = useMemo(() => {
    const map: Record<string, { count: number; projSum: number }> = {};
    masterRows.forEach(r => {
      (r.signal_tags ?? []).forEach(tag => {
        if (!map[tag]) map[tag] = { count: 0, projSum: 0 };
        map[tag].count += 1;
        map[tag].projSum += r.projection ?? 0;
      });
    });
    return Object.entries(map)
      .map(([signal_name, { count, projSum }]) => ({
        signal_name,
        group: SIGNAL_CATEGORY_MAP[signal_name] ?? "Other",
        player_count: count,
        avg_projection: count > 0 ? Math.round(projSum / count) : 0,
      }))
      .sort((a, b) => b.player_count - a.player_count);
  }, [masterRows]);

  const allSignalTypes = useMemo(() => {
    const types = new Set<string>();
    masterRows.forEach(r => (r.signal_tags ?? []).forEach(t => types.add(t)));
    return Array.from(types).sort();
  }, [masterRows]);

  const filteredMaster = useMemo(() => {
    if (activeSignalPills.length === 0) return masterRows;
    return masterRows.filter(r =>
      activeSignalPills.every(pill => (r.signal_tags ?? []).includes(pill))
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
    const noSignals = masterRows.filter(r => (r.signal_count ?? 0) === 0).length;
    if (noSignals > total * 0.5) {
      warnings.push(`${noSignals} of ${total} players have zero signals. Check signal engine.`);
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
