import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronRight, TrendingUp, Users } from 'lucide-react';
import { nameToSlug, POSITION_NAMES, TEAM_SLUG_TO_NAME } from '@/lib/slugs';
import { getTeamPlayersSafe } from '@/lib/playerAccess';
import { useAuth } from '@/lib/auth';

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

export default function AFLTeamPage() {
  const { team } = useParams<{ team: string }>();
  const teamName = team ? TEAM_SLUG_TO_NAME[team] : '';
  const { user } = useAuth();
  const navigate = useNavigate();

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
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center">
        <Skeleton className="h-96 w-full max-w-lg rounded-lg bg-white/5" />
      </div>
    );
  }

  if (error || !players || !teamName) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-white mb-2">Team Not Found</h2>
          <p className="text-white/50 mb-6">Could not find team: {teamName}</p>
          <Link to="/sports/afl/rankings">
            <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Rankings
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const topPlayers = players.slice(0, 10);
  const avgProjection = players.length > 0
    ? Math.round(players.reduce((sum, p) => sum + (p.projection_final || 0), 0) / players.length)
    : 0;

  const topProjection = players.length > 0 ? Math.round(players[0].projection_final) : 0;

  const pageTitle = `${teamName} AFL Fantasy Players & Rankings 2026 | Neeko`;
  const pageDescription = `Complete ${teamName} AFL Fantasy roster for 2026. Top players, projections, value picks, and captain options. ${players.length} players ranked with AI-powered recommendations.`;
  const pageUrl = `https://neeko.com.au/sports/afl/teams/${team}`;

  const getRecommendationColor = (color: string) => {
    if (color === 'green') return '#22c55e';
    if (color === 'red') return '#ef4444';
    return '#94a3b8';
  };

  const formatPrice = (price: number) => {
    return `$${Math.round(price / 1000)}k`;
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

      <div className="min-h-screen bg-[#0e0e0e]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/* Back Button */}
          <button
            onClick={() => navigate('/sports/afl/rankings')}
            className="mb-4 flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors text-sm"
          >
            <ArrowLeft size={16} />
            Back to Rankings
          </button>

          {/* Team Header */}
          <div className="mb-6 pb-4 border-b border-white/5">
            <h1 className="text-2xl font-semibold text-white mb-2">{teamName}</h1>
            <p className="text-base text-white/50">AFL Fantasy 2026 Team Overview</p>
          </div>

          {/* Team Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="rounded-2xl bg-[#111] border border-white/10 px-4 py-4 shadow-sm">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">Total Players</p>
              <p className="text-2xl font-bold text-white">{players.length}</p>
            </div>
            <div className="rounded-2xl bg-[#111] border border-white/10 px-4 py-4 shadow-sm">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">Top Projection</p>
              <p className="text-2xl font-bold text-emerald-400">{topProjection}</p>
            </div>
            <div className="rounded-2xl bg-[#111] border border-white/10 px-4 py-4 shadow-sm">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">Avg Projection</p>
              <p className="text-2xl font-bold text-white/70">{avgProjection}</p>
            </div>
          </div>

          {/* Top 10 Players */}
          <div className="mb-6">
            <h2 className="text-base font-semibold text-white mb-4">Top 10 Players</h2>
            <div className="space-y-2">
              {topPlayers.map((player, idx) => {
                const recColor = getRecommendationColor(player.recommendation_color);
                return (
                  <Link
                    key={player.player_name}
                    to={`/sports/afl/players/${nameToSlug(player.player_name)}`}
                    className="flex items-center justify-between rounded-xl bg-[#111] border border-white/10 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-150 px-4 py-5"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="text-lg font-bold text-white/25 w-8 shrink-0 text-center">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate mb-0.5">{player.player_name}</p>
                        <p className="text-xs text-white/40">{POSITION_NAMES[player.position]}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className="text-base font-bold text-emerald-400 mb-0.5">{Math.round(player.projection_final)}</p>
                        <p className="text-[10px] text-white/40">{formatPrice(player.price)}</p>
                      </div>
                      {player.value_score != null && (
                        <div className="text-right hidden sm:block">
                          <p className="text-[10px] text-white/40 mb-0.5">Value</p>
                          <p className="text-sm font-semibold text-emerald-400">{Math.round(player.value_score)}</p>
                        </div>
                      )}
                      {player.ai_recommendation && (
                        <div
                          className="hidden md:flex items-center justify-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide"
                          style={{
                            background: `${recColor}18`,
                            color: recColor,
                            border: `1px solid ${recColor}40`
                          }}
                        >
                          {player.ai_recommendation}
                        </div>
                      )}
                      <ChevronRight size={18} className="text-white/30" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Full Team List */}
          {players.length > 10 && (
            <div className="mb-6">
              <h2 className="text-base font-semibold text-white mb-4">Full Roster</h2>
              <div className="space-y-2">
                {players.slice(10).map((player, idx) => {
                  const recColor = getRecommendationColor(player.recommendation_color);
                  return (
                    <Link
                      key={player.player_name}
                      to={`/sports/afl/players/${nameToSlug(player.player_name)}`}
                      className="flex items-center justify-between rounded-xl bg-[#111] border border-white/10 hover:bg-white/[0.05] hover:border-white/20 transition-all duration-150 px-4 py-4"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="text-base font-bold text-white/20 w-8 shrink-0 text-center">
                          {idx + 11}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white/90 truncate mb-0.5">{player.player_name}</p>
                          <p className="text-xs text-white/40">{POSITION_NAMES[player.position]}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <p className="text-base font-semibold text-white/70 mb-0.5">{Math.round(player.projection_final)}</p>
                          <p className="text-[10px] text-white/30">{formatPrice(player.price)}</p>
                        </div>
                        {player.value_score != null && (
                          <div className="text-right hidden sm:block">
                            <p className="text-[10px] text-white/40 mb-0.5">Value</p>
                            <p className="text-sm font-semibold text-white/60">{Math.round(player.value_score)}</p>
                          </div>
                        )}
                        {player.ai_recommendation && (
                          <div
                            className="hidden md:flex items-center justify-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide"
                            style={{
                              background: `${recColor}18`,
                              color: recColor,
                              border: `1px solid ${recColor}40`
                            }}
                          >
                            {player.ai_recommendation}
                          </div>
                        )}
                        <ChevronRight size={18} className="text-white/25" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottom CTA */}
          <div className="pt-6 mt-4 border-t border-white/10">
            <Link
              to="/sports/afl/rankings"
              className="flex items-center justify-center gap-2 rounded-xl bg-[#F5C84C] hover:bg-[#F5C84C]/90 text-black transition-all duration-150 px-6 py-4 font-bold text-sm w-full shadow-lg shadow-[#F5C84C]/20"
            >
              See full model rankings
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
