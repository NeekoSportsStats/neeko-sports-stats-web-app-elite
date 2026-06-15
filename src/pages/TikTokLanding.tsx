import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import posthog from "posthog-js";
import { supabase } from "@/lib/supabaseClient";
import type { StatBoardMatch, StatBoardPlayer } from "@/features/afl/stat-board/types";

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
  source_page: "/tiktok",
} as const;

// ── Preview data types ────────────────────────────────────────────────────────

interface PreviewRow {
  name: string;
  pos: string;
  hits: [string, string, string, string];
  highlight: [boolean, boolean, boolean, boolean];
}

type PreviewStatus = "loading" | "ready" | "fallback";

const SEASON = 2026;

function formatRatio(hits: number, games: number): string {
  return `${hits}/${games}`;
}

function isHighlighted(hits: number, games: number): boolean {
  return games > 0 && hits / games >= 0.7;
}

function posLabel(positionGroup: string | null): string {
  if (!positionGroup) return "MID";
  const p = positionGroup.toUpperCase();
  if (p === "RUC") return "RUC";
  if (p === "FWD") return "FWD";
  if (p === "DEF") return "DEF";
  return "MID";
}

async function fetchPreviewRows(utms: Record<string, string>): Promise<PreviewRow[]> {
  if (!supabase) throw new Error("Supabase not initialised");

  const { data: matchData, error: matchErr } = await supabase.rpc("get_stat_board_matches", {
    p_season: SEASON,
    p_round: null,
  });
  if (matchErr) throw matchErr;

  const matches = (matchData as StatBoardMatch[]) ?? [];
  const freeMatch = matches.find((m) => m.is_free_match && !m.is_locked);
  if (!freeMatch) throw new Error("No free match available");

  const { data: playerData, error: playerErr } = await supabase.rpc("get_stat_board_players", {
    p_season: SEASON,
    p_round: null,
    p_match_id: freeMatch.match_id,
    p_lens: "disposals",
    p_threshold: 20,
    p_limit: 5,
    p_offset: 0,
  });
  if (playerErr) throw playerErr;

  const players = (playerData as StatBoardPlayer[]) ?? [];
  if (players.length === 0) {
    posthog.capture("tiktok_preview_fallback_shown", {
      clean_page_path: "/tiktok",
      reason: "no_players",
      ...utms,
    });
    throw new Error("No players returned");
  }

  return players.map((p) => {
    const thr = p.season_threshold_hit_rates ?? p.all_threshold_hit_rates ?? {};
    const g15 = thr["15"] ?? { hits: 0, games: 0 };
    const g20 = thr["20"] ?? { hits: 0, games: 0 };
    const g25 = thr["25"] ?? { hits: 0, games: 0 };
    const g30 = thr["30"] ?? { hits: 0, games: 0 };
    const games = g20.games || g15.games || 1;
    return {
      name: p.player_name,
      pos: posLabel(p.position_group),
      hits: [
        formatRatio(g15.hits, g15.games || games),
        formatRatio(g20.hits, g20.games || games),
        formatRatio(g25.hits, g25.games || games),
        formatRatio(g30.hits, g30.games || games),
      ] as [string, string, string, string],
      highlight: [
        isHighlighted(g15.hits, g15.games || games),
        isHighlighted(g20.hits, g20.games || games),
        isHighlighted(g25.hits, g25.games || games),
        isHighlighted(g30.hits, g30.games || games),
      ] as [boolean, boolean, boolean, boolean],
    };
  });
}

// ── Safe CTA fire-and-navigate helper ────────────────────────────────────────
// Fires analytics synchronously, then navigates. Navigation NEVER waits on
// analytics so a posthog failure cannot block the user.

function fireCTAAnalytics(
  utms: Record<string, string>,
  params: {
    cta_type: string;
    cta_text: string;
    cta_location: string;
    destination: string;
    plan_key?: string;
    billing_type?: string;
    value?: number;
    currency?: string;
  },
) {
  try {
    posthog.capture("cta_clicked", {
      page: "tiktok",
      source_page: "/tiktok",
      clean_page_path: "/tiktok",
      device_type: getDeviceType(),
      in_app_browser: detectInAppBrowser(),
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      ...params,
      ...utms,
    });
  } catch { /* non-critical */ }

  if (import.meta.env.DEV) {
    console.log("[TikTok CTA]", params.cta_type, params.cta_location, "→", params.destination);
  }
}

function fireCTANavigationStarted(
  utms: Record<string, string>,
  params: {
    cta_type: string;
    cta_location: string;
    destination: string;
    plan_key?: string;
  },
) {
  try {
    posthog.capture("tiktok_cta_navigation_started", {
      clean_page_path: "/tiktok",
      ...params,
      ...utms,
    });
  } catch { /* non-critical */ }
}

// ── Checkout helpers ──────────────────────────────────────────────────────────

async function startCheckout(
  utms: Record<string, string>,
  ctaLocation: string,
): Promise<void> {
  if (!supabase) throw new Error("Supabase not initialised");

  const { data: { session } } = await supabase.auth.getSession();

  posthog.capture("checkout_attempted", {
    clean_page_path: "/tiktok",
    cta_location: ctaLocation,
    ...PAID_TRACKING,
    ...utms,
  });

  if (!session?.access_token) {
    // Logged out — route to auth with plan preserved
    posthog.capture("auth_required_for_checkout", {
      clean_page_path: "/tiktok",
      cta_location: ctaLocation,
      ...PAID_TRACKING,
      ...utms,
    });
    throw new Error("AUTH_REQUIRED");
  }

  const origin = window.location.origin;
  const successUrl = `${origin}/success`;
  const cancelUrl = appendUtms(`${origin}/tiktok`, utms);

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
  const resp = await fetch(`${supabaseUrl}/functions/v1/stripe-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      plan: "round_pass_7d",
      success_url: successUrl,
      cancel_url: cancelUrl,
    }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    posthog.capture("checkout_error", {
      clean_page_path: "/tiktok",
      cta_location: ctaLocation,
      error_message: body?.error ?? `HTTP ${resp.status}`,
      ...PAID_TRACKING,
      ...utms,
    });
    throw new Error(body?.error ?? "Checkout unavailable");
  }

  const { url } = await resp.json();

  posthog.capture("checkout_session_created", {
    clean_page_path: "/tiktok",
    cta_location: ctaLocation,
    ...PAID_TRACKING,
    ...utms,
  });

  posthog.capture("checkout_redirected", {
    clean_page_path: "/tiktok",
    cta_location: ctaLocation,
    ...PAID_TRACKING,
    ...utms,
  });

  window.location.href = url;
}

// ── Position chip colors ──────────────────────────────────────────────────────

function posColor(pos: string): { text: string; bg: string; border: string } {
  switch (pos) {
    case "DEF": return { text: "rgba(167,139,250,0.75)", bg: "rgba(139,92,246,0.10)", border: "rgba(139,92,246,0.18)" };
    case "FWD": return { text: "rgba(251,146,60,0.80)", bg: "rgba(234,88,12,0.10)",   border: "rgba(234,88,12,0.18)"  };
    case "RUC": return { text: "rgba(52,211,153,0.80)", bg: "rgba(5,150,105,0.10)",   border: "rgba(5,150,105,0.18)"  };
    default:    return { text: "rgba(96,165,250,0.75)", bg: "rgba(59,130,246,0.10)",  border: "rgba(59,130,246,0.18)" };
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TikTokLanding() {
  const location = useLocation();
  const navigate = useNavigate();
  const utms = getUtmParams(location.search);

  const heroRef = useRef<HTMLDivElement>(null);
  const [stickyVisible, setStickyVisible] = useState(false);
  const [stickyDismissed, setStickyDismissed] = useState(false);
  const firedCTAVisible = useRef(false);
  const firedScroll = useRef(false);

  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("loading");
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // tiktok_landing_loaded — on first render
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

  // sticky CTA after 3s
  useEffect(() => {
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

  // Deferred preview data fetch — does not block first paint
  useEffect(() => {
    let cancelled = false;
    fetchPreviewRows(utms)
      .then((rows) => {
        if (cancelled) return;
        setPreviewRows(rows);
        setPreviewStatus("ready");
        posthog.capture("tiktok_preview_loaded", {
          clean_page_path: "/tiktok",
          row_count: rows.length,
          ...utms,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPreviewStatus("fallback");
        const msg = err instanceof Error ? err.message : String(err);
        posthog.capture("tiktok_preview_error", {
          clean_page_path: "/tiktok",
          error_message: msg,
          ...utms,
        });
        posthog.capture("tiktok_preview_fallback_shown", {
          clean_page_path: "/tiktok",
          reason: msg,
          ...utms,
        });
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navFree = useCallback((location_: string, text: string) => {
    const dest = appendUtms("/stat-board", utms);
    fireCTAAnalytics(utms, {
      cta_type: "free",
      cta_text: text,
      cta_location: location_,
      destination: "/stat-board",
    });
    fireCTANavigationStarted(utms, {
      cta_type: "free",
      cta_location: location_,
      destination: "/stat-board",
    });
    // Use navigate for SPA routing; window.location as safety fallback
    try {
      navigate(dest);
    } catch {
      window.location.href = dest;
    }
  }, [navigate, utms]);

  const handlePaidCTA = useCallback((location_: string, text: string) => {
    if (checkoutLoading) return;

    const authDest = appendUtms("/auth?mode=signup&plan_key=round_pass_7d", utms);

    fireCTAAnalytics(utms, {
      cta_type: "paid",
      cta_text: text,
      cta_location: location_,
      destination: authDest,
      plan_key: PAID_TRACKING.plan_key,
      billing_type: PAID_TRACKING.billing_type,
      value: PAID_TRACKING.value,
      currency: PAID_TRACKING.currency,
    });
    fireCTANavigationStarted(utms, {
      cta_type: "paid",
      cta_location: location_,
      destination: authDest,
      plan_key: PAID_TRACKING.plan_key,
    });

    setCheckoutLoading(true);
    setCheckoutError(null);

    startCheckout(utms, location_)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);

        if (msg === "AUTH_REQUIRED") {
          // Navigate immediately — do not wait for any async work
          try {
            navigate(authDest);
          } catch {
            window.location.href = authDest;
          }
          return;
        }

        setCheckoutError("Checkout unavailable right now. Try again or view plans.");
      })
      .finally(() => {
        setCheckoutLoading(false);
      });
  }, [checkoutLoading, navigate, utms]);

  // Button style helpers — extracted to avoid repetition and ensure consistent tap targets
  const btnFree: React.CSSProperties = {
    width: "100%",
    padding: "16px",
    borderRadius: 13,
    background: "linear-gradient(160deg, #3b82f6 0%, #1d4ed8 100%)",
    border: "none",
    color: "#eff6ff",
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 6px 24px rgba(59,130,246,0.28)",
    letterSpacing: "-0.01em",
    // Android touch fix: explicit touch-action and no user-select interference
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    position: "relative",
    zIndex: 1,
  };

  const btnPaid: React.CSSProperties = {
    width: "100%",
    padding: "15px",
    borderRadius: 13,
    background: checkoutLoading
      ? "rgba(245,200,66,0.5)"
      : "linear-gradient(160deg, #f5c842 0%, #d48800 100%)",
    border: "none",
    color: "#120900",
    fontSize: 15,
    fontWeight: 900,
    cursor: checkoutLoading ? "not-allowed" : "pointer",
    boxShadow: "0 5px 20px rgba(224,174,45,0.24)",
    letterSpacing: "-0.01em",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    position: "relative",
    zIndex: 1,
    opacity: checkoutLoading ? 0.7 : 1,
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080c10",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      // Ensure the page itself doesn't have stacking issues blocking touch
      position: "relative",
      zIndex: 0,
    }}>
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
        <div ref={heroRef} style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Free CTA */}
          <button
            type="button"
            onClick={() => navFree("tiktok_landing_hero", "View Free Games")}
            style={btnFree}
          >
            View Free Games
          </button>

          {/* Paid CTA */}
          <button
            type="button"
            onClick={() => handlePaidCTA("tiktok_landing_hero", "Start 7-Day Access — A$7.99")}
            disabled={checkoutLoading}
            style={btnPaid}
          >
            {checkoutLoading ? "Starting checkout…" : "Start 7-Day Access — A$7.99"}
          </button>

          {/* Checkout error */}
          {checkoutError && (
            <p style={{
              textAlign: "center",
              fontSize: 11,
              color: "rgba(239,68,68,0.85)",
              margin: "0",
            }}>
              {checkoutError}
            </p>
          )}

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
            <button
              type="button"
              onClick={() => {
                const dest = appendUtms("/neeko-plus?plan=round_pass_7d", utms);
                fireCTAAnalytics(utms, {
                  cta_type: "plans",
                  cta_text: "View all plans",
                  cta_location: "hero",
                  destination: "/neeko-plus",
                });
                fireCTANavigationStarted(utms, {
                  cta_type: "plans",
                  cta_location: "hero",
                  destination: "/neeko-plus",
                });
                try {
                  navigate(dest);
                } catch {
                  window.location.href = dest;
                }
              }}
              style={{
                background: "none", border: "none", padding: 0,
                fontSize: 11, color: "rgba(255,255,255,0.28)",
                cursor: "pointer", textDecoration: "underline",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              View all plans
            </button>
          </div>
        </div>

        {/* ── 6. Board preview table ── */}
        <div style={{
          marginTop: 32,
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 16,
          overflow: "hidden",
        }}>

          {/* Card header */}
          <div style={{
            padding: "12px 16px 11px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <p style={{
                margin: 0, fontSize: 12, fontWeight: 800,
                color: "rgba(255,255,255,0.70)", letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}>
                {previewStatus === "fallback" ? "AFL Stat Board Example" : "Free Round Preview"}
              </p>
              <p style={{
                margin: "2px 0 0", fontSize: 10,
                color: "rgba(255,255,255,0.28)",
              }}>
                {previewStatus === "ready"
                  ? "Live sample from this week's free games"
                  : previewStatus === "fallback"
                  ? "Example layout only"
                  : "Loading live data…"}
              </p>
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: previewStatus === "ready" ? "rgba(34,197,94,0.70)" : "rgba(224,174,45,0.60)",
              background: previewStatus === "ready" ? "rgba(34,197,94,0.08)" : "rgba(224,174,45,0.08)",
              border: `1px solid ${previewStatus === "ready" ? "rgba(34,197,94,0.18)" : "rgba(224,174,45,0.15)"}`,
              borderRadius: 5,
              padding: "3px 7px",
              flexShrink: 0,
              marginLeft: 10,
            }}>
              {previewStatus === "ready" ? "Live" : "Preview"}
            </span>
          </div>

          {/* Loading skeleton */}
          {previewStatus === "loading" && (
            <div style={{ padding: "12px 16px 16px" }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{
                  height: 36,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 6,
                  marginBottom: i < 3 ? 8 : 0,
                  animation: "pulse 1.4s ease-in-out infinite",
                }} />
              ))}
              <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.45} }`}</style>
            </div>
          )}

          {/* Fallback message */}
          {previewStatus === "fallback" && (
            <div style={{ padding: "20px 16px", textAlign: "center" }}>
              <p style={{
                fontSize: 12, color: "rgba(255,255,255,0.32)",
                margin: 0, lineHeight: 1.5,
              }}>
                Board preview unavailable right now.
              </p>
              <p style={{
                fontSize: 11, color: "rgba(255,255,255,0.18)",
                margin: "4px 0 0",
              }}>
                Open the stat board to see live data.
              </p>
            </div>
          )}

          {/* Live table */}
          {previewStatus === "ready" && previewRows.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <th style={{
                      padding: "9px 16px 9px",
                      textAlign: "left",
                      fontSize: 10, fontWeight: 700,
                      color: "rgba(255,255,255,0.28)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}>Player</th>
                    {["15+", "20+", "25+", "30+"].map((col) => (
                      <th key={col} style={{
                        padding: "9px 10px 9px",
                        textAlign: "center",
                        fontSize: 10, fontWeight: 700,
                        color: "rgba(255,255,255,0.28)",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, ri) => {
                    const pc = posColor(row.pos);
                    return (
                      <tr key={ri} style={{
                        borderBottom: ri < previewRows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      }}>
                        <td style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{
                              fontSize: 9, fontWeight: 800,
                              color: pc.text,
                              background: pc.bg,
                              border: `1px solid ${pc.border}`,
                              borderRadius: 4,
                              padding: "2px 5px",
                              letterSpacing: "0.05em",
                            }}>{row.pos}</span>
                            <span style={{
                              fontSize: 11.5, fontWeight: 700,
                              color: "rgba(255,255,255,0.72)",
                              whiteSpace: "nowrap",
                            }}>{row.name}</span>
                          </div>
                        </td>
                        {row.hits.map((hit, ci) => (
                          <td key={ci} style={{
                            padding: "10px 10px",
                            textAlign: "center",
                          }}>
                            <span style={{
                              fontSize: 12, fontWeight: 800,
                              color: row.highlight[ci] ? "#22c55e" : "rgba(255,255,255,0.32)",
                            }}>{hit}</span>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Table footer */}
          {previewStatus !== "loading" && (
            <div style={{
              padding: "9px 16px 12px",
              borderTop: "1px solid rgba(255,255,255,0.04)",
            }}>
              <p style={{
                fontSize: 10, color: "rgba(255,255,255,0.20)", margin: 0,
                fontStyle: "italic",
              }}>
                {previewStatus === "ready"
                  ? "Ratios show games hit / games played this season. Disposals stat."
                  : "Open the stat board to see this round's live player data."}
              </p>
            </div>
          )}
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

          <button
            type="button"
            onClick={() => handlePaidCTA("tiktok_landing_round_pass_section", "Start 7-Day Access")}
            disabled={checkoutLoading}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 12,
              background: checkoutLoading
                ? "rgba(59,130,246,0.5)"
                : "linear-gradient(160deg, #3b82f6 0%, #1d4ed8 100%)",
              border: "none",
              color: "#eff6ff",
              fontSize: 15,
              fontWeight: 900,
              cursor: checkoutLoading ? "not-allowed" : "pointer",
              boxShadow: "0 5px 20px rgba(59,130,246,0.25)",
              letterSpacing: "-0.01em",
              marginBottom: 14,
              opacity: checkoutLoading ? 0.7 : 1,
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              position: "relative",
              zIndex: 1,
            }}
          >
            {checkoutLoading ? "Starting checkout…" : "Start 7-Day Access"}
          </button>

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

        {/* Bottom padding — must clear sticky CTA height (approx 88px) */}
        <div style={{ height: 104 }} />
      </div>

      {/* ── 9. Sticky mobile CTA ── */}
      {stickyVisible && !stickyDismissed && (
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
            // Use will-change instead of translateZ — avoids stacking context issues
            // that cause the fixed bar to intercept taps on the main page content
            // below it on some Android Chrome versions.
            willChange: "transform",
            // Strictly constrain touch interception to the visible element bounds
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
            <button
              type="button"
              onClick={() => {
                // Dismiss AFTER navigating so the handler is not killed by unmount
                navFree("tiktok_landing_sticky_cta", "View Free Games");
                setStickyDismissed(true);
              }}
              style={{
                flex: 1, padding: "14px 6px", borderRadius: 10,
                background: "linear-gradient(160deg, #3b82f6 0%, #1d4ed8 100%)",
                border: "none", color: "#eff6ff",
                fontSize: 13, fontWeight: 800, cursor: "pointer",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                position: "relative", zIndex: 1,
                minHeight: 44,
              }}
            >
              View Free Games
            </button>
            <button
              type="button"
              onClick={() => {
                // Dismiss AFTER triggering paid flow so the handler is not killed by unmount
                handlePaidCTA("tiktok_landing_sticky_cta", "7-Day Access — A$7.99");
                setStickyDismissed(true);
              }}
              disabled={checkoutLoading}
              style={{
                flex: 1, padding: "14px 6px", borderRadius: 10,
                background: checkoutLoading
                  ? "rgba(245,200,66,0.5)"
                  : "linear-gradient(160deg, #f5c842 0%, #d48800 100%)",
                border: "none", color: "#120900",
                fontSize: 13, fontWeight: 800,
                cursor: checkoutLoading ? "not-allowed" : "pointer",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                position: "relative", zIndex: 1,
                minHeight: 44,
                opacity: checkoutLoading ? 0.7 : 1,
              }}
            >
              {checkoutLoading ? "Starting…" : "7-Day Access — A$7.99"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
