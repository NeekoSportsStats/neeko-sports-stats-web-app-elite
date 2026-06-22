import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import posthog from "posthog-js";
import { FreeRoundPreviewTable } from "@/components/landing/FreeRoundPreviewTable";

// ── Build marker — proves this exact code is running in production ────────────
const BUILD_MARKER = "cta_hotfix_v6";

// ── Feature flags ─────────────────────────────────────────────────────────────
const ENABLE_TIKTOK_STICKY_CTA = false;

// ── UTM helpers ───────────────────────────────────────────────────────────────

function getUtmParams(search: string): Record<string, string> {
  const p = new URLSearchParams(search);
  const result: Record<string, string> = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const v = p.get(key);
    if (v) result[key] = v;
  }
  return result;
}

function appendUtms(url: string, utms: Record<string, string>): string {
  if (Object.keys(utms).length === 0) return url;
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + new URLSearchParams(utms).toString();
}

function detectInAppBrowser(): boolean {
  const ua = navigator.userAgent;
  return /FBAN|FBAV|Instagram|TikTok|BytedanceWebview|Musical\.ly/i.test(ua);
}

function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/Mobi|Android/i.test(ua)) return "mobile";
  if (/Tablet|iPad/i.test(ua)) return "tablet";
  return "desktop";
}

// ── Analytics ────────────────────────────────────────────────────────────────

function fireTikTokEvent(
  name: string,
  utms: Record<string, string>,
  extra?: Record<string, unknown>,
) {
  try {
    const loadTimeMs = performance.now();
    let fcpMs: number | null = null;
    let lcpMs: number | null = null;

    try {
      const entries = performance.getEntriesByType("paint");
      const fcpEntry = entries.find((e) => e.name === "first-contentful-paint");
      if (fcpEntry) fcpMs = Math.round(fcpEntry.startTime);
    } catch { /* ignore */ }

    try {
      const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
      if (lcpEntries.length > 0) lcpMs = Math.round(lcpEntries[lcpEntries.length - 1].startTime);
    } catch { /* ignore */ }

    posthog.capture(name, {
      clean_page_path: "/tiktok",
      utm_source: utms.utm_source ?? null,
      utm_medium: utms.utm_medium ?? null,
      utm_campaign: utms.utm_campaign ?? null,
      utm_content: utms.utm_content ?? null,
      referrer: document.referrer || null,
      device_type: getDeviceType(),
      browser: navigator.userAgent,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      load_time_ms: Math.round(loadTimeMs),
      fcp_ms: fcpMs,
      lcp_ms: lcpMs,
      in_app_browser: detectInAppBrowser(),
      ...extra,
    });
  } catch { /* non-critical */ }
}

const PAID_TRACKING = {
  plan_key: "round_pass_7d",
  billing_type: "one_time",
  value: 7.99,
  currency: "AUD",
} as const;

// ── HardenedTikTokLink ────────────────────────────────────────────────────────
// WebView-safe CTA. Tracks gesture movement to distinguish real taps from scrolls.
// Forces navigation via window.location.assign only on confirmed taps.

const TAP_MOVE_THRESHOLD_PX = 15;
const TAP_MAX_DURATION_MS = 2500;

interface HardenedTikTokLinkProps {
  href: string;
  cta_type: string;
  cta_text: string;
  cta_location: string;
  destination: string;
  plan_key?: string;
  billing_type?: string;
  value?: number;
  currency?: string;
  utms: Record<string, string>;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

function HardenedTikTokLink({
  href,
  cta_type,
  cta_text,
  cta_location,
  destination,
  plan_key,
  billing_type,
  value,
  currency,
  utms,
  style,
  children,
}: HardenedTikTokLinkProps) {
  const lastNavigated = useRef(0);
  const gestureActive = useRef(false);
  const gestureCancelled = useRef(false);
  const cancelReason = useRef("");
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const maxDeltaX = useRef(0);
  const maxDeltaY = useRef(0);
  const maxDistance = useRef(0);

  const baseProps = () => ({
    build_marker: BUILD_MARKER,
    cta_type,
    cta_text,
    cta_location,
    destination,
    href,
    ...(plan_key !== undefined && { plan_key }),
    ...(billing_type !== undefined && { billing_type }),
    ...(value !== undefined && { value }),
    ...(currency !== undefined && { currency }),
    page: "tiktok",
    source_page: "/tiktok",
    clean_page_path: "/tiktok",
    device_type: getDeviceType(),
    in_app_browser: detectInAppBrowser(),
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    ua: navigator.userAgent,
    current_pathname: window.location.pathname,
    current_href: window.location.href,
    client_ts: Date.now(),
    ...utms,
  });

  const gestureProps = (dxFinal = 0, dyFinal = 0) => ({
    delta_x: dxFinal,
    delta_y: dyFinal,
    max_delta_x: maxDeltaX.current,
    max_delta_y: maxDeltaY.current,
    max_distance: maxDistance.current,
    touch_duration_ms: Date.now() - startTime.current,
    gesture_cancelled: gestureCancelled.current,
  });

  const resetGesture = () => {
    gestureActive.current = false;
    gestureCancelled.current = false;
    cancelReason.current = "";
    maxDeltaX.current = 0;
    maxDeltaY.current = 0;
    maxDistance.current = 0;
  };

  const cancelGesture = (reason: string, dxFinal = 0, dyFinal = 0) => {
    gestureCancelled.current = true;
    cancelReason.current = reason;
    try {
      posthog.capture("cta_touch_cancelled", {
        ...baseProps(),
        ...gestureProps(dxFinal, dyFinal),
        event_type: reason,
        cancel_reason: reason,
        gesture_cancelled: true,
      });
    } catch { /* non-critical */ }
  };

  const confirmNavigation = (eventType: string, dxFinal = 0, dyFinal = 0) => {
    const now = Date.now();
    if (now - lastNavigated.current < 1000) return;
    lastNavigated.current = now;

    const navMethod = eventType === "click"
      ? "click_location_assign"
      : eventType === "pointer_up"
      ? "pointerup_location_assign"
      : "touchend_location_assign";

    const props = {
      ...baseProps(),
      ...gestureProps(dxFinal, dyFinal),
      event_type: eventType,
      navigation_method: navMethod,
      gesture_cancelled: false,
    };

    try {
      posthog.capture("cta_clicked", props);
      posthog.capture("tiktok_cta_navigation_started", props);
      posthog.capture("tiktok_cta_navigation_attempted", { ...props, event_type: "forced_navigation" });
    } catch { /* non-critical — must not block navigation */ }

    if (import.meta.env.DEV) {
      console.log("[TikTok CTA v4]", eventType, cta_type, cta_location, "→", destination);
    }

    window.location.assign(href);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLAnchorElement>) => {
    if (e.pointerType === "mouse") return;
    gestureActive.current = true;
    gestureCancelled.current = false;
    cancelReason.current = "";
    startX.current = e.clientX;
    startY.current = e.clientY;
    startTime.current = Date.now();
    maxDeltaX.current = 0;
    maxDeltaY.current = 0;
    maxDistance.current = 0;
    try {
      posthog.capture("cta_touch_started", {
        ...baseProps(),
        event_type: "pointer_down",
        navigation_method: "native_anchor",
        gesture_cancelled: false,
        delta_x: 0, delta_y: 0,
        max_delta_x: 0, max_delta_y: 0,
        max_distance: 0, touch_duration_ms: 0,
      });
    } catch { /* non-critical */ }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLAnchorElement>) => {
    if (!gestureActive.current || gestureCancelled.current) return;
    if (e.pointerType === "mouse") return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    const dist = Math.sqrt(dx * dx + dy * dy);
    maxDeltaX.current = Math.max(maxDeltaX.current, Math.abs(dx));
    maxDeltaY.current = Math.max(maxDeltaY.current, Math.abs(dy));
    maxDistance.current = Math.max(maxDistance.current, dist);
    if (Math.abs(dx) > TAP_MOVE_THRESHOLD_PX || Math.abs(dy) > TAP_MOVE_THRESHOLD_PX) {
      cancelGesture("movement_threshold", dx, dy);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLAnchorElement>) => {
    if (!gestureActive.current) return;
    if (e.pointerType === "mouse") return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    const duration = Date.now() - startTime.current;
    const dist = Math.sqrt(dx * dx + dy * dy);
    maxDeltaX.current = Math.max(maxDeltaX.current, Math.abs(dx));
    maxDeltaY.current = Math.max(maxDeltaY.current, Math.abs(dy));
    maxDistance.current = Math.max(maxDistance.current, dist);

    if (gestureCancelled.current) {
      cancelGesture(cancelReason.current || "movement_threshold", dx, dy);
      resetGesture();
      return;
    }
    if (Math.abs(dx) > TAP_MOVE_THRESHOLD_PX || Math.abs(dy) > TAP_MOVE_THRESHOLD_PX) {
      cancelGesture("movement_threshold", dx, dy);
      resetGesture();
      return;
    }
    if (duration > TAP_MAX_DURATION_MS) {
      cancelGesture("duration_threshold", dx, dy);
      resetGesture();
      return;
    }
    resetGesture();
    confirmNavigation("pointer_up", dx, dy);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLAnchorElement>) => {
    if (!gestureActive.current) return;
    if (e.pointerType === "mouse") return;
    cancelGesture("pointer_cancel");
    resetGesture();
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLAnchorElement>) => {
    if (!gestureActive.current || gestureCancelled.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;
    const dist = Math.sqrt(dx * dx + dy * dy);
    maxDeltaX.current = Math.max(maxDeltaX.current, Math.abs(dx));
    maxDeltaY.current = Math.max(maxDeltaY.current, Math.abs(dy));
    maxDistance.current = Math.max(maxDistance.current, dist);
    if (Math.abs(dx) > TAP_MOVE_THRESHOLD_PX || Math.abs(dy) > TAP_MOVE_THRESHOLD_PX) {
      cancelGesture("movement_threshold", dx, dy);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLAnchorElement>) => {
    if (!gestureActive.current) return;
    const touch = e.changedTouches[0];
    const dx = touch ? touch.clientX - startX.current : 0;
    const dy = touch ? touch.clientY - startY.current : 0;
    const duration = Date.now() - startTime.current;

    if (gestureCancelled.current) {
      cancelGesture(cancelReason.current || "movement_threshold", dx, dy);
      resetGesture();
      return;
    }
    if (Math.abs(dx) > TAP_MOVE_THRESHOLD_PX || Math.abs(dy) > TAP_MOVE_THRESHOLD_PX) {
      cancelGesture("movement_threshold", dx, dy);
      resetGesture();
      return;
    }
    if (duration > TAP_MAX_DURATION_MS) {
      cancelGesture("duration_threshold", dx, dy);
      resetGesture();
      return;
    }
    e.preventDefault();
    resetGesture();
    confirmNavigation("touch_end", dx, dy);
  };

  const handleTouchCancel = () => {
    if (!gestureActive.current) return;
    cancelGesture("touch_cancel");
    resetGesture();
  };

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (gestureCancelled.current) {
      e.preventDefault();
      resetGesture();
      return;
    }
    const now = Date.now();
    if (now - lastNavigated.current < 1000) {
      e.preventDefault();
      return;
    }
    confirmNavigation("click");
    e.preventDefault();
  };

  return (
    <a
      href={href}
      onPointerDownCapture={handlePointerDown}
      onPointerMoveCapture={handlePointerMove}
      onPointerUpCapture={handlePointerUp}
      onPointerCancelCapture={handlePointerCancel}
      onTouchMoveCapture={handleTouchMove}
      onTouchEndCapture={handleTouchEnd}
      onTouchCancelCapture={handleTouchCancel}
      onClickCapture={handleClick}
      style={style}
    >
      {children}
    </a>
  );
}

// ── Shared CTA anchor styles ──────────────────────────────────────────────────

const anchorBase: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  cursor: "pointer",
  touchAction: "pan-y manipulation",
  WebkitTapHighlightColor: "transparent",
  userSelect: "none",
  position: "relative",
  zIndex: 9999,
  pointerEvents: "auto",
  minHeight: 48,
  width: "100%",
  borderRadius: 13,
  fontWeight: 900,
  letterSpacing: "-0.01em",
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TikTokLanding() {
  const location = useLocation();
  const utms = getUtmParams(location.search);

  const heroRef = useRef<HTMLDivElement>(null);
  const [stickyVisible, setStickyVisible] = useState(false);
  const [stickyDismissed, setStickyDismissed] = useState(false);
  const firedCTAVisible = useRef(false);
  const firedScroll = useRef(false);

  // tiktok_landing_loaded + build marker — on first render
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "AFL Stats This Week | Neeko Sports Stats";
    let metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = metaDesc?.content ?? null;
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.name = "description";
      document.head.appendChild(metaDesc);
    }
    metaDesc.content =
      "See AFL player hit rates, recent form and matchup trends. Free game boards available.";
    fireTikTokEvent("tiktok_landing_loaded", utms);
    try {
      posthog.capture("tiktok_landing_build_marker", {
        page: "tiktok",
        marker: BUILD_MARKER,
        clean_page_path: "/tiktok",
        device_type: getDeviceType(),
        in_app_browser: detectInAppBrowser(),
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
      });
    } catch { /* non-critical */ }
    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc !== null) metaDesc.content = prevDesc;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // tiktok_landing_5s_alive — after 5s
  useEffect(() => {
    const t = setTimeout(() => {
      fireTikTokEvent("tiktok_landing_5s_alive", utms);
    }, 5000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sticky CTA after 3s (gated by feature flag)
  useEffect(() => {
    if (!ENABLE_TIKTOK_STICKY_CTA) return;
    const t = setTimeout(() => {
      if (!stickyDismissed) setStickyVisible(true);
    }, 3000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // tiktok_landing_scroll
  useEffect(() => {
    function onScroll() {
      if (!firedScroll.current) {
        firedScroll.current = true;
        fireTikTokEvent("tiktok_landing_scroll", utms);
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // tiktok_landing_cta_visible — when hero CTA stack enters viewport
  useEffect(() => {
    if (!heroRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !firedCTAVisible.current) {
          firedCTAVisible.current = true;
          fireTikTokEvent("tiktok_landing_cta_visible", utms);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(heroRef.current);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Destination URLs ────────────────────────────────────────────────────────
  const freeHref  = appendUtms("/stat-board/players", utms);
  const paidHref  = appendUtms("/start-checkout?plan_key=round_pass_7d", utms);
  const plansHref = appendUtms("/neeko-plus?plan=round_pass_7d", utms);

  return (
    <div
      data-build-marker={BUILD_MARKER}
      style={{
        minHeight: "100vh",
        background: "#080c10",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        position: "relative",
        zIndex: 0,
      }}
    >
      <div style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "clamp(24px, 7vw, 48px) clamp(16px, 5vw, 28px) 0",
      }}>

        {/* ── 1. Brand badge ── */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          background: "rgba(224,174,45,0.09)",
          border: "1px solid rgba(224,174,45,0.22)",
          borderRadius: 999,
          padding: "5px 13px 5px 10px",
          marginBottom: 20,
        }}>
          <span style={{
            display: "inline-block",
            width: 6, height: 6,
            borderRadius: "50%",
            background: "#E0AE2D",
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: 10, fontWeight: 900, letterSpacing: "0.24em",
            textTransform: "uppercase", color: "#E0AE2D",
          }}>
            Neeko Sports Stats
          </span>
        </div>

        {/* ── 2. Headline ── */}
        <h1 style={{
          fontSize: "clamp(1.85rem, 7.5vw, 2.6rem)",
          fontWeight: 900,
          color: "#F0F4F8",
          letterSpacing: "-0.03em",
          lineHeight: 1.06,
          margin: "0 0 12px",
        }}>
          AFL stats for<br />
          <span style={{ color: "#E0AE2D" }}>this week's games.</span>
        </h1>

        {/* ── 3. Value proposition ── */}
        <p style={{
          fontSize: "clamp(14px, 3.5vw, 16px)",
          color: "rgba(255,255,255,0.52)",
          lineHeight: 1.5,
          margin: "0 0 6px",
        }}>
          See player hit rates, recent form and matchup trends in seconds.
        </p>

        <p style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.28)",
          margin: "0 0 26px",
        }}>
          Free game boards available. No card needed.
        </p>

        {/* ── 4 & 5. CTA stack ── */}
        <div
          ref={heroRef}
          style={{ display: "flex", flexDirection: "column", gap: 10, pointerEvents: "auto" }}
        >

          {/* Free CTA */}
          <HardenedTikTokLink
            href={freeHref}
            cta_type="free"
            cta_text="View Free Games"
            cta_location="tiktok_landing_hero"
            destination="/stat-board/players"
            utms={utms}
            style={{
              ...anchorBase,
              padding: "16px",
              background: "linear-gradient(160deg, #3b82f6 0%, #1d4ed8 100%)",
              color: "#eff6ff",
              fontSize: 16,
              boxShadow: "0 6px 24px rgba(59,130,246,0.28)",
            }}
          >
            View Free Games
          </HardenedTikTokLink>

          {/* Paid CTA — direct to checkout */}
          <HardenedTikTokLink
            href={paidHref}
            cta_type="paid"
            cta_text="7-Day Round Pass — $7.99 once"
            cta_location="tiktok_landing_hero"
            destination="/start-checkout?plan_key=round_pass_7d"
            {...PAID_TRACKING}
            utms={utms}
            style={{
              ...anchorBase,
              padding: "15px",
              background: "linear-gradient(160deg, #f5c842 0%, #d48800 100%)",
              color: "#120900",
              fontSize: 15,
              boxShadow: "0 5px 20px rgba(224,174,45,0.24)",
            }}
          >
            7-Day Round Pass — $7.99 once
          </HardenedTikTokLink>

          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            marginTop: 2,
          }}>
            <p style={{
              textAlign: "center",
              fontSize: 11,
              color: "rgba(255,255,255,0.20)",
              margin: 0,
              letterSpacing: "0.02em",
            }}>
              No subscription. No auto-renew.
            </p>
            <span style={{ color: "rgba(255,255,255,0.12)", fontSize: 11 }}>·</span>
            {/* Secondary: View all plans */}
            <HardenedTikTokLink
              href={plansHref}
              cta_type="plans"
              cta_text="View all plans"
              cta_location="hero"
              destination="/neeko-plus?plan=round_pass_7d"
              utms={utms}
              style={{
                position: "relative",
                zIndex: 9999,
                pointerEvents: "auto",
                fontSize: 11,
                color: "rgba(255,255,255,0.28)",
                cursor: "pointer",
                textDecoration: "underline",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              View all plans
            </HardenedTikTokLink>
          </div>
        </div>

        {/* ── 6. Board preview table ── */}
        <div style={{ marginTop: 32 }}>
          <FreeRoundPreviewTable
            utms={utms}
            cleanPagePath="/tiktok"
            previewLoadedEvent="tiktok_preview_loaded"
            previewErrorEvent="tiktok_preview_error"
          />
        </div>

        {/* ── 7. 7-Day Round Pass offer ── */}
        <div style={{
          marginTop: 24,
          background: "linear-gradient(150deg, rgba(29,78,216,0.12) 0%, rgba(15,23,42,0.10) 100%)",
          border: "1px solid rgba(96,165,250,0.18)",
          borderRadius: 16,
          padding: "22px 18px 20px",
        }}>
          <p style={{
            fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.36)",
            margin: "0 0 8px", letterSpacing: "0.06em", textTransform: "uppercase",
          }}>
            Want the full board?
          </p>

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
            <p style={{
              fontSize: 18, fontWeight: 900, color: "#F0F4F8",
              margin: 0, letterSpacing: "-0.02em",
            }}>
              7-Day Round Pass
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{
                fontSize: 26, fontWeight: 900, color: "#60a5fa",
                letterSpacing: "-0.04em",
              }}>A$7.99</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>once</span>
            </div>
          </div>

          <p style={{
            fontSize: 12, color: "rgba(255,255,255,0.30)",
            margin: "0 0 16px", lineHeight: 1.45,
          }}>
            Full access for 7 days. No subscription. No auto-renew.
          </p>

          {/* Paid CTA — round pass section */}
          <HardenedTikTokLink
            href={paidHref}
            cta_type="paid"
            cta_text="Get 7-Day Round Pass — $7.99 once"
            cta_location="tiktok_landing_round_pass_section"
            destination="/start-checkout?plan_key=round_pass_7d"
            {...PAID_TRACKING}
            utms={utms}
            style={{
              ...anchorBase,
              padding: "14px",
              borderRadius: 12,
              background: "linear-gradient(160deg, #3b82f6 0%, #1d4ed8 100%)",
              color: "#eff6ff",
              fontSize: 15,
              boxShadow: "0 5px 20px rgba(59,130,246,0.25)",
              marginBottom: 14,
            }}
          >
            Get 7-Day Round Pass — $7.99 once
          </HardenedTikTokLink>

          {/* Trust chips */}
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {["One payment", "7 days access", "No auto-renew"].map((chip) => (
              <span key={chip} style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 9px", borderRadius: 6,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: 10.5, fontWeight: 600,
                color: "rgba(255,255,255,0.36)",
                whiteSpace: "nowrap",
              }}>
                <span style={{ color: "#22c55e", fontSize: 9 }}>✓</span>
                {chip}
              </span>
            ))}
          </div>
        </div>

        {/* ── 8. Trust chips ── */}
        <div style={{
          marginTop: 20,
          display: "flex", gap: 7, flexWrap: "wrap",
          justifyContent: "center",
        }}>
          {[
            "Real AFL data",
            "Updated every round",
            "Fast stat checks",
            "Free games every week",
          ].map((item) => (
            <span key={item} style={{
              padding: "5px 10px", borderRadius: 6,
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.06)",
              fontSize: 10.5, fontWeight: 600,
              color: "rgba(255,255,255,0.28)",
              whiteSpace: "nowrap",
            }}>
              {item}
            </span>
          ))}
        </div>

        {/* Bottom padding */}
        <div style={{ height: 40 }} />
      </div>

      {/* ── 9. Sticky mobile CTA — disabled via ENABLE_TIKTOK_STICKY_CTA ── */}
      {ENABLE_TIKTOK_STICKY_CTA && stickyVisible && !stickyDismissed && (
        <div
          aria-label="Quick action bar"
          style={{
            position: "fixed",
            bottom: 0, left: 0, right: 0,
            background: "rgba(8,12,16,0.97)",
            borderTop: "1px solid rgba(255,255,255,0.09)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            padding: "11px 16px 22px",
            zIndex: 50,
            willChange: "transform",
            pointerEvents: "auto",
            overflow: "hidden",
          }}
        >
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 9,
          }}>
            <p style={{
              margin: 0, fontSize: 12, fontWeight: 700,
              color: "rgba(255,255,255,0.55)",
            }}>
              See this week's AFL stats
            </p>
            <button
              type="button"
              onClick={() => setStickyDismissed(true)}
              style={{
                background: "none", border: "none",
                color: "rgba(255,255,255,0.28)",
                fontSize: 20, cursor: "pointer",
                padding: "0 4px", lineHeight: 1,
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                minWidth: 44, minHeight: 44,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={freeHref}
              onClick={() => setStickyDismissed(true)}
              style={{
                flex: 1, padding: "14px 6px", borderRadius: 10,
                background: "linear-gradient(160deg, #3b82f6 0%, #1d4ed8 100%)",
                color: "#eff6ff",
                fontSize: 13, fontWeight: 800, cursor: "pointer",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                position: "relative", zIndex: 9999,
                minHeight: 44,
                display: "flex", alignItems: "center", justifyContent: "center",
                textDecoration: "none",
                pointerEvents: "auto",
              }}
            >
              View Free Games
            </a>
            <a
              href={paidHref}
              onClick={() => setStickyDismissed(true)}
              style={{
                flex: 1, padding: "14px 6px", borderRadius: 10,
                background: "linear-gradient(160deg, #f5c842 0%, #d48800 100%)",
                color: "#120900",
                fontSize: 13, fontWeight: 800,
                cursor: "pointer",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                position: "relative", zIndex: 9999,
                minHeight: 44,
                display: "flex", alignItems: "center", justifyContent: "center",
                textDecoration: "none",
                pointerEvents: "auto",
              }}
            >
              7-Day Pass — $7.99 once
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
