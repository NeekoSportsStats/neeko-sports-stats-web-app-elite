import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TeamTable from "@/components/Archived/dashboard/TeamTable";
import TeamTiles from "@/components/Archived/dashboard/TeamTiles";
import TeamComparison from "@/components/Archived/dashboard/TeamComparison";
import TopTeamRankings from "@/components/Archived/dashboard/TopTeamRankings";
import { supabase } from "@/lib/supabaseClient";

const NBATeams = () => {
  const navigate = useNavigate();
  const [players, setPlayers] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data, error } = await supabase
        .from('nba_team_stats')
        .select('*')
        .order('avg_points', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        setPlayers(data);
      }
    } catch (error) {
      console.error('Error fetching NBA team stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const roundColumns = useMemo(() => {
    const rounds = [...new Set(players.map((p: any) => p.round))].filter(Boolean);
    return rounds.sort();
  }, [players]);

  const teams = useMemo(() => {
    const uniqueTeams = [...new Set(players.map((p: any) => p.team))].filter(Boolean);
    return uniqueTeams.sort();
  }, [players]);

  const teamStats = useMemo(() => {
    return players.map((team: any) => ({
      team: team.team,
      playerCount: team.player_count || 0,
      avgScore: team.avg_points || 0,
      totalGames: team.games_played || 0,
      totalScore: team.total_points || 0,
    })).sort((a: any, b: any) => b.avgScore - a.avgScore);
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
        <h1 className="text-3xl md:text-4xl font-bold mb-2">NBA Team Stats</h1>
        <h3 className="text-lg text-muted-foreground">
          View team performance, % splits, averages, and advanced markers
        </h3>
      </div>

      {!loading && players.length > 0 && (
        <>
          <TeamTiles 
            teamStats={teamStats}
            players={players}
            roundColumns={roundColumns}
            playerField="team"
            teamField="team"
            statConfig={{
              metric1: { title: "Avg Rebounds / Game", statKey: "avg_rebounds" },
              metric2: { title: "Avg Points / Game", statKey: "avg_points" },
              metric3: { title: "Avg Assists / Game", statKey: "avg_assists" },
              metric4: { title: "Total Points", statKey: "total_points" }
            }}
          />

          <TopTeamRankings 
            teamStats={teamStats}
            players={players}
            roundColumns={roundColumns}
            teamField="team"
            statConfig={{
              stat1: { title: "Most Points", statKey: "total_points" },
              stat2: { title: "Most Rebounds", statKey: "total_rebounds" },
              stat3: { title: "Most Assists", statKey: "total_assists" }
            }}
          />

          <TeamComparison 
            teams={teams}
            teamStats={teamStats}
            players={players}
            roundColumns={roundColumns}
            teamField="team"
            playerField="team"
            statConfig={{
              stats: [
                { label: "Avg Points", statKey: "avg_points" },
                { label: "Avg Rebounds", statKey: "avg_rebounds" },
                { label: "Avg Assists", statKey: "avg_assists" },
                { label: "Total Steals", statKey: "total_steals" },
                { label: "Total Blocks", statKey: "total_blocks" }
              ]
            }}
          />
        </>
      )}

      <TeamTable isPremium={false} />
    </div>
  );
};

export default NBATeams;
