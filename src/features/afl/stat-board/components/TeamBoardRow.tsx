import { memo, Fragment } from "react";
import { ChevronDown, ChevronUp, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { StatBoardTeamRow, TeamStatLens } from "../teamTypes";
import { teamLensUnit } from "../teamTypes";
import { useStatBoardTeamGameLog, useStatBoardTeamTopContributors } from "../useStatBoardTeams";

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeNum(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function hitRateCell(
  row: StatBoardTeamRow,
  threshold: number,
  isLocked: boolean
): React.ReactNode {
  if (isLocked) {
    return <span className="text-[11px] text-white/20 blur-[4px] select-none" aria-hidden>—</span>;
  }
  const data = row.all_threshold_hit_rates?.[String(threshold)];
  const hits = safeNum(data?.hits);
  const games = safeNum(data?.games);
  const rate = safeNum(data?.rate);

  if (hits === null || games === null || games === 0) {
    return <span className="text-[11px] text-white/22">—</span>;
  }

  const rateColor =
    rate != null && rate >= 70 ? "text-emerald-400"
    : rate != null && rate >= 50 ? "text-amber-400"
    : "text-white/35";

  return (
    <div className="flex flex-col items-center leading-tight gap-[1px]">
      <span className="text-[11px] font-semibold text-white/80 tabular-nums">{hits}/{games}</span>
      {rate != null && rate > 0 ? (
        <span className={`text-[10px] font-semibold tabular-nums ${rateColor}`}>{rate}%</span>
      ) : (
        <span className="text-[10px] text-white/22">0%</span>
      )}
    </div>
  );
}

function MiniBarChips({ values, lens }: { values: number[] | null; lens: TeamStatLens }) {
  const vals = (values ?? []).slice(-8);
  if (vals.length === 0) {
    return (
      <div className="flex gap-[3px]">
        {[0,1,2,3,4].map((i) => (
          <span key={i} className="h-[18px] w-[18px] rounded bg-white/5 flex items-center justify-center text-[8px] text-white/18">—</span>
        ))}
      </div>
    );
  }
  const max = Math.max(...vals, 1);
  const unit = teamLensUnit(lens);
  return (
    <div className="flex items-end gap-[3px]" aria-label={`Recent ${unit} values`}>
      {vals.map((v, i) => {
        const isNewest = i === vals.length - 1;
        const heightPct = Math.max(18, Math.round((v / max) * 36));
        return (
          <div
            key={i}
            title={`${v} ${unit}`}
            role="listitem"
            aria-label={`${v} ${unit}`}
            style={{ height: heightPct }}
            className={`w-[14px] rounded-sm flex items-end justify-center ${
              isNewest
                ? "bg-emerald-500/45 ring-1 ring-emerald-400/30"
                : "bg-white/[0.12]"
            }`}
          >
            <span className="text-[7px] font-bold text-white/50 tabular-nums leading-none mb-[1px]">{v}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Expanded panel ────────────────────────────────────────────────────────────

function ExpandedTeamPanel({
  row,
  lens,
  isLocked,
}: {
  row: StatBoardTeamRow;
  lens: TeamStatLens;
  isLocked: boolean;
}) {
  const { log, loading: logLoading } = useStatBoardTeamGameLog(isLocked ? null : row.team_id);
  const { contributors, loading: contribLoading } = useStatBoardTeamTopContributors(
    isLocked ? null : row.team_id,
    lens
  );

  if (isLocked) {
    return <LockedTeamPanel teamName={row.team_name} />;
  }

  const unit = teamLensUnit(lens);

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCell label="L3 Avg" value={safeNum(row.recent_avg_l3)} unit={unit} />
        <StatCell label="L5 Avg" value={safeNum(row.recent_avg_l5)} unit={unit} />
        <StatCell label="L8 Avg" value={safeNum(row.recent_avg_l8)} unit={unit} />
        <StatCell label="Season Avg" value={safeNum(row.season_avg)} unit={unit} />
      </div>

      {/* Score breakdown — only for score lens */}
      {lens === "score" && (row.recent_goals_avg != null || row.recent_scoring_shots_avg != null) && (
        <div className="grid grid-cols-3 gap-3">
          <StatCell label="Goals Avg" value={safeNum(row.recent_goals_avg)} />
          <StatCell label="Behinds Avg" value={safeNum(row.recent_behinds_avg)} />
          <StatCell label="Conversion" value={safeNum(row.conversion_rate)} unit="%" />
        </div>
      )}

      {/* Opponent context */}
      {(row.opponent_conceded_l5 != null || row.opponent_conceded_season != null) && (
        <div>
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
            Opponent — {row.opponent_team_name}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <StatCell label="Conceded L5" value={safeNum(row.opponent_conceded_l5)} unit={unit} />
            <StatCell label="Conceded Season" value={safeNum(row.opponent_conceded_season)} unit={unit} />
          </div>
        </div>
      )}

      {/* Game log */}
      <div>
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
          Recent Games
        </p>
        {logLoading ? (
          <div className="space-y-1.5">
            {[0,1,2].map((i) => (
              <div key={i} className="h-8 rounded-lg bg-white/4 animate-pulse" />
            ))}
          </div>
        ) : log.length === 0 ? (
          <p className="text-[12px] text-white/30">No game data available.</p>
        ) : (
          <div className="space-y-1 overflow-x-auto">
            <table className="w-full text-left border-collapse" style={{ minWidth: 420 }}>
              <thead>
                <tr className="border-b border-white/[0.08]">
                  {["Rnd","Opponent","H/A","Score","Opp","Result","Goals","Shots","Conv"].map((h) => (
                    <th key={h} className="px-2 py-1.5 text-[9px] font-semibold text-white/28 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.map((g) => {
                  const resultColor =
                    g.result === "W" ? "text-emerald-400"
                    : g.result === "L" ? "text-red-400"
                    : "text-white/45";
                  return (
                    <tr key={g.game_id} className="border-b border-white/[0.05] last:border-b-0 hover:bg-white/[0.03]">
                      <td className="px-2 py-2 text-[11px] text-white/45 whitespace-nowrap">{g.round_label}</td>
                      <td className="px-2 py-2 text-[11px] text-white/65 whitespace-nowrap">{g.opponent_team_name}</td>
                      <td className="px-2 py-2 text-[10px] text-white/35 whitespace-nowrap">{g.home_away}</td>
                      <td className="px-2 py-2 text-[11px] font-semibold text-white/80 tabular-nums whitespace-nowrap">{g.team_score ?? "—"}</td>
                      <td className="px-2 py-2 text-[11px] text-white/40 tabular-nums whitespace-nowrap">{g.opponent_score ?? "—"}</td>
                      <td className={`px-2 py-2 text-[11px] font-bold whitespace-nowrap ${resultColor}`}>{g.result ?? "—"}</td>
                      <td className="px-2 py-2 text-[11px] text-white/50 tabular-nums whitespace-nowrap">{g.goals ?? "—"}</td>
                      <td className="px-2 py-2 text-[11px] text-white/50 tabular-nums whitespace-nowrap">{g.scoring_shots ?? "—"}</td>
                      <td className="px-2 py-2 text-[11px] text-white/45 tabular-nums whitespace-nowrap">
                        {g.conversion_rate != null ? `${g.conversion_rate}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top contributors */}
      <div>
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
          Key Players
        </p>
        {contribLoading ? (
          <div className="flex gap-2 flex-wrap">
            {[0,1,2,3].map((i) => (
              <div key={i} className="h-8 w-28 rounded-lg bg-white/4 animate-pulse" />
            ))}
          </div>
        ) : contributors.length === 0 ? (
          <p className="text-[12px] text-white/30">No contributor data available.</p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {contributors.map((c) => (
              <div
                key={c.player_id}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5"
              >
                <p className="text-[11px] font-semibold text-white/80 leading-tight">{c.player_name}</p>
                <p className="text-[9px] text-white/35 mt-0.5">
                  {c.projection != null ? `proj ${c.projection}` : c.recent_avg_l5 != null ? `avg ${c.recent_avg_l5}` : "—"} {unit}
                  {c.position_group ? ` · ${c.position_group}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCell({ label, value, unit }: { label: string; value: number | null; unit?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
      <p className="text-[9px] font-semibold text-white/30 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-[15px] font-bold text-white/85 tabular-nums leading-tight">
        {value != null ? (
          <>
            {value}
            {unit && <span className="text-[10px] font-normal text-white/35 ml-0.5">{unit}</span>}
          </>
        ) : "—"}
      </p>
    </div>
  );
}

function LockedTeamPanel({ teamName }: { teamName: string }) {
  const navigate = useNavigate();
  return (
    <div className="border-t border-[#F5C84C]/10 px-4 py-6 text-center">
      <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-[#F5C84C]/8 mb-3">
        <Lock className="h-4 w-4 text-[#F5C84C]/50" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-[#F5C84C]/70">Neeko+ match</p>
      <p className="mt-1 text-xs text-white/35 max-w-[240px] mx-auto leading-relaxed">
        Free users can explore the first matches. Neeko+ unlocks full team breakdowns for {teamName} and every other team.
      </p>
      <button
        onClick={() => navigate("/neeko-plus")}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#F5C84C]/12 border border-[#F5C84C]/25 px-4 py-2 text-[12px] font-semibold text-[#F5C84C] hover:bg-[#F5C84C]/20 transition-colors"
      >
        <Lock className="h-3 w-3" aria-hidden />
        Unlock Neeko+
      </button>
    </div>
  );
}

// ── Desktop table row ─────────────────────────────────────────────────────────

interface TeamBoardRowProps {
  row: StatBoardTeamRow;
  lens: TeamStatLens;
  thresholds: readonly number[];
  isMatchLocked: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export const TeamBoardRow = memo(function TeamBoardRow({
  row,
  lens,
  thresholds,
  isMatchLocked,
  isExpanded,
  onToggleExpand,
}: TeamBoardRowProps) {
  const isRowLocked = isMatchLocked && !row.is_free_match;

  const confStyles: Record<string, { dot: string; text: string; label: string }> = {
    "VERY HIGH": { dot: "bg-emerald-300", text: "text-emerald-300", label: "Very High" },
    HIGH:        { dot: "bg-emerald-400", text: "text-emerald-400", label: "High" },
    MEDIUM:      { dot: "bg-amber-400",   text: "text-amber-400",   label: "Medium" },
    LOW:         { dot: "bg-white/25",    text: "text-white/40",    label: "Low" },
    UNKNOWN:     { dot: "bg-white/15",    text: "text-white/28",    label: "—" },
  };
  const conf = row.consistency_label ? confStyles[row.consistency_label] ?? confStyles.LOW : null;

  const proj = safeNum(row.projection);
  const avg  = safeNum(row.recent_avg_l5);

  return (
    <Fragment>
      <tr
        onClick={onToggleExpand}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`${row.team_name} — ${isExpanded ? "collapse" : "expand"} detail`}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleExpand(); } }}
        className={`
          group cursor-pointer select-none transition-colors duration-100
          focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60
          border-b border-white/[0.06] last:border-b-0
          ${isExpanded
            ? "bg-white/[0.065] border-b-transparent"
            : "hover:bg-white/[0.055] active:bg-white/[0.085]"}
        `}
      >
        {/* Team name */}
        <td className="relative pl-0 pr-2 py-3 min-w-[160px]">
          {isExpanded && (
            <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-emerald-500/50" aria-hidden />
          )}
          <div className="pl-4">
            <span className={`text-[13px] font-semibold leading-tight ${isExpanded ? "text-white" : "text-white/90"}`}>
              {row.team_name}
            </span>
            <p className="text-[10px] text-white/35 mt-0.5">
              vs {row.opponent_team_name}
              {row.is_home
                ? <span className="ml-1 text-emerald-500/50"> · H</span>
                : <span className="ml-1 text-white/18"> · A</span>
              }
            </p>
          </div>
        </td>

        {/* Mini bar chart */}
        <td className="px-2 py-3 min-w-[120px]">
          <MiniBarChips values={row.recent_values} lens={lens} />
        </td>

        {/* L5 Avg */}
        <td className="px-2 py-3 text-right tabular-nums min-w-[56px]">
          <span className={`text-[12px] font-medium ${avg != null ? "text-white/55" : "text-white/20"}`}>
            {avg != null ? avg.toFixed(1) : "—"}
          </span>
        </td>

        {/* Projection */}
        <td className="px-2 py-3 text-right tabular-nums min-w-[52px]">
          {isRowLocked ? (
            <span className="text-[13px] font-semibold text-white/20 blur-[4px] select-none" aria-hidden>••</span>
          ) : proj != null ? (
            <span className="text-[15px] font-bold text-[#F5C84C] tabular-nums leading-none">{proj}</span>
          ) : (
            <span className="text-[13px] text-white/22">—</span>
          )}
        </td>

        {/* Hit rate cols */}
        {thresholds.map((t) => (
          <td key={t} className="px-2 py-2.5 text-center tabular-nums min-w-[60px]">
            {hitRateCell(row, t, isRowLocked)}
          </td>
        ))}

        {/* Consistency */}
        <td className="px-2 py-3 text-center min-w-[84px]">
          {!isRowLocked && conf ? (
            <div className="inline-flex items-center gap-1.5">
              <span className={`h-[7px] w-[7px] rounded-full shrink-0 ${conf.dot}`} aria-hidden />
              <span className={`text-[11px] font-semibold leading-none ${conf.text}`}>{conf.label}</span>
            </div>
          ) : (
            <span className="text-white/15 text-[10px]">—</span>
          )}
        </td>

        {/* Expand chevron */}
        <td className="pr-2 pl-1 py-2 text-center w-10">
          <span className={`
            inline-flex items-center justify-center h-7 w-7 rounded-lg transition-all duration-100
            ${isExpanded
              ? "bg-white/12 text-white/80"
              : "text-white/30 group-hover:bg-white/8 group-hover:text-white/65 group-active:bg-white/12"}
          `}>
            {isRowLocked ? (
              <Lock className="h-3.5 w-3.5 text-[#F5C84C]/40" aria-hidden />
            ) : isExpanded ? (
              <ChevronUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden />
            )}
          </span>
        </td>
      </tr>

      {/* Expanded detail row */}
      {isExpanded && (
        <tr className="border-b border-white/[0.06]">
          <td colSpan={4 + thresholds.length + 2} className="p-0 align-top bg-white/[0.022] border-l-[3px] border-l-emerald-500/30">
            <ExpandedTeamPanel row={row} lens={lens} isLocked={isRowLocked} />
          </td>
        </tr>
      )}
    </Fragment>
  );
});

// ── Mobile team card ──────────────────────────────────────────────────────────

interface MobileTeamCardProps {
  row: StatBoardTeamRow;
  lens: TeamStatLens;
  thresholds: readonly number[];
  isMatchLocked: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export const MobileTeamCard = memo(function MobileTeamCard({
  row,
  lens,
  thresholds,
  isMatchLocked,
  isExpanded,
  onToggleExpand,
}: MobileTeamCardProps) {
  const isRowLocked = isMatchLocked && !row.is_free_match;

  const confStyles: Record<string, { dot: string; text: string; label: string }> = {
    "VERY HIGH": { dot: "bg-emerald-300", text: "text-emerald-300", label: "Very High" },
    HIGH:        { dot: "bg-emerald-400", text: "text-emerald-400", label: "High" },
    MEDIUM:      { dot: "bg-amber-400",   text: "text-amber-400",   label: "Medium" },
    LOW:         { dot: "bg-white/25",    text: "text-white/40",    label: "Low" },
    UNKNOWN:     { dot: "bg-white/15",    text: "text-white/28",    label: "—" },
  };
  const conf = row.consistency_label ? confStyles[row.consistency_label] ?? confStyles.LOW : null;

  const proj = safeNum(row.projection);
  const avg  = safeNum(row.recent_avg_l5);
  const unit = teamLensUnit(lens);

  return (
    <div className={`rounded-2xl border overflow-hidden w-full min-w-0 ${
      isExpanded ? "border-emerald-500/25 bg-[#111]" : "border-white/10 bg-[#0d0d0d]"
    }`}>
      <button
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
        aria-label={`${row.team_name} — ${isExpanded ? "collapse" : "expand"} detail`}
        className="w-full text-left px-3 pt-3 pb-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60"
      >
        {/* Row 1: team name + projection + chevron */}
        <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
          <div className="flex-1 min-w-0">
            <span className={`text-[13px] font-bold leading-tight ${isExpanded ? "text-white" : "text-white/90"}`}>
              {row.team_name}
            </span>
            <div className="flex items-center gap-1 mt-0.5 min-w-0">
              <span className="text-[10px] text-white/35 truncate">vs {row.opponent_team_name}</span>
              {row.is_home
                ? <span className="text-[8px] text-emerald-500/60 font-semibold bg-emerald-500/7 rounded px-1 py-0.5 leading-none shrink-0">H</span>
                : <span className="text-[8px] text-white/28 bg-white/5 rounded px-1 py-0.5 leading-none shrink-0">A</span>
              }
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="text-right">
              <p className="text-[7px] text-white/25 uppercase tracking-wider leading-none mb-0.5">Proj</p>
              {isRowLocked ? (
                <span className="text-[14px] font-bold text-white/20 select-none" aria-hidden>••</span>
              ) : proj != null ? (
                <span className="text-[17px] font-bold text-[#F5C84C] tabular-nums leading-none">{proj}</span>
              ) : (
                <span className="text-[12px] text-white/22">—</span>
              )}
            </div>
            <span className={`
              inline-flex items-center justify-center h-6 w-6 rounded-lg shrink-0
              ${isExpanded ? "bg-white/10 text-white/75" : "text-white/28"}
            `}>
              {isRowLocked ? (
                <Lock className="h-3 w-3 text-[#F5C84C]/40" aria-hidden />
              ) : isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              )}
            </span>
          </div>
        </div>

        {/* Row 2: mini bars */}
        <div className="mb-2">
          <MiniBarChips values={row.recent_values} lens={lens} />
        </div>

        {/* Row 3: stats strip */}
        <div className="flex items-stretch gap-0 border border-white/8 rounded-lg overflow-hidden w-full">
          <div className="flex-1 px-1.5 py-1.5 border-r border-white/8 min-w-0">
            <p className="text-[7px] text-white/25 uppercase tracking-wide leading-none mb-0.5">L5 {unit}</p>
            <p className={`text-[11px] font-semibold tabular-nums leading-none ${avg != null ? "text-white/68" : "text-white/22"}`}>
              {avg != null ? avg.toFixed(1) : "—"}
            </p>
          </div>

          {thresholds.map((t, idx) => {
            const isLast = idx === thresholds.length - 1;
            const data = row.all_threshold_hit_rates?.[String(t)];
            const rate = safeNum(data?.rate);
            const hits = safeNum(data?.hits);
            const games = safeNum(data?.games);
            const hasData = hits !== null && games !== null && games > 0;
            const rateColor = rate != null && rate >= 70
              ? "text-emerald-400"
              : rate != null && rate >= 50
              ? "text-amber-400"
              : "text-white/32";

            return (
              <div key={t} className={`flex-1 px-1 py-1.5 text-center min-w-0 ${isLast ? "" : "border-r border-white/8"}`}>
                {isRowLocked ? (
                  <>
                    <p className="text-[7px] text-white/25 uppercase tracking-wide leading-none mb-0.5">{t}+</p>
                    <p className="text-[9px] text-white/18 select-none tabular-nums leading-none">—</p>
                  </>
                ) : (
                  <>
                    <p className="text-[7px] text-white/25 uppercase tracking-wide leading-none mb-0.5">{t}+</p>
                    {hasData && rate != null ? (
                      <p className={`text-[10px] font-bold tabular-nums leading-none ${rateColor}`}>
                        {rate > 0 ? `${rate}%` : "0%"}
                      </p>
                    ) : (
                      <p className="text-[9px] text-white/20 leading-none">—</p>
                    )}
                  </>
                )}
              </div>
            );
          })}

          <div className="flex-1 px-1.5 py-1.5 border-l border-white/8 min-w-0">
            <p className="text-[7px] text-white/25 uppercase tracking-wide leading-none mb-0.5">Form</p>
            {!isRowLocked && conf ? (
              <div className="flex items-center gap-1">
                <span className={`h-[5px] w-[5px] rounded-full shrink-0 ${conf.dot}`} aria-hidden />
                <span className={`text-[9px] font-semibold leading-none ${conf.text}`}>{conf.label}</span>
              </div>
            ) : (
              <p className="text-[9px] text-white/20 leading-none">—</p>
            )}
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && !isRowLocked && (
        <div className="border-t border-white/[0.08] bg-[#0c0c0c] border-l-[3px] border-l-emerald-500/30">
          <ExpandedTeamPanel row={row} lens={lens} isLocked={false} />
        </div>
      )}

      {isExpanded && isRowLocked && (
        <LockedTeamPanel teamName={row.team_name} />
      )}
    </div>
  );
});
