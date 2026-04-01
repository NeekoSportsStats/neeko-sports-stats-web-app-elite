/**
 * Elite AFL Position Page
 * Uses design system for consistent UX
 */

import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ChevronRight, Users, TrendingUp, Award, Target } from 'lucide-react';
import { POSITION_NAMES } from '@/lib/slugs';
import { getPositionPlayersSafe } from '@/lib/playerAccess';
import { useAuth } from '@/lib/auth';
import { PlayerCard, PlayerCardSkeleton } from '@/lib/design-system';
import { COLORS, SPACING } from '@/lib/design-system/constants';
import { Button } from '@/components/ui/button';

interface PositionPlayer {
  player_id?: number;
  player_name: string;
  team: string;
  position: string;
  neeko_rating: number;
  projection_final: number;
  value_score: number;
  price: number;
  prev_price?: number;
  price_change?: number;
  ai_recommendation: string;
  recommendation_color: string;
  is_locked?: boolean;
}

export default function AFLPositionPageElite() {
  const { position } = useParams<{ position: string }>();
  const navigate = useNavigate();
  const positionName = position ? POSITION_NAMES[position.toUpperCase()] : '';
  const { user, isPremium } = useAuth();

  const { data: players, isLoading, error } = useQuery({
    queryKey: ['position-players-safe', position, user?.id],
    queryFn: async () => {
      if (!position) return [];
      const data = await getPositionPlayersSafe(position.toUpperCase(), user?.id ?? null);
      return data as PositionPlayer[];
    },
    enabled: !!position,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="h-4 w-32 bg-white/5 rounded mb-6 animate-pulse" />
        <div className="h-10 w-64 bg-white/5 rounded mb-8 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <PlayerCardSkeleton key={i} variant="compact" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !players || !positionName) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Button variant="ghost" onClick={() => navigate('/sports/afl/rankings')} className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Rankings
        </Button>
        <div className="rounded-xl border p-8 text-center" style={{
          borderColor: 'rgba(255, 255, 255, 0.1)',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
        }}>
          <h2 className="text-xl font-bold text-white mb-2">Position Not Found</h2>
          <p className="text-white/50">The position you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  const sortedPlayers = [...players].sort((a, b) => (b.neeko_rating || 0) - (a.neeko_rating || 0));
  const avgProjection = players.length > 0
    ? Math.round(players.reduce((sum, p) => sum + (p.projection_final || 0), 0) / players.length)
    : 0;
  const topRated = sortedPlayers.slice(0, 3);
  const valueLeaders = [...players]
    .filter(p => p.value_score > 0)
    .sort((a, b) => (b.value_score || 0) - (a.value_score || 0))
    .slice(0, 3);
  const premiumCount = players.filter(p => p.neeko_rating >= 100).length;

  const pageTitle = `${positionName} AFL Fantasy Players & Rankings 2026 | Neeko`;
  const pageDescription = `Complete ${positionName} AFL Fantasy rankings for 2026. Top players, projections, value picks, and captain options. ${players.length} ${positionName} players ranked with AI-powered recommendations.`;
  const pageUrl = `https://neeko.com.au/sports/afl/positions/${position}`;

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content={`${positionName}, AFL Fantasy, position rankings, 2026 season`} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <link rel="canonical" href={pageUrl} />
        <meta name="robots" content="index, follow" />
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Breadcrumbs */}
        <nav className="mb-4 text-sm" style={{ color: COLORS.textMuted }}>
          <ol className="flex items-center gap-2">
            <li><Link to="/" className="hover:text-white/70 transition-colors">Home</Link></li>
            <ChevronRight className="h-3 w-3" />
            <li><Link to="/sports/afl/rankings" className="hover:text-white/70 transition-colors">AFL</Link></li>
            <ChevronRight className="h-3 w-3" />
            <li style={{ color: COLORS.textPrimary }} className="font-medium">{positionName}</li>
          </ol>
        </nav>

        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => navigate('/sports/afl/rankings')}
          className="mb-6"
          style={{ color: COLORS.textSecondary }}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Rankings
        </Button>

        {/* Position Header Hero */}
        <div className="rounded-2xl border p-8 mb-8" style={{
          borderColor: 'rgba(255, 255, 255, 0.05)',
          backgroundColor: 'rgba(255, 255, 255, 0.01)',
        }}>
          <h1 className="text-4xl font-bold mb-3 text-white tracking-tight">
            {positionName}
          </h1>
          <p className="text-white/50 mb-6">AFL Fantasy 2026 Position Rankings</p>

          {/* Key Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-white/40" />
                <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">Total Players</span>
              </div>
              <div className="text-3xl font-bold text-white">{players.length}</div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4" style={{ color: COLORS.success }} />
                <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">Avg Projection</span>
              </div>
              <div className="text-3xl font-bold" style={{ color: COLORS.success }}>{avgProjection}</div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Award className="h-4 w-4" style={{ color: COLORS.primary }} />
                <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">Premium Options</span>
              </div>
              <div className="text-3xl font-bold" style={{ color: COLORS.primary }}>{premiumCount}</div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-green-400" />
                <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">Value Plays</span>
              </div>
              <div className="text-3xl font-bold text-green-400">{valueLeaders.length}</div>
            </div>
          </div>
        </div>

        {/* Top Rated Section */}
        {topRated.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Award className="h-5 w-5" style={{ color: COLORS.primary }} />
              Top Rated {positionName}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topRated.map((player) => (
                <PlayerCard
                  key={player.player_id ?? player.player_name}
                  playerId={player.player_id}
                  playerName={player.player_name}
                  team={player.team}
                  position={player.position}
                  price={player.price}
                  projection={player.projection_final}
                  neekoRating={player.neeko_rating}
                  aiRecommendation={player.ai_recommendation}
                  priceChange={player.price_change}
                  valueScore={player.value_score}
                  isLocked={player.is_locked ?? false}
                  variant="compact"
                  returnPath={`/sports/afl/positions/${position}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Value Leaders Section */}
        {valueLeaders.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-400" />
              Best Value Picks
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {valueLeaders.map((player) => (
                <PlayerCard
                  key={player.player_id ?? player.player_name}
                  playerId={player.player_id}
                  playerName={player.player_name}
                  team={player.team}
                  position={player.position}
                  price={player.price}
                  projection={player.projection_final}
                  neekoRating={player.neeko_rating}
                  aiRecommendation={player.ai_recommendation}
                  priceChange={player.price_change}
                  valueScore={player.value_score}
                  isLocked={player.is_locked ?? false}
                  variant="compact"
                  returnPath={`/sports/afl/positions/${position}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* All Players */}
        <div>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-white/40" />
            All {positionName} Players
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedPlayers.map((player) => (
              <PlayerCard
                key={player.player_id ?? player.player_name}
                playerId={player.player_id}
                playerName={player.player_name}
                team={player.team}
                position={player.position}
                price={player.price}
                projection={player.projection_final}
                neekoRating={player.neeko_rating}
                aiRecommendation={player.ai_recommendation}
                priceChange={player.price_change}
                valueScore={player.value_score}
                isLocked={player.is_locked ?? false}
                variant="compact"
                returnPath={`/sports/afl/positions/${position}`}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
