import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://www.neekostats.com.au",
  "https://neekostats.com.au",
  "http://localhost:5173",
  "http://localhost:3000",
]);

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://www.neekostats.com.au";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "") ?? "";

    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let isAuthorized = token === serviceKey;

    if (!isAuthorized) {
      const userClient = createClient(supabaseUrl, serviceKey);
      const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
      if (!authErr && user) {
        const { data: profile } = await userClient
          .from("profiles")
          .select("is_admin")
          .eq("id", user.id)
          .maybeSingle();
        isAuthorized = profile?.is_admin === true;
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Single canonical call — all state from one function
    const { data: state, error: stateErr } = await supabase
      .rpc("get_operator_console_state");

    if (stateErr) {
      throw new Error(`get_operator_console_state failed: ${stateErr.message}`);
    }

    // Parallel fetch of all health page tabs
    const [
      stepsRes,
      recentRunsRes,
      logsRes,
      cronRes,
      intelligenceRes,
      signalDistRes,
      confHistRes,
      snapshotBreakdownRes,
    ] = await Promise.allSettled([
      supabase
        .from("v_pipeline_run_detail")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(20),
      supabase
        .from("pipeline_runs")
        .select("id,pipeline_key,label,status,started_at,finished_at,duration_ms")
        .order("started_at", { ascending: false })
        .limit(10),
      supabase
        .from("pipeline_steps")
        .select("id,run_id,step_name,step_label,status,started_at,completed_at,duration_ms,error")
        .order("started_at", { ascending: false })
        .limit(50),
      supabase.rpc("get_cron_health"),
      supabase.rpc("get_intelligence_health"),
      supabase
        .from("v_health_signal_distribution")
        .select("*")
        .order("category")
        .order("signal_type"),
      supabase
        .from("v_health_confidence_histogram")
        .select("*")
        .order("bucket"),
      supabase
        .from("v_health_snapshot_breakdown")
        .select("*")
        .limit(10),
    ]);

    const pipelineRunDetail   = stepsRes.status           === "fulfilled" ? (stepsRes.value.data           ?? []) : [];
    const recentRuns          = recentRunsRes.status      === "fulfilled" ? (recentRunsRes.value.data      ?? []) : [];
    const pipelineSteps       = logsRes.status            === "fulfilled" ? (logsRes.value.data            ?? []) : [];
    const cronHealth          = cronRes.status            === "fulfilled" ? (cronRes.value.data            ?? null) : null;
    const intelligenceHealth  = intelligenceRes.status    === "fulfilled" ? (intelligenceRes.value.data    ?? null) : null;
    const signalDistribution  = signalDistRes.status      === "fulfilled" ? (signalDistRes.value.data      ?? []) : [];
    const confidenceHistogram = confHistRes.status        === "fulfilled" ? (confHistRes.value.data        ?? []) : [];
    const snapshotBreakdown   = snapshotBreakdownRes.status === "fulfilled" ? (snapshotBreakdownRes.value.data ?? []) : [];

    // AI coverage detail
    const { data: aiCoverage } = await supabase
      .from("v_ai_coverage_summary")
      .select("*")
      .maybeSingle();

    // Comprehensive AI health summary (player AI + team AI + cron)
    const { data: aiHealthSummary } = await supabase.rpc("get_ai_health_summary");

    // Canonical current AFL round
    const { data: roundRows } = await supabase
      .rpc("get_current_afl_round_safe", { p_season: 2026 });
    const roundRow = Array.isArray(roundRows) ? roundRows[0] : null;
    const currentRound: number | null = roundRow?.current_round ?? null;

    // Snapshots list
    const { data: snapshots } = await supabase
      .schema("admin" as never)
      .from("snapshots")
      .select("snapshot_id,created_at,validation_status,is_live,rankings_count,ai_coverage_pct,market_watch_ok,confidence_ok,invalidated_reason")
      .order("created_at", { ascending: false })
      .limit(10);

    const response = {
      // Canonical state — single source of truth for all counts
      ...state,

      // Canonical current round
      current_round: currentRound,

      // Pipeline tabs
      pipeline_run_detail: pipelineRunDetail,
      recent_runs: recentRuns,
      pipeline_steps: pipelineSteps,

      // AI / data
      ai_coverage: aiCoverage,
      ai_health_summary: aiHealthSummary ?? null,
      snapshots: snapshots ?? [],
      snapshot_breakdown: snapshotBreakdown,

      // Intelligence layer
      intelligence: intelligenceHealth,
      signal_distribution: signalDistribution,
      confidence_histogram: confidenceHistogram,

      // Cron scheduler
      cron: cronHealth,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[admin-health] error:", err);
    return new Response(
      JSON.stringify({ error: "Request failed", generated_at: new Date().toISOString() }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
