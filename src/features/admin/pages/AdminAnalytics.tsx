import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { RefreshCw, Users, TrendingUp, Activity, Target, ChartBar as BarChart3, CircleAlert as AlertCircle, Clock, Zap, ChartBar as BarChart2 } from "lucide-react";
import { AdminPageHeader } from "@/features/admin/shared/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchAdminDashboardData, fetchPostHogAnalytics } from "@/lib/adminApi";
import { SubscriberTable } from "@/features/admin/subscribers/SubscriberTable";

const AdminMarketingInsights = lazy(() => import("@/features/admin/pages/AdminMarketingInsights"));
const AdminGoogleAds = lazy(() => import("@/features/admin/pages/AdminGoogleAds"));

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubMetrics {
  total_profiles: number;
  active_subscriptions: number;
  cancelling_count: number;
  expired_count: number;
  manual_premium_count: number;
  trialing_count: number;
  signups_24h: number;
  signups_7d: number;
  signups_30d: number;
}

interface PHActiveUsers { dau: number; wau: number; mau: number }
interface PHEventCounts { [event: string]: number }
interface PHActiveNow { active_5min: number; active_30min: number }
interface PHTopPage { page: string; views: number }
interface PHFeature { feature: string; uses: number }
interface PHReferrer { referrer: string; sessions: number }
interface PHUTM { source: string; medium: string; campaign: string; sessions: number }
interface PHFunnel {
  page_views: number;
  pricing_views: number;
  plan_selected: number;
  checkout_started: number;
  checkout_success: number;
  checkout_cancelled: number;
  upgrade_clicks: number;
  signups: number;
  logins: number;
}
interface PHRecentEvent {
  event: string;
  distinct_id: string;
  current_url: string;
  os: string;
  browser: string;
  timestamp: string;
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function formatNum(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function pct(a: number, b: number): string {
  if (!b) return "0%";
  return `${((a / b) * 100).toFixed(1)}%`;
}

function relTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function friendlyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname || url;
  } catch {
    return url;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  sub,
  color = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: "default" | "green" | "amber" | "red" | "blue";
}) {
  const colorMap = {
    default: "text-foreground",
    green: "text-emerald-500",
    amber: "text-amber-500",
    red: "text-red-500",
    blue: "text-blue-500",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${colorMap[color]}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

function PHUnavailable() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <AlertCircle className="h-8 w-8 text-amber-500" />
      <p className="text-sm font-medium text-foreground">PostHog not configured</p>
      <p className="text-xs text-muted-foreground max-w-xs">
        Set <code className="bg-muted px-1 rounded">POSTHOG_API_KEY</code> and{" "}
        <code className="bg-muted px-1 rounded">POSTHOG_PROJECT_ID</code> edge function secrets to enable behavioural analytics.
      </p>
    </div>
  );
}

function LoadingRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-8 rounded-md bg-muted/40 animate-pulse" />
      ))}
    </div>
  );
}

function FreshnessLabel({ loadedAt }: { loadedAt: Date | null }) {
  if (!loadedAt) return null;
  return (
    <span className="text-xs text-muted-foreground flex items-center gap-1">
      <Clock className="h-3 w-3" />
      Updated {relTime(loadedAt.toISOString())}
    </span>
  );
}

function EventBadge({ event }: { event: string }) {
  const colorMap: Record<string, string> = {
    user_signed_up: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    checkout_success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    subscription_started: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    upgrade_click: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    start_checkout: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    checkout_cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    edge_board_paywall_hit: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    $pageview: "bg-muted text-muted-foreground",
  };
  const cls = colorMap[event] ?? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${cls}`}>
      {event}
    </span>
  );
}

// ─── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({
  subMetrics,
  phData,
  phAvailable,
  loading,
  error,
}: {
  subMetrics: SubMetrics | null;
  phData: { active_users?: PHActiveUsers; event_counts_30d?: PHEventCounts } | null;
  phAvailable: boolean;
  loading: boolean;
  error: string | null;
}) {
  const activeUsers = phData?.active_users;
  const counts30d = phData?.event_counts_30d ?? {};

  return (
    <div className="space-y-6">
      {error && <ErrorBanner message={error} />}

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Subscriptions</h3>
        {loading && !subMetrics ? (
          <LoadingRows count={1} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KPICard label="Active" value={subMetrics?.active_subscriptions ?? "—"} sub="paying subscribers" color="green" />
            <KPICard label="Cancelling" value={subMetrics?.cancelling_count ?? "—"} sub="active until period end" color="amber" />
            <KPICard label="Trialing" value={subMetrics?.trialing_count ?? "—"} sub="in trial period" color="blue" />
            <KPICard label="Manual Premium" value={subMetrics?.manual_premium_count ?? "—"} sub="granted by admin" />
            <KPICard label="Total Users" value={subMetrics?.total_profiles ?? "—"} sub={`+${subMetrics?.signups_7d ?? 0} this week`} />
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Signups</h3>
        <div className="grid grid-cols-3 gap-3">
          <KPICard label="24h" value={subMetrics?.signups_24h ?? "—"} />
          <KPICard label="7 days" value={subMetrics?.signups_7d ?? "—"} />
          <KPICard label="30 days" value={subMetrics?.signups_30d ?? "—"} />
        </div>
      </div>

      {phAvailable ? (
        <>
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Active Users (PostHog)</h3>
            <div className="grid grid-cols-3 gap-3">
              <KPICard label="DAU" value={activeUsers?.dau ?? "—"} sub="last 24h" color="blue" />
              <KPICard label="WAU" value={activeUsers?.wau ?? "—"} sub="last 7 days" color="blue" />
              <KPICard label="MAU" value={activeUsers?.mau ?? "—"} sub="last 30 days" color="blue" />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Checkout Funnel (30d)</h3>
            <div className="grid grid-cols-3 gap-3">
              <KPICard label="Upgrade Clicks" value={counts30d["upgrade_click"] ?? 0} sub="paywall interactions" />
              <KPICard
                label="Checkout Started"
                value={counts30d["start_checkout"] ?? 0}
                sub={pct(counts30d["start_checkout"] ?? 0, counts30d["upgrade_click"] ?? 0) + " of clicks"}
              />
              <KPICard
                label="Checkout Success"
                value={counts30d["checkout_success"] ?? 0}
                sub={pct(counts30d["checkout_success"] ?? 0, counts30d["start_checkout"] ?? 0) + " conversion"}
                color="green"
              />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Product Events (30d)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard label="Rankings Views" value={formatNum(counts30d["rankings_view"])} />
              <KPICard label="Edge Board Views" value={formatNum(counts30d["edge_board_view"])} />
              <KPICard label="Market Watch Views" value={formatNum(counts30d["market_watch_view"])} />
            </div>
          </div>
        </>
      ) : (
        <PHUnavailable />
      )}
    </div>
  );
}

// ─── Tab: Live Activity ────────────────────────────────────────────────────────

function LiveActivityTab({
  events,
  activeNow,
  phAvailable,
  loading,
  error,
  onRefresh,
}: {
  events: PHRecentEvent[];
  activeNow: PHActiveNow | null;
  phAvailable: boolean;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState("all");

  const EVENT_FILTERS = [
    "all",
    "upgrade_click",
    "rankings_view",
    "edge_board_view",
    "market_watch_view",
    "user_signed_up",
    "checkout_success",
  ];

  const filtered = filter === "all" ? events : events.filter((e) => e.event === filter);

  if (!phAvailable) return <PHUnavailable />;

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}

      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <div className="rounded-lg border border-border bg-card px-4 py-2 text-center">
            <div className="flex items-center gap-1.5 mb-0.5">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-muted-foreground">Active (5m)</span>
            </div>
            <p className="text-xl font-bold text-emerald-500">{activeNow?.active_5min ?? "—"}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-2 text-center">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Zap className="h-3 w-3 text-amber-500" />
              <span className="text-xs text-muted-foreground">Active (30m)</span>
            </div>
            <p className="text-xl font-bold">{activeNow?.active_30min ?? "—"}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {EVENT_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
              filter === f
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {f === "all" ? "All events" : f}
          </button>
        ))}
      </div>

      {loading && events.length === 0 ? (
        <LoadingRows count={8} />
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">No events match this filter.</div>
      ) : (
        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Event</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">User</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden lg:table-cell">Page</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 50).map((evt, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2">
                    <EventBadge event={evt.event} />
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground hidden md:table-cell">
                    {evt.distinct_id}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate hidden lg:table-cell">
                    {evt.current_url ? friendlyUrl(String(evt.current_url)) : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {relTime(evt.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Acquisition ──────────────────────────────────────────────────────────

function AcquisitionTab({
  acquisition,
  phAvailable,
  loading,
  error,
}: {
  acquisition: { referrers: PHReferrer[]; utms: PHUTM[] } | null;
  phAvailable: boolean;
  loading: boolean;
  error: string | null;
}) {
  if (!phAvailable) return <PHUnavailable />;

  const referrers = acquisition?.referrers ?? [];
  const utms = acquisition?.utms ?? [];
  const totalSessions = referrers.reduce((a, r) => a + r.sessions, 0);

  return (
    <div className="space-y-6">
      {error && <ErrorBanner message={error} />}

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Traffic Sources (30d)</h3>
        {loading && referrers.length === 0 ? (
          <LoadingRows count={6} />
        ) : referrers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No referrer data available.</p>
        ) : (
          <div className="rounded-md border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Source</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Sessions</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Share</th>
                </tr>
              </thead>
              <tbody>
                {referrers.map((r, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium text-sm">
                      {!r.referrer || r.referrer === "direct" ? (
                        <span className="text-muted-foreground italic">Direct / None</span>
                      ) : (
                        r.referrer
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.sessions}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {pct(r.sessions, totalSessions)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {utms.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">UTM Campaigns (30d)</h3>
          <div className="rounded-md border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Source</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Medium</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Campaign</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {utms.map((u, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5">{u.source ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{u.medium ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{u.campaign ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{u.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Engagement ──────────────────────────────────────────────────────────

function EngagementTab({
  topPages,
  featureUsage,
  sessionMetrics,
  eventCounts30d,
  phAvailable,
  loading,
  error,
}: {
  topPages: PHTopPage[];
  featureUsage: PHFeature[];
  sessionMetrics: PHActiveUsers | null;
  eventCounts30d: PHEventCounts;
  phAvailable: boolean;
  loading: boolean;
  error: string | null;
}) {
  if (!phAvailable) return <PHUnavailable />;

  return (
    <div className="space-y-6">
      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-3 gap-3">
        <KPICard label="DAU" value={sessionMetrics?.dau ?? "—"} sub="last 24h" color="blue" />
        <KPICard label="WAU" value={sessionMetrics?.wau ?? "—"} sub="last 7 days" color="blue" />
        <KPICard label="MAU" value={sessionMetrics?.mau ?? "—"} sub="last 30 days" color="blue" />
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Feature Usage (30d)</h3>
        {loading && featureUsage.length === 0 ? (
          <LoadingRows count={6} />
        ) : featureUsage.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No feature event data yet.</p>
        ) : (
          <div className="space-y-2">
            {featureUsage.map((f, i) => {
              const maxUses = featureUsage[0]?.uses ?? 1;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs w-52 truncate text-foreground">{f.feature}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(f.uses / maxUses) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground w-12 text-right">
                    {formatNum(f.uses)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Top Pages (30d)</h3>
        {loading && topPages.length === 0 ? (
          <LoadingRows count={6} />
        ) : topPages.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No page view data yet.</p>
        ) : (
          <div className="rounded-md border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Page</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Views</th>
                </tr>
              </thead>
              <tbody>
                {topPages.slice(0, 20).map((p, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2 text-xs font-mono truncate max-w-[400px]">
                      {friendlyUrl(p.page)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-xs">{p.views}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Player Interest Signals (30d)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard label="Player Modal Opens" value={formatNum(eventCounts30d["player_modal_open"])} />
          <KPICard label="Rankings Refreshes" value={formatNum(eventCounts30d["rankings_refresh_click"])} />
          <KPICard label="Trade Comparisons" value={formatNum(eventCounts30d["market_watch_compare_run"])} />
          <KPICard label="Breakout Clicks" value={formatNum(eventCounts30d["market_breakout_click"])} />
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Page Performance — Key Routes (30d)</h3>
        {loading && topPages.length === 0 ? (
          <LoadingRows count={5} />
        ) : (
          <div className="rounded-md border border-border overflow-hidden bg-card">
            {(() => {
              const KEY_ROUTES = [
                { match: /\/afl\/rankings/, label: "Rankings" },
                { match: /\/afl\/market-watch/, label: "Market Watch" },
                { match: /\/afl\/players\//, label: "Player Pages" },
                { match: /\/afl\/edge-board/, label: "Edge Board" },
                { match: /\/(pricing|subscribe|neeko-plus)/, label: "Pricing" },
              ];
              const buckets = KEY_ROUTES.map(({ match, label }) => ({
                label,
                views: topPages.filter((p) => match.test(p.page)).reduce((s, p) => s + p.views, 0),
              })).filter((b) => b.views > 0);
              const maxViews = Math.max(...buckets.map((b) => b.views), 1);
              if (buckets.length === 0) return (
                <p className="text-sm text-muted-foreground py-4 text-center px-4">No route data yet.</p>
              );
              return buckets.sort((a, b) => b.views - a.views).map((b, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0">
                  <span className="text-xs font-medium w-32 shrink-0">{b.label}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500 rounded-full" style={{ width: `${(b.views / maxViews) * 100}%` }} />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground w-16 text-right">{formatNum(b.views)} views</span>
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Conversion ──────────────────────────────────────────────────────────

function FunnelStep({
  label,
  count,
  fromCount,
  color,
}: {
  label: string;
  count: number;
  fromCount?: number;
  color?: string;
}) {
  const dropPct = fromCount ? (1 - count / fromCount) * 100 : 0;
  return (
    <div className="flex items-center justify-between border-b border-border/50 last:border-0 py-2.5 px-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {fromCount !== undefined && fromCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {pct(count, fromCount)} through · {dropPct.toFixed(1)}% drop-off
          </p>
        )}
      </div>
      <span className={`text-lg font-bold tabular-nums ${color ?? ""}`}>{formatNum(count)}</span>
    </div>
  );
}

function ConversionTab({
  funnel,
  phAvailable,
  loading,
  error,
}: {
  funnel: PHFunnel | null;
  phAvailable: boolean;
  loading: boolean;
  error: string | null;
}) {
  if (!phAvailable) return <PHUnavailable />;

  const f = funnel;

  // Detect impossible funnel data — raw event counts can produce checkout_success > checkout_started
  // when events are not session-scoped (e.g. webhook fires multiple times, returning users, etc.)
  const funnelDataSuspect =
    f !== null &&
    f.checkout_started > 0 &&
    f.checkout_success > f.checkout_started;

  // Only compute conversion rates when the funnel looks structurally valid
  const overallCvr   = f?.page_views && !funnelDataSuspect ? pct(f.checkout_success ?? 0, f.page_views) : "—";
  const paywallCvr   = f?.upgrade_clicks && !funnelDataSuspect ? pct(f.checkout_success ?? 0, f.upgrade_clicks) : "—";
  const checkoutCvr  = f?.checkout_started && !funnelDataSuspect ? pct(f.checkout_success ?? 0, f.checkout_started) : "—";
  const abandonRate  = f?.checkout_started ? pct(f.checkout_cancelled ?? 0, f.checkout_started) : "—";

  return (
    <div className="space-y-6">
      {error && <ErrorBanner message={error} />}

      {/* Always-visible disclaimer: these are raw PostHog event totals, not a deduplicated funnel */}
      <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
        <p className="text-xs text-sky-400">
          <span className="font-semibold">Raw events only — not a true conversion funnel.</span>{" "}
          Counts are cumulative PostHog event totals across all sessions and users in the period.
          Rates shown where the funnel is structurally valid (each step &le; the previous step).
          {funnelDataSuspect && (
            <span className="ml-1 text-amber-400 font-semibold">
              Funnel data is inconsistent (checkout_success &gt; checkout_started) — conversion rates hidden.
              This usually means events are fired from different contexts (e.g. Stripe webhooks, return visits).
            </span>
          )}
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Conversion Rates — Key Metrics (30d)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard label="Visitor → Paid" value={overallCvr} sub="page views to checkout success" color="green" />
          <KPICard label="Paywall → Paid" value={paywallCvr} sub="upgrade click to success" color="green" />
          <KPICard label="Checkout CVR" value={checkoutCvr} sub="started to success" color="green" />
          <KPICard label="Abandon Rate" value={abandonRate} sub="started to cancelled" color="amber" />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Raw Event Counts — Main Funnel (30d)</h3>
          {loading && !f ? (
            <LoadingRows count={5} />
          ) : (
            <div className="rounded-md border border-border overflow-hidden bg-card">
              <FunnelStep label="Page Views" count={f?.page_views ?? 0} />
              <FunnelStep label="Pricing Page Views" count={f?.pricing_views ?? 0} fromCount={!funnelDataSuspect ? f?.page_views : undefined} />
              <FunnelStep label="Plan Selected" count={f?.plan_selected ?? 0} fromCount={!funnelDataSuspect ? f?.pricing_views : undefined} />
              <FunnelStep label="Checkout Started" count={f?.checkout_started ?? 0} fromCount={!funnelDataSuspect ? f?.plan_selected : undefined} />
              <FunnelStep label="Checkout Success" count={f?.checkout_success ?? 0} fromCount={!funnelDataSuspect ? f?.checkout_started : undefined} color="text-emerald-500" />
            </div>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Raw Event Counts — Upgrade Funnel (30d)</h3>
          {loading && !f ? (
            <LoadingRows count={4} />
          ) : (
            <div className="rounded-md border border-border overflow-hidden bg-card">
              <FunnelStep label="Upgrade Click (Paywall)" count={f?.upgrade_clicks ?? 0} />
              <FunnelStep label="Checkout Started" count={f?.checkout_started ?? 0} fromCount={!funnelDataSuspect ? f?.upgrade_clicks : undefined} />
              <FunnelStep label="Checkout Success" count={f?.checkout_success ?? 0} fromCount={!funnelDataSuspect ? f?.checkout_started : undefined} color="text-emerald-500" />
              <FunnelStep label="Checkout Cancelled" count={f?.checkout_cancelled ?? 0} fromCount={!funnelDataSuspect ? f?.checkout_started : undefined} color="text-red-500" />
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">CTA Performance — Click Signals (30d)</h3>
        <div className="rounded-md border border-border overflow-hidden bg-card">
          {[
            { label: "Upgrade Click (any paywall / CTA)", key: "upgrade_clicks", denominator: f?.page_views, color: "bg-emerald-500" },
            { label: "Plan Selected (pricing page)", key: "plan_selected", denominator: f?.pricing_views, color: "bg-sky-500" },
            { label: "Checkout Started", key: "checkout_started", denominator: f?.plan_selected, color: "bg-sky-500" },
            { label: "Checkout Success (paid)", key: "checkout_success", denominator: f?.checkout_started, color: "bg-emerald-500" },
            { label: "Checkout Cancelled / Abandoned", key: "checkout_cancelled", denominator: f?.checkout_started, color: "bg-red-500" },
            { label: "New Signups", key: "signups", denominator: f?.page_views, color: "bg-blue-500" },
          ].map(({ label, key, denominator, color }, i) => {
            const val = (f as unknown as Record<string, number>)?.[key] ?? 0;
            const rate = denominator ? pct(val, denominator) : null;
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0">
                <span className="text-xs font-medium w-56 shrink-0">{label}</span>
                <span className="text-sm tabular-nums font-semibold w-14 shrink-0">{formatNum(val)}</span>
                {rate !== null && (
                  <span className="text-xs text-muted-foreground w-16 shrink-0">{rate} CVR</span>
                )}
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${color} rounded-full`}
                    style={{ width: denominator && denominator > 0 ? `${Math.min((val / denominator) * 100 * 5, 100)}%` : "0%" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Summary (30d)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard label="Signups" value={f?.signups ?? "—"} color="green" />
          <KPICard label="Logins" value={f?.logins ?? "—"} />
          <KPICard label="Checkout Cancelled" value={f?.checkout_cancelled ?? "—"} sub="abandoned" color="red" />
          <KPICard
            label="Cancellation Rate"
            value={f?.checkout_started ? pct(f.checkout_cancelled ?? 0, f.checkout_started) : "—"}
            sub="of started checkouts"
            color="amber"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Subscribers & Revenue ───────────────────────────────────────────────

function SubscribersTab({
  subMetrics,
  loading,
  error,
}: {
  subMetrics: SubMetrics | null;
  loading: boolean;
  error: string | null;
}) {
  const active = subMetrics?.active_subscriptions ?? 0;
  const cancelling = subMetrics?.cancelling_count ?? 0;
  const trialing = subMetrics?.trialing_count ?? 0;
  const manual = subMetrics?.manual_premium_count ?? 0;
  const expired = subMetrics?.expired_count ?? 0;
  const mrrEstimate = (active * 7.99).toFixed(2);
  const arrEstimate = (active * 89).toLocaleString();

  return (
    <div className="space-y-6">
      {error && <ErrorBanner message={error} />}

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Billing States</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KPICard label="Active" value={active} sub="paying, not cancelling" color="green" />
          <KPICard label="Cancelling" value={cancelling} sub="active until period end" color="amber" />
          <KPICard label="Trialing" value={trialing} sub="in trial" color="blue" />
          <KPICard label="Manual" value={manual} sub="admin granted" />
          <KPICard label="Expired" value={expired} sub="no active access" color="red" />
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Revenue Estimate</h3>
        <div className="grid grid-cols-3 gap-3">
          <KPICard label="Weekly MRR (est.)" value={`$${mrrEstimate}`} sub="weekly subs × $5.99/wk × 4" color="green" />
          <KPICard label="ARR (est.)" value={`$${arrEstimate}`} sub="at $89/yr blended" color="green" />
          <KPICard label="Active Paying" value={active + trialing} sub="active + trialing" />
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Subscriber List</h3>
        <SubscriberTable />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminAnalytics() {
  const [activeTab, setActiveTab] = useState("overview");

  const [subMetrics, setSubMetrics] = useState<SubMetrics | null>(null);
  const [subError, setSubError] = useState<string | null>(null);
  const [subLoading, setSubLoading] = useState(false);

  const [phOverview, setPhOverview] = useState<Record<string, unknown> | null>(null);
  const [phActivity, setPhActivity] = useState<{ recent_events: PHRecentEvent[]; active_now: PHActiveNow } | null>(null);
  const [phAcquisition, setPhAcquisition] = useState<{ referrers: PHReferrer[]; utms: PHUTM[] } | null>(null);
  const [phEngagement, setPhEngagement] = useState<{
    top_pages: PHTopPage[];
    feature_usage: PHFeature[];
    session_metrics: PHActiveUsers;
  } | null>(null);
  const [phFunnel, setPhFunnel] = useState<PHFunnel | null>(null);
  const [phAvailable, setPhAvailable] = useState(false);
  const [phError, setPhError] = useState<string | null>(null);
  const [phLoading, setPhLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSubMetrics = useCallback(async () => {
    setSubLoading(true);
    setSubError(null);
    try {
      const data = await fetchAdminDashboardData("analytics_product");
      setSubMetrics((data.subscription_metrics as SubMetrics) ?? null);
      setLoadedAt(new Date());
    } catch (err: unknown) {
      setSubError(err instanceof Error ? err.message : "Failed to load subscription data");
    } finally {
      setSubLoading(false);
    }
  }, []);

  const loadPostHog = useCallback(async (section: string) => {
    setPhLoading(true);
    setPhError(null);
    try {
      const data = await fetchPostHogAnalytics(section);
      const available = data.posthog_available === true;
      setPhAvailable(available);

      if (!available) {
        setPhError((data.error as string) ?? "PostHog not available");
        return;
      }

      if (section === "overview") {
        setPhOverview(data);
      } else if (section === "activity") {
        setPhActivity({
          recent_events: (data.recent_events as PHRecentEvent[]) ?? [],
          active_now: (data.active_now as PHActiveNow) ?? { active_5min: 0, active_30min: 0 },
        });
      } else if (section === "acquisition") {
        const acq = data.acquisition as { referrers: PHReferrer[]; utms: PHUTM[] } | null;
        setPhAcquisition({ referrers: acq?.referrers ?? [], utms: acq?.utms ?? [] });
      } else if (section === "engagement") {
        setPhEngagement({
          top_pages: (data.top_pages as PHTopPage[]) ?? [],
          feature_usage: (data.feature_usage as PHFeature[]) ?? [],
          session_metrics: (data.session_metrics as PHActiveUsers) ?? { dau: 0, wau: 0, mau: 0 },
        });
      } else if (section === "conversion") {
        setPhFunnel((data.funnel as PHFunnel) ?? null);
      }

      setLoadedAt(new Date());
    } catch (err: unknown) {
      setPhError(err instanceof Error ? err.message : "Failed to load PostHog data");
    } finally {
      setPhLoading(false);
    }
  }, []);

  const loadCurrentTab = useCallback(() => {
    loadSubMetrics();
    if (activeTab === "overview") loadPostHog("overview");
    else if (activeTab === "activity") loadPostHog("activity");
    else if (activeTab === "acquisition") loadPostHog("acquisition");
    else if (activeTab === "engagement") loadPostHog("engagement");
    else if (activeTab === "conversion") loadPostHog("conversion");
  }, [activeTab, loadSubMetrics, loadPostHog]);

  useEffect(() => {
    loadCurrentTab();
  }, [loadCurrentTab]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (activeTab === "activity") {
      pollRef.current = setInterval(() => loadPostHog("activity"), 60000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeTab, loadPostHog]);

  const isLoading = subLoading || phLoading;
  const phErrorVisible = phError && phAvailable ? phError : null;

  const overviewCounts30d = (phOverview?.event_counts_30d ?? {}) as PHEventCounts;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Users}
        title="Users & Growth"
        description="Subscribers, acquisition, engagement, conversion, billing, and user activity."
        loading={isLoading}
        actions={
          <div className="flex items-center gap-2">
            <FreshnessLabel loadedAt={loadedAt} />
            {phAvailable && activeTab === "activity" && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-500">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </div>
            )}
            <Button variant="outline" size="sm" onClick={loadCurrentTab} disabled={isLoading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Live Activity
            {phAvailable && (
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            )}
          </TabsTrigger>
          <TabsTrigger value="acquisition" className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Acquisition
          </TabsTrigger>
          <TabsTrigger value="engagement" className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Engagement
          </TabsTrigger>
          <TabsTrigger value="conversion" className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" />
            Conversion
          </TabsTrigger>
          <TabsTrigger value="subscribers" className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Subscribers
            {(subMetrics?.active_subscriptions ?? 0) > 0 && (
              <Badge className="ml-1 text-[10px] h-4 px-1.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                {subMetrics?.active_subscriptions}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="marketing-analytics" className="flex items-center gap-1.5">
            <BarChart2 className="h-3.5 w-3.5" />
            Marketing Analytics
          </TabsTrigger>
          <TabsTrigger value="google-ads" className="flex items-center gap-1.5">
            <BarChart2 className="h-3.5 w-3.5" />
            Google Ads
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab
            subMetrics={subMetrics}
            phData={phOverview ? {
              active_users: phOverview.active_users as PHActiveUsers | undefined,
              event_counts_30d: overviewCounts30d,
            } : null}
            phAvailable={phAvailable}
            loading={isLoading}
            error={subError ?? phErrorVisible}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <LiveActivityTab
            events={phActivity?.recent_events ?? []}
            activeNow={phActivity?.active_now ?? null}
            phAvailable={phAvailable}
            loading={phLoading}
            error={phErrorVisible}
            onRefresh={() => loadPostHog("activity")}
          />
        </TabsContent>

        <TabsContent value="acquisition" className="mt-6">
          <AcquisitionTab
            acquisition={phAcquisition}
            phAvailable={phAvailable}
            loading={phLoading}
            error={phErrorVisible}
          />
        </TabsContent>

        <TabsContent value="engagement" className="mt-6">
          <EngagementTab
            topPages={phEngagement?.top_pages ?? []}
            featureUsage={phEngagement?.feature_usage ?? []}
            sessionMetrics={phEngagement?.session_metrics ?? null}
            eventCounts30d={overviewCounts30d}
            phAvailable={phAvailable}
            loading={phLoading}
            error={phErrorVisible}
          />
        </TabsContent>

        <TabsContent value="conversion" className="mt-6">
          <ConversionTab
            funnel={phFunnel}
            phAvailable={phAvailable}
            loading={phLoading}
            error={phErrorVisible}
          />
        </TabsContent>

        <TabsContent value="subscribers" className="mt-6">
          <SubscribersTab
            subMetrics={subMetrics}
            loading={subLoading}
            error={subError}
          />
        </TabsContent>

        <TabsContent value="marketing-analytics" className="mt-6">
          <Suspense fallback={<div className="flex justify-center py-16"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground/50" /></div>}>
            <AdminMarketingInsights />
          </Suspense>
        </TabsContent>

        <TabsContent value="google-ads" className="mt-6">
          <Suspense fallback={<div className="flex justify-center py-16"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground/50" /></div>}>
            <AdminGoogleAds />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
