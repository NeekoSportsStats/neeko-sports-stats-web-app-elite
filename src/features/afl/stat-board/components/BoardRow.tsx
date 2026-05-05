import { ChevronDown, ChevronUp, Lock } from "lucide-react";
import type { StatBoardPlayer, StatLens } from "../types";
import { useStatBoardPlayerHistory } from "../useStatBoard";
import { ExpandedPlayerPanel } from "./ExpandedPlayerPanel";

interface Props {
  player: StatBoardPlayer;
  lens: StatLens;
  threshold: number;
  isMatchLocked: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function BoardRow({
  player,
  lens,
  threshold,
  isMatchLocked,
  isExpanded,
  onToggleExpand,
}: Props) {
  const { history, loading: histLoading, error: histError } = useStatBoardPlayerHistory(
    isExpanded && !isMatchLocked ? player.player_id : null
  );

  const thresholdKey = String(threshold);
  const hitData = player.all_threshold_hit_rates?.[thresholdKey];

  const hitRatePct =
    hitData != null
      ? hitData.rate
      : player.hit_rate_last_10 != null
      ? Math.round(player.hit_rate_last_10 * 100)
      : null;

  const hitFraction =
    hitData != null
      ? `${hitData.hits}/${hitData.games}`
      : player.hit_count_last_10 != null
      ? `${player.hit_count_last_10}/${Math.min(player.games_played ?? 0, 10)}`
      : null;

  const confidence = player.confidence_label;
  const confStyles: Record<string, { dot: string; text: string }> = {
    HIGH:   { dot: "bg-emerald-400",  text: "text-emerald-400" },
    MEDIUM: { dot: "bg-amber-400",    text: "text-amber-400" },
    LOW:    { dot: "bg-white/25",     text: "text-white/40" },
  };
  const conf = confidence ? confStyles[confidence] ?? confStyles.LOW : null;

  const isPlayerLocked = isMatchLocked && !player.is_free_match;
  const last10 = (player.last_10_values ?? []).slice(-10);

  return (
    <div
      className={`transition-colors duration-100 ${
        isExpanded
          ? "bg-white/[0.03]"
          : "hover:bg-white/[0.025]"
      }`}
    >
      {/* ── Main row ── */}
      <button
        className="w-full text-left focus:outline-none focus-visible:ring-inset focus-visible:ring-1 focus-visible:ring-emerald-500/50 rounded-none"
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
        aria-label={`${player.player_name} — ${isExpanded ? "collapse" : "expand"} detail`}
      >
        {/* Desktop */}
        <div className="hidden md:grid md:grid-cols-[1fr_130px_60px_60px_96px_84px_32px] gap-x-3 items-center px-3 py-2.5">

          {/* Player name + position */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold text-white/90 truncate leading-tight">
                  {player.player_name}
                </span>
                {player.position_group && (
                  <span className="shrink-0 text-[9px] font-bold text-white/35 bg-white/8 rounded px-1 py-0.5 tracking-wide">
                    {player.position_group}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-white/35 truncate mt-0.5">
                {player.team_name}
                {player.is_home === false && <span className="ml-0.5 text-white/20">(A)</span>}
              </p>
            </div>
          </div>

          {/* Mini chips */}
          <div className="flex items-center justify-center gap-0.5" role="list" aria-label="Recent values">
            <MiniChips values={last10} threshold={threshold} isLocked={isPlayerLocked} />
          </div>

          {/* L10 avg */}
          <div className="text-right tabular-nums">
            <span className="text-[13px] font-semibold text-white/80">
              {player.last_10_avg != null ? Number(player.last_10_avg).toFixed(1) : "—"}
            </span>
          </div>

          {/* Projection */}
          <div className="text-right tabular-nums">
            {isPlayerLocked ? (
              <span className="text-[13px] font-semibold text-white/20 blur-[4px] select-none" aria-hidden>••</span>
            ) : player.projection != null ? (
              <span className="text-[13px] font-bold text-white">{player.projection}</span>
            ) : (
              <span className="text-[13px] text-white/25">—</span>
            )}
          </div>

          {/* Hit rate */}
          <div className="flex flex-col items-center gap-0.5 tabular-nums">
            {isPlayerLocked ? (
              <span className="text-xs text-white/20 blur-[4px] select-none" aria-hidden>•/•</span>
            ) : (
              <>
                <span className="text-[12px] font-semibold text-white/85">
                  {hitFraction ?? "—"}
                </span>
                {hitRatePct != null && (
                  <span className={`text-[10px] font-semibold ${
                    hitRatePct >= 70 ? "text-emerald-400" : hitRatePct >= 50 ? "text-amber-400" : "text-white/35"
                  }`}>
                    {hitRatePct}%
                  </span>
                )}
              </>
            )}
          </div>

          {/* Consistency */}
          <div className="flex items-center justify-center">
            {!isPlayerLocked && conf && confidence ? (
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${conf.dot}`} aria-hidden />
                <span className={`text-[11px] font-semibold ${conf.text}`}>{confidence}</span>
              </div>
            ) : (
              <span className="text-white/15 text-[10px]">—</span>
            )}
          </div>

          {/* Expand */}
          <div className="flex items-center justify-center">
            {isPlayerLocked ? (
              <Lock className="h-3.5 w-3.5 text-[#F5C84C]/40" aria-hidden />
            ) : isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-white/50" aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-white/30 group-hover:text-white/50" aria-hidden />
            )}
          </div>
        </div>

        {/* Mobile */}
        <div className="md:hidden px-3 py-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[14px] font-semibold text-white/90 leading-tight">
                  {player.player_name}
                </span>
                {player.position_group && (
                  <span className="text-[9px] font-bold text-white/35 bg-white/8 rounded px-1 py-0.5 tracking-wide">
                    {player.position_group}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-white/35 mt-0.5">
                {player.team_name}
                <span className="mx-1 text-white/18">vs</span>
                {player.opponent_team_name}
                {player.is_home === false && <span className="ml-1 text-white/22">(A)</span>}
              </p>
            </div>

            <div className="shrink-0 mt-0.5">
              {isPlayerLocked ? (
                <Lock className="h-4 w-4 text-[#F5C84C]/40" aria-hidden />
              ) : isExpanded ? (
                <ChevronUp className="h-4 w-4 text-white/50" aria-hidden />
              ) : (
                <ChevronDown className="h-4 w-4 text-white/30" aria-hidden />
              )}
            </div>
          </div>

          {/* Chips */}
          <div className="mb-2.5 flex gap-0.5 flex-wrap" role="list" aria-label="Recent values">
            <MiniChips values={last10} threshold={threshold} isLocked={isPlayerLocked} />
          </div>

          {/* Stats */}
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <p className="text-[9px] text-white/30 uppercase tracking-wide mb-0.5">L10 avg</p>
              <span className="text-[13px] font-semibold text-white/80 tabular-nums">
                {player.last_10_avg != null ? Number(player.last_10_avg).toFixed(1) : "—"}
              </span>
            </div>
            <div>
              <p className="text-[9px] text-white/30 uppercase tracking-wide mb-0.5">Proj</p>
              {isPlayerLocked ? (
                <span className="text-[13px] font-bold text-white/20 blur-[4px] select-none" aria-hidden>••</span>
              ) : player.projection != null ? (
                <span className="text-[13px] font-bold text-white tabular-nums">{player.projection}</span>
              ) : (
                <span className="text-[13px] text-white/25">—</span>
              )}
            </div>
            <div>
              <p className="text-[9px] text-white/30 uppercase tracking-wide mb-0.5">{threshold}+ hit</p>
              {isPlayerLocked ? (
                <span className="text-xs text-white/20 blur-[4px] select-none" aria-hidden>•/•</span>
              ) : (
                <div className="flex items-baseline gap-1">
                  <span className="text-[13px] font-semibold text-white/85 tabular-nums">
                    {hitFraction ?? "—"}
                  </span>
                  {hitRatePct != null && (
                    <span className={`text-[10px] tabular-nums font-semibold ${
                      hitRatePct >= 70 ? "text-emerald-400" : hitRatePct >= 50 ? "text-amber-400" : "text-white/35"
                    }`}>
                      {hitRatePct}%
                    </span>
                  )}
                </div>
              )}
            </div>
            {!isPlayerLocked && conf && confidence && (
              <div>
                <p className="text-[9px] text-white/30 uppercase tracking-wide mb-0.5">Consistency</p>
                <div className="flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${conf.dot}`} aria-hidden />
                  <span className={`text-[10px] font-semibold ${conf.text}`}>{confidence}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {isExpanded && !isPlayerLocked && (
        <ExpandedPlayerPanel
          player={player}
          history={history}
          loading={histLoading}
          error={histError}
          lens={lens}
          threshold={threshold}
          isLocked={isPlayerLocked}
        />
      )}

      {isExpanded && isPlayerLocked && (
        <LockedExpandPanel playerName={player.player_name} />
      )}
    </div>
  );
}

// ── Mini chips ────────────────────────────────────────────────────────────────

function MiniChips({
  values,
  threshold,
  isLocked,
}: {
  values: number[];
  threshold: number;
  isLocked: boolean;
}) {
  if (values.length === 0) {
    return (
      <>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="h-5 w-[18px] rounded bg-white/5 flex items-center justify-center text-[9px] text-white/15">
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
        const hit = v >= threshold;

        if (isLocked) {
          return (
            <span
              key={i}
              role="listitem"
              className="h-5 min-w-[18px] px-0.5 rounded bg-white/5 text-[9px] font-medium text-white/18 flex items-center justify-center tabular-nums"
            >
              {v}
            </span>
          );
        }

        return (
          <span
            key={i}
            role="listitem"
            aria-label={`${v}`}
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
            {v}
          </span>
        );
      })}
    </>
  );
}

// ── Locked expand ─────────────────────────────────────────────────────────────

function LockedExpandPanel({ playerName }: { playerName: string }) {
  return (
    <div className="border-t border-[#F5C84C]/10 px-4 py-5 text-center" role="region" aria-label="Premium content locked">
      <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-[#F5C84C]/8 mb-2.5">
        <Lock className="h-4 w-4 text-[#F5C84C]/50" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-[#F5C84C]/70">Unlock full round</p>
      <p className="mt-1 text-xs text-white/30 max-w-[220px] mx-auto leading-relaxed">
        Upgrade to Neeko+ to see {playerName}'s full trend, projections and hit rates.
      </p>
    </div>
  );
}
