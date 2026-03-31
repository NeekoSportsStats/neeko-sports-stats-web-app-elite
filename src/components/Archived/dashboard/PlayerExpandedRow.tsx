import { Card } from "@/components/ui/card";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface PlayerExpandedRowProps {
  player: any;
  roundScores: number[];
  roundColumns: string[];
  isPremium: boolean;
}

const PlayerExpandedRow = ({ player, roundScores, roundColumns, isPremium }: PlayerExpandedRowProps) => {
  const chartData = roundScores.map((score, idx) => ({
    round: roundColumns[idx]?.replace('R', '') || idx + 1,
    score
  }));

  const sortedScores = [...roundScores].sort((a, b) => b - a);
  const best3 = sortedScores.slice(0, 3);
  const worst3 = sortedScores.slice(-3);

  const avg = roundScores.reduce((sum, s) => sum + s, 0) / roundScores.length;
  const withinRange = roundScores.filter(s => Math.abs(s - avg) <= avg * 0.2).length;
  const consistency = (withinRange / roundScores.length) * 100;

  return (
    <div className="bg-card/30 border-l-4 border-primary/50 p-4 space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Trend Chart */}
        <Card className="p-4">
          <h4 className="text-sm font-semibold mb-3">Fantasy Trend</h4>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={chartData}>
              <XAxis dataKey="round" stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))' 
                }} 
              />
              <Line 
                type="monotone" 
                dataKey="score" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2} 
                dot={{ fill: 'hsl(var(--primary))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Performance Stats */}
        <Card className="p-4 space-y-3">
          <div>
            <h4 className="text-sm font-semibold mb-2">Best 3 Games</h4>
            <div className="flex gap-2">
              {best3.map((score, idx) => (
                <span key={idx} className="px-2 py-1 bg-green-500/20 text-green-500 rounded text-xs font-bold">
                  {score}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-2">Worst 3 Games</h4>
            <div className="flex gap-2">
              {worst3.map((score, idx) => (
                <span key={idx} className="px-2 py-1 bg-red-500/20 text-red-500 rounded text-xs font-bold">
                  {score}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Consistency</h4>
            <span className="text-2xl font-bold text-primary">{consistency.toFixed(1)}%</span>
          </div>
        </Card>
      </div>

      {/* Role Notes & Premium Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h4 className="text-sm font-semibold mb-2">Role Notes</h4>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>CBA%: <span className="text-foreground">TBD</span></p>
            <p>TOG%: <span className="text-foreground">TBD</span></p>
            <p>Kick-ins: <span className="text-foreground">TBD</span></p>
          </div>
        </Card>

        <Card className="p-4 relative overflow-hidden min-h-[200px]">
          {!isPremium && (
            <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center z-10">
              <div className="text-center space-y-3 px-4">
                <Lock className="h-8 w-8 text-primary mx-auto" />
                <p className="text-sm font-semibold">Premium Analysis Locked</p>
                <Link to="/neeko-plus">
                  <Button size="sm" className="bg-primary text-primary-foreground">
                    Unlock with Neeko+
                  </Button>
                </Link>
              </div>
            </div>
          )}
          <h4 className="text-sm font-semibold mb-2">AI Premium Analysis</h4>
          <p className="text-xs text-muted-foreground">
            Advanced insights, matchup analysis, and strategic recommendations available with Neeko+.
          </p>
        </Card>
      </div>
    </div>
  );
};

export default PlayerExpandedRow;
