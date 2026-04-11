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
  ShieldAlert,
  Target,
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
const BUDGET_PRICE_CAP = 350_000;
const BUDGET_GAMES_CAP = 10;
const PREMIUM_LIMIT    = 8;

// ─── PRICE HELPERS ────────────────────────────────────────────────────────────
function isBudgetPlayer(p: RankingRow): boolean {
  const price = p.price ?? 0;
  const games = p.games_played ?? 999;
  return price < BUDGET_PRICE_CAP || games <= BUDGET_GAMES_CAP;
}

function getRiskTag(row: CurrentRoundPlayer): string {
  const signal = (row.action ?? row.signal_tag ?? row.signal ?? "").toUpperCase();
  if (signal.includes("VOLATILE")) return "Volatile";
  if (signal.includes("ROLE")) return "Role Risk";
  const edge = row.edge ?? 0;
  const price = row.price ?? 0;
  const proj = row.projection ?? 0;
  const breakeven = row.breakeven ?? 0;
  if (breakeven > 0 && proj < breakeven * 0.75) return "Overpriced";
  if (price > 700_000 && edge < -10) return "Premium Trap";
  if (edge < -20) return "Strong Fade";
  if (edge < -10) return "Overpriced";
  return "Watch";
}

function getCaptainTier(rank: number, row: CurrentRoundPlayer): { label: string; color: string; desc: string } {
  const captScore = row.captain_score ?? 0;
  const proj = row.projection ?? 0;
  if (rank === 1 || captScore >= 80 || proj >= 120) {
    return { label: "Lock", color: "#F5C84C", desc: "Highest confidence double" };
  }
  if (rank <= 3 || captScore >= 65 || proj >= 100) {
    return { label: "Safe", color: "#4ade80", desc: "Reliable doubling option" };
  }
  return { label: "POD", color: "#60a5fa", desc: "Point of difference pick" };
}

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

function StrongValueBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded border border-emerald-400/40 bg-emerald-400/10 text-emerald-400 shrink-0 leading-none">
      <Star className="w-2.5 h-2.5" />
      VALUE
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

function CaptainBadge({ tier }: { tier?: string }) {
  const color =
    tier === "Lock" ? "border-yellow-400/40 bg-yellow-400/15 text-yellow-400" :
    tier === "Safe" ? "border-green-400/30 bg-green-400/10 text-green-400" :
    "border-blue-400/30 bg-blue-400/10 text-blue-400";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded border shrink-0 leading-none ${color}`}>
      <Crown className="w-2.5 h-2.5" />
      {tier ?? "CAPTAIN"}
    </span>
  );
}

function BudgetBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded border border-teal-400/40 bg-teal-400/10 text-teal-400 shrink-0 leading-none">
      <Sprout className="w-2.5 h-2.5" />
      BUDGET
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
  renderBadge?: (row: CurrentRoundPlayer, idx: number) => React.ReactNode;
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
            badge={renderBadge ? renderBadge(row, idx) : undefined}
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

// ─── CAPTAIN SECTION (tiered) ─────────────────────────────────────────────────

interface CaptainSectionProps {
  captains: CurrentRoundPlayer[];
  freeLimit: number;
  isPremiumUser: boolean;
  onOpenRow: (row: CurrentRoundPlayer, rank: number) => void;
  onUpgrade: () => void;
}

function CaptainSection({ captains, freeLimit, isPremiumUser, onOpenRow, onUpgrade }: CaptainSectionProps) {
  const [hovered, setHovered] = useState(false);
  const accentColor = "#F5C84C";
  const limit = isPremiumUser ? PREMIUM_LIMIT : freeLimit;
  const visible = captains.slice(0, limit);
  const hidden = isPremiumUser ? [] : captains.slice(freeLimit, Math.min(PREMIUM_LIMIT, captains.length));
  const totalHidden = isPremiumUser ? 0 : Math.max(0, captains.length - freeLimit);

  const tiers = isPremiumUser
    ? [
        { key: "Lock",  color: "#F5C84C", desc: "Highest confidence double",    players: captains.filter((_, i) => getCaptainTier(i + 1, _).label === "Lock")  },
        { key: "Safe",  color: "#4ade80", desc: "Reliable doubling option",     players: captains.filter((_, i) => getCaptainTier(i + 1, _).label === "Safe")  },
        { key: "POD",   color: "#60a5fa", desc: "Point of difference pick",     players: captains.filter((_, i) => getCaptainTier(i + 1, _).label === "POD")   },
      ].filter((t) => t.players.length > 0)
    : null;

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
          <span style={{ color: accentColor }}><Crown className="w-4 h-4" /></span>
          <h2 className="text-sm font-bold text-white flex-1">Captain Picks</h2>
          {!isPremiumUser && totalHidden > 0 && (
            <span className="text-[10px] text-white/25">{freeLimit} of {captains.length}</span>
          )}
        </div>
        <p className="text-[11px] text-white/35 mt-1 ml-4 leading-relaxed">
          {isPremiumUser
            ? "Tiered by confidence — Lock for the sure things, Safe for reliability, POD for differential upside."
            : "Best doubling options ranked by projection, consistency and matchup advantage."}
        </p>
      </div>

      <div className="flex-1 py-1">
        {isPremiumUser && tiers ? (
          tiers.map((tier) => (
            <div key={tier.key}>
              <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
                <div className="h-px flex-1" style={{ background: `${tier.color}20` }} />
                <span
                  className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                  style={{ color: tier.color, background: `${tier.color}12`, border: `1px solid ${tier.color}25` }}
                >
                  {tier.key} — {tier.desc}
                </span>
                <div className="h-px flex-1" style={{ background: `${tier.color}20` }} />
              </div>
              {tier.players.map((row, idx) => {
                const globalIdx = captains.indexOf(row);
                return (
                  <PlayerRow
                    key={row.player_id ?? idx}
                    row={row}
                    rank={globalIdx + 1}
                    badge={<CaptainBadge tier={tier.key} />}
                    metric={
                      row.captain_score != null ? (
                        <div className="text-right hidden sm:block">
                          <div className="text-xs font-bold tabular-nums" style={{ color: tier.color }}>
                            {fmt(row.captain_score, 0)}
                          </div>
                          <div className="text-[9px] text-white/25">cap score</div>
                        </div>
                      ) : undefined
                    }
                    subtext={row.captain_rating ?? null}
                    onClick={() => onOpenRow(row, globalIdx + 1)}
                  />
                );
              })}
            </div>
          ))
        ) : (
          visible.map((row, idx) => {
            const tier = getCaptainTier(idx + 1, row);
            return (
              <PlayerRow
                key={row.player_id ?? idx}
                row={row}
                rank={idx + 1}
                badge={<CaptainBadge tier={tier.label} />}
                metric={
                  row.captain_score != null ? (
                    <div className="text-right hidden sm:block">
                      <div className="text-xs font-bold tabular-nums text-[#F5C84C]">
                        {fmt(row.captain_score, 0)}
                      </div>
                      <div className="text-[9px] text-white/25">cap score</div>
                    </div>
                  ) : undefined
                }
                subtext={tier.desc}
                onClick={() => onOpenRow(row, idx + 1)}
              />
            );
          })
        )}

        {hidden.length > 0 && (
          <div className="relative pb-12">
            {hidden.map((row, idx) => (
              <BlurredRow key={row.player_id ?? idx} rank={freeLimit + idx + 1} />
            ))}
            <LockStripCTA
              hiddenCount={totalHidden}
              accentColor={accentColor}
              onUpgrade={onUpgrade}
              ctaLabel="Unlock full captain strategy →"
              badgeText={`+${totalHidden} options hidden`}
            />
          </div>
        )}
      </div>

      <div className="px-4 py-2.5" style={{ borderTop: `1px solid ${accentColor}12` }}>
        <Link
          to="/sports/afl/rankings"
          className="flex items-center gap-1 text-[11px] transition-colors"
          style={{ color: `${accentColor}60` }}
          onMouseEnter={(e) => (e.currentTarget.style.color = `${accentColor}99`)}
          onMouseLeave={(e) => (e.currentTarget.style.color = `${accentColor}60`)}
        >
          Full Rankings
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

// ─── MUST BUY SECTION (split into tiers for premium) ─────────────────────────

interface MustBuysSectionProps {
  mustBuys: CurrentRoundPlayer[];
  freeLimit: number;
  isPremiumUser: boolean;
  onOpenRow: (row: CurrentRoundPlayer, rank: number) => void;
  onUpgrade: () => void;
}

function MustBuysSection({ mustBuys, freeLimit, isPremiumUser, onOpenRow, onUpgrade }: MustBuysSectionProps) {
  const [hovered, setHovered] = useState(false);
  const accentColor = "#4ade80";
  const limit = isPremiumUser ? mustBuys.length : freeLimit;
  const visible = mustBuys.slice(0, limit);
  const hidden = isPremiumUser ? [] : mustBuys.slice(freeLimit, Math.min(PREMIUM_LIMIT, mustBuys.length));
  const totalHidden = isPremiumUser ? 0 : Math.max(0, mustBuys.length - freeLimit);

  const mustBuyPlayers = isPremiumUser
    ? visible.filter((p) => (p.value_score ?? 0) >= 1.1 || (p.edge ?? 0) >= 15)
    : visible;
  const strongValuePlayers = isPremiumUser
    ? visible.filter((p) => !mustBuyPlayers.includes(p))
    : [];

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
          <span style={{ color: accentColor }}><TrendingUp className="w-4 h-4" /></span>
          <h2 className="text-sm font-bold text-white flex-1">Must Buys</h2>
          {!isPremiumUser && totalHidden > 0 && (
            <span className="text-[10px] text-white/25">{freeLimit} of {mustBuys.length}</span>
          )}
        </div>
        <p className="text-[11px] text-white/35 mt-1 ml-4 leading-relaxed">
          {isPremiumUser
            ? "Clearest trade-in targets this round — sorted by value edge, not just projection."
            : "Highest value score this round — strongest trade-in targets sorted by value, not popularity."}
        </p>
      </div>

      <div className="flex-1 py-1">
        {isPremiumUser ? (
          <>
            {mustBuyPlayers.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
                  <div className="h-px flex-1 bg-green-500/15" />
                  <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full text-green-400 bg-green-400/10 border border-green-400/20">
                    Must Buy — Strongest Signal
                  </span>
                  <div className="h-px flex-1 bg-green-500/15" />
                </div>
                {mustBuyPlayers.map((row, idx) => (
                  <PlayerRow
                    key={row.player_id ?? idx}
                    row={row}
                    rank={idx + 1}
                    badge={<BuyBadge />}
                    metric={
                      row.value_score != null ? (
                        <div className="text-right hidden sm:block">
                          <div className={`text-xs font-bold tabular-nums ${(row.value_score ?? 0) >= 1.05 ? "text-green-400" : "text-white/40"}`}>
                            {(row.value_score ?? 0).toFixed(2)}
                          </div>
                          <div className="text-[9px] text-white/25">value</div>
                        </div>
                      ) : undefined
                    }
                    subtext={row.edge != null ? `+${fmt(row.edge, 0)} edge` : null}
                    onClick={() => onOpenRow(row, idx + 1)}
                  />
                ))}
              </>
            )}
            {strongValuePlayers.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
                  <div className="h-px flex-1 bg-emerald-400/12" />
                  <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full text-emerald-400 bg-emerald-400/08 border border-emerald-400/18">
                    Strong Value — Worth Considering
                  </span>
                  <div className="h-px flex-1 bg-emerald-400/12" />
                </div>
                {strongValuePlayers.map((row, idx) => (
                  <PlayerRow
                    key={row.player_id ?? idx}
                    row={row}
                    rank={mustBuyPlayers.length + idx + 1}
                    badge={<StrongValueBadge />}
                    metric={
                      row.value_score != null ? (
                        <div className="text-right hidden sm:block">
                          <div className="text-xs font-bold tabular-nums text-emerald-400">
                            {(row.value_score ?? 0).toFixed(2)}
                          </div>
                          <div className="text-[9px] text-white/25">value</div>
                        </div>
                      ) : undefined
                    }
                    subtext={row.edge != null ? `+${fmt(row.edge, 0)} edge` : null}
                    onClick={() => onOpenRow(row, mustBuyPlayers.length + idx + 1)}
                  />
                ))}
              </>
            )}
          </>
        ) : (
          visible.map((row, idx) => (
            <PlayerRow
              key={row.player_id ?? idx}
              row={row}
              rank={idx + 1}
              badge={<BuyBadge />}
              metric={
                row.value_score != null ? (
                  <div className="text-right hidden sm:block">
                    <div className={`text-xs font-bold tabular-nums ${(row.value_score ?? 0) >= 1.05 ? "text-green-400" : "text-white/40"}`}>
                      {(row.value_score ?? 0).toFixed(2)}
                    </div>
                    <div className="text-[9px] text-white/25">value</div>
                  </div>
                ) : undefined
              }
              subtext={row.edge != null ? `+${fmt(row.edge, 0)} edge` : null}
              onClick={() => onOpenRow(row, idx + 1)}
            />
          ))
        )}

        {hidden.length > 0 && (
          <div className="relative pb-12">
            {hidden.map((row, idx) => (
              <BlurredRow key={row.player_id ?? idx} rank={freeLimit + idx + 1} />
            ))}
            <LockStripCTA
              hiddenCount={totalHidden}
              accentColor={accentColor}
              onUpgrade={onUpgrade}
              ctaLabel="Unlock all trade targets →"
              badgeText={`+${Math.max(0, mustBuys.length - freeLimit)} picks hidden`}
            />
          </div>
        )}
      </div>

      <div className="px-4 py-2.5" style={{ borderTop: `1px solid ${accentColor}12` }}>
        <Link
          to="/sports/afl/market-watch"
          className="flex items-center gap-1 text-[11px] transition-colors"
          style={{ color: `${accentColor}60` }}
          onMouseEnter={(e) => (e.currentTarget.style.color = `${accentColor}99`)}
          onMouseLeave={(e) => (e.currentTarget.style.color = `${accentColor}60`)}
        >
          Market Watch
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
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
            This page surfaces the highest-conviction AFL Fantasy decisions for {roundLabel} — must-buy targets, budget value plays, traps to avoid, and captain picks — powered by Neeko's AI projection model and trend engine.
          </p>
          <div className="space-y-2.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/30">How Each Section Works</h3>
            <ul className="space-y-2.5 text-[12px] text-white/35 leading-relaxed">
              <li><strong className="text-white/55">Must Buys</strong> — Players with strong upside projecting well above their breakeven. Best trade-in targets for {roundLabel}.</li>
              <li><strong className="text-white/55">Budget Upside</strong> — Affordable options with genuine scoring potential. Identified by price relative to projected output.</li>
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

  // ── BUDGET UPSIDE — strictly priced under $350k OR low games, not in mustBuys
  const budgetPicks = useMemo<CurrentRoundPlayer[]>(() => {
    const usedIds = new Set(mustBuys.map((p) => p.player_id));
    const available = players.filter(
      (p) => !p.is_injured && !p.is_bye && p.projection != null && p.projection > 0
    );
    return available
      .filter((p) => isBudgetPlayer(p) && !usedIds.has(p.player_id))
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
  const bestBuy  = mustBuys[0] ?? null;
  const bestTrap = traps[0] ?? null;
  const bestCap  = captains[0] ?? null;

  const buyPoolCount  = mustBuys.length;
  const trapCount     = traps.length;
  const captainLocks  = captains.filter((_, i) => getCaptainTier(i + 1, _).label === "Lock").length;

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
        <meta name="description" content="Discover the best AFL Fantasy players for this round — must buys, budget value, traps, and captain picks powered by AI projections." />
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
              <p className="text-sm text-white/40 mt-1">Your round briefing — buys, traps, budget plays &amp; captain calls</p>
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
              badge={<CaptainBadge tier="Lock" />}
            />
            {/* Round Snapshot — user-facing decision stats */}
            <div
              className="rounded-2xl p-4 flex flex-col gap-2"
              style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-[#F5C84C]" />
                <span className="text-[10px] uppercase tracking-wider font-semibold text-white/30">Round Snapshot</span>
              </div>
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/35">Best Buy Pool</span>
                  <span className="text-[11px] font-bold text-green-400 tabular-nums">{buyPoolCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/35">Trap Alerts</span>
                  <span className="text-[11px] font-bold text-red-400 tabular-nums">{trapCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/35">Captain Locks</span>
                  <span className="text-[11px] font-bold text-[#F5C84C] tabular-nums">{captainLocks}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 pt-0.5 border-t border-white/[0.05]">
                <Clock className="w-2.5 h-2.5 text-white/20" />
                <span className="text-[9px] text-white/25">Updated before lockout</span>
              </div>
            </div>
          </div>

          {/* ── SEO COLLAPSIBLE ──────────────────────────────────────────── */}
          <CollapsibleSEO roundLabel={roundLabel} roundNum={roundNum} />

          {/* ── SECTION 1: MUST BUYS ─────────────────────────────────────── */}
          <MustBuysSection
            mustBuys={mustBuys}
            freeLimit={MUST_BUY_FREE}
            isPremiumUser={isPremium}
            onOpenRow={openRow}
            onUpgrade={() => setShowUpgradeModal(true)}
          />

          {/* ── SECTION 2: BUDGET UPSIDE ─────────────────────────────────── */}
          {budgetPicks.length > 0 && (
            <SectionCard
              title="Budget Upside"
              description="Affordable options with genuine scoring potential — priced under $350k or early in their pricing cycle."
              icon={<Sprout className="w-4 h-4" />}
              accentColor="#2dd4bf"
              players={budgetPicks}
              freeLimit={isPremium ? PREMIUM_LIMIT : 3}
              isPremiumUser={isPremium}
              onOpenRow={openRow}
              onUpgrade={() => setShowUpgradeModal(true)}
              blurCtaLabel="Unlock all budget plays →"
              blurBadgeText={`+${Math.max(0, budgetPicks.length - 3)} hidden`}
              footerLink={{ label: "Full Rankings", to: "/sports/afl/rankings" }}
              renderBadge={() => <BudgetBadge />}
              renderMetric={(row) =>
                row.price != null ? (
                  <div className="text-right hidden sm:block">
                    <div className="text-xs font-bold tabular-nums text-teal-400">{fmtPrice(row.price)}</div>
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
            description="Players whose price exceeds their projected value — ranked by edge score ascending. Consider trading out before lockout."
            icon={<ShieldAlert className="w-4 h-4" />}
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
            renderSubtext={(row) => {
              const tag = getRiskTag(row);
              const conf = row.projection_confidence;
              const confLabel = conf != null ? getConfidenceLabel(conf) : null;
              const parts = [tag, confLabel].filter(Boolean);
              return parts.length > 0 ? parts.join(" · ") : null;
            }}
          />

          {/* ── SECTION 4: CAPTAINS (tiered) ─────────────────────────────── */}
          <CaptainSection
            captains={captains}
            freeLimit={CAPTAIN_FREE}
            isPremiumUser={isPremium}
            onOpenRow={openRow}
            onUpgrade={() => setShowUpgradeModal(true)}
          />

          {/* ── SECTION 5: COMPARE PLAYERS CTA ──────────────────────────── */}
          <div
            className="rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-5"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: "rgba(245,200,76,0.12)", border: "1px solid rgba(245,200,76,0.22)" }}
              >
                <Zap className="w-4 h-4 text-[#F5C84C]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Torn between two players?</h3>
                <p className="text-[12px] text-white/35 mt-0.5 leading-relaxed">
                  Projection, edge, confidence — one clear start/sit answer. Compare any two players instantly.
                </p>
              </div>
            </div>
            <button
              onClick={() => { setShowStartSit(true); track("start_sit_tool_open"); }}
              className="shrink-0 flex items-center gap-1.5 text-[13px] font-bold text-[#F5C84C] border border-[#F5C84C]/30 hover:border-[#F5C84C]/60 hover:bg-[#F5C84C]/[0.08] px-4 py-2.5 rounded-xl transition-all"
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
