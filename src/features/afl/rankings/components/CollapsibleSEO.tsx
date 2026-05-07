import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function CollapsibleSEO() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full max-w-[1200px] mx-auto pb-12 pt-6">
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
          <div className="mt-5 space-y-4">
            <h2 className="text-base font-bold text-white">How AFL Fantasy Rankings Work</h2>
            <div className="text-sm text-white/50 leading-relaxed space-y-3">
              <p>
                Each player receives a Neeko Rating — a composite score that weighs ceiling potential,
                floor consistency, breakeven requirement, and upcoming matchup quality. Every round
                the model refreshes with the latest pricing and opponent data, translating numbers
                into a clear Start, Hold, or Sit signal.
              </p>
              <p>
                The Value Score highlights players whose projected output significantly exceeds their
                current price — the fastest way to find underpriced trade targets before prices move.
                A high projection that clears breakeven almost always signals a price rise coming.
                For deeper trade analysis visit{" "}
                <a href="/fantasy/market-watch" className="text-[#F5C84C]/70 hover:text-[#F5C84C] underline underline-offset-2 transition-colors">
                  Market Watch
                </a>{" "}
                or check{" "}
                <a href="/fantasy/current-week" className="text-[#F5C84C]/70 hover:text-[#F5C84C] underline underline-offset-2 transition-colors">
                  Current Week
                </a>{" "}
                for captain picks and must buys.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
