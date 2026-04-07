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

/* =============================
   INIT
============================= */
export function initAnalytics() {
  if (typeof window === "undefined") return;

  try {
    getSessionId();

    const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
    const host =
      (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
      "https://eu.posthog.com"; // ✅ FIXED HOST

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
   TRACK EVENT
============================= */
export function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;

  try {
    posthog.capture(event, {
      ...properties,
      session_id: getSessionId(), // helpful for debugging
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