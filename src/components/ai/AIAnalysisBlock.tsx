import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerAnalysisCard } from "./PlayerAnalysisCard";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Player {
  rank: number;
  player_name: string;
  explanation: string;
  sparkline_data: number[];
  stat_value: string;
  stat_label: string;
  is_premium: boolean;
}

interface AIAnalysisBlockProps {
  title: string;
  players: Player[];
  isPremiumUser: boolean;
  isTrendingHot?: boolean;
}

export const AIAnalysisBlock = ({ 
  title, 
  players, 
  isPremiumUser,
  isTrendingHot = false 
}: AIAnalysisBlockProps) => {
  const navigate = useNavigate();
  
  // Parse sparkline data helper
  const parseSparkline = (data: number[] | string | any): number[] => {
    if (Array.isArray(data)) {
      return data.filter((n): n is number => typeof n === 'number' && !isNaN(n) && isFinite(n));
    }
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) 
          ? parsed.filter((n): n is number => typeof n === 'number' && !isNaN(n) && isFinite(n))
          : [];
      } catch {
        return [];
      }
    }
    return [];
  };
  
  // Ensure we always have exactly 10 player slots
  const allPlayers: Player[] = [];
  
  // Fill with real players
  for (let i = 0; i < 10; i++) {
    if (i < players.length) {
      allPlayers.push(players[i]);
    } else {
      // Create placeholder for missing players
      allPlayers.push({
        rank: i + 1,
        player_name: "Player TBA",
        explanation: "More insights coming soon. Upgrade to Neeko+ to get notified when new analysis is available.",
        sparkline_data: [50, 52, 48, 51, 49, 53, 50, 51],
        stat_value: "TBA",
        stat_label: "Coming Soon",
        is_premium: true,
      });
    }
  }
  
  // Split into free (top 4) and premium (bottom 6)
  const freePlayers = allPlayers.slice(0, 4);
  const premiumPlayers = allPlayers.slice(4, 10);
  const showPremiumBlur = !isPremiumUser;

  return (
    <Card className="overflow-hidden h-fit">
      <CardHeader className="bg-accent/5 py-2 px-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div>
          {freePlayers.map((player, index) => (
            <PlayerAnalysisCard
              key={`free-${index}`}
              playerName={player.player_name}
              explanation={player.explanation}
              sparklineData={parseSparkline(player.sparkline_data)}
              statValue={player.stat_value}
              statLabel={player.stat_label}
            />
          ))}
          
          {showPremiumBlur && (
            <div className="relative">
              <div className="blur-[2px] pointer-events-none">
                {premiumPlayers.map((player, index) => (
                  <PlayerAnalysisCard
                    key={`premium-${index}`}
                    playerName={player.player_name}
                    explanation={player.explanation}
                    sparklineData={parseSparkline(player.sparkline_data)}
                    statValue={player.stat_value}
                    statLabel={player.stat_label}
                    isBlurred={true}
                  />
                ))}
              </div>
              
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/95 backdrop-blur-[1px] z-10">
                <Lock className="w-8 h-8 text-primary mb-2" />
                <p className="text-sm font-semibold mb-1">Unlock Neeko+</p>
                <p className="text-[10px] text-muted-foreground mb-2">View all 10 players</p>
                <Button size="sm" className="h-7 text-xs px-3" onClick={() => { window.location.href = "https://www.neekostats.com.au/neeko-plus"; }}>
                  Upgrade
                </Button>
              </div>
            </div>
          )}
          
          {!showPremiumBlur && (
            <>
              {premiumPlayers.map((player, index) => (
                <PlayerAnalysisCard
                  key={`premium-unlocked-${index}`}
                  playerName={player.player_name}
                  explanation={player.explanation}
                  sparklineData={parseSparkline(player.sparkline_data)}
                  statValue={player.stat_value}
                  statLabel={player.stat_label}
                />
              ))}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};