import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ResolvedRow {
  fantasy_id: number;
  player_id: number;
  player_name: string;
  club: string;
  price: number;
  status: string;
  matched_by: string;
}

interface UnresolvedRow {
  fantasy_id: number;
  player_name: string;
  club: string | null;
  squad_id: number;
  price: number;
  status: string;
}

interface ResolveSummary {
  total: number;
  resolved_count: number;
  unresolved_count: number;
  new_mapping_count: number;
}

interface ResolveResult {
  summary: ResolveSummary;
  resolved: ResolvedRow[];
  unresolved: UnresolvedRow[];
}

interface SearchPlayer {
  player_id: number;
  player_name: string;
  team: string;
  player_pos: string;
}

interface MismatchRow {
  player_name: string;
  team_count: number;
  teams: string[];
  player_ids: number[];
  record_count: number;
}

interface PipelineJob {
  jobname: string;
  active: boolean;
  schedule: string;
  last_start: string | null;
  last_status: string | null;
  seconds_since: number | null;
  message: string;
}

interface PipelineHealth {
  jobs: PipelineJob[];
  alerts: { count: number; most_recent: string | null; most_recent_type: string | null };
  generated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBg(status: string) {
  if (status === "OUT" || status === "INJURED") return "bg-red-900/50 text-red-300";
  if (status === "TEST") return "bg-yellow-900/50 text-yellow-300";
  return "bg-green-900/50 text-green-300";
}

function matchBadge(m: string) {
  if (m === "fantasy_id") return "bg-blue-800 text-blue-200";
  if (m?.startsWith("name_")) return "bg-purple-800 text-purple-200";
  return "bg-zinc-700 text-zinc-300";
}

function relativeTime(isoStr: string | null): string {
  if (!isoStr) return "never";
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function jobColor(job: PipelineJob): "green" | "amber" | "red" {
  if (!job.active || !job.last_status) return "red";
  if (job.last_status === "failed") return "red";
  if (job.last_status === "succeeded" && (job.seconds_since ?? Infinity) >= 93600) return "amber";
  if (job.last_status === "succeeded") return "green";
  return "red";
}

const colorDot: Record<string, string> = {
  green: "bg-green-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
};
const colorText: Record<string, string> = {
  green: "text-green-400",
  amber: "text-amber-400",
  red: "text-red-400",
};

// ── Login Gate ────────────────────────────────────────────────────────────────

function LoginGate() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: authErr } = await supabase!.auth.signInWithPassword({ email, password });
      if (authErr) setError(authErr.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Ops Console</h1>
          <p className="text-xs text-zinc-500 mt-1">Admin access required</p>
        </div>
        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs text-zinc-400">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-zinc-400">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
            />
          </div>
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Tab 1: Paste ──────────────────────────────────────────────────────────────

interface BackfillResult {
  ok: boolean;
  error?: string;
  players_processed?: number;
  unresolved_count?: number;
  rounds_written_per_round?: Record<string, number>;
}

interface WrapperResult {
  write_result: Record<string, unknown>;
  refreshed: boolean;
  refresh_skipped_reason: string | null;
  error_detail: string | null;
}

function PasteTab({ onUnresolved }: { onUnresolved: (rows: UnresolvedRow[]) => void }) {
  const [json, setJson] = useState("");
  const [round, setRound] = useState<number>(18);
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Backfill state
  const [backfillFrom, setBackfillFrom] = useState<number>(14);
  const [backfillTo, setBackfillTo] = useState<number>(17);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [refreshBanner, setRefreshBanner] = useState<{ type: 'green' | 'amber'; message: string } | null>(null);

  function RefreshBannerBlock({ banner }: { banner: { type: 'green' | 'amber'; message: string } | null }) {
    if (!banner) return null;
    return (
      <div className={`mt-2 rounded-lg px-4 py-3 text-sm ${
        banner.type === 'green'
          ? 'bg-green-950/50 border border-green-700 text-green-300'
          : 'bg-amber-950/30 border border-amber-800 text-amber-300'
      }`}>
        {banner.message}
      </div>
    );
  }

  function resolveRefreshBanner(res: WrapperResult): { type: 'green' | 'amber'; message: string } {
    if (res.refreshed) return { type: 'green', message: 'Prices saved and app updated.' };
    if (res.refresh_skipped_reason === 'cron_window') return { type: 'amber', message: "Prices saved. App will update after tonight's pipeline (cron window)." };
    if (res.refresh_skipped_reason === 'pipeline_running') return { type: 'amber', message: 'Prices saved. App will update shortly (pipeline running).' };
    if (res.refresh_skipped_reason === 'error') return { type: 'amber', message: `Prices saved, but refresh failed — will update on next pipeline run.${res.error_detail ? ` ${res.error_detail}` : ''}` };
    return { type: 'amber', message: 'Prices saved. Refresh status unknown.' };
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 6000);
  }

  async function handlePreview() {
    setError(null);
    setResult(null);
    setPreviewing(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(json.trim());
      } catch {
        setError("Invalid JSON — paste the raw AFL Fantasy player array.");
        return;
      }
      if (!Array.isArray(parsed)) {
        setError("Expected a JSON array at the top level.");
        return;
      }
      const { data, error: rpcErr } = await supabase!.rpc("resolve_fantasy_paste", { p_json: parsed });
      if (rpcErr) { setError(`RPC error: ${rpcErr.message}`); return; }
      const res = data as ResolveResult;
      setResult(res);
      onUnresolved(res.unresolved ?? []);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleCommit() {
    if (!result) return;
    setCommitting(true);
    setError(null);
    setRefreshBanner(null);
    let statusCount = 0;
    const skipped: string[] = [];
    try {
      const priceRows = result.resolved.map((r) => ({ player_id: r.player_id, price: r.price }));
      const { data, error: rpcErr } = await supabase!.rpc("commit_prices_and_refresh", {
        p_action: "commit",
        p_rows: priceRows,
        p_season: 2026,
        p_round: round,
      });
      if (rpcErr) { setError(`commit_prices_and_refresh failed: ${rpcErr.message}`); return; }
      const res = data as WrapperResult;
      if (res.refresh_skipped_reason === "write_failed" || (res.write_result as BackfillResult)?.ok === false) {
        setError(`Write failed: ${(res.write_result as BackfillResult)?.error ?? res.error_detail ?? "unknown error"}`);
        return;
      }
      setRefreshBanner(resolveRefreshBanner(res));

      for (const row of result.resolved) {
        if (row.status !== "AVAILABLE") {
          const canonicalStatus = row.status === "OUT" || row.status === "TEST" ? row.status : null;
          if (!canonicalStatus) continue;
          const { error: statusErr } = await supabase!.rpc("admin_update_player_status", {
            p_player_id: row.player_id,
            p_status: canonicalStatus,
          });
          if (statusErr) skipped.push(row.player_name);
          else statusCount++;
        }
      }

      showToast(
        `Updated ${priceRows.length} prices, marked ${statusCount} as OUT/TEST${skipped.length ? `, ${skipped.length} status errors` : ""}. ${result.unresolved?.length ?? 0} unresolved → check Resolve Queue.`
      );
      onUnresolved(result.unresolved ?? []);
    } finally {
      setCommitting(false);
    }
  }

  async function handleBackfill() {
    setBackfillError(null);
    setBackfillResult(null);
    setRefreshBanner(null);
    if (!json.trim()) {
      setBackfillError("Paste JSON is empty — paste the AFL Fantasy player array first.");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(json.trim());
    } catch {
      setBackfillError("Invalid JSON — could not parse the paste content.");
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      setBackfillError("Paste must be a non-empty JSON array.");
      return;
    }
    setBackfilling(true);
    try {
      const { data, error: rpcErr } = await supabase!.rpc("commit_prices_and_refresh", {
        p_action: "backfill",
        p_rows: parsed,
        p_season: 2026,
        p_from_round: backfillFrom,
        p_to_round: backfillTo,
      });
      if (rpcErr) {
        setBackfillError(`RPC error: ${rpcErr.message}`);
        return;
      }
      const res = data as WrapperResult;
      const writeResult = res.write_result as BackfillResult;
      if (res.refresh_skipped_reason === "write_failed" || !writeResult?.ok) {
        setBackfillError(writeResult?.error ?? res.error_detail ?? "Function returned ok:false with no message.");
        return;
      }
      setBackfillResult(writeResult);
      setRefreshBanner(resolveRefreshBanner(res));
    } catch (err: unknown) {
      setBackfillError(err instanceof Error ? err.message : String(err));
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-700 text-white px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm">
          {toast}
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">
          AFL Fantasy JSON Array
        </label>
        <textarea
          className="w-full h-52 bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-500 resize-y"
          placeholder={'[{"id":12345,"firstName":"Marcus","lastName":"Bontempelli","squadId":160,"price":942800,"status":"Playing"},...]'}
          value={json}
          onChange={(e) => setJson(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handlePreview}
          disabled={!json.trim() || previewing}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
        >
          {previewing ? "Resolving…" : "Preview"}
        </button>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-400">Round:</label>
          <input
            type="number"
            min={1}
            max={24}
            value={round}
            onChange={(e) => setRound(Number(e.target.value))}
            className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total", val: result.summary.total, color: "text-zinc-100" },
              { label: "Resolved", val: result.summary.resolved_count, color: "text-green-400" },
              { label: "Unresolved", val: result.summary.unresolved_count, color: result.summary.unresolved_count > 0 ? "text-red-400" : "text-zinc-400" },
              { label: "New Mappings", val: result.summary.new_mapping_count, color: "text-blue-400" },
            ].map((s) => (
              <div key={s.label} className="bg-zinc-900 rounded-lg p-3 text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
                <div className="text-xs text-zinc-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {result.resolved.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {["Player", "Club", "Price", "Status", "Matched By"].map((h) => (
                      <th key={h} className="text-left py-2 px-3 text-zinc-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.resolved.map((row) => (
                    <tr key={row.fantasy_id} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
                      <td className="py-2 px-3 text-zinc-200">{row.player_name}</td>
                      <td className="py-2 px-3 text-zinc-400">{row.club ?? "—"}</td>
                      <td className="py-2 px-3 text-zinc-300">${row.price?.toLocaleString()}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${statusBg(row.status)}`}>{row.status}</span>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${matchBadge(row.matched_by)}`}>{row.matched_by}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.unresolved.length > 0 && (
            <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-red-300 mb-2">
                Unresolved ({result.unresolved.length}) — go to Resolve Queue tab
              </h3>
              <ul className="space-y-1">
                {result.unresolved.map((r) => (
                  <li key={r.fantasy_id} className="text-xs text-red-200/70">
                    {r.player_name} ({r.club ?? `squadId:${r.squad_id}`}) — ${r.price?.toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-zinc-800 pt-4">
            <button
              onClick={handleCommit}
              disabled={committing || result.resolved.length === 0}
              className="px-5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {committing ? "Committing…" : `Commit ${result.resolved.length} prices (Round ${round})`}
            </button>
            <RefreshBannerBlock banner={refreshBanner} />
          </div>
        </div>
      )}

      {/* ── Backfill price history ──────────────────────────────────── */}
      <div className="border border-zinc-700 rounded-xl p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Backfill price history (rounds 14–17)</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Writes missing historical rounds from the prices&#123;&#125; map in the pasted JSON.
            Uses ON CONFLICT DO NOTHING — existing committed rounds are never overwritten.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-400 whitespace-nowrap">From round</label>
          <input
            type="number"
            min={0}
            max={24}
            value={backfillFrom}
            onChange={(e) => setBackfillFrom(Number(e.target.value))}
            className="w-20 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-zinc-100 text-center"
          />
          <label className="text-xs text-zinc-400 whitespace-nowrap">To round</label>
          <input
            type="number"
            min={0}
            max={24}
            value={backfillTo}
            onChange={(e) => setBackfillTo(Number(e.target.value))}
            className="w-20 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-zinc-100 text-center"
          />
          <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="px-4 py-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {backfilling ? "Backfilling…" : "Backfill price history"}
          </button>
        </div>

        {backfillError && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {backfillError}
          </div>
        )}

        {backfillResult && (
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-3 space-y-1 text-sm">
            <p className="text-zinc-300 font-medium">Backfill complete</p>
            <p className="text-zinc-400">
              Players processed: <span className="text-zinc-100">{backfillResult.players_processed}</span>
              {" · "}
              Unresolved: <span className={backfillResult.unresolved_count! > 0 ? "text-amber-400" : "text-zinc-100"}>
                {backfillResult.unresolved_count}
              </span>
            </p>
            {backfillResult.rounds_written_per_round && (
              <p className="text-zinc-400">
                {Object.entries(backfillResult.rounds_written_per_round)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([r, n]) => `Round ${r}: ${n} written`)
                  .join(" · ")}
              </p>
            )}
            <RefreshBannerBlock banner={refreshBanner} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab 2: Resolve Queue ──────────────────────────────────────────────────────

function ResolveQueueTab({ rows }: { rows: UnresolvedRow[] }) {
  const [searchMap, setSearchMap] = useState<Record<number, string>>({});
  const [resultsMap, setResultsMap] = useState<Record<number, SearchPlayer[]>>({});
  const [selectedMap, setSelectedMap] = useState<Record<number, SearchPlayer | null>>({});
  const [confirmedSet, setConfirmedSet] = useState<Set<number>>(new Set());
  const [loadingSet, setLoadingSet] = useState<Set<number>>(new Set());
  const debounceRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  async function search(fantasyId: number, q: string) {
    setSearchMap((m) => ({ ...m, [fantasyId]: q }));
    if (!q.trim()) { setResultsMap((m) => ({ ...m, [fantasyId]: [] })); return; }
    clearTimeout(debounceRef.current[fantasyId]);
    debounceRef.current[fantasyId] = setTimeout(async () => {
      const { data } = await supabase!.rpc("search_available_players", { p_query: q, p_limit: 10 });
      setResultsMap((m) => ({ ...m, [fantasyId]: (data as SearchPlayer[]) ?? [] }));
    }, 300);
  }

  async function confirm(row: UnresolvedRow) {
    const player = selectedMap[row.fantasy_id];
    if (!player) return;
    setLoadingSet((s) => new Set([...s, row.fantasy_id]));
    try {
      const { error } = await supabase!.rpc("save_price_alias", {
        p_alias: row.player_name,
        p_club: row.club ?? "",
        p_player_id: player.player_id,
      });
      if (!error) setConfirmedSet((s) => new Set([...s, row.fantasy_id]));
    } finally {
      setLoadingSet((s) => { const n = new Set(s); n.delete(row.fantasy_id); return n; });
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
        <div className="text-4xl mb-3">✓</div>
        <p className="text-sm">No unresolved players — clean paste.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        {rows.length} unresolved name{rows.length !== 1 ? "s" : ""} from last preview. Search and confirm — aliases persist and auto-resolve on future pastes.
      </p>
      {rows.map((row) => {
        const isConfirmed = confirmedSet.has(row.fantasy_id);
        const selected = selectedMap[row.fantasy_id] ?? null;
        const results = resultsMap[row.fantasy_id] ?? [];
        const q = searchMap[row.fantasy_id] ?? "";
        return (
          <div
            key={row.fantasy_id}
            className={`border rounded-lg p-4 space-y-3 ${isConfirmed ? "border-green-800 bg-green-950/20" : "border-zinc-800 bg-zinc-900/40"}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-zinc-100">{row.player_name}</span>
                <span className="ml-2 text-xs text-zinc-500">{row.club ?? `squadId:${row.squad_id}`}</span>
                <span className="ml-2 text-xs text-zinc-400">${row.price?.toLocaleString()}</span>
              </div>
              {isConfirmed && <span className="text-xs bg-green-800 text-green-200 px-2 py-0.5 rounded">Alias saved</span>}
            </div>
            {!isConfirmed && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={q}
                  onChange={(e) => search(row.fantasy_id, e.target.value)}
                  placeholder="Search player name…"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                />
                {results.length > 0 && !selected && (
                  <div className="border border-zinc-700 rounded-lg overflow-hidden">
                    {results.map((p) => (
                      <button
                        key={p.player_id}
                        onClick={() => setSelectedMap((m) => ({ ...m, [row.fantasy_id]: p }))}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-700 text-zinc-200 border-b border-zinc-800 last:border-0"
                      >
                        <span className="font-medium">{p.player_name}</span>
                        <span className="ml-2 text-zinc-400">{p.team} · {p.player_pos}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selected && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-3 py-1.5 text-xs text-zinc-200">
                      Matched: <span className="font-medium">{selected.player_name}</span> ({selected.team})
                      <button onClick={() => setSelectedMap((m) => ({ ...m, [row.fantasy_id]: null }))} className="ml-2 text-zinc-500 hover:text-zinc-300">✕</button>
                    </div>
                    <button
                      onClick={() => confirm(row)}
                      disabled={loadingSet.has(row.fantasy_id)}
                      className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs rounded transition-colors"
                    >
                      {loadingSet.has(row.fantasy_id) ? "Saving…" : "Confirm match"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Tab 3: Mismatches ─────────────────────────────────────────────────────────

function MismatchesTab() {
  const [rows, setRows] = useState<MismatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await supabase!
          .schema("afl" as never)
          .from("v_team_mismatch_audit")
          .select("player_name, team_count, teams, player_ids, record_count")
          .order("player_name");
        if (err) { setError(err.message); return; }
        setRows((data as MismatchRow[]) ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="py-20 text-center text-xs text-zinc-500">Loading…</div>;
  if (error) return <div className="py-10 text-center text-xs text-red-400">{error}</div>;
  if (rows.length === 0) return <div className="py-20 text-center text-xs text-zinc-500">No mismatches found.</div>;

  return (
    <div className="space-y-4">
      <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg px-4 py-3">
        <p className="text-xs text-amber-300">
          <span className="font-medium">Read-only reference.</span> These {rows.length} names match multiple players on different teams — the Resolve Queue will prompt you to pick the right one when they appear in a paste.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800">
              {["Name", "Teams", "Player IDs"].map((h) => (
                <th key={h} className="text-left py-2 px-3 text-zinc-500 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.player_name} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
                <td className="py-3 px-3 font-medium text-zinc-100">{row.player_name}</td>
                <td className="py-3 px-3">
                  <div className="flex flex-wrap gap-1">
                    {row.teams?.map((t, i) => (
                      <span key={i} className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded text-xs">{t}</span>
                    ))}
                  </div>
                </td>
                <td className="py-3 px-3 text-zinc-400 font-mono">
                  {row.player_ids?.join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab 4: Pipeline Health ────────────────────────────────────────────────────

function PipelineHealthTab() {
  const [health, setHealth] = useState<PipelineHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await supabase!.rpc("get_pipeline_health");
        if (err) { setError(err.message); return; }
        setHealth(data as PipelineHealth);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="py-20 text-center text-xs text-zinc-500">Loading…</div>;
  if (error) return <div className="py-10 text-center text-xs text-red-400">{error}</div>;
  if (!health) return null;

  const colors = health.jobs.map(jobColor);
  const greenCount = colors.filter((c) => c === "green").length;
  const amberCount = colors.filter((c) => c === "amber").length;
  const redCount = colors.filter((c) => c === "red").length;
  const total = health.jobs.length;

  const summaryColor = redCount > 0 ? "text-red-400" : amberCount > 0 ? "text-amber-400" : "text-green-400";

  return (
    <div className="space-y-5">
      {/* Header summary */}
      <div className="flex items-center gap-4 bg-zinc-900 rounded-lg px-4 py-3">
        <div className={`text-sm font-semibold ${summaryColor}`}>
          {greenCount === total ? `${total}/${total} green` : `${greenCount} green · ${amberCount} amber · ${redCount} red`}
        </div>
        <div className="text-xs text-zinc-500">
          {health.alerts.count > 0
            ? `${health.alerts.count} alerts — most recent: ${health.alerts.most_recent_type ?? "unknown"} (${relativeTime(health.alerts.most_recent)})`
            : "No alerts"}
        </div>
        <div className="ml-auto text-xs text-zinc-600">
          Checked {relativeTime(health.generated_at)}
        </div>
      </div>

      {/* Jobs table */}
      <div className="space-y-2">
        {health.jobs.map((job, i) => {
          const color = colors[i];
          return (
            <div
              key={job.jobname}
              className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-lg px-4 py-3"
            >
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colorDot[color]}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-zinc-200 font-mono truncate">{job.jobname}</span>
                  {!job.active && (
                    <span className="text-xs bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">inactive</span>
                  )}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {job.schedule} · last run {relativeTime(job.last_start)}
                </div>
              </div>
              <div className={`text-xs font-medium ${colorText[color]}`}>
                {job.last_status ?? "no run"}
              </div>
            </div>
          );
        })}
      </div>

      {health.alerts.count > 0 && (
        <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg px-4 py-3 text-xs text-amber-300">
          {health.alerts.count} pipeline alert{health.alerts.count !== 1 ? "s" : ""} in the log.
          Most recent type: <span className="font-medium">{health.alerts.most_recent_type ?? "unknown"}</span>{" "}
          — {relativeTime(health.alerts.most_recent)}.
        </div>
      )}
    </div>
  );
}

// ── Pipeline Health Banner ────────────────────────────────────────────────────

interface OperatorState {
  system: {
    overall_health: string;
    pipeline_status: string;
    partial_runs_24h: number;
    last_pipeline_run_at: string | null;
    last_successful_run_at: string | null;
  };
  pipeline: {
    health: string;
    status: string;
    last_run_at: string | null;
    last_success_at: string | null;
    last_finished_at: string | null;
    failed_steps_24h: number;
    partial_runs_24h: number;
    recent_runs_7d: number;
  };
  generated_at: string;
}

function melbourneTime(iso: string | null): string {
  if (!iso) return "never";
  try {
    return new Date(iso).toLocaleString("en-AU", {
      timeZone: "Australia/Melbourne",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function hoursAgo(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.abs(diff) / 3_600_000;
}

function PipelineBanner() {
  const [state, setState] = useState<OperatorState | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: err } = await supabase.rpc("get_operator_console_state");
        if (err) { if (!cancelled) setError(true); return; }
        if (!cancelled) setState(data as OperatorState);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="mb-6 rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-3 text-xs text-zinc-500">
        Couldn't load pipeline status.
      </div>
    );
  }

  if (!state) {
    return (
      <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-600">
        Loading pipeline status…
      </div>
    );
  }

  const lastSuccess = state.system.last_successful_run_at ?? state.pipeline.last_success_at;
  const hrs = hoursAgo(lastSuccess);
  const failedSteps = state.pipeline.failed_steps_24h ?? 0;
  const partialRuns = state.system.partial_runs_24h ?? state.pipeline.partial_runs_24h ?? 0;
  const status = state.system.pipeline_status ?? state.pipeline.status ?? "unknown";

  const isStale = !lastSuccess || (hrs !== null && hrs > 24);
  const isAmber = !isStale && (status === "partial" || partialRuns > 0 || failedSteps > 0);
  const isGreen = !isStale && !isAmber && status === "complete";

  const lastRunLabel = lastSuccess ? `${hrs !== null ? `${Math.floor(hrs)}h` : "?"} ago` : "never";
  const melbLabel = melbourneTime(lastSuccess);

  let bg = "bg-zinc-900/40 border-zinc-800";
  let text = "text-zinc-400";
  let dot = "bg-zinc-500";
  let message: string;

  if (isStale) {
    bg = "bg-red-950/40 border-red-800";
    text = "text-red-300";
    dot = "bg-red-500";
    const agoStr = lastSuccess ? `${Math.floor(hrs ?? 0)}h ago` : "never";
    message = `Pipeline STALE — last successful run ${agoStr} (${melbLabel} Melbourne). Scheduled run may not have fired.`;
  } else if (isAmber) {
    bg = "bg-amber-950/30 border-amber-800";
    text = "text-amber-300";
    dot = "bg-amber-400";
    const reasons: string[] = [];
    if (status === "partial") reasons.push("partial status");
    if (partialRuns > 0) reasons.push(`${partialRuns} partial run${partialRuns !== 1 ? "s" : ""} in 24h`);
    if (failedSteps > 0) reasons.push(`${failedSteps} failed step${failedSteps !== 1 ? "s" : ""} in 24h`);
    message = `Pipeline partial — last run ${lastRunLabel} · ${reasons.join(" · ")}. Check steps.`;
  } else if (isGreen) {
    bg = "bg-green-950/30 border-green-800";
    text = "text-green-300";
    dot = "bg-green-500";
    message = `Pipeline healthy · last run ${lastRunLabel} ago · ${melbLabel} Melbourne`;
  } else {
    message = `Pipeline status: ${status} · last run ${lastRunLabel}`;
  }

  return (
    <div className={`mb-6 rounded-lg border ${bg} px-4 py-3 flex items-center gap-3`}>
      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot} ${isStale ? "animate-pulse" : ""}`} />
      <p className={`text-xs ${text}`}>{message}</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = ["Paste", "Resolve Queue", "Mismatches", "Pipeline Health"] as const;
type Tab = typeof TABS[number];

export default function OpsConsole() {
  const { user, loading, isAdmin, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("Paste");
  const [unresolvedRows, setUnresolvedRows] = useState<UnresolvedRow[]>([]);

  if (!supabase) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-red-400 text-sm">
        Supabase client not initialised — check env vars.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginGate />;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-zinc-400">Not authorized.</p>
        <button
          onClick={signOut}
          className="text-xs text-zinc-500 hover:text-zinc-300 underline"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Ops Console</h1>
            <p className="text-xs text-zinc-500 mt-1">Internal price ingest + resolution — not indexed, not linked</p>
          </div>
          <button
            onClick={signOut}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Pipeline health banner */}
        <PipelineBanner />

        {/* Tab bar */}
        <div className="flex border-b border-zinc-800 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-zinc-400 text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab}
              {tab === "Resolve Queue" && unresolvedRows.length > 0 && (
                <span className="ml-1.5 bg-red-700 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {unresolvedRows.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {activeTab === "Paste" && <PasteTab onUnresolved={setUnresolvedRows} />}
          {activeTab === "Resolve Queue" && <ResolveQueueTab rows={unresolvedRows} />}
          {activeTab === "Mismatches" && <MismatchesTab />}
          {activeTab === "Pipeline Health" && <PipelineHealthTab />}
        </div>
      </div>
    </div>
  );
}
