export interface GameContext {
  matchState: "leading" | "close" | "chasing";
  playStyle: "safe" | "balanced" | "upside";
  timing: "early" | "mid" | "late";
}

export const DEFAULT_GAME_CONTEXT: GameContext = {
  matchState: "close",
  playStyle: "balanced",
  timing: "mid",
};

const STORAGE_KEY = "neeko_game_context";

export function loadGameContext(): GameContext {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GAME_CONTEXT;
    const parsed = JSON.parse(raw) as Partial<GameContext>;
    return {
      matchState: parsed.matchState ?? DEFAULT_GAME_CONTEXT.matchState,
      playStyle: parsed.playStyle ?? DEFAULT_GAME_CONTEXT.playStyle,
      timing: parsed.timing ?? DEFAULT_GAME_CONTEXT.timing,
    };
  } catch {
    return DEFAULT_GAME_CONTEXT;
  }
}

export function saveGameContext(ctx: GameContext) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  } catch {
  }
}

interface PillGroupProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

function PillGroup<T extends string>({ options, value, onChange }: PillGroupProps<T>) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
            value === opt.value
              ? "bg-[#F5C84C]/12 border-[#F5C84C]/30 text-[#F5C84C]/80"
              : "bg-white/[0.03] border-white/[0.07] text-white/30 hover:text-white/50 hover:border-white/15"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface GameContextSelectorProps {
  value: GameContext;
  onChange: (ctx: GameContext) => void;
}

export function GameContextSelector({ value, onChange }: GameContextSelectorProps) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] px-4 py-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-bold uppercase tracking-widest text-white/20">Game Context</p>
        <span className="text-[9px] text-white/18">Personalises advice — not the model verdict</span>
      </div>

      <div className="flex flex-wrap gap-y-2 gap-x-4">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-white/25 uppercase tracking-wider w-12 shrink-0">Match</span>
          <PillGroup
            options={[
              { value: "leading", label: "Leading" },
              { value: "close", label: "Close" },
              { value: "chasing", label: "Chasing" },
            ]}
            value={value.matchState}
            onChange={(v) => {
              const next = { ...value, matchState: v };
              onChange(next);
              saveGameContext(next);
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[9px] text-white/25 uppercase tracking-wider w-12 shrink-0">Style</span>
          <PillGroup
            options={[
              { value: "safe", label: "Safe" },
              { value: "balanced", label: "Balanced" },
              { value: "upside", label: "Upside" },
            ]}
            value={value.playStyle}
            onChange={(v) => {
              const next = { ...value, playStyle: v };
              onChange(next);
              saveGameContext(next);
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[9px] text-white/25 uppercase tracking-wider w-12 shrink-0">Round</span>
          <PillGroup
            options={[
              { value: "early", label: "Early" },
              { value: "mid", label: "Mid" },
              { value: "late", label: "Late" },
            ]}
            value={value.timing}
            onChange={(v) => {
              const next = { ...value, timing: v };
              onChange(next);
              saveGameContext(next);
            }}
          />
        </div>
      </div>
    </div>
  );
}
