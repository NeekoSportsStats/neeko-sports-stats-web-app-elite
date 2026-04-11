import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  TriangleAlert as AlertTriangle,
  Crown,
  Zap,
  Lock,
  Star,
  Clock,
  ChartBar as BarChart2,
  ArrowRight,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Flame,
  DollarSign,
  Sprout,
  X,
  Search,
  ChevronUp,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import {
  fmt,
  fmtPrice,
  fmtUpdatedAt,
  getConfidenceLabel,
  getConfidenceColor,
} from "@/features/afl/rankings/components/helpers";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import { PlayerDetailModal, UpgradeModal } from "@/features/afl/rankings/components/RankingsModals";
import { PlayerStatusPill } from "@/features/afl/rankings/components/PlayerStatusPill";
import type { RowTier } from "@/features/afl/rankings/components/types";
import { buildCurrentRoundPlayers, type CurrentRoundPlayer } from "@/features/afl/current-round/engine";

// ─── LIMITS ──────────────────────────────────────────────────────────────────
const MUST_BUY_FREE    = 2;
const TRAP_FREE        = 2;
const CAPTAIN_FREE     = 1;
const CASH_COW_GAMES   = 8;
const PREMIUM_LIMIT    = 8;

function normalisePosition(pos: string | null | undefined): string | null {
  if (!pos) return null;
  const p = pos.toUpperCase().trim();
  if (p === "MID" || p === "MIDFIELDER") return "MID";
  if (p === "FWD" || p === "FORWARD") return "FWD";
  if (p === "DEF" || p === "DEFENDER") return "DEF";
  if (p === "RUC" || p === "RUCK") return "RUC";
  return p;
}

// ─── BADGE COMPONENTS ────────────────────────────────────────────────────────

function BuyBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded border border-green-500/40 bg-green-500/15 text-green-400 shrink-0 leading-none">
      <TrendingUp className="w-2.5 h-2.5" />
      BUY
    </span>
  );
}

function AvoidBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded border border-red-500/40 bg-red-500/15 text-red-400 shrink-0 leading-none">
      <AlertTriangle className="w-2.5 h-2.5" />
      AVOID
    </span>
  );
}

function CaptainBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded border border-yellow-400/40 bg-yellow-400/15 text-yellow-400 shrink-0 leading-none">
      <Crown className="w-2.5 h-2.5" />
      CAPTAIN
    </span>
  );
}

function CashCowBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded border border-emerald-400/40 bg-emerald-400/15 text-emerald-400 shrink-0 leading-none">
      <Sprout className="w-2.5 h-2.5" />
      CASH COW
    </span>
  );
}

function FeaturedBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded border border-orange-400/40 bg-orange-400/10 text-orange-400 shrink-0 leading-none">
      <Flame className="w-2.5 h-2.5" />
      Edge Pick
    </span>
  );
}

// ─── SUMMARY STRIP CARD ──────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  icon: React.ReactNode;
  accentColor: string;
  playerName: string | null;
  stat: string;
  statLabel: string;
  reason: string | null;
  badge?: React.ReactNode;
}

function SummaryCard({ label, icon, accentColor, playerName, stat, statLabel, reason, badge }: SummaryCardProps) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2 transition-all duration-200"
      style={{
        background: `linear-gradient(135deg, ${accentColor}09 0%, transparent 70%)`,
        border: `1px solid ${accentColor}30`,
      }}
    >
      <div className="flex items-center gap-1.5">
        <span style={{ color: accentColor }}>{icon}</span>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-white/30">{label}</span>
      </div>
      <div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-base font-bold text-white leading-tight truncate">{playerName ?? "—"}</span>
          {badge}
        </div>
        {reason && (
          <p className="text-[11px] text-white/35 mt-1 leading-relaxed line-clamp-2">{reason}</p>
        )}
      </div>
      <div className="flex items-baseline gap-1 mt-auto">
        <span className="text-2xl font-bold tabular-nums" style={{ color: accentColor }}>{stat}</span>
        <span className="text-[10px] text-white/25">{statLabel}</span>
      </div>
    </div>
  );
}

// ─── PLAYER ROW ──────────────────────────────────────────────────────────────

interface PlayerRowProps {
  row: CurrentRoundPlayer;
  rank: number;
  badge?: React.ReactNode;
  metric?: React.ReactNode;
  subtext?: string | null;
  onClick: () => void;
}

function PlayerRow({ row, rank, badge, metric, subtext, onClick }: PlayerRowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/[0.05] transition-all duration-150 group"
    >
      <span className="text-[11px] text-white/20 w-4 text-right shrink-0 font-mono tabular-nums">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-white truncate leading-tight">{row.player_name}</span>
          {badge}
          {row.isFeaturedPick && <FeaturedBadge />}
          <PlayerStatusPill row={row} showUpcomingBye />
        </div>
        <div className="text-[10px] text-white/30 mt-px">
          {normalisePosition(row.position) ?? "—"} · {row.team}
          {row.price ? ` · ${fmtPrice(row.price)}` : ""}
          {subtext ? ` · ${subtext}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {metric}
        <div className="text-right">
          <div className="text-sm font-bold text-white tabular-nums">{fmt(row.projection, 0)}</div>
          <div className="text-[9px] text-white/25">proj</div>
        </div>
        <ChevronRight className="w-3 h-3 text-white/15 group-hover:text-white/40 transition-colors" />
      </div>
    </button>
  );
}

// ─── LOCKED ROW ──────────────────────────────────────────────────────────────

function BlurredRow({ rank }: { rank: number }) {
  return (
    <div className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg select-none pointer-events-none">
      <span className="text-[11px] text-white/20 w-4 text-right shrink-0 font-mono tabular-nums">{rank}</span>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <Lock className="w-3 h-3 text-white/15 shrink-0" />
        <div className="h-2.5 w-28 rounded bg-white/[0.06]" />
      </div>
      <div className="h-2.5 w-10 rounded bg-white/[0.04]" />
    </div>
  );
}

// ─── LOCK STRIP CTA ──────────────────────────────────────────────────────────

function LockStripCTA({
  hiddenCount,
  accentColor,
  onUpgrade,
  ctaLabel,
  badgeText,
}: {
  hiddenCount: number;
  accentColor: string;
  onUpgrade: () => void;
  ctaLabel?: string;
  badgeText?: string;
}) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <>
      <div
        className="absolute inset-0 rounded-b-xl pointer-events-none"
        style={{ background: "linear-gradient(to bottom, transparent 0%, #0a0a0acc 55%, #0a0a0af5 100%)" }}
      />
      <div className="absolute bottom-0 left-0 right-0 z-10 px-3 pb-3">
        <button
          onClick={onUpgrade}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200"
          style={{
            background: "rgba(255,255,255,0.025)",
            border: `1px solid ${hovered ? `${accentColor}30` : "rgba(255,255,255,0.06)"}`,
            transform: hovered ? "translateY(-1px)" : "translateY(0)",
          }}
        >
          <span className="flex items-center gap-1.5 text-[11px] text-white/40">
            <Lock className="w-3 h-3 shrink-0" style={{ color: `${accentColor}70` }} />
            {badgeText ?? `+${hiddenCount} picks hidden`}
          </span>
          <span
            className="flex items-center gap-1 text-[12px] font-semibold"
            style={{ color: accentColor, opacity: hovered ? 0.9 : 0.75 }}
          >
            {ctaLabel ?? "Unlock full list →"}
          </span>
        </button>
      </div>
    </>
  );
}

// ─── SECTION CARD ────────────────────────────────────────────────────────────

interface SectionCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  accentColor: string;
  players: CurrentRoundPlayer[];
  freeLimit: number;
  isPremiumUser: boolean;
  onOpenRow: (row: CurrentRoundPlayer, rank: number) => void;
  onUpgrade: () => void;
  blurCtaLabel?: string;
  blurBadgeText?: string;
  footerLink?: { label: string; to: string };
  renderBadge?: (row: CurrentRoundPlayer) => React.ReactNode;
  renderMetric?: (row: CurrentRoundPlayer) => React.ReactNode;
  renderSubtext?: (row: CurrentRoundPlayer) => string | null;
}

function SectionCard({
  title,
  description,
  icon,
  accentColor,
  players,
  freeLimit,
  isPremiumUser,
  onOpenRow,
  onUpgrade,
  blurCtaLabel,
  blurBadgeText,
  footerLink,
  renderBadge,
  renderMetric,
  renderSubtext,
}: SectionCardProps) {
  const [hovered, setHovered] = useState(false);
  const limit = isPremiumUser ? PREMIUM_LIMIT : freeLimit;
  const visible = players.slice(0, limit);
  const hidden = isPremiumUser ? [] : players.slice(freeLimit, Math.min(PREMIUM_LIMIT, players.length));
  const totalHidden = isPremiumUser ? 0 : Math.max(0, players.length - freeLimit);

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col transition-all duration-200"
      style={{
        border: `1px solid ${hovered ? `${accentColor}60` : `${accentColor}30`}`,
        background: `linear-gradient(135deg, ${accentColor}06 0%, transparent 60%)`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="px-4 pt-3.5 pb-2.5" style={{ borderBottom: `1px solid ${accentColor}18` }}>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
          <span style={{ color: accentColor }}>{icon}</span>
          <h2 className="text-sm font-bold text-white flex-1">{title}</h2>
          {!isPremiumUser && totalHidden > 0 && (
            <span className="text-[10px] text-white/25">{freeLimit} of {players.length}</span>
          )}
        </div>
        <p className="text-[11px] text-white/35 mt-1 ml-4 leading-relaxed">{description}</p>
      </div>

      <div className="flex-1 py-1">
        {visible.map((row, idx) => (
          <PlayerRow
            key={row.player_id ?? idx}
            row={row}
            rank={idx + 1}
            badge={renderBadge ? renderBadge(row) : undefined}
            metric={renderMetric ? renderMetric(row) : undefined}
            subtext={renderSubtext ? renderSubtext(row) : null}
            onClick={() => onOpenRow(row, idx + 1)}
          />
        ))}

        {hidden.length > 0 && (
          <div className="relative pb-12">
            {hidden.map((row, idx) => (
              <BlurredRow key={row.player_id ?? idx} rank={freeLimit + idx + 1} />
            ))}
            <LockStripCTA
              hiddenCount={totalHidden}
              accentColor={accentColor}
              onUpgrade={onUpgrade}
              ctaLabel={blurCtaLabel}
              badgeText={blurBadgeText}
            />
          </div>
        )}
      </div>

      {footerLink && (
        <div className="px-4 py-2.5" style={{ borderTop: `1px solid ${accentColor}12` }}>
          <Link
            to={footerLink.to}
            className="flex items-center gap-1 text-[11px] transition-colors"
            style={{ color: `${accentColor}60` }}
            onMouseEnter={(e) => (e.currentTarget.style.color = `${accentColor}99`)}
            onMouseLeave={(e) => (e.currentTarget.style.color = `${accentColor}60`)}
          >
            {footerLink.label}
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── START/SIT MODAL ─────────────────────────────────────────────────────────

interface StartSitModalProps {
  players: RankingRow[];
  onClose: () => void;
  onOpenPlayer: (row: RankingRow) => void;
}

function StartSitModal({ players, onClose, onOpenPlayer }: StartSitModalProps) {
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [playerA, setPlayerA] = useState<RankingRow | null>(null);
  const [playerB, setPlayerB] = useState<RankingRow | null>(null);

  const availablePlayers = useMemo(
    () => players.filter((p) => !p.is_injured && !p.is_bye && p.projection != null),
    [players]
  );

  function filterOptions(query: string, exclude: RankingRow | null): RankingRow[] {
    if (query.length < 2) return [];
    const q = query.toLowerCase();
    return availablePlayers
      .filter((p) => p.player_id !== exclude?.player_id && p.player_name.toLowerCase().includes(q))
      .slice(0, 8);
  }

  const optionsA = filterOptions(searchA, playerB);
  const optionsB = filterOptions(searchB, playerA);

  const result = useMemo(() => {
    if (!playerA || !playerB) return null;
    const projA = playerA.projection ?? 0;
    const projB = playerB.projection ?? 0;
    const edgeA = playerA.edge ?? 0;
    const edgeB = playerB.edge ?? 0;
    const confA = playerA.projection_confidence ?? 50;
    const confB = playerB.projection_confidence ?? 50;

    const scoreA = projA * 0.55 + edgeA * 0.25 + confA * 0.2;
    const scoreB = projB * 0.55 + edgeB * 0.25 + confB * 0.2;
    const diff = Math.abs(projA - projB);

    const winner = scoreA >= scoreB ? playerA : playerB;
    const loser  = scoreA >= scoreB ? playerB : playerA;

    let reason = "";
    if (diff <= 5) {
      reason = `Both players project similarly. ${winner.player_name} edges ahead on confidence and edge score — narrow call.`;
    } else {
      const projWinner = winner.projection ?? 0;
      const edgeWinner = winner.edge ?? 0;
      reason = `${winner.player_name} projects ${fmt(projWinner, 0)} pts`;
      if (edgeWinner > 5) reason += ` with a +${fmt(edgeWinner, 0)} edge above breakeven`;
      else if (edgeWinner < -5) reason += ` — note negative edge`;
      reason += `. ${loser.player_name} projects ${fmt(loser.projection, 0)} pts`;
      if ((loser.projection_confidence ?? 0) < 55) reason += " with moderate confidence.";
      else reason += ".";
    }

    return { winner, loser, reason };
  }, [playerA, playerB]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "#0e0e0e", border: "1px solid rgba(255,255,255,0.10)", maxHeight: "90vh" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#F5C84C]" />
            <h2 className="text-sm font-bold text-white">Compare Players</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-white/70 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Player A */}
          <PlayerSearchSlot
            label="Player A"
            accentColor="#3b82f6"
            query={searchA}
            onQueryChange={setSearchA}
            selected={playerA}
            onSelect={(p) => { setPlayerA(p); setSearchA(""); }}
            onClear={() => setPlayerA(null)}
            options={optionsA}
            onOpenPlayer={onOpenPlayer}
          />

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[10px] uppercase tracking-wider text-white/25 font-semibold">vs</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          {/* Player B */}
          <PlayerSearchSlot
            label="Player B"
            accentColor="#f87171"
            query={searchB}
            onQueryChange={setSearchB}
            selected={playerB}
            onSelect={(p) => { setPlayerB(p); setSearchB(""); }}
            onClear={() => setPlayerB(null)}
            options={optionsB}
            onOpenPlayer={onOpenPlayer}
          />

          {/* Result */}
          {result && (
            <div
              className="rounded-xl p-4 space-y-2"
              style={{ background: "rgba(245,200,76,0.05)", border: "1px solid rgba(245,200,76,0.20)" }}
            >
              <div className="flex items-center gap-2">
                <Crown className="w-3.5 h-3.5 text-[#F5C84C]" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#F5C84C]">Start This Week</span>
              </div>
              <p className="text-lg font-bold text-white">{result.winner.player_name}</p>
              <p className="text-[12px] text-white/45 leading-relaxed">{result.reason}</p>
              <div className="flex items-center gap-4 pt-1">
                <div className="text-center">
                  <div className="text-base font-bold text-[#F5C84C] tabular-nums">{fmt(result.winner.projection, 0)}</div>
                  <div className="text-[9px] text-white/25">proj pts</div>
                </div>
                {result.winner.edge != null && (
                  <div className="text-center">
                    <div className={`text-base font-bold tabular-nums ${(result.winner.edge ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {(result.winner.edge ?? 0) >= 0 ? "+" : ""}{fmt(result.winner.edge, 0)}
                    </div>
                    <div className="text-[9px] text-white/25">edge</div>
                  </div>
                )}
                {result.winner.projection_confidence != null && (
                  <div className="text-center">
                    <div className={`text-base font-bold tabular-nums ${getConfidenceColor(result.winner.projection_confidence)}`}>
                      {fmt(result.winner.projection_confidence, 0)}%
                    </div>
                    <div className="text-[9px] text-white/25">confidence</div>
                  </div>
                )}
              </div>
              <div className="pt-1 border-t border-white/[0.06]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-white/25 font-semibold uppercase tracking-wider">Sit:</span>
                  <span className="text-[12px] text-white/35">{result.loser.player_name} — {fmt(result.loser.projection, 0)} pts projected</span>
                </div>
              </div>
            </div>
          )}

          {playerA && playerB && !result && (
            <div className="rounded-xl p-4 text-center" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-[12px] text-white/30">Processing comparison...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PLAYER SEARCH SLOT ──────────────────────────────────────────────────────

interface PlayerSearchSlotProps {
  label: string;
  accentColor: string;
  query: string;
  onQueryChange: (q: string) => void;
  selected: RankingRow | null;
  onSelect: (p: RankingRow) => void;
  onClear: () => void;
  options: RankingRow[];
  onOpenPlayer: (p: RankingRow) => void;
}

function PlayerSearchSlot({ label, accentColor, query, onQueryChange, selected, onSelect, onClear, options, onOpenPlayer }: PlayerSearchSlotProps) {
  if (selected) {
    return (
      <div
        className="rounded-xl p-3 flex items-center gap-3"
        style={{ background: `${accentColor}10`, border: `1px solid ${accentColor}30` }}
      >
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: accentColor }}>{label}</div>
          <div className="text-sm font-bold text-white mt-0.5 truncate">{selected.player_name}</div>
          <div className="text-[10px] text-white/30 mt-px">
            {normalisePosition(selected.position)} · {selected.team} · {fmt(selected.projection, 0)} pts proj
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onOpenPlayer(selected)}
            className="text-[10px] font-semibold transition-colors"
            style={{ color: `${accentColor}70` }}
          >
            Details
          </button>
          <button
            onClick={onClear}
            className="p-1 rounded hover:bg-white/[0.08] text-white/25 hover:text-white/50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className="rounded-xl flex items-center gap-2 px-3 py-2.5"
        style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${accentColor}25` }}
      >
        <Search className="w-3.5 h-3.5 shrink-0" style={{ color: `${accentColor}60` }} />
        <div className="flex-1">
          <div className="text-[9px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: `${accentColor}70` }}>{label}</div>
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search player name..."
            className="w-full bg-transparent text-sm text-white placeholder-white/20 outline-none leading-tight"
          />
        </div>
      </div>
      {options.length > 0 && (
        <div
          className="absolute z-20 top-full left-0 right-0 mt-1 rounded-xl overflow-hidden"
          style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.10)" }}
        >
          {options.map((p) => (
            <button
              key={p.player_id}
              onClick={() => onSelect(p)}
              className="w-full text-left px-3 py-2 hover:bg-white/[0.06] transition-colors flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">{p.player_name}</div>
                <div className="text-[10px] text-white/30">{normalisePosition(p.position)} · {p.team}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-white tabular-nums">{fmt(p.projection, 0)}</div>
                <div className="text-[9px] text-white/25">proj</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── COLLAPSIBLE SEO ─────────────────────────────────────────────────────────

function CollapsibleSEO({ roundLabel, roundNum }: { roundLabel: string; roundNum: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/[0.06] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
        aria-expanded={open}
      >
        <span className="text-[12px] text-white/40 font-medium">About these picks — {roundLabel}</span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-white/25" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-white/25" />
        )}
      </button>
      <div
        className="border-t border-white/[0.05] overflow-hidden transition-all duration-200"
        style={{ maxHeight: open ? "900px" : "0px", opacity: open ? 1 : 0 }}
      >
        <div className="px-4 pb-5 pt-3 space-y-4">
          <p className="text-[12px] text-white/40 leading-relaxed">
            This page surfaces the highest-conviction AFL Fantasy decisions for {roundLabel} — must-buy targets, cash cow rookies, traps to avoid, and captain picks — powered by Neeko's AI projection model and trend engine.
          </p>
          <div className="space-y-2.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/30">How Each Section Works</h3>
            <ul className="space-y-2.5 text-[12px] text-white/35 leading-relaxed">
              <li><strong className="text-white/55">Must Buys</strong> — Players with strong upside projecting well above their breakeven. Best trade-in targets for {roundLabel}.</li>
              <li><strong className="text-white/55">Cheap Value / Cash Cows</strong> — Rookies and cheap options early in their pricing cycle. Identified by low games played relative to current output.</li>
              <li><strong className="text-white/55">Traps / Avoids</strong> — Players trending down or with negative edge scores. Consider replacing before {roundLabel} locks.</li>
              <li><strong className="text-white/55">Captain Picks</strong> — Best doubling options ranked by composite captain score: projection, consistency, and matchup advantage.</li>
            </ul>
          </div>
          {roundNum && (
            <Link
              to={`/sports/afl/round/${roundNum}`}
              className="inline-flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/70 underline underline-offset-2 transition-colors"
            >
              View Full Round {roundNum} Match Breakdown
              <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function AFLCurrentRoundPage() {
  const { isPremium } = useAuth();
  const [players, setPlayers] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [roundLabel, setRoundLabel] = useState("Current Round");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<{ row: RankingRow; rank: number; tier: RowTier; isUnlocked: boolean } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showStartSit, setShowStartSit] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_rankings_safe", {
        p_user_id: null,
        p_is_bot: false,
        p_limit: 300,
      });
      if (error) {
        console.error("Current Round fetch error:", error);
      } else if (data) {
        setPlayers((data as Record<string, unknown>[]).map(mapRankingRow));
      }
      try {
        const { data: metaData } = await supabase.rpc("get_rankings_updated_at");
        if (metaData && Array.isArray(metaData) && metaData[0]) {
          setRoundLabel(metaData[0].round_label ?? "Current Round");
          setUpdatedAt(metaData[0].updated_at ?? null);
        }
      } catch { /* ignore */ }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    track("current_round_page_view");
  }, [fetchData]);

  // ── ENGINE ────────────────────────────────────────────────────────────────
  const edgeBoardIds = useMemo<Set<string>>(() => {
    const ids = (window as any).__neekoEdgeBoardIds;
    return ids instanceof Set ? ids : new Set<string>();
  }, []);

  const { captains, topPicks, valuePicks, riskPicks } = useMemo(
    () => buildCurrentRoundPlayers(players, edgeBoardIds),
    [players, edgeBoardIds]
  );

  // ── MUST BUYS — merge top picks + value picks, de-duped ───────────────────
  const mustBuys = useMemo<CurrentRoundPlayer[]>(() => {
    const seen = new Set<string | null>();
    const combined: CurrentRoundPlayer[] = [];
    for (const p of [...valuePicks, ...topPicks]) {
      if (!seen.has(p.player_id)) {
        seen.add(p.player_id);
        combined.push(p);
      }
    }
    return combined.sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0)).slice(0, PREMIUM_LIMIT + 3);
  }, [valuePicks, topPicks]);

  // ── CASH COWS — low games played, actively scoring ────────────────────────
  const cashCows = useMemo<CurrentRoundPlayer[]>(() => {
    const usedIds = new Set(mustBuys.map((p) => p.player_id));
    const available = players.filter(
      (p) => !p.is_injured && !p.is_bye && p.projection != null && p.projection > 0
    );
    return available
      .filter((p) => (p.games_played ?? 999) <= CASH_COW_GAMES && !usedIds.has(p.player_id))
      .sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0))
      .slice(0, PREMIUM_LIMIT)
      .map((p) => {
        const id = p.player_id ?? "";
        return { ...p, overallRank: 999, isFeaturedPick: edgeBoardIds.has(id) };
      });
  }, [players, mustBuys, edgeBoardIds]);

  // ── TRAPS — riskPicks ─────────────────────────────────────────────────────
  const traps = useMemo(() => riskPicks.slice(0, PREMIUM_LIMIT + 3), [riskPicks]);

  // ── SUMMARY STRIP data ────────────────────────────────────────────────────
  const bestBuy   = mustBuys[0] ?? null;
  const bestTrap  = traps[0] ?? null;
  const bestCap   = captains[0] ?? null;
  const confPct   = players.filter((p) => (p.projection_confidence ?? 0) >= 65).length;

  const roundNum = roundLabel.replace(/[^0-9]/g, "");
  const pageTitle = `AFL Fantasy ${roundLabel} Tips, Captain Picks & Value Players | Neeko Sports`;

  function openRow(row: RankingRow, rank: number) {
    const tier: RowTier = isPremium ? "premium" : "full";
    setSelectedRow({ row, rank, tier, isUnlocked: true });
    track("current_round_player_click", { player_name: row.player_name, player_id: row.player_id });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center">
        <div className="text-white/30 text-sm animate-pulse">Loading round data...</div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content="Discover the best AFL Fantasy players for this round — must buys, cash cows, traps, and captain picks powered by AI projections." />
        <link rel="canonical" href="https://neekostats.com.au/sports/afl/current-round" />
        <meta name="robots" content="index, follow" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content="AI-powered AFL Fantasy picks for this round — captain options, value plays, trap alerts and full projections." />
        <meta property="og:url" content="https://neekostats.com.au/sports/afl/current-round" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Neeko Sports" />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content="AI-powered AFL Fantasy picks for this round — captain options, value plays, trap alerts and full projections." />
        <meta name="twitter:image" content="https://neekostats.com.au/og-default.png" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": pageTitle,
          "description": `Best AFL Fantasy picks for ${roundLabel} — captain picks, value plays and trap alerts.`,
          "url": "https://neekostats.com.au/sports/afl/current-round",
          "publisher": { "@type": "Organization", "name": "Neeko Sports", "url": "https://neekostats.com.au" },
          "breadcrumb": {
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://neekostats.com.au" },
              { "@type": "ListItem", "position": 2, "name": "AFL Fantasy", "item": "https://neekostats.com.au/sports/afl" },
              { "@type": "ListItem", "position": 3, "name": "Current Round", "item": "https://neekostats.com.au/sports/afl/current-round" }
            ]
          }
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-[#070707] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

          {/* ── PAGE HEADER ──────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] uppercase tracking-widest text-white/25 font-semibold">AFL Fantasy</span>
                <span className="h-px w-6 bg-white/[0.06]" />
                <span className="text-[10px] uppercase tracking-wider text-[#F5C84C] font-semibold">{roundLabel}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">Weekly Game Plan</h1>
              <p className="text-sm text-white/40 mt-1">Your round briefing — buys, traps, cash cows &amp; captain calls</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {updatedAt && (
                <div className="hidden sm:flex items-center gap-1 text-[10px] text-white/25">
                  <Clock className="w-3 h-3" />
                  {fmtUpdatedAt(updatedAt)}
                </div>
              )}
              <button
                onClick={() => fetchData(true)}
                disabled={refreshing}
                className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors disabled:opacity-40"
                title="Refresh data"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-white/40 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* ── SUMMARY STRIP ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard
              label="Must Buy"
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              accentColor="#4ade80"
              playerName={bestBuy?.player_name ?? null}
              stat={fmt(bestBuy?.projection, 0)}
              statLabel="pts proj"
              reason={bestBuy?.why ?? null}
              badge={<BuyBadge />}
            />
            <SummaryCard
              label="Biggest Trap"
              icon={<AlertTriangle className="w-3.5 h-3.5" />}
              accentColor="#f87171"
              playerName={bestTrap?.player_name ?? null}
              stat={fmt(bestTrap?.edge, 0)}
              statLabel="edge"
              reason={bestTrap?.why ?? null}
              badge={<AvoidBadge />}
            />
            <SummaryCard
              label="Captain Pick"
              icon={<Crown className="w-3.5 h-3.5" />}
              accentColor="#F5C84C"
              playerName={bestCap?.player_name ?? null}
              stat={fmt(bestCap?.projection, 0)}
              statLabel="pts proj"
              reason={bestCap?.why ?? null}
              badge={<CaptainBadge />}
            />
            <div
              className="rounded-2xl p-4 flex flex-col gap-2"
              style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-[#F5C84C]" />
                <span className="text-[10px] uppercase tracking-wider font-semibold text-white/30">Round Snapshot</span>
              </div>
              <div>
                <p className="text-base font-bold text-white leading-tight">{confPct} players</p>
                <p className="text-[11px] text-white/35 mt-1 leading-relaxed">above 65% model confidence</p>
              </div>
              <div className="flex items-baseline gap-1 mt-auto">
                <span className="text-2xl font-bold text-[#F5C84C] tabular-nums">{traps.length}</span>
                <span className="text-[10px] text-white/25">trap alerts</span>
              </div>
            </div>
          </div>

          {/* ── SEO COLLAPSIBLE ──────────────────────────────────────────── */}
          <CollapsibleSEO roundLabel={roundLabel} roundNum={roundNum} />

          {/* ── SECTION 1: MUST BUYS ─────────────────────────────────────── */}
          <SectionCard
            title="Must Buys"
            description="Highest value score this round — strongest trade-in targets sorted by value, not popularity."
            icon={<TrendingUp className="w-4 h-4" />}
            accentColor="#4ade80"
            players={mustBuys}
            freeLimit={MUST_BUY_FREE}
            isPremiumUser={isPremium}
            onOpenRow={openRow}
            onUpgrade={() => setShowUpgradeModal(true)}
            blurCtaLabel="Unlock all trade targets →"
            blurBadgeText={`+${Math.max(0, mustBuys.length - MUST_BUY_FREE)} picks hidden`}
            footerLink={{ label: "Market Watch", to: "/sports/afl/market-watch" }}
            renderBadge={() => <BuyBadge />}
            renderMetric={(row) =>
              row.value_score != null ? (
                <div className="text-right hidden sm:block">
                  <div className={`text-xs font-bold tabular-nums ${(row.value_score ?? 0) >= 1.05 ? "text-green-400" : "text-white/40"}`}>
                    {(row.value_score ?? 0).toFixed(2)}
                  </div>
                  <div className="text-[9px] text-white/25">value</div>
                </div>
              ) : undefined
            }
            renderSubtext={(row) =>
              row.edge != null ? `+${fmt(row.edge, 0)} edge` : null
            }
          />

          {/* ── SECTION 2: ROOKIE WATCH ──────────────────────────────────── */}
          {cashCows.length > 0 && (
            <SectionCard
              title="Cheap Value / Rookie Watch"
              description="Early-season players generating value before their price rises. Low games played, high upside."
              icon={<Sprout className="w-4 h-4" />}
              accentColor="#34d399"
              players={cashCows}
              freeLimit={isPremium ? PREMIUM_LIMIT : 3}
              isPremiumUser={isPremium}
              onOpenRow={openRow}
              onUpgrade={() => setShowUpgradeModal(true)}
              blurCtaLabel="Unlock all cash cows →"
              blurBadgeText={`+${Math.max(0, cashCows.length - 3)} hidden`}
              footerLink={{ label: "Full Rankings", to: "/sports/afl/rankings" }}
              renderBadge={() => <CashCowBadge />}
              renderMetric={(row) =>
                row.price != null ? (
                  <div className="text-right hidden sm:block">
                    <div className="text-xs font-bold tabular-nums text-emerald-400">{fmtPrice(row.price)}</div>
                    <div className="text-[9px] text-white/25">price</div>
                  </div>
                ) : undefined
              }
              renderSubtext={(row) =>
                row.games_played != null ? `${row.games_played} games` : null
              }
            />
          )}

          {/* ── SECTION 3: TRAPS / AVOIDS ────────────────────────────────── */}
          <SectionCard
            title="Overpriced / Risk"
            description="Players whose price exceeds their projected value — ranked by value score ascending. Consider trading out."
            icon={<AlertTriangle className="w-4 h-4" />}
            accentColor="#f87171"
            players={traps}
            freeLimit={TRAP_FREE}
            isPremiumUser={isPremium}
            onOpenRow={openRow}
            onUpgrade={() => setShowUpgradeModal(true)}
            blurCtaLabel="Reveal all trap alerts →"
            blurBadgeText={`+${Math.max(0, traps.length - TRAP_FREE)} risks hidden`}
            footerLink={{ label: "Full Rankings", to: "/sports/afl/rankings" }}
            renderBadge={() => <AvoidBadge />}
            renderMetric={(row) =>
              row.edge != null ? (
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-bold tabular-nums text-red-400">{fmt(row.edge, 0)}</div>
                  <div className="text-[9px] text-white/25">edge</div>
                </div>
              ) : undefined
            }
            renderSubtext={(row) =>
              row.projection_confidence != null
                ? getConfidenceLabel(row.projection_confidence)
                : null
            }
          />

          {/* ── SECTION 4: CAPTAINS ──────────────────────────────────────── */}
          <SectionCard
            title="Captain Picks"
            description="Best doubling options ranked by projection, consistency and matchup advantage."
            icon={<Crown className="w-4 h-4" />}
            accentColor="#F5C84C"
            players={captains}
            freeLimit={CAPTAIN_FREE}
            isPremiumUser={isPremium}
            onOpenRow={openRow}
            onUpgrade={() => setShowUpgradeModal(true)}
            blurCtaLabel="Unlock full captain strategy →"
            blurBadgeText={`+${Math.max(0, captains.length - CAPTAIN_FREE)} options hidden`}
            footerLink={{ label: "Full Rankings", to: "/sports/afl/rankings" }}
            renderBadge={() => <CaptainBadge />}
            renderMetric={(row) =>
              row.captain_score != null ? (
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-bold tabular-nums text-[#F5C84C]">{fmt(row.captain_score, 0)}</div>
                  <div className="text-[9px] text-white/25">cap score</div>
                </div>
              ) : undefined
            }
            renderSubtext={(row) =>
              row.captain_rating ?? null
            }
          />

          {/* ── SECTION 5: START/SIT TOOL ────────────────────────────────── */}
          <div
            className="rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-5"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(245,200,76,0.12)", border: "1px solid rgba(245,200,76,0.22)" }}
              >
                <Zap className="w-4.5 h-4.5 text-[#F5C84C]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Not sure between two players?</h3>
                <p className="text-[12px] text-white/35 mt-0.5 leading-relaxed">
                  Compare any two players side-by-side — projection, edge, confidence — and get a clear start/sit call.
                </p>
              </div>
            </div>
            <button
              onClick={() => { setShowStartSit(true); track("start_sit_tool_open"); }}
              className="shrink-0 flex items-center gap-1.5 text-[13px] font-bold text-[#F5C84C] border border-[#F5C84C]/30 hover:border-[#F5C84C]/60 hover:bg-[#F5C84C]/08 px-4 py-2.5 rounded-xl transition-all"
            >
              Compare Players
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* ── NAV LINKS ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Link
              to="/sports/afl/rankings"
              className="flex items-center justify-between bg-white/[0.025] hover:bg-white/[0.05] border border-white/[0.06] hover:border-white/[0.12] rounded-xl px-4 py-3 transition-all group"
            >
              <div className="flex items-center gap-2">
                <BarChart2 className="w-3.5 h-3.5 text-white/35" />
                <div>
                  <div className="text-sm font-semibold text-white">Full Rankings</div>
                  <div className="text-[10px] text-white/30">600+ players ranked by projection</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all" />
            </Link>
            <Link
              to="/sports/afl/market-watch"
              className="flex items-center justify-between bg-white/[0.025] hover:bg-white/[0.05] border border-white/[0.06] hover:border-white/[0.12] rounded-xl px-4 py-3 transition-all group"
            >
              <div className="flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 text-white/35" />
                <div>
                  <div className="text-sm font-semibold text-white">Market Watch</div>
                  <div className="text-[10px] text-white/30">Price movements &amp; trade signals</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all" />
            </Link>
          </div>


        </div>
      </div>

      {selectedRow && (
        <PlayerDetailModal
          row={selectedRow.row}
          rank={selectedRow.rank}
          isPremium={isPremium}
          isUnlocked={selectedRow.isUnlocked}
          tier={selectedRow.tier}
          isFreeTop5={!isPremium && selectedRow.tier === "full"}
          onClose={() => setSelectedRow(null)}
        />
      )}
      {showUpgradeModal && (
        <UpgradeModal onClose={() => setShowUpgradeModal(false)} />
      )}
      {showStartSit && (
        <StartSitModal
          players={players}
          onClose={() => setShowStartSit(false)}
          onOpenPlayer={(row) => {
            setShowStartSit(false);
            openRow(row, 0);
          }}
        />
      )}
    </>
  );
}
