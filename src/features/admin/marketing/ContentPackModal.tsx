import { useState, useEffect } from "react";
import { X, Copy, Check, BookmarkPlus, RefreshCw, Zap } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import type { ContentOpportunity } from "./opportunitiesService";
import { generateContentPack, generateHooks, type ContentPack } from "./contentPackService";

type Platform = "tiktok" | "instagram" | "twitter" | "reddit" | "hooks";

const PLATFORM_TABS: { id: Platform; label: string }[] = [
  { id: "tiktok",    label: "TikTok" },
  { id: "instagram", label: "Instagram" },
  { id: "twitter",   label: "Twitter / X" },
  { id: "reddit",    label: "Reddit" },
  { id: "hooks",     label: "Hooks" },
];

export default function ContentPackModal({
  opp,
  onClose,
}: {
  opp: ContentOpportunity;
  onClose: () => void;
}) {
  const [pack, setPack] = useState<ContentPack | null>(null);
  const [hooks, setHooks] = useState<string[]>([]);
  const [activePlatform, setActivePlatform] = useState<Platform>("tiktok");
  const [copied, setCopied] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const generated = generateContentPack(opp);
    setPack(generated);
    setHooks(generated.hooks);
  }, [opp]);

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAll = () => {
    if (!pack) return;
    const all = [
      `=== TIKTOK ===\n${pack.tiktok}`,
      `=== INSTAGRAM ===\n${pack.instagram}`,
      `=== TWITTER / X ===\n${pack.twitter}`,
      `=== REDDIT ===\n${pack.reddit}`,
      `=== HOOKS ===\n${hooks.join("\n\n")}`,
    ].join("\n\n---\n\n");
    navigator.clipboard.writeText(all);
    setCopied("all");
    setTimeout(() => setCopied(null), 2000);
    toast({ title: "Copied all platforms" });
  };

  const saveToLibrary = async () => {
    if (!pack) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .schema("marketing" as any)
        .from("content_library")
        .insert({
          player_id: opp.player_id,
          player_name: opp.player_name,
          category: opp.category,
          content_json: pack,
          hooks_json: hooks,
        });
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast({ title: "Saved to Content Library" });
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const regenerate = () => {
    const generated = generateContentPack(opp);
    setPack(generated);
    setHooks(generated.hooks);
    toast({ title: "Content regenerated" });
  };

  const activeContent =
    pack && activePlatform !== "hooks" ? pack[activePlatform as keyof Omit<ContentPack, "hooks">] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-border">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-0.5">
              Content Pack
            </p>
            <h2 className="font-semibold text-base">{opp.player_name}</h2>
            <p className="text-xs text-muted-foreground">{opp.team} · {opp.category.toUpperCase()}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={regenerate}
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border text-xs rounded-md hover:bg-accent transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Regen
            </button>
            <button
              onClick={saveToLibrary}
              disabled={saving || saved}
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border text-xs rounded-md hover:bg-accent transition-colors"
            >
              {saved ? (
                <><Check className="h-3.5 w-3.5 text-emerald-500" /> Saved</>
              ) : saving ? (
                <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving</>
              ) : (
                <><BookmarkPlus className="h-3.5 w-3.5" /> Save</>
              )}
            </button>
            <button
              onClick={copyAll}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-foreground text-background text-xs rounded-md hover:opacity-90 transition-opacity"
            >
              {copied === "all" ? (
                <><Check className="h-3.5 w-3.5" /> Copied!</>
              ) : (
                <><Copy className="h-3.5 w-3.5" /> Copy All</>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-accent transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-1 px-5 pt-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {PLATFORM_TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActivePlatform(id)}
              className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                activePlatform === id
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!pack ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : activePlatform === "hooks" ? (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Hook Variations — {hooks.length} hooks
              </p>
              {hooks.map((hook, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 bg-muted/30 border border-border rounded-md"
                >
                  <span className="shrink-0 text-xs text-muted-foreground font-mono w-4">{i + 1}.</span>
                  <p className="text-sm flex-1 leading-relaxed">{hook}</p>
                  <button
                    onClick={() => copyText(hook, `hook-${i}`)}
                    className="shrink-0 p-1.5 rounded hover:bg-accent transition-colors"
                  >
                    {copied === `hook-${i}` ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {PLATFORM_TABS.find((t) => t.id === activePlatform)?.label} Content
                </p>
                <button
                  onClick={() => activeContent && copyText(activeContent, activePlatform)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border text-xs rounded-md hover:bg-accent transition-colors"
                >
                  {copied === activePlatform ? (
                    <><Check className="h-3.5 w-3.5 text-emerald-500" /> Copied!</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5" /> Copy</>
                  )}
                </button>
              </div>
              <textarea
                value={activeContent ?? ""}
                onChange={() => {}}
                className="w-full min-h-64 text-sm border border-border rounded-md p-3 bg-background resize-y font-mono leading-relaxed"
                readOnly
              />
              <p className="text-xs text-muted-foreground">
                {activeContent ? `${activeContent.length} characters` : ""}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-border">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Signal:</span> {opp.signal_reason}
          </div>
          <button
            onClick={() => {
              onClose();
            }}
            className="px-3 py-1.5 border border-border rounded-md text-xs hover:bg-accent transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
