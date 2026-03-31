import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import type { PlayerRow, StatLens } from "../Section-1-master-table/MasterTable";
import PlayerInsightsContent from "./PlayerInsightsContent";
import { EPL_STAT_CONFIG } from "@/lib/stats/epl/statConfig";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

type Props = {
  player: PlayerRow;
  selectedStat: StatLens;
  onClose?: () => void;
  onLensChange?: (lens: StatLens) => void;
  isPremium?: boolean;
};

/* -------------------------------------------------------------------------- */
/* CONSTANTS                                                                  */
/* -------------------------------------------------------------------------- */

const CLOSE_THRESHOLD = 140; // px
const MAX_DRAG = 320; // px

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function PlayerInsightsOverlay({
  player,
  selectedStat,
  onClose,
  onLensChange,
  isPremium = false,
}: Props) {
  const [mounted, setMounted] = useState(false);

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);

  const safeClose = onClose ?? (() => {});
  const safeLensChange = onLensChange ?? (() => {});

  const cfg: any = EPL_STAT_CONFIG as any;
  const lenses = (cfg?.availableStats ?? []) as StatLens[];
  const lensLabel = (lens: StatLens) => cfg?.labels?.[lens] ?? String(lens);

  /* ---------------------------------------------------------------------- */
  /* LOCK BACKGROUND SCROLL                                                  */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setMounted(true);

    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* DRAG HANDLERS (HANDLE ONLY)                                             */
  /* ---------------------------------------------------------------------- */

  const handleStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    // Only allow drag if content is at top
    if (scrollEl.scrollTop > 0) return;

    draggingRef.current = true;
    startYRef.current = e.touches[0].clientY;
  };

  const handleMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const sheet = sheetRef.current;
    if (!sheet) return;

    const dy = e.touches[0].clientY - startYRef.current;
    if (dy <= 0) return;

    const clamped = Math.min(dy, MAX_DRAG);
    sheet.style.transform = `translateY(${clamped}px)`;
    e.preventDefault();
  };

  const handleEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;

    const sheet = sheetRef.current;
    if (!sheet) return;

    const dy = e.changedTouches[0].clientY - startYRef.current;

    // ✅ Close if dragged far enough
    if (dy >= CLOSE_THRESHOLD) {
      sheet.style.transition = "transform 0.2s ease-out";
      sheet.style.transform = "translateY(100%)";
      setTimeout(safeClose, 180);
      return;
    }

    // ❌ Otherwise snap back
    sheet.style.transition =
      "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)";
    sheet.style.transform = "translateY(0px)";

    setTimeout(() => {
      if (sheet) sheet.style.transition = "";
    }, 360);
  };

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[999] isolate bg-black/80 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) safeClose();
      }}
    >
      {/* ============================== */}
      {/* DESKTOP PANEL                  */}
      {/* ============================== */}
      <div
        className="
          hidden md:block fixed right-0 top-0 h-full w-[480px]
          bg-black border-l border-yellow-500/30
          shadow-[0_0_80px_rgba(250,204,21,0.45)]
          pointer-events-auto
        "
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="px-5 py-4 flex justify-between border-b border-neutral-800">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-yellow-200/80">
                Player Insights
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {player.name}
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                {player.team} • {player.role}
              </div>
            </div>

            <button
              type="button"
              onClick={safeClose}
              className="rounded-full bg-neutral-900 p-1.5 text-neutral-300 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Lens Pills */}
          <div className="px-5 py-3 flex flex-wrap gap-2 border-b border-neutral-800">
            {lenses.map((lens) => (
              <button
                key={String(lens)}
                type="button"
                onClick={() => safeLensChange(lens)}
                className={
                  selectedStat === lens
                    ? "rounded-full px-3 py-1.5 bg-yellow-400 text-black shadow-lg"
                    : "rounded-full px-3 py-1.5 bg-neutral-900 text-neutral-300 hover:text-white"
                }
              >
                {lensLabel(lens)}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-4 pb-12">
            <PlayerInsightsContent
              player={player}
              selectedStat={selectedStat}
              isPremium={isPremium}
            />
          </div>
        </div>
      </div>

      {/* ============================== */}
      {/* MOBILE BOTTOM SHEET            */}
      {/* ============================== */}
      <div
        className="md:hidden fixed inset-0 flex items-end justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={sheetRef}
          className="
            w-full h-[85vh]
            rounded-t-3xl bg-black
            border-t border-yellow-500/30
            shadow-[0_0_80px_rgba(250,204,21,0.45)]
            flex flex-col
            pointer-events-auto
          "
        >
          {/* Drag Handle */}
          <div
            onTouchStart={handleStart}
            onTouchMove={handleMove}
            onTouchEnd={handleEnd}
            className="py-4 flex justify-center"
            style={{ touchAction: "none" }}
          >
            <div className="h-1.5 w-10 rounded-full bg-yellow-200/80" />
          </div>

          {/* Header */}
          <div className="px-4 pb-3 flex justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-yellow-200">
                Player Insights
              </div>
              <div className="text-sm font-semibold text-white">
                {player.name}
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                {player.team} • {player.role}
              </div>
            </div>

            <button
              type="button"
              onClick={safeClose}
              className="rounded-full bg-neutral-900 p-1.5 text-neutral-300 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Pills */}
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {lenses.map((lens) => (
              <button
                key={String(lens)}
                type="button"
                onClick={() => safeLensChange(lens)}
                className={
                  selectedStat === lens
                    ? "rounded-full px-3 py-1.5 bg-yellow-400 text-black"
                    : "rounded-full px-3 py-1.5 bg-neutral-900 text-neutral-300 hover:text-white"
                }
              >
                {lensLabel(lens)}
              </button>
            ))}
          </div>

          {/* Scrollable Content */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 pb-[max(5rem,env(safe-area-inset-bottom))]"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <PlayerInsightsContent
              player={player}
              selectedStat={selectedStat}
              isPremium={isPremium}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
