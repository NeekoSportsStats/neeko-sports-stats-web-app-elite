import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface PipelineData {
  last_run_id: string | null;
  status: string | null;
  label: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  total_tasks: number;
  completed_tasks: number;
  current_step: string | null;
}

export interface PipelineStep {
  step_name: string;
  step_label: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error: string | null;
}

export interface IngestionData {
  games_raw_count: number;
  games_2026_count: number;
  player_stats_count: number;
  player_stats_2026: number;
  last_stat_week: number | null;
  last_game_date: string | null;
  ingest_log_count: number;
  last_ingest_at: string | null;
  ingest_errors: number;
  seasons_covered: number[] | null;
}

export interface AIStats {
  rankings_cache_rows: number;
  rankings_with_ai: number;
  rankings_with_reco: number;
  rankings_cache_refreshed_at: string | null;
  projection_rows: number;
  projection_refreshed_at: string | null;
  command_log_rows: number;
  commands_last_24h: number;
  commands_success_24h: number;
  commands_error_24h: number;
  last_command_at: string | null;
}

export interface DataFreshness {
  unique_players_2026: number;
  unique_players_all: number;
  latest_round: number | null;
  total_stat_rows: number;
  players_in_roster: number;
  players_with_projection: number;
  players_missing_projection: number;
  rankings_cache_age_mins: number | null;
  projection_age_mins: number | null;
}

export interface DbCounts {
  players: number;
  teams: number;
  games_raw: number;
  raw_player_stats: number;
  player_projection: number;
  player_rankings_cache: number;
  pipeline_runs: number;
  pipeline_steps: number;
  command_logs: number;
  mv_edge_board: number;
  projection_accuracy: number;
  start_sit_cache: number;
  afl_2026_roster: number;
}

export interface RecentError {
  id: string;
  command: string;
  status: string;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface SystemHealthData {
  pipeline: PipelineData;
  pipeline_steps: PipelineStep[];
  ingestion: IngestionData;
  ai_stats: AIStats;
  data_freshness: DataFreshness;
  db_counts: DbCounts;
  recent_errors: RecentError[];
  generated_at: string;
}

export interface SystemHealthState {
  data: SystemHealthData | null;
  loading: boolean;
  error: string | null;
  lastRefreshed: Date | null;
}

function ageInMins(ts: string | null | undefined): number | null {
  if (!ts) return null;
  return Math.round((Date.now() - new Date(ts).getTime()) / 60000);
}

function mapResponseToSystemHealth(raw: Record<string, unknown>): SystemHealthData {
  const pipelineState = (raw.pipeline as Record<string, unknown>) ?? {};
  const aiState = (raw.ai as Record<string, unknown>) ?? {};
  const dataState = (raw.data as Record<string, unknown>) ?? {};
  const logsState = (raw.logs as Record<string, unknown>) ?? {};
  const systemState = (raw.system as Record<string, unknown>) ?? {};

  const rankingsCount = (dataState.rankings_count as number) ?? 0;
  const rankingsCachedAt = dataState.rankings_cached_at as string | null ?? null;
  const cacheAgeMins = ageInMins(rankingsCachedAt);

  const aiTotal = (aiState.total_players as number) ?? 0;
  const aiWithReco = (aiState.with_reco as number) ?? 0;
  const aiLastUpdated = aiState.last_updated_at as string | null ?? null;

  const pipelineSteps = (raw.pipeline_steps as PipelineStep[]) ?? [];
  const recentRuns = (raw.recent_runs as Array<Record<string, unknown>>) ?? [];
  const lastRun = recentRuns[0] ?? {};

  const projectionsCount = (dataState.projections_count as number) ?? 0;
  const edgeBoardCount = (dataState.edge_board_count as number) ?? 0;

  const pipelineStatus = pipelineState.status as string | null ?? systemState.pipeline_status as string | null ?? null;
  const pipelineStartedAt = pipelineState.last_run_at as string | null ?? systemState.last_pipeline_run_at as string | null ?? null;
  const pipelineFinishedAt = pipelineState.last_finished_at as string | null ?? null;

  const pipeline: PipelineData = {
    last_run_id: lastRun.id as string | null ?? null,
    status: pipelineStatus,
    label: lastRun.label as string | null ?? null,
    started_at: pipelineStartedAt,
    finished_at: pipelineFinishedAt,
    duration_ms: lastRun.duration_ms as number | null ?? null,
    total_tasks: 0,
    completed_tasks: 0,
    current_step: null,
  };

  const ai_stats: AIStats = {
    rankings_cache_rows: rankingsCount,
    rankings_with_ai: aiTotal,
    rankings_with_reco: aiWithReco,
    rankings_cache_refreshed_at: rankingsCachedAt,
    projection_rows: projectionsCount,
    projection_refreshed_at: null,
    command_log_rows: 0,
    commands_last_24h: 0,
    commands_success_24h: 0,
    commands_error_24h: (logsState.errors_24h as number) ?? 0,
    last_command_at: null,
  };

  const ingestion: IngestionData = {
    games_raw_count: 0,
    games_2026_count: 0,
    player_stats_count: 0,
    player_stats_2026: rankingsCount > 0 ? rankingsCount : 0,
    last_stat_week: null,
    last_game_date: pipelineStartedAt,
    ingest_log_count: (pipelineState.recent_runs_7d as number) ?? (logsState.recent_runs_7d as number) ?? 0,
    last_ingest_at: pipelineStartedAt,
    ingest_errors: (pipelineState.failed_steps_24h as number) ?? 0,
    seasons_covered: null,
  };

  const data_freshness: DataFreshness = {
    unique_players_2026: rankingsCount,
    unique_players_all: rankingsCount,
    latest_round: null,
    total_stat_rows: rankingsCount,
    players_in_roster: rankingsCount,
    players_with_projection: projectionsCount,
    players_missing_projection: Math.max(0, rankingsCount - projectionsCount),
    rankings_cache_age_mins: cacheAgeMins,
    projection_age_mins: null,
  };

  const db_counts: DbCounts = {
    players: rankingsCount,
    teams: 18,
    games_raw: 0,
    raw_player_stats: 0,
    player_projection: projectionsCount,
    player_rankings_cache: rankingsCount,
    pipeline_runs: (pipelineState.recent_runs_7d as number) ?? 0,
    pipeline_steps: pipelineSteps.length,
    command_logs: 0,
    mv_edge_board: edgeBoardCount,
    projection_accuracy: 0,
    start_sit_cache: 0,
    afl_2026_roster: rankingsCount,
  };

  const recent_errors: RecentError[] = [];

  return {
    pipeline,
    pipeline_steps: pipelineSteps,
    ingestion,
    ai_stats,
    data_freshness,
    db_counts,
    recent_errors,
    generated_at: raw.generated_at as string ?? new Date().toISOString(),
  };
}

export function useSystemHealth() {
  const [state, setState] = useState<SystemHealthState>({
    data: null,
    loading: true,
    error: null,
    lastRefreshed: null,
  });
  const hasLoaded = useRef(false);

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setState(prev => ({ ...prev, loading: false, error: "Not authenticated" }));
        return;
      }

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-health`;
      let raw: Record<string, unknown> = {};
      let fetchOk = false;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        });
        raw = await res.json().catch(() => ({}));
        fetchOk = res.ok && !raw.error;
      } catch (fetchErr) {
        console.error("admin-health fetch failed:", fetchErr);
      }

      if (fetchOk && raw && typeof raw === "object" && (raw.data || raw.pipeline || raw.ai)) {
        const mapped = mapResponseToSystemHealth(raw as Record<string, unknown>);
        setState({
          data: mapped,
          loading: false,
          error: null,
          lastRefreshed: new Date(),
        });
        return;
      }

      if (raw.success && raw.data) {
        const d = raw.data as Record<string, unknown>;
        if (d.pipeline || d.ai || d.data) {
          setState({
            data: mapResponseToSystemHealth(d),
            loading: false,
            error: null,
            lastRefreshed: new Date(),
          });
          return;
        }
        setState({
          data: raw.data as SystemHealthData,
          loading: false,
          error: null,
          lastRefreshed: new Date(),
        });
        return;
      }

      const fallbackData = await loadFallbackFromDB(supabase);
      setState({
        data: fallbackData,
        loading: false,
        error: fetchOk ? null : "Health endpoint partial — using live DB counts",
        lastRefreshed: new Date(),
      });
    } catch (err) {
      console.error("useSystemHealth unexpected error:", err);
      try {
        const fallbackData = await loadFallbackFromDB(supabase);
        setState({
          data: fallbackData,
          loading: false,
          error: "Health endpoint failed — using live DB counts",
          lastRefreshed: new Date(),
        });
      } catch {
        setState(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : "Unknown error",
        }));
      }
    }
  }, []);

  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}

async function loadFallbackFromDB(sb: typeof supabase): Promise<SystemHealthData> {
  const [cacheRes, projRes, pipelineRes] = await Promise.allSettled([
    sb.from("player_rankings_cache").select("count", { count: "exact", head: true }),
    sb.from("afl.player_projection" as never).select("count", { count: "exact", head: true }),
    sb.from("pipeline_runs").select("id,status,started_at,finished_at,label").order("started_at", { ascending: false }).limit(1),
  ]);

  const rankingsCount = cacheRes.status === "fulfilled" ? (cacheRes.value.count ?? 0) : 0;
  const projCount = projRes.status === "fulfilled" ? (projRes.value.count ?? 0) : 0;
  const lastRun = pipelineRes.status === "fulfilled" ? (pipelineRes.value.data?.[0] ?? null) : null;

  return {
    pipeline: {
      last_run_id: lastRun?.id ?? null,
      status: lastRun?.status ?? null,
      label: lastRun?.label ?? null,
      started_at: lastRun?.started_at ?? null,
      finished_at: lastRun?.finished_at ?? null,
      duration_ms: null,
      total_tasks: 0,
      completed_tasks: 0,
      current_step: null,
    },
    pipeline_steps: [],
    ingestion: {
      games_raw_count: 0,
      games_2026_count: 0,
      player_stats_count: 0,
      player_stats_2026: rankingsCount > 0 ? rankingsCount : 0,
      last_stat_week: null,
      last_game_date: lastRun?.started_at ?? null,
      ingest_log_count: 0,
      last_ingest_at: lastRun?.started_at ?? null,
      ingest_errors: 0,
      seasons_covered: null,
    },
    ai_stats: {
      rankings_cache_rows: rankingsCount,
      rankings_with_ai: rankingsCount,
      rankings_with_reco: 0,
      rankings_cache_refreshed_at: null,
      projection_rows: projCount,
      projection_refreshed_at: null,
      command_log_rows: 0,
      commands_last_24h: 0,
      commands_success_24h: 0,
      commands_error_24h: 0,
      last_command_at: null,
    },
    data_freshness: {
      unique_players_2026: rankingsCount,
      unique_players_all: rankingsCount,
      latest_round: null,
      total_stat_rows: rankingsCount,
      players_in_roster: rankingsCount,
      players_with_projection: projCount,
      players_missing_projection: Math.max(0, rankingsCount - projCount),
      rankings_cache_age_mins: null,
      projection_age_mins: null,
    },
    db_counts: {
      players: rankingsCount,
      teams: 18,
      games_raw: 0,
      raw_player_stats: 0,
      player_projection: projCount,
      player_rankings_cache: rankingsCount,
      pipeline_runs: 0,
      pipeline_steps: 0,
      command_logs: 0,
      mv_edge_board: 0,
      projection_accuracy: 0,
      start_sit_cache: 0,
      afl_2026_roster: rankingsCount,
    },
    recent_errors: [],
    generated_at: new Date().toISOString(),
  };
}
