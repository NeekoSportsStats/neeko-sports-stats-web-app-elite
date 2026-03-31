import { useState } from "react";
import { RefreshCw, Film, ExternalLink } from "lucide-react";
import { useAIVideoLibrary, type AIVideoCategory, type AIVideoItem } from "./useAIVideoLibrary";

const CATEGORY_LABELS: { id: AIVideoCategory; label: string }[] = [
  { id: "all",      label: "All"      },
  { id: "stadium",  label: "Stadium"  },
  { id: "crowd",    label: "Crowd"    },
  { id: "field",    label: "Field"    },
  { id: "players",  label: "Players"  },
  { id: "abstract", label: "Abstract" },
];

interface Props {
  selectedUrl: string | null;
  accentColor: string;
  onSelect: (url: string) => void;
  onGeneratePack?: () => void;
}

export function AIVideoLibrary({ selectedUrl, accentColor, onSelect, onGeneratePack }: Props) {
  const { videos, loading, error, reload } = useAIVideoLibrary();
  const [activeCategory, setActiveCategory] = useState<AIVideoCategory>("all");

  const filtered = activeCategory === "all"
    ? videos
    : videos.filter((v) => v.category === activeCategory);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Film className="h-3.5 w-3.5" style={{ color: accentColor }} />
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            AI Video Backgrounds
          </p>
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="p-1 rounded hover:bg-muted/40 transition-colors"
          title="Reload videos"
        >
          <RefreshCw className={`h-3 w-3 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Category filters */}
      <div className="flex gap-1.5 flex-wrap">
        {CATEGORY_LABELS.map((cat) => {
          const count = cat.id === "all" ? videos.length : videos.filter((v) => v.category === cat.id).length;
          const active = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className="px-2 py-1 rounded-md text-[10px] font-semibold border transition-all"
              style={
                active
                  ? { background: `${accentColor}20`, borderColor: `${accentColor}55`, color: accentColor }
                  : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
              }
            >
              {cat.label}
              {count > 0 && (
                <span className="ml-1 opacity-60">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-6 text-[11px] text-muted-foreground gap-2">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Loading videos…
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="text-[11px] text-destructive/80 py-2 px-3 rounded-lg border border-destructive/20 bg-destructive/05">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-5 text-center space-y-2">
          <Film className="h-7 w-7 mx-auto text-muted-foreground/30" />
          <p className="text-[11px] text-muted-foreground/60">No AI videos generated yet.</p>
          {onGeneratePack && (
            <button
              onClick={onGeneratePack}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all"
              style={{ borderColor: `${accentColor}55`, color: accentColor, background: `${accentColor}10` }}
            >
              Generate Media Pack
            </button>
          )}
        </div>
      )}

      {/* Video grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((video) => (
            <VideoTile
              key={video.url}
              video={video}
              selected={selectedUrl === video.url}
              accentColor={accentColor}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VideoTile({
  video,
  selected,
  accentColor,
  onSelect,
}: {
  video: AIVideoItem;
  selected: boolean;
  accentColor: string;
  onSelect: (url: string) => void;
}) {
  const displayName = video.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");

  return (
    <button
      onClick={() => onSelect(video.url)}
      className="relative group rounded-xl overflow-hidden border-2 transition-all text-left"
      style={{
        borderColor: selected ? accentColor : "hsl(var(--border))",
        boxShadow: selected ? `0 0 0 1px ${accentColor}40` : undefined,
      }}
    >
      <div className="aspect-[9/16] relative bg-muted/20 overflow-hidden">
        <video
          src={video.url}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
        {selected && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: `${accentColor}30` }}
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: accentColor }}
            >
              <svg viewBox="0 0 12 12" className="w-3 h-3 fill-black">
                <path d="M2 6l3 3 5-5" stroke="black" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        )}
        <div className="absolute top-1.5 left-1.5">
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
            style={{ background: `${accentColor}cc`, color: "#000" }}
          >
            {video.category}
          </span>
        </div>
      </div>
      <div className="px-2 py-1.5 bg-card">
        <p className="text-[10px] font-medium truncate capitalize text-foreground">{displayName}</p>
      </div>
    </button>
  );
}
