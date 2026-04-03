export function RankingsSEOContent() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12 space-y-6">
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-6 py-8 md:px-8 space-y-8">

        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white">How AFL Fantasy Rankings Work</h2>
          <div className="text-sm text-white/60 leading-relaxed space-y-3">
            <p>
              Neeko's AFL Fantasy rankings use a multi-factor projection model that combines player form,
              positional matchup difficulty, role stability, and historical scoring patterns. Every round,
              the model refreshes with the latest player pricing and opponent data to give you an accurate,
              up-to-date view of who to start, target, and avoid.
            </p>
            <p>
              Each player receives a Neeko Rating — a composite score that weighs ceiling potential,
              floor consistency, breakeven requirement, and upcoming matchup quality. The Value Score
              column highlights players whose projected output significantly exceeds their current price,
              making it the fastest way to find underpriced trade targets before prices move.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-xl font-bold text-white">Top Players This Week</h2>
          <div className="text-sm text-white/60 leading-relaxed space-y-3">
            <p>
              The top-ranked AFL Fantasy players each round are determined by projected output rather than
              season averages — so form slumps and role changes are reflected immediately. Midfielders
              dominate the top tier due to high disposal volume and consistent scoring, but forwards and
              defenders with elite matchups regularly crack the top 20.
            </p>
            <p>
              Use the position filter to focus on your specific roster needs. Sorting by Projected Score
              shows this round's ceiling performers, while sorting by Value Score reveals the most
              cost-efficient options — useful when you're working within a tight trade budget.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-xl font-bold text-white">Best Value Picks This Round</h2>
          <div className="text-sm text-white/60 leading-relaxed space-y-3">
            <p>
              Value picks are players priced below what their current form and upcoming matchup justify.
              The model identifies these by comparing a player's projected score against their breakeven
              requirement — a high projection with a low breakeven almost always signals a price rise
              coming, making them ideal trade-in targets before the market catches up.
            </p>
            <p>
              Breakeven scores are recalculated each round based on current price. If a player's
              projection comfortably clears their breakeven, they're worth holding or trading in.
              If their projection falls well short, they're a candidate to trade out before the
              next price drop locks in.
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-white/[0.06] space-y-6">
          <h3 className="text-base font-semibold text-white">Explore Rankings</h3>

          <div className="space-y-2">
            <p className="text-xs text-white/35 uppercase tracking-wider font-medium">By Position</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <a
                href="/sports/afl/positions/mid"
                className="flex flex-col gap-1 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
              >
                <span className="text-sm font-medium text-white/80">Midfielders</span>
                <span className="text-xs text-white/35">Top MID rankings</span>
              </a>
              <a
                href="/sports/afl/positions/fwd"
                className="flex flex-col gap-1 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
              >
                <span className="text-sm font-medium text-white/80">Forwards</span>
                <span className="text-xs text-white/35">Top FWD rankings</span>
              </a>
              <a
                href="/sports/afl/positions/def"
                className="flex flex-col gap-1 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
              >
                <span className="text-sm font-medium text-white/80">Defenders</span>
                <span className="text-xs text-white/35">Top DEF rankings</span>
              </a>
              <a
                href="/sports/afl/positions/ruck"
                className="flex flex-col gap-1 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
              >
                <span className="text-sm font-medium text-white/80">Rucks</span>
                <span className="text-xs text-white/35">Top RUC rankings</span>
              </a>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-white/35 uppercase tracking-wider font-medium">By Team</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5">
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

          <div className="space-y-2">
            <p className="text-xs text-white/35 uppercase tracking-wider font-medium">Tools &amp; Insights</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <a
                href="/sports/afl/market-watch"
                className="flex flex-col gap-1 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
              >
                <span className="text-sm font-medium text-white/80">Market Watch</span>
                <span className="text-xs text-white/35">Weekly trade targets, holds &amp; avoids based on price movement</span>
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
    </div>
  );
}
