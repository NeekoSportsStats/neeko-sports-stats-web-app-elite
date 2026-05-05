import { Lock } from "lucide-react";
import type { StatBoardPlayer, StatBoardHistoryRow, StatLens } from "../types";

interface Props {
  player: StatBoardPlayer;
  history: StatBoardHistoryRow[];
  loading: boolean;
  error: string | null;
  lens: StatLens;
  isLocked: boolean;
}

export function ExpandedPlayerPanel({
  player,
  history,
  loading,
  error,
  lens,
  isLocked,
}: Props) {
  if (isLocked) {
    return (
      <LockedPanel playerName={player.player_name} />
    );
  }

  if (loading) {
    return (
      <div className="border-t border-white/8 px-4 py-4">
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 rounded bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-t border-white/8 px-4 py-4 text-xs text-red-400">
        Could not load player history.
      </div>
    );
  }

  const lensKey = lens === "disposals" ? "disposals" : "goals";

  // Build game log from history
  const gameLog = history.map((row) => ({
    week: row.week,
    value: row[lensKey] as number,
    opponent: row.opponent_team_name,
    date: new Date(row.game_date).toLocaleDateString("en-AU", {
      month: "short",
      day: "numeric",
    }),
  }));

  // Summary stats from player object
  const stats = [
    { label: "Last 3 avg",  value: player.last_3_avg  != null ? player.last_3_avg.toFixed(1)  : "—" },
    { label: "Last 5 avg",  value: player.last_5_avg  != null ? player.last_5_avg.toFixed(1)  : "—" },
    { label: "Last 10 avg", value: player.last_10_avg != null ? player.last_10_avg.toFixed(1) : "—" },
    { label: "Season avg",  value: player.season_avg  != null ? player.season_avg.toFixed(1)  : "—" },
    { label: "Min (L10)",   value: player.min_last_10 != null ? String(player.min_last_10)    : "—" },
    { label: "Max (L10)",   value: player.max_last_10 != null ? String(player.max_last_10)    : "—" },
    { label: "Std dev",     value: player.stddev_last_10 != null ? player.stddev_last_10.toFixed(1) : "—" },
    { label: "Games played",value: player.games_played != null ? String(player.games_played)  : "—" },
  ];

  // All threshold hit rates
  const hitRates = player.all_threshold_hit_rates;
  const hitRateEntries = hitRates
    ? Object.entries(hitRates)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
    : [];

  return (
    <div className="border-t border-white/8 px-4 py-4 space-y-4">

      {/* ── Horizontal history bar chart ── */}
      {gameLog.length > 0 && (
        <div>
          <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">
            Last {gameLog.length} games
          </p>
          <GameLogBars gameLog={gameLog} threshold={player.threshold} />
        </div>
      )}

      {/* ── Summary stats grid ── */}
      <div>
        <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">Averages</p>
        <div className="grid grid-cols-4 gap-2">
          {stats.map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-white/4 px-2 py-2 text-center">
              <p className="text-[9px] text-white/35 mb-0.5 leading-tight">{label}</p>
              <p className="text-sm font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Hit rates by threshold ── */}
      {hitRateEntries.length > 0 && (
        <div>
          <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">
            {lens === "disposals" ? "Disposal thresholds" : "Goal thresholds"} (last 10)
          </p>
          <div className="space-y-1.5">
            {hitRateEntries.map(([key, data]) => {
              const rate = typeof data.rate === "number" ? data.rate : 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-8 text-right text-xs text-white/50 shrink-0">{key}+</span>
                  <div className="flex-1 h-2 rounded-full bg-white/8 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500/60 transition-all"
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                  <span className="w-14 text-xs text-white/60 shrink-0">
                    {data.hits}/{data.games} ({rate}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Recent game log table ── */}
      {history.length > 0 && (
        <div>
          <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">Game log</p>
          <div className="rounded-xl border border-white/8 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="text-left px-3 py-2 text-white/35 font-normal">Rnd</th>
                  <th className="text-left px-3 py-2 text-white/35 font-normal">vs</th>
                  <th className="text-right px-3 py-2 text-white/35 font-normal">
                    {lens === "disposals" ? "Disp" : "Goals"}
                  </th>
                  {lens === "disposals" && (
                    <th className="text-right px-3 py-2 text-white/35 font-normal">Marks</th>
                  )}
                  <th className="text-right px-3 py-2 text-white/35 font-normal">Fant</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  const val = lens === "disposals" ? row.disposals : row.goals;
                  const hit = val >= player.threshold;
                  return (
                    <tr key={row.game_id} className="border-b border-white/5 last:border-0">
                      <td className="px-3 py-2 text-white/50">{row.week}</td>
                      <td className="px-3 py-2 text-white/60 max-w-[90px] truncate">
                        {row.opponent_team_name.replace(/ (Football Club|FC|AFL)$/, "").split(" ").slice(-1)[0]}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-semibold ${
                          hit ? "text-emerald-400" : "text-white/60"
                        }`}
                      >
                        {val}
                      </td>
                      {lens === "disposals" && (
                        <td className="px-3 py-2 text-right text-white/40">{row.marks}</td>
                      )}
                      <td className="px-3 py-2 text-right text-white/40">{row.fantasy_score}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline bar chart for game log ─────────────────────────────────────────────

function GameLogBars({
  gameLog,
  threshold,
}: {
  gameLog: { week: number; value: number; opponent: string; date: string }[];
  threshold: number;
}) {
  const max = Math.max(...gameLog.map((g) => g.value), threshold * 1.5, 1);

  return (
    <div className="flex items-end gap-1 h-14">
      {gameLog.map((g, i) => {
        const pct = Math.min((g.value / max) * 100, 100);
        const hit = g.value >= threshold;
        const thresholdPct = Math.min((threshold / max) * 100, 100);
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end relative">
            {/* Threshold line rendered as absolute overlay on first bar only — simpler: just colour */}
            <div
              title={`Rnd ${g.week}: ${g.value} (vs ${g.opponent})`}
              className={`w-full rounded-sm transition-colors ${
                hit ? "bg-emerald-500/65" : "bg-white/15"
              }`}
              style={{ height: `${Math.max(pct, 6)}%` }}
            />
            <span className="text-[8px] text-white/25">{g.week}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Locked expanded panel ─────────────────────────────────────────────────────

function LockedPanel({ playerName }: { playerName: string }) {
  return (
    <div className="border-t border-[#F5C84C]/10 px-4 py-5 text-center">
      <Lock className="h-5 w-5 text-[#F5C84C]/40 mx-auto mb-2" />
      <p className="text-sm font-medium text-[#F5C84C]/60">Unlock full round</p>
      <p className="mt-1 text-xs text-white/30">
        Upgrade to Neeko+ to see {playerName}'s full trend, projections and hit rates.
      </p>
    </div>
  );
}
