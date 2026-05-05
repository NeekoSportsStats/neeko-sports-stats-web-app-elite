import { Lock, ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import type { StatBoardPlayer, StatLens } from "../types";
import { useStatBoardPlayerHistory } from "../useStatBoard";
import { ExpandedPlayerPanel } from "./ExpandedPlayerPanel";

interface Props {
  player: StatBoardPlayer;
  lens: StatLens;
  threshold: number;
  isLocked: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function PlayerCard({
  player,
  lens,
  threshold,
  isLocked,
  isExpanded,
  onToggleExpand,
}: Props) {
  const { history, loading: histLoading, error: histError } = useStatBoardPlayerHistory(
    isExpanded ? player.player_id : null
  );

  const thresholdKey = String(threshold);
  const hitData = player.all_threshold_hit_rates?.[thresholdKey];

  // hit_rate_last_10 is 0–1, multiply by 100 for display
  const hitRatePct =
    hitData != null
      ? hitData.rate // already 0–100 from backend
      : player.hit_rate_last_10 != null
      ? Math.round(player.hit_rate_last_10 * 100)
      : null;

  const hitFraction =
    hitData != null
      ? `${hitData.hits}/${hitData.games}`
      : player.hit_count_last_10 != null
      ? `${player.hit_count_last_10}/${Math.min(player.games_played ?? 0, 10)}`
      : null;

  const projLabel = lens === "disposals" ? "Projected disposals" : "Projected goals";
  const hitLabel  = lens === "disposals" ? `${threshold}+ disposals` : `${threshold}+ goals`;

  const confidence = player.confidence_label;
  const confStyles: Record<string, { dot: string; text: string }> = {
    HIGH:   { dot: "bg-emerald-400",  text: "text-emerald-400" },
    MEDIUM: { dot: "bg-amber-400",    text: "text-amber-400" },
    LOW:    { dot: "bg-white/30",     text: "text-white/40" },
  };
  const conf = confidence ? confStyles[confidence] ?? confStyles.LOW : null;

  return (
    <div
      className={`rounded-2xl border transition-all duration-200 ${
        isLocked
          ? "border-[#F5C84C]/15 bg-[#F5C84C]/[0.03]"
          : isExpanded
          ? "border-white/20 bg-white/[0.04]"
          : "border-white/8 bg-white/[0.03] hover:border-white/14 hover:bg-white/[0.05]"
      }`}
    >
      {/* ── Collapsed body ── */}
      <button
        className="w-full text-left px-4 pt-4 pb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 rounded-2xl"
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
        aria-label={`${player.player_name} — ${isExpanded ? "collapse" : "expand"} trend`}
      >
        {/* Row 1: name + position + locked badge */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[15px] font-semibold text-white leading-tight">
                {player.player_name}
              </span>
              {player.position_group && (
                <span className="text-[10px] font-semibold text-white/45 bg-white/8 rounded-md px-1.5 py-0.5 tracking-wide">
                  {player.position_group}
                </span>
              )}
            </div>
            <p className="text-xs text-white/35 mt-0.5">
              {player.team_name}
              <span className="mx-1 text-white/20">vs</span>
              {player.opponent_team_name}
              {player.is_home === false && (
                <span className="ml-1 text-white/25">(A)</span>
              )}
            </p>
          </div>

          {/* Expand icon */}
          <div className="shrink-0 mt-0.5">
            {isLocked ? (
              <Lock className="h-4 w-4 text-[#F5C84C]/50" aria-hidden />
            ) : isExpanded ? (
              <ChevronUp className="h-4 w-4 text-white/40" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4 text-white/30" aria-hidden />
            )}
          </div>
        </div>

        {/* Row 2: sparkline pills */}
        <ValuePills
          values={player.last_10_values ?? []}
          threshold={threshold}
          isLocked={isLocked}
        />

        {/* Row 3: primary stats */}
        <div className="mt-3 flex items-end gap-5 flex-wrap">
          {/* Projection — primary focus */}
          <PrimaryStatBlock
            label={projLabel}
            isLocked={isLocked}
          >
            {player.projection != null ? (
              <span className="text-[22px] font-bold text-white leading-none tabular-nums">
                {player.projection}
              </span>
            ) : (
              <span className="text-[22px] font-bold text-white/20 leading-none">—</span>
            )}
          </PrimaryStatBlock>

          {/* Hit rate — primary focus */}
          <PrimaryStatBlock
            label={hitLabel}
            isLocked={isLocked}
          >
            <div className="flex items-baseline gap-1.5">
              <span className="text-[22px] font-bold text-white leading-none tabular-nums">
                {hitFraction ?? "—"}
              </span>
              {hitRatePct != null && (
                <span className="text-xs font-medium text-white/45 mb-0.5">
                  {hitRatePct}%
                </span>
              )}
            </div>
          </PrimaryStatBlock>

          {/* Consistency */}
          {!isLocked && conf && confidence && (
            <div className="mb-0.5">
              <p className="text-[10px] text-white/35 mb-1">Consistency</p>
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${conf.dot}`} aria-hidden />
                <span className={`text-[12px] font-semibold ${conf.text}`}>{confidence}</span>
              </div>
            </div>
          )}
        </div>

        {/* Row 4: trend CTA */}
        <div className={`mt-3 flex items-center gap-1.5 text-xs font-medium ${
          isLocked
            ? "text-[#F5C84C]/50"
            : "text-white/35 hover:text-white/55"
        } transition-colors`}>
          <TrendingUp className="h-3 w-3" aria-hidden />
          {isLocked ? "Unlock full round" : isExpanded ? "Hide trend" : "View trend"}
        </div>
      </button>

      {/* ── Expanded panel ── */}
      {isExpanded && (
        <ExpandedPlayerPanel
          player={player}
          history={history}
          loading={histLoading}
          error={histError}
          lens={lens}
          isLocked={isLocked}
        />
      )}
    </div>
  );
}

// ── Value pills (last 10) ─────────────────────────────────────────────────────

function ValuePills({
  values,
  threshold,
  isLocked,
}: {
  values: number[];
  threshold: number;
  isLocked: boolean;
}) {
  // values from RPC: index 0 = oldest stored, but display newest-rightmost
  // last_10_values is ordered rn ASC in the RPC (most recent = last element)
  const display = values.slice(-10);

  if (display.length === 0) {
    return (
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="h-6 w-6 rounded-md bg-white/5 text-[11px] flex items-center justify-center text-white/15">
            —
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-wrap" role="list" aria-label="Last 10 game values">
      {display.map((v, i) => {
        const isNewest = i === display.length - 1;
        const hit = v >= threshold;

        if (isLocked) {
          return (
            <span
              key={i}
              className="h-6 min-w-[22px] px-1 rounded-md bg-white/6 text-[11px] font-medium text-white/20 flex items-center justify-center"
              role="listitem"
            >
              {v}
            </span>
          );
        }

        return (
          <span
            key={i}
            role="listitem"
            aria-label={`Round ${i + 1}: ${v}`}
            className={`h-6 min-w-[22px] px-1 rounded-md text-[11px] font-semibold flex items-center justify-center transition-colors ${
              isNewest
                ? hit
                  ? "bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-400/50"
                  : "bg-white/12 text-white/70 ring-1 ring-white/25"
                : hit
                ? "bg-emerald-500/15 text-emerald-400/80"
                : "bg-white/5 text-white/35"
            }`}
          >
            {v}
          </span>
        );
      })}
    </div>
  );
}

// ── Primary stat block ────────────────────────────────────────────────────────

function PrimaryStatBlock({
  label,
  isLocked,
  children,
}: {
  label: string;
  isLocked: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] text-white/35 mb-1 uppercase tracking-wide">{label}</p>
      {isLocked ? <LockedBlur /> : children}
    </div>
  );
}

function LockedBlur() {
  return (
    <span
      className="inline-block text-[22px] font-bold leading-none text-white/20 blur-[5px] select-none"
      aria-hidden
    >
      ••••
    </span>
  );
}