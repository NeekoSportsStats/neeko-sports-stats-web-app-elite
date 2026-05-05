import { Fragment, memo } from "react";
import { ChevronDown, ChevronUp, Lock } from "lucide-react";
import type { StatBoardPlayer, StatLens, TimelineSlot } from "../types";
import { useStatBoardPlayerHistory, useStatBoardPlayerAiInsight } from "../useStatBoard";
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
  const { insight, loading: insightLoading } = useStatBoardPlayerAiInsight(activePlayerId);

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
      insight={insight}
      insightLoading={insightLoading}
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
            : "hover:bg-white/[0.06] active:bg-white/[0.075]"}
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
            <div className="flex items-center justify-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${conf.dot}`} aria-hidden />
              <span className={`text-[11px] font-semibold ${conf.text}`}>{conf.label}</span>
            </div>
          ) : (
            <span className="text-white/15 text-[10px]">—</span>
          )}
        </td>

        {/* Expand chevron — larger touch target, brightens on hover */}
        <td className="pr-3 pl-1 py-2 text-center w-10">
          <span className={`
            inline-flex items-center justify-center h-7 w-7 rounded-lg transition-colors
            ${isExpanded
              ? "bg-white/10 text-white/70"
              : "text-white/28 group-hover:bg-white/6 group-hover:text-white/55"}
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
            <div
              className="overflow-hidden border-l-[3px] border-emerald-500/30"
              style={{ animation: "expandDown 180ms cubic-bezier(0.2,0,0,1) forwards" }}
            >
              <style>{`
                @keyframes expandDown {
                  from { opacity: 0; transform: translateY(-6px); }
                  to   { opacity: 1; transform: translateY(0); }
                }
              `}</style>
              {/* LazyExpandedContent only mounts history/AI hooks when rendered */}
              <LazyExpandedContent
                player={player}
                lens={lens}
                defaultThreshold={defaultThreshold}
                isMatchLocked={isMatchLocked}
              />
            </div>
          </td>
        </tr>
      )}
    </Fragment>
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

  // Not enough data — show em-dash
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
          <span key={i} className="h-5 w-5 rounded bg-white/5 flex items-center justify-center text-[9px] text-white/18">
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
              className="h-5 min-w-[18px] px-0.5 rounded bg-white/5 text-[9px] font-medium text-white/18 flex items-center justify-center tabular-nums"
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
            className={`h-5 min-w-[18px] px-0.5 rounded text-[9px] font-bold flex items-center justify-center tabular-nums transition-colors ${
              isNewest
                ? hit
                  ? "bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-400/40"
                  : "bg-white/12 text-white/70 ring-1 ring-white/22"
                : hit
                ? "bg-emerald-500/15 text-emerald-400/80"
                : "bg-white/5 text-white/32"
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
          <span key={i} className="h-5 w-5 rounded bg-white/5 flex items-center justify-center text-[9px] text-white/18">
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
              className="h-5 min-w-[22px] px-0.5 rounded bg-white/4 text-[7px] font-bold text-white/25 flex items-center justify-center tracking-wide border border-white/8"
            >
              BYE
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
              className="h-5 min-w-[22px] px-0.5 rounded bg-white/4 text-[7px] font-bold text-white/22 flex items-center justify-center tracking-wide border border-dashed border-white/12"
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
              className="h-5 min-w-[18px] px-0.5 rounded bg-white/5 text-[9px] font-medium text-white/18 flex items-center justify-center tabular-nums"
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
            className={`h-5 min-w-[18px] px-0.5 rounded text-[9px] font-bold flex items-center justify-center tabular-nums transition-colors ${
              isNewest
                ? hit
                  ? "bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-400/40"
                  : "bg-white/12 text-white/70 ring-1 ring-white/22"
                : hit
                ? "bg-emerald-500/15 text-emerald-400/80"
                : "bg-white/5 text-white/32"
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
  return (
    <div className="border-t border-[#F5C84C]/10 px-4 py-6 text-center" role="region" aria-label="Premium content locked">
      <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-[#F5C84C]/8 mb-3">
        <Lock className="h-4 w-4 text-[#F5C84C]/50" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-[#F5C84C]/70">Unlock full round</p>
      <p className="mt-1 text-xs text-white/30 max-w-[220px] mx-auto leading-relaxed">
        Upgrade to Neeko+ to see {playerName}'s full trend, projections and hit rates.
      </p>
    </div>
  );
}
