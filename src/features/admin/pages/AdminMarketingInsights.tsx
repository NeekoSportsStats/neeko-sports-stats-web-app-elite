import { useState, useCallback, useRef } from "react";
import {
  RefreshCw, TrendingUp, Users, MousePointerClick, ShoppingCart,
  CircleCheck as CheckCircle2, ArrowRight, CircleAlert as AlertCircle,
  Monitor, Smartphone, Tablet, Info, Copy, ClipboardCheck, Clock,
} from "lucide-react";
import { fetchMarketingInsights, type MarketingInsightsRange } from "@/lib/adminApi";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FunnelData {
  page_views: number;
  gate_views: number;
  landing_cta_clicks: number;
  pricing_cta_clicks: number;
  neeko_plus_clicks: number;
  cta_clicks: number;
  checkout_started: number;
  checkout_success: number;
  checkout_cancelled: number;
  conversion_rate: number;
  dropoffs: Record<string, number>;
}

interface CtaRow {
  event: string;
  button_text: string;
  section: string;
  source: string;
  clicks: number;
}

interface DeviceRow {
  os: string;
  browser: string;
  device_type: string;
  sessions: number;
  users: number;
}

interface SessionData {
  total_sessions: number;
  multi_page_sessions: number;
  sessions_with_cta: number;
  sessions_with_product: number;
  engagement_rate: number;
}

interface TopPage {
  page: string;
  views: number;
}

interface AcquisitionRow {
  source?: string;
  medium?: string;
  campaign?: string;
  sessions: number;
}

interface SessionReviewRow {
  session_id: string;
  page_views: number;
  cta_clicks: number;
  checkout_starts: number;
  product_events: number;
  session_start: string;
  os: string;
  browser: string;
  device: string;
}

interface InsightsData {
  posthog_available: boolean;
  funnel?: FunnelData;
  cta_performance?: CtaRow[];
  devices?: DeviceRow[];
  sessions?: SessionData;
  top_pages?: TopPage[];
  acquisition?: { utms: AcquisitionRow[]; referrers: Array<{ referrer: string; sessions: number }> };
  session_review_shortlist?: SessionReviewRow[];
  behaviour_insights?: string[];
  recommended_actions?: string[];
  date_range_days?: number | null;
  date_range_hours?: number | null;
}

type FreshnessStatus = "fresh" | "stale" | "unknown";

// ─── Safe format helpers ──────────────────────────────────────────────────────

function safeNumber(value: unknown, fallback = "Not available"): string {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "string" ? parseFloat(value) : (value as number);
  if (typeof n !== "number" || !isFinite(n)) return fallback;
  return n.toLocaleString();
}

function safePercent(value: unknown, fallback = "Not available"): string {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "string" ? parseFloat(value) : (value as number);
  if (typeof n !== "number" || !isFinite(n)) return fallback;
  return `${n.toFixed(1)}%`;
}

function safeInt(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "string" ? parseFloat(value) : (value as number);
  if (typeof n !== "number" || !isFinite(n)) return 0;
  return n;
}

function safeText(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined) return fallback;
  const s = String(value);
  if (s === "[object Object]" || s === "") return fallback;
  return s;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DATE_RANGES: { label: string; value: MarketingInsightsRange; description: string }[] = [
  { label: "12h", value: "12h", description: "Last 12 hours" },
  { label: "24h", value: "24h", description: "Last 24 hours" },
  { label: "3d", value: "3d", description: "Last 3 days" },
  { label: "7d", value: "7d", description: "Last 7 days" },
  { label: "14d", value: "14d", description: "Last 14 days" },
  { label: "1mo", value: "30d", description: "Last 30 days" },
];

function maxAgeMs(range: MarketingInsightsRange): number {
  if (range === "12h" || range === "24h") return 5 * 60 * 1000;
  return 10 * 60 * 1000;
}

function rangeLabelLong(range: MarketingInsightsRange): string {
  return DATE_RANGES.find(r => r.value === range)?.description ?? range;
}

// ─── Clipboard helpers ────────────────────────────────────────────────────────

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ─── Analysis pack builder ────────────────────────────────────────────────────

function buildAnalysisPack(data: InsightsData, range: MarketingInsightsRange, fetchedAt: Date): string {
  const rangeLabel = rangeLabelLong(range);
  const fetchedStr = fetchedAt.toLocaleString("en-AU", { timeZoneName: "short" });

  const funnel = data.funnel;
  const cta = data.cta_performance ?? [];
  const devices = data.devices ?? [];
  const sessions = data.sessions;
  const topPages = data.top_pages ?? [];
  const acquisition = data.acquisition;
  const sessionReview = data.session_review_shortlist ?? [];
  const insights = data.behaviour_insights ?? [];
  const actions = data.recommended_actions ?? [];

  const lines: string[] = [];

  lines.push(`# Neeko Sports — Marketing Analytics Pack`);
  lines.push(`Date range: ${rangeLabel} | Fetched: ${fetchedStr}`);
  lines.push(`Admin traffic excluded. No emails or PII included.`);
  lines.push(``);

  // ── 1. Executive Summary
  lines.push(`## 1. Executive Summary`);
  if (funnel) {
    lines.push(`- Page Views: ${safeNumber(funnel.page_views)}`);
    lines.push(`- CTA Clicks: ${safeNumber(funnel.cta_clicks)}`);
    lines.push(`- Checkout Starts: ${safeNumber(funnel.checkout_started)}`);
    lines.push(`- Purchases: ${safeNumber(funnel.checkout_success)}`);
    lines.push(`- Checkout Conversion: ${safePercent(funnel.conversion_rate)}`);
  }
  if (sessions) {
    lines.push(`- Total Sessions: ${safeNumber(sessions.total_sessions)}`);
    lines.push(`- Engagement Rate: ${safePercent(sessions.engagement_rate)}`);
    lines.push(`- Sessions with CTA: ${safeNumber(sessions.sessions_with_cta)}`);
  }
  if (!funnel && !sessions) {
    lines.push(`No summary data available.`);
  }
  lines.push(``);

  // ── 2. Conversion Funnel
  lines.push(`## 2. Conversion Funnel`);
  if (funnel) {
    lines.push(`| Stage | Count | Drop-off |`);
    lines.push(`|---|---|---|`);
    lines.push(`| Page Views | ${safeNumber(funnel.page_views)} | — |`);
    lines.push(`| Gate Views | ${safeNumber(funnel.gate_views)} | — |`);
    lines.push(`| CTA Clicks | ${safeNumber(funnel.cta_clicks)} | ${funnel.dropoffs?.views_to_cta ?? 0}% from views |`);
    lines.push(`| Checkout Started | ${safeNumber(funnel.checkout_started)} | ${funnel.dropoffs?.cta_to_checkout ?? 0}% from CTA |`);
    lines.push(`| Checkout Success | ${safeNumber(funnel.checkout_success)} | ${funnel.dropoffs?.checkout_to_success ?? 0}% from starts |`);
    lines.push(`| Checkout Cancelled | ${safeNumber(funnel.checkout_cancelled)} | — |`);
    lines.push(``);
    lines.push(`Landing CTA: ${safeInt(funnel.landing_cta_clicks)} | Pricing CTA: ${safeInt(funnel.pricing_cta_clicks)} | Neeko+ btn: ${safeInt(funnel.neeko_plus_clicks)}`);
  } else {
    lines.push(`No funnel data.`);
  }
  lines.push(``);

  // ── 3. Top Pages
  lines.push(`## 3. Top Pages`);
  if (topPages.length > 0) {
    lines.push(`| # | Page | Views |`);
    lines.push(`|---|---|---|`);
    topPages.slice(0, 15).forEach((p, i) => {
      const url = p.page ? p.page.replace(/https?:\/\/[^/]+/, "") || "/" : "/";
      lines.push(`| ${i + 1} | ${url} | ${safeNumber(p.views)} |`);
    });
  } else {
    lines.push(`No page data.`);
  }
  lines.push(``);

  // ── 4. Top CTA Events
  lines.push(`## 4. Top CTA Events`);
  const totalCtaClicks = cta.reduce((s, r) => s + safeInt(r.clicks), 0);
  lines.push(`Total CTA clicks: ${totalCtaClicks.toLocaleString()}`);
  if (cta.length > 0) {
    lines.push(``);
    lines.push(`| Event | Button | Section | Clicks |`);
    lines.push(`|---|---|---|---|`);
    cta.slice(0, 20).forEach(r => {
      lines.push(`| ${safeText(r.event)} | ${safeText(r.button_text)} | ${safeText(r.section)} | ${safeInt(r.clicks)} |`);
    });
  }
  lines.push(``);

  // ── 5. CTA Performance Analysis
  lines.push(`## 5. CTA Performance`);
  if (cta.length > 0) {
    const topCta = cta[0];
    lines.push(`Top CTA: "${safeText(topCta.button_text || topCta.event)}" — ${safeInt(topCta.clicks)} clicks`);
    const ctaByEvent: Record<string, number> = {};
    for (const r of cta) {
      ctaByEvent[r.event] = (ctaByEvent[r.event] ?? 0) + safeInt(r.clicks);
    }
    lines.push(``);
    lines.push(`By event type:`);
    Object.entries(ctaByEvent).sort((a, b) => b[1] - a[1]).forEach(([ev, n]) => {
      lines.push(`- ${ev}: ${n}`);
    });
  } else {
    lines.push(`No CTA data.`);
  }
  lines.push(``);

  // ── 6. Campaign / Source Performance
  lines.push(`## 6. Campaign / Traffic Source Performance`);
  const utms = acquisition?.utms ?? [];
  const referrers = acquisition?.referrers ?? [];
  if (utms.length > 0) {
    lines.push(`### UTM Campaigns`);
    lines.push(`| Source | Medium | Campaign | Sessions |`);
    lines.push(`|---|---|---|---|`);
    utms.slice(0, 15).forEach(r => {
      lines.push(`| ${safeText(r.source)} | ${safeText(r.medium)} | ${safeText(r.campaign)} | ${safeInt(r.sessions)} |`);
    });
    lines.push(``);
  }
  if (referrers.length > 0) {
    lines.push(`### Referrers`);
    lines.push(`| Referrer | Sessions |`);
    lines.push(`|---|---|`);
    referrers.slice(0, 10).forEach(r => {
      lines.push(`| ${safeText(r.referrer)} | ${safeInt(r.sessions)} |`);
    });
  }
  if (utms.length === 0 && referrers.length === 0) {
    lines.push(`No campaign data in this range.`);
  }
  lines.push(``);

  // ── 7. Device Breakdown
  lines.push(`## 7. Device Breakdown`);
  const totalDeviceSessions = devices.reduce((s, d) => s + safeInt(d.sessions), 0);
  const deviceTypes: Record<string, number> = {};
  for (const d of devices) {
    const key = (d.device_type || "unknown").toLowerCase();
    deviceTypes[key] = (deviceTypes[key] ?? 0) + safeInt(d.sessions);
  }
  if (Object.keys(deviceTypes).length > 0) {
    Object.entries(deviceTypes).sort((a, b) => b[1] - a[1]).forEach(([type, n]) => {
      const pct = totalDeviceSessions > 0 ? Math.round((n / totalDeviceSessions) * 100) : 0;
      lines.push(`- ${type}: ${n.toLocaleString()} sessions (${pct}%)`);
    });
  } else {
    lines.push(`No device data.`);
  }
  lines.push(``);
  lines.push(`Top browsers:`);
  const browserTotals: Record<string, number> = {};
  for (const d of devices) {
    const b = d.browser || "Unknown";
    browserTotals[b] = (browserTotals[b] ?? 0) + safeInt(d.sessions);
  }
  const browserEntries = Object.entries(browserTotals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (browserEntries.length > 0) {
    browserEntries.forEach(([b, n]) => {
      lines.push(`- ${b}: ${n.toLocaleString()}`);
    });
  } else {
    lines.push(`No browser data.`);
  }
  lines.push(``);

  // ── 8. Behaviour Notes
  lines.push(`## 8. Behaviour Notes`);
  if (insights.length > 0) {
    insights.forEach(i => lines.push(`- ${i}`));
  } else {
    lines.push(`No auto-generated insights.`);
  }
  lines.push(``);
  if (actions.length > 0) {
    lines.push(`### Recommended Actions`);
    actions.forEach(a => lines.push(`- ${a}`));
  }
  lines.push(``);

  // ── 9. Session Review Shortlist
  lines.push(`## 9. Session Review Shortlist`);
  lines.push(`High-intent sessions (CTA clicks, checkout starts, or 3+ pages + 2+ product events).`);
  lines.push(`Session IDs truncated for privacy.`);
  if (sessionReview.length > 0) {
    lines.push(``);
    lines.push(`| Session | Pages | CTA | Checkout | Product Events | OS | Browser |`);
    lines.push(`|---|---|---|---|---|---|---|`);
    sessionReview.forEach(s => {
      lines.push(`| ${safeText(s.session_id)} | ${safeInt(s.page_views)} | ${safeInt(s.cta_clicks)} | ${safeInt(s.checkout_starts)} | ${safeInt(s.product_events)} | ${safeText(s.os)} | ${safeText(s.browser)} |`);
    });
  } else {
    lines.push(`No high-intent sessions in this range.`);
  }
  lines.push(``);

  // ── 10. Questions for ChatGPT
  lines.push(`## 10. Questions for ChatGPT`);
  lines.push(`Based on the data above, please help answer:`);
  lines.push(``);
  lines.push(`1. What is the most likely reason for the CTA-to-checkout drop-off rate?`);
  lines.push(`2. Which traffic sources appear to drive the highest-intent visitors?`);
  lines.push(`3. Are there any unusual patterns in the page flow that suggest navigation friction?`);
  lines.push(`4. What should we test first to improve checkout conversion?`);
  lines.push(`5. Does the device breakdown suggest any UX optimisation priorities (mobile vs desktop)?`);
  lines.push(`6. Based on the session review shortlist, what common behaviours can you spot among near-converters?`);
  lines.push(`7. What content or campaign would you recommend to increase top-of-funnel traffic?`);

  return lines.join("\n");
}

// ─── Section copy helpers ─────────────────────────────────────────────────────

function buildFunnelSection(data: InsightsData, range: MarketingInsightsRange): string {
  const funnel = data.funnel;
  if (!funnel) return `No funnel data available for ${rangeLabelLong(range)}.`;
  return [
    `Funnel — ${rangeLabelLong(range)}`,
    `Page Views: ${safeNumber(funnel.page_views)}`,
    `Gate Views: ${safeNumber(funnel.gate_views)}`,
    `CTA Clicks: ${safeNumber(funnel.cta_clicks)} (${100 - safeInt(funnel.dropoffs?.views_to_cta)}% of views)`,
    `Checkout Started: ${safeNumber(funnel.checkout_started)} (${100 - safeInt(funnel.dropoffs?.cta_to_checkout)}% of CTAs)`,
    `Checkout Success: ${safeNumber(funnel.checkout_success)} (${safePercent(funnel.conversion_rate)} of starts)`,
    `Checkout Cancelled: ${safeNumber(funnel.checkout_cancelled)}`,
  ].join("\n");
}

function buildCtaSection(data: InsightsData, range: MarketingInsightsRange): string {
  const cta = data.cta_performance ?? [];
  if (cta.length === 0) return `No CTA data available for ${rangeLabelLong(range)}.`;
  const total = cta.reduce((s, r) => s + safeInt(r.clicks), 0);
  const rows = cta.slice(0, 20).map(r =>
    `${safeText(r.event)} | "${safeText(r.button_text)}" | ${safeText(r.section)} | ${safeInt(r.clicks)} clicks`
  );
  return [`CTA Performance — ${rangeLabelLong(range)} | Total: ${total}`, ...rows].join("\n");
}

function buildCampaignSection(data: InsightsData, range: MarketingInsightsRange): string {
  const utms = data.acquisition?.utms ?? [];
  const referrers = data.acquisition?.referrers ?? [];
  const rows: string[] = [`Campaign/Source — ${rangeLabelLong(range)}`];
  if (utms.length > 0) {
    rows.push("UTM Sources:");
    utms.slice(0, 15).forEach(r => rows.push(`  ${safeText(r.source, "direct")} / ${safeText(r.medium)} / ${safeText(r.campaign)} — ${safeInt(r.sessions)} sessions`));
  }
  if (referrers.length > 0) {
    rows.push("Referrers:");
    referrers.slice(0, 10).forEach(r => rows.push(`  ${safeText(r.referrer)} — ${safeInt(r.sessions)} sessions`));
  }
  if (utms.length === 0 && referrers.length === 0) rows.push("No campaign data.");
  return rows.join("\n");
}

function buildSessionReviewSection(data: InsightsData, range: MarketingInsightsRange): string {
  const sessions = data.session_review_shortlist ?? [];
  if (sessions.length === 0) return `No high-intent sessions in ${rangeLabelLong(range)}.`;
  const rows = sessions.map(s =>
    `${safeText(s.session_id)} | ${safeInt(s.page_views)}pv | ${safeInt(s.cta_clicks)}cta | ${safeInt(s.checkout_starts)}checkout | ${safeInt(s.product_events)}prod | ${safeText(s.os)} ${safeText(s.browser)}`
  );
  return [`Session Review — ${rangeLabelLong(range)} (truncated IDs, no PII)`, ...rows].join("\n");
}

function buildTrafficSection(data: InsightsData, range: MarketingInsightsRange): string {
  const topPages = data.top_pages ?? [];
  const sessions = data.sessions;
  const lines: string[] = [`Traffic Summary — ${rangeLabelLong(range)}`];
  if (sessions) {
    lines.push(`Total Sessions: ${safeNumber(sessions.total_sessions)}`);
    lines.push(`Multi-page: ${safeNumber(sessions.multi_page_sessions)}`);
    lines.push(`With CTA: ${safeNumber(sessions.sessions_with_cta)}`);
    lines.push(`With Product: ${safeNumber(sessions.sessions_with_product)}`);
    lines.push(`Engagement Rate: ${safePercent(sessions.engagement_rate)}`);
  } else {
    lines.push(`No session data available.`);
  }
  if (topPages.length > 0) {
    lines.push(`\nTop Pages:`);
    topPages.slice(0, 10).forEach((p, i) => {
      const url = p.page ? p.page.replace(/https?:\/\/[^/]+/, "") || "/" : "/";
      lines.push(`  ${i + 1}. ${url} — ${safeNumber(p.views)} views`);
    });
  }
  return lines.join("\n");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({ getText, label = "Copy", small = false, disabled = false }: { getText: () => string; label?: string; small?: boolean; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (disabled) return;
    const text = getText();
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (small) {
    return (
      <button
        onClick={handleCopy}
        disabled={disabled}
        title={copied ? "Copied!" : label}
        className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          copied
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
      >
        {copied ? <ClipboardCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : label}
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        copied
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
    >
      {copied ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium tracking-wide uppercase">{label}</span>
        <div className={`flex items-center justify-center w-7 h-7 rounded-md ${accent ?? "bg-muted/50"}`}>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function FunnelCard({ funnel, onCopy }: { funnel: FunnelData; onCopy?: () => string }) {
  const stages = [
    { stage: "page_views", users: safeInt(funnel.page_views) },
    { stage: "gate_views", users: safeInt(funnel.gate_views) },
    { stage: "cta_clicks", users: safeInt(funnel.cta_clicks) },
    { stage: "checkout_started", users: safeInt(funnel.checkout_started) },
    { stage: "checkout_success", users: safeInt(funnel.checkout_success) },
  ];
  const top = stages[0]?.users ?? 0;

  return (
    <div className="rounded-lg border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Conversion Funnel</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
            {safePercent(funnel.conversion_rate, "0.0%")} overall
          </span>
          {onCopy && <CopyButton getText={onCopy} small label="Copy" />}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {stages.map((stage, i) => {
          const pct = top > 0 ? (stage.users / top) * 100 : 0;
          const prevUsers = i > 0 ? stages[i - 1].users : stage.users;
          const dropoff = i > 0 && prevUsers > 0 ? (((prevUsers - stage.users) / prevUsers) * 100).toFixed(0) : null;

          return (
            <div key={stage.stage}>
              {dropoff !== null && (
                <div className="flex items-center gap-1.5 py-0.5 pl-3">
                  <ArrowRight className="h-3 w-3 text-red-500/60 rotate-90" />
                  <span className="text-[11px] text-red-400/70">{dropoff}% drop-off</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-36 shrink-0 truncate capitalize">
                  {stage.stage.replace(/_/g, " ")}
                </span>
                <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden">
                  <div
                    className="h-full rounded bg-blue-500/70 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums font-mono text-right w-14 shrink-0">
                  {stage.users.toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeviceBreakdown({ devices }: { devices: DeviceRow[] }) {
  const total = devices.reduce((s, d) => s + safeInt(d.sessions), 0);
  const types: { label: string; icon: React.ElementType; key: string }[] = [
    { label: "Desktop", icon: Monitor, key: "desktop" },
    { label: "Mobile", icon: Smartphone, key: "mobile" },
    { label: "Tablet", icon: Tablet, key: "tablet" },
  ];

  const byType = types.map(({ label, icon, key }) => {
    const count = devices
      .filter(d => (d.device_type ?? "").toLowerCase().includes(key))
      .reduce((s, d) => s + safeInt(d.sessions), 0);
    return { label, icon, count };
  });

  return (
    <div className="rounded-lg border border-border/60 bg-card p-5">
      <h3 className="text-sm font-semibold mb-4">Device Breakdown</h3>
      <div className="flex flex-col gap-3">
        {byType.map(({ label, icon: Icon, count }) => {
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={label} className="flex items-center gap-3">
              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
              <div className="flex-1 h-2.5 bg-muted/30 rounded overflow-hidden">
                <div className="h-full rounded bg-blue-400/60" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs tabular-nums font-mono w-10 text-right">{pct.toFixed(0)}%</span>
              <span className="text-xs text-muted-foreground/60 w-10 text-right">{count.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
      {devices.length > 0 && (
        <div className="mt-4 border-t border-border/40 pt-3">
          <p className="text-xs text-muted-foreground mb-2 font-medium">Top Browsers</p>
          {devices
            .sort((a, b) => safeInt(b.sessions) - safeInt(a.sessions))
            .slice(0, 4)
            .map((d, i) => (
              <div key={i} className="flex items-center justify-between py-0.5">
                <span className="text-xs text-muted-foreground truncate">{d.browser || "Unknown"}</span>
                <span className="text-xs font-mono tabular-nums">{safeInt(d.sessions).toLocaleString()}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function SetupPanel() {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-950/10 p-6 flex flex-col items-center gap-3 text-center">
      <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
        <Info className="h-5 w-5 text-amber-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-amber-300">PostHog not configured</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          Set <code className="bg-muted px-1 rounded text-[11px]">POSTHOG_API_KEY</code> and{" "}
          <code className="bg-muted px-1 rounded text-[11px]">POSTHOG_PROJECT_ID</code> as Edge Function secrets to enable marketing analytics.
        </p>
      </div>
    </div>
  );
}

function FreshnessIndicator({ status, lastFetchedAt, selectedRange, dataRange }: {
  status: FreshnessStatus;
  lastFetchedAt: Date | null;
  selectedRange: MarketingInsightsRange;
  dataRange: MarketingInsightsRange | null;
}) {
  if (!lastFetchedAt) return null;

  const rangeMismatch = dataRange !== null && dataRange !== selectedRange;

  return (
    <div className={`flex items-center gap-1.5 text-[11px] font-medium ${
      rangeMismatch || status === "stale"
        ? "text-amber-400"
        : "text-muted-foreground/60"
    }`}>
      <Clock className="h-3 w-3" />
      {rangeMismatch
        ? `Data is for ${rangeLabelLong(dataRange!)} — click Refresh`
        : status === "stale"
          ? `Data is stale (${lastFetchedAt.toLocaleTimeString()}) — refresh before copying`
          : `Fetched ${lastFetchedAt.toLocaleTimeString()}`
      }
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminMarketingInsights() {
  const [selectedRange, setSelectedRange] = useState<MarketingInsightsRange>("7d");
  const [dataRange, setDataRange] = useState<MarketingInsightsRange | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const freshnessStatus: FreshnessStatus = (() => {
    if (!lastFetchedAt || !dataRange) return "unknown";
    const age = Date.now() - lastFetchedAt.getTime();
    return age > maxAgeMs(dataRange) ? "stale" : "fresh";
  })();

  const isDataReadyForRange = !!(data && dataRange === selectedRange && freshnessStatus === "fresh");

  const load = useCallback(async (range: MarketingInsightsRange) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMarketingInsights(range) as InsightsData;
      setData(result);
      setDataRange(range);
      setLastFetchedAt(new Date());
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRangeChange = (range: MarketingInsightsRange) => {
    setSelectedRange(range);
    load(range);
  };

  const handleRefresh = () => load(selectedRange);

  const getAnalysisPack = () => {
    if (loading) return "Data is loading. Please wait.";
    if (!data || !lastFetchedAt || !dataRange) return "No data loaded. Click Refresh first.";
    if (!data.posthog_available) return "PostHog is not configured. No analytics data available.";
    if (freshnessStatus === "stale") return "Data is stale. Please refresh before copying.";
    if (dataRange !== selectedRange) return `Data loaded for ${rangeLabelLong(dataRange)}, not ${rangeLabelLong(selectedRange)}. Please refresh.`;
    return buildAnalysisPack(data, dataRange, lastFetchedAt);
  };

  const funnel = data?.funnel;
  const cta = data?.cta_performance ?? [];
  const devices = data?.devices ?? [];
  const sessions = data?.sessions;
  const topPages = data?.top_pages ?? [];
  const acquisition = data?.acquisition?.utms ?? [];
  const sessionReview = data?.session_review_shortlist ?? [];
  const insights = data?.behaviour_insights ?? [];
  const actions = data?.recommended_actions ?? [];

  const engagementRate = safeInt(sessions?.engagement_rate);
  const totalCtaClicks = cta.reduce((s, r) => s + safeInt(r.clicks), 0);

  const copyDisabled = loading || !data || !data.posthog_available || !isDataReadyForRange;

  const staleCopyWarning = !isDataReadyForRange && data && data.posthog_available
    ? (loading
        ? "Loading fresh data…"
        : dataRange !== selectedRange
          ? `Data loaded for ${dataRange} — refresh to load ${selectedRange}`
          : "Data is stale — refresh before copying")
    : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Marketing Analytics</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            PostHog data — admin traffic excluded
          </p>
          <FreshnessIndicator
            status={freshnessStatus}
            lastFetchedAt={lastFetchedAt}
            selectedRange={selectedRange}
            dataRange={dataRange}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-md border border-border/60 overflow-hidden">
            {DATE_RANGES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => handleRangeChange(value)}
                title={DATE_RANGES.find(r => r.value === value)?.description}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedRange === value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ChatGPT Pack copy bar */}
      {data && data.posthog_available && (
        <div className="rounded-lg border border-border/60 bg-card px-4 py-3 flex flex-wrap items-center gap-2 mb-5">
          <span className="text-xs font-semibold text-muted-foreground mr-1">Copy for ChatGPT:</span>

          <CopyButton
            getText={getAnalysisPack}
            label="Copy Full Analysis Pack"
            disabled={copyDisabled}
          />
          <CopyButton
            getText={() => data ? buildTrafficSection(data, dataRange ?? selectedRange) : "No data available for this section in the selected date range."}
            label="Traffic Summary"
            disabled={copyDisabled}
          />
          <CopyButton
            getText={() => data && funnel ? buildFunnelSection(data, dataRange ?? selectedRange) : "No funnel data available for this section in the selected date range."}
            label="Funnel"
            disabled={copyDisabled}
          />
          <CopyButton
            getText={() => data ? buildCtaSection(data, dataRange ?? selectedRange) : "No data available for this section in the selected date range."}
            label="CTA"
            disabled={copyDisabled}
          />
          <CopyButton
            getText={() => data ? buildCampaignSection(data, dataRange ?? selectedRange) : "No data available for this section in the selected date range."}
            label="Campaign"
            disabled={copyDisabled}
          />
          <CopyButton
            getText={() => data ? buildSessionReviewSection(data, dataRange ?? selectedRange) : "No data available for this section in the selected date range."}
            label="Session Review"
            disabled={copyDisabled}
          />

          {staleCopyWarning && (
            <span className="text-[11px] text-amber-400 ml-auto flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {staleCopyWarning}
            </span>
          )}
        </div>
      )}

      {/* Not loaded yet */}
      {!data && !loading && !error && (
        <div className="rounded-lg border border-border/60 bg-card p-10 flex flex-col items-center gap-3 text-center">
          <TrendingUp className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Select a date range and click Refresh to load marketing data.</p>
          <button
            onClick={handleRefresh}
            className="mt-1 px-4 py-2 rounded-md bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Load Data
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground/40 tracking-wide uppercase">Querying PostHog…</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-950/10 p-5 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-300">Failed to load analytics</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Setup panel */}
      {data && !data.posthog_available && <SetupPanel />}

      {/* Dashboard */}
      {data && data.posthog_available && !loading && (
        <div className="flex flex-col gap-5">
          {/* Overview cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              label="Page Views"
              value={safeNumber(funnel?.page_views, "0")}
              sub={`${rangeLabelLong(dataRange ?? selectedRange)}`}
              icon={TrendingUp}
              accent="bg-blue-500/10"
            />
            <StatCard
              label="Sessions"
              value={safeNumber(sessions?.total_sessions, "0")}
              sub={`${safeInt(sessions?.multi_page_sessions)} multi-page`}
              icon={Users}
              accent="bg-blue-500/10"
            />
            <StatCard
              label="Engaged Sessions"
              value={`${engagementRate.toFixed(0)}%`}
              sub={`${safeInt(sessions?.sessions_with_cta).toLocaleString()} with CTA`}
              icon={MousePointerClick}
              accent="bg-amber-500/10"
            />
            <StatCard
              label="CTA Clicks"
              value={totalCtaClicks.toLocaleString()}
              sub={`${cta.length} button types`}
              icon={MousePointerClick}
              accent="bg-amber-500/10"
            />
            <StatCard
              label="Checkout Starts"
              value={safeNumber(funnel?.checkout_started, "0")}
              sub="Initiated checkout"
              icon={ShoppingCart}
              accent="bg-orange-500/10"
            />
            <StatCard
              label="Purchases"
              value={safeNumber(funnel?.checkout_success, "0")}
              sub={`${safePercent(funnel?.conversion_rate, "0%")} of starts`}
              icon={CheckCircle2}
              accent="bg-emerald-500/10"
            />
          </div>

          {/* Funnel + Devices row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {funnel && (
              <FunnelCard
                funnel={funnel}
                onCopy={data ? () => buildFunnelSection(data, dataRange ?? selectedRange) : undefined}
              />
            )}
            {devices.length > 0 && <DeviceBreakdown devices={devices} />}
          </div>

          {/* CTA Performance */}
          {cta.length > 0 && (
            <div className="rounded-lg border border-border/60 bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">CTA Performance</h3>
                <CopyButton
                  getText={() => data ? buildCtaSection(data, dataRange ?? selectedRange) : "No data available for this section in the selected date range."}
                  small
                  label="Copy"
                  disabled={copyDisabled}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/40">
                      <th className="text-left font-medium text-muted-foreground pb-2 pr-4">Button</th>
                      <th className="text-left font-medium text-muted-foreground pb-2 pr-4">Section</th>
                      <th className="text-left font-medium text-muted-foreground pb-2 pr-4">Event</th>
                      <th className="text-right font-medium text-muted-foreground pb-2">Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cta
                      .sort((a, b) => safeInt(b.clicks) - safeInt(a.clicks))
                      .slice(0, 20)
                      .map((row, i) => (
                        <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                          <td className="py-2 pr-4 max-w-[200px] truncate text-foreground/80">{row.button_text || "—"}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{row.section || "—"}</td>
                          <td className="py-2 pr-4 text-muted-foreground/60 font-mono text-[11px]">{row.event}</td>
                          <td className="py-2 text-right tabular-nums font-semibold">{safeInt(row.clicks).toLocaleString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top Pages + Acquisition row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {topPages.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">Top Pages</h3>
                  <CopyButton
                    getText={() => data ? buildTrafficSection(data, dataRange ?? selectedRange) : "No data available for this section in the selected date range."}
                    small
                    label="Copy"
                    disabled={copyDisabled}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  {topPages.slice(0, 10).map((page, i) => {
                    const maxViews = safeInt(topPages[0]?.views) || 1;
                    const pct = (safeInt(page.views) / maxViews) * 100;
                    const url = page.page ? page.page.replace(/https?:\/\/[^/]+/, "") || "/" : "/";
                    return (
                      <div key={i} className="flex items-center gap-3 py-0.5">
                        <span className="text-xs text-muted-foreground/50 w-4 shrink-0 text-right">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs truncate text-foreground/80">{url}</span>
                          </div>
                          <div className="h-1 bg-muted/30 rounded mt-1 overflow-hidden">
                            <div className="h-full rounded bg-blue-400/50" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <span className="text-xs tabular-nums font-mono shrink-0">{safeInt(page.views).toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {acquisition.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">Traffic Sources</h3>
                  <CopyButton
                    getText={() => data ? buildCampaignSection(data, dataRange ?? selectedRange) : "No data available for this section in the selected date range."}
                    small
                    label="Copy"
                    disabled={copyDisabled}
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/40">
                        <th className="text-left font-medium text-muted-foreground pb-2 pr-3">Source</th>
                        <th className="text-left font-medium text-muted-foreground pb-2 pr-3">Medium</th>
                        <th className="text-right font-medium text-muted-foreground pb-2">Sessions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acquisition.slice(0, 12).map((row, i) => (
                        <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                          <td className="py-2 pr-3 text-foreground/80">{row.source || "direct"}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{row.medium || "—"}</td>
                          <td className="py-2 text-right tabular-nums font-semibold">{safeInt(row.sessions).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Session Review Shortlist */}
          {sessionReview.length > 0 && (
            <div className="rounded-lg border border-border/60 bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold">Session Review Shortlist</h3>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">High-intent sessions. Session IDs truncated — no PII.</p>
                </div>
                <CopyButton
                  getText={() => data ? buildSessionReviewSection(data, dataRange ?? selectedRange) : "No data available for this section in the selected date range."}
                  small
                  label="Copy"
                  disabled={copyDisabled}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/40">
                      <th className="text-left font-medium text-muted-foreground pb-2 pr-3">Session</th>
                      <th className="text-right font-medium text-muted-foreground pb-2 pr-3">Pages</th>
                      <th className="text-right font-medium text-muted-foreground pb-2 pr-3">CTA</th>
                      <th className="text-right font-medium text-muted-foreground pb-2 pr-3">Checkout</th>
                      <th className="text-right font-medium text-muted-foreground pb-2 pr-3">Product</th>
                      <th className="text-left font-medium text-muted-foreground pb-2">Device</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionReview.slice(0, 20).map((row, i) => (
                      <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                        <td className="py-2 pr-3 font-mono text-[11px] text-muted-foreground/70">{row.session_id}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{safeInt(row.page_views)}</td>
                        <td className={`py-2 pr-3 text-right tabular-nums font-semibold ${safeInt(row.cta_clicks) > 0 ? "text-amber-400" : ""}`}>
                          {safeInt(row.cta_clicks)}
                        </td>
                        <td className={`py-2 pr-3 text-right tabular-nums font-semibold ${safeInt(row.checkout_starts) > 0 ? "text-emerald-400" : ""}`}>
                          {safeInt(row.checkout_starts)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{safeInt(row.product_events)}</td>
                        <td className="py-2 text-muted-foreground text-[11px]">
                          {[row.device, row.browser].filter(Boolean).join(" / ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Behaviour insights + Recommended actions */}
          {(insights.length > 0 || actions.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {insights.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-card p-5">
                  <h3 className="text-sm font-semibold mb-3">Behaviour Insights</h3>
                  <ul className="flex flex-col gap-2">
                    {insights.map((insight, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400/70 mt-1.5 shrink-0" />
                        <span className="text-xs text-muted-foreground leading-relaxed">{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {actions.length > 0 && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-950/10 p-5">
                  <h3 className="text-sm font-semibold mb-3 text-amber-300">Recommended Actions</h3>
                  <ul className="flex flex-col gap-2">
                    {actions.map((action, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <ArrowRight className="h-3 w-3 text-amber-500/70 mt-0.5 shrink-0" />
                        <span className="text-xs text-muted-foreground leading-relaxed">{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
