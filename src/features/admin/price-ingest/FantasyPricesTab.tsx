import { useState, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, RefreshCw, CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, ArrowLeft, Zap, Clock, Search, Eye, EyeOff, Copy, Sparkles, Braces, Lock, ChevronRight, CircleCheck, History, TriangleAlert, Info, TrendingUp } from "lucide-react";
import {
  parseCSVText, parseCSVFile, parseRawFantasyText,
  parseJsonPlayersText, isJsonInput, fmtPrice, type ParseError,
} from "./parseUtils";
import {
  usePlayerOptions, useCommitPrices, useSavePending,
  usePriceRounds, useSaveMapping, usePersistedMappings,
  useIngestSessions,
} from "./usePriceIngest";
import { RoundSelector } from "./RoundSelector";
import { PlayerSearchDropdown } from "./PlayerSearchDropdown";
import {
  applyAutoMatch, computeIngestCounts, sortAndGroupRows,
} from "./matchEngine";
import type { ParsedPriceRow, MappingRow, MatchStatus, CommitResult, ValidationResult } from "./types";

type Screen =
  | "round"
  | "paste"
  | "summary"
  | "review"
  | "commit_confirm"
  | "done";

type InputMode = "raw" | "json" | "paste" | "csv";
type ReviewTab = "problems" | "suggested" | "auto" | "all";

const CURRENT_SEASON = 2026;

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function buildMappingRows(
  parsed: ParsedPriceRow[],
): MappingRow[] {
  return parsed.map(r => ({
    id: genId(),
    source_name: r.source_name,
    cleaned_price: r.cleaned_price,
    position: r.position ?? null,
    team: r.team ?? null,
    player_id: null,
    player_name: null,
    manual_input_name: null,
    match_status: "manual_required" as const,
    match_method: null,
    confidence: 0,
    suggestions: [],
    external_id: r.external_id ?? null,
    avg_points: r.avg_points ?? null,
    last_round_score: r.last_round_score ?? null,
    ownership_pct: r.ownership_pct ?? null,
    price_change: r.price_change ?? null,
    price_change_pct: r.price_change_pct ?? null,
    player_status: r.status ?? null,
    positions: r.positions ?? null,
  }));
}

export function FantasyPricesTab() {
  const [screen, setScreen] = useState<Screen>("round");
  const [selectedRound, setSelectedRound] = useState(0);
  const [pasteText, setPasteText] = useState("");
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [inputMode, setInputMode] = useState<InputMode>("raw");
  const [mappingRows, setMappingRows] = useState<MappingRow[]>([]);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const players = usePlayerOptions();
  const { committing, validating, validateRows, commitPrices } = useCommitPrices();
  const { saving, savePending } = useSavePending();
  const { saveMapping } = useSaveMapping();
  const { rounds, loading: roundsLoading, fetchRounds, toggleLock } = usePriceRounds(CURRENT_SEASON);
  const persistedMappings = usePersistedMappings(mappingRows);
  const { sessions, loading: sessionsLoading, fetchSessions } = useIngestSessions();

  const roundMeta = rounds.find(r => r.round === selectedRound && r.season === CURRENT_SEASON);
  const isRoundLocked = roundMeta?.is_locked ?? false;
  const existingPlayerCount = roundMeta?.player_count ?? 0;

  function parseWithMode(text: string, mode: InputMode) {
    if (mode === "json") return parseJsonPlayersText(text);
    if (mode === "raw") return parseRawFantasyText(text);
    return parseCSVText(text);
  }

  function detectMode(text: string, currentMode: InputMode): InputMode {
    if (isJsonInput(text)) return "json";
    return currentMode === "json" ? "raw" : currentMode;
  }

  function rebuildRows(parsed: ParsedPriceRow[]): MappingRow[] {
    const raw = buildMappingRows(parsed);
    if (players.length > 0) {
      return sortAndGroupRows(applyAutoMatch(raw, players, persistedMappings.size > 0 ? persistedMappings : undefined));
    }
    return sortAndGroupRows(raw);
  }

  function handlePasteChange(text: string) {
    setPasteText(text);
    const resolvedMode = detectMode(text, inputMode);
    if (resolvedMode !== inputMode) setInputMode(resolvedMode);
    const result = parseWithMode(text, resolvedMode);
    setParseErrors(result.errors);
    setMappingRows(rebuildRows(result.rows));
  }

  function handleModeChange(mode: InputMode) {
    setInputMode(mode);
    if (pasteText) {
      const result = parseWithMode(pasteText, mode);
      setParseErrors(result.errors);
      setMappingRows(rebuildRows(result.rows));
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await parseCSVFile(file);
    setParseErrors(result.errors);
    setMappingRows(rebuildRows(result.rows));
  }

  const handlePlayerSelect = useCallback((rowId: string, playerId: number | null, playerName: string | null, isManualInput?: boolean) => {
    setMappingRows(prev => {
      const updated = prev.map(r => {
        if (r.id !== rowId) return r;
        if (isManualInput) {
          return {
            ...r,
            player_id: null,
            player_name: null,
            manual_input_name: playerName,
            match_status: "manual_input" as const,
            match_method: "manual_input" as const,
          };
        }
        return {
          ...r,
          player_id: playerId,
          player_name: playerName,
          manual_input_name: null,
          match_status: playerId !== null ? ("manually_matched" as const) : r.match_status,
          match_method: playerId !== null ? ("manual" as const) : r.match_method,
        };
      });

      if (!isManualInput && playerId !== null && playerName !== null) {
        const row = prev.find(r => r.id === rowId);
        if (row) {
          saveMapping(row.source_name, playerId, "manual");
        }
      }

      return updated;
    });
  }, [saveMapping]);

  function handleBulkAcceptSuggested() {
    setMappingRows(prev => prev.map(r => {
      if (r.match_status === "suggested" && r.suggestions.length === 1) {
        const p = r.suggestions[0];
        saveMapping(r.source_name, p.player_id, "manual");
        return {
          ...r,
          player_id: p.player_id,
          player_name: p.player_name,
          match_status: "manually_matched" as const,
          match_method: "manual" as const,
        };
      }
      return r;
    }));
  }

  async function handleGoToReview() {
    if (players.length > 0 && persistedMappings.size > 0) {
      setMappingRows(prev =>
        sortAndGroupRows(applyAutoMatch(
          prev.map(r => ({
            ...r,
            player_id: null,
            player_name: null,
            manual_input_name: r.manual_input_name,
            match_status: r.match_status === "manual_input" ? ("manual_input" as const) : ("manual_required" as const),
            confidence: 0,
            suggestions: [],
          })),
          players,
          persistedMappings,
        ))
      );
    }
    setScreen("summary");
  }

  async function handleValidateAndConfirm() {
    setValidationResult(null);
    setValidationError(null);
    const matched = mappingRows.filter(r => r.player_id !== null);
    const { result, error } = await validateRows(matched, CURRENT_SEASON, selectedRound);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationResult(result);
    setScreen("commit_confirm");
  }

  async function handleCommit() {
    setCommitError(null);
    const { result, error } = await commitPrices(
      mappingRows,
      CURRENT_SEASON,
      selectedRound,
    );
    if (result) {
      setCommitResult(result);
      setScreen("done");
      fetchRounds();
      fetchSessions();
      window.dispatchEvent(new CustomEvent("neeko:prices-applied"));
    } else {
      setCommitError(error ?? "Commit failed — check admin logs");
    }
  }

  async function handleSavePending() {
    const pending = mappingRows.filter(
      r => r.match_status === "pending_player_record" || r.match_status === "manual_input"
    );
    await savePending(pending);
  }

  function handleReset() {
    setScreen("round");
    setPasteText("");
    setMappingRows([]);
    setParseErrors([]);
    setCommitResult(null);
    setCommitError(null);
    setValidationResult(null);
    setValidationError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const counts = useMemo(() => computeIngestCounts(mappingRows), [mappingRows]);

  const roundLabel = selectedRound === 0 ? "Opening Round" : `Round ${selectedRound}`;

  if (screen === "done" && commitResult) {
    return (
      <DoneScreen
        commitResult={commitResult}
        roundLabel={roundLabel}
        counts={counts}
        onReset={handleReset}
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        onFetchSessions={fetchSessions}
      />
    );
  }

  if (screen === "commit_confirm") {
    return (
      <CommitConfirmScreen
        validationResult={validationResult}
        validationError={validationError}
        counts={counts}
        roundLabel={roundLabel}
        isRoundLocked={isRoundLocked}
        existingPlayerCount={existingPlayerCount}
        committing={committing}
        commitError={commitError}
        onConfirm={handleCommit}
        onBack={() => setScreen("review")}
      />
    );
  }

  if (screen === "review") {
    return (
      <ReviewScreen
        rows={mappingRows}
        players={players}
        counts={counts}
        saving={saving}
        roundLabel={roundLabel}
        isRoundLocked={isRoundLocked}
        onSelect={handlePlayerSelect}
        onBulkAcceptSuggested={handleBulkAcceptSuggested}
        onSavePending={handleSavePending}
        onValidateAndConfirm={handleValidateAndConfirm}
        validating={validating}
        onBack={() => setScreen("summary")}
      />
    );
  }

  if (screen === "summary") {
    return (
      <SummaryScreen
        counts={counts}
        roundLabel={roundLabel}
        rows={mappingRows}
        isRoundLocked={isRoundLocked}
        onReview={() => setScreen("review")}
        onBack={() => setScreen("paste")}
      />
    );
  }

  if (screen === "paste") {
    return (
      <PasteScreen
        pasteText={pasteText}
        inputMode={inputMode}
        mappingRows={mappingRows}
        parseErrors={parseErrors}
        counts={counts}
        fileRef={fileRef}
        onPasteChange={handlePasteChange}
        onModeChange={handleModeChange}
        onFileChange={handleFileChange}
        onNext={handleGoToReview}
        onBack={() => setScreen("round")}
      />
    );
  }

  return (
    <RoundScreen
      selectedRound={selectedRound}
      rounds={rounds}
      roundsLoading={roundsLoading}
      sessions={sessions}
      sessionsLoading={sessionsLoading}
      onRoundChange={r => { setSelectedRound(r); }}
      onToggleLock={toggleLock}
      onRefresh={fetchRounds}
      onFetchSessions={fetchSessions}
      onNext={() => setScreen("paste")}
    />
  );
}

// ============================================================
// Screen 1: Round Control
// ============================================================
function RoundScreen({
  selectedRound, rounds, roundsLoading, sessions, sessionsLoading,
  onRoundChange, onToggleLock, onRefresh, onFetchSessions, onNext,
}: {
  selectedRound: number;
  rounds: ReturnType<typeof usePriceRounds>["rounds"];
  roundsLoading: boolean;
  sessions: ReturnType<typeof useIngestSessions>["sessions"];
  sessionsLoading: boolean;
  onRoundChange: (r: number) => void;
  onToggleLock: (round: number, locked: boolean) => Promise<string | null>;
  onRefresh: () => void;
  onFetchSessions: () => void;
  onNext: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold mb-1">Step 1 — Select Round</h3>
        <p className="text-xs text-muted-foreground">Choose the round you are importing prices for. Locked rounds cannot be overwritten.</p>
      </div>

      <RoundSelector
        selectedRound={selectedRound}
        season={CURRENT_SEASON}
        rounds={rounds}
        loading={roundsLoading}
        onRoundChange={onRoundChange}
        onToggleLock={async (round, locked) => { await onToggleLock(round, locked); }}
        onRefresh={onRefresh}
      />

      <div className="flex items-center gap-3">
        <Button onClick={onNext}>
          Continue to Paste
          <ChevronRight className="h-4 w-4 ml-1.5" />
        </Button>
        <button
          onClick={() => {
            setShowHistory(v => !v);
            if (!showHistory) onFetchSessions();
          }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <History className="h-3.5 w-3.5" />
          {showHistory ? "Hide history" : "Recent ingest history"}
        </button>
      </div>

      {showHistory && (
        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-2.5 border-b border-border/60">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Recent Ingest Sessions</span>
          </div>
          {sessionsLoading ? (
            <div className="px-4 py-4 text-xs text-muted-foreground">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="px-4 py-4 text-xs text-muted-foreground">No sessions yet.</div>
          ) : (
            <div className="divide-y divide-border/40">
              {sessions.map(s => (
                <div key={s.id} className="px-4 py-2.5 flex items-center gap-3 flex-wrap text-xs">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    s.status === "committed"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : s.status === "failed"
                      ? "bg-red-500/15 text-red-400"
                      : "bg-slate-500/15 text-slate-400"
                  }`}>
                    {s.status.toUpperCase()}
                  </span>
                  <span className="font-medium">{s.label}</span>
                  <span className="text-muted-foreground">{s.rows_total} rows · {s.rows_matched} matched</span>
                  {s.rows_committed != null && (
                    <span className="text-emerald-400">{s.rows_committed} committed</span>
                  )}
                  <span className="text-muted-foreground ml-auto">
                    {new Date(s.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Screen 2: Paste + Parse
// ============================================================
function PasteScreen({
  pasteText, inputMode, mappingRows, parseErrors, counts, fileRef,
  onPasteChange, onModeChange, onFileChange, onNext, onBack,
}: {
  pasteText: string;
  inputMode: InputMode;
  mappingRows: MappingRow[];
  parseErrors: ParseError[];
  counts: ReturnType<typeof computeIngestCounts>;
  fileRef: React.RefObject<HTMLInputElement>;
  onPasteChange: (t: string) => void;
  onModeChange: (m: InputMode) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [copiedCsv, setCopiedCsv] = useState(false);

  function handleCopyCleanCsv() {
    const header = "player_name,team,position,price";
    const lines = mappingRows
      .filter(r => r.cleaned_price > 0)
      .map(r => {
        const name = (r.player_name ?? r.source_name).replace(/,/g, "");
        const team = (r.team ?? "").replace(/,/g, "");
        const pos = r.position ?? "";
        return `${name},${team},${pos},${r.cleaned_price}`;
      });
    navigator.clipboard.writeText([header, ...lines].join("\n")).then(() => {
      setCopiedCsv(true);
      setTimeout(() => setCopiedCsv(false), 2000);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h3 className="text-sm font-semibold">Step 2 — Paste Player Data</h3>
          <p className="text-xs text-muted-foreground">Paste from AFL Fantasy, upload CSV, or use JSON format.</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <ModeButton active={inputMode === "raw"} onClick={() => onModeChange("raw")} icon={<Sparkles className="h-3.5 w-3.5" />}>
          Raw site paste
        </ModeButton>
        <ModeButton active={inputMode === "json"} onClick={() => onModeChange("json")} icon={<Braces className="h-3.5 w-3.5" />}>
          JSON
        </ModeButton>
        <ModeButton active={inputMode === "paste"} onClick={() => onModeChange("paste")} icon={<FileText className="h-3.5 w-3.5" />}>
          CSV paste
        </ModeButton>
        <ModeButton active={inputMode === "csv"} onClick={() => onModeChange("csv")} icon={<Upload className="h-3.5 w-3.5" />}>
          Upload CSV
        </ModeButton>
      </div>

      {inputMode === "raw" && (
        <div className="rounded-lg border border-sky-500/20 bg-sky-950/10 px-4 py-3 text-xs text-sky-300">
          <strong>Raw paste mode.</strong> Supports both AFL Fantasy paste formats — stacked block (one field per line) or tabular (all fields per row).
          <span className="block text-sky-400/70 mt-1">Tip: Select All on the AFL Fantasy trade page and paste here.</span>
        </div>
      )}

      {inputMode !== "csv" ? (
        <textarea
          value={pasteText}
          onChange={e => onPasteChange(e.target.value)}
          placeholder={
            inputMode === "json"
              ? '[{"id": 123, "firstName": "Nick", "lastName": "Daicos", "price": 1182000, ...}]'
              : inputMode === "raw"
              ? "Paste AFL Fantasy data here — stacked or tabular format both work"
              : "N Daicos, $1,182,000\nL D-Uniacke, $785,000"
          }
          rows={16}
          className="w-full border border-border rounded-md px-3 py-2.5 text-sm font-mono bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
        />
      ) : (
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-border rounded-xl px-6 py-12 text-center cursor-pointer hover:border-foreground/30 transition-colors"
        >
          <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">Click to select CSV file</p>
          <p className="text-xs text-muted-foreground mt-1">First column: player name · Second column: price</p>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onFileChange} />
        </div>
      )}

      {mappingRows.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <StatTile label="Total" value={counts.total} />
          <StatTile label="Auto-matched" value={counts.auto} color="emerald" />
          <StatTile label="Suggested" value={counts.suggested} color="amber" />
          <StatTile label="Needs Search" value={counts.manualRequired} color="orange" />
          <StatTile label="Not in DB" value={counts.pendingRecord} color="red" />
          <StatTile label="Ready" value={counts.readyToCommit} color="emerald" />
        </div>
      )}

      {mappingRows.length === 0 && inputMode !== "csv" && pasteText.trim() && (
        <div className="rounded-lg border border-red-500/20 bg-red-950/10 px-4 py-3 text-sm text-red-400">
          No player rows detected. Check the format and try again.
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2.5 space-y-1">
          <p className="text-xs font-semibold text-amber-400">Parse warnings ({parseErrors.length})</p>
          {parseErrors.slice(0, 5).map((e, i) => (
            <p key={i} className="text-xs text-muted-foreground font-mono">
              Row {e.line}: {e.reason} — <span className="text-amber-400/70">{e.raw.slice(0, 60)}</span>
            </p>
          ))}
          {parseErrors.length > 5 && <p className="text-xs text-muted-foreground">…and {parseErrors.length - 5} more</p>}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={onNext} disabled={mappingRows.length === 0}>
          <Zap className="h-4 w-4 mr-2" />
          Review Matches ({mappingRows.length})
          <ChevronRight className="h-4 w-4 ml-1.5" />
        </Button>
        {mappingRows.length > 0 && (
          <button
            onClick={handleCopyCleanCsv}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Copy className="h-3.5 w-3.5" />
            {copiedCsv ? "Copied!" : "Copy Clean CSV"}
          </button>
        )}
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Screen 3: Match Summary Cards
// ============================================================
function SummaryScreen({
  counts, roundLabel, rows, isRoundLocked, onReview, onBack,
}: {
  counts: ReturnType<typeof computeIngestCounts>;
  roundLabel: string;
  rows: MappingRow[];
  isRoundLocked: boolean;
  onReview: () => void;
  onBack: () => void;
}) {
  const statusChanges = rows.filter(r => r.player_status && r.player_status !== "AVAILABLE");
  const matchPct = counts.total > 0 ? Math.round((counts.readyToCommit / counts.total) * 100) : 0;
  const problemCount = counts.manualRequired + counts.pendingRecord + counts.suggested;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h3 className="text-sm font-semibold">Step 3 — Match Summary</h3>
          <p className="text-xs text-muted-foreground">{roundLabel} · {counts.total} players parsed</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Auto-matched"
          value={counts.auto}
          total={counts.total}
          color="emerald"
          icon={<Zap className="h-4 w-4" />}
          note="Matched via name memory or exact lookup"
        />
        <SummaryCard
          label="Manually matched"
          value={counts.manual}
          total={counts.total}
          color="sky"
          icon={<CircleCheck className="h-4 w-4" />}
          note="You selected these players"
        />
        <SummaryCard
          label="Need review"
          value={problemCount}
          total={counts.total}
          color={problemCount > 0 ? "amber" : "emerald"}
          icon={<AlertTriangle className="h-4 w-4" />}
          note={problemCount > 0 ? "Suggested, unmatched, or new players" : "Nothing to review"}
        />
        <SummaryCard
          label="Ready to commit"
          value={counts.readyToCommit}
          total={counts.total}
          color={matchPct >= 90 ? "emerald" : matchPct >= 70 ? "amber" : "orange"}
          icon={<TrendingUp className="h-4 w-4" />}
          note={`${matchPct}% match rate`}
        />
      </div>

      {statusChanges.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-amber-300">{statusChanges.length} status change{statusChanges.length !== 1 ? "s" : ""} detected</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {statusChanges.slice(0, 8).map(r => (
                <span key={r.id} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {r.source_name} — {r.player_status}
                </span>
              ))}
              {statusChanges.length > 8 && (
                <span className="text-[10px] text-amber-400/70">+{statusChanges.length - 8} more</span>
              )}
            </div>
          </div>
        </div>
      )}

      {isRoundLocked && (
        <div className="rounded-lg border border-red-500/25 bg-red-950/15 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
          <Lock className="h-4 w-4 shrink-0" />
          This round is locked. Go back and unlock it before continuing.
        </div>
      )}

      {counts.readyToCommit === 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-3 text-sm text-amber-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No players are ready to commit yet. Go to Review to resolve matches.
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={onReview}>
          {problemCount > 0 ? (
            <>Review {problemCount} Problem{problemCount !== 1 ? "s" : ""}</>
          ) : (
            <>Review All Matches</>
          )}
          <ChevronRight className="h-4 w-4 ml-1.5" />
        </Button>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Screen 4: Review Queue
// ============================================================
function ReviewScreen({
  rows, players, counts, saving, roundLabel, isRoundLocked,
  onSelect, onBulkAcceptSuggested, onSavePending, onValidateAndConfirm, validating, onBack,
}: {
  rows: MappingRow[];
  players: ReturnType<typeof usePlayerOptions>;
  counts: ReturnType<typeof computeIngestCounts>;
  saving: boolean;
  roundLabel: string;
  isRoundLocked: boolean;
  onSelect: (rowId: string, playerId: number | null, playerName: string | null, isManualInput?: boolean) => void;
  onBulkAcceptSuggested: () => void;
  onSavePending: () => void;
  onValidateAndConfirm: () => void;
  validating: boolean;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<ReviewTab>("problems");
  const [search, setSearch] = useState("");

  const singleSuggested = rows.filter(r => r.match_status === "suggested" && r.suggestions.length === 1).length;

  const visibleRows = useMemo(() => {
    let filtered = rows;

    if (activeTab === "problems") {
      filtered = filtered.filter(r =>
        r.match_status === "manual_required" ||
        r.match_status === "pending_player_record" ||
        r.match_status === "manual_input" ||
        (r.match_status === "suggested" && r.player_id === null)
      );
    } else if (activeTab === "suggested") {
      filtered = filtered.filter(r => r.match_status === "suggested");
    } else if (activeTab === "auto") {
      filtered = filtered.filter(r => r.match_status === "auto_matched" || r.match_status === "manually_matched");
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(r =>
        r.source_name.toLowerCase().includes(q) ||
        (r.player_name ?? "").toLowerCase().includes(q) ||
        (r.team ?? "").toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [rows, activeTab, search]);

  const showPositionCol = counts.hasPositions > 0;
  const showTeamCol = counts.hasTeams > 0;
  const showStatusCol = rows.some(r => r.player_status != null);
  const problemCount = counts.manualRequired + counts.pendingRecord + (counts.suggested);

  const tabs: { key: ReviewTab; label: string; count: number }[] = [
    { key: "problems", label: "Problems", count: problemCount },
    { key: "suggested", label: "Suggested", count: counts.suggested },
    { key: "auto", label: "Auto-matched", count: counts.auto + counts.manual },
    { key: "all", label: "All", count: counts.total },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h3 className="text-sm font-semibold">Step 4 — Review Matches</h3>
          <p className="text-xs text-muted-foreground">{roundLabel} · {counts.readyToCommit} ready · {problemCount} need attention</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <StatTile label="Total" value={counts.total} />
        <StatTile label="Auto" value={counts.auto} color="emerald" />
        <StatTile label="Manual" value={counts.manual} color="sky" />
        <StatTile label="Suggested" value={counts.suggested} color="amber" />
        <StatTile label="Unresolved" value={counts.manualRequired + counts.pendingRecord} color="orange" />
        <StatTile label="Ready" value={counts.readyToCommit} color="emerald" />
      </div>

      {singleSuggested > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-amber-300">
            <Zap className="h-4 w-4 shrink-0" />
            <span>{singleSuggested} player{singleSuggested !== 1 ? "s" : ""} have a single clear suggestion. Accept all at once?</span>
          </div>
          <Button size="sm" variant="outline" onClick={onBulkAcceptSuggested}
            className="h-7 text-xs border-amber-500/30 text-amber-300 hover:bg-amber-950/20 shrink-0">
            Accept {singleSuggested} suggestion{singleSuggested !== 1 ? "s" : ""}
          </Button>
        </div>
      )}

      {(counts.pendingRecord > 0 || counts.manualInput > 0) && (
        <div className="rounded-lg border border-red-500/20 bg-red-950/10 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-red-300">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>{counts.pendingRecord + counts.manualInput} player{counts.pendingRecord + counts.manualInput !== 1 ? "s" : ""} not in database — save for later resolution.</span>
          </div>
          <Button size="sm" variant="outline" onClick={onSavePending} disabled={saving}
            className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-950/20 shrink-0">
            {saving ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Clock className="h-3 w-3 mr-1" />}
            Save Pending
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
              activeTab === t.key
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            }`}
          >
            {t.label}
            <span className={`text-[10px] px-1 rounded ${activeTab === t.key ? "bg-background/20" : "bg-muted/40"}`}>
              {t.count}
            </span>
          </button>
        ))}

        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-7 pr-3 py-1.5 border border-border rounded-md text-xs bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-40"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/20">
              <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-28">Match</th>
              {showStatusCol && <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-16">Status</th>}
              <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Input Name</th>
              {showPositionCol && <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-14">Pos</th>}
              {showTeamCol && <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-24">Team</th>}
              <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Matched Player</th>
              <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-24">Price</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={4 + (showPositionCol ? 1 : 0) + (showTeamCol ? 1 : 0) + (showStatusCol ? 1 : 0)}
                  className="py-8 text-center text-xs text-muted-foreground">
                  {activeTab === "problems" ? "No problems — all players matched." : "No rows match your filter."}
                </td>
              </tr>
            ) : (
              visibleRows.map(row => (
                <MappingTableRow
                  key={row.id}
                  row={row}
                  players={players}
                  onSelect={onSelect}
                  showPositionCol={showPositionCol}
                  showTeamCol={showTeamCol}
                  showStatusCol={showStatusCol}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {visibleRows.length} of {rows.length} rows
      </p>

      {isRoundLocked && (
        <div className="rounded-lg border border-red-500/25 bg-red-950/15 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
          <Lock className="h-4 w-4 shrink-0" />
          This round is locked. Go back to Round Control and unlock it first.
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          onClick={onValidateAndConfirm}
          disabled={counts.readyToCommit === 0 || isRoundLocked || validating}
        >
          {validating
            ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            : <CheckCircle2 className="h-4 w-4 mr-2" />}
          {validating ? "Validating…" : `Review Commit (${counts.readyToCommit} players)`}
          <ChevronRight className="h-4 w-4 ml-1.5" />
        </Button>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        {counts.readyToCommit === 0 && (
          <span className="text-xs text-muted-foreground">Map at least one player to continue.</span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Screen 5: Commit Confirm
// ============================================================
function CommitConfirmScreen({
  validationResult, validationError, counts, roundLabel,
  isRoundLocked, existingPlayerCount, committing, commitError, onConfirm, onBack,
}: {
  validationResult: ValidationResult | null;
  validationError: string | null;
  counts: ReturnType<typeof computeIngestCounts>;
  roundLabel: string;
  isRoundLocked: boolean;
  existingPlayerCount: number;
  committing: boolean;
  commitError: string | null;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const hasErrors = (validationResult?.errors?.length ?? 0) > 0;
  const hasWarnings = (validationResult?.warnings?.length ?? 0) > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h3 className="text-sm font-semibold">Step 5 — Confirm Commit</h3>
          <p className="text-xs text-muted-foreground">{roundLabel}</p>
        </div>
      </div>

      {validationError && (
        <div className="rounded-lg border border-red-500/25 bg-red-950/15 px-4 py-3 text-sm text-red-400">
          {validationError}
        </div>
      )}

      {validationResult && (
        <>
          <div className="rounded-lg border border-border bg-card px-4 py-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Commit Summary</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Prices to write" value={validationResult.valid_count} color="emerald" />
              <StatTile label="Skipped (unmatched)" value={validationResult.total - validationResult.valid_count} color={validationResult.total - validationResult.valid_count > 0 ? "amber" : undefined} />
              {existingPlayerCount > 0 && (
                <StatTile label="Will overwrite" value={existingPlayerCount} color="amber" />
              )}
            </div>
          </div>

          {hasErrors && (
            <div className="rounded-lg border border-red-500/25 bg-red-950/15 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                <TriangleAlert className="h-3.5 w-3.5" />
                {validationResult.errors.length} issue{validationResult.errors.length !== 1 ? "s" : ""} found — fix before committing
              </p>
              {validationResult.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-300/80">{e}</p>
              ))}
            </div>
          )}

          {hasWarnings && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-amber-400">
                {validationResult.warnings.length} warning{validationResult.warnings.length !== 1 ? "s" : ""}
              </p>
              {validationResult.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-300/70">{w}</p>
              ))}
            </div>
          )}
        </>
      )}

      {existingPlayerCount > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/10 px-4 py-3 text-sm text-amber-300 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {existingPlayerCount} existing prices for {roundLabel} will be overwritten. Previous values are preserved in price history.
          </span>
        </div>
      )}

      {isRoundLocked && (
        <div className="rounded-lg border border-red-500/25 bg-red-950/15 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
          <Lock className="h-4 w-4 shrink-0" />
          Round is locked. Go back to Round Control to unlock it.
        </div>
      )}

      {commitError && (
        <div className="rounded-lg border border-red-500/25 bg-red-950/15 px-4 py-3 text-sm text-red-400">
          {commitError}
        </div>
      )}

      <div className="rounded-lg border border-sky-500/20 bg-sky-950/10 px-4 py-3 text-xs text-sky-300 flex items-start gap-2">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>Prices will be committed instantly. Rankings, projections, market watch, and edge board will refresh in the background — usually within 30 seconds.</span>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={onConfirm}
          disabled={isRoundLocked || committing || hasErrors}
          className={hasErrors ? "opacity-50 cursor-not-allowed" : ""}
        >
          {committing
            ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            : <CircleCheck className="h-4 w-4 mr-2" />}
          {committing ? "Committing prices…" : `Commit ${validationResult?.valid_count ?? counts.readyToCommit} Prices`}
        </Button>
        <Button variant="outline" onClick={onBack} disabled={committing}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Screen 6: Done
// ============================================================
function DoneScreen({
  commitResult, roundLabel, counts, onReset, sessions, sessionsLoading, onFetchSessions,
}: {
  commitResult: CommitResult;
  roundLabel: string;
  counts: ReturnType<typeof computeIngestCounts>;
  onReset: () => void;
  sessions: ReturnType<typeof useIngestSessions>["sessions"];
  sessionsLoading: boolean;
  onFetchSessions: () => void;
}) {
  const isAsync = commitResult.pipeline === "running_in_background";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-6 py-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
        <h3 className="text-base font-semibold">Prices committed successfully</h3>
        <p className="text-sm text-muted-foreground mt-1.5">
          {roundLabel} · {commitResult.inserted} prices written
          {commitResult.skipped != null && commitResult.skipped > 0 && (
            <> · {commitResult.skipped} skipped (duplicates or unmatched)</>
          )}
        </p>
      </div>

      {isAsync && (
        <div className="rounded-lg border border-sky-500/20 bg-sky-950/10 px-4 py-3 flex items-center gap-2.5 text-sm text-sky-300">
          <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
          <span>
            Downstream refresh running in background — rankings, projections, market watch, and edge board updating now.
          </span>
        </div>
      )}

      {counts.pendingRecord > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-3 text-sm text-amber-300 flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0" />
          {counts.pendingRecord} players were not in the database and were skipped. Use the Name Resolver tab to map them once their player records exist.
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" onClick={onReset}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Import More Prices
        </Button>
        <button
          onClick={onFetchSessions}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <History className="h-3.5 w-3.5" />
          View history
        </button>
      </div>

      {sessions.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-2.5 border-b border-border/60">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Recent Sessions</span>
          </div>
          <div className="divide-y divide-border/40">
            {sessions.slice(0, 5).map(s => (
              <div key={s.id} className="px-4 py-2.5 flex items-center gap-3 text-xs flex-wrap">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  s.status === "committed" ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-500/15 text-slate-400"
                }`}>
                  {s.status.toUpperCase()}
                </span>
                <span className="font-medium">{s.label}</span>
                <span className="text-muted-foreground ml-auto">
                  {new Date(s.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Row component
// ============================================================
function MappingTableRow({
  row, players, onSelect, showPositionCol, showTeamCol, showStatusCol,
}: {
  row: MappingRow;
  players: ReturnType<typeof usePlayerOptions>;
  onSelect: (rowId: string, playerId: number | null, playerName: string | null, isManualInput?: boolean) => void;
  showPositionCol: boolean;
  showTeamCol: boolean;
  showStatusCol: boolean;
}) {
  const isHardPending = row.match_status === "pending_player_record";

  const dropdownPlayers = useMemo(() => {
    if (row.suggestions.length > 0 && row.player_id === null) {
      const suggestionIds = new Set(row.suggestions.map(s => s.player_id));
      return [...row.suggestions, ...players.filter(p => !suggestionIds.has(p.player_id))];
    }
    return players;
  }, [row.suggestions, row.player_id, players]);

  return (
    <tr className={`border-b border-border/20 last:border-0 transition-colors ${rowBgClass(row)}`}>
      <td className="py-2 px-3">
        <MatchBadge status={row.match_status} confidence={row.confidence} method={row.match_method} />
      </td>
      {showStatusCol && (
        <td className="py-2 px-3">
          <PlayerStatusBadge status={row.player_status} />
        </td>
      )}
      <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{row.source_name}</td>
      {showPositionCol && (
        <td className="py-2 px-3">
          {row.position
            ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">{row.position}</span>
            : <span className="text-[10px] text-muted-foreground/40">—</span>
          }
        </td>
      )}
      {showTeamCol && (
        <td className="py-2 px-3 text-xs text-muted-foreground truncate max-w-[96px]">
          {row.team ?? "—"}
        </td>
      )}
      <td className="py-2 px-3 min-w-[220px]">
        <PlayerSearchDropdown
          players={dropdownPlayers}
          value={row.player_id}
          manualInputName={row.manual_input_name}
          onChange={(id, name, isManual) => onSelect(row.id, id, name, isManual)}
          placeholder={isHardPending ? "Type name or search…" : (row.player_name ?? "Search player…")}
        />
      </td>
      <td className="py-2 px-3 text-right tabular-nums font-mono text-xs">
        {fmtPrice(row.cleaned_price)}
      </td>
    </tr>
  );
}

// ============================================================
// Shared UI components
// ============================================================
function rowBgClass(row: MappingRow): string {
  if (row.player_id !== null) return "hover:bg-emerald-950/10";
  if (row.match_status === "pending_player_record") return "bg-red-950/5 hover:bg-red-950/10";
  if (row.match_status === "manual_input") return "bg-amber-950/5 hover:bg-amber-950/10";
  if (row.match_status === "manual_required") return "bg-orange-950/5 hover:bg-orange-950/10";
  if (row.match_status === "suggested") return "bg-amber-950/5 hover:bg-amber-950/10";
  return "hover:bg-muted/10";
}

function MatchBadge({ status, confidence, method }: { status: MatchStatus; confidence: number; method: string | null | undefined }) {
  const isMemory = method === "persisted_memory";
  if (status === "auto_matched") {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
        isMemory
          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
          : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
      }`}>
        <Zap className="h-2.5 w-2.5" />
        {isMemory ? "MEMORY" : `AUTO ${confidence}%`}
      </span>
    );
  }
  if (status === "manually_matched") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/25 whitespace-nowrap">
        <CircleCheck className="h-2.5 w-2.5" />MANUAL
      </span>
    );
  }
  if (status === "manual_input") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 whitespace-nowrap">
        <Clock className="h-2.5 w-2.5" />PENDING
      </span>
    );
  }
  if (status === "suggested") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 whitespace-nowrap">
        <EyeOff className="h-2.5 w-2.5" />SUGGEST
      </span>
    );
  }
  if (status === "manual_required") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/25 whitespace-nowrap">
        <AlertTriangle className="h-2.5 w-2.5" />SEARCH
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/25 whitespace-nowrap">
      <Clock className="h-2.5 w-2.5" />PENDING
    </span>
  );
}

function PlayerStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  if (status === "OUT") return (
    <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/25">OUT</span>
  );
  if (status === "TEST") return (
    <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">TEST</span>
  );
  if (status === "AVAILABLE") return (
    <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">AVAIL</span>
  );
  return (
    <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-400 border border-slate-500/25">{status}</span>
  );
}

function ModeButton({ active, onClick, icon, children }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
        active
          ? "bg-foreground text-background border-foreground"
          : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function StatTile({ label, value, color }: { label: string; value: number; color?: "emerald" | "amber" | "orange" | "red" | "sky" | "slate" }) {
  const colorCls = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    orange: "text-orange-400",
    red: "text-red-400",
    sky: "text-sky-400",
    slate: "text-slate-400",
  }[color ?? ""] ?? "text-foreground";

  return (
    <div className="rounded-lg border border-border bg-muted/10 px-3 py-2.5 text-center">
      <div className={`text-xl font-bold tabular-nums ${colorCls}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{label}</div>
    </div>
  );
}

function SummaryCard({
  label, value, total, color, icon, note,
}: {
  label: string;
  value: number;
  total: number;
  color: "emerald" | "amber" | "orange" | "sky" | "red";
  icon: React.ReactNode;
  note: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const colorMap = {
    emerald: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
    amber: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
    orange: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
    sky: { text: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
    red: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
  }[color];

  return (
    <div className={`rounded-lg border ${colorMap.border} ${colorMap.bg} px-4 py-3`}>
      <div className={`flex items-center gap-1.5 ${colorMap.text} mb-1.5`}>
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${colorMap.text}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-1">{pct}% · {note}</div>
    </div>
  );
}
