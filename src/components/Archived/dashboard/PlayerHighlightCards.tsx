import { Card } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

interface PlayerData {
  [key: string]: string | number | any;
}

interface StatConfig {
  title: string;
  statKey: string;
}

interface PlayerHighlightCardsProps {
  players: PlayerData[];
  selectedStat: string;
  roundColumns: string[];
  playerField?: string;
  teamField?: string;
  statConfigs?: StatConfig[];
}

const PlayerHighlightCards = ({ 
  players, 
  selectedStat, 
  roundColumns,
  playerField = 'Player',
  teamField = 'Team',
  statConfigs = [
    { title: 'Top Fantasy', statKey: 'Fantasy' },
    { title: 'Top Goals', statKey: 'Goals' },
    { title: 'Top Disposals', statKey: 'Disposals' }
  ]
}: PlayerHighlightCardsProps) => {
  const getCurrentRound = () => roundColumns[roundColumns.length - 1] || 'R1';
  const currentRound = getCurrentRound();

  const getTopPlayersForStat = (stat: string, limit: number = 5) => {
    return [...players]
      .map(p => {
        // Try round-specific column first (AFL format: Fantasy_R1)
        let columnName = `${stat}_${currentRound}`;
        let score = typeof p[columnName] === 'number' ? p[columnName] : undefined;
        
        // If not found, try without round suffix (EPL/NBA format: fantasy_score)
        if (score === undefined) {
          score = typeof p[stat] === 'number' ? p[stat] : 0;
        }
        
        return { ...p, currentScore: score };
      })
      .filter(p => p.currentScore > 0)
      .sort((a, b) => b.currentScore - a.currentScore)
      .slice(0, limit);
  };

  const StatCard = ({ title, players, stat }: { title: string; players: any[]; stat: string }) => (
    <Card className="p-4 bg-card/50 border-primary/20">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <div className="space-y-2">
        {players.map((player, idx) => (
          <div key={idx} className="flex items-center justify-between text-xs">
            <div className="flex-1 truncate">
              <span className="text-muted-foreground mr-1">#{idx + 1}</span>
              <span className="font-medium">{player[playerField]}</span>
              <span className="text-muted-foreground ml-1">({player[teamField]})</span>
            </div>
            <span className="font-bold text-primary ml-2">{player.currentScore}</span>
          </div>
        ))}
      </div>
    </Card>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {statConfigs.map((config, idx) => {
        const topPlayers = getTopPlayersForStat(config.statKey, 5);
        return (
          <StatCard 
            key={idx}
            title={config.title} 
            players={topPlayers} 
            stat={config.statKey} 
          />
        );
      })}
    </div>
  );
};

export default PlayerHighlightCards;
