import { useState, useEffect } from "react";
import { X, Copy, Check } from "lucide-react";
import type { SocialPost, PostStatus, CarouselSlide } from "../types";
import { checkSafety } from "../lib/safetyRules";
import { SafetyCheckPanel } from "./SafetyCheckPanel";

const STATUS_OPTIONS: PostStatus[] = ["draft", "ready", "scheduled", "posted", "archived"];

type DrawerTab = "overview" | "players" | "slides" | "copy_paste" | "image" | "export" | "safety";

const TAB_LABELS: Record<DrawerTab, string> = {
  overview:   "Overview",
  players:    "Game & Players",
  slides:     "Carousel Slides",
  copy_paste: "Hook & Caption",
  image:      "Image Prompts",
  export:     "Export / Copy",
  safety:     "Safety Check",
};

interface PostEditorDrawerProps {
  post: SocialPost | null;
  onClose: () => void;
  onSave: (post: SocialPost) => void;
}

export function PostEditorDrawer({ post, onClose, onSave }: PostEditorDrawerProps) {
  const [edited, setEdited] = useState<SocialPost | null>(null);
  const [tab, setTab] = useState<DrawerTab>("overview");

  useEffect(() => {
    setEdited(post);
    setTab("overview");
  }, [post]);

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
  const hasSafetyIssues = hookSafety.failed || captionSafety.failed || shortSafety.failed;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/60" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{edited.contentType.replace(/_/g, " ")}</p>
              {edited.visibilityBadge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-900/60 border border-sky-700/60 text-sky-300">
                  {edited.visibilityBadge}
                </span>
              )}
              {hasSafetyIssues && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/60 border border-amber-700/60 text-amber-300">
                  Safety issues
                </span>
              )}
            </div>
            <h2 className="text-sm font-semibold text-zinc-100 truncate">{edited.title}</h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">{edited.dayOfWeek} · {edited.date} · {edited.platform}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <select
              value={edited.status}
              onChange={e => update("status", e.target.value as PostStatus)}
              className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300 focus:outline-none"
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-zinc-800 overflow-x-auto shrink-0">
          {(Object.keys(TAB_LABELS) as DrawerTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-[11px] font-medium whitespace-nowrap transition-colors
                ${tab === t
                  ? "border-b-2 border-sky-500 text-sky-400"
                  : "text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent"}`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "overview" && <OverviewTab edited={edited} update={update} />}
          {tab === "players" && <PlayersTab edited={edited} />}
          {tab === "slides" && <SlidesTab edited={edited} />}
          {tab === "copy_paste" && <HookCaptionTab edited={edited} update={update} />}
          {tab === "image" && <ImagePromptsTab edited={edited} update={update} />}
          {tab === "export" && <ExportTab edited={edited} />}
          {tab === "safety" && (
            <SafetyCheckPanel
              hookResult={hookSafety}
              captionResult={captionSafety}
              shortCaptionResult={shortSafety}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800 shrink-0">
          <button
            onClick={onClose}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Discard changes
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-xs rounded bg-sky-700 hover:bg-sky-600 text-white transition-colors font-medium"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({
  edited,
  update,
}: {
  edited: SocialPost;
  update: <K extends keyof SocialPost>(key: K, value: SocialPost[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-zinc-900 border border-zinc-800">
        <MetaItem label="Content Type" value={edited.contentType.replace(/_/g, " ")} />
        <MetaItem label="Day" value={`${edited.dayOfWeek} ${edited.date}`} />
        <MetaItem label="Platform" value={edited.platform} />
        <MetaItem label="Round / Season" value={`R${edited.round} / ${edited.season}`} />
        {edited.homeTeam && edited.awayTeam && (
          <MetaItem label="Game" value={`${edited.homeTeam} v ${edited.awayTeam}`} className="col-span-2" />
        )}
        {edited.visibilityBadge && (
          <MetaItem label="Visibility" value={edited.visibilityBadge} />
        )}
        <MetaItem label="Slides" value={String(edited.carouselSlides.length)} />
        <MetaItem label="Players" value={String(edited.selectedPlayers.length)} />
        <MetaItem label="Hashtags" value={String(edited.hashtags.length)} />
      </div>

      <Field label="Title">
        <input
          type="text"
          value={edited.title}
          onChange={e => update("title", e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
        />
      </Field>

      {edited.warnings.length > 0 && (
        <div className="rounded-lg bg-amber-950/40 border border-amber-800/60 p-3">
          <p className="text-xs font-medium text-amber-400 mb-1.5">Warnings</p>
          <ul className="space-y-0.5">
            {edited.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-300/80">{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Game & Players ──────────────────────────────────────────────────────

function PlayersTab({ edited }: { edited: SocialPost }) {
  if (edited.selectedPlayers.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <p className="text-sm">No players selected for this post.</p>
        <p className="text-xs mt-1 text-zinc-600">Regenerate with player data loaded to populate this tab.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {edited.homeTeam && edited.awayTeam && (
        <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
          <p className="text-xs text-zinc-500 mb-0.5">Game</p>
          <p className="text-sm text-zinc-200 font-medium">{edited.homeTeam} v {edited.awayTeam}</p>
        </div>
      )}

      <div className="space-y-2">
        {edited.selectedPlayers.map((p, i) => (
          <div key={i} className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-zinc-200">{p.playerName}</p>
              <span className="text-[10px] text-zinc-500">{p.team}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-[10px] text-zinc-400">
              <span>{p.statType} · {p.thresholdLabel}</span>
              <span>Record: {p.recordLabel}</span>
              <span>L5 Avg: {p.l5Avg.toFixed(1)}</span>
            </div>
            {p.lastFive.length > 0 && (
              <p className="text-[10px] text-zinc-500 mt-1">
                Last 5: {p.lastFive.join(", ")}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <ConfidencePill tier={p.confidenceTier} />
              {p.includeInFreePost && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-400">
                  Free post
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfidencePill({ tier }: { tier: string }) {
  const config: Record<string, string> = {
    elite:       "bg-sky-950/60 border-sky-800/60 text-sky-400",
    strong:      "bg-emerald-950/60 border-emerald-800/60 text-emerald-400",
    watch:       "bg-amber-950/60 border-amber-800/60 text-amber-400",
    thin_sample: "bg-zinc-800 border-zinc-700 text-zinc-400",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${config[tier] ?? config.thin_sample}`}>
      {tier.replace("_", " ")}
    </span>
  );
}

// ─── Tab: Carousel Slides ─────────────────────────────────────────────────────

function SlidesTab({ edited }: { edited: SocialPost }) {
  if (edited.carouselSlides.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <p className="text-sm">No carousel slides generated.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {edited.carouselSlides.map((slide, i) => (
        <SlideCard key={slide.id} slide={slide} index={i} />
      ))}
    </div>
  );
}

function SlideCard({ slide, index }: { slide: CarouselSlide; index: number }) {
  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">
            Slide {index + 1} · {slide.slideType.replace(/_/g, " ")}
          </p>
          <p className="text-sm font-medium text-zinc-200">{slide.title}</p>
          {slide.subtitle && <p className="text-xs text-zinc-400 mt-0.5">{slide.subtitle}</p>}
        </div>
        {slide.visibilityMode && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400">
            {slide.visibilityMode.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {slide.rows && slide.rows.length > 0 && (
        <div className="mt-2 space-y-1">
          {slide.rows.map((row, ri) => (
            <div
              key={ri}
              className={`flex items-center justify-between text-[11px] px-2 py-1 rounded
                ${row.blurred ? "bg-zinc-800/40 text-zinc-600 italic" : "bg-zinc-800 text-zinc-300"}`}
            >
              <span>{row.blurred ? "(blurred row)" : row.playerName}</span>
              {!row.blurred && <span className="text-zinc-400">{row.l5Avg.toFixed(1)} avg</span>}
            </div>
          ))}
        </div>
      )}

      {(slide.visibleRowCount !== undefined || slide.blurredRowCount !== undefined) && (
        <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-500">
          {slide.visibleRowCount !== undefined && <span>{slide.visibleRowCount} visible rows</span>}
          {slide.blurredRowCount !== undefined && <span>{slide.blurredRowCount} blurred rows</span>}
        </div>
      )}

      {slide.ctaOverlayText && (
        <p className="mt-2 text-[10px] text-sky-400 italic">CTA: {slide.ctaOverlayText}</p>
      )}
    </div>
  );
}

// ─── Tab: Hook & Caption ──────────────────────────────────────────────────────

function HookCaptionTab({
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
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600 resize-none font-mono text-xs"
        />
      </Field>
    </div>
  );
}

// ─── Tab: Image Prompts ───────────────────────────────────────────────────────

function ImagePromptsTab({
  edited,
  update,
}: {
  edited: SocialPost;
  update: <K extends keyof SocialPost>(key: K, value: SocialPost[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <Field label="Cover Image Prompt">
        <textarea
          rows={5}
          value={edited.imagePrompt}
          onChange={e => update("imagePrompt", e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600 resize-none font-mono text-xs"
        />
      </Field>

      {edited.carouselSlides.filter(s => s.imagePrompt).map((slide, i) => (
        <div key={slide.id} className="space-y-1.5">
          <p className="text-xs text-zinc-400">Slide {i + 1} — {slide.title}</p>
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2">
            <p className="text-xs text-zinc-400 font-mono whitespace-pre-wrap">{slide.imagePrompt}</p>
          </div>
        </div>
      ))}

      {edited.carouselSlides.filter(s => s.imagePrompt).length === 0 && (
        <p className="text-xs text-zinc-600">No per-slide image prompts generated.</p>
      )}
    </div>
  );
}

// ─── Tab: Export / Copy ───────────────────────────────────────────────────────

function ExportTab({ edited }: { edited: SocialPost }) {
  const fields = [
    { label: "Hook",            value: edited.hook },
    { label: "Caption (long)",  value: edited.caption },
    { label: "Short Caption",   value: edited.shortCaption },
    { label: "Hashtags",        value: edited.hashtags.join(" ") },
    { label: "Image Prompt",    value: edited.imagePrompt },
  ];

  return (
    <div className="space-y-4">
      {fields.map(f => (
        <CopyField key={f.label} label={f.label} value={f.value} />
      ))}
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">{label}</p>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1 text-[10px] transition-colors
            ${copied ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-200"}`}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-xs text-zinc-300 whitespace-pre-wrap break-words">{value || "(empty)"}</p>
      </div>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function MetaItem({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] text-zinc-500 mb-0.5">{label}</p>
      <p className="text-xs text-zinc-300 capitalize">{value}</p>
    </div>
  );
}
