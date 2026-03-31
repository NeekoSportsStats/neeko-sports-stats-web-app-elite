import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight } from "lucide-react";

interface TeamComparisonProps {
  teams: string[];
  teamStats: any[];
  players: any[];
  roundColumns: string[];
  statConfig?: {
    stats: Array<{ label: string; statKey: string; }>;
  };
  teamField?: string;
  playerField?: string;
  isPlayerStats?: boolean;
}

const TeamComparison = ({ 
  teams, 
  teamStats, 
  players, 
  roundColumns,
  statConfig = {
    stats: [
      { label: "Avg Fantasy", statKey: "Fantasy" },
      { label: "Avg Disposals", statKey: "Disposals" },
      { label: "Avg Goals", statKey: "Goals" },
      { label: "Clearances", statKey: "Clearances" },
      { label: "Inside 50s", statKey: "Inside50s" },
      { label: "Contested Poss", statKey: "ContestedPoss" },
      { label: "Efficiency %", statKey: "Efficiency" },
      { label: "Defense", statKey: "Defense" }
    ]
  },
  teamField = 'Team',
  playerField = 'Player',
  isPlayerStats = false
}: TeamComparisonProps) => {
  const [entityA, setEntityA] = useState<string>("");
  const [entityB, setEntityB] = useState<string>("");

  const getMetrics = (name: string) => {
    const items = isPlayerStats 
      ? players.filter(p => p[playerField] === name)
      : players.filter(p => p[teamField] === name);

    const metrics: any = {};
    
    statConfig.stats.forEach(({ label, statKey }) => {
      let total = 0;
      let count = 0;

      items.forEach(item => {
        roundColumns.forEach(round => {
          // Try AFL format first
          let col = `${statKey}_${round}`;
          let val = item[col];
          
          // If not found, try lowercase direct field
          if (val === undefined || val === null) {
            col = statKey.toLowerCase();
            val = item[col];
          }

          if (typeof val === 'number') {
            total += val;
            count++;
          }
        });
      });

      metrics[statKey] = count > 0 ? (total / Math.max(roundColumns.length, 1)).toFixed(1) : 'TBD';
    });

    return metrics;
  };

  const metricsA = entityA ? getMetrics(entityA) : null;
  const metricsB = entityB ? getMetrics(entityB) : null;

  const MetricRow = ({ label, valueA, valueB }: any) => (
    <div className="flex items-center justify-between py-2 border-b border-border/50">
      <div className="flex-1 text-right">
        <span className="text-sm font-bold text-primary">{valueA || '-'}</span>
      </div>
      <div className="flex-1 text-center">
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="flex-1 text-left">
        <span className="text-sm font-bold text-primary">{valueB || '-'}</span>
      </div>
    </div>
  );

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">
        {isPlayerStats ? "Player Comparison" : "Team Comparison"}
      </h3>
      
      <div className="grid grid-cols-3 gap-4 mb-6 items-center">
        <Select value={entityA} onValueChange={setEntityA}>
          <SelectTrigger>
            <SelectValue placeholder={isPlayerStats ? "Select Player A" : "Select Team A"} />
          </SelectTrigger>
          <SelectContent className="bg-card border-border z-50">
            {teams.map(team => (
              <SelectItem key={team} value={team}>{team}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex justify-center">
          <ArrowRight className="h-6 w-6 text-primary" />
        </div>

        <Select value={entityB} onValueChange={setEntityB}>
          <SelectTrigger>
            <SelectValue placeholder={isPlayerStats ? "Select Player B" : "Select Team B"} />
          </SelectTrigger>
          <SelectContent className="bg-card border-border z-50">
            {teams.map(team => (
              <SelectItem key={team} value={team}>{team}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {metricsA && metricsB ? (
        <div className="space-y-1">
          {statConfig.stats.map(({ label, statKey }) => (
            <MetricRow 
              key={statKey}
              label={label} 
              valueA={metricsA[statKey]} 
              valueB={metricsB[statKey]} 
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {isPlayerStats 
            ? "Select two players to compare their stats"
            : "Select two teams to compare their stats"}
        </div>
      )}
    </Card>
  );
};

export default TeamComparison;
