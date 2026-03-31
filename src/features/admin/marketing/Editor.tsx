import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Save, Trash2, Copy, Check, FileText, Plus,
  CopyPlus, ChevronDown, Link2, User, Image as ImageIcon,
  Clapperboard, AlignLeft, BookmarkPlus,
} from "lucide-react";
import { addToLibrary } from "./lib/library";

const CONTENT_TYPES = [
  "Script",
  "Image Caption",
  "Video Script",
  "Reddit Post",
  "Twitter/X Post",
  "Notes",
] as const;

type ContentType = (typeof CONTENT_TYPES)[number];

interface Draft {
  id:                 string;
  title:              string;
  type:               ContentType;
  hook:               string;
  script:             string;
  cta:                string;
  notes:              string;
  linkedPlayer:       string | null;
  linkedImageLabel:   string | null;
  linkedVideoLabel:   string | null;
  updatedAt:          string;
}

interface EditorProps {
  initialHook?:   string;
  initialScript?: string;
  initialPlayer?: string;
}

const STORAGE_KEY = "neeko-marketing-drafts";

function loadDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Draft[]) : [];
  } catch {
    return [];
  }
}

function persistDrafts(drafts: Draft[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id:               crypto.randomUUID(),
    title:            "Untitled",
    type:             "Script",
    hook:             "",
    script:           "",
    cta:              "",
    notes:            "",
    linkedPlayer:     null,
    linkedImageLabel: null,
    linkedVideoLabel: null,
    updatedAt:        new Date().toISOString(),
    ...overrides,
  };
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function useCopied(ms = 2000) {
  const [key, setKey] = useState<string | null>(null);
  const trigger = useCallback(
    (text: string, k: string) => {
      navigator.clipboard.writeText(text).catch(() => {});
      setKey(k);
      setTimeout(() => setKey(null), ms);
    },
    [ms]
  );
  return { copiedKey: key, trigger };
}

function CopyBtn({
  text, label, copyKey, copiedKey, trigger,
}: {
  text: string; label: string; copyKey: string;
  copiedKey: string | null; trigger: (t: string, k: string) => void;
}) {
  const done = copiedKey === copyKey;
  return (
    <button
      onClick={() => trigger(text, copyKey)}
      className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-xs hover:bg-accent transition-colors"
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

function Textarea({
  label, value, onChange, rows = 4, placeholder, mono = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  rows?: number; placeholder?: string; mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`w-full text-sm border border-border rounded-md p-3 bg-background resize-y leading-relaxed outline-none focus:border-foreground/40 transition-colors ${
          mono ? "font-mono text-xs" : ""
        }`}
      />
    </div>
  );
}

export default function Editor({ initialHook, initialScript, initialPlayer }: EditorProps) {
  const { toast }           = useToast();
  const { copiedKey, trigger } = useCopied();

  const [drafts,        setDrafts]        = useState<Draft[]>(loadDrafts);
  const [activeId,      setActiveId]      = useState<string | null>(null);
  const [showDraftMenu, setShowDraftMenu] = useState(false);
  const [savedToLib,    setSavedToLib]    = useState(false);

  const [title,              setTitle]              = useState("");
  const [type,               setType]               = useState<ContentType>("Script");
  const [hook,               setHook]               = useState(initialHook  ?? "");
  const [script,             setScript]             = useState(initialScript ?? "");
  const [cta,                setCta]                = useState("");
  const [notes,              setNotes]              = useState("");
  const [linkedPlayer,       setLinkedPlayer]       = useState(initialPlayer ?? "");
  const [linkedImageLabel,   setLinkedImageLabel]   = useState("");
  const [linkedVideoLabel,   setLinkedVideoLabel]   = useState("");

  const activeDraft = drafts.find((d) => d.id === activeId) ?? null;

  const loadIntoEditor = useCallback((d: Draft) => {
    setTitle(d.title);
    setType(d.type);
    setHook(d.hook);
    setScript(d.script);
    setCta(d.cta);
    setNotes(d.notes);
    setLinkedPlayer(d.linkedPlayer ?? "");
    setLinkedImageLabel(d.linkedImageLabel ?? "");
    setLinkedVideoLabel(d.linkedVideoLabel ?? "");
  }, []);

  useEffect(() => {
    if (activeDraft) loadIntoEditor(activeDraft);
  }, [activeId]);

  const clearEditor = () => {
    setTitle("");
    setType("Script");
    setHook("");
    setScript("");
    setCta("");
    setNotes("");
    setLinkedPlayer("");
    setLinkedImageLabel("");
    setLinkedVideoLabel("");
  };

  const currentDraftData = (): Omit<Draft, "id" | "updatedAt"> => ({
    title:            title || "Untitled",
    type,
    hook,
    script,
    cta,
    notes,
    linkedPlayer:     linkedPlayer       || null,
    linkedImageLabel: linkedImageLabel   || null,
    linkedVideoLabel: linkedVideoLabel   || null,
  });

  const newDraft = () => {
    setActiveId(null);
    clearEditor();
    setShowDraftMenu(false);
  };

  const saveDraft = () => {
    const now = new Date().toISOString();
    if (activeId) {
      const updated = drafts.map((d) =>
        d.id === activeId ? { ...d, ...currentDraftData(), updatedAt: now } : d
      );
      setDrafts(updated);
      persistDrafts(updated);
      toast({ title: "Draft saved" });
    } else {
      const draft = makeDraft({ ...currentDraftData(), updatedAt: now });
      const updated = [draft, ...drafts];
      setDrafts(updated);
      persistDrafts(updated);
      setActiveId(draft.id);
      toast({ title: "Draft created" });
    }
  };

  const duplicateDraft = () => {
    const data = currentDraftData();
    const draft = makeDraft({
      ...data,
      title: `${data.title} (copy)`,
      updatedAt: new Date().toISOString(),
    });
    const updated = [draft, ...drafts];
    setDrafts(updated);
    persistDrafts(updated);
    setActiveId(draft.id);
    loadIntoEditor(draft);
    toast({ title: "Draft duplicated" });
    setShowDraftMenu(false);
  };

  const deleteDraft = (id: string) => {
    const updated = drafts.filter((d) => d.id !== id);
    setDrafts(updated);
    persistDrafts(updated);
    if (activeId === id) {
      setActiveId(null);
      clearEditor();
    }
    setShowDraftMenu(false);
  };

  const selectDraft = (d: Draft) => {
    setActiveId(d.id);
    loadIntoEditor(d);
    setShowDraftMenu(false);
  };

  const fullDraftText = [
    `Title: ${title || "Untitled"}`,
    `Type: ${type}`,
    "",
    hook  ? `Hook:\n${hook}`   : null,
    script ? `Script:\n${script}` : null,
    cta   ? `CTA:\n${cta}`    : null,
    notes ? `Notes:\n${notes}` : null,
    linkedPlayer       ? `Player: ${linkedPlayer}` : null,
    linkedImageLabel   ? `Image: ${linkedImageLabel}` : null,
    linkedVideoLabel   ? `Video: ${linkedVideoLabel}` : null,
  ].filter((l) => l !== null).join("\n\n");

  const hasContent = hook || script || cta || notes;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowDraftMenu((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-md text-sm hover:bg-accent transition-colors"
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="max-w-[140px] truncate font-medium">
                {activeDraft ? activeDraft.title || "Untitled" : "No draft selected"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            {showDraftMenu && (
              <div className="absolute z-30 top-full left-0 mt-1 w-64 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
                <div className="p-2 border-b border-border">
                  <button
                    onClick={newDraft}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> New Draft
                  </button>
                  {activeDraft && (
                    <button
                      onClick={duplicateDraft}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors"
                    >
                      <CopyPlus className="h-3.5 w-3.5" /> Duplicate Current
                    </button>
                  )}
                </div>
                {drafts.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No saved drafts</p>
                ) : (
                  <div className="max-h-56 overflow-y-auto">
                    {drafts.map((d) => (
                      <div
                        key={d.id}
                        className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                          activeId === d.id ? "bg-accent" : "hover:bg-accent/60"
                        }`}
                        onClick={() => selectDraft(d)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{d.title || "Untitled"}</p>
                          <p className="text-[10px] text-muted-foreground">{d.type} · {fmtDate(d.updatedAt)}</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteDraft(d.id); }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-destructive transition-all shrink-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {activeDraft && (
            <span className="text-[10px] text-muted-foreground hidden sm:block">
              Saved {fmtDate(activeDraft.updatedAt)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasContent && (
            <CopyBtn
              text={fullDraftText}
              label="Copy All"
              copyKey="all"
              copiedKey={copiedKey}
              trigger={trigger}
            />
          )}
          {hasContent && (
            <button
              onClick={() => {
                const content = [hook, script, cta].filter(Boolean).join("\n\n");
                addToLibrary({
                  type:    "draft",
                  title:   title || "Untitled Draft",
                  content,
                  player:  linkedPlayer || null,
                  tags:    [type.toLowerCase().replace(/[^a-z0-9]/g, "-")],
                });
                setSavedToLib(true);
                setTimeout(() => setSavedToLib(false), 2000);
                toast({ title: "Saved to Library" });
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-xs hover:bg-accent transition-colors"
            >
              {savedToLib
                ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Saved!</>
                : <><BookmarkPlus className="h-3.5 w-3.5" /> Save to Library</>}
            </button>
          )}
          <Button size="sm" onClick={saveDraft} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {activeId ? "Save" : "Save as Draft"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Draft Title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Marcus Bontempelli — Buy angle R5"
                className="w-full text-sm font-medium bg-transparent border border-border rounded-md px-3 py-2 outline-none focus:border-foreground/40 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Content Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ContentType)}
                className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background outline-none focus:border-foreground/40 transition-colors"
              >
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <Textarea
              label="Hook"
              value={hook}
              onChange={setHook}
              rows={3}
              placeholder="Opening line that grabs attention..."
            />
            <div className="flex justify-end">
              <CopyBtn
                text={hook}
                label="Copy Hook"
                copyKey="hook"
                copiedKey={copiedKey}
                trigger={trigger}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <Textarea
              label="CTA"
              value={cta}
              onChange={setCta}
              rows={2}
              placeholder="Call to action — what do they do next?"
            />
            <div className="flex justify-end">
              <CopyBtn
                text={cta}
                label="Copy CTA"
                copyKey="cta"
                copiedKey={copiedKey}
                trigger={trigger}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <Textarea
              label="Notes (not published)"
              value={notes}
              onChange={setNotes}
              rows={3}
              placeholder="Internal notes, reminders, context..."
              mono
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3 h-full flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlignLeft className="h-3.5 w-3.5 text-muted-foreground" />
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Main Script
                </label>
              </div>
              <CopyBtn
                text={script}
                label="Copy Script"
                copyKey="script"
                copiedKey={copiedKey}
                trigger={trigger}
              />
            </div>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={
                type === "Twitter/X Post"
                  ? "Write your post (280 chars max)..."
                  : type === "Reddit Post"
                  ? "Write your Reddit post body..."
                  : type === "Image Caption"
                  ? "Write the caption for this image..."
                  : "Write your full script here..."
              }
              className="flex-1 w-full text-sm border border-border rounded-md p-3 bg-background resize-none leading-relaxed outline-none focus:border-foreground/40 transition-colors min-h-[360px]"
            />
            {type === "Twitter/X Post" && (
              <div className="flex justify-end">
                <span className={`text-xs ${script.length > 280 ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                  {script.length} / 280
                </span>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Linked Assets
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Player</label>
                </div>
                <input
                  value={linkedPlayer}
                  onChange={(e) => setLinkedPlayer(e.target.value)}
                  placeholder="e.g. Marcus Bontempelli"
                  className="w-full text-xs border border-border rounded px-2.5 py-1.5 bg-background outline-none focus:border-foreground/40 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <ImageIcon className="h-3 w-3 text-muted-foreground" />
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Image</label>
                </div>
                <input
                  value={linkedImageLabel}
                  onChange={(e) => setLinkedImageLabel(e.target.value)}
                  placeholder="e.g. Player card R5"
                  className="w-full text-xs border border-border rounded px-2.5 py-1.5 bg-background outline-none focus:border-foreground/40 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Clapperboard className="h-3 w-3 text-muted-foreground" />
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Video</label>
                </div>
                <input
                  value={linkedVideoLabel}
                  onChange={(e) => setLinkedVideoLabel(e.target.value)}
                  placeholder="e.g. Buy reel R5"
                  className="w-full text-xs border border-border rounded px-2.5 py-1.5 bg-background outline-none focus:border-foreground/40 transition-colors"
                />
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground/50 italic mt-1">
              Asset fields are reference labels only. Full integration with Image Engine and Video Generator coming in v2.
            </p>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            <div className="flex items-center gap-2">
              {activeDraft && (
                <>
                  <button
                    onClick={duplicateDraft}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-xs hover:bg-accent transition-colors"
                  >
                    <CopyPlus className="h-3.5 w-3.5" /> Duplicate
                  </button>
                  <button
                    onClick={() => deleteDraft(activeId!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-xs hover:bg-accent hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <CopyBtn
                text={fullDraftText}
                label="Copy Full Draft"
                copyKey="full"
                copiedKey={copiedKey}
                trigger={trigger}
              />
              <Button size="sm" onClick={saveDraft} className="gap-1.5">
                <Save className="h-3.5 w-3.5" />
                {activeId ? "Save" : "Save as Draft"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
