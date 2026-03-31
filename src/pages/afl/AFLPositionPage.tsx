import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronRight, TrendingUp, Shield, Zap } from 'lucide-react';
import { nameToSlug, POSITION_NAMES } from '@/lib/slugs';
import { useAuth } from '@/lib/auth';
import { getFreePlayerIds, markLockedPlayers } from '@/lib/playerAccess';
import { LockedPlayerCard } from '@/components/premium/LockedPlayerCard';
import { RankingsPlayer } from '@/features/afl/shared/seo/types';
import { formatNumber, formatPercentage, getRecommendationColor } from '@/features/afl/shared/seo/utils';

const POSITION_SLUG_TO_CODE: Record<string, string> = {
  'def': 'DEF',
  'mid': 'MID',
  'fwd': 'FWD',
  'ruck': 'RUC',
};

export default function AFLPositionPage() {
  const { position } = useParams<{ position: string }>();
  const positionCode = position ? POSITION_SLUG_TO_CODE[position] : '';
  const positionName = positionCode ? POSITION_NAMES[positionCode] : '';
  const { user, isPremium } = useAuth();

  const { data: players, isLoading, error } = useQuery({
    queryKey: ['position-players', positionCode, isPremium],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_rankings_master')
        .select('player_id, player_name, team, neeko_rating, projection_final, projection_confidence, value_score, price, ai_recommendation, recommendation_color, upside_pct')
        .eq('position', positionCode)
        .order('neeko_rating', { ascending: false })
        .limit(50);

      if (error) throw error;

      const freePlayerIds = await getFreePlayerIds();
      return markLockedPlayers(data || [], isPremium, freePlayerIds) as RankingsPlayer[];
    },
    enabled: !!positionCode,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !players || !positionName) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Link to="/sports/afl/rankings">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Rankings
          </Button>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Position Not Found</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const bestValue = [...players]
    .filter(p => !p.is_locked && p.value_score > 0)
    .sort((a, b) => (b.value_score || 0) - (a.value_score || 0))
    .slice(0, 10);

  const safestPicks = [...players]
    .filter(p => !p.is_locked && (p.projection_confidence || 0) >= 65)
    .sort((a, b) => (b.projection_confidence || 0) - (a.projection_confidence || 0))
    .slice(0, 10);

  const highRisk = [...players]
    .filter(p => !p.is_locked && (p.upside_pct || 0) > 15)
    .sort((a, b) => (b.upside_pct || 0) - (a.upside_pct || 0))
    .slice(0, 10);

  const pageTitle = `Best AFL Fantasy ${positionName} 2026 Rankings & Projections | Neeko`;
  const pageDescription = `Top ${positionName} for AFL Fantasy 2026. ${players.length} ${positionName.toLowerCase()} ranked with projections, value scores, and AI recommendations. Find the best picks for your team.`;
  const pageUrl = `https://neeko.com.au/sports/afl/positions/${position}`;

  const getRecommendationBadge = (rec: string, color: string) => {
    return (
      <Badge variant="outline" className={`${getRecommendationColor(color)} text-xs`}>
        {rec}
      </Badge>
    );
  };

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content={`AFL Fantasy, ${positionName}, ${positionCode}, rankings, projections, value, 2026 season`} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <link rel="canonical" href={pageUrl} />
        <meta name="robots" content="index, follow" />
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Breadcrumbs */}
        <nav className="mb-4 text-sm text-slate-500">
          <ol className="flex items-center gap-2">
            <li><Link to="/" className="hover:text-slate-700">Home</Link></li>
            <ChevronRight className="h-3 w-3" />
            <li><Link to="/sports/afl/rankings" className="hover:text-slate-700">AFL</Link></li>
            <ChevronRight className="h-3 w-3" />
            <li className="text-slate-700 font-medium">{positionName}</li>
          </ol>
        </nav>

        {/* Back Button */}
        <Link to="/sports/afl/rankings">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Rankings
          </Button>
        </Link>

        {/* Position Header */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-3xl">AFL Fantasy {positionName} 2026</CardTitle>
            <CardDescription>Complete rankings and projections for {positionName.toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-slate-500 mb-1">Total Players</div>
                <div className="text-2xl font-bold">{players.length}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500 mb-1">Top Projection</div>
                <div className="text-2xl font-bold text-green-600">
                  {players.length > 0 ? formatNumber(players[0].projection_final) : 0}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-500 mb-1">Premium Options</div>
                <div className="text-2xl font-bold">
                  {players.filter(p => p.neeko_rating >= 100).length}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Best Value */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                Best Value
              </CardTitle>
              <CardDescription>Top value picks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {bestValue.slice(0, 5).map((player, idx) => {
                  if (player.is_locked) {
                    return (
                      <div key={player.player_name} className="mb-2">
                        <LockedPlayerCard
                          playerName={player.player_name}
                          team={player.team}
                          position={positionName}
                          price={player.price}
                          variant="compact"
                          showCTA={false}
                        />
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={player.player_name}
                      to={`/sports/afl/players/${nameToSlug(player.player_name)}`}
                      className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <div className="text-lg font-bold text-slate-300 w-6">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-slate-900">{player.player_name}</div>
                          <div className="text-xs text-slate-500">{player.team}</div>
                        </div>
                      </div>
                      <ChevronRight className="h-3 w-3 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Safest Picks */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-600" />
                Safest Picks
              </CardTitle>
              <CardDescription>High confidence</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {safestPicks.slice(0, 5).map((player, idx) => {
                  if (player.is_locked) {
                    return (
                      <div key={player.player_name} className="mb-2">
                        <LockedPlayerCard
                          playerName={player.player_name}
                          team={player.team}
                          position={positionName}
                          projection={player.projection_final}
                          variant="compact"
                          showCTA={false}
                        />
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={player.player_name}
                      to={`/sports/afl/players/${nameToSlug(player.player_name)}`}
                      className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <div className="text-lg font-bold text-slate-300 w-6">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-slate-900">{player.player_name}</div>
                          <div className="text-xs text-slate-500">{formatPercentage(player.projection_confidence)} conf</div>
                        </div>
                      </div>
                      <ChevronRight className="h-3 w-3 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* High Risk / High Reward */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-600" />
                High Upside
              </CardTitle>
              <CardDescription>Risk / reward</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {highRisk.slice(0, 5).map((player, idx) => {
                  if (player.is_locked) {
                    return (
                      <div key={player.player_name} className="mb-2">
                        <LockedPlayerCard
                          playerName={player.player_name}
                          team={player.team}
                          position={positionName}
                          price={player.price}
                          variant="compact"
                          showCTA={false}
                        />
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={player.player_name}
                      to={`/sports/afl/players/${nameToSlug(player.player_name)}`}
                      className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <div className="text-lg font-bold text-slate-300 w-6">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-slate-900">{player.player_name}</div>
                          <div className="text-xs text-slate-500">{formatPercentage(player.upside_pct)} upside</div>
                        </div>
                      </div>
                      <ChevronRight className="h-3 w-3 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top 50 Rankings */}
        <Card>
          <CardHeader>
            <CardTitle>Top 50 {positionName}</CardTitle>
            <CardDescription>Complete rankings by Neeko Rating</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {players.map((player, idx) => {
                if (player.is_locked) {
                  return (
                    <div key={player.player_name} className="mb-2">
                      <LockedPlayerCard
                        playerName={player.player_name}
                        team={player.team}
                        position={positionName}
                        price={player.price}
                        projection={player.projection_final}
                        variant="compact"
                        showCTA={false}
                      />
                    </div>
                  );
                }

                return (
                  <Link
                    key={player.player_name}
                    to={`/sports/afl/players/${nameToSlug(player.player_name)}`}
                    className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-2xl font-bold text-slate-300 w-10">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{player.player_name}</div>
                        <div className="text-sm text-slate-500">{player.team}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="hidden md:block">
                        {getRecommendationBadge(player.ai_recommendation, player.recommendation_color)}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-green-600">
                          {formatNumber(player.neeko_rating)}
                        </div>
                        <div className="text-xs text-slate-500">{formatNumber(player.projection_final)} pts</div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
