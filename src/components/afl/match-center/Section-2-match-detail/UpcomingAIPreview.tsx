import React from "react";

export default function UpcomingAIPreview() {
  return (
    <div className="relative rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 overflow-hidden">
      <div className="absolute inset-0 backdrop-blur-sm" />

      <div className="relative text-xs text-white/80 space-y-2">
        <div className="font-semibold text-amber-300">
          AI Preview
        </div>

        <p>
          Midfield pressure profiles favour the home side based on
          recent comparable matchups.
        </p>

        <p>
          Expected scoring efficiency differential remains narrow.
        </p>
      </div>
    </div>
  );
}
