import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, Calendar, Video, Image, Monitor, Copy, Check, ChevronDown, ChevronUp, Zap, TriangleAlert as AlertTriangle, Star, TrendingUp, FileText, Eye, Play, Mic, Brain, Flame, Target, Smartphone, ChartBar as BarChart2, List, GitCompare, BookOpen, Megaphone, Layers, UserRoundCog, Lightbulb, Lock, Clock as Unlock, Copy as CopyIcon, MessageCircle, Trophy, Swords, Users, Ambulance, ThumbsUp, ThumbsDown, Package, Pencil, ShieldCheck, ArrowUpDown, ChevronRight, Loader as Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

// ── TYPES ─────────────────────────────────────────────────────────────────────

type PostStatus = "pending" | "generating" | "ready" | "error";
type PostCategory = "Value" | "Breakout" | "Trap" | "Captain" | "Proof" | "H2H" | "Top3" | "Injury" | "Conversation" | "Engagement";
type PostTab = "voice" | "hooks" | "visual" | "caption" | "ai" | "platform" | "strategy" | "prompt";

interface WeeklyContentPost {
  id: string;
  weekly_plan_id: string;
  day_key: string;
  slot_key: string;
  player_id: number | null;
  player_name: string | null;
  player2_id: number | null;
  player2_name: string | null;
  team: string | null;
  category: string;
  content_type: string;
  angle: string | null;
  status: PostStatus;
  locked: boolean;
  conversion_score: number | null;
  confidence_label: string | null;
  hook_score: number | null;
  hook_type: string | null;
  hooks: string[] | null;
  voice_script: string | null;
  caption_script: string | null;
  visual_plan: string | null;
  ai_image_prompt: string | null;
  ai_video_prompt: string | null;
  creative_style: string | null;
  strategy_json: Record<string, unknown> | null;
  platform_variants: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  top3_players: Top3Player[] | null;
}

interface Top3Player {
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  projection: number;
  ceiling: number;
  value_score: number;
}

interface PlayerOption {
  player_id: number;
  player_name: string;
  team: string;
  position?: string;
  projection_final?: number | null;
  neeko_rating_scaled: number | null;
}

interface PlayerAISummary {
  summary_short: string | null;
  summary_long: string | null;
  recommendation: string | null;
  primary_reason: string | null;
  generated_at: string | null;
}

interface TopPostPlayer {
  player_id: number;
  player_name: string;
  team: string;
  value_score: number | null;
  projection_final: number | null;
  consistency: number | null;
  neeko_rating_scaled: number | null;
  ai_recommendation: string | null;
}

interface TodayTopPost {
  type: "CONTROVERSIAL" | "VALUE" | "PROOF";
  player: TopPostPlayer;
  hook: string;
  caption: string;
}

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_DISPLAY: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};

const CATEGORY_META: Record<string, { color: string; bg: string; border: string; icon: React.ElementType }> = {
  Value:        { color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-500/10",  border: "border-emerald-500/30",  icon: TrendingUp },
  Breakout:     { color: "text-orange-700 dark:text-orange-300",  bg: "bg-orange-500/10",   border: "border-orange-500/30",   icon: Zap },
  Trap:         { color: "text-red-700 dark:text-red-300",        bg: "bg-red-500/10",      border: "border-red-500/30",      icon: AlertTriangle },
  Captain:      { color: "text-blue-700 dark:text-blue-300",      bg: "bg-blue-500/10",     border: "border-blue-500/30",     icon: Star },
  Proof:        { color: "text-violet-700 dark:text-violet-300",  bg: "bg-violet-500/10",   border: "border-violet-500/30",   icon: ShieldCheck },
  H2H:          { color: "text-cyan-700 dark:text-cyan-300",      bg: "bg-cyan-500/10",     border: "border-cyan-500/30",     icon: Swords },
  Top3:         { color: "text-amber-700 dark:text-amber-300",    bg: "bg-amber-500/10",    border: "border-amber-500/30",    icon: Trophy },
  Injury:       { color: "text-pink-700 dark:text-pink-300",      bg: "bg-pink-500/10",     border: "border-pink-500/30",     icon: Ambulance },
  Conversation: { color: "text-teal-700 dark:text-teal-300",      bg: "bg-teal-500/10",     border: "border-teal-500/30",     icon: MessageCircle },
  Engagement:   { color: "text-sky-700 dark:text-sky-300",         bg: "bg-sky-500/10",      border: "border-sky-500/30",      icon: Users },
};

const POST_TYPE_ICON: Record<string, React.ElementType> = {
  "Video":                 Video,
  "Image":                 Image,
  "Screen Recording":      Monitor,
  "Short-form Video":      Play,
  "Graphic Post":          Image,
  "Hybrid Video":          Layers,
  "H2H Post":              Swords,
  "Comparison Post":       GitCompare,
  "Narrative Post":        FileText,
  "Callout Post":          Megaphone,
  "Educational Breakdown": BookOpen,
  "Top 3 Post":            Trophy,
  "Injury Alert Post":     Ambulance,
  "Conversation Post":     MessageCircle,
};

const POST_TABS: { id: PostTab; label: string; icon: React.ElementType }[] = [
  { id: "voice",    label: "Script",    icon: Mic },
  { id: "hooks",    label: "Hooks",     icon: Zap },
  { id: "caption",  label: "Caption",   icon: FileText },
  { id: "visual",   label: "Visual",    icon: Eye },
  { id: "prompt",   label: "AI Prompt", icon: Brain },
  { id: "platform", label: "Platforms", icon: Smartphone },
  { id: "strategy", label: "Strategy",  icon: BarChart2 },
  { id: "ai",       label: "AI Intel",  icon: Brain },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    });
  }, []);
  return { copied, copy };
}

function getHooks(post: WeeklyContentPost): string[] {
  if (Array.isArray(post.hooks) && post.hooks.length > 0) return post.hooks;
  return [];
}

function getTodayDayKey(): string {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days[new Date().getDay()];
}

// ── SKELETON CARD ─────────────────────────────────────────────────────────────

function PostSkeleton({ status, onGenerate, generating, onRetry }: {
  status: PostStatus;
  onGenerate: () => void;
  generating: boolean;
  onRetry: () => void;
}) {
  if (status === "generating" || generating) {
    return (
      <div className="rounded-lg border border-border p-3 bg-muted/10 animate-pulse">
        <div className="flex items-center gap-2 mb-2">
          <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
          <span className="text-xs text-muted-foreground">Generating…</span>
        </div>
        <div className="h-3 bg-muted/40 rounded w-3/4 mb-1.5" />
        <div className="h-3 bg-muted/30 rounded w-1/2" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="rounded-lg border border-destructive/30 p-3 bg-destructive/5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          <span className="text-xs text-destructive font-medium">Generation failed</span>
        </div>
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 px-2.5 py-1.5 border border-destructive/40 text-destructive text-xs rounded-md hover:bg-destructive/10 transition-colors"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-border p-3 bg-muted/5">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-3 bg-muted/30 rounded w-12" />
        <div className="h-3 bg-muted/20 rounded w-16" />
      </div>
      <div className="h-3 bg-muted/30 rounded w-2/3 mb-1.5" />
      <div className="h-3 bg-muted/20 rounded w-1/3 mb-3" />
      <button
        onClick={onGenerate}
        disabled={generating}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-foreground text-background text-xs rounded-md font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        <Zap className="h-3 w-3" /> Generate
      </button>
    </div>
  );
}

// ── AI INTEL TAB ──────────────────────────────────────────────────────────────

function AISummaryTabContent({ playerId }: { playerId: number | null }) {
  const [summary, setSummary] = useState<PlayerAISummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const { copied, copy } = useCopy();

  const fetch = async () => {
    if (!playerId) return;
    setLoading(true);
    const { data } = await supabase
      .schema("ai" as never)
      .from("player_ai_analysis")
      .select("summary_short, summary_long, recommendation, primary_reason, generated_at")
      .eq("player_id", playerId)
      .maybeSingle();
    setSummary(data ?? null);
    setFetched(true);
    setLoading(false);
  };

  if (!playerId) {
    return <div className="p-4 text-xs text-muted-foreground">No player assigned to this post.</div>;
  }

  if (!fetched) {
    return (
      <div className="p-4">
        <button
          onClick={fetch}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-xs rounded-md hover:bg-accent transition-colors disabled:opacity-40"
        >
          <Brain className={`h-3.5 w-3.5 ${loading ? "animate-pulse" : "text-muted-foreground"}`} />
          {loading ? "Loading AI Intel…" : "Load AI Intel"}
        </button>
      </div>
    );
  }

  if (!summary) {
    return <div className="p-4 text-xs text-muted-foreground">No AI analysis found for this player.</div>;
  }

  return (
    <div className="p-4 space-y-3">
      {summary.recommendation && (
        <div className="flex items-center gap-2 p-2 bg-muted/20 rounded-md border border-border">
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-semibold">{summary.recommendation}</span>
        </div>
      )}
      {summary.primary_reason && (
        <p className="text-xs text-muted-foreground italic">{summary.primary_reason}</p>
      )}
      {summary.summary_short && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Summary</p>
          <p className="text-xs leading-relaxed">{summary.summary_short}</p>
          <button
            onClick={() => copy(summary.summary_short ?? "", "ai-short")}
            className="mt-1.5 flex items-center gap-1 px-2 py-1 text-[10px] border border-border rounded hover:bg-accent transition-colors"
          >
            {copied === "ai-short" ? <><Check className="h-3 w-3 text-emerald-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
          </button>
        </div>
      )}
      {summary.summary_long && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Full Analysis</p>
          <textarea
            readOnly
            value={summary.summary_long}
            className="w-full min-h-32 text-xs border border-border rounded-md p-2.5 bg-muted/10 resize-y font-mono leading-relaxed"
          />
        </div>
      )}
    </div>
  );
}

// ── PLATFORM VARIANTS TAB ─────────────────────────────────────────────────────

type TikTokVariant = { hook?: string; caption?: string; hashtags?: string[]; cta?: string };
type InstagramVariant = { hook?: string; caption?: string; hashtags?: string[]; carousel?: string[] };
type RedditVariant = { title?: string; body?: string };
type AnyVariant = TikTokVariant | InstagramVariant | RedditVariant | string;

function extractCopyText(key: string, v: AnyVariant): string {
  if (typeof v === "string") return v;
  if (key === "reddit") {
    const r = v as RedditVariant;
    return [r.title, r.body].filter(Boolean).join("\n\n");
  }
  if (key === "instagram") {
    const ig = v as InstagramVariant;
    return [ig.hook, ig.caption, ...(ig.carousel ?? []), ...(ig.hashtags ?? [])].filter(Boolean).join("\n\n");
  }
  const tk = v as TikTokVariant;
  return [tk.hook, tk.caption, ...(tk.hashtags ?? []), tk.cta].filter(Boolean).join("\n\n");
}

function PlatformVariantsTabContent({ post }: { post: WeeklyContentPost }) {
  const { copied, copy } = useCopy();
  const variants = post.platform_variants as Record<string, AnyVariant> | null;

  if (!variants || Object.keys(variants).length === 0) {
    return (
      <div className="p-4 text-center">
        <Smartphone className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">Platform variants are generated with the post. Generate this post to see them.</p>
      </div>
    );
  }

  const platforms: { key: string; label: string; Icon: React.ElementType }[] = [
    { key: "tiktok",    label: "TikTok",    Icon: Play },
    { key: "instagram", label: "Instagram", Icon: Image },
    { key: "reddit",    label: "Reddit",    Icon: MessageCircle },
  ];

  return (
    <div className="p-4 space-y-4">
      {platforms.map(({ key, label, Icon }) => {
        const v = variants[key];
        if (!v) return null;

        const copyText = extractCopyText(key, v);
        const isString = typeof v === "string";

        return (
          <div key={key} className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border">
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold">{label}</span>
              </div>
              <button
                onClick={() => copy(copyText, key)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] border border-border rounded hover:bg-accent transition-colors"
              >
                {copied === key ? <><Check className="h-3 w-3 text-emerald-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
              </button>
            </div>

            <div className="p-3 space-y-2">
              {isString ? (
                <p className="text-xs text-muted-foreground leading-relaxed">{v as string}</p>
              ) : key === "reddit" ? (
                <>
                  {(v as RedditVariant).title && (
                    <p className="text-xs font-semibold leading-snug">{(v as RedditVariant).title}</p>
                  )}
                  {(v as RedditVariant).body && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{(v as RedditVariant).body}</p>
                  )}
                </>
              ) : key === "instagram" ? (
                <>
                  {(v as InstagramVariant).hook && (
                    <p className="text-xs font-semibold leading-snug">{(v as InstagramVariant).hook}</p>
                  )}
                  {(v as InstagramVariant).caption && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{(v as InstagramVariant).caption}</p>
                  )}
                  {(v as InstagramVariant).carousel && (v as InstagramVariant).carousel!.length > 0 && (
                    <div className="border-t border-border/40 pt-1.5 space-y-0.5">
                      <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">Carousel slides</p>
                      {(v as InstagramVariant).carousel!.map((slide, i) => (
                        <p key={i} className="text-[10px] text-muted-foreground/70 italic pl-2">
                          {i + 1}. {slide}
                        </p>
                      ))}
                    </div>
                  )}
                  {(v as InstagramVariant).hashtags && (v as InstagramVariant).hashtags!.length > 0 && (
                    <p className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">
                      {(v as InstagramVariant).hashtags!.join(" ")}
                    </p>
                  )}
                </>
              ) : (
                <>
                  {(v as TikTokVariant).hook && (
                    <p className="text-xs font-semibold leading-snug">{(v as TikTokVariant).hook}</p>
                  )}
                  {(v as TikTokVariant).caption && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{(v as TikTokVariant).caption}</p>
                  )}
                  {(v as TikTokVariant).hashtags && (v as TikTokVariant).hashtags!.length > 0 && (
                    <p className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">
                      {(v as TikTokVariant).hashtags!.join(" ")}
                    </p>
                  )}
                  {(v as TikTokVariant).cta && (
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium border-t border-border/40 pt-1.5">
                      {(v as TikTokVariant).cta}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── STRATEGY TAB ──────────────────────────────────────────────────────────────

const GOAL_META: Record<string, { label: string; color: string; bg: string }> = {
  conversion: { label: "Conversion",  color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/30" },
  engagement: { label: "Engagement",  color: "text-amber-700 dark:text-amber-300",    bg: "bg-amber-500/10 border-amber-500/30"   },
  authority:  { label: "Authority",   color: "text-sky-700 dark:text-sky-300",        bg: "bg-sky-500/10 border-sky-500/30"       },
};

const FUNNEL_META: Record<string, { label: string; color: string }> = {
  top:    { label: "Top of Funnel",    color: "text-amber-600 dark:text-amber-400"   },
  middle: { label: "Middle of Funnel", color: "text-sky-600 dark:text-sky-400"       },
  bottom: { label: "Bottom of Funnel", color: "text-emerald-600 dark:text-emerald-400" },
};

const CTA_META: Record<string, { label: string; description: string }> = {
  soft:   { label: "Soft CTA",   description: "Comment / poll / share" },
  medium: { label: "Medium CTA", description: "Save / profile visit"   },
  hard:   { label: "Hard CTA",   description: "Click / subscribe / buy" },
};

function StrategyTabContent({ post }: { post: WeeklyContentPost }) {
  const strategy = post.strategy_json as Record<string, string> | null;

  if (!strategy || !strategy.goal) {
    return (
      <div className="p-6 text-center space-y-2">
        <BarChart2 className="h-7 w-7 text-muted-foreground/30 mx-auto" />
        <p className="text-xs text-muted-foreground">Generate this post to see its strategy breakdown.</p>
      </div>
    );
  }

  const goalMeta  = GOAL_META[strategy.goal]   ?? GOAL_META.engagement;
  const funnelMeta = FUNNEL_META[strategy.funnel_stage] ?? FUNNEL_META.middle;
  const ctaMeta   = CTA_META[strategy.cta_type] ?? CTA_META.medium;

  return (
    <div className="p-4 space-y-4">
      {/* Conversion score header */}
      {post.conversion_score != null && (
        <div className="flex items-center gap-4 p-3 rounded-xl border border-border bg-muted/10">
          <div className="text-center shrink-0">
            <p className="text-3xl font-bold font-mono leading-none">{post.conversion_score.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">/ 10</p>
          </div>
          <div className="h-8 w-px bg-border shrink-0" />
          <div className="space-y-0.5 min-w-0">
            <p className="text-xs font-semibold">Conversion Score</p>
            <div className="flex items-center gap-2 flex-wrap">
              {post.confidence_label && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${goalMeta.bg} ${goalMeta.color}`}>
                  {post.confidence_label}
                </span>
              )}
              {post.hook_type && (
                <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">
                  {post.hook_type}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Goal + Angle row */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`p-3 rounded-lg border ${goalMeta.bg}`}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Goal</p>
          <p className={`text-sm font-bold capitalize ${goalMeta.color}`}>{strategy.goal}</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/10">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Angle</p>
          <p className="text-sm font-bold capitalize">{strategy.angle}</p>
        </div>
      </div>

      {/* Audience */}
      <div className="p-3 rounded-lg border border-border bg-muted/10">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Audience</p>
        <p className="text-xs font-medium capitalize">{strategy.audience}</p>
      </div>

      {/* Funnel + CTA row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-lg border border-border bg-muted/10">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Funnel Stage</p>
          <p className={`text-xs font-semibold ${funnelMeta.color}`}>{funnelMeta.label}</p>
        </div>
        <div className="p-3 rounded-lg border border-border bg-muted/10">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">CTA Type</p>
          <p className="text-xs font-semibold">{ctaMeta.label}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{ctaMeta.description}</p>
        </div>
      </div>

      {/* Best Time */}
      <div className="p-3 rounded-lg border border-border bg-muted/10">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Best Time to Post</p>
        <p className="text-xs font-medium">{strategy.timing}</p>
      </div>

      {/* Why it works */}
      {strategy.why_it_works && (
        <div className="p-3 rounded-lg border border-border bg-muted/5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Why It Works</p>
          <p className="text-xs text-foreground/80 leading-relaxed italic">"{strategy.why_it_works}"</p>
        </div>
      )}
    </div>
  );
}

// ── AI PROMPT TAB ─────────────────────────────────────────────────────────────

function AIPromptTabContent({ post }: { post: WeeklyContentPost }) {
  const { copied, copy } = useCopy();

  const hasPrompts = post.ai_image_prompt || post.ai_video_prompt;

  if (!hasPrompts) {
    return (
      <div className="p-4 text-center">
        <Brain className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">AI prompts are generated with the post. Generate this post to see Midjourney and Runway prompts.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {post.ai_image_prompt && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Image className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold">Image Prompt</p>
              <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">Midjourney / DALL-E</span>
            </div>
            <button
              onClick={() => copy(post.ai_image_prompt!, "img-prompt")}
              className="flex items-center gap-1 px-2 py-1 text-[10px] border border-border rounded hover:bg-accent transition-colors"
            >
              {copied === "img-prompt" ? <><Check className="h-3 w-3 text-emerald-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
            </button>
          </div>
          <textarea
            readOnly
            value={post.ai_image_prompt}
            className="w-full min-h-24 text-xs border border-border rounded-md p-2.5 bg-muted/10 resize-y font-mono leading-relaxed"
          />
        </div>
      )}
      {post.ai_video_prompt && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Video className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold">Video Prompt</p>
              <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">Runway / Sora</span>
            </div>
            <button
              onClick={() => copy(post.ai_video_prompt!, "vid-prompt")}
              className="flex items-center gap-1 px-2 py-1 text-[10px] border border-border rounded hover:bg-accent transition-colors"
            >
              {copied === "vid-prompt" ? <><Check className="h-3 w-3 text-emerald-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
            </button>
          </div>
          <textarea
            readOnly
            value={post.ai_video_prompt}
            className="w-full min-h-24 text-xs border border-border rounded-md p-2.5 bg-muted/10 resize-y font-mono leading-relaxed"
          />
        </div>
      )}
    </div>
  );
}

// ── VISUAL PLAN TAB ───────────────────────────────────────────────────────────

function VisualPlanTabContent({ post }: { post: WeeklyContentPost }) {
  const { copied, copy } = useCopy();
  const visualPlan = post.visual_plan;

  if (!visualPlan) {
    return (
      <div className="p-4 text-center">
        <Eye className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">Visual plan is generated with the post.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5 text-muted-foreground" /> Visual Production Brief
        </p>
        <button
          onClick={() => copy(visualPlan, "visual")}
          className="flex items-center gap-1 px-2 py-1 text-[10px] border border-border rounded hover:bg-accent transition-colors"
        >
          {copied === "visual" ? <><Check className="h-3 w-3 text-emerald-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
        </button>
      </div>
      <textarea
        readOnly
        value={visualPlan}
        className="w-full min-h-40 text-xs border border-border rounded-md p-2.5 bg-muted/10 resize-y font-mono leading-relaxed"
      />
    </div>
  );
}

// ── TODAY'S TOP POSTS ─────────────────────────────────────────────────────────

function TodayTopPostCard({ topPost, onCopy, copied }: { topPost: TodayTopPost; onCopy: (text: string, key: string) => void; copied: string | null }) {
  const typeColors: Record<string, string> = {
    CONTROVERSIAL: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
    VALUE:         "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    PROOF:         "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${typeColors[topPost.type] ?? ""}`}>
          {topPost.type}
        </span>
        <span className="text-xs font-semibold">{topPost.player.player_name}</span>
        <span className="text-[10px] text-muted-foreground">{topPost.player.team}</span>
      </div>
      <p className="text-xs font-medium leading-snug">{topPost.hook}</p>
      <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">{topPost.caption}</p>
      <button
        onClick={() => onCopy(`${topPost.hook}\n\n${topPost.caption}`, topPost.type)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border text-xs rounded-md hover:bg-accent transition-colors"
      >
        {copied === topPost.type ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
      </button>
    </div>
  );
}

function TodayTopPostsSection() {
  const [posts, setPosts] = useState<TodayTopPost[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const { copied, copy } = useCopy();

  const generate = async () => {
    setLoading(true);
    try {
      console.log("[AdminContentEngine] Fetching rankings from player_rankings_cache");
      const { data, error } = await supabase
        .schema("afl" as never)
        .from("player_rankings_cache")
        .select("player_id, player_name, team, value_score, projection_final, consistency, neeko_rating_scaled, ai_recommendation")
        .eq("is_available", true)
        .not("projection_final", "is", null)
        .order("neeko_rating_scaled", { ascending: false })
        .limit(30);

      if (error) {
        console.error("[AdminContentEngine] Rankings fetch failed:", error);
        return;
      }

      if (!data || data.length === 0) {
        console.warn("[AdminContentEngine] No players returned from rankings query");
        return;
      }

      console.log(`[AdminContentEngine] Fetched ${data.length} players`);

      const players = data as TopPostPlayer[];
      const valuePlayer = [...players].sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0))[0];
      const controversialPlayer = players[Math.floor(Math.random() * Math.min(players.length, 10))];
      const proofPlayer = players.find((p) => p.ai_recommendation?.toLowerCase().includes("buy") || p.ai_recommendation?.toLowerCase().includes("strong")) ?? players[2];

      const results: TodayTopPost[] = [
        {
          type: "CONTROVERSIAL",
          player: controversialPlayer,
          hook: `Unpopular opinion: ${controversialPlayer.player_name} is the most underrated pick this round`,
          caption: `Everyone's looking at the obvious picks. But ${controversialPlayer.player_name} from ${controversialPlayer.team} is quietly sitting at ${Math.round(controversialPlayer.projection_final ?? 0)} projected — with ownership that doesn't reflect their ceiling. This is the move.`,
        },
        {
          type: "VALUE",
          player: valuePlayer,
          hook: `${valuePlayer.player_name} is $450k cheaper than players with the same projection`,
          caption: `Pure value math: ${valuePlayer.player_name} (${valuePlayer.team}) is projecting ${Math.round(valuePlayer.projection_final ?? 0)} pts this round. Players at this output level average 15-20% more in price. This is the window to get in.`,
        },
        {
          type: "PROOF",
          player: proofPlayer,
          hook: `We said to pick ${proofPlayer.player_name} last round. Here's what happened.`,
          caption: `${proofPlayer.player_name} from ${proofPlayer.team} delivered. The model flagged them early — the data was clear. Now the market is catching up. ${proofPlayer.ai_recommendation ?? "The edge is still there this week."}`
        },
      ];

      setPosts(results);
      setGenerated(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Today's 3 Picks</p>
          <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded">Quick generates</span>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background rounded-md text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          <Zap className={`h-3.5 w-3.5 ${loading ? "animate-pulse" : ""}`} />
          {loading ? "Generating…" : generated ? "Regenerate" : "Generate Today's Content"}
        </button>
      </div>
      {posts && (
        <div className="p-3 space-y-2">
          {posts.map((p) => (
            <TodayTopPostCard key={p.type} topPost={p} onCopy={copy} copied={copied} />
          ))}
        </div>
      )}
      {!posts && !loading && (
        <div className="px-4 py-5 text-center">
          <Target className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Click generate to get 3 high-conversion posts — Controversial, Value, and Proof</p>
        </div>
      )}
    </div>
  );
}

// ── POST DETAIL PANEL ─────────────────────────────────────────────────────────

function PostDetailPanel({
  post,
  onRegenerate,
  onRewrite,
  regenerating,
  onToggleLock,
  onDuplicate,
  availablePlayers,
  onSwapPlayer,
  swapping,
}: {
  post: WeeklyContentPost;
  onRegenerate: (post: WeeklyContentPost) => void;
  onRewrite: (post: WeeklyContentPost) => void;
  regenerating: boolean;
  onToggleLock: (post: WeeklyContentPost) => void;
  onDuplicate: (post: WeeklyContentPost) => void;
  availablePlayers: PlayerOption[];
  onSwapPlayer: (post: WeeklyContentPost, newPlayerId: number) => void;
  swapping: boolean;
}) {
  const [activeTab, setActiveTab] = useState<PostTab>("voice");
  const [editMode, setEditMode] = useState(false);
  const [editScript, setEditScript] = useState(post.voice_script ?? "");
  const [editCaption, setEditCaption] = useState(post.caption_script ?? "");
  const [swapPlayerId, setSwapPlayerId] = useState<number>(post.player_id ?? 0);
  const [submittingFeedback, setSubmittingFeedback] = useState<string | null>(null);
  const [feedbackDone, setFeedbackDone] = useState<string | null>(null);
  const { copied, copy } = useCopy();
  const catMeta = CATEGORY_META[post.category] ?? CATEGORY_META["Value"];

  useEffect(() => {
    setEditScript(post.voice_script ?? "");
    setEditCaption(post.caption_script ?? "");
    setSwapPlayerId(post.player_id ?? 0);
  }, [post.id, post.voice_script, post.caption_script, post.player_id]);

  const hooks = getHooks(post);

  const getTabContent = (): string => {
    switch (activeTab) {
      case "voice":   return post.voice_script ?? "";
      case "hooks":   return hooks.join("\n\n");
      case "caption": return post.caption_script ?? "";
      case "visual":  return "";
      case "prompt":  return "";
      case "platform": return "";
      case "strategy": return "";
      case "ai":       return "";
    }
  };

  const copyAll = () => {
    const parts = [
      hooks[0] ? `HOOK\n${hooks[0]}` : null,
      post.voice_script ? `SCRIPT\n${post.voice_script}` : null,
      post.caption_script ? `CAPTION\n${post.caption_script}` : null,
      post.visual_plan ? `VISUAL PLAN\n${post.visual_plan}` : null,
    ].filter(Boolean);
    copy(parts.join("\n\n---\n\n"), "all");
  };

  const submitFeedback = async (feedbackType: string) => {
    const key = `${post.id}-${feedbackType}`;
    setSubmittingFeedback(key);
    try {
      await supabase.schema("marketing" as never).from("post_feedback").insert({
        post_id: post.id,
        player_id: post.player_id ?? null,
        content_type: post.content_type,
        hook: hooks[0] ?? "",
        angle: post.angle ?? "",
        feedback_type: feedbackType,
      });
      setFeedbackDone(feedbackType);
    } catch (_e) {
      // non-fatal
    } finally {
      setSubmittingFeedback(null);
    }
  };

  const isTextTab = activeTab === "voice" || activeTab === "caption" || activeTab === "hooks";

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-background mt-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/20 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${catMeta.bg} ${catMeta.color}`}>
            {(() => { const Icon = catMeta.icon; return <Icon className="h-3 w-3" />; })()}
            {post.category}
          </span>
          {post.category === "Top3" && Array.isArray(post.top3_players) && post.top3_players.length >= 3 ? (
            <div className="flex items-center gap-2 flex-wrap">
              {post.top3_players.slice(0, 3).map((p, i) => {
                const rankColors = ["text-amber-500", "text-slate-400", "text-orange-600"];
                const rankLabels = ["#1", "#2", "#3"];
                return (
                  <span key={p.player_id} className="flex items-center gap-1">
                    <span className={`text-[10px] font-bold ${rankColors[i]}`}>{rankLabels[i]}</span>
                    <span className="text-sm font-semibold">{p.player_name}</span>
                  </span>
                );
              })}
            </div>
          ) : (
            <>
              <span className="text-sm font-semibold">{post.player_name ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{post.team ?? ""}</span>
            </>
          )}
          {post.conversion_score != null && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-foreground/10 text-foreground">
              {post.conversion_score.toFixed(1)}/10
            </span>
          )}
          {post.confidence_label && (
            <span className="text-[10px] text-muted-foreground">{post.confidence_label}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={copyAll}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-foreground text-background text-xs rounded-md hover:opacity-90 transition-opacity"
          >
            {copied === "all" ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Package className="h-3.5 w-3.5" /> Post Pack</>}
          </button>
          <button
            onClick={() => { setEditMode(v => !v); setEditScript(post.voice_script ?? ""); setEditCaption(post.caption_script ?? ""); }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 border text-xs rounded-md transition-colors ${editMode ? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400" : "border-border text-muted-foreground hover:bg-accent"}`}
          >
            <Pencil className="h-3.5 w-3.5" />
            {editMode ? "Done" : "Edit"}
          </button>
          <button
            onClick={() => onDuplicate(post)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border text-xs rounded-md hover:bg-accent transition-colors"
          >
            <CopyIcon className="h-3.5 w-3.5" /> Duplicate
          </button>
          <button
            onClick={() => onToggleLock(post)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 border text-xs rounded-md transition-colors ${
              post.locked
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {post.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            {post.locked ? "Locked" : "Lock"}
          </button>
          <button
            onClick={() => onRegenerate(post)}
            disabled={regenerating || post.locked}
            title={post.locked ? "Post is locked — unlock to regenerate" : "New player + new content"}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border text-xs rounded-md hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
            {regenerating ? "Regen…" : "Regen"}
          </button>
          <button
            onClick={() => onRewrite(post)}
            disabled={regenerating || post.locked}
            title={post.locked ? "Post is locked — unlock to rewrite" : "Same player, new content"}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border text-xs rounded-md hover:bg-accent transition-colors disabled:opacity-50"
          >
            <Pencil className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
            {regenerating ? "Rewriting…" : "Rewrite"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {POST_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              activeTab === id
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "ai" ? (
        <AISummaryTabContent playerId={post.player_id} />
      ) : activeTab === "platform" ? (
        <PlatformVariantsTabContent post={post} />
      ) : activeTab === "strategy" ? (
        <StrategyTabContent post={post} />
      ) : activeTab === "visual" ? (
        <VisualPlanTabContent post={post} />
      ) : activeTab === "prompt" ? (
        <AIPromptTabContent post={post} />
      ) : (
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              {POST_TABS.find((t) => t.id === activeTab)?.label}
            </p>
            {isTextTab && (
              <button
                onClick={() => copy(getTabContent(), activeTab)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border text-xs rounded-md hover:bg-accent transition-colors"
              >
                {copied === activeTab ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
              </button>
            )}
          </div>

          {activeTab === "hooks" ? (
            <div className="space-y-2">
              {hooks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hooks generated yet.</p>
              ) : hooks.map((hook, i) => (
                <div key={i} className={`flex items-start gap-2 p-3 border rounded-md ${i === 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-muted/30 border-border"}`}>
                  <span className="text-xs text-muted-foreground font-mono shrink-0 mt-0.5">{i + 1}.</span>
                  <p className="text-sm flex-1 leading-relaxed">{hook}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    {i === 0 && <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/20">Active</span>}
                    <button onClick={() => copy(hook, `hook-${i}`)} className="p-1 rounded hover:bg-accent transition-colors">
                      {copied === `hook-${i}` ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : editMode && (activeTab === "voice" || activeTab === "caption") ? (
            <textarea
              value={activeTab === "voice" ? editScript : editCaption}
              onChange={e => activeTab === "voice" ? setEditScript(e.target.value) : setEditCaption(e.target.value)}
              className="w-full min-h-48 text-sm border border-blue-500/30 rounded-md p-3 bg-background resize-y font-mono leading-relaxed"
            />
          ) : (
            <textarea
              value={getTabContent()}
              readOnly
              className="w-full min-h-48 text-sm border border-border rounded-md p-3 bg-muted/10 resize-y font-mono leading-relaxed"
            />
          )}
          {isTextTab && <p className="text-[10px] text-muted-foreground mt-1.5">{getTabContent().length} characters</p>}
        </div>
      )}

      {/* Feedback */}
      <div className="p-4 border-t border-border">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-2.5">Post Feedback</p>
        <div className="flex flex-wrap gap-2">
          {[
            { type: "performed_well",  icon: <ThumbsUp className="h-3.5 w-3.5" />,   label: "Performed Well" },
            { type: "didnt_perform",   icon: <ThumbsDown className="h-3.5 w-3.5" />,  label: "Didn't Perform" },
            { type: "high_engagement", icon: <Flame className="h-3.5 w-3.5" />,       label: "High Engagement" },
            { type: "got_clicks",      icon: <ArrowUpDown className="h-3.5 w-3.5" />, label: "Got Clicks" },
          ].map(({ type, icon, label }) => {
            const isDone = feedbackDone === type;
            const isSubmitting = submittingFeedback === `${post.id}-${type}`;
            return (
              <button
                key={type}
                onClick={() => submitFeedback(type)}
                disabled={!!feedbackDone || isSubmitting}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors ${
                  isDone ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border text-muted-foreground hover:bg-accent disabled:opacity-50"
                }`}
              >
                {icon}
                {isDone ? "Saved!" : label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Swap Player */}
      {availablePlayers.length > 0 && post.status === "ready" && (
        <div className="p-4 border-t border-border">
          <div className="border border-dashed border-border rounded-lg p-3 space-y-3 bg-muted/5">
            <div className="flex items-center gap-2">
              <UserRoundCog className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Swap Player</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={swapPlayerId}
                onChange={e => setSwapPlayerId(Number(e.target.value))}
                disabled={swapping}
                className="flex-1 min-w-0 text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
              >
                {availablePlayers.map(p => (
                  <option key={p.player_id} value={p.player_id}>
                    {p.player_name} · {p.team}{p.position ? ` · ${p.position}` : ""}{p.projection_final ? ` · ${Math.round(p.projection_final)}pts` : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={() => onSwapPlayer(post, swapPlayerId)}
                disabled={swapping || swapPlayerId === (post.player_id ?? 0)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background text-xs rounded-md font-medium hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${swapping ? "animate-spin" : ""}`} />
                {swapping ? "Regenerating…" : "Apply Player"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── POST CARD ─────────────────────────────────────────────────────────────────

function PostCard({
  post,
  isSelected,
  onSelect,
  onGenerate,
  generating,
}: {
  post: WeeklyContentPost;
  isSelected: boolean;
  onSelect: () => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  const catMeta = CATEGORY_META[post.category] ?? CATEGORY_META["Value"];
  const CatIcon = catMeta.icon;
  const TypeIcon = POST_TYPE_ICON[post.content_type] ?? Video;
  const hooks = getHooks(post);

  if (post.status === "pending" || post.status === "generating" || (post.status === "error" && !post.voice_script)) {
    return (
      <PostSkeleton
        status={generating ? "generating" : post.status}
        onGenerate={onGenerate}
        generating={generating}
        onRetry={onGenerate}
      />
    );
  }

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-lg border p-3 transition-all ${
        isSelected
          ? `${catMeta.bg} ${catMeta.border} ring-1 ring-current`
          : "border-border hover:border-foreground/30 hover:bg-muted/20"
      }`}
    >
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${catMeta.bg} ${catMeta.color}`}>
          <CatIcon className="h-2.5 w-2.5" />
          {post.category}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <TypeIcon className="h-2.5 w-2.5" />
          {post.content_type}
        </span>
        {post.conversion_score != null && (
          <span className={`text-[10px] font-mono font-bold ${post.conversion_score >= 8 ? "text-emerald-600 dark:text-emerald-400" : post.conversion_score >= 6 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
            {post.conversion_score.toFixed(1)}/10
          </span>
        )}
        {post.locked && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            <Lock className="h-2.5 w-2.5" /> Locked
          </span>
        )}
      </div>
      {post.category === "Top3" && Array.isArray(post.top3_players) && post.top3_players.length >= 3 ? (
        <div className="space-y-0.5 mb-1.5">
          {post.top3_players.slice(0, 3).map((p, i) => {
            const rankColors = ["text-amber-500", "text-slate-400", "text-orange-600"];
            const rankLabels = ["#1", "#2", "#3"];
            return (
              <div key={p.player_id} className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold w-5 shrink-0 ${rankColors[i]}`}>{rankLabels[i]}</span>
                <span className="text-xs font-semibold truncate">{p.player_name}</span>
                <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{Math.round(p.projection)}pts</span>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <p className="font-semibold text-sm leading-tight truncate">{post.player_name ?? "—"}</p>
          <p className="text-xs text-muted-foreground truncate mb-1.5">{post.team ?? ""}</p>
        </>
      )}
      {hooks[0] && (
        <p className="text-[10px] text-muted-foreground/80 leading-snug line-clamp-2 font-mono">{hooks[0]}</p>
      )}
    </button>
  );
}

// ── DAY ROW ───────────────────────────────────────────────────────────────────

function DayRow({
  dayKey,
  posts,
  selectedPostId,
  onSelectPost,
  onGeneratePost,
  onRegenPost,
  generatingPostId,
  onToggleLock,
  onDuplicate,
  onSwapPlayer,
  swappingPostId,
  availablePlayers,
}: {
  dayKey: string;
  posts: WeeklyContentPost[];
  selectedPostId: string | null;
  onSelectPost: (post: WeeklyContentPost | null) => void;
  onGeneratePost: (post: WeeklyContentPost) => void;
  onRegenPost: (post: WeeklyContentPost) => void;
  generatingPostId: string | null;
  onToggleLock: (post: WeeklyContentPost) => void;
  onDuplicate: (post: WeeklyContentPost) => void;
  onSwapPlayer: (post: WeeklyContentPost, newPlayerId: number) => void;
  swappingPostId: string | null;
  availablePlayers: PlayerOption[];
}) {
  const todayKey = getTodayDayKey();
  const isToday = dayKey === todayKey;
  const [expanded, setExpanded] = useState(isToday);

  const selectedPost = posts.find(p => p.id === selectedPostId) ?? null;
  const readyCount = posts.filter(p => p.status === "ready").length;
  const errorCount = posts.filter(p => p.status === "error").length;

  const handleGenerateDay = () => {
    const toGenerate = posts.filter(p => p.status === "pending" || p.status === "error");
    toGenerate.forEach(p => onGeneratePost(p));
  };

  return (
    <div className={`border rounded-lg overflow-hidden ${isToday ? "border-foreground/30" : "border-border"}`}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">{DAY_DISPLAY[dayKey] ?? dayKey}</span>
            {isToday && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-foreground/10 text-foreground">Today</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">{readyCount}/{posts.length} ready</span>
            {errorCount > 0 && <span className="text-[10px] text-destructive font-semibold">{errorCount} error</span>}
          </div>
          <div className="flex gap-1">
            {posts.map(p => {
              const meta = CATEGORY_META[p.category] ?? CATEGORY_META["Value"];
              const Icon = meta.icon;
              return (
                <span key={p.id} className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${meta.bg} ${meta.color}`}>
                  <Icon className="h-2.5 w-2.5" />
                  {p.category}
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {readyCount < posts.length && (
            <button
              onClick={e => { e.stopPropagation(); handleGenerateDay(); }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] border border-border rounded hover:bg-accent transition-colors"
            >
              <Zap className="h-3 w-3" /> Generate Day
            </button>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                isSelected={selectedPostId === post.id}
                onSelect={() => {
                  if (selectedPostId === post.id) {
                    onSelectPost(null);
                  } else {
                    onSelectPost(post);
                  }
                }}
                onGenerate={() => onGeneratePost(post)}
                generating={generatingPostId === post.id}
              />
            ))}
          </div>

          {selectedPost && selectedPost.status === "ready" && (
            <PostDetailPanel
              post={selectedPost}
              onRegenerate={onRegenPost}
              onRewrite={onGeneratePost}
              regenerating={generatingPostId === selectedPost.id}
              onToggleLock={onToggleLock}
              onDuplicate={onDuplicate}
              availablePlayers={availablePlayers}
              onSwapPlayer={onSwapPlayer}
              swapping={swappingPostId === selectedPost.id}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function AdminContentEngine() {
  const [planId, setPlanId] = useState<string | null>(null);
  const [weekKey, setWeekKey] = useState<string>("");
  const [posts, setPosts] = useState<WeeklyContentPost[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [generatingPostId, setGeneratingPostId] = useState<string | null>(null);
  const [swappingPostId, setSwappingPostId] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [availablePlayers, setAvailablePlayers] = useState<PlayerOption[]>([]);
  const activeGenerations = useRef<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    supabase.functions.invoke("generate-weekly-content", { body: { action: "get_players" } })
      .then(({ data }) => {
        if (data?.players) setAvailablePlayers(data.players as PlayerOption[]);
      });
  }, []);

  const updatePost = useCallback((updated: WeeklyContentPost) => {
    setPosts(prev => prev.map(p => p.id === updated.id ? updated : p));
    setSelectedPostId(prev => prev === updated.id ? updated.id : prev);
  }, []);

  function getCurrentWeekKey(): string {
    const now = new Date();
    const year = now.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const week = Math.ceil(
      ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
    );
    return `${year}-W${String(week).padStart(2, "0")}`;
  }

  const loadExistingPlan = useCallback(async () => {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const wk = getCurrentWeekKey();
      const { data: plan } = await supabase
        .from("weekly_content_plans")
        .select("id, week_key")
        .eq("week_key", wk)
        .maybeSingle();

      if (!plan?.id) {
        setPlanId(null);
        setWeekKey(wk);
        setPosts([]);
        return;
      }

      const { data: planPosts, error: postsError } = await supabase
        .from("weekly_content_posts")
        .select("*")
        .eq("weekly_plan_id", plan.id)
        .order("day_number")
        .order("slot_number");

      if (postsError) throw new Error(postsError.message);

      // Plan exists but has no posts — treat as empty, prompt user to build
      if (!planPosts || planPosts.length === 0) {
        setPlanId(null);
        setWeekKey(wk);
        setPosts([]);
        return;
      }

      setPlanId(plan.id);
      setWeekKey(plan.week_key ?? wk);
      setPosts(planPosts as WeeklyContentPost[]);
      setSelectedPostId(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error loading plan";
      setPlanError(msg);
    } finally {
      setPlanLoading(false);
    }
  }, []);

  const fetchPlan = useCallback(async (force = false) => {
    if (!force) {
      await loadExistingPlan();
      return;
    }
    setPlanLoading(true);
    setPlanError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "generate-weekly-content",
        { body: { force: true } }
      );

      if (fnError) throw new Error(fnError.message ?? "Edge function error");
      if (!data?.plan_id) throw new Error(data?.error ?? "No plan_id returned");

      setPlanId(data.plan_id);
      setWeekKey(data.week_key ?? "");
      setPosts((data.posts as WeeklyContentPost[]) ?? []);
      setSelectedPostId(null);
      toast({ title: "New weekly plan built" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error loading plan";
      setPlanError(msg);
      toast({ title: "Failed to build plan", description: msg, variant: "destructive" });
    } finally {
      setPlanLoading(false);
    }
  }, [loadExistingPlan, toast]);

  useEffect(() => {
    loadExistingPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectNewPlayerForPost = useCallback((
    category: string,
    currentPlayerId: number | null,
    usedPlayerIds: Set<number>,
  ): { player_id: number; player_name: string; team: string } | null => {
    if (availablePlayers.length === 0) return null;

    const excluded = new Set([...(currentPlayerId ? [currentPlayerId] : []), ...usedPlayerIds]);
    const pool = availablePlayers.filter(p => !excluded.has(p.player_id));
    const fallback = availablePlayers.filter(p => p.player_id !== currentPlayerId);
    const candidates = pool.length > 0 ? pool : fallback;
    if (candidates.length === 0) return null;

    const pick = candidates[Math.floor(Math.random() * Math.min(candidates.length, 10))];
    return { player_id: pick.player_id, player_name: pick.player_name, team: pick.team };
  }, [availablePlayers]);

  const generatePost = useCallback(async (post: WeeklyContentPost) => {
    if (activeGenerations.current.has(post.id)) return;
    if (post.locked) {
      toast({ title: "Post is locked", description: "Unlock before regenerating.", variant: "destructive" });
      return;
    }

    if (!post.category || post.category.trim() === "") {
      console.error("[ContentEngine] Invalid post — missing category", post);
      toast({ title: "Invalid post", description: "Post is missing a category — cannot generate.", variant: "destructive" });
      return;
    }

    if (post.category !== "Top3" && !post.player_id) {
      console.error("[ContentEngine] Skipping invalid post — missing player_id", post);
      toast({ title: "Invalid post", description: "Post has no player assigned — cannot generate.", variant: "destructive" });
      return;
    }

    activeGenerations.current.add(post.id);
    setGeneratingPostId(post.id);
    updatePost({ ...post, status: "generating" });

    console.log("[ContentEngine] Generating post:", { post_id: post.id, category: post.category, player_id: post.player_id, player_name: post.player_name });

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "generate-content-post",
        { body: { post_id: post.id } }
      );

      if (fnError) throw new Error(fnError.message ?? "Post generation failed");
      if (!data?.post) throw new Error(data?.error ?? "No post returned");

      console.log("[ContentEngine] Post generated:", post.id, "status:", data.post.status);
      updatePost(data.post as WeeklyContentPost);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      console.error("[ContentEngine] Post generation failed:", post.id, msg);
      updatePost({ ...post, status: "error", error_message: msg });
      toast({ title: `Failed: ${post.player_name ?? post.category}`, description: msg, variant: "destructive" });
    } finally {
      activeGenerations.current.delete(post.id);
      setGeneratingPostId(null);
    }
  }, [toast, updatePost]);

  const regenPost = useCallback(async (post: WeeklyContentPost) => {
    if (activeGenerations.current.has(post.id)) return;
    if (post.locked) {
      toast({ title: "Post is locked", description: "Unlock before regenerating.", variant: "destructive" });
      return;
    }
    if (post.category === "Top3" || post.category === "Conversation" || post.category === "Engagement") {
      return generatePost(post);
    }

    activeGenerations.current.add(post.id);
    setGeneratingPostId(post.id);
    updatePost({ ...post, status: "generating" });

    try {
      const dayPosts = posts.filter(p => p.day_key === post.day_key && p.id !== post.id);
      const usedInDay = new Set<number>(dayPosts.map(p => p.player_id).filter((id): id is number => id !== null));

      const newPlayer = selectNewPlayerForPost(post.category, post.player_id, usedInDay);

      if (!newPlayer) {
        activeGenerations.current.delete(post.id);
        setGeneratingPostId(null);
        return generatePost(post);
      }

      const { error: updateError } = await supabase
        .from("weekly_content_posts")
        .update({
          player_id: newPlayer.player_id,
          player_name: newPlayer.player_name,
          team: newPlayer.team,
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
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);

      if (updateError) throw new Error(updateError.message);

      const updatedPost: WeeklyContentPost = {
        ...post,
        player_id: newPlayer.player_id,
        player_name: newPlayer.player_name,
        team: newPlayer.team,
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
      };
      updatePost(updatedPost);

      activeGenerations.current.delete(post.id);
      setGeneratingPostId(null);

      await generatePost(updatedPost);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Regen failed";
      console.error("[ContentEngine] Regen failed:", post.id, msg);
      updatePost({ ...post, status: "error", error_message: msg });
      toast({ title: `Regen failed: ${post.player_name ?? post.category}`, description: msg, variant: "destructive" });
      activeGenerations.current.delete(post.id);
      setGeneratingPostId(null);
    }
  }, [posts, selectNewPlayerForPost, generatePost, updatePost, toast]);

  const handleToggleLock = useCallback(async (post: WeeklyContentPost) => {
    const newLocked = !post.locked;
    updatePost({ ...post, locked: newLocked });

    await supabase.functions.invoke("generate-weekly-content", {
      body: { action: "toggle_lock", post_id: post.id, locked: newLocked },
    });

    toast({ title: newLocked ? `Locked — ${post.player_name}` : `Unlocked — ${post.player_name}` });
  }, [updatePost, toast]);

  const handleDuplicate = useCallback(async (post: WeeklyContentPost) => {
    if (!planId) return;
    const { data } = await supabase.functions.invoke("generate-weekly-content", {
      body: { action: "duplicate_post", post },
    });

    if (data?.post) {
      setPosts(prev => [...prev, data.post as WeeklyContentPost]);
      toast({ title: `Duplicated — ${post.player_name}`, description: "New post added to the same day." });
    }
  }, [planId, toast]);

  const handleSwapPlayer = useCallback(async (post: WeeklyContentPost, newPlayerId: number) => {
    if (post.locked) {
      toast({ title: "Post is locked", description: "Unlock before swapping.", variant: "destructive" });
      return;
    }
    const newPlayer = availablePlayers.find(p => p.player_id === newPlayerId);
    if (!newPlayer) return;

    setSwappingPostId(post.id);

    const { data: swapResult, error: fnError } = await supabase.functions.invoke("generate-weekly-content", {
      body: {
        action: "swap_player",
        post_id: post.id,
        player_id: newPlayer.player_id,
        player_name: newPlayer.player_name,
        team: newPlayer.team,
      },
    });

    if (!fnError && swapResult?.ok) {
      const updated: WeeklyContentPost = {
        ...post,
        player_id: newPlayer.player_id,
        player_name: newPlayer.player_name,
        team: newPlayer.team,
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
      };
      updatePost(updated);
      setSwappingPostId(null);
      await generatePost(updated);
    } else {
      setSwappingPostId(null);
      toast({ title: "Swap failed", description: fnError?.message ?? "Unknown error", variant: "destructive" });
    }
  }, [availablePlayers, updatePost, generatePost, toast]);

  const postsByDay = DAY_ORDER.reduce<Record<string, WeeklyContentPost[]>>((acc, day) => {
    acc[day] = posts.filter(p => p.day_key === day);
    return acc;
  }, {});

  const totalReady = posts.filter(p => p.status === "ready").length;
  const totalPosts = posts.length;

  return (
    <div className="space-y-5">
      {/* Today's Top 3 */}
      <TodayTopPostsSection />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Weekly Content Plan</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {planLoading
              ? "Building plan…"
              : planId
              ? `${weekKey} · ${totalReady}/${totalPosts} posts ready`
              : "No plan loaded"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => fetchPlan(true)}
            disabled={planLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background rounded-md text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${planLoading ? "animate-spin" : ""}`} />
            {planLoading ? "Building…" : "Rebuild Week"}
          </button>
          {totalPosts > 0 && totalReady < totalPosts && (
            <button
              onClick={() => {
                const pending = posts.filter(p => p.status === "pending" || p.status === "error");
                pending.forEach((p, i) => {
                  setTimeout(() => generatePost(p), i * 800);
                });
              }}
              disabled={planLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-xs font-medium hover:bg-accent transition-colors disabled:opacity-40"
            >
              <Zap className="h-3.5 w-3.5" />
              Generate All ({totalPosts - totalReady} pending)
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {planError && (
        <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">Failed to load plan</p>
            <p className="text-xs text-destructive/80 mt-0.5 break-all">{planError}</p>
          </div>
          <button
            onClick={() => fetchPlan(true)}
            disabled={planLoading}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border border-destructive/40 text-destructive text-xs rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${planLoading ? "animate-spin" : ""}`} />
            {planLoading ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {/* Plan Loading Skeleton */}
      {planLoading && (
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg border border-border animate-pulse bg-muted/20" />
          ))}
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Building plan structure…
          </div>
        </div>
      )}

      {/* Day Rows */}
      {!planLoading && planId && (
        <div className="space-y-2">
          {DAY_ORDER.map(dayKey => {
            const dayPosts = postsByDay[dayKey] ?? [];
            if (dayPosts.length === 0) return null;
            return (
              <DayRow
                key={dayKey}
                dayKey={dayKey}
                posts={dayPosts}
                selectedPostId={selectedPostId}
                onSelectPost={post => setSelectedPostId(post?.id ?? null)}
                onGeneratePost={generatePost}
                onRegenPost={regenPost}
                generatingPostId={generatingPostId}
                onToggleLock={handleToggleLock}
                onDuplicate={handleDuplicate}
                onSwapPlayer={handleSwapPlayer}
                swappingPostId={swappingPostId}
                availablePlayers={availablePlayers}
              />
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!planLoading && !planId && !planError && (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium mb-1">No plan generated yet</p>
          <p className="text-xs text-muted-foreground mb-4">Build this week's plan instantly — no AI wait time</p>
          <button
            onClick={() => fetchPlan(true)}
            className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity mx-auto"
          >
            <Zap className="h-4 w-4" />
            Build This Week's Plan
          </button>
        </div>
      )}
    </div>
  );
}
