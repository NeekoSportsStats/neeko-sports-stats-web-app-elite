import { useState, useEffect, useCallback, useRef } from "react";
import { X, Copy, Check, TrendingUp, TrendingDown, Minus, Search, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { MWPlayerRow } from "./types";
import { fmtPrice, fmtNum, fmtPriceChange, tradeVerdict } from "./helpers";
import { track } from "@/lib/analytics";

interface Props {
  onClose: () => void;
  prefillOutId?: number | null;
  prefillInId?: number | null;
  allPlayers: MWPlayerRow[];
}

export function TradeImpactModal({ onClose, prefillOutId, prefillInId, allPlayers }: Props) {
  const [outSearch, setOutSearch] = useState("");
  const [inSearch, setInSearch] = useState("");
  const [outPlayer, setOutPlayer] = useState<MWPlayerRow | null>(null);
  const [inPlayer, setInPlayer] = useState<MWPlayerRow | null>(null);
  const [outResults, setOutResults] = useState<MWPlayerRow[]>([]);
  const [inResults, setInResults] = useState<MWPlayerRow[]>([]);
  const [outSearching, setOutSearching] = useState(false);
  const [inSearching, setInSearching] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const outDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    track("market_watch_compare_open");
    if (prefillOutId != null) {
      const p = allPlayers.find(r => r.player_id === prefillOutId) ?? null;
      setOutPlayer(p);
      if (p) setOutSearch(p.player_name);
    }
    if (prefillInId != null) {
      const p = allPlayers.find(r => r.player_id === prefillInId) ?? null;
      setInPlayer(p);
      if (p) setInSearch(p.player_name);
    }
  }, [prefillOutId, prefillInId, allPlayers]);

  const searchPlayers = useCallback(async (query: string, excludeId: number | null): Promise<MWPlayerRow[]> => {
    if (query.length < 2) return [];
    const { data } = await supabase
      .schema("afl")
      .from("player_rankings_cache")
      .select("player_id, player_name, team, position, price, breakeven, projection_final, edge, signal_tag, signal, status, manual_status, is_bye, recommendation_short, summary_short, summary_long, matchup_label, prev_price, price_change, consistency_score, projection_confidence, neeko_rating, ceiling, floor_score")
      .ilike("player_name", `%${query}%`)
      .eq("season", 2026)
      .limit(20);
    return ((data ?? []) as any[])
      .filter(r => r.player_id !== excludeId)
      .map((r): MWPlayerRow => {
        const rawTag = (r.signal_tag ?? "").toLowerCase();
        const displaySignal: "TARGET" | "WATCH" | "AVOID" =
          rawTag === "target" ? "TARGET" : rawTag === "avoid" ? "AVOID" : "WATCH";
        return {
          snapshot_id: "trade-modal",
          player_id: r.player_id,
          player_name: r.player_name,
          team: r.team,
          position: r.position,
          price: r.price ?? 0,
          breakeven: parseFloat(r.breakeven ?? "0") || 0,
          projection: parseFloat(r.projection_final ?? "0") || 0,
          ceiling: r.ceiling ?? null,
          floor_val: r.floor_score ?? null,
          risk_pct: null,
          value_gap: r.edge != null ? Number(r.edge) : 0,
          signal_tag: r.signal_tag ?? null,
          signal: r.signal ?? null,
          category: displaySignal === "TARGET" ? "BUY" : displaySignal === "AVOID" ? "SELL" : "HOLD",
          action: displaySignal === "TARGET" ? "BUY" : displaySignal === "AVOID" ? "SELL" : "HOLD",
          recommendation_short: r.recommendation_short ?? null,
          summary_short: r.summary_short ?? null,
          summary_long: r.summary_long ?? null,
          matchup_label: r.matchup_label ?? null,
          prev_price: r.prev_price ?? null,
          price_change: r.price_change ?? null,
          consistency: r.consistency_score ?? null,
          projection_confidence: r.projection_confidence ?? null,
          neeko_rating: r.neeko_rating ?? null,
          status: r.status ?? null,
          manual_status: r.manual_status ?? null,
          is_bye: r.is_bye === true,
          is_injured: ["injured", "out", "omitted"].includes((r.status ?? "").toLowerCase()),
          snapshot_updated_at: new Date().toISOString(),
          season: 2026,
          round_number: 1,
          value_signal: displaySignal,
          display_signal: displaySignal,
        };
      });
  }, []);

  const handleOutSearch = useCallback((v: string) => {
    setOutSearch(v);
    if (!v) { setOutPlayer(null); setOutResults([]); return; }
    if (outDebounce.current) clearTimeout(outDebounce.current);
    outDebounce.current = setTimeout(async () => {
      setOutSearching(true);
      const results = await searchPlayers(v, inPlayer?.player_id ?? null);
      setOutResults(results);
      setOutSearching(false);
    }, 200);
  }, [searchPlayers, inPlayer]);

  const handleInSearch = useCallback((v: string) => {
    setInSearch(v);
    if (!v) { setInPlayer(null); setInResults([]); return; }
    if (inDebounce.current) clearTimeout(inDebounce.current);
    inDebounce.current = setTimeout(async () => {
      setInSearching(true);
      const results = await searchPlayers(v, outPlayer?.player_id ?? null);
      setInResults(results);
      setInSearching(false);
    }, 200);
  }, [searchPlayers, outPlayer]);

  const handleCopy = () => {
    if (!outPlayer || !inPlayer) return;
    const text = buildSummaryText(outPlayer, inPlayer);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    if (outPlayer && inPlayer) {
      track("market_watch_compare_run", {
        out_player: outPlayer.player_name,
        in_player: inPlayer.player_name,
      });
    }
  }, [outPlayer, inPlayer]);

  const showComparison = outPlayer && inPlayer;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{
          background: "linear-gradient(160deg, #111 0%, #0d0d0d 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 40px 80px rgba(0,0,0,0.6)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Trade Impact Calculator</h2>
            <p className="text-[11px] text-white/35 mt-0.5">Compare any OUT and IN player</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="p-5">
            <div className="grid grid-cols-2 gap-3 mb-5">
              <PlayerSelector
                label="OUT (Selling)"
                search={outSearch}
                onSearchChange={handleOutSearch}
                results={outResults}
                searching={outSearching}
                selected={outPlayer}
                onSelect={(p) => { setOutPlayer(p); setOutSearch(p.player_name); setOutResults([]); }}
                accentClass="border-red-400/25 focus:border-red-400/50"
                labelClass="text-red-400"
              />
              <PlayerSelector
                label="IN (Buying)"
                search={inSearch}
                onSearchChange={handleInSearch}
                results={inResults}
                searching={inSearching}
                selected={inPlayer}
                onSelect={(p) => { setInPlayer(p); setInSearch(p.player_name); setInResults([]); }}
                accentClass="border-green-400/25 focus:border-green-400/50"
                labelClass="text-green-400"
              />
            </div>

            {showComparison ? (
              <ComparisonPanel
                out={outPlayer!}
                inn={inPlayer!}
                showAdvanced={showAdvanced}
                onToggleAdvanced={() => setShowAdvanced(a => !a)}
              />
            ) : (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center text-white/25 text-sm">
                Search and select both players to see the trade impact
              </div>
            )}

            {showComparison && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 text-sm text-white/50 hover:text-white/80 hover:border-white/20 transition-all"
                >
                  {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied!" : "Copy trade summary"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerSelector({
  label, search, onSearchChange, results, searching, selected, onSelect, accentClass, labelClass,
}: {
  label: string;
  search: string;
  onSearchChange: (v: string) => void;
  results: MWPlayerRow[];
  searching: boolean;
  selected: MWPlayerRow | null;
  onSelect: (p: MWPlayerRow) => void;
  accentClass: string;
  labelClass: string;
}) {
  return (
    <div className="relative">
      <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${labelClass}`}>{label}</p>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20 pointer-events-none" />
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search player..."
          className={`w-full rounded-lg border bg-white/[0.03] pl-7 pr-3 py-2 text-sm text-white placeholder-white/20 outline-none transition-colors ${accentClass}`}
        />
      </div>
      {(results.length > 0 && !selected) && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-white/10 bg-[#111] z-10 shadow-xl overflow-hidden max-h-48 overflow-y-auto">
          {searching && (
            <div className="px-3 py-2 text-[11px] text-white/30">Searching...</div>
          )}
          {results.map(p => (
            <button
              key={p.player_id}
              onClick={() => onSelect(p)}
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
            >
              <div>
                <p className="text-sm text-white font-medium">{p.player_name}</p>
                <p className="text-[10px] text-white/35">{p.team} · {p.position}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/50">{fmtPrice(p.price)}</p>
                <p className="text-[10px] text-white/30">{fmtNum(p.projection, 1)} proj</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {searching && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-white/10 bg-[#111] z-10 shadow-xl px-3 py-2">
          <p className="text-[11px] text-white/30">Searching...</p>
        </div>
      )}
    </div>
  );
}

function ComparisonPanel({ out, inn, showAdvanced, onToggleAdvanced }: {
  out: MWPlayerRow;
  inn: MWPlayerRow;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
}) {
  const ptsDelta = inn.projection - out.projection;
  const edgeDelta = (inn.value_gap ?? 0) - (out.value_gap ?? 0);
  const priceDelta = (inn.price_change ?? 0) - (out.price_change ?? 0);
  const riskDelta = (inn.risk_pct ?? 0) - (out.risk_pct ?? 0);
  const scoreDelta = (inn.projection_confidence ?? 0) - (out.projection_confidence ?? 0);
  const verdict = tradeVerdict(ptsDelta, priceDelta, riskDelta, scoreDelta);

  const isPositiveVerdict = verdict.startsWith("Recommended") || verdict.startsWith("Strong");

  const coreRows: { label: string; outVal: string; inVal: string; delta: number | null; higherIsBetter: boolean }[] = [
    {
      label: "Projection",
      outVal: fmtNum(out.projection, 1),
      inVal: fmtNum(inn.projection, 1),
      delta: ptsDelta,
      higherIsBetter: true,
    },
    {
      label: "Breakeven",
      outVal: fmtNum(out.breakeven, 1),
      inVal: fmtNum(inn.breakeven, 1),
      delta: inn.breakeven - out.breakeven,
      higherIsBetter: false,
    },
    {
      label: "Edge",
      outVal: fmtNum(out.value_gap, 1),
      inVal: fmtNum(inn.value_gap, 1),
      delta: edgeDelta,
      higherIsBetter: true,
    },
    {
      label: "Confidence",
      outVal: out.projection_confidence != null ? `${fmtNum(out.projection_confidence, 0)}%` : "—",
      inVal: inn.projection_confidence != null ? `${fmtNum(inn.projection_confidence, 0)}%` : "—",
      delta: scoreDelta,
      higherIsBetter: true,
    },
    {
      label: "Price Change",
      outVal: fmtPriceChange(out.price_change),
      inVal: fmtPriceChange(inn.price_change),
      delta: priceDelta,
      higherIsBetter: true,
    },
    {
      label: "Price",
      outVal: fmtPrice(out.price),
      inVal: fmtPrice(inn.price),
      delta: inn.price - out.price,
      higherIsBetter: false,
    },
  ];

  const advancedRows: { label: string; outVal: string; inVal: string; delta: number | null; higherIsBetter: boolean }[] = [
    {
      label: "Ceiling",
      outVal: fmtNum(out.ceiling, 1),
      inVal: fmtNum(inn.ceiling, 1),
      delta: (inn.ceiling ?? 0) - (out.ceiling ?? 0),
      higherIsBetter: true,
    },
    {
      label: "Floor",
      outVal: fmtNum(out.floor_val, 1),
      inVal: fmtNum(inn.floor_val, 1),
      delta: (inn.floor_val ?? 0) - (out.floor_val ?? 0),
      higherIsBetter: true,
    },
    {
      label: "Prev Price",
      outVal: fmtPrice(out.prev_price),
      inVal: fmtPrice(inn.prev_price),
      delta: (inn.prev_price ?? inn.price) - (out.prev_price ?? out.price),
      higherIsBetter: true,
    },
  ];

  return (
    <div className="space-y-3">
      <div className={`rounded-xl border px-4 py-3 ${
        isPositiveVerdict
          ? "border-green-400/25 bg-green-400/[0.05]"
          : "border-white/8 bg-white/[0.02]"
      }`}>
        <p className="text-[9px] uppercase tracking-widest text-white/30 mb-1">Trade Verdict</p>
        <p className={`text-base font-bold ${isPositiveVerdict ? "text-green-300" : "text-white/70"}`}>
          {verdict}
        </p>
        <div className="flex gap-4 mt-2 flex-wrap">
          <VerdictStat
            label="Points"
            value={ptsDelta >= 0 ? `+${ptsDelta.toFixed(1)}` : ptsDelta.toFixed(1)}
            positive={ptsDelta > 0}
          />
          <VerdictStat
            label="Edge Change"
            value={edgeDelta >= 0 ? `+${edgeDelta.toFixed(1)}` : edgeDelta.toFixed(1)}
            positive={edgeDelta > 0}
          />
          <VerdictStat
            label="Price Change"
            value={fmtPriceChange(inn.price_change)}
            positive={(inn.price_change ?? 0) > 0}
          />
        </div>
      </div>

      <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
        <div className="grid grid-cols-3 border-b border-white/5 text-[10px] font-bold uppercase tracking-wider text-white/30">
          <div className="px-3 py-2 text-red-400 truncate">OUT — {out.player_name}</div>
          <div className="px-3 py-2 text-center">Metric</div>
          <div className="px-3 py-2 text-right text-green-400 truncate">IN — {inn.player_name}</div>
        </div>
        {coreRows.map(row => <ComparisonRow key={row.label} row={row} />)}
      </div>

      {(out.recommendation_short || inn.recommendation_short) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-red-400/15 bg-red-400/[0.03] px-3 py-3">
            <p className="text-[9px] text-red-400/60 uppercase tracking-wider mb-1.5">Why sell</p>
            <p className="text-[11px] text-white/40 leading-snug">{out.recommendation_short || "—"}</p>
          </div>
          <div className="rounded-xl border border-green-400/15 bg-green-400/[0.03] px-3 py-3">
            <p className="text-[9px] text-green-400/60 uppercase tracking-wider mb-1.5">Why buy</p>
            <p className="text-[11px] text-white/40 leading-snug">{inn.recommendation_short || "—"}</p>
          </div>
        </div>
      )}

      <button
        onClick={onToggleAdvanced}
        className="w-full flex items-center justify-center gap-1.5 text-[11px] text-white/25 hover:text-white/50 transition-colors py-1"
      >
        {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {showAdvanced ? "Hide advanced metrics" : "Show advanced metrics"}
      </button>

      {showAdvanced && (
        <div className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
          <div className="grid grid-cols-3 border-b border-white/5 text-[10px] font-bold uppercase tracking-wider text-white/30">
            <div className="px-3 py-2 text-red-400">OUT</div>
            <div className="px-3 py-2 text-center">Metric</div>
            <div className="px-3 py-2 text-right text-green-400">IN</div>
          </div>
          {advancedRows.map(row => <ComparisonRow key={row.label} row={row} />)}
        </div>
      )}
    </div>
  );
}

function VerdictStat({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div>
      <p className="text-[9px] text-white/30 uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${positive ? "text-green-400" : "text-red-400"}`}>{value}</p>
    </div>
  );
}

function ComparisonRow({ row }: {
  row: { label: string; outVal: string; inVal: string; delta: number | null; higherIsBetter: boolean };
}) {
  const isPositive = row.delta != null && (row.higherIsBetter ? row.delta > 0 : row.delta < 0);
  const isNegative = row.delta != null && (row.higherIsBetter ? row.delta < 0 : row.delta > 0);
  const deltaIcon = isPositive
    ? <TrendingUp className="h-3 w-3 text-green-400" />
    : isNegative
      ? <TrendingDown className="h-3 w-3 text-red-400" />
      : <Minus className="h-3 w-3 text-white/20" />;

  return (
    <div className="grid grid-cols-3 border-b border-white/5 last:border-0 items-center">
      <div className="px-3 py-2 text-sm font-medium text-white/60 tabular-nums">{row.outVal}</div>
      <div className="px-3 py-2 flex items-center justify-center gap-1">
        <span className="text-[10px] text-white/30">{row.label}</span>
        {deltaIcon}
      </div>
      <div className={`px-3 py-2 text-sm font-semibold text-right tabular-nums ${
        isPositive ? "text-green-400" : isNegative ? "text-red-400" : "text-white/60"
      }`}>{row.inVal}</div>
    </div>
  );
}

function buildSummaryText(out: MWPlayerRow, inn: MWPlayerRow): string {
  const ptsDelta = inn.projection - out.projection;
  const edgeDelta = (inn.value_gap ?? 0) - (out.value_gap ?? 0);
  const priceDelta = (inn.price_change ?? 0) - (out.price_change ?? 0);
  const riskDelta = (inn.risk_pct ?? 0) - (out.risk_pct ?? 0);
  const scoreDelta = (inn.projection_confidence ?? 0) - (out.projection_confidence ?? 0);
  const verdict = tradeVerdict(ptsDelta, priceDelta, riskDelta, scoreDelta);
  return [
    `Trade Analysis: OUT ${out.player_name} → IN ${inn.player_name}`,
    `Verdict: ${verdict}`,
    `Points Gain: ${ptsDelta >= 0 ? "+" : ""}${ptsDelta.toFixed(1)}`,
    `Edge Change: ${edgeDelta >= 0 ? "+" : ""}${edgeDelta.toFixed(1)}`,
    `Price Change (IN): ${fmtPriceChange(inn.price_change)}`,
    `Breakeven: OUT ${fmtNum(out.breakeven, 1)} | IN ${fmtNum(inn.breakeven, 1)}`,
    `Confidence Change: ${scoreDelta >= 0 ? "+" : ""}${scoreDelta.toFixed(0)}%`,
    `Generated by Neeko Sports`,
  ].join("\n");
}
