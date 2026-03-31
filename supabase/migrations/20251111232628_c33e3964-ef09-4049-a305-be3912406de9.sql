-- Create AI Analysis tables for each sport
CREATE TABLE IF NOT EXISTS public.ai_afl_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_title TEXT NOT NULL,
  block_type TEXT NOT NULL,
  player_name TEXT,
  team_name TEXT,
  rank INTEGER,
  stat_label TEXT,
  stat_value TEXT,
  explanation TEXT NOT NULL,
  sparkline_data JSONB DEFAULT '[]'::jsonb,
  is_premium BOOLEAN DEFAULT false,
  round TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_nba_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_title TEXT NOT NULL,
  block_type TEXT NOT NULL,
  player_name TEXT,
  team_name TEXT,
  rank INTEGER,
  stat_label TEXT,
  stat_value TEXT,
  explanation TEXT NOT NULL,
  sparkline_data JSONB DEFAULT '[]'::jsonb,
  is_premium BOOLEAN DEFAULT false,
  round TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_epl_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_title TEXT NOT NULL,
  block_type TEXT NOT NULL,
  player_name TEXT,
  team_name TEXT,
  rank INTEGER,
  stat_label TEXT,
  stat_value TEXT,
  explanation TEXT NOT NULL,
  sparkline_data JSONB DEFAULT '[]'::jsonb,
  is_premium BOOLEAN DEFAULT false,
  round TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create Team Stats tables for each sport
CREATE TABLE IF NOT EXISTS public.afl_team_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team TEXT NOT NULL,
  round TEXT,
  total_disposals INTEGER DEFAULT 0,
  total_goals INTEGER DEFAULT 0,
  total_behinds INTEGER DEFAULT 0,
  total_marks INTEGER DEFAULT 0,
  total_tackles INTEGER DEFAULT 0,
  total_hitouts INTEGER DEFAULT 0,
  total_fantasy_points INTEGER DEFAULT 0,
  avg_disposals DECIMAL,
  avg_goals DECIMAL,
  avg_fantasy_points DECIMAL,
  player_count INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team, round)
);

CREATE TABLE IF NOT EXISTS public.nba_team_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team TEXT NOT NULL,
  round TEXT,
  total_points INTEGER DEFAULT 0,
  total_rebounds INTEGER DEFAULT 0,
  total_assists INTEGER DEFAULT 0,
  total_steals INTEGER DEFAULT 0,
  total_blocks INTEGER DEFAULT 0,
  avg_points DECIMAL,
  avg_rebounds DECIMAL,
  avg_assists DECIMAL,
  player_count INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team, round)
);

CREATE TABLE IF NOT EXISTS public.epl_team_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team TEXT NOT NULL,
  round TEXT,
  total_goals INTEGER DEFAULT 0,
  total_assists INTEGER DEFAULT 0,
  total_shots INTEGER DEFAULT 0,
  total_passes INTEGER DEFAULT 0,
  total_tackles INTEGER DEFAULT 0,
  avg_goals DECIMAL,
  avg_passes DECIMAL,
  avg_shots DECIMAL,
  player_count INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team, round)
);

-- Enable RLS on all new tables
ALTER TABLE public.ai_afl_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_nba_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_epl_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.afl_team_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nba_team_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epl_team_stats ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public read access
CREATE POLICY "Anyone can view ai_afl_analysis" ON public.ai_afl_analysis FOR SELECT USING (true);
CREATE POLICY "Anyone can view ai_nba_analysis" ON public.ai_nba_analysis FOR SELECT USING (true);
CREATE POLICY "Anyone can view ai_epl_analysis" ON public.ai_epl_analysis FOR SELECT USING (true);
CREATE POLICY "Anyone can view afl_team_stats" ON public.afl_team_stats FOR SELECT USING (true);
CREATE POLICY "Anyone can view nba_team_stats" ON public.nba_team_stats FOR SELECT USING (true);
CREATE POLICY "Anyone can view epl_team_stats" ON public.epl_team_stats FOR SELECT USING (true);

-- Create RLS policies for service role to manage data
CREATE POLICY "Service role can manage ai_afl_analysis" ON public.ai_afl_analysis FOR ALL USING (false);
CREATE POLICY "Service role can manage ai_nba_analysis" ON public.ai_nba_analysis FOR ALL USING (false);
CREATE POLICY "Service role can manage ai_epl_analysis" ON public.ai_epl_analysis FOR ALL USING (false);
CREATE POLICY "Service role can manage afl_team_stats" ON public.afl_team_stats FOR ALL USING (false);
CREATE POLICY "Service role can manage nba_team_stats" ON public.nba_team_stats FOR ALL USING (false);
CREATE POLICY "Service role can manage epl_team_stats" ON public.epl_team_stats FOR ALL USING (false);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_ai_afl_analysis_player ON public.ai_afl_analysis(player_name);
CREATE INDEX IF NOT EXISTS idx_ai_afl_analysis_team ON public.ai_afl_analysis(team_name);
CREATE INDEX IF NOT EXISTS idx_ai_afl_analysis_round ON public.ai_afl_analysis(round);
CREATE INDEX IF NOT EXISTS idx_ai_nba_analysis_player ON public.ai_nba_analysis(player_name);
CREATE INDEX IF NOT EXISTS idx_ai_nba_analysis_team ON public.ai_nba_analysis(team_name);
CREATE INDEX IF NOT EXISTS idx_ai_nba_analysis_round ON public.ai_nba_analysis(round);
CREATE INDEX IF NOT EXISTS idx_ai_epl_analysis_player ON public.ai_epl_analysis(player_name);
CREATE INDEX IF NOT EXISTS idx_ai_epl_analysis_team ON public.ai_epl_analysis(team_name);
CREATE INDEX IF NOT EXISTS idx_ai_epl_analysis_round ON public.ai_epl_analysis(round);
CREATE INDEX IF NOT EXISTS idx_afl_team_stats_team ON public.afl_team_stats(team);
CREATE INDEX IF NOT EXISTS idx_afl_team_stats_round ON public.afl_team_stats(round);
CREATE INDEX IF NOT EXISTS idx_nba_team_stats_team ON public.nba_team_stats(team);
CREATE INDEX IF NOT EXISTS idx_nba_team_stats_round ON public.nba_team_stats(round);
CREATE INDEX IF NOT EXISTS idx_epl_team_stats_team ON public.epl_team_stats(team);
CREATE INDEX IF NOT EXISTS idx_epl_team_stats_round ON public.epl_team_stats(round);