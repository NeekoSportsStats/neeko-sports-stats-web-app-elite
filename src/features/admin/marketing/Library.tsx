import { useState, useEffect, useCallback } from "react";
import { FileText, Image as ImageIcon, Video, Search, Trash2, Copy, Check, Library as LibraryIcon, Pencil, Tag, User, Plus, ChartBar as BarChart2, Star, TrendingUp, Eye, Heart, MessageCircle, Share2, Bookmark, ChevronDown, ChevronUp } from "lucide-react";

import {
  type LibraryItem,
  type LibraryItemType,
  type LibraryPlatform,
  type LibraryMetrics,
  loadLibrary as loadFromStorage,
  saveLibrary,
  addToLibrary as addToLibraryUtil,
  updateLibraryItem,
  computeScore,
} from "./lib/library";

type FilterType = "all" | LibraryItemType | "ideas" | "posted" | "top";
type SortType   = "newest" | "views" | "score";

const PLATFORM_LABELS: Record<LibraryPlatform, string> = {
  tiktok:    "TikTok",
  instagram: "Instagram",
  reddit:    "Reddit",
  x:         "X",
};

const PLATFORM_COLORS: Record<LibraryPlatform, string> = {
  tiktok:    "bg-black/10 text-black dark:bg-white/10 dark:text-white",
  instagram: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  reddit:    "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  x:         "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

const TYPE_META: Record<LibraryItemType, { label: string; icon: React.ElementType; color: string }> = {
  draft:  { label: "Draft",  icon: Pencil,    color: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  script: { label: "Script", icon: FileText,  color: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  image:  { label: "Image",  icon: ImageIcon, color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  video:  { label: "Video",  icon: Video,     color: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
};

function getSeeds(): LibraryItem[] {
  return [
    {
      id: "seed-1", type: "script",
      title:   "Buy Post — Example",
      content: "BUY: [Player Name] is the trade of the round. Projected 110+ pts, ceiling 135, form through the roof. Get on before everyone else does. #AFLFantasy #NeekoSports",
      player: null, tags: ["buy", "afl"],
      createdAt: new Date().toISOString(),
      status: "idea", platform: null, metrics: {},
    },
    {
      id: "seed-2", type: "script",
      title:   "Trap Warning — Example",
      content: "TRAP: Everyone's rushing in. Here's why our data says wait. The ceiling looks great but the floor is brutal — don't get caught. #AFLFantasy",
      player: null, tags: ["trap", "afl"],
      createdAt: new Date().toISOString(),
      status: "idea", platform: null, metrics: {},
    },
    {
      id: "seed-3", type: "draft",
      title:   "Image Caption — Example",
      content: "Round 5 trade targets are locked in. Swipe to see who's flying under the radar this week.",
      player: null, tags: ["caption", "social"],
      createdAt: new Date().toISOString(),
      status: "idea", platform: null, metrics: {},
    },
  ];
}

function loadLibrary(): LibraryItem[] {
  const items = loadFromStorage();
  return items.length > 0 ? items : getSeeds();
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" });
  } catch { return iso; }
}

function fmtNum(n: number | undefined): string {
  if (!n) return "";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function TypeBadge({ type }: { type: LibraryItemType }) {
  const { label, color } = TYPE_META[type];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${color}`}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: "idea" | "posted" | undefined }) {
  if (status === "posted") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
        Posted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground">
      Idea
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  if (score === 0) return null;
  const isTop = score >= 500;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
      isTop
        ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
        : "bg-muted text-muted-foreground"
    }`}>
      {isTop && <Star className="h-2.5 w-2.5 fill-current" />}
      {score.toLocaleString()} pts
    </span>
  );
}

function MetricInput({
  icon: Icon, label, value, onChange,
}: {
  icon: React.ElementType;
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
      <input
        type="number"
        min={0}
        placeholder={label}
        value={value ?? ""}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange(isNaN(n) ? undefined : n);
        }}
        className="w-20 text-xs border border-border rounded px-2 py-1 bg-background outline-none focus:border-foreground/40"
      />
    </div>
  );
}

interface ItemCardProps {
  item: LibraryItem;
  copiedId: string | null;
  onCopy: (item: LibraryItem) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<LibraryItem>) => void;
}

function ItemCard({ item, copiedId, onCopy, onDelete, onUpdate }: ItemCardProps) {
  const [showMetrics, setShowMetrics] = useState(false);
  const [localMetrics, setLocalMetrics] = useState<LibraryMetrics>(item.metrics ?? {});

  const score   = computeScore(localMetrics);
  const isTop   = score >= 500;
  const isPosted = item.status === "posted";

  const updateMetricField = (field: keyof LibraryMetrics, val: number | undefined) => {
    const updated = { ...localMetrics, [field]: val };
    setLocalMetrics(updated);
    onUpdate(item.id, { metrics: updated });
  };

  const toggleStatus = () => {
    const next = isPosted ? "idea" : "posted";
    onUpdate(item.id, { status: next });
    if (next === "posted") setShowMetrics(true);
  };

  const toggleTag = (tag: string) => {
    const tags = item.tags.includes(tag)
      ? item.tags.filter((t) => t !== tag)
      : [...item.tags, tag];
    onUpdate(item.id, { tags });
  };

  const hasHighViews = (localMetrics.views ?? 0) >= 10000;

  return (
    <div className={`group relative border rounded-lg p-4 bg-background transition-colors space-y-3 ${
      hasHighViews
        ? "border-amber-400/40 bg-amber-400/5"
        : isPosted
        ? "border-emerald-500/30 hover:border-emerald-500/50"
        : "border-border hover:border-foreground/20"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <TypeBadge type={item.type} />
          <StatusBadge status={item.status} />
          {item.platform && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${PLATFORM_COLORS[item.platform]}`}>
              {PLATFORM_LABELS[item.platform]}
            </span>
          )}
          {isTop && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-amber-500/20 text-amber-700 dark:text-amber-300">
              <Star className="h-2.5 w-2.5 fill-current" /> Top
            </span>
          )}
          {item.tags.includes("high-performer") && !isTop && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-300">
              High Performer
            </span>
          )}
          {item.tags.includes("needs-rework") && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-red-500/15 text-red-700 dark:text-red-300">
              Needs Rework
            </span>
          )}
        </div>

        <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onCopy(item)} title="Copy" className="p-1.5 rounded hover:bg-accent transition-colors">
            {copiedId === item.id
              ? <Check className="h-3.5 w-3.5 text-emerald-500" />
              : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          <button onClick={() => onDelete(item.id)} title="Delete" className="p-1.5 rounded hover:bg-accent hover:text-destructive transition-colors">
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      <p className="text-sm font-medium">{item.title}</p>

      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
        {item.content}
      </p>

      <div className="flex items-center gap-2 flex-wrap pt-0.5">
        {item.player && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
            <User className="h-3 w-3" /> {item.player}
          </span>
        )}
        {item.tags.filter((t) => !["high-performer","needs-rework"].includes(t)).length > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
            <Tag className="h-3 w-3" />
            {item.tags.filter((t) => !["high-performer","needs-rework"].includes(t)).slice(0, 3).join(", ")}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">
          {fmtDate(item.createdAt)}
        </span>
      </div>

      {score > 0 && (
        <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground border-t border-border pt-2">
          {localMetrics.views    != null && <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{fmtNum(localMetrics.views)}</span>}
          {localMetrics.likes    != null && <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{fmtNum(localMetrics.likes)}</span>}
          {localMetrics.comments != null && <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{fmtNum(localMetrics.comments)}</span>}
          {localMetrics.shares   != null && <span className="flex items-center gap-1"><Share2 className="h-3 w-3" />{fmtNum(localMetrics.shares)}</span>}
          {localMetrics.saves    != null && <span className="flex items-center gap-1"><Bookmark className="h-3 w-3" />{fmtNum(localMetrics.saves)}</span>}
          <ScoreBadge score={score} />
        </div>
      )}

      <div className="border-t border-border pt-2 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={toggleStatus}
            className={`flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-md border transition-colors ${
              isPosted
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            <Check className="h-3 w-3" />
            {isPosted ? "Posted" : "Mark as Posted"}
          </button>

          {isPosted && (
            <select
              value={item.platform ?? ""}
              onChange={(e) => onUpdate(item.id, { platform: (e.target.value as LibraryPlatform) || null })}
              className="text-[10px] border border-border rounded px-2 py-1 bg-background outline-none focus:border-foreground/40 text-muted-foreground"
            >
              <option value="">Platform...</option>
              <option value="tiktok">TikTok</option>
              <option value="instagram">Instagram</option>
              <option value="reddit">Reddit</option>
              <option value="x">X</option>
            </select>
          )}

          <button
            onClick={() => setShowMetrics((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-auto"
          >
            <BarChart2 className="h-3 w-3" />
            Metrics
            {showMetrics ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>

        {showMetrics && (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap gap-2">
              <MetricInput icon={Eye}           label="Views"    value={localMetrics.views}    onChange={(v) => updateMetricField("views", v)} />
              <MetricInput icon={Heart}         label="Likes"    value={localMetrics.likes}    onChange={(v) => updateMetricField("likes", v)} />
              <MetricInput icon={MessageCircle} label="Comments" value={localMetrics.comments} onChange={(v) => updateMetricField("comments", v)} />
              <MetricInput icon={Share2}        label="Shares"   value={localMetrics.shares}   onChange={(v) => updateMetricField("shares", v)} />
              <MetricInput icon={Bookmark}      label="Saves"    value={localMetrics.saves}    onChange={(v) => updateMetricField("saves", v)} />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                Score = views×1 + likes×3 + comments×5 + shares×8 + saves×6
              </p>
              <ScoreBadge score={score} />
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground">Quick tag:</span>
          <button
            onClick={() => toggleTag("high-performer")}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
              item.tags.includes("high-performer")
                ? "border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            High Performer
          </button>
          <button
            onClick={() => toggleTag("needs-rework")}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
              item.tags.includes("needs-rework")
                ? "border-red-500/60 bg-red-500/15 text-red-700 dark:text-red-300"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            Needs Rework
          </button>
        </div>
      </div>
    </div>
  );
}

interface AddItemModalProps {
  onAdd: (item: Omit<LibraryItem, "id" | "createdAt">) => void;
  onClose: () => void;
}

function AddItemModal({ onAdd, onClose }: AddItemModalProps) {
  const [title,   setTitle]   = useState("");
  const [type,    setType]    = useState<LibraryItemType>("script");
  const [content, setContent] = useState("");
  const [player,  setPlayer]  = useState("");
  const [tags,    setTags]    = useState("");

  const submit = () => {
    if (!title.trim() || !content.trim()) return;
    onAdd({
      type,
      title:    title.trim(),
      content:  content.trim(),
      player:   player.trim() || null,
      tags:     tags.split(",").map((t) => t.trim()).filter(Boolean),
      status:   "idea",
      platform: null,
      metrics:  {},
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg mx-4 bg-popover border border-border rounded-xl shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Add to Library</p>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Item title"
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background outline-none focus:border-foreground/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as LibraryItemType)}
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background outline-none focus:border-foreground/40"
            >
              <option value="draft">Draft</option>
              <option value="script">Script</option>
              <option value="image">Image Idea</option>
              <option value="video">Video Storyboard</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste or write content..."
            rows={5}
            className="w-full text-sm border border-border rounded-md p-3 bg-background resize-none outline-none focus:border-foreground/40 leading-relaxed"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Player (optional)</label>
            <input
              value={player}
              onChange={(e) => setPlayer(e.target.value)}
              placeholder="e.g. Marcus Bontempelli"
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background outline-none focus:border-foreground/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tags (comma-separated)</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. buy, r5, afl"
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background outline-none focus:border-foreground/40"
            />
          </div>
        </div>

        <button
          onClick={submit}
          disabled={!title.trim() || !content.trim()}
          className="w-full py-2 rounded-md text-sm font-medium bg-foreground text-background disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Save to Library
        </button>
      </div>
    </div>
  );
}

export default function Library() {
  const [items,      setItems]      = useState<LibraryItem[]>(loadLibrary);
  const [filter,     setFilter]     = useState<FilterType>("all");
  const [sort,       setSort]       = useState<SortType>("newest");
  const [search,     setSearch]     = useState("");
  const [copiedId,   setCopiedId]   = useState<string | null>(null);
  const [showModal,  setShowModal]  = useState(false);

  const addItem = useCallback((data: Omit<LibraryItem, "id" | "createdAt">) => {
    const item = addToLibraryUtil(data);
    setItems((prev) => [item, ...prev.filter((i) => i.id !== item.id)]);
  }, []);

  useEffect(() => {
    window.__onLibraryAdd = (item: LibraryItem) => {
      setItems((prev) => [item, ...prev.filter((i) => i.id !== item.id)]);
    };
    return () => { window.__onLibraryAdd = undefined; };
  }, []);

  const deleteItem = (id: string) => {
    setItems((prev) => {
      const updated = prev.filter((i) => i.id !== id);
      saveLibrary(updated);
      return updated;
    });
  };

  const copyItem = (item: LibraryItem) => {
    navigator.clipboard.writeText(item.content).catch(() => {});
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUpdate = (id: string, updates: Partial<LibraryItem>) => {
    updateLibraryItem(id, updates);
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...updates } : i))
    );
  };

  const withScores = items.map((i) => ({ ...i, _score: computeScore(i.metrics) }));

  const filtered = withScores.filter((item) => {
    const matchType =
      filter === "all"    ? true :
      filter === "ideas"  ? item.status !== "posted" :
      filter === "posted" ? item.status === "posted" :
      filter === "top"    ? item._score >= 500 :
      item.type === filter;

    const q           = search.toLowerCase();
    const matchSearch = !q
      || item.title.toLowerCase().includes(q)
      || item.content.toLowerCase().includes(q)
      || (item.player ?? "").toLowerCase().includes(q)
      || item.tags.some((t) => t.toLowerCase().includes(q));

    return matchType && matchSearch;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "views") return (b.metrics?.views ?? 0) - (a.metrics?.views ?? 0);
    if (sort === "score") return b._score - a._score;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const topPerformers = [...withScores]
    .filter((i) => i._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 3);

  const CONTENT_FILTERS: { id: FilterType; label: string; icon: React.ElementType }[] = [
    { id: "all",    label: "All",     icon: LibraryIcon },
    { id: "ideas",  label: "Ideas",   icon: Pencil },
    { id: "posted", label: "Posted",  icon: Check },
    { id: "top",    label: "Top",     icon: Star },
    { id: "draft",  label: "Drafts",  icon: Pencil },
    { id: "script", label: "Scripts", icon: FileText },
    { id: "image",  label: "Images",  icon: ImageIcon },
    { id: "video",  label: "Videos",  icon: Video },
  ];

  const countFor = (f: FilterType) => {
    if (f === "all")    return items.length;
    if (f === "ideas")  return items.filter((i) => i.status !== "posted").length;
    if (f === "posted") return items.filter((i) => i.status === "posted").length;
    if (f === "top")    return withScores.filter((i) => i._score >= 500).length;
    return items.filter((i) => i.type === f).length;
  };

  return (
    <>
      {showModal && (
        <AddItemModal onAdd={addItem} onClose={() => setShowModal(false)} />
      )}

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 border border-border rounded-md px-3 py-2 flex-1 bg-background">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search library..."
              className="text-sm bg-transparent outline-none flex-1"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortType)}
              className="text-xs border border-border rounded-md px-3 py-2 bg-background outline-none focus:border-foreground/40 text-muted-foreground"
            >
              <option value="newest">Newest</option>
              <option value="views">Most Views</option>
              <option value="score">Highest Score</option>
            </select>

            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
            >
              <Plus className="h-3.5 w-3.5" /> Add Item
            </button>
          </div>
        </div>

        <div className="flex gap-1 flex-wrap">
          {CONTENT_FILTERS.map(({ id, label, icon: Icon }) => {
            const count = countFor(id);
            return (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  filter === id
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                <span className={`ml-0.5 ${filter === id ? "opacity-70" : "text-muted-foreground/60"}`}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>

        {topPerformers.length > 0 && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">Top Performers</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {topPerformers.map((item, rank) => (
                <div key={item.id} className="flex items-start gap-2 bg-background border border-border rounded-md p-2.5">
                  <span className="text-[10px] font-black text-amber-500 shrink-0 mt-0.5">#{rank + 1}</span>
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-xs font-medium truncate">{item.title}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                      {item.platform && <span>{PLATFORM_LABELS[item.platform]}</span>}
                      {(item.metrics?.views ?? 0) > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Eye className="h-2.5 w-2.5" />{fmtNum(item.metrics?.views)}
                        </span>
                      )}
                      <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-medium">
                        <Star className="h-2.5 w-2.5 fill-current" />{item._score.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <LibraryIcon className="h-8 w-8 text-muted-foreground/25 mb-3" />
            <p className="text-sm text-muted-foreground">
              {items.length === 0 ? "Library is empty" : "No results match your filter"}
            </p>
            <p className="text-xs text-muted-foreground/50 mt-1">
              Add items manually or save from Content Engine, Editor, Image Engine, or Video Generator.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 text-xs underline text-muted-foreground hover:text-foreground transition-colors"
            >
              Add your first item
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sorted.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                copiedId={copiedId}
                onCopy={copyItem}
                onDelete={deleteItem}
                onUpdate={handleUpdate}
              />
            ))}
          </div>
        )}

        {items.length > 0 && (
          <p className="text-[10px] text-muted-foreground/40 text-center pt-2">
            {items.length} item{items.length !== 1 ? "s" : ""} in library · stored locally in browser
          </p>
        )}
      </div>
    </>
  );
}
