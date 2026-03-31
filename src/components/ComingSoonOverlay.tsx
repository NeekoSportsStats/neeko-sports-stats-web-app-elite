import React from "react";
import { Link } from "react-router-dom";
import { Clock, Sparkles } from "lucide-react";

interface ComingSoonOverlayProps {
  league: "EPL" | "NBA";
}

export default function ComingSoonOverlay({ league }: ComingSoonOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative mx-4 max-w-lg overflow-hidden rounded-3xl border border-yellow-500/30 bg-gradient-to-b from-black/90 via-black/95 to-black shadow-[0_0_80px_rgba(0,0,0,0.8)]">
        <div className="pointer-events-none absolute -left-20 top-10 h-40 w-40 rounded-full bg-yellow-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-10 h-40 w-40 rounded-full bg-yellow-500/20 blur-3xl" />

        <div className="relative px-8 py-12 text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-yellow-500/40 bg-yellow-500/10 shadow-[0_0_30px_rgba(250,204,21,0.3)]">
              <Clock className="h-8 w-8 text-yellow-300" />
            </div>
          </div>

          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-yellow-200">
            <Sparkles className="h-3 w-3" />
            {league} Launch
          </div>

          <h2 className="mt-4 text-3xl font-bold text-white md:text-4xl">
            Coming Soon
          </h2>

          <p className="mt-4 text-sm leading-relaxed text-neutral-300 md:text-base">
            We're finishing live data integration, AI analysis engines and advanced insights for {league}.
          </p>

          <p className="mt-2 text-xs text-neutral-500">
            {league === "EPL" ? "Premier League" : "Basketball"} stats launching soon.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/sports/afl"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-yellow-400 px-6 py-3 text-sm font-semibold text-black shadow-[0_0_30px_rgba(250,204,21,0.5)] transition-all hover:bg-yellow-300 hover:shadow-[0_0_40px_rgba(250,204,21,0.7)]"
            >
              Explore AFL (Live Now)
            </Link>

            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-neutral-700 bg-black/60 px-6 py-3 text-sm font-semibold text-neutral-200 transition-all hover:border-neutral-600 hover:bg-black/80"
            >
              Back to Home
            </Link>
          </div>

          <div className="mt-8 border-t border-neutral-800 pt-6">
            <p className="text-xs text-neutral-400">
              Want early access updates?{" "}
              <Link
                to="/contact"
                className="text-yellow-300 underline underline-offset-2 hover:text-yellow-200"
              >
                Contact us
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
