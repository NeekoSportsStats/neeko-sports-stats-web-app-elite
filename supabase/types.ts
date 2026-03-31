export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      afl_fixtures: {
        Row: {
          away_team: string | null
          created_at: string | null
          crowd: string | null
          date: string | null
          home_team: string | null
          id: string
          result: string | null
          round: string | null
          updated_at: string | null
        }
        Insert: {
          away_team?: string | null
          created_at?: string | null
          crowd?: string | null
          date?: string | null
          home_team?: string | null
          id?: string
          result?: string | null
          round?: string | null
          updated_at?: string | null
        }
        Update: {
          away_team?: string | null
          created_at?: string | null
          crowd?: string | null
          date?: string | null
          home_team?: string | null
          id?: string
          result?: string | null
          round?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      afl_player_stats: {
        Row: {
          behinds: number | null
          center_bounce_attendance: number | null
          created_at: string | null
          disposals: number | null
          fantasy_points: number | null
          frees_against: number | null
          frees_for: number | null
          games_played: number | null
          goals: number | null
          handballs: number | null
          hitouts: number | null
          id: string
          kick_ins: number | null
          kick_ins_play_on: number | null
          kicks: number | null
          marks: number | null
          opponent: string | null
          player: string | null
          position: string | null
          round: string | null
          round_display: string | null
          round_label: string | null
          round_order: number | null
          round_sort_label: string | null
          ruck_contests: number | null
          super_coach_points: number | null
          tackles: number | null
          team: string | null
          time_on_ground: string | null
          updated_at: string | null
        }
        Insert: {
          behinds?: number | null
          center_bounce_attendance?: number | null
          created_at?: string | null
          disposals?: number | null
          fantasy_points?: number | null
          frees_against?: number | null
          frees_for?: number | null
          games_played?: number | null
          goals?: number | null
          handballs?: number | null
          hitouts?: number | null
          id?: string
          kick_ins?: number | null
          kick_ins_play_on?: number | null
          kicks?: number | null
          marks?: number | null
          opponent?: string | null
          player?: string | null
          position?: string | null
          round?: string | null
          round_display?: string | null
          round_label?: string | null
          round_order?: number | null
          round_sort_label?: string | null
          ruck_contests?: number | null
          super_coach_points?: number | null
          tackles?: number | null
          team?: string | null
          time_on_ground?: string | null
          updated_at?: string | null
        }
        Update: {
          behinds?: number | null
          center_bounce_attendance?: number | null
          created_at?: string | null
          disposals?: number | null
          fantasy_points?: number | null
          frees_against?: number | null
          frees_for?: number | null
          games_played?: number | null
          goals?: number | null
          handballs?: number | null
          hitouts?: number | null
          id?: string
          kick_ins?: number | null
          kick_ins_play_on?: number | null
          kicks?: number | null
          marks?: number | null
          opponent?: string | null
          player?: string | null
          position?: string | null
          round?: string | null
          round_display?: string | null
          round_label?: string | null
          round_order?: number | null
          round_sort_label?: string | null
          ruck_contests?: number | null
          super_coach_points?: number | null
          tackles?: number | null
          team?: string | null
          time_on_ground?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      afl_stats_cache: {
        Row: {
          data: Json
          fetched_at: string | null
          id: string
        }
        Insert: {
          data: Json
          fetched_at?: string | null
          id?: string
        }
        Update: {
          data?: Json
          fetched_at?: string | null
          id?: string
        }
        Relationships: []
      }
      afl_team_stats: {
        Row: {
          avg_disposals: number | null
          avg_fantasy_points: number | null
          avg_goals: number | null
          created_at: string | null
          games_played: number | null
          id: string
          player_count: number | null
          round: string | null
          team: string
          total_behinds: number | null
          total_disposals: number | null
          total_fantasy_points: number | null
          total_goals: number | null
          total_hitouts: number | null
          total_marks: number | null
          total_tackles: number | null
          updated_at: string | null
        }
        Insert: {
          avg_disposals?: number | null
          avg_fantasy_points?: number | null
          avg_goals?: number | null
          created_at?: string | null
          games_played?: number | null
          id?: string
          player_count?: number | null
          round?: string | null
          team: string
          total_behinds?: number | null
          total_disposals?: number | null
          total_fantasy_points?: number | null
          total_goals?: number | null
          total_hitouts?: number | null
          total_marks?: number | null
          total_tackles?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_disposals?: number | null
          avg_fantasy_points?: number | null
          avg_goals?: number | null
          created_at?: string | null
          games_played?: number | null
          id?: string
          player_count?: number | null
          round?: string | null
          team?: string
          total_behinds?: number | null
          total_disposals?: number | null
          total_fantasy_points?: number | null
          total_goals?: number | null
          total_hitouts?: number | null
          total_marks?: number | null
          total_tackles?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_afl_analysis: {
        Row: {
          block_title: string
          block_type: string
          created_at: string | null
          explanation: string
          id: string
          is_premium: boolean | null
          player_name: string | null
          rank: number | null
          round: string | null
          sparkline_data: Json | null
          stat_label: string | null
          stat_value: string | null
          team_name: string | null
          updated_at: string | null
        }
        Insert: {
          block_title: string
          block_type: string
          created_at?: string | null
          explanation: string
          id?: string
          is_premium?: boolean | null
          player_name?: string | null
          rank?: number | null
          round?: string | null
          sparkline_data?: Json | null
          stat_label?: string | null
          stat_value?: string | null
          team_name?: string | null
          updated_at?: string | null
        }
        Update: {
          block_title?: string
          block_type?: string
          created_at?: string | null
          explanation?: string
          id?: string
          is_premium?: boolean | null
          player_name?: string | null
          rank?: number | null
          round?: string | null
          sparkline_data?: Json | null
          stat_label?: string | null
          stat_value?: string | null
          team_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_analysis: {
        Row: {
          block_title: string
          block_type: string
          created_at: string | null
          explanation: string
          id: string
          is_premium: boolean | null
          player_id: string | null
          player_name: string
          rank: number
          sparkline_data: Json | null
          sport: string
          stat_label: string | null
          stat_value: string | null
          updated_at: string | null
        }
        Insert: {
          block_title: string
          block_type: string
          created_at?: string | null
          explanation: string
          id?: string
          is_premium?: boolean | null
          player_id?: string | null
          player_name: string
          rank: number
          sparkline_data?: Json | null
          sport?: string
          stat_label?: string | null
          stat_value?: string | null
          updated_at?: string | null
        }
        Update: {
          block_title?: string
          block_type?: string
          created_at?: string | null
          explanation?: string
          id?: string
          is_premium?: boolean | null
          player_id?: string | null
          player_name?: string
          rank?: number
          sparkline_data?: Json | null
          sport?: string
          stat_label?: string | null
          stat_value?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_analysis_queue: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          player_id: string
          sport: string
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          player_id: string
          sport: string
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          player_id?: string
          sport?: string
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      ai_epl_analysis: {
        Row: {
          block_title: string
          block_type: string
          created_at: string | null
          explanation: string
          id: string
          is_premium: boolean | null
          player_name: string | null
          rank: number | null
          round: string | null
          sparkline_data: Json | null
          stat_label: string | null
          stat_value: string | null
          team_name: string | null
          updated_at: string | null
        }
        Insert: {
          block_title: string
          block_type: string
          created_at?: string | null
          explanation: string
          id?: string
          is_premium?: boolean | null
          player_name?: string | null
          rank?: number | null
          round?: string | null
          sparkline_data?: Json | null
          stat_label?: string | null
          stat_value?: string | null
          team_name?: string | null
          updated_at?: string | null
        }
        Update: {
          block_title?: string
          block_type?: string
          created_at?: string | null
          explanation?: string
          id?: string
          is_premium?: boolean | null
          player_name?: string | null
          rank?: number | null
          round?: string | null
          sparkline_data?: Json | null
          stat_label?: string | null
          stat_value?: string | null
          team_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_insights: {
        Row: {
          block_title: string
          block_type: string
          created_at: string | null
          explanation: string
          id: string
          is_premium: boolean | null
          player: string
          rank: number | null
          sparkline: Json | null
          stats: Json | null
        }
        Insert: {
          block_title: string
          block_type: string
          created_at?: string | null
          explanation: string
          id?: string
          is_premium?: boolean | null
          player: string
          rank?: number | null
          sparkline?: Json | null
          stats?: Json | null
        }
        Update: {
          block_title?: string
          block_type?: string
          created_at?: string | null
          explanation?: string
          id?: string
          is_premium?: boolean | null
          player?: string
          rank?: number | null
          sparkline?: Json | null
          stats?: Json | null
        }
        Relationships: []
      }
      ai_insights_premium: {
        Row: {
          id: string
          premium_insights: Json
          sport: string
          updated_at: string
        }
        Insert: {
          id?: string
          premium_insights?: Json
          sport: string
          updated_at?: string
        }
        Update: {
          id?: string
          premium_insights?: Json
          sport?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_insights_public: {
        Row: {
          free_insights: Json
          id: string
          sport: string
          top_insights: Json
          updated_at: string
        }
        Insert: {
          free_insights?: Json
          id?: string
          sport: string
          top_insights?: Json
          updated_at?: string
        }
        Update: {
          free_insights?: Json
          id?: string
          sport?: string
          top_insights?: Json
          updated_at?: string
        }
        Relationships: []
      }
      ai_jobs_queue: {
        Row: {
          block_title: string
          block_type: string
          created_at: string | null
          error_message: string | null
          id: string
          player_data: Json
          player_id: string
          processed_at: string | null
          sport: string
          status: string
          updated_at: string | null
        }
        Insert: {
          block_title: string
          block_type: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          player_data: Json
          player_id: string
          processed_at?: string | null
          sport: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          block_title?: string
          block_type?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          player_data?: Json
          player_id?: string
          processed_at?: string | null
          sport?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_nba_analysis: {
        Row: {
          block_title: string
          block_type: string
          created_at: string | null
          explanation: string
          id: string
          is_premium: boolean | null
          player_name: string | null
          rank: number | null
          round: string | null
          sparkline_data: Json | null
          stat_label: string | null
          stat_value: string | null
          team_name: string | null
          updated_at: string | null
        }
        Insert: {
          block_title: string
          block_type: string
          created_at?: string | null
          explanation: string
          id?: string
          is_premium?: boolean | null
          player_name?: string | null
          rank?: number | null
          round?: string | null
          sparkline_data?: Json | null
          stat_label?: string | null
          stat_value?: string | null
          team_name?: string | null
          updated_at?: string | null
        }
        Update: {
          block_title?: string
          block_type?: string
          created_at?: string | null
          explanation?: string
          id?: string
          is_premium?: boolean | null
          player_name?: string | null
          rank?: number | null
          round?: string | null
          sparkline_data?: Json | null
          stat_label?: string | null
          stat_value?: string | null
          team_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      checkout_sessions: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          session_id: string
          used: boolean | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          session_id: string
          used?: boolean | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          session_id?: string
          used?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      epl_fixtures: {
        Row: {
          away_team: string | null
          away_team_id: string | null
          created_at: string | null
          date_edst: string | null
          fixture_id: string | null
          home_team: string | null
          home_team_id: string | null
          id: string
          processed: boolean | null
          round: string | null
          season: string | null
          status: string | null
          time_edst: string | null
          updated_at: string | null
        }
        Insert: {
          away_team?: string | null
          away_team_id?: string | null
          created_at?: string | null
          date_edst?: string | null
          fixture_id?: string | null
          home_team?: string | null
          home_team_id?: string | null
          id?: string
          processed?: boolean | null
          round?: string | null
          season?: string | null
          status?: string | null
          time_edst?: string | null
          updated_at?: string | null
        }
        Update: {
          away_team?: string | null
          away_team_id?: string | null
          created_at?: string | null
          date_edst?: string | null
          fixture_id?: string | null
          home_team?: string | null
          home_team_id?: string | null
          id?: string
          processed?: boolean | null
          round?: string | null
          season?: string | null
          status?: string | null
          time_edst?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      epl_player_stats: {
        Row: {
          cards_red: number | null
          cards_yellow: number | null
          column_1: string | null
          created_at: string | null
          dribbles_attempts: number | null
          dribbles_success: number | null
          duels_total: number | null
          duels_won: number | null
          fixture_id: string | null
          fouls_committed: number | null
          fouls_drawn: number | null
          goals_assists: number | null
          goals_conceded: number | null
          goals_saves: number | null
          goals_total: number | null
          id: string
          json_raw: Json | null
          minutes: string | null
          passes_accuracy: string | null
          passes_key: number | null
          passes_total: number | null
          penalty_committed: number | null
          penalty_missed: number | null
          penalty_saved: number | null
          penalty_scored: number | null
          penalty_won: number | null
          player_grid: string | null
          player_id: string | null
          player_name: string | null
          player_number: string | null
          player_pos: string | null
          rating: string | null
          shots_on: number | null
          shots_total: number | null
          tackles_blocks: number | null
          tackles_interceptions: number | null
          tackles_total: number | null
          team_id: string | null
          team_logo: string | null
          team_name: string | null
          updated_at: string | null
        }
        Insert: {
          cards_red?: number | null
          cards_yellow?: number | null
          column_1?: string | null
          created_at?: string | null
          dribbles_attempts?: number | null
          dribbles_success?: number | null
          duels_total?: number | null
          duels_won?: number | null
          fixture_id?: string | null
          fouls_committed?: number | null
          fouls_drawn?: number | null
          goals_assists?: number | null
          goals_conceded?: number | null
          goals_saves?: number | null
          goals_total?: number | null
          id?: string
          json_raw?: Json | null
          minutes?: string | null
          passes_accuracy?: string | null
          passes_key?: number | null
          passes_total?: number | null
          penalty_committed?: number | null
          penalty_missed?: number | null
          penalty_saved?: number | null
          penalty_scored?: number | null
          penalty_won?: number | null
          player_grid?: string | null
          player_id?: string | null
          player_name?: string | null
          player_number?: string | null
          player_pos?: string | null
          rating?: string | null
          shots_on?: number | null
          shots_total?: number | null
          tackles_blocks?: number | null
          tackles_interceptions?: number | null
          tackles_total?: number | null
          team_id?: string | null
          team_logo?: string | null
          team_name?: string | null
          updated_at?: string | null
        }
        Update: {
          cards_red?: number | null
          cards_yellow?: number | null
          column_1?: string | null
          created_at?: string | null
          dribbles_attempts?: number | null
          dribbles_success?: number | null
          duels_total?: number | null
          duels_won?: number | null
          fixture_id?: string | null
          fouls_committed?: number | null
          fouls_drawn?: number | null
          goals_assists?: number | null
          goals_conceded?: number | null
          goals_saves?: number | null
          goals_total?: number | null
          id?: string
          json_raw?: Json | null
          minutes?: string | null
          passes_accuracy?: string | null
          passes_key?: number | null
          passes_total?: number | null
          penalty_committed?: number | null
          penalty_missed?: number | null
          penalty_saved?: number | null
          penalty_scored?: number | null
          penalty_won?: number | null
          player_grid?: string | null
          player_id?: string | null
          player_name?: string | null
          player_number?: string | null
          player_pos?: string | null
          rating?: string | null
          shots_on?: number | null
          shots_total?: number | null
          tackles_blocks?: number | null
          tackles_interceptions?: number | null
          tackles_total?: number | null
          team_id?: string | null
          team_logo?: string | null
          team_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      epl_team_stats: {
        Row: {
          avg_goals: number | null
          avg_passes: number | null
          avg_shots: number | null
          created_at: string | null
          games_played: number | null
          id: string
          player_count: number | null
          round: string | null
          team: string
          total_assists: number | null
          total_goals: number | null
          total_passes: number | null
          total_shots: number | null
          total_tackles: number | null
          updated_at: string | null
        }
        Insert: {
          avg_goals?: number | null
          avg_passes?: number | null
          avg_shots?: number | null
          created_at?: string | null
          games_played?: number | null
          id?: string
          player_count?: number | null
          round?: string | null
          team: string
          total_assists?: number | null
          total_goals?: number | null
          total_passes?: number | null
          total_shots?: number | null
          total_tackles?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_goals?: number | null
          avg_passes?: number | null
          avg_shots?: number | null
          created_at?: string | null
          games_played?: number | null
          id?: string
          player_count?: number | null
          round?: string | null
          team?: string
          total_assists?: number | null
          total_goals?: number | null
          total_passes?: number | null
          total_shots?: number | null
          total_tackles?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      nba_fixtures: {
        Row: {
          away_team_id: string | null
          away_team_name: string | null
          column_1: string | null
          created_at: string | null
          date_edst: string | null
          game_id: string | null
          home_team_id: string | null
          home_team_name: string | null
          id: string
          season: string | null
          stage: string | null
          status: string | null
          time_edst: string | null
          updated_at: string | null
        }
        Insert: {
          away_team_id?: string | null
          away_team_name?: string | null
          column_1?: string | null
          created_at?: string | null
          date_edst?: string | null
          game_id?: string | null
          home_team_id?: string | null
          home_team_name?: string | null
          id?: string
          season?: string | null
          stage?: string | null
          status?: string | null
          time_edst?: string | null
          updated_at?: string | null
        }
        Update: {
          away_team_id?: string | null
          away_team_name?: string | null
          column_1?: string | null
          created_at?: string | null
          date_edst?: string | null
          game_id?: string | null
          home_team_id?: string | null
          home_team_name?: string | null
          id?: string
          season?: string | null
          stage?: string | null
          status?: string | null
          time_edst?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      nba_player_stats: {
        Row: {
          assists: number | null
          blocks: number | null
          comment: string | null
          created_at: string | null
          defreb: number | null
          fga: number | null
          fgm: number | null
          fgp: string | null
          fta: number | null
          ftm: number | null
          ftp: string | null
          game_id: string | null
          game_ref_id: string | null
          id: string
          min: string | null
          offreb: number | null
          pfouls: number | null
          player_firstname: string | null
          player_id: string | null
          player_lastname: string | null
          plusminus: string | null
          points: number | null
          pos: string | null
          raw_json: Json | null
          steals: number | null
          team_code: string | null
          team_id: string | null
          team_logo: string | null
          team_name: string | null
          team_nickname: string | null
          totreb: number | null
          tpa: number | null
          tpm: number | null
          tpp: string | null
          turnovers: number | null
          updated_at: string | null
        }
        Insert: {
          assists?: number | null
          blocks?: number | null
          comment?: string | null
          created_at?: string | null
          defreb?: number | null
          fga?: number | null
          fgm?: number | null
          fgp?: string | null
          fta?: number | null
          ftm?: number | null
          ftp?: string | null
          game_id?: string | null
          game_ref_id?: string | null
          id?: string
          min?: string | null
          offreb?: number | null
          pfouls?: number | null
          player_firstname?: string | null
          player_id?: string | null
          player_lastname?: string | null
          plusminus?: string | null
          points?: number | null
          pos?: string | null
          raw_json?: Json | null
          steals?: number | null
          team_code?: string | null
          team_id?: string | null
          team_logo?: string | null
          team_name?: string | null
          team_nickname?: string | null
          totreb?: number | null
          tpa?: number | null
          tpm?: number | null
          tpp?: string | null
          turnovers?: number | null
          updated_at?: string | null
        }
        Update: {
          assists?: number | null
          blocks?: number | null
          comment?: string | null
          created_at?: string | null
          defreb?: number | null
          fga?: number | null
          fgm?: number | null
          fgp?: string | null
          fta?: number | null
          ftm?: number | null
          ftp?: string | null
          game_id?: string | null
          game_ref_id?: string | null
          id?: string
          min?: string | null
          offreb?: number | null
          pfouls?: number | null
          player_firstname?: string | null
          player_id?: string | null
          player_lastname?: string | null
          plusminus?: string | null
          points?: number | null
          pos?: string | null
          raw_json?: Json | null
          steals?: number | null
          team_code?: string | null
          team_id?: string | null
          team_logo?: string | null
          team_name?: string | null
          team_nickname?: string | null
          totreb?: number | null
          tpa?: number | null
          tpm?: number | null
          tpp?: string | null
          turnovers?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      nba_team_stats: {
        Row: {
          avg_assists: number | null
          avg_points: number | null
          avg_rebounds: number | null
          created_at: string | null
          games_played: number | null
          id: string
          player_count: number | null
          round: string | null
          team: string
          total_assists: number | null
          total_blocks: number | null
          total_points: number | null
          total_rebounds: number | null
          total_steals: number | null
          updated_at: string | null
        }
        Insert: {
          avg_assists?: number | null
          avg_points?: number | null
          avg_rebounds?: number | null
          created_at?: string | null
          games_played?: number | null
          id?: string
          player_count?: number | null
          round?: string | null
          team: string
          total_assists?: number | null
          total_blocks?: number | null
          total_points?: number | null
          total_rebounds?: number | null
          total_steals?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_assists?: number | null
          avg_points?: number | null
          avg_rebounds?: number | null
          created_at?: string | null
          games_played?: number | null
          id?: string
          player_count?: number | null
          round?: string | null
          team?: string
          total_assists?: number | null
          total_blocks?: number | null
          total_points?: number | null
          total_rebounds?: number | null
          total_steals?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      nrl_matches: {
        Row: {
          away_score: number | null
          away_team: string
          home_score: number | null
          home_team: string
          id: string
          match_date: string | null
          round: number
          updated_at: string | null
          venue: string | null
        }
        Insert: {
          away_score?: number | null
          away_team: string
          home_score?: number | null
          home_team: string
          id?: string
          match_date?: string | null
          round: number
          updated_at?: string | null
          venue?: string | null
        }
        Update: {
          away_score?: number | null
          away_team?: string
          home_score?: number | null
          home_team?: string
          id?: string
          match_date?: string | null
          round?: number
          updated_at?: string | null
          venue?: string | null
        }
        Relationships: []
      }
      nrl_stats: {
        Row: {
          fantasy_score: number | null
          id: string
          linebreaks: number | null
          player: string
          round: number | null
          running_metres: number | null
          tackles: number | null
          team: string | null
          tries: number | null
          try_assists: number | null
          updated_at: string | null
        }
        Insert: {
          fantasy_score?: number | null
          id?: string
          linebreaks?: number | null
          player: string
          round?: number | null
          running_metres?: number | null
          tackles?: number | null
          team?: string | null
          tries?: number | null
          try_assists?: number | null
          updated_at?: string | null
        }
        Update: {
          fantasy_score?: number | null
          id?: string
          linebreaks?: number | null
          player?: string
          round?: number | null
          running_metres?: number | null
          tackles?: number | null
          team?: string | null
          tries?: number | null
          try_assists?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          billing_period_end: string | null
          billing_period_start: string | null
          created_at: string | null
          email: string | null
          id: string
          premium_expires_at: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          updated_at: string | null
        }
        Insert: {
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string | null
          email?: string | null
          id: string
          premium_expires_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          premium_expires_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      stripe_customers: {
        Row: {
          created_at: string | null
          customer_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          created_at: string | null
          data: Json
          event_id: string
          id: string
          type: string
        }
        Insert: {
          created_at?: string | null
          data: Json
          event_id: string
          id?: string
          type: string
        }
        Update: {
          created_at?: string | null
          data?: Json
          event_id?: string
          id?: string
          type?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string | null
          current_period_end: string
          id: string
          price_id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_period_end: string
          id: string
          price_id: string
          status: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_period_end?: string
          id?: string
          price_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          completed_at: string | null
          duration_seconds: number | null
          error_details: Json | null
          error_message: string | null
          id: string
          metadata: Json | null
          operation: string
          records_inserted: number | null
          records_processed: number | null
          records_updated: number | null
          sport: string | null
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          duration_seconds?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          operation: string
          records_inserted?: number | null
          records_processed?: number | null
          records_updated?: number | null
          sport?: string | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          duration_seconds?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          operation?: string
          records_inserted?: number | null
          records_processed?: number | null
          records_updated?: number | null
          sport?: string | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      system_locks: {
        Row: {
          locked: boolean
          locked_at: string | null
          locked_by: string | null
          operation: string
          updated_at: string
        }
        Insert: {
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          operation: string
          updated_at?: string
        }
        Update: {
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          operation?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      ai_queue_performance_view: {
        Row: {
          avg_generation_time_seconds: number | null
          sport: string | null
        }
        Relationships: []
      }
      ai_queue_progress_view: {
        Row: {
          completion_percent: number | null
          sport: string | null
        }
        Relationships: []
      }
      ai_queue_status_view: {
        Row: {
          done: number | null
          failed: number | null
          pending: number | null
          processing: number | null
          sport: string | null
          total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "premium"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "premium"],
    },
  },
} as const
