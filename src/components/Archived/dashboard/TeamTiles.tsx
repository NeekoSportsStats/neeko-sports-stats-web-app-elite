import { Card } from "@/components/ui/card";
import { Activity, Target, TrendingUp, Users } from "lucide-react";

interface TeamTilesProps {
  teamStats: any[];
  players: any[];
  roundColumns: string[];
  statConfig?: {
    metric1: { title: string; statKey: string; };
    metric2: { title: string; statKey: string; };
    metric3: { title: string; statKey: string; };
    metric4: { title: string; statKey: string; };
  };
  playerField?: string;
  teamField?: string;
  isPlayerStats?: boolean;
}

const TeamTiles = ({ 
  teamStats, 
  players, 
  roundColumns,
  statConfig = {
    metric1: { title: "Avg Disposals / Game", statKey: "Disposals" },
    metric2: { title: "Avg Fantasy / Game", statKey: "Fantasy" },
    metric3: { title: "Efficiency %", statKey: "Efficiency" },
    metric4: { title: "Goals / Game", statKey: "Goals" }
  },
  playerField = 'Player',
  teamField = 'Team',
  isPlayerStats = false
}: TeamTilesProps) => {
  // Calculate league-wide averages
  const avgMetric1 = teamStats.length > 0
    ? teamStats.reduce((sum, t) => sum + t.avgScore, 0) / teamStats.length
    : 0;

  const avgMetric2 = teamStats.length > 0
    ? teamStats.reduce((sum, t) => sum + t.avgScore, 0) / teamStats.length
    : 0;

  const avgMetric3 = 73.5; // Placeholder

  const avgMetric4 = 5.2; // Placeholder

  // Top teams of Last 4 Rounds
  const last4Rounds = roundColumns.slice(-4);
  const topTeams = (() => {
    const teamScores = new Map<string, number>();
    
    players.forEach(player => {
      const team = player[teamField];
      if (!team) return;
      
      let totalScore = 0;
      last4Rounds.forEach(round => {
        // Try AFL format first (Fantasy_R1)
        let col = `${statConfig.metric2.statKey}_${round}`;
        let val = player[col];
        
        // If not found, try lowercase format (fantasy_score)
        if (val === undefined || val === null) {
          col = statConfig.metric2.statKey.toLowerCase();
          val = player[col];
        }
        
        if (typeof val === 'number') totalScore += val;
      });
      
      teamScores.set(team, (teamScores.get(team) || 0) + totalScore);
    });
    
    return Array.from(teamScores.entries())
      .map(([team, score]) => ({ team, totalScore: score }))
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 5);
  })();

  const TileCard = ({ icon: Icon, title, value, subtitle }: any) => (
    <Card className="p-4 bg-gradient-to-br from-card to-card/50 border-primary/20">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{title}</p>
          <p className="text-2xl font-bold text-primary">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <Icon className="h-8 w-8 text-primary/30" />
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <TileCard 
          icon={Activity}
          title={statConfig.metric1.title}
          value={avgMetric1.toFixed(1)}
          subtitle="League Average"
        />
        <TileCard 
          icon={Target}
          title={statConfig.metric2.title}
          value={avgMetric2.toFixed(1)}
          subtitle="League Average"
        />
        <TileCard 
          icon={TrendingUp}
          title={statConfig.metric3.title}
          value={`${avgMetric3}%`}
          subtitle="League Average"
        />
        <TileCard 
          icon={Users}
          title={statConfig.metric4.title}
          value={avgMetric4.toFixed(1)}
          subtitle="League Average"
        />
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          {isPlayerStats ? "Top Players of the Last 4 Rounds" : "Top Teams of the Last 4 Rounds"}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          {topTeams.map((item, idx) => (
            <div key={idx} className="p-3 bg-card/50 border border-primary/20 rounded-lg">
              <p className="font-semibold text-sm truncate">{item.team}</p>
              <p className="text-xs text-primary font-bold mt-1">{item.totalScore.toFixed(0)} pts</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default TeamTiles;
