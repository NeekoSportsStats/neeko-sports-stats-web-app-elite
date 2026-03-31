import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { AccuracyKpi, RoundRow, PositionRow, PlayerAccuracyRow, TeamAccuracyRow } from "../types";

export type AccuracySubTab = "overview" | "by_player" | "by_team" | "buckets";

export function useAccuracy() {
  const [kpi, setKpi] = useState<AccuracyKpi | null>(null);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [playerRows, setPlayerRows] = useState<PlayerAccuracyRow[]>([]);
  const [teamRows, setTeamRows] = useState<TeamAccuracyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerSearch, setPlayerSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [kpiRes, roundRes, posRes, playerRes, teamRes] = await Promise.allSettled([
      supabase.from("v_projection_accuracy_homepage").select("*").maybeSingle(),
      supabase.from("v_projection_accuracy_by_round").select("round_number,round_label,mean_error,median_error,within_10_pct,within_20_pct,predictions_count").order("round_number", { ascending: false }).limit(24),
      supabase.from("v_projection_accuracy_by_position").select("*").order("mean_absolute_error", { ascending: true }),
      supabase.from("v_player_accuracy_detail").select("*").order("absolute_error", { ascending: false }).limit(300),
      supabase.from("v_team_accuracy_summary").select("*").order("avg_error", { ascending: true }),
    ]);
    if (kpiRes.status === "fulfilled")    setKpi(kpiRes.value.data as AccuracyKpi | null);
    if (roundRes.status === "fulfilled")  setRounds((roundRes.value.data ?? []) as RoundRow[]);
    if (posRes.status === "fulfilled")    setPositions((posRes.value.data ?? []) as PositionRow[]);
    if (playerRes.status === "fulfilled") setPlayerRows((playerRes.value.data ?? []) as PlayerAccuracyRow[]);
    if (teamRes.status === "fulfilled")   setTeamRows((teamRes.value.data ?? []) as TeamAccuracyRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const chartData = useMemo(() =>
    [...rounds].reverse().map(r => ({
      name: r.round_label ?? `R${r.round_number}`,
      mae: +(r.mean_error ?? 0).toFixed(1),
      w10: +(r.within_10_pct ?? 0).toFixed(1),
    })),
    [rounds]
  );

  const scatterData = useMemo(() =>
    playerRows.slice(0, 150).map(r => ({ x: +(r.projection ?? 0), y: +(r.actual_score ?? 0), name: r.player_name })),
    [playerRows]
  );

  const errorBuckets = useMemo(() => {
    const b0_5 = playerRows.filter(r => r.absolute_error <= 5).length;
    const b6_10 = playerRows.filter(r => r.absolute_error > 5 && r.absolute_error <= 10).length;
    const b11_20 = playerRows.filter(r => r.absolute_error > 10 && r.absolute_error <= 20).length;
    const b20plus = playerRows.filter(r => r.absolute_error > 20).length;
    const total = playerRows.length;
    return [
      { label: "0–5 pts",  count: b0_5,   pct: total > 0 ? (b0_5 / total * 100).toFixed(1) : "0", color: "#10b981" },
      { label: "6–10 pts", count: b6_10,  pct: total > 0 ? (b6_10 / total * 100).toFixed(1) : "0", color: "#38bdf8" },
      { label: "11–20 pts",count: b11_20, pct: total > 0 ? (b11_20 / total * 100).toFixed(1) : "0", color: "#f59e0b" },
      { label: "20+ pts",  count: b20plus,pct: total > 0 ? (b20plus / total * 100).toFixed(1) : "0", color: "#ef4444" },
    ];
  }, [playerRows]);

  const confidenceVsAccuracy = useMemo(() => {
    const groups: Record<string, { errors: number[]; count: number }> = {
      LOCK:     { errors: [], count: 0 },
      STRONG:   { errors: [], count: 0 },
      SOLID:    { errors: [], count: 0 },
      RISKY:    { errors: [], count: 0 },
      VOLATILE: { errors: [], count: 0 },
    };
    return [];
  }, [playerRows]);

  const filteredPlayers = useMemo(() =>
    playerSearch
      ? playerRows.filter(r => r.player_name?.toLowerCase().includes(playerSearch.toLowerCase()) || r.team?.toLowerCase().includes(playerSearch.toLowerCase()))
      : playerRows,
    [playerRows, playerSearch]
  );

  const dataWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (playerRows.length === 0) warnings.push("No accuracy data available — predictions may not have been run yet.");
    if (rounds.length === 0) warnings.push("No round-level accuracy data found.");
    const within10 = kpi?.within_10 ?? 0;
    if (within10 > 0 && within10 < 30) warnings.push(`Low accuracy: only ${within10.toFixed(1)}% of predictions within 10pts.`);
    return warnings;
  }, [playerRows, rounds, kpi]);

  return {
    kpi, rounds, positions, playerRows, teamRows,
    loading, fetchData,
    chartData, scatterData, errorBuckets, confidenceVsAccuracy,
    filteredPlayers, playerSearch, setPlayerSearch,
    dataWarnings,
  };
}
