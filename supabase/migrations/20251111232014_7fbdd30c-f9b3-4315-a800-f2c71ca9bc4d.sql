-- Drop old tables
DROP TABLE IF EXISTS afl_stats CASCADE;
DROP TABLE IF EXISTS afl_matches CASCADE;
DROP TABLE IF EXISTS epl_stats CASCADE;
DROP TABLE IF EXISTS epl_matches CASCADE;
DROP TABLE IF EXISTS nba_stats CASCADE;
DROP TABLE IF EXISTS nba_matches CASCADE;

-- Create AFL Fixtures table
CREATE TABLE IF NOT EXISTS public.afl_fixtures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round TEXT,
  date TEXT,
  home_team TEXT,
  away_team TEXT,
  crowd TEXT,
  result TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create AFL Player Stats table
CREATE TABLE IF NOT EXISTS public.afl_player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player TEXT,
  position TEXT,
  team TEXT,
  opponent TEXT,
  disposals INTEGER,
  kicks INTEGER,
  handballs INTEGER,
  marks INTEGER,
  tackles INTEGER,
  frees_for INTEGER,
  frees_against INTEGER,
  hitouts INTEGER,
  goals INTEGER,
  behinds INTEGER,
  ruck_contests INTEGER,
  center_bounce_attendance INTEGER,
  kick_ins INTEGER,
  kick_ins_play_on INTEGER,
  time_on_ground TEXT,
  fantasy_points INTEGER,
  super_coach_points INTEGER,
  games_played INTEGER,
  round TEXT,
  round_order INTEGER,
  round_label TEXT,
  round_sort_label TEXT,
  round_display TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create EPL Fixtures table
CREATE TABLE IF NOT EXISTS public.epl_fixtures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id TEXT UNIQUE,
  date_edst TEXT,
  time_edst TEXT,
  status TEXT,
  season TEXT,
  round TEXT,
  home_team_id TEXT,
  home_team TEXT,
  away_team_id TEXT,
  away_team TEXT,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create EPL Player Stats table
CREATE TABLE IF NOT EXISTS public.epl_player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id TEXT,
  team_id TEXT,
  team_name TEXT,
  team_logo TEXT,
  player_id TEXT,
  player_name TEXT,
  player_number TEXT,
  player_pos TEXT,
  player_grid TEXT,
  minutes TEXT,
  rating TEXT,
  shots_total INTEGER,
  shots_on INTEGER,
  goals_total INTEGER,
  goals_conceded INTEGER,
  goals_assists INTEGER,
  goals_saves INTEGER,
  passes_total INTEGER,
  passes_key INTEGER,
  passes_accuracy TEXT,
  tackles_total INTEGER,
  tackles_blocks INTEGER,
  tackles_interceptions INTEGER,
  duels_total INTEGER,
  duels_won INTEGER,
  dribbles_attempts INTEGER,
  dribbles_success INTEGER,
  fouls_drawn INTEGER,
  fouls_committed INTEGER,
  cards_yellow INTEGER,
  cards_red INTEGER,
  penalty_won INTEGER,
  penalty_committed INTEGER,
  penalty_scored INTEGER,
  penalty_missed INTEGER,
  penalty_saved INTEGER,
  json_raw JSONB,
  column_1 TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create NBA Fixtures table
CREATE TABLE IF NOT EXISTS public.nba_fixtures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT UNIQUE,
  date_edst TEXT,
  time_edst TEXT,
  status TEXT,
  season TEXT,
  stage TEXT,
  home_team_id TEXT,
  home_team_name TEXT,
  away_team_id TEXT,
  away_team_name TEXT,
  column_1 TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create NBA Player Stats table
CREATE TABLE IF NOT EXISTS public.nba_player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT,
  player_id TEXT,
  player_firstname TEXT,
  player_lastname TEXT,
  team_id TEXT,
  team_name TEXT,
  team_nickname TEXT,
  team_code TEXT,
  team_logo TEXT,
  game_ref_id TEXT,
  points INTEGER,
  pos TEXT,
  min TEXT,
  fgm INTEGER,
  fga INTEGER,
  fgp TEXT,
  ftm INTEGER,
  fta INTEGER,
  ftp TEXT,
  tpm INTEGER,
  tpa INTEGER,
  tpp TEXT,
  offreb INTEGER,
  defreb INTEGER,
  totreb INTEGER,
  assists INTEGER,
  pfouls INTEGER,
  steals INTEGER,
  turnovers INTEGER,
  blocks INTEGER,
  plusminus TEXT,
  comment TEXT,
  raw_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.afl_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.afl_player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epl_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epl_player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nba_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nba_player_stats ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public read access
CREATE POLICY "Anyone can view afl_fixtures" ON public.afl_fixtures FOR SELECT USING (true);
CREATE POLICY "Anyone can view afl_player_stats" ON public.afl_player_stats FOR SELECT USING (true);
CREATE POLICY "Anyone can view epl_fixtures" ON public.epl_fixtures FOR SELECT USING (true);
CREATE POLICY "Anyone can view epl_player_stats" ON public.epl_player_stats FOR SELECT USING (true);
CREATE POLICY "Anyone can view nba_fixtures" ON public.nba_fixtures FOR SELECT USING (true);
CREATE POLICY "Anyone can view nba_player_stats" ON public.nba_player_stats FOR SELECT USING (true);

-- Create RLS policies for service role to manage data
CREATE POLICY "Service role can manage afl_fixtures" ON public.afl_fixtures FOR ALL USING (false);
CREATE POLICY "Service role can manage afl_player_stats" ON public.afl_player_stats FOR ALL USING (false);
CREATE POLICY "Service role can manage epl_fixtures" ON public.epl_fixtures FOR ALL USING (false);
CREATE POLICY "Service role can manage epl_player_stats" ON public.epl_player_stats FOR ALL USING (false);
CREATE POLICY "Service role can manage nba_fixtures" ON public.nba_fixtures FOR ALL USING (false);
CREATE POLICY "Service role can manage nba_player_stats" ON public.nba_player_stats FOR ALL USING (false);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_afl_fixtures_round ON public.afl_fixtures(round);
CREATE INDEX IF NOT EXISTS idx_afl_player_stats_player ON public.afl_player_stats(player);
CREATE INDEX IF NOT EXISTS idx_afl_player_stats_team ON public.afl_player_stats(team);
CREATE INDEX IF NOT EXISTS idx_epl_fixtures_fixture_id ON public.epl_fixtures(fixture_id);
CREATE INDEX IF NOT EXISTS idx_epl_player_stats_player_id ON public.epl_player_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_nba_fixtures_game_id ON public.nba_fixtures(game_id);
CREATE INDEX IF NOT EXISTS idx_nba_player_stats_player_id ON public.nba_player_stats(player_id);