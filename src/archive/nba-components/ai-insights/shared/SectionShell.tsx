import React from "react";
import { Lock } from "lucide-react";

export default function SectionShell(props: {
  title: string;
  subtitle?: string;
  locked?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { title, subtitle, locked, right, children } = props;
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <div className="flex items-start justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-semibold text-white">{title}</h2>
            {locked ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
                <Lock className="h-3 w-3" />
                Neeko+
              </span>
            ) : null}
          </div>
          {subtitle ? <p className="mt-1 text-sm text-white/65">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="px-4 pb-4 sm:px-6 sm:pb-6">{children}</div>
    </section>
  );
}
