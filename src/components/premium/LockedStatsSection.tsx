import { Lock, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";

interface LockedStatsSectionProps {
  title: string;
  subtitle?: string;
  context?: string;
  playerName?: string;
  showPreview?: boolean;
  previewText?: string;
  className?: string;
}

export function LockedStatsSection({
  title,
  subtitle,
  context = "stats",
  playerName,
  showPreview = false,
  previewText,
  className = "",
}: LockedStatsSectionProps) {
  const navigate = useNavigate();

  const handleUnlockClick = () => {
    track("unlock_attempt", {
      section: title,
      context,
      player_name: playerName,
      source: "locked_stats_section",
    });
    navigate("/neeko-plus");
  };

  return (
    <div className={`relative ${className}`}>
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-medium text-white/90">{title}</h3>
          {subtitle && (
            <p className="text-xs text-white/50 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="rounded-full bg-slate-900/90 p-1.5 border border-white/20">
          <Lock className="w-3 h-3 text-[#F5C84C]" />
        </div>
      </div>

      {/* Locked content area */}
      <div className="relative rounded-lg border border-white/10 bg-white/[0.02] p-4">
        {/* Blur overlay */}
        <div className="absolute inset-0 backdrop-blur-sm bg-gradient-to-br from-white/5 to-transparent rounded-lg" />

        {/* Content - NO premium data */}
        <div className="relative z-10 space-y-3">
          {showPreview && previewText ? (
            <p className="text-sm text-white/60 line-clamp-2">{previewText}</p>
          ) : (
            <>
              <div className="h-2 bg-white/5 rounded w-full" />
              <div className="h-2 bg-white/5 rounded w-4/5" />
              <div className="h-2 bg-white/5 rounded w-5/6" />
            </>
          )}

          {/* Upgrade prompt */}
          <div className="pt-2 border-t border-white/5">
            <Button
              onClick={handleUnlockClick}
              size="sm"
              className="w-full bg-gradient-to-r from-[#F5C84C] to-[#E8B739] hover:from-[#E8B739] hover:to-[#F5C84C] text-slate-900 font-semibold text-xs"
            >
              <TrendingUp className="w-3 h-3 mr-1.5" />
              Unlock Premium Analysis
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
