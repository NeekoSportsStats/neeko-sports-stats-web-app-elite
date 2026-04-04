import { useState } from "react";
import { ChevronDown, ChevronUp, Lock, Crown } from "lucide-react";
import { RankingRow, RankingsTab, RowTier } from "./types";
import { PlayerStatusPill } from "./PlayerStatusPill";
import {
  fmt, fmtInt, fmtPrice, fmtPriceChange, fmtValueScore,
  getNeekoRatingBadge, getRiskBadge, getValueTagStyle,
  getValueScoreColor, getConfidenceColor, getDisplayRecommendation,
  resolveRecommendationColor, formatActionLabel,
} from "./helpers";

interface MobilePlayerCardProps {
  row: RankingRow;
  idx: number;
  tier: RowTier;
  activeTab: RankingsTab;
  isPremium: boolean;
  onOpenDetail: () => void;
  onUpgrade: () => void;
}

export function MobilePlayerCard({
  row,
  idx,
  tier,
  activeTab,
  isPremium,
  onOpenDetail,
  onUpgrade,
}: MobilePlayerCardProps) {
  const [expanded, setExpanded] = useState(false);

  const rank = idx + 1;
  const neekoRBadge = getNeekoRatingBadge(row.neeko_rating ?? null);
  const riskBadge = getRiskBadge(Number(row.risk_rating) ?? null);
  const vtStyle = getValueTagStyle(row.value_tag);
  const isUnlocked = tier === "full" || tier === "premium";
  const displayRec = getDisplayRecommendation(row, activeTab);

  if (tier === "locked") {
    return (
      <div
        className="border-b border-white/[0.04] px-4 py-3 cursor-pointer opacity-30 blur-sm select-none"
        onClick={onUpgrade}
        style={{ touchAction: "manipulation" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/30 w-6 tabular-nums">{rank}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white/50">Player {rank}</div>
            <div className="text-xs text-white/30">— · —</div>
          </div>
          <div className="text-sm text-white/30">—</div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-white/[0.04]">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-white/[0.04]"
        style={{ touchAction: "manipulation" }}
        onClick={() => {
          if (expanded) {
            setExpanded(false);
          } else {
            onOpenDetail();
          }
        }}
      >
        <span className="text-xs text-white/30 w-6 tabular-nums shrink-0">{rank}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-white truncate">{row.player_name}</span>
            <PlayerStatusPill row={row} showUpcomingBye />
            {!isPremium && isUnlocked && (
              <span className="rounded-sm bg-[#F5C84C]/15 px-1 py-0.5 text-[9px] font-semibold text-[#F5C84C] uppercase tracking-wide shrink-0">Free</span>
            )}
          </div>
          <div className="text-[11px] text-white/40 mt-0.5">
            {row.team}{row.position ? ` · ${row.position}` : ""}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className={`text-sm font-extrabold tabular-nums ${neekoRBadge.text}`} style={neekoRBadge.glow ? { filter: neekoRBadge.glow } : undefined}>
              {row.neeko_rating != null ? Number(row.neeko_rating).toFixed(1) : "—"}
            </div>
            <div className="text-[10px] text-[#F5C84C]/70 tabular-nums">
              {fmt(row.projection_final, 0)}
            </div>
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="w-7 h-7 flex items-center justify-center rounded-md bg-white/5 text-white/40 hover:bg-white/10 transition-colors shrink-0"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-white/[0.015]">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-lg bg-white/5 px-3 py-2.5">
              <p className="text-[9px] text-white/35 uppercase tracking-wider mb-0.5">Confidence</p>
              <p className={`text-sm font-semibold ${getConfidenceColor(row.projection_confidence ?? null)}`}>
                {row.projection_confidence != null ? `${fmtInt(row.projection_confidence)}%` : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-2.5">
              <p className="text-[9px] text-white/35 uppercase tracking-wider mb-0.5">Risk</p>
              <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold border ${riskBadge.text} ${riskBadge.bg} ${riskBadge.border}`}>
                {riskBadge.label}
              </span>
            </div>
            {isUnlocked ? (
              <div className="rounded-lg bg-white/5 px-3 py-2.5">
                <p className="text-[9px] text-white/35 uppercase tracking-wider mb-0.5">Price</p>
                <p className="text-sm font-semibold text-white/70">{fmtPrice(row.price)}</p>
                {fmtPriceChange(row.price_change) && (
                  <p className={`text-[9px] font-semibold tabular-nums mt-0.5 ${(row.price_change ?? 0) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtPriceChange(row.price_change)}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-lg bg-white/5 px-3 py-2.5 flex items-center justify-center cursor-pointer" onClick={onUpgrade}>
                <Lock size={11} className="text-[#F5C84C]/50" />
              </div>
            )}
          </div>

          {isUnlocked && row.value_score != null && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="rounded-lg bg-white/5 px-3 py-2.5">
                <p className="text-[9px] text-white/35 uppercase tracking-wider mb-0.5">Value Score</p>
                <p className={`text-sm font-bold tabular-nums ${getValueScoreColor(row.value_score)}`}>
                  {fmtValueScore(row.value_score)}
                </p>
              </div>
              {row.value_tag && (
                <div className={`rounded-lg border px-3 py-2.5 ${vtStyle.bg} ${vtStyle.border}`}>
                  <p className="text-[9px] text-white/35 uppercase tracking-wider mb-0.5">Value Tag</p>
                  <p className={`text-xs font-bold ${vtStyle.text}`}>{row.value_tag}</p>
                </div>
              )}
            </div>
          )}

          {isUnlocked && displayRec && (() => {
            const rc = resolveRecommendationColor(row.recommendation_color, displayRec);
            return (
              <div
                className="rounded-lg border px-3 py-2.5 mb-3"
                style={{ background: `${rc}18`, borderColor: `${rc}40` }}
              >
                <p className="text-[9px] text-white/35 uppercase tracking-wider mb-0.5">AI Rec</p>
                <p className="text-xs font-bold" style={{ color: rc }}>{formatActionLabel(displayRec)}</p>
                {row.why && (
                  <p className="text-[11px] text-white/50 mt-1 leading-snug line-clamp-3">
                    {row.why}
                  </p>
                )}
              </div>
            );
          })()}

          {!isUnlocked && (
            <div className="rounded-lg border border-[#F5C84C]/20 bg-[#F5C84C]/[0.04] px-3 py-2.5 mb-3">
              <div className="flex items-center gap-2">
                <Lock size={11} className="text-[#F5C84C]/60 shrink-0" />
                <p className="text-xs text-white/50">Price, Value, AI Rec locked</p>
                <button onClick={onUpgrade} className="ml-auto shrink-0 text-[10px] font-semibold text-[#F5C84C] hover:text-[#F5C84C]/80">
                  Upgrade
                </button>
              </div>
            </div>
          )}

          <button
            onClick={onOpenDetail}
            className="w-full rounded-lg bg-white/5 border border-white/8 py-2.5 text-xs font-semibold text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors flex items-center justify-center gap-1.5"
          >
            Full breakdown
            <ChevronDown size={12} className="rotate-[-90deg]" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Locked row skeleton (blurred) ────────────────────────────────────────────

export function LockedMobileRow({ idx, onUpgrade }: { idx: number; onUpgrade: () => void }) {
  return (
    <div
      className="border-b border-white/[0.03] px-4 py-3 cursor-pointer"
      style={{ touchAction: "manipulation" }}
      onClick={onUpgrade}
    >
      <div className="flex items-center gap-3 opacity-30 blur-sm select-none">
        <span className="text-xs text-white/30 w-6 tabular-nums">{idx + 1}</span>
        <div className="flex-1">
          <div className="h-3 w-28 bg-white/10 rounded mb-1" />
          <div className="h-2 w-16 bg-white/8 rounded" />
        </div>
        <div className="h-4 w-10 bg-white/10 rounded" />
      </div>
    </div>
  );
}

// ─── Conversion wall ──────────────────────────────────────────────────────────

export function MobileConversionWall({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="px-4 py-8">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-[#F5C84C]/20 bg-gradient-to-b from-[#F5C84C]/[0.06] to-[#0a0a0a] px-5 py-8 text-center">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#F5C84C]/15 border border-[#F5C84C]/30">
          <Crown size={18} className="text-[#F5C84C]" />
        </div>
        <p className="text-base font-bold text-white">The edge is locked.</p>
        <p className="text-sm text-white/45 max-w-xs leading-relaxed">
          Breakout value plays, captain calls and trap alerts available with Neeko+.
        </p>
        <button
          onClick={onUpgrade}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[#F5C84C] hover:brightness-110 px-6 py-2.5 text-sm font-bold text-[#070707] transition-all"
        >
          <Crown size={13} />
          Upgrade to Neeko+
        </button>
      </div>
    </div>
  );
}
