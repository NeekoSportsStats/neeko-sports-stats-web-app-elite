import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { trackCTA } from "@/lib/analytics";
import posthog from "posthog-js";

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
    const loadTimMs = performance.now();
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
      load_time_ms: Math.round(loadTimMs),
      fcp_ms: fcpMs,
      lcp_ms: lcpMs,
      in_app_browser: detectInAppBrowser(),
      ...extra,
    });
  } catch { /* non-critical */ }
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

  // tiktok_landing_loaded — on first render
  useEffect(() => {
    fireTikTokEvent("tiktok_landing_loaded", utms);
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

  function navFree(location_: string, text: string) {
    trackCTA({
      cta_location: location_,
      cta_text: text,
      cta_type: "free_entry",
      clean_page_path: "/tiktok",
      ...utms,
    });
    fireTikTokEvent("cta_clicked", utms, {
      cta_location: location_,
      cta_text: text,
      cta_type: "free_entry",
    });
    const dest = appendUtms("/stat-board", utms);
    navigate(dest);
  }

  function navPaid(location_: string, text: string) {
    trackCTA({
      cta_location: location_,
      cta_text: text,
      cta_type: "paid_entry",
      plan_key: "round_pass_7d",
      billing_type: "one_time",
      value: 7.99,
      currency: "AUD",
      clean_page_path: "/tiktok",
      ...utms,
    });
    fireTikTokEvent("cta_clicked", utms, {
      cta_location: location_,
      cta_text: text,
      cta_type: "paid_entry",
      plan_key: "round_pass_7d",
      billing_type: "one_time",
      value: 7.99,
      currency: "AUD",
    });
    const dest = appendUtms("/neeko-plus?plan=round_pass_7d", utms);
    navigate(dest);
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080707",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>

      {/* ── Hero ── */}
      <div style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "clamp(28px, 8vw, 52px) clamp(18px, 5vw, 28px) 0",
      }}>

        {/* Logo / brand pill */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "rgba(224,174,45,0.10)",
          border: "1px solid rgba(224,174,45,0.22)",
          borderRadius: 999,
          padding: "5px 13px",
          marginBottom: 22,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 900, letterSpacing: "0.26em",
            textTransform: "uppercase", color: "#E0AE2D",
          }}>
            Neeko Sports Stats
          </span>
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: "clamp(1.75rem, 7vw, 2.5rem)",
          fontWeight: 900,
          color: "#F5F5F5",
          letterSpacing: "-0.03em",
          lineHeight: 1.08,
          margin: "0 0 14px",
        }}>
          AFL stats for<br />
          <span style={{ color: "#E0AE2D" }}>this week's games.</span>
        </h1>

        {/* Sub-copy */}
        <p style={{
          fontSize: "clamp(14px, 3.5vw, 16px)",
          color: "rgba(255,255,255,0.55)",
          lineHeight: 1.55,
          margin: "0 0 8px",
        }}>
          See player hit rates, recent form and matchup trends in seconds.
        </p>

        {/* Support copy */}
        <p style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.32)",
          margin: "0 0 28px",
        }}>
          Free access to this week's games. No card needed.
        </p>

        {/* CTA stack */}
        <div ref={heroRef} style={{ display: "flex", flexDirection: "column", gap: 11 }}>

          {/* Primary: free */}
          <button
            onClick={() => navFree("tiktok_landing_hero", "View Free Games")}
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: 12,
              background: "linear-gradient(160deg, #3b82f6 0%, #1d4ed8 100%)",
              border: "none",
              color: "#eff6ff",
              fontSize: 16,
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 8px 28px rgba(59,130,246,0.30)",
              letterSpacing: "-0.01em",
            }}
          >
            View Free Games
          </button>

          {/* Secondary: paid */}
          <button
            onClick={() => navPaid("tiktok_landing_hero", "Start 7-Day Access")}
            style={{
              width: "100%",
              padding: "15px",
              borderRadius: 12,
              background: "linear-gradient(160deg, #fad52a 0%, #e09600 100%)",
              border: "none",
              color: "#130c00",
              fontSize: 15,
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 6px 22px rgba(224,174,45,0.26)",
              letterSpacing: "-0.01em",
            }}
          >
            Start 7-Day Access — A$7.99
          </button>

          <p style={{
            textAlign: "center",
            fontSize: 11,
            color: "rgba(255,255,255,0.22)",
            margin: "2px 0 0",
            letterSpacing: "0.02em",
          }}>
            No subscription. No auto-renew.
          </p>
        </div>

        {/* ── Stat preview card ── */}
        <div style={{
          marginTop: 36,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: "18px 18px 14px",
        }}>
          <p style={{
            fontSize: 9, fontWeight: 900, letterSpacing: "0.32em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.28)",
            margin: "0 0 14px",
          }}>
            Player stat example
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Avatar placeholder */}
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: "rgba(255,255,255,0.06)",
              flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.22)" }}>MID</span>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#F5F5F5" }}>Sample Player</p>
              <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.30)" }}>Carlton · MID</p>
            </div>

            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#22c55e" }}>8/13</p>
              <p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,0.28)" }}>25+ disp this season</p>
            </div>
          </div>

          <div style={{
            marginTop: 12,
            display: "flex", gap: 8, flexWrap: "wrap",
          }}>
            <span style={{
              padding: "4px 10px",
              borderRadius: 6,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              fontSize: 11, fontWeight: 700,
              color: "rgba(255,255,255,0.55)",
            }}>
              L5 Avg: 30.0
            </span>
            <span style={{
              padding: "4px 10px",
              borderRadius: 6,
              background: "rgba(34,197,94,0.07)",
              border: "1px solid rgba(34,197,94,0.18)",
              fontSize: 11, fontWeight: 700,
              color: "rgba(34,197,94,0.80)",
            }}>
              62% hit rate
            </span>
          </div>

          <div style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}>
            <p style={{
              fontSize: 11, color: "rgba(255,255,255,0.30)", lineHeight: 1.5, margin: 0,
            }}>
              <strong style={{ color: "rgba(255,255,255,0.45)" }}>Hit rate</strong> shows how often a player has reached a stat mark this season.{" "}
              <strong style={{ color: "rgba(255,255,255,0.45)" }}>L5 Avg</strong> shows recent form across the last 5 games.
            </p>
          </div>
        </div>

        {/* ── 7-Day Round Pass section ── */}
        <div style={{
          marginTop: 28,
          background: "linear-gradient(160deg, rgba(96,165,250,0.06) 0%, rgba(29,78,216,0.06) 100%)",
          border: "1px solid rgba(96,165,250,0.18)",
          borderRadius: 14,
          padding: "22px 18px",
        }}>
          <p style={{
            fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.40)",
            margin: "0 0 6px",
          }}>
            Want the full board?
          </p>

          <p style={{
            fontSize: 18, fontWeight: 900, color: "#F5F5F5",
            margin: "0 0 4px", letterSpacing: "-0.02em",
          }}>
            7-Day Round Pass
          </p>

          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
            <span style={{
              fontSize: 28, fontWeight: 900, color: "#60a5fa",
              letterSpacing: "-0.04em",
            }}>A$7.99</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.28)" }}>once</span>
          </div>

          <p style={{
            fontSize: 12, color: "rgba(255,255,255,0.30)",
            margin: "0 0 16px", lineHeight: 1.4,
          }}>
            No subscription. No auto-renew.
          </p>

          <button
            onClick={() => navPaid("tiktok_landing_round_pass_section", "Start 7-Day Access")}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 11,
              background: "linear-gradient(160deg, #3b82f6 0%, #1d4ed8 100%)",
              border: "none",
              color: "#eff6ff",
              fontSize: 15,
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 6px 22px rgba(59,130,246,0.28)",
              letterSpacing: "-0.01em",
            }}
          >
            Start 7-Day Access
          </button>
        </div>

        {/* ── Trust row ── */}
        <div style={{
          marginTop: 24,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "center",
        }}>
          {[
            "Updated every round",
            "No gambling. No hype.",
            "Free games every week",
          ].map((item) => (
            <span
              key={item}
              style={{
                padding: "5px 10px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                fontSize: 10.5,
                fontWeight: 600,
                color: "rgba(255,255,255,0.32)",
                whiteSpace: "nowrap",
              }}
            >
              {item}
            </span>
          ))}
        </div>

        {/* Bottom padding */}
        <div style={{ height: 80 }} />
      </div>

      {/* ── Sticky mobile CTA ── */}
      {stickyVisible && !stickyDismissed && (
        <div style={{
          position: "fixed",
          bottom: 0, left: 0, right: 0,
          background: "rgba(10,9,9,0.96)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          padding: "12px 16px 20px",
          zIndex: 100,
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 10,
          }}>
            <p style={{
              margin: 0, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.65)",
            }}>
              See this week's AFL stats
            </p>
            <button
              onClick={() => setStickyDismissed(true)}
              style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.30)",
                fontSize: 20, cursor: "pointer", padding: "0 4px", lineHeight: 1,
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                setStickyDismissed(true);
                navFree("tiktok_landing_sticky_cta", "View Free Games");
              }}
              style={{
                flex: 1,
                padding: "12px 8px",
                borderRadius: 10,
                background: "linear-gradient(160deg, #3b82f6 0%, #1d4ed8 100%)",
                border: "none",
                color: "#eff6ff",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              View Free Games
            </button>
            <button
              onClick={() => {
                setStickyDismissed(true);
                navPaid("tiktok_landing_sticky_cta", "7-Day Access — A$7.99");
              }}
              style={{
                flex: 1,
                padding: "12px 8px",
                borderRadius: 10,
                background: "linear-gradient(160deg, #fad52a 0%, #e09600 100%)",
                border: "none",
                color: "#130c00",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              7-Day Access — A$7.99
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
