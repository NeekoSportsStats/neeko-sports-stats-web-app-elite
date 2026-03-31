// Safe PostHog wrapper - gracefully handles missing/broken module
let posthog: any = null;
let posthogLoaded = false;

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

// Lazy load PostHog only when needed
async function loadPostHog() {
  if (posthogLoaded) return posthog;

  try {
    const posthogModule = await import("posthog-js");
    posthog = posthogModule.default;
    posthogLoaded = true;
    return posthog;
  } catch (e) {
    console.warn("PostHog module not available");
    posthogLoaded = true;
    return null;
  }
}

/* =============================
   INIT
============================= */
export async function initAnalytics() {
  if (typeof window === "undefined") return;

  try {
    const ph = await loadPostHog();
    if (!ph) {
      console.log("Analytics disabled - PostHog not available");
      return;
    }

    getSessionId();

    const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
    const host =
      (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
      "https://eu.posthog.com";

    if (!key) {
      console.log("Analytics disabled - no PostHog key");
      return;
    }

    ph.init(key, {
      api_host: host,
      capture_pageview: true,
      persistence: "localStorage",
      advanced_disable_feature_flags: true,
    });

    console.log("Analytics initialized");
  } catch (err) {
    console.warn("Analytics init failed:", err);
  }
}

/* =============================
   TRACK EVENT
============================= */
export function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (!posthog) return;

  try {
    posthog.capture(event, {
      ...properties,
      session_id: getSessionId(),
    });
  } catch (err) {
    console.warn("[analytics] posthog failed:", err);
  }
}

/* =============================
   IDENTIFY USER
============================= */
export function identifyUser(user: { id: string; email?: string }) {
  if (typeof window === "undefined") return;
  if (!posthog) return;

  try {
    if (!user?.id) return;

    posthog.identify(user.id, {
      email: user.email ?? undefined,
    });
  } catch (err) {
    console.warn("PostHog identify failed", err);
  }
}

/* =============================
   RESET USER
============================= */
export function resetUser() {
  if (typeof window === "undefined") return;
  if (!posthog) return;

  try {
    posthog.reset();
  } catch (err) {
    console.warn("PostHog reset failed", err);
  }
}