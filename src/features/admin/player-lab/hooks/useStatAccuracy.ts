import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export type StatAccuracyFilters = {
  season: number;
  week: number | null;
  stat_key: string | null;
  team: string | null;
  player_search: string;
  valid_only: boolean;
  error_direction: "all" | "over" | "under";
};

export type PlayerStatRow = {
  season: number;
  week_number: number;
  round_label: string;
  game_id: number;
  game_date: string;
  player_id: number;
  player_name: string;
  team: string;
  opponent: string;
  stat_key: string;
  stat_label: string;
  projected_value: number | null;
  actual_value: number | null;
  signed_error: number | null;
  absolute_error: number | null;
  accuracy_pct: number | null;
  error_direction: string | null;
  within_1: boolean;
  within_2: boolean;
  within_5_pct: boolean;
  within_10_pct: boolean;
  within_15_pct: boolean;
  within_20_pct: boolean;
  prior_game_count: number;
  snapshot_valid: boolean;
  projection_source: string;
  notes: string | null;
  game_status: string;
};

export type TeamStatRow = {
  season: number;
  week_number: number;
  round_label: string;
  game_id: number;
  game_date: string;
  team: string;
  opponent: string;
  stat_key: string;
  stat_label: string;
  projected_value: number | null;
  actual_value: number | null;
  signed_error: number | null;
  absolute_error: number | null;
  accuracy_pct: number | null;
  error_direction: string | null;
  within_5_pct: boolean;
  within_10_pct: boolean;
  within_15_pct: boolean;
  within_20_pct: boolean;
  prior_game_count: number;
  snapshot_valid: boolean;
  projection_source: string;
};

export type RoundSummaryRow = {
  week_number: number;
  round_label: string;
  total_rows: number;
  valid_rows: number;
  avg_accuracy_pct: number | null;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  within_10_pct_count: number;
  within_20_pct_count: number;
  over_projected: number;
  under_projected: number;
};

export type TypeSummaryRow = {
  stat_key: string;
  stat_label: string;
  scope: string;
  total_rows: number;
  valid_rows: number;
  avg_accuracy_pct: number | null;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  within_10_pct: number | null;
  within_20_pct: number | null;
  over_projected_pct: number | null;
  under_projected_pct: number | null;
};

export type StatAccuracyKPIs = {
  totalRows: number;
  validRows: number;
  avgAccuracyPct: number | null;
  mae: number | null;
  rmse: number | null;
  medianAbsError: number | null;
  bias: number | null;
  within10Pct: number | null;
  within20Pct: number | null;
  overProjectedCount: number;
  underProjectedCount: number;
  playerLeakageWarning: boolean;
  leakedPlayerNames: string[];
};

const PLACEHOLDER_PATTERN = /^Player[^A-Za-z]*\d+/;

function computeKPIs(playerRows: PlayerStatRow[], teamRows: TeamStatRow[]): StatAccuracyKPIs {
  const allRows = [
    ...playerRows.map((r) => ({ ...r, rowType: "player" })),
    ...teamRows.map((r) => ({ ...r, rowType: "team" })),
  ];
  const validRows = allRows.filter((r) => r.snapshot_valid);

  const absErrors = validRows
    .map((r) => r.absolute_error)
    .filter((v): v is number => v != null);

  const mae = absErrors.length > 0 ? absErrors.reduce((a, b) => a + b, 0) / absErrors.length : null;
  const rmse =
    absErrors.length > 0
      ? Math.sqrt(absErrors.reduce((a, b) => a + b * b, 0) / absErrors.length)
      : null;

  const sorted = [...absErrors].sort((a, b) => a - b);
  const median =
    sorted.length > 0
      ? sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)]
      : null;

  const signedErrors = validRows.map((r) => r.signed_error).filter((v): v is number => v != null);
  const bias =
    signedErrors.length > 0 ? signedErrors.reduce((a, b) => a + b, 0) / signedErrors.length : null;

  const accValues = validRows
    .map((r) => r.accuracy_pct)
    .filter((v): v is number => v != null);
  const avgAccuracyPct =
    accValues.length > 0 ? accValues.reduce((a, b) => a + b, 0) / accValues.length : null;

  const within10Count = validRows.filter((r) => r.within_10_pct).length;
  const within20Count = validRows.filter((r) => r.within_20_pct).length;
  const within10Pct = validRows.length > 0 ? (within10Count / validRows.length) * 100 : null;
  const within20Pct = validRows.length > 0 ? (within20Count / validRows.length) * 100 : null;

  const overProjectedCount = validRows.filter((r) => r.error_direction === "over").length;
  const underProjectedCount = validRows.filter((r) => r.error_direction === "under").length;

  const leakedNames = playerRows
    .filter((r) => PLACEHOLDER_PATTERN.test(r.player_name))
    .map((r) => r.player_name)
    .filter((v, i, a) => a.indexOf(v) === i);

  return {
    totalRows: allRows.length,
    validRows: validRows.length,
    avgAccuracyPct,
    mae,
    rmse,
    medianAbsError: median,
    bias,
    within10Pct,
    within20Pct,
    overProjectedCount,
    underProjectedCount,
    playerLeakageWarning: leakedNames.length > 0,
    leakedPlayerNames: leakedNames,
  };
}

const DEFAULT_FILTERS: StatAccuracyFilters = {
  season: 2026,
  week: null,
  stat_key: null,
  team: null,
  player_search: "",
  valid_only: true,
  error_direction: "all",
};

export function useStatAccuracy() {
  const [filters, setFilters] = useState<StatAccuracyFilters>(DEFAULT_FILTERS);
  const [playerRows, setPlayerRows] = useState<PlayerStatRow[]>([]);
  const [teamRows, setTeamRows] = useState<TeamStatRow[]>([]);
  const [roundSummary, setRoundSummary] = useState<RoundSummaryRow[]>([]);
  const [typeSummary, setTypeSummary] = useState<TypeSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingRound, setLoadingRound] = useState(false);
  const [loadingType, setLoadingType] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalPlayerCount, setTotalPlayerCount] = useState(0);
  const [totalTeamCount, setTotalTeamCount] = useState(0);

  const fetchPlayerAndTeam = useCallback(async (f: StatAccuracyFilters) => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, tRes] = await Promise.all([
        supabase.rpc("get_player_stat_accuracy", {
          p_season: f.season,
          p_week: f.week,
          p_stat_key: f.stat_key,
          p_team: f.team,
          p_player_search: f.player_search || null,
          p_valid_only: f.valid_only,
          p_limit: 500,
          p_offset: 0,
        }),
        supabase.rpc("get_team_stat_accuracy", {
          p_season: f.season,
          p_week: f.week,
          p_stat_key: f.stat_key,
          p_team: f.team,
          p_valid_only: f.valid_only,
          p_limit: 500,
          p_offset: 0,
        }),
      ]);

      if (pRes.error) throw new Error(`Player stat accuracy: ${pRes.error.message}`);
      if (tRes.error) throw new Error(`Team stat accuracy: ${tRes.error.message}`);

      const pData = (pRes.data as PlayerStatRow[]) ?? [];
      const tData = (tRes.data as TeamStatRow[]) ?? [];

      const filteredPlayer =
        f.error_direction === "all"
          ? pData
          : pData.filter((r) => r.error_direction === f.error_direction);
      const filteredTeam =
        f.error_direction === "all"
          ? tData
          : tData.filter((r) => r.error_direction === f.error_direction);

      setPlayerRows(filteredPlayer);
      setTeamRows(filteredTeam);
      setTotalPlayerCount(pData.length);
      setTotalTeamCount(tData.length);
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRoundSummary = useCallback(async (season: number) => {
    setLoadingRound(true);
    try {
      const { data, error: rErr } = await supabase.rpc("get_stat_accuracy_round_summary", {
        p_season: season,
      });
      if (rErr) throw new Error(rErr.message);
      setRoundSummary((data as RoundSummaryRow[]) ?? []);
    } catch (e: any) {
      console.error("round summary error:", e.message);
    } finally {
      setLoadingRound(false);
    }
  }, []);

  const fetchTypeSummary = useCallback(async (season: number, scope: string) => {
    setLoadingType(true);
    try {
      const { data, error: tErr } = await supabase.rpc("get_stat_accuracy_type_summary", {
        p_season: season,
        p_scope: scope,
      });
      if (tErr) throw new Error(tErr.message);
      setTypeSummary((data as TypeSummaryRow[]) ?? []);
    } catch (e: any) {
      console.error("type summary error:", e.message);
    } finally {
      setLoadingType(false);
    }
  }, []);

  useEffect(() => {
    fetchPlayerAndTeam(filters);
  }, [filters, fetchPlayerAndTeam]);

  useEffect(() => {
    fetchRoundSummary(filters.season);
  }, [filters.season, fetchRoundSummary]);

  useEffect(() => {
    fetchTypeSummary(filters.season, "all");
  }, [filters.season, fetchTypeSummary]);

  const kpis = useMemo(() => computeKPIs(playerRows, teamRows), [playerRows, teamRows]);

  const updateFilter = useCallback(<K extends keyof StatAccuracyFilters>(
    key: K,
    value: StatAccuracyFilters[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  return {
    filters,
    updateFilter,
    resetFilters,
    playerRows,
    teamRows,
    roundSummary,
    typeSummary,
    kpis,
    loading,
    loadingRound,
    loadingType,
    error,
    totalPlayerCount,
    totalTeamCount,
    refetchTypeSummary: fetchTypeSummary,
  };
}
