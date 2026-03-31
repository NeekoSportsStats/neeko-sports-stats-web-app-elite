import { RefreshCw, Clock, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Circle as XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "../shared/adminUtils";

export interface CronJob {
  jobid: number;
  job_name: string;
  schedule: string;
  active: boolean;
  last_success: string | null;
  last_failure: string | null;
  last_run: string | null;
  latest_status: string;
  health: string;
  last_error_message: string | null;
}

interface Props {
  jobs: CronJob[];
  loading: boolean;
}

function HealthBadge({ health, status }: { health: string; status: string }) {
  if (health === "ok") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 text-[11px] font-medium px-2 py-0.5">
        <CheckCircle className="h-3 w-3" />
        {status}
      </span>
    );
  }
  if (health === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 text-[11px] font-medium px-2 py-0.5">
        <XCircle className="h-3 w-3" />
        failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 text-[11px] font-medium px-2 py-0.5">
      <AlertTriangle className="h-3 w-3" />
      {status}
    </span>
  );
}

function describeCron(expr: string): string {
  if (!expr) return expr;
  const e = expr.trim();
  if (e === "0 * * * *")          return "Every hour";
  if (e === "*/5 * * * *")        return "Every 5 min";
  if (e === "*/10 * * * *")       return "Every 10 min";
  if (e === "*/15 * * * *")       return "Every 15 min";
  if (e === "*/30 * * * *")       return "Every 30 min";
  if (e === "0 0 * * *")          return "Daily at midnight";
  if (e === "0 2 * * *")          return "Daily at 2 AM";
  if (e === "0 15 * * *")         return "Daily at 3 PM";
  if (e === "0 6 * * 1")          return "Mondays at 6 AM";
  if (e === "0 8 * * 1")          return "Mondays at 8 AM";
  if (e === "0 6 * * 2")          return "Tuesdays at 6 AM";
  if (e === "0 8 * * 2")          return "Tuesdays at 8 AM";
  if (e === "0 6 * * 0")          return "Sundays at 6 AM";
  const parts = e.split(" ");
  if (parts.length !== 5) return e;
  const [min, hr, , , dow] = parts;
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const dayName = dow !== "*" && !isNaN(Number(dow)) ? days[Number(dow)] : null;
  if (hr !== "*" && min !== "*") {
    const h = Number(hr);
    const m = Number(min);
    const time = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")} UTC`;
    if (dayName) return `${dayName}s at ${time}`;
    return `Daily at ${time}`;
  }
  return e;
}

export async function fetchCronJobs(): Promise<CronJob[]> {
  return [];
}

export default function CronJobMonitor({ jobs, loading }: Props) {
  const failedCount = jobs.filter((j) => j.health === "error").length;

  return (
    <Card className={failedCount > 0 ? "border-red-200 dark:border-red-900" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Cron Job Monitor
          </span>
          {failedCount > 0 && (
            <span className="text-xs font-medium text-red-600 dark:text-red-400">
              {failedCount} failed
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 px-5 pb-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground px-5 pb-5">No cron jobs found.</p>
        ) : (
          <div className="divide-y divide-border/40">
            {jobs.map((job) => (
              <div
                key={job.jobid}
                className={`px-5 py-3 ${job.health === "error" ? "bg-red-50/30 dark:bg-red-950/20" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold font-mono">{job.job_name}</span>
                      <HealthBadge health={job.health} status={job.latest_status} />
                      {!job.active && (
                        <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          inactive
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded" title={job.schedule}>
                        {describeCron(job.schedule)}
                      </span>
                      {job.last_success && (
                        <span className="text-[11px] text-muted-foreground">
                          Last OK: {formatDate(job.last_success)}
                        </span>
                      )}
                      {job.last_failure && job.health === "error" && (
                        <span className="text-[11px] text-red-600 dark:text-red-400">
                          Failed: {formatDate(job.last_failure)}
                        </span>
                      )}
                    </div>
                    {job.health === "error" && job.last_error_message && (
                      <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 font-mono truncate max-w-[520px]">
                        {job.last_error_message.slice(0, 180)}
                      </p>
                    )}
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
