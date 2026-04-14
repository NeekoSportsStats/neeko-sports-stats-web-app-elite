import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { TrendingUp, TriangleAlert as AlertTriangle, Crown, Zap, Lock, Star, Clock, ChartBar as BarChart2, ArrowRight, RefreshCw, ChevronDown, ChevronRight, Flame, DollarSign, Sprout, X, Search, ChevronUp, ShieldAlert, Target, TrendingDown, CircleCheck as CheckCircle2, CircleAlert as AlertCircle } from "lucide-react";
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

// ─── FREE TIER LIMITS ────────────────────────────────────────────────────────
const MUST_BUY_FREE  = 2;
const BUDGET_FREE    = 2;
const RISK_FREE      = 2;
const CAPTAIN_FREE   = 1;
const PREMIUM_LIMIT  = 8;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function normalisePosition(pos: string | null | undefined): string | null {
  if (!pos) return null;
  const p = pos.toUpperCase().trim();
  if (p === "MID" || p === "MIDFIELDER") return "MID";
  if (p === "FWD" || p === "FORWARD") return "FWD";
  if (p === "DEF" || p === "DEFENDER") return "DEF";
  if (p === "RUC" || p === "RUCK") return "RUC";
  return p;
}

function getRiskTag(row: CurrentRoundPlayer): string {
  const edge = row.edge ?? 0;
  const price = row.price ?? 0;
  const proj = row.projection ?? 0;
  const breakeven = row.breakeven ?? 0;
  if (breakeven > 0 && proj < breakeven * 0.80) return "Overpriced";
  if (price > 700_000 && edge < -10) return "Premium Trap";
  if (edge <= -15) return "Strong Fade";
  return "Overpriced";
}

function getCaptainTier(p: CurrentRoundPlayer): { label: "Lock" | "Safe" | "POD"; color: string; desc: string } {
  const edge = p.edge ?? 0;
  const proj = p.projection ?? 0;
  if (edge >= 15 || proj >= 115) return { label: "Lock",  color: "#F5C84C", desc: "Highest confidence double" };
  if (edge >= 8  || proj >= 100) return { label: "Safe",  color: "#4ade80", desc: "Reliable doubling option" };
  return                          { label: "POD",   color: "#60a5fa", desc: "Point of difference pick" };
}

// ─── BADGES ──────────────────────────────────────────────────────────────────

function BuyBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded border border-green-500/40 bg-green-500/15 text-green-400 shrink-0 leading-none">
      <TrendingUp className="w-2.5 h-2.5" /> BUY
    </span>
  );
}

function StrongValueBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded border border-emerald-400/40 bg-emerald-400/10 text-emerald-400 shrink-0 leading-none">
      <Star className="w-2.5 h-2.5" /> VALUE
    </span>
  );
}

function AvoidBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded border border-red-500/40 bg-red-500/15 text-red-400 shrink-0 leading-none">
      <AlertTriangle className="w-2.5 h-2.5" /> AVOID
    </span>
  );
}

function CaptainBadge({ tier }: { tier?: "Lock" | "Safe" | "POD" }) {
  const color =
    tier === "Lock" ? "border-yellow-400/40 bg-yellow-400/15 text-yellow-400" :
    tier === "Safe" ? "border-green-400/30 bg-green-400/10 text-green-400" :
    "border-blue-400/30 bg-blue-400/10 text-blue-400";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded border shrink-0 leading-none ${color}`}>
      <Crown className="w-2.5 h-2.5" /> {tier ?? "C"}
    </span>
  );
}

function BudgetBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded border border-teal-400/40 bg-teal-400/10 text-teal-400 shrink-0 leading-none">
      <Sprout className="w-2.5 h-2.5" /> BUDGET
    </span>
  );
}

function FeaturedBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded border border-orange-400/40 bg-orange-400/10 text-orange-400 shrink-0 leading-none">
      <Flame className="w-2.5 h-2.5" /> Edge Pick
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
      style={{ background: `linear-gradient(135deg, ${accentColor}09 0%, transparent 70%)`, border: `1px solid ${accentColor}30` }}
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
        {reason && <p className="text-[11px] text-white/35 mt-1 leading-relaxed line-clamp-2">{reason}</p>}
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

// ─── BLURRED ROW ─────────────────────────────────────────────────────────────

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

// ─── GENERIC SECTION CARD ────────────────────────────────────────────────────

interface SectionCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  accentColor: string;
  players: CurrentRoundPlayer[];
  freeLimit: number;
  isPremiumUser: boolean;
  onOpenRow: (row: CurrentRoundPlayer) => void;
  onUpgrade: () => void;
  blurCtaLabel?: string;
  blurBadgeText?: string;
  footerLink?: { label: string; to: string };
  renderBadge?: (row: CurrentRoundPlayer, idx: number) => React.ReactNode;
  renderMetric?: (row: CurrentRoundPlayer) => React.ReactNode;
  renderSubtext?: (row: CurrentRoundPlayer) => string | null;
  premiumContent?: React.ReactNode;
}

function SectionCard({
  title, description, icon, accentColor, players, freeLimit, isPremiumUser,
  onOpenRow, onUpgrade, blurCtaLabel, blurBadgeText, footerLink,
  renderBadge, renderMetric, renderSubtext, premiumContent,
}: SectionCardProps) {
  const [hovered, setHovered] = useState(false);
  const visibleCount = isPremiumUser ? PREMIUM_LIMIT : freeLimit;
  const visible = players.slice(0, visibleCount);
  const hidden  = isPremiumUser ? [] : players.slice(freeLimit, Math.min(PREMIUM_LIMIT, players.length));
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
        {isPremiumUser && premiumContent ? premiumContent : (
          visible.map((row, idx) => (
            <PlayerRow
              key={row.player_id ?? idx}
              row={row}
              rank={idx + 1}
              badge={renderBadge ? renderBadge(row, idx) : undefined}
              metric={renderMetric ? renderMetric(row) : undefined}
              subtext={renderSubtext ? renderSubtext(row) : null}
              onClick={() => onOpenRow(row)}
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

// ─── MUST BUYS SECTION ────────────────────────────────────────────────────────

function MustBuysSection({
  mustBuys, isPremiumUser, onOpenRow, onUpgrade,
}: {
  mustBuys: CurrentRoundPlayer[];
  isPremiumUser: boolean;
  onOpenRow: (row: CurrentRoundPlayer) => void;
  onUpgrade: () => void;
}) {
  const accentColor = "#4ade80";
  const [hovered, setHovered] = useState(false);
  const visible = mustBuys.slice(0, isPremiumUser ? PREMIUM_LIMIT : MUST_BUY_FREE);
  const hidden  = isPremiumUser ? [] : mustBuys.slice(MUST_BUY_FREE, Math.min(PREMIUM_LIMIT, mustBuys.length));
  const totalHidden = isPremiumUser ? 0 : Math.max(0, mustBuys.length - MUST_BUY_FREE);

  const strongSignal = visible.filter((p) => (p.signal ?? "").toUpperCase() === "STRONG_START");
  const startSignal  = visible.filter((p) => (p.signal ?? "").toUpperCase() === "START");

  const renderRow = (row: CurrentRoundPlayer, globalIdx: number) => {
    const isStrong = (row.signal ?? "").toUpperCase() === "STRONG_START";
    return (
      <PlayerRow
        key={row.player_id ?? globalIdx}
        row={row}
        rank={globalIdx + 1}
        badge={isStrong ? <BuyBadge /> : <StrongValueBadge />}
        metric={
          row.edge != null ? (
            <div className="text-right hidden sm:block">
              <div className={`text-xs font-bold tabular-nums ${(row.edge ?? 0) >= 15 ? "text-green-400" : "text-emerald-400"}`}>
                +{fmt(row.edge, 0)}
              </div>
              <div className="text-[9px] text-white/25">edge</div>
            </div>
          ) : undefined
        }
        subtext={row.value_score != null ? `${(row.value_score ?? 0).toFixed(1)} value score` : null}
        onClick={() => onOpenRow(row)}
      />
    );
  };

  const premiumContent = (
    <>
      {strongSignal.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
            <div className="h-px flex-1 bg-green-500/15" />
            <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full text-green-400 bg-green-400/10 border border-green-400/20">
              Strong Signal — Must Buy
            </span>
            <div className="h-px flex-1 bg-green-500/15" />
          </div>
          {strongSignal.map((row, idx) => renderRow(row, idx))}
        </>
      )}
      {startSignal.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
            <div className="h-px flex-1 bg-emerald-400/12" />
            <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full text-emerald-400 bg-emerald-400/08 border border-emerald-400/18">
              Start Signal — Strong Value
            </span>
            <div className="h-px flex-1 bg-emerald-400/12" />
          </div>
          {startSignal.map((row, idx) => renderRow(row, strongSignal.length + idx))}
        </>
      )}
    </>
  );

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
            <span className="text-[10px] text-white/25">{MUST_BUY_FREE} of {mustBuys.length}</span>
          )}
        </div>
        <p className="text-[11px] text-white/35 mt-1 ml-4 leading-relaxed">
          Strongest trade-in targets this round — ranked by edge score, filtered to START and STRONG_START signals only.
        </p>
      </div>

      <div className="flex-1 py-1">
        {isPremiumUser ? premiumContent : visible.map((row, idx) => renderRow(row, idx))}

        {hidden.length > 0 && (
          <div className="relative pb-12">
            {hidden.map((row, idx) => (
              <BlurredRow key={row.player_id ?? idx} rank={MUST_BUY_FREE + idx + 1} />
            ))}
            <LockStripCTA
              hiddenCount={totalHidden}
              accentColor={accentColor}
              onUpgrade={onUpgrade}
              ctaLabel="Unlock all trade targets →"
              badgeText={`+${totalHidden} picks hidden`}
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

// ─── CAPTAIN SECTION (tiered) ─────────────────────────────────────────────────

function CaptainSection({
  captains, isPremiumUser, onOpenRow, onUpgrade,
}: {
  captains: CurrentRoundPlayer[];
  isPremiumUser: boolean;
  onOpenRow: (row: CurrentRoundPlayer) => void;
  onUpgrade: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const accentColor = "#F5C84C";
  const visible = captains.slice(0, isPremiumUser ? PREMIUM_LIMIT : CAPTAIN_FREE);
  const hidden  = isPremiumUser ? [] : captains.slice(CAPTAIN_FREE, Math.min(PREMIUM_LIMIT, captains.length));
  const totalHidden = isPremiumUser ? 0 : Math.max(0, captains.length - CAPTAIN_FREE);

  const tiers: { key: "Lock" | "Safe" | "POD"; color: string; desc: string; players: CurrentRoundPlayer[] }[] = isPremiumUser ? [
    { key: "Lock", color: "#F5C84C", desc: "Highest confidence double",  players: captains.slice(0, PREMIUM_LIMIT).filter((p) => getCaptainTier(p).label === "Lock")  },
    { key: "Safe", color: "#4ade80", desc: "Reliable doubling option",   players: captains.slice(0, PREMIUM_LIMIT).filter((p) => getCaptainTier(p).label === "Safe")  },
    { key: "POD",  color: "#60a5fa", desc: "Point of difference pick",   players: captains.slice(0, PREMIUM_LIMIT).filter((p) => getCaptainTier(p).label === "POD")   },
  ].filter((t) => t.players.length > 0) : [];

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
            <span className="text-[10px] text-white/25">{CAPTAIN_FREE} of {captains.length}</span>
          )}
        </div>
        <p className="text-[11px] text-white/35 mt-1 ml-4 leading-relaxed">
          {isPremiumUser
            ? "Tiered by edge score and projection — Lock, Safe and POD options sorted by confidence."
            : "Best doubling options ranked by projection and edge score. No SIT/STRONG_SIT players included."}
        </p>
      </div>

      <div className="flex-1 py-1">
        {isPremiumUser ? (
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
                      row.projection_confidence != null ? (
                        <div className="text-right hidden sm:block">
                          <div className={`text-xs font-bold tabular-nums ${getConfidenceColor(row.projection_confidence)}`}>
                            {fmt(row.projection_confidence, 0)}%
                          </div>
                          <div className="text-[9px] text-white/25">conf</div>
                        </div>
                      ) : undefined
                    }
                    subtext={tier.desc}
                    onClick={() => onOpenRow(row)}
                  />
                );
              })}
            </div>
          ))
        ) : (
          visible.map((row, idx) => {
            const tier = getCaptainTier(row);
            return (
              <PlayerRow
                key={row.player_id ?? idx}
                row={row}
                rank={idx + 1}
                badge={<CaptainBadge tier={tier.label} />}
                metric={
                  row.projection_confidence != null ? (
                    <div className="text-right hidden sm:block">
                      <div className={`text-xs font-bold tabular-nums ${getConfidenceColor(row.projection_confidence)}`}>
                        {fmt(row.projection_confidence, 0)}%
                      </div>
                      <div className="text-[9px] text-white/25">conf</div>
                    </div>
                  ) : undefined
                }
                subtext={tier.desc}
                onClick={() => onOpenRow(row)}
              />
            );
          })
        )}

        {hidden.length > 0 && (
          <div className="relative pb-12">
            {hidden.map((row, idx) => (
              <BlurredRow key={row.player_id ?? idx} rank={CAPTAIN_FREE + idx + 1} />
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

// ─── COMPARE PLAYERS MODAL ────────────────────────────────────────────────────

interface ComparePlayersModalProps {
  players: RankingRow[];
  onClose: () => void;
  onOpenPlayer: (row: RankingRow) => void;
}

type VerdictType = "Better Start" | "Better Captain" | "Better Value" | "Safer Pick";

interface CompareResult {
  winner: RankingRow;
  loser: RankingRow;
  verdicts: VerdictType[];
  reason: string;
  stats: {
    label: string;
    a: string;
    b: string;
    winner: "a" | "b" | "tie";
  }[];
}

function ComparePlayersModal({ players, onClose, onOpenPlayer }: ComparePlayersModalProps) {
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

  const result = useMemo<CompareResult | null>(() => {
    if (!playerA || !playerB) return null;

    const projA  = playerA.projection ?? 0;
    const projB  = playerB.projection ?? 0;
    const edgeA  = playerA.edge ?? 0;
    const edgeB  = playerB.edge ?? 0;
    const confA  = playerA.projection_confidence ?? 50;
    const confB  = playerB.projection_confidence ?? 50;
    const ceilA  = playerA.ceiling_estimate ?? projA;
    const ceilB  = playerB.ceiling_estimate ?? projB;
    const floorA = playerA.floor_estimate ?? projA;
    const floorB = playerB.floor_estimate ?? projB;
    const valA   = playerA.value_score ?? 0;
    const valB   = playerB.value_score ?? 0;
    const formA  = playerA.form_score ?? 0;
    const formB  = playerB.form_score ?? 0;

    const compositeA = projA * 0.45 + edgeA * 0.30 + confA * 0.15 + formA * 0.10;
    const compositeB = projB * 0.45 + edgeB * 0.30 + confB * 0.15 + formB * 0.10;

    const pA = compositeA >= compositeB ? playerA : playerB;
    const pB = compositeA >= compositeB ? playerB : playerA;

    const [projW, projL] = compositeA >= compositeB ? [projA, projB] : [projB, projA];
    const [edgeW]        = compositeA >= compositeB ? [edgeA] : [edgeB];
    const [confW]        = compositeA >= compositeB ? [confA] : [confB];

    const verdicts: VerdictType[] = [];
    if (projW >= projL * 1.05) verdicts.push("Better Start");
    if (edgeW > 8 && edgeW > (compositeA >= compositeB ? edgeB : edgeA) + 5) verdicts.push("Better Value");
    if (confW > (compositeA >= compositeB ? confB : confA) + 10) verdicts.push("Safer Pick");
    if ((compositeA >= compositeB ? ceilA : ceilB) > (compositeA >= compositeB ? ceilB : ceilA) + 10) verdicts.push("Better Captain");
    if (verdicts.length === 0) verdicts.push("Better Start");

    const diff = Math.abs(projA - projB);
    let reason = "";
    if (diff <= 5) {
      reason = `Tight call. ${pA.player_name} edges ahead on edge score (+${fmt(edgeW, 0)}) and confidence (${fmt(confW, 0)}%).`;
    } else {
      reason = `${pA.player_name} projects ${fmt(projW, 0)} pts`;
      if (edgeW > 8) reason += ` with a strong +${fmt(edgeW, 0)} edge above breakeven`;
      else if (edgeW < -5) reason += ` — but note negative edge`;
      reason += `. ${pB.player_name} projects ${fmt(projL, 0)} pts`;
      if ((compositeA >= compositeB ? confB : confA) < 50) reason += " with moderate confidence.";
      else reason += ".";
    }

    const compare = (vA: number, vB: number): "a" | "b" | "tie" => {
      if (Math.abs(vA - vB) < 0.5) return "tie";
      return vA > vB ? "a" : "b";
    };

    const stats: CompareResult["stats"] = [
      { label: "Projection",  a: fmt(projA, 0),  b: fmt(projB, 0),  winner: compare(projA, projB)  },
      { label: "Ceiling",     a: fmt(ceilA, 0),  b: fmt(ceilB, 0),  winner: compare(ceilA, ceilB)  },
      { label: "Floor",       a: fmt(floorA, 0), b: fmt(floorB, 0), winner: compare(floorA, floorB) },
      { label: "Edge",        a: (edgeA >= 0 ? "+" : "") + fmt(edgeA, 0), b: (edgeB >= 0 ? "+" : "") + fmt(edgeB, 0), winner: compare(edgeA, edgeB) },
      { label: "Value Score", a: fmt(valA, 1),   b: fmt(valB, 1),   winner: compare(valA, valB)    },
      { label: "Form",        a: fmt(formA, 0),  b: fmt(formB, 0),  winner: compare(formA, formB)   },
      { label: "Confidence",  a: fmt(confA, 0) + "%", b: fmt(confB, 0) + "%", winner: compare(confA, confB) },
    ];

    return { winner: pA, loser: pB, verdicts, reason, stats };
  }, [playerA, playerB]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "#0e0e0e", border: "1px solid rgba(255,255,255,0.10)", maxHeight: "92vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#F5C84C]" />
            <h2 className="text-sm font-bold text-white">Compare Players</h2>
            <span className="text-[9px] px-1.5 py-px rounded-full bg-[#F5C84C]/15 text-[#F5C84C] font-semibold uppercase tracking-wider border border-[#F5C84C]/20">
              Head to Head
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-white/70 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Player selectors */}
          <div className="grid grid-cols-2 gap-3">
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
          </div>

          {/* Stats comparison table */}
          {result && (
            <>
              <div className="rounded-xl overflow-hidden border border-white/[0.07]" style={{ background: "rgba(255,255,255,0.02)" }}>
                <div className="grid grid-cols-3 px-3 py-1.5 border-b border-white/[0.05]">
                  <span className="text-[10px] font-semibold text-blue-400 truncate">{result.winner === playerA ? playerA?.player_name : playerB?.player_name}</span>
                  <span className="text-[10px] text-white/25 text-center uppercase tracking-wider font-semibold">vs</span>
                  <span className="text-[10px] font-semibold text-red-400 text-right truncate">{result.winner === playerA ? playerB?.player_name : playerA?.player_name}</span>
                </div>
                {result.stats.map((stat) => {
                  const aIsWinner = result.winner === playerA ? stat.winner === "a" : stat.winner === "b";
                  const bIsWinner = result.winner === playerA ? stat.winner === "b" : stat.winner === "a";
                  return (
                    <div key={stat.label} className="grid grid-cols-3 px-3 py-2 border-b border-white/[0.04] last:border-0">
                      <span className={`text-[12px] font-bold tabular-nums ${aIsWinner ? "text-white" : bIsWinner ? "text-white/35" : "text-white/55"}`}>
                        {result.winner === playerA ? stat.a : stat.b}
                        {aIsWinner && <CheckCircle2 className="w-2.5 h-2.5 inline ml-1 text-green-400 mb-px" />}
                      </span>
                      <span className="text-[10px] text-white/25 text-center self-center">{stat.label}</span>
                      <span className={`text-[12px] font-bold tabular-nums text-right ${bIsWinner ? "text-white" : aIsWinner ? "text-white/35" : "text-white/55"}`}>
                        {result.winner === playerA ? stat.b : stat.a}
                        {bIsWinner && <CheckCircle2 className="w-2.5 h-2.5 inline ml-1 text-green-400 mb-px" />}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Verdict */}
              <div
                className="rounded-xl p-4 space-y-2.5"
                style={{ background: "rgba(245,200,76,0.05)", border: "1px solid rgba(245,200,76,0.20)" }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Crown className="w-3.5 h-3.5 text-[#F5C84C] shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#F5C84C]">Start This Week</span>
                  <div className="flex gap-1 flex-wrap ml-auto">
                    {result.verdicts.map((v) => (
                      <span
                        key={v}
                        className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded-full"
                        style={{ background: "rgba(245,200,76,0.15)", color: "#F5C84C", border: "1px solid rgba(245,200,76,0.25)" }}
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-xl font-bold text-white">{result.winner.player_name}</p>
                <p className="text-[12px] text-white/45 leading-relaxed">{result.reason}</p>
                <div className="pt-1 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3 text-white/20 shrink-0" />
                    <span className="text-[11px] text-white/30">
                      Sit: {result.loser.player_name} — {fmt(result.loser.projection, 0)} pts projected
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {!playerA && !playerB && (
            <div className="rounded-xl p-5 text-center space-y-1.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <Search className="w-5 h-5 text-white/20 mx-auto" />
              <p className="text-[13px] text-white/30">Search two players to compare</p>
              <p className="text-[11px] text-white/20">Uses canonical projection, edge, confidence and form</p>
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
        className="rounded-xl p-3 flex flex-col gap-1.5"
        style={{ background: `${accentColor}10`, border: `1px solid ${accentColor}30` }}
      >
        <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: accentColor }}>{label}</div>
        <div className="text-sm font-bold text-white leading-tight truncate">{selected.player_name}</div>
        <div className="text-[10px] text-white/30">
          {normalisePosition(selected.position)} · {selected.team}
        </div>
        <div className="text-[11px] font-bold text-white/60 tabular-nums">{fmt(selected.projection, 0)} pts</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <button
            onClick={() => onOpenPlayer(selected)}
            className="text-[10px] font-semibold transition-colors"
            style={{ color: `${accentColor}80` }}
          >
            Details
          </button>
          <button
            onClick={onClear}
            className="ml-auto p-0.5 rounded hover:bg-white/[0.08] text-white/25 hover:text-white/50 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className="rounded-xl flex flex-col gap-1 px-3 py-2.5"
        style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${accentColor}25` }}
      >
        <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: `${accentColor}70` }}>{label}</div>
        <div className="flex items-center gap-1.5">
          <Search className="w-3 h-3 shrink-0" style={{ color: `${accentColor}50` }} />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search player..."
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
        {open ? <ChevronUp className="w-3.5 h-3.5 text-white/25" /> : <ChevronDown className="w-3.5 h-3.5 text-white/25" />}
      </button>
      <div
        className="border-t border-white/[0.05] overflow-hidden transition-all duration-200"
        style={{ maxHeight: open ? "900px" : "0px", opacity: open ? 1 : 0 }}
      >
        <div className="px-4 pb-5 pt-3 space-y-4">
          <p className="text-[12px] text-white/40 leading-relaxed">
            This page surfaces the highest-conviction AFL Fantasy decisions for {roundLabel}. Every section is powered by the same canonical backend as Rankings and Market Watch — same signals, same formulas, same edge scores.
          </p>
          <div className="space-y-2.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/30">How Each Section Works</h3>
            <ul className="space-y-2.5 text-[12px] text-white/35 leading-relaxed">
              <li><strong className="text-white/55">Must Buys</strong> — Players with START or STRONG_START canonical signal and positive edge. Ranked by edge score, not projection. Only players with games_played &gt;= 1 appear.</li>
              <li><strong className="text-white/55">Budget Upside</strong> — Priced under $350k with positive signal. No zero-game or retired players.</li>
              <li><strong className="text-white/55">Overpriced / Risk</strong> — Players with canonical SIT or STRONG_SIT signal only. Ranked by edge ascending (most negative first).</li>
              <li><strong className="text-white/55">Captain Picks</strong> — Highest projection players with non-negative signal. No SIT/STRONG_SIT players can appear here.</li>
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
  const [showCompare, setShowCompare] = useState(false);

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

  const edgeBoardIds = useMemo<Set<string>>(() => {
    const ids = (window as any).__neekoEdgeBoardIds;
    return ids instanceof Set ? ids : new Set<string>();
  }, []);

  const { captains, mustBuys, budgetPicks, riskPicks } = useMemo(
    () => buildCurrentRoundPlayers(players, edgeBoardIds),
    [players, edgeBoardIds]
  );

  const bestBuy  = mustBuys[0] ?? null;
  const bestTrap = riskPicks[0] ?? null;
  const bestCap  = captains[0] ?? null;

  const captainLocks = captains.filter((p) => getCaptainTier(p).label === "Lock").length;
  const roundNum = roundLabel.replace(/[^0-9]/g, "");
  const pageTitle = `AFL Fantasy ${roundLabel} Tips, Captain Picks & Value Players | Neeko Sports`;

  function openRow(row: RankingRow) {
    const tier: RowTier = isPremium ? "premium" : "full";
    setSelectedRow({ row, rank: 0, tier, isUnlocked: true });
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

          {/* ── PAGE HEADER ──────────────────────────────────────────── */}
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

          {/* ── SUMMARY STRIP ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard
              label="Must Buy"
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              accentColor="#4ade80"
              playerName={bestBuy?.player_name ?? null}
              stat={bestBuy?.edge != null ? `+${fmt(bestBuy.edge, 0)}` : fmt(bestBuy?.projection, 0)}
              statLabel={bestBuy?.edge != null ? "edge" : "pts proj"}
              reason={bestBuy?.why ?? null}
              badge={<BuyBadge />}
            />
            <SummaryCard
              label="Biggest Trap"
              icon={<TrendingDown className="w-3.5 h-3.5" />}
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
              badge={<CaptainBadge tier={bestCap ? getCaptainTier(bestCap).label : undefined} />}
            />
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
                  <span className="text-[10px] text-white/35">Buy Targets</span>
                  <span className="text-[11px] font-bold text-green-400 tabular-nums">{mustBuys.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/35">Trap Alerts</span>
                  <span className="text-[11px] font-bold text-red-400 tabular-nums">{riskPicks.length}</span>
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

          {/* ── SEO COLLAPSIBLE ───────────────────────────────────────── */}
          <CollapsibleSEO roundLabel={roundLabel} roundNum={roundNum} />

          {/* ── SECTION 1: MUST BUYS ──────────────────────────────────── */}
          <MustBuysSection
            mustBuys={mustBuys}
            isPremiumUser={isPremium}
            onOpenRow={openRow}
            onUpgrade={() => setShowUpgradeModal(true)}
          />

          {/* ── SECTION 2: BUDGET UPSIDE ──────────────────────────────── */}
          {budgetPicks.length > 0 && (
            <SectionCard
              title="Budget Upside"
              description="Affordable players priced under $350k with START or STRONG_START signal — genuine upside, not just cheap filler."
              icon={<Sprout className="w-4 h-4" />}
              accentColor="#2dd4bf"
              players={budgetPicks}
              freeLimit={BUDGET_FREE}
              isPremiumUser={isPremium}
              onOpenRow={openRow}
              onUpgrade={() => setShowUpgradeModal(true)}
              blurCtaLabel="Unlock all budget plays →"
              blurBadgeText={`+${Math.max(0, budgetPicks.length - BUDGET_FREE)} hidden`}
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
                row.games_played != null ? `${row.games_played} gm` : null
              }
            />
          )}

          {/* ── SECTION 3: OVERPRICED / RISK ─────────────────────────── */}
          <SectionCard
            title="Overpriced / Risk"
            description="Players with canonical SIT or STRONG_SIT signal — projecting below their breakeven. Ranked by edge score ascending."
            icon={<ShieldAlert className="w-4 h-4" />}
            accentColor="#f87171"
            players={riskPicks}
            freeLimit={RISK_FREE}
            isPremiumUser={isPremium}
            onOpenRow={openRow}
            onUpgrade={() => setShowUpgradeModal(true)}
            blurCtaLabel="Reveal all trap alerts →"
            blurBadgeText={`+${Math.max(0, riskPicks.length - RISK_FREE)} risks hidden`}
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
              return [tag, confLabel].filter(Boolean).join(" · ") || null;
            }}
          />

          {/* ── SECTION 4: CAPTAIN PICKS ──────────────────────────────── */}
          <CaptainSection
            captains={captains}
            isPremiumUser={isPremium}
            onOpenRow={openRow}
            onUpgrade={() => setShowUpgradeModal(true)}
          />

          {/* ── COMPARE PLAYERS CTA ───────────────────────────────────── */}
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
                  Projection, ceiling, floor, edge, value, form and confidence — one clear start/sit verdict.
                </p>
              </div>
            </div>
            <button
              onClick={() => { setShowCompare(true); track("compare_players_open"); }}
              className="shrink-0 flex items-center gap-1.5 text-[13px] font-bold text-[#F5C84C] border border-[#F5C84C]/30 hover:border-[#F5C84C]/60 hover:bg-[#F5C84C]/[0.08] px-4 py-2.5 rounded-xl transition-all"
            >
              Compare Players
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* ── NAV LINKS ──────────────────────────────────────────────── */}
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
      {showCompare && (
        <ComparePlayersModal
          players={players}
          onClose={() => setShowCompare(false)}
          onOpenPlayer={(row) => {
            setShowCompare(false);
            openRow(row);
          }}
        />
      )}
    </>
  );
}
