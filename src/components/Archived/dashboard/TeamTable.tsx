import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

interface TeamTableProps {
  isPremium: boolean;
}

interface PlayerData {
  Player: string;
  Position: string;
  Team: string;
  [key: string]: string | number;
}

interface TeamStats {
  team: string;
  playerCount: number;
  avgScore: number;
  totalGames: number;
  totalScore: number;
  pctThreshold1: number;
  pctThreshold2: number;
  pctThreshold3: number;
  pctThreshold4: number;
  pctThreshold5: number;
  threshold1Label: string;
  threshold2Label: string;
  threshold3Label: string;
  threshold4Label: string;
  threshold5Label: string;
}

const TeamTable = ({ isPremium }: TeamTableProps) => {
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [selectedStat, setSelectedStat] = useState<string>("Fantasy");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('afl_team_stats')
        .select('*')
        .order('avg_fantasy_points', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        // Transform to match expected interface
        const transformedData = data.map((t: any) => ({
          ...t,
          Player: t.team,
          Team: t.team,
          Position: 'Team'
        }));
        setPlayers(transformedData);
        const allHeaders = Object.keys(data[0]);
        setHeaders(allHeaders);
      } else {
        toast({
          title: "No Data Available",
          description: "Team statistics are not available yet. Please contact an admin to refresh the data.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error fetching AFL stats:', error);
      toast({
        title: "Error Loading Stats",
        description: "Failed to load team statistics. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const { availableStats, roundColumns } = useMemo(() => {
    const stats = new Set<string>();
    const rounds: string[] = [];

    headers.forEach(header => {
      if (header.includes('_R') || header.includes('_Opening')) {
        const parts = header.split('_');
        if (parts.length >= 2) {
          stats.add(parts[0]);
          if (!rounds.includes(parts[1])) {
            rounds.push(parts[1]);
          }
        }
      }
    });

    rounds.sort((a, b) => {
      if (a === 'Opening') return -1;
      if (b === 'Opening') return 1;
      const numA = parseInt(a.replace('R', '').replace('FW', ''));
      const numB = parseInt(b.replace('R', '').replace('FW', ''));
      return numA - numB;
    });

    return {
      availableStats: Array.from(stats),
      roundColumns: rounds
    };
  }, [headers]);

  const teams = useMemo(() => {
    const uniqueTeams = [...new Set(players.map(p => p.Team))].filter(Boolean);
    return uniqueTeams.sort();
  }, [players]);

  // Aggregate team stats based on total team output per round
  const teamStats = useMemo(() => {
    const teamMap = new Map<string, {
      team: string;
      playerCount: Set<string>;
      roundTotals: Map<string, number>;
    }>();

    // Aggregate all player scores by team and round
    players.forEach(player => {
      if (!player.Team) return;

      if (!teamMap.has(player.Team)) {
        teamMap.set(player.Team, {
          team: player.Team,
          playerCount: new Set(),
          roundTotals: new Map(),
        });
      }

      const teamData = teamMap.get(player.Team)!;
      teamData.playerCount.add(player.Player);

      roundColumns.forEach(round => {
        const columnName = `${selectedStat}_${round}`;
        const value = player[columnName];
        if (typeof value === 'number' && !isNaN(value)) {
          const currentTotal = teamData.roundTotals.get(round) || 0;
          teamData.roundTotals.set(round, currentTotal + value);
        }
      });
    });

    // Calculate team statistics
    const result: TeamStats[] = [];
    teamMap.forEach(teamData => {
      const roundTotalArray = Array.from(teamData.roundTotals.values());
      const totalGames = roundTotalArray.length;
      const totalScore = roundTotalArray.reduce((sum, val) => sum + val, 0);
      const avgScore = totalGames > 0 ? totalScore / totalGames : 0;

      result.push({
        team: teamData.team,
        playerCount: teamData.playerCount.size,
        avgScore,
        totalGames,
        totalScore,
        pctThreshold1: 0,
        pctThreshold2: 0,
        pctThreshold3: 0,
        pctThreshold4: 0,
        pctThreshold5: 0,
        threshold1Label: '',
        threshold2Label: '',
        threshold3Label: '',
        threshold4Label: '',
        threshold5Label: '',
      });
    });

    return result.sort((a, b) => b.avgScore - a.avgScore);
  }, [players, roundColumns, selectedStat]);

  const filteredTeams = useMemo(() => {
    if (selectedTeam === "all") return teamStats;
    return teamStats.filter(t => t.team === selectedTeam);
  }, [teamStats, selectedTeam]);

  const getPercentageColor = (value: number) => {
    // Removed - no longer using percentage-based coloring
    return "";
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading team statistics...</div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Panel */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select value={selectedTeam} onValueChange={setSelectedTeam}>
            <SelectTrigger>
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border z-50 max-h-[300px]">
              <SelectItem value="all">All Teams</SelectItem>
              {teams.map(team => (
                <SelectItem key={team} value={team}>{team}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedStat} onValueChange={setSelectedStat}>
            <SelectTrigger className="border-primary/50 bg-primary/5">
              <SelectValue placeholder="Select Stat" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border z-50 max-h-[300px]">
              {availableStats.map(stat => (
                <SelectItem key={stat} value={stat}>{stat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Team Stats Table */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold mb-1">Team Statistics - {selectedStat}</h3>
            <p className="text-sm text-muted-foreground">
              Showing {filteredTeams.length} team{filteredTeams.length !== 1 ? 's' : ''}
            </p>
          </div>
          {!isPremium && (
            <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Link to="/neeko-plus">
                <Lock className="h-4 w-4 mr-2" />
                Get Neeko+
              </Link>
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-20">
              <TableRow>
                <TableHead className="sticky left-0 bg-card z-10 min-w-[130px] px-1.5 py-1.5 text-xs">Team</TableHead>
                <TableHead className="text-center min-w-[80px] px-1 py-1.5 text-xs">Players</TableHead>
                <TableHead className="text-center min-w-[85px] px-1 py-1.5 text-xs">Games</TableHead>
                <TableHead className="text-right min-w-[85px] px-1 py-1.5 text-xs">Total</TableHead>
                <TableHead className="text-right min-w-[85px] px-1 py-1.5 text-xs">Avg/Game</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTeams.slice(0, isPremium ? filteredTeams.length : Math.ceil(filteredTeams.length / 2)).map((team, index) => (
                <TableRow key={index} className="hover:bg-muted/50 h-8">
                  <TableCell className="font-bold sticky left-0 bg-card z-10 px-1.5 py-0.5 text-xs">{team.team}</TableCell>
                  <TableCell className="text-center font-mono px-1 py-0.5 text-xs">{team.playerCount}</TableCell>
                  <TableCell className="text-center font-mono px-1 py-0.5 text-xs">{team.totalGames}</TableCell>
                  <TableCell className="text-right font-mono font-semibold text-primary px-1 py-0.5 text-xs">
                    {team.totalScore?.toFixed(0)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold text-muted-foreground px-1 py-0.5 text-xs">
                    {team.avgScore.toFixed(1)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {!isPremium && filteredTeams.length > Math.ceil(filteredTeams.length / 2) && (
            <div className="relative">
              <div className="blur-[6px] pointer-events-none mt-2">
                <Table>
                  <TableBody>
                    {filteredTeams.slice(Math.ceil(filteredTeams.length / 2), Math.ceil(filteredTeams.length / 2) + 3).map((team, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-bold px-1.5 py-0.5 text-xs">{team.team}</TableCell>
                        <TableCell className="text-center px-1 py-0.5 text-xs">{team.playerCount}</TableCell>
                        <TableCell className="text-center px-1 py-0.5 text-xs">{team.totalGames}</TableCell>
                        <TableCell className="text-right px-1 py-0.5 text-xs">{team.totalScore?.toFixed(0)}</TableCell>
                        <TableCell className="text-right px-1 py-0.5 text-xs">{team.avgScore.toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              <div 
                className="relative h-[200px] pointer-events-none"
                style={{
                  background: 'linear-gradient(to bottom, rgba(19, 19, 19, 0) 0%, rgba(0, 0, 0, 0.9) 100%)'
                }}
              >
                <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
                  <div className="text-center p-6 max-w-md w-full">
                    <Lock className="h-12 w-12 text-primary mx-auto mb-3" />
                    <h4 className="text-xl font-bold mb-2">Unlock full table — Neeko+</h4>
                    <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold">
                      <Link to="/neeko-plus">Get Neeko+</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {filteredTeams.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No teams found matching your filters
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default TeamTable;
