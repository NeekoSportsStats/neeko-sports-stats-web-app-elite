import { useEffect, useRef } from "react";
import { MWSummary } from "./types";

interface NavItem {
  label: string;
  id: string;
  count: number;
  color: string;
  activeColor: string;
}

interface Props {
  summary: MWSummary | null;
  activeSection: string | null;
}

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const yOffset = -72;
  const y = el.getBoundingClientRect().top + window.scrollY + yOffset;
  window.scrollTo({ top: y, behavior: "smooth" });
}

export function MarketWatchBanner({ summary, activeSection }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const items: NavItem[] = [
    {
      label: "Upgrade Targets",
      id: "section-upgrades",
      count: summary?.upgrade_target_count ?? 0,
      color: "text-sky-400/60 border-sky-400/20 hover:border-sky-400/50 hover:text-sky-400",
      activeColor: "text-sky-400 border-sky-400/60 bg-sky-400/[0.07]",
    },
    {
      label: "Buy Before Rise",
      id: "section-buy",
      count: summary?.buy_before_rise_count ?? 0,
      color: "text-green-400/60 border-green-400/20 hover:border-green-400/50 hover:text-green-400",
      activeColor: "text-green-400 border-green-400/60 bg-green-400/[0.07]",
    },
    {
      label: "Cash Cows",
      id: "section-cash-cows",
      count: summary?.cash_cow_count ?? 0,
      color: "text-[#F5C84C]/60 border-[#F5C84C]/20 hover:border-[#F5C84C]/50 hover:text-[#F5C84C]",
      activeColor: "text-[#F5C84C] border-[#F5C84C]/60 bg-[#F5C84C]/[0.07]",
    },
    {
      label: "Sell Before Drop",
      id: "section-sell",
      count: summary?.sell_count ?? 0,
      color: "text-red-400/60 border-red-400/20 hover:border-red-400/50 hover:text-red-400",
      activeColor: "text-red-400 border-red-400/60 bg-red-400/[0.07]",
    },
    {
      label: "Fades & Traps",
      id: "section-traps",
      count: summary?.trap_count ?? 0,
      color: "text-orange-400/60 border-orange-400/20 hover:border-orange-400/50 hover:text-orange-400",
      activeColor: "text-orange-400 border-orange-400/60 bg-orange-400/[0.07]",
    },
  ].filter(item => item.count > 0);

  useEffect(() => {
    if (!activeSection || !scrollRef.current) return;
    const container = scrollRef.current;
    const activeBtn = container.querySelector(`[data-section="${activeSection}"]`) as HTMLElement | null;
    if (!activeBtn) return;
    const btnLeft = activeBtn.offsetLeft;
    const btnWidth = activeBtn.offsetWidth;
    const containerWidth = container.offsetWidth;
    const targetScrollLeft = btnLeft - containerWidth / 2 + btnWidth / 2;
    container.scrollTo({ left: targetScrollLeft, behavior: "smooth" });
  }, [activeSection]);

  if (items.length === 0) return null;

  return (
    <div className="sticky top-0 z-30 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/[0.05]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          ref={scrollRef}
          className="flex items-center gap-2 py-2.5 overflow-x-auto scrollbar-none"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {items.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                data-section={item.id}
                onClick={() => scrollToSection(item.id)}
                className={`
                  shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold
                  transition-all duration-150 whitespace-nowrap
                  ${isActive ? item.activeColor : item.color}
                `}
              >
                {item.label}
                <span className={`
                  text-[10px] font-bold px-1.5 py-0.5 rounded-full
                  ${isActive ? "bg-white/10" : "bg-white/[0.05]"}
                `}>
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
