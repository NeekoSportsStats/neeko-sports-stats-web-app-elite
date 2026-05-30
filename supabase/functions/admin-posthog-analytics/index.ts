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

async function queryPostHog(
  apiKey: string,
  projectId: string,
  host: string,
  query: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const url = `${host}/api/projects/${projectId}/query/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PostHog query failed ${res.status}: ${text}`);
  }
  return res.json();
}

async function getEventCounts(apiKey: string, projectId: string, host: string, days: number): Promise<Record<string, number>> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT event, count() as cnt
        FROM events
        WHERE timestamp >= now() - interval ${days} day
          AND NOT JSONExtractBool(properties, 'is_admin')
        GROUP BY event
        ORDER BY cnt DESC
        LIMIT 50
      `,
    });
    const counts: Record<string, number> = {};
    const rows = (result as any)?.results ?? [];
    for (const row of rows) {
      if (Array.isArray(row) && row.length >= 2) {
        counts[row[0]] = Number(row[1]) || 0;
      }
    }
    return counts;
  } catch {
    return {};
  }
}

async function getDailyActiveUsers(apiKey: string, projectId: string, host: string): Promise<{ dau: number; wau: number; mau: number }> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          uniqIf(distinct_id, timestamp >= now() - interval 1 day) as dau,
          uniqIf(distinct_id, timestamp >= now() - interval 7 day) as wau,
          uniqIf(distinct_id, timestamp >= now() - interval 30 day) as mau
        FROM events
        WHERE event = '$pageview'
          AND NOT JSONExtractBool(properties, 'is_admin')
        LIMIT 1
      `,
    });
    const row = ((result as any)?.results ?? [])[0];
    if (Array.isArray(row) && row.length >= 3) {
      return { dau: Number(row[0]) || 0, wau: Number(row[1]) || 0, mau: Number(row[2]) || 0 };
    }
    return { dau: 0, wau: 0, mau: 0 };
  } catch {
    return { dau: 0, wau: 0, mau: 0 };
  }
}

async function getTopPages(apiKey: string, projectId: string, host: string, days: number): Promise<Array<{ page: string; views: number }>> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          properties.$current_url as page,
          count() as views
        FROM events
        WHERE event = '$pageview'
          AND timestamp >= now() - interval ${days} day
          AND NOT JSONExtractBool(properties, 'is_admin')
        GROUP BY page
        ORDER BY views DESC
        LIMIT 20
      `,
    });
    const rows = (result as any)?.results ?? [];
    return rows.map((row: unknown[]) => ({
      page: String(row[0] ?? ""),
      views: Number(row[1]) || 0,
    }));
  } catch {
    return [];
  }
}

async function getRecentActivity(apiKey: string, projectId: string, host: string, limit: number): Promise<Array<Record<string, unknown>>> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          event,
          distinct_id,
          properties.$current_url,
          properties.$os,
          properties.$browser,
          timestamp
        FROM events
        WHERE event NOT IN ('$pageleave', '$autocapture', '$feature_flag_called', '$set')
          AND NOT JSONExtractBool(properties, 'is_admin')
        ORDER BY timestamp DESC
        LIMIT ${limit}
      `,
    });
    const rows = (result as any)?.results ?? [];
    return rows.map((row: unknown[]) => ({
      event: row[0],
      distinct_id: String(row[1] ?? "").slice(0, 12) + "...",
      current_url: row[2],
      os: row[3],
      browser: row[4],
      timestamp: row[5],
    }));
  } catch {
    return [];
  }
}

async function getAcquisitionData(apiKey: string, projectId: string, host: string): Promise<Record<string, unknown>> {
  try {
    const [referrersResult, utmResult] = await Promise.allSettled([
      queryPostHog(apiKey, projectId, host, {
        kind: "HogQLQuery",
        query: `
          SELECT
            coalesce(properties.$referring_domain, 'direct') as referrer,
            count() as sessions
          FROM events
          WHERE event = '$pageview'
            AND timestamp >= now() - interval 30 day
            AND NOT JSONExtractBool(properties, 'is_admin')
          GROUP BY referrer
          ORDER BY sessions DESC
          LIMIT 15
        `,
      }),
      queryPostHog(apiKey, projectId, host, {
        kind: "HogQLQuery",
        query: `
          SELECT
            properties.utm_source as source,
            properties.utm_medium as medium,
            properties.utm_campaign as campaign,
            count() as sessions
          FROM events
          WHERE event = '$pageview'
            AND timestamp >= now() - interval 30 day
            AND NOT JSONExtractBool(properties, 'is_admin')
            AND (properties.utm_source IS NOT NULL OR properties.utm_medium IS NOT NULL)
          GROUP BY source, medium, campaign
          ORDER BY sessions DESC
          LIMIT 20
        `,
      }),
    ]);

    const referrers = referrersResult.status === "fulfilled"
      ? ((referrersResult.value as any)?.results ?? []).map((row: unknown[]) => ({ referrer: row[0], sessions: Number(row[1]) || 0 }))
      : [];

    const utms = utmResult.status === "fulfilled"
      ? ((utmResult.value as any)?.results ?? []).map((row: unknown[]) => ({
          source: row[0],
          medium: row[1],
          campaign: row[2],
          sessions: Number(row[3]) || 0,
        }))
      : [];

    return { referrers, utms };
  } catch {
    return { referrers: [], utms: [] };
  }
}

async function getFunnelData(apiKey: string, projectId: string, host: string, days: number): Promise<Record<string, unknown>> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          countIf(event = '$pageview') as page_views,
          countIf(event = 'premium_gate_viewed') as gate_views,
          countIf(event = 'landing_cta_clicked') as landing_cta_clicks,
          countIf(event = 'pricing_cta_clicked') as pricing_cta_clicks,
          countIf(event = 'neeko_plus_clicked') as neeko_plus_clicks,
          countIf(event = 'checkout_started') as checkout_started,
          countIf(event = 'checkout_success') as checkout_success,
          countIf(event = 'checkout_cancelled') as checkout_cancelled
        FROM events
        WHERE timestamp >= now() - interval ${days} day
          AND NOT JSONExtractBool(properties, 'is_admin')
        LIMIT 1
      `,
    });
    const row = ((result as any)?.results ?? [])[0];
    if (Array.isArray(row)) {
      const pageViews = Number(row[0]) || 0;
      const gateViews = Number(row[1]) || 0;
      const landingCtaClicks = Number(row[2]) || 0;
      const pricingCtaClicks = Number(row[3]) || 0;
      const neekoClicks = Number(row[4]) || 0;
      const checkoutStarted = Number(row[5]) || 0;
      const checkoutSuccess = Number(row[6]) || 0;
      const checkoutCancelled = Number(row[7]) || 0;

      const ctaClicks = landingCtaClicks + pricingCtaClicks + neekoClicks;
      const conversionRate = checkoutStarted > 0
        ? Math.round((checkoutSuccess / checkoutStarted) * 100)
        : 0;

      return {
        page_views: pageViews,
        gate_views: gateViews,
        landing_cta_clicks: landingCtaClicks,
        pricing_cta_clicks: pricingCtaClicks,
        neeko_plus_clicks: neekoClicks,
        cta_clicks: ctaClicks,
        checkout_started: checkoutStarted,
        checkout_success: checkoutSuccess,
        checkout_cancelled: checkoutCancelled,
        conversion_rate: conversionRate,
        dropoffs: {
          views_to_cta: pageViews > 0 ? Math.round((1 - ctaClicks / pageViews) * 100) : 0,
          cta_to_checkout: ctaClicks > 0 ? Math.round((1 - checkoutStarted / ctaClicks) * 100) : 0,
          checkout_to_success: checkoutStarted > 0 ? Math.round((1 - checkoutSuccess / checkoutStarted) * 100) : 0,
        },
      };
    }
    return {};
  } catch {
    return {};
  }
}

async function getFeatureUsage(apiKey: string, projectId: string, host: string): Promise<Array<{ feature: string; uses: number }>> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          event,
          count() as uses
        FROM events
        WHERE event IN (
          'rankings_view', 'player_modal_open', 'edge_board_view',
          'start_sit_view', 'start_sit_generate', 'market_watch_view',
          'market_watch_refresh_click', 'market_watch_compare_open', 'market_watch_compare_run',
          'market_breakout_click', 'market_watch_best_trade_click',
          'edge_board_modal_open', 'edge_board_share', 'edge_board_paywall_hit',
          'stat_board_filter_used', 'stat_board_sort_changed', 'stat_board_player_expand',
          'stat_board_search_used'
        )
        AND NOT JSONExtractBool(properties, 'is_admin')
        AND timestamp >= now() - interval 30 day
        GROUP BY event
        ORDER BY uses DESC
      `,
    });
    const rows = (result as any)?.results ?? [];
    return rows.map((row: unknown[]) => ({ feature: String(row[0] ?? ""), uses: Number(row[1]) || 0 }));
  } catch {
    return [];
  }
}

async function getActiveNow(apiKey: string, projectId: string, host: string): Promise<{ active_5min: number; active_30min: number }> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          uniqIf(distinct_id, timestamp >= now() - interval 5 minute) as active_5min,
          uniqIf(distinct_id, timestamp >= now() - interval 30 minute) as active_30min
        FROM events
        WHERE NOT JSONExtractBool(properties, 'is_admin')
        LIMIT 1
      `,
    });
    const row = ((result as any)?.results ?? [])[0];
    if (Array.isArray(row) && row.length >= 2) {
      return { active_5min: Number(row[0]) || 0, active_30min: Number(row[1]) || 0 };
    }
    return { active_5min: 0, active_30min: 0 };
  } catch {
    return { active_5min: 0, active_30min: 0 };
  }
}

async function getCtaPerformance(apiKey: string, projectId: string, host: string, days: number): Promise<Array<Record<string, unknown>>> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          event,
          JSONExtractString(properties, 'button_text') as button_text,
          JSONExtractString(properties, 'section') as section,
          JSONExtractString(properties, 'source') as source,
          count() as clicks
        FROM events
        WHERE event IN ('landing_cta_clicked', 'pricing_cta_clicked', 'neeko_plus_clicked',
                        'premium_gate_cta_clicked', 'locked_cell_clicked', 'marketing_cta_clicked')
          AND timestamp >= now() - interval ${days} day
          AND NOT JSONExtractBool(properties, 'is_admin')
        GROUP BY event, button_text, section, source
        ORDER BY clicks DESC
        LIMIT 40
      `,
    });
    const rows = (result as any)?.results ?? [];
    return rows.map((row: unknown[]) => ({
      event: String(row[0] ?? ""),
      button_text: String(row[1] ?? ""),
      section: String(row[2] ?? ""),
      source: String(row[3] ?? ""),
      clicks: Number(row[4]) || 0,
    }));
  } catch {
    return [];
  }
}

async function getDeviceBreakdown(apiKey: string, projectId: string, host: string, days: number): Promise<Array<Record<string, unknown>>> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          properties.$os as os,
          properties.$browser as browser,
          properties.$device_type as device_type,
          count() as sessions,
          uniq(distinct_id) as users
        FROM events
        WHERE event = '$pageview'
          AND timestamp >= now() - interval ${days} day
          AND NOT JSONExtractBool(properties, 'is_admin')
        GROUP BY os, browser, device_type
        ORDER BY sessions DESC
        LIMIT 20
      `,
    });
    const rows = (result as any)?.results ?? [];
    return rows.map((row: unknown[]) => ({
      os: String(row[0] ?? ""),
      browser: String(row[1] ?? ""),
      device_type: String(row[2] ?? ""),
      sessions: Number(row[3]) || 0,
      users: Number(row[4]) || 0,
    }));
  } catch {
    return [];
  }
}

async function getEngagedSessions(apiKey: string, projectId: string, host: string, days: number): Promise<Record<string, unknown>> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          count() as total_sessions,
          countIf(pageview_count >= 2) as multi_page_sessions,
          countIf(has_cta_click) as sessions_with_cta,
          countIf(has_product_event) as sessions_with_product
        FROM (
          SELECT
            session_id,
            countIf(event = '$pageview') as pageview_count,
            countIf(event IN ('landing_cta_clicked','pricing_cta_clicked','neeko_plus_clicked','premium_gate_cta_clicked')) > 0 as has_cta_click,
            countIf(event IN ('stat_board_filter_used','stat_board_player_expand','rankings_view','market_watch_view','edge_board_view')) > 0 as has_product_event
          FROM events
          WHERE timestamp >= now() - interval ${days} day
            AND NOT JSONExtractBool(properties, 'is_admin')
            AND session_id IS NOT NULL
          GROUP BY session_id
        )
      `,
    });
    const row = ((result as any)?.results ?? [])[0];
    if (Array.isArray(row)) {
      const total = Number(row[0]) || 0;
      const multiPage = Number(row[1]) || 0;
      const withCta = Number(row[2]) || 0;
      const withProduct = Number(row[3]) || 0;
      return {
        total_sessions: total,
        multi_page_sessions: multiPage,
        sessions_with_cta: withCta,
        sessions_with_product: withProduct,
        engagement_rate: total > 0 ? Math.round(((multiPage + withProduct) / 2 / total) * 100) : 0,
      };
    }
    return {};
  } catch {
    return {};
  }
}

async function getMarketingInsights(apiKey: string, projectId: string, host: string, days: number): Promise<Record<string, unknown>> {
  const [funnel, ctaPerf, devices, sessions, topPages, acquisition] = await Promise.allSettled([
    getFunnelData(apiKey, projectId, host, days),
    getCtaPerformance(apiKey, projectId, host, days),
    getDeviceBreakdown(apiKey, projectId, host, days),
    getEngagedSessions(apiKey, projectId, host, days),
    getTopPages(apiKey, projectId, host, days),
    getAcquisitionData(apiKey, projectId, host),
  ]);

  const funnelData = funnel.status === "fulfilled" ? funnel.value : {};
  const ctaData = ctaPerf.status === "fulfilled" ? ctaPerf.value : [];
  const deviceData = devices.status === "fulfilled" ? devices.value : [];
  const sessionData = sessions.status === "fulfilled" ? sessions.value : {};
  const pagesData = topPages.status === "fulfilled" ? topPages.value : [];
  const acqData = acquisition.status === "fulfilled" ? acquisition.value : {};

  // Auto-generate behaviour insights
  const insights: string[] = [];
  const f = funnelData as any;
  const s = sessionData as any;

  if (f.conversion_rate > 10) {
    insights.push(`Strong checkout conversion at ${f.conversion_rate}% — well above baseline.`);
  } else if (f.conversion_rate > 0) {
    insights.push(`Checkout conversion at ${f.conversion_rate}% — room to improve CTA clarity or pricing messaging.`);
  }

  if (f.dropoffs?.views_to_cta > 90) {
    insights.push(`Only ${100 - f.dropoffs.views_to_cta}% of visitors click a CTA — consider more prominent or earlier CTA placement.`);
  }

  if (f.dropoffs?.checkout_to_success > 40) {
    insights.push(`${f.dropoffs.checkout_to_success}% of checkout starts don't complete — check for payment friction or pricing hesitation.`);
  }

  if (s.engagement_rate > 50) {
    insights.push(`${s.engagement_rate}% of sessions are engaged (multi-page or product interaction) — strong intent signal.`);
  } else if (s.engagement_rate > 0) {
    insights.push(`Engagement rate is ${s.engagement_rate}% — many single-page visits suggest homepage is not converting to exploration.`);
  }

  const topCtaArr = Array.isArray(ctaData) ? ctaData : [];
  if (topCtaArr.length > 0) {
    const best = topCtaArr[0] as any;
    insights.push(`Top CTA: "${best.button_text || best.event}" with ${best.clicks} clicks in ${days} days.`);
  }

  // Recommended actions
  const actions: string[] = [];
  if (f.gate_views > 0 && f.neeko_plus_clicks < f.gate_views * 0.1) {
    actions.push("Premium gate is showing but conversion is low — review gate messaging and CTA copy.");
  }
  if (f.checkout_started > 0 && f.checkout_success < f.checkout_started * 0.5) {
    actions.push("More than half of checkouts are not completing — review Stripe error logs.");
  }
  if (f.landing_cta_clicks === 0) {
    actions.push("No landing CTA clicks tracked — verify analytics.ts trackLandingCTA is firing.");
  }

  return {
    funnel: funnelData,
    cta_performance: ctaData,
    devices: deviceData,
    sessions: sessionData,
    top_pages: pagesData,
    acquisition: acqData,
    behaviour_insights: insights,
    recommended_actions: actions,
    date_range_days: days,
  };
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

    const posthogApiKey = Deno.env.get("POSTHOG_API_KEY") ?? "";
    const posthogProjectId = Deno.env.get("POSTHOG_PROJECT_ID") ?? "";
    const posthogHost = Deno.env.get("POSTHOG_HOST") ?? "https://eu.posthog.com";

    const posthogAvailable = !!(posthogApiKey && posthogProjectId);

    const body = await req.json().catch(() => ({}));
    const section = body?.section ?? "overview";
    const days = Number(body?.days ?? 7);
    const validDays = [1, 7, 14, 30].includes(days) ? days : 7;

    const result: Record<string, unknown> = {
      posthog_available: posthogAvailable,
    };

    if (!posthogAvailable) {
      result.error = "PostHog credentials not configured (POSTHOG_API_KEY and POSTHOG_PROJECT_ID required)";
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (section === "overview" || section === "all") {
      const [activeUsers, eventCounts30d, eventCounts7d] = await Promise.allSettled([
        getDailyActiveUsers(posthogApiKey, posthogProjectId, posthogHost),
        getEventCounts(posthogApiKey, posthogProjectId, posthogHost, 30),
        getEventCounts(posthogApiKey, posthogProjectId, posthogHost, 7),
      ]);

      result.active_users = activeUsers.status === "fulfilled" ? activeUsers.value : { dau: 0, wau: 0, mau: 0 };
      result.event_counts_30d = eventCounts30d.status === "fulfilled" ? eventCounts30d.value : {};
      result.event_counts_7d = eventCounts7d.status === "fulfilled" ? eventCounts7d.value : {};
    }

    if (section === "activity" || section === "all") {
      const [recentEvents, activeNow] = await Promise.allSettled([
        getRecentActivity(posthogApiKey, posthogProjectId, posthogHost, 50),
        getActiveNow(posthogApiKey, posthogProjectId, posthogHost),
      ]);

      result.recent_events = recentEvents.status === "fulfilled" ? recentEvents.value : [];
      result.active_now = activeNow.status === "fulfilled" ? activeNow.value : { active_5min: 0, active_30min: 0 };
    }

    if (section === "acquisition" || section === "all") {
      const acquisition = await getAcquisitionData(posthogApiKey, posthogProjectId, posthogHost);
      result.acquisition = acquisition;
    }

    if (section === "engagement" || section === "all") {
      const [topPages, featureUsage, activeUsers] = await Promise.allSettled([
        getTopPages(posthogApiKey, posthogProjectId, posthogHost, 30),
        getFeatureUsage(posthogApiKey, posthogProjectId, posthogHost),
        getDailyActiveUsers(posthogApiKey, posthogProjectId, posthogHost),
      ]);

      result.top_pages = topPages.status === "fulfilled" ? topPages.value : [];
      result.feature_usage = featureUsage.status === "fulfilled" ? featureUsage.value : [];
      result.session_metrics = activeUsers.status === "fulfilled" ? activeUsers.value : { dau: 0, wau: 0, mau: 0 };
    }

    if (section === "funnels" || section === "conversion") {
      const funnelData = await getFunnelData(posthogApiKey, posthogProjectId, posthogHost, validDays);
      result.funnel = funnelData;
    }

    if (section === "marketing") {
      const insights = await getMarketingInsights(posthogApiKey, posthogProjectId, posthogHost, validDays);
      Object.assign(result, insights);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[admin-posthog-analytics] error:", err);
    return new Response(
      JSON.stringify({ error: "Request failed", posthog_available: false }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
