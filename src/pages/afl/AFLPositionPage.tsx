import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronRight, TrendingUp, Shield, Zap, Target } from 'lucide-react';
import { nameToSlug, POSITION_NAMES, POSITION_SLUG_TO_CODE } from '@/lib/slugs';
import { useAuth } from '@/lib/auth';
import { getPositionPlayersSafe } from '@/lib/playerAccess';

interface PositionPlayer {
  player_id?: number;
  player_name: string;
  team: string;
  neeko_rating: number;
  projection_final: number;
  projection_confidence: number | null;
  value_score: number | null;
  price: number;
  ai_recommendation: string | null;
  recommendation_color: string | null;
  upside_pct: number | null;
  is_locked?: boolean;
}

export default function AFLPositionPage() {
  const { position } = useParams<{ position: string }>();
  const positionCode = position ? POSITION_SLUG_TO_CODE[position] : '';
  const positionName = positionCode ? POSITION_NAMES[positionCode] : '';
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: players, isLoading, error } = useQuery({
    queryKey: ['position-players-safe', positionCode, user?.id],
    queryFn: async () => {
      return await getPositionPlayersSafe(positionCode, user?.id ?? null, 50) as PositionPlayer[];
    },
    enabled: !!positionCode,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center">
        <Skeleton className="h-96 w-full max-w-lg rounded-lg bg-white/5" />
      </div>
    );
  }

  if (error || !players || !positionName) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-white mb-2">Position Not Found</h2>
          <p className="text-white/50 mb-6">Could not find position: {position}</p>
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

  const bestValue = [...players]
    .filter(p => p.value_score && p.value_score > 0)
    .sort((a, b) => (b.value_score || 0) - (a.value_score || 0))
    .slice(0, 5);

  const safestPicks = [...players]
    .filter(p => p.projection_confidence && p.projection_confidence >= 65)
    .sort((a, b) => (b.projection_confidence || 0) - (a.projection_confidence || 0))
    .slice(0, 5);

  const highUpside = [...players]
    .filter(p => (p.upside_pct || 0) > 15)
    .sort((a, b) => (b.upside_pct || 0) - (a.upside_pct || 0))
    .slice(0, 5);

  const topProjection = players.length > 0 ? Math.round(players[0].projection_final) : 0;
  const premiumCount = players.filter(p => p.neeko_rating >= 100).length;

  const pageTitle = `Best AFL Fantasy ${positionName} 2026 Rankings & Projections | Neeko`;
  const pageDescription = `Top ${positionName} for AFL Fantasy 2026. ${players.length} ${positionName.toLowerCase()} ranked with projections, value scores, and AI recommendations. Find the best picks for your team.`;
  const pageUrl = `https://neeko.com.au/sports/afl/positions/${position}`;

  const getRecommendationColor = (color: string | null) => {
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
        <meta name="keywords" content={`AFL Fantasy, ${positionName}, ${positionCode}, rankings, projections, value, 2026 season`} />
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

          {/* Position Header */}
          <div className="mb-6 pb-4 border-b border-white/5">
            <h1 className="text-2xl font-semibold text-white mb-2">AFL Fantasy {positionName} 2026</h1>
            <p className="text-base text-white/50">Complete rankings for {positionName.toLowerCase()}</p>
          </div>

          {/* Position Stats */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            <div className="rounded-lg bg-white/5 px-3 py-3">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Total Players</p>
              <p className="text-lg font-bold text-white">{players.length}</p>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-3">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Top Projection</p>
              <p className="text-lg font-bold text-[#F5C84C]">{topProjection}</p>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-3">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Premium</p>
              <p className="text-lg font-bold text-emerald-400">{premiumCount}</p>
            </div>
          </div>

          {/* Highlight Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {/* Best Value */}
            <div className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-emerald-400" />
                <h3 className="text-xs font-semibold text-white/70">Best Value</h3>
              </div>
              <div className="space-y-1.5">
                {bestValue.slice(0, 3).map((player) => (
                  <Link
                    key={player.player_name}
                    to={`/sports/afl/players/${nameToSlug(player.player_name)}`}
                    className="flex items-center justify-between p-2 rounded bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white/80 truncate">{player.player_name}</p>
                      <p className="text-[10px] text-white/30">{player.team}</p>
                    </div>
                    <p className="text-xs font-bold text-emerald-400 ml-2">{Math.round(player.value_score || 0)}</p>
                  </Link>
                ))}
              </div>
            </div>

            {/* Safest Picks */}
            <div className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={14} className="text-blue-400" />
                <h3 className="text-xs font-semibold text-white/70">Safest Picks</h3>
              </div>
              <div className="space-y-1.5">
                {safestPicks.slice(0, 3).map((player) => (
                  <Link
                    key={player.player_name}
                    to={`/sports/afl/players/${nameToSlug(player.player_name)}`}
                    className="flex items-center justify-between p-2 rounded bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white/80 truncate">{player.player_name}</p>
                      <p className="text-[10px] text-white/30">{player.team}</p>
                    </div>
                    <p className="text-xs font-bold text-blue-400 ml-2">{Math.round(player.projection_confidence || 0)}%</p>
                  </Link>
                ))}
              </div>
            </div>

            {/* High Upside */}
            <div className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={14} className="text-orange-400" />
                <h3 className="text-xs font-semibold text-white/70">High Upside</h3>
              </div>
              <div className="space-y-1.5">
                {highUpside.slice(0, 3).map((player) => (
                  <Link
                    key={player.player_name}
                    to={`/sports/afl/players/${nameToSlug(player.player_name)}`}
                    className="flex items-center justify-between p-2 rounded bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white/80 truncate">{player.player_name}</p>
                      <p className="text-[10px] text-white/30">{player.team}</p>
                    </div>
                    <p className="text-xs font-bold text-orange-400 ml-2">+{Math.round(player.upside_pct || 0)}%</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Full Rankings List */}
          <div className="mb-6">
            <h2 className="text-base font-semibold text-white mb-3">Top 50 {positionName}</h2>
            <div className="space-y-2">
              {players.map((player, idx) => {
                const recColor = getRecommendationColor(player.recommendation_color);
                return (
                  <Link
                    key={player.player_name}
                    to={`/sports/afl/players/${nameToSlug(player.player_name)}`}
                    className="flex items-center justify-between rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all px-3 py-3"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="text-base font-bold text-white/20 w-6 shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{player.player_name}</p>
                        <p className="text-xs text-white/40">{player.team}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {player.ai_recommendation && (
                        <div
                          className="hidden sm:flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-semibold"
                          style={{
                            background: `${recColor}18`,
                            color: recColor,
                            border: `1px solid ${recColor}40`
                          }}
                        >
                          {player.ai_recommendation}
                        </div>
                      )}
                      <div className="text-right">
                        <p className="text-sm font-bold text-[#F5C84C]">{Math.round(player.projection_final)}</p>
                        <p className="text-[10px] text-white/30">{formatPrice(player.price)}</p>
                      </div>
                      <ChevronRight size={16} className="text-white/20" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="pt-4 mt-2 border-t border-white/5">
            <Link
              to="/sports/afl/rankings"
              className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/8 text-white/70 hover:text-white transition-all px-4 py-3 font-medium text-sm"
            >
              <Target size={14} />
              View All Rankings
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
