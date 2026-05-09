import { Sparkles, Lock } from "lucide-react";
import { cleanAiText } from "@/utils/cleanAiText";
import type { PlayerIntelligence } from "@/hooks/usePlayerIntelligence";

interface Props {
  intelligence: PlayerIntelligence | null;
  loading: boolean;
  isPremium: boolean;
  playerName: string;
  // Stat-based fallback values — shown when no AI text is available
  projection?: number | null;
  breakeven?: number | null;
  edgeScore?: number | null;
  avgLast3?: number | null;
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
  projection,
  breakeven,
  edgeScore,
  avgLast3,
  confidenceLabel,
  variant = "card",
  upgradeHref = "/billing",
}: Props) {
  const hasText = !!(intelligence?.summary_long || intelligence?.summary_short);
  const displayText = intelligence?.summary_long ?? intelligence?.summary_short ?? null;

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
            In-depth analysis available for Neeko+ members — projection context, form trend, value profile and model signals.
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

  // Premium + no AI text — stat-generated fallback
  if (!hasText) {
    const parts: string[] = [];
    if (projection != null) parts.push(`projection ${Math.round(projection)}`);
    if (breakeven != null) parts.push(`breakeven ${Math.round(breakeven)}`);
    if (edgeScore != null) parts.push(`edge ${edgeScore > 0 ? "+" : ""}${edgeScore.toFixed(1)}`);
    if (avgLast3 != null) parts.push(`recent form avg ${Math.round(avgLast3)}`);
    if (confidenceLabel) parts.push(`confidence ${confidenceLabel.toLowerCase()}`);

    const fallback = parts.length > 0
      ? `Player Intelligence is not available yet for ${playerName}. Current model data shows ${parts.join(", ")}.`
      : `Player Intelligence is not available yet for ${playerName}.`;

    return (
      <div className={`flex items-start gap-1.5 ${variant === "card" ? "px-3 sm:px-5 pb-2.5 sm:pb-3" : ""}`}>
        <Sparkles className="h-3 w-3 text-white/18 shrink-0 mt-0.5" aria-hidden />
        <p className="text-[11px] text-white/25 italic leading-relaxed">{fallback}</p>
      </div>
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
          {intelligence?.ai_generated_at && (
            <p className="text-[9px] text-white/18 tabular-nums">
              Updated {new Date(intelligence.ai_generated_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            </p>
          )}
        </div>
        <p className="text-[12px] text-white/60 leading-relaxed">{cleanAiText(displayText!)}</p>
        <p className="text-[9px] text-white/20 leading-relaxed italic mt-2">
          Generated from current player stats, form, price context and model signals. Not a guarantee of future scoring.
        </p>
      </div>
    </section>
  );
}
