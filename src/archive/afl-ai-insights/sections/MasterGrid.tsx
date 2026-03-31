import React, { useState } from "react";
import { Filter } from "lucide-react";

export default function MasterGrid() {
  const [teamFilter, setTeamFilter] = useState("all");
  const [playerFilter, setPlayerFilter] = useState("all");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-white">Master Grid</h2>
        <p className="mt-1 text-sm text-white/60">
          Comprehensive player and team data explorer
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
        <div className="mb-6 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-white/60" />
            <span className="text-sm text-white/70">Filters:</span>
          </div>

          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-white"
          >
            <option value="all">All Teams</option>
            <option value="collingwood">Collingwood</option>
            <option value="carlton">Carlton</option>
            <option value="richmond">Richmond</option>
            <option value="essendon">Essendon</option>
          </select>

          <select
            value={playerFilter}
            onChange={(e) => setPlayerFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-white"
          >
            <option value="all">All Players</option>
            <option value="midfielders">Midfielders</option>
            <option value="forwards">Forwards</option>
            <option value="defenders">Defenders</option>
            <option value="rucks">Rucks</option>
          </select>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-6 gap-4 rounded-lg bg-white/5 px-4 py-3 text-xs font-semibold text-white/70">
            <div>Player</div>
            <div>Team</div>
            <div>Position</div>
            <div className="text-right">Avg Fantasy</div>
            <div className="text-right">Consistency</div>
            <div className="text-right">Form</div>
          </div>

          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-6 gap-4 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3 text-sm"
            >
              <div className="text-white/90">Player {i + 1}</div>
              <div className="text-white/70">Team</div>
              <div className="text-white/70">Position</div>
              <div className="text-right text-white/90">
                <div className="inline-block w-16 h-6 rounded bg-white/5 animate-pulse" />
              </div>
              <div className="text-right text-white/90">
                <div className="inline-block w-16 h-6 rounded bg-white/5 animate-pulse" />
              </div>
              <div className="text-right text-white/90">
                <div className="inline-block w-16 h-6 rounded bg-white/5 animate-pulse" />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 text-center text-sm text-white/40">
          Master grid data coming soon
        </div>
      </div>
    </section>
  );
}
