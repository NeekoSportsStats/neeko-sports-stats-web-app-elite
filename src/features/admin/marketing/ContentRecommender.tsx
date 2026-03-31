import { useMemo } from "react";
import { TrendingUp, Zap, FlaskConical, ArrowRight, User, Tag, MonitorPlay, FileText, Image as ImageIcon, Video, Pencil, CircleAlert as AlertCircle, ChevronRight } from "lucide-react";
import {
  type LibraryItem,
  type LibraryPlatform,
  type LibraryItemType,
  loadLibrary,
  computeScore,
} from "./lib/library";

declare global {
  interface Window {
    selectedMarketingRecommendation?: Recommendation;
  }
}

const PLATFORM_LABELS: Record<LibraryPlatform, string> = {
  tiktok:    "TikTok",
  instagram: "Instagram",
  reddit:    "Reddit",
  x:         "X",
};

const TYPE_LABELS: Record<LibraryItemType, string> = {
  script: "Script",
  image:  "Image",
  video:  "Video",
  draft:  "Draft",
};

const TYPE_ICONS: Record<LibraryItemType, React.ElementType> = {
  script: FileText,
  image:  ImageIcon,
  video:  Video,
  draft:  Pencil,
};

interface Recommendation {
  platform:   LibraryPlatform | null;
  type:       LibraryItemType;
  player:     string | null;
  angle:      string | null;
  reason:     string;
  confidence: "High" | "Medium" | "Low";
  sampleSize: number;
  label:      string;
  variant:    "safe" | "aggressive" | "experimental";
}

function avgOf(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function topEntry<T extends string>(
  map: Record<string, number[]>
): { key: T; avg: number; count: number } | null {
  const entries = Object.entries(map)
    .map(([k, v]) => ({ key: k as T, avg: avgOf(v), count: v.length }))
    .sort((a, b) => b.avg - a.avg);
  return entries[0] ?? null;
}

function confidence(count: number): "High" | "Medium" | "Low" {
  if (count >= 10) return "High";
  if (count >= 5)  return "Medium";
  return "Low";
}

function buildRecommendations(
  posted: (LibraryItem & { _score: number })[]
): Recommendation[] {
  if (posted.length === 0) return [];

  const byPlatform: Record<string, number[]> = {};
  const byType:     Record<string, number[]> = {};
  const byPlayer:   Record<string, number[]> = {};
  const byTag:      Record<string, number[]> = {};

  for (const item of posted) {
    if (item.platform) {
      byPlatform[item.platform] = [...(byPlatform[item.platform] ?? []), item._score];
    }
    byType[item.type] = [...(byType[item.type] ?? []), item._score];
    if (item.player) {
      byPlayer[item.player] = [...(byPlayer[item.player] ?? []), item._score];
    }
    for (const tag of item.tags.filter((t) => !["high-performer", "needs-rework"].includes(t))) {
      byTag[tag] = [...(byTag[tag] ?? []), item._score];
    }
  }

  const topPlatform = topEntry<LibraryPlatform>(byPlatform);
  const topType     = topEntry<LibraryItemType>(byType);
  const topPlayer   = topEntry<string>(byPlayer);
  const topTag      = topEntry<string>(byTag);

  const sortedTypes    = Object.entries(byType)
    .map(([k, v]) => ({ key: k as LibraryItemType, avg: avgOf(v), count: v.length }))
    .sort((a, b) => b.avg - a.avg);
  const sortedTags     = Object.entries(byTag)
    .map(([k, v]) => ({ key: k, avg: avgOf(v), count: v.length }))
    .sort((a, b) => b.avg - a.avg);
  const sortedPlatforms = Object.entries(byPlatform)
    .map(([k, v]) => ({ key: k as LibraryPlatform, avg: avgOf(v), count: v.length }))
    .sort((a, b) => b.avg - a.avg);
  const sortedPlayers  = Object.entries(byPlayer)
    .map(([k, v]) => ({ key: k, avg: avgOf(v), count: v.length }))
    .sort((a, b) => b.avg - a.avg);

  const recs: Recommendation[] = [];

  const safePlatform = topPlatform?.key ?? null;
  const safeType     = topType?.key ?? "script";
  const safePlayer   = topPlayer?.key ?? null;
  const safeTag      = topTag?.key ?? null;
  const safeSample   = Math.min(
    topPlatform?.count ?? 0,
    topType?.count ?? 0,
    topTag?.count ?? 1
  );
  const safeReason = [
    safeType && `${TYPE_LABELS[safeType]} content`,
    safeTag  && `"${safeTag}" angle`,
    safePlatform && `on ${PLATFORM_LABELS[safePlatform]}`,
    "are your highest performing combination",
  ]
    .filter(Boolean)
    .join(" ");

  recs.push({
    platform:   safePlatform,
    type:       safeType,
    player:     safePlayer,
    angle:      safeTag,
    reason:     safeReason,
    confidence: confidence(safeSample),
    sampleSize: safeSample,
    label:      "Post This Next",
    variant:    "safe",
  });

  const aggType     = sortedTypes.find((t) => t.count >= 2 && t.key !== safeType)?.key ?? safeType;
  const aggTag      = sortedTags.find((t) => t.count >= 2 && t.key !== safeTag)?.key ?? safeTag;
  const aggPlayer   = sortedPlayers.find((p) => p.key !== safePlayer)?.key ?? safePlayer;
  const aggPlatform = sortedPlatforms.find((p) => p.key !== safePlatform)?.key ?? safePlatform;
  const aggSample   = Math.min(
    (aggType === safeType ? topType?.count : byType[aggType ?? ""]?.length) ?? 1,
    (aggTag  === safeTag  ? topTag?.count  : byTag[aggTag   ?? ""]?.length) ?? 1
  );

  recs.push({
    platform:   aggPlatform,
    type:       aggType,
    player:     aggPlayer,
    angle:      aggTag,
    reason: [
      aggTag  && `"${aggTag}" angles`,
      aggType && `in ${TYPE_LABELS[aggType]} format`,
      aggPlatform && `on ${PLATFORM_LABELS[aggPlatform]}`,
      "show strong upside — push them harder",
    ]
      .filter(Boolean)
      .join(" "),
    confidence: confidence(aggSample),
    sampleSize: aggSample,
    label:      "Aggressive Play",
    variant:    "aggressive",
  });

  const usedTypes    = new Set([safeType, aggType]);
  const unusedType   = sortedTypes.find((t) => !usedTypes.has(t.key))?.key
    ?? (["video", "image", "script", "draft"] as LibraryItemType[]).find((t) => !usedTypes.has(t))
    ?? safeType;
  const unusedTag    = sortedTags.find((t) => !["buy","sell","breakout","trap"].includes(t.key))?.key ?? null;
  const expPlatform  = sortedPlatforms.find((p) => p.key !== safePlatform && p.key !== aggPlatform)?.key ?? safePlatform;

  recs.push({
    platform:   expPlatform,
    type:       unusedType,
    player:     safePlayer,
    angle:      unusedTag,
    reason: [
      unusedType && `Try ${TYPE_LABELS[unusedType]} format`,
      unusedTag  && `with a "${unusedTag}" angle`,
      expPlatform && `on ${PLATFORM_LABELS[expPlatform]}`,
      "— an under-tested combination worth exploring",
    ]
      .filter(Boolean)
      .join(" "),
    confidence: "Low",
    sampleSize: 0,
    label:      "Experiment",
    variant:    "experimental",
  });

  return recs;
}

const CONFIDENCE_COLORS = {
  High:   "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
  Medium: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
  Low:    "text-muted-foreground bg-muted/40 border-border",
};

const VARIANT_ACCENTS = {
  safe:         "border-sky-400/40 bg-sky-50/30 dark:bg-sky-950/20",
  aggressive:   "border-orange-400/40 bg-orange-50/30 dark:bg-orange-950/20",
  experimental: "border-border",
};

const VARIANT_ICONS = {
  safe:         TrendingUp,
  aggressive:   Zap,
  experimental: FlaskConical,
};

const VARIANT_LABEL_COLORS = {
  safe:         "text-sky-600 dark:text-sky-400",
  aggressive:   "text-orange-600 dark:text-orange-400",
  experimental: "text-muted-foreground",
};

interface RecommendationCardProps {
  rec: Recommendation;
  primary?: boolean;
  onSendTo: (tool: "content-engine" | "video" | "editor", rec: Recommendation) => void;
}

function RecommendationCard({ rec, primary, onSendTo }: RecommendationCardProps) {
  const Icon     = VARIANT_ICONS[rec.variant];
  const TypeIcon = TYPE_ICONS[rec.type] ?? FileText;

  return (
    <div className={`border rounded-lg p-4 space-y-4 ${VARIANT_ACCENTS[rec.variant]} ${primary ? "ring-1 ring-sky-300 dark:ring-sky-700" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 shrink-0 ${VARIANT_LABEL_COLORS[rec.variant]}`} />
          <p className={`text-xs font-semibold uppercase tracking-wide ${VARIANT_LABEL_COLORS[rec.variant]}`}>
            {rec.label}
          </p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${CONFIDENCE_COLORS[rec.confidence]}`}>
          {rec.confidence} confidence
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {rec.platform && (
          <div className="flex items-center gap-1.5">
            <MonitorPlay className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Platform</p>
              <p className="text-xs font-semibold">{PLATFORM_LABELS[rec.platform]}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <TypeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-[10px] text-muted-foreground">Format</p>
            <p className="text-xs font-semibold">{TYPE_LABELS[rec.type]}</p>
          </div>
        </div>
        {rec.player && (
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Player</p>
              <p className="text-xs font-semibold truncate max-w-[120px]">{rec.player}</p>
            </div>
          </div>
        )}
        {rec.angle && (
          <div className="flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Angle</p>
              <p className="text-xs font-semibold">{rec.angle}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 bg-background/60 rounded-md px-3 py-2">
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-foreground leading-relaxed">{rec.reason}</p>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={() => onSendTo("content-engine", rec)}
          className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md border border-border bg-background hover:bg-accent transition-colors"
        >
          <FileText className="h-3 w-3" />
          Send to Content Engine
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        </button>
        {rec.type === "video" && (
          <button
            onClick={() => onSendTo("video", rec)}
            className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md border border-border bg-background hover:bg-accent transition-colors"
          >
            <Video className="h-3 w-3" />
            Send to Video Generator
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
        <button
          onClick={() => onSendTo("editor", rec)}
          className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md border border-border bg-background hover:bg-accent transition-colors"
        >
          <Pencil className="h-3 w-3" />
          Send to Editor
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

export default function ContentRecommender() {
  const posted = useMemo(() => {
    const all = loadLibrary();
    return all
      .filter((i) => i.status === "posted" && i.metrics != null)
      .map((i) => ({ ...i, _score: computeScore(i.metrics) }));
  }, []);

  const recommendations = useMemo(() => buildRecommendations(posted), [posted]);

  function handleSendTo(tool: "content-engine" | "video" | "editor", rec: Recommendation) {
    if (typeof window !== "undefined") {
      window.selectedMarketingRecommendation = rec;
    }

    const params = new URLSearchParams();
    if (rec.player) params.set("player", rec.player);
    if (rec.angle)  params.set("angle", rec.angle);
    params.set("type", rec.type);

    const routes: Record<string, string> = {
      "content-engine": "scripts",
      "video":          "video",
      "editor":         "editor",
    };

    const event = new CustomEvent("neeko:marketing-tab-change", {
      detail: { tab: routes[tool], params: Object.fromEntries(params) },
    });
    window.dispatchEvent(event);
  }

  if (posted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
        <AlertCircle className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm font-medium text-muted-foreground">No performance data yet</p>
        <p className="text-xs text-muted-foreground/60 max-w-sm">
          Start posting and tracking results in Library to unlock data-driven recommendations.
        </p>
      </div>
    );
  }

  const [primary, ...others] = recommendations;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold">Content Recommender</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Data-driven suggestions based on {posted.length} posted item{posted.length !== 1 ? "s" : ""} with metrics.
        </p>
      </div>

      {primary && (
        <RecommendationCard rec={primary} primary onSendTo={handleSendTo} />
      )}

      {others.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Other Options
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {others.map((rec) => (
              <RecommendationCard key={rec.variant} rec={rec} onSendTo={handleSendTo} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
