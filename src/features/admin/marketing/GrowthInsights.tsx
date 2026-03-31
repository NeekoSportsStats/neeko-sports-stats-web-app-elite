import { useMemo } from "react";
import { TrendingUp, Eye, Star, Lightbulb, ArrowRight, ChartBar as BarChart2, User, Tag, FileText, Image as ImageIcon, Video, Pencil, CircleAlert as AlertCircle } from "lucide-react";
import {
  type LibraryItem,
  type LibraryPlatform,
  loadLibrary,
  computeScore,
} from "./lib/library";

const PLATFORM_LABELS: Record<LibraryPlatform, string> = {
  tiktok:    "TikTok",
  instagram: "Instagram",
  reddit:    "Reddit",
  x:         "X",
};

const TYPE_LABELS: Record<string, string> = {
  script: "Scripts",
  image:  "Images",
  video:  "Videos",
  draft:  "Drafts",
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  script: FileText,
  image:  ImageIcon,
  video:  Video,
  draft:  Pencil,
};

function fmtNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

interface SummaryCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent?: string;
}

function SummaryCard({ label, value, sub, icon: Icon, accent = "text-foreground" }: SummaryCardProps) {
  return (
    <div className="border border-border rounded-lg p-4 bg-background space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-widest">{label}</span>
      </div>
      <p className={`text-xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

interface InsightRowProps {
  text: string;
  type?: "positive" | "neutral" | "action";
}

function InsightRow({ text, type = "neutral" }: InsightRowProps) {
  const dot =
    type === "positive" ? "bg-emerald-500" :
    type === "action"   ? "bg-amber-500" :
    "bg-sky-400";
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-border last:border-0">
      <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
      <p className="text-sm text-foreground leading-relaxed">{text}</p>
    </div>
  );
}

interface ActionRowProps {
  text: string;
}

function ActionRow({ text }: ActionRowProps) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <ArrowRight className="h-3.5 w-3.5 text-amber-500 shrink-0" />
      <p className="text-sm font-medium">{text}</p>
    </div>
  );
}

function computeInsights(posted: (LibraryItem & { _score: number })[]) {
  if (posted.length === 0) return { insights: [], actions: [] };

  const insights: string[] = [];
  const actions:  string[] = [];

  const byType: Record<string, number[]> = {};
  const byPlatform: Record<string, number[]> = {};
  const byPlayer: Record<string, number[]> = {};
  const byTag: Record<string, number[]> = {};

  for (const item of posted) {
    byType[item.type] = [...(byType[item.type] ?? []), item._score];

    if (item.platform) {
      byPlatform[item.platform] = [...(byPlatform[item.platform] ?? []), item._score];
    }
    if (item.player) {
      byPlayer[item.player] = [...(byPlayer[item.player] ?? []), item._score];
    }
    for (const tag of item.tags) {
      byTag[tag] = [...(byTag[tag] ?? []), item._score];
    }
  }

  const avgOf = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const topType = Object.entries(byType)
    .map(([k, v]) => ({ key: k, avg: avgOf(v), count: v.length }))
    .sort((a, b) => b.avg - a.avg)[0];

  const sortedTypes = Object.entries(byType)
    .map(([k, v]) => ({ key: k, avg: avgOf(v) }))
    .sort((a, b) => b.avg - a.avg);

  if (sortedTypes.length >= 2) {
    const best  = sortedTypes[0];
    const worst = sortedTypes[sortedTypes.length - 1];
    if (best.avg > worst.avg * 1.3) {
      insights.push(
        `${TYPE_LABELS[best.key] ?? best.key} are outperforming ${TYPE_LABELS[worst.key] ?? worst.key} by a clear margin — lean into them.`
      );
    }
  }

  const topPlatform = Object.entries(byPlatform)
    .map(([k, v]) => ({ key: k, avg: avgOf(v) }))
    .sort((a, b) => b.avg - a.avg)[0];

  if (topPlatform) {
    insights.push(
      `${PLATFORM_LABELS[topPlatform.key as LibraryPlatform] ?? topPlatform.key} is your highest-scoring platform right now — prioritise it.`
    );
  }

  const topTagEntry = Object.entries(byTag)
    .filter(([k]) => !["high-performer", "needs-rework"].includes(k))
    .map(([k, v]) => ({ key: k, avg: avgOf(v), count: v.length }))
    .sort((a, b) => b.avg - a.avg)[0];

  if (topTagEntry && topTagEntry.count >= 1) {
    insights.push(
      `"${topTagEntry.key}" content is generating your strongest engagement on average.`
    );
  }

  const topPlayerEntry = Object.entries(byPlayer)
    .map(([k, v]) => ({ key: k, avg: avgOf(v), count: v.length }))
    .sort((a, b) => b.avg - a.avg)[0];

  if (topPlayerEntry) {
    insights.push(
      `Posts featuring ${topPlayerEntry.key} are consistently performing above average.`
    );
  }

  const highViewItems = posted.filter((i) => (i.metrics?.views ?? 0) >= 10000);
  if (highViewItems.length > 0) {
    insights.push(
      `${highViewItems.length} post${highViewItems.length > 1 ? "s have" : " has"} crossed 10k views — analyse what made them land.`
    );
  }

  if (topType) {
    actions.push(`Create more ${TYPE_LABELS[topType.key] ?? topType.key} — they're your top-performing format.`);
  }
  if (topTagEntry) {
    actions.push(`Post another "${topTagEntry.key}" angle — that category is leading engagement.`);
  }
  if (topPlatform) {
    actions.push(`Increase ${PLATFORM_LABELS[topPlatform.key as LibraryPlatform] ?? topPlatform.key} posting frequency — highest ROI platform right now.`);
  }

  const needsRework = posted.filter((i) => i.tags.includes("needs-rework"));
  if (needsRework.length > 0) {
    actions.push(`Revisit ${needsRework.length} "Needs Rework" item${needsRework.length > 1 ? "s" : ""} and adjust the angle or format.`);
  }

  return {
    insights: insights.slice(0, 5),
    actions:  actions.slice(0, 3),
  };
}

export default function GrowthInsights() {
  const allItems = useMemo(() => loadLibrary(), []);

  const posted = useMemo(() =>
    allItems
      .filter((i) => i.status === "posted" && i.metrics != null)
      .map((i) => ({ ...i, _score: computeScore(i.metrics) })),
    [allItems]
  );

  const hasData = posted.length > 0;

  const stats = useMemo(() => {
    if (!hasData) return null;

    const totalViews   = posted.reduce((s, i) => s + (i.metrics?.views ?? 0), 0);
    const avgViews     = totalViews / posted.length;
    const topPost      = [...posted].sort((a, b) => b._score - a._score)[0];

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
      for (const tag of item.tags.filter((t) => !["high-performer","needs-rework"].includes(t))) {
        byTag[tag] = [...(byTag[tag] ?? []), item._score];
      }
    }

    const avgOf   = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const topOf   = (map: Record<string, number[]>) =>
      Object.entries(map).sort((a, b) => avgOf(b[1]) - avgOf(a[1]))[0]?.[0] ?? null;

    const topPlatform = topOf(byPlatform);
    const topType     = topOf(byType);

    const topPlayers = Object.entries(byPlayer)
      .map(([name, scores]) => ({ name, avg: avgOf(scores), count: scores.length }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);

    const topTags = Object.entries(byTag)
      .map(([tag, scores]) => ({ tag, avg: avgOf(scores), count: scores.length }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);

    const topPosts = [...posted].sort((a, b) => b._score - a._score).slice(0, 5);

    return {
      totalPosted: posted.length,
      totalViews,
      avgViews,
      topPost,
      topPlatform,
      topType,
      topPlayers,
      topTags,
      topPosts,
    };
  }, [posted, hasData]);

  const { insights, actions } = useMemo(() => computeInsights(posted), [posted]);

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
        <AlertCircle className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm font-medium text-muted-foreground">No performance data yet</p>
        <p className="text-xs text-muted-foreground/60 max-w-sm">
          Mark content as posted in Library and add metrics to start tracking growth insights.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold">Growth Insights</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Based on {stats!.totalPosted} posted item{stats!.totalPosted !== 1 ? "s" : ""} with performance metrics.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Posted"
          value={String(stats!.totalPosted)}
          sub="items with metrics"
          icon={BarChart2}
        />
        <SummaryCard
          label="Avg Views"
          value={fmtNum(stats!.avgViews)}
          sub={`${fmtNum(stats!.totalViews)} total`}
          icon={Eye}
        />
        <SummaryCard
          label="Best Platform"
          value={stats!.topPlatform ? (PLATFORM_LABELS[stats!.topPlatform as LibraryPlatform] ?? stats!.topPlatform) : "—"}
          sub="by avg score"
          icon={TrendingUp}
          accent="text-emerald-600 dark:text-emerald-400"
        />
        <SummaryCard
          label="Best Format"
          value={stats!.topType ? (TYPE_LABELS[stats!.topType] ?? stats!.topType) : "—"}
          sub="by avg score"
          icon={Star}
          accent="text-amber-600 dark:text-amber-400"
        />
      </div>

      {insights.length > 0 && (
        <div className="border border-border rounded-lg p-4 space-y-1">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-sky-500" />
            <p className="text-xs font-semibold uppercase tracking-wide">What's Working</p>
          </div>
          {insights.map((text, i) => (
            <InsightRow
              key={i}
              text={text}
              type={i === 0 ? "positive" : "neutral"}
            />
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <div className="border border-amber-400/30 bg-amber-400/5 rounded-lg p-4 space-y-1">
          <div className="flex items-center gap-2 mb-3">
            <ArrowRight className="h-4 w-4 text-amber-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">What To Do Next</p>
          </div>
          {actions.map((text, i) => (
            <ActionRow key={i} text={text} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-border rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top Posts</p>
          {stats!.topPosts.map((item, i) => (
            <div key={item.id} className="flex items-start gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
              <span className="text-[10px] font-black text-muted-foreground/50 shrink-0 mt-0.5 w-4">
                #{i + 1}
              </span>
              <div className="min-w-0 space-y-0.5 flex-1">
                <p className="text-xs font-medium truncate">{item.title}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                  {item.platform && (
                    <span>{PLATFORM_LABELS[item.platform as LibraryPlatform] ?? item.platform}</span>
                  )}
                  {(item.metrics?.views ?? 0) > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Eye className="h-2.5 w-2.5" />
                      {fmtNum(item.metrics!.views!)}
                    </span>
                  )}
                  <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-medium">
                    <Star className="h-2.5 w-2.5 fill-current" />
                    {item._score.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border border-border rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top Players</p>
          {stats!.topPlayers.length === 0 ? (
            <p className="text-xs text-muted-foreground/50">No player data yet</p>
          ) : (
            stats!.topPlayers.map((p, i) => (
              <div key={p.name} className="flex items-center gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
                <span className="text-[10px] font-black text-muted-foreground/50 shrink-0 w-4">
                  #{i + 1}
                </span>
                <User className="h-3 w-3 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    avg {Math.round(p.avg).toLocaleString()} pts · {p.count} post{p.count !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border border-border rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top Angles</p>
          {stats!.topTags.length === 0 ? (
            <p className="text-xs text-muted-foreground/50">No tag data yet</p>
          ) : (
            stats!.topTags.map((t, i) => (
              <div key={t.tag} className="flex items-center gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
                <span className="text-[10px] font-black text-muted-foreground/50 shrink-0 w-4">
                  #{i + 1}
                </span>
                <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{t.tag}</p>
                  <p className="text-[10px] text-muted-foreground">
                    avg {Math.round(t.avg).toLocaleString()} pts · {t.count} post{t.count !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
