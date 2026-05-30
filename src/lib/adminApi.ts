import { supabase } from "@/lib/supabaseClient";

const BASE = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

async function callAdminFn(slug: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const token = await getToken();
  const res = await fetch(`${BASE}/functions/v1/${slug}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      apikey: ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${slug} returned ${res.status}: ${text}`);
  }
  return res.json().catch(() => ({}));
}

export async function fetchAdminDashboardData(section: string = "all"): Promise<Record<string, unknown>> {
  return callAdminFn("admin-dashboard-data", { section });
}

export async function callFounderTasks(action: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return callAdminFn("admin-founder-tasks", { action, ...payload });
}

export async function fetchPipelineRuns(): Promise<Record<string, unknown>> {
  return callAdminFn("admin-dashboard-data", { section: "pipeline_runs" });
}

export async function fetchPipelineSteps(runId: string): Promise<Record<string, unknown>> {
  return callAdminFn("admin-dashboard-data", { section: "pipeline_steps", run_id: runId });
}

export async function fetchPostHogAnalytics(section: string = "overview"): Promise<Record<string, unknown>> {
  return callAdminFn("admin-posthog-analytics", { section });
}

export type MarketingInsightsRange = "12h" | "24h" | "3d" | "7d" | "14d" | "30d";
export type AdsInsightsRange = "12h" | "24h" | "3d" | "7d" | "14d" | "30d";

export async function fetchGoogleAdsInsights(range: AdsInsightsRange = "7d"): Promise<Record<string, unknown>> {
  return callAdminFn("google-ads-insights-admin", { range });
}

export async function fetchMarketingInsights(range: MarketingInsightsRange = "7d"): Promise<Record<string, unknown>> {
  if (range === "12h") return callAdminFn("admin-posthog-analytics", { section: "marketing", hours: 12 });
  if (range === "24h") return callAdminFn("admin-posthog-analytics", { section: "marketing", hours: 24 });
  if (range === "3d") return callAdminFn("admin-posthog-analytics", { section: "marketing", days: 3 });
  if (range === "14d") return callAdminFn("admin-posthog-analytics", { section: "marketing", days: 14 });
  if (range === "30d") return callAdminFn("admin-posthog-analytics", { section: "marketing", days: 30 });
  return callAdminFn("admin-posthog-analytics", { section: "marketing", days: 7 });
}
