import { useState, useEffect, useRef } from "react";
import { Check, Image as ImageIcon, Video, Loader, RefreshCw, FolderOpen } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getPublicStorageUrl } from "@/lib/storage/getPublicStorageUrl";
import type { BackgroundSource } from "./GraphicTemplates";

export type MediaCategory = "all" | "stadium" | "crowd" | "abstract" | "field" | "players" | "lights" | "videos";

export interface AIMediaItem {
  id: string;
  label: string;
  url: string;
  thumbnail_url: string;
  media_type: "image" | "video";
  category: MediaCategory;
}

const STORAGE_BUCKET      = "content-assets";
const AI_IMAGES_PATH      = "ai-generated";
const STOCK_IMAGES_PATH   = "images/ai-generated";
const VIDEOS_PATH         = "videos/ai-generated";

const MEDIA_CACHE_KEY   = "neeko_ai_media_cache_v3";
const MEDIA_CACHE_TTL   = 10 * 60 * 1000;

interface MediaCache {
  images:    AIMediaItem[];
  videos:    AIMediaItem[];
  loadedAt:  number;
}

let inMemoryCache: MediaCache | null = null;

function readStorageCache(): MediaCache | null {
  try {
    const raw = localStorage.getItem(MEDIA_CACHE_KEY);
    if (!raw) return null;
    const parsed: MediaCache = JSON.parse(raw);
    if (Date.now() - parsed.loadedAt > MEDIA_CACHE_TTL) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorageCache(cache: MediaCache) {
  inMemoryCache = cache;
  try { localStorage.setItem(MEDIA_CACHE_KEY, JSON.stringify(cache)); } catch { /* quota full */ }
}

export function invalidateAIMediaCache() {
  inMemoryCache = null;
  try { localStorage.removeItem(MEDIA_CACHE_KEY); } catch { /* ignore */ }
}

function categoryFromName(name: string): MediaCategory {
  const n = name.toLowerCase();
  if (n.includes("stadium") || n.includes("ground") || n.includes("oval"))  return "stadium";
  if (n.includes("crowd")   || n.includes("fans")   || n.includes("stand")) return "crowd";
  if (n.includes("field")   || n.includes("grass")  || n.includes("pitch")) return "field";
  if (n.includes("player")  || n.includes("athlete"))                        return "players";
  if (n.includes("light")   || n.includes("floodlit"))                       return "lights";
  if (n.includes("abstract")|| n.includes("pattern")|| n.includes("data"))  return "abstract";
  return "stadium";
}

function labelFromName(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function loadAIGeneratedFromDB(): Promise<AIMediaItem[]> {
  const { data, error } = await supabase
    .from("ai_media_library")
    .select("asset_id, label, url, thumbnail_url, media_type, category")
    .eq("source", "ai_generated")
    .eq("is_active", true)
    .order("registered_at", { ascending: false })
    .limit(200);

  if (error || !data) return [];

  return data.map((row) => {
    const rawUrl = (row.url as string) ?? "";
    const publicUrl = getPublicStorageUrl(rawUrl) ?? rawUrl;
    const rawThumb = (row.thumbnail_url as string) ?? rawUrl;
    const publicThumb = getPublicStorageUrl(rawThumb) ?? rawThumb;
    return {
      id:           row.asset_id as string,
      label:        (row.label as string) ?? "",
      url:          publicUrl,
      thumbnail_url: publicThumb,
      media_type:   ((row.media_type as string) === "video" ? "video" : "image") as "image" | "video",
      category:     ((row.category as string) ?? "stadium") as MediaCategory,
    };
  });
}

async function listStorageFolder(path: string): Promise<AIMediaItem[]> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(path, { limit: 200, sortBy: { column: "name", order: "asc" } });

  if (error || !data) return [];

  const items: AIMediaItem[] = [];
  for (const file of data) {
    if (!file.name || file.name.startsWith(".")) continue;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const isImage = ["jpg", "jpeg", "png", "webp", "avif"].includes(ext);
    const isVideo = ["mp4", "webm", "mov"].includes(ext);
    if (!isImage && !isVideo) continue;

    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(`${path}/${file.name}`);

    const url = urlData?.publicUrl ?? "";
    if (!url) continue;

    items.push({
      id:           `${path}/${file.name}`,
      label:        labelFromName(file.name),
      url,
      thumbnail_url: url,
      media_type:   isImage ? "image" : "video",
      category:     categoryFromName(file.name),
    });
  }
  return items;
}

async function listAIGeneratedFromStorage(): Promise<AIMediaItem[]> {
  const CATEGORIES = ["stadium", "crowd", "field", "players", "abstract"] as const;
  const results = await Promise.all(
    CATEGORIES.map((cat) => listStorageFolder(`${AI_IMAGES_PATH}/${cat}`))
  );
  return results.flat();
}

export async function loadAIMedia(): Promise<MediaCache> {
  if (inMemoryCache && Date.now() - inMemoryCache.loadedAt < MEDIA_CACHE_TTL) {
    return inMemoryCache;
  }
  const stored = readStorageCache();
  if (stored) {
    inMemoryCache = stored;
    return stored;
  }

  const [dbImages, storageAIImages, stockImages, videos] = await Promise.all([
    loadAIGeneratedFromDB(),
    listAIGeneratedFromStorage(),
    listStorageFolder(STOCK_IMAGES_PATH),
    listStorageFolder(VIDEOS_PATH),
  ]);

  const seenUrls = new Set<string>();
  const mergedImages: AIMediaItem[] = [];
  for (const item of [...dbImages, ...storageAIImages, ...stockImages]) {
    if (!item.url || seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);
    mergedImages.push(item);
  }

  const cache: MediaCache = { images: mergedImages, videos, loadedAt: Date.now() };
  writeStorageCache(cache);
  return cache;
}

const IMAGE_CATEGORIES: MediaCategory[] = ["all", "stadium", "crowd", "field", "abstract", "players", "videos"];
const VIDEO_CATEGORIES: MediaCategory[] = ["all", "stadium", "crowd", "abstract", "lights"];

const CATEGORY_LABELS: Record<MediaCategory, string> = {
  all:      "All",
  stadium:  "Stadium",
  crowd:    "Crowd",
  field:    "Field",
  abstract: "Abstract",
  players:  "Players",
  lights:   "Lights",
  videos:   "Videos",
};

interface AIMediaPickerProps {
  type: "image" | "video";
  selected: string | null;
  onSelect: (url: string) => void;
  accentColor?: string;
}

export function AIMediaPicker({ type, selected, onSelect, accentColor = "#F59E0B" }: AIMediaPickerProps) {
  const [images,   setImages]   = useState<AIMediaItem[]>([]);
  const [videos,   setVideos]   = useState<AIMediaItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [category, setCategory] = useState<MediaCategory>("all");
  const loadedRef = useRef(false);

  useEffect(() => {
    loadedRef.current = false;
    setCategory("all");
  }, [type]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    fetchMedia();
  });

  async function fetchMedia() {
    setLoading(true);
    setError(null);
    try {
      const cache = await loadAIMedia();
      setImages(cache.images);
      setVideos(cache.videos);
    } catch {
      setError("Could not load media library. Check storage configuration.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    invalidateAIMediaCache();
    loadedRef.current = false;
    fetchMedia();
  }

  const baseItems  = type === "image" ? images : videos;

  const categories = type === "image" ? IMAGE_CATEGORIES : VIDEO_CATEGORIES;

  function getFiltered(cat: MediaCategory): AIMediaItem[] {
    if (cat === "all")    return baseItems;
    if (cat === "videos") return videos;
    return baseItems.filter((i) => i.category === cat);
  }

  const filtered = getFiltered(category);
  const items    = baseItems;

  function countFor(cat: MediaCategory): number {
    return getFiltered(cat).length;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2.5 py-8">
        <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading AI media…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-center space-y-2">
        <p className="text-xs text-red-400">{error}</p>
        <button onClick={fetchMedia} className="text-[11px] underline text-muted-foreground hover:text-foreground">
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/40 p-5 text-center space-y-2">
        <FolderOpen className="h-5 w-5 mx-auto text-muted-foreground/30" />
        <p className="text-xs font-medium text-muted-foreground/60">No AI {type}s uploaded yet.</p>
        <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
          Upload {type === "image" ? "images" : "videos"} to the Supabase Storage bucket
          at <code className="font-mono opacity-70">{STORAGE_BUCKET}/{type === "image" ? STOCK_IMAGES_PATH : VIDEOS_PATH}</code>
        </p>
        <button
          onClick={handleRefresh}
          className="mt-1 flex items-center gap-1.5 mx-auto text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">

      {/* ── Category filter bar ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex gap-1 flex-wrap">
          {categories.map((cat) => {
            const count     = countFor(cat);
            const isActive  = category === cat;
            if (cat !== "all" && count === 0) return null;
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-all duration-150"
                style={
                  isActive
                    ? { background: accentColor, color: "#000" }
                    : { background: "hsl(var(--muted)/0.5)", color: "hsl(var(--muted-foreground))" }
                }
              >
                {cat === "videos" && <Video className="h-2.5 w-2.5" />}
                <span className="capitalize">{CATEGORY_LABELS[cat]}</span>
                {cat !== "all" && (
                  <span
                    className="rounded-full px-1 text-[9px] font-semibold"
                    style={{
                      background: isActive ? "rgba(0,0,0,0.2)" : "hsl(var(--muted-foreground)/0.15)",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={handleRefresh}
          title="Refresh media"
          className="shrink-0 mt-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {/* ── Result count ───────────────────────────────────────────────── */}
      <p className="text-[10px] text-muted-foreground/40">
        {filtered.length === 0
          ? "No items match this filter"
          : `${filtered.length} ${filtered.length === 1 ? "item" : "items"}${category !== "all" ? ` · ${CATEGORY_LABELS[category]}` : ""}`
        }
      </p>

      {/* ── Media grid ─────────────────────────────────────────────────── */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-3 gap-1.5 max-h-72 overflow-y-auto pr-0.5">
          {filtered.map((item) => {
            const isSelected = selected === item.url;
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.url)}
                className="group text-left rounded-lg overflow-hidden border transition-all duration-150 focus:outline-none"
                style={{
                  borderColor: isSelected ? accentColor : "hsl(var(--border)/0.4)",
                  boxShadow:   isSelected ? `0 0 0 2px ${accentColor}44` : undefined,
                }}
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-black/60">
                  {item.media_type === "image" ? (
                    <img
                      src={item.thumbnail_url}
                      alt={item.label}
                      loading="lazy"
                      className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-opacity duration-150"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-black/80">
                      <Video className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  )}

                  {/* Category overlay tag */}
                  <div className="absolute bottom-1 left-1">
                    <span
                      className="text-[8px] font-semibold capitalize px-1.5 py-0.5 rounded"
                      style={{
                        background: item.media_type === "video" ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.55)",
                        color:      item.media_type === "video" ? "#a3e635" : "rgba(255,255,255,0.85)",
                        backdropFilter: "blur(4px)",
                      }}
                    >
                      {item.media_type === "video" ? "video" : item.category}
                    </span>
                  </div>

                  {/* Selected checkmark */}
                  {isSelected && (
                    <div
                      className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow"
                      style={{ background: accentColor }}
                    >
                      <Check className="h-3 w-3 text-black" />
                    </div>
                  )}
                </div>

                {/* Label row */}
                <div
                  className="px-2 py-1.5"
                  style={{ background: isSelected ? `${accentColor}12` : "hsl(var(--muted)/0.4)" }}
                >
                  <div className="flex items-center gap-1">
                    {item.media_type === "image"
                      ? <ImageIcon className="h-2.5 w-2.5 shrink-0 opacity-40" />
                      : <Video     className="h-2.5 w-2.5 shrink-0 opacity-40" />
                    }
                    <span className="text-[10px] font-medium truncate leading-tight">{item.label}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="py-4 text-center">
          <p className="text-[11px] text-muted-foreground/40">
            No {CATEGORY_LABELS[category].toLowerCase()} media found.
          </p>
          <button
            onClick={() => setCategory("all")}
            className="mt-1.5 text-[10px] underline text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            Show all
          </button>
        </div>
      )}
    </div>
  );
}

export function getBackgroundSourceLabel(source: BackgroundSource): string {
  switch (source) {
    case "gradient":    return "Gradient";
    case "stock_image": return "AI Image";
    case "stock_video": return "AI Video";
    case "team_theme":  return "Team Theme";
    case "upload":      return "Custom Upload";
  }
}
