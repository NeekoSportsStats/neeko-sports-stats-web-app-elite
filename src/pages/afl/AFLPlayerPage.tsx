import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Lock } from 'lucide-react';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import FantasyVerdictBadge from '@/components/FantasyVerdictBadge';
import { PremiumGate } from '@/components/PremiumGate';

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

const slugToName = (slug: string): string => {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const nameToSlug = (name: string): string => {
  return name.toLowerCase().replace(/\s+/g, '-');
};

export default function AFLPlayerPage() {
  const { slug } = useParams<{ slug: string }>();
  const { isPremium } = useSubscriptionStatus();

  const playerName = slug ? slugToName(slug) : '';

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

      return data as PlayerData;
    },
    enabled: !!playerName,
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

  const pageTitle = `${player.player_name} AFL Fantasy Projection 2026 | Neeko Sports`;
  const pageDescription = `AI-powered AFL Fantasy analysis for ${player.player_name} (${player.team}). Projection: ${Math.round(player.projection_final)} pts. Value rating, risk assessment, and trade recommendation updated weekly.`;
  const pageUrl = `https://neeko.com.au/sports/afl/players/${slug}`;

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:site_name" content="Neeko Sports" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <link rel="canonical" href={pageUrl} />
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Back Button */}
        <Link to="/afl/rankings">
        <Button variant="ghost" className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Rankings
        </Button>
      </Link>

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
            <Link to="/afl/rankings">
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
