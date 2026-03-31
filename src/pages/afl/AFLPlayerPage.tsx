import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Lock, Users, Target, ChevronRight } from 'lucide-react';
import FantasyVerdictBadge from '@/components/FantasyVerdictBadge';
import { slugToName, nameToSlug, TEAM_SLUGS, POSITION_SLUGS, POSITION_NAMES } from '@/lib/slugs';
import { getSimilarPlayersSafe } from '@/lib/playerAccess';
import { useAuth } from '@/lib/auth';
import { RankingsPlayer } from '@/features/afl/shared/seo/types';
import {
  formatPrice,
  formatNumber,
  formatPercentage,
  getRecommendationColor,
  getRecommendationDisplay,
  safeStatDisplay,
  getConfidenceLabel,
} from '@/features/afl/shared/seo/utils';


export default function AFLPlayerPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string; tab?: string; scrollY?: number; returnPath?: string } | null;

  const playerName = slug ? slugToName(slug) : '';

  const handleBack = () => {
    if (state?.returnPath) {
      navigate(state.returnPath, { state });
      setTimeout(() => window.scrollTo(0, state.scrollY ?? 0), 0);
    } else {
      navigate('/sports/afl/rankings');
    }
  };

  const { data: player, isLoading, error } = useQuery({
    queryKey: ['player-profile', playerName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_rankings_master')
        .select('*')
        .ilike('player_name', playerName)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Player not found');

      return data as RankingsPlayer;
    },
    enabled: !!playerName,
  });

  const { data: similarPlayers } = useQuery({
    queryKey: ['similar-players-safe', player?.player_id, player?.position, player?.projection_final, user?.id],
    queryFn: async () => {
      if (!player) return [];

      return await getSimilarPlayersSafe(
        player.player_id,
        player.position,
        (player.projection_final || 0) - 10,
        (player.projection_final || 0) + 10,
        user?.id ?? null,
        5
      );
    },
    enabled: !!player,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-64 w-full mb-6" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link to="/afl/rankings">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Rankings
          </Button>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Player Not Found</CardTitle>
            <CardDescription>
              Could not find player: {playerName}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const recDisplay = getRecommendationDisplay(player?.ai_recommendation || 'HOLD');
  const getRecommendationIcon = (icon: 'up' | 'down' | 'neutral') => {
    if (icon === 'up') return <TrendingUp className="h-4 w-4" />;
    if (icon === 'down') return <TrendingDown className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };

  const pageTitle = `${player.player_name} AFL Fantasy Stats, Projection & Value 2026 | Neeko`;
  const pageDescription = `${player.player_name} (${player.team}) AFL Fantasy 2026: ${Math.round(player.projection_final)} projected points. ${POSITION_NAMES[player.position]} rankings, value score ${Math.round(player.value_score)}, AI-powered ${player.ai_recommendation.toLowerCase()} recommendation. Updated weekly.`;
  const pageUrl = `https://neeko.com.au/sports/afl/players/${slug}`;
  const keywords = `${player.player_name}, ${player.team}, AFL Fantasy, ${player.position}, fantasy football, player stats, projection, value, ${POSITION_NAMES[player.position]}`;

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content={keywords} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:site_name" content="Neeko Sports" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <link rel="canonical" href={pageUrl} />
        <meta name="robots" content="index, follow" />
        <meta name="author" content="Neeko Sports" />
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Breadcrumbs */}
        <nav className="mb-4 text-sm text-slate-500">
          <ol className="flex items-center gap-2">
            <li><Link to="/" className="hover:text-slate-700">Home</Link></li>
            <ChevronRight className="h-3 w-3" />
            <li><Link to="/sports/afl/rankings" className="hover:text-slate-700">AFL</Link></li>
            <ChevronRight className="h-3 w-3" />
            <li><Link to={`/sports/afl/positions/${POSITION_SLUGS[player.position]}`} className="hover:text-slate-700">{POSITION_NAMES[player.position]}</Link></li>
            <ChevronRight className="h-3 w-3" />
            <li className="text-slate-700 font-medium">{player.player_name}</li>
          </ol>
        </nav>

        {/* Back Button */}
        <Button onClick={handleBack} variant="ghost" className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to {state?.from === 'market-watch' ? 'Market Watch' : 'Rankings'}
        </Button>

      {/* Player Header */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <CardTitle className="text-3xl mb-2">{player.player_name}</CardTitle>
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="outline" className="text-base">
                  {player.team}
                </Badge>
                <Badge variant="outline" className="text-base">
                  {player.position}
                </Badge>
                <span className="text-xl font-bold text-slate-700">
                  {formatPrice(player.price)}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-start md:items-end gap-2">
              <FantasyVerdictBadge verdict={player.ai_recommendation} />
              <Badge
                variant="outline"
                className={`${getRecommendationColor(player.recommendation_color || 'slate')} flex items-center gap-1`}
              >
                {getRecommendationIcon(recDisplay.icon)}
                {player.recommendation_short || recDisplay.text}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-slate-500 mb-1">Projection</div>
              <div className="text-2xl font-bold">{formatNumber(player.projection_final)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Ceiling</div>
              <div className="text-2xl font-bold text-green-600">{formatNumber(player.ceiling)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Floor</div>
              <div className="text-2xl font-bold text-orange-600">{formatNumber(player.floor)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Value Score</div>
              <div className="text-2xl font-bold">
                {formatNumber(player.value_score)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Analysis - Quick Summary */}
      {player.summary_short && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Quick Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-700 leading-relaxed">
              {player.summary_short}
            </p>
          </CardContent>
        </Card>
      )}

      {/* AI Analysis - Extended (Data-Level Gated) */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Detailed Analysis</CardTitle>
          <CardDescription>AI-powered insights and recommendations</CardDescription>
        </CardHeader>
        <CardContent>
          {player.summary_long ? (
            <div className="prose prose-slate max-w-none">
              <p className="text-slate-700 leading-relaxed whitespace-pre-line">
                {player.summary_long}
              </p>
            </div>
          ) : (
            <div className="relative min-h-[200px] flex items-center justify-center">
              <div className="text-center bg-slate-50 rounded-lg p-8 border-2 border-dashed border-slate-200">
                <Lock className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                <p className="font-semibold text-lg mb-2 text-slate-900">Premium Analysis Locked</p>
                <p className="text-sm text-slate-600 mb-6 max-w-sm">
                  Get detailed AI-powered insights, trade recommendations, and advanced metrics for all 600+ AFL players
                </p>
                <Link to="/pricing">
                  <Button size="lg">Unlock Premium</Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance Stats */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            <div>
              <div className="text-sm text-slate-500 mb-1">Games Played</div>
              <div className="text-xl font-bold">{formatNumber(player.games_played)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Neeko Rating</div>
              <div className="text-xl font-bold">{formatNumber(player.neeko_rating)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Confidence</div>
              <div className="text-xl font-bold">
                {formatPercentage(player.projection_confidence)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {getConfidenceLabel(player.projection_confidence || 0)}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Upside</div>
              <div className="text-xl font-bold text-green-600">
                {safeStatDisplay(player.upside_pct, 'percentage')}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Captain Score</div>
              <div className="text-xl font-bold">
                {formatNumber(player.captain_score)}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Edge Score</div>
              <div className="text-xl font-bold">
                {formatNumber(player.edge_score)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Internal Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Players
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link to={`/sports/afl/teams/${TEAM_SLUGS[player.team]}`}>
              <Button variant="outline" className="w-full justify-between group">
                View all {player.team} players
                <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" />
              Position Rankings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link to={`/sports/afl/positions/${POSITION_SLUGS[player.position]}`}>
              <Button variant="outline" className="w-full justify-between group">
                View all {POSITION_NAMES[player.position]}
                <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Similar Players */}
      {similarPlayers && similarPlayers.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Similar Players</CardTitle>
            <CardDescription>Players with similar projections in {POSITION_NAMES[player.position]}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {similarPlayers.map((similar: any) => (
                <Link
                  key={similar.player_name}
                  to={`/sports/afl/players/${nameToSlug(similar.player_name)}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors group"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{similar.player_name}</div>
                    <div className="text-sm text-slate-500">{similar.team}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {similar.is_locked ? (
                      <Lock className="h-4 w-4 text-slate-400" />
                    ) : (
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-700">
                          {formatNumber(similar.projection_final)}
                        </div>
                        <div className="text-xs text-slate-500">projected</div>
                      </div>
                    )}
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trade Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Trade Recommendation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500 mb-1">Action</div>
              <Badge
                variant="outline"
                className={`${getRecommendationColor(player.recommendation_color)} text-lg py-1 px-3`}
              >
                {player.ai_recommendation}
              </Badge>
            </div>
            <Link to="/sports/afl/rankings">
              <Button>
                View All Rankings
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
    </>
  );
}
