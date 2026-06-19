import { Sparkles, Lock } from "lucide-react";
import { cleanAiText } from "@/utils/cleanAiText";
import type { PlayerIntelligence } from "@/hooks/usePlayerIntelligence";
import { PLAYER_AI_PROMPT_VERSION } from "@/constants/aiVersions";
import type { StatLens } from "@/features/afl/stat-board/types";
import { isInsightValidForLens } from "@/features/afl/stat-board/lib/insightLensGuard";

interface Props {
  intelligence: PlayerIntelligence | null;
  loading: boolean;
  isPremium: boolean;
  playerName: string;
  /** Active stat lens — insight is suppressed when it does not match */
  statLens?: StatLens;
  // Stat-based fallback values — shown when no AI text is available
  projection?: number | null;
  avgLast3?: number | null;
  avgLast5?: number | null;
  seasonAvg?: number | null;
  confidenceLabel?: string | null;
  // Layout variant
  variant?: "card" | "inline";
  // Upgrade CTA href
  upgradeHref?: string;
}

export function PlayerIntelligencePanel({
  intelligence,
  loading,
  isPremium,
  playerName,
  statLens,
  projection,
  avgLast3,
  avgLast5,
  seasonAvg,
  confidenceLabel,
  variant = "card",
  upgradeHref = "/billing",
}: Props) {
  // Lens guard: suppress intelligence when the insight does not belong to the
  // current stat context.  When statLens is not provided the check is skipped
  // (legacy callers outside the stat board do not pass a lens).
  const insightMatchesLens = statLens == null || isInsightValidForLens(intelligence, statLens);
  // Treat a lens mismatch as if there is no insight (loading=false, text=null)
  const effectiveIntelligence = insightMatchesLens ? intelligence : null;

  const CURRENT_PLAYER_VERSION = PLAYER_AI_PROMPT_VERSION;
  const isCurrentVersion = effectiveIntelligence?.prompt_version === CURRENT_PLAYER_VERSION;
  const hasText = !!(effectiveIntelligence?.summary_long || effectiveIntelligence?.summary_short) && isCurrentVersion;
  const displayText = hasText ? (effectiveIntelligence?.summary_long ?? effectiveIntelligence?.summary_short ?? null) : null;

  // Loading state
  if (loading) {
    return (
      <section aria-label="player intelligence" aria-busy className={variant === "card" ? "px-3 sm:px-5 pb-3 sm:pb-4" : ""}>
        <div className="rounded-lg border border-white/8 bg-white/[0.018] px-4 py-3.5">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Sparkles className="h-3 w-3 text-white/25" aria-hidden />
            <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider">Player Intelligence</p>
          </div>
          <div className="space-y-1.5">
            <div className="h-2 w-full rounded bg-white/5 animate-pulse" />
            <div className="h-2 w-[88%] rounded bg-white/5 animate-pulse" />
            <div className="h-2 w-[68%] rounded bg-white/5 animate-pulse" />
          </div>
        </div>
      </section>
    );
  }

  // Free user — show teaser + upgrade CTA
  if (!isPremium) {
    return (
      <section aria-label="player intelligence" className={variant === "card" ? "px-3 sm:px-5 pb-3 sm:pb-4" : ""}>
        <div className="rounded-lg border border-white/10 bg-white/[0.018] px-4 py-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3 w-3 text-white/30" aria-hidden />
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Player Intelligence</p>
          </div>
          <p className="text-[11px] text-white/30 leading-relaxed mb-3">
            In-depth scoring analysis available for Neeko+ members — recent form, scoring trends, consistency and stat context.
          </p>
          <a
            href={upgradeHref}
            className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-white/50 hover:text-white/80 transition-colors border border-white/15 hover:border-white/30 rounded-md px-2.5 py-1.5"
          >
            <Lock className="h-3 w-3" aria-hidden />
            Unlock with Neeko+
          </a>
        </div>
      </section>
    );
  }

  // Premium + no AI text — polished stat-generated fallback
  if (!hasText) {
    const lines: string[] = [];

    // Recent form line
    if (avgLast3 != null && seasonAvg != null) {
      const delta = Math.round(avgLast3) - Math.round(seasonAvg);
      const trendWord = delta > 4 ? "above" : delta < -4 ? "below" : "in line with";
      lines.push(
        `${playerName}'s last-3 average of ${Math.round(avgLast3)} pts is ${trendWord} their season average of ${Math.round(seasonAvg)} pts.`
      );
    } else if (avgLast3 != null) {
      lines.push(`${playerName} is averaging ${Math.round(avgLast3)} pts over the last three rounds.`);
    } else if (seasonAvg != null) {
      lines.push(`${playerName} is averaging ${Math.round(seasonAvg)} pts across the season.`);
    }

    // Projection line
    if (projection != null) {
      lines.push(`The model projects ${Math.round(projection)} pts this round.`);
    }

    // Confidence line
    if (confidenceLabel) {
      lines.push(`Projection confidence is ${confidenceLabel.toLowerCase()}.`);
    }

    lines.push("Full AI analysis will be available after the next data refresh.");

    const fallback = lines.length > 0
      ? lines.join(" ")
      : `Scoring analysis for ${playerName} will be available after the next data refresh.`;

    return (
      <section aria-label="player intelligence" className={variant === "card" ? "px-3 sm:px-5 pb-3 sm:pb-4" : ""}>
        <div className="rounded-lg border border-white/8 bg-white/[0.018] px-4 py-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3 w-3 text-white/20" aria-hidden />
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Player Intelligence</p>
          </div>
          <p className="text-[11px] text-white/35 leading-relaxed italic">{fallback}</p>
        </div>
      </section>
    );
  }

  // Premium + has text — full card
  return (
    <section aria-label="player intelligence" className={variant === "card" ? "px-3 sm:px-5 pb-3 sm:pb-4" : ""}>
      <div className="rounded-lg border border-white/8 bg-white/[0.018] px-4 py-3.5">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-white/30" aria-hidden />
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
              Player Intelligence
            </p>
          </div>
          {effectiveIntelligence?.ai_generated_at && (
            <p className="text-[9px] text-white/18 tabular-nums">
              Updated {new Date(effectiveIntelligence.ai_generated_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            </p>
          )}
        </div>
        <p className="text-[12px] text-white/60 leading-relaxed">{cleanAiText(displayText!)}</p>
        <p className="text-[9px] text-white/20 leading-relaxed italic mt-2">
          Generated from recent scores, scoring trends, consistency and model context. Not a guarantee of future output.
        </p>
      </div>
    </section>
  );
}
