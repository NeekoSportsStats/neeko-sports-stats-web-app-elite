import { Calendar, Settings, BookOpen, LayoutList } from "lucide-react";
import type { WeekSchedule } from "../lib/scheduleEngine";

interface PlannerHeaderProps {
  schedule: WeekSchedule | null;
  onSettings: () => void;
}

export function PlannerHeader({ schedule, onSettings }: PlannerHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
          AFL Content Command Centre
        </h1>
        {schedule && (
          <p className="text-sm text-zinc-400 mt-0.5">
            Round {schedule.round} &middot; {schedule.slots.length} posts scheduled
          </p>
        )}
      </div>
      <button
        onClick={onSettings}
        className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors border border-zinc-700"
      >
        <Settings className="w-3.5 h-3.5" />
        Settings
      </button>
    </div>
  );
}
