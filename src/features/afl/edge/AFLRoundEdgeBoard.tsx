import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { signalFromField, formatEdgeSignalLabel, getEdgeSignalStyles } from "@/utils/aflEdgeSignal";
import { createPortal } from "react-dom";
import {
  Lock, Crown, X, ShieldCheck, Zap, Share2, Check,
  ChevronRight, ChevronDown, Timer, TrendingUp,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import { buildEdgeBoardPlayers, type EdgeBoardPlayer, type EdgeSection } from "@/features/afl/edge-board/engine";

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = "must_have" | "breakout" | "do_not_start";

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMNS = "player_id, player_name, team, player_position, price, projection, breakeven, edge, signal, category, action, games_played, status, manual_status, is_bye";

// Round lock: Next Thursday 19:35 AEDT
function getNextRoundLock(): Date {
  const now = new Date();
  const d = new Date(now);
  const day = d.getUTCDay();
  const daysUntilThursday = (4 - day + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysUntilThursday);
  d.setUTCHours(8, 35, 0, 0);
  if (d.getTime() < now.getTime()) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

function useCountdown(target: Date) {
  const [remaining, setRemaining] = useState(() => target.getTime() - Date.now());
  useEffect(() => {
    const id = setInterval(() => setRemaining(target.getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  const totalSec = Math.max(0, Math.floor(remaining / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return { days, hours, mins, secs, expired: totalSec === 0 };
}

function useRelativeTime(ts: string | null | undefined): string | null {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (!ts) return;
    const id = setInterval(() => forceUpdate((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [ts]);
  if (!ts) return null;
  try {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min${Math.floor(diff / 60) === 1 ? "" : "s"} ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr${Math.floor(diff / 3600) === 1 ? "" : "s"} ago`;
    return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) === 1 ? "" : "s"} ago`;
  } catch { return null; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtInt(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return Math.round(n).toString();
}

function fmtValueScore(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}`;
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(3)}M`;
  return `$${Math.floor(n / 1000)}K`;
}

function getPositionBadgeStyle(pos: string | null): string {
  if (!pos) return "bg-white/10 text-white/40";
  const p = pos.toUpperCase();
  if (p === "MID") return "bg-purple-500/20 text-purple-300";
  if (p === "FWD") return "bg-red-500/20 text-red-300";
  if (p === "DEF") return "bg-emerald-500/20 text-emerald-300";
  if (p === "RUC") return "bg-amber-500/20 text-amber-300";
  return "bg-white/10 text-white/40";
}

function getValueScoreColor(v: number | null): string {
  if (v == null) return "text-white/30";
  if (v >= 15)  return "text-green-400";
  if (v >= 5)   return "text-[#F5C84C]";
  if (v >= -5)  return "text-white/50";
  return "text-red-400";
}

function getRiskLabel(v: number | null): string {
  if (v == null) return "—";
  if (v <= 15) return "Low";
  if (v <= 25) return "Med";
  if (v <= 35) return "High";
  return "Very High";
}

function getRiskColor(v: number | null): string {
  if (v == null) return "text-white/30";
  if (v <= 15) return "text-green-400";
  if (v <= 25) return "text-yellow-400";
  if (v <= 35) return "text-orange-400";
  return "text-red-500";
}

function edgeSectionToSection(s: EdgeSection): Section {
  if (s === "avoid") return "do_not_start";
  return s;
}

function getSectionLabel(section: Section): { emoji: string; label: string; accentText: string; border: string; bg: string } {
  switch (section) {
    case "must_have":     return { emoji: "🟢", label: "MUST HAVE VALUE",      accentText: "text-green-400",  border: "border-green-500/30",  bg: "bg-green-500/[0.05]" };
    case "breakout":      return { emoji: "⚡", label: "BREAKOUT / WATCHLIST", accentText: "text-sky-400",    border: "border-sky-500/30",    bg: "bg-sky-500/[0.05]" };
    case "do_not_start":  return { emoji: "🚨", label: "DO NOT START",         accentText: "text-red-400",    border: "border-red-500/30",    bg: "bg-red-500/[0.05]" };
  }
}

function getPrimaryMetric(row: RankingRow, section: Section): { label: string; value: string; color: string } {
  switch (section) {
    case "must_have": {
      const band = (row as any).value_band;
      if (band) return { label: "Value", value: band, color: "text-emerald-400" };
      const ds = (row as any).decision_score;
      const vs = ds ?? row.value_score ?? (row.projection != null && row.breakeven != null ? row.projection - row.breakeven : null);
      return { label: "Edge Score", value: fmtValueScore(vs), color: getValueScoreColor(vs) };
    }
    case "breakout":     return { label: "Projection",   value: fmtInt(row.projection),    color: "text-sky-400" };
    case "do_not_start": return { label: "Projection",   value: fmtInt(row.projection),    color: "text-red-400" };
  }
}

function buildConfidenceReasons(row: RankingRow, section: Section): string[] {
  const reasons: string[] = [];
  const valueBand = (row as any).value_band as string | null | undefined;
  const decisionScore = (row as any).decision_score as number | null | undefined;
  if (section === "must_have") {
    if (valueBand) {
      reasons.push(`${valueBand} — projecting above breakeven this round`);
    } else if (decisionScore != null) {
      if (decisionScore >= 1.5) reasons.push("Elite value — projecting well above breakeven");
      else if (decisionScore >= 0.5) reasons.push("Strong value — projecting above breakeven");
      else reasons.push("Fair value — projecting at or above breakeven");
    }
  }
  const confidenceLabel = (row as any).confidence_label as string | null | undefined;
  if (section === "breakout" && confidenceLabel === "HIGH") {
    reasons.push("High confidence signal — strong breakout candidate this round");
  }
  if (section === "do_not_start") {
    const beVal = row.breakeven;
    if (beVal != null && row.projection != null) {
      const edge = row.projection - beVal;
      if (edge <= -20) reasons.push("Significantly underperforming breakeven — heavily overpriced this round");
      else if (edge <= -10) reasons.push("Projected below breakeven — overpriced given current form");
      else reasons.push("Projection below breakeven — consider alternatives");
    } else {
      reasons.push("Low projection relative to price — consider alternatives");
    }
  }
  if (row.projection != null) {
    reasons.push(`${fmtInt(row.projection)} pts projected this round`);
  }
  return reasons.length > 0 ? reasons : ["Based on combined projection and pricing model"];
}

async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function buildShareText(row: RankingRow, section: Section): string {
  const valueBand = (row as any).value_band as string | null | undefined;
  const decisionScore = (row as any).decision_score as number | null | undefined;
  const valueLabel = valueBand ?? (decisionScore != null ? fmtValueScore(decisionScore) : null);
  switch (section) {
    case "must_have":    return `🟢 AFL Fantasy Must Have (Neeko)\n${row.player_name} (${row.team})${valueLabel ? ` — ${valueLabel}` : ""}\n\nneekosports.com.au #AFLFantasy`;
    case "breakout":     return `⚡ AFL Fantasy Breakout Watch (Neeko)\n${row.player_name} (${row.team}) — ${fmtInt(row.projection)} pts projected\n\nneekosports.com.au #AFLFantasy`;
    case "do_not_start": return `🚨 AFL Fantasy Fade Alert (Neeko)\n${row.player_name} (${row.team}) — ${fmtInt(row.projection)} pts projected (negative edge)\n\nneekosports.com.au #AFLFantasy`;
  }
}

function buildRoundSummaryText(mustHave: EdgeBoardPlayer | null, breakout: EdgeBoardPlayer | null, avoid: EdgeBoardPlayer | null): string {
  const lines: string[] = ["⚡ My AFL Fantasy Edge Picks (Neeko)\n"];
  if (mustHave) {
    const band = (mustHave as any).value_band as string | null | undefined;
    const ds = (mustHave as any).decision_score as number | null | undefined;
    const label = band ?? (ds != null ? fmtValueScore(ds) : null);
    lines.push(`Must Have: ${mustHave.player_name}${label ? ` — ${label}` : ` — ${fmtInt(mustHave.projection)} pts projected`}`);
  }
  if (breakout) lines.push(`Breakout Watch: ${breakout.player_name} — ${fmtInt(breakout.projection)} pts projected`);
  if (avoid) lines.push(`Avoid: ${avoid.player_name} — ${fmtInt(avoid.projection)} pts projected`);
  lines.push("\nneekosports.com.au #AFLFantasy #NeekoEdge");
  return lines.join("\n");
}

// ─── Round Lock Countdown ─────────────────────────────────────────────────────

function RoundLockCountdown() {
  const lockDate = useRef(getNextRoundLock()).current;
  const { days, hours, mins, secs, expired } = useCountdown(lockDate);
  if (expired) return null;
  const urgent = days === 0 && hours < 6;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${urgent ? "border-red-500/30 bg-red-500/[0.06] text-red-400" : "border-white/10 bg-white/[0.03] text-white/50"}`}>
      <Timer size={11} className={urgent ? "text-red-400" : "text-white/30"} />
      <span>Round locks in&nbsp;</span>
      {days > 0 && <span className={`font-extrabold tabular-nums ${urgent ? "text-red-400" : "text-white/70"}`}>{days}d </span>}
      <span className={`font-extrabold tabular-nums ${urgent ? "text-red-400" : "text-white/70"}`}>{String(hours).padStart(2, "0")}h {String(mins).padStart(2, "0")}m {String(secs).padStart(2, "0")}s</span>
    </div>
  );
}


// ─── Trust Badge ──────────────────────────────────────────────────────────────

function TrustBadge({ accuracy }: { accuracy: number | null }) {
  if (accuracy == null) return null;
  const pct = Math.round(accuracy);
  const good = pct >= 60;
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold ${good ? "border-green-500/25 bg-green-500/[0.08] text-green-400" : "border-white/10 bg-white/[0.03] text-white/40"}`}>
      <TrendingUp size={10} />
      <span>Last week hit rate: {pct}%</span>
    </div>
  );
}

// ─── Upgrade Paywall Modal ─────────────────────────────────────────────────────

function UpgradePaywallModal({ onClose, openCount }: { onClose: () => void; openCount: number }) {
  const unlocked = openCount;
  const total = 3;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-[#F5C84C]/30 bg-[#0e0e0e] p-7 shadow-2xl text-center animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-4 top-4 text-white/30 hover:text-white/70 transition-colors">
          <X size={16} />
        </button>
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#F5C84C]/15 border border-[#F5C84C]/30 mx-auto mb-3">
          <Crown size={22} className="text-[#F5C84C]" />
        </div>
        <p className="text-[11px] font-bold text-[#F5C84C]/60 uppercase tracking-widest mb-1">
          You've unlocked {unlocked}/{total} picks
        </p>
        <h3 className="text-lg font-bold text-white mb-1">Unlock Full Analysis</h3>
        <p className="text-sm text-white/45 leading-relaxed mb-5">
          Get complete reasoning for every pick — captain locks, value plays, and traps.
        </p>
        <div className="space-y-2.5 text-left mb-6">
          {[
            "Player Intelligence for every pick",
            "3 additional captain options per round",
            "3 extra value and trap plays",
            "Confidence scores and edge ratings",
            "Updated weekly throughout the season",
          ].map((f) => (
            <div key={f} className="flex items-center gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#F5C84C] shrink-0" />
              <span className="text-xs text-white/70">{f}</span>
            </div>
          ))}
        </div>
        <a href="/neeko-plus" className="block w-full bg-[#F5C84C] text-black font-bold rounded-xl py-3 text-sm hover:brightness-110 transition-all">
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

// ─── Player Analysis Modal ─────────────────────────────────────────────────────

interface PlayerAnalysisModalProps {
  row: RankingRow;
  section: Section;
  isPremium: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}

function PlayerAnalysisModal({ row, section, isPremium, onClose, onUpgrade }: PlayerAnalysisModalProps) {
  const cfg = getSectionLabel(section);
  const metric = getPrimaryMetric(row, section);
  const sig = signalFromField(row.signal);
  const reasons = buildConfidenceReasons(row, section);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function handleShare() {
    const ok = await copyToClipboard(buildShareText(row, section));
    if (ok) {
      setShared(true);
      track("edge_board_share", { section, player: row.player_name });
      setTimeout(() => setShared(false), 2000);
    }
  }

  function handleWhatsApp() {
    const text = encodeURIComponent(buildShareText(row, section));
    window.open(`https://wa.me/?text=${text}`, "_blank");
    track("edge_board_share_whatsapp", { section, player: row.player_name });
  }

  function handleTwitter() {
    const text = encodeURIComponent(buildShareText(row, section));
    window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
    track("edge_board_share_twitter", { section, player: row.player_name });
  }

  const keyFactors: string[] = [];
  if (row.projection != null) keyFactors.push(`Projection: ${fmtInt(row.projection)} pts`);
  if (row.price != null) keyFactors.push(`Price: ${fmtPrice(row.price)}`);
  const beDisplay = row.breakeven;
  if (beDisplay != null) keyFactors.push(`Breakeven: ${fmtInt(beDisplay)} pts`);
  const valueBandKF = (row as any).value_band as string | null | undefined;
  const decisionScoreKF = (row as any).decision_score as number | null | undefined;
  if (valueBandKF) keyFactors.push(`Value: ${valueBandKF}`);
  else if (decisionScoreKF != null) keyFactors.push(`Edge Score: ${fmtValueScore(decisionScoreKF)}`);

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150" />
      <div
        className={`relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border ${cfg.border} bg-[#0d0d0d] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in slide-in-from-bottom-6 sm:slide-in-from-bottom-2 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        <div className={`px-5 pt-4 pb-4 border-b border-white/[0.06] shrink-0 ${cfg.bg}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className={`text-[10px] font-extrabold tracking-widest uppercase ${cfg.accentText} block mb-1`}>
                {cfg.emoji} {cfg.label}
              </span>
              <h2 className="text-xl font-extrabold text-white leading-tight">{row.player_name}</h2>
              <p className="text-xs text-white/40 mt-0.5">{row.team}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 mt-1">
              {row.position && (
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${getPositionBadgeStyle(row.position)}`}>
                  {row.position}
                </span>
              )}
              <button
                onClick={onClose}
                className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/[0.06] text-white/40 hover:text-white/80 hover:bg-white/10 transition-all"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-3">
            <div>
              <p className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">{metric.label}</p>
              <p className={`text-3xl font-extrabold tabular-nums leading-none ${metric.color}`}>{metric.value}</p>
            </div>
            {(() => {
              const cl = (row as any).confidence_label as string | null | undefined;
              if (!cl) return null;
              const clUp = cl.toUpperCase();
              const dotColor = clUp === "HIGH" ? "bg-green-400" : clUp === "MEDIUM" ? "bg-yellow-400" : "bg-orange-400";
              const textColor = clUp === "HIGH" ? "text-green-400" : clUp === "MEDIUM" ? "text-yellow-400" : "text-orange-400";
              const displayLabel = clUp === "HIGH" ? "High Confidence" : clUp === "MEDIUM" ? "Medium Confidence" : "Low Confidence";
              return (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-black/30 self-end">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                  <span className={`text-[11px] font-bold ${textColor}`}>{displayLabel}</span>
                </div>
              );
            })()}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${getEdgeSignalStyles(sig)}`}>
            <div className="flex-1">
              <p className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">Signal</p>
              <p className="text-sm font-extrabold">{formatEdgeSignalLabel(sig)}</p>
            </div>
          </div>

          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-2">Why this pick</p>
            <ul className="space-y-1.5">
              {reasons.map((r) => (
                <li key={r} className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${cfg.accentText.replace("text-", "bg-").replace("/70", "")}`} />
                  <span className="text-[12px] text-white/60 leading-snug">{r}</span>
                </li>
              ))}
            </ul>
          </div>

          {keyFactors.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-2">Key Factors</p>
              <div className="grid grid-cols-2 gap-2">
                {keyFactors.map((f) => {
                  const [label, val] = f.split(": ");
                  return (
                    <div key={f} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                      <p className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">{label}</p>
                      <p className="text-sm font-bold text-white">{val}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-white/[0.06] shrink-0 space-y-2.5">
          {!isPremium && (
            <a
              href="/neeko-plus"
              className="flex items-center justify-center gap-2 w-full bg-[#F5C84C] text-black font-bold rounded-xl py-3 text-sm hover:brightness-110 transition-all"
            >
              <Crown size={14} />
              Upgrade to Neeko+
            </a>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-[12px] font-semibold text-white/50 hover:text-white/80 hover:border-white/20 transition-all"
            >
              Close
            </button>
            <button
              onClick={handleShare}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-[12px] font-semibold transition-all ${
                shared
                  ? "border-[#F5C84C]/40 bg-[#F5C84C]/10 text-[#F5C84C]"
                  : "border-white/10 bg-white/[0.03] text-white/40 hover:text-white/70 hover:border-white/20"
              }`}
              title="Copy to clipboard"
            >
              {shared ? <Check size={12} /> : <Share2 size={12} />}
              {shared ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={handleWhatsApp}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-[12px] font-semibold text-white/40 hover:text-green-400 hover:border-green-500/30 hover:bg-green-500/[0.05] transition-all"
            >
              <span className="text-[11px]">WhatsApp</span>
            </button>
            <button
              onClick={handleTwitter}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-[12px] font-semibold text-white/40 hover:text-white/70 hover:border-white/20 hover:bg-white/[0.05] transition-all"
            >
              <span className="text-[11px]">X</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Hero Pick Card ───────────────────────────────────────────────────────────

interface HeroPickCardProps {
  player: EdgeBoardPlayer;
  section: Section;
  isPremium: boolean;
  onOpen: (row: RankingRow, section: Section) => void;
}

function HeroPickCard({ player, section, isPremium, onOpen }: HeroPickCardProps) {
  const cfg = getSectionLabel(section);
  const metric = getPrimaryMetric(player, section);
  const sig = signalFromField(player.signal);

  return (
    <button
      className={`relative flex flex-col w-full overflow-hidden text-left transition-all duration-150 hover:bg-white/[0.02] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20`}
      onClick={() => onOpen(player, section)}
    >
      {/* Player */}
      <div className="px-4 pt-4 pb-3 border-b border-white/[0.06]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-xl font-extrabold text-white leading-tight">{player.player_name}</h3>
              {(() => {
                const eff = (player.manual_status ?? player.status ?? "").toUpperCase();
                if (eff === "OUT" || eff === "OMITTED") return <span className="rounded bg-red-500/10 px-1 py-0.5 text-[8px] font-bold text-red-400 uppercase tracking-wide border border-red-500/25 shrink-0">OUT</span>;
                if (eff === "INJURED") return <span className="rounded bg-red-500/10 px-1 py-0.5 text-[8px] font-bold text-red-400 uppercase tracking-wide border border-red-500/25 shrink-0">INJ</span>;
                if (eff === "TEST") return <span className="rounded bg-orange-500/10 px-1 py-0.5 text-[8px] font-bold text-orange-400 uppercase tracking-wide border border-orange-500/25 shrink-0">TEST</span>;
                if (player.is_bye) return <span className="rounded bg-[#F5C84C]/10 px-1 py-0.5 text-[8px] font-bold text-[#F5C84C] uppercase tracking-wide border border-[#F5C84C]/25 shrink-0">BYE</span>;
                return null;
              })()}
            </div>
            <p className="text-[11px] text-white/35 mt-0.5">{player.team}</p>
            {player.overallRank < 999 && (
              <p className="text-[10px] text-white/25 mt-0.5">Ranked #{player.overallRank} overall this week</p>
            )}
          </div>
          {player.position && (
            <span className={`mt-1 shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${getPositionBadgeStyle(player.position)}`}>
              {player.position}
            </span>
          )}
        </div>
      </div>

      {/* Stat */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div>
          <p className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">{metric.label}</p>
          <p className={`text-3xl font-extrabold tabular-nums leading-none ${metric.color}`}>{metric.value}</p>
        </div>
        {/* Secondary metric: Projection for must_have (avoids duplicating Value), Edge for others */}
        {section === "must_have" ? (
          player.projection != null && (
            <div className="shrink-0">
              <p className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">Projection</p>
              <p className="text-lg font-extrabold tabular-nums leading-none text-white/70">
                {fmtInt(player.projection)}
              </p>
            </div>
          )
        ) : (() => {
          const ds = (player as any).decision_score as number | null | undefined;
          const vs = (player as any).value_score as number | null | undefined;
          const edgeVal = ds ?? vs ?? null;
          if (edgeVal == null) return null;
          return (
            <div className="shrink-0">
              <p className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">Edge</p>
              <p className={`text-lg font-extrabold tabular-nums leading-none ${getValueScoreColor(edgeVal)}`}>
                {fmtValueScore(edgeVal)}
              </p>
            </div>
          );
        })()}
        {player.price != null && (
          <div className="ml-auto text-right shrink-0">
            <p className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">Price</p>
            <p className="text-sm font-semibold text-white/60 tabular-nums">{fmtPrice(player.price)}</p>
          </div>
        )}
      </div>

      {/* One-liner / lock */}
      <div className="px-4 pb-3 flex-1">
        {!isPremium ? (
          <div className="flex items-center gap-1.5">
            <Lock size={9} className="text-[#F5C84C]/40 shrink-0" />
            <span className="text-[10px] text-[#F5C84C]/45">Reasoning locked — Neeko+</span>
          </div>
        ) : null}
      </div>

      {/* Signal badge */}
      {player.signal != null && (
        <div className="px-4 pb-3 flex items-center gap-2">
          <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md ${getEdgeSignalStyles(sig)}`}>
            {formatEdgeSignalLabel(sig)}
          </span>
        </div>
      )}

      {/* View Analysis CTA */}
      <div className="px-4 pb-4">
        <div className={`flex items-center justify-between w-full px-3 py-2 rounded-xl border ${cfg.border} bg-white/[0.04] hover:bg-white/[0.07] transition-colors`}>
          <span className={`text-[11px] font-bold ${cfg.accentText}`}>View Full Analysis</span>
          <ChevronRight size={13} className={cfg.accentText} />
        </div>
      </div>
    </button>
  );
}

// ─── Free Paywall ─────────────────────────────────────────────────────────────

function FreePaywall({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="rounded-2xl border border-[#F5C84C]/25 bg-gradient-to-b from-[#F5C84C]/[0.06] to-[#F5C84C]/[0.01] px-5 py-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl border border-[#F5C84C]/30 bg-[#F5C84C]/10 shrink-0">
          <Lock size={14} className="text-[#F5C84C]" />
        </div>
        <div>
          <h3 className="text-sm font-extrabold text-white leading-tight">Unlock full analysis for all picks</h3>
          <p className="text-[11px] text-white/40 mt-0.5">AI reasoning, confidence scores, and edge ratings</p>
        </div>
        <a href="/neeko-plus" className="ml-auto shrink-0 bg-[#F5C84C] text-black font-bold text-xs px-4 py-2 rounded-lg hover:brightness-110 transition-all whitespace-nowrap">
          Unlock Neeko+
        </a>
      </div>
      <div className="flex items-center justify-between mt-1 pt-3 border-t border-white/[0.05]">
        <span className="text-[10px] text-white/25">From $5.99/wk</span>
        <button onClick={onUnlock} className="text-[11px] text-[#F5C84C]/50 hover:text-[#F5C84C]/80 transition-colors underline underline-offset-2">
          See what's included
        </button>
      </div>
    </div>
  );
}

// ─── Round Summary Share Panel ─────────────────────────────────────────────────

function RoundSummaryShare({ mustHave, breakout, avoid }: { mustHave: EdgeBoardPlayer | null; breakout: EdgeBoardPlayer | null; avoid: EdgeBoardPlayer | null }) {
  const [copied, setCopied] = useState(false);
  const summaryText = buildRoundSummaryText(mustHave, breakout, avoid);

  async function handleCopy() {
    const ok = await copyToClipboard(summaryText);
    if (ok) { setCopied(true); track("edge_board_share_round"); setTimeout(() => setCopied(false), 2500); }
  }

  function handleWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(summaryText)}`, "_blank");
    track("edge_board_share_round_whatsapp");
  }

  function handleTwitter() {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(summaryText)}`, "_blank");
    track("edge_board_share_round_twitter");
  }

  return (
    <div className="rounded-2xl border border-[#F5C84C]/20 bg-[#F5C84C]/[0.03] p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-extrabold text-white">Share this round's picks</h3>
          <p className="text-[11px] text-white/35 mt-0.5">Ready-to-post for X, WhatsApp or your league chat</p>
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3 space-y-1.5 mb-3">
        {mustHave && (
          <div className="flex items-center gap-2">
            <span className="text-[10px]">🟢</span>
            <span className="text-[12px] text-white/60">Must Have: <span className="text-white font-semibold">{mustHave.player_name}</span>{(() => { const b = (mustHave as any).value_band; const d = (mustHave as any).decision_score; const label = b ?? (d != null ? fmtValueScore(d) : null); return label ? ` — ${label}` : ` — ${fmtInt(mustHave.projection)} pts`; })()}</span>
          </div>
        )}
        {breakout && (
          <div className="flex items-center gap-2">
            <span className="text-[10px]">⚡</span>
            <span className="text-[12px] text-white/60">Breakout: <span className="text-white font-semibold">{breakout.player_name}</span> — {fmtInt(breakout.projection)} pts projected</span>
          </div>
        )}
        {avoid && (
          <div className="flex items-center gap-2">
            <span className="text-[10px]">🚨</span>
            <span className="text-[12px] text-white/60">Avoid: <span className="text-white font-semibold">{avoid.player_name}</span> — {fmtInt(avoid.projection)} pts projected</span>
          </div>
        )}
        <p className="text-[10px] text-white/20 pt-1">neekosports.com.au #AFLFantasy</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border font-bold text-xs transition-all ${
            copied
              ? "border-[#F5C84C]/50 bg-[#F5C84C]/15 text-[#F5C84C]"
              : "border-[#F5C84C]/30 bg-[#F5C84C]/[0.07] text-[#F5C84C]/70 hover:text-[#F5C84C] hover:border-[#F5C84C]/50"
          }`}
        >
          {copied ? <Check size={12} /> : <Share2 size={12} />}
          {copied ? "Copied!" : "Copy picks"}
        </button>
        <button
          onClick={handleWhatsApp}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-xs font-semibold text-white/40 hover:text-green-400 hover:border-green-500/30 hover:bg-green-500/[0.05] transition-all"
        >
          WhatsApp
        </button>
        <button
          onClick={handleTwitter}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-xs font-semibold text-white/40 hover:text-white/70 hover:border-white/20 hover:bg-white/[0.05] transition-all"
        >
          X
        </button>
      </div>
    </div>
  );
}

// ─── Collapsible SEO Guide ────────────────────────────────────────────────────

function CollapsibleSEOGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02]">
      <div className="sr-only">
        AFL Fantasy Edge Board Guide: Must Have — players with strong edge and value above their price. Breakout — underpriced players with upside projection. Do Not Start — players likely to underperform their price point this week. Picks updated weekly after price changes.
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
        aria-expanded={open}
      >
        <div>
          <p className="text-[12px] font-semibold text-white/55">AFL Edge Board Guide</p>
          <p className="text-[11px] text-white/25 mt-0.5">How the model finds captain locks, value plays and traps</p>
        </div>
        <ChevronDown
          className="w-3.5 h-3.5 text-white/25 shrink-0 transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>
      <div
        className="overflow-hidden transition-all duration-250"
        style={{ maxHeight: open ? "900px" : "0px", opacity: open ? 1 : 0, transition: "max-height 0.25s ease, opacity 0.2s ease" }}
      >
        <div className="border-t border-white/[0.05] px-4 pb-5 pt-4 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-white mb-2">How to Use the AFL Fantasy Edge Board</h2>
            <p className="text-[12px] text-white/50 leading-relaxed">
              The Edge Board is Neeko's most concentrated AFL Fantasy decision tool. Each week the projection model scans the full player pool and surfaces three categories: the strongest value profile, the best breakout target, and the player to avoid. These represent the model's strongest signals for the upcoming round.
            </p>
          </div>
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/30 mb-2.5">What each section means</h3>
            <ul className="space-y-2.5 text-[12px] text-white/45 leading-relaxed">
              <li><strong className="text-white/65">Must Have Value</strong> — Players where projection significantly exceeds their price baseline. High-confidence start profile with value-positive output.</li>
              <li><strong className="text-white/65">Breakout Watch</strong> — Players with strong upside potential relative to current pricing. Worth monitoring or starting this round based on output trends.</li>
              <li><strong className="text-white/65">Do Not Start</strong> — Players where projection falls short relative to price. Model flags these as avoidance candidates this round.</li>
            </ul>
          </div>
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/30 mb-2">For this round</h3>
            <p className="text-[12px] text-white/45 leading-relaxed">
              Edge Board picks refresh weekly after price changes are applied. Use the{" "}
              <a href="/fantasy/current-week" className="text-white/60 underline underline-offset-2 hover:text-white transition-colors">Current Round</a>{" "}
              for the full player landscape, or the{" "}
              <a href="/fantasy/rankings" className="text-white/60 underline underline-offset-2 hover:text-white transition-colors">AFL Fantasy Rankings</a>{" "}
              for the complete player pool ordered by Neeko Rating.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="h-8 w-56 rounded-xl bg-white/5 animate-pulse" />
        <div className="h-4 w-72 rounded-lg bg-white/5 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
          {[1, 2, 3].map((i) => <div key={i} className="h-64 rounded-2xl bg-white/[0.03] animate-pulse" />)}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AFLRoundEdgeBoard() {
  const { isPremium, user } = useAuth();
  const [players, setPlayers] = useState<RankingRow[]>([]);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [activeModal, setActiveModal] = useState<{ row: RankingRow; section: Section } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const freeOpenCount = useRef(0);
  const relativeTime = useRelativeTime(refreshedAt);

  useEffect(() => { track("edge_board_view"); }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rankResult, accResult] = await Promise.all([
        supabase.rpc("get_edge_board_safe", {
          p_user_id: user?.id ?? null,
          p_is_bot: false,
          p_limit: 50,
        }),
        supabase.from("v_projection_accuracy_homepage").select("within_20").maybeSingle(),
      ]);

      if (rankResult.error) throw rankResult.error;

      const mapped = ((rankResult.data as any[]) ?? []).map(mapRankingRow);

      if (mapped.length === 0) {
        console.warn("[EdgeBoard] RPC returned 0 players", {
          p_user_id: user?.id ?? null,
          p_is_bot: false,
          p_limit: 50,
        });
      }

      setPlayers(mapped);
      setRefreshedAt(null);

      if (!accResult.error && accResult.data) {
        const raw = (accResult.data as any).within_20;
        const parsed = raw != null ? Number(raw) : null;
        setAccuracy(!isNaN(parsed as number) ? parsed : null);
      }
    } catch {
      setError("Unable to load picks. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    function onPricesApplied() { fetchData(); }
    window.addEventListener("neeko:prices-applied", onPricesApplied);
    return () => window.removeEventListener("neeko:prices-applied", onPricesApplied);
  }, [fetchData]);

  const { mustHave, breakout, avoid, allEdgeIds } = useMemo(
    () => buildEdgeBoardPlayers(players),
    [players]
  );

  const mustHavePick   = mustHave[0] ?? null;
  const breakoutPick   = breakout[0] ?? null;
  const avoidPick      = avoid[0] ?? null;

  const sections: { players: EdgeBoardPlayer[]; section: Section; label: string; accentText: string; border: string; bg: string; emoji: string }[] = [
    { players: mustHave, section: "must_have",    label: "MUST HAVE VALUE",      accentText: "text-green-400",  border: "border-green-500/30",  bg: "bg-green-500/[0.05]",  emoji: "🟢" },
    { players: breakout, section: "breakout",     label: "BREAKOUT / WATCHLIST", accentText: "text-sky-400",    border: "border-sky-500/30",    bg: "bg-sky-500/[0.05]",    emoji: "⚡" },
    { players: avoid,    section: "do_not_start", label: "DO NOT START",         accentText: "text-red-400",    border: "border-red-500/30",    bg: "bg-red-500/[0.05]",    emoji: "🚨" },
  ];

  function handleOpenModal(row: RankingRow, section: Section) {
    if (!isPremium) {
      if (freeOpenCount.current >= 1) {
        setShowUpgradeModal(true);
        track("edge_board_paywall_hit", { player: row.player_name });
        return;
      }
      freeOpenCount.current += 1;
    }
    setActiveModal({ row, section });
    track("edge_board_modal_open", { section, player: row.player_name });
  }

  function handleCloseModal() { setActiveModal(null); }

  // Export edge IDs so other pages can use them (stored on window for cross-page access)
  useEffect(() => {
    (window as any).__neekoEdgeBoardIds = allEdgeIds;
  }, [allEdgeIds]);

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-sm text-red-400 mb-3">{error}</p>
          <button onClick={fetchData} className="text-xs text-white/40 hover:text-white/70 transition-colors underline">Try again</button>
        </div>
      </div>
    );
  }

  const hasAnyPicks = mustHave.length > 0 || breakout.length > 0 || avoid.length > 0;

  return (
    <>
      <Helmet>
        {/* Not currently routed. Keep noindex unless restored intentionally. */}
        <title>AFL Fantasy Market Watch 2026 — Price Movers & Value Targets | Neeko Sports Stats</title>
        <meta name="description" content="Track AFL Fantasy price movers, value targets, trap alerts and underpriced players using weekly stat-generated market signals." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href="https://neekostats.com.au/fantasy/market-watch" />
        <meta property="og:title" content="AFL Fantasy Market Watch 2026 — Price Movers & Value Targets | Neeko Sports Stats" />
        <meta property="og:description" content="Track AFL Fantasy price movers, value targets, trap alerts and underpriced players using weekly stat-generated market signals." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/fantasy/market-watch" />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta property="og:site_name" content="Neeko Sports" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AFL Fantasy Market Watch 2026 — Price Movers & Value Targets | Neeko Sports Stats" />
        <meta name="twitter:description" content="Track AFL Fantasy price movers, value targets, trap alerts and underpriced players using weekly stat-generated market signals." />
        <meta name="twitter:image" content="https://neekostats.com.au/og-default.png" />
      </Helmet>

      <div className="min-h-screen bg-[#0a0a0a] px-4 py-8 md:px-8">
        <div className="max-w-4xl mx-auto">

          {/* ── Page header ─────────────────────────────────────────────────── */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={13} className="text-[#F5C84C]" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#F5C84C]/60">AFL Fantasy · Edge Board</span>
              {isPremium && (
                <div className="ml-1 flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#F5C84C]/35 bg-[#F5C84C]/10">
                  <ShieldCheck size={9} className="text-[#F5C84C]" />
                  <span className="text-[9px] font-bold text-[#F5C84C] tracking-wide">Neeko+ Active</span>
                </div>
              )}
            </div>
            <h1 className="text-2xl font-extrabold text-white leading-tight">This Week's Picks — No Noise. Just Decisions.</h1>
            <p className="text-sm text-white/40 mt-1.5 leading-relaxed">
              Neeko's highest conviction plays based on projection edge and pricing inefficiencies.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {relativeTime && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03]">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400/70" />
                  <span className="text-[10px] text-white/35">Updated {relativeTime}</span>
                </div>
              )}
              <TrustBadge accuracy={accuracy} />
              <RoundLockCountdown />
            </div>
          </div>

          {/* ── 3-Section Edge Board (3 players each) ─────────────────────── */}
          <div className="mb-5 space-y-5">
              {sections.map(({ players: sectionPlayers, section, label, accentText, border, bg, emoji }) => {
                const visiblePlayers = isPremium ? sectionPlayers.slice(0, 3) : sectionPlayers.slice(0, 1);
                const heroPick = visiblePlayers[0] ?? null;
                const secondaryPicks = isPremium ? visiblePlayers.slice(1) : [];
                return (
                  <div key={section} className={`rounded-2xl border ${border} ${bg} overflow-hidden`}>
                    {/* Section header */}
                    <div className="px-4 pt-4 pb-3 border-b border-white/[0.06]">
                      <span className={`text-[10px] font-extrabold tracking-widest uppercase ${accentText}`}>
                        {emoji} {label}
                      </span>
                    </div>

                    {/* Hero pick (first player — full card) */}
                    {heroPick ? (
                      <HeroPickCard
                        player={heroPick}
                        section={section}
                        isPremium={isPremium}
                        onOpen={handleOpenModal}
                      />
                    ) : (
                      <div className="px-5 py-8 text-center">
                        <p className="text-sm text-white/25">No picks available this round.</p>
                      </div>
                    )}

                    {/* Secondary picks (2nd and 3rd — premium only compact rows) */}
                    {isPremium && secondaryPicks.length > 0 && (
                      <div className="border-t border-white/[0.06] divide-y divide-white/[0.04]">
                        {secondaryPicks.map((player) => {
                          const metric = getPrimaryMetric(player, section);
                          const _ds = (player as any).decision_score as number | null | undefined;
                          const _vs = (player as any).value_score as number | null | undefined;
                          const vsCanonical = _ds != null ? Number(_ds) : _vs != null ? Number(_vs) : null;
                          return (
                            <button
                              key={player.player_id}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
                              onClick={() => handleOpenModal(player, section)}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-sm font-bold text-white truncate">{player.player_name}</span>
                                  {player.position && (
                                    <span className={`shrink-0 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${getPositionBadgeStyle(player.position)}`}>
                                      {player.position}
                                    </span>
                                  )}
                                  {(() => {
                                    const eff = (player.manual_status ?? player.status ?? "").toUpperCase();
                                    if (eff === "OUT" || eff === "OMITTED") return <span className="rounded bg-red-500/10 px-1 py-0.5 text-[8px] font-bold text-red-400 uppercase tracking-wide border border-red-500/25 shrink-0">OUT</span>;
                                    if (eff === "INJURED") return <span className="rounded bg-red-500/10 px-1 py-0.5 text-[8px] font-bold text-red-400 uppercase tracking-wide border border-red-500/25 shrink-0">INJ</span>;
                                    if (eff === "TEST") return <span className="rounded bg-orange-500/10 px-1 py-0.5 text-[8px] font-bold text-orange-400 uppercase tracking-wide border border-orange-500/25 shrink-0">TEST</span>;
                                    if (player.is_bye) return <span className="rounded bg-[#F5C84C]/10 px-1 py-0.5 text-[8px] font-bold text-[#F5C84C] uppercase tracking-wide border border-[#F5C84C]/25 shrink-0">BYE</span>;
                                    return null;
                                  })()}
                                </div>
                                <span className="text-[11px] text-white/35">{player.team}</span>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">{metric.label}</p>
                                <p className={`text-base font-extrabold tabular-nums ${metric.color}`}>{metric.value}</p>
                              </div>
                              {vsCanonical != null && (
                                <div className="text-right shrink-0 w-16">
                                  <p className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">Value</p>
                                  <p className={`text-sm font-bold tabular-nums ${getValueScoreColor(vsCanonical)}`}>
                                    {fmtValueScore(vsCanonical)}
                                  </p>
                                </div>
                              )}
                              <ChevronRight size={12} className="text-white/20 shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          {/* ── Free paywall banner ───────────────────────────────────────────── */}
          {!isPremium && (
            <div className="mb-6">
              <FreePaywall onUnlock={() => setShowUpgradeModal(true)} />
            </div>
          )}

          {/* ── Share section ─────────────────────────────────────────────────── */}
          {hasAnyPicks && (
            <div className="mb-6">
              <RoundSummaryShare mustHave={mustHavePick} breakout={breakoutPick} avoid={avoidPick} />
            </div>
          )}

          {/* ── Current Round CTA ─────────────────────────────────────────────── */}
          <div className="mb-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-white">Want the full picture?</p>
              <p className="text-[12px] text-white/40 mt-0.5">Browse all captain picks, value plays, and form analysis for every player.</p>
            </div>
            <a
              href="/fantasy/current-week"
              className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/15 bg-white/[0.04] text-[12px] font-bold text-white/70 hover:text-white hover:border-white/25 hover:bg-white/[0.07] transition-all whitespace-nowrap"
            >
              View Full Round
              <ChevronRight size={12} />
            </a>
          </div>

          {/* ── SEO Guide ────────────────────────────────────────────────────── */}
          <div className="mt-4">
            <CollapsibleSEOGuide />
          </div>

          <div className="mt-10 pb-8 border-t border-white/[0.04] pt-4">
            <p className="text-[10px] text-white/20 text-center tracking-wide">
              Picks derived from the Neeko projection engine — blended rolling baseline with dynamic round weighting.
            </p>
          </div>
        </div>

        {/* ── Modals ─────────────────────────────────────────────────────────── */}
        {activeModal && (
          <PlayerAnalysisModal
            row={activeModal.row}
            section={activeModal.section}
            isPremium={isPremium}
            onClose={handleCloseModal}
            onUpgrade={() => { handleCloseModal(); setShowUpgradeModal(true); }}
          />
        )}
        {showUpgradeModal && (
          <UpgradePaywallModal
            onClose={() => setShowUpgradeModal(false)}
            openCount={freeOpenCount.current}
          />
        )}
      </div>
    </>
  );
}
