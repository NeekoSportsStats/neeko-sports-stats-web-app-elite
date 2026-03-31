import { useRef, useState, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { MarketRow } from "./types";
import { MarketPlayerCard, LockedMarketCard } from "./MarketPlayerCard";
import { FREE_VISIBLE } from "./helpers";

interface Props {
  title: string;
  description: string;
  rows: MarketRow[];
  loading: boolean;
  tab: string;
  icon: React.ReactNode;
  accentClass: string;
  isPremium: boolean;
  onShowUpgrade: () => void;
  onPlayerClick?: (player: MarketRow) => void;
}

function SkeletonCard() {
  return (
    <div className="w-[260px] flex-shrink-0 rounded-xl border border-white/5 bg-white/[0.02] p-4 animate-pulse">
      <div className="flex gap-2 mb-3">
        <div className="w-5 h-3 bg-white/10 rounded" />
        <div className="flex-1 h-3 bg-white/10 rounded" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map(i => <div key={i} className="h-10 bg-white/5 rounded-lg" />)}
      </div>
    </div>
  );
}

export function MarketSection({
  title,
  description,
  rows,
  loading,
  tab,
  icon,
  accentClass,
  isPremium,
  onShowUpgrade,
  onPlayerClick,
}: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = railRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  useEffect(() => {
    checkScroll();
    const el = railRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", checkScroll); ro.disconnect(); };
  }, [rows]);

  const visibleFree = FREE_VISIBLE;

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {icon && (
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accentClass}`}>
                {icon}
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-sm text-white">{title}</h3>
                {rows.length > 0 && (
                  <ChevronRight className="h-3.5 w-3.5 text-white/20" />
                )}
              </div>
              <p className="text-[11px] text-white/35 mt-0.5">{description}</p>
            </div>
          </div>
          {!isPremium && rows.length > visibleFree && (
            <div className="shrink-0">
              <span className="text-[10px] text-white/30 bg-white/5 border border-white/10 px-2 py-1 rounded-full">
                Free: top {visibleFree}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
            style={{ background: "linear-gradient(to right, rgba(10,10,10,0.85) 0%, transparent 100%)" }}
          />
        )}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
            style={{ background: "linear-gradient(to left, rgba(10,10,10,0.85) 0%, transparent 100%)" }}
          />
        )}

        <div
          ref={railRef}
          className="flex overflow-x-auto gap-3 px-4 py-4 pb-5"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {loading
            ? [0, 1, 2, 3].map(i => <SkeletonCard key={i} />)
            : rows.length === 0
            ? (
              <div className="flex items-center justify-center py-10 text-white/30 text-sm w-full">
                No players found in this category right now.
              </div>
            )
            : rows.map((row, idx) => {
                const rank = idx + 1;
                const locked = !isPremium && rank > visibleFree;
                return (
                  <div key={row.player_id ?? idx} className="w-[260px] flex-shrink-0">
                    {locked ? (
                      <LockedMarketCard rank={rank} onUnlock={onShowUpgrade} />
                    ) : (
                      <MarketPlayerCard row={row} tab={tab} rank={rank} onPlayerClick={onPlayerClick} />
                    )}
                  </div>
                );
              })
          }
        </div>
      </div>
    </div>
  );
}
