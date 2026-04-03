export function RankingsSEOContent() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-6 py-8 md:px-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white mb-4">AFL Fantasy Rankings 2026</h2>
          <div className="text-sm text-white/65 leading-relaxed space-y-3">
            <p>
              The top AFL Fantasy players this week are ranked using Neeko's advanced projection model, which
              analyses player form, matchup difficulty, role stability, and historical performance patterns. Each
              round the rankings update to reflect the latest pricing, giving you the most accurate view of
              who to start, trade in, or avoid in AFL Fantasy.
            </p>
            <p>
              Every player receives a Neeko Rating that factors in ceiling potential, floor consistency, breakeven
              score, and upcoming matchup quality. The value score column highlights underpriced trade targets —
              players whose projected output significantly exceeds their current price. AI-powered analysis
              identifies breakout candidates and value picks each week to keep you ahead of the competition.
            </p>
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold text-white mb-3">How to use the Rankings</h3>
          <div className="text-sm text-white/55 leading-relaxed space-y-2">
            <p>
              Filter by position (MID, FWD, DEF, RUC) to find the best players at each role. Sort by Projected Score
              to see this round's top performers, or by Value Score to find the most underpriced AFL Fantasy trade
              targets. The breakeven column shows how many points a player needs to score to hold their current price
              — a key metric when deciding who to trade out before price drops lock in.
            </p>
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold text-white mb-3">Browse by Position</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <a
              href="/sports/afl/positions/mid"
              className="flex flex-col gap-1 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
            >
              <span className="text-sm font-medium text-white/80">Midfielders</span>
              <span className="text-xs text-white/35">Top MID rankings & projections</span>
            </a>
            <a
              href="/sports/afl/positions/fwd"
              className="flex flex-col gap-1 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
            >
              <span className="text-sm font-medium text-white/80">Forwards</span>
              <span className="text-xs text-white/35">Top FWD rankings & projections</span>
            </a>
            <a
              href="/sports/afl/positions/def"
              className="flex flex-col gap-1 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
            >
              <span className="text-sm font-medium text-white/80">Defenders</span>
              <span className="text-xs text-white/35">Top DEF rankings & projections</span>
            </a>
            <a
              href="/sports/afl/positions/ruck"
              className="flex flex-col gap-1 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
            >
              <span className="text-sm font-medium text-white/80">Rucks</span>
              <span className="text-xs text-white/35">Top RUC rankings & projections</span>
            </a>
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold text-white mb-3">Browse by Team</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { name: "Adelaide Crows", slug: "adelaide-crows" },
              { name: "Brisbane Lions", slug: "brisbane-lions" },
              { name: "Carlton Blues", slug: "carlton-blues" },
              { name: "Collingwood Magpies", slug: "collingwood-magpies" },
              { name: "Essendon Bombers", slug: "essendon-bombers" },
              { name: "Fremantle Dockers", slug: "fremantle-dockers" },
              { name: "Geelong Cats", slug: "geelong-cats" },
              { name: "Gold Coast Suns", slug: "gold-coast-suns" },
              { name: "GWS Giants", slug: "gws-giants" },
              { name: "Hawthorn Hawks", slug: "hawthorn-hawks" },
              { name: "Melbourne Demons", slug: "melbourne-demons" },
              { name: "North Melbourne", slug: "north-melbourne-kangaroos" },
              { name: "Port Adelaide", slug: "port-adelaide-power" },
              { name: "Richmond Tigers", slug: "richmond-tigers" },
              { name: "St Kilda Saints", slug: "st-kilda-saints" },
              { name: "Sydney Swans", slug: "sydney-swans" },
              { name: "West Coast Eagles", slug: "west-coast-eagles" },
              { name: "Western Bulldogs", slug: "western-bulldogs" },
            ].map(({ name, slug }) => (
              <a
                key={slug}
                href={`/sports/afl/teams/${slug}`}
                className="text-xs text-white/50 hover:text-white/80 transition-colors py-1.5 px-2 rounded-lg hover:bg-white/[0.04] truncate"
              >
                {name}
              </a>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold text-white mb-3">Related Tools</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <a
              href="/sports/afl/market-watch"
              className="flex flex-col gap-1 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
            >
              <span className="text-sm font-medium text-white/80">Market Watch</span>
              <span className="text-xs text-white/35">Weekly trade targets, holds & avoids based on price movement</span>
            </a>
            <a
              href="/sports/afl/edge-board"
              className="flex flex-col gap-1 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
            >
              <span className="text-sm font-medium text-white/80">Edge Board</span>
              <span className="text-xs text-white/35">Captain lock, breakout value pick, and fade of the round</span>
            </a>
            <a
              href="/sports/afl/current-round"
              className="flex flex-col gap-1 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
            >
              <span className="text-sm font-medium text-white/80">Current Round Tips</span>
              <span className="text-xs text-white/35">Top picks, captain options, value plays and trap alerts</span>
            </a>
            <a
              href="/sports/afl/start-sit"
              className="flex flex-col gap-1 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
            >
              <span className="text-sm font-medium text-white/80">Start / Sit Tool</span>
              <span className="text-xs text-white/35">AI verdict on which player to start in your lineup</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
