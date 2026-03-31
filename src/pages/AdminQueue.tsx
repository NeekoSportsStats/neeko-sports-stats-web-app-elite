import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw, Clock, CircleCheck as CheckCircle, Circle as XCircle, Loader as Loader2 } from "lucide-react";

interface JobRow {
  id: string;
  job_type: string;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  attempts: number;
  created_at: string;
  processed_at: string | null;
  updated_at: string;
}

interface JobTypeSummary {
  job_type: string;
  pending: number;
  complete: number;
  failed: number;
  processing: number;
  total: number;
}

export default function AdminQueue() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    } else if (!loading && user && !isAdmin) {
      navigate("/");
    }
  }, [user, loading, isAdmin, navigate]);

  const fetchJobs = useCallback(async () => {
    setFetchError(null);
    const { data, error } = await supabase
      .from("ai_generation_queue")
      .select("id, job_type, entity_type, entity_id, status, attempts, created_at, processed_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) {
      setFetchError(error.message);
      return;
    }
    setJobs((data as JobRow[]) ?? []);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchJobs();
  }, [isAdmin, fetchJobs]);

  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel("admin-queue-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_generation_queue" }, () => {
        fetchJobs();
      })
      .subscribe();

    const interval = setInterval(fetchJobs, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [isAdmin, fetchJobs]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchJobs().finally(() => setTimeout(() => setIsRefreshing(false), 400));
  };

  const summaryByType: JobTypeSummary[] = Object.values(
    jobs.reduce<Record<string, JobTypeSummary>>((acc, job) => {
      if (!acc[job.job_type]) {
        acc[job.job_type] = { job_type: job.job_type, pending: 0, complete: 0, failed: 0, processing: 0, total: 0 };
      }
      const s = job.status;
      if (s === "pending")    acc[job.job_type].pending++;
      else if (s === "complete" || s === "done") acc[job.job_type].complete++;
      else if (s === "failed") acc[job.job_type].failed++;
      else if (s === "processing") acc[job.job_type].processing++;
      acc[job.job_type].total++;
      return acc;
    }, {})
  ).sort((a, b) => b.pending - a.pending);

  const totals = summaryByType.reduce(
    (acc, s) => ({
      pending:    acc.pending    + s.pending,
      complete:   acc.complete   + s.complete,
      failed:     acc.failed     + s.failed,
      processing: acc.processing + s.processing,
      total:      acc.total      + s.total,
    }),
    { pending: 0, complete: 0, failed: 0, processing: 0, total: 0 }
  );

  const overallPct = totals.total > 0
    ? Math.round((totals.complete / totals.total) * 100)
    : 0;

  const formatJobType = (t: string) =>
    t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const statusBadge = (s: string) => {
    if (s === "pending")    return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-0">Pending</Badge>;
    if (s === "complete" || s === "done")   return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-0">Complete</Badge>;
    if (s === "failed")     return <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-0">Failed</Badge>;
    if (s === "processing") return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-0">Processing</Badge>;
    return <Badge variant="outline">{s}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/operations")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">AI Generation Queue</h1>
              <p className="text-sm text-muted-foreground">
                Live view of <code className="text-xs bg-muted px-1 rounded">ai_generation_queue</code> — updates every 15s
              </p>
            </div>
          </div>
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {fetchError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Failed to load queue: {fetchError}
          </div>
        )}

        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 text-amber-500" />
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className={`text-3xl font-bold tabular-nums ${totals.pending > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                {totals.pending.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">awaiting processing</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5 text-blue-500" />
                Processing
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-3xl font-bold tabular-nums">{totals.processing.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-0.5">currently running</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                Complete
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {totals.complete.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">successfully generated</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5 text-red-500" />
                Failed
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className={`text-3xl font-bold tabular-nums ${totals.failed > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                {totals.failed.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">requires attention</p>
            </CardContent>
          </Card>
        </div>

        {totals.total > 0 && (
          <Card>
            <CardContent className="pt-5 pb-5 px-5">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-sm font-medium">Overall Completion</span>
                <span className="text-sm font-bold tabular-nums">{overallPct}%</span>
              </div>
              <Progress value={overallPct} className="h-2.5" />
              <p className="text-xs text-muted-foreground mt-1.5">
                {totals.complete.toLocaleString()} of {totals.total.toLocaleString()} jobs complete
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Breakdown by Job Type</CardTitle>
            <CardDescription>Pending / Complete / Failed per job type</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {summaryByType.length === 0 && (
              <p className="text-sm text-muted-foreground">No jobs found.</p>
            )}
            {summaryByType.map((s) => {
              const pct = s.total > 0 ? Math.round((s.complete / s.total) * 100) : 0;
              return (
                <div key={s.job_type} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{formatJobType(s.job_type)}</span>
                      {s.pending > 0 && (
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-0 text-xs">
                          {s.pending} pending
                        </Badge>
                      )}
                      {s.failed > 0 && (
                        <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-0 text-xs">
                          {s.failed} failed
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {s.complete}/{s.total}
                    </span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Pending: {s.pending} · Processing: {s.processing}</span>
                    <span className="font-semibold">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Recent Jobs</CardTitle>
            <CardDescription>Last 50 jobs — most recently created first</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 pr-3 font-medium">Job Type</th>
                    <th className="text-left py-2 pr-3 font-medium">Entity</th>
                    <th className="text-left py-2 pr-3 font-medium">Status</th>
                    <th className="text-left py-2 pr-3 font-medium">Attempts</th>
                    <th className="text-left py-2 font-medium flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.slice(0, 50).map((job) => (
                    <tr key={job.id} className="border-b border-border/40 hover:bg-muted/30">
                      <td className="py-1.5 pr-3 font-mono">{job.job_type}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground truncate max-w-[120px]">
                        {job.entity_type ?? "—"}
                      </td>
                      <td className="py-1.5 pr-3">{statusBadge(job.status)}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{job.attempts}</td>
                      <td className="py-1.5 text-muted-foreground tabular-nums">
                        {new Date(job.created_at).toLocaleString("en-AU", {
                          month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {jobs.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No jobs loaded.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">System Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Queue Table:</span>
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">public.ai_generation_queue</code>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reco Worker Batch:</span>
              <span className="font-medium">~30 jobs per call</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Controller Drain Cap:</span>
              <span className="font-medium">30 worker calls per run</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Real-time Updates:</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">Enabled</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Backup Refresh:</span>
              <span className="font-medium">Every 15 seconds</span>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
