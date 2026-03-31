import React from "react";
import { Info } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function MobilePopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-yellow-400/70 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
          aria-label="Most Consistent explanation"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[320px] border border-yellow-500/20 bg-gradient-to-br from-black via-[#050507] to-[#14100a] text-white shadow-[0_0_40px_rgba(0,0,0,0.8)] animate-in fade-in slide-in-from-top-2 duration-150"
        align="end"
      >
        <div className="space-y-3">
          <div>
            <h4 className="mb-1 text-sm font-semibold text-yellow-300">
              Most Consistent
            </h4>
            <p className="text-xs text-white/70">
              Week-to-week reliability indicator
            </p>
          </div>

          <p className="text-xs text-white/80 leading-relaxed">
            This highlights the player whose performance has stayed closest to
            their own recent average.
          </p>

          <ul className="space-y-1.5 text-xs text-white/70 pl-1">
            <li>• Compared against their own last 10 games</li>
            <li>• Measures game-to-game variation</li>
            <li>• Rewards stable, repeatable output</li>
          </ul>

          <div className="rounded border border-yellow-500/20 bg-black/40 p-2.5">
            <p className="text-xs text-white/70 leading-relaxed">
              <span className="font-medium text-yellow-300">Example:</span>{" "}
              95% indicates extremely steady week-to-week performance.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DesktopTooltip() {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-yellow-400/70 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
            aria-label="Most Consistent explanation"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          className="max-w-[320px] border border-yellow-500/20 bg-gradient-to-br from-black via-[#050507] to-[#14100a] text-white shadow-[0_0_40px_rgba(0,0,0,0.8)]"
          side="top"
        >
          <div className="space-y-2">
            <p className="text-xs font-semibold text-yellow-300">
              Most Consistent
            </p>
            <p className="text-xs text-white/80 leading-relaxed">
              Identifies the player with the most stable output relative to
              their own recent average. Based on last 10 games.
            </p>
            <p className="text-[11px] text-white/60">
              95% = extremely steady week-to-week performance
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ConsistencyInfo() {
  const isMobile = useIsMobile();

  return isMobile ? <MobilePopover /> : <DesktopTooltip />;
}
