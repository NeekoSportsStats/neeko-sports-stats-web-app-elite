import React from "react";
import { Activity } from "lucide-react";

export default function MatchCenterHeader() {
  return (
    <section className="relative mb-10">
      {/* Ambient gold glow */}
      <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[radial-gradient(60%_60%_at_15%_0%,rgba(255,200,60,0.14),transparent_70%)]" />

      <div className="relative rounded-3xl border border-white/10 bg-black/60 backdrop-blur-xl px-6 py-7 md:px-8 md:py-9">
        {/* Eyebrow */}
        <div className="mb-3 flex items-center gap-2 text-xs font-medium tracking-widest text-amber-300/80">
          <Activity size={14} />
          MATCH CENTER
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold text-white">
          NBA Match Centre
        </h1>

        {/* Subtitle */}
        <p className="mt-2 max-w-3xl text-sm md:text-base text-white/70">
          Upcoming games across the 82-game season with conference standings and venue context.
          Deeper predictive insights available through AI match analysis.
        </p>

        {/* CTA */}
        <div className="mt-5">
          <a
            href="/sports/nba/ai-analysis"
            className="inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-400/20"
          >
            Explore AI Match Insights →
          </a>
        </div>
      </div>
    </section>
  );
}
