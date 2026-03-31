import React, { useMemo } from "react";
import MatchCard from "./MatchCard";
import type { FixtureMatch } from "../data/types";

type Props = {
  matches: FixtureMatch[];
  onSelectMatch: (m: FixtureMatch) => void;
};

function dayLabel(dateISO: string) {
  return new Date(dateISO).toLocaleDateString("en-AU", {
    weekday: "long",
  });
}

export default function MatchList({ matches, onSelectMatch }: Props) {
  const grouped = useMemo(() => {
    const map: Record<string, FixtureMatch[]> = {};
    matches.forEach((m) => {
      const day = dayLabel(m.dateISO);
      if (!map[day]) map[day] = [];
      map[day].push(m);
    });
    return map;
  }, [matches]);

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([day, dayMatches]) => {
        const finals = dayMatches.filter(
          (m) => m.status === "final"
        ).length;

        return (
          <div key={day} className="space-y-3">
            {/* Sticky day header */}
            <div className="sticky top-[72px] z-10 bg-[#0b0b0b] py-1">
              <div className="flex items-end justify-between">
                <div className="text-sm font-semibold text-white/70">
                  {day}
                </div>
                <div className="text-[11px] text-white/40">
                  {dayMatches.length} matches · {finals} final
                </div>
              </div>
            </div>

            {dayMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                onClick={() => onSelectMatch(match)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
