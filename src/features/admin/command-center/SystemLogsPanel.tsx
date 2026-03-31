import { ScrollText, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "../shared/adminUtils";

export interface SystemLogRow {
  id: number;
  log_level: "debug" | "info" | "warn" | "error";
  source: string;
  event_type: string;
  message: string;
  created_at: string;
}

interface Props {
  logs: SystemLogRow[];
  loading: boolean;
}

function LevelBadge({ level }: { level: SystemLogRow["log_level"] }) {
  if (level === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 text-[10px] font-bold uppercase tracking-wide shrink-0">
        <AlertTriangle className="h-2.5 w-2.5" />
        ERR
      </span>
    );
  }
  if (level === "warn") {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wide shrink-0">
        <AlertTriangle className="h-2.5 w-2.5" />
        WARN
      </span>
    );
  }
  if (level === "info") {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wide shrink-0">
        <Info className="h-2.5 w-2.5" />
        INFO
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-wide shrink-0">
      <CheckCircle className="h-2.5 w-2.5" />
      DBG
    </span>
  );
}

export async function fetchSystemLogs(_limit = 20): Promise<SystemLogRow[]> {
  return [];
}

export default function SystemLogsPanel({ logs, loading }: Props) {
  const errorCount = logs.filter((l) => l.log_level === "error").length;

  return (
    <Card className={errorCount > 0 ? "border-amber-200 dark:border-amber-900" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
            System Logs
          </span>
          {errorCount > 0 && (
            <span className="text-xs font-medium text-red-600 dark:text-red-400">
              {errorCount} error{errorCount !== 1 ? "s" : ""}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 px-5 pb-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground px-5 pb-5">No log entries found.</p>
        ) : (
          <div className="divide-y divide-border/40 max-h-80 overflow-y-auto">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`px-5 py-2.5 ${log.log_level === "error" ? "bg-red-50/20 dark:bg-red-950/10" : ""}`}
              >
                <div className="flex items-start gap-2">
                  <LevelBadge level={log.log_level} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-xs font-mono text-muted-foreground">{log.source}</span>
                      <span className="text-[10px] text-muted-foreground/60">{formatDate(log.created_at)}</span>
                    </div>
                    <p className="text-xs text-foreground mt-0.5 leading-snug truncate">
                      {log.message}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
