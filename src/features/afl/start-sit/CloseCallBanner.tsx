import { TriangleAlert as AlertTriangle } from "lucide-react";

interface CloseCallBannerProps {
  onUpgrade: () => void;
}

export function CloseCallBanner({ onUpgrade }: CloseCallBannerProps) {
  return (
    <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.04] overflow-hidden">
      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-7 h-7 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle size={12} className="text-amber-400/80" />
          </div>
          <div>
            <p className="text-sm font-bold text-white/80 leading-tight">This is a close call</p>
            <p className="text-xs text-white/40 mt-1 leading-relaxed">
              You're seeing the surface pick — but this decision can flip depending on your matchup.
            </p>
          </div>
        </div>

        <ul className="space-y-1.5 mb-4 pl-10">
          {[
            "Role volatility can shift the outcome late in the week",
            "Ceiling vs floor trade-off depends on your scoring position",
            "Matchup sensitivity is high when confidence is this tight",
          ].map((point) => (
            <li key={point} className="flex items-start gap-2">
              <span className="mt-[5px] h-1 w-1 rounded-full bg-amber-400/30 shrink-0" />
              <span className="text-[11px] text-white/35 leading-snug">{point}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={onUpgrade}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] text-amber-400/80 text-xs font-bold hover:bg-amber-400/[0.10] hover:border-amber-400/35 transition-all"
        >
          <AlertTriangle size={10} />
          See full decision breakdown
        </button>
      </div>
    </div>
  );
}
