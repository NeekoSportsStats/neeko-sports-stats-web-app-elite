import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, Lock } from 'lucide-react';

interface Player {
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  price: number;
  projection_final: number;
  value_score: number;
  ai_recommendation: string;
  recommendation_color: string;
  recommendation_why: string | null;
  is_locked: boolean;
}

const MarketWatch = () => {
  // PART 3: SAFE DATA FETCHING - Handle loading, empty, error states
  const { data: players, isLoading, error } = useQuery({
    queryKey: ['market-watch'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_rankings_master')
        .select(`
          player_id,
          player_name,
          team,
          position,
          price,
          projection_final,
          value_score,
          ai_recommendation,
          recommendation_color,
          recommendation_why,
          is_locked
        `)
        .order('value_score', { ascending: false })
        .limit(8); // FIX: Correct LIMIT of 8 for free tier

      if (error) throw error;
      return data as Player[];
    },
    staleTime: 5 * 60 * 1000, // PART 5: Performance - cache for 5 minutes
  });

  // PART 3: ADD FULL DATA GUARDS - Show skeleton if loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-slate-900 mb-6">Market Watch</h1>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="bg-white rounded-lg p-6 animate-pulse">
                <div className="h-6 bg-slate-200 rounded w-1/4 mb-3"></div>
                <div className="h-4 bg-slate-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // PART 3: ADD FULL DATA GUARDS - Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-800 font-semibold mb-2">Failed to load market data</p>
            <p className="text-red-600 text-sm">{error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        </div>
      </div>
    );
  }

  // PART 3: ADD FULL DATA GUARDS - Show empty state if no data
  if (!players || players.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-slate-900 mb-6">Market Watch</h1>
          <div className="bg-white rounded-lg p-12 text-center">
            <p className="text-slate-500 text-lg">No player data available</p>
          </div>
        </div>
      </div>
    );
  }

  // PART 3: FIX DUPLICATES - Remove duplicates by player_id before render
  const uniquePlayers = Array.from(
    new Map(players.map(p => [p.player_id, p])).values()
  );

  // PART 3: FIX VALUE LOGIC - Sort by value_score directly from rankings cache
  const sortedPlayers = [...uniquePlayers].sort((a, b) =>
    (b.value_score || 0) - (a.value_score || 0)
  );

  const getRecommendationIcon = (color: string) => {
    if (color === 'green') return <TrendingUp className="w-5 h-5 text-green-600" />;
    if (color === 'red') return <TrendingDown className="w-5 h-5 text-red-600" />;
    return null;
  };

  const getRecommendationStyle = (color: string) => {
    if (color === 'green') return 'bg-green-500/10 text-green-700 border-green-500/20';
    if (color === 'red') return 'bg-red-500/10 text-red-700 border-red-500/20';
    return 'bg-slate-500/10 text-slate-700 border-slate-500/20';
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Market Watch</h1>
          <p className="text-slate-600">Top value players ranked by AI analysis</p>
        </div>

        <div className="space-y-4">
          {/* PART 3: ENSURE SAFE MAPPING - Use optional chaining */}
          {sortedPlayers?.map((player) => (
            // PART 3: FIX DUPLICATES - Use player_id as unique key
            <div
              key={player.player_id}
              className="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    {/* PART 3: PREVENT CRASHES - Safe access to nested properties */}
                    <h3 className="text-xl font-bold text-slate-900">
                      {player.player_name || 'Unknown Player'}
                    </h3>

                    {player.is_locked && (
                      <Lock className="w-4 h-4 text-amber-500" />
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-slate-600 mb-4">
                    <span className="font-medium">{player.team || 'No Team'}</span>
                    <span>•</span>
                    <span>{player.position || 'Unknown'}</span>
                    <span>•</span>
                    {/* PART 3: PREVENT CRASHES - Handle NaN values */}
                    <span className="font-bold text-slate-900">
                      ${player.price?.toLocaleString() || '0'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Projection</div>
                      {/* PART 3: PREVENT CRASHES - Safe number display */}
                      <div className="text-lg font-bold text-slate-900">
                        {player.projection_final != null ? Math.round(player.projection_final) : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Value Score</div>
                      {/* PART 3: FIX VALUE LOGIC - Display value_score from rankings cache */}
                      <div className="text-lg font-bold text-green-600">
                        {player.value_score != null ? Math.round(player.value_score) : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Recommendation</div>
                      <div className="flex items-center gap-1">
                        {getRecommendationIcon(player.recommendation_color)}
                        <span className="text-sm font-semibold">
                          {player.ai_recommendation || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* PART 3: FIX WHY TEXT CUT OFF - Proper text wrapping */}
                  {player.recommendation_why && !player.is_locked && (
                    <div className={`mt-4 p-3 rounded-lg border ${getRecommendationStyle(player.recommendation_color)}`}>
                      {/* No overflow hidden - text wraps correctly */}
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {player.recommendation_why}
                      </p>
                    </div>
                  )}

                  {player.is_locked && (
                    <div className="mt-4 p-3 rounded-lg bg-slate-100 border border-slate-200">
                      <p className="text-sm text-slate-600 flex items-center gap-2">
                        <Lock className="w-4 h-4" />
                        Upgrade to premium to see full analysis
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Show count for verification */}
        <div className="mt-6 text-center text-sm text-slate-500">
          Showing {sortedPlayers.length} of 8 top value players
        </div>
      </div>
    </div>
  );
};

export default MarketWatch;
