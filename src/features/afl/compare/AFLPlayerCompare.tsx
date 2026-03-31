import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Crown, Lock, X, Search, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RankingRow {
  player_id: string | null;
  player_name: string;
  team: string;
  position: string | null;
  projection_final: number | null;
  ceiling_estimate: number | null;
  floor_estimate: number | null;
  value_score: number | null;
  risk_rating: number | null;
  projection_confidence: number | null;
  upside_rating: number | null;
  captain_score: number | null;
  ai_summary: string | null;
  price: number | null;
  value_tag: string | null;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtInt(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return Math.round(n).toString();
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return `$${(n / 1_000_000).toFixed(2)}m`;
}

function fmtVal(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return n.toFixed(2);
}

// ─── Win/lose helpers ─────────────────────────────────────────────────────────

type WinSide = "a" | "b" | "tie" | null;

function winProjection(a: RankingRow, b: RankingRow): WinSide {
  if (a.projection_final == null || b.projection_final == null) return null;
  if (a.projection_final > b.projection_final) return "a";
  if (b.projection_final > a.projection_final) return "b";
  return "tie";
}

function winValue(a: RankingRow, b: RankingRow): WinSide {
  if (a.value_score == null || b.value_score == null) return null;
  if (a.value_score > b.value_score) return "a";
  if (b.value_score > a.value_score) return "b";
  return "tie";
}

function winSafety(a: RankingRow, b: RankingRow): WinSide {
  if (a.risk_rating == null || b.risk_rating == null) return null;
  if (a.risk_rating < b.risk_rating) return "a";
  if (b.risk_rating < a.risk_rating) return "b";
  return "tie";
}

function winConfidence(a: RankingRow, b: RankingRow): WinSide {
  if (a.projection_confidence == null || b.projection_confidence == null) return null;
  if (a.projection_confidence > b.projection_confidence) return "a";
  if (b.projection_confidence > a.projection_confidence) return "b";
  return "tie";
}

function winCeiling(a: RankingRow, b: RankingRow): WinSide {
  if (a.ceiling_estimate == null || b.ceiling_estimate == null) return null;
  if (a.ceiling_estimate > b.ceiling_estimate) return "a";
  if (b.ceiling_estimate > a.ceiling_estimate) return "b";
  return "tie";
}

// ─── Color helpers ─────────────────────────────────────────────────────────────

function getConfidenceColor(v: number | null): string {
  if (v == null) return "text-white/30";
  if (v >= 80) return "text-green-400";
  if (v >= 65) return "text-yellow-400";
  if (v >= 45) return "text-orange-400";
  return "text-red-400";
}

function getValueColor(v: number | null): string {
  if (v == null) return "text-white/30";
  if (v >= 1.25) return "text-green-400";
  if (v >= 1.10) return "text-[#F5C84C]";
  if (v >= 0.95) return "text-white/50";
  return "text-red-400";
}

function getRiskColor(v: number | null): string {
  if (v == null) return "text-white/30";
  if (v <= 15) return "text-green-400";
  if (v <= 25) return "text-emerald-400";
  if (v <= 35) return "text-orange-400";
  return "text-red-400";
}

function getPositionBadge(pos: string | null): string {
  if (!pos) return "bg-white/10 text-white/40";
  const p = pos.toUpperCase();
  if (p === "MID") return "bg-purple-500/20 text-purple-300";
  if (p === "FWD") return "bg-red-500/20 text-red-300";
  if (p === "DEF") return "bg-emerald-500/20 text-emerald-300";
  if (p === "RUC") return "bg-amber-500/20 text-amber-300";
  return "bg-white/10 text-white/40";
}

function winBg(side: "a" | "b", winner: WinSide): string {
  if (winner == null || winner === "tie") return "";
  return winner === side ? "bg-green-500/[0.07] border-green-500/20" : "bg-red-500/[0.04] border-red-500/10";
}

// ─── Upgrade Modal ─────────────────────────────────────────────────────────────

function UpgradeModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pt-[env(safe-area-inset-top)]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-[#F5C84C]/30 bg-[#0e0e0e] p-7 shadow-2xl text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-4 top-4 text-white/30 hover:text-white/70 transition-colors">
          <X size={16} />
        </button>
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#F5C84C]/15 border border-[#F5C84C]/30 mx-auto mb-4">
          <Crown size={22} className="text-[#F5C84C]" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Unlock Full Comparison</h3>
        <p className="text-sm text-white/50 leading-relaxed mb-5">
          See ceiling, floor, value score, confidence, and the full AI verdict for every comparison.
        </p>
        <div className="space-y-2.5 text-left mb-6">
          {[
            "Full breakdown — ceiling, floor, confidence, value",
            "AI verdict with reasoning",
            "Captain recommendation per player",
            "Unlimited player comparisons",
          ].map((f) => (
            <div key={f} className="flex items-center gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#F5C84C] shrink-0" />
              <span className="text-xs text-white/70">{f}</span>
            </div>
          ))}
        </div>
        <a
          href="/neeko-plus"
          className="block w-full bg-[#F5C84C] text-black font-bold rounded-xl py-3 text-sm hover:brightness-110 transition-all"
        >
          Upgrade to Neeko+
        </a>
        <button onClick={onClose} className="mt-3 text-xs text-white/30 hover:text-white/50 transition-colors">
          Maybe later
        </button>
      </div>
    </div>,
    document.body
  );
}

// ─── Player Search Dropdown ────────────────────────────────────────────────────

interface PlayerSearchProps {
  label: string;
  allPlayers: RankingRow[];
  selected: RankingRow | null;
  exclude: string | null;
  onSelect: (p: RankingRow) => void;
  onClear: () => void;
}

function PlayerSearch({ label, allPlayers, selected, exclude, onSelect, onClear }: PlayerSearchProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const filtered = allPlayers
    .filter((p) => {
      if (exclude && (p.player_id === exclude || p.player_name === exclude)) return false;
      if (!search.trim()) return true;
      return p.player_name.toLowerCase().includes(search.toLowerCase()) ||
        p.team.toLowerCase().includes(search.toLowerCase());
    })
    .slice(0, 60);

  function handleSelect(p: RankingRow) {
    onSelect(p);
    setOpen(false);
    setSearch("");
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[#F5C84C]/25 bg-[#F5C84C]/[0.04] px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{selected.player_name}</p>
            <p className="text-xs text-white/40">{selected.team} {selected.position ? `· ${selected.position}` : ""}</p>
          </div>
          <button
            onClick={onClear}
            className="text-white/30 hover:text-white/60 transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-all bg-[#0B0B0B] ${
            open ? "border-[#F5C84C]/40 text-white" : "border-white/10 text-white/50 hover:border-[#F5C84C]/30 hover:text-white/80"
          }`}
        >
          <span>{label}</span>
          <ChevronDown size={15} className={`text-white/30 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}

      {open && !selected && (
        <div
          className="absolute top-full left-0 w-full mt-1.5 z-50 rounded-xl border border-[#F5C84C]/20 bg-[#0d0d0d] overflow-hidden shadow-2xl"
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06]">
            <Search size={13} className="text-white/30 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or team…"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-white/20 hover:text-white/50 transition-colors">
                <X size={12} />
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <p className="px-4 py-5 text-center text-xs text-white/25">No players found</p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.player_id ?? p.player_name}
                  onClick={() => handleSelect(p)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.04] transition-colors border-l-2 border-transparent hover:border-[#F5C84C]/30"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{p.player_name}</p>
                    <p className="text-[11px] text-white/35">{p.team}{p.position ? ` · ${p.position}` : ""}</p>
                  </div>
                  {p.projection_final != null && (
                    <span className="text-xs text-[#F5C84C]/70 font-medium shrink-0 ml-3">
                      {fmtInt(p.projection_final)} proj.
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Player Header Card ────────────────────────────────────────────────────────

function PlayerHeaderCard({ player, side }: { player: RankingRow; side: "a" | "b" }) {
  const accent = side === "a" ? "border-purple-500/20 bg-purple-500/[0.04]" : "border-orange-500/20 bg-orange-500/[0.04]";
  const label = side === "a" ? "Player A" : "Player B";
  const labelColor = side === "a" ? "text-purple-400" : "text-orange-400";

  return (
    <div className={`rounded-xl border ${accent} px-4 py-4`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${labelColor}`}>{label}</p>
      <h3 className="text-base font-bold text-white">{player.player_name}</h3>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <span className="text-xs text-white/40">{player.team}</span>
        {player.position && (
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${getPositionBadge(player.position)}`}>
            {player.position}
          </span>
        )}
        {player.price != null && (
          <span className="text-xs text-white/30">{fmtPrice(player.price)}</span>
        )}
      </div>
    </div>
  );
}

// ─── Stat Row ─────────────────────────────────────────────────────────────────

interface StatRowProps {
  label: string;
  valA: string;
  valB: string;
  colorA?: string;
  colorB?: string;
  winner: WinSide;
  locked?: boolean;
  onUnlock?: () => void;
}

function StatRow({ label, valA, valB, colorA = "text-white", colorB = "text-white", winner, locked = false, onUnlock }: StatRowProps) {
  if (locked) {
    return (
      <div
        className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center py-3 border-b border-white/[0.04] cursor-pointer group"
        onClick={onUnlock}
      >
        <div className="flex justify-start">
          <div className="h-4 w-16 rounded bg-white/[0.07] blur-[2px] group-hover:bg-white/10 transition-colors" />
        </div>
        <div className="flex items-center gap-1.5 justify-center">
          <Lock size={9} className="text-[#F5C84C]/40 group-hover:text-[#F5C84C]/70 transition-colors" />
          <span className="text-[10px] text-white/25 uppercase tracking-wider font-medium">{label}</span>
        </div>
        <div className="flex justify-end">
          <div className="h-4 w-16 rounded bg-white/[0.07] blur-[2px] group-hover:bg-white/10 transition-colors" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center py-3 border-b border-white/[0.04]">
      <div className={`flex items-center justify-start gap-1.5 rounded-lg px-2.5 py-1.5 border ${winBg("a", winner)} border-transparent`}>
        <span className={`text-sm font-bold tabular-nums ${colorA}`}>{valA}</span>
        {winner === "a" && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />}
      </div>
      <span className="text-[10px] text-white/25 uppercase tracking-wider font-medium whitespace-nowrap text-center">{label}</span>
      <div className={`flex items-center justify-end gap-1.5 rounded-lg px-2.5 py-1.5 border ${winBg("b", winner)} border-transparent`}>
        {winner === "b" && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />}
        <span className={`text-sm font-bold tabular-nums ${colorB}`}>{valB}</span>
      </div>
    </div>
  );
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

function buildVerdict(a: RankingRow, b: RankingRow): { text: string; winner: "a" | "b" | "even" } {
  let scoreA = 0;
  let scoreB = 0;
  const reasons: string[] = [];

  if (a.projection_final != null && b.projection_final != null) {
    if (a.projection_final > b.projection_final) {
      scoreA++;
      reasons.push(`higher projection (${fmtInt(a.projection_final)} vs ${fmtInt(b.projection_final)})`);
    } else if (b.projection_final > a.projection_final) {
      scoreB++;
    }
  }

  if (a.value_score != null && b.value_score != null) {
    if (a.value_score > b.value_score) scoreA++;
    else if (b.value_score > a.value_score) scoreB++;
  }

  if (a.risk_rating != null && b.risk_rating != null) {
    if (a.risk_rating < b.risk_rating) {
      scoreA++;
      reasons.push(`lower risk (${fmtInt(a.risk_rating)}% vs ${fmtInt(b.risk_rating)}%)`);
    } else if (b.risk_rating < a.risk_rating) {
      scoreB++;
    }
  }

  if (a.projection_confidence != null && b.projection_confidence != null) {
    if (a.projection_confidence > b.projection_confidence) scoreA++;
    else if (b.projection_confidence > a.projection_confidence) scoreB++;
  }

  if (scoreA === scoreB) {
    return { text: `${a.player_name} and ${b.player_name} are evenly matched this round. Could go either way.`, winner: "even" };
  }

  const winner = scoreA > scoreB ? a : b;
  const loser = scoreA > scoreB ? b : a;
  const reasonText = reasons.length > 0 ? ` due to ${reasons.slice(0, 2).join(" and ")}` : "";

  return {
    text: `Start ${winner.player_name} over ${loser.player_name} this round${reasonText}.`,
    winner: scoreA > scoreB ? "a" : "b",
  };
}

// ─── AI Verdict Block ─────────────────────────────────────────────────────────

function VerdictBlock({
  playerA,
  playerB,
  isPremium,
  onUnlock,
}: {
  playerA: RankingRow;
  playerB: RankingRow;
  isPremium: boolean;
  onUnlock: () => void;
}) {
  const verdict = buildVerdict(playerA, playerB);

  const accentBorder =
    verdict.winner === "a"
      ? "border-purple-500/30"
      : verdict.winner === "b"
      ? "border-orange-500/30"
      : "border-white/10";

  const accentBg =
    verdict.winner === "a"
      ? "bg-purple-500/[0.05]"
      : verdict.winner === "b"
      ? "bg-orange-500/[0.05]"
      : "bg-white/[0.02]";

  const aiText = (() => {
    if (!isPremium) return null;
    const a = playerA.ai_summary;
    const b = playerB.ai_summary;
    if (!a && !b) return null;
    const parts: string[] = [];
    if (a) parts.push(`${playerA.player_name}: ${a.slice(0, 160)}${a.length > 160 ? "…" : ""}`);
    if (b) parts.push(`${playerB.player_name}: ${b.slice(0, 160)}${b.length > 160 ? "…" : ""}`);
    return parts.join("\n\n");
  })();

  return (
    <div className={`rounded-xl border ${accentBorder} ${accentBg} px-5 py-5`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-1.5 rounded-full bg-[#F5C84C] shrink-0" />
        <p className="text-[10px] text-[#F5C84C]/70 uppercase tracking-wider font-semibold">Neeko Verdict</p>
        {!isPremium && <Lock size={10} className="text-[#F5C84C]/40 ml-auto" />}
      </div>

      <p className="text-sm font-semibold text-white leading-relaxed mb-3">{verdict.text}</p>

      {isPremium ? (
        aiText ? (
          <div className="mt-3 space-y-2.5 border-t border-white/[0.05] pt-3">
            {aiText.split("\n\n").map((t, i) => (
              <p key={i} className="text-xs text-white/50 leading-relaxed italic">{t}</p>
            ))}
          </div>
        ) : null
      ) : (
        <div
          className="mt-3 border-t border-white/[0.05] pt-3 relative cursor-pointer group"
          onClick={onUnlock}
        >
          <p className="text-xs text-white/25 leading-relaxed italic blur-[4px] select-none">
            Full AI reasoning including matchup difficulty, role security, ceiling analysis, and risk factors compared side-by-side.
          </p>
          <div className="absolute inset-0 flex items-center justify-center gap-1.5">
            <Lock size={11} className="text-[#F5C84C]/60 group-hover:text-[#F5C84C] transition-colors" />
            <span className="text-xs font-semibold text-[#F5C84C]/60 group-hover:text-[#F5C84C] transition-colors">Unlock AI Analysis</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ playerA, playerB }: { playerA: RankingRow; playerB: RankingRow }) {
  const metrics = [
    { key: "projection", winFn: winProjection },
    { key: "value", winFn: winValue },
    { key: "safety", winFn: winSafety },
    { key: "confidence", winFn: winConfidence },
    { key: "ceiling", winFn: winCeiling },
  ];

  let scoreA = 0;
  let scoreB = 0;

  for (const { winFn } of metrics) {
    const w = winFn(playerA, playerB);
    if (w === "a") scoreA++;
    if (w === "b") scoreB++;
  }

  const total = scoreA + scoreB || 1;
  const pctA = Math.round((scoreA / total) * 100);
  const pctB = 100 - pctA;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-bold text-purple-300">{playerA.player_name.split(" ").pop()}</p>
          <p className="text-lg font-bold text-white">{scoreA}</p>
        </div>
        <p className="text-[10px] text-white/25 uppercase tracking-wider">Edge Score</p>
        <div className="text-right">
          <p className="text-xs font-bold text-orange-300">{playerB.player_name.split(" ").pop()}</p>
          <p className="text-lg font-bold text-white">{scoreB}</p>
        </div>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden flex">
        <div
          className="h-full bg-purple-500/60 rounded-l-full transition-all duration-500"
          style={{ width: `${pctA}%` }}
        />
        <div
          className="h-full bg-orange-500/60 rounded-r-full transition-all duration-500"
          style={{ width: `${pctB}%` }}
        />
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex items-center gap-4 mb-6 opacity-30">
        <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
          <span className="text-white/40 text-lg font-bold">A</span>
        </div>
        <ArrowRight size={20} className="text-white/20" />
        <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
          <span className="text-white/40 text-lg font-bold">B</span>
        </div>
      </div>
      <p className="text-sm text-white/30">Select two players above to compare</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AFLPlayerCompare() {
  const { isPremium } = useAuth();
  const [allPlayers, setAllPlayers] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerA, setPlayerA] = useState<RankingRow | null>(null);
  const [playerB, setPlayerB] = useState<RankingRow | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc("get_rankings_free", {
      position_filter: "ALL",
      sort_key: "best",
      limit_n: 200,
    });
    setAllPlayers((data as RankingRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  const hasBoth = playerA != null && playerB != null;

  const projWin = hasBoth ? winProjection(playerA!, playerB!) : null;
  const valWin = hasBoth ? winValue(playerA!, playerB!) : null;
  const safetyWin = hasBoth ? winSafety(playerA!, playerB!) : null;
  const confWin = hasBoth ? winConfidence(playerA!, playerB!) : null;
  const ceilWin = hasBoth ? winCeiling(playerA!, playerB!) : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-8 md:px-8">
      <div className="max-w-3xl mx-auto">

        {/* Page header */}
        <div className="mb-7">
          <h1 className="text-xl font-bold text-white mb-1">Player Comparison</h1>
          <p className="text-sm text-white/35">Compare two players head-to-head. Pick the best start for your lineup.</p>
        </div>

        {/* Player selectors */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            <div className="h-12 rounded-xl bg-white/5 animate-pulse" />
            <div className="h-12 rounded-xl bg-white/5 animate-pulse" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            <PlayerSearch
              label="Select Player A"
              allPlayers={allPlayers}
              selected={playerA}
              exclude={playerB?.player_id ?? playerB?.player_name ?? null}
              onSelect={setPlayerA}
              onClear={() => setPlayerA(null)}
            />
            <PlayerSearch
              label="Select Player B"
              allPlayers={allPlayers}
              selected={playerB}
              exclude={playerA?.player_id ?? playerA?.player_name ?? null}
              onSelect={setPlayerB}
              onClear={() => setPlayerB(null)}
            />
          </div>
        )}

        {!hasBoth ? (
          <EmptyState />
        ) : (
          <>
            {/* Player header cards — desktop side by side, mobile stacked */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              <PlayerHeaderCard player={playerA!} side="a" />
              <PlayerHeaderCard player={playerB!} side="b" />
            </div>

            {/* Score bar */}
            <ScoreBar playerA={playerA!} playerB={playerB!} />

            {/* Stats comparison */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2 mb-4">
              <div className="grid grid-cols-[1fr_auto_1fr] gap-3 py-2 mb-1">
                <span className="text-[10px] text-purple-400/70 font-semibold uppercase tracking-wider">{playerA!.player_name.split(" ").pop()}</span>
                <span className="text-[10px] text-white/20 uppercase tracking-wider text-center">Metric</span>
                <span className="text-[10px] text-orange-400/70 font-semibold uppercase tracking-wider text-right">{playerB!.player_name.split(" ").pop()}</span>
              </div>

              <StatRow
                label="Projection"
                valA={fmtInt(playerA!.projection_final)}
                valB={fmtInt(playerB!.projection_final)}
                winner={projWin}
              />

              <StatRow
                label="Risk"
                valA={playerA!.risk_rating != null ? `${fmtInt(playerA!.risk_rating)}%` : "—"}
                valB={playerB!.risk_rating != null ? `${fmtInt(playerB!.risk_rating)}%` : "—"}
                colorA={getRiskColor(playerA!.risk_rating ?? null)}
                colorB={getRiskColor(playerB!.risk_rating ?? null)}
                winner={safetyWin}
              />

              <StatRow
                label="Est. Ceiling"
                valA={fmtInt(playerA!.ceiling_estimate)}
                valB={fmtInt(playerB!.ceiling_estimate)}
                winner={ceilWin}
                locked={!isPremium}
                onUnlock={() => setShowUpgrade(true)}
              />

              <StatRow
                label="Est. Floor"
                valA={fmtInt(playerA!.floor_estimate)}
                valB={fmtInt(playerB!.floor_estimate)}
                winner={null}
                locked={!isPremium}
                onUnlock={() => setShowUpgrade(true)}
              />

              <StatRow
                label="Value Score"
                valA={fmtVal(playerA!.value_score)}
                valB={fmtVal(playerB!.value_score)}
                colorA={getValueColor(playerA!.value_score ?? null)}
                colorB={getValueColor(playerB!.value_score ?? null)}
                winner={valWin}
                locked={!isPremium}
                onUnlock={() => setShowUpgrade(true)}
              />

              <StatRow
                label="Confidence"
                valA={playerA!.projection_confidence != null ? `${fmtInt(playerA!.projection_confidence)}%` : "—"}
                valB={playerB!.projection_confidence != null ? `${fmtInt(playerB!.projection_confidence)}%` : "—"}
                colorA={getConfidenceColor(playerA!.projection_confidence ?? null)}
                colorB={getConfidenceColor(playerB!.projection_confidence ?? null)}
                winner={confWin}
                locked={!isPremium}
                onUnlock={() => setShowUpgrade(true)}
              />
            </div>

            {/* Verdict */}
            <VerdictBlock
              playerA={playerA!}
              playerB={playerB!}
              isPremium={isPremium}
              onUnlock={() => setShowUpgrade(true)}
            />

            {!isPremium && (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#F5C84C]/15 bg-[#F5C84C]/[0.03] px-4 py-3">
                <Crown size={14} className="text-[#F5C84C] shrink-0" />
                <p className="text-xs text-white/45 flex-1">
                  Free preview shows projection and risk only. Upgrade for ceiling, floor, value score, confidence, and full AI verdict.
                </p>
                <a href="/neeko-plus" className="text-xs font-semibold text-[#F5C84C] hover:text-yellow-300 transition-colors shrink-0">
                  Upgrade
                </a>
              </div>
            )}
          </>
        )}

        <div className="h-16" />
      </div>

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
