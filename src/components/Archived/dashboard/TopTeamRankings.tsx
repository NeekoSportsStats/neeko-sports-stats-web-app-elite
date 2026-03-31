import { Card } from "@/components/ui/card";
import { Trophy } from "lucide-react";

interface TopTeamRankingsProps {
  teamStats: any[];
  players: any[];
  roundColumns: string[];
  statConfig?: {
    stat1: { title: string; statKey: string; };
    stat2: { title: string; statKey: string; };
    stat3: { title: string; statKey: string; };
  };
  teamField?: string;
  isPlayerStats?: boolean;
}

const TopTeamRankings = ({ 
  teamStats, 
  players, 
  roundColumns,
  statConfig = {
    stat1: { title: "Most Fantasy", statKey: "Fantasy" },
    stat2: { title: "Most Disposals", statKey: "Disposals" },
    stat3: { title: "Most Goals", statKey: "Goals" }
  },
  teamField = 'Team',
  isPlayerStats = false
}: TopTeamRankingsProps) => {
  const calculateRankings = (stat: string) => {
    if (isPlayerStats) {
      // For player stats, rank individual players
      return players
        .map(player => {
          let total = 0;
          roundColumns.forEach(round => {
            // Try AFL format first
            let col = `${stat}_${round}`;
            let val = player[col];
            
            // If not found, try lowercase direct field
            if (val === undefined || val === null) {
              col = stat.toLowerCase();
              val = player[col];
            }
            
            if (typeof val === 'number') total += val;
          });
          return { 
            name: player[teamField === 'Team' ? 'Player' : 'player'] || 'Unknown',
            value: (total / Math.max(roundColumns.length, 1)).toFixed(1) 
          };
        })
        .sort((a, b) => parseFloat(b.value) - parseFloat(a.value))
        .slice(0, 5);
    } else {
      // For team stats, aggregate by team
      const teamTotals = new Map<string, number>();

      players.forEach(player => {
        const team = player[teamField];
        if (!team) return;
        
        let total = 0;
        roundColumns.forEach(round => {
          // Try AFL format first
          let col = `${stat}_${round}`;
          let val = player[col];
          
          // If not found, try lowercase direct field
          if (val === undefined || val === null) {
            col = stat.toLowerCase();
            val = player[col];
          }
          
          if (typeof val === 'number') total += val;
        });

        teamTotals.set(team, (teamTotals.get(team) || 0) + total);
      });

      return Array.from(teamTotals.entries())
        .map(([name, total]) => ({ 
          name, 
          value: (total / Math.max(roundColumns.length, 1)).toFixed(1) 
        }))
        .sort((a, b) => parseFloat(b.value) - parseFloat(a.value))
        .slice(0, 5);
    }
  };

  const ranking1 = calculateRankings(statConfig.stat1.statKey);
  const ranking2 = calculateRankings(statConfig.stat2.statKey);
  const ranking3 = calculateRankings(statConfig.stat3.statKey);

  const RankingCard = ({ title, rankings }: any) => (
    <Card className="p-4 bg-gradient-to-br from-card to-card/50 border-primary/20">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="h-5 w-5 text-primary" />
        <h4 className="font-semibold text-sm">{title}</h4>
      </div>
      <div className="space-y-2">
        {rankings.map((item: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-bold">#{idx + 1}</span>
              <span className="font-medium truncate">{item.name}</span>
            </div>
            <span className="font-bold text-primary">{item.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <RankingCard title={statConfig.stat1.title} rankings={ranking1} />
      <RankingCard title={statConfig.stat2.title} rankings={ranking2} />
      <RankingCard title={statConfig.stat3.title} rankings={ranking3} />
    </div>
  );
};

export default TopTeamRankings;
