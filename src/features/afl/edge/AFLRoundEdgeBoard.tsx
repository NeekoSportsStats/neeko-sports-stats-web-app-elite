import { useState, useEffect, useCallback, useRef } from "react";
import { cleanAiText } from "@/utils/cleanAiText";
import { createPortal } from "react-dom";
import {
  Lock, Crown, X, ShieldCheck, Zap, Share2, Check,
  ChevronRight, Timer, TrendingUp, Users,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RankingRow {
  player_id: string | null;
  player_name: string;
  team: string;
  position: string | null;
  section: string;
  section_rank: number | string;
  projection_final: number | null;
  ceiling_estimate: number | null;
  floor_estimate: number | null;
  upside_rating: number | null;
  risk_rating: number | null;
  projection_confidence: number | null;
  captain_score: number | null;
  captain_rating: string | null;
  neeko_rating: number | null;
  price: number | null;
  price_change: number | null;
  value_score: number | null;
  value_tag: string | null;
  ai_summary: string | null;
  recommendation_color: string | null;
  refreshed_at: string | null;
  edge_score: number | null;
  edge_tier: string | null;
}

type Section = "captain" | "breakout" | "trap";

// ─── Constants ────────────────────────────────────────────────────────────────

const PREMIUM_SECONDARY = 3;

const AFL_TEAMS = [
  "Adelaide", "Brisbane Lions", "Carlton", "Collingwood", "Essendon",
  "Fremantle", "Geelong", "Gold Coast", "GWS Giants", "Hawthorn",
  "Melbourne", "North Melbourne", "Port Adelaide", "Richmond",
  "St Kilda", "Sydney Swans", "West Coast", "Western Bulldogs",
];

// Round lock: Round 1 lockout was Thu 13 Mar 2026 19:35 AEDT.
// Each round locks Thursday ~7:35pm AEDT. UTC = AEDT - 11h (DST in March).
// We'll compute next Thursday 19:35 AEDT from now.
function getNextRoundLock(): Date {
  const now = new Date();
  const d = new Date(now);
  // Find next Thursday (day 4)
  const day = d.getUTCDay();
  const daysUntilThursday = (4 - day + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysUntilThursday);
  // Set to 08:35 UTC (= 19:35 AEDT / 18:35 AEST)
  d.setUTCHours(8, 35, 0, 0);
  // If that time has already passed, add 7 days
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
  return n.toFixed(2);
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";

  if (n >= 1_000_000) {
    // >= 1M → 1.126M (3 decimal places)
    return `$${(n / 1_000_000).toFixed(3)}M`;
  }

  // < 1M → 853K (no decimals)
  return `$${Math.floor(n / 1000)}K`;
}

function fmtPriceChange(change: number | null | undefined): string {
  if (change == null || change === 0) return "";
  const n = Number(change);
  if (isNaN(n)) return "";

  const abs = Math.abs(n);
  let formatted: string;

  if (abs >= 1_000_000) {
    formatted = `$${(abs / 1_000_000).toFixed(3)}M`;
  } else {
    formatted = `${Math.floor(abs / 1000)}K`;
  }

  return `${n > 0 ? "+" : "-"}${formatted}`;
}

function getOneLiner(text: string): string {
  const cleaned = text
    .replace(/is expected to /gi, "")
    .replace(/projects to /gi, "")
    .replace(/may see /gi, "")
    .replace(/could see /gi, "");
  const first = cleaned.split(". ")[0].trim();
  return first.length > 0 ? first : cleaned.slice(0, 80).trim();
}

function truncateWords(text: string, maxWords: number): string {
  const words = text.split(" ");
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "…";
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

function getConfidenceColor(v: number | null): string {
  if (v == null) return "text-white/30";
  if (v >= 80) return "text-green-400";
  if (v >= 65) return "text-yellow-400";
  if (v >= 45) return "text-orange-400";
  return "text-red-400";
}

function getValueScoreColor(v: number | null): string {
  if (v == null) return "text-white/30";
  if (v >= 1.25) return "text-green-400";
  if (v >= 1.10) return "text-[#F5C84C]";
  if (v >= 0.95) return "text-white/50";
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

function getSectionLabel(section: Section): { emoji: string; label: string; accentText: string; border: string; bg: string } {
  switch (section) {
    case "captain": return { emoji: "🔥", label: "CAPTAIN LOCK", accentText: "text-yellow-400", border: "border-yellow-400/30", bg: "bg-yellow-400/[0.05]" };
    case "breakout": return { emoji: "🟢", label: "MUST HAVE VALUE", accentText: "text-green-400", border: "border-green-500/30", bg: "bg-green-500/[0.05]" };
    case "trap": return { emoji: "🚨", label: "DO NOT START", accentText: "text-red-400", border: "border-red-500/30", bg: "bg-red-500/[0.05]" };
  }
}

function getPrimaryMetric(row: RankingRow, section: Section): { label: string; value: string; color: string } {
  switch (section) {
    case "captain": return { label: "Projection", value: fmtInt(row.projection_final), color: "text-yellow-400" };
    case "breakout": return { label: "Value Score", value: fmtValueScore(row.value_score), color: getValueScoreColor(row.value_score) };
    case "trap": return { label: "Risk", value: getRiskLabel(row.risk_rating), color: getRiskColor(row.risk_rating) };
  }
}

function getRecommendationLabel(section: Section): { label: string; color: string; bg: string; border: string } {
  switch (section) {
    case "captain": return { label: "START — Captain", color: "text-yellow-300", bg: "bg-yellow-400/10", border: "border-yellow-400/25" };
    case "breakout": return { label: "START — Value", color: "text-green-300", bg: "bg-green-500/10", border: "border-green-500/25" };
    case "trap": return { label: "FADE — Do Not Start", color: "text-red-300", bg: "bg-red-500/10", border: "border-red-500/25" };
  }
}

function buildConfidenceReasons(row: RankingRow, section: Section): string[] {
  const reasons: string[] = [];
  const conf = row.projection_confidence;
  if (conf != null) {
    if (conf >= 80) reasons.push("Model confidence is very high this round");
    else if (conf >= 65) reasons.push("Moderate-to-high model confidence");
    else reasons.push("Below-average model confidence — treat as speculative");
  }
  if (row.ceiling_estimate != null && row.projection_final != null) {
    const upside = row.ceiling_estimate - row.projection_final;
    if (upside >= 30) reasons.push(`${fmtInt(upside)} pt upside ceiling above projection`);
    else if (upside <= 5) reasons.push("Ceiling is tightly capped — limited upside");
  }
  if (section === "breakout" && row.value_score != null) {
    if (row.value_score >= 1.25) reasons.push("Exceptional value relative to price point");
    else if (row.value_score >= 1.10) reasons.push("Priced below projected output — value play");
  }
  if (section === "trap" && row.risk_rating != null) {
    if (row.risk_rating >= 35) reasons.push("Very high risk — multiple negative signals");
    else if (row.risk_rating >= 25) reasons.push("Elevated risk profile — caution advised");
  }
  if (row.neeko_rating != null) {
    if (row.neeko_rating >= 7.5) reasons.push(`Strong Neeko rating of ${row.neeko_rating.toFixed(1)}`);
    else if (row.neeko_rating < 5) reasons.push(`Low Neeko rating of ${row.neeko_rating.toFixed(1)} — weak signal`);
  }
  return reasons.length > 0 ? reasons : ["Based on combined projection and matchup modelling"];
}

// ─── Copy / Share helpers ─────────────────────────────────────────────────────

async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function buildShareText(row: RankingRow, section: Section): string {
  const conf = row.projection_confidence;
  const confStr = conf != null ? ` (${conf}% confidence)` : "";
  const oneLiner = row.ai_summary ? getOneLiner(row.ai_summary) : null;
  const reasonStr = oneLiner ? `\n"${oneLiner}"` : "";
  switch (section) {
    case "captain": return `🔥 AFL Fantasy Captain Pick (Neeko)\n${row.player_name} (${row.team}) — ${fmtInt(row.projection_final)} pts${confStr}${reasonStr}\n\nneekosports.com.au #AFLFantasy`;
    case "breakout": return `🟢 AFL Fantasy Value Play (Neeko)\n${row.player_name} (${row.team}) — Value Score ${fmtValueScore(row.value_score)}${confStr}${reasonStr}\n\nneekosports.com.au #AFLFantasy`;
    case "trap": return `🚨 AFL Fantasy Fade Alert (Neeko)\n${row.player_name} (${row.team}) — ${getRiskLabel(row.risk_rating)} Risk${confStr}${reasonStr}\n\nneekosports.com.au #AFLFantasy`;
  }
}

function buildRoundSummaryText(captain: RankingRow | null, value: RankingRow | null, trap: RankingRow | null): string {
  const lines: string[] = ["🔥 My AFL Fantasy Picks (Neeko)\n"];
  if (captain) lines.push(`C: ${captain.player_name} (${fmtInt(captain.projection_final)} pts)`);
  if (value) lines.push(`Value: ${value.player_name} — Score ${fmtValueScore(value.value_score)}`);
  if (trap) lines.push(`Avoid: ${trap.player_name} — ${getRiskLabel(trap.risk_rating)} risk`);
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

// ─── My Team Edge Section ─────────────────────────────────────────────────────

function MyTeamEdge({
  myTeam,
  onSetTeam,
  rows,
}: {
  myTeam: string | null;
  onSetTeam: (team: string) => void;
  rows: RankingRow[];
}) {
  const [selecting, setSelecting] = useState(false);

  if (!myTeam) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-4 mb-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] shrink-0">
            <Users size={14} className="text-white/30" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-white">Your Team Edge This Week</h3>
            <p className="text-[11px] text-white/35">Connect your team to get personalised picks</p>
          </div>
        </div>
        {!selecting ? (
          <button
            onClick={() => setSelecting(true)}
            className="mt-2 w-full py-2.5 rounded-xl border border-[#F5C84C]/30 bg-[#F5C84C]/[0.06] text-[12px] font-bold text-[#F5C84C]/80 hover:text-[#F5C84C] hover:border-[#F5C84C]/50 hover:bg-[#F5C84C]/10 transition-all"
          >
            Connect your team
          </button>
        ) : (
          <div className="mt-2">
            <p className="text-[10px] text-white/30 mb-2 uppercase tracking-widest">Select your AFL Fantasy team</p>
            <div className="grid grid-cols-3 gap-1.5">
              {AFL_TEAMS.map((t) => (
                <button
                  key={t}
                  onClick={() => { onSetTeam(t); setSelecting(false); }}
                  className="text-[10px] text-white/60 font-semibold px-2 py-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.06] hover:text-white hover:border-white/20 transition-all text-left truncate"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Filter rows relevant to team
  const teamCaptain = rows.find(r => r.section === "captain" && r.team === myTeam);
  const teamValue = rows.find(r => r.section === "breakout" && r.team === myTeam);
  const teamTrap = rows.find(r => r.section === "trap" && r.team === myTeam);
  const hasTeamPicks = teamCaptain || teamValue || teamTrap;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] px-5 py-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🏉</span>
          <div>
            <h3 className="text-[11px] font-extrabold text-white uppercase tracking-widest">Your Team Edge This Week</h3>
            <p className="text-[10px] text-white/35">{myTeam} players in this week's picks</p>
          </div>
        </div>
        <button
          onClick={() => onSetTeam("")}
          className="text-[10px] text-white/25 hover:text-white/50 transition-colors underline underline-offset-2"
        >
          Change
        </button>
      </div>

      {!hasTeamPicks ? (
        <p className="text-[12px] text-white/35 italic">No {myTeam} players featured in this week's top picks.</p>
      ) : (
        <div className="space-y-2">
          {teamCaptain && (
            <div className="flex items-center gap-3 rounded-xl border border-yellow-400/15 bg-yellow-400/[0.04] px-3 py-2.5">
              <span className="text-xs">🔥</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-yellow-400/70 uppercase tracking-widest">Captain Option</p>
                <p className="text-sm font-extrabold text-white truncate">{teamCaptain.player_name}</p>
              </div>
              <span className="text-[11px] text-white/50 shrink-0">{fmtInt(teamCaptain.projection_final)} pts</span>
            </div>
          )}
          {teamValue && (
            <div className="flex items-center gap-3 rounded-xl border border-green-500/15 bg-green-500/[0.04] px-3 py-2.5">
              <span className="text-xs">🟢</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-green-400/70 uppercase tracking-widest">Value Target</p>
                <p className="text-sm font-extrabold text-white truncate">{teamValue.player_name}</p>
              </div>
              <span className="text-[11px] text-white/50 shrink-0">Score {fmtValueScore(teamValue.value_score)}</span>
            </div>
          )}
          {teamTrap && (
            <div className="flex items-center gap-3 rounded-xl border border-red-500/15 bg-red-500/[0.04] px-3 py-2.5">
              <span className="text-xs">🚨</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-red-400/70 uppercase tracking-widest">Fade This Player</p>
                <p className="text-sm font-extrabold text-white truncate">{teamTrap.player_name}</p>
              </div>
              <span className="text-[11px] text-white/50 shrink-0">{getRiskLabel(teamTrap.risk_rating)} risk</span>
            </div>
          )}
        </div>
      )}
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
            "Full AI analysis for every player",
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
  const reco = getRecommendationLabel(section);
  const conf = row.projection_confidence;
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
  if (row.projection_final != null) keyFactors.push(`Projection: ${fmtInt(row.projection_final)} pts`);
  if (row.ceiling_estimate != null) keyFactors.push(`Ceiling: ${fmtInt(row.ceiling_estimate)} pts`);
  if (row.floor_estimate != null) keyFactors.push(`Floor: ${fmtInt(row.floor_estimate)} pts`);
  if (row.price != null) {
    const badge = fmtPriceChange(row.price_change);
    keyFactors.push(`Price: ${fmtPrice(row.price)}${badge ? ` (${badge})` : ""}`);
  }
  if (row.neeko_rating != null) keyFactors.push(`Neeko Rating: ${row.neeko_rating.toFixed(1)}`);

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150" />
      <div
        className={`relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border ${cfg.border} bg-[#0d0d0d] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in slide-in-from-bottom-6 sm:slide-in-from-bottom-2 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        {/* Header */}
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

          {/* Primary stat + confidence row */}
          <div className="flex items-center gap-4 mt-3">
            <div>
              <p className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">{metric.label}</p>
              <p className={`text-3xl font-extrabold tabular-nums leading-none ${metric.color}`}>{metric.value}</p>
            </div>
            {conf != null && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-black/30 self-end">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${conf >= 75 ? "bg-green-400" : conf >= 60 ? "bg-yellow-400" : "bg-orange-400"}`} />
                <span className={`text-[11px] font-bold ${getConfidenceColor(conf)}`}>{conf}% confidence</span>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Recommendation verdict */}
          <div className={`flex items-center gap-3 rounded-xl border ${reco.border} ${reco.bg} px-4 py-3`}>
            <div className="flex-1">
              <p className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">Recommendation</p>
              <p className={`text-sm font-extrabold ${reco.color}`}>{reco.label}</p>
            </div>
          </div>

          {/* Confidence breakdown */}
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

          {/* AI Analysis */}
          {isPremium ? (
            row.ai_summary ? (
              <div>
                <p className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${cfg.accentText} opacity-70`}>AI Analysis</p>
                <p className="text-[13px] text-white/75 leading-relaxed">{cleanAiText(row.ai_summary)}</p>
              </div>
            ) : (
              <p className="text-sm text-white/30 italic">No analysis available yet.</p>
            )
          ) : (
            <div className="rounded-xl border border-[#F5C84C]/20 bg-[#F5C84C]/[0.04] p-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#F5C84C]/50 mb-2">AI Analysis</p>
              <div className="relative mb-3">
                <p className="text-[13px] text-white/20 leading-relaxed select-none blur-[4px] pointer-events-none line-clamp-4">
                  Advanced ceiling modelling and matchup delta scoring indicates significant upside leverage this round. Opponent concession profile aligns strongly with this player's scoring patterns over the last 4 weeks, while position scarcity and role stability add further confidence to the projection.
                </p>
              </div>
              <button
                onClick={onUpgrade}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#F5C84C]/10 border border-[#F5C84C]/25 text-[12px] font-bold text-[#F5C84C]/80 hover:text-[#F5C84C] hover:border-[#F5C84C]/45 hover:bg-[#F5C84C]/15 transition-all"
              >
                <Lock size={10} />
                Unlock with Neeko+
              </button>
            </div>
          )}

          {/* Key factors */}
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

        {/* Footer CTA */}
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
              title="Share on WhatsApp"
            >
              <span className="text-[11px]">WhatsApp</span>
            </button>
            <button
              onClick={handleTwitter}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-[12px] font-semibold text-white/40 hover:text-white/70 hover:border-white/20 hover:bg-white/[0.05] transition-all"
              title="Share on X"
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
  row: RankingRow;
  section: Section;
  isPremium: boolean;
  onOpen: (row: RankingRow, section: Section) => void;
}

function HeroPickCard({ row, section, isPremium, onOpen }: HeroPickCardProps) {
  const cfg = getSectionLabel(section);
  const metric = getPrimaryMetric(row, section);
  const conf = row.projection_confidence;
  const oneLiner = row.ai_summary ? truncateWords(getOneLiner(row.ai_summary), 9) : null;
  const isCaptain = section === "captain";

  return (
    <button
      className={`relative flex flex-col w-full rounded-2xl border ${cfg.border} ${cfg.bg} overflow-hidden text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${isCaptain ? "ring-1 ring-yellow-400/20" : ""}`}
      onClick={() => onOpen(row, section)}
    >
      {/* Captain pulse dot */}
      {isCaptain && (
        <span className="absolute top-3 right-3 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-50" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400/70" />
        </span>
      )}

      {/* Label */}
      <div className="px-4 pt-4 pb-2">
        <span className={`text-[10px] font-extrabold tracking-widest uppercase ${cfg.accentText}`}>
          {cfg.emoji} {cfg.label}
        </span>
      </div>

      {/* Player */}
      <div className="px-4 pb-3 border-b border-white/[0.06]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-xl font-extrabold text-white leading-tight">{row.player_name}</h3>
            <p className="text-xs text-white/40 mt-0.5">{row.team}</p>
          </div>
          {row.position && (
            <span className={`mt-1 shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${getPositionBadgeStyle(row.position)}`}>
              {row.position}
            </span>
          )}
        </div>
      </div>

      {/* Stat + confidence */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div>
          <p className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">{metric.label}</p>
          <p className={`text-3xl font-extrabold tabular-nums leading-none ${metric.color}`}>{metric.value}</p>
        </div>
        {conf != null && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] self-end">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${conf >= 75 ? "bg-green-400" : conf >= 60 ? "bg-yellow-400" : "bg-orange-400"}`} />
            <span className={`text-[10px] font-bold ${getConfidenceColor(conf)}`}>{conf}% conf</span>
          </div>
        )}
        {row.price != null && (
          <div className="ml-auto text-right shrink-0">
            <p className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">Price</p>
            <p className="text-sm font-semibold text-white/60 tabular-nums">{fmtPrice(row.price)}</p>
            {(() => {
              const badge = fmtPriceChange(row.price_change);
              if (!badge) return null;
              const isUp = (row.price_change ?? 0) > 0;
              return <p className={`text-[9px] font-semibold tabular-nums ${isUp ? "text-emerald-400" : "text-red-400"}`}>{badge}</p>;
            })()}
          </div>
        )}
      </div>

      {/* One-liner */}
      <div className="px-4 pb-3 flex-1">
        {isPremium && oneLiner ? (
          <p className="text-[11px] text-white/50 leading-snug line-clamp-1">{oneLiner}</p>
        ) : !isPremium ? (
          <div className="flex items-center gap-1.5">
            <Lock size={9} className="text-[#F5C84C]/40 shrink-0" />
            <span className="text-[10px] text-[#F5C84C]/45">Reasoning locked — Neeko+</span>
          </div>
        ) : null}
      </div>

      {/* View Analysis CTA */}
      <div className="px-4 pb-4">
        <div className={`flex items-center justify-between w-full px-3 py-2 rounded-xl border ${cfg.border} bg-white/[0.04] hover:bg-white/[0.07] transition-colors`}>
          <span className={`text-[11px] font-bold ${cfg.accentText}`}>View Analysis</span>
          <ChevronRight size={13} className={cfg.accentText} />
        </div>
      </div>
    </button>
  );
}

// ─── Bullet List Section ──────────────────────────────────────────────────────

interface BulletListSectionProps {
  title: string;
  emoji: string;
  accentText: string;
  rows: RankingRow[];
  section: Section;
  onOpen: (row: RankingRow, section: Section) => void;
}

function BulletListSection({ title, emoji, accentText, rows, section, onOpen }: BulletListSectionProps) {
  if (rows.length === 0) return null;

  return (
    <div>
      <p className={`text-[11px] font-bold uppercase tracking-widest mb-2 ${accentText}`}>
        {emoji} {title}
      </p>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04] overflow-hidden">
        {rows.map((row) => {
          const stat =
            section === "captain"
              ? `${fmtInt(row.projection_final)} pts`
              : section === "breakout"
              ? `Value ${fmtValueScore(row.value_score)}`
              : `${getRiskLabel(row.risk_rating)} risk`;
          const confStr = row.projection_confidence != null ? ` · ${row.projection_confidence}% conf` : "";

          return (
            <button
              key={row.player_id ?? row.player_name}
              className="flex items-center gap-3 w-full px-4 py-3 hover:bg-white/[0.04] transition-colors text-left"
              onClick={() => onOpen(row, section)}
            >
              <span className="text-white/20 text-sm shrink-0">•</span>
              <span className="text-sm text-white font-semibold flex-1">{row.player_name}</span>
              <span className="text-[11px] text-white/40 shrink-0">{stat}{confStr}</span>
              <ChevronRight size={11} className="text-white/20 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Locked Pick Row ──────────────────────────────────────────────────────────

function LockedPickRow({ section, rank, onUnlock }: { section: "captain" | "value" | "trap"; rank: number; onUnlock: () => void }) {
  const accent =
    section === "captain" ? { border: "border-yellow-400/10", label: `#${rank} Captain` }
    : section === "value"  ? { border: "border-green-500/10",  label: `#${rank} Value` }
    :                        { border: "border-red-500/10",     label: `#${rank} Trap` };

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border ${accent.border} bg-white/[0.015] px-4 py-3 cursor-pointer hover:bg-white/[0.025] transition-colors`}
      onClick={onUnlock}
    >
      <div className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-white/[0.03] border border-white/[0.06]">
        <Lock size={9} className="text-white/20" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-white/25 mb-0.5">{accent.label}</p>
        <div className="h-2.5 w-28 rounded bg-white/[0.06] animate-pulse" />
      </div>
      <div className="shrink-0 text-right space-y-1">
        <div className="h-2 w-10 rounded bg-white/[0.05] ml-auto" />
        <div className="h-2 w-6 rounded bg-white/[0.04] ml-auto" />
      </div>
    </div>
  );
}

// ─── Free Paywall ─────────────────────────────────────────────────────────────

function FreePaywall({ onUnlock, captainCount, valueCount, trapCount }: { onUnlock: () => void; captainCount: number; valueCount: number; trapCount: number }) {
  const totalLocked = captainCount + valueCount + trapCount;
  return (
    <div className="rounded-2xl border border-[#F5C84C]/25 bg-gradient-to-b from-[#F5C84C]/[0.06] to-[#F5C84C]/[0.01] px-5 py-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl border border-[#F5C84C]/30 bg-[#F5C84C]/10 shrink-0">
          <Lock size={14} className="text-[#F5C84C]" />
        </div>
        <div>
          <h3 className="text-sm font-extrabold text-white leading-tight">Unlock {totalLocked} more picks</h3>
          <p className="text-[11px] text-white/40 mt-0.5">
            {captainCount > 0 && `${captainCount} captain`}{captainCount > 0 && valueCount > 0 && " · "}{valueCount > 0 && `${valueCount} value`}{(captainCount > 0 || valueCount > 0) && trapCount > 0 && " · "}{trapCount > 0 && `${trapCount} trap`}
          </p>
        </div>
        <a href="/neeko-plus" className="ml-auto shrink-0 bg-[#F5C84C] text-black font-bold text-xs px-4 py-2 rounded-lg hover:brightness-110 transition-all whitespace-nowrap">
          Unlock Neeko+
        </a>
      </div>
      <div className="space-y-2">
        {Array.from({ length: captainCount }).map((_, i) => <LockedPickRow key={`cap-${i}`} section="captain" rank={i + 2} onUnlock={onUnlock} />)}
        {Array.from({ length: valueCount }).map((_, i) => <LockedPickRow key={`val-${i}`} section="value" rank={i + 2} onUnlock={onUnlock} />)}
        {Array.from({ length: trapCount }).map((_, i) => <LockedPickRow key={`trap-${i}`} section="trap" rank={i + 2} onUnlock={onUnlock} />)}
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.05]">
        <span className="text-[10px] text-white/25">From $9.99/mo</span>
        <button onClick={onUnlock} className="text-[11px] text-[#F5C84C]/50 hover:text-[#F5C84C]/80 transition-colors underline underline-offset-2">
          See what's included
        </button>
      </div>
    </div>
  );
}

// ─── Round Summary Share Panel ─────────────────────────────────────────────────

function RoundSummaryShare({ captain, value, trap }: { captain: RankingRow | null; value: RankingRow | null; trap: RankingRow | null }) {
  const [copied, setCopied] = useState(false);
  const summaryText = buildRoundSummaryText(captain, value, trap);

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
        {captain && (
          <div className="flex items-center gap-2">
            <span className="text-[10px]">🔥</span>
            <span className="text-[12px] text-white/60">C: <span className="text-white font-semibold">{captain.player_name}</span> ({fmtInt(captain.projection_final)} pts)</span>
          </div>
        )}
        {value && (
          <div className="flex items-center gap-2">
            <span className="text-[10px]">🟢</span>
            <span className="text-[12px] text-white/60">Value: <span className="text-white font-semibold">{value.player_name}</span> — Score {fmtValueScore(value.value_score)}</span>
          </div>
        )}
        {trap && (
          <div className="flex items-center gap-2">
            <span className="text-[10px]">🚨</span>
            <span className="text-[12px] text-white/60">Avoid: <span className="text-white font-semibold">{trap.player_name}</span> — {getRiskLabel(trap.risk_rating)} risk</span>
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

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="h-8 w-56 rounded-xl bg-white/5 animate-pulse" />
        <div className="h-4 w-72 rounded-lg bg-white/5 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
          {[1, 2, 3].map((i) => <div key={i} className="h-52 rounded-2xl bg-white/[0.03] animate-pulse" />)}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AFLRoundEdgeBoard() {
  const { isPremium } = useAuth();
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  // Modal state
  const [activeModal, setActiveModal] = useState<{ row: RankingRow; section: Section } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Free user interaction gate: 1 free open, then paywall
  const freeOpenCount = useRef(0);

  const relativeTime = useRelativeTime(refreshedAt);

  useEffect(() => { track("edge_board_view"); }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rpcResult, accResult] = await Promise.all([
        supabase.rpc("get_edge_board_data", { limit_n: isPremium ? 5 : 4 }),
        supabase.from("v_projection_accuracy_homepage").select("within_20").maybeSingle(),
      ]);

      if (rpcResult.error) throw rpcResult.error;
      const mapped = ((rpcResult.data as any[]) ?? [])
        .filter((r: any) =>
          r.player_name &&
          r.team &&
          Number(r.projection_final ?? 0) > 0 &&
          Number(r.price ?? 0) > 0 &&
          Number(r.value_score ?? 0) > 0,
        )
        .map((r: any): RankingRow => ({
        player_id:             r.player_id ?? null,
        player_name:           r.player_name ?? "",
        team:                  r.team ?? "",
        position:              r.position ?? null,
        section:               r.section ?? "",
        section_rank:          r.section_rank ?? 0,
        projection_final:      r.projection_final != null ? Number(r.projection_final) : null,
        ceiling_estimate:      r.ceiling_estimate != null ? Number(r.ceiling_estimate) : null,
        floor_estimate:        r.floor_estimate != null ? Number(r.floor_estimate) : null,
        upside_rating:         r.upside_rating != null ? Number(r.upside_rating) : null,
        risk_rating:           r.risk_rating != null ? Number(r.risk_rating) : null,
        projection_confidence: r.projection_confidence != null ? Number(r.projection_confidence) : null,
        captain_score:         r.captain_score != null ? Number(r.captain_score) : null,
        captain_rating:        r.captain_rating ?? null,
        neeko_rating:          r.neeko_rating != null ? Number(r.neeko_rating) : null,
        price:                 r.price != null ? Number(r.price) : null,
        price_change:          r.price_change != null ? Number(r.price_change) : null,
        value_score:           r.value_score != null ? Number(r.value_score) : null,
        value_tag:             r.value_tag ?? null,
        ai_summary:            r.ai_summary ?? null,
        recommendation_color:  r.recommendation_color ?? null,
        refreshed_at:          r.refreshed_at ?? null,
        edge_score:            r.edge_score != null ? Number(r.edge_score) : null,
        edge_tier:             r.edge_tier ?? null,
      }));
      setRows(mapped);
      setRefreshedAt(mapped[0]?.refreshed_at ?? null);

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
  }, [isPremium]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    function onPricesApplied() {
      console.log("[EdgeBoard] neeko:prices-applied received — refetching");
      fetchData();
    }
    window.addEventListener("neeko:prices-applied", onPricesApplied);
    return () => window.removeEventListener("neeko:prices-applied", onPricesApplied);
  }, [fetchData]);

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

  function handleCloseModal() {
    setActiveModal(null);
  }

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

  const captainRows  = rows.filter(r => r.section === "captain").sort((a, b) => Number(a.section_rank) - Number(b.section_rank));
  const breakoutRows = rows.filter(r => r.section === "breakout").sort((a, b) => Number(a.section_rank) - Number(b.section_rank));
  const trapRows     = rows.filter(r => r.section === "trap").sort((a, b) => Number(a.section_rank) - Number(b.section_rank));

  const captainPick = captainRows[0] ?? null;
  const valuePick   = breakoutRows[0] ?? null;
  const trapPick    = trapRows[0] ?? null;

  const heroPicks: { row: RankingRow; section: Section }[] = [];
  if (captainPick) heroPicks.push({ row: captainPick, section: "captain" });
  if (valuePick)   heroPicks.push({ row: valuePick,   section: "breakout" });
  if (trapPick)    heroPicks.push({ row: trapPick,    section: "trap" });

  const captainSecondary  = captainRows.slice(1, 1 + PREMIUM_SECONDARY);
  const breakoutSecondary = breakoutRows.slice(1, 1 + PREMIUM_SECONDARY);
  const trapSecondary     = trapRows.slice(1, 1 + PREMIUM_SECONDARY);
  const hasSecondary = captainSecondary.length > 0 || breakoutSecondary.length > 0 || trapSecondary.length > 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="mb-5">
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
          <h1 className="text-2xl font-extrabold text-white leading-tight">This Week's Picks</h1>
          <p className="text-sm text-white/40 mt-1">
            Captain lock, best value, and who to fade — decided by the model.
          </p>

          {/* Meta row: updated + trust + countdown */}
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

        {/* ── Hero Picks ───────────────────────────────────────────────────── */}
        {heroPicks.length > 0 && (
          <div className="mb-5">
            <div className={`grid gap-4 ${heroPicks.length === 3 ? "grid-cols-1 sm:grid-cols-3" : heroPicks.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 max-w-sm"}`}>
              {heroPicks.map(({ row, section }) => (
                <HeroPickCard
                  key={section}
                  row={row}
                  section={section}
                  isPremium={isPremium}
                  onOpen={handleOpenModal}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Share section ────────────────────────────────────────────────── */}
        {heroPicks.length > 0 && (
          <div className="mb-6">
            <RoundSummaryShare captain={captainPick} value={valuePick} trap={trapPick} />
          </div>
        )}

        {/* ── Free paywall ─────────────────────────────────────────────────── */}
        {!isPremium && (
          <div className="mb-6">
            <FreePaywall
              onUnlock={() => setShowUpgradeModal(true)}
              captainCount={2}
              valueCount={2}
              trapCount={2}
            />
          </div>
        )}

        {/* ── Premium: More Plays This Round ───────────────────────────────── */}
        {isPremium && hasSecondary && (
          <div className="mt-2">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-[11px] font-bold text-white uppercase tracking-widest">More Plays This Round</h2>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="space-y-4">
              <BulletListSection title="Other Captain Options" emoji="🔥" accentText="text-yellow-400" rows={captainSecondary} section="captain" onOpen={handleOpenModal} />
              <BulletListSection title="Other Value Plays" emoji="🟢" accentText="text-green-400" rows={breakoutSecondary} section="breakout" onOpen={handleOpenModal} />
              <BulletListSection title="Other Traps" emoji="🚨" accentText="text-red-400" rows={trapSecondary} section="trap" onOpen={handleOpenModal} />
            </div>
          </div>
        )}

        <div className="mt-10 pb-8 border-t border-white/[0.04] pt-4">
          <p className="text-[10px] text-white/20 text-center tracking-wide">
            Picks derived from the Neeko projection engine — blended rolling baseline with dynamic round weighting.
          </p>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
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
  );
}
