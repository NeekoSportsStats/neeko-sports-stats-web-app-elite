import React from "react";
import PlayerNewsTicker from "../Section-2-player-insights/PlayerNewsTicker";

interface Props {
  selectedStat: string;
  onChangeStat: (v: string) => void;
  isPremium: boolean;
}

export default function PageHeaderHero({
  selectedStat,
  onChangeStat,
  isPremium,
}: Props) {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">🏉 AFL Player Stats</h1>
      <p className="text-neutral-400 text-sm">
        Live player form, volatility and AI-ready signals for your next move.
      </p>

      <PlayerNewsTicker />

      <div className="flex flex-wrap gap-2">
        {[
          { key: "fantasy", label: "Fantasy", emoji: "📊" },
          { key: "disposals", label: "Disposals", emoji: "📥" },
          { key: "goals", label: "Goals", emoji: "🥅" },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => onChangeStat(s.key)}
            className={`px-3 py-1.5 rounded-full text-xs border transition ${
              selectedStat === s.key
                ? "bg-yellow-400 text-black border-yellow-300 shadow-[0_0_18px_rgba(250,204,21,0.7)]"
                : "bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-800"
            }`}
          >
            {s.emoji} {s.label}
          </button>
        ))}
      </div>

      {!isPremium && (
        <a
          href="https://www.neekostats.com.au/neeko-plus"
          className="inline-flex text-xs text-yellow-300 underline underline-offset-2"
        >
          Unlock deeper lenses & AI insights →
        </a>
      )}
    </div>
  );
}
