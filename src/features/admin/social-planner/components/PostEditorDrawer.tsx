import { useState } from "react";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import type { SocialPost, PostStatus } from "../types";
import { checkSafety } from "../lib/safetyRules";
import { SafetyCheckPanel } from "./SafetyCheckPanel";
import { CopyPastePanel } from "./CopyPastePanel";

const STATUS_OPTIONS: PostStatus[] = ["draft", "ready", "scheduled", "posted", "archived"];

interface PostEditorDrawerProps {
  post: SocialPost | null;
  onClose: () => void;
  onSave: (post: SocialPost) => void;
}

export function PostEditorDrawer({ post, onClose, onSave }: PostEditorDrawerProps) {
  const [edited, setEdited] = useState<SocialPost | null>(post);
  const [tab, setTab] = useState<"edit" | "copy" | "safety">("edit");

  if (!post || !edited) return null;

  function update<K extends keyof SocialPost>(key: K, value: SocialPost[K]) {
    setEdited(prev => prev ? { ...prev, [key]: value } : null);
  }

  function handleSave() {
    if (edited) onSave(edited);
    onClose();
  }

  const hookSafety    = checkSafety(edited.hook);
  const captionSafety = checkSafety(edited.caption);
  const shortSafety   = checkSafety(edited.shortCaption);

  const copyFields = [
    { label: "Hook", value: edited.hook },
    { label: "Caption (long)", value: edited.caption },
    { label: "Short Caption", value: edited.shortCaption },
    { label: "Hashtags", value: edited.hashtags.join(" ") },
    { label: "Image Prompt", value: edited.imagePrompt, mono: true },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-xl bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <p className="text-xs text-zinc-500">{edited.dayOfWeek} · {edited.date}</p>
            <h2 className="text-sm font-semibold text-zinc-200 mt-0.5">{edited.title}</h2>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={edited.status}
              onChange={e => update("status", e.target.value as PostStatus)}
              className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300 focus:outline-none"
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          {(["edit", "copy", "safety"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-xs font-medium capitalize transition-colors
                ${tab === t
                  ? "border-b-2 border-sky-500 text-sky-400"
                  : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {t === "safety" ? "Safety Check" : t === "copy" ? "Copy & Paste" : "Edit"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "edit" && (
            <EditTab edited={edited} update={update} />
          )}
          {tab === "copy" && (
            <CopyPastePanel fields={copyFields} />
          )}
          {tab === "safety" && (
            <SafetyCheckPanel
              hookResult={hookSafety}
              captionResult={captionSafety}
              shortCaptionResult={shortSafety}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Discard changes
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-xs rounded bg-sky-700 hover:bg-sky-600 text-white transition-colors"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

function EditTab({
  edited,
  update,
}: {
  edited: SocialPost;
  update: <K extends keyof SocialPost>(key: K, value: SocialPost[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <Field label="Hook">
        <textarea
          rows={3}
          value={edited.hook}
          onChange={e => update("hook", e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600 resize-none"
        />
      </Field>

      <Field label="Caption (long)">
        <textarea
          rows={8}
          value={edited.caption}
          onChange={e => update("caption", e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600 resize-none"
        />
      </Field>

      <Field label="Short Caption">
        <textarea
          rows={3}
          value={edited.shortCaption}
          onChange={e => update("shortCaption", e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600 resize-none"
        />
      </Field>

      <Field label="Hashtags (space-separated)">
        <textarea
          rows={3}
          value={edited.hashtags.join(" ")}
          onChange={e => update("hashtags", e.target.value.split(/\s+/).filter(Boolean))}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600 resize-none font-mono"
        />
      </Field>

      <Field label="Image Prompt">
        <textarea
          rows={4}
          value={edited.imagePrompt}
          onChange={e => update("imagePrompt", e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600 resize-none"
        />
      </Field>

      {edited.warnings.length > 0 && (
        <div className="rounded-lg bg-amber-950/40 border border-amber-800/60 p-3">
          <p className="text-xs font-medium text-amber-400 mb-1">Warnings</p>
          {edited.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-300/80">{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
