export interface OpponentModel {
  userProjection: number | null;
  opponentProjection: number | null;
}

export type OpponentState =
  | "leading_strong"
  | "leading"
  | "coin_flip"
  | "chasing"
  | "chasing_heavy"
  | "neutral";

export const DEFAULT_OPPONENT_MODEL: OpponentModel = {
  userProjection: null,
  opponentProjection: null,
};

const STORAGE_KEY = "neeko_opponent_model";

export function loadOpponentModel(): OpponentModel {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OPPONENT_MODEL;
    const parsed = JSON.parse(raw) as Partial<OpponentModel>;
    return {
      userProjection: typeof parsed.userProjection === "number" ? parsed.userProjection : null,
      opponentProjection: typeof parsed.opponentProjection === "number" ? parsed.opponentProjection : null,
    };
  } catch {
    return DEFAULT_OPPONENT_MODEL;
  }
}

export function saveOpponentModel(model: OpponentModel) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
  } catch {
  }
}

export function deriveOpponentState(model: OpponentModel): OpponentState {
  if (model.userProjection == null || model.opponentProjection == null) return "neutral";
  const margin = model.userProjection - model.opponentProjection;
  if (margin >= 15) return "leading_strong";
  if (margin >= 5) return "leading";
  if (margin >= -4) return "coin_flip";
  if (margin >= -14) return "chasing";
  return "chasing_heavy";
}

export function getMargin(model: OpponentModel): number | null {
  if (model.userProjection == null || model.opponentProjection == null) return null;
  return model.userProjection - model.opponentProjection;
}

interface NumberInputProps {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}

function NumberInput({ label, value, onChange }: NumberInputProps) {
  return (
    <div className="flex-1">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-white/25 mb-1.5">{label}</p>
      <input
        type="number"
        min={0}
        max={999}
        placeholder="—"
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === "") { onChange(null); return; }
          const n = parseInt(raw, 10);
          if (!isNaN(n) && n >= 0) onChange(n);
        }}
        className="w-full bg-white/[0.05] border border-white/[0.09] rounded-lg px-3 py-2.5 text-sm font-bold text-white placeholder-white/20 focus:outline-none focus:border-[#F5C84C]/30 focus:bg-white/[0.07] transition-all text-center tabular-nums"
      />
    </div>
  );
}

interface OpponentInputProps {
  value: OpponentModel;
  onChange: (m: OpponentModel) => void;
}

export function OpponentInput({ value, onChange }: OpponentInputProps) {
  const margin = getMargin(value);
  const state = deriveOpponentState(value);

  const marginColor =
    state === "leading_strong" || state === "leading" ? "text-emerald-400"
    : state === "chasing" || state === "chasing_heavy" ? "text-red-400"
    : "text-white/40";

  const marginLabel =
    margin == null ? null
    : margin > 0 ? `+${margin} ahead`
    : margin < 0 ? `${margin} behind`
    : "Tied";

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-bold uppercase tracking-widest text-white/20">Matchup Scores</p>
        <span className="text-[9px] text-white/18">Adjusts advice — not the model verdict</span>
      </div>

      <div className="flex items-end gap-3">
        <NumberInput
          label="Your Score"
          value={value.userProjection}
          onChange={(v) => {
            const next = { ...value, userProjection: v };
            onChange(next);
            saveOpponentModel(next);
          }}
        />

        <div className="pb-2.5 text-white/20 text-xs font-bold shrink-0">vs</div>

        <NumberInput
          label="Opponent Score"
          value={value.opponentProjection}
          onChange={(v) => {
            const next = { ...value, opponentProjection: v };
            onChange(next);
            saveOpponentModel(next);
          }}
        />

        {marginLabel && (
          <div className="pb-2 shrink-0 text-right">
            <p className={`text-sm font-extrabold tabular-nums ${marginColor}`}>{marginLabel}</p>
          </div>
        )}
      </div>

      {margin != null && (
        <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              state === "leading_strong" ? "bg-emerald-400"
              : state === "leading" ? "bg-emerald-400/70"
              : state === "chasing" ? "bg-red-400/70"
              : state === "chasing_heavy" ? "bg-red-400"
              : "bg-white/25"
            }`}
            style={{
              width: margin === 0 ? "50%" : `${Math.min(95, Math.max(5, 50 + (margin / 2)))}%`,
              marginLeft: margin < 0 ? "auto" : undefined,
            }}
          />
        </div>
      )}
    </div>
  );
}
