import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RefreshCw,
  Fingerprint,
  TriangleAlert as AlertTriangle,
  CircleCheck as CheckCircle,
  ShieldAlert,
  Users,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Clock,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { AdminPageHeader } from "../shared/AdminPageHeader";

// ─── Types ──────────────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium" | "low";
type AnomalyStatus = "open" | "resolved" | "ignored";

interface Anomaly {
  id: string;
  severity: Severity;
  anomaly_type: string;
  player_id: number | null;
  player_name: string;
  team_name: string;
  details: Record<string, unknown>;
  status: AnomalyStatus;
  detected_at: string;
  resolved_at: string | null;
  notes: string | null;
}

interface SyncLog {
  id: string;
  run_at: string;
  players_inserted: number | null;
  players_updated: number | null;
  validation_status: string | null;
  triggered_by: string | null;
  notes: string | null;
}

interface ValidationResult {
  status: string;
  issue_count: number;
  fatal_count: number;
  warn_count: number;
  issues: Array<{ type: string; message: string; player_id?: number }>;
}

// ─── Severity helpers ────────────────────────────────────────────────────────

const SEV_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const SEV_CHIP: Record<Severity, string> = {
  critical: "bg-red-950 text-red-300 ring-1 ring-red-800",
  high:     "bg-amber-950 text-amber-300 ring-1 ring-amber-800",
  medium:   "bg-sky-950 text-sky-300 ring-1 ring-sky-800",
  low:      "bg-muted text-muted-foreground",
};

const SEV_DOT: Record<Severity, string> = {
  critical: "bg-red-500 animate-pulse",
  high:     "bg-amber-500",
  medium:   "bg-sky-400",
  low:      "bg-muted-foreground",
};

const TYPE_LABEL: Record<string, string> = {
  dual_identity:        "Dual Identity",
  high_value_placeholder: "High-Value Placeholder",
  unknown_identity:     "Unknown Identity",
  placeholder:          "Placeholder",
  duplicate_name:       "Duplicate Name",
  has_override:         "Has Override",
};

function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEV_CHIP[severity]}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEV_DOT[severity]}`} />
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}

// ─── Summary card ────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  accent: "red" | "amber" | "sky" | "muted";
}) {
  const colors: Record<string, string> = {
    red:   "text-red-400 bg-red-950/40 ring-red-800/40",
    amber: "text-amber-400 bg-amber-950/40 ring-amber-800/40",
    sky:   "text-sky-400 bg-sky-950/40 ring-sky-800/40",
    muted: "text-muted-foreground bg-muted/40 ring-border/40",
  };
  const valueColors: Record<string, string> = {
    red: "text-red-300", amber: "text-amber-300", sky: "text-sky-300", muted: "text-foreground",
  };

  return (
    <div className={`rounded-lg ring-1 p-4 flex items-center gap-3 ${colors[accent]}`}>
      <div className="shrink-0">
        <Icon className={`h-5 w-5 ${valueColors[accent]}`} />
      </div>
      <div className="min-w-0">
        <div className={`text-xl font-bold tabular-nums leading-none ${valueColors[accent]}`}>{value}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  );
}

// ─── Anomaly row ─────────────────────────────────────────────────────────────

function AnomalyRow({ anomaly }: { anomaly: Anomaly }) {
  const [expanded, setExpanded] = useState(false);

  const detailEntries = Object.entries(anomaly.details).filter(
    ([, v]) => v !== null && v !== undefined
  );

  return (
    <div className="border-b border-border/30 last:border-0">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="shrink-0">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </span>

        <SeverityChip severity={anomaly.severity} />

        <span className="text-xs text-muted-foreground shrink-0 min-w-[130px]">
          {TYPE_LABEL[anomaly.anomaly_type] ?? anomaly.anomaly_type}
        </span>

        <span className="text-sm font-medium text-foreground flex-1 truncate">
          {anomaly.player_name}
        </span>

        <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
          {anomaly.team_name}
        </span>

        {anomaly.player_id && (
          <span className="text-[11px] font-mono text-muted-foreground/60 shrink-0 hidden md:block">
            #{anomaly.player_id}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-0 ml-6 border-l border-border/30 ml-[2.25rem]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 mt-2">
            {detailEntries.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 py-0.5">
                <span className="text-[11px] text-muted-foreground capitalize shrink-0">
                  {k.replace(/_/g, " ")}
                </span>
                <span className="text-[11px] font-mono text-foreground/80 text-right break-all">
                  {Array.isArray(v) ? v.join(", ") : String(v ?? "—")}
                </span>
              </div>
            ))}
          </div>

          {anomaly.notes && (
            <p className="mt-3 text-[11px] text-muted-foreground italic border-t border-border/20 pt-2">
              {anomaly.notes}
            </p>
          )}

          <div className="mt-2 text-[10px] text-muted-foreground/50">
            Detected {new Date(anomaly.detected_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Severity group ──────────────────────────────────────────────────────────

function SeverityGroup({ severity, anomalies }: { severity: Severity; anomalies: Anomaly[] }) {
  const [collapsed, setCollapsed] = useState(severity === "low");

  if (anomalies.length === 0) return null;

  const headerColors: Record<Severity, string> = {
    critical: "text-red-400",
    high:     "text-amber-400",
    medium:   "text-sky-400",
    low:      "text-muted-foreground",
  };

  return (
    <div className="mb-4">
      <button
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors rounded-t-md border border-border/40"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed
          ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        }
        <span className={`text-xs font-semibold uppercase tracking-wide ${headerColors[severity]}`}>
          {severity}
        </span>
        <span className="ml-2 text-xs text-muted-foreground">
          {anomalies.length} {anomalies.length === 1 ? "issue" : "issues"}
        </span>
      </button>

      {!collapsed && (
        <div className="border border-t-0 border-border/40 rounded-b-md overflow-hidden">
          {anomalies.map((a) => (
            <AnomalyRow key={a.id} anomaly={a} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AdminPlayerIdentity() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [anomalyRes, logRes] = await Promise.all([
        supabase
          .from("player_identity_anomalies")
          .select("*")
          .eq("status", "open")
          .order("detected_at", { ascending: false }),
        supabase
          .from("player_identity_sync_log")
          .select("id, run_at, players_inserted, players_updated, validation_status, triggered_by, notes")
          .order("run_at", { ascending: false })
          .limit(10),
      ]);

      if (anomalyRes.data) setAnomalies(anomalyRes.data as Anomaly[]);
      if (logRes.data) setSyncLogs(logRes.data as SyncLog[]);
      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefreshAnomalies = useCallback(async () => {
    setRefreshing(true);
    try {
      await supabase.rpc("refresh_player_identity_anomalies");
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const handleRunValidation = useCallback(async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const { data } = await supabase.rpc("validate_afl_player_identity");
      if (data) setValidationResult(data as ValidationResult);
    } finally {
      setValidating(false);
    }
  }, []);

  // Summary counts
  const criticalCount = anomalies.filter((a) => a.severity === "critical").length;
  const highCount     = anomalies.filter((a) => a.severity === "high").length;
  const placeholders  = anomalies.filter((a) =>
    a.anomaly_type === "placeholder" || a.anomaly_type === "high_value_placeholder"
  ).length;
  const duplicates    = anomalies.filter((a) => a.anomaly_type === "duplicate_name").length;

  // Group by severity
  const grouped = (["critical", "high", "medium", "low"] as Severity[]).map((sev) => ({
    severity: sev,
    items: anomalies
      .filter((a) => a.severity === sev)
      .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]),
  }));

  const totalOpen = anomalies.length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Player Identity"
        description="Anomaly detection and identity audit dashboard"
        icon={Fingerprint}
      />

      {/* Action buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefreshAnomalies}
          disabled={refreshing || loading}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh Anomalies"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRunValidation}
          disabled={validating}
          className="gap-2"
        >
          <ShieldAlert className={`h-3.5 w-3.5 ${validating ? "animate-pulse" : ""}`} />
          {validating ? "Validating…" : "Run Identity Validation"}
        </Button>
        {lastRefreshed && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 ml-auto">
            <Clock className="h-3 w-3" />
            Last loaded {lastRefreshed.toLocaleTimeString("en-AU", { timeStyle: "short" })}
          </span>
        )}
      </div>

      {/* Validation result */}
      {validationResult && (
        <Card className="border-border/50">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              Identity Validation Result
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="flex items-center gap-4 mb-3">
              <span className={`text-sm font-semibold ${
                validationResult.status === "ok" ? "text-emerald-400" : "text-amber-400"
              }`}>
                {validationResult.status?.toUpperCase()}
              </span>
              <span className="text-xs text-muted-foreground">
                {validationResult.issue_count} issue{validationResult.issue_count !== 1 ? "s" : ""} —
                {validationResult.fatal_count} fatal,
                {validationResult.warn_count} warnings
              </span>
            </div>
            {validationResult.issues && validationResult.issues.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {validationResult.issues.map((issue, i) => (
                  <div key={i} className="text-[11px] text-muted-foreground border-b border-border/20 pb-1">
                    <span className="font-mono text-amber-400/80 mr-2">[{issue.type}]</span>
                    {issue.message}
                    {issue.player_id && (
                      <span className="ml-2 font-mono text-muted-foreground/60">#{issue.player_id}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Critical Issues"
          value={loading ? "…" : criticalCount}
          icon={AlertTriangle}
          accent={criticalCount > 0 ? "red" : "muted"}
        />
        <SummaryCard
          label="High Priority"
          value={loading ? "…" : highCount}
          icon={ShieldAlert}
          accent={highCount > 0 ? "amber" : "muted"}
        />
        <SummaryCard
          label="Placeholders"
          value={loading ? "…" : placeholders}
          icon={Users}
          accent={placeholders > 0 ? "sky" : "muted"}
        />
        <SummaryCard
          label="Duplicate Names"
          value={loading ? "…" : duplicates}
          icon={ClipboardList}
          accent={duplicates > 0 ? "amber" : "muted"}
        />
      </div>

      {/* Anomaly table */}
      <Card className="border-border/50">
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-muted-foreground" />
            Open Anomalies
            {!loading && (
              <span className="ml-1 text-[11px] text-muted-foreground font-normal">
                ({totalOpen})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground/50">Loading anomalies…</span>
            </div>
          ) : totalOpen === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <CheckCircle className="h-8 w-8 text-emerald-500/40" />
              <p className="text-sm text-muted-foreground">No open anomalies detected</p>
              <p className="text-[11px] text-muted-foreground/60">
                Click "Refresh Anomalies" to run detection
              </p>
            </div>
          ) : (
            <div className="px-4 pb-4 pt-2">
              {grouped.map(({ severity, items }) => (
                <SeverityGroup key={severity} severity={severity} anomalies={items} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent sync logs */}
      <Card className="border-border/50">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Recent Identity Sync Runs
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {syncLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No sync logs found</p>
          ) : (
            <div className="space-y-0 divide-y divide-border/30">
              {syncLogs.map((log) => (
                <div key={log.id} className="flex items-center gap-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-foreground font-medium">
                      {new Date(log.run_at).toLocaleString("en-AU", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                    {log.notes && (
                      <div className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
                        {log.notes}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted-foreground font-mono">
                    {log.players_inserted != null && (
                      <span>+{log.players_inserted} ins</span>
                    )}
                    {log.players_updated != null && (
                      <span>{log.players_updated} upd</span>
                    )}
                    {log.validation_status && (
                      <span className={
                        log.validation_status === "ok"
                          ? "text-emerald-400"
                          : "text-amber-400"
                      }>
                        {log.validation_status}
                      </span>
                    )}
                    {log.triggered_by && (
                      <span className="text-muted-foreground/50">{log.triggered_by}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
