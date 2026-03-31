import { useEffect, useState } from "react";
import { Crown, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CaptainRow {
  player_id: string | null;
  player_name: string;
  team: string;
  projection_final: number | null;
  captain_score: number | null;
  captain_rating: string | null;
  projection_confidence: number | null;
}

function fmt(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return n.toFixed(decimals);
}

const MEDALS = [
  { label: "Gold", color: "#F5C84C" },
  { label: "Silver", color: "#C0C0C0" },
  { label: "Bronze", color: "#CD7F32" },
  { label: "4th", color: "#94a3b8" },
  { label: "5th", color: "#94a3b8" },
];

function getCaptainStyle(rating: string | null) {
  if (!rating) return { text: "text-white/30", bg: "bg-white/5", border: "border-white/10" };
  const r = rating.toUpperCase();
  if (r.includes("ELITE") || r.includes("LOCK")) return { text: "text-[#F5C84C]", bg: "bg-[#F5C84C]/10", border: "border-[#F5C84C]/30" };
  if (r.includes("STRONG")) return { text: "text-emerald-300", bg: "bg-emerald-400/10", border: "border-emerald-400/30" };
  if (r.includes("OPTION")) return { text: "text-sky-300", bg: "bg-sky-400/10", border: "border-sky-400/30" };
  return { text: "text-orange-300", bg: "bg-orange-400/10", border: "border-orange-400/30" };
}

function LockedCaptainCard({ medal }: { medal: { label: string; color: string } }) {
  return (
    <div className="relative rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 overflow-hidden">
      <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl backdrop-blur-sm bg-[#0d0d0d]/70 z-10">
        <Lock size={14} className="text-[#F5C84C]/60 mb-1.5" />
        <span className="text-[11px] font-semibold text-[#F5C84C]/70">Neeko+ only</span>
      </div>
      <div className="blur-sm select-none pointer-events-none space-y-2">
        <div className="flex items-center gap-1 mb-1" style={{ color: medal.color }}>
          <span className="text-xs font-semibold">{medal.label} Captain</span>
        </div>
        <div className="h-3 w-24 rounded bg-white/10" />
        <div className="h-3 w-16 rounded bg-white/5" />
        <div className="h-3 w-20 rounded bg-white/5" />
      </div>
    </div>
  );
}

function CaptainCard({
  row,
  medalIdx,
  isPremium,
}: {
  row: CaptainRow;
  medalIdx: number;
  isPremium: boolean;
}) {
  const medal = MEDALS[medalIdx] ?? MEDALS[4];
  const style = getCaptainStyle(row.captain_rating);
  const conf = row.projection_confidence;
  const isTop = medalIdx === 0;
  const confColor =
    conf == null ? "text-white/40"
    : conf >= 80 ? "text-green-400"
    : conf >= 60 ? "text-[#F5C84C]"
    : "text-orange-400";

  return (
    <div
      className={`rounded-xl border p-4 flex flex-col gap-3 ${style.bg} ${style.border} ${
        isTop ? "shadow-[0_0_18px_rgba(245,200,76,0.25)]" : ""
      }`}
    >
      {/* Medal label */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold" style={{ color: medal.color }}>
          {medal.label} Captain
        </span>
        {row.captain_rating && (
          <span className={`text-[10px] font-semibold ${style.text}`}>{row.captain_rating}</span>
        )}
      </div>

      {/* Player name */}
      <div className="min-w-0">
        <p className="text-sm font-bold text-white leading-tight truncate">{row.player_name}</p>
        <p className="text-[11px] text-white/40 mt-0.5">{row.team}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] text-white/30 mb-0.5">Proj</p>
          <p className={`text-sm font-bold tabular-nums ${style.text}`}>{fmt(row.projection_final)}</p>
        </div>
        <div>
          <p className="text-[10px] text-white/30 mb-0.5">Score</p>
          <p className="text-sm font-bold text-white/70 tabular-nums">{fmt(row.captain_score)}</p>
        </div>
        {isPremium && conf != null && (
          <div>
            <p className="text-[10px] text-white/30 mb-0.5">Conf</p>
            <p className={`text-sm font-bold tabular-nums ${confColor}`}>{Math.round(conf)}%</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function NeekoIntelCaptainModule({ isPremium }: { isPremium: boolean }) {
  const [captains, setCaptains] = useState<CaptainRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const rpc = isPremium ? "get_captain_recommendations_premium" : "get_captain_recommendations_free";
      const { data } = await supabase.rpc(rpc);
      if (!cancelled) {
        setCaptains((data as CaptainRow[]) ?? []);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [isPremium]);

  const FREE_VISIBLE = 2;
  const TOTAL = 5;

  const visibleCards = isPremium ? captains : captains.slice(0, FREE_VISIBLE);
  const lockedCount = isPremium ? 0 : Math.max(0, TOTAL - visibleCards.length);
  const lockedStartIdx = visibleCards.length;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0d0d0d] p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#F5C84C]/10 text-[#F5C84C] shrink-0">
          <Crown size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white">Captain Picks</h2>
            {!isPremium && (
              <Lock size={12} className="text-[#F5C84C]/50 shrink-0" />
            )}
          </div>
          <p className="text-[11px] text-white/35 mt-0.5">
            {isPremium ? "Top 5 ranked by captain score" : "Top 2 shown · unlock all 5 with Neeko+"}
          </p>
        </div>
        {isPremium && (
          <div className="shrink-0 flex items-center gap-1 bg-[#F5C84C]/10 border border-[#F5C84C]/20 rounded-lg px-2.5 py-1.5">
            <Crown size={10} className="text-[#F5C84C]" />
            <span className="text-[10px] font-semibold text-[#F5C84C]">Full Access</span>
          </div>
        )}
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {visibleCards.map((c, idx) => (
            <CaptainCard key={c.player_id ?? `captain-${idx}`} row={c} medalIdx={idx} isPremium={isPremium} />
          ))}
          {Array.from({ length: lockedCount }).map((_, i) => (
            <LockedCaptainCard key={`locked-${i}`} medal={MEDALS[lockedStartIdx + i] ?? MEDALS[4]} />
          ))}
        </div>
      )}

      {/* Free upgrade prompt */}
      {!isPremium && !loading && (
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-[#F5C84C]/15 bg-[#F5C84C]/5 px-4 py-3">
          <p className="text-sm text-[#F5C84C]/80 font-medium">
            Unlock all 5 elite captain picks with Neeko+
          </p>
          <a
            href="/neeko-plus"
            className="inline-flex items-center gap-1.5 bg-[#F5C84C] text-black font-semibold rounded-lg hover:brightness-110 transition-all duration-150 px-4 py-2 text-sm whitespace-nowrap shrink-0"
          >
            <Crown size={13} />
            Upgrade to Neeko+
          </a>
        </div>
      )}
    </div>
  );
}
