import { useState } from "react";
import { HOOKS, getHooksByCategory, type HookCategory } from "../lib/hookLibrary";
import { CAPTIONS, getCaptionsByCategory } from "../lib/captionLibrary";
import type { SocialPost } from "../types";

const CATEGORIES: { value: HookCategory; label: string }[] = [
  { value: "match_board",     label: "Match Board" },
  { value: "player_spotlight", label: "Player Spotlight" },
  { value: "disposal",        label: "Disposal" },
  { value: "goal",            label: "Goal" },
  { value: "product",         label: "Product / Education" },
  { value: "round_review",    label: "Round Review" },
  { value: "round_ahead",     label: "Round Ahead" },
];

interface HookCaptionLibraryProps {
  onInsertHook?: (template: string) => void;
  onInsertCaption?: (template: string) => void;
}

export function HookCaptionLibrary({ onInsertHook, onInsertCaption }: HookCaptionLibraryProps) {
  const [category, setCategory] = useState<HookCategory>("match_board");
  const [tab, setTab] = useState<"hooks" | "captions">("hooks");

  const hooks = getHooksByCategory(category);
  const captions = getCaptionsByCategory(category);

  return (
    <div className="flex flex-col h-full">
      {/* Tab toggle */}
      <div className="flex border-b border-zinc-800 mb-4">
        {(["hooks", "captions"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium capitalize transition-colors
              ${tab === t
                ? "border-b-2 border-sky-500 text-sky-400"
                : "text-zinc-500 hover:text-zinc-300"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Category selector */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors
              ${category === c.value
                ? "bg-sky-900/60 border-sky-700 text-sky-300"
                : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Template list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {tab === "hooks"
          ? hooks.map(hook => (
              <TemplateItem
                key={hook.id}
                id={hook.id}
                text={hook.template}
                onInsert={onInsertHook}
              />
            ))
          : captions.map(cap => (
              <TemplateItem
                key={cap.id}
                id={cap.id}
                text={cap.template}
                onInsert={onInsertCaption}
              />
            ))}
      </div>
    </div>
  );
}

function TemplateItem({
  id,
  text,
  onInsert,
}: {
  id: string;
  text: string;
  onInsert?: (t: string) => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-zinc-800 bg-zinc-900 p-3 hover:border-zinc-700 transition-colors group">
      <div className="flex-1 min-w-0">
        <span className="text-[10px] text-zinc-600 font-mono mr-2">{id}</span>
        <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-sans mt-1">{text}</pre>
      </div>
      {onInsert && (
        <button
          onClick={() => onInsert(text)}
          className="shrink-0 text-[11px] text-sky-400 hover:text-sky-300 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Use
        </button>
      )}
    </div>
  );
}
