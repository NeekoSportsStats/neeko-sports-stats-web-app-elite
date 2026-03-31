import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, ShieldAlert, CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, Circle as XCircle, Users, TrendingUp, Database, Clock, Activity } from "lucide-react";

interface IntegrityRow {
  check_name: string;
  status: string;
  value: number | null;
  threshold: number | null;
  detail: string | null;
}

interface CanonicalHealth {
  total_players: number;
  players_with_price: number;
  players_with_projection: number;
  players_missing_price: number;
  players_missing_projection: number;
  latest_round: number;
  unique_teams: number;
  cache_refreshed_at: string | null;
}

interface MWDiagnostics {
  total_players: number;
  buy_count: number;
  sell_now_count: number;
  cash_cow_count: number;
  fade_count: number;
  positive_price_change: number;
  negative_price_change: number;
  avg_projection: number;
  avg_breakeven: number;
  snapshot_age_hours: number;
  status: string;
}

interface TopProjections {
  player_name: string;
  team: string;
  position: string;
  projection_final: number;
  price: number;
}

type Status = "ok" | "warn" | "error" | "loading";

function statusLevel(s: string | undefined | null): Status {
  if (s === "ok") return "ok";
  if (s === "warn") return "warn";
  if (s === "error") return "error";
  return "loading";
}

function StatusBadge({ status }: { status: Status }) {
  const cfg: Record<Status, { cls: string; label: string }> = {
    ok:      { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", label: "OK" },
    warn:    { cls: "bg-amber-500/15 text-amber-400 border-amber-500/25", label: "WARN" },
    error:   { cls: "bg-red-500/15 text-red-400 border-red-500/25", label: "ERROR" },
    loading: { cls: "bg-muted/50 text-muted-foreground border-border", label: "..." },
  };
  const { cls, label } = cfg[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === "ok" ? "bg-emerald-400" :
        status === "warn" ? "bg-amber-400 animate-pulse" :
        status === "error" ? "bg-red-400 animate-pulse" : "bg-muted-foreground"
      }`} />
      {label}
    </span>
  );
}

function IntegrityCard({
  icon: Icon, title, status, children, loading,
}: {
  icon: React.ElementType;
  title: string;
  status: Status;
  children: React.ReactNode;
  loading: boolean;
}) {
  const border: Record<Status, string> = {
    ok:      "border-emerald-200/20",
    warn:    "border-amber-200/20",
    error:   "border-red-300/30",
    loading: "border-border",
  };
  return (
    <Card className={`border ${border[status]}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title}
          </div>
          <StatusBadge status={status} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-4 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : children}
      </CardContent>
    </Card>
  );
}

function MetricRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: "green" | "red" | "amber" | "none" }) {
  const cls = highlight === "green" ? "text-emerald-400"
    : highlight === "red" ? "text-red-400"
    : highlight === "amber" ? "text-amber-400"
    : "text-foreground";
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}

export default function AdminDataIntegrity() {
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<IntegrityRow[]>([]);
  const [canonical, setCanonical] = useState<CanonicalHealth | null>(null);
  const [mwDiag, setMwDiag] = useState<MWDiagnostics | null>(null);
  const [topProjections, setTopProjections] = useState<TopProjections[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const hasLoaded = useRef(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [checksRes, canonicalRes, mwRes, topRes] = await Promise.allSettled([
        supabase.from("v_data_integrity_checks").select("*"),
        supabase.from("v_canonical_health").select("*").maybeSingle(),
        supabase.from("v_mw_diagnostics").select("*").maybeSingle(),
        supabase.from("v_top_projections").select("player_name,team,position,projection_final,price").limit(10),
      ]);
      if (checksRes.status === "fulfilled" && checksRes.value.data) setChecks(checksRes.value.data as IntegrityRow[]);
      if (canonicalRes.status === "fulfilled" && canonicalRes.value.data) setCanonical(canonicalRes.value.data as CanonicalHealth);
      if (mwRes.status === "fulfilled" && mwRes.value.data) setMwDiag(mwRes.value.data as MWDiagnostics);
      if (topRes.status === "fulfilled" && topRes.value.data) setTopProjections(topRes.value.data as TopProjections[]);
    } finally {
      setLoading(false);
      setLastRefreshed(new Date());
    }
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) {
      hasLoaded.current = true;
      fetchAll();
    }
  }, [fetchAll]);

  const priceCoverage = canonical
    ? Math.round(((canonical.total_players - canonical.players_missing_price) / canonical.total_players) * 100)
    : null;
  const projCoverage = canonical
    ? Math.round(((canonical.total_players - canonical.players_missing_projection) / canonical.total_players) * 100)
    : null;

  const positivePct = mwDiag && mwDiag.total_players > 0
    ? Math.round((mwDiag.positive_price_change / mwDiag.total_players) * 100)
    : null;

  const mwStatus: Status = !mwDiag ? "loading"
    : (positivePct ?? 0) < 5 ? "error"
    : (positivePct ?? 0) < 15 ? "warn"
    : "ok";

  const playerStatus: Status = !canonical ? "loading"
    : canonical.players_missing_price > 50 ? "error"
    : canonical.players_missing_price > 20 ? "warn"
    : "ok";

  const checksStatus: Status = checks.some(c => c.status === "error") ? "error"
    : checks.some(c => c.status === "warn") ? "warn"
    : checks.length > 0 ? "ok"
    : "loading";

  const snapshotStatus: Status = !mwDiag ? "loading"
    : (mwDiag.snapshot_age_hours ?? 0) > 48 ? "error"
    : (mwDiag.snapshot_age_hours ?? 0) > 24 ? "warn"
    : "ok";

  const errorChecks = checks.filter(c => c.status === "error");
  const warnChecks = checks.filter(c => c.status === "warn");
  const okChecks = checks.filter(c => c.status === "ok");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Data Integrity</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lastRefreshed
              ? `Checked ${lastRefreshed.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
              : "Validate all data sources are healthy and complete"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Critical alerts row */}
      {!loading && (errorChecks.length > 0 || warnChecks.length > 0) && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Alerts</p>
          {errorChecks.map((c, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg px-3.5 py-2.5 bg-red-950/20 border border-red-900/40 text-red-400">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.check_name}</p>
                {c.detail && <p className="text-xs opacity-75 mt-0.5">{c.detail}</p>}
              </div>
              {c.value !== null && <Badge variant="destructive" className="shrink-0 ml-auto tabular-nums">{c.value}</Badge>}
            </div>
          ))}
          {warnChecks.map((c, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg px-3.5 py-2.5 bg-amber-950/20 border border-amber-900/40 text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.check_name}</p>
                {c.detail && <p className="text-xs opacity-75 mt-0.5">{c.detail}</p>}
              </div>
              {c.value !== null && <span className="text-xs font-semibold shrink-0 ml-auto tabular-nums">{c.value}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Cards grid */}
      <div className="grid gap-4 sm:grid-cols-2">

        {/* Player Validation */}
        <IntegrityCard icon={Users} title="Player Validation" status={playerStatus} loading={loading}>
          <div className="space-y-0">
            <MetricRow label="Total Players" value={canonical?.total_players?.toLocaleString() ?? "—"} />
            <MetricRow
              label="With Price"
              value={`${canonical?.players_with_price?.toLocaleString() ?? "—"} (${priceCoverage ?? "—"}%)`}
              highlight={priceCoverage !== null && priceCoverage < 90 ? "red" : "green"}
            />
            <MetricRow
              label="With Projection"
              value={`${canonical?.players_with_projection?.toLocaleString() ?? "—"} (${projCoverage ?? "—"}%)`}
              highlight={projCoverage !== null && projCoverage < 90 ? "red" : "green"}
            />
            <MetricRow
              label="Missing Price"
              value={canonical?.players_missing_price?.toLocaleString() ?? "—"}
              highlight={canonical && canonical.players_missing_price > 20 ? "red" : "none"}
            />
            <MetricRow
              label="Missing Projection"
              value={canonical?.players_missing_projection?.toLocaleString() ?? "—"}
              highlight={canonical && canonical.players_missing_projection > 20 ? "red" : "none"}
            />
            <MetricRow label="Unique Teams" value={canonical?.unique_teams?.toLocaleString() ?? "—"} />
            <MetricRow label="Latest Round" value={canonical?.latest_round ?? "—"} />
          </div>
        </IntegrityCard>

        {/* Price Model Health */}
        <IntegrityCard icon={TrendingUp} title="Price Model Health" status={mwStatus} loading={loading}>
          <div className="space-y-0">
            <MetricRow label="Players in Snapshot" value={mwDiag?.total_players?.toLocaleString() ?? "—"} />
            <MetricRow
              label="Positive Price Change"
              value={`${mwDiag?.positive_price_change?.toLocaleString() ?? "—"} (${positivePct ?? "—"}%)`}
              highlight={positivePct !== null && positivePct < 5 ? "red" : positivePct !== null && positivePct < 15 ? "amber" : "green"}
            />
            <MetricRow
              label="Negative Price Change"
              value={`${mwDiag?.negative_price_change?.toLocaleString() ?? "—"}`}
            />
            <MetricRow label="Avg Projection (pts)" value={mwDiag?.avg_projection?.toFixed(1) ?? "—"} />
            <MetricRow
              label="Avg Breakeven (pts)"
              value={mwDiag?.avg_breakeven?.toFixed(1) ?? "—"}
              highlight={mwDiag && mwDiag.avg_breakeven > 200 ? "red" : mwDiag && mwDiag.avg_breakeven > 120 ? "amber" : "green"}
            />
            <MetricRow label="Buy Targets" value={mwDiag?.buy_count?.toLocaleString() ?? "—"} highlight="green" />
            <MetricRow label="Cash Cows" value={mwDiag?.cash_cow_count?.toLocaleString() ?? "—"} />
            <MetricRow label="Sell Now" value={mwDiag?.sell_now_count?.toLocaleString() ?? "—"} />
            <MetricRow label="Traps (Fade)" value={mwDiag?.fade_count?.toLocaleString() ?? "—"} />
          </div>
        </IntegrityCard>

        {/* Data Freshness */}
        <IntegrityCard icon={Clock} title="Data Freshness" status={snapshotStatus} loading={loading}>
          <div className="space-y-0">
            <MetricRow
              label="Market Watch Age"
              value={mwDiag?.snapshot_age_hours !== undefined ? `${mwDiag.snapshot_age_hours.toFixed(1)}h ago` : "—"}
              highlight={
                mwDiag && mwDiag.snapshot_age_hours > 48 ? "red"
                : mwDiag && mwDiag.snapshot_age_hours > 24 ? "amber"
                : "green"
              }
            />
            <MetricRow
              label="Rankings Cache Updated"
              value={canonical?.cache_refreshed_at
                ? new Date(canonical.cache_refreshed_at).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" })
                : "—"}
            />
            <MetricRow label="Market Watch Status" value={mwDiag?.status ?? "—"} />
          </div>
        </IntegrityCard>

        {/* Automated Checks */}
        <IntegrityCard icon={Database} title="Automated Checks" status={checksStatus} loading={loading}>
          {checks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No check data available.</p>
          ) : (
            <div className="space-y-0">
              {[...errorChecks, ...warnChecks, ...okChecks].slice(0, 8).map((c, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {c.status === "ok"    && <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />}
                    {c.status === "warn"  && <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />}
                    {c.status === "error" && <XCircle className="h-3 w-3 text-red-400 shrink-0" />}
                    <span className="text-sm text-muted-foreground truncate">{c.check_name}</span>
                  </div>
                  {c.value !== null && (
                    <span className={`text-sm font-semibold tabular-nums ml-2 shrink-0 ${
                      c.status === "error" ? "text-red-400" : c.status === "warn" ? "text-amber-400" : "text-emerald-400"
                    }`}>{c.value}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </IntegrityCard>

      </div>

      {/* Top Projections sanity check */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Top Projection Sanity Check
            <span className="text-xs font-normal text-muted-foreground ml-1">— these should be real AFL players with realistic scores</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}
            </div>
          ) : topProjections.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-red-400">
              <ShieldAlert className="h-4 w-4" />
              <span className="text-sm font-medium">No projection data found — pipeline may not have run</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">#</th>
                    <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Player</th>
                    <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Team</th>
                    <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Pos</th>
                    <th className="text-right py-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Projection</th>
                    <th className="text-right py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {topProjections.map((p, i) => (
                    <tr key={i} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="py-2 pr-4 text-muted-foreground tabular-nums">{i + 1}</td>
                      <td className="py-2 pr-4 font-medium">{p.player_name}</td>
                      <td className="py-2 pr-4 text-muted-foreground text-xs">{p.team}</td>
                      <td className="py-2 pr-4">
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{p.position}</span>
                      </td>
                      <td className="py-2 pr-4 text-right font-semibold tabular-nums text-emerald-400">{p.projection_final?.toFixed(1)}</td>
                      <td className="py-2 text-right text-muted-foreground tabular-nums">
                        ${(p.price / 1000).toFixed(0)}k
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
