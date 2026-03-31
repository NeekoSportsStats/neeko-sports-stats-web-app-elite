import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Shield, Zap } from "lucide-react";

interface TopInsightsProps {
  sport: "AFL" | "EPL" | "NBA";
}

const TopInsights = ({ sport }: TopInsightsProps) => {
  const insights = {
    AFL: {
      hotPlayers: [
        { name: "Nick Daicos", stat: "+32% disposals", trend: "up" },
        { name: "Marcus Bontempelli", stat: "+28% clearances", trend: "up" },
        { name: "Christian Petracca", stat: "+25% contested possessions", trend: "up" },
        { name: "Lachie Neale", stat: "+22% fantasy avg", trend: "up" },
        { name: "Patrick Cripps", stat: "+19% inside 50s", trend: "up" },
        { name: "Zak Butters", stat: "+18% tackles", trend: "up" },
        { name: "Noah Anderson", stat: "+17% marks", trend: "up" },
        { name: "Errol Gulden", stat: "+16% efficiency", trend: "up" },
        { name: "Sam Walsh", stat: "+15% scoring output", trend: "up" },
        { name: "Caleb Serong", stat: "+14% goal assists", trend: "up" }
      ],
      coldPlayers: [
        { name: "Forward X", stat: "0.5 goals/game", trend: "down" },
        { name: "Midfielder Y", stat: "-18% disposals", trend: "down" },
        { name: "Defender Z", stat: "-15% intercepts", trend: "down" },
        { name: "Ruck A", stat: "-12% hitouts", trend: "down" },
        { name: "Forward B", stat: "-10% marks", trend: "down" },
        { name: "Mid C", stat: "-9% clearances", trend: "down" },
        { name: "Defender D", stat: "-8% rebound 50s", trend: "down" },
        { name: "Forward E", stat: "-7% goals", trend: "down" },
        { name: "Mid F", stat: "-6% tackles", trend: "down" },
        { name: "Ruck G", stat: "-5% contested marks", trend: "down" }
      ],
      trendingTeams: [
        { name: "Melbourne", stat: "+15 contested possessions/game" },
        { name: "Collingwood", stat: "+12 inside 50s/game" },
        { name: "Brisbane", stat: "+10 clearances/game" }
      ]
    },
    EPL: {
      hotPlayers: [
        { name: "Erling Haaland", stat: "+35% goals scored", trend: "up" },
        { name: "Mohamed Salah", stat: "+28% assists", trend: "up" },
        { name: "Bruno Fernandes", stat: "+25% chances created", trend: "up" },
        { name: "Bukayo Saka", stat: "+22% dribbles completed", trend: "up" },
        { name: "Kevin De Bruyne", stat: "+20% passes completed", trend: "up" },
        { name: "Harry Kane", stat: "+18% shots on target", trend: "up" },
        { name: "Martin Ødegaard", stat: "+17% key passes", trend: "up" },
        { name: "Phil Foden", stat: "+15% fantasy avg", trend: "up" },
        { name: "Heung-Min Son", stat: "+14% goal involvement", trend: "up" },
        { name: "James Maddison", stat: "+13% progressive passes", trend: "up" }
      ],
      coldPlayers: [
        { name: "Striker X", stat: "-12% goals", trend: "down" },
        { name: "Midfielder Y", stat: "-10% assists", trend: "down" },
        { name: "Defender Z", stat: "-9% tackles", trend: "down" },
        { name: "Winger A", stat: "-8% crosses", trend: "down" },
        { name: "Forward B", stat: "-7% shots", trend: "down" },
        { name: "Mid C", stat: "-6% passes", trend: "down" },
        { name: "Defender D", stat: "-5% clearances", trend: "down" },
        { name: "Forward E", stat: "-4% touches", trend: "down" },
        { name: "Mid F", stat: "-3% dribbles", trend: "down" },
        { name: "Winger G", stat: "-2% duels won", trend: "down" }
      ],
      trendingTeams: [
        { name: "Manchester City", stat: "+12 goals/game" },
        { name: "Arsenal", stat: "+10 clean sheets" },
        { name: "Liverpool", stat: "+8 possession %" }
      ]
    },
    NBA: {
      hotPlayers: [
        { name: "Nikola Jokic", stat: "+30% triple-doubles", trend: "up" },
        { name: "Luka Doncic", stat: "+28% assists", trend: "up" },
        { name: "Giannis Antetokounmpo", stat: "+25% points", trend: "up" },
        { name: "Joel Embiid", stat: "+22% rebounds", trend: "up" },
        { name: "Stephen Curry", stat: "+20% 3-pointers", trend: "up" },
        { name: "LeBron James", stat: "+18% fantasy avg", trend: "up" },
        { name: "Kevin Durant", stat: "+17% FG%", trend: "up" },
        { name: "Damian Lillard", stat: "+15% points/game", trend: "up" },
        { name: "Anthony Davis", stat: "+14% blocks", trend: "up" },
        { name: "Jayson Tatum", stat: "+13% efficiency", trend: "up" }
      ],
      coldPlayers: [
        { name: "Player A", stat: "-10% FG%", trend: "down" },
        { name: "Player B", stat: "-9% points", trend: "down" },
        { name: "Player C", stat: "-8% rebounds", trend: "down" },
        { name: "Player D", stat: "-7% assists", trend: "down" },
        { name: "Player E", stat: "-6% 3PT%", trend: "down" },
        { name: "Player F", stat: "-5% steals", trend: "down" },
        { name: "Player G", stat: "-4% blocks", trend: "down" },
        { name: "Player H", stat: "-3% minutes", trend: "down" },
        { name: "Player I", stat: "-2% efficiency", trend: "down" },
        { name: "Player J", stat: "-1% fantasy", trend: "down" }
      ],
      trendingTeams: [
        { name: "Denver Nuggets", stat: "+15 assists/game" },
        { name: "Boston Celtics", stat: "+12 3-pointers/game" },
        { name: "Milwaukee Bucks", stat: "+10 rebounds/game" }
      ]
    }
  };

  const sportData = insights[sport];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-4">Top Insights</h2>
        <p className="text-muted-foreground mb-6">
          Real-time analysis of player performance trends and team momentum
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Top 10 Hot Players */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-green-500" />
            <h3 className="text-lg font-bold">Top 10 Hot Players</h3>
          </div>
          <div className="space-y-2">
            {sportData.hotPlayers.map((player, index) => (
              <div key={index} className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm">
                <span className="font-semibold">{player.name}</span>
                <span className="text-green-500 font-bold text-xs">{player.stat}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Top 10 Cold Players */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="h-5 w-5 text-red-500" />
            <h3 className="text-lg font-bold">Top 10 Cold Players</h3>
          </div>
          <div className="space-y-2">
            {sportData.coldPlayers.map((player, index) => (
              <div key={index} className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm">
                <span className="font-semibold">{player.name}</span>
                <span className="text-red-500 font-bold text-xs">{player.stat}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Trending Teams */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold">Trending Teams</h3>
          </div>
          <div className="space-y-2">
            {sportData.trendingTeams.map((team, index) => (
              <div key={index} className="p-3 rounded bg-muted/30">
                <div className="font-bold text-sm mb-1">{team.name}</div>
                <div className="text-xs text-primary">{team.stat}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 p-4 rounded bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-primary" />
              <h4 className="font-bold text-sm">Key Momentum Shifts</h4>
            </div>
            <p className="text-xs text-muted-foreground">
              These teams show statistical improvement across multiple performance categories over the last 4-6 rounds
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default TopInsights;
