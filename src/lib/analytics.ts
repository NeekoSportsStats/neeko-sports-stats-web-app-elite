import posthog from "posthog-js";

/* =============================
   SESSION
============================= */
const SESSION_KEY = "neeko_session_id";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = localStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

/* =============================
   ROUTE GUARDS
============================= */
function isAdminRoute(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/admin");
}

function isLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

/* =============================
   PAGE PATH HELPERS
============================= */
export function getCleanPagePath(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname;
}

/* =============================
   ATTRIBUTION
============================= */
const TIKTOK_DOMAINS = [
  "tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com",
];

function isTikTokReferrer(referrer: string): boolean {
  try {
    const hostname = new URL(referrer).hostname;
    return TIKTOK_DOMAINS.some(d => hostname === d || hostname.endsWith("." + d));
  } catch {
    return false;
  }
}

function buildAttributionFromUrl(): Record<string, string> | null {
  const params = new URLSearchParams(window.location.search);
  const attribution: Record<string, string> = {};

  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    const val = params.get(key);
    if (val) attribution[key] = val;
  }

  for (const key of ["gclid", "wbraid", "gbraid"]) {
    const val = params.get(key);
    if (val) attribution[key] = val;
  }

  // Infer TikTok from referrer if no UTMs present
  if (Object.keys(attribution).length === 0) {
    const referrer = document.referrer;
    if (referrer && isTikTokReferrer(referrer)) {
      attribution["utm_source"] = "tiktok";
      attribution["utm_medium"] = "social";
      attribution["inferred_from_referrer"] = "true";
    }
  }

  return Object.keys(attribution).length > 0 ? attribution : null;
}

function getFirstTouchAttribution(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem("neeko_first_touch_attribution");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function getLastTouchAttribution(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem("neeko_last_touch_attribution");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Call on every navigation. Persists first-touch once, always updates last-touch. */
export function captureAttribution() {
  if (typeof window === "undefined") return;

  try {
    const current = buildAttributionFromUrl();

    if (current) {
      // First touch: only save if not already stored
      if (!getFirstTouchAttribution()) {
        localStorage.setItem("neeko_first_touch_attribution", JSON.stringify(current));
      }
      // Last touch: always update when UTM/attribution params present
      localStorage.setItem("neeko_last_touch_attribution", JSON.stringify(current));

      // Also keep legacy key for backward compat with existing baseProperties()
      localStorage.setItem("neeko_attribution", JSON.stringify(current));

      posthog.register(current);
    }
  } catch {
    // non-critical
  }
}

/* =============================
   BASE PROPERTIES
============================= */
function baseProperties(): Record<string, unknown> {
  const firstTouch = getFirstTouchAttribution();
  const lastTouch = getLastTouchAttribution();
  const pagePath = getCleanPagePath();

  return {
    session_id: getSessionId(),
    page_path: pagePath,
    clean_page_path: pagePath,
    is_admin: isAdminRoute(),
    ...(firstTouch ? { first_touch_source: firstTouch.utm_source, first_touch_medium: firstTouch.utm_medium, first_touch_campaign: firstTouch.utm_campaign } : {}),
    ...(lastTouch ? { last_touch_source: lastTouch.utm_source, last_touch_medium: lastTouch.utm_medium, last_touch_campaign: lastTouch.utm_campaign } : {}),
    // Fallback: legacy flat attribution (for events that don't go through trackCTA)
    ...(() => {
      try {
        const raw = localStorage.getItem("neeko_attribution");
        return raw ? JSON.parse(raw) : {};
      } catch { return {}; }
    })(),
  };
}

/* =============================
   POSTHOG INIT
============================= */
export function initAnalytics() {
  if (typeof window === "undefined") return;

  try {
    getSessionId();

    const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
    const host =
      (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
      "https://eu.posthog.com";

    if (!key) return;

    posthog.init(key, {
      api_host: host,
      capture_pageview: false, // we fire page_viewed manually with clean_page_path
      persistence: "localStorage",
      advanced_disable_feature_flags: true,
    });
  } catch {
    // init failure is non-critical
  }
}

/* =============================
   GOOGLE ADS INIT
============================= */
export function initGoogleAds() {
  if (typeof window === "undefined") return;
  if (isAdminRoute()) return;

  const adsId = import.meta.env.VITE_GOOGLE_ADS_ID as string | undefined;
  if (!adsId || !adsId.startsWith("AW-")) {
    if (isLocalhost()) {
      console.debug("[Analytics] VITE_GOOGLE_ADS_ID not set — Google Ads tag skipped.");
    }
    return;
  }

  if (document.querySelector(`script[data-gtag-id="${adsId}"]`)) return;

  try {
    (window as any).dataLayer = (window as any).dataLayer ?? [];
    function gtag(..._args: any[]) {
      // eslint-disable-next-line prefer-rest-params
      (window as any).dataLayer.push(arguments);
    }
    (window as any).gtag = gtag;
    gtag("js", new Date());
    gtag("config", adsId);

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${adsId}`;
    script.setAttribute("data-gtag-id", adsId);
    document.head.appendChild(script);
  } catch {
    // non-critical
  }
}

/* =============================
   GOOGLE ADS PURCHASE CONVERSION
============================= */
export function trackGoogleAdsPurchase(params: {
  transactionId: string;
  value: number;
  currency: string;
  plan: string;
}) {
  if (typeof window === "undefined") return;
  if (isLocalhost()) return;
  if (isAdminRoute()) return;

  const adsId = import.meta.env.VITE_GOOGLE_ADS_ID as string | undefined;
  const label = import.meta.env.VITE_GOOGLE_ADS_PURCHASE_LABEL as string | undefined;

  if (!adsId || !adsId.startsWith("AW-") || !label) return;

  try {
    const gtag = (window as any).gtag;
    if (typeof gtag !== "function") return;

    gtag("event", "conversion", {
      send_to: `${adsId}/${label}`,
      transaction_id: params.transactionId,
      value: params.value,
      currency: params.currency,
    });
  } catch {
    // non-critical
  }
}

/* =============================
   TRACK EVENT (base)
============================= */
export function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;

  try {
    if (isLocalhost() && import.meta.env.DEV) {
      console.debug(`[Analytics] ${event}`, { ...baseProperties(), ...properties });
    }

    posthog.capture(event, {
      ...baseProperties(),
      ...properties,
    });
  } catch {
    // non-critical
  }
}

/* =============================
   PAGE VIEW
============================= */
export function trackPageView(path?: string) {
  if (isAdminRoute()) return;
  const pagePath = path ?? getCleanPagePath();
  track("page_viewed", {
    page_path: pagePath,
    clean_page_path: pagePath,
  });
}

/* =============================
   IDENTIFY / RESET USER
============================= */
export function identifyUser(user: { id: string; email?: string }) {
  if (typeof window === "undefined") return;

  try {
    if (!user?.id) return;
    posthog.identify(user.id, { email: user.email ?? undefined });
  } catch {
    // non-critical
  }
}

export function resetUser() {
  if (typeof window === "undefined") return;
  try { posthog.reset(); } catch { /* non-critical */ }
}

/* =============================
   UNIFIED CTA TRACKING
   All CTA clicks go through trackCTA() and fire as "cta_clicked"
============================= */
export interface CTAParams {
  cta_location: string;       // e.g. "landing_hero", "pricing_section", "stat_board_locked_banner"
  cta_text: string;           // button label
  cta_type?: string;          // "upgrade", "free", "unlock", "start_trial", etc.
  destination?: string;       // URL or route being navigated to
  plan?: string;              // plan name if relevant
  section?: string;           // sub-section within a page
  [key: string]: unknown;
}

export function trackCTA(params: CTAParams) {
  if (isAdminRoute()) return;
  track("cta_clicked", {
    current_path: getCleanPagePath(),
    ...params,
  });
}

/* =============================
   GATE / LOCKED DATA
============================= */
export function trackGateViewed(params: {
  gate_location: string;
  section?: string;
  stat_lens?: string;
}) {
  if (isAdminRoute()) return;
  track("gate_viewed", {
    current_path: getCleanPagePath(),
    ...params,
  });
}

export function trackLockedDataClick(params: {
  source: string;
  section?: string;
  stat_lens?: string;
}) {
  if (isAdminRoute()) return;
  track("locked_data_clicked", {
    current_path: getCleanPagePath(),
    ...params,
  });
}

/* =============================
   CHECKOUT TRACKING
============================= */
export function trackCheckoutStartClicked(params: {
  plan: string;
  price_id?: string;
  source?: string;
  button_text?: string;
}) {
  track("checkout_start_clicked", {
    current_path: getCleanPagePath(),
    ...params,
  });
}

export function trackCheckoutRedirectAttempted(params: {
  plan: string;
  price_id?: string;
  session_url_received?: boolean;
}) {
  track("checkout_redirect_attempted", {
    current_path: getCleanPagePath(),
    ...params,
  });
}

export function trackCheckoutEvent(
  event: "checkout_started" | "checkout_redirected" | "checkout_success" | "checkout_cancelled" | "checkout_error",
  properties?: Record<string, unknown>,
) {
  // Allow checkout_success even on admin routes (admin conversion test page)
  track(event, properties);
}

/* =============================
   ADMIN EVENT TRACKING
============================= */
export function trackAdminEvent(event: string, properties?: Record<string, unknown>) {
  track(event, { is_admin: true, ...properties });
}

/* =============================
   ENGAGEMENT TRACKING (heartbeat + scroll)
============================= */
let heartbeatTimers: ReturnType<typeof setTimeout>[] = [];
let scrollListenerAttached = false;
let scrollDepthsFired = new Set<number>();

export function startEngagementTracking() {
  if (typeof window === "undefined") return;
  if (isAdminRoute()) return;

  // Clear existing
  stopEngagementTracking();

  // Heartbeat events at 15s, 30s, 60s
  heartbeatTimers = [
    setTimeout(() => track("session_heartbeat_15s", { current_path: getCleanPagePath() }), 15_000),
    setTimeout(() => track("session_heartbeat_30s", { current_path: getCleanPagePath() }), 30_000),
    setTimeout(() => track("session_heartbeat_60s", { current_path: getCleanPagePath() }), 60_000),
  ];

  // Scroll depth
  if (!scrollListenerAttached) {
    scrollDepthsFired = new Set();

    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (docHeight <= 0) return;

      const pct = Math.round((scrollTop / docHeight) * 100);

      for (const threshold of [25, 50, 75, 100]) {
        if (pct >= threshold && !scrollDepthsFired.has(threshold)) {
          scrollDepthsFired.add(threshold);
          track("scroll_depth_reached", {
            depth_pct: threshold,
            current_path: getCleanPagePath(),
          });
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    scrollListenerAttached = true;
  }
}

export function stopEngagementTracking() {
  for (const t of heartbeatTimers) clearTimeout(t);
  heartbeatTimers = [];
}

/* =============================
   LEGACY ADAPTERS
   Keep existing callers working. These all delegate to trackCTA().
============================= */

export function trackMarketingClick(params: {
  button_text: string;
  source: string;
  target_url?: string;
  section?: string;
  plan?: string;
}) {
  trackCTA({
    cta_location: params.source ?? "marketing",
    cta_text: params.button_text,
    cta_type: "marketing",
    destination: params.target_url,
    section: params.section,
    plan: params.plan,
  });
}

export function trackLandingCTA(params: {
  button_text: string;
  section: string;
  target_url?: string;
}) {
  trackCTA({
    cta_location: "landing_" + (params.section ?? "unknown"),
    cta_text: params.button_text,
    cta_type: "upgrade",
    destination: params.target_url,
    section: params.section,
  });
}

export function trackPricingCTA(params: {
  plan: string;
  button_text: string;
  source: string;
}) {
  trackCTA({
    cta_location: "pricing_" + (params.source ?? "section"),
    cta_text: params.button_text,
    cta_type: "upgrade",
    plan: params.plan,
    section: "pricing",
  });
}

export function trackNeekoPlus(params: {
  source: string;
  button_text?: string;
  plan?: string;
}) {
  trackCTA({
    cta_location: params.source ?? "neeko_plus",
    cta_text: params.button_text ?? "Get Neeko+",
    cta_type: "upgrade",
    plan: params.plan,
  });
}

export function trackProductInteraction(
  event: string,
  properties?: Record<string, unknown>,
) {
  if (isAdminRoute()) return;
  track(event, properties);
}

export function trackGateInteraction(params: {
  source: string;
  page_path?: string;
  section?: string;
  action: "viewed" | "cta_clicked";
}) {
  if (isAdminRoute()) return;
  if (params.action === "viewed") {
    trackGateViewed({ gate_location: params.source, section: params.section });
  } else {
    trackCTA({
      cta_location: params.source ?? "gate",
      cta_text: "Upgrade",
      cta_type: "gate_cta",
      section: params.section,
    });
  }
}

export function trackFreeGamesCTA(params: {
  button_text: string;
  source: string;
  section?: string;
  match_label?: string;
}) {
  trackCTA({
    cta_location: params.source ?? "free_games",
    cta_text: params.button_text,
    cta_type: "free",
    section: params.section,
    match_label: params.match_label,
  });
}

export function trackUnlockAllGames(params: {
  source: string;
  button_text?: string;
  section?: string;
}) {
  trackCTA({
    cta_location: params.source ?? "unlock_all",
    cta_text: params.button_text ?? "Unlock All",
    cta_type: "unlock",
    section: params.section,
  });
}

export function trackUnlockMatchup(params: {
  source: string;
  match_label?: string;
  section?: string;
}) {
  trackCTA({
    cta_location: params.source ?? "unlock_matchup",
    cta_text: "Unlock Matchup",
    cta_type: "unlock",
    section: params.section,
    match_label: params.match_label,
  });
}

export function trackStatBoardUpgrade(params: {
  source: string;
  button_text: string;
  section?: string;
}) {
  trackCTA({
    cta_location: params.source ?? "stat_board",
    cta_text: params.button_text,
    cta_type: "upgrade",
    section: params.section,
  });
}

export function trackMobileStickyCTA(params: {
  button_text: string;
  state: "free" | "locked";
}) {
  trackCTA({
    cta_location: "mobile_sticky_bar",
    cta_text: params.button_text,
    cta_type: params.state === "locked" ? "upgrade" : "free",
    section: "mobile_sticky",
  });
}

export function trackViewFreeGames(params: {
  source: string;
  section?: string;
  match_label?: string;
}) {
  trackCTA({
    cta_location: params.source ?? "view_free_games",
    cta_text: "View Free Games",
    cta_type: "free",
    section: params.section,
    match_label: params.match_label,
  });
}

export function trackUnlockFullRound(params: {
  source: string;
  round?: number | string;
  section?: string;
}) {
  trackCTA({
    cta_location: params.source ?? "unlock_full_round",
    cta_text: "Unlock Full Round",
    cta_type: "upgrade",
    section: params.section,
    round: params.round,
  });
}
