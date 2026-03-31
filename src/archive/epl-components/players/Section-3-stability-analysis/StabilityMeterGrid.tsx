import React from "react";
import { Player } from "../data/useEPLMockData";

interface Item {
  player: Player;
  vol: number;
  label: string;
  reason: string;
}

interface Props {
  items: Item[];
  isPremium: boolean;
}

export default function StabilityMeterGrid({ items, isPremium }: Props) {
  return (
    <div className="mt-10">
      <h3 className="text-sm font-semibold text-sky-300 mb-3">
        📏 Stability Meter
      </h3>

      <div className="grid md:grid-cols-2 gap-3">
        {items.map((it, i) => {
          const locked = !isPremium && i >= 6;

          return (
            <div
              key={i}
              className={`rounded-xl border bg-neutral-950/95 p-3 ${
                locked ? "opacity-40 blur-[1px]" : "border-neutral-800"
              }`}
            >
              <div className="flex justify-between">
                <span className="text-neutral-100 font-medium">
                  {it.player.name}
                </span>
                <span className="text-xs text-neutral-400">
                  Vol: {it.vol.toFixed(1)}
                </span>
              </div>

              <span className="text-xs text-neutral-300">{it.label}</span>
              <p className="text-[10px] mt-1 text-neutral-500">
                {it.reason}
              </p>
            </div>
          );
        })}
      </div>

      {!isPremium && (
        <p className="text-[11px] text-neutral-500 mt-1">
          Unlock full stability rankings with Neeko+.
        </p>
      )}
    </div>
  );
}
