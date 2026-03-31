import { useState } from "react";
import AdminWeeklyPlanner from "../marketing/AdminWeeklyPlanner";
import SimpleWeeklyPlanner from "../marketing/SimpleWeeklyPlanner";

type PlannerTab = "ai" | "manual";

export default function AdminContentPlanner() {
  const [tab, setTab] = useState<PlannerTab>("ai");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 border-b border-border pb-3">
        {(["ai", "manual"] as PlannerTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === t
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            {t === "ai" ? "AI Planner" : "Script Planner"}
          </button>
        ))}
      </div>

      {tab === "ai" ? <AdminWeeklyPlanner /> : <SimpleWeeklyPlanner />}
    </div>
  );
}
