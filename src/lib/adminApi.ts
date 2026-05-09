import { supabase } from "@/lib/supabaseClient";

const BASE = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Session expired. Please sign in again.");
  return token;
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
