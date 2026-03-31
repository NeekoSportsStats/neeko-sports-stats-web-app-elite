import { useState, useCallback, useEffect } from "react";
import { fetchAdminDashboardData } from "@/lib/adminApi";
import { runCommand } from "@/hooks/useAdminCommand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, TrendingUp, Database, Activity, Zap, Play,
  CircleCheck as CheckCircle, TriangleAlert as AlertTriangle,
  Circle as XCircle, SquareCheck as CheckSquare, Layers, DollarSign,
} from "lucide-react";
import { formatDate } from "@/features/admin/shared/adminUtils";
import type { CommandCenterStatus } from "@/features/admin/shared/types";

type HealthStatus = "ok" | "warn" | "error" | "loading";

function toLevel(s: string | undefined | null): HealthStatus {
  if (s === "ok") return "ok";
  if (s === "warn") return "warn";
  if (s === "error") return "error";
  return "loading";
}

function StatusChip({ level, label }: { level: HealthStatus; label: string }) {
  const cfg: Record<HealthStatus, { cls: string; dot: string }> = {
    ok:      { cls: "bg-emerald-950 text-emerald-400", dot: "bg-emerald-500" },
    warn:    { cls: "bg-amber-950 text-amber-400", dot: "bg-amber-500" },
    error:   { cls: "bg-red-950 text-red-400", dot: "bg-red-500 animate-pulse" },
    loading: { cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground animate-pulse" },
  };
  const { cls, dot } = cfg[level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {label}
    </span>
  );
}

function DataActionButton({
  label, command, icon: Icon, variant = "outline", onComplete,
}: {
  label: string; command: string; icon: React.ElementType;
  variant?: "default" | "outline"; onComplete?: () => void;
}) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [lastStatus, setLastStatus] = useState<"idle" | "success" | "error">("idle");

  async function handle() {
    setRunning(true);
    setLastStatus("idle");
    try {
      const res = await runCommand(command);
      if (res.success) {
        setLastStatus("success");
        toast({ title: `${label} complete`, description: res.duration_ms ? `${res.duration_ms}ms` : "Running" });
        onComplete?.();
      } else {
        setLastStatus("error");
        toast({ title: `${label} failed`, description: res.error ?? "Unknown error", variant: "destructive" });
      }
    } catch (err) {
      setLastStatus("error");
      toast({ title: `${label} failed`, description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRunning(false);
      setTimeout(() => setLastStatus("idle"), 4000);
    }
  }

  return (
    <Button
      variant={variant}
      size="sm"
      disabled={running}
      onClick={handle}
      className={`text-xs justify-start ${
        lastStatus === "success" ? "border-emerald-500/40 text-emerald-400" :
        lastStatus === "error" ? "border-red-500/40 text-red-400" : ""
      }`}
    >
      {running ? (
        <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
      ) : lastStatus === "success" ? (
        <CheckSquare className="h-3 w-3 mr-1.5 text-emerald-400" />
      ) : lastStatus === "error" ? (
        <XCircle className="h-3 w-3 mr-1.5 text-red-400" />
      ) : (
        <Icon className="h-3 w-3 mr-1.5" />
      )}
      {label}
    </Button>
  );
}

export default function AdminDataHub() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<CommandCenterStatus | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminDashboardData("status");
      if (data.status) setStatus(data.status as CommandCenterStatus);
      setLastRefreshed(new Date());
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Data</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fantasy prices, market watch, projections, and accuracy
            {lastRefreshed && ` · ${lastRefreshed.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Fantasy Prices",
              value: status?.fantasy_matched_count?.toLocaleString() ?? "—",
              sub: status?.fantasy_price_last_updated ? formatDate(status.fantasy_price_last_updated) : "Never",
              level: status?.fantasy_price_last_updated ? "ok" as HealthStatus : "warn" as HealthStatus,
            },
            {
              label: "Unmatched",
              value: status?.fantasy_unmatched_count?.toLocaleString() ?? "—",
              sub: "price names unresolved",
              level: (status?.fantasy_unmatched_count ?? 0) > 10 ? "warn" as HealthStatus : "ok" as HealthStatus,
            },
            {
              label: "Market Watch",
              value: status?.market_watch_quality ?? "—",
              sub: status?.market_watch_last_refresh ? formatDate(status.market_watch_last_refresh) : "Never",
              level: toLevel(status?.market_watch_health),
            },
            {
              label: "Accuracy",
              value: status?.accuracy_last_updated ? "Updated" : "—",
              sub: status?.accuracy_last_updated ? formatDate(status.accuracy_last_updated) : "Never refreshed",
              level: status?.accuracy_last_updated ? "ok" as HealthStatus : "warn" as HealthStatus,
            },
          ].map(({ label, value, sub, level }) => (
            <div
              key={label}
              className={`rounded-lg border px-3 py-2.5 ${
                level === "ok" ? "border-emerald-900/40 bg-emerald-950/10"
                : level === "warn" ? "border-amber-900/40 bg-amber-950/10"
                : level === "error" ? "border-red-900/40 bg-red-950/10"
                : "border-border bg-card"
              }`}
            >
              <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
              <p className="text-lg font-bold tabular-nums leading-tight truncate">{value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">

        {/* Fantasy Prices */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm font-semibold">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                Fantasy Prices
              </div>
              <StatusChip
                level={status?.fantasy_price_last_updated ? "ok" : "warn"}
                label={status?.fantasy_matched_count != null ? `${status.fantasy_matched_count} matched` : "No prices"}
              />
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Apply new fantasy prices to trigger the full sync chain
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
            ) : (
              <>
                <DataActionButton
                  label="Apply Fantasy Prices (Full Chain)"
                  command="apply_fantasy_prices"
                  icon={Layers}
                  variant="default"
                  onComplete={fetchAll}
                />
                <DataActionButton
                  label="Refresh Rankings Cache Only"
                  command="refresh_rankings"
                  icon={Database}
                  onComplete={fetchAll}
                />
                {status?.fantasy_unmatched_count != null && status.fantasy_unmatched_count > 0 && (
                  <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {status.fantasy_unmatched_count} unmatched player names — use Price Ingest tab in Data
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Market Watch */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm font-semibold">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0">
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                Market Watch
              </div>
              <StatusChip level={toLevel(status?.market_watch_health)} label={status?.market_watch_quality ?? "—"} />
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {status?.market_watch_last_refresh
                ? `Last refreshed: ${formatDate(status.market_watch_last_refresh)}`
                : "No snapshot available"}
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
            ) : (
              <>
                <DataActionButton
                  label="Refresh Market Watch Snapshot"
                  command="refresh_market_watch"
                  icon={TrendingUp}
                  variant="default"
                  onComplete={fetchAll}
                />
                <DataActionButton
                  label="Generate Market Watch AI Summary"
                  command="generate_market_watch_ai"
                  icon={Zap}
                  onComplete={fetchAll}
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Projections & Accuracy */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm font-semibold">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                Projections & Accuracy
              </div>
              <StatusChip
                level={status?.accuracy_last_updated ? "ok" : "warn"}
                label={status?.accuracy_last_updated ? "Updated" : "Stale"}
              />
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Recalculate projections and measure accuracy vs real results
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
            ) : (
              <>
                <DataActionButton
                  label="Refresh Projection Accuracy"
                  command="refresh_projections"
                  icon={Activity}
                  variant="default"
                  onComplete={fetchAll}
                />
                {status?.accuracy_last_updated && (
                  <p className="text-[11px] text-muted-foreground">
                    Last calculated: {formatDate(status.accuracy_last_updated)}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Ingest & Dispatch */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0">
                <Database className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
              Ingest & Dispatch
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Manual AFL data ingestion triggers
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
            ) : (
              <>
                <DataActionButton
                  label="Run AFL Master Dispatcher"
                  command="run_ingest"
                  icon={Database}
                  variant="default"
                  onComplete={fetchAll}
                />
                <DataActionButton
                  label="Ingest Player Stats"
                  command="ingest_player_stats"
                  icon={Play}
                  onComplete={fetchAll}
                />
                <DataActionButton
                  label="Ingest Team Stats"
                  command="ingest_team_stats"
                  icon={Play}
                  onComplete={fetchAll}
                />
              </>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
