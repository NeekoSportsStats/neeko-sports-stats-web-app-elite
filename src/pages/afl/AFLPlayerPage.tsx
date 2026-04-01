import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Lock, Users, Target, ChevronRight } from 'lucide-react';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import FantasyVerdictBadge from '@/components/FantasyVerdictBadge';
import { PremiumGate } from '@/components/PremiumGate';
import { slugToName, nameToSlug, TEAM_SLUGS, POSITION_SLUGS, POSITION_NAMES } from '@/lib/slugs';
import { getSimilarPlayersSafe, getPlayerDetailSafe } from '@/lib/playerAccess';
import { useAuth } from '@/lib/auth';

interface PlayerData {
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  price: number;
  projection_final: number;
  ceiling: number;
  floor: number;
  value_score: number;
  neeko_rating: number;
  ai_recommendation: string;
  recommendation_color: string;
  recommendation_short: string;
  summary_short: string;
  summary_long: string;
  games_played: number;
  avg_last_3: number;
  avg_last_5: number;
  projection_confidence: number;
  upside_pct: number;
  risk_rating: number;
}


export default function AFLPlayerPage() {
  const { slug } = useParams<{ slug: string }>();
  const { isPremium } = useSubscriptionStatus();
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
    queryKey: ['player-profile-safe', playerName, user?.id],
    queryFn: async () => {
      const data = await getPlayerDetailSafe(playerName, user?.id ?? null);
      if (!data) throw new Error('Player not found');
      return data as PlayerData & { is_locked?: boolean };
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
        <Link to="/sports/afl/rankings">
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

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const getRecommendationIcon = (rec: string) => {
    if (rec === 'BUY' || rec === 'STRONG_BUY') return <TrendingUp className="h-4 w-4" />;
    if (rec === 'SELL' || rec === 'AVOID') return <TrendingDown className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };

  const getRecommendationColor = (color: string) => {
    if (color === 'green') return 'bg-green-500/10 text-green-700 border-green-500/20';
    if (color === 'red') return 'bg-red-500/10 text-red-700 border-red-500/20';
    return 'bg-slate-500/10 text-slate-700 border-slate-500/20';
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
                className={`${getRecommendationColor(player.recommendation_color)} flex items-center gap-1`}
              >
                {getRecommendationIcon(player.ai_recommendation)}
                {player.recommendation_short || player.ai_recommendation}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-slate-500 mb-1">Projection</div>
              <div className="text-2xl font-bold">{Math.round(player.projection_final)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Ceiling</div>
              <div className="text-2xl font-bold text-green-600">{Math.round(player.ceiling)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Floor</div>
              <div className="text-2xl font-bold text-orange-600">{Math.round(player.floor || 0)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Value Score</div>
              <div className="text-2xl font-bold">
                {Math.round(player.value_score)}
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

      {/* AI Analysis - Extended (Premium Gated) */}
      {player.summary_long && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Detailed Analysis</CardTitle>
            <CardDescription>AI-powered insights and recommendations</CardDescription>
          </CardHeader>
          <CardContent>
            {isPremium ? (
              <div className="prose prose-slate max-w-none">
                <p className="text-slate-700 leading-relaxed whitespace-pre-line">
                  {player.summary_long}
                </p>
              </div>
            ) : (
              <PremiumGate
                feature="detailed player analysis"
                previewContent={
                  <div className="relative">
                    <p className="text-slate-700 leading-relaxed line-clamp-3 blur-sm select-none">
                      {player.summary_long}
                    </p>
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-transparent via-white/50 to-white">
                      <div className="text-center bg-white rounded-lg p-6 shadow-lg border">
                        <Lock className="h-8 w-8 mx-auto mb-3 text-slate-400" />
                        <p className="font-semibold mb-2">Premium Content</p>
                        <p className="text-sm text-slate-600 mb-4">
                          Unlock detailed AI analysis for all players
                        </p>
                        <Link to="/pricing">
                          <Button>Upgrade to Premium</Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                }
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Performance Stats */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-slate-500 mb-1">Games Played</div>
              <div className="text-xl font-bold">{player.games_played}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Last 3 Avg</div>
              <div className="text-xl font-bold">
                {player.avg_last_3 ? Math.round(player.avg_last_3) : '-'}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Last 5 Avg</div>
              <div className="text-xl font-bold">
                {player.avg_last_5 ? Math.round(player.avg_last_5) : '-'}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Neeko Rating</div>
              <div className="text-xl font-bold">{Math.round(player.neeko_rating)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Confidence</div>
              <div className="text-xl font-bold">
                {Math.round(player.projection_confidence)}%
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-500 mb-1">Upside</div>
              <div className="text-xl font-bold text-green-600">
                {player.upside_pct ? `${Math.round(player.upside_pct)}%` : '-'}
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
                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-700">
                        {Math.round(similar.projection_final)}
                      </div>
                      <div className="text-xs text-slate-500">projected</div>
                    </div>
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
