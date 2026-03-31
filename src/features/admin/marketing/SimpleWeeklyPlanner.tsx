import { useEffect, useRef, useState } from "react";
import { Copy, Check, Trash2, BookOpen, ChevronDown, X, Plus } from "lucide-react";
import { loadLibrary } from "./lib/library";
import type { LibraryItem } from "./lib/library";

// ─── Types ────────────────────────────────────────────────────────────────────

type PostStatus = "idea" | "ready" | "posted";
type Platform   = "TikTok" | "Instagram" | "Reddit" | "X";

interface PlannerPost {
  id:        string;
  title:     string;
  platform:  Platform;
  content:   string;
  notes:     string;
  status:    PostStatus;
}

interface PlannerDay {
  date:  string;
  posts: [PlannerPost, PlannerPost];
}

interface PlannerData {
  weekStart: string;
  days:      PlannerDay[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = "neeko-weekly-planner-v2";

const PLATFORMS: Platform[] = ["TikTok", "Instagram", "Reddit", "X"];

const STATUS_META: Record<PostStatus, { label: string; bg: string; text: string }> = {
  idea:   { label: "Idea",   bg: "bg-zinc-100 dark:bg-zinc-800",    text: "text-zinc-500" },
  ready:  { label: "Ready",  bg: "bg-amber-100 dark:bg-amber-900/40",  text: "text-amber-600 dark:text-amber-400" },
  posted: { label: "Posted", bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-600 dark:text-emerald-400" },
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMondayDate(offsetWeeks = 0): string {
  const d   = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) + offsetWeeks * 7;
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-AU", { month: "short", day: "numeric" });
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split("T")[0];
}

function makeEmptyPost(slot: number): PlannerPost {
  return {
    id:       `${Date.now()}-${slot}-${Math.random().toString(36).slice(2)}`,
    title:    "",
    platform: "TikTok",
    content:  "",
    notes:    "",
    status:   "idea",
  };
}

function buildWeek(weekStart: string): PlannerData {
  return {
    weekStart,
    days: Array.from({ length: 7 }, (_, i) => ({
      date:  addDays(weekStart, i),
      posts: [makeEmptyPost(0), makeEmptyPost(1)],
    })) as PlannerDay[],
  };
}

function loadData(weekStart: string): PlannerData {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return buildWeek(weekStart);
    const all = JSON.parse(raw) as Record<string, PlannerData>;
    if (all[weekStart]) return all[weekStart];
    return buildWeek(weekStart);
  } catch {
    return buildWeek(weekStart);
  }
}

function saveData(data: PlannerData) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const all: Record<string, PlannerData> = raw ? JSON.parse(raw) : {};
    all[data.weekStart] = data;
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch { /* noop */ }
}

// ─── Library picker modal ─────────────────────────────────────────────────────

function LibraryPicker({
  onSelect,
  onClose,
}: {
  onSelect: (item: LibraryItem) => void;
  onClose: () => void;
}) {
  const items = loadLibrary();
  const [q, setQ] = useState("");
  const filtered = q.trim()
    ? items.filter(
        (i) =>
          i.title.toLowerCase().includes(q.toLowerCase()) ||
          i.content.toLowerCase().includes(q.toLowerCase())
      )
    : items;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">Load from Library</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 pt-3 pb-2">
          <input
            autoFocus
            type="text"
            placeholder="Search..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full text-xs px-3 py-2 border border-border rounded-md bg-muted/20 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              {items.length === 0 ? "Library is empty." : "No matches."}
            </p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => { onSelect(item); onClose(); }}
                className="w-full text-left px-3 py-2.5 rounded-lg border border-border hover:border-foreground/30 hover:bg-muted/30 transition-colors space-y-1"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {item.type}
                  </span>
                  <span className="text-xs font-medium truncate">{item.title}</span>
                </div>
                {item.content && (
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {item.content}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────

function PostCard({
  post,
  slot,
  onChange,
  onClear,
}: {
  post: PlannerPost;
  slot: number;
  onChange: (updated: PlannerPost) => void;
  onClear: () => void;
}) {
  const [copied, setCopied]         = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  function set<K extends keyof PlannerPost>(key: K, val: PlannerPost[K]) {
    onChange({ ...post, [key]: val });
  }

  function cycleStatus() {
    const order: PostStatus[] = ["idea", "ready", "posted"];
    set("status", order[(order.indexOf(post.status) + 1) % order.length]);
  }

  function copyContent() {
    if (!post.content.trim()) return;
    navigator.clipboard.writeText(post.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function loadFromLibrary(item: LibraryItem) {
    onChange({ ...post, title: item.title, content: item.content });
  }

  const meta = STATUS_META[post.status];
  const hasContent = post.content.trim().length > 0;

  return (
    <>
      {pickerOpen && (
        <LibraryPicker
          onSelect={loadFromLibrary}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div className="rounded-lg border border-border bg-background space-y-2.5 p-3">
        {/* slot label + status + actions */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 shrink-0">
            Post {slot}
          </span>
          <button
            onClick={cycleStatus}
            className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full transition-colors ${meta.bg} ${meta.text}`}
            title="Click to cycle status"
          >
            {meta.label}
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded hover:bg-muted/40"
            title="Load from Library"
          >
            <BookOpen className="h-3 w-3" />
            <span className="hidden sm:inline">Library</span>
          </button>
          <button
            onClick={copyContent}
            disabled={!hasContent}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors px-1.5 py-1 rounded hover:bg-muted/40"
            title="Copy content"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            onClick={onClear}
            className="p-1 rounded text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10 transition-colors"
            title="Clear post"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>

        {/* Title */}
        <input
          type="text"
          value={post.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Title..."
          className="w-full text-xs px-2.5 py-1.5 border border-border rounded-md bg-muted/10 focus:outline-none focus:ring-1 focus:ring-ring"
        />

        {/* Platform */}
        <div className="relative">
          <select
            value={post.platform}
            onChange={(e) => set("platform", e.target.value as Platform)}
            className="w-full appearance-none text-xs px-2.5 pr-7 py-1.5 border border-border rounded-md bg-muted/10 focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        </div>

        {/* Content */}
        <textarea
          value={post.content}
          onChange={(e) => set("content", e.target.value)}
          placeholder="Post content..."
          rows={4}
          className="w-full text-xs px-2.5 py-2 border border-border rounded-md bg-muted/10 focus:outline-none focus:ring-1 focus:ring-ring resize-y leading-relaxed"
        />

        {/* Notes */}
        <textarea
          value={post.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Notes (optional)..."
          rows={2}
          className="w-full text-[11px] px-2.5 py-1.5 border border-border rounded-md bg-muted/10 focus:outline-none focus:ring-1 focus:ring-ring resize-none text-muted-foreground leading-relaxed"
        />
      </div>
    </>
  );
}

// ─── Day column ───────────────────────────────────────────────────────────────

function DayColumn({
  day,
  onChange,
}: {
  day: PlannerDay;
  onChange: (updated: PlannerDay) => void;
}) {
  const today = isToday(day.date);

  function updatePost(idx: 0 | 1, updated: PlannerPost) {
    const posts: [PlannerPost, PlannerPost] = [...day.posts] as [PlannerPost, PlannerPost];
    posts[idx] = updated;
    onChange({ ...day, posts });
  }

  function clearPost(idx: 0 | 1) {
    updatePost(idx, makeEmptyPost(idx));
  }

  const postedCount = day.posts.filter((p) => p.status === "posted").length;
  const readyCount  = day.posts.filter((p) => p.status === "ready").length;

  return (
    <div
      className={`rounded-xl border bg-card p-3 space-y-3 min-w-0 ${
        today ? "border-amber-400/50 ring-1 ring-amber-400/20" : "border-border"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <p className={`text-sm font-bold ${today ? "text-amber-500" : ""}`}>
            {DAY_NAMES[new Date(day.date + "T00:00:00").getDay() === 0 ? 6 : new Date(day.date + "T00:00:00").getDay() - 1]}
          </p>
          {today && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500 uppercase tracking-wide">
              Today
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <p className="text-[10px] text-muted-foreground/50">{formatDate(day.date)}</p>
          {(postedCount > 0 || readyCount > 0) && (
            <div className="flex gap-0.5">
              {readyCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Ready" />
              )}
              {postedCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Posted" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Posts */}
      <div className="space-y-2.5">
        {([0, 1] as const).map((idx) => (
          <PostCard
            key={day.posts[idx].id}
            post={day.posts[idx]}
            slot={idx + 1}
            onChange={(u) => updatePost(idx, u)}
            onClear={() => clearPost(idx)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Today Focus strip ────────────────────────────────────────────────────────

function TodayFocus({ day }: { day: PlannerDay | undefined }) {
  if (!day) return null;
  const posts = day.posts;
  const anyContent = posts.some((p) => p.content.trim() || p.title.trim());
  if (!anyContent) return null;

  return (
    <div className="rounded-xl border border-amber-400/40 bg-amber-50/40 dark:bg-amber-900/10 p-4 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
        Today's Focus — {formatDate(day.date)}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {posts.map((post, i) => {
          const meta = STATUS_META[post.status];
          return (
            <div key={post.id} className="rounded-lg border border-border bg-background p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wide shrink-0">
                  Post {i + 1}
                </span>
                <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>
                  {meta.label}
                </span>
                <span className="text-[10px] text-muted-foreground/60 ml-auto">{post.platform}</span>
              </div>
              {post.title && (
                <p className="text-xs font-semibold truncate">{post.title}</p>
              )}
              {post.content && (
                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                  {post.content}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week navigation ──────────────────────────────────────────────────────────

function WeekNav({
  weekStart,
  onPrev,
  onNext,
  onToday,
  isCurrentWeek,
}: {
  weekStart: string;
  onPrev:  () => void;
  onNext:  () => void;
  onToday: () => void;
  isCurrentWeek: boolean;
}) {
  const end = addDays(weekStart, 6);
  const label = `${formatDate(weekStart)} – ${formatDate(end)}`;
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onPrev}
        className="p-1.5 rounded-lg border border-border hover:bg-muted/40 text-muted-foreground transition-colors"
      >
        <ChevronDown className="h-3.5 w-3.5 rotate-90" />
      </button>
      <div className="flex-1 text-center">
        <p className="text-xs font-semibold">{label}</p>
        {!isCurrentWeek && (
          <button
            onClick={onToday}
            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground underline underline-offset-2 transition-colors"
          >
            Back to this week
          </button>
        )}
        {isCurrentWeek && <p className="text-[10px] text-muted-foreground/40">This week</p>}
      </div>
      <button
        onClick={onNext}
        className="p-1.5 rounded-lg border border-border hover:bg-muted/40 text-muted-foreground transition-colors"
      >
        <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
      </button>
    </div>
  );
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function WeekSummaryStrip({ data }: { data: PlannerData }) {
  const posts = data.days.flatMap((d) => d.posts);
  const total  = posts.filter((p) => p.content.trim()).length;
  const ready  = posts.filter((p) => p.status === "ready").length;
  const posted = posts.filter((p) => p.status === "posted").length;
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-border bg-muted/10 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{total}</span> posts with content
      {ready  > 0 && <><span className="w-1 h-1 rounded-full bg-border" /><span className="text-amber-500 font-medium">{ready} ready</span></>}
      {posted > 0 && <><span className="w-1 h-1 rounded-full bg-border" /><span className="text-emerald-500 font-medium">{posted} posted</span></>}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SimpleWeeklyPlanner() {
  const [weekOffset, setWeekOffset] = useState(0);
  const baseWeek = useRef(getMondayDate(0));
  const weekStart = getMondayDate(weekOffset);
  const [data, setData] = useState<PlannerData>(() => loadData(weekStart));
  const isCurrentWeek = weekOffset === 0;
  const todayDate = new Date().toISOString().split("T")[0];
  const todayDay  = data.days.find((d) => d.date === todayDate);

  useEffect(() => {
    setData(loadData(weekStart));
  }, [weekStart]);

  function handleDayChange(idx: number, updated: PlannerDay) {
    setData((prev) => {
      const days = [...prev.days] as PlannerDay[];
      days[idx] = updated;
      const next = { ...prev, days };
      saveData(next);
      return next;
    });
  }

  function handleClearWeek() {
    const fresh = buildWeek(weekStart);
    saveData(fresh);
    setData(fresh);
  }

  baseWeek.current = getMondayDate(0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4 text-muted-foreground" />
            Script Planner
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            2 posts per day, 7 days. Write scripts, attach notes, copy to post.
          </p>
        </div>
        <button
          onClick={handleClearWeek}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500 text-muted-foreground transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear Week
        </button>
      </div>

      {/* Today Focus */}
      {isCurrentWeek && todayDay && <TodayFocus day={todayDay} />}

      {/* Week navigation */}
      <WeekNav
        weekStart={weekStart}
        onPrev={() => setWeekOffset((o) => o - 1)}
        onNext={() => setWeekOffset((o) => o + 1)}
        onToday={() => setWeekOffset(0)}
        isCurrentWeek={isCurrentWeek}
      />

      {/* Summary */}
      <WeekSummaryStrip data={data} />

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {data.days.map((day, idx) => (
          <DayColumn
            key={day.date}
            day={day}
            onChange={(u) => handleDayChange(idx, u)}
          />
        ))}
      </div>
    </div>
  );
}
