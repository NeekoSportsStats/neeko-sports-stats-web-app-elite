import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert as AlertCircle, ChevronDown, ChevronRight, Copy, Check, Lock, LockOpen, RefreshCw, Sparkles, Plus, ArrowLeftRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Post {
  id: string;
  weekly_plan_id: string;
  day_key: string;
  slot_key: string;
  day_number: number;
  slot_number: number;
  player_id: number | null;
  player_name: string | null;
  player2_id: number | null;
  player2_name: string | null;
  team: string | null;
  category: string;
  content_type: string;
  angle: string | null;
  angle_label: string | null;
  status: "pending" | "generating" | "ready" | "error";
  locked: boolean;
  hooks: string[] | null;
  hook_options: string[] | null;
  voice_script: string | null;
  caption_script: string | null;
  visual_plan: string | null;
  ai_image_prompt: string | null;
  ai_video_prompt: string | null;
  strategy_json: Record<string, unknown> | null;
  platform_variants: Record<string, unknown> | null;
  ctas: string[] | null;
  error_message: string | null;
  conversion_score: number | null;
  confidence_label: string | null;
  hook_score: number | null;
  hook_type: string | null;
  creative_style: string | null;
  top3_players: unknown[] | null;
  updated_at: string;
}

interface PlanPlayer {
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  projection_final: number;
  neeko_rating_scaled: number;
}

interface DayGroup {
  day_key: string;
  day_number: number;
  posts: Post[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const CATEGORY_COLORS: Record<string, string> = {
  Value:       "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  Trap:        "bg-red-500/15 text-red-700 dark:text-red-400",
  Breakout:    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  Proof:       "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  Top3:        "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  H2H:         "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  Injury:      "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  Contrarian:  "bg-violet-500/15 text-violet-700 dark:text-violet-400",
};

const CONTENT_TYPE_ICON: Record<string, string> = {
  "Short-form Video": "▶",
  "Graphic Post":     "◼",
  "Carousel":         "≡",
  "Story":            "◯",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function groupByDay(posts: Post[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const post of posts) {
    const key = post.day_key?.toLowerCase() ?? "monday";
    if (!map.has(key)) {
      map.set(key, { day_key: key, day_number: post.day_number ?? 0, posts: [] });
    }
    map.get(key)!.posts.push(post);
  }
  const sorted = DAY_ORDER
    .filter((d) => map.has(d))
    .map((d) => map.get(d)!);
  sorted.forEach((g) => g.posts.sort((a, b) => a.slot_number - b.slot_number));
  return sorted;
}

function isToday(dayKey: string): boolean {
  const now = new Date();
  const day = now.toLocaleDateString("en-AU", { weekday: "long" }).toLowerCase();
  return day === dayKey.toLowerCase();
}

function getWeekLabel(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (dd: Date) =>
    dd.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function getWeekKey(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(now);
  mon.setDate(diff);
  return mon.toISOString().slice(0, 10);
}

async function fetchExistingPlan(): Promise<{ plan_id: string; posts: Post[] } | null> {
  const weekKey = getWeekKey();
  const { data: plan } = await supabase
    .from("weekly_content_plans")
    .select("id")
    .eq("week_key", weekKey)
    .maybeSingle();

  if (!plan?.id) return null;

  const { data: posts } = await supabase
    .from("weekly_content_posts")
    .select("*")
    .eq("weekly_plan_id", plan.id)
    .order("day_number")
    .order("slot_number");

  return { plan_id: plan.id, posts: (posts ?? []) as Post[] };
}

async function callPlanBuilder(force = false): Promise<{ plan_id: string; posts: Post[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-weekly-content`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ force }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

async function callGeneratePost(postId: string): Promise<Post> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-content-post`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ post_id: postId }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.post ?? json;
}

async function callToggleLock(postId: string, locked: boolean) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? ANON_KEY;
  await fetch(`${SUPABASE_URL}/functions/v1/generate-weekly-content`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: "toggle_lock", post_id: postId, locked }),
  });
}

async function callSwapPlayer(
  postId: string,
  player: PlanPlayer,
) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? ANON_KEY;
  await fetch(`${SUPABASE_URL}/functions/v1/generate-weekly-content`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: "swap_player",
      post_id: postId,
      player_id: player.player_id,
      player_name: player.player_name,
      team: player.team,
    }),
  });
}

async function fetchPlayers(): Promise<PlanPlayer[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-weekly-content`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: "get_players" }),
  });
  const json = await res.json();
  return json.players ?? [];
}

// ─── Post Detail tabs ─────────────────────────────────────────────────────────

type PostTab = "hooks" | "script" | "visual" | "prompt";

function PostDetail({ post }: { post: Post }) {
  const [tab, setTab] = useState<PostTab>("hooks");
  const [copied, setCopied] = useState(false);

  const tabs: { id: PostTab; label: string }[] = [
    { id: "hooks", label: "Hooks" },
    { id: "script", label: "Script" },
    { id: "visual", label: "Visual" },
    { id: "prompt", label: "AI Prompt" },
  ];

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mt-3 border-t border-border pt-3 space-y-2">
      <div className="flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
              tab === t.id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "hooks" && (
        <div className="space-y-1.5">
          {(post.hooks ?? []).length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No hooks generated yet.</p>
          ) : (
            (post.hooks ?? []).map((h, i) => (
              <div
                key={i}
                className="flex items-start gap-2 bg-muted/20 rounded-lg px-3 py-2"
              >
                <span className="text-[10px] font-bold text-muted-foreground/60 shrink-0 pt-px">
                  {i + 1}
                </span>
                <p className="text-xs flex-1 leading-relaxed">{h}</p>
                <button
                  onClick={() => copyText(h)}
                  className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
          {post.caption_script && (
            <div className="mt-2 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                Caption
              </p>
              <div className="relative">
                <p className="text-xs bg-muted/20 rounded-lg px-3 py-2 leading-relaxed pr-8">
                  {post.caption_script}
                </p>
                <button
                  onClick={() => copyText(post.caption_script!)}
                  className="absolute top-2 right-2 text-muted-foreground/40 hover:text-foreground"
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "script" && (
        <div className="space-y-1.5">
          {post.voice_script ? (
            <div className="relative">
              <pre className="text-xs bg-muted/20 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap pr-8">
                {post.voice_script}
              </pre>
              <button
                onClick={() => copyText(post.voice_script!)}
                className="absolute top-2 right-2 text-muted-foreground/40 hover:text-foreground"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">No script generated yet.</p>
          )}
        </div>
      )}

      {tab === "visual" && (
        <div className="space-y-2">
          {post.visual_plan ? (
            <div className="text-xs bg-muted/20 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap">
              {post.visual_plan}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">No visual plan generated yet.</p>
          )}
          {post.strategy_json && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                Strategy
              </p>
              <div className="text-[11px] bg-muted/20 rounded-lg px-3 py-2 leading-relaxed font-mono text-muted-foreground">
                {JSON.stringify(post.strategy_json, null, 2)}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "prompt" && (
        <div className="space-y-3">
          {post.ai_image_prompt ? (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                Image Prompt
              </p>
              <div className="relative">
                <p className="text-xs bg-muted/20 rounded-lg px-3 py-2 leading-relaxed pr-8">
                  {post.ai_image_prompt}
                </p>
                <button
                  onClick={() => copyText(post.ai_image_prompt!)}
                  className="absolute top-2 right-2 text-muted-foreground/40 hover:text-foreground"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
          ) : null}
          {post.ai_video_prompt ? (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                Video Prompt
              </p>
              <div className="relative">
                <p className="text-xs bg-muted/20 rounded-lg px-3 py-2 leading-relaxed pr-8">
                  {post.ai_video_prompt}
                </p>
                <button
                  onClick={() => copyText(post.ai_video_prompt!)}
                  className="absolute top-2 right-2 text-muted-foreground/40 hover:text-foreground"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
          ) : null}
          {!post.ai_image_prompt && !post.ai_video_prompt && (
            <p className="text-[11px] text-muted-foreground">No AI prompts generated yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Player swap dropdown ─────────────────────────────────────────────────────

function PlayerSwap({
  post,
  players,
  onSwap,
}: {
  post: Post;
  players: PlanPlayer[];
  onSwap: (player: PlanPlayer) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = q.trim()
    ? players.filter(
        (p) =>
          p.player_name.toLowerCase().includes(q.toLowerCase()) ||
          p.team.toLowerCase().includes(q.toLowerCase()),
      )
    : players.slice(0, 30);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded hover:bg-muted/40"
        title="Swap player"
      >
        <ArrowLeftRight className="h-3 w-3" />
        <span>Swap</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-background border border-border rounded-xl shadow-xl flex flex-col max-h-64">
          <div className="px-2 pt-2 pb-1">
            <input
              autoFocus
              type="text"
              placeholder="Search player..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full text-xs px-2 py-1.5 border border-border rounded-md bg-muted/20 focus:outline-none"
            />
          </div>
          <div className="overflow-y-auto flex-1 px-1 pb-1">
            {filtered.map((p) => (
              <button
                key={p.player_id}
                onClick={() => {
                  onSwap(p);
                  setOpen(false);
                  setQ("");
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted/40 transition-colors flex items-center justify-between gap-2"
              >
                <span className="font-medium truncate">{p.player_name}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{p.team}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-3">No results</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────

function PostCard({
  post,
  players,
  onGenerate,
  onToggleLock,
  onSwap,
}: {
  post: Post;
  players: PlanPlayer[];
  onGenerate: (postId: string) => void;
  onToggleLock: (postId: string, locked: boolean) => void;
  onSwap: (postId: string, player: PlanPlayer) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const catColor = CATEGORY_COLORS[post.category] ?? "bg-zinc-100 text-zinc-600";
  const ctIcon = CONTENT_TYPE_ICON[post.content_type] ?? "◉";
  const isGenerating = post.status === "generating";
  const isReady = post.status === "ready";
  const isError = post.status === "error";
  const isPending = post.status === "pending";

  return (
    <div
      className={`rounded-xl border bg-card transition-all ${
        post.locked ? "border-amber-400/40 ring-1 ring-amber-400/15" : "border-border"
      }`}
    >
      <div className="p-3 space-y-2">
        {/* Top row */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${catColor}`}
              >
                {post.category}
              </span>
              <span className="text-[10px] text-muted-foreground/60">
                {ctIcon} {post.content_type}
              </span>
            </div>
            <p className="text-xs font-semibold truncate">
              {post.player_name ?? "TBD"}
              {post.team && (
                <span className="font-normal text-muted-foreground ml-1">({post.team})</span>
              )}
            </p>
            {post.angle && (
              <p className="text-[10px] text-muted-foreground/70 truncate">
                {post.angle_label ?? post.angle}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Lock */}
            <button
              onClick={() => onToggleLock(post.id, !post.locked)}
              className={`p-1.5 rounded-lg transition-colors ${
                post.locked
                  ? "text-amber-500 bg-amber-500/10"
                  : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/40"
              }`}
              title={post.locked ? "Unlock" : "Lock"}
            >
              {post.locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
            </button>

            {/* Generate / Retry */}
            {!post.locked && (isPending || isError) && (
              <button
                onClick={() => onGenerate(post.id)}
                className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors ${
                  isError
                    ? "bg-red-500/10 text-red-600 hover:bg-red-500/20"
                    : "bg-foreground/5 text-foreground hover:bg-foreground/10"
                }`}
              >
                <Sparkles className="h-3 w-3" />
                {isError ? "Retry" : "Generate"}
              </button>
            )}

            {isGenerating && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground px-2 py-1">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Generating
              </span>
            )}

            {isReady && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              >
                {expanded ? "Close" : "View"}
                <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        </div>

        {/* Scores row */}
        {isReady && (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {post.conversion_score != null && (
              <span>
                Conv: <span className="font-semibold text-foreground">{post.conversion_score}</span>
              </span>
            )}
            {post.hook_score != null && (
              <span>
                Hook: <span className="font-semibold text-foreground">{post.hook_score}</span>
              </span>
            )}
            {post.confidence_label && (
              <span className="text-muted-foreground/60">{post.confidence_label}</span>
            )}
          </div>
        )}

        {/* Error */}
        {isError && post.error_message && (
          <div className="flex items-start gap-1.5 text-[11px] text-red-600 dark:text-red-400 bg-red-500/5 rounded-lg px-2.5 py-1.5">
            <AlertCircle className="h-3 w-3 shrink-0 mt-px" />
            <span className="line-clamp-2">{post.error_message}</span>
          </div>
        )}

        {/* Swap player */}
        {!post.locked && (
          <div className="flex items-center gap-1">
            <PlayerSwap
              post={post}
              players={players}
              onSwap={(player) => onSwap(post.id, player)}
            />
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && isReady && (
        <div className="px-3 pb-3">
          <PostDetail post={post} />
        </div>
      )}
    </div>
  );
}

// ─── Day section ──────────────────────────────────────────────────────────────

function DaySection({
  group,
  players,
  defaultOpen,
  onGenerate,
  onGenerateDay,
  onToggleLock,
  onSwap,
}: {
  group: DayGroup;
  players: PlanPlayer[];
  defaultOpen: boolean;
  onGenerate: (postId: string) => void;
  onGenerateDay: (dayKey: string) => void;
  onToggleLock: (postId: string, locked: boolean) => void;
  onSwap: (postId: string, player: PlanPlayer) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const today = isToday(group.day_key);
  const readyCount = group.posts.filter((p) => p.status === "ready").length;
  const total = group.posts.length;
  const pendingCount = group.posts.filter((p) => p.status === "pending" || p.status === "error").length;
  const generatingCount = group.posts.filter((p) => p.status === "generating").length;

  return (
    <div
      className={`rounded-xl border transition-all ${
        today
          ? "border-amber-400/50 ring-1 ring-amber-400/15"
          : "border-border"
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground/60 transition-transform shrink-0 ${
            open ? "rotate-90" : ""
          }`}
        />
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span
            className={`text-sm font-bold ${today ? "text-amber-500" : ""}`}
          >
            {capitalize(group.day_key)}
          </span>
          {today && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500 uppercase tracking-wide shrink-0">
              Today
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {generatingCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <RefreshCw className="h-3 w-3 animate-spin" />
              {generatingCount} generating
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {readyCount}/{total} ready
          </span>
          {pendingCount > 0 && !generatingCount && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onGenerateDay(group.day_key);
              }}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-foreground/5 text-foreground hover:bg-foreground/10 transition-colors"
            >
              <Sparkles className="h-3 w-3" />
              Generate Day
            </button>
          )}
        </div>
      </button>

      {/* Posts */}
      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {group.posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              players={players}
              onGenerate={onGenerate}
              onToggleLock={onToggleLock}
              onSwap={onSwap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Today panel ─────────────────────────────────────────────────────────────

function TodayPanel({
  group,
  players,
  onGenerate,
  onGenerateDay,
  onToggleLock,
  onSwap,
}: {
  group: DayGroup | undefined;
  players: PlanPlayer[];
  onGenerate: (postId: string) => void;
  onGenerateDay: (dayKey: string) => void;
  onToggleLock: (postId: string, locked: boolean) => void;
  onSwap: (postId: string, player: PlanPlayer) => void;
}) {
  if (!group) return null;
  const pendingCount = group.posts.filter((p) => p.status === "pending" || p.status === "error").length;
  const generatingCount = group.posts.filter((p) => p.status === "generating").length;

  return (
    <div className="rounded-xl border border-amber-400/40 bg-amber-50/30 dark:bg-amber-900/10 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
            Today's Content
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {capitalize(group.day_key)} — {group.posts.length} posts planned
          </p>
        </div>
        {pendingCount > 0 && !generatingCount && (
          <button
            onClick={() => onGenerateDay(group.day_key)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Generate Today's Content
          </button>
        )}
        {generatingCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Generating {generatingCount} posts…
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {group.posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            players={players}
            onGenerate={onGenerate}
            onToggleLock={onToggleLock}
            onSwap={onSwap}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AdminWeeklyPlanner() {
  const [planId, setPlanId] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [players, setPlayers] = useState<PlanPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const generatingRef = useRef<Set<string>>(new Set());

  const days = groupByDay(posts);
  const todayGroup = days.find((g) => isToday(g.day_key));
  const readyTotal = posts.filter((p) => p.status === "ready").length;
  const pendingTotal = posts.filter((p) => p.status === "pending").length;

  // Load plan on mount — fast direct DB fetch, no edge function call
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchExistingPlan();
        if (!cancelled) {
          if (result) {
            setPlanId(result.plan_id);
            setPosts(result.posts);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Load player list
  useEffect(() => {
    fetchPlayers().then(setPlayers).catch(() => {});
  }, []);

  const updatePost = useCallback((updated: Post) => {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }, []);

  const updatePostField = useCallback(
    (postId: string, fields: Partial<Post>) => {
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, ...fields } : p)),
      );
    },
    [],
  );

  const handleGenerate = useCallback(
    async (postId: string) => {
      if (generatingRef.current.has(postId)) return;

      const post = posts.find((p) => p.id === postId);
      if (!post?.category || post.category.trim() === "") {
        console.error("[WeeklyPlanner] Invalid post — missing category", { postId, post });
        updatePostField(postId, { status: "error", error_message: "Missing category — cannot generate" });
        return;
      }

      if (post.category !== "Top3" && !post.player_id) {
        console.error("[WeeklyPlanner] Skipping invalid post — missing player_id", { postId, post });
        updatePostField(postId, { status: "error", error_message: "Missing player — cannot generate" });
        return;
      }

      console.log("[WeeklyPlanner] Generating post:", { post_id: postId, category: post.category, player_id: post.player_id, player_name: post.player_name });

      generatingRef.current.add(postId);
      updatePostField(postId, { status: "generating", error_message: null });
      try {
        const updated = await callGeneratePost(postId);
        updatePost({ ...updated, status: "ready" } as Post);
      } catch (e) {
        updatePostField(postId, {
          status: "error",
          error_message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        generatingRef.current.delete(postId);
      }
    },
    [posts, updatePost, updatePostField],
  );

  const handleGenerateDay = useCallback(
    (dayKey: string) => {
      const dayPosts = posts.filter(
        (p) =>
          p.day_key?.toLowerCase() === dayKey.toLowerCase() &&
          !p.locked &&
          (p.status === "pending" || p.status === "error"),
      );
      for (const post of dayPosts) {
        handleGenerate(post.id);
      }
    },
    [posts, handleGenerate],
  );

  const handleGenerateAll = useCallback(() => {
    const pending = posts.filter(
      (p) => !p.locked && (p.status === "pending" || p.status === "error"),
    );
    for (const post of pending) {
      handleGenerate(post.id);
    }
  }, [posts, handleGenerate]);

  const handleToggleLock = useCallback(
    async (postId: string, locked: boolean) => {
      updatePostField(postId, { locked });
      try {
        await callToggleLock(postId, locked);
      } catch {
        updatePostField(postId, { locked: !locked });
      }
    },
    [updatePostField],
  );

  const handleSwap = useCallback(
    async (postId: string, player: PlanPlayer) => {
      updatePostField(postId, {
        player_id: player.player_id,
        player_name: player.player_name,
        team: player.team,
        status: "pending",
        hooks: null,
        voice_script: null,
        caption_script: null,
        visual_plan: null,
        ai_image_prompt: null,
        ai_video_prompt: null,
        strategy_json: null,
        platform_variants: null,
        error_message: null,
      });
      try {
        await callSwapPlayer(postId, player);
      } catch { /* revert is not critical */ }
    },
    [updatePostField],
  );

  const handleRebuild = useCallback(async () => {
    setRebuilding(true);
    setError(null);
    try {
      const result = await callPlanBuilder(true);
      setPlanId(result.plan_id);
      setPosts((result.posts ?? []) as Post[]);
      // Reload players after build if not already loaded
      if (players.length === 0) {
        fetchPlayers().then(setPlayers).catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRebuilding(false);
    }
  }, [players.length]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-20 rounded-xl bg-muted/30 animate-pulse" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-muted/20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error && !planId) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-900/10 p-6 text-center space-y-3">
        <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
        <p className="text-sm font-semibold text-red-700 dark:text-red-400">
          Failed to load weekly plan
        </p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <button
          onClick={handleRebuild}
          className="px-4 py-2 rounded-lg bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          Retry
        </button>
      </div>
    );
  }

  // No plan exists yet — show empty state
  if (!planId && !loading) {
    return (
      <div className="rounded-xl border border-border bg-muted/10 p-10 text-center space-y-4">
        <Sparkles className="h-10 w-10 text-muted-foreground/40 mx-auto" />
        <div>
          <p className="text-sm font-semibold">No plan for this week yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Build a 7-day content plan with 3 posts per day.
          </p>
        </div>
        <button
          onClick={handleRebuild}
          disabled={rebuilding}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <Sparkles className="h-4 w-4" />
          {rebuilding ? "Building plan…" : "Build This Week's Plan"}
        </button>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  }

  const generatingCount = posts.filter((p) => p.status === "generating").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            AI Weekly Planner
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {getWeekLabel()} — {readyTotal}/{posts.length} posts generated
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {pendingTotal > 0 && generatingCount === 0 && (
            <button
              onClick={handleGenerateAll}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate All ({pendingTotal})
            </button>
          )}
          {generatingCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              {generatingCount} generating…
            </span>
          )}
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted/40 text-muted-foreground disabled:opacity-50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {rebuilding ? "Rebuilding…" : "New Plan"}
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border bg-muted/10 text-xs text-muted-foreground flex-wrap">
        <span>
          <span className="font-semibold text-foreground">{readyTotal}</span> ready
        </span>
        <span className="w-px h-3 bg-border" />
        <span>
          <span className="font-semibold text-foreground">{pendingTotal}</span> pending
        </span>
        {generatingCount > 0 && (
          <>
            <span className="w-px h-3 bg-border" />
            <span className="text-amber-600 font-semibold">{generatingCount} generating</span>
          </>
        )}
        {posts.filter((p) => p.status === "error").length > 0 && (
          <>
            <span className="w-px h-3 bg-border" />
            <span className="text-red-600 font-semibold">
              {posts.filter((p) => p.status === "error").length} errors
            </span>
          </>
        )}
        {posts.filter((p) => p.locked).length > 0 && (
          <>
            <span className="w-px h-3 bg-border" />
            <span className="text-amber-600">
              {posts.filter((p) => p.locked).length} locked
            </span>
          </>
        )}
      </div>

      {/* Today panel */}
      {todayGroup && (
        <TodayPanel
          group={todayGroup}
          players={players}
          onGenerate={handleGenerate}
          onGenerateDay={handleGenerateDay}
          onToggleLock={handleToggleLock}
          onSwap={handleSwap}
        />
      )}

      {/* All days collapsed */}
      <div className="space-y-2">
        {days.map((group) => (
          <DaySection
            key={group.day_key}
            group={group}
            players={players}
            defaultOpen={isToday(group.day_key)}
            onGenerate={handleGenerate}
            onGenerateDay={handleGenerateDay}
            onToggleLock={handleToggleLock}
            onSwap={handleSwap}
          />
        ))}
      </div>
    </div>
  );
}
