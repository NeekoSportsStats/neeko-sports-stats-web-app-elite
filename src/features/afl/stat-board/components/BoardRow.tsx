import { Fragment, memo } from "react";
import { ChevronDown, ChevronUp, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { StatBoardPlayer, StatLens, TimelineSlot } from "../types";
import { useStatBoardPlayerHistory } from "../useStatBoard";
import { usePlayerIntelligence } from "@/hooks/usePlayerIntelligence";
import { useAccessState } from "@/hooks/useAccessState";
import { ExpandedPlayerPanel } from "./ExpandedPlayerPanel";

interface Props {
  player: StatBoardPlayer;
  lens: StatLens;
  thresholds: readonly number[];
  defaultThreshold: number;
  isMatchLocked: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

// Lazy fetch wrapper — only mounts hooks when expanded, preventing all-row
// history/AI requests that were the primary source of mobile sluggishness.
function LazyExpandedContent({
  player,
  lens,
  defaultThreshold,
  isMatchLocked,
}: {
  player: StatBoardPlayer;
  lens: StatLens;
  defaultThreshold: number;
  isMatchLocked: boolean;
}) {
  const isPlayerLocked = isMatchLocked && !player.is_free_match;
  const activePlayerId = isPlayerLocked ? null : player.player_id;
  const { history, loading: histLoading, error: histError } = useStatBoardPlayerHistory(activePlayerId);
  const { intelligence, loading: intelligenceLoading } = usePlayerIntelligence(activePlayerId);
  const { isPremium } = useAccessState();

  if (isPlayerLocked) return <LockedExpandPanel playerName={player.player_name} />;

  return (
    <ExpandedPlayerPanel
      player={player}
      history={history}
      loading={histLoading}
      error={histError}
      lens={lens}
      threshold={defaultThreshold}
      isLocked={isPlayerLocked}
      intelligence={intelligence}
      intelligenceLoading={intelligenceLoading}
      isPremium={isPremium}
    />
  );
}

export const BoardRow = memo(function BoardRow({
  player,
  lens,
  thresholds,
  defaultThreshold,
  isMatchLocked,
  isExpanded,
  onToggleExpand,
}: Props) {

  const confidence = player.confidence_label;
  const confStyles: Record<string, { dot: string; text: string; label: string }> = {
    HIGH:   { dot: "bg-emerald-400", text: "text-emerald-400", label: "High" },
    MEDIUM: { dot: "bg-amber-400",   text: "text-amber-400",   label: "Medium" },
    LOW:    { dot: "bg-white/25",    text: "text-white/40",    label: "Low" },
  };
  const conf = confidence ? confStyles[confidence] ?? confStyles.LOW : null;

  const isPlayerLocked = isMatchLocked && !player.is_free_match;

  // Prefer the structured timeline (includes BYE/DNP slots); fall back to plain values
  const timeline: TimelineSlot[] | null = player.last_10_timeline ?? null;
  // last_10_values is newest-first from the RPC; reverse so index 0 = oldest, last = newest
  const last10 = [...(player.last_10_values ?? [])].reverse().slice(-10);

  const last10Avg = safeNum(player.last_10_avg);
  const avgDisplay = last10Avg != null ? last10Avg.toFixed(1) : "—";

  const projDisplay = safeNum(player.projection);
  const thresholdLength = thresholds.length;

  const expandedContent = isExpanded ? (
    <div className="overflow-hidden border-l-[3px] border-emerald-500/30" style={{ contain: "layout" }}>
      <LazyExpandedContent
        player={player}
        lens={lens}
        defaultThreshold={defaultThreshold}
        isMatchLocked={isMatchLocked}
      />
    </div>
  ) : null;

  return (
    <Fragment>
      {/* ── Main data row ── */}
      <tr
        onClick={onToggleExpand}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`${player.player_name} — ${isExpanded ? "collapse" : "expand"} detail`}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleExpand(); } }}
        className={`
          group cursor-pointer select-none transition-colors duration-100
          focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60
          border-b border-white/[0.06] last:border-b-0
          ${isExpanded
            ? "bg-white/[0.065] border-b-transparent"
            : "hover:bg-white/[0.055] active:bg-white/[0.085]"}
        `}
      >
        {/* Left accent stripe — visible only when expanded */}
        <td className="relative pl-0 pr-2 py-3 min-w-[150px] max-w-[210px]">
          {isExpanded && (
            <span
              className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-emerald-500/50"
              aria-hidden
            />
          )}
          <div className="flex items-center gap-1.5 pl-4">
            <span className={`text-[13px] font-semibold truncate leading-tight transition-colors ${
              isExpanded ? "text-white" : "text-white/90"
            }`}>
              {player.player_name}
            </span>
            {player.position_group && (
              <span className="shrink-0 text-[9px] font-bold text-white/35 bg-white/8 rounded px-1 py-0.5 tracking-wide">
                {player.position_group}
              </span>
            )}
          </div>
          <p className="text-[10px] text-white/35 truncate mt-0.5 pl-4">
            {player.team_name || "—"}
            {player.is_home === true && <span className="ml-1 text-white/18">· H</span>}
            {player.is_home === false && <span className="ml-1 text-white/18">· A</span>}
          </p>
        </td>

        {/* Mini chips */}
        <td className="px-2 py-3 min-w-[120px]">
          <div className="flex items-center justify-center gap-[3px]" role="list" aria-label="Recent results">
            {timeline != null ? (
              <TimelineChips slots={timeline} defaultThreshold={defaultThreshold} isLocked={isPlayerLocked} />
            ) : (
              <MiniChips values={last10} defaultThreshold={defaultThreshold} isLocked={isPlayerLocked} />
            )}
          </div>
        </td>

        {/* Recent Avg */}
        <td className="px-2 py-3 text-right tabular-nums min-w-[56px]">
          <span className={`text-[12px] font-medium ${last10Avg != null ? "text-white/55" : "text-white/20"}`}>
            {avgDisplay}
          </span>
        </td>

        {/* Projection */}
        <td className="px-2 py-3 text-right tabular-nums min-w-[52px]">
          {isPlayerLocked ? (
            <span className="text-[13px] font-semibold text-white/20 blur-[4px] select-none" aria-hidden>••</span>
          ) : projDisplay != null ? (
            <span className="text-[15px] font-bold text-[#F5C84C] tabular-nums leading-none">{projDisplay}</span>
          ) : (
            <span className="text-[13px] text-white/22">—</span>
          )}
        </td>

        {/* Hit-rate columns — one per threshold */}
        {thresholds.map((t) => (
          <td key={t} className="px-2 py-2.5 text-center tabular-nums min-w-[60px]">
            {hitRateCell(player, t, isPlayerLocked)}
          </td>
        ))}

        {/* Consistency */}
        <td className="px-2 py-3 text-center min-w-[84px]">
          {!isPlayerLocked && conf && confidence ? (
            <div className="inline-flex items-center gap-1.5">
              <span className={`h-[7px] w-[7px] rounded-full shrink-0 ${conf.dot}`} aria-hidden />
              <span className={`text-[11px] font-semibold leading-none ${conf.text}`}>{conf.label}</span>
            </div>
          ) : (
            <span className="text-white/15 text-[10px]">—</span>
          )}
        </td>

        {/* Expand chevron */}
        <td className="pr-2 pl-1 py-2 text-center w-10">
          <span className={`
            inline-flex items-center justify-center h-7 w-7 rounded-lg transition-all duration-100
            ${isExpanded
              ? "bg-white/12 text-white/80"
              : "text-white/30 group-hover:bg-white/8 group-hover:text-white/65 group-active:bg-white/12"}
          `}>
            {isPlayerLocked ? (
              <Lock className="h-3.5 w-3.5 text-[#F5C84C]/40" aria-hidden />
            ) : isExpanded ? (
              <ChevronUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden />
            )}
          </span>
        </td>
      </tr>

      {/* ── Expanded detail row — lazy mounted only when isExpanded ── */}
      {isExpanded && (
        <tr className="border-b border-white/[0.06]">
          <td colSpan={4 + thresholdLength + 2} className="p-0 align-top bg-white/[0.022]">
            {expandedContent}
          </td>
        </tr>
      )}
    </Fragment>
  );
});

// ── Mobile player card — used at mobile breakpoints instead of the table row ──

interface MobileCardProps {
  player: StatBoardPlayer;
  lens: StatLens;
  thresholds: readonly number[];
  defaultThreshold: number;
  isMatchLocked: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  matchId: number | null;
}

export const MobilePlayerCard = memo(function MobilePlayerCard({
  player,
  lens,
  thresholds,
  defaultThreshold,
  isMatchLocked,
  isExpanded,
  onToggleExpand,
}: MobileCardProps) {
  const confidence = player.confidence_label;
  const confStyles: Record<string, { dot: string; text: string; label: string }> = {
    HIGH:   { dot: "bg-emerald-400", text: "text-emerald-400", label: "High" },
    MEDIUM: { dot: "bg-amber-400",   text: "text-amber-400",   label: "Medium" },
    LOW:    { dot: "bg-white/25",    text: "text-white/40",    label: "Low" },
  };
  const conf = confidence ? confStyles[confidence] ?? confStyles.LOW : null;

  const isPlayerLocked = isMatchLocked && !player.is_free_match;

  const timeline: TimelineSlot[] | null = player.last_10_timeline ?? null;
  const last10 = [...(player.last_10_values ?? [])].reverse().slice(-10);

  const last10Avg = safeNum(player.last_10_avg);
  const avgDisplay = last10Avg != null ? last10Avg.toFixed(1) : "—";
  const projDisplay = safeNum(player.projection);

  return (
    <div
      className={`mobile-player-card rounded-2xl border w-full min-w-0 ${
        isExpanded
          ? "border-emerald-500/25 bg-[#111]"
          : "border-white/10 bg-[#0d0d0d]"
      }`}
      style={{ maxWidth: "100%", boxSizing: "border-box", overflowX: "hidden" }}
    >
      {/* ── Card tap target ── */}
      <button
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
        aria-label={`${player.player_name} — ${isExpanded ? "collapse" : "expand"} detail`}
        className="w-full text-left px-3 pt-3 pb-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60"
      >
        {/* ── Row 1: name + position + home/away badge + projection + chevron ── */}
        <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`text-[13px] font-bold leading-tight truncate ${isExpanded ? "text-white" : "text-white/90"}`}>
                {player.player_name}
              </span>
              {player.position_group && (
                <span className="text-[8px] font-bold text-white/30 bg-white/7 rounded px-1 py-0.5 tracking-wide shrink-0">
                  {player.position_group}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5 min-w-0">
              <span className="text-[10px] text-white/35 truncate">{player.team_name || "—"}</span>
              {player.is_home === true && (
                <span className="text-[8px] text-emerald-500/60 font-semibold bg-emerald-500/7 rounded px-1 py-0.5 leading-none shrink-0">H</span>
              )}
              {player.is_home === false && (
                <span className="text-[8px] text-white/28 bg-white/5 rounded px-1 py-0.5 leading-none shrink-0">A</span>
              )}
            </div>
          </div>

          {/* Projection + expand */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="text-right">
              <p className="text-[7px] text-white/25 uppercase tracking-wider leading-none mb-0.5">Proj</p>
              {isPlayerLocked ? (
                <span className="text-[14px] font-bold text-white/20 select-none" aria-hidden>••</span>
              ) : projDisplay != null ? (
                <span className="text-[17px] font-bold text-[#F5C84C] tabular-nums leading-none">{projDisplay}</span>
              ) : (
                <span className="text-[12px] text-white/22">—</span>
              )}
            </div>
            <span className={`
              inline-flex items-center justify-center h-6 w-6 rounded-lg shrink-0
              ${isExpanded ? "bg-white/10 text-white/75" : "text-white/28"}
            `}>
              {isPlayerLocked ? (
                <Lock className="h-3 w-3 text-[#F5C84C]/40" aria-hidden />
              ) : isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              )}
            </span>
          </div>
        </div>

        {/* ── Row 2: recent chips — wrap safely, smaller on tiny screens ── */}
        <div className="flex items-center gap-[3px] mb-2 flex-wrap" role="list" aria-label="Recent results">
          {timeline != null ? (
            <TimelineChips slots={timeline} defaultThreshold={defaultThreshold} isLocked={isPlayerLocked} />
          ) : (
            <MiniChips values={last10} defaultThreshold={defaultThreshold} isLocked={isPlayerLocked} />
          )}
        </div>

        {/* ── Row 3: compact stats strip ── */}
        <div className="flex items-stretch gap-0 border border-white/8 rounded-lg overflow-hidden w-full">
          {/* Recent avg */}
          <div className="flex-1 px-1.5 py-1.5 border-r border-white/8 min-w-0">
            <p className="text-[7px] text-white/25 uppercase tracking-wide leading-none mb-0.5">Avg</p>
            <p className={`text-[11px] font-semibold tabular-nums leading-none ${last10Avg != null ? "text-white/68" : "text-white/22"}`}>
              {avgDisplay}
            </p>
          </div>

          {/* Hit rates — all thresholds */}
          {thresholds.map((t, idx) => {
            const isLast = idx === thresholds.length - 1;
            const data = player.all_threshold_hit_rates?.[String(t)];
            const rate = safeNum(data?.rate);
            const hits = safeNum(data?.hits);
            const games = safeNum(data?.games);
            const hasData = hits !== null && games !== null && games > 0;
            const rateColor = rate != null && rate >= 70
              ? "text-emerald-400"
              : rate != null && rate >= 50
              ? "text-amber-400"
              : "text-white/32";

            return (
              <div key={t} className={`flex-1 px-1 py-1.5 text-center min-w-0 ${isLast ? "" : "border-r border-white/8"}`}>
                {isPlayerLocked ? (
                  <>
                    <p className="text-[7px] text-white/25 uppercase tracking-wide leading-none mb-0.5">{t}+</p>
                    <p className="text-[9px] text-white/18 select-none tabular-nums leading-none">—</p>
                  </>
                ) : (
                  <>
                    <p className="text-[7px] text-white/25 uppercase tracking-wide leading-none mb-0.5">{t}+</p>
                    {hasData && rate != null ? (
                      <p className={`text-[10px] font-bold tabular-nums leading-none ${rateColor}`}>
                        {rate > 0 ? `${rate}%` : "0%"}
                      </p>
                    ) : (
                      <p className="text-[9px] text-white/20 leading-none">—</p>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* Consistency */}
          <div className="flex-1 px-1.5 py-1.5 border-l border-white/8 min-w-0">
            <p className="text-[7px] text-white/25 uppercase tracking-wide leading-none mb-0.5">Form</p>
            {!isPlayerLocked && conf && confidence ? (
              <div className="flex items-center gap-1">
                <span className={`h-[5px] w-[5px] rounded-full shrink-0 ${conf.dot}`} aria-hidden />
                <span className={`text-[9px] font-semibold leading-none ${conf.text}`}>{conf.label}</span>
              </div>
            ) : (
              <p className="text-[9px] text-white/20 leading-none">—</p>
            )}
          </div>
        </div>
      </button>

      {/* ── Expanded detail — no animation, no transforms on mobile ── */}
      {isExpanded && !isPlayerLocked && (
        <div
          className="mobile-expanded-panel border-t border-white/[0.08] bg-[#0c0c0c]"
          style={{
            overscrollBehavior: "contain",
            width: "100%",
            minWidth: 0,
            maxWidth: "100%",
            boxSizing: "border-box",
            overflowX: "hidden",
            borderLeft: "3px solid rgba(34,197,94,0.30)",
          }}
        >
          <LazyExpandedContent
            player={player}
            lens={lens}
            defaultThreshold={defaultThreshold}
            isMatchLocked={isMatchLocked}
          />
        </div>
      )}

      {/* ── Locked compact upgrade panel — no LazyExpandedContent hooks ── */}
      {isExpanded && isPlayerLocked && (
        <LockedExpandPanel playerName={player.player_name} />
      )}
    </div>
  );
});

// ── Safe number coercion ──────────────────────────────────────────────────────

function safeNum(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ── Hit-rate cell renderer ────────────────────────────────────────────────────

function hitRateCell(
  player: StatBoardPlayer,
  threshold: number,
  isPlayerLocked: boolean
): React.ReactNode {
  if (isPlayerLocked) {
    return <span className="text-[11px] text-white/20 blur-[4px] select-none" aria-hidden>—</span>;
  }

  const data = player.all_threshold_hit_rates?.[String(threshold)];

  const hits  = safeNum(data?.hits);
  const games = safeNum(data?.games);
  const rate  = safeNum(data?.rate);

  if (hits === null || games === null || games === 0) {
    return <span className="text-[11px] text-white/22">—</span>;
  }

  const rateColor =
    rate != null && rate >= 70 ? "text-emerald-400"
    : rate != null && rate >= 50 ? "text-amber-400"
    : "text-white/35";

  return (
    <div className="flex flex-col items-center leading-tight gap-[1px]">
      <span className="text-[11px] font-semibold text-white/80 tabular-nums">
        {hits}/{games}
      </span>
      {rate != null && rate > 0 ? (
        <span className={`text-[10px] font-semibold tabular-nums ${rateColor}`}>
          {rate}%
        </span>
      ) : (
        <span className="text-[10px] text-white/22">0%</span>
      )}
    </div>
  );
}

// ── Mini chips (plain values, no BYE/DNP) ─────────────────────────────────────

function MiniChips({
  values,
  defaultThreshold,
  isLocked,
}: {
  values: number[];
  defaultThreshold: number;
  isLocked: boolean;
}) {
  if (values.length === 0) {
    return (
      <>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="h-[18px] w-[18px] rounded bg-white/5 flex items-center justify-center text-[8px] text-white/18">
            —
          </span>
        ))}
      </>
    );
  }

  return (
    <>
      {values.map((v, i) => {
        const isNewest = i === values.length - 1;
        const safeV = safeNum(v);
        const hit = safeV != null && safeV >= defaultThreshold;

        if (isLocked) {
          return (
            <span
              key={i}
              role="listitem"
              className="h-[18px] min-w-[16px] px-0.5 rounded bg-white/5 text-[8px] font-medium text-white/18 flex items-center justify-center tabular-nums"
            >
              {safeV ?? "—"}
            </span>
          );
        }

        return (
          <span
            key={i}
            role="listitem"
            aria-label={safeV != null ? String(safeV) : "no data"}
            className={`h-[18px] min-w-[16px] px-0.5 rounded text-[8px] font-bold flex items-center justify-center tabular-nums ${
              isNewest
                ? hit
                  ? "bg-emerald-500/28 text-emerald-300 ring-1 ring-emerald-400/35"
                  : "bg-white/10 text-white/65 ring-1 ring-white/18"
                : hit
                ? "bg-emerald-500/14 text-emerald-400/75"
                : "bg-white/5 text-white/30"
            }`}
          >
            {safeV ?? "—"}
          </span>
        );
      })}
    </>
  );
}

// ── Timeline chips (BYE/DNP-aware) ───────────────────────────────────────────

function TimelineChips({
  slots,
  defaultThreshold,
  isLocked,
}: {
  slots: TimelineSlot[];
  defaultThreshold: number;
  isLocked: boolean;
}) {
  if (slots.length === 0) {
    return (
      <>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="h-[18px] w-[18px] rounded bg-white/5 flex items-center justify-center text-[8px] text-white/18">
            —
          </span>
        ))}
      </>
    );
  }

  return (
    <>
      {slots.map((slot, i) => {
        const isNewest = i === slots.length - 1;

        if (slot.type === "bye") {
          return (
            <span
              key={i}
              role="listitem"
              aria-label={`Week ${slot.week}: BYE`}
              title="BYE week"
              className="h-[18px] min-w-[20px] px-0.5 rounded bg-white/4 text-[6.5px] font-bold text-white/22 flex items-center justify-center tracking-wide border border-white/7"
            >
              BYE
            </span>
          );
        }

        if (slot.type === "upcoming") {
          return (
            <span
              key={i}
              role="listitem"
              aria-label={`Week ${slot.week}: Upcoming`}
              title="Upcoming fixture"
              className="h-[18px] min-w-[20px] px-0.5 rounded bg-white/3 text-[6.5px] font-bold text-white/30 flex items-center justify-center tracking-wide border border-dotted border-white/15"
            >
              —
            </span>
          );
        }

        if (slot.type === "dnp") {
          return (
            <span
              key={i}
              role="listitem"
              aria-label={`Week ${slot.week}: DNP`}
              title="Did not play"
              className="h-[18px] min-w-[20px] px-0.5 rounded bg-white/3 text-[6.5px] font-bold text-white/18 flex items-center justify-center tracking-wide border border-dashed border-white/10"
            >
              DNP
            </span>
          );
        }

        const safeV = safeNum(slot.value);
        const hit = safeV != null && safeV >= defaultThreshold;

        if (isLocked) {
          return (
            <span
              key={i}
              role="listitem"
              className="h-[18px] min-w-[16px] px-0.5 rounded bg-white/5 text-[8px] font-medium text-white/18 flex items-center justify-center tabular-nums"
            >
              {safeV ?? "—"}
            </span>
          );
        }

        return (
          <span
            key={i}
            role="listitem"
            aria-label={safeV != null ? String(safeV) : "no data"}
            className={`h-[18px] min-w-[16px] px-0.5 rounded text-[8px] font-bold flex items-center justify-center tabular-nums ${
              isNewest
                ? hit
                  ? "bg-emerald-500/28 text-emerald-300 ring-1 ring-emerald-400/35"
                  : "bg-white/10 text-white/65 ring-1 ring-white/18"
                : hit
                ? "bg-emerald-500/14 text-emerald-400/75"
                : "bg-white/5 text-white/30"
            }`}
          >
            {safeV ?? "—"}
          </span>
        );
      })}
    </>
  );
}

// ── Locked expand ─────────────────────────────────────────────────────────────

function LockedExpandPanel({ playerName }: { playerName: string }) {
  const navigate = useNavigate();
  return (
    <div className="border-t border-[#F5C84C]/10 px-4 py-6 text-center" role="region" aria-label="Premium content locked">
      <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-[#F5C84C]/8 mb-3">
        <Lock className="h-4 w-4 text-[#F5C84C]/50" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-[#F5C84C]/70">Neeko+ match</p>
      <p className="mt-1 text-xs text-white/35 max-w-[240px] mx-auto leading-relaxed">
        Free users can explore the first matches. Neeko+ unlocks every match, projection, hit rate and trend
        {playerName ? ` for ${playerName}` : ""}.
      </p>
      <button
        onClick={() => navigate("/neeko-plus")}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#F5C84C]/12 border border-[#F5C84C]/25 px-4 py-2 text-[12px] font-semibold text-[#F5C84C] hover:bg-[#F5C84C]/20 transition-colors"
      >
        <Lock className="h-3 w-3" aria-hidden />
        Unlock Neeko+
      </button>
    </div>
  );
}
