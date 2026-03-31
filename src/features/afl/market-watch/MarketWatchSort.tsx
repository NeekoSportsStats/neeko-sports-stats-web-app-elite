import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { MWSortKey } from "./types";

interface Props {
  value: MWSortKey;
  onChange: (key: MWSortKey) => void;
}

const OPTIONS: { key: MWSortKey; label: string }[] = [
  { key: "price_rise",   label: "Biggest Rise" },
  { key: "price_fall",   label: "Biggest Drop" },
  { key: "value_score",  label: "Value Score" },
  { key: "cash_gen",     label: "Cash Generation" },
  { key: "projection",   label: "Projection" },
  { key: "confidence",   label: "Confidence" },
];

export function MarketWatchSort({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = OPTIONS.find(o => o.key === value) ?? OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80 hover:border-white/20 transition-colors whitespace-nowrap"
      >
        <span className="text-white/25">Sort:</span>
        <span className="font-semibold text-white/70">{selected.label}</span>
        <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[160px] rounded-xl border border-white/10 bg-[#111] shadow-2xl overflow-hidden py-1">
          {OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => { onChange(opt.key); setOpen(false); }}
              className={`w-full text-left px-3.5 py-2 text-[11px] transition-colors ${
                opt.key === value
                  ? "text-[#F5C84C] bg-[#F5C84C]/8 font-semibold"
                  : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
