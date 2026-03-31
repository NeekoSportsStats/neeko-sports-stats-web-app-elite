-- Create NRL stats table
CREATE TABLE IF NOT EXISTS public.nrl_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player text NOT NULL,
  team text,
  round integer,
  tries integer DEFAULT 0,
  try_assists integer DEFAULT 0,
  tackles integer DEFAULT 0,
  running_metres integer DEFAULT 0,
  linebreaks integer DEFAULT 0,
  fantasy_score integer DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now()
);

-- Create EPL stats table
CREATE TABLE IF NOT EXISTS public.epl_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player text NOT NULL,
  team text,
  round integer,
  goals integer DEFAULT 0,
  assists integer DEFAULT 0,
  shots integer DEFAULT 0,
  passes integer DEFAULT 0,
  tackles integer DEFAULT 0,
  fantasy_score integer DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now()
);

-- Create NBA stats table
CREATE TABLE IF NOT EXISTS public.nba_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player text NOT NULL,
  team text,
  round integer,
  points integer DEFAULT 0,
  rebounds integer DEFAULT 0,
  assists integer DEFAULT 0,
  steals integer DEFAULT 0,
  blocks integer DEFAULT 0,
  fantasy_score integer DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now()
);

-- Create matches tables for each sport
CREATE TABLE IF NOT EXISTS public.afl_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round integer NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  home_score integer,
  away_score integer,
  match_date timestamp with time zone,
  venue text,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nrl_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round integer NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  home_score integer,
  away_score integer,
  match_date timestamp with time zone,
  venue text,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.epl_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round integer NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  home_score integer,
  away_score integer,
  match_date timestamp with time zone,
  venue text,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nba_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round integer NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  home_score integer,
  away_score integer,
  match_date timestamp with time zone,
  venue text,
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.nrl_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epl_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nba_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.afl_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nrl_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epl_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nba_matches ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for stats tables (public read, service role write)
CREATE POLICY "Anyone can view nrl_stats" ON public.nrl_stats FOR SELECT USING (true);
CREATE POLICY "Service role can insert nrl_stats" ON public.nrl_stats FOR INSERT WITH CHECK (false);
CREATE POLICY "Service role can update nrl_stats" ON public.nrl_stats FOR UPDATE USING (false);
CREATE POLICY "Service role can delete nrl_stats" ON public.nrl_stats FOR DELETE USING (false);

CREATE POLICY "Anyone can view epl_stats" ON public.epl_stats FOR SELECT USING (true);
CREATE POLICY "Service role can insert epl_stats" ON public.epl_stats FOR INSERT WITH CHECK (false);
CREATE POLICY "Service role can update epl_stats" ON public.epl_stats FOR UPDATE USING (false);
CREATE POLICY "Service role can delete epl_stats" ON public.epl_stats FOR DELETE USING (false);

CREATE POLICY "Anyone can view nba_stats" ON public.nba_stats FOR SELECT USING (true);
CREATE POLICY "Service role can insert nba_stats" ON public.nba_stats FOR INSERT WITH CHECK (false);
CREATE POLICY "Service role can update nba_stats" ON public.nba_stats FOR UPDATE USING (false);
CREATE POLICY "Service role can delete nba_stats" ON public.nba_stats FOR DELETE USING (false);

-- Create RLS policies for matches tables (public read, service role write)
CREATE POLICY "Anyone can view afl_matches" ON public.afl_matches FOR SELECT USING (true);
CREATE POLICY "Service role can manage afl_matches" ON public.afl_matches FOR ALL USING (false);

CREATE POLICY "Anyone can view nrl_matches" ON public.nrl_matches FOR SELECT USING (true);
CREATE POLICY "Service role can manage nrl_matches" ON public.nrl_matches FOR ALL USING (false);

CREATE POLICY "Anyone can view epl_matches" ON public.epl_matches FOR SELECT USING (true);
CREATE POLICY "Service role can manage epl_matches" ON public.epl_matches FOR ALL USING (false);

CREATE POLICY "Anyone can view nba_matches" ON public.nba_matches FOR SELECT USING (true);
CREATE POLICY "Service role can manage nba_matches" ON public.nba_matches FOR ALL USING (false);