import { useEffect, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import posthog from "posthog-js";
import { saveReferralAttribution } from "@/lib/referralAttribution";
import { FreeRoundPreviewTable } from "@/components/landing/FreeRoundPreviewTable";

// ── Build marker ──────────────────────────────────────────────────────────────
const BUILD_MARKER = "referral_landing_v2";

// ── Gesture constants ─────────────────────────────────────────────────────────
const TAP_MOVE_THRESHOLD_PX = 10;
const TAP_MAX_DURATION_MS = 2500;

// ── Creator config ────────────────────────────────────────────────────────────

interface CreatorConfig {
  creatorName: string;
  referralCode: string | null;
  headline: string;
  subheadline: string;
}

const CREATOR_REFERRALS: Record<string, CreatorConfig> = {
  footycentral: {
    creatorName: "Footy Central",
    referralCode: null,
    headline: "Footy Central sent you.",
    subheadline: "Check this week's AFL player trends before the round.",
  },
  aflfantasyhub: {
    creatorName: "AFL Fantasy Hub",
    referralCode: null,
    headline: "AFL Fantasy Hub sent you.",
    subheadline: "See the stats behind this week's AFL matchups.",
  },
  jackson: {
    creatorName: "Jackson",
    referralCode: null,
    headline: "Jackson sent you.",
    subheadline: "Check 2 free games, then unlock the full round if you want more.",
  },
  footybanter: {
    creatorName: "Footy Banter",
    referralCode: null,
    headline: "Footy Banter sent you.",
    subheadline: "Check this week's AFL stat trends before the round.",
  },
  supercoachdaily: {
    creatorName: "SuperCoach Daily",
    referralCode: null,
    headline: "SuperCoach Daily sent you.",
    subheadline: "See the player trends and matchup stats for this round.",
  },
};

const FALLBACK_CREATOR: CreatorConfig = {
  creatorName: "a Neeko creator",
  referralCode: null,
  headline: "You were referred to Neeko.",
  subheadline: "Check this week's AFL player trends before the round.",
};

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

function appendUtms(url: string, utms: Record<string, string>, extra?: Record<string, string>): string {
  const merged = { ...utms, ...extra };
  if (Object.keys(merged).length === 0) return url;
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + new URLSearchParams(merged).toString();
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

// ── HardenedTrackedLink ───────────────────────────────────────────────────────

interface HardenedTrackedLinkProps {
  href: string;
  cta_type: string;
  cta_text: string;
  cta_location: string;
  destination: string;
  build_marker: string;
  page: string;
  clean_page_path: string;
  plan_key?: string;
  billing_type?: string;
  value?: number;
  currency?: string;
  referral_attrs: Record<string, string | null>;
  utms: Record<string, string>;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

function HardenedTrackedLink({
  href,
  cta_type,
  cta_text,
  cta_location,
  destination,
  build_marker,
  page,
  clean_page_path,
  plan_key,
  billing_type,
  value,
  currency,
  referral_attrs,
  utms,
  style,
  children,
}: HardenedTrackedLinkProps) {
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
    build_marker,
    cta_type,
    cta_text,
    cta_location,
    destination,
    href,
    ...(plan_key !== undefined && { plan_key }),
    ...(billing_type !== undefined && { billing_type }),
    ...(value !== undefined && { value }),
    ...(currency !== undefined && { currency }),
    page,
    source_page: clean_page_path,
    clean_page_path,
    device_type: getDeviceType(),
    in_app_browser: detectInAppBrowser(),
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    ua: navigator.userAgent,
    current_pathname: window.location.pathname,
    current_href: window.location.href,
    client_ts: Date.now(),
    ...referral_attrs,
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
      posthog.capture("referral_cta_touch_cancelled", {
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
      cancel_reason: "",
    };

    try {
      posthog.capture("referral_cta_clicked", props);
      posthog.capture("cta_clicked", props);
      posthog.capture("referral_cta_navigation_started", props);
      posthog.capture("referral_cta_navigation_attempted", props);
    } catch { /* non-critical */ }

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
      posthog.capture("referral_cta_touch_started", {
        ...baseProps(),
        event_type: "pointer_down",
        navigation_method: "native_anchor",
        gesture_cancelled: false,
        cancel_reason: "",
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

const PAID_TRACKING = {
  plan_key: "round_pass_7d",
  billing_type: "one_time",
  value: 7.99,
  currency: "AUD",
} as const;

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReferralLanding() {
  const { creatorSlug = "" } = useParams<{ creatorSlug: string }>();
  const location = useLocation();
  const utms = getUtmParams(location.search);
  const firedCTAVisible = useRef(false);
  const ctaRef = useRef<HTMLDivElement>(null);

  const slug = creatorSlug.toLowerCase();
  const creator = CREATOR_REFERRALS[slug] ?? FALLBACK_CREATOR;
  const isKnownCreator = slug in CREATOR_REFERRALS;

  const now = new Date().toISOString();
  const cleanPagePath = location.pathname;

  const referralAttrs: Record<string, string | null> = {
    referral_source: "influencer",
    campaign_type: "creator_referral",
    creator_slug: creatorSlug,
    creator_name: creator.creatorName,
    referral_code: creator.referralCode,
    referral_landing_path: cleanPagePath,
    referral_landing_url: window.location.href,
    referral_first_seen_at: now,
    referral_last_seen_at: now,
    utm_source: utms.utm_source ?? null,
    utm_medium: utms.utm_medium ?? null,
    utm_campaign: utms.utm_campaign ?? null,
    utm_content: utms.utm_content ?? null,
  };

  // Persist attribution + fire landing events on mount
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "AFL Stats This Week | Neeko Sports Stats";

    saveReferralAttribution(referralAttrs as Parameters<typeof saveReferralAttribution>[0]);

    const markerProps = {
      page: "referral",
      marker: BUILD_MARKER,
      build_marker: BUILD_MARKER,
      clean_page_path: cleanPagePath,
      creator_slug: creatorSlug,
      creator_name: creator.creatorName,
      is_known_creator: isKnownCreator,
      referral_source: "influencer",
      campaign_type: "creator_referral",
      referral_code: creator.referralCode,
      referral_landing_url: window.location.href,
      referral_first_seen_at: now,
      referral_last_seen_at: now,
      current_href: window.location.href,
      current_pathname: window.location.pathname,
      device_type: getDeviceType(),
      in_app_browser: detectInAppBrowser(),
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      ...utms,
    };

    try {
      posthog.capture("referral_landing_build_marker", markerProps);
    } catch { /* non-critical */ }

    try {
      posthog.capture("referral_landing_loaded", {
        ...markerProps,
        referrer: document.referrer || null,
      });
    } catch { /* non-critical */ }

    return () => {
      document.title = prevTitle;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire referral_landing_cta_visible when CTA stack enters viewport
  useEffect(() => {
    if (!ctaRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !firedCTAVisible.current) {
          firedCTAVisible.current = true;
          try {
            posthog.capture("referral_landing_cta_visible", {
              build_marker: BUILD_MARKER,
              page: "referral",
              clean_page_path: cleanPagePath,
              creator_slug: creatorSlug,
              creator_name: creator.creatorName,
              referral_source: "influencer",
              campaign_type: "creator_referral",
              referral_code: creator.referralCode,
              referral_landing_url: window.location.href,
              referral_first_seen_at: now,
              referral_last_seen_at: now,
              current_href: window.location.href,
              current_pathname: window.location.pathname,
              ...utms,
            });
          } catch { /* non-critical */ }
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(ctaRef.current);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Destination URLs ──────────────────────────────────────────────────────
  const refParam = { ref: creatorSlug };
  const freeHref  = appendUtms("/stat-board/players", utms);
  const paidHref  = appendUtms(`/auth?mode=signup&plan_key=round_pass_7d`, utms, refParam);
  const plansHref = appendUtms(`/neeko-plus?plan=round_pass_7d`, utms, refParam);

  const sharedLinkProps = {
    build_marker: BUILD_MARKER,
    page: "referral",
    clean_page_path: cleanPagePath,
    referral_attrs: referralAttrs,
    utms,
  };

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

        {/* ── Brand badge ── */}
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

        {/* ── Headline ── */}
        <h1 style={{
          fontSize: "clamp(1.85rem, 7.5vw, 2.6rem)",
          fontWeight: 900,
          color: "#F0F4F8",
          letterSpacing: "-0.03em",
          lineHeight: 1.06,
          margin: "0 0 12px",
        }}>
          {creator.headline.includes(".")
            ? <>
                {creator.headline.split(".")[0]}.<br />
                <span style={{ color: "#E0AE2D" }}>
                  {creator.headline.split(".").slice(1).join(".").trim()}
                </span>
              </>
            : <span style={{ color: "#E0AE2D" }}>{creator.headline}</span>
          }
        </h1>

        {/* ── Subheadline ── */}
        <p style={{
          fontSize: "clamp(14px, 3.5vw, 16px)",
          color: "rgba(255,255,255,0.52)",
          lineHeight: 1.5,
          margin: "0 0 6px",
        }}>
          {creator.subheadline}
        </p>

        <p style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.28)",
          margin: "0 0 26px",
        }}>
          Free game boards available. No card needed.
        </p>

        {/* ── CTA stack ── */}
        <div
          ref={ctaRef}
          style={{ display: "flex", flexDirection: "column", gap: 10, pointerEvents: "auto" }}
        >
          {/* Free CTA */}
          <HardenedTrackedLink
            href={freeHref}
            cta_type="free"
            cta_text="View Free Games"
            cta_location="referral_landing_hero"
            destination="/stat-board/players"
            {...sharedLinkProps}
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
          </HardenedTrackedLink>

          {/* Paid CTA */}
          <HardenedTrackedLink
            href={paidHref}
            cta_type="paid"
            cta_text="Start 7-Day Access — A$7.99"
            cta_location="referral_landing_hero"
            destination="/auth?mode=signup&plan_key=round_pass_7d"
            {...PAID_TRACKING}
            {...sharedLinkProps}
            style={{
              ...anchorBase,
              padding: "15px",
              background: "linear-gradient(160deg, #f5c842 0%, #d48800 100%)",
              color: "#120900",
              fontSize: 15,
              boxShadow: "0 5px 20px rgba(224,174,45,0.24)",
            }}
          >
            Start 7-Day Access — A$7.99
          </HardenedTrackedLink>

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
            <HardenedTrackedLink
              href={plansHref}
              cta_type="plans"
              cta_text="View all plans"
              cta_location="referral_landing_hero"
              destination="/neeko-plus?plan=round_pass_7d"
              {...sharedLinkProps}
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
            </HardenedTrackedLink>
          </div>
        </div>

        {/* ── Board preview table ── */}
        <div style={{ marginTop: 32 }}>
          <FreeRoundPreviewTable
            utms={utms}
            cleanPagePath={cleanPagePath}
            previewLoadedEvent="referral_preview_loaded"
            previewErrorEvent="referral_preview_error"
          />
        </div>

        {/* ── 7-Day Round Pass offer ── */}
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

          <HardenedTrackedLink
            href={paidHref}
            cta_type="paid"
            cta_text="Start 7-Day Access"
            cta_location="referral_landing_round_pass_section"
            destination="/auth?mode=signup&plan_key=round_pass_7d"
            {...PAID_TRACKING}
            {...sharedLinkProps}
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
            Start 7-Day Access
          </HardenedTrackedLink>

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

        {/* ── Trust chips ── */}
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

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}
