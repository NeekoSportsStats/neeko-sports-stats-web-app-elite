import React from "react";
import { Lock } from "lucide-react";

interface Values {
  team: string;
  pos: string;
  round: string;
}

interface Props {
  teams: string[];
  positions: string[];
  rounds: string[];
  values: Values;
  onChange: (v: Partial<Values>) => void;
  isPremium: boolean;
}

export default function FilterBarPro({
  teams,
  positions,
  rounds,
  values,
  onChange,
  isPremium,
}: Props) {
  const render = (v: string, type: keyof Values) => {
    const locked = !isPremium && v !== "All";

    return (
      <button
        key={`${type}-${v}`}
        disabled={locked}
        className={`px-3 py-1.5 rounded-full text-xs border transition ${
          values[type] === v
            ? "bg-yellow-400 text-black border-yellow-300"
            : "bg-neutral-900 text-neutral-300 border-neutral-700"
        } ${locked ? "opacity-50 cursor-not-allowed" : "hover:bg-neutral-800"}`}
        onClick={() => onChange({ [type]: v })}
      >
        {locked ? (
          <span className="flex items-center gap-1">
            <Lock size={12} /> {v}
          </span>
        ) : (
          v
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {teams.map((t) => render(t, "team"))}
      {positions.map((p) => render(p, "pos"))}
      {rounds.map((r) => render(r, "round"))}
    </div>
  );
}
