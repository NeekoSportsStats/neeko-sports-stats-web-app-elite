import { useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";

interface TrendExplorerProps {
  players: any[];
  availableStats: string[];
}

const TrendExplorer = ({ players, availableStats }: TrendExplorerProps) => {
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [selectedStat, setSelectedStat] = useState<string>("Fantasy");

  const playerOptions = players.map(p => ({
    name: p.Player,
    value: p.Player
  })).slice(0, 50); // Limit to top 50 for performance

  // Calculate trend data for selected player
  const getTrendData = () => {
    if (!selectedPlayer) return [];

    const player = players.find(p => p.Player === selectedPlayer);
    if (!player || !player.roundScores) return [];

    const data = player.roundScores.map((score: number, index: number) => {
      // Calculate 3-game rolling average
      const start = Math.max(0, index - 2);
      const rollingScores = player.roundScores.slice(start, index + 1);
      const rollingAvg = rollingScores.reduce((sum: number, val: number) => sum + val, 0) / rollingScores.length;

      return {
        round: `R${index + 1}`,
        score,
        rollingAvg: rollingAvg.toFixed(1)
      };
    });

    return data;
  };

  const trendData = getTrendData();
  const player = players.find(p => p.Player === selectedPlayer);
  
  // Calculate trend direction
  const getTrendDirection = () => {
    if (!player?.roundScores || player.roundScores.length < 2) return null;
    const recent = player.roundScores.slice(-3);
    const earlier = player.roundScores.slice(-6, -3);
    if (earlier.length === 0) return null;
    
    const recentAvg = recent.reduce((sum: number, val: number) => sum + val, 0) / recent.length;
    const earlierAvg = earlier.reduce((sum: number, val: number) => sum + val, 0) / earlier.length;
    
    return recentAvg > earlierAvg ? "up" : "down";
  };

  const trendDirection = getTrendDirection();

  return (
    <Card className="p-6">
      <h3 className="text-xl font-bold mb-4">Trend Explorer</h3>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Select value={selectedPlayer} onValueChange={setSelectedPlayer}>
          <SelectTrigger>
            <SelectValue placeholder="Select Player" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border z-50 max-h-[300px]">
            {playerOptions.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedStat} onValueChange={setSelectedStat}>
          <SelectTrigger>
            <SelectValue placeholder="Select Stat" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border z-50">
            {availableStats.map(stat => (
              <SelectItem key={stat} value={stat}>
                {stat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedPlayer && trendData.length > 0 ? (
        <div className="space-y-4">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="round" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "hsl(var(--card))", 
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px"
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="score" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                name={selectedStat}
              />
              <Line 
                type="monotone" 
                dataKey="rollingAvg" 
                stroke="hsl(var(--muted-foreground))" 
                strokeWidth={2}
                strokeDasharray="5 5"
                name="3-Game Average"
              />
            </LineChart>
          </ResponsiveContainer>

          {trendDirection && (
            <div className="flex items-center gap-2 text-sm">
              {trendDirection === "up" ? (
                <>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">
                    Player's form is trending <span className="text-green-500 font-semibold">upward</span> compared to season average.
                  </span>
                </>
              ) : (
                <>
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  <span className="text-muted-foreground">
                    Player's form is trending <span className="text-red-500 font-semibold">downward</span> compared to season average.
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          Select a player to view their performance trend
        </div>
      )}
    </Card>
  );
};

export default TrendExplorer;
