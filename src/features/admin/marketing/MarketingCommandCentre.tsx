/**
 * Marketing Command Centre
 * Turns live Content Intel stat angles into usable social media posts.
 * Admin-only. No odds. No betting tips. No bookmaker data.
 * All post ideas are derived from live Neeko stat data.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Copy, Check, ChevronDown, ChevronUp, RefreshCw, TriangleAlert as AlertTriangle, Shield, Instagram, MessageCircle, Twitter, Facebook, Video, Globe, Search, X, TrendingUp, FileText, Zap, CircleCheck as CheckCircle2, Clock, SkipForward, Archive, Filter } from "lucide-react";

// ─── Safety guard ─────────────────────────────────────────────────────────────

const FORBIDDEN_TERMS = [
  "bet", "betting", "odds", "multi", "lock", "value bet", "tip", "wager",
  "gamble", "sportsbet", "tab", "ladbrokes", "pointsbet", "betfair",
  "neds", "bluebet", "unibet",
];

function detectForbiddenTerms(text: string): string[] {
  const lower = text.toLowerCase();
  return FORBIDDEN_TERMS.filter(term => {
    const regex = new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\b`, "i");
    return regex.test(lower);
  });
}

function hasForbiddenContent(post: MarketingPost): string[] {
  const allText = [
    post.title, post.hook, post.caption, post.cta,
    ...(post.stat_bullets ?? []),
    ...(post.hashtags ?? []),
  ].join(" ");
  return detectForbiddenTerms(allText);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = "all" | "tiktok" | "instagram" | "reddit" | "twitter" | "facebook";
type StatFamily = "all" | "disposals" | "goals" | "tackles" | "marks" | "fantasy" | "general";
type Quality = "all" | "high" | "medium";
type PostStatus = "all" | "not_checked" | "needs_edit" | "approved" | "posted" | "skipped" | "archived";

interface MarketingPost {
  id: string;
  round_number: number;
  platform: string;
  stat_family: string;
  title: string;
  hook: string;
  caption: string;
  stat_bullets: string[];
  cta: string;
  hashtags: string[];
  quality: string;
  status: string;
  source_type: string;
  source_payload: Record<string, unknown> | null;
  player_ids: number[];
  team_names: string[];
  angle_tag: string;
  private_note: string;
  created_at: string;
  updated_at: string;
  // Derived: platform variants (generated client-side from base copy)
  variants?: PlatformVariants;
  // Derived: safety
  forbiddenTerms?: string[];
}

interface PlatformVariants {
  tiktok: string;
  instagram: string;
  reddit: string;
  twitter: string;
  facebook: string;
}

// Content Intel source shape (from afl.v_content_opportunities)
interface ContentOpportunity {
  player_id: number;
  player_name: string;
  team: string;
  position_group: string | null;
  projection_final: number | null;
  value_score: number | null;
  form_score: number | null;
  captain_score: number | null;
  signal: string | null;
  summary_short: string | null;
  summary_long: string | null;
  market_watch_category: string | null;
  price_change: number | null;
  category: string | null;
  signal_reason: string | null;
}

// ─── Post generation from Content Intel ──────────────────────────────────────

function buildStatBullets(opp: ContentOpportunity): string[] {
  const bullets: string[] = [];
  if (opp.projection_final != null)
    bullets.push(`Projected ${Math.round(opp.projection_final)} fantasy points this round`);
  if (opp.form_score != null && opp.form_score > 0)
    bullets.push(`Form score ${opp.form_score.toFixed(1)} — trending ${opp.form_score > 5 ? "up" : "neutral"}`);
  if (opp.value_score != null)
    bullets.push(`Value score ${opp.value_score.toFixed(1)} vs current price`);
  if (opp.signal_reason)
    bullets.push(opp.signal_reason);
  if (opp.market_watch_category)
    bullets.push(`Market Watch category: ${opp.market_watch_category}`);
  return bullets.filter(Boolean).slice(0, 4);
}

function buildHook(opp: ContentOpportunity, statFamily: string): string {
  const name = opp.player_name;
  const team = opp.team;
  if (statFamily === "goals")
    return `${name} (${team}) — goal scoring trend worth tracking this round`;
  if (statFamily === "disposals")
    return `${name} (${team}) — disposal profile trending well heading into Round ${opp.player_id > 0 ? "?" : "?"}`;
  if (opp.signal?.toLowerCase().includes("start"))
    return `${name} (${team}) — strong start candidate based on current form`;
  if (opp.market_watch_category === "buy_before_rise")
    return `${name} (${team}) — price efficiency angle this week`;
  return `${name} (${team}) — stat angle worth tracking this round`;
}

function buildCaption(opp: ContentOpportunity): string {
  const base = opp.summary_short
    ? opp.summary_short
    : `${opp.player_name} is trending this round with ${opp.signal ?? "a positive signal"} based on recent form data.`;
  return base.replace(/\b(bet|odds|tip|wager|multi|lock)\b/gi, "").trim();
}

function buildCTA(): string {
  return "Full stat breakdown available on Neeko Sports Stats.";
}

function buildHashtags(opp: ContentOpportunity, platform: string): string[] {
  const base = ["#AFLFantasy", "#AFL2026", "#FantasyAFL", `#${opp.team.replace(/\s+/g, "")}`];
  if (platform === "tiktok") return [...base, "#AFLTikTok", "#FantasyFootball"];
  if (platform === "instagram") return [...base, "#AFLStats", "#FantasyFootball", "#NeekoSports"];
  if (platform === "twitter") return base.slice(0, 3);
  return base;
}

function buildPlatformVariants(post: MarketingPost): PlatformVariants {
  const bullets = post.stat_bullets.map(b => `• ${b}`).join("\n");

  return {
    tiktok:
      `${post.hook}\n\n${bullets}\n\n${post.cta}`,
    instagram:
      `${post.hook}\n\n${post.caption}\n\n${bullets}\n\n${post.cta}\n\n${post.hashtags.join(" ")}`,
    reddit:
      `**${post.title}**\n\n${post.caption}\n\n${bullets}\n\n${post.cta}\n\n*Stats sourced from Neeko Sports Stats — no odds, no tips, just data.*`,
    twitter:
      `${post.hook} ${post.hashtags.slice(0, 2).join(" ")}`,
    facebook:
      `${post.hook}\n\n${post.caption}\n\n${bullets}\n\n${post.cta}`,
  };
}

function deriveQuality(opp: ContentOpportunity): "high" | "medium" {
  if (
    opp.projection_final != null && opp.projection_final > 90 &&
    opp.form_score != null && opp.form_score > 5
  ) return "high";
  if (opp.signal?.toLowerCase().includes("strong")) return "high";
  if (opp.value_score != null && opp.value_score > 15) return "high";
  return "medium";
}

function deriveStatFamily(opp: ContentOpportunity): string {
  const cat = (opp.category ?? "").toLowerCase();
  if (cat.includes("goal")) return "goals";
  if (cat.includes("disposal")) return "disposals";
  if (cat.includes("tackle")) return "tackles";
  if (cat.includes("mark")) return "marks";
  if (cat.includes("fantasy")) return "fantasy";
  return "general";
}

function contentOpportunityToPost(opp: ContentOpportunity, round: number): Omit<MarketingPost, "id" | "created_at" | "updated_at"> {
  const platform = "all";
  const statFamily = deriveStatFamily(opp);
  const bullets = buildStatBullets(opp);
  const hook = buildHook(opp, statFamily);
  const caption = buildCaption(opp);
  const cta = buildCTA();
  const hashtags = buildHashtags(opp, platform);
  const quality = deriveQuality(opp);

  return {
    round_number: round,
    platform,
    stat_family: statFamily,
    title: `${opp.player_name} — ${opp.signal ?? "stat angle"} (R${round})`,
    hook,
    caption,
    stat_bullets: bullets,
    cta,
    hashtags,
    quality,
    status: "not_checked",
    source_type: "content_intel",
    source_payload: opp as unknown as Record<string, unknown>,
    player_ids: [opp.player_id],
    team_names: [opp.team],
    angle_tag: statFamily,
    private_note: "",
  };
}

// ─── UI constants ─────────────────────────────────────────────────────────────

const PLATFORM_META: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  all:       { label: "All Platforms", icon: Globe,          cls: "bg-zinc-800 text-zinc-300 border-zinc-600" },
  tiktok:    { label: "TikTok",        icon: Video,          cls: "bg-rose-950/60 text-rose-300 border-rose-600/40" },
  instagram: { label: "Instagram",     icon: Instagram,      cls: "bg-pink-950/60 text-pink-300 border-pink-600/40" },
  reddit:    { label: "Reddit",        icon: MessageCircle,  cls: "bg-orange-950/60 text-orange-300 border-orange-600/40" },
  twitter:   { label: "X / Twitter",  icon: Twitter,        cls: "bg-sky-950/60 text-sky-300 border-sky-600/40" },
  facebook:  { label: "Facebook",      icon: Facebook,       cls: "bg-blue-950/60 text-blue-300 border-blue-600/40" },
};

const STATUS_META: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  not_checked: { label: "Not checked", icon: Clock,         cls: "bg-zinc-800 text-zinc-400 border-zinc-600" },
  needs_edit:  { label: "Needs edit",  icon: AlertTriangle, cls: "bg-amber-950/60 text-amber-300 border-amber-600/40" },
  approved:    { label: "Approved",    icon: CheckCircle2,  cls: "bg-emerald-950/60 text-emerald-300 border-emerald-600/40" },
  posted:      { label: "Posted",      icon: Zap,           cls: "bg-sky-950/60 text-sky-300 border-sky-600/40" },
  skipped:     { label: "Skipped",     icon: SkipForward,   cls: "bg-zinc-900 text-zinc-500 border-zinc-700" },
  archived:    { label: "Archived",    icon: Archive,       cls: "bg-zinc-900 text-zinc-600 border-zinc-700" },
};

const QUALITY_META: Record<string, { label: string; cls: string }> = {
  high:   { label: "High",   cls: "bg-emerald-950/60 text-emerald-300 border-emerald-600/40" },
  medium: { label: "Medium", cls: "bg-zinc-800 text-zinc-300 border-zinc-600" },
};

const PLATFORM_TABS: Platform[] = ["all", "tiktok", "instagram", "reddit", "twitter", "facebook"];
const STAT_FAMILIES: { key: StatFamily; label: string }[] = [
  { key: "all", label: "All Stats" },
  { key: "disposals", label: "Disposals" },
  { key: "goals", label: "Goals" },
  { key: "tackles", label: "Tackles" },
  { key: "marks", label: "Marks" },
  { key: "fantasy", label: "Fantasy" },
  { key: "general", label: "General" },
];

// ─── Copy helpers ─────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy", size = "sm" }: { text: string; label?: string; size?: "xs" | "sm" }) {
  const [copied, setCopied] = useState(false);
  function doCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  const cls = size === "xs"
    ? "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium border transition-colors"
    : "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium border transition-colors";
  return (
    <button
      onClick={doCopy}
      className={`${cls} ${copied ? "bg-emerald-950/60 text-emerald-300 border-emerald-600/40" : "bg-zinc-800/60 text-zinc-300 border-zinc-700 hover:bg-zinc-700/60 hover:text-white"}`}
    >
      {copied ? <Check size={size === "xs" ? 9 : 11} /> : <Copy size={size === "xs" ? 9 : 11} />}
      {copied ? "Copied" : label}
    </button>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────

function PostCard({
  post,
  onStatusChange,
}: {
  post: MarketingPost;
  onStatusChange: (id: string, status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activePlatform, setActivePlatform] = useState<keyof PlatformVariants>("instagram");
  const [saving, setSaving] = useState(false);

  const statusMeta = STATUS_META[post.status] ?? STATUS_META.not_checked;
  const StatusIcon = statusMeta.icon;
  const qualityMeta = QUALITY_META[post.quality] ?? QUALITY_META.medium;
  const platformMeta = PLATFORM_META[post.platform] ?? PLATFORM_META.all;
  const PlatformIcon = platformMeta.icon;

  const forbidden = post.forbiddenTerms ?? [];
  const hasForbidden = forbidden.length > 0;

  async function handleStatusChange(newStatus: string) {
    setSaving(true);
    onStatusChange(post.id, newStatus);
    setSaving(false);
  }

  const variants = post.variants ?? buildPlatformVariants(post);
  const activeVariant = variants[activePlatform] ?? "";
  const bullets = post.stat_bullets ?? [];

  return (
    <div className={`rounded-lg border transition-colors ${hasForbidden ? "border-red-500/40 bg-red-950/10" : "border-white/[0.06] bg-white/[0.015]"}`}>
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            {/* Platform badge */}
            <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${platformMeta.cls}`}>
              <PlatformIcon size={9} />
              {platformMeta.label}
            </span>
            {/* Quality badge */}
            <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${qualityMeta.cls}`}>
              {qualityMeta.label}
            </span>
            {/* Stat family */}
            <span className="inline-block rounded border border-zinc-700 bg-zinc-800/50 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {post.stat_family}
            </span>
            {/* Round */}
            <span className="text-[10px] text-zinc-600">R{post.round_number}</span>
            {/* Forbidden warning */}
            {hasForbidden && (
              <span className="inline-flex items-center gap-1 rounded border border-red-500/50 bg-red-950/40 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
                <AlertTriangle size={9} />
                Unsafe language
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-white/85 leading-snug truncate">{post.title}</p>
          {!expanded && (
            <p className="text-[11px] text-white/40 mt-0.5 line-clamp-1">{post.hook}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {/* Status dropdown */}
          <div className="relative">
            <select
              value={post.status}
              onChange={e => handleStatusChange(e.target.value)}
              disabled={saving}
              className={`appearance-none rounded border px-2 py-1 text-[10px] font-medium cursor-pointer transition-colors pr-5 ${statusMeta.cls} disabled:opacity-60`}
              style={{ backgroundImage: "none" }}
            >
              {Object.entries(STATUS_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <StatusIcon size={8} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(e => !e)}
            className="rounded border border-zinc-700 bg-zinc-800/50 p-1 text-zinc-400 hover:text-white transition-colors"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/[0.05] px-4 py-4 space-y-4">

          {/* Safety warning */}
          {hasForbidden && (
            <div className="rounded-lg border border-red-500/40 bg-red-950/20 px-3 py-2.5 flex items-start gap-2">
              <Shield size={14} className="text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-red-300">Unsafe marketing language detected — revise before posting.</p>
                <p className="text-[10px] text-red-400/70 mt-0.5">Flagged: {forbidden.join(", ")}</p>
              </div>
            </div>
          )}

          {/* Copy sections */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* Hook */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Hook</span>
                <CopyButton text={post.hook} label="Copy hook" size="xs" />
              </div>
              <p className="text-xs text-white/70 bg-zinc-900/50 rounded p-2 border border-zinc-800">{post.hook}</p>
            </div>

            {/* Caption */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Caption</span>
                <CopyButton text={post.caption} label="Copy caption" size="xs" />
              </div>
              <p className="text-xs text-white/70 bg-zinc-900/50 rounded p-2 border border-zinc-800 leading-relaxed">{post.caption}</p>
            </div>
          </div>

          {/* Stat bullets */}
          {bullets.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Stat Bullets</span>
                <CopyButton text={bullets.map(b => `• ${b}`).join("\n")} label="Copy bullets" size="xs" />
              </div>
              <ul className="space-y-1">
                {bullets.map((b, i) => (
                  <li key={i} className="text-xs text-white/65 flex items-start gap-1.5">
                    <span className="text-zinc-600 mt-0.5">•</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* CTA */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">CTA</span>
                <CopyButton text={post.cta} label="Copy CTA" size="xs" />
              </div>
              <p className="text-xs text-white/60 bg-zinc-900/50 rounded p-2 border border-zinc-800">{post.cta}</p>
            </div>

            {/* Hashtags */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Hashtags</span>
                <CopyButton text={post.hashtags.join(" ")} label="Copy tags" size="xs" />
              </div>
              <div className="flex flex-wrap gap-1">
                {post.hashtags.map((h, i) => (
                  <span key={i} className="text-[10px] rounded border border-zinc-700 bg-zinc-800/50 px-1.5 py-0.5 text-zinc-400">{h}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Platform-specific copy */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Platform Copy</span>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {(Object.keys(variants) as (keyof PlatformVariants)[]).map(p => {
                const meta = PLATFORM_META[p];
                const Icon = meta.icon;
                return (
                  <button
                    key={p}
                    onClick={() => setActivePlatform(p)}
                    className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium transition-colors ${activePlatform === p ? meta.cls : "border-zinc-700 bg-zinc-800/40 text-zinc-500 hover:text-zinc-300"}`}
                  >
                    <Icon size={9} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <pre className="whitespace-pre-wrap text-[11px] text-white/65 bg-zinc-900/60 rounded p-3 border border-zinc-800 leading-relaxed font-sans">
                {activeVariant}
              </pre>
              <div className="absolute top-2 right-2">
                <CopyButton text={activeVariant} label="Copy full post" size="xs" />
              </div>
            </div>
          </div>

          {/* Teams / Players info */}
          {post.team_names.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-600">
              <span>Teams:</span>
              {post.team_names.map((t, i) => (
                <span key={i} className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-zinc-500">{t}</span>
              ))}
              {post.player_ids.length > 0 && <span className="text-zinc-700">· {post.player_ids.length} player(s)</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({ posts }: { posts: MarketingPost[] }) {
  const total     = posts.length;
  const high      = posts.filter(p => p.quality === "high").length;
  const needsEdit = posts.filter(p => p.status === "needs_edit").length;
  const approved  = posts.filter(p => p.status === "approved").length;
  const posted    = posts.filter(p => p.status === "posted").length;
  const unsafe    = posts.filter(p => (p.forbiddenTerms?.length ?? 0) > 0).length;

  const cards = [
    { label: "Total Ideas",    value: total,     cls: "text-white/80" },
    { label: "High Quality",   value: high,      cls: "text-emerald-400" },
    { label: "Needs Review",   value: needsEdit, cls: "text-amber-400" },
    { label: "Approved",       value: approved,  cls: "text-sky-400" },
    { label: "Posted",         value: posted,    cls: "text-zinc-400" },
    { label: "Unsafe Language",value: unsafe,    cls: unsafe > 0 ? "text-red-400 font-bold" : "text-zinc-600" },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
      {cards.map(({ label, value, cls }) => (
        <div key={label} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 text-center">
          <p className={`text-lg font-bold tabular-nums leading-none ${cls}`}>{value}</p>
          <p className="text-[10px] text-zinc-600 mt-1 leading-tight">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MarketingCommandCentre() {
  const [posts, setPosts] = useState<MarketingPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentRound, setCurrentRound] = useState<number | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  // Filters
  const [platformFilter, setPlatformFilter] = useState<Platform>("all");
  const [statFamilyFilter, setStatFamilyFilter] = useState<StatFamily>("all");
  const [qualityFilter, setQualityFilter] = useState<Quality>("all");
  const [statusFilter, setStatusFilter] = useState<PostStatus>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Get current round
      const { data: roundData } = await supabase.rpc("get_latest_completed_round");
      const round = typeof roundData === "number" ? roundData + 1 : 1;
      setCurrentRound(round);

      // 2. Load saved workflow posts for this round from DB
      const { data: savedRows, error: savedErr } = await supabase
        .from("admin_marketing_post_workflow" as any)
        .select("*")
        .gte("round_number", round - 1)
        .order("created_at", { ascending: false })
        .limit(200);

      // Use saved posts if they exist, fallback schema name
      let dbPosts: MarketingPost[] = [];
      if (!savedErr && savedRows && (savedRows as any[]).length > 0) {
        dbPosts = (savedRows as any[]).map(r => ({
          ...r,
          stat_bullets: Array.isArray(r.stat_bullets) ? r.stat_bullets : [],
          hashtags: Array.isArray(r.hashtags) ? r.hashtags : [],
          player_ids: Array.isArray(r.player_ids) ? r.player_ids : [],
          team_names: Array.isArray(r.team_names) ? r.team_names : [],
        }));
      }

      // 3. Always load fresh from Content Intel (v_content_opportunities)
      const { data: oppData, error: oppErr } = await supabase
        .schema("afl" as any)
        .from("v_content_opportunities")
        .select("*")
        .order("cat_rank", { ascending: true })
        .limit(80);

      let generatedPosts: MarketingPost[] = [];
      if (!oppErr && oppData && (oppData as any[]).length > 0) {
        generatedPosts = (oppData as ContentOpportunity[]).map(opp => {
          const base = contentOpportunityToPost(opp, round);
          const id = `gen-${opp.player_id}-${round}`;
          // Don't add if already in DB
          const alreadySaved = dbPosts.some(p =>
            p.player_ids.includes(opp.player_id) && p.round_number === round
          );
          if (alreadySaved) return null;
          return {
            ...base,
            id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as MarketingPost;
        }).filter((p): p is MarketingPost => p !== null);
      }

      // 4. Merge: DB posts first, then generated
      const merged = [...dbPosts, ...generatedPosts];

      // 5. Attach platform variants + safety scan
      const enriched = merged.map(p => ({
        ...p,
        variants: buildPlatformVariants(p),
        forbiddenTerms: hasForbiddenContent(p),
      }));

      setPosts(enriched);
      setLoadedAt(new Date());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleStatusChange(id: string, newStatus: string) {
    // Optimistic update
    setPosts(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));

    // Only persist if it's a real UUID (not a generated ID)
    if (!id.startsWith("gen-")) {
      await supabase.rpc("update_marketing_post_status", {
        p_id: id,
        p_status: newStatus,
      });
    }
  }

  // Distinct teams for team filter
  const allTeams = useMemo(() => {
    const teams = new Set<string>();
    posts.forEach(p => p.team_names.forEach(t => teams.add(t)));
    return Array.from(teams).sort();
  }, [posts]);

  // Filtered posts
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return posts.filter(p => {
      if (platformFilter !== "all" && p.platform !== "all" && p.platform !== platformFilter) return false;
      if (statFamilyFilter !== "all" && p.stat_family !== statFamilyFilter) return false;
      if (qualityFilter !== "all" && p.quality !== qualityFilter) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (teamFilter !== "all" && !p.team_names.includes(teamFilter)) return false;
      if (term && !p.title.toLowerCase().includes(term) && !p.hook.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [posts, platformFilter, statFamilyFilter, qualityFilter, statusFilter, teamFilter, search]);

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Marketing Command Centre</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Turn live stat angles into social posts. No odds. No betting tips. Admin only.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {currentRound != null && (
              <span className="text-[10px] rounded border border-zinc-700 bg-zinc-800/50 px-2 py-1 text-zinc-400">
                Round {currentRound}
              </span>
            )}
            {loadedAt && (
              <span className="text-[10px] text-zinc-600">
                Loaded {loadedAt.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800/50 px-2.5 py-1 text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-40"
            >
              <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && <SummaryCards posts={posts} />}

      {/* Platform tabs */}
      <div className="overflow-x-auto touch-pan-x mb-3" style={{ scrollbarWidth: "none" }}>
        <div className="flex gap-1 pb-0.5 w-max min-w-full">
          {PLATFORM_TABS.map(p => {
            const meta = PLATFORM_META[p];
            const Icon = meta.icon;
            const active = platformFilter === p;
            return (
              <button
                key={p}
                onClick={() => setPlatformFilter(p)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap rounded-md transition-colors min-h-[36px] ${active ? "bg-zinc-200 text-zinc-900" : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"}`}
              >
                <Icon size={11} />
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
          <input
            type="text"
            placeholder="Search posts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 w-full rounded border border-zinc-700 bg-zinc-800/50 pl-7 pr-7 text-xs text-white placeholder-zinc-600 outline-none focus:border-zinc-500"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
              <X size={11} />
            </button>
          )}
        </div>

        {/* Toggle filters */}
        <button
          onClick={() => setShowFilters(f => !f)}
          className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs transition-colors ${showFilters ? "border-zinc-500 bg-zinc-700 text-white" : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:text-white"}`}
        >
          <Filter size={11} />
          Filters
        </button>

        {/* Active filter count badge */}
        {(statFamilyFilter !== "all" || qualityFilter !== "all" || statusFilter !== "all" || teamFilter !== "all") && (
          <span className="text-[10px] rounded-full bg-zinc-600 text-white px-2 py-0.5">
            {[statFamilyFilter !== "all", qualityFilter !== "all", statusFilter !== "all", teamFilter !== "all"].filter(Boolean).length} active
          </span>
        )}
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 p-3 rounded-lg border border-zinc-800 bg-zinc-900/40">
          {/* Stat family */}
          <div>
            <label className="block text-[10px] text-zinc-600 mb-1 uppercase tracking-wider">Stat Family</label>
            <select
              value={statFamilyFilter}
              onChange={e => setStatFamilyFilter(e.target.value as StatFamily)}
              className="w-full rounded border border-zinc-700 bg-zinc-800/70 px-2 py-1.5 text-xs text-zinc-300 outline-none"
            >
              {STAT_FAMILIES.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          {/* Quality */}
          <div>
            <label className="block text-[10px] text-zinc-600 mb-1 uppercase tracking-wider">Quality</label>
            <select
              value={qualityFilter}
              onChange={e => setQualityFilter(e.target.value as Quality)}
              className="w-full rounded border border-zinc-700 bg-zinc-800/70 px-2 py-1.5 text-xs text-zinc-300 outline-none"
            >
              <option value="all">All Quality</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
            </select>
          </div>
          {/* Status */}
          <div>
            <label className="block text-[10px] text-zinc-600 mb-1 uppercase tracking-wider">Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as PostStatus)}
              className="w-full rounded border border-zinc-700 bg-zinc-800/70 px-2 py-1.5 text-xs text-zinc-300 outline-none"
            >
              <option value="all">All Status</option>
              {Object.entries(STATUS_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          {/* Team */}
          <div>
            <label className="block text-[10px] text-zinc-600 mb-1 uppercase tracking-wider">Team</label>
            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-800/70 px-2 py-1.5 text-xs text-zinc-300 outline-none"
            >
              <option value="all">All Teams</option>
              {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Results count */}
      {!loading && (
        <p className="text-[10px] text-zinc-600 mb-3">
          {filtered.length} post idea{filtered.length !== 1 ? "s" : ""}
          {filtered.length !== posts.length ? ` (filtered from ${posts.length})` : ""}
        </p>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg border border-zinc-800 bg-zinc-900/40 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-4 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-300">Failed to load post ideas</p>
            <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
            <button onClick={loadData} className="text-xs text-red-300 underline mt-1">Retry</button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/20 px-6 py-12 text-center">
          <FileText size={24} className="text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">No post ideas match the current filters.</p>
          <p className="text-xs text-zinc-700 mt-1">
            {posts.length === 0
              ? "Load Content Intel data first — post ideas are generated from live stat angles."
              : "Try clearing filters or refreshing the data."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}

      {/* Safety notice footer */}
      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-3 flex items-start gap-2">
        <Shield size={12} className="text-zinc-600 mt-0.5 shrink-0" />
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          All post ideas are generated from live Neeko stat data only.
          No odds, no bookmaker references, no betting language.
          Posts flagged with "Unsafe language" must be revised before posting.
          This page is admin-only and does not affect any public-facing content.
        </p>
      </div>
    </div>
  );
}
