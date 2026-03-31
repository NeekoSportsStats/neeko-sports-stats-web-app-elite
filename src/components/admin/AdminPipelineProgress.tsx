import { useEffect, useRef } from "react";
import { CircleCheck as CheckCircle, Circle as XCircle, Loader as Loader2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export interface PipelineRun {
  id: string;
  pipeline_key: string;
  label: string;
  total_tasks: number;
  completed_tasks: number;
  percent_complete: number;
  remaining_tasks: number;
  current_step_label: string;
  status: "running" | "completed" | "failed";
  started_at: string;
  finished_at: string | null;
}

interface AdminPipelineProgressProps {
  run: PipelineRun;
  onPollTick: () => void;
}

export function AdminPipelineProgress({ run, onPollTick }: AdminPipelineProgressProps) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (run.status === "running") {
      intervalRef.current = setInterval(onPollTick, 2000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [run.status, onPollTick]);

  const pct = Math.min(Math.max(run.percent_complete ?? 0, 0), 100);
  const elapsed = run.finished_at
    ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
    : Math.round((Date.now() - new Date(run.started_at).getTime()) / 1000);

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2">
            {run.status === "running" && (
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            )}
            {run.status === "completed" && (
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            )}
            {run.status === "failed" && (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            {run.label || run.pipeline_key}
          </span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground font-normal">
              <Clock className="h-3 w-3" />
              {elapsed}s
            </span>
            <StatusBadge status={run.status} />
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {run.completed_tasks} of {run.total_tasks} steps
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {pct.toFixed(0)}%
            </span>
          </div>
          <Progress
            value={pct}
            className={`h-2.5 ${
              run.status === "failed"
                ? "[&>div]:bg-red-500"
                : run.status === "completed"
                  ? "[&>div]:bg-emerald-500"
                  : "[&>div]:bg-blue-500"
            }`}
          />
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <StatCell label="Completed" value={run.completed_tasks} color="emerald" />
          <StatCell label="Remaining" value={run.remaining_tasks} color="muted" />
          <StatCell label="Total" value={run.total_tasks} color="muted" />
        </div>

        {run.current_step_label && run.status === "running" && (
          <div className="rounded-md bg-muted/50 border border-border/60 px-3 py-2">
            <p className="text-xs text-muted-foreground mb-0.5">Current Step</p>
            <p className="text-sm font-medium text-foreground leading-snug">
              {run.current_step_label}
            </p>
          </div>
        )}

        {run.status === "completed" && (
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 px-3 py-2">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              All steps completed successfully
            </p>
          </div>
        )}

        {run.status === "failed" && (
          <div className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-3 py-2">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              Pipeline failed — check job history for details
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: PipelineRun["status"] }) {
  if (status === "running") {
    return (
      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-0 text-xs px-2 py-0">
        Running
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-0 text-xs px-2 py-0">
        Completed
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-0 text-xs px-2 py-0">
      Failed
    </Badge>
  );
}

function StatCell({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "emerald" | "muted";
}) {
  const valueClass =
    color === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-foreground";

  return (
    <div className="rounded-md bg-muted/40 border border-border/50 py-2 px-1">
      <p className={`text-lg font-bold tabular-nums ${valueClass}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
