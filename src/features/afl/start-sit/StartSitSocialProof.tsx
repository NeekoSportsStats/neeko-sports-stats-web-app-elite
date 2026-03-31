import { useMemo, useEffect, useState } from "react";
import { Flame, Scale, ChevronRight, Users } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export interface QuickFillPlayer {
  player_id: string | number;
  player_name: string;
  team: string | null;
  position: string | null;
  projection_final: number | null;
  ceiling: number | null;
  floor: number | null;
  projection_confidence: number | null;
  risk_rating: number | null;
  neeko_rating: number | null;
}

interface SocialProofMatchup {
  playerA: QuickFillPlayer;
  playerB: QuickFillPlayer;
  comparisons: number;
  splitA?: number;
  isSeeded?: boolean;
}

interface PopularityRow {
  player_a_id: string;
  player_a_name: string;
  player_b_id: string;
  player_b_name: string;
  comparison_count: number;
  win_a_pct: number | null;
  last_compared_at: string;
}

interface SocialProofProps {
  players: QuickFillPlayer[];
  onFillBoth: (a: QuickFillPlayer, b: QuickFillPlayer) => void;
  onScrollToCompare: () => void;
}

function MatchupRow({
  matchup,
  showSplit,
  isLast,
  onClick,
}: {
  matchup: SocialProofMatchup;
  showSplit: boolean;
  isLast: boolean;
  onClick: () => void;
}) {
  const splitA = matchup.splitA ?? 50;
  const splitB = 100 - splitA;
  const isTight = splitA >= 45 && splitA <= 55;

  return (
    <button
      onClick={onClick}
      className={`w-full group flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left ${
        !isLast ? "border-b border-white/[0.05]" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-sm font-semibold text-white/65 truncate group-hover:text-white/85 transition-colors">
            {matchup.playerA.player_name}
          </span>
          <span className="text-[10px] text-white/20 shrink-0 px-0.5">vs</span>
          <span className="text-sm font-semibold text-white/65 truncate group-hover:text-white/85 transition-colors">
            {matchup.playerB.player_name}
          </span>
        </div>

        {showSplit && !matchup.isSeeded && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-0.5 rounded-full bg-white/[0.06] overflow-hidden max-w-[100px]">
              <div
                className={`h-full rounded-l-full ${isTight ? "bg-[#F5C84C]/35" : "bg-[#F5C84C]/55"}`}
                style={{ width: `${splitA}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-white/25 font-medium">
              {splitA}% / {splitB}%
            </span>
          </div>
        )}

        {matchup.isSeeded && (matchup.playerA.position || matchup.playerB.position) && (
          <p className="text-[10px] text-white/20 mt-0.5 truncate">
            {[matchup.playerA.team, matchup.playerA.position].filter(Boolean).join(" · ")}
            {" "}vs{" "}
            {[matchup.playerB.team, matchup.playerB.position].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      <ChevronRight size={12} className="text-white/15 group-hover:text-white/35 transition-colors shrink-0" />
    </button>
  );
}

export function StartSitSocialProof({ players, onFillBoth, onScrollToCompare }: SocialProofProps) {
  const [livePopularity, setLivePopularity] = useState<PopularityRow[] | null>(null);

  useEffect(() => {
    supabase
      .rpc("get_start_sit_popularity", { days_back: 7, limit_n: 6 })
      .then(({ data }) => {
        setLivePopularity(data ? (data as PopularityRow[]) : []);
      })
      .catch(() => setLivePopularity([]));
  }, []);

  const playerMap = useMemo(() => {
    const map = new Map<string, QuickFillPlayer>();
    for (const p of players) {
      map.set(p.player_name, p);
      map.set(String(p.player_id), p);
    }
    return map;
  }, [players]);

  const popularMatchups = useMemo((): SocialProofMatchup[] => {
    if (!livePopularity) return [];
    return livePopularity
      .map((row) => {
        const pA = playerMap.get(row.player_a_name) ?? playerMap.get(row.player_a_id);
        const pB = playerMap.get(row.player_b_name) ?? playerMap.get(row.player_b_id);
        if (!pA || !pB) return null;
        return {
          playerA: pA,
          playerB: pB,
          comparisons: Number(row.comparison_count),
          splitA: row.win_a_pct != null ? Number(row.win_a_pct) : undefined,
        };
      })
      .filter((m): m is SocialProofMatchup => m !== null)
      .slice(0, 4);
  }, [livePopularity, playerMap]);

  const closeDecisions = useMemo((): SocialProofMatchup[] => {
    return popularMatchups
      .filter((m) => {
        const pct = m.splitA ?? null;
        return pct != null && pct >= 44 && pct <= 56;
      })
      .slice(0, 3);
  }, [popularMatchups]);

  const seededMatchups = useMemo((): SocialProofMatchup[] => {
    if (players.length < 6) return [];
    const top = players.slice(0, 20);
    const pairs: SocialProofMatchup[] = [];
    const usedIds = new Set<string>();

    for (let i = 0; i < top.length && pairs.length < 4; i++) {
      for (let j = i + 1; j < top.length && pairs.length < 4; j++) {
        const a = top[i];
        const b = top[j];
        const aId = String(a.player_id);
        const bId = String(b.player_id);
        if (
          a.position === b.position &&
          !usedIds.has(aId) &&
          !usedIds.has(bId)
        ) {
          pairs.push({ playerA: a, playerB: b, comparisons: 0, isSeeded: true });
          usedIds.add(aId);
          usedIds.add(bId);
        }
      }
    }

    if (pairs.length < 4) {
      for (let i = 0; i < top.length && pairs.length < 4; i += 2) {
        if (i + 1 < top.length) {
          const a = top[i];
          const b = top[i + 1];
          const aId = String(a.player_id);
          const bId = String(b.player_id);
          if (!usedIds.has(aId) && !usedIds.has(bId)) {
            pairs.push({ playerA: a, playerB: b, comparisons: 0, isSeeded: true });
            usedIds.add(aId);
            usedIds.add(bId);
          }
        }
      }
    }

    return pairs;
  }, [players]);

  function handleMatchupClick(a: QuickFillPlayer, b: QuickFillPlayer) {
    onFillBoth(a, b);
    onScrollToCompare();
  }

  if (livePopularity === null) return null;

  const hasLiveData = popularMatchups.length > 0;

  const matchupsToShow = hasLiveData ? popularMatchups : seededMatchups;
  const sectionLabel = hasLiveData ? "Popular This Week" : "Try These Matchups";
  const SectionIcon = hasLiveData ? Flame : Users;

  return (
    <div className="mt-5">
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
          <SectionIcon size={11} className={hasLiveData ? "text-orange-400/60" : "text-white/25"} />
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/25">
            {sectionLabel}
          </p>
        </div>

        {matchupsToShow.length > 0 ? (
          <div>
            {matchupsToShow.map((m, i) => (
              <MatchupRow
                key={i}
                matchup={m}
                showSplit={hasLiveData}
                isLast={i === matchupsToShow.length - 1}
                onClick={() => handleMatchupClick(m.playerA, m.playerB)}
              />
            ))}
          </div>
        ) : (
          <div className="px-4 py-5 text-center">
            <p className="text-xs text-white/25">Select two players above to compare.</p>
          </div>
        )}
      </div>

      {hasLiveData && closeDecisions.length > 0 && (
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
            <Scale size={11} className="text-sky-400/60" />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/25">
              Toughest Calls
            </p>
          </div>
          <div>
            {closeDecisions.map((m, i) => (
              <MatchupRow
                key={i}
                matchup={m}
                showSplit={true}
                isLast={i === closeDecisions.length - 1}
                onClick={() => handleMatchupClick(m.playerA, m.playerB)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
