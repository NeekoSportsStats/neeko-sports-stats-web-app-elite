import { Link } from "react-router-dom";

export function PremiumUpsellSection() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="relative mt-12 p-8 rounded-2xl border border-yellow-500/20 bg-gradient-to-b from-yellow-500/5 to-transparent text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-500/5 to-transparent pointer-events-none" />

        <div className="relative z-10">
          <div className="mb-4 text-yellow-400 text-sm uppercase tracking-wide font-semibold">
            Premium Access
          </div>

          <h2 className="text-2xl md:text-3xl font-bold mb-3 text-white">
            Unlock 600+ Players
          </h2>

          <p className="text-gray-400 mb-6 max-w-xl mx-auto">
            Full rankings, AI analysis, advanced stats, market watch, and weekly edges — all in one place.
          </p>

          <div className="flex flex-wrap justify-center gap-3 mb-6">
            <span className="px-3 py-1 bg-yellow-500/10 text-yellow-400 rounded-full text-sm font-medium">
              Full Rankings
            </span>
            <span className="px-3 py-1 bg-yellow-500/10 text-yellow-400 rounded-full text-sm font-medium">
              AI Insights
            </span>
            <span className="px-3 py-1 bg-yellow-500/10 text-yellow-400 rounded-full text-sm font-medium">
              Market Watch
            </span>
            <span className="px-3 py-1 bg-yellow-500/10 text-yellow-400 rounded-full text-sm font-medium">
              Edge Board
            </span>
          </div>

          <Link
            to="/neeko-plus"
            className="inline-block bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-6 py-3 rounded-lg transition-all shadow-lg shadow-yellow-500/20"
          >
            Unlock Neeko+
          </Link>
        </div>
      </div>
    </div>
  );
}
