import React from "react";
import type { FixtureMatch } from "../data/types";

export default function VenueIntelChips({ match }: { match: FixtureMatch }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="rounded-full border border-white/10 px-3 py-1">
        Venue: {match.venue}
      </span>
      <span className="rounded-full border border-white/10 px-3 py-1">
        Timezone: Local
      </span>
      <span className="rounded-full border border-white/10 px-3 py-1">
        Home Ground Advantage
      </span>
    </div>
  );
}
