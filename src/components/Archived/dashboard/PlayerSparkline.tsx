import { usePlayerSparkline } from "@/hooks/usePlayerSparkline";
import Sparkline from "./Sparkline";
import { Skeleton } from "@/components/ui/skeleton";

interface PlayerSparklineProps {
  sport: "afl" | "nba" | "epl";
  playerName: string;
  statKey?: string;
  color?: string;
}

export const PlayerSparkline = ({ sport, playerName, statKey, color }: PlayerSparklineProps) => {
  const { sparklineData, loading, hasData } = usePlayerSparkline({ sport, playerName, statKey });

  if (loading) {
    return <Skeleton className="h-[30px] w-[80px]" />;
  }

  if (!hasData) {
    return (
      <div className="text-[10px] text-muted-foreground w-[80px] h-[30px] flex items-center justify-center">
        Insufficient data
      </div>
    );
  }

  return <Sparkline data={sparklineData} color={color} />;
};
