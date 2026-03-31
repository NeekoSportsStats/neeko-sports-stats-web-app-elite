import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PlayerTable from "@/components/Archived/dashboard/PlayerTable";
import TeamTiles from "@/components/Archived/dashboard/TeamTiles";
import TopTeamRankings from "@/components/Archived/dashboard/TopTeamRankings";
import TeamComparison from "@/components/Archived/dashboard/TeamComparison";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

const NBAPlayers = () => {
  const navigate = useNavigate();
  const { isPremium } = useAuth();
  const [players, setPlayers] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStat, setSelectedStat] = useState<string>("Points");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data, error } = await supabase
        .from('nba_player_stats')
        .select('*')
        .order('points', { ascending: false })
        .limit(100);

      if (error) throw error;

      if (data && data.length > 0) {
        setPlayers(data);
        const allHeaders = Object.keys(data[0]);
        setHeaders(allHeaders);
      }
    } catch (error) {
      console.error('Error fetching NBA stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const roundColumns = useMemo(() => ['R1'], []);

  const teams = useMemo(() => {
    const uniquePlayers = players
      .map(p => p.player_firstname && p.player_lastname 
        ? `${p.player_firstname} ${p.player_lastname}`
        : null
      )
      .filter(Boolean);
    return [...new Set(uniquePlayers)].sort();
  }, [players]);

  const teamStats = useMemo(() => {
    const playerMap = new Map();
    players.forEach(player => {
      const playerName = player.player_firstname && player.player_lastname 
        ? `${player.player_firstname} ${player.player_lastname}`
        : "Unknown";
      if (!playerMap.has(playerName)) {
        playerMap.set(playerName, {
          player: playerName,
          avgScore: player.points || 0,
          totalScore: player.points || 0,
          totalGames: 1
        });
      }
    });

    return Array.from(playerMap.values()).sort((a, b) => b.avgScore - a.avgScore);
  }, [players]);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <Button
        variant="ghost"
        onClick={() => navigate("/sports/nba")}
        className="mb-4"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>
      <div>
        <h1 className="text-3xl md:text-4xl font-bold mb-2">NBA Player Stats</h1>
        <h3 className="text-lg text-muted-foreground">
          Live player metrics, trends & insights
        </h3>
      </div>

      {!loading && players.length > 0 && (
        <>
          <TeamTiles 
            teamStats={teamStats}
            players={players}
            roundColumns={roundColumns}
            playerField="player"
            teamField="team"
            isPlayerStats={true}
            statConfig={{
              metric1: { title: "Avg Rebounds / Game", statKey: "totreb" },
              metric2: { title: "Avg Points / Game", statKey: "points" },
              metric3: { title: "Avg Assists / Game", statKey: "assists" },
              metric4: { title: "Total Points", statKey: "points" }
            }}
          />

          <TopTeamRankings 
            teamStats={teamStats}
            players={players}
            roundColumns={roundColumns}
            teamField="team"
            isPlayerStats={true}
            statConfig={{
              stat1: { title: "Most Points", statKey: "points" },
              stat2: { title: "Most Rebounds", statKey: "totreb" },
              stat3: { title: "Most Assists", statKey: "assists" }
            }}
          />

          <TeamComparison 
            teams={teams}
            teamStats={teamStats}
            players={players}
            roundColumns={roundColumns}
            teamField="team"
            playerField="player"
            isPlayerStats={true}
            statConfig={{
              stats: [
                { label: "Avg Points", statKey: "points" },
                { label: "Avg Rebounds", statKey: "totreb" },
                { label: "Avg Assists", statKey: "assists" },
                { label: "Avg Steals", statKey: "steals" },
                { label: "Avg Blocks", statKey: "blocks" },
                { label: "Field Goal %", statKey: "fgp" }
              ]
            }}
          />
        </>
      )}

      <PlayerTable isPremium={isPremium} />
    </div>
  );
};

export default NBAPlayers;
