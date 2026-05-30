import { useState, useCallback } from "react";
import { RefreshCw, TrendingUp, Users, MousePointerClick, ShoppingCart, CircleCheck as CheckCircle2, ArrowRight, CircleAlert as AlertCircle, Monitor, Smartphone, Tablet, Info } from "lucide-react";
import { fetchMarketingInsights } from "@/lib/adminApi";

type DateRange = 1 | 7 | 14 | 30;

interface FunnelStage {
  stage: string;
  users: number;
}

interface FunnelData {
  stages: FunnelStage[];
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
  page_url: string;
  views: number;
  users?: number;
}

interface AcquisitionRow {
  source?: string;
  medium?: string;
  campaign?: string;
  users: number;
  sessions: number;
}

interface InsightsData {
  posthog_available: boolean;
  funnel?: FunnelData;
  cta_performance?: CtaRow[];
  devices?: DeviceRow[];
  sessions?: SessionData;
  top_pages?: TopPage[];
  acquisition?: { utms: AcquisitionRow[] };
  behaviour_insights?: string[];
  recommended_actions?: string[];
  date_range_days?: number;
  wau?: number;
  mau?: number;
  checkout_starts?: number;
  purchases?: number;
  total_cta_clicks?: number;
}

const DATE_RANGES: { label: string; value: DateRange }[] = [
  { label: "1d", value: 1 },
  { label: "7d", value: 7 },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
];

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

function FunnelCard({ funnel }: { funnel: FunnelData }) {
  const stages = funnel.stages ?? [];
  const top = stages[0]?.users ?? 0;

  return (
    <div className="rounded-lg border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Conversion Funnel</h3>
        <span className="text-xs font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
          {(funnel.conversion_rate ?? 0).toFixed(1)}% overall
        </span>
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
  const total = devices.reduce((s, d) => s + (d.sessions ?? 0), 0);
  const types: { label: string; icon: React.ElementType; key: string }[] = [
    { label: "Desktop", icon: Monitor, key: "desktop" },
    { label: "Mobile", icon: Smartphone, key: "mobile" },
    { label: "Tablet", icon: Tablet, key: "tablet" },
  ];

  const byType = types.map(({ label, icon, key }) => {
    const count = devices
      .filter(d => (d.device_type ?? "").toLowerCase().includes(key))
      .reduce((s, d) => s + (d.sessions ?? 0), 0);
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
            .sort((a, b) => b.sessions - a.sessions)
            .slice(0, 4)
            .map((d, i) => (
              <div key={i} className="flex items-center justify-between py-0.5">
                <span className="text-xs text-muted-foreground truncate">{d.browser || "Unknown"}</span>
                <span className="text-xs font-mono tabular-nums">{d.sessions.toLocaleString()}</span>
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
          Set <code className="bg-muted px-1 rounded text-[11px]">POSTHOG_PERSONAL_API_KEY</code> and{" "}
          <code className="bg-muted px-1 rounded text-[11px]">POSTHOG_PROJECT_ID</code> as Edge Function secrets to enable marketing analytics.
        </p>
      </div>
    </div>
  );
}

export default function AdminMarketingInsights() {
  const [dateRange, setDateRange] = useState<DateRange>(7);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const load = useCallback(async (days: DateRange) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMarketingInsights(days) as InsightsData;
      setData(result);
      setLastRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRangeChange = (range: DateRange) => {
    setDateRange(range);
    load(range);
  };

  const funnel = data?.funnel;
  const cta = data?.cta_performance ?? [];
  const devices = data?.devices ?? [];
  const sessions = data?.sessions;
  const topPages = data?.top_pages ?? [];
  const acquisition = data?.acquisition?.utms ?? [];
  const insights = data?.behaviour_insights ?? [];
  const actions = data?.recommended_actions ?? [];

  const engagementRate = sessions?.engagement_rate ?? 0;
  const totalCtaClicks = cta.reduce((s, r) => s + (r.clicks ?? 0), 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Marketing Analytics</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            PostHog data — admin traffic excluded
            {lastRefreshed && (
              <span className="ml-2 text-muted-foreground/50">
                Last refreshed {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date range */}
          <div className="flex items-center rounded-md border border-border/60 overflow-hidden">
            {DATE_RANGES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => handleRangeChange(value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  dateRange === value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => load(dateRange)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Not loaded yet */}
      {!data && !loading && !error && (
        <div className="rounded-lg border border-border/60 bg-card p-10 flex flex-col items-center gap-3 text-center">
          <TrendingUp className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Select a date range and click Refresh to load marketing data.</p>
          <button
            onClick={() => load(dateRange)}
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
      {data && data.posthog_available && (
        <div className="flex flex-col gap-5">
          {/* Overview cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              label="WAU"
              value={(data.wau ?? 0).toLocaleString()}
              sub="Weekly active users"
              icon={Users}
              accent="bg-blue-500/10"
            />
            <StatCard
              label="MAU"
              value={(data.mau ?? 0).toLocaleString()}
              sub="Monthly active users"
              icon={Users}
              accent="bg-blue-500/10"
            />
            <StatCard
              label="Engaged Sessions"
              value={`${engagementRate.toFixed(0)}%`}
              sub={`${(sessions?.sessions_with_cta ?? 0).toLocaleString()} with CTA`}
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
              value={(data.checkout_starts ?? 0).toLocaleString()}
              sub="Initiated checkout"
              icon={ShoppingCart}
              accent="bg-orange-500/10"
            />
            <StatCard
              label="Purchases"
              value={(data.purchases ?? 0).toLocaleString()}
              sub="Completed payments"
              icon={CheckCircle2}
              accent="bg-emerald-500/10"
            />
          </div>

          {/* Funnel + Devices row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {funnel && <FunnelCard funnel={funnel} />}
            {devices.length > 0 && <DeviceBreakdown devices={devices} />}
          </div>

          {/* CTA Performance */}
          {cta.length > 0 && (
            <div className="rounded-lg border border-border/60 bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">CTA Performance</h3>
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
                      .sort((a, b) => b.clicks - a.clicks)
                      .slice(0, 20)
                      .map((row, i) => (
                        <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                          <td className="py-2 pr-4 max-w-[200px] truncate text-foreground/80">{row.button_text || "—"}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{row.section || "—"}</td>
                          <td className="py-2 pr-4 text-muted-foreground/60 font-mono text-[11px]">{row.event}</td>
                          <td className="py-2 text-right tabular-nums font-semibold">{row.clicks.toLocaleString()}</td>
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
                <h3 className="text-sm font-semibold mb-4">Top Pages</h3>
                <div className="flex flex-col gap-1">
                  {topPages.slice(0, 10).map((page, i) => {
                    const maxViews = topPages[0]?.views ?? 1;
                    const pct = (page.views / maxViews) * 100;
                    return (
                      <div key={i} className="flex items-center gap-3 py-0.5">
                        <span className="text-xs text-muted-foreground/50 w-4 shrink-0 text-right">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs truncate text-foreground/80">{page.page_url || "/"}</span>
                          </div>
                          <div className="h-1 bg-muted/30 rounded mt-1 overflow-hidden">
                            <div className="h-full rounded bg-blue-400/50" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <span className="text-xs tabular-nums font-mono shrink-0">{page.views.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {acquisition.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-card p-5">
                <h3 className="text-sm font-semibold mb-4">Traffic Sources</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/40">
                        <th className="text-left font-medium text-muted-foreground pb-2 pr-3">Source</th>
                        <th className="text-left font-medium text-muted-foreground pb-2 pr-3">Medium</th>
                        <th className="text-right font-medium text-muted-foreground pb-2">Users</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acquisition.slice(0, 12).map((row, i) => (
                        <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                          <td className="py-2 pr-3 text-foreground/80">{row.source || "direct"}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{row.medium || "—"}</td>
                          <td className="py-2 text-right tabular-nums font-semibold">{row.users.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

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
