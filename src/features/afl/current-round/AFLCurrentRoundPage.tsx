import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  TrendingUp, TrendingDown, Crown, Zap, Lock, Star, Clock,
  ChartBar as BarChart2, ArrowRight, RefreshCw, ChevronRight,
  Flame, DollarSign, Sprout, X, Search, ShieldAlert,
  CircleCheck as CheckCircle2, CircleAlert as AlertCircle,
  Target, TriangleAlert as AlertTriangle,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import {
  fmt,
  fmtPrice,
  fmtUpdatedAt,
  getConfidenceColor,
} from "@/features/afl/rankings/components/helpers";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import { PlayerDetailModal, UpgradeModal } from "@/features/afl/rankings/components/RankingsModals";
import { PlayerStatusPill } from "@/features/afl/rankings/components/PlayerStatusPill";
import type { RowTier } from "@/features/afl/rankings/components/types";
import { buildCurrentRoundPlayers, type CurrentRoundPlayer } from "@/features/afl/current-round/engine";

// ─── FREE TIER LIMITS ────────────────────────────────────────────────────────
const MUST_BUY_FREE = 2;
const BUDGET_FREE   = 2;
const RISK_FREE     = 2;
const CAPTAIN_FREE  = 1;
const PREMIUM_LIMIT = 8;

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
  const edge = row.edge_canonical ?? 0;
  const price = row.price ?? 0;
  const proj = row.projection ?? 0;
  const breakeven = row.breakeven ?? 0;
  if (breakeven > 0 && proj < breakeven * 0.80) return "Overpriced";
  if (price > 700_000 && edge < -10) return "Premium Trap";
  if (edge <= -15) return "Strong Fade";
  return "Avoid";
}

function getCaptainTier(p: CurrentRoundPlayer): { label: "Lock" | "Safe" | "POD"; color: string; desc: string } {
  const edge = p.edge_canonical ?? 0;
  const proj = p.projection ?? 0;
  if (edge >= 15 || proj >= 115) return { label: "Lock",  color: "#F5C84C", desc: "Highest confidence double" };
  if (edge >= 8  || proj >= 100) return { label: "Safe",  color: "#4ade80", desc: "Reliable doubling option"  };
  return                          { label: "POD",   color: "#60a5fa", desc: "Point of difference"       };
}

// ─── BADGES ──────────────────────────────────────────────────────────────────

function BuyBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-green-500/40 bg-green-500/15 text-green-400 shrink-0 leading-none">
      <TrendingUp className="w-2.5 h-2.5" /> BUY
    </span>
  );
}

function ValueBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-emerald-400/40 bg-emerald-400/10 text-emerald-400 shrink-0 leading-none">
      <Star className="w-2.5 h-2.5" /> VALUE
    </span>
  );
}

function AvoidBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/15 text-red-400 shrink-0 leading-none">
      <AlertTriangle className="w-2.5 h-2.5" /> AVOID
    </span>
  );
}

function CaptainBadge({ tier }: { tier?: "Lock" | "Safe" | "POD" }) {
  const cls =
    tier === "Lock" ? "border-yellow-400/40 bg-yellow-400/15 text-yellow-400" :
    tier === "Safe" ? "border-green-400/30 bg-green-400/10 text-green-400" :
                     "border-blue-400/30 bg-blue-400/10 text-blue-400";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 leading-none ${cls}`}>
      <Crown className="w-2.5 h-2.5" /> {tier ?? "C"}
    </span>
  );
}

function BudgetBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-teal-400/40 bg-teal-400/10 text-teal-400 shrink-0 leading-none">
      <Sprout className="w-2.5 h-2.5" /> BUDGET
    </span>
  );
}

function EdgePickBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-orange-400/40 bg-orange-400/10 text-orange-400 shrink-0 leading-none">
      <Flame className="w-2.5 h-2.5" /> Edge Pick
    </span>
  );
}

// ─── HERO SUMMARY CARDS ───────────────────────────────────────────────────────

interface HeroCardProps {
  label: string;
  question: string;
  icon: React.ReactNode;
  accentColor: string;
  playerName: string | null;
  stat: string;
  statLabel: string;
  subStat?: string;
  subStatLabel?: string;
  context: string | null;
  badge?: React.ReactNode;
}

function HeroCard({ label, question, icon, accentColor, playerName, stat, statLabel, subStat, subStatLabel, context, badge }: HeroCardProps) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{
        background: `linear-gradient(145deg, ${accentColor}0a 0%, transparent 65%)`,
        border: `1px solid ${accentColor}28`,
      }}
    >
      {/* Label + question */}
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: `${accentColor}18` }}>
          <span style={{ color: accentColor }}>{icon}</span>
        </span>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: `${accentColor}80` }}>{label}</div>
          <div className="text-[10px] text-white/30 leading-none mt-px">{question}</div>
        </div>
      </div>

      {/* Player name + badge */}
      <div className="flex-1">
        <div className="flex items-start gap-1.5 flex-wrap">
          <span className="text-[15px] font-bold text-white leading-tight">{playerName ?? "—"}</span>
          {badge}
        </div>
        {context && (
          <p className="text-[11px] text-white/30 mt-1.5 leading-relaxed line-clamp-2">{context}</p>
        )}
      </div>

      {/* Primary stat + optional secondary */}
      <div className="flex items-end gap-3 border-t pt-2.5" style={{ borderColor: `${accentColor}14` }}>
        <div>
          <div className="text-2xl font-bold tabular-nums leading-none" style={{ color: accentColor }}>{stat}</div>
          <div className="text-[9px] text-white/25 mt-0.5 uppercase tracking-wider">{statLabel}</div>
        </div>
        {subStat && (
          <div className="mb-0.5">
            <div className="text-sm font-semibold text-white/50 tabular-nums">{subStat}</div>
            <div className="text-[9px] text-white/20 uppercase tracking-wider">{subStatLabel}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function RoundSnapshotCard({
  mustBuyCount, trapCount, captainLockCount, budgetCount,
}: {
  mustBuyCount: number; trapCount: number; captainLockCount: number; budgetCount: number;
}) {
  const rows = [
    { label: "Trade Targets",    value: mustBuyCount,     color: "#4ade80" },
    { label: "Captain Locks",    value: captainLockCount, color: "#F5C84C" },
    { label: "Budget Plays",     value: budgetCount,      color: "#2dd4bf" },
    { label: "Trap Alerts",      value: trapCount,        color: "#f87171" },
  ];
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-md bg-white/[0.07] flex items-center justify-center shrink-0">
          <Target className="w-3 h-3 text-white/50" />
        </span>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-white/30">Round Snapshot</div>
          <div className="text-[10px] text-white/25 leading-none mt-px">What this round looks like</div>
        </div>
      </div>
      <div className="flex-1 space-y-2">
        {rows.map(({ label, value, color }) => (
          <div key={label} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[11px] text-white/35">{label}</span>
            </div>
            <span className="text-[13px] font-bold tabular-nums" style={{ color }}>{value}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 border-t pt-2.5" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        <Clock className="w-2.5 h-2.5 text-white/20 shrink-0" />
        <span className="text-[9px] text-white/20">Updated before lockout</span>
      </div>
    </div>
  );
}

// ─── PLAYER ROW ───────────────────────────────────────────────────────────────

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
      className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors duration-100 group"
    >
      <span className="text-[11px] text-white/15 w-4 text-right shrink-0 font-mono tabular-nums">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[13px] font-semibold text-white truncate leading-tight">{row.player_name}</span>
          {badge}
          {row.isFeaturedPick && <EdgePickBadge />}
          <PlayerStatusPill row={row} showUpcomingBye />
        </div>
        <div className="text-[10px] text-white/25 mt-0.5">
          {normalisePosition(row.position) ?? "—"} · {row.team}
          {row.price ? ` · ${fmtPrice(row.price)}` : ""}
          {subtext ? ` · ${subtext}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        {metric}
        <div className="text-right">
          <div className="text-[13px] font-bold text-white tabular-nums">{fmt(row.projection, 0)}</div>
          <div className="text-[9px] text-white/20 uppercase tracking-wide">proj</div>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-white/10 group-hover:text-white/35 transition-colors" />
      </div>
    </button>
  );
}

// ─── SECTION METRIC HELPERS ──────────────────────────────────────────────────

function EdgeMetric({ edge, positive }: { edge: number; positive: boolean }) {
  const color = positive ? (edge >= 15 ? "#4ade80" : "#34d399") : "#f87171";
  const prefix = positive && edge > 0 ? "+" : "";
  return (
    <div className="text-right hidden sm:block w-10">
      <div className="text-[13px] font-bold tabular-nums" style={{ color }}>{prefix}{fmt(edge, 0)}</div>
      <div className="text-[9px] text-white/20 uppercase tracking-wide">edge</div>
    </div>
  );
}

function PriceMetric({ price }: { price: number }) {
  return (
    <div className="text-right hidden sm:block w-14">
      <div className="text-[13px] font-bold tabular-nums text-teal-400">{fmtPrice(price)}</div>
      <div className="text-[9px] text-white/20 uppercase tracking-wide">price</div>
    </div>
  );
}

function ConfidenceMetric({ label }: { label: string | null | undefined }) {
  if (!label) return null;
  const up = label.toUpperCase();
  const color = up === "HIGH" ? "text-green-400" : up === "MEDIUM" ? "text-yellow-400" : "text-orange-400";
  const short = up === "HIGH" ? "Hi" : up === "MEDIUM" ? "Med" : "Low";
  return (
    <div className="text-right hidden sm:block w-10">
      <div className={`text-[13px] font-bold tabular-nums ${color}`}>{short}</div>
      <div className="text-[9px] text-white/20 uppercase tracking-wide">conf</div>
    </div>
  );
}

// ─── BLURRED / LOCKED ROW ────────────────────────────────────────────────────

function BlurredRow({ rank }: { rank: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 select-none pointer-events-none">
      <span className="text-[11px] text-white/10 w-4 text-right shrink-0 font-mono">{rank}</span>
      <div className="flex-1 flex items-center gap-2">
        <Lock className="w-3 h-3 text-white/10 shrink-0" />
        <div className="h-2 w-32 rounded-full bg-white/[0.05]" />
        <div className="h-2 w-14 rounded-full bg-white/[0.03]" />
      </div>
      <div className="h-2 w-10 rounded-full bg-white/[0.03]" />
    </div>
  );
}

// ─── PREMIUM LOCK OVERLAY ────────────────────────────────────────────────────

function LockOverlay({
  hiddenCount, accentColor, onUpgrade, ctaLabel, badgeText,
}: {
  hiddenCount: number; accentColor: string; onUpgrade: () => void; ctaLabel?: string; badgeText?: string;
}) {
  return (
    <>
      <div
        className="absolute inset-0 rounded-b-2xl pointer-events-none"
        style={{ background: "linear-gradient(to bottom, transparent 0%, #070707cc 50%, #070707f8 100%)" }}
      />
      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-3.5">
        <button
          onClick={onUpgrade}
          className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: "rgba(255,255,255,0.03)", borderColor: `${accentColor}25` }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = `${accentColor}45`)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = `${accentColor}25`)}
        >
          <span className="flex items-center gap-1.5 text-[11px] text-white/35">
            <Lock className="w-3 h-3" style={{ color: `${accentColor}60` }} />
            {badgeText ?? `+${hiddenCount} more picks`}
          </span>
          <span className="text-[12px] font-bold" style={{ color: accentColor }}>
            {ctaLabel ?? "Unlock Neeko+"} →
          </span>
        </button>
      </div>
    </>
  );
}

// ─── SECTION HEADER ──────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  accentColor: string;
  freeCount?: number;
  totalCount?: number;
  showCounts: boolean;
}

function SectionHeader({ title, description, icon, accentColor, freeCount, totalCount, showCounts }: SectionHeaderProps) {
  return (
    <div className="px-4 pt-4 pb-3" style={{ borderBottom: `1px solid ${accentColor}14` }}>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${accentColor}18` }}>
          <span style={{ color: accentColor }}>{icon}</span>
        </div>
        <h2 className="text-[13px] font-bold text-white flex-1 tracking-tight">{title}</h2>
        {showCounts && freeCount != null && totalCount != null && totalCount > freeCount && (
          <span className="text-[10px] text-white/20 tabular-nums">{freeCount} of {totalCount} shown</span>
        )}
      </div>
      <p className="text-[11px] text-white/30 mt-1.5 ml-8 leading-relaxed">{description}</p>
    </div>
  );
}

// ─── SECTION FOOTER LINK ─────────────────────────────────────────────────────

function SectionFooter({ to, label, accentColor }: { to: string; label: string; accentColor: string }) {
  return (
    <div className="px-4 py-2.5" style={{ borderTop: `1px solid ${accentColor}0e` }}>
      <Link
        to={to}
        className="flex items-center gap-1 text-[11px] transition-colors"
        style={{ color: `${accentColor}50` }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = `${accentColor}90`)}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = `${accentColor}50`)}
      >
        {label}
        <ChevronRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

// ─── TIER DIVIDER ────────────────────────────────────────────────────────────

function TierDivider({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
      <div className="h-px flex-1" style={{ background: `${color}18` }} />
      <span
        className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
        style={{ color, background: `${color}10`, border: `1px solid ${color}20` }}
      >
        {label}
      </span>
      <div className="h-px flex-1" style={{ background: `${color}18` }} />
    </div>
  );
}

// ─── MUST BUYS SECTION ───────────────────────────────────────────────────────

function MustBuysSection({
  mustBuys, isPremiumUser, onOpenRow, onUpgrade,
}: {
  mustBuys: CurrentRoundPlayer[];
  isPremiumUser: boolean;
  onOpenRow: (row: CurrentRoundPlayer) => void;
  onUpgrade: () => void;
}) {
  const accentColor = "#4ade80";
  const visible = mustBuys.slice(0, isPremiumUser ? PREMIUM_LIMIT : MUST_BUY_FREE);
  const hidden  = isPremiumUser ? [] : mustBuys.slice(MUST_BUY_FREE, Math.min(PREMIUM_LIMIT, mustBuys.length));
  const totalHidden = isPremiumUser ? 0 : Math.max(0, mustBuys.length - MUST_BUY_FREE);

  const strong = visible.filter((p) => {
    const ac = (p.action_canonical ?? "").toUpperCase();
    return ac === "SMASH_START" || ac === "STRONG_START";
  });
  const start = visible.filter((p) => (p.action_canonical ?? "").toUpperCase() === "START");

  const renderRow = (row: CurrentRoundPlayer, globalIdx: number) => {
    const ac = (row.action_canonical ?? "").toUpperCase();
    const isStrong = ac === "SMASH_START" || ac === "STRONG_START";
    return (
      <PlayerRow
        key={row.player_id ?? globalIdx}
        row={row}
        rank={globalIdx + 1}
        badge={isStrong ? <BuyBadge /> : <ValueBadge />}
        metric={(row.edge_canonical ?? row.decision_score) != null ? <EdgeMetric edge={row.edge_canonical ?? row.decision_score ?? 0} positive /> : undefined}
        subtext={(row.edge_canonical ?? row.decision_score) != null ? `${(row.edge_canonical ?? row.decision_score ?? 0) >= 0 ? "+" : ""}${(row.edge_canonical ?? row.decision_score ?? 0).toFixed(1)} edge` : null}
        onClick={() => onOpenRow(row)}
      />
    );
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${accentColor}28`, background: `linear-gradient(145deg, ${accentColor}05 0%, transparent 55%)` }}>
      <SectionHeader
        title="Must Buys"
        description="Who should I target this round?"
        icon={<TrendingUp className="w-3.5 h-3.5" />}
        accentColor={accentColor}
        freeCount={MUST_BUY_FREE}
        totalCount={mustBuys.length}
        showCounts={!isPremiumUser}
      />

      <div className="py-1">
        {isPremiumUser ? (
          <>
            {strong.length > 0 && (
              <>
                <TierDivider label="Start Signal — High Value" color="#4ade80" />
                {strong.map((row, idx) => renderRow(row, idx))}
              </>
            )}
            {start.length > 0 && (
              <>
                <TierDivider label="Trade Targets" color="#34d399" />
                {start.map((row, idx) => renderRow(row, strong.length + idx))}
              </>
            )}
            {strong.length === 0 && start.length === 0 && visible.length > 0 && (
              <>
                <TierDivider label="Trade Targets" color="#34d399" />
                {visible.map((row, idx) => renderRow(row, idx))}
              </>
            )}
          </>
        ) : (
          visible.map((row, idx) => renderRow(row, idx))
        )}

        {hidden.length > 0 && (
          <div className="relative pb-14 mt-1">
            {hidden.map((row, idx) => (
              <BlurredRow key={row.player_id ?? idx} rank={MUST_BUY_FREE + idx + 1} />
            ))}
            <LockOverlay
              hiddenCount={totalHidden}
              accentColor={accentColor}
              onUpgrade={onUpgrade}
              ctaLabel="Unlock all trade targets"
              badgeText={`+${totalHidden} targets hidden`}
            />
          </div>
        )}
      </div>

      <SectionFooter to="/sports/afl/market-watch" label="Market Watch" accentColor={accentColor} />
    </div>
  );
}

// ─── CAPTAIN SECTION ─────────────────────────────────────────────────────────

function CaptainSection({
  captains, isPremiumUser, onOpenRow, onUpgrade,
}: {
  captains: CurrentRoundPlayer[];
  isPremiumUser: boolean;
  onOpenRow: (row: CurrentRoundPlayer) => void;
  onUpgrade: () => void;
}) {
  const accentColor = "#F5C84C";
  const visible = captains.slice(0, isPremiumUser ? PREMIUM_LIMIT : CAPTAIN_FREE);
  const hidden  = isPremiumUser ? [] : captains.slice(CAPTAIN_FREE, Math.min(PREMIUM_LIMIT, captains.length));
  const totalHidden = isPremiumUser ? 0 : Math.max(0, captains.length - CAPTAIN_FREE);

  const tiers: { key: "Lock" | "Safe" | "POD"; color: string; label: string; players: CurrentRoundPlayer[] }[] = [
    { key: "Lock", color: "#F5C84C", label: "Lock — Highest Confidence",  players: captains.slice(0, PREMIUM_LIMIT).filter((p) => getCaptainTier(p).label === "Lock") },
    { key: "Safe", color: "#4ade80", label: "Safe — Reliable Option",     players: captains.slice(0, PREMIUM_LIMIT).filter((p) => getCaptainTier(p).label === "Safe") },
    { key: "POD",  color: "#60a5fa", label: "POD — Point of Difference",  players: captains.slice(0, PREMIUM_LIMIT).filter((p) => getCaptainTier(p).label === "POD")  },
  ].filter((t) => t.players.length > 0);

  const renderCaptainRow = (row: CurrentRoundPlayer, rankNum: number) => {
    const tier = getCaptainTier(row);
    return (
      <PlayerRow
        key={row.player_id ?? rankNum}
        row={row}
        rank={rankNum + 1}
        badge={<CaptainBadge tier={tier.label} />}
        metric={row.confidence_label != null ? <ConfidenceMetric label={row.confidence_label} /> : undefined}
        subtext={tier.desc}
        onClick={() => onOpenRow(row)}
      />
    );
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${accentColor}28`, background: `linear-gradient(145deg, ${accentColor}05 0%, transparent 55%)` }}>
      <SectionHeader
        title="Captain Picks"
        description="Who should I trust with the armband?"
        icon={<Crown className="w-3.5 h-3.5" />}
        accentColor={accentColor}
        freeCount={CAPTAIN_FREE}
        totalCount={captains.length}
        showCounts={!isPremiumUser}
      />

      <div className="py-1">
        {isPremiumUser ? (
          tiers.map((tier) => (
            <div key={tier.key}>
              <TierDivider label={tier.label} color={tier.color} />
              {tier.players.map((row) => renderCaptainRow(row, captains.indexOf(row)))}
            </div>
          ))
        ) : (
          visible.map((row, idx) => renderCaptainRow(row, idx))
        )}

        {hidden.length > 0 && (
          <div className="relative pb-14 mt-1">
            {hidden.map((row, idx) => (
              <BlurredRow key={row.player_id ?? idx} rank={CAPTAIN_FREE + idx + 1} />
            ))}
            <LockOverlay
              hiddenCount={totalHidden}
              accentColor={accentColor}
              onUpgrade={onUpgrade}
              ctaLabel="Unlock full captain strategy"
              badgeText={`+${totalHidden} options hidden`}
            />
          </div>
        )}
      </div>

      <SectionFooter to="/sports/afl/rankings" label="Full Rankings" accentColor={accentColor} />
    </div>
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
  renderBadge?: (row: CurrentRoundPlayer) => React.ReactNode;
  renderMetric?: (row: CurrentRoundPlayer) => React.ReactNode;
  renderSubtext?: (row: CurrentRoundPlayer) => string | null;
}

function SectionCard({
  title, description, icon, accentColor, players, freeLimit, isPremiumUser,
  onOpenRow, onUpgrade, blurCtaLabel, blurBadgeText, footerLink,
  renderBadge, renderMetric, renderSubtext,
}: SectionCardProps) {
  const visible = players.slice(0, isPremiumUser ? PREMIUM_LIMIT : freeLimit);
  const hidden  = isPremiumUser ? [] : players.slice(freeLimit, Math.min(PREMIUM_LIMIT, players.length));
  const totalHidden = isPremiumUser ? 0 : Math.max(0, players.length - freeLimit);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${accentColor}28`, background: `linear-gradient(145deg, ${accentColor}05 0%, transparent 55%)` }}>
      <SectionHeader
        title={title}
        description={description}
        icon={icon}
        accentColor={accentColor}
        freeCount={freeLimit}
        totalCount={players.length}
        showCounts={!isPremiumUser}
      />

      <div className="py-1">
        {visible.map((row, idx) => (
          <PlayerRow
            key={row.player_id ?? idx}
            row={row}
            rank={idx + 1}
            badge={renderBadge ? renderBadge(row) : undefined}
            metric={renderMetric ? renderMetric(row) : undefined}
            subtext={renderSubtext ? renderSubtext(row) : null}
            onClick={() => onOpenRow(row)}
          />
        ))}

        {hidden.length > 0 && (
          <div className="relative pb-14 mt-1">
            {hidden.map((row, idx) => (
              <BlurredRow key={row.player_id ?? idx} rank={freeLimit + idx + 1} />
            ))}
            <LockOverlay
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
        <SectionFooter to={footerLink.to} label={footerLink.label} accentColor={accentColor} />
      )}
    </div>
  );
}

// ─── COMPARE PLAYERS MODAL ───────────────────────────────────────────────────

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
  stats: { label: string; a: string; b: string; winner: "a" | "b" | "tie" }[];
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
      .slice(0, 7);
  }

  const optionsA = filterOptions(searchA, playerB);
  const optionsB = filterOptions(searchB, playerA);

  const result = useMemo<CompareResult | null>(() => {
    if (!playerA || !playerB) return null;

    const projA  = playerA.projection ?? 0;
    const projB  = playerB.projection ?? 0;
    const edgeA  = playerA.edge_canonical ?? 0;
    const edgeB  = playerB.edge_canonical ?? 0;
    const confLabelA = (playerA.confidence_label ?? "").toUpperCase();
    const confLabelB = (playerB.confidence_label ?? "").toUpperCase();
    const confA  = confLabelA === "HIGH" ? 85 : confLabelA === "MEDIUM" ? 55 : 30;
    const confB  = confLabelB === "HIGH" ? 85 : confLabelB === "MEDIUM" ? 55 : 30;
    const ceilA  = playerA.ceiling_estimate ?? projA;
    const ceilB  = playerB.ceiling_estimate ?? projB;
    const floorA = playerA.floor_estimate ?? projA;
    const floorB = playerB.floor_estimate ?? projB;
    const formDeltaA = (playerA as any).form_delta as number | null | undefined;
    const formDeltaB = (playerB as any).form_delta as number | null | undefined;
    const formA  = formDeltaA ?? 0;
    const formB  = formDeltaB ?? 0;

    const compositeA = projA * 0.45 + edgeA * 0.30 + confA * 0.15 + formA * 0.10;
    const compositeB = projB * 0.45 + edgeB * 0.30 + confB * 0.15 + formB * 0.10;
    const aWins = compositeA >= compositeB;

    const pA = aWins ? playerA : playerB;
    const pB = aWins ? playerB : playerA;

    const projW  = aWins ? projA : projB;
    const projL  = aWins ? projB : projA;
    const edgeW  = aWins ? edgeA : edgeB;
    const edgeL  = aWins ? edgeB : edgeA;
    const confW  = aWins ? confA : confB;
    const confL  = aWins ? confB : confA;
    const ceilW  = aWins ? ceilA : ceilB;
    const ceilL  = aWins ? ceilB : ceilA;

    const verdicts: VerdictType[] = [];
    if (projW >= projL * 1.05) verdicts.push("Better Start");
    if (edgeW > 8 && edgeW > edgeL + 5) verdicts.push("Better Value");
    if (confW > confL + 10) verdicts.push("Safer Pick");
    if (ceilW > ceilL + 10) verdicts.push("Better Captain");
    if (verdicts.length === 0) verdicts.push("Better Start");

    const diff = Math.abs(projA - projB);
    let reason = "";
    if (diff <= 4) {
      reason = `Very close match-up. ${pA.player_name} edges ahead on composite score — primarily edge (+${fmt(edgeW, 0)}) and confidence (${fmt(confW, 0)}%).`;
    } else {
      reason = `${pA.player_name} projects ${fmt(projW, 0)} pts`;
      if (edgeW > 8) reason += ` with a strong +${fmt(edgeW, 0)} edge above breakeven`;
      else if (edgeW < -5) reason += ` — though note a negative edge of ${fmt(edgeW, 0)}`;
      reason += `. ${pB.player_name} projects ${fmt(projL, 0)} pts`;
      reason += confL < 50 ? " with moderate confidence." : ".";
    }

    const compare = (vA: number, vB: number): "a" | "b" | "tie" => {
      if (Math.abs(vA - vB) < 0.5) return "tie";
      return vA > vB ? "a" : "b";
    };

    return {
      winner: pA,
      loser: pB,
      verdicts,
      reason,
      stats: [
        { label: "Projection",  a: fmt(projA, 0),  b: fmt(projB, 0),  winner: compare(projA, projB)  },
        { label: "Ceiling",     a: fmt(ceilA, 0),  b: fmt(ceilB, 0),  winner: compare(ceilA, ceilB)  },
        { label: "Floor",       a: fmt(floorA, 0), b: fmt(floorB, 0), winner: compare(floorA, floorB) },
        { label: "Edge",        a: (edgeA >= 0 ? "+" : "") + fmt(edgeA, 0), b: (edgeB >= 0 ? "+" : "") + fmt(edgeB, 0), winner: compare(edgeA, edgeB) },
        { label: "Form",        a: fmt(formA, 0),  b: fmt(formB, 0),  winner: compare(formA, formB)   },
        { label: "Confidence",  a: fmt(confA, 0) + "%", b: fmt(confB, 0) + "%", winner: compare(confA, confB) },
      ],
    };
  }, [playerA, playerB]);

  const isEmpty = !playerA && !playerB;
  const hasOne  = (playerA && !playerB) || (!playerA && playerB);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.09)", maxHeight: "92vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: "rgba(245,200,76,0.15)" }}>
              <Zap className="w-3.5 h-3.5 text-[#F5C84C]" />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white leading-none">Compare Players</h2>
              <p className="text-[10px] text-white/30 mt-0.5">Head-to-head decision engine</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.08] text-white/35 hover:text-white/70 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Player selectors */}
          <div className="grid grid-cols-2 gap-3 px-5 pt-4 pb-3">
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

          {/* Empty state */}
          {isEmpty && (
            <div className="mx-5 mb-5 rounded-xl py-10 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mx-auto mb-3">
                <Search className="w-4.5 h-4.5 text-white/20" />
              </div>
              <p className="text-[13px] font-semibold text-white/30">Search two players to compare</p>
              <p className="text-[11px] text-white/20 mt-1 leading-relaxed px-4">
                Projection, ceiling, floor, edge, value, form and confidence — one clear verdict
              </p>
            </div>
          )}

          {/* One selected — prompt for second */}
          {hasOne && !result && (
            <div className="mx-5 mb-5 rounded-xl py-6 text-center" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-[12px] text-white/30">Now search for a second player to compare</p>
            </div>
          )}

          {/* Comparison result */}
          {result && (
            <div className="px-5 pb-5 space-y-3">
              {/* Stats table */}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_60px_1fr] px-4 py-2.5 border-b border-white/[0.05]">
                  <span className="text-[11px] font-bold text-blue-400 truncate">{playerA?.player_name}</span>
                  <span className="text-[9px] text-white/20 text-center uppercase tracking-widest font-semibold self-center">vs</span>
                  <span className="text-[11px] font-bold text-red-400 text-right truncate">{playerB?.player_name}</span>
                </div>
                {result.stats.map((stat, i) => {
                  const aW = stat.winner === "a";
                  const bW = stat.winner === "b";
                  return (
                    <div key={stat.label} className={`grid grid-cols-[1fr_60px_1fr] px-4 py-2 ${i < result.stats.length - 1 ? "border-b border-white/[0.03]" : ""}`}>
                      <div className="flex items-center gap-1">
                        {aW && <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />}
                        <span className={`text-[13px] font-bold tabular-nums ${aW ? "text-white" : bW ? "text-white/25" : "text-white/45"}`}>
                          {stat.a}
                        </span>
                      </div>
                      <span className="text-[9px] text-white/20 text-center uppercase tracking-wider font-medium self-center">{stat.label}</span>
                      <div className="flex items-center justify-end gap-1">
                        <span className={`text-[13px] font-bold tabular-nums ${bW ? "text-white" : aW ? "text-white/25" : "text-white/45"}`}>
                          {stat.b}
                        </span>
                        {bW && <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Verdict panel */}
              <div
                className="rounded-xl p-4 space-y-3"
                style={{ background: "rgba(245,200,76,0.04)", border: "1px solid rgba(245,200,76,0.18)" }}
              >
                {/* Verdict badges row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Crown className="w-3.5 h-3.5 text-[#F5C84C] shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#F5C84C]">Start This Week</span>
                  <div className="flex gap-1 flex-wrap ml-auto">
                    {result.verdicts.map((v) => (
                      <span
                        key={v}
                        className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                        style={{ background: "rgba(245,200,76,0.12)", color: "#F5C84C", border: "1px solid rgba(245,200,76,0.22)" }}
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Winner name */}
                <div>
                  <div className="text-[22px] font-bold text-white leading-tight">{result.winner.player_name}</div>
                  <div className="text-[11px] text-white/35 mt-0.5">
                    {normalisePosition(result.winner.position)} · {result.winner.team} · {fmt(result.winner.projection, 0)} pts projected
                  </div>
                </div>

                {/* Reason */}
                <p className="text-[12px] text-white/40 leading-relaxed border-t border-white/[0.06] pt-3">{result.reason}</p>

                {/* Sit recommendation */}
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3 text-white/15 shrink-0" />
                  <span className="text-[11px] text-white/25">
                    Sit: {result.loser.player_name} — {fmt(result.loser.projection, 0)} pts projected
                  </span>
                </div>
              </div>
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
      <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: `${accentColor}0d`, border: `1px solid ${accentColor}28` }}>
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: `${accentColor}90` }}>{label}</span>
          <button
            onClick={onClear}
            className="w-4 h-4 rounded flex items-center justify-center hover:bg-white/[0.1] text-white/20 hover:text-white/50 transition-colors"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
        <div className="text-[13px] font-bold text-white leading-tight truncate">{selected.player_name}</div>
        <div className="text-[10px] text-white/30 leading-none">
          {normalisePosition(selected.position)} · {selected.team}
        </div>
        <div className="flex items-end justify-between mt-0.5">
          <div>
            <span className="text-[15px] font-bold tabular-nums" style={{ color: accentColor }}>{fmt(selected.projection, 0)}</span>
            <span className="text-[9px] text-white/20 ml-1">pts</span>
          </div>
          <button
            onClick={() => onOpenPlayer(selected)}
            className="text-[10px] font-semibold transition-colors underline underline-offset-2"
            style={{ color: `${accentColor}70` }}
          >
            Details
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className="rounded-xl px-3 py-2.5 flex flex-col gap-1.5"
        style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${accentColor}20` }}
      >
        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: `${accentColor}60` }}>{label}</span>
        <div className="flex items-center gap-1.5">
          <Search className="w-3 h-3 shrink-0 text-white/20" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search player..."
            className="w-full bg-transparent text-[13px] text-white placeholder-white/20 outline-none leading-tight"
          />
        </div>
      </div>
      {options.length > 0 && (
        <div
          className="absolute z-20 top-full left-0 right-0 mt-1 rounded-xl overflow-hidden shadow-2xl"
          style={{ background: "#111", border: "1px solid rgba(255,255,255,0.09)" }}
        >
          {options.map((p) => (
            <button
              key={p.player_id}
              onClick={() => onSelect(p)}
              className="w-full text-left px-3 py-2 hover:bg-white/[0.06] transition-colors flex items-center justify-between gap-2 border-b border-white/[0.04] last:border-0"
            >
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-white truncate">{p.player_name}</div>
                <div className="text-[10px] text-white/25">{normalisePosition(p.position)} · {p.team}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[13px] font-bold text-white tabular-nums">{fmt(p.projection, 0)}</div>
                <div className="text-[9px] text-white/20">proj</div>
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
    <div className="border border-white/[0.05] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
        aria-expanded={open}
      >
        <span className="text-[11px] text-white/30 font-medium">About this week's picks — {roundLabel}</span>
        <ChevronRight
          className="w-3.5 h-3.5 text-white/20 transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0)" }}
        />
      </button>
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: open ? "900px" : "0", opacity: open ? 1 : 0, borderTop: open ? "1px solid rgba(255,255,255,0.05)" : "none" }}
      >
        <div className="px-4 pb-5 pt-3 space-y-3.5">
          <p className="text-[12px] text-white/35 leading-relaxed">
            Every section uses the same canonical backend as Rankings and Market Watch — same edge scores, same signals, same formulas. No manual picks or page-local logic.
          </p>
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/20">How Each Section Works</p>
            <ul className="space-y-2 text-[11px] text-white/30 leading-relaxed">
              <li><strong className="text-white/50">Must Buys</strong> — START or STRONG_START signal + positive edge. Only players with at least 1 game played.</li>
              <li><strong className="text-white/50">Budget Upside</strong> — Under $350k with positive signal. Genuine upside, not just cheap filler.</li>
              <li><strong className="text-white/50">Overpriced / Risk</strong> — SIT or STRONG_SIT signal only. Ranked by edge ascending (worst first).</li>
              <li><strong className="text-white/50">Captain Picks</strong> — Highest projection players with non-negative signal. No SIT players here.</li>
            </ul>
          </div>
          {roundNum && (
            <Link
              to={`/sports/afl/round/${roundNum}`}
              className="inline-flex items-center gap-1 text-[11px] text-white/30 hover:text-white/60 underline underline-offset-2 transition-colors"
            >
              View Round {roundNum} match breakdown
              <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── COMPARE PLAYERS CTA BANNER ──────────────────────────────────────────────

function CompareCTA({ onOpen }: { onOpen: () => void }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "rgba(245,200,76,0.03)", border: "1px solid rgba(245,200,76,0.12)" }}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 px-5 py-5">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(245,200,76,0.10)", border: "1px solid rgba(245,200,76,0.18)" }}
          >
            <Zap className="w-4.5 h-4.5 text-[#F5C84C]" />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-white leading-tight">Torn between two players?</h3>
            <p className="text-[12px] text-white/35 mt-1 leading-relaxed">
              Projection, ceiling, floor, edge, value, form &amp; confidence — one clear start or sit verdict.
            </p>
          </div>
        </div>
        <button
          onClick={onOpen}
          className="shrink-0 flex items-center gap-2 text-[13px] font-bold text-[#F5C84C] border border-[#F5C84C]/25 hover:border-[#F5C84C]/55 hover:bg-[#F5C84C]/[0.07] px-4 py-2.5 rounded-xl transition-all duration-150 active:scale-[0.98]"
        >
          Compare Players
          <ArrowRight className="w-4 h-4" />
        </button>
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

  const bestBuy   = mustBuys[0] ?? null;
  const bestTrap  = riskPicks[0] ?? null;
  const bestCap   = captains[0] ?? null;
  const captainLockCount = captains.filter((p) => getCaptainTier(p).label === "Lock").length;
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
        <div className="text-white/25 text-sm animate-pulse">Loading {roundLabel}...</div>
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
              { "@type": "ListItem", "position": 3, "name": "Current Round", "item": "https://neekostats.com.au/sports/afl/current-round" },
            ],
          },
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-[#070707] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">

          {/* ── PAGE HEADER ────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">AFL Fantasy</span>
                <span className="text-white/10">·</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#F5C84C]/70">{roundLabel}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight tracking-tight">Weekly Game Plan</h1>
              <p className="text-[13px] text-white/35 mt-1.5">Your round briefing — buys, traps, budget plays &amp; captain calls</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 mt-1">
              {updatedAt && (
                <div className="hidden sm:flex items-center gap-1 text-[10px] text-white/20">
                  <Clock className="w-3 h-3" />
                  {fmtUpdatedAt(updatedAt)}
                </div>
              )}
              <button
                onClick={() => fetchData(true)}
                disabled={refreshing}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors disabled:opacity-40"
                title="Refresh data"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-white/35 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* ── HERO CARDS ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <HeroCard
              label="Must Buy"
              question="Who should I target?"
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              accentColor="#4ade80"
              playerName={bestBuy?.player_name ?? null}
              stat={bestBuy != null ? `+${fmt(bestBuy.decision_score ?? bestBuy.edge_canonical ?? 0, 0)}` : "—"}
              statLabel="decision score"
              subStat={bestBuy?.projection != null ? fmt(bestBuy.projection, 0) : undefined}
              subStatLabel="pts proj"
              context={bestBuy?.why ?? null}
              badge={<BuyBadge />}
            />
            <HeroCard
              label="Biggest Trap"
              question="Who should I avoid?"
              icon={<TrendingDown className="w-3.5 h-3.5" />}
              accentColor="#f87171"
              playerName={bestTrap?.player_name ?? null}
              stat={bestTrap != null ? fmt(bestTrap.decision_score ?? bestTrap.edge_canonical ?? 0, 0) : "—"}
              statLabel="decision score"
              subStat={bestTrap?.projection != null ? fmt(bestTrap.projection, 0) : undefined}
              subStatLabel="pts proj"
              context={bestTrap?.why ?? null}
              badge={<AvoidBadge />}
            />
            <HeroCard
              label="Captain Pick"
              question="Who wins me the week?"
              icon={<Crown className="w-3.5 h-3.5" />}
              accentColor="#F5C84C"
              playerName={bestCap?.player_name ?? null}
              stat={bestCap?.projection != null ? fmt(bestCap.projection, 0) : "—"}
              statLabel="pts projected"
              subStat={bestCap?.confidence_label ?? undefined}
              subStatLabel="confidence"
              context={bestCap?.why ?? null}
              badge={<CaptainBadge tier={bestCap ? getCaptainTier(bestCap).label : undefined} />}
            />
            <RoundSnapshotCard
              mustBuyCount={mustBuys.length}
              trapCount={riskPicks.length}
              captainLockCount={captainLockCount}
              budgetCount={budgetPicks.length}
            />
          </div>

          {/* ── SEO COLLAPSIBLE ──────────────────────────────────────── */}
          <CollapsibleSEO roundLabel={roundLabel} roundNum={roundNum} />

          {/* ── SECTION 1: MUST BUYS ────────────────────────────────── */}
          <MustBuysSection
            mustBuys={mustBuys}
            isPremiumUser={isPremium}
            onOpenRow={openRow}
            onUpgrade={() => setShowUpgradeModal(true)}
          />

          {/* ── SECTION 2: BUDGET UPSIDE ────────────────────────────── */}
          {budgetPicks.length > 0 && (
            <SectionCard
              title="Budget Upside"
              description="Where is the cheap upside this round?"
              icon={<Sprout className="w-3.5 h-3.5" />}
              accentColor="#2dd4bf"
              players={budgetPicks}
              freeLimit={BUDGET_FREE}
              isPremiumUser={isPremium}
              onOpenRow={openRow}
              onUpgrade={() => setShowUpgradeModal(true)}
              blurCtaLabel="Unlock all budget plays"
              blurBadgeText={`+${Math.max(0, budgetPicks.length - BUDGET_FREE)} more under $350k`}
              footerLink={{ label: "Full Rankings", to: "/sports/afl/rankings" }}
              renderBadge={() => <BudgetBadge />}
              renderMetric={(row) => row.price != null ? <PriceMetric price={row.price} /> : undefined}
              renderSubtext={(row) => row.games_played != null ? `${row.games_played} gm played` : null}
            />
          )}

          {/* ── SECTION 3: OVERPRICED / RISK ───────────────────────── */}
          <SectionCard
            title="Overpriced / Risk"
            description="Who should I move on from this week?"
            icon={<ShieldAlert className="w-3.5 h-3.5" />}
            accentColor="#f87171"
            players={riskPicks}
            freeLimit={RISK_FREE}
            isPremiumUser={isPremium}
            onOpenRow={openRow}
            onUpgrade={() => setShowUpgradeModal(true)}
            blurCtaLabel="Reveal all trap alerts"
            blurBadgeText={`+${Math.max(0, riskPicks.length - RISK_FREE)} more risks hidden`}
            footerLink={{ label: "Full Rankings", to: "/sports/afl/rankings" }}
            renderBadge={() => <AvoidBadge />}
            renderMetric={(row) => (row.edge_canonical ?? row.decision_score) != null ? <EdgeMetric edge={row.edge_canonical ?? row.decision_score ?? 0} positive={false} /> : undefined}
            renderSubtext={(row) => {
              const tag = getRiskTag(row);
              return tag || null;
            }}
          />

          {/* ── SECTION 4: CAPTAIN PICKS ────────────────────────────── */}
          <CaptainSection
            captains={captains}
            isPremiumUser={isPremium}
            onOpenRow={openRow}
            onUpgrade={() => setShowUpgradeModal(true)}
          />

          {/* ── COMPARE PLAYERS ─────────────────────────────────────── */}
          <CompareCTA onOpen={() => { setShowCompare(true); track("compare_players_open"); }} />

          {/* ── NAV LINKS ───────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Link
              to="/sports/afl/rankings"
              className="flex items-center justify-between bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] hover:border-white/[0.10] rounded-xl px-4 py-3 transition-all group"
            >
              <div className="flex items-center gap-2.5">
                <BarChart2 className="w-4 h-4 text-white/25" />
                <div>
                  <div className="text-[13px] font-semibold text-white">Full Rankings</div>
                  <div className="text-[10px] text-white/25">600+ players ranked by projection</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-white/15 group-hover:text-white/45 group-hover:translate-x-0.5 transition-all" />
            </Link>
            <Link
              to="/sports/afl/market-watch"
              className="flex items-center justify-between bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] hover:border-white/[0.10] rounded-xl px-4 py-3 transition-all group"
            >
              <div className="flex items-center gap-2.5">
                <DollarSign className="w-4 h-4 text-white/25" />
                <div>
                  <div className="text-[13px] font-semibold text-white">Market Watch</div>
                  <div className="text-[10px] text-white/25">Price movements &amp; trade signals</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-white/15 group-hover:text-white/45 group-hover:translate-x-0.5 transition-all" />
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
