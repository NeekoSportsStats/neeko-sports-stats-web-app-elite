export interface StatBoardTeamRow {
  team_id: number;
  team_name: string;
  season: number;
  week: number;
  season_avg: number | null;
  recent_avg_l5: number | null;
  recent_games_count: number | null;
  stat_family: string;
}
