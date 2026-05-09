import { Sparkles, Lock } from "lucide-react";
import type { TeamIntelligence } from "@/hooks/useTeamIntelligence";

interface StatFallback {
  topPlayerName?: string | null;
  topProjection?: number | null;
  avgProjection?: number | null;
  startCount?: number | null;
  holdCount?: number | null;
  sitCount?: number | null;
  premiumCount?: number | null;
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
          In-depth team profile available for Neeko+ members — squad depth, start/sit distribution, premium depth and model signals.
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
        <p className="text-[12px] text-white/60 leading-relaxed">{intelligence!.summary}</p>
        {intelligence?.fantasy_verdict && (
          <p className="text-[11px] text-white/40 leading-relaxed mt-2 pt-2 border-t border-white/5">
            {intelligence.fantasy_verdict}
          </p>
        )}
        <p className="text-[9px] text-white/20 leading-relaxed italic mt-2">
          Generated from current squad data, projections, and model signals. Not a guarantee of future scoring.
        </p>
      </section>
    );
  }

  // Premium + no AI — stat-generated fallback
  const parts: string[] = [];
  if (stats?.topPlayerName && stats?.topProjection != null) {
    parts.push(`top projected player is ${stats.topPlayerName} (${Math.round(stats.topProjection)} pts)`);
  }
  if (stats?.avgProjection != null) {
    parts.push(`squad average projection ${Math.round(stats.avgProjection)} pts`);
  }
  if (stats?.startCount != null && stats.startCount > 0) {
    parts.push(`${stats.startCount} start signal${stats.startCount !== 1 ? "s" : ""}`);
  }
  if (stats?.sitCount != null && stats.sitCount > 0) {
    parts.push(`${stats.sitCount} sit signal${stats.sitCount !== 1 ? "s" : ""}`);
  }
  if (stats?.premiumCount != null && stats.premiumCount > 0) {
    parts.push(`${stats.premiumCount} premium-priced player${stats.premiumCount !== 1 ? "s" : ""}`);
  }

  const fallback = parts.length > 0
    ? `Team Intelligence is not available yet for ${teamName}. Current model data shows ${parts.join(", ")}.`
    : `Team Intelligence is not available yet for ${teamName}. Check back after the next data refresh.`;

  return (
    <section aria-label="team intelligence" className="rounded-lg border border-white/[0.08] bg-white/[0.018] px-4 py-3.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="h-3 w-3 text-white/20" aria-hidden />
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Team Intelligence</p>
      </div>
      <p className="text-[11px] text-white/30 leading-relaxed italic">{fallback}</p>
    </section>
  );
}
