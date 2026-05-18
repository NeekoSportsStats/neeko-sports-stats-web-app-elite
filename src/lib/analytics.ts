import posthog from "posthog-js";

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

    if (!key) {
      return;
    }

    posthog.init(key, {
      api_host: host,
      capture_pageview: true,
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

  const adsId = import.meta.env.VITE_GOOGLE_ADS_ID as string | undefined;
  if (!adsId || !adsId.startsWith("AW-")) {
    if (isLocalhost()) {
      console.debug("[Analytics] VITE_GOOGLE_ADS_ID not set — Google Ads tag skipped.");
    }
    return;
  }

  // Prevent duplicate script injection
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
   ATTRIBUTION CAPTURE
============================= */
export function captureAttribution() {
  if (typeof window === "undefined") return;

  try {
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

    if (Object.keys(attribution).length === 0) return;

    localStorage.setItem("neeko_attribution", JSON.stringify(attribution));
    posthog.register(attribution);
  } catch {
    // non-critical
  }
}

/* =============================
   TRACK EVENT
============================= */
export function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;

  try {
    posthog.capture(event, {
      ...properties,
      session_id: getSessionId(),
    });
  } catch {
    // non-critical
  }
}

/* =============================
   IDENTIFY USER
============================= */
export function identifyUser(user: { id: string; email?: string }) {
  if (typeof window === "undefined") return;

  try {
    if (!user?.id) return;

    posthog.identify(user.id, {
      email: user.email ?? undefined,
    });
  } catch {
    // non-critical
  }
}

/* =============================
   RESET USER
============================= */
export function resetUser() {
  if (typeof window === "undefined") return;

  try {
    posthog.reset();
  } catch {
    // non-critical
  }
}
