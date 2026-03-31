import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TeamTable from "@/components/Archived/dashboard/TeamTable";
import TeamTiles from "@/components/Archived/dashboard/TeamTiles";
import TeamComparison from "@/components/Archived/dashboard/TeamComparison";
import TopTeamRankings from "@/components/Archived/dashboard/TopTeamRankings";
import { supabase } from "@/lib/supabaseClient";

const EPLTeams = () => {
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
        .from('epl_team_stats')
        .select('*')
        .order('avg_goals', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        setPlayers(data);
      }
    } catch (error) {
      console.error('Error fetching EPL team stats:', error);
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
      avgScore: team.avg_goals || 0,
      totalGames: team.games_played || 0,
      totalScore: team.total_goals || 0,
    })).sort((a: any, b: any) => b.avgScore - a.avgScore);
  }, [players]);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <Button
        variant="ghost"
        onClick={() => navigate("/sports/epl")}
        className="mb-4"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>
      <div>
        <h1 className="text-3xl md:text-4xl font-bold mb-2">EPL Team Stats</h1>
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
              metric1: { title: "Avg Passes / Game", statKey: "avg_passes" },
              metric2: { title: "Avg Goals / Game", statKey: "avg_goals" },
              metric3: { title: "Avg Shots / Game", statKey: "avg_shots" },
              metric4: { title: "Total Goals", statKey: "total_goals" }
            }}
          />

          <TopTeamRankings 
            teamStats={teamStats}
            players={players}
            roundColumns={roundColumns}
            teamField="team"
            statConfig={{
              stat1: { title: "Most Goals", statKey: "total_goals" },
              stat2: { title: "Most Assists", statKey: "total_assists" },
              stat3: { title: "Most Shots", statKey: "total_shots" }
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
                { label: "Avg Goals", statKey: "avg_goals" },
                { label: "Avg Passes", statKey: "avg_passes" },
                { label: "Avg Shots", statKey: "avg_shots" },
                { label: "Total Tackles", statKey: "total_tackles" },
                { label: "Total Assists", statKey: "total_assists" }
              ]
            }}
          />
        </>
      )}

      <TeamTable isPremium={false} />
    </div>
  );
};

export default EPLTeams;
