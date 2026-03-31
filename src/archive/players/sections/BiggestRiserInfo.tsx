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
          aria-label="Biggest Riser explanation"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[280px] border border-yellow-500/20 bg-gradient-to-br from-black via-[#050507] to-[#14100a] text-white shadow-[0_0_40px_rgba(0,0,0,0.8)] animate-in fade-in slide-in-from-top-2 duration-150"
        align="end"
      >
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-yellow-300">
            Biggest Riser
          </h4>
          <p className="text-xs text-white/80 leading-relaxed">
            Largest jump vs the player's last game (not season average).
          </p>
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
            aria-label="Biggest Riser explanation"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          className="border border-yellow-500/20 bg-gradient-to-br from-black via-[#050507] to-[#14100a] text-white shadow-[0_0_40px_rgba(0,0,0,0.8)]"
          side="top"
        >
          <div className="space-y-1">
            <p className="text-xs font-semibold text-yellow-300">
              Biggest Riser
            </p>
            <p className="text-xs text-white/80">
              Largest jump vs the player's last game (not season average).
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function BiggestRiserInfo() {
  const isMobile = useIsMobile();

  return isMobile ? <MobilePopover /> : <DesktopTooltip />;
}
