import React from "react";
import { ArrowRight } from "lucide-react";

export default function MatchCenterCTA() {
  return (
    <div className="rounded-xl border border-amber-400/25 bg-gradient-to-r from-amber-400/10 to-amber-400/5 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-white">
            Ready for deeper match insight?
          </div>
          <div className="text-xs text-white/60">
            Full interpretation lives on the AI Insights page.
          </div>
        </div>

        <button className="flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black hover:bg-amber-300 transition">
          Open AI Insights
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
