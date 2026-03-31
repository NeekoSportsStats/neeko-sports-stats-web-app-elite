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

async function verifyAdmin(req: Request, supabaseUrl: string, serviceKey: string): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "") ?? "";
  if (!token) return false;
  if (token === serviceKey) return true;

  const userClient = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error } = await userClient.auth.getUser(token);
  if (error || !user) return false;

  const { data: profile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.is_admin === true;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const isAdmin = await verifyAdmin(req, supabaseUrl, serviceKey);
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const section = body?.section ?? "all";

    const db = createClient(supabaseUrl, serviceKey);

    const result: Record<string, unknown> = {};

    // ── STATUS (pipeline / health views — may not exist on all envs) ─────────
    if (section === "all" || section === "status") {
      const [statusRes, runsRes] = await Promise.allSettled([
        db.from("v_command_center_status").select("*").maybeSingle(),
        db.from("v_pipeline_run_detail").select("*").order("started_at", { ascending: false }).limit(8),
      ]);
      result.status = statusRes.status === "fulfilled" ? statusRes.value.data : null;
      result.pipeline_runs = runsRes.status === "fulfilled" ? (runsRes.value.data ?? []) : [];
    }

    // ── SUBSCRIPTION METRICS (real data: v_admin_subscription_metrics → profiles) ─
    if (section === "all" || section === "analytics_product") {
      const subRes = await db.from("v_admin_subscription_metrics").select("*").maybeSingle();
      result.subscription_metrics = subRes.data ?? null;
    }

    // ── GROWTH / SIGNUPS (real data: profiles table) ──────────────────────────
    if (section === "all" || section === "analytics_growth") {
      const signupRes = await db.from("v_admin_subscription_metrics").select("*").maybeSingle();
      const revenueRes = await db
        .from("subscriptions")
        .select("id, status, price_id, current_period_end")
        .in("status", ["active", "trialing"]);

      result.signup_metrics = signupRes.data
        ? {
            signups_24h: signupRes.data.signups_24h ?? 0,
            signups_7d: signupRes.data.signups_7d ?? 0,
            signups_30d: signupRes.data.signups_30d ?? 0,
            total_signups: signupRes.data.total_profiles ?? 0,
          }
        : null;

      const activeSubs = revenueRes.data ?? [];
      result.revenue_estimate = {
        active_subs: activeSubs.length,
        trial_subs: activeSubs.filter((s: { status: string }) => s.status === "trialing").length,
        mrr_if_all_monthly: activeSubs.length * 9.99,
        arr_if_all_yearly: activeSubs.length * 99,
      };
    }

    // ── SUBSCRIBERS LIST (full per-user table) ────────────────────────────────
    if (section === "subscribers") {
      const { data: subs } = await db
        .from("v_user_access")
        .select("id, email, subscription_status, is_active, is_canceled, is_manual_premium, billing_period_end, premium_expires_at, manual_premium_expires_at, created_at")
        .order("is_active", { ascending: false })
        .order("billing_period_end", { ascending: false, nullsFirst: false });
      result.subscribers = subs ?? [];
    }

    // ── PIPELINE RUNS ─────────────────────────────────────────────────────────
    if (section === "pipeline_runs") {
      const { data: runs } = await db
        .from("v_pipeline_run_detail")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(50);
      result.pipeline_runs = runs ?? [];
    }

    // ── PIPELINE STEPS ────────────────────────────────────────────────────────
    if (section === "pipeline_steps") {
      const runId = body?.run_id as string | undefined;
      if (runId) {
        const { data: steps } = await db
          .from("pipeline_steps")
          .select("*")
          .eq("run_id", runId)
          .order("started_at", { ascending: true });
        result.pipeline_steps = steps ?? [];
      } else {
        result.pipeline_steps = [];
      }
    }

    // ── HEALTH ────────────────────────────────────────────────────────────────
    if (section === "all" || section === "health") {
      const [pipelineRunsRes, healthRes, aiWorkerRes, cronRes, systemLogsRes] = await Promise.allSettled([
        db.from("v_pipeline_run_detail").select("*").order("started_at", { ascending: false }).limit(20),
        db.from("v_pipeline_health").select("*").maybeSingle(),
        db.from("v_ai_worker_health").select("*").maybeSingle(),
        db.rpc("get_cron_job_status"),
        db.from("system_logs").select("id,log_level,source,event_type,message,created_at").order("created_at", { ascending: false }).limit(50),
      ]);
      result.pipeline_run_detail = pipelineRunsRes.status === "fulfilled" ? (pipelineRunsRes.value.data ?? []) : [];
      result.pipeline_health = healthRes.status === "fulfilled" ? healthRes.value.data : null;
      result.ai_worker_health = aiWorkerRes.status === "fulfilled" ? aiWorkerRes.value.data : null;
      result.cron_jobs = cronRes.status === "fulfilled" ? (cronRes.value.data ?? []) : [];
      result.system_logs = systemLogsRes.status === "fulfilled" ? (systemLogsRes.value.data ?? []) : [];
    }

    // ── COMMAND LOGS ──────────────────────────────────────────────────────────
    if (section === "command_logs") {
      const { data: logs } = await db
        .from("command_logs")
        .select("id,command,status,duration_ms,error,created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      result.command_logs = logs ?? [];
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[admin-dashboard-data] error:", err);
    return new Response(
      JSON.stringify({ error: "Request failed" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
