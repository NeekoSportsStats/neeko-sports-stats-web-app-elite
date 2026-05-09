import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/lib/supabaseClient";
import { TrendingUp, Star, TriangleAlert as AlertTriangle, Target, ArrowRight } from "lucide-react";
import { signalFromField, formatEdgeSignalLabel, getEdgeSignalColor } from "@/utils/aflEdgeSignal";
import { playerToSlug } from "@/lib/slugs";

interface RoundPlayer {
  player_id: string;
  player_name: string;
  team: string;
  position: string;
  neeko_rating: number | null;
  projected_score: number | null;
  current_price: number | null;
  value_score: number | null;
  signal: string | null;
  breakeven: number | null;
  season_avg: number | null;
}

const POSITIONS = ["MID", "FWD", "DEF", "RUC"];

function formatPrice(p: number | null) {
  if (!p) return "—";
  return `$${(p / 1000).toFixed(0)}k`;
}

function formatScore(s: number | null) {
  if (s === null || s === undefined) return "—";
  return Math.round(s).toString();
}

function RecommendationBadge({ signal }: { signal: string | null }) {
  const sig = signalFromField(signal);
  const color = getEdgeSignalColor(sig);
  const label = formatEdgeSignalLabel(sig);
  return (
    <span
      className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border"
      style={{ background: `${color}18`, color, borderColor: `${color}40` }}
    >
      {label}
    </span>
  );
}

export default function AFLRoundPage() {
  const { roundNumber } = useParams<{ roundNumber: string }>();
  const roundNum = parseInt(roundNumber ?? "0", 10);

  const [players, setPlayers] = useState<RoundPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePos, setActivePos] = useState<string>("MID");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    supabase
      .rpc("get_rankings_safe", { p_limit: 300, p_offset: 0 })
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setPlayers((data as RoundPlayer[]) ?? []);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [roundNum]);

  const byPos = (pos: string) =>
    players
      .filter((p) => (p.position ?? "").toUpperCase() === pos)
      .sort((a, b) => (b.projected_score ?? 0) - (a.projected_score ?? 0))
      .slice(0, 10);

  const topCaptains = players
    .filter((p) => (p.neeko_rating ?? 0) >= 70)
    .sort((a, b) => (b.projected_score ?? 0) - (a.projected_score ?? 0))
    .slice(0, 5);

  const topValue = players
    .filter((p) => (p.value_score ?? 0) > 0)
    .sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0))
    .slice(0, 5);

  const traps = players
    .filter((p) => {
      const s = signalFromField(p.signal);
      return s === 'SELL' || s === 'STRONG_SELL';
    })
    .sort((a, b) => (a.value_score ?? 0) - (b.value_score ?? 0))
    .slice(0, 5);

  const posPlayers = byPos(activePos);

  const title = roundNum
    ? `AFL Fantasy Round ${roundNum} Tips, Picks & Trade Targets | Neeko`
    : "AFL Fantasy Round Tips, Picks & Trade Targets | Neeko";
  const description = roundNum
    ? `AFL Fantasy Round ${roundNum} analysis — top picks, captain options, value plays, and trap alerts. Powered by Neeko's AI projection model.`
    : "AFL Fantasy round analysis — top picks, captain options, value plays and trap alerts. Powered by Neeko's AI projection model.";

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`https://neekostats.com.au/sports/afl/round/${roundNum || ""}`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={`https://neekostats.com.au/sports/afl/round/${roundNum || ""}`} />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta property="og:site_name" content="Neeko Sports Stats" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content="https://neekostats.com.au/og-default.png" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": title,
          "description": description,
          "url": `https://neekostats.com.au/sports/afl/round/${roundNum || ""}`,
          "datePublished": "2026-03-13",
          "dateModified": new Date().toISOString().slice(0, 10),
          "publisher": { "@type": "Organization", "name": "Neeko Sports Stats", "url": "https://neekostats.com.au" },
          "breadcrumb": {
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://neekostats.com.au" },
              { "@type": "ListItem", "position": 2, "name": "AFL Fantasy", "item": "https://neekostats.com.au/fantasy" },
              { "@type": "ListItem", "position": 3, "name": `Round ${roundNum}`, "item": `https://neekostats.com.au/sports/afl/round/${roundNum}` }
            ]
          }
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-[#070707] text-white">
        <div className="max-w-4xl mx-auto px-4 py-8 pb-24 space-y-8">

          {/* Header */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#F5C84C]/60">
                AFL Fantasy
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
              {roundNum ? `Round ${roundNum} Tips & Picks` : "Round Tips & Picks"}
            </h1>
            <p className="text-sm text-white/40 mt-1">
              AI-powered projections, trade targets, captain options and trap alerts for{roundNum ? ` Round ${roundNum}` : " the current round"}.
            </p>
          </div>

          {/* Intro SEO block */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-white mb-3">
                AFL Fantasy{roundNum ? ` Round ${roundNum}` : ""} — Full Round Analysis
              </h2>
              <p className="text-sm text-white/55 leading-relaxed">
                Every AFL Fantasy round brings new price changes, new matchups, and new
                opportunities. This page compiles Neeko's projection model outputs for{roundNum ? ` Round ${roundNum}` : " the current round"} —
                covering the best starting picks by position, top captain options, underpriced value
                targets, and overpriced players to avoid. All data is drawn from the rankings engine
                which factors in recent form, opponent concession rates, venue history, and role stability.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white/80 mb-2">How to use this page</h3>
              <ul className="space-y-2 text-sm text-white/50 leading-relaxed">
                <li><strong className="text-white/70">Position picks</strong> — Browse top 10 projected players at MID, FWD, DEF, and RUC to set your best lineup.</li>
                <li><strong className="text-white/70">Captain picks</strong> — The 5 players with the highest ceilings and strongest Neeko ratings. Double any of these for maximum upside.</li>
                <li><strong className="text-white/70">Value trades</strong> — Players whose projection significantly exceeds their current price — positive value profile before the market adjusts.</li>
                <li><strong className="text-white/70">Trap picks</strong> — Players to fade this round due to overpricing, poor matchup, or declining projection.</li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link to="/fantasy/market-watch" className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors underline underline-offset-2">
                Market Watch <ArrowRight size={11} />
              </Link>
              <Link to="/fantasy/current-week" className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors underline underline-offset-2">
                Edge Board <ArrowRight size={11} />
              </Link>
              <Link to="/fantasy/rankings" className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors underline underline-offset-2">
                Full Rankings <ArrowRight size={11} />
              </Link>
              <Link to="/fantasy/current-week" className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors underline underline-offset-2">
                Start / Sit Tool <ArrowRight size={11} />
              </Link>
            </div>
          </div>

          {/* Captain Picks */}
          <section>
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/[0.06]">
              <Star size={16} className="text-yellow-400" />
              <h2 className="text-lg font-bold text-white">Captain Picks</h2>
              <span className="text-xs text-white/30 ml-auto">Highest ceiling + Neeko Rating</span>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-white/[0.03] rounded-xl animate-pulse" />
                ))}
              </div>
            ) : topCaptains.length === 0 ? (
              <p className="text-sm text-white/30 py-4">Loading captain data...</p>
            ) : (
              <div className="space-y-2">
                {topCaptains.map((p, i) => (
                  <Link
                    key={p.player_id}
                    to={`/sports/afl/players/${playerToSlug(p.player_name, p.team)}`}
                    className="flex items-center gap-3 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
                  >
                    <span className="text-xs text-white/20 w-4 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{p.player_name}</div>
                      <div className="text-[11px] text-white/35">{p.team} · {p.position}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-white">{formatScore(p.projected_score)}</div>
                      <div className="text-[10px] text-white/30">projected</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Position Picks */}
          <section>
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/[0.06]">
              <Target size={16} className="text-white/50" />
              <h2 className="text-lg font-bold text-white">Top Picks by Position</h2>
            </div>
            <div className="flex gap-2 mb-4">
              {POSITIONS.map((pos) => (
                <button
                  key={pos}
                  onClick={() => setActivePos(pos)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    activePos === pos
                      ? "bg-white/10 text-white"
                      : "text-white/35 hover:text-white/60"
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
            {loading ? (
              <div className="space-y-2">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="h-12 bg-white/[0.03] rounded-xl animate-pulse" />
                ))}
              </div>
            ) : posPlayers.length === 0 ? (
              <p className="text-sm text-white/30 py-4">No {activePos} data available.</p>
            ) : (
              <div className="space-y-2">
                {posPlayers.map((p, i) => (
                  <Link
                    key={p.player_id}
                    to={`/sports/afl/players/${playerToSlug(p.player_name, p.team)}`}
                    className="flex items-center gap-3 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
                  >
                    <span className="text-xs text-white/20 w-4 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{p.player_name}</div>
                      <div className="text-[11px] text-white/35">{p.team}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <RecommendationBadge signal={p.signal} />
                      <div className="text-right">
                        <div className="text-sm font-bold text-white">{formatScore(p.projected_score)}</div>
                        <div className="text-[10px] text-white/30">{formatPrice(p.current_price)}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Value Plays */}
          <section>
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/[0.06]">
              <TrendingUp size={16} className="text-emerald-400" />
              <h2 className="text-lg font-bold text-white">Value Trade Targets</h2>
              <span className="text-xs text-white/30 ml-auto">Underpriced this round</span>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-white/[0.03] rounded-xl animate-pulse" />
                ))}
              </div>
            ) : topValue.length === 0 ? (
              <p className="text-sm text-white/30 py-4">Loading value data...</p>
            ) : (
              <div className="space-y-2">
                {topValue.map((p, i) => (
                  <Link
                    key={p.player_id}
                    to={`/sports/afl/players/${playerToSlug(p.player_name, p.team)}`}
                    className="flex items-center gap-3 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
                  >
                    <span className="text-xs text-white/20 w-4 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{p.player_name}</div>
                      <div className="text-[11px] text-white/35">{p.team} · {p.position}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-emerald-400">{(p.value_score ?? 0).toFixed(2)}</div>
                      <div className="text-[10px] text-white/30">value ratio</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-white/30 leading-relaxed">
              Value ratio = projection ÷ baseline. Above 1.05 = strong value, below 0.95 = overpriced.
              See the full <Link to="/fantasy/market-watch" className="text-white/50 underline underline-offset-2 hover:text-white transition-colors">Market Watch</Link> for all trade targets.
            </p>
          </section>

          {/* Trap Picks */}
          <section>
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/[0.06]">
              <AlertTriangle size={16} className="text-red-400" />
              <h2 className="text-lg font-bold text-white">Trap Picks — Players to Avoid</h2>
              <span className="text-xs text-white/30 ml-auto">Overpriced this round</span>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-white/[0.03] rounded-xl animate-pulse" />
                ))}
              </div>
            ) : traps.length === 0 ? (
              <p className="text-sm text-white/30 py-4">Loading trap data...</p>
            ) : (
              <div className="space-y-2">
                {traps.map((p, i) => (
                  <Link
                    key={p.player_id}
                    to={`/sports/afl/players/${playerToSlug(p.player_name, p.team)}`}
                    className="flex items-center gap-3 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
                  >
                    <span className="text-xs text-white/20 w-4 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{p.player_name}</div>
                      <div className="text-[11px] text-white/35">{p.team} · {p.position}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-red-400">{(p.value_score ?? 0).toFixed(2)}</div>
                      <div className="text-[10px] text-white/30">value ratio</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Footer SEO */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-3">
            <h3 className="text-sm font-semibold text-white">More AFL Fantasy Tools</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              <Link to="/fantasy/rankings" className="flex items-center justify-between bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors group">
                <span className="text-sm text-white/70 group-hover:text-white transition-colors">Full Player Rankings</span>
                <ArrowRight size={14} className="text-white/20 group-hover:text-white/60 transition-colors" />
              </Link>
              <Link to="/fantasy/market-watch" className="flex items-center justify-between bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors group">
                <span className="text-sm text-white/70 group-hover:text-white transition-colors">Market Watch</span>
                <ArrowRight size={14} className="text-white/20 group-hover:text-white/60 transition-colors" />
              </Link>
              <Link to="/fantasy/current-week" className="flex items-center justify-between bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors group">
                <span className="text-sm text-white/70 group-hover:text-white transition-colors">Edge Board</span>
                <ArrowRight size={14} className="text-white/20 group-hover:text-white/60 transition-colors" />
              </Link>
              <Link to="/fantasy/current-week" className="flex items-center justify-between bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors group">
                <span className="text-sm text-white/70 group-hover:text-white transition-colors">Start / Sit Tool</span>
                <ArrowRight size={14} className="text-white/20 group-hover:text-white/60 transition-colors" />
              </Link>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
