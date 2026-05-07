import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function CollapsibleSEO() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExploreOpen, setIsExploreOpen] = useState(false);

  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 pb-12">
      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.015] px-6 py-5">

        <button
          onClick={() => setIsOpen((v) => !v)}
          className="inline-flex items-center gap-2 text-sm font-medium text-white/40 hover:text-white/70 transition-colors"
          aria-expanded={isOpen}
        >
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {isOpen ? "Hide explanation" : "How these rankings work"}
        </button>

        {isOpen && (
          <div className="mt-6 space-y-6">
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-white">How AFL Fantasy Rankings Work</h2>
              <div className="text-sm text-white/55 leading-relaxed space-y-3">
                <p>
                  Each player receives a Neeko Rating — a composite score that weighs ceiling potential,
                  floor consistency, breakeven requirement, and upcoming matchup quality. Every round
                  the model refreshes with the latest pricing and opponent data, translating numbers
                  into a clear Start, Hold, or Sit signal.
                </p>
                <p>
                  The Value Score highlights players whose projected output significantly exceeds their
                  current price — the fastest way to find underpriced trade targets before prices move.
                  Pair it with the breakeven column: a high projection that clears breakeven almost
                  always signals a price rise coming.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-lg font-bold text-white">Best Value Picks This Round</h2>
              <div className="text-sm text-white/55 leading-relaxed space-y-3">
                <p>
                  Value picks are players priced below what their current form and upcoming matchup
                  justify. If a player's projection comfortably clears their breakeven, they're worth
                  holding or trading in. If their projection falls well short, they're a candidate to
                  trade out before the next price drop locks in.
                </p>
                <p>
                  Use the{" "}
                  <a href="/sports/afl/positions/mid" className="text-[#F5C84C]/80 hover:text-[#F5C84C] underline underline-offset-2 transition-colors">
                    Midfielders
                  </a>{" "}
                  and{" "}
                  <a href="/sports/afl/positions/fwd" className="text-[#F5C84C]/80 hover:text-[#F5C84C] underline underline-offset-2 transition-colors">
                    Forwards
                  </a>{" "}
                  filters to focus on your specific roster needs. For deeper trade analysis visit{" "}
                  <a href="/fantasy/market-watch" className="text-[#F5C84C]/80 hover:text-[#F5C84C] underline underline-offset-2 transition-colors">
                    Market Watch
                  </a>{" "}
                  or check the{" "}
                  <a href="/fantasy/current-week" className="text-[#F5C84C]/80 hover:text-[#F5C84C] underline underline-offset-2 transition-colors">
                    Current Week
                  </a>{" "}
                  for captain picks, must buys, and trap alerts.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Collapsible explore grid — crawlable, default collapsed */}
        <div className="mt-5 pt-4 border-t border-white/[0.06]">
          <button
            onClick={() => setIsExploreOpen(v => !v)}
            className="inline-flex items-center gap-2 text-sm font-medium text-white/40 hover:text-white/70 transition-colors"
            aria-expanded={isExploreOpen}
          >
            {isExploreOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {isExploreOpen ? "Hide explore" : "Explore Rankings"}
          </button>

        {isExploreOpen && (
        <div className="mt-4 space-y-6">
          <div className="space-y-2">
            <p className="text-xs text-white/35 uppercase tracking-wider font-medium">By Position</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Midfielders", href: "/sports/afl/positions/mid", sub: "Top MID rankings" },
                { label: "Forwards",    href: "/sports/afl/positions/fwd", sub: "Top FWD rankings" },
                { label: "Defenders",   href: "/sports/afl/positions/def", sub: "Top DEF rankings" },
                { label: "Rucks",       href: "/sports/afl/positions/ruck", sub: "Top RUC rankings" },
              ].map(({ label, href, sub }) => (
                <a
                  key={label}
                  href={href}
                  className="flex flex-col gap-1 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
                >
                  <span className="text-sm font-medium text-white/80">{label}</span>
                  <span className="text-xs text-white/35">{sub}</span>
                </a>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-white/35 uppercase tracking-wider font-medium">By Team</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5">
              {[
                { name: "Adelaide Crows",       slug: "adelaide-crows" },
                { name: "Brisbane Lions",        slug: "brisbane-lions" },
                { name: "Carlton Blues",         slug: "carlton-blues" },
                { name: "Collingwood Magpies",   slug: "collingwood-magpies" },
                { name: "Essendon Bombers",      slug: "essendon-bombers" },
                { name: "Fremantle Dockers",     slug: "fremantle-dockers" },
                { name: "Geelong Cats",          slug: "geelong-cats" },
                { name: "Gold Coast Suns",       slug: "gold-coast-suns" },
                { name: "GWS Giants",            slug: "gws-giants" },
                { name: "Hawthorn Hawks",        slug: "hawthorn-hawks" },
                { name: "Melbourne Demons",      slug: "melbourne-demons" },
                { name: "North Melbourne",       slug: "north-melbourne-kangaroos" },
                { name: "Port Adelaide",         slug: "port-adelaide-power" },
                { name: "Richmond Tigers",       slug: "richmond-tigers" },
                { name: "St Kilda Saints",       slug: "st-kilda-saints" },
                { name: "Sydney Swans",          slug: "sydney-swans" },
                { name: "West Coast Eagles",     slug: "west-coast-eagles" },
                { name: "Western Bulldogs",      slug: "western-bulldogs" },
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
              {[
                { label: "Market Watch",     href: "/fantasy/market-watch",   sub: "Weekly trade targets, holds & avoids based on price movement" },
                { label: "Current Week",     href: "/fantasy/current-week",   sub: "Must buys, captain picks, value plays and trap alerts" },
                { label: "Fantasy Hub",      href: "/fantasy",                sub: "All fantasy tools in one place" },
                { label: "Start / Sit Tool", href: "/fantasy/current-week",   sub: "Captain picks and head-to-head decisions before lockout" },
              ].map(({ label, href, sub }) => (
                <a
                  key={label}
                  href={href}
                  className="flex flex-col gap-1 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl px-4 py-3 transition-colors"
                >
                  <span className="text-sm font-medium text-white/80">{label}</span>
                  <span className="text-xs text-white/35">{sub}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
        )}

        </div>

      </div>
    </div>
  );
}
