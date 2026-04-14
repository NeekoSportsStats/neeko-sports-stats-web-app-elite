import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronRight, TrendingUp, Shield, Zap } from 'lucide-react';
import { nameToSlug, POSITION_NAMES, POSITION_SLUG_TO_CODE } from '@/lib/slugs';
import { useAuth } from '@/lib/auth';
import { getPositionPlayersSafe } from '@/lib/playerAccess';
import { fmtEdge, getEdgeColor } from '@/features/afl/rankings/components/helpers';

interface PositionPlayer {
  player_id?: number;
  player_name: string;
  team: string;
  neeko_rating: number;
  projection: number;
  confidence_label: string | null;
  edge_canonical: number | null;
  action_canonical: string | null;
  price: number;
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
    .filter(p => p.edge_canonical != null && p.edge_canonical > 0)
    .sort((a, b) => (b.edge_canonical ?? 0) - (a.edge_canonical ?? 0))
    .slice(0, 5);

  const safestPicks = [...players]
    .filter(p => p.confidence_label?.toUpperCase() === 'HIGH' || p.confidence_label?.toUpperCase() === 'MEDIUM')
    .sort((a, b) => {
      const aHigh = a.confidence_label?.toUpperCase() === 'HIGH' ? 2 : 1;
      const bHigh = b.confidence_label?.toUpperCase() === 'HIGH' ? 2 : 1;
      if (bHigh !== aHigh) return bHigh - aHigh;
      return (b.projection ?? 0) - (a.projection ?? 0);
    })
    .slice(0, 5);

  const highUpside = [...players]
    .filter(p => (p.upside_pct || 0) > 15)
    .sort((a, b) => (b.upside_pct || 0) - (a.upside_pct || 0))
    .slice(0, 5);

  const topProjection = players.length > 0 ? Math.round(players[0].projection) : 0;
  const premiumCount = players.filter(p => p.neeko_rating >= 100).length;

  const pageTitle = `Best AFL Fantasy ${positionName} 2026 Rankings & Projections | Neeko`;
  const pageDescription = `Top ${positionName} for AFL Fantasy 2026. ${players.length} ${positionName.toLowerCase()} ranked with projections, edge scores, and AI recommendations. Find the best picks for your team.`;
  const pageUrl = `https://neekostats.com.au/sports/afl/positions/${position}`;

  const formatPrice = (price: number) => {
    return `$${Math.round(price / 1000)}k`;
  };

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content={`AFL Fantasy ${positionName}, best ${positionName} AFL Fantasy 2026, ${positionCode} rankings, ${positionName} projections, value ${positionName}, AFL Fantasy picks 2026`} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta property="og:site_name" content="Neeko Sports" />
        <link rel="canonical" href={pageUrl} />
        <meta name="robots" content="index, follow" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <meta name="twitter:image" content="https://neekostats.com.au/og-default.png" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "name": pageTitle,
          "description": pageDescription,
          "url": pageUrl,
          "dateModified": new Date().toISOString().slice(0, 10),
          "publisher": { "@type": "Organization", "name": "Neeko Sports", "url": "https://neekostats.com.au" },
          "breadcrumb": {
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://neekostats.com.au" },
              { "@type": "ListItem", "position": 2, "name": "AFL Fantasy Rankings", "item": "https://neekostats.com.au/sports/afl/rankings" },
              { "@type": "ListItem", "position": 3, "name": `Best ${positionName}`, "item": pageUrl }
            ]
          }
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-[#0e0e0e]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <button
            onClick={() => navigate('/sports/afl/rankings')}
            className="mb-4 flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors text-sm"
          >
            <ArrowLeft size={16} />
            Back to Rankings
          </button>

          <div className="mb-6 pb-4 border-b border-white/5">
            <h1 className="text-2xl font-semibold text-white mb-2">AFL Fantasy {positionName} 2026</h1>
            <p className="text-base text-white/50">Complete rankings for {positionName.toLowerCase()}</p>
          </div>

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
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">Premium</p>
              <p className="text-2xl font-bold text-white/70">{premiumCount}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="rounded-2xl bg-[#111] border border-white/10 px-4 py-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={15} className="text-emerald-400" />
                <h3 className="text-xs font-bold text-white/80 uppercase tracking-wider">Best Edge</h3>
              </div>
              <div className="space-y-2">
                {bestValue.slice(0, 3).map((player) => (
                  <Link
                    key={player.player_name}
                    to={`/sports/afl/players/${nameToSlug(player.player_name)}`}
                    className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] transition-all duration-150 border border-white/5 hover:border-white/10"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{player.player_name}</p>
                      <p className="text-[10px] text-white/40">{player.team}</p>
                    </div>
                    <p className={`text-sm font-bold ml-2 ${getEdgeColor(player.edge_canonical)}`}>{fmtEdge(player.edge_canonical)}</p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-[#111] border border-white/10 px-4 py-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Shield size={15} className="text-blue-400" />
                <h3 className="text-xs font-bold text-white/80 uppercase tracking-wider">Safest Picks</h3>
              </div>
              <div className="space-y-2">
                {safestPicks.slice(0, 3).map((player) => (
                  <Link
                    key={player.player_name}
                    to={`/sports/afl/players/${nameToSlug(player.player_name)}`}
                    className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] transition-all duration-150 border border-white/5 hover:border-white/10"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{player.player_name}</p>
                      <p className="text-[10px] text-white/40">{player.team}</p>
                    </div>
                    <p className="text-sm font-bold text-blue-400 ml-2">{player.confidence_label ?? '—'}</p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-[#111] border border-white/10 px-4 py-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={15} className="text-orange-400" />
                <h3 className="text-xs font-bold text-white/80 uppercase tracking-wider">High Upside</h3>
              </div>
              <div className="space-y-2">
                {highUpside.slice(0, 3).map((player) => (
                  <Link
                    key={player.player_name}
                    to={`/sports/afl/players/${nameToSlug(player.player_name)}`}
                    className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] transition-all duration-150 border border-white/5 hover:border-white/10"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{player.player_name}</p>
                      <p className="text-[10px] text-white/40">{player.team}</p>
                    </div>
                    <p className="text-sm font-bold text-orange-400 ml-2">+{Math.round(player.upside_pct || 0)}%</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-base font-semibold text-white mb-4">Top 50 {positionName}</h2>
            <div className="space-y-2">
              {players.map((player, idx) => {
                const ac = (player.action_canonical ?? "HOLD").toUpperCase();
                const badgeCls =
                  ac === "START" ? "bg-green-500/15 text-green-400 border-green-500/30" :
                  ac === "SIT"   ? "bg-orange-400/10 text-orange-300 border-orange-400/20" :
                                  "bg-yellow-400/10 text-yellow-300 border-yellow-400/20";
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
                        <p className="text-xs text-white/40">{player.team}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className="text-base font-bold text-emerald-400 mb-0.5">{Math.round(player.projection)}</p>
                        <p className="text-[10px] text-white/40">{formatPrice(player.price)}</p>
                      </div>
                      {player.edge_canonical != null && (
                        <div className="text-right hidden sm:block">
                          <p className="text-[10px] text-white/40 mb-0.5">Edge</p>
                          <p className={`text-sm font-semibold ${getEdgeColor(player.edge_canonical)}`}>{fmtEdge(player.edge_canonical)}</p>
                        </div>
                      )}
                      {!player.is_locked && (
                        <div className={`hidden md:flex items-center justify-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border ${badgeCls}`}>
                          {ac}
                        </div>
                      )}
                      <ChevronRight size={18} className="text-white/30" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

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
