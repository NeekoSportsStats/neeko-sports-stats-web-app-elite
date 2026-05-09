import { Sparkles, Lock } from "lucide-react";
import { cleanAiText } from "@/utils/cleanAiText";
import type { TeamIntelligence } from "@/hooks/useTeamIntelligence";

interface StatFallback {
  topPlayerName?: string | null;
  topProjection?: number | null;
  avgProjection?: number | null;
  avgSeasonAvg?: number | null;
  startCount?: number | null;
  sitCount?: number | null;
  midCount?: number | null;
  defCount?: number | null;
  fwdCount?: number | null;
  rucCount?: number | null;
}

interface Props {
  intelligence: TeamIntelligence | null;
  loading: boolean;
  isPremium: boolean;
  teamName: string;
  stats?: StatFallback;
  upgradeHref?: string;
}

export function TeamIntelligencePanel({
  intelligence,
  loading,
  isPremium,
  teamName,
  stats,
  upgradeHref = "/billing",
}: Props) {
  const hasSummary = !!intelligence?.summary;

  // Loading state
  if (loading) {
    return (
      <section aria-label="team intelligence" className="rounded-lg border border-white/[0.08] bg-white/[0.018] px-4 py-3.5">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Sparkles className="h-3 w-3 text-white/25" aria-hidden />
          <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider">Team Intelligence</p>
        </div>
        <div className="space-y-1.5">
          <div className="h-2 w-full rounded bg-white/5 animate-pulse" />
          <div className="h-2 w-[85%] rounded bg-white/5 animate-pulse" />
          <div className="h-2 w-[70%] rounded bg-white/5 animate-pulse" />
        </div>
      </section>
    );
  }

  // Free user — teaser + upgrade CTA
  if (!isPremium) {
    return (
      <section aria-label="team intelligence" className="rounded-lg border border-white/[0.08] bg-white/[0.018] px-4 py-3.5">
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles className="h-3 w-3 text-white/25" aria-hidden />
          <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider">Team Intelligence</p>
        </div>
        <p className="text-[11px] text-white/30 leading-relaxed mb-3">
          In-depth squad profile available for Neeko+ members — scoring output, positional depth, consistency and stat trends.
        </p>
        <a
          href={upgradeHref}
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-white/50 hover:text-white/80 transition-colors border border-white/15 hover:border-white/30 rounded-md px-2.5 py-1.5"
        >
          <Lock className="h-3 w-3" aria-hidden />
          Unlock with Neeko+
        </a>
      </section>
    );
  }

  // Premium + has AI summary — full card
  if (hasSummary) {
    return (
      <section aria-label="team intelligence" className="rounded-lg border border-white/[0.08] bg-white/[0.018] px-4 py-3.5">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-white/30" aria-hidden />
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Team Intelligence</p>
          </div>
          {intelligence?.updated_at && (
            <p className="text-[9px] text-white/18 tabular-nums">
              Updated {new Date(intelligence.updated_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            </p>
          )}
        </div>
        <p className="text-[12px] text-white/60 leading-relaxed">{cleanAiText(intelligence!.summary)}</p>
        {intelligence?.fantasy_verdict && (
          <p className="text-[11px] text-white/35 leading-relaxed mt-2 pt-2 border-t border-white/5 font-medium">
            {intelligence.fantasy_verdict}
          </p>
        )}
        <p className="text-[9px] text-white/20 leading-relaxed italic mt-2">
          Generated from recent stats, scoring trends, consistency and model context. Not a guarantee of future output.
        </p>
      </section>
    );
  }

  // Premium + no AI — polished stat-generated fallback
  const parts: string[] = [];
  if (stats?.topPlayerName && stats?.topProjection != null) {
    parts.push(`top projected player is ${stats.topPlayerName} (${Math.round(stats.topProjection)} pts)`);
  }
  if (stats?.avgProjection != null) {
    parts.push(`squad average projection ${Math.round(stats.avgProjection)} pts`);
  }
  if (stats?.avgSeasonAvg != null) {
    parts.push(`season average ${Math.round(stats.avgSeasonAvg)} pts`);
  }

  const posParts: string[] = [];
  if (stats?.midCount != null) posParts.push(`${stats.midCount} MID`);
  if (stats?.defCount != null) posParts.push(`${stats.defCount} DEF`);
  if (stats?.fwdCount != null) posParts.push(`${stats.fwdCount} FWD`);
  if (stats?.rucCount != null) posParts.push(`${stats.rucCount} RUC`);

  const positionalLine = posParts.length > 0 ? ` Positional depth: ${posParts.join(", ")}.` : "";

  const signalParts: string[] = [];
  if (stats?.startCount != null && stats.startCount > 0) {
    signalParts.push(`${stats.startCount} positive signal${stats.startCount !== 1 ? "s" : ""}`);
  }
  if (stats?.sitCount != null && stats.sitCount > 0) {
    signalParts.push(`${stats.sitCount} negative signal${stats.sitCount !== 1 ? "s" : ""}`);
  }
  const signalLine = signalParts.length > 0 ? ` Model signals: ${signalParts.join(", ")}.` : "";

  const fallback = parts.length > 0
    ? `Current scoring profile for ${teamName}: ${parts.join(", ")}.${positionalLine}${signalLine} Full analysis will be available after the next data refresh.`
    : `Scoring analysis for ${teamName} will be available after the next data refresh.`;

  return (
    <section aria-label="team intelligence" className="rounded-lg border border-white/[0.08] bg-white/[0.018] px-4 py-3.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="h-3 w-3 text-white/20" aria-hidden />
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Team Intelligence</p>
      </div>
      <p className="text-[11px] text-white/35 leading-relaxed italic">{fallback}</p>
    </section>
  );
}
