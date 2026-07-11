import React, { useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

// ── Interim shared secret (client-side only gate — FLAG: replace with server-side verification)
const OPS_SECRET = "neeko-ops-2026";

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Tab 1: Paste ─────────────────────────────────────────────────────────────

function PasteTab({
  onUnresolved,
}: {
  onUnresolved: (rows: UnresolvedRow[]) => void;
}) {
  const [json, setJson] = useState("");
  const [secret, setSecret] = useState("");
  const [round, setRound] = useState<number>(18);
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const secretOk = secret.trim() === OPS_SECRET;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
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
      const { data, error: rpcErr } = await supabase!.rpc("resolve_fantasy_paste", {
        p_json: parsed,
      });
      if (rpcErr) {
        setError(`RPC error: ${rpcErr.message}`);
        return;
      }
      const res = data as ResolveResult;
      setResult(res);
      onUnresolved(res.unresolved ?? []);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleCommit() {
    if (!result || !secretOk) return;
    setCommitting(true);
    setError(null);

    let priceCount = 0;
    let statusCount = 0;
    const skipped: string[] = [];

    try {
      // Build price rows for commit_price_round
      const priceRows = result.resolved.map((r) => ({
        player_id: r.player_id,
        price: r.price,
      }));

      const { error: priceErr } = await supabase!.rpc("commit_price_round", {
        p_rows: priceRows,
        p_season: 2026,
        p_round: round,
      });

      if (priceErr) {
        setError(`commit_price_round failed: ${priceErr.message}`);
        return;
      }
      priceCount = priceRows.length;

      // Update status for non-AVAILABLE players
      for (const row of result.resolved) {
        if (row.status !== "AVAILABLE") {
          const { error: statusErr } = await supabase!.rpc("admin_update_player_status", {
            p_player_id: row.player_id,
            p_status: row.status === "OUT" ? "OUT" : row.status === "TEST" ? "TEST" : null,
          });
          if (statusErr) {
            skipped.push(row.player_name);
          } else {
            statusCount++;
          }
        }
      }

      showToast(
        `Updated ${priceCount} prices, marked ${statusCount} as OUT/TEST${skipped.length ? `, ${skipped.length} status errors` : ""}. ${result.unresolved?.length ?? 0} unresolved → check Resolve Queue.`
      );
      onUnresolved(result.unresolved ?? []);
    } finally {
      setCommitting(false);
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
          {/* Summary strip */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total", val: result.summary.total },
              { label: "Resolved", val: result.summary.resolved_count, color: "text-green-400" },
              { label: "Unresolved", val: result.summary.unresolved_count, color: result.summary.unresolved_count > 0 ? "text-red-400" : "text-zinc-400" },
              { label: "New Mappings", val: result.summary.new_mapping_count, color: "text-blue-400" },
            ].map((s) => (
              <div key={s.label} className="bg-zinc-900 rounded-lg p-3 text-center">
                <div className={`text-2xl font-bold ${s.color ?? "text-zinc-100"}`}>{s.val}</div>
                <div className="text-xs text-zinc-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Resolved table */}
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

          {/* Unresolved list */}
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

          {/* Commit section */}
          <div className="border-t border-zinc-800 pt-4 space-y-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Ops Secret (required to commit)
              </label>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Enter ops secret…"
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 w-64"
              />
              {/* ⚠️ INTERIM FLAG: secret is verified client-side against a hardcoded constant.
                  Replace with a server-side RPC param or edge function auth before production use. */}
              <p className="text-xs text-amber-600">
                ⚠ Interim: secret is checked client-side only. Upgrade to server-side verification before broader use.
              </p>
            </div>
            <button
              onClick={handleCommit}
              disabled={!secretOk || committing || result.resolved.length === 0}
              className="px-5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {committing ? "Committing…" : `Commit ${result.resolved.length} prices (Round ${round})`}
            </button>
          </div>
        </div>
      )}
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
    if (!q.trim()) {
      setResultsMap((m) => ({ ...m, [fantasyId]: [] }));
      return;
    }
    clearTimeout(debounceRef.current[fantasyId]);
    debounceRef.current[fantasyId] = setTimeout(async () => {
      const { data } = await supabase!.rpc("search_available_players", {
        p_query: q,
        p_limit: 10,
      });
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
      if (!error) {
        setConfirmedSet((s) => new Set([...s, row.fantasy_id]));
      }
    } finally {
      setLoadingSet((s) => {
        const n = new Set(s);
        n.delete(row.fantasy_id);
        return n;
      });
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
        {rows.length} unresolved name{rows.length !== 1 ? "s" : ""} from last preview. Search for the correct player and confirm the alias — it will resolve automatically on future pastes.
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
              {isConfirmed && (
                <span className="text-xs bg-green-800 text-green-200 px-2 py-0.5 rounded">Alias saved</span>
              )}
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
                      <button
                        onClick={() => setSelectedMap((m) => ({ ...m, [row.fantasy_id]: null }))}
                        className="ml-2 text-zinc-500 hover:text-zinc-300"
                      >
                        ✕
                      </button>
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

// ── Placeholder Tab ───────────────────────────────────────────────────────────

function PlaceholderTab({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
      <div className="text-3xl mb-3">🛠</div>
      <p className="text-sm font-medium text-zinc-500">{title}</p>
      <p className="text-xs mt-1">Coming in next update</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = ["Paste", "Resolve Queue", "Mismatches", "Pipeline Health"] as const;
type Tab = typeof TABS[number];

export default function OpsConsole() {
  const [activeTab, setActiveTab] = useState<Tab>("Paste");
  const [unresolvedRows, setUnresolvedRows] = useState<UnresolvedRow[]>([]);

  if (!supabase) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-red-400 text-sm">
        Supabase client not initialised — check env vars.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-zinc-100">Ops Console</h1>
          <p className="text-xs text-zinc-500 mt-1">Internal price ingest + resolution — not indexed, not linked</p>
        </div>

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
          {activeTab === "Paste" && (
            <PasteTab
              onUnresolved={(rows) => {
                setUnresolvedRows(rows);
              }}
            />
          )}
          {activeTab === "Resolve Queue" && <ResolveQueueTab rows={unresolvedRows} />}
          {activeTab === "Mismatches" && <PlaceholderTab title="Mismatches" />}
          {activeTab === "Pipeline Health" && <PlaceholderTab title="Pipeline Health" />}
        </div>
      </div>
    </div>
  );
}
