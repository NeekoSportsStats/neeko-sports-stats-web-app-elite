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
  const hitLabel = lens === "disposals" ? `${threshold}+ disposals` : `${threshold}+ goals`;
  const projLabel = lens === "disposals" ? "Proj. disposals" : "Proj. goals";

  // Sparkline: last_10_values reversed so most-recent is rightmost
  const sparkValues = player.last_10_values?.slice().reverse() ?? [];

  return (
    <div
      className={`rounded-xl border transition-colors ${
        isLocked
          ? "border-[#F5C84C]/15 bg-[#F5C84C]/3"
          : "border-white/8 bg-white/3 hover:border-white/15"
      }`}
    >
      {/* ── Collapsed row ── */}
      <div className="px-4 py-3">
        {/* Top row: name + position + lock */}
        <div className="flex items-start gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white">{player.player_name}</span>
              {player.position_group && (
                <span className="text-[10px] font-medium text-white/40 bg-white/6 rounded px-1.5 py-0.5">
                  {player.position_group}
                </span>
              )}
              {isLocked && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-[#F5C84C]/70 bg-[#F5C84C]/8 rounded px-1.5 py-0.5">
                  <Lock className="h-2.5 w-2.5" />
                  Premium
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Sparkline */}
        {sparkValues.length > 0 && (
          <div className="mb-3">
            <SparkBar values={sparkValues} threshold={threshold} isLocked={isLocked} />
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Projection */}
          <StatChip
            label={projLabel}
            value={
              isLocked ? (
                <LockedValue />
              ) : player.projection != null ? (
                String(player.projection)
              ) : (
                "—"
              )
            }
            highlight
          />

          {/* Hit rate */}
          <StatChip
            label={hitLabel}
            value={
              isLocked ? (
                <LockedValue />
              ) : hitData ? (
                `${hitData.hits}/${hitData.games}`
              ) : player.hit_count_last_10 != null && player.games_played != null ? (
                `${player.hit_count_last_10}/${Math.min(player.games_played, 10)}`
              ) : (
                "—"
              )
            }
          />

          {/* Consistency */}
          {!isLocked && player.confidence_label && (
            <ConfidencePill label={player.confidence_label} />
          )}
        </div>

        {/* Expand/collapse button */}
        <button
          onClick={onToggleExpand}
          className={`mt-3 flex items-center gap-1.5 text-xs font-medium transition-colors ${
            isExpanded
              ? "text-white/60 hover:text-white/80"
              : isLocked
              ? "text-[#F5C84C]/60 hover:text-[#F5C84C]/80"
              : "text-emerald-400/70 hover:text-emerald-400"
          }`}
        >
          <TrendingUp className="h-3 w-3" />
          {isExpanded ? "Hide trend" : "View trend"}
          {isExpanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
      </div>

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

// ── Sparkline bar ─────────────────────────────────────────────────────────────

function SparkBar({
  values,
  threshold,
  isLocked,
}: {
  values: number[];
  threshold: number;
  isLocked: boolean;
}) {
  const max = Math.max(...values, threshold * 1.5, 1);

  return (
    <div className="flex items-end gap-0.5 h-7">
      {values.map((v, i) => {
        const pct = Math.min((v / max) * 100, 100);
        const hit = v >= threshold;
        return (
          <div
            key={i}
            title={String(v)}
            className={`flex-1 rounded-sm transition-colors ${
              isLocked
                ? "bg-white/10"
                : hit
                ? "bg-emerald-500/60"
                : "bg-white/15"
            }`}
            style={{ height: `${Math.max(pct, 8)}%` }}
          />
        );
      })}
    </div>
  );
}

// ── Inline stat chip ──────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-white/35 mb-0.5">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? "text-white" : "text-white/80"}`}>
        {value}
      </p>
    </div>
  );
}

// ── Locked value blur ─────────────────────────────────────────────────────────

function LockedValue() {
  return (
    <span className="inline-block px-2 py-0.5 rounded bg-[#F5C84C]/10 text-[#F5C84C]/40 blur-[3px] select-none">
      ••••
    </span>
  );
}

// ── Confidence pill ───────────────────────────────────────────────────────────

function ConfidencePill({ label }: { label: "HIGH" | "MEDIUM" | "LOW" }) {
  const styles: Record<string, string> = {
    HIGH:   "bg-emerald-500/10 text-emerald-400",
    MEDIUM: "bg-amber-500/10 text-amber-400",
    LOW:    "bg-white/6 text-white/35",
  };
  return (
    <div>
      <p className="text-[10px] text-white/35 mb-0.5">Consistency</p>
      <span className={`text-[11px] font-semibold rounded px-1.5 py-0.5 ${styles[label] ?? styles.LOW}`}>
        {label}
      </span>
    </div>
  );
}
