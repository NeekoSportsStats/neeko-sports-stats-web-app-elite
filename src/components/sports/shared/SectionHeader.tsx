import React from "react";
import { Lock, Sparkles, LucideIcon } from "lucide-react";

interface SectionHeaderProps {
  pillLabel?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  description?: string;
  badge?: "neeko+" | "free";
  icon?: LucideIcon;
  rightSlot?: React.ReactNode;
}

export function SectionHeader(props: SectionHeaderProps) {
  const { pillLabel, eyebrow, title, subtitle, description, badge, icon: Icon = Sparkles, rightSlot } = props;

  return (
    <div className="mb-5 md:mb-7">
      {(eyebrow || pillLabel) && (
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-black/60 px-3 py-1.5 text-[11px] text-amber-200/90 mb-3">
          <Icon className="h-3.5 w-3.5 text-amber-300" />
          <span className="uppercase tracking-[0.15em] font-medium">{eyebrow || pillLabel}</span>
        </div>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-white sm:text-3xl tracking-tight">{title}</h2>
            {badge === "neeko+" && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">
                <Lock className="h-3 w-3" />
                Neeko+
              </div>
            )}
            {badge === "free" && (
              <div className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                Free
              </div>
            )}
          </div>
          {(subtitle || description) && (
            <p className="mt-2 text-sm text-white/60 max-w-2xl">{subtitle || description}</p>
          )}
        </div>

        {rightSlot && (
          <div className="flex items-center gap-2 flex-wrap">{rightSlot}</div>
        )}
      </div>
    </div>
  );
}
