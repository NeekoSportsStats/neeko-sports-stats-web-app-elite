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
    navigate(appendUtms("/stat-board", utms));
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
    navigate(appendUtms("/neeko-plus?plan=round_pass_7d", utms));
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080c10",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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
            onClick={() => navFree("tiktok_landing_hero", "View Free Games")}
            style={{
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
            }}
          >
            View Free Games
          </button>

          {/* Paid CTA */}
          <button
            onClick={() => navPaid("tiktok_landing_hero", "Start 7-Day Access — A$7.99")}
            style={{
              width: "100%",
              padding: "15px",
              borderRadius: 13,
              background: "linear-gradient(160deg, #f5c842 0%, #d48800 100%)",
              border: "none",
              color: "#120900",
              fontSize: 15,
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 5px 20px rgba(224,174,45,0.24)",
              letterSpacing: "-0.01em",
            }}
          >
            Start 7-Day Access — A$7.99
          </button>

          <p style={{
            textAlign: "center",
            fontSize: 11,
            color: "rgba(255,255,255,0.20)",
            margin: "2px 0 0",
            letterSpacing: "0.02em",
          }}>
            No subscription. No auto-renew.
          </p>
        </div>

        {/* ── 6. Product preview card ── */}
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
                color: "rgba(255,255,255,0.70)", letterSpacing: "-0.01em",
              }}>
                AFL Stat Board Preview
              </p>
              <p style={{
                margin: "1px 0 0", fontSize: 10,
                color: "rgba(255,255,255,0.28)", letterSpacing: "0.01em",
              }}>
                Example stat row
              </p>
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(224,174,45,0.60)",
              background: "rgba(224,174,45,0.08)",
              border: "1px solid rgba(224,174,45,0.15)",
              borderRadius: 5,
              padding: "3px 7px",
            }}>
              Example
            </span>
          </div>

          {/* Stat row */}
          <div style={{ padding: "14px 16px 0" }}>

            {/* Header meta */}
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* Position avatar */}
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: "rgba(59,130,246,0.10)",
                  border: "1px solid rgba(59,130,246,0.18)",
                  flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: "rgba(96,165,250,0.80)" }}>MID</span>
                </div>
                <div>
                  <p style={{
                    margin: 0, fontSize: 13, fontWeight: 800,
                    color: "rgba(255,255,255,0.75)",
                    fontStyle: "italic",
                  }}>
                    Midfielder A
                  </p>
                  <p style={{
                    margin: "1px 0 0", fontSize: 10,
                    color: "rgba(255,255,255,0.28)",
                  }}>
                    25+ disposals
                  </p>
                </div>
              </div>

              {/* Season hit rate */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{
                  margin: 0, fontSize: 20, fontWeight: 900,
                  color: "#22c55e", letterSpacing: "-0.03em",
                }}>
                  8/13
                </p>
                <p style={{
                  margin: 0, fontSize: 9,
                  color: "rgba(255,255,255,0.28)",
                }}>
                  this season
                </p>
              </div>
            </div>

            {/* Stat chips */}
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
              <span style={{
                padding: "5px 10px", borderRadius: 7,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)",
              }}>
                L5 Avg: 30.0
              </span>
              <span style={{
                padding: "5px 10px", borderRadius: 7,
                background: "rgba(34,197,94,0.07)",
                border: "1px solid rgba(34,197,94,0.20)",
                fontSize: 11, fontWeight: 700, color: "rgba(34,197,94,0.85)",
              }}>
                62% hit rate
              </span>
            </div>

            {/* Recent games sparkline */}
            <div style={{ marginBottom: 0 }}>
              <p style={{
                margin: "0 0 7px", fontSize: 10,
                color: "rgba(255,255,255,0.28)", fontWeight: 600,
                letterSpacing: "0.06em", textTransform: "uppercase",
              }}>
                Recent games
              </p>
              <div style={{ display: "flex", gap: 5 }}>
                {[25, 31, 27, 32, 35].map((score, i) => (
                  <div key={i} style={{
                    flex: 1,
                    padding: "7px 4px 6px",
                    borderRadius: 7,
                    background: score >= 25
                      ? "rgba(34,197,94,0.08)"
                      : "rgba(255,255,255,0.03)",
                    border: score >= 25
                      ? "1px solid rgba(34,197,94,0.18)"
                      : "1px solid rgba(255,255,255,0.06)",
                    textAlign: "center",
                  }}>
                    <span style={{
                      fontSize: 13, fontWeight: 800,
                      color: score >= 25 ? "#22c55e" : "rgba(255,255,255,0.38)",
                    }}>
                      {score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Explainer footer */}
          <div style={{
            padding: "12px 16px 14px",
            marginTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}>
            <p style={{
              fontSize: 11, color: "rgba(255,255,255,0.28)", lineHeight: 1.55, margin: 0,
            }}>
              <strong style={{ color: "rgba(255,255,255,0.42)" }}>Hit rate</strong> shows how often a player has reached a stat mark this season.{" "}
              <strong style={{ color: "rgba(255,255,255,0.42)" }}>L5 Avg</strong> shows recent form across the last 5 games.
            </p>
            <p style={{
              fontSize: 10, color: "rgba(255,255,255,0.18)", margin: "6px 0 0",
              fontStyle: "italic",
            }}>
              Built for fast AFL stat checks
            </p>
          </div>
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
            onClick={() => navPaid("tiktok_landing_round_pass_section", "Start 7-Day Access")}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 12,
              background: "linear-gradient(160deg, #3b82f6 0%, #1d4ed8 100%)",
              border: "none",
              color: "#eff6ff",
              fontSize: 15,
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 5px 20px rgba(59,130,246,0.25)",
              letterSpacing: "-0.01em",
              marginBottom: 14,
            }}
          >
            Start 7-Day Access
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
            "Updated every round",
            "No gambling. No hype.",
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

        <div style={{ height: 88 }} />
      </div>

      {/* ── 9. Sticky mobile CTA ── */}
      {stickyVisible && !stickyDismissed && (
        <div style={{
          position: "fixed",
          bottom: 0, left: 0, right: 0,
          background: "rgba(8,12,16,0.97)",
          borderTop: "1px solid rgba(255,255,255,0.09)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          padding: "11px 16px 22px",
          zIndex: 100,
        }}>
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
              onClick={() => setStickyDismissed(true)}
              style={{
                background: "none", border: "none",
                color: "rgba(255,255,255,0.28)",
                fontSize: 20, cursor: "pointer",
                padding: "0 4px", lineHeight: 1,
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
                flex: 1, padding: "12px 6px", borderRadius: 10,
                background: "linear-gradient(160deg, #3b82f6 0%, #1d4ed8 100%)",
                border: "none", color: "#eff6ff",
                fontSize: 13, fontWeight: 800, cursor: "pointer",
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
                flex: 1, padding: "12px 6px", borderRadius: 10,
                background: "linear-gradient(160deg, #f5c842 0%, #d48800 100%)",
                border: "none", color: "#120900",
                fontSize: 13, fontWeight: 800, cursor: "pointer",
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
