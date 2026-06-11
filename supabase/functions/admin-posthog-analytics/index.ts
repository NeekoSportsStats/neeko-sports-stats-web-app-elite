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

/** Builds the HogQL interval expression — hours-based for short ranges, days-based otherwise. */
function intervalExpr(hours: number | null, days: number): string {
  if (hours !== null) return `${hours} hour`;
  return `${days} day`;
}

/**
 * Dual-layer admin exclusion filter.
 * Layer 1: is_admin property flag (set by analytics.ts isAdminRoute())
 * Layer 2: URL path does not start with /admin (catches any missed events)
 * Also excludes localhost/dev traffic.
 */
function adminExclusionWhere(includeAdmin: boolean): string {
  if (includeAdmin) return "1=1";
  return `NOT JSONExtractBool(properties, 'is_admin')
          AND NOT (properties.page_path LIKE '/admin%')
          AND NOT (properties.$current_url LIKE '%localhost%')
          AND NOT (properties.$current_url LIKE '%127.0.0.1%')`;
}

/**
 * Returns a HogQL expression for the session identifier.
 * PostHog natively populates properties.$session_id when session recording is enabled.
 * If not enabled, fall back to the custom `session_id` property set by analytics.ts
 * in baseProperties() — this is a localStorage UUID stored as `session_id` (no $ prefix).
 * Using coalesce means either source works.
 */
function sessionIdExpr(): string {
  return `coalesce(properties.$session_id, JSONExtractString(properties, 'session_id'))`;
}

/**
 * Extracts clean path from URL (strips query string and hash).
 * Uses NULLIF to turn empty strings into NULL so they can be filtered.
 * Bug fix: splitByChar on null URL returns "" — wrapping in NULLIF prevents
 * empty-string paths from being grouped together and masking real pages.
 */
function cleanPathExpr(urlField: string): string {
  return `NULLIF(splitByChar('?', splitByChar('#', ${urlField})[1])[1], '')`;
}

async function getEventCounts(
  apiKey: string,
  projectId: string,
  host: string,
  days: number,
  hours: number | null = null,
  includeAdmin = false,
): Promise<Record<string, number>> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT event, count() as cnt
        FROM events
        WHERE timestamp >= now() - interval ${intervalExpr(hours, days)}
          AND ${adminExclusionWhere(includeAdmin)}
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

async function getDailyActiveUsers(
  apiKey: string,
  projectId: string,
  host: string,
  includeAdmin = false,
): Promise<{ dau: number; wau: number; mau: number }> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          uniqIf(distinct_id, timestamp >= now() - interval 1 day) as dau,
          uniqIf(distinct_id, timestamp >= now() - interval 7 day) as wau,
          uniqIf(distinct_id, timestamp >= now() - interval 30 day) as mau
        FROM events
        WHERE event IN ('page_viewed', '$pageview')
          AND ${adminExclusionWhere(includeAdmin)}
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

async function getTopPages(
  apiKey: string,
  projectId: string,
  host: string,
  days: number,
  hours: number | null = null,
  includeAdmin = false,
): Promise<Array<{ page: string; views: number; unique_users: number }>> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          coalesce(
            NULLIF(JSONExtractString(properties, 'clean_page_path'), ''),
            NULLIF(JSONExtractString(properties, 'page_path'), ''),
            ${cleanPathExpr("properties.$current_url")},
            'unknown'
          ) as clean_path,
          count() as views,
          uniq(distinct_id) as unique_users
        FROM events
        WHERE event IN ('page_viewed', '$pageview')
          AND timestamp >= now() - interval ${intervalExpr(hours, days)}
          AND ${adminExclusionWhere(includeAdmin)}
        GROUP BY clean_path
        HAVING clean_path != 'unknown'
        ORDER BY views DESC
        LIMIT 20
      `,
    });
    const rows = (result as any)?.results ?? [];
    return rows
      .filter((row: unknown[]) => row[0] != null && String(row[0]).trim() !== "")
      .map((row: unknown[]) => ({
        page: String(row[0] ?? ""),
        views: Number(row[1]) || 0,
        unique_users: Number(row[2]) || 0,
      }));
  } catch {
    return [];
  }
}

async function getRecentActivity(
  apiKey: string,
  projectId: string,
  host: string,
  limit: number,
  includeAdmin = false,
): Promise<Array<Record<string, unknown>>> {
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
          AND ${adminExclusionWhere(includeAdmin)}
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

async function getAcquisitionData(
  apiKey: string,
  projectId: string,
  host: string,
  days: number = 30,
  hours: number | null = null,
  includeAdmin = false,
): Promise<Record<string, unknown>> {
  try {
    const interval = intervalExpr(hours, days);
    const exclusion = adminExclusionWhere(includeAdmin);

    const [referrersResult, utmResult, googleAdsResult] = await Promise.allSettled([
      // Referrer-based traffic source (normalised)
      // Include both 'page_viewed' (our manual event) and '$pageview' (PostHog autocapture fallback)
      queryPostHog(apiKey, projectId, host, {
        kind: "HogQLQuery",
        query: `
          SELECT
            multiIf(
              isNotNull(properties.gclid) OR isNotNull(properties.gbraid) OR isNotNull(properties.wbraid) OR isNotNull(properties.gad_source),
              'google_ads',
              properties.$referring_domain LIKE '%tagassistant.google.com%',
              'internal_testing',
              properties.$referring_domain LIKE '%checkout.stripe.com%' OR properties.$referring_domain LIKE '%stripe.com%',
              'stripe_return',
              properties.$referring_domain LIKE '%neekostats.com.au%',
              'self_referral',
              properties.$referring_domain LIKE '%google.%',
              'organic_google',
              properties.$referring_domain LIKE '%facebook.%' OR properties.$referring_domain LIKE '%instagram.%' OR properties.$referring_domain LIKE '%twitter.%' OR properties.$referring_domain LIKE '%x.com%' OR properties.$referring_domain LIKE '%reddit.%' OR properties.$referring_domain LIKE '%tiktok.%',
              'organic_social',
              properties.$referring_domain = '' OR isNull(properties.$referring_domain),
              'direct',
              'referral'
            ) as source_category,
            coalesce(properties.$referring_domain, 'direct') as referrer,
            count() as pageviews,
            uniq(distinct_id) as users
          FROM events
          WHERE event IN ('page_viewed', '$pageview')
            AND timestamp >= now() - interval ${interval}
            AND ${exclusion}
          GROUP BY source_category, referrer
          ORDER BY pageviews DESC
          LIMIT 20
        `,
      }),
      // UTM campaign data — preserve raw attribution
      // UTMs are registered as PostHog super-properties (via posthog.register) so they appear
      // on page_viewed events too, not only $pageview autocapture events.
      queryPostHog(apiKey, projectId, host, {
        kind: "HogQLQuery",
        query: `
          SELECT
            coalesce(
              NULLIF(JSONExtractString(properties, 'utm_source'), ''),
              NULLIF(properties.utm_source, '')
            ) as source,
            coalesce(
              NULLIF(JSONExtractString(properties, 'utm_medium'), ''),
              NULLIF(properties.utm_medium, '')
            ) as medium,
            coalesce(
              NULLIF(JSONExtractString(properties, 'utm_campaign'), ''),
              NULLIF(properties.utm_campaign, '')
            ) as campaign,
            isNotNull(properties.gclid) OR isNotNull(properties.gbraid) OR isNotNull(properties.wbraid) as has_gclid,
            count() as pageviews,
            uniq(distinct_id) as users
          FROM events
          WHERE event IN ('page_viewed', '$pageview')
            AND timestamp >= now() - interval ${interval}
            AND ${exclusion}
            AND (
              NULLIF(JSONExtractString(properties, 'utm_source'), '') IS NOT NULL
              OR NULLIF(JSONExtractString(properties, 'utm_medium'), '') IS NOT NULL
              OR properties.utm_source IS NOT NULL
              OR properties.utm_medium IS NOT NULL
              OR properties.gclid IS NOT NULL
              OR properties.gbraid IS NOT NULL
              OR properties.wbraid IS NOT NULL
            )
          GROUP BY source, medium, campaign, has_gclid
          HAVING source IS NOT NULL OR medium IS NOT NULL
          ORDER BY pageviews DESC
          LIMIT 20
        `,
      }),
      // Google Ads specific — sessions with gclid/gbraid/wbraid/gad_source
      queryPostHog(apiKey, projectId, host, {
        kind: "HogQLQuery",
        query: `
          SELECT
            coalesce(properties.utm_campaign, 'unknown_campaign') as campaign,
            coalesce(properties.utm_source, 'google') as source,
            coalesce(properties.utm_medium, 'cpc') as medium,
            count() as pageviews,
            uniq(distinct_id) as users,
            countIf(event IN ('cta_clicked', 'landing_cta_clicked', 'pricing_cta_clicked', 'neeko_plus_clicked')) as cta_clicks,
            countIf(event IN ('checkout_start_clicked', 'checkout_started')) as checkout_starts,
            countIf(event IN ('subscription_activated', 'checkout_success')) as purchases
          FROM events
          WHERE timestamp >= now() - interval ${interval}
            AND ${exclusion}
            AND (properties.gclid IS NOT NULL OR properties.gbraid IS NOT NULL OR properties.wbraid IS NOT NULL OR properties.gad_source IS NOT NULL)
          GROUP BY campaign, source, medium
          ORDER BY pageviews DESC
          LIMIT 15
        `,
      }),
    ]);

    const referrers = referrersResult.status === "fulfilled"
      ? ((referrersResult.value as any)?.results ?? []).map((row: unknown[]) => ({
          source_category: row[0],
          referrer: row[1],
          // Return both field names for backward compat — these are pageview events not sessions
          pageviews: Number(row[2]) || 0,
          sessions: Number(row[2]) || 0,
          users: Number(row[3]) || 0,
        }))
      : [];

    const utms = utmResult.status === "fulfilled"
      ? ((utmResult.value as any)?.results ?? []).map((row: unknown[]) => ({
          source: row[0],
          medium: row[1],
          campaign: row[2],
          has_gclid: Boolean(row[3]),
          pageviews: Number(row[4]) || 0,
          sessions: Number(row[4]) || 0,
          users: Number(row[5]) || 0,
        }))
      : [];

    const googleAds = googleAdsResult.status === "fulfilled"
      ? ((googleAdsResult.value as any)?.results ?? []).map((row: unknown[]) => ({
          campaign: row[0],
          source: row[1],
          medium: row[2],
          pageviews: Number(row[3]) || 0,
          sessions: Number(row[3]) || 0,
          users: Number(row[4]) || 0,
          cta_clicks: Number(row[5]) || 0,
          checkout_starts: Number(row[6]) || 0,
          purchases: Number(row[7]) || 0,
        }))
      : [];

    // Summarise by source category
    const sourceCategories: Record<string, { pageviews: number; sessions: number; users: number }> = {};
    for (const r of referrers) {
      const cat = (r as any).source_category ?? "unknown";
      if (!sourceCategories[cat]) sourceCategories[cat] = { pageviews: 0, sessions: 0, users: 0 };
      sourceCategories[cat].pageviews += (r as any).pageviews;
      sourceCategories[cat].sessions += (r as any).sessions;
      sourceCategories[cat].users += (r as any).users;
    }

    return {
      referrers,
      utms,
      google_ads: googleAds,
      source_categories: sourceCategories,
      // Clarify what counts represent
      count_label: "pageviews",
    };
  } catch {
    return { referrers: [], utms: [], google_ads: [], source_categories: {}, count_label: "pageviews" };
  }
}

async function getFunnelData(
  apiKey: string,
  projectId: string,
  host: string,
  days: number,
  hours: number | null = null,
  includeAdmin = false,
): Promise<Record<string, unknown>> {
  try {
    const exclusion = adminExclusionWhere(includeAdmin);
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          countIf(event IN ('page_viewed', '$pageview')) as page_views,
          uniqIf(distinct_id, event IN ('page_viewed', '$pageview')) as unique_visitors,
          countIf(event IN ('gate_viewed', 'premium_gate_viewed')) as gate_views,
          countIf(event IN ('locked_data_clicked', 'locked_cell_clicked')) as locked_cell_clicks,
          countIf(event = 'cta_clicked' AND JSONExtractString(properties, 'cta_location') LIKE 'landing_%') as landing_cta_clicks,
          countIf(event = 'cta_clicked' AND JSONExtractString(properties, 'cta_location') LIKE '%pricing%') as pricing_cta_clicks,
          countIf(event = 'cta_clicked' AND JSONExtractString(properties, 'cta_location') LIKE '%neeko%') as neeko_plus_clicks,
          countIf(event = 'cta_clicked') as cta_clicks_total,
          countIf(event IN ('checkout_attempted', 'checkout_start_clicked')) as checkout_attempts,
          countIf(event IN ('checkout_started', 'checkout_session_created')) as checkout_started,
          countIf(event = 'checkout_redirected') as checkout_redirected,
          countIf(event IN ('subscription_activated', 'checkout_success')) as checkout_success,
          countIf(event = 'checkout_cancelled') as checkout_cancelled,
          countIf(event = 'checkout_error') as checkout_errors
        FROM events
        WHERE timestamp >= now() - interval ${intervalExpr(hours, days)}
          AND ${exclusion}
        LIMIT 1
      `,
    });
    const row = ((result as any)?.results ?? [])[0];
    if (Array.isArray(row)) {
      const pageViews = Number(row[0]) || 0;
      const uniqueVisitors = Number(row[1]) || 0;
      const gateViews = Number(row[2]) || 0;
      const lockedCellClicks = Number(row[3]) || 0;
      const landingCtaClicks = Number(row[4]) || 0;
      const pricingCtaClicks = Number(row[5]) || 0;
      const neekoClicks = Number(row[6]) || 0;
      // canonical total — all CTAs fire as cta_clicked via trackCTA(), no double-counting
      const ctaClicks = Number(row[7]) || 0;
      const checkoutAttempts = Number(row[8]) || 0;
      const checkoutStarted = Number(row[9]) || 0;
      const checkoutRedirected = Number(row[10]) || 0;
      const checkoutSuccess = Number(row[11]) || 0;
      const checkoutCancelled = Number(row[12]) || 0;
      const checkoutErrors = Number(row[13]) || 0;

      const conversionRate = checkoutStarted > 0
        ? Math.round((checkoutSuccess / checkoutStarted) * 100)
        : 0;

      // Conversion rates through funnel
      const viewToGate = pageViews > 0 ? Math.round((gateViews / pageViews) * 100) : 0;
      const viewToCta = pageViews > 0 ? Math.round((ctaClicks / pageViews) * 100) : 0;
      const ctaToCheckout = ctaClicks > 0 ? Math.round((checkoutStarted / ctaClicks) * 100) : 0;
      const checkoutToSuccess = checkoutStarted > 0 ? Math.round((checkoutSuccess / checkoutStarted) * 100) : 0;
      const viewToSuccess = pageViews > 0 ? Math.round((checkoutSuccess / pageViews) * 100) : 0;

      // Dropoffs clamped to [0,100] — can't be negative, CTA clicks can exceed gate views
      // because CTAs fire from banners and mobile bars, not only from gate triggers.
      const clamp = (n: number) => Math.max(0, Math.min(100, n));

      return {
        page_views: pageViews,
        unique_visitors: uniqueVisitors,
        gate_views: gateViews,
        locked_cell_clicks: lockedCellClicks,
        landing_cta_clicks: landingCtaClicks,
        pricing_cta_clicks: pricingCtaClicks,
        neeko_plus_clicks: neekoClicks,
        // product_cta_clicks kept for backward compat — same as cta_clicks (canonical)
        product_cta_clicks: ctaClicks,
        cta_clicks: ctaClicks,
        checkout_attempts: checkoutAttempts,
        checkout_started: checkoutStarted,
        checkout_redirected: checkoutRedirected,
        checkout_success: checkoutSuccess,
        checkout_cancelled: checkoutCancelled,
        checkout_errors: checkoutErrors,
        conversion_rate: conversionRate,
        // Conversion rates (%)
        rates: {
          view_to_gate: viewToGate,
          view_to_cta: viewToCta,
          cta_to_checkout: ctaToCheckout,
          checkout_to_success: checkoutToSuccess,
          view_to_success: viewToSuccess,
        },
        // Dropoffs are clamped [0,100] — these are event-count drop-offs, not sequential user paths.
        dropoffs: {
          views_to_cta: clamp(pageViews > 0 ? Math.round((1 - ctaClicks / pageViews) * 100) : 0),
          cta_to_checkout: clamp(ctaClicks > 0 ? Math.round((1 - checkoutStarted / ctaClicks) * 100) : 0),
          checkout_to_success: clamp(checkoutStarted > 0 ? Math.round((1 - checkoutSuccess / checkoutStarted) * 100) : 0),
        },
        // Explains funnel methodology to admin
        funnel_note: "Event-count funnel — stages count distinct events, not sequential user paths. cta_clicks = all cta_clicked events (canonical). CTA sub-counts (landing/pricing/neeko) are non-overlapping location filters on the same event set.",
      };
    }
    return {};
  } catch {
    return {};
  }
}

async function getFeatureUsage(
  apiKey: string,
  projectId: string,
  host: string,
  includeAdmin = false,
): Promise<Array<{ feature: string; uses: number }>> {
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
        AND ${adminExclusionWhere(includeAdmin)}
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

async function getActiveNow(
  apiKey: string,
  projectId: string,
  host: string,
  includeAdmin = false,
): Promise<{ active_5min: number; active_30min: number }> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          uniqIf(distinct_id, timestamp >= now() - interval 5 minute) as active_5min,
          uniqIf(distinct_id, timestamp >= now() - interval 30 minute) as active_30min
        FROM events
        WHERE ${adminExclusionWhere(includeAdmin)}
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

async function getCtaPerformance(
  apiKey: string,
  projectId: string,
  host: string,
  days: number,
  hours: number | null = null,
  includeAdmin = false,
): Promise<Array<Record<string, unknown>>> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          coalesce(NULLIF(JSONExtractString(properties, 'cta_location'), ''), event, 'unknown') as cta_location,
          coalesce(NULLIF(JSONExtractString(properties, 'cta_text'), ''), 'unknown') as cta_text,
          coalesce(NULLIF(JSONExtractString(properties, 'cta_type'), ''), 'unknown') as cta_type,
          coalesce(
            NULLIF(JSONExtractString(properties, 'clean_page_path'), ''),
            NULLIF(JSONExtractString(properties, 'page_path'), ''),
            ${cleanPathExpr("properties.$current_url")},
            'unknown'
          ) as clean_path,
          count() as clicks
        FROM events
        WHERE event = 'cta_clicked'
          AND timestamp >= now() - interval ${intervalExpr(hours, days)}
          AND ${adminExclusionWhere(includeAdmin)}
        GROUP BY cta_location, cta_text, cta_type, clean_path
        ORDER BY clicks DESC
        LIMIT 40
      `,
    });
    const rows = (result as any)?.results ?? [];
    return rows.map((row: unknown[]) => ({
      event: "cta_clicked",
      cta_location: String(row[0] ?? ""),
      // Frontend CtaRow expects button_text and section
      button_text: String(row[1] ?? ""),
      section: String(row[0] ?? ""),
      cta_text: String(row[1] ?? ""),
      cta_type: String(row[2] ?? ""),
      source: String(row[0] ?? ""),
      clean_path: String(row[3] ?? ""),
      clicks: Number(row[4]) || 0,
    }));
  } catch {
    return [];
  }
}

async function getDeviceBreakdown(
  apiKey: string,
  projectId: string,
  host: string,
  days: number,
  hours: number | null = null,
  includeAdmin = false,
): Promise<Array<Record<string, unknown>>> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          properties.$os as os,
          properties.$browser as browser,
          properties.$device_type as device_type,
          count() as pageviews,
          uniq(distinct_id) as users
        FROM events
        WHERE event IN ('page_viewed', '$pageview')
          AND timestamp >= now() - interval ${intervalExpr(hours, days)}
          AND ${adminExclusionWhere(includeAdmin)}
        GROUP BY os, browser, device_type
        ORDER BY pageviews DESC
        LIMIT 20
      `,
    });
    const rows = (result as any)?.results ?? [];
    return rows.map((row: unknown[]) => ({
      os: String(row[0] ?? ""),
      browser: String(row[1] ?? ""),
      device_type: String(row[2] ?? ""),
      // These are $pageview event counts, not unique sessions
      pageviews: Number(row[3]) || 0,
      sessions: Number(row[3]) || 0,   // kept for backward compat — same value, but see count_label
      users: Number(row[4]) || 0,
    }));
  } catch {
    return [];
  }
}

async function getEngagedSessions(
  apiKey: string,
  projectId: string,
  host: string,
  days: number,
  hours: number | null = null,
  includeAdmin = false,
): Promise<Record<string, unknown>> {
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
            ${sessionIdExpr()} as sid,
            countIf(event IN ('page_viewed', '$pageview')) as pageview_count,
            countIf(event = 'cta_clicked') > 0 as has_cta_click,
            countIf(event IN ('stat_board_filter_used','stat_board_player_expand','rankings_view','market_watch_view','edge_board_view')) > 0 as has_product_event
          FROM events
          WHERE timestamp >= now() - interval ${intervalExpr(hours, days)}
            AND ${adminExclusionWhere(includeAdmin)}
            AND ${sessionIdExpr()} IS NOT NULL
            AND ${sessionIdExpr()} != ''
          GROUP BY sid
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

async function getSessionReviewShortlist(
  apiKey: string,
  projectId: string,
  host: string,
  days: number,
  hours: number | null = null,
  includeAdmin = false,
): Promise<Array<Record<string, unknown>>> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          ${sessionIdExpr()} as sid,
          countIf(event IN ('page_viewed', '$pageview')) as page_views,
          countIf(event = 'cta_clicked') as cta_clicks,
          countIf(event IN ('checkout_attempted', 'checkout_start_clicked', 'checkout_started', 'checkout_session_created')) as checkout_starts,
          countIf(event IN ('stat_board_filter_used','stat_board_player_expand','rankings_view','market_watch_view','edge_board_view')) as product_events,
          min(timestamp) as session_start,
          max(timestamp) as session_end,
          toInt64(dateDiff('second', min(timestamp), max(timestamp))) as duration_sec,
          any(properties.$os) as os,
          any(properties.$browser) as browser,
          any(properties.$device_type) as device,
          any(multiIf(
            isNotNull(any(properties.gclid)) OR isNotNull(any(properties.gbraid)) OR isNotNull(any(properties.wbraid)),
            'google_ads',
            any(properties.$referring_domain) LIKE '%tagassistant.google.com%',
            'internal_testing',
            any(properties.$referring_domain) LIKE '%checkout.stripe.com%',
            'stripe_return',
            any(properties.$referring_domain) LIKE '%neekostats.com.au%',
            'self_referral',
            any(properties.$referring_domain) LIKE '%google.%',
            'organic_google',
            any(properties.$referring_domain) LIKE '%facebook.%' OR any(properties.$referring_domain) LIKE '%instagram.%' OR any(properties.$referring_domain) LIKE '%reddit.%',
            'organic_social',
            any(properties.$referring_domain) = '' OR isNull(any(properties.$referring_domain)),
            'direct',
            'referral'
          )) as traffic_source
        FROM events
        WHERE timestamp >= now() - interval ${intervalExpr(hours, days)}
          AND ${adminExclusionWhere(includeAdmin)}
          AND ${sessionIdExpr()} IS NOT NULL
          AND ${sessionIdExpr()} != ''
        GROUP BY sid
        HAVING cta_clicks > 0 OR checkout_starts > 0 OR (page_views >= 3 AND product_events >= 2)
        ORDER BY cta_clicks DESC, product_events DESC
        LIMIT 25
      `,
    });
    const rows = (result as any)?.results ?? [];
    return rows.map((row: unknown[]) => ({
      session_id: String(row[0] ?? "").slice(0, 16) + "...",
      page_views: Number(row[1]) || 0,
      cta_clicks: Number(row[2]) || 0,
      checkout_starts: Number(row[3]) || 0,
      product_events: Number(row[4]) || 0,
      session_start: row[5],
      session_end: row[6],
      duration_sec: Number(row[7]) || 0,
      os: row[8],
      browser: row[9],
      device: row[10],
      traffic_source: row[11],
    }));
  } catch {
    return [];
  }
}

async function getSessionDurationMetrics(
  apiKey: string,
  projectId: string,
  host: string,
  days: number,
  hours: number | null = null,
  includeAdmin = false,
): Promise<Record<string, unknown>> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          count() as total_sessions,
          avg(duration_sec) as avg_duration,
          median(duration_sec) as median_duration,
          countIf(duration_sec < 10) as under_10s,
          countIf(duration_sec >= 10 AND duration_sec < 30) as s10_30,
          countIf(duration_sec >= 30 AND duration_sec < 60) as s30_60,
          countIf(duration_sec >= 60 AND duration_sec < 120) as s60_120,
          countIf(duration_sec >= 120 AND duration_sec < 300) as s120_300,
          countIf(duration_sec >= 300) as over_300s
        FROM (
          SELECT
            ${sessionIdExpr()} as sid,
            toInt64(dateDiff('second', min(timestamp), max(timestamp))) as duration_sec
          FROM events
          WHERE timestamp >= now() - interval ${intervalExpr(hours, days)}
            AND ${adminExclusionWhere(includeAdmin)}
            AND ${sessionIdExpr()} IS NOT NULL
            AND ${sessionIdExpr()} != ''
          GROUP BY sid
          HAVING duration_sec >= 0
        )
      `,
    });
    const row = ((result as any)?.results ?? [])[0];
    if (Array.isArray(row)) {
      const total = Number(row[0]) || 0;
      if (total === 0) return { available: false };
      const avg = Number(row[1]) || 0;
      const median = Number(row[2]) || 0;
      const under10 = Number(row[3]) || 0;
      const s1030 = Number(row[4]) || 0;
      const s3060 = Number(row[5]) || 0;
      const s60120 = Number(row[6]) || 0;
      const s120300 = Number(row[7]) || 0;
      const over300 = Number(row[8]) || 0;
      return {
        available: true,
        total_sessions: total,
        avg_duration_sec: Math.round(avg),
        median_duration_sec: Math.round(median),
        pct_under_10s: total > 0 ? Math.round((under10 / total) * 100) : 0,
        pct_10_30s: total > 0 ? Math.round((s1030 / total) * 100) : 0,
        pct_30_60s: total > 0 ? Math.round((s3060 / total) * 100) : 0,
        pct_60_120s: total > 0 ? Math.round((s60120 / total) * 100) : 0,
        pct_120_300s: total > 0 ? Math.round((s120300 / total) * 100) : 0,
        pct_over_300s: total > 0 ? Math.round((over300 / total) * 100) : 0,
        pct_over_60s: total > 0 ? Math.round(((s60120 + s120300 + over300) / total) * 100) : 0,
        pct_over_120s: total > 0 ? Math.round(((s120300 + over300) / total) * 100) : 0,
        // Frontend-friendly aliases matching SessionDurationData type
        under_10s: under10,
        s10_to_30s: s1030,
        s30_to_60s: s3060,
        s60_to_120s: s60120,
        s120_to_300s: s120300,
        over_300s: over300,
        over_60s: s60120 + s120300 + over300,
        over_120s: s120300 + over300,
        buckets: { under10, s1030, s3060, s60120, s120300, over300 },
      };
    }
    return { available: false };
  } catch {
    return { available: false };
  }
}

async function getTimeOnPage(
  apiKey: string,
  projectId: string,
  host: string,
  days: number,
  hours: number | null = null,
  includeAdmin = false,
): Promise<Array<Record<string, unknown>>> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          coalesce(
            NULLIF(JSONExtractString(properties, 'clean_page_path'), ''),
            ${cleanPathExpr("properties.$current_url")}
          ) as page,
          count() as pageviews,
          countIf(duration_sec IS NOT NULL AND duration_sec > 0) as timed_exits,
          avgIf(duration_sec, duration_sec IS NOT NULL AND duration_sec > 0 AND duration_sec < 3600) as avg_time
        FROM (
          SELECT
            properties.$current_url,
            properties.clean_page_path,
            event,
            ${sessionIdExpr()} as sid,
            timestamp,
            toInt64(dateDiff('second', timestamp, leadInFrame(timestamp) OVER (PARTITION BY ${sessionIdExpr()} ORDER BY timestamp ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING))) as duration_sec
          FROM events
          WHERE event IN ('page_viewed', '$pageview')
            AND timestamp >= now() - interval ${intervalExpr(hours, days)}
            AND ${adminExclusionWhere(includeAdmin)}
            AND ${sessionIdExpr()} IS NOT NULL
            AND ${sessionIdExpr()} != ''
            AND (properties.clean_page_path IS NOT NULL OR properties.$current_url IS NOT NULL)
        )
        GROUP BY page
        HAVING page IS NOT NULL AND page != ''
        ORDER BY pageviews DESC
        LIMIT 15
      `,
    });
    const rows = (result as any)?.results ?? [];
    return rows
      .filter((row: unknown[]) => row[0] != null && String(row[0]).trim() !== "")
      .map((row: unknown[]) => ({
        page: String(row[0] ?? ""),
        pageviews: Number(row[1]) || 0,
        exits: Number(row[2]) || 0,
        avg_time_sec: row[3] != null ? Math.round(Number(row[3])) : null,
      }));
  } catch {
    return [];
  }
}

async function getRecentConversions(
  apiKey: string,
  projectId: string,
  host: string,
  includeAdmin = false,
): Promise<Array<Record<string, unknown>>> {
  try {
    const result = await queryPostHog(apiKey, projectId, host, {
      kind: "HogQLQuery",
      query: `
        SELECT
          event,
          ${sessionIdExpr()} as sid,
          coalesce(
            NULLIF(JSONExtractString(properties, 'clean_page_path'), ''),
            ${cleanPathExpr("properties.$current_url")}
          ) as path,
          JSONExtractString(properties, 'cta_location') as cta_location,
          JSONExtractString(properties, 'plan') as plan,
          JSONExtractString(properties, 'error') as error_msg,
          properties.$os as os,
          properties.$browser as browser,
          timestamp
        FROM events
        WHERE event IN (
          'cta_clicked',
          'checkout_attempted', 'checkout_session_created', 'checkout_started',
          'checkout_redirected', 'checkout_success', 'subscription_activated',
          'checkout_cancelled', 'checkout_error',
          'checkout_start_clicked', 'checkout_redirect_attempted',
          'gate_viewed', 'locked_data_clicked',
          'page_viewed'
        )
          AND ${adminExclusionWhere(includeAdmin)}
        ORDER BY timestamp DESC
        LIMIT 20
      `,
    });
    const rows = (result as any)?.results ?? [];
    return rows.map((row: unknown[]) => ({
      event: row[0],
      session_id: String(row[1] ?? "").slice(0, 16) + "…",
      path: row[2],
      cta_location: row[3],
      plan: row[4],
      error_msg: row[5],
      os: row[6],
      browser: row[7],
      timestamp: row[8],
    }));
  } catch {
    return [];
  }
}


async function getMarketingInsights(
  apiKey: string,
  projectId: string,
  host: string,
  days: number,
  hours: number | null = null,
  includeAdmin = false,
): Promise<Record<string, unknown>> {
  const [funnel, ctaPerf, devices, sessions, topPages, acquisition, sessionReview, sessionDuration, timeOnPage, recentConversions] = await Promise.allSettled([
    getFunnelData(apiKey, projectId, host, days, hours, includeAdmin),
    getCtaPerformance(apiKey, projectId, host, days, hours, includeAdmin),
    getDeviceBreakdown(apiKey, projectId, host, days, hours, includeAdmin),
    getEngagedSessions(apiKey, projectId, host, days, hours, includeAdmin),
    getTopPages(apiKey, projectId, host, days, hours, includeAdmin),
    getAcquisitionData(apiKey, projectId, host, days, hours, includeAdmin),
    getSessionReviewShortlist(apiKey, projectId, host, days, hours, includeAdmin),
    getSessionDurationMetrics(apiKey, projectId, host, days, hours, includeAdmin),
    getTimeOnPage(apiKey, projectId, host, days, hours, includeAdmin),
    getRecentConversions(apiKey, projectId, host, includeAdmin),
  ]);

  const funnelData = funnel.status === "fulfilled" ? funnel.value : {};
  const ctaData = ctaPerf.status === "fulfilled" ? ctaPerf.value : [];
  const deviceData = devices.status === "fulfilled" ? devices.value : [];
  const sessionData = sessions.status === "fulfilled" ? sessions.value : {};
  const pagesData = topPages.status === "fulfilled" ? topPages.value : [];
  const acqData = acquisition.status === "fulfilled" ? acquisition.value : {};
  const sessionReviewData = sessionReview.status === "fulfilled" ? sessionReview.value : [];
  const sdData = sessionDuration.status === "fulfilled" ? sessionDuration.value : { available: false };
  const topData = timeOnPage.status === "fulfilled" ? timeOnPage.value : [];
  const recentConversionsData = recentConversions.status === "fulfilled" ? recentConversions.value : [];

  // Auto-generate behaviour insights
  const insights: string[] = [];
  const f = funnelData as any;
  const s = sessionData as any;
  const sd = sdData as any;

  if (f.conversion_rate > 10) {
    insights.push(`Strong checkout conversion at ${f.conversion_rate}% — well above baseline.`);
  } else if (f.conversion_rate > 0) {
    insights.push(`Checkout conversion at ${f.conversion_rate}% — room to improve CTA clarity or pricing messaging.`);
  }

  if (f.rates?.view_to_cta < 5 && f.page_views > 100) {
    insights.push(`Only ${f.rates?.view_to_cta}% of visitors click a CTA — consider more prominent or earlier CTA placement.`);
  }

  if (f.dropoffs?.checkout_to_success > 40) {
    insights.push(`${f.dropoffs.checkout_to_success}% of checkout starts don't complete — check for payment friction or pricing hesitation.`);
  }

  if (s.engagement_rate > 50) {
    insights.push(`${s.engagement_rate}% of sessions are engaged (multi-page or product interaction) — strong intent signal.`);
  } else if (s.engagement_rate > 0) {
    insights.push(`Engagement rate is ${s.engagement_rate}% — many single-page visits suggest homepage is not converting to exploration.`);
  }

  if (sd.available && sd.pct_under_10s > 50) {
    insights.push(`${sd.pct_under_10s}% of sessions are under 10s — high bounce rate, review landing page relevance.`);
  }

  if (sd.available && sd.pct_over_60s > 30) {
    insights.push(`${sd.pct_over_60s}% of sessions last over 60s — strong product engagement from those who stay.`);
  }

  const topCtaArr = Array.isArray(ctaData) ? ctaData : [];
  if (topCtaArr.length > 0) {
    const best = topCtaArr[0] as any;
    const rangeLabel = hours !== null ? `${hours}h` : `${days}d`;
    insights.push(`Top CTA: "${best.button_text || best.event}" with ${best.clicks} clicks in last ${rangeLabel}.`);
  }

  // Recommended actions
  const actions: string[] = [];
  if (f.gate_views > 0 && f.neeko_plus_clicks < f.gate_views * 0.1) {
    actions.push("Premium gate is showing but conversion is low — review gate messaging and CTA copy.");
  }
  if (f.checkout_started > 0 && f.checkout_success < f.checkout_started * 0.5) {
    actions.push("More than half of checkouts are not completing — review Stripe error logs.");
  }
  if (f.landing_cta_clicks === 0 && f.cta_clicks === 0) {
    actions.push("No CTA clicks tracked at all — verify trackCTA() is wired to buttons and not suppressed by the admin route guard.");
  } else if (f.landing_cta_clicks === 0 && f.cta_clicks > 0) {
    actions.push(`No landing page CTA clicks (product CTAs = ${f.cta_clicks}) — landing_cta_clicks counts only cta_location matching "landing_*". If landing CTAs are intentionally routed as product CTAs this is expected.`);
  }
  if (f.locked_cell_clicks === 0 && f.gate_views > 0) {
    actions.push("Gate views exist but no locked cell clicks — verify trackLockedDataClick() is being called.");
  }

  // Data integrity notes surfaced to the frontend
  const dataNotes: string[] = [];
  if (f.checkout_success > 0 && f.checkout_started === 0) {
    dataNotes.push(
      `Purchases (${f.checkout_success}) comes from PostHog "subscription_activated" events fired on the /success page. ` +
      `Checkout Starts = 0 means no "checkout_started" events were recorded in this window — ` +
      `these two counts may cover different time periods or the checkout_started event is not firing consistently.`
    );
  }
  if (f.checkout_success > f.checkout_started && f.checkout_started > 0) {
    dataNotes.push(
      `Purchases (${f.checkout_success}) exceeds Checkout Starts (${f.checkout_started}). ` +
      `This typically means returning subscribers fire "subscription_activated" again on re-login, ` +
      `or checkout_started is being filtered out. Conversion rates are unreliable when this occurs.`
    );
  }
  if (f.cta_clicks === 0 && f.page_views > 50) {
    dataNotes.push(
      `CTA Clicks = 0 despite ${f.page_views} page views. ` +
      `Verify that CTA tracking functions (trackLandingCTA, trackFreeGamesCTA, trackUnlockAllGames, etc.) ` +
      `are wired to buttons and not being suppressed by the admin route guard.`
    );
  }
  if (f.gate_views === 0 && f.page_views > 50) {
    dataNotes.push(
      `Gate Views = 0. The "gate_viewed" event is not firing. ` +
      `Wire trackGateInteraction({ action: "viewed", ... }) to stat-board locked state renders.`
    );
  }
  if ((sessionData as any).total_sessions === 0 && f.page_views > 0) {
    dataNotes.push(
      `Sessions = 0 despite ${f.page_views} page views. ` +
      `This dashboard tries both PostHog's native $session_id and the custom session_id property sent by analytics.ts. ` +
      `If both are absent, session grouping returns 0. ` +
      `Check that posthog.init() has persistence enabled (it does) and that events are being captured from real browser sessions.`
    );
  }
  // Device/referrer count clarification — always add for transparency
  dataNotes.push(
    `Device Breakdown and Traffic Sources show pageview event counts, not unique sessions. ` +
    `True session counts require properties.$session_id grouping.`
  );

  return {
    funnel: funnelData,
    cta_performance: ctaData,
    devices: deviceData,
    sessions: sessionData,
    top_pages: pagesData,
    acquisition: acqData,
    session_review_shortlist: sessionReviewData,
    session_duration: sdData,
    time_on_page: topData,
    recent_conversions: recentConversionsData,
    behaviour_insights: insights,
    recommended_actions: actions,
    data_notes: dataNotes,
    date_range_days: hours !== null ? null : days,
    date_range_hours: hours,
    include_admin: includeAdmin,
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

    // Support hours-based ranges (12, 24) and days-based ranges (1, 3, 7, 14, 30)
    const rawHours = body?.hours !== undefined ? Number(body.hours) : null;
    const rawDays = body?.days !== undefined ? Number(body.days) : 7;

    const hours: number | null = rawHours !== null && [12, 24].includes(rawHours) ? rawHours : null;
    const days: number = [1, 3, 7, 14, 30].includes(rawDays) ? rawDays : 7;

    // include_admin toggle — defaults false (customer-only)
    const includeAdmin: boolean = body?.include_admin === true;

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
        getDailyActiveUsers(posthogApiKey, posthogProjectId, posthogHost, includeAdmin),
        getEventCounts(posthogApiKey, posthogProjectId, posthogHost, 30, null, includeAdmin),
        getEventCounts(posthogApiKey, posthogProjectId, posthogHost, 7, null, includeAdmin),
      ]);

      result.active_users = activeUsers.status === "fulfilled" ? activeUsers.value : { dau: 0, wau: 0, mau: 0 };
      result.event_counts_30d = eventCounts30d.status === "fulfilled" ? eventCounts30d.value : {};
      result.event_counts_7d = eventCounts7d.status === "fulfilled" ? eventCounts7d.value : {};
    }

    if (section === "activity" || section === "all") {
      const [recentEvents, activeNow] = await Promise.allSettled([
        getRecentActivity(posthogApiKey, posthogProjectId, posthogHost, 50, includeAdmin),
        getActiveNow(posthogApiKey, posthogProjectId, posthogHost, includeAdmin),
      ]);

      result.recent_events = recentEvents.status === "fulfilled" ? recentEvents.value : [];
      result.active_now = activeNow.status === "fulfilled" ? activeNow.value : { active_5min: 0, active_30min: 0 };
    }

    if (section === "acquisition" || section === "all") {
      const acquisition = await getAcquisitionData(posthogApiKey, posthogProjectId, posthogHost, days, hours, includeAdmin);
      result.acquisition = acquisition;
    }

    if (section === "engagement" || section === "all") {
      const [topPages, featureUsage, activeUsers] = await Promise.allSettled([
        getTopPages(posthogApiKey, posthogProjectId, posthogHost, 30, null, includeAdmin),
        getFeatureUsage(posthogApiKey, posthogProjectId, posthogHost, includeAdmin),
        getDailyActiveUsers(posthogApiKey, posthogProjectId, posthogHost, includeAdmin),
      ]);

      result.top_pages = topPages.status === "fulfilled" ? topPages.value : [];
      result.feature_usage = featureUsage.status === "fulfilled" ? featureUsage.value : [];
      result.session_metrics = activeUsers.status === "fulfilled" ? activeUsers.value : { dau: 0, wau: 0, mau: 0 };
    }

    if (section === "funnels" || section === "conversion") {
      const funnelData = await getFunnelData(posthogApiKey, posthogProjectId, posthogHost, days, hours, includeAdmin);
      result.funnel = funnelData;
    }

    if (section === "marketing") {
      const insights = await getMarketingInsights(posthogApiKey, posthogProjectId, posthogHost, days, hours, includeAdmin);
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
