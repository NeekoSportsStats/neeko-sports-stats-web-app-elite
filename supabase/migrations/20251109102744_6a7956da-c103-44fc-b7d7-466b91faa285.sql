-- Create ai_analysis table for structured AI blocks
CREATE TABLE IF NOT EXISTS public.ai_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport text NOT NULL DEFAULT 'nba',
  block_type text NOT NULL,
  block_title text NOT NULL,
  rank integer NOT NULL,
  player_name text NOT NULL,
  player_id text,
  explanation text NOT NULL,
  sparkline_data jsonb DEFAULT '[]'::jsonb,
  stat_value text,
  stat_label text,
  is_premium boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(sport, block_type, rank)
);

-- Enable RLS
ALTER TABLE public.ai_analysis ENABLE ROW LEVEL SECURITY;

-- Everyone can view all AI analysis data
CREATE POLICY "Anyone can view AI analysis"
ON public.ai_analysis
FOR SELECT
USING (true);

-- Only admins can insert/update AI analysis
CREATE POLICY "Only admins can insert AI analysis"
ON public.ai_analysis
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update AI analysis"
ON public.ai_analysis
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete AI analysis"
ON public.ai_analysis
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for efficient queries
CREATE INDEX idx_ai_analysis_sport_block ON public.ai_analysis(sport, block_type, rank);

-- Insert sample data for NBA
INSERT INTO public.ai_analysis (sport, block_type, block_title, rank, player_name, player_id, explanation, sparkline_data, stat_value, stat_label, is_premium) VALUES
-- Block 1: Trending Hot (10 players - first 5 free, last 5 premium)
('nba', 'trending_hot', 'Trending Hot', 1, 'LeBron James', 'lebron-james', 'Averaging 28.5 PPG over last 5 games with increased usage rate in clutch situations.', '[22, 25, 31, 28, 29]', '+12.5', 'PPG Trend', false),
('nba', 'trending_hot', 'Trending Hot', 2, 'Stephen Curry', 'stephen-curry', 'Hot shooting streak with 45% from three over last week, creating spacing nightmares.', '[8, 12, 10, 15, 11]', '+8.2', '3PM Trend', false),
('nba', 'trending_hot', 'Trending Hot', 3, 'Giannis Antetokounmpo', 'giannis', 'Dominating paint with 65% FG and 15 RPG, unstoppable in transition.', '[28, 32, 35, 31, 38]', '+15.3', 'PTS Trend', false),
('nba', 'trending_hot', 'Trending Hot', 4, 'Luka Doncic', 'luka-doncic', 'Triple-double machine with elite playmaking, averaging 12 assists per game.', '[25, 31, 28, 33, 29]', '+9.8', 'AST Trend', false),
('nba', 'trending_hot', 'Trending Hot', 5, 'Jayson Tatum', 'jayson-tatum', 'Efficient scoring with improved defense, 2.5 steals per game last week.', '[27, 24, 29, 31, 26]', '+7.4', 'PTS Trend', false),
('nba', 'trending_hot', 'Trending Hot', 6, 'Joel Embiid', 'joel-embiid', 'Back from injury with vengeance, posting 30+ PPG with elite rim protection.', '[31, 28, 35, 32, 34]', '+11.2', 'PTS Trend', true),
('nba', 'trending_hot', 'Trending Hot', 7, 'Kevin Durant', 'kevin-durant', 'Clutch performer in close games, hitting game-winners at historic rate.', '[26, 29, 31, 28, 33]', '+8.9', 'PTS Trend', true),
('nba', 'trending_hot', 'Trending Hot', 8, 'Nikola Jokic', 'nikola-jokic', 'Triple-double threat every night with elite passing and scoring efficiency.', '[24, 28, 26, 31, 29]', '+10.5', 'PTS Trend', true),
('nba', 'trending_hot', 'Trending Hot', 9, 'Damian Lillard', 'damian-lillard', 'Deep three-point range creating mismatches, 40% from 30+ feet.', '[22, 26, 29, 24, 31]', '+9.1', 'PTS Trend', true),
('nba', 'trending_hot', 'Trending Hot', 10, 'Anthony Davis', 'anthony-davis', 'Defensive anchor with offensive versatility, 3+ blocks per game.', '[25, 28, 31, 27, 33]', '+12.7', 'PTS Trend', true),

-- Block 2: Form Rising (5 players - all visible)
('nba', 'form_rising', 'Form Rising', 1, 'Tyrese Haliburton', 'tyrese-haliburton', 'Breakout season continues with elite assist-to-turnover ratio.', '[18, 21, 24, 22, 26]', '+8.0', 'PPG ↑', false),
('nba', 'form_rising', 'Form Rising', 2, 'Paolo Banchero', 'paolo-banchero', 'Rookie sensation showing veteran composure in clutch moments.', '[19, 22, 25, 23, 28]', '+9.0', 'PPG ↑', false),
('nba', 'form_rising', 'Form Rising', 3, 'Desmond Bane', 'desmond-bane', 'Efficient scorer heating up from all three levels.', '[20, 23, 24, 26, 29]', '+9.0', 'PPG ↑', false),
('nba', 'form_rising', 'Form Rising', 4, 'Franz Wagner', 'franz-wagner', 'Emerging as Orlando''s go-to option with improved shot selection.', '[17, 20, 22, 24, 27]', '+10.0', 'PPG ↑', false),
('nba', 'form_rising', 'Form Rising', 5, 'Scottie Barnes', 'scottie-barnes', 'All-around game improving with increased offensive responsibility.', '[16, 19, 21, 23, 25]', '+9.0', 'PPG ↑', false),

-- Block 3: Matchup Alerts (4 players)
('nba', 'matchup_alerts', 'Matchup Alerts', 1, 'Donovan Mitchell', 'donovan-mitchell', 'Faces weak perimeter defense tonight, historically averages 32 PPG vs this opponent.', '[25, 28, 26, 31, 29]', '32.0', 'AVG vs OPP', false),
('nba', 'matchup_alerts', 'Matchup Alerts', 2, 'Trae Young', 'trae-young', 'Opponent allows most assists to PGs, prime for double-double.', '[22, 24, 26, 23, 28]', '11.5', 'APG vs OPP', false),
('nba', 'matchup_alerts', 'Matchup Alerts', 3, 'Julius Randle', 'julius-randle', 'Matchup favors his post game, opponent weak in paint defense.', '[21, 24, 27, 25, 29]', '28.0', 'PPG vs OPP', false),
('nba', 'matchup_alerts', 'Matchup Alerts', 4, 'Domantas Sabonis', 'domantas-sabonis', 'Rebounding mismatch tonight, expect 15+ boards.', '[12, 14, 16, 15, 17]', '15.5', 'RPG vs OPP', false),

-- Block 4: Injury Watch (4 players)
('nba', 'injury_watch', 'Injury Watch', 1, 'Kawhi Leonard', 'kawhi-leonard', 'Load management likely, monitor status before game time.', '[0, 25, 28, 0, 26]', 'GTD', 'Status', false),
('nba', 'injury_watch', 'Injury Watch', 2, 'Zion Williamson', 'zion-williamson', 'Questionable with ankle, usage could spike if he plays.', '[31, 0, 29, 33, 0]', 'Q', 'Status', false),
('nba', 'injury_watch', 'Injury Watch', 3, 'James Harden', 'james-harden', 'Returning from hamstring, expect minutes restriction.', '[22, 0, 0, 18, 21]', '~28', 'MIN', false),
('nba', 'injury_watch', 'Injury Watch', 4, 'Bradley Beal', 'bradley-beal', 'Back from illness, full workload expected.', '[0, 0, 24, 26, 28]', 'PROB', 'Status', false),

-- Block 5: Usage Spike (5 players)
('nba', 'usage_spike', 'Usage Spike', 1, 'Shai Gilgeous-Alexander', 'shai', 'Team injuries increasing his usage to elite levels.', '[28, 31, 33, 35, 37]', '+12%', 'Usage', false),
('nba', 'usage_spike', 'Usage Spike', 2, 'De''Aaron Fox', 'deaaron-fox', 'Primary ball handler with increased responsibility.', '[25, 27, 29, 31, 32]', '+10%', 'Usage', false),
('nba', 'usage_spike', 'Usage Spike', 3, 'Lauri Markkanen', 'lauri-markkanen', 'Expanded role leading to career-high attempts.', '[22, 24, 26, 28, 30]', '+8%', 'Usage', false),
('nba', 'usage_spike', 'Usage Spike', 4, 'Jalen Brunson', 'jalen-brunson', 'Taking over as primary scorer with elite efficiency.', '[24, 27, 29, 31, 33]', '+11%', 'Usage', false),
('nba', 'usage_spike', 'Usage Spike', 5, 'DeMar DeRozan', 'demar-derozan', 'Mid-range mastery with increased shot attempts.', '[23, 25, 27, 29, 31]', '+9%', 'Usage', false),

-- Block 6: Defensive Anchors (4 players)
('nba', 'defensive_anchors', 'Defensive Anchors', 1, 'Rudy Gobert', 'rudy-gobert', 'Elite rim protection leading to opponent FG% drop.', '[3.2, 3.5, 3.8, 4.1, 4.2]', '4.2', 'BPG', false),
('nba', 'defensive_anchors', 'Defensive Anchors', 2, 'Bam Adebayo', 'bam-adebayo', 'Versatile defender switching 1-5 effectively.', '[2.8, 3.1, 3.3, 3.5, 3.7]', '3.7', 'Stocks', false),
('nba', 'defensive_anchors', 'Defensive Anchors', 3, 'Jaren Jackson Jr', 'jaren-jackson', 'Block leader with improved positioning.', '[3.5, 3.8, 4.0, 4.2, 4.5]', '4.5', 'BPG', false),
('nba', 'defensive_anchors', 'Defensive Anchors', 4, 'Brook Lopez', 'brook-lopez', 'Veteran presence protecting the rim at high level.', '[2.9, 3.1, 3.4, 3.6, 3.8]', '3.8', 'BPG', false)

ON CONFLICT (sport, block_type, rank) DO UPDATE SET
  block_title = EXCLUDED.block_title,
  player_name = EXCLUDED.player_name,
  player_id = EXCLUDED.player_id,
  explanation = EXCLUDED.explanation,
  sparkline_data = EXCLUDED.sparkline_data,
  stat_value = EXCLUDED.stat_value,
  stat_label = EXCLUDED.stat_label,
  is_premium = EXCLUDED.is_premium,
  updated_at = now();