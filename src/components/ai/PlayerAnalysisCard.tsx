import { useState } from "react";
import { SparklineChart } from "./SparklineChart";
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PlayerAnalysisCardProps {
  playerName: string;
  explanation: string;
  sparklineData: number[];
  statValue: string;
  statLabel: string;
  isBlurred?: boolean;
}

export const PlayerAnalysisCard = ({
  playerName,
  explanation,
  sparklineData,
  statValue,
  statLabel,
  isBlurred = false,
}: PlayerAnalysisCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const isPositiveStat = statValue.startsWith('+');
  const isNegativeStat = statValue.startsWith('-');

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className={`border-b border-border/30 last:border-0 ${isBlurred ? '' : ''}`}>
        <CollapsibleTrigger asChild>
          <div className="flex items-start gap-2 py-1.5 px-2.5 hover:bg-accent/5 transition-colors cursor-pointer">
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-xs text-foreground mb-0.5 leading-tight">{playerName}</h4>
              <p className="text-[10px] text-muted-foreground leading-tight line-clamp-2">{explanation}</p>
            </div>
            
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="text-right">
                <div className={`text-xs font-bold flex items-center gap-0.5 ${isPositiveStat ? 'text-green-500' : isNegativeStat ? 'text-red-500' : 'text-foreground'}`}>
                  {isPositiveStat && <TrendingUp className="w-2.5 h-2.5" />}
                  {isNegativeStat && <TrendingDown className="w-2.5 h-2.5" />}
                  {statValue}
                </div>
                <div className="text-[9px] text-muted-foreground">{statLabel}</div>
              </div>
              
              <div className="flex items-center gap-0.5">
                <div className="w-10 h-6">
                  <SparklineChart data={sparklineData} mini color="hsl(var(--primary))" />
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                )}
              </div>
            </div>
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="animate-accordion-down">
          <div className="bg-accent/5 border-t border-border/30">
            <div className="px-2.5 pt-1.5 pb-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <div className="bg-background/50 p-1.5 rounded">
                  <div className="text-[9px] text-muted-foreground mb-0.5">Current</div>
                  <div className={`text-xs font-bold ${isPositiveStat ? 'text-green-500' : isNegativeStat ? 'text-red-500' : 'text-foreground'}`}>
                    {statValue}
                  </div>
                </div>
                <div className="bg-background/50 p-1.5 rounded">
                  <div className="text-[9px] text-muted-foreground mb-0.5">Avg ({sparklineData.length})</div>
                  <div className="text-xs font-bold text-foreground">
                    {(sparklineData.reduce((a, b) => a + b, 0) / sparklineData.length).toFixed(1)}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="px-2.5 pb-2">
              <div className="bg-background/50 rounded overflow-hidden">
                <div className="px-2 pt-1.5 pb-1">
                  <div className="text-[9px] text-muted-foreground mb-1">Trend</div>
                </div>
                <div className="px-2 pb-2">
                  <div className="h-12 w-full">
                    <SparklineChart data={sparklineData} color="hsl(var(--primary))" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};