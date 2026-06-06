import type { PlannerSettings, FreeGameSelectionMode, WeekendPostingMode, AvailabilityFilterMode, ScreenshotRefMode } from "../types";
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
    <div className="space-y-6">
      <h2 className="text-sm font-semibold text-zinc-200">Planner Settings</h2>

      {/* Round / Season */}
      <section className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Round</h3>
        <div className="grid grid-cols-2 gap-4">
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
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Season</label>
            <input
              type="number"
              value={settings.currentSeason}
              onChange={e => update("currentSeason", parseInt(e.target.value) || 2026)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
            />
          </div>
        </div>
      </section>

      {/* Row limits */}
      <section className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Row Limits</h3>
        <div className="grid grid-cols-2 gap-4">
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
      </section>

      {/* Free game / preview system */}
      <section className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Free Game Board</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Free Games per Round</label>
            <input
              type="number"
              min={0}
              max={9}
              value={settings.freeGamesPerRound}
              onChange={e => update("freeGamesPerRound", parseInt(e.target.value) ?? 2)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Free Game Selection</label>
            <select
              value={settings.freeGameSelectionMode}
              onChange={e => update("freeGameSelectionMode", e.target.value as FreeGameSelectionMode)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
            >
              <option value="thu_fri">Thu/Fri games (default)</option>
              <option value="first_two">First 2 chronological</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Thu/Fri Max Rows</label>
            <input
              type="number"
              min={1}
              max={20}
              value={settings.thuFriMaxRows}
              onChange={e => update("thuFriMaxRows", parseInt(e.target.value) || 10)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Sat/Sun Visible Rows</label>
            <input
              type="number"
              min={1}
              max={10}
              value={settings.satSunVisibleRows}
              onChange={e => update("satSunVisibleRows", parseInt(e.target.value) || 3)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Sat/Sun Total Rows</label>
            <input
              type="number"
              min={1}
              max={20}
              value={settings.satSunTotalRows}
              onChange={e => update("satSunTotalRows", parseInt(e.target.value) || 8)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Weekend Posting Mode</label>
            <select
              value={settings.weekendPostingMode}
              onChange={e => update("weekendPostingMode", e.target.value as WeekendPostingMode)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
            >
              <option value="one_per_game">One post per game</option>
              <option value="two_max">Two max per day</option>
              <option value="stories_overflow">Stories overflow</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">CTA Overlay Text</label>
          <input
            type="text"
            value={settings.ctaOverlayText}
            onChange={e => update("ctaOverlayText", e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
          />
        </div>

        <div className="space-y-2 pt-1">
          <Toggle
            label="Show &quot;Free Game Board&quot; badge on cover"
            checked={settings.showFreeGameBadge}
            onChange={v => update("showFreeGameBadge", v)}
          />
          <Toggle
            label="Show &quot;Preview — full board at Neeko&quot; badge"
            checked={settings.showPreviewBadge}
            onChange={v => update("showPreviewBadge", v)}
          />
        </div>
      </section>

      {/* AI Prompt Screenshot References */}
      <section className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">AI Prompt Screenshots</h3>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Screenshot Reference Mode</label>
          <select
            value={settings.screenshotRefMode}
            onChange={e => update("screenshotRefMode", e.target.value as ScreenshotRefMode)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
          >
            <option value="off">Off — no screenshot references</option>
            <option value="product_education_only">Product Education only (recommended)</option>
            <option value="all_board_style">All board-style prompts</option>
          </select>
          <p className="text-[10px] text-zinc-600 mt-1">
            When enabled, adds a style-reference block to AI prompts instructing the designer to extract visual style (colours, layout, typography) from the screenshots attached to each post. Screenshots are added per-post in the Image Prompts tab.
          </p>
        </div>
      </section>

      {/* Player Availability */}
      <section className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Player Availability</h3>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Filter Mode</label>
          <select
            value={settings.availabilityFilterMode}
            onChange={e => update("availabilityFilterMode", e.target.value as AvailabilityFilterMode)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
          >
            <option value="balanced">Balanced (recommended)</option>
            <option value="strict">Strict (available only)</option>
            <option value="manual">Manual (no auto-filtering)</option>
          </select>
          <p className="text-[10px] text-zinc-600 mt-1">
            Balanced: excludes definite absentees, warns on uncertain. Strict: only "available" status. Manual: admin handles everything.
          </p>
        </div>
        <div className="space-y-2 pt-1">
          <Toggle label="Exclude injured players" checked={settings.excludeInjured} onChange={v => update("excludeInjured", v)} />
          <Toggle label="Exclude suspended players" checked={settings.excludeSuspended} onChange={v => update("excludeSuspended", v)} />
          <Toggle label="Exclude omitted players" checked={settings.excludeOmitted} onChange={v => update("excludeOmitted", v)} />
          <Toggle label="Exclude managed / rested players" checked={settings.excludeManaged} onChange={v => update("excludeManaged", v)} />
          <Toggle label="Exclude inactive players" checked={settings.excludeInactive} onChange={v => update("excludeInactive", v)} />
          <Toggle label="Exclude doubtful from auto-selection" checked={settings.excludeDoubtfulFromAuto} onChange={v => update("excludeDoubtfulFromAuto", v)} />
          <Toggle label="Allow manual override for excluded players" checked={settings.allowManualAvailabilityOverride} onChange={v => update("allowManualAvailabilityOverride", v)} />
          <Toggle label="Show warning for unknown availability" checked={settings.showUnknownAvailabilityWarning} onChange={v => update("showUnknownAvailabilityWarning", v)} />
        </div>
      </section>

      {/* Display toggles */}
      <section className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Display</h3>
        <div className="space-y-2">
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
      </section>

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
      <span className="text-xs text-zinc-300" dangerouslySetInnerHTML={{ __html: label }} />
    </label>
  );
}
