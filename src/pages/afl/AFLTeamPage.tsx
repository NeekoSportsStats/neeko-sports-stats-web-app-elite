import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { nameToSlug, POSITION_NAMES } from '@/lib/slugs';
import { getTeamPlayersSafe } from '@/lib/playerAccess';
import { useAuth } from '@/lib/auth';
import { LockedPlayerCard } from '@/components/premium/LockedPlayerCard';

interface TeamPlayer {
  player_id?: number;
  player_name: string;
  position: string;
  neeko_rating: number;
  projection_final: number;
  value_score: number;
  price: number;
  ai_recommendation: string;
  recommendation_color: string;
  is_locked?: boolean;
}

const TEAM_SLUG_TO_NAME: Record<string, string> = {
  'adelaide-crows': 'Adelaide Crows',
  'brisbane-lions': 'Brisbane Lions',
  'carlton-blues': 'Carlton Blues',
  'collingwood-magpies': 'Collingwood Magpies',
  'essendon-bombers': 'Essendon Bombers',
  'fremantle-dockers': 'Fremantle Dockers',
  'geelong-cats': 'Geelong Cats',
  'gold-coast-suns': 'Gold Coast Suns',
  'gws-giants': 'Greater Western Sydney Giants',
  'hawthorn-hawks': 'Hawthorn Hawks',
  'melbourne-demons': 'Melbourne Demons',
  'north-melbourne-kangaroos': 'North Melbourne Kangaroos',
  'port-adelaide-power': 'Port Adelaide Power',
  'richmond-tigers': 'Richmond Tigers',
  'st-kilda-saints': 'St Kilda Saints',
  'sydney-swans': 'Sydney Swans',
  'west-coast-eagles': 'West Coast Eagles',
  'western-bulldogs': 'Western Bulldogs',
};

export default function AFLTeamPage() {
  const { team } = useParams<{ team: string }>();
  const teamName = team ? TEAM_SLUG_TO_NAME[team] : '';
  const { user, isPremium } = useAuth();

  const { data: players, isLoading, error } = useQuery({
    queryKey: ['team-players-safe', teamName, user?.id],
    queryFn: async () => {
      const data = await getTeamPlayersSafe(teamName, user?.id ?? null);
      return data as TeamPlayer[];
    },
    enabled: !!teamName,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !players || !teamName) {
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
            <CardTitle>Team Not Found</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const topPlayers = players.slice(0, 10);
  const avgProjection = players.length > 0
    ? Math.round(players.reduce((sum, p) => sum + (p.projection_final || 0), 0) / players.length)
    : 0;

  const valueLeaders = [...players]
    .filter(p => p.value_score > 0)
    .sort((a, b) => (b.value_score || 0) - (a.value_score || 0))
    .slice(0, 5);

  const captainOptions = players.filter(p => p.neeko_rating >= 100).slice(0, 5);

  const pageTitle = `${teamName} AFL Fantasy Players & Rankings 2026 | Neeko`;
  const pageDescription = `Complete ${teamName} AFL Fantasy roster for 2026. Top players, projections, value picks, and captain options. ${players.length} players ranked with AI-powered recommendations.`;
  const pageUrl = `https://neeko.com.au/sports/afl/teams/${team}`;

  const getRecommendationBadge = (rec: string, color: string) => {
    const colorClass = color === 'green' ? 'bg-green-500/10 text-green-700 border-green-500/20'
      : color === 'red' ? 'bg-red-500/10 text-red-700 border-red-500/20'
      : 'bg-slate-500/10 text-slate-700 border-slate-500/20';

    return (
      <Badge variant="outline" className={`${colorClass} text-xs`}>
        {rec}
      </Badge>
    );
  };

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content={`${teamName}, AFL Fantasy, team players, roster, rankings, 2026 season`} />
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
            <li className="text-slate-700 font-medium">{teamName}</li>
          </ol>
        </nav>

        {/* Back Button */}
        <Link to="/sports/afl/rankings">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Rankings
          </Button>
        </Link>

        {/* Team Header */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-3xl">{teamName}</CardTitle>
            <CardDescription>AFL Fantasy 2026 Team Overview</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-slate-500 mb-1">Total Players</div>
                <div className="text-2xl font-bold">{players.length}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500 mb-1">Avg Projection</div>
                <div className="text-2xl font-bold text-green-600">{avgProjection}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500 mb-1">Premium Options</div>
                <div className="text-2xl font-bold">{captainOptions.length}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top 10 Players */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Top 10 Players</CardTitle>
            <CardDescription>Highest rated {teamName} players by Neeko Rating</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topPlayers.map((player, idx) => {
                if (player.is_locked) {
                  return (
                    <div key={player.player_name} className="mb-2">
                      <LockedPlayerCard
                        playerName={player.player_name}
                        team={teamName}
                        position={POSITION_NAMES[player.position]}
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
                      <div className="text-2xl font-bold text-slate-300 w-8">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{player.player_name}</div>
                        <div className="text-sm text-slate-500">{POSITION_NAMES[player.position]}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="hidden md:block">
                        {getRecommendationBadge(player.ai_recommendation, player.recommendation_color)}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-green-600">
                          {player.neeko_rating.toFixed(1)}
                        </div>
                        <div className="text-xs text-slate-500">{Math.round(player.projection_final)} pts</div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Value Leaders */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Best Value</CardTitle>
              <CardDescription>Top value picks from {teamName}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {valueLeaders.map(player => {
                  if (player.is_locked) {
                    return (
                      <div key={player.player_name} className="mb-2">
                        <LockedPlayerCard
                          playerName={player.player_name}
                          team={teamName}
                          position={player.position}
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
                      <div>
                        <div className="font-semibold text-sm text-slate-900">{player.player_name}</div>
                        <div className="text-xs text-slate-500">{player.position}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-sm font-bold text-green-600">{Math.round(player.value_score)}</div>
                          <div className="text-xs text-slate-500">value</div>
                        </div>
                        <ChevronRight className="h-3 w-3 text-slate-400 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Captain Options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Captain Options
              </CardTitle>
              <CardDescription>Premium players from {teamName}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {captainOptions.length > 0 ? (
                  captainOptions.map(player => {
                    if (player.is_locked) {
                      return (
                        <div key={player.player_name} className="mb-2">
                          <LockedPlayerCard
                            playerName={player.player_name}
                            team={teamName}
                            position={player.position}
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
                        <div>
                          <div className="font-semibold text-sm text-slate-900">{player.player_name}</div>
                          <div className="text-xs text-slate-500">{player.position}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="text-sm font-bold text-green-600">{Math.round(player.projection_final)}</div>
                            <div className="text-xs text-slate-500">projected</div>
                          </div>
                          <ChevronRight className="h-3 w-3 text-slate-400 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <div className="text-sm text-slate-500 text-center py-4">
                    No premium captain options available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* View All Players */}
        <Card>
          <CardHeader>
            <CardTitle>View Complete Roster</CardTitle>
          </CardHeader>
          <CardContent>
            <Link to="/sports/afl/rankings">
              <Button className="w-full">
                View Full AFL Rankings
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
