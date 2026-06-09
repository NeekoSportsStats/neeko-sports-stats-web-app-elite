import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function timingSafeCompare(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  return crypto.subtle.timingSafeEqual(ab, bb);
}

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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token || !timingSafeCompare(token, serviceRoleKey)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    );

    const { error: checkError } = await supabase.rpc("fn_check_pipeline_alerts");
    if (checkError) {
      console.error("Alert check function error:", checkError.message);
    } else {
      console.log("Alert check function executed successfully");
    }

    const { data: alerts, error: fetchError } = await supabase
      .from("pipeline_alerts")
      .select("id, alert_type, alert_message, severity, created_at")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(50);

    if (fetchError) {
      throw new Error(`Failed to fetch alerts: ${fetchError.message}`);
    }

    const criticalAlerts = (alerts ?? []).filter((a: { severity: string }) => a.severity === "critical");
    const warningAlerts = (alerts ?? []).filter((a: { severity: string }) => a.severity === "warning");

    console.log(`Active alerts — critical: ${criticalAlerts.length}, warning: ${warningAlerts.length}`);

    if (alerts && alerts.length > 0) {
      for (const alert of alerts) {
        console.log(`[${alert.severity.toUpperCase()}] ${alert.alert_type}: ${alert.alert_message}`);
      }

      const webhookUrl = Deno.env.get("PIPELINE_ALERT_WEBHOOK_URL");
      if (webhookUrl) {
        try {
          const payload = {
            service: "Neeko Sports Stats",
            total_alerts: alerts.length,
            critical_count: criticalAlerts.length,
            warning_count: warningAlerts.length,
            alerts: alerts.map((a: { alert_type: string; alert_message: string; severity: string; created_at: string }) => ({
              type: a.alert_type,
              message: a.alert_message,
              severity: a.severity,
              created_at: a.created_at,
            })),
            checked_at: new Date().toISOString(),
          };

          const webhookRes = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!webhookRes.ok) {
            console.error(`Webhook delivery failed: ${webhookRes.status} ${webhookRes.statusText}`);
          } else {
            console.log("Webhook delivered successfully");
          }
        } catch (webhookErr) {
          console.error("Webhook error:", webhookErr);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_active_alerts: (alerts ?? []).length,
        critical: criticalAlerts.length,
        warnings: warningAlerts.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("pipeline-alerts function error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
