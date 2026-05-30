import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Admin verification (mirrors admin-posthog-analytics pattern) ─────────────

async function verifyAdmin(req: Request, supabaseUrl: string, serviceKey: string): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "") ?? "";
  if (!token) return false;
  if (token === serviceKey) return true;

  const client = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return false;

  const { data: profile } = await client
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.is_admin === true;
}

// ─── Date range helpers ────────────────────────────────────────────────────────

type Range = "12h" | "24h" | "3d" | "7d" | "14d" | "30d";

function rangeToDateRange(range: Range): { startDate: string; endDate: string } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  let start: Date;
  if (range === "12h" || range === "24h") {
    // For sub-day ranges, Google Ads GAQL DATE segments are day-granularity.
    // Use today and yesterday to cover the window.
    start = new Date(now);
    start.setDate(start.getDate() - 1);
  } else if (range === "3d") {
    start = new Date(now);
    start.setDate(start.getDate() - 2);
  } else if (range === "7d") {
    start = new Date(now);
    start.setDate(start.getDate() - 6);
  } else if (range === "14d") {
    start = new Date(now);
    start.setDate(start.getDate() - 13);
  } else {
    start = new Date(now);
    start.setDate(start.getDate() - 29);
  }

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

// ─── Google Ads API client ─────────────────────────────────────────────────────

interface GoogleAdsConfig {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
  loginCustomerId?: string;
  apiVersion: string;
}

async function getAccessToken(cfg: GoogleAdsConfig): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OAuth token refresh failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

async function gaqlQuery(
  cfg: GoogleAdsConfig,
  accessToken: string,
  query: string
): Promise<unknown[]> {
  const cid = cfg.customerId.replace(/-/g, "");
  const url = `https://googleads.googleapis.com/${cfg.apiVersion}/customers/${cid}/googleAds:searchStream`;

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${accessToken}`,
    "developer-token": cfg.developerToken,
    "Content-Type": "application/json",
  };
  if (cfg.loginCustomerId) {
    headers["login-customer-id"] = cfg.loginCustomerId.replace(/-/g, "");
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Ads API error (${res.status}): ${text.slice(0, 400)}`);
  }

  // searchStream returns NDJSON — one JSON object per line
  const text = await res.text();
  const rows: unknown[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "[" || trimmed === "]") continue;
    try {
      const parsed = JSON.parse(trimmed.replace(/,$/, ""));
      const batch = parsed.results ?? parsed;
      if (Array.isArray(batch)) rows.push(...batch);
    } catch {
      // skip unparseable lines
    }
  }
  return rows;
}

// ─── Micro-to-dollar helper ────────────────────────────────────────────────────

function micros(v: unknown): number {
  const n = Number(v ?? 0);
  return isNaN(n) ? 0 : n / 1_000_000;
}

function fmtCost(v: unknown): number {
  return parseFloat(micros(v).toFixed(2));
}

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return isNaN(x) ? 0 : x;
}

function pct(v: unknown): string {
  const x = n(v);
  return `${(x * 100).toFixed(2)}%`;
}

// ─── Report builders ───────────────────────────────────────────────────────────

async function fetchAccountSummary(cfg: GoogleAdsConfig, token: string, start: string, end: string) {
  const query = `
    SELECT
      customer.currency_code,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.conversions_value,
      metrics.cost_per_conversion
    FROM customer
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `;
  const rows = await gaqlQuery(cfg, token, query);

  let impressions = 0, clicks = 0, costMicros = 0, conversions = 0, convValue = 0;
  let currency = "AUD";

  for (const row of rows as Record<string, unknown>[]) {
    const m = (row.metrics ?? {}) as Record<string, unknown>;
    const c = (row.customer ?? {}) as Record<string, unknown>;
    impressions += n(m.impressions);
    clicks += n(m.clicks);
    costMicros += n(m.cost_micros);
    conversions += n(m.conversions);
    convValue += n(m.conversions_value);
    if (c.currency_code) currency = String(c.currency_code);
  }

  const cost = fmtCost(costMicros);
  const ctr = clicks > 0 ? pct(clicks / impressions) : "0.00%";
  const avgCpc = clicks > 0 ? fmtCost(costMicros / clicks) : 0;
  const cpa = conversions > 0 ? fmtCost(costMicros / conversions) : null;
  const convRate = clicks > 0 ? pct(conversions / clicks) : "0.00%";

  return { impressions, clicks, cost, ctr, avg_cpc: avgCpc, conversions, conv_value: parseFloat(convValue.toFixed(2)), cpa, conv_rate: convRate, currency };
}

async function fetchCampaigns(cfg: GoogleAdsConfig, token: string, start: string, end: string) {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_per_conversion
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT 25
  `;
  const rows = await gaqlQuery(cfg, token, query);

  return (rows as Record<string, unknown>[]).map((row) => {
    const m = (row.metrics ?? {}) as Record<string, unknown>;
    const c = (row.campaign ?? {}) as Record<string, unknown>;
    return {
      id: String(c.id ?? ""),
      name: String(c.name ?? "—"),
      status: String(c.status ?? "—"),
      impressions: n(m.impressions),
      clicks: n(m.clicks),
      cost: fmtCost(m.cost_micros),
      ctr: pct(m.ctr),
      avg_cpc: fmtCost(m.average_cpc),
      conversions: n(m.conversions),
      cpa: n(m.conversions) > 0 ? fmtCost(n(m.cost_micros) / n(m.conversions)) : null,
    };
  });
}

async function fetchAdGroups(cfg: GoogleAdsConfig, token: string, start: string, end: string) {
  const query = `
    SELECT
      ad_group.id,
      ad_group.name,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions
    FROM ad_group
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT 25
  `;
  const rows = await gaqlQuery(cfg, token, query);

  return (rows as Record<string, unknown>[]).map((row) => {
    const m = (row.metrics ?? {}) as Record<string, unknown>;
    const ag = (row.ad_group ?? {}) as Record<string, unknown>;
    const camp = (row.campaign ?? {}) as Record<string, unknown>;
    return {
      id: String(ag.id ?? ""),
      name: String(ag.name ?? "—"),
      campaign: String(camp.name ?? "—"),
      impressions: n(m.impressions),
      clicks: n(m.clicks),
      cost: fmtCost(m.cost_micros),
      ctr: pct(m.ctr),
      avg_cpc: fmtCost(m.average_cpc),
      conversions: n(m.conversions),
    };
  });
}

async function fetchKeywords(cfg: GoogleAdsConfig, token: string, start: string, end: string) {
  const query = `
    SELECT
      campaign.name,
      ad_group.name,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions
    FROM keyword_view
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT 50
  `;
  const rows = await gaqlQuery(cfg, token, query);

  return (rows as Record<string, unknown>[]).map((row) => {
    const m = (row.metrics ?? {}) as Record<string, unknown>;
    const kw = ((row.ad_group_criterion ?? {}) as Record<string, unknown>).keyword as Record<string, unknown> ?? {};
    const camp = (row.campaign ?? {}) as Record<string, unknown>;
    const ag = (row.ad_group ?? {}) as Record<string, unknown>;
    return {
      text: String(kw.text ?? "—"),
      match_type: String(kw.match_type ?? "—"),
      campaign: String(camp.name ?? "—"),
      ad_group: String(ag.name ?? "—"),
      impressions: n(m.impressions),
      clicks: n(m.clicks),
      cost: fmtCost(m.cost_micros),
      ctr: pct(m.ctr),
      avg_cpc: fmtCost(m.average_cpc),
      conversions: n(m.conversions),
    };
  });
}

async function fetchSearchTerms(cfg: GoogleAdsConfig, token: string, start: string, end: string) {
  const query = `
    SELECT
      campaign.name,
      ad_group.name,
      search_term_view.search_term,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.conversions
    FROM search_term_view
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT 100
  `;
  const rows = await gaqlQuery(cfg, token, query);

  const NEGATIVE_SIGNALS = [
    /\b(score|scores|scoring|ladder|standings|results|live score|afl score)\b/i,
    /\b(bet|betting|odds|bookmaker|tipster|punter|gamble)\b/i,
    /\b(nba|nfl|epl|soccer|football|cricket|rugby|nrl)\b/i,
    /\bfree\b/i,
  ];

  return (rows as Record<string, unknown>[]).map((row) => {
    const m = (row.metrics ?? {}) as Record<string, unknown>;
    const st = (row.search_term_view ?? {}) as Record<string, unknown>;
    const camp = (row.campaign ?? {}) as Record<string, unknown>;
    const ag = (row.ad_group ?? {}) as Record<string, unknown>;

    const term = String(st.search_term ?? "—");
    const impr = n(m.impressions);
    const clks = n(m.clicks);
    const conv = n(m.conversions);
    const cost = fmtCost(m.cost_micros);
    const ctrRaw = n(m.ctr);

    let suggestedAction = "keep";
    let negativeReason = "";
    for (const rx of NEGATIVE_SIGNALS) {
      if (rx.test(term)) { suggestedAction = "add negative"; negativeReason = rx.source.slice(0, 60); break; }
    }
    if (suggestedAction === "keep" && cost > 0.5 && conv === 0) {
      suggestedAction = "review";
      negativeReason = "spend with zero conversions";
    }
    if (suggestedAction === "keep" && impr > 50 && ctrRaw < 0.005) {
      suggestedAction = "review";
      negativeReason = "high impressions, very low CTR";
    }

    return {
      term,
      campaign: String(camp.name ?? "—"),
      ad_group: String(ag.name ?? "—"),
      impressions: impr,
      clicks: clks,
      cost,
      ctr: pct(m.ctr),
      conversions: conv,
      suggested_action: suggestedAction,
      negative_reason: negativeReason,
    };
  });
}

async function fetchDevices(cfg: GoogleAdsConfig, token: string, start: string, end: string) {
  const query = `
    SELECT
      segments.device,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND metrics.impressions > 0
  `;
  const rows = await gaqlQuery(cfg, token, query);

  const byDevice: Record<string, { impressions: number; clicks: number; costMicros: number; conversions: number }> = {};
  for (const row of rows as Record<string, unknown>[]) {
    const m = (row.metrics ?? {}) as Record<string, unknown>;
    const seg = (row.segments ?? {}) as Record<string, unknown>;
    const device = String(seg.device ?? "UNKNOWN");
    if (!byDevice[device]) byDevice[device] = { impressions: 0, clicks: 0, costMicros: 0, conversions: 0 };
    byDevice[device].impressions += n(m.impressions);
    byDevice[device].clicks += n(m.clicks);
    byDevice[device].costMicros += n(m.cost_micros);
    byDevice[device].conversions += n(m.conversions);
  }

  return Object.entries(byDevice).map(([device, d]) => ({
    device,
    impressions: d.impressions,
    clicks: d.clicks,
    cost: fmtCost(d.costMicros),
    ctr: d.impressions > 0 ? pct(d.clicks / d.impressions) : "0.00%",
    avg_cpc: d.clicks > 0 ? fmtCost(d.costMicros / d.clicks) : 0,
    conversions: d.conversions,
  })).sort((a, b) => b.cost - a.cost);
}

async function fetchSchedule(cfg: GoogleAdsConfig, token: string, start: string, end: string) {
  const query = `
    SELECT
      segments.date,
      segments.day_of_week,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND metrics.impressions > 0
  `;
  const rows = await gaqlQuery(cfg, token, query);

  const byDay: Record<string, { date: string; day: string; impressions: number; clicks: number; costMicros: number; conversions: number }> = {};
  for (const row of rows as Record<string, unknown>[]) {
    const m = (row.metrics ?? {}) as Record<string, unknown>;
    const seg = (row.segments ?? {}) as Record<string, unknown>;
    const date = String(seg.date ?? "");
    if (!byDay[date]) byDay[date] = { date, day: String(seg.day_of_week ?? "—"), impressions: 0, clicks: 0, costMicros: 0, conversions: 0 };
    byDay[date].impressions += n(m.impressions);
    byDay[date].clicks += n(m.clicks);
    byDay[date].costMicros += n(m.cost_micros);
    byDay[date].conversions += n(m.conversions);
  }

  return Object.values(byDay).map((d) => ({
    date: d.date,
    day: d.day,
    impressions: d.impressions,
    clicks: d.clicks,
    cost: fmtCost(d.costMicros),
    ctr: d.impressions > 0 ? pct(d.clicks / d.impressions) : "0.00%",
    avg_cpc: d.clicks > 0 ? fmtCost(d.costMicros / d.clicks) : 0,
    conversions: d.conversions,
  })).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const isAdmin = await verifyAdmin(req, supabaseUrl, serviceKey);
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check secrets
    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "";
    const clientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID") ?? "";
    const clientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET") ?? "";
    const refreshToken = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN") ?? "";
    const customerId = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID") ?? "";
    const loginCustomerId = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "";
    const apiVersion = Deno.env.get("GOOGLE_ADS_API_VERSION") ?? "v18";

    const missingSecrets: string[] = [];
    if (!developerToken) missingSecrets.push("GOOGLE_ADS_DEVELOPER_TOKEN");
    if (!clientId) missingSecrets.push("GOOGLE_ADS_CLIENT_ID");
    if (!clientSecret) missingSecrets.push("GOOGLE_ADS_CLIENT_SECRET");
    if (!refreshToken) missingSecrets.push("GOOGLE_ADS_REFRESH_TOKEN");
    if (!customerId) missingSecrets.push("GOOGLE_ADS_CUSTOMER_ID");

    if (missingSecrets.length > 0) {
      return new Response(
        JSON.stringify({ configured: false, missing_secrets: missingSecrets }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const rangeRaw = String(body.range ?? "7d");
    const VALID_RANGES: Range[] = ["12h", "24h", "3d", "7d", "14d", "30d"];
    const range: Range = VALID_RANGES.includes(rangeRaw as Range) ? (rangeRaw as Range) : "7d";

    const { startDate, endDate } = rangeToDateRange(range);

    const cfg: GoogleAdsConfig = {
      developerToken, clientId, clientSecret, refreshToken, customerId,
      loginCustomerId: loginCustomerId || undefined,
      apiVersion,
    };

    // Obtain access token
    const accessToken = await getAccessToken(cfg);

    // Run all queries in parallel
    const [summary, campaigns, ad_groups, keywords, search_terms, devices, schedule] = await Promise.all([
      fetchAccountSummary(cfg, accessToken, startDate, endDate).catch((e) => ({ error: String(e.message) })),
      fetchCampaigns(cfg, accessToken, startDate, endDate).catch(() => []),
      fetchAdGroups(cfg, accessToken, startDate, endDate).catch(() => []),
      fetchKeywords(cfg, accessToken, startDate, endDate).catch(() => []),
      fetchSearchTerms(cfg, accessToken, startDate, endDate).catch(() => []),
      fetchDevices(cfg, accessToken, startDate, endDate).catch(() => []),
      fetchSchedule(cfg, accessToken, startDate, endDate).catch(() => []),
    ]);

    return new Response(
      JSON.stringify({
        configured: true,
        range,
        start_date: startDate,
        end_date: endDate,
        generated_at: new Date().toISOString(),
        summary,
        campaigns,
        ad_groups,
        keywords,
        search_terms,
        devices,
        schedule,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
