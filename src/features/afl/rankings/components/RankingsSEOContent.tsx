export function RankingsSEOContent() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-6 py-8 md:px-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white mb-4">AFL Fantasy Rankings 2026</h2>
          <div className="text-sm text-white/65 leading-relaxed space-y-3">
            <p>
              AFL Fantasy Rankings for 2026 are led by elite performers who combine exceptional scoring consistency
              with strong projected value. Neeko's advanced projection model analyses player form, matchup difficulty,
              role stability, and historical performance patterns to deliver data-driven rankings that help fantasy
              coaches make informed decisions each week.
            </p>
            <p>
              Each player receives a comprehensive Neeko Rating that weighs multiple factors including ceiling
              potential, floor consistency, value score relative to price, and upcoming matchup quality. AI-powered
              analysis identifies breakout candidates, value upgrades, and potential trap picks to give you an edge
              over your competition. Rankings update weekly throughout the AFL season.
            </p>
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold text-white mb-3">How to use the Rankings</h3>
          <div className="text-sm text-white/55 leading-relaxed space-y-2">
            <p>
              Filter by position (MID, FWD, DEF, RUC) to find the best players at each role. Sort by Projected Score
              to see this round's top performers, or by Value Score to find the most underpriced trade targets. The
              breakeven column shows how many points a player needs to maintain their current price.
            </p>
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
