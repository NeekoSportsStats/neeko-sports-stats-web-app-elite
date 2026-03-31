import React from "react";
import { Button } from "@/components/ui/button";

export default function MatchDetailCTA() {
  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
      <div className="text-sm mb-2">Deeper Match Insights</div>
      <Button className="w-full">Open AI Match Analysis →</Button>
    </div>
  );
}
