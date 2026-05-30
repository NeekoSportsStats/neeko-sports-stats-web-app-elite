import { useState, useCallback } from "react";
import { RefreshCw, Copy, ClipboardCheck, Clock, CircleAlert as AlertCircle, ChartBar as BarChart2 } from "lucide-react";
import { fetchGoogleAdsInsights, type AdsInsightsRange } from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountSummary {
  impressions: number;
  clicks: number;
  cost: number;
  ctr: string;
  avg_cpc: number;
  conversions: number;
  conv_value: number;
  cpa: number | null;
  conv_rate: string;
  currency: string;
}

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  impressions: number;
  clicks: number;
  cost: number;
  ctr: string;
  avg_cpc: number;
  conversions: number;
  cpa: number | null;
}

interface AdGroupRow {
  id: string;
  name: string;
  campaign: string;
  impressions: number;
  clicks: number;
  cost: number;
  ctr: string;
  avg_cpc: number;
  conversions: number;
}

interface KeywordRow {
  text: string;
  match_type: string;
  campaign: string;
  ad_group: string;
  impressions: number;
  clicks: number;
  cost: number;
  ctr: string;
  avg_cpc: number;
  conversions: number;
}

interface SearchTermRow {
  term: string;
  campaign: string;
  ad_group: string;
  impressions: number;
  clicks: number;
  cost: number;
  ctr: string;
  conversions: number;
  suggested_action: string;
  negative_reason: string;
}

interface DeviceRow {
  device: string;
  impressions: number;
  clicks: number;
  cost: number;
  ctr: string;
  avg_cpc: number;
  conversions: number;
}

interface ScheduleRow {
  date: string;
  day: string;
  impressions: number;
  clicks: number;
  cost: number;
  ctr: string;
  avg_cpc: number;
  conversions: number;
}

interface AdsData {
  configured: boolean;
  missing_secrets?: string[];
  range?: AdsInsightsRange;
  start_date?: string;
  end_date?: string;
  generated_at?: string;
  summary?: AccountSummary | { error: string };
  campaigns?: CampaignRow[];
  ad_groups?: AdGroupRow[];
  keywords?: KeywordRow[];
  search_terms?: SearchTermRow[];
  devices?: DeviceRow[];
  schedule?: ScheduleRow[];
}

type FreshnessStatus = "fresh" | "stale" | "unknown";

// ─── Constants ────────────────────────────────────────────────────────────────

const DATE_RANGES: { label: string; value: AdsInsightsRange; description: string }[] = [
  { label: "12h", value: "12h", description: "Last 12 hours" },
  { label: "24h", value: "24h", description: "Last 24 hours" },
  { label: "3d",  value: "3d",  description: "Last 3 days" },
  { label: "7d",  value: "7d",  description: "Last 7 days" },
  { label: "14d", value: "14d", description: "Last 14 days" },
  { label: "1mo", value: "30d", description: "Last 30 days" },
];

function maxAgeMs(range: AdsInsightsRange): number {
  if (range === "12h" || range === "24h") return 5 * 60 * 1000;
  return 10 * 60 * 1000;
}

function rangeLabelLong(range: AdsInsightsRange): string {
  return DATE_RANGES.find(r => r.value === range)?.description ?? range;
}

// ─── Clipboard ────────────────────────────────────────────────────────────────

async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; }
}

// ─── Copy pack builders ───────────────────────────────────────────────────────

function fmt(n: number | null | undefined, prefix = ""): string {
  if (n === null || n === undefined) return "Not available";
  return `${prefix}${n.toLocaleString()}`;
}

function fmtCost(n: number | null | undefined, currency = "AUD"): string {
  if (n === null || n === undefined) return "Not available";
  return `${currency} $${n.toFixed(2)}`;
}

function tableRow(cells: (string | number | null | undefined)[]): string {
  return "| " + cells.map(c => c === null || c === undefined ? "Not available" : String(c)).join(" | ") + " |";
}
function tableSep(count: number): string {
  return "| " + Array(count).fill("---").join(" | ") + " |";
}

function buildCampaignSection(data: AdsData): string {
  const campaigns = data.campaigns ?? [];
  const currency = (data.summary as AccountSummary)?.currency ?? "AUD";
  if (!campaigns.length) return "No campaign data available.";
  const header = tableRow(["Campaign", "Status", "Impr.", "Clicks", `Cost (${currency})`, "CPC", "CTR", "Conv.", "CPA"]);
  const sep = tableSep(9);
  const rows = campaigns.map(c =>
    tableRow([c.name, c.status, c.impressions, c.clicks, `$${c.cost.toFixed(2)}`, `$${c.avg_cpc.toFixed(2)}`, c.ctr, c.conversions, c.cpa !== null ? `$${c.cpa.toFixed(2)}` : "—"])
  );
  return [header, sep, ...rows].join("\n");
}

function buildKeywordSection(data: AdsData): string {
  const keywords = data.keywords ?? [];
  const currency = (data.summary as AccountSummary)?.currency ?? "AUD";
  if (!keywords.length) return "No keyword data available.";
  const header = tableRow(["Keyword", "Match", "Campaign", "Impr.", "Clicks", `Cost (${currency})`, "CPC", "CTR", "Conv."]);
  const sep = tableSep(9);
  const rows = keywords.map(k =>
    tableRow([k.text, k.match_type, k.campaign, k.impressions, k.clicks, `$${k.cost.toFixed(2)}`, `$${k.avg_cpc.toFixed(2)}`, k.ctr, k.conversions])
  );
  return [header, sep, ...rows].join("\n");
}

function buildSearchTermSection(data: AdsData): string {
  const terms = data.search_terms ?? [];
  const currency = (data.summary as AccountSummary)?.currency ?? "AUD";
  if (!terms.length) return "No search term data available.";
  const header = tableRow(["Search term", "Campaign", "Impr.", "Clicks", `Cost (${currency})`, "CTR", "Conv.", "Suggested action"]);
  const sep = tableSep(8);
  const rows = terms.map(t =>
    tableRow([t.term, t.campaign, t.impressions, t.clicks, `$${t.cost.toFixed(2)}`, t.ctr, t.conversions, t.suggested_action])
  );
  return [header, sep, ...rows].join("\n");
}

function buildDeviceSection(data: AdsData): string {
  const devices = data.devices ?? [];
  const currency = (data.summary as AccountSummary)?.currency ?? "AUD";
  if (!devices.length) return "No device data available.";
  const header = tableRow(["Device", "Impr.", "Clicks", `Cost (${currency})`, "CPC", "CTR", "Conv."]);
  const sep = tableSep(7);
  const rows = devices.map(d =>
    tableRow([d.device, d.impressions, d.clicks, `$${d.cost.toFixed(2)}`, `$${d.avg_cpc.toFixed(2)}`, d.ctr, d.conversions])
  );
  return [header, sep, ...rows].join("\n");
}

function buildScheduleSection(data: AdsData): string {
  const schedule = data.schedule ?? [];
  const currency = (data.summary as AccountSummary)?.currency ?? "AUD";
  if (!schedule.length) return "No schedule data available.";
  const header = tableRow(["Date", "Day", "Impr.", "Clicks", `Cost (${currency})`, "CPC", "CTR", "Conv."]);
  const sep = tableSep(8);
  const rows = schedule.map(s =>
    tableRow([s.date, s.day, s.impressions, s.clicks, `$${s.cost.toFixed(2)}`, `$${s.avg_cpc.toFixed(2)}`, s.ctr, s.conversions])
  );
  return [header, sep, ...rows].join("\n");
}

function buildWastedSpendSection(data: AdsData): string {
  const campaigns = data.campaigns ?? [];
  const keywords = data.keywords ?? [];
  const terms = data.search_terms ?? [];
  const currency = (data.summary as AccountSummary)?.currency ?? "AUD";
  const lines: string[] = [];

  const wastedCampaigns = campaigns.filter(c => c.cost > 1 && c.conversions === 0);
  if (wastedCampaigns.length) {
    lines.push("### Campaigns with spend but no conversions");
    wastedCampaigns.forEach(c => lines.push(`- ${c.name}: ${currency} $${c.cost.toFixed(2)} spent, 0 conversions`));
  }

  const wastedKeywords = keywords.filter(k => k.cost > 0.5 && k.conversions === 0);
  if (wastedKeywords.length) {
    lines.push("\n### Keywords with spend but no conversions");
    wastedKeywords.slice(0, 20).forEach(k => lines.push(`- "${k.text}" (${k.match_type}): ${currency} $${k.cost.toFixed(2)}, 0 conversions`));
  }

  const negCandidates = terms.filter(t => t.suggested_action === "add negative");
  if (negCandidates.length) {
    lines.push("\n### Negative keyword candidates");
    negCandidates.forEach(t => lines.push(`- "${t.term}": ${t.negative_reason} — suggest negative [${t.impressions} impr, ${t.clicks} clicks]`));
  }

  const reviewTerms = terms.filter(t => t.suggested_action === "review");
  if (reviewTerms.length) {
    lines.push("\n### Search terms to review");
    reviewTerms.slice(0, 15).forEach(t => lines.push(`- "${t.term}": ${t.negative_reason}`));
  }

  return lines.length ? lines.join("\n") : "No wasted spend patterns detected.";
}

function buildAnalysisPack(data: AdsData, range: AdsInsightsRange, fetchedAt: Date): string {
  const s = data.summary as AccountSummary | undefined;
  const currency = s?.currency ?? "AUD";
  const rangeLabel = rangeLabelLong(range);
  const fetchedStr = fetchedAt.toLocaleString("en-AU", { timeZoneName: "short" });
  const now = new Date().toLocaleString("en-AU", { timeZoneName: "short" });
  const ageMs = Date.now() - fetchedAt.getTime();
  const ageMins = Math.round(ageMs / 60000);
  const freshnessLabel = ageMs < maxAgeMs(range) ? "Fresh" : "Stale — refresh recommended";

  const sections: string[] = [];

  sections.push(`# Neeko Sports Stats — Google Ads Analysis Pack

Date range: ${rangeLabel}
Period: ${data.start_date ?? "—"} to ${data.end_date ?? "—"}
Generated at: ${now}
Last refreshed: ${fetchedStr} (${ageMins}m ago)
Freshness: ${freshnessLabel}
Currency: ${currency}`);

  sections.push(`## 1. Account Summary

Impressions: ${fmt(s?.impressions)}
Clicks: ${fmt(s?.clicks)}
Cost: ${fmtCost(s?.cost, currency)}
Average CPC: ${fmtCost(s?.avg_cpc, currency)}
CTR: ${s?.ctr ?? "Not available"}
Conversions: ${fmt(s?.conversions)}
Conversion rate: ${s?.conv_rate ?? "Not available"}
Cost per conversion: ${s?.cpa !== null && s?.cpa !== undefined ? fmtCost(s.cpa, currency) : "Not available"}
Conversion value: ${fmtCost(s?.conv_value, currency)}`);

  sections.push(`## 2. Campaign Performance

${buildCampaignSection(data)}`);

  sections.push(`## 3. Keyword Performance

${buildKeywordSection(data)}`);

  sections.push(`## 4. Search Term Performance

${buildSearchTermSection(data)}`);

  sections.push(`## 5. Device Performance

${buildDeviceSection(data)}`);

  sections.push(`## 6. Schedule Performance (by day)

${buildScheduleSection(data)}`);

  sections.push(`## 7. Wasted Spend / Review Items

${buildWastedSpendSection(data)}`);

  sections.push(`## 8. Questions for ChatGPT

Please analyse the Google Ads data above and answer:

1. Are my Google Ads working? What is the overall verdict?
2. Is my CPC reasonable for an AFL fantasy stats SaaS product?
3. Which campaigns or keywords are wasting money?
4. Which search terms should I add as negatives?
5. Which keywords should I keep and potentially increase budget on?
6. Should I adjust scheduling based on the day-of-week data?
7. Should I change match types (exact/phrase/broad) on any keywords?
8. Should I increase, maintain, or reduce overall spend?
9. What is the single most important fix I should make this week?
10. List the top 5 concrete actions for this week in priority order.`);

  return sections.join("\n\n");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({
  getText,
  label = "Copy",
  size = "sm",
}: {
  getText: () => string;
  label?: string;
  size?: "sm" | "xs";
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const text = getText();
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  const sizeClass = size === "xs" ? "px-2 py-1 text-[11px] gap-1" : "px-3 py-1.5 text-xs gap-1.5";
  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center rounded border font-medium transition-colors ${sizeClass} ${
        copied
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      {copied ? <ClipboardCheck className="h-3 w-3 shrink-0" /> : <Copy className="h-3 w-3 shrink-0" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

function StatCard({ label, value, sub, color = "default" }: { label: string; value: string | number; sub?: string; color?: "default" | "green" | "amber" | "red" | "blue" }) {
  const colorMap = { default: "text-foreground", green: "text-emerald-500", amber: "text-amber-500", red: "text-red-500", blue: "text-blue-500" };
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-1">
      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold ${colorMap[color]}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function FreshnessIndicator({ lastFetchedAt, range, dataRange, status }: { lastFetchedAt: Date | null; range: AdsInsightsRange; dataRange: AdsInsightsRange | null; status: FreshnessStatus }) {
  if (!lastFetchedAt) return null;
  const ageMs = Date.now() - lastFetchedAt.getTime();
  const ageMins = Math.round(ageMs / 60000);
  const ageStr = ageMins < 1 ? "just now" : `${ageMins}m ago`;
  const mismatch = dataRange && dataRange !== range;
  return (
    <div className={`flex items-center gap-1.5 text-[11px] ${status === "stale" || mismatch ? "text-amber-400" : "text-muted-foreground"}`}>
      <Clock className="h-3 w-3" />
      <span>Refreshed {ageStr}</span>
      {status === "stale" && <span className="text-amber-400 font-medium">· Data stale</span>}
      {mismatch && <span className="text-amber-400 font-medium">· Range mismatch — refresh</span>}
    </div>
  );
}

function SetupPanel({ missing }: { missing: string[] }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-950/10 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
        <p className="text-sm font-semibold text-amber-300">Google Ads API not configured</p>
      </div>
      <p className="text-xs text-muted-foreground">
        To enable Google Ads performance data, add the following secrets to your Supabase Edge Function environment.
        These are server-side only — never exposed in the frontend bundle.
      </p>
      <div className="space-y-1">
        {[
          "GOOGLE_ADS_DEVELOPER_TOKEN",
          "GOOGLE_ADS_CLIENT_ID",
          "GOOGLE_ADS_CLIENT_SECRET",
          "GOOGLE_ADS_REFRESH_TOKEN",
          "GOOGLE_ADS_CUSTOMER_ID",
          "GOOGLE_ADS_LOGIN_CUSTOMER_ID (optional — for MCC/manager accounts)",
          "GOOGLE_ADS_API_VERSION (optional — defaults to v18)",
        ].map((v) => {
          const isMissing = missing.some(m => v.startsWith(m));
          return (
            <div key={v} className={`flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded ${isMissing ? "bg-red-950/20 text-red-300 border border-red-800/30" : "bg-muted/30 text-muted-foreground"}`}>
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isMissing ? "bg-red-500" : "bg-emerald-500"}`} />
              {v}
              {isMissing && <Badge className="ml-auto text-[10px] h-4 bg-red-900/40 text-red-300 border-red-700/30">Missing</Badge>}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Use an OAuth 2.0 refresh token obtained via the Google Ads API. The developer token requires a Google Ads manager account.
        Add these as Supabase secrets (not VITE_ env vars).
      </p>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, string> = {
    keep: "bg-emerald-900/30 text-emerald-300 border-emerald-700/30",
    review: "bg-amber-900/30 text-amber-300 border-amber-700/30",
    "add negative": "bg-red-900/30 text-red-300 border-red-700/30",
    "add as keyword": "bg-blue-900/30 text-blue-300 border-blue-700/30",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${map[action] ?? "bg-muted text-muted-foreground border-border"}`}>
      {action}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls = s === "enabled" ? "bg-emerald-900/30 text-emerald-300 border-emerald-700/30"
    : s === "paused" ? "bg-amber-900/30 text-amber-300 border-amber-700/30"
    : "bg-muted text-muted-foreground border-border";
  return <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${cls}`}>{status}</span>;
}

// ─── Auto-insights generator ──────────────────────────────────────────────────

function generateAutoInsights(data: AdsData): string[] {
  const insights: string[] = [];
  const s = data.summary as AccountSummary | undefined;
  const currency = s?.currency ?? "AUD";
  const campaigns = data.campaigns ?? [];
  const keywords = data.keywords ?? [];
  const terms = data.search_terms ?? [];
  const devices = data.devices ?? [];

  if (!s) return insights;

  if (s.clicks > 0 && s.cost > 0) {
    insights.push(`Account spent ${currency} $${s.cost.toFixed(2)} for ${s.clicks} clicks at avg CPC ${currency} $${s.avg_cpc.toFixed(2)}.`);
  }
  if (s.conversions === 0 && s.cost > 5) {
    insights.push(`No conversions recorded this period despite ${currency} $${s.cost.toFixed(2)} spend — check conversion tracking.`);
  }
  if (s.conversions > 0 && s.cpa !== null) {
    insights.push(`Cost per acquisition: ${currency} $${s.cpa.toFixed(2)}.`);
  }

  const wastedCampaigns = campaigns.filter(c => c.cost > 1 && c.conversions === 0);
  if (wastedCampaigns.length) {
    insights.push(`${wastedCampaigns.length} campaign(s) spent money with zero conversions: ${wastedCampaigns.map(c => c.name).join(", ")}.`);
  }

  const topKw = [...keywords].sort((a, b) => b.clicks - a.clicks)[0];
  if (topKw) {
    insights.push(`Top keyword by clicks: "${topKw.text}" (${topKw.clicks} clicks, ${topKw.ctr} CTR).`);
  }

  const highCostNoConvKw = keywords.filter(k => k.cost > 1 && k.conversions === 0);
  if (highCostNoConvKw.length) {
    insights.push(`${highCostNoConvKw.length} keyword(s) have spend but no conversions — consider pausing.`);
  }

  const negCandidates = terms.filter(t => t.suggested_action === "add negative");
  if (negCandidates.length) {
    insights.push(`${negCandidates.length} search term(s) flagged as negative keyword candidates (e.g. "${negCandidates[0].term}").`);
  }

  const mobileDevice = devices.find(d => d.device.toLowerCase().includes("mobile"));
  const desktopDevice = devices.find(d => d.device.toLowerCase().includes("desktop") || d.device.toLowerCase().includes("computer"));
  if (mobileDevice && desktopDevice && mobileDevice.avg_cpc < desktopDevice.avg_cpc) {
    insights.push(`Mobile CPC (${currency} $${mobileDevice.avg_cpc.toFixed(2)}) is lower than desktop (${currency} $${desktopDevice.avg_cpc.toFixed(2)}).`);
  }

  return insights;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminGoogleAds() {
  const [selectedRange, setSelectedRange] = useState<AdsInsightsRange>("7d");
  const [dataRange, setDataRange] = useState<AdsInsightsRange | null>(null);
  const [data, setData] = useState<AdsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  const freshnessStatus: FreshnessStatus = (() => {
    if (!lastFetchedAt || !dataRange) return "unknown";
    return Date.now() - lastFetchedAt.getTime() < maxAgeMs(dataRange) ? "fresh" : "stale";
  })();

  const isDataReady = !!data && data.configured && dataRange === selectedRange && freshnessStatus === "fresh";

  const staleCopyWarning = (() => {
    if (!data || !data.configured) return null;
    if (!lastFetchedAt) return "No data loaded. Click Refresh.";
    if (freshnessStatus === "stale") return "Data stale — refresh before copying.";
    if (dataRange !== selectedRange) return `Data is for ${rangeLabelLong(dataRange!)} but ${rangeLabelLong(selectedRange)} is selected — refresh.`;
    return null;
  })();

  const load = useCallback(async (range: AdsInsightsRange) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchGoogleAdsInsights(range);
      setData(result as AdsData);
      setDataRange(range);
      setLastFetchedAt(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load Google Ads data");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRangeChange = (range: AdsInsightsRange) => {
    setSelectedRange(range);
  };

  const handleRefresh = () => load(selectedRange);

  const getFullPack = () => {
    if (!data || !data.configured || !lastFetchedAt || !dataRange) return "No data loaded. Click Refresh first.";
    if (freshnessStatus === "stale") return "Data is stale. Please refresh before copying.";
    if (dataRange !== selectedRange) return `Data loaded for ${rangeLabelLong(dataRange)}, not ${rangeLabelLong(selectedRange)}. Please refresh.`;
    return buildAnalysisPack(data, dataRange, lastFetchedAt);
  };

  const summary = data?.configured ? (data.summary as AccountSummary | undefined) : undefined;
  const hasSummaryError = data?.configured && data.summary && "error" in (data.summary as Record<string, unknown>);
  const currency = summary?.currency ?? "AUD";
  const autoInsights = data?.configured && !hasSummaryError ? generateAutoInsights(data) : [];

  return (
    <div className="space-y-6">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Date range selector */}
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
          {DATE_RANGES.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => handleRangeChange(value)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                selectedRange === value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Loading…" : "Refresh"}
        </Button>

        {lastFetchedAt && (
          <FreshnessIndicator
            lastFetchedAt={lastFetchedAt}
            range={selectedRange}
            dataRange={dataRange}
            status={freshnessStatus}
          />
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-800/40 bg-red-950/20 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Not yet loaded */}
      {!data && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <BarChart2 className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Select a date range and click Refresh to load Google Ads data.</p>
          <Button variant="outline" size="sm" onClick={handleRefresh}>Load Google Ads data</Button>
        </div>
      )}

      {/* Setup required */}
      {data && !data.configured && (
        <SetupPanel missing={data.missing_secrets ?? []} />
      )}

      {/* Main content */}
      {data?.configured && (
        <div className="space-y-6">

          {/* Copy bar */}
          <div className="rounded-lg border border-border bg-card p-3 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs font-semibold text-foreground">Copy to ChatGPT</p>
              {staleCopyWarning && (
                <div className="flex items-center gap-1.5 text-xs text-amber-400">
                  <AlertCircle className="h-3 w-3" />
                  {staleCopyWarning}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton getText={getFullPack} label="Copy Full Analysis Pack" />
              <CopyButton getText={() => isDataReady ? buildCampaignSection(data) : "Refresh first."} label="Campaign Summary" size="xs" />
              <CopyButton getText={() => isDataReady ? buildKeywordSection(data) : "Refresh first."} label="Keywords" size="xs" />
              <CopyButton getText={() => isDataReady ? buildSearchTermSection(data) : "Refresh first."} label="Search Terms" size="xs" />
              <CopyButton getText={() => isDataReady ? buildDeviceSection(data) : "Refresh first."} label="Devices" size="xs" />
              <CopyButton getText={() => isDataReady ? buildScheduleSection(data) : "Refresh first."} label="Schedule" size="xs" />
              <CopyButton getText={() => isDataReady ? buildWastedSpendSection(data) : "Refresh first."} label="Wasted Spend" size="xs" />
            </div>
          </div>

          {/* Account summary cards */}
          {hasSummaryError ? (
            <div className="flex items-center gap-2 rounded-md border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Account summary error: {(data.summary as { error: string }).error}
            </div>
          ) : summary ? (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Account Summary — {rangeLabelLong(dataRange ?? selectedRange)} ({data.start_date} to {data.end_date})</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                <StatCard label="Impressions" value={summary.impressions.toLocaleString()} sub="total" />
                <StatCard label="Clicks" value={summary.clicks.toLocaleString()} color="blue" />
                <StatCard label={`Cost (${currency})`} value={`$${summary.cost.toFixed(2)}`} color="amber" />
                <StatCard label="Avg CPC" value={`$${summary.avg_cpc.toFixed(2)}`} />
                <StatCard label="CTR" value={summary.ctr} />
                <StatCard label="Conversions" value={summary.conversions.toLocaleString()} color="green" />
                <StatCard label="CPA" value={summary.cpa !== null ? `$${summary.cpa?.toFixed(2)}` : "—"} sub={summary.cpa !== null ? "per conversion" : "no conversions"} />
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">No summary data — try refreshing.</div>
          )}

          {/* Auto insights */}
          {autoInsights.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Auto Insights</p>
                <CopyButton
                  getText={() => isDataReady ? autoInsights.map(i => `- ${i}`).join("\n") : "Refresh first."}
                  label="Copy insights"
                  size="xs"
                />
              </div>
              <ul className="space-y-1">
                {autoInsights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500 mt-1.5 shrink-0" />
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Campaigns table */}
          {(data.campaigns?.length ?? 0) > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Campaigns</h3>
                <CopyButton getText={() => isDataReady ? buildCampaignSection(data) : "Refresh first."} label="Copy" size="xs" />
              </div>
              <div className="rounded-md border border-border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Campaign</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Status</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">Impr.</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">Clicks</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">Cost</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">CPC</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">CTR</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">Conv.</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">CPA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.campaigns!.map((c, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium max-w-[200px] truncate">{c.name}</td>
                        <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.impressions.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.clicks.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums">${c.cost.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">${c.avg_cpc.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.ctr}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.conversions}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.cpa !== null ? `$${c.cpa?.toFixed(2)}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Keywords table */}
          {(data.keywords?.length ?? 0) > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Keywords (top 50 by cost)</h3>
                <CopyButton getText={() => isDataReady ? buildKeywordSection(data) : "Refresh first."} label="Copy" size="xs" />
              </div>
              <div className="rounded-md border border-border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Keyword</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Match</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium hidden md:table-cell">Campaign</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">Impr.</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">Clicks</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">Cost</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">CPC</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">CTR</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">Conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.keywords!.map((k, i) => (
                      <tr key={i} className={`border-b border-border/50 last:border-0 hover:bg-muted/20 ${k.cost > 0.5 && k.conversions === 0 ? "bg-amber-950/10" : ""}`}>
                        <td className="px-3 py-2 font-mono">{k.text}</td>
                        <td className="px-3 py-2 text-muted-foreground">{k.match_type}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden md:table-cell max-w-[160px] truncate">{k.campaign}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{k.impressions.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{k.clicks}</td>
                        <td className="px-3 py-2 text-right tabular-nums">${k.cost.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">${k.avg_cpc.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{k.ctr}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{k.conversions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Search terms table */}
          {(data.search_terms?.length ?? 0) > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Search Terms</h3>
                <CopyButton getText={() => isDataReady ? buildSearchTermSection(data) : "Refresh first."} label="Copy" size="xs" />
              </div>
              <div className="rounded-md border border-border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Search term</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium hidden md:table-cell">Campaign</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">Impr.</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">Clicks</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">Cost</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">CTR</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium">Conv.</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.search_terms!.map((t, i) => (
                      <tr key={i} className={`border-b border-border/50 last:border-0 hover:bg-muted/20 ${t.suggested_action === "add negative" ? "bg-red-950/10" : t.suggested_action === "review" ? "bg-amber-950/10" : ""}`}>
                        <td className="px-3 py-2 font-mono max-w-[200px] truncate">{t.term}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden md:table-cell max-w-[140px] truncate">{t.campaign}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{t.impressions.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{t.clicks}</td>
                        <td className="px-3 py-2 text-right tabular-nums">${t.cost.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{t.ctr}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{t.conversions}</td>
                        <td className="px-3 py-2"><ActionBadge action={t.suggested_action} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Devices + Schedule side by side */}
          <div className="grid md:grid-cols-2 gap-6">
            {(data.devices?.length ?? 0) > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Device Performance</h3>
                  <CopyButton getText={() => isDataReady ? buildDeviceSection(data) : "Refresh first."} label="Copy" size="xs" />
                </div>
                <div className="rounded-md border border-border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">Device</th>
                        <th className="text-right px-3 py-2 text-muted-foreground font-medium">Clicks</th>
                        <th className="text-right px-3 py-2 text-muted-foreground font-medium">Cost</th>
                        <th className="text-right px-3 py-2 text-muted-foreground font-medium">CTR</th>
                        <th className="text-right px-3 py-2 text-muted-foreground font-medium">Conv.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.devices!.map((d, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium">{d.device}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{d.clicks}</td>
                          <td className="px-3 py-2 text-right tabular-nums">${d.cost.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{d.ctr}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{d.conversions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(data.schedule?.length ?? 0) > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Schedule Performance</h3>
                  <CopyButton getText={() => isDataReady ? buildScheduleSection(data) : "Refresh first."} label="Copy" size="xs" />
                </div>
                <div className="rounded-md border border-border overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0">
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">Date</th>
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">Day</th>
                        <th className="text-right px-3 py-2 text-muted-foreground font-medium">Clicks</th>
                        <th className="text-right px-3 py-2 text-muted-foreground font-medium">Cost</th>
                        <th className="text-right px-3 py-2 text-muted-foreground font-medium">Conv.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.schedule!.map((s, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                          <td className="px-3 py-2 font-mono">{s.date}</td>
                          <td className="px-3 py-2 text-muted-foreground">{s.day}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{s.clicks}</td>
                          <td className="px-3 py-2 text-right tabular-nums">${s.cost.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{s.conversions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Wasted spend summary */}
          {data.configured && (data.campaigns?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Wasted Spend / Negative Candidates</p>
                <CopyButton getText={() => isDataReady ? buildWastedSpendSection(data) : "Refresh first."} label="Copy" size="xs" />
              </div>
              <div className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                {buildWastedSpendSection(data)}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
