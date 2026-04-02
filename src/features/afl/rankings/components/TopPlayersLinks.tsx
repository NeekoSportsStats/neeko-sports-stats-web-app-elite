import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { RankingRow } from "./types";
import { playerToSlug } from "@/lib/slugs";

interface TopPlayersLinksProps {
  players: RankingRow[];
}

export function TopPlayersLinks({ players }: TopPlayersLinksProps) {
  const topPlayers = players.slice(0, 20);

  if (topPlayers.length === 0) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-6 py-8 md:px-8">
        <h2 className="text-xl font-bold text-white mb-6">Top AFL Fantasy Players</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {topPlayers.map((player) => {
            const slug = playerToSlug(player.player_name, player.team);
            return (
              <Link
                key={player.player_id ?? player.player_name}
                to={`/sports/afl/players/${slug}`}
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white/90 group-hover:text-white truncate">
                    {player.player_name}
                  </p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {player.team}{player.position ? ` · ${player.position}` : ""}
                  </p>
                </div>
                <ExternalLink size={14} className="text-white/20 group-hover:text-white/40 transition-colors shrink-0 ml-2" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
