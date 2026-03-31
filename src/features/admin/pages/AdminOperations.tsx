import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { runCommand } from "@/hooks/useAdminCommand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Zap, Bot, RefreshCw,
  DollarSign, Upload, CircleCheck as CheckCircle,
  CircleAlert as AlertCircle, ChartBar as BarChart2,
  Grid2x2 as Grid, ListOrdered, Play, DatabaseZap,
} from "lucide-react";
import { AdminPipelineProgress, type PipelineRun } from "@/components/admin/AdminPipelineProgress";

export default function AdminOperations() {
  const { toast } = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<PipelineRun | null>(null);

  const isRunning = running !== null;

  const createPipelineRun = async (pipelineKey: string, label: string, steps: number): Promise<string | null> => {
    const { data, error } = await supabase
      .from("pipeline_runs")
      .insert({
        pipeline_key: pipelineKey,
        label,
        total_tasks: steps,
        completed_tasks: 0,
        current_step_label: "Starting…",
        status: "running",
      })
      .select("id")
      .single();
    if (error || !data) return null;
    return data.id as string;
  };

  const fetchActiveRun = async (runId: string) => {
    const { data } = await supabase
      .from("v_pipeline_progress")
      .select("*")
      .eq("id", runId)
      .maybeSingle();
    if (data) setActiveRun(data as PipelineRun);
  };

  const finishPipelineRun = async (runId: string, success: boolean) => {
    await supabase
      .from("pipeline_runs")
      .update({
        status: success ? "completed" : "failed",
        completed_tasks: success ? (activeRun?.total_tasks ?? 1) : (activeRun?.completed_tasks ?? 0),
        current_step_label: success ? "Done" : "Failed",
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    await fetchActiveRun(runId);
  };

  const handleRefreshPricesAndRankings = async () => {
    setRunning("refresh_prices");
    toast({ title: "Refreshing prices and rankings…" });
    try {
      const res = await runCommand("refresh_fantasy_prices");
      if (!res.success) throw new Error(res.error ?? "Unknown error");
      toast({ title: "Prices and rankings refreshed", description: "Rankings cache, Market Watch and Edge Board updated." });
    } catch (err) {
      toast({ title: "Refresh failed", description: err instanceof Error ? err.message : "Unknown", variant: "destructive" });
    } finally {
      setRunning(null);
    }
  };

  const handleRunController = async () => {
    setRunning("controller");
    toast({ title: "Triggering AFL pipeline orchestrator…" });
    const runId = await createPipelineRun("afl_controller", "AFL Pipeline Orchestrator", 10);
    if (runId) await fetchActiveRun(runId);
    runCommand("run_full_pipeline").then(async (res) => {
      const success = res.success;
      if (runId) await finishPipelineRun(runId, success);
      toast({
        title: success ? "Pipeline complete" : "Pipeline failed",
        description: !success ? (res.error ?? "Unknown error") : undefined,
        variant: success ? "default" : "destructive",
      });
      setRunning(null);
    });
  };

  const handleRefreshRankingsCache = async () => {
    setRunning("rankings_cache");
    try {
      const res = await runCommand("refresh_rankings");
      if (!res.success) throw new Error(res.error ?? "Unknown error");
      toast({ title: "Rankings cache refreshed" });
    } catch (err) {
      toast({ title: "Rankings cache refresh failed", description: err instanceof Error ? err.message : "Unknown", variant: "destructive" });
    } finally {
      setRunning(null);
    }
  };

  const handleRefreshEdgeBoard = async () => {
    setRunning("edge_board");
    try {
      const res = await runCommand("refresh_edge_board");
      if (!res.success) throw new Error(res.error ?? "Unknown error");
      toast({ title: "Edge Board refreshed" });
    } catch (err) {
      toast({ title: "Edge Board refresh failed", description: err instanceof Error ? err.message : "Unknown", variant: "destructive" });
    } finally {
      setRunning(null);
    }
  };

  const handleRefreshMarketWatch = async () => {
    setRunning("market_watch");
    try {
      const res = await runCommand("refresh_market_watch");
      if (!res.success) throw new Error(res.error ?? "Unknown error");
      toast({ title: "Market Watch refreshed" });
    } catch (err) {
      toast({ title: "Market Watch refresh failed", description: err instanceof Error ? err.message : "Unknown", variant: "destructive" });
    } finally {
      setRunning(null);
    }
  };

  const handleRefreshProjectionAccuracy = async () => {
    setRunning("proj_accuracy");
    try {
      const res = await runCommand("refresh_projections");
      if (!res.success) throw new Error(res.error ?? "Unknown error");
      toast({ title: "Projection accuracy refreshed" });
    } catch (err) {
      toast({ title: "Projection accuracy failed", description: err instanceof Error ? err.message : "Unknown", variant: "destructive" });
    } finally {
      setRunning(null);
    }
  };

  const handleEnqueueRecoJobs = async () => {
    setRunning("enqueue_recos");
    try {
      const res = await runCommand("enqueue_reco_jobs");
      if (!res.success) throw new Error(res.error ?? "Unknown error");
      toast({ title: "Ranking reco jobs enqueued" });
    } catch (err) {
      toast({ title: "Enqueue failed", description: err instanceof Error ? err.message : "Unknown", variant: "destructive" });
    } finally {
      setRunning(null);
    }
  };

  const handleRunRecoWorker = async () => {
    setRunning("reco_worker");
    try {
      const res = await runCommand("run_ai_worker");
      if (!res.success) throw new Error(res.error ?? "Unknown error");
      toast({ title: "AI worker triggered (one batch)" });
    } catch (err) {
      toast({ title: "AI worker failed", description: err instanceof Error ? err.message : "Unknown", variant: "destructive" });
    } finally {
      setRunning(null);
    }
  };

  const handleRunRankingAI = async () => {
    setRunning("ranking_ai");
    try {
      const res = await runCommand("generate_ranking_ai");
      if (!res.success) throw new Error(res.error ?? "Unknown error");
      toast({ title: "Ranking AI worker triggered" });
    } catch (err) {
      toast({ title: "Ranking AI failed", description: err instanceof Error ? err.message : "Unknown", variant: "destructive" });
    } finally {
      setRunning(null);
    }
  };

  const ActionButton = ({
    id, label, icon: Icon, onClick, variant = "outline", disabled,
  }: {
    id: string;
    label: string;
    icon: React.ElementType;
    onClick: () => void;
    variant?: "default" | "outline";
    disabled?: boolean;
  }) => (
    <Button
      onClick={onClick}
      disabled={isRunning || disabled}
      variant={variant}
      className="w-full justify-start"
    >
      {running === id ? (
        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Icon className="h-4 w-4 mr-2" />
      )}
      {label}
    </Button>
  );

  // ─── Price Upload ──────────────────────────────────────────────────────────
  const [priceText, setPriceText] = useState("");
  const [priceRound, setPriceRound] = useState<string>("");
  const [uploadingPrices, setUploadingPrices] = useState(false);

  interface PriceUploadResult {
    rows_updated: number;
    rows_not_found: number;
    unmatched: string[];
    rows_skipped: number;
  }
  const [uploadResult, setUploadResult] = useState<PriceUploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handlePriceUpload = async () => {
    const round = parseInt(priceRound, 10);
    if (!priceText.trim()) {
      toast({ title: "No data pasted", variant: "destructive" });
      return;
    }
    if (isNaN(round) || round < 0 || round > 30) {
      toast({ title: "Enter a valid round number (0–30)", variant: "destructive" });
      return;
    }

    setUploadingPrices(true);
    setUploadResult(null);
    setUploadError(null);

    const lines = priceText.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    const priceRows: { player_name: string; price: number }[] = [];

    for (const line of lines) {
      const parts = line.split(",");
      if (parts.length < 2) continue;
      const rawName = parts.slice(0, -1).join(",").trim();
      const rawPrice = parts[parts.length - 1].replace(/[^0-9]/g, "");
      const price = parseInt(rawPrice, 10);
      if (!rawName || isNaN(price) || price < 100000) continue;
      priceRows.push({ player_name: rawName, price });
    }

    if (priceRows.length === 0) {
      toast({ title: "No valid rows found. Check format: Player Name,Price", variant: "destructive" });
      setUploadingPrices(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc("admin_update_fantasy_prices", {
        price_rows: priceRows,
        p_round: round,
      });
      if (error) throw error;

      const result = data as { success: boolean; error?: string } & PriceUploadResult;
      if (!result.success) {
        setUploadError(result.error ?? "Unknown error");
        toast({ title: "Price update failed", variant: "destructive" });
      } else {
        setUploadResult({
          rows_updated:   result.rows_updated   ?? 0,
          rows_not_found: result.rows_not_found ?? 0,
          unmatched:      result.unmatched      ?? [],
          rows_skipped:   result.rows_skipped   ?? 0,
        });
        const updated = result.rows_updated ?? 0;
        if (updated > 0) {
          toast({ title: `${updated} price${updated !== 1 ? "s" : ""} updated for Round ${round}` });
        } else {
          toast({ title: "No prices matched. Check player names.", variant: "destructive" });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setUploadError(msg);
      toast({ title: "Price update failed", description: msg, variant: "destructive" });
    } finally {
      setUploadingPrices(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Operations</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manual pipeline triggers and admin tools. Controller cron runs daily at 15:00 UTC.
        </p>
      </div>

      {/* Primary pipeline controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-muted-foreground" />
            Pipeline Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ActionButton
              id="controller"
              label="Run AFL Pipeline Controller"
              icon={Play}
              onClick={handleRunController}
              variant="default"
            />
            <ActionButton
              id="refresh_prices"
              label="Refresh Prices & Rankings"
              icon={DatabaseZap}
              onClick={handleRefreshPricesAndRankings}
              variant="default"
            />
            <ActionButton
              id="rankings_cache"
              label="Refresh Rankings Cache"
              icon={ListOrdered}
              onClick={handleRefreshRankingsCache}
            />
            <ActionButton
              id="edge_board"
              label="Refresh Edge Board"
              icon={Grid}
              onClick={handleRefreshEdgeBoard}
            />
            <ActionButton
              id="market_watch"
              label="Refresh Market Watch"
              icon={BarChart2}
              onClick={handleRefreshMarketWatch}
            />
            <ActionButton
              id="proj_accuracy"
              label="Refresh Projection Accuracy"
              icon={RefreshCw}
              onClick={handleRefreshProjectionAccuracy}
            />
          </div>

          {activeRun && (
            <AdminPipelineProgress
              run={activeRun}
              onPollTick={() => fetchActiveRun(activeRun.id)}
            />
          )}
        </CardContent>
      </Card>

      {/* AI queue controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-muted-foreground" />
            AI Queue Controls
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Manually trigger AI generation workers or enqueue missing jobs.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ActionButton
              id="enqueue_recos"
              label="Enqueue Ranking Reco Jobs"
              icon={ListOrdered}
              onClick={handleEnqueueRecoJobs}
            />
            <ActionButton
              id="reco_worker"
              label="Run Reco Worker (1 batch)"
              icon={Zap}
              onClick={handleRunRecoWorker}
            />
            <ActionButton
              id="ranking_ai"
              label="Run Ranking Analysis Worker"
              icon={Bot}
              onClick={handleRunRankingAI}
            />
          </div>
        </CardContent>
      </Card>

      {/* Fantasy Price Upload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            Fantasy Price Upload
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Paste player prices below. Format: <code className="text-[11px] bg-muted px-1 rounded">Player Name,Price</code>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Round Number</label>
            <input
              type="number"
              min={0}
              max={30}
              placeholder="e.g. 1"
              value={priceRound}
              onChange={(e) => { setPriceRound(e.target.value); setUploadResult(null); setUploadError(null); }}
              className="w-full max-w-[160px] rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Player Prices — one per line
            </label>
            <textarea
              value={priceText}
              onChange={(e) => { setPriceText(e.target.value); setUploadResult(null); setUploadError(null); }}
              placeholder={"Marcus Bontempelli,1054000\nNick Daicos,987000\nMax Gawn,921000"}
              rows={10}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
            />
            {priceText.trim() && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {priceText.trim().split("\n").filter((l) => l.trim() && l.includes(",")).length} rows detected
              </p>
            )}
          </div>

          <Button
            onClick={handlePriceUpload}
            disabled={uploadingPrices || !priceText.trim() || !priceRound}
            className="w-full sm:w-auto"
          >
            {uploadingPrices ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Update Prices
          </Button>

          {uploadError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
              <p className="text-xs text-destructive">{uploadError}</p>
            </div>
          )}

          {uploadResult && !uploadError && (
            <div className="space-y-2.5">
              {uploadResult.rows_updated > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
                  <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                  <div>
                    <p className="text-sm font-medium text-emerald-600">
                      {uploadResult.rows_updated} price{uploadResult.rows_updated !== 1 ? "s" : ""} updated
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Rankings cache, Market Watch and Edge Board refreshed automatically.
                    </p>
                  </div>
                </div>
              )}
              {uploadResult.rows_not_found > 0 && uploadResult.unmatched.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-600">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {uploadResult.rows_not_found} player{uploadResult.rows_not_found !== 1 ? "s" : ""} not found
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-0.5 max-h-36 overflow-y-auto font-mono">
                    {uploadResult.unmatched.map((name, i) => (
                      <li key={i} className="pl-1">{name}</li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-muted-foreground">
                    Names must match exactly (case-insensitive).
                  </p>
                </div>
              )}
              {uploadResult.rows_skipped > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {uploadResult.rows_skipped} row{uploadResult.rows_skipped !== 1 ? "s" : ""} skipped (invalid format or price below 100,000).
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
