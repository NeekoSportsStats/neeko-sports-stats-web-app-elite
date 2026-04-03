import type { RankingRow } from "./types";

interface PlayerStatusPillProps {
  row: Pick<RankingRow, "manual_status" | "status" | "is_bye" | "bye_next_round" | "bye_round">;
  showUpcomingBye?: boolean;
}

export function PlayerStatusPill({ row, showUpcomingBye = false }: PlayerStatusPillProps) {
  const effectiveStatus = (row.manual_status ?? row.status)?.toUpperCase();

  if (effectiveStatus === "OUT") {
    return (
      <span className="rounded-sm bg-red-500/15 px-1 py-0.5 text-[9px] font-semibold text-red-400 uppercase border border-red-500/20 shrink-0 leading-none">
        OUT
      </span>
    );
  }

  if (effectiveStatus === "INJURED") {
    return (
      <span className="rounded-sm bg-orange-500/15 px-1 py-0.5 text-[9px] font-semibold text-orange-400 uppercase border border-orange-500/20 shrink-0 leading-none">
        INJ
      </span>
    );
  }

  if (effectiveStatus === "TEST") {
    return (
      <span className="rounded-sm bg-orange-500/15 px-1 py-0.5 text-[9px] font-semibold text-orange-400 uppercase border border-orange-500/20 shrink-0 leading-none">
        TEST
      </span>
    );
  }

  if (row.is_bye) {
    return (
      <span className="rounded-sm bg-white/10 px-1 py-0.5 text-[9px] font-semibold text-white/40 uppercase border border-white/15 shrink-0 leading-none">
        BYE
      </span>
    );
  }

  if (showUpcomingBye && row.bye_next_round) {
    return (
      <span className="rounded-sm bg-white/[0.08] px-1 py-0.5 text-[9px] font-semibold text-white/30 uppercase border border-white/10 shrink-0 leading-none">
        {row.bye_round != null ? `BYE R${row.bye_round}` : "BYE"}
      </span>
    );
  }

  return null;
}
