import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Target, Star, Zap, Users } from "lucide-react";

interface AIInsightsProps {
  players: any[];
}

const AIInsights = ({ players }: AIInsightsProps) => {
  const insights = useMemo(() => {
    if (!players || players.length === 0) return null;

    // Calculate form changes (recent 3 games vs previous 3 games)
    const playersWithForm = players
      .filter(p => p.roundScores && p.roundScores.length >= 6)
      .map(p => {
        const recent = p.roundScores.slice(-3);
        const earlier = p.roundScores.slice(-6, -3);
        const recentAvg = recent.reduce((sum: number, val: number) => sum + val, 0) / recent.length;
        const earlierAvg = earlier.reduce((sum: number, val: number) => sum + val, 0) / earlier.length;
        const formChange = ((recentAvg - earlierAvg) / earlierAvg) * 100;

        return {
          ...p,
          recentAvg,
          earlierAvg,
          formChange
        };
      });

    // Top 10 Hottest Players
    const hottestPlayers = [...playersWithForm]
      .sort((a, b) => b.formChange - a.formChange)
      .slice(0, 10);

    // Top 10 Coldest Players
    const coldestPlayers = [...playersWithForm]
      .sort((a, b) => a.formChange - b.formChange)
      .slice(0, 10);

    // Most Consistent Players (highest % thresholds)
    const consistentPlayers = [...players]
      .filter(p => p.gamesPlayed >= 5)
      .sort((a, b) => (b.pct15Plus || 0) - (a.pct15Plus || 0))
      .slice(0, 10);

    // Highest Value Picks (high avg but maybe undervalued)
    const valuePicks = [...players]
      .filter(p => p.gamesPlayed >= 5)
      .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))
      .slice(0, 10);

    return {
      hottestPlayers,
      coldestPlayers,
      consistentPlayers,
      valuePicks
    };
  }, [players]);

  if (!insights) {
    return (
      <Card className="p-6">
        <div className="text-center py-12 text-muted-foreground">
          Loading AI insights...
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">AI Insights</h2>
        <p className="text-muted-foreground">
          Automated analysis based on real-time player performance data
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top 10 Hottest Players */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-green-500" />
            <h3 className="text-lg font-bold">Top 10 Hottest Players</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Players with the strongest recent improvement
          </p>
          <div className="space-y-2">
            {insights.hottestPlayers.map((player, index) => (
              <div key={index} className="flex items-center justify-between p-2 rounded bg-muted/30">
                <div>
                  <span className="font-semibold">{player.Player}</span>
                  <span className="text-sm text-muted-foreground ml-2">({player.Team})</span>
                </div>
                <span className="text-green-500 font-bold">
                  +{player.formChange.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Top 10 Coldest Players */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="h-5 w-5 text-red-500" />
            <h3 className="text-lg font-bold">Top 10 Coldest Players</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Players experiencing form decline
          </p>
          <div className="space-y-2">
            {insights.coldestPlayers.map((player, index) => (
              <div key={index} className="flex items-center justify-between p-2 rounded bg-muted/30">
                <div>
                  <span className="font-semibold">{player.Player}</span>
                  <span className="text-sm text-muted-foreground ml-2">({player.Team})</span>
                </div>
                <span className="text-red-500 font-bold">
                  {player.formChange.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Most Consistent Players */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold">Most Consistent Players</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Highest percentage of strong performances
          </p>
          <div className="space-y-2">
            {insights.consistentPlayers.map((player, index) => (
              <div key={index} className="flex items-center justify-between p-2 rounded bg-muted/30">
                <div>
                  <span className="font-semibold">{player.Player}</span>
                  <span className="text-sm text-muted-foreground ml-2">({player.Team})</span>
                </div>
                <span className="text-primary font-bold">
                  {player.pct15Plus?.toFixed(0)}% (15+)
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Highest Value Picks */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Star className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold">Highest Value Picks</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Top performers by average score
          </p>
          <div className="space-y-2">
            {insights.valuePicks.map((player, index) => (
              <div key={index} className="flex items-center justify-between p-2 rounded bg-muted/30">
                <div>
                  <span className="font-semibold">{player.Player}</span>
                  <span className="text-sm text-muted-foreground ml-2">({player.Team})</span>
                </div>
                <span className="text-primary font-bold">
                  {player.avgScore?.toFixed(1)} avg
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AIInsights;
