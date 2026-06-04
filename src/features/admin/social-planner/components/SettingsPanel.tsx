import type { PlannerSettings } from "../types";
import { DEFAULT_SETTINGS } from "../types";

interface SettingsPanelProps {
  settings: PlannerSettings;
  onChange: (settings: PlannerSettings) => void;
  onClose: () => void;
}

export function SettingsPanel({ settings, onChange, onClose }: SettingsPanelProps) {
  function update<K extends keyof PlannerSettings>(key: K, value: PlannerSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className="space-y-5">
      <h2 className="text-sm font-semibold text-zinc-200">Planner Settings</h2>

      <div className="grid grid-cols-2 gap-4">
        {/* Current Round */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Current Round</label>
          <input
            type="number"
            min={1}
            max={24}
            value={settings.currentRound}
            onChange={e => update("currentRound", parseInt(e.target.value) || 1)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
          />
        </div>

        {/* Season */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Season</label>
          <input
            type="number"
            value={settings.currentSeason}
            onChange={e => update("currentSeason", parseInt(e.target.value) || 2026)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
          />
        </div>

        {/* Max disposal rows */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Max Disposal Rows / Team</label>
          <input
            type="number"
            min={1}
            max={10}
            value={settings.maxDisposalRowsPerTeam}
            onChange={e => update("maxDisposalRowsPerTeam", parseInt(e.target.value) || 5)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
          />
        </div>

        {/* Max goal rows */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Max Goal Rows / Team</label>
          <input
            type="number"
            min={1}
            max={8}
            value={settings.maxGoalRowsPerTeam}
            onChange={e => update("maxGoalRowsPerTeam", parseInt(e.target.value) || 4)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
          />
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        <Toggle
          label="Weekend extra posts (scale to 4 if 4 games)"
          checked={settings.weekendExtraPosts}
          onChange={v => update("weekendExtraPosts", v)}
        />
        <Toggle
          label="Show projections in slides"
          checked={settings.showProjections}
          onChange={v => update("showProjections", v)}
        />
        <Toggle
          label="Show percentages (alongside ratios)"
          checked={settings.showPercentages}
          onChange={v => update("showPercentages", v)}
        />
        <Toggle
          label="Require CTA in all captions"
          checked={settings.ctaRequired}
          onChange={v => update("ctaRequired", v)}
        />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
        <button
          onClick={() => onChange(DEFAULT_SETTINGS)}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          Reset to defaults
        </button>
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-xs rounded bg-sky-700 hover:bg-sky-600 text-white transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-8 h-4 rounded-full transition-colors ${checked ? "bg-sky-600" : "bg-zinc-700"}`}
      >
        <div
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </div>
      <span className="text-xs text-zinc-300">{label}</span>
    </label>
  );
}
