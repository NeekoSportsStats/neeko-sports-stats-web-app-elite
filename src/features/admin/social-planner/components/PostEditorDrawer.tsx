import { useState, useEffect, useRef } from "react";
import { X, Copy, Check, RefreshCw, ChevronLeft, TriangleAlert as AlertTriangle, Shield, ShieldCheck } from "lucide-react";
import type { SocialPost, PostStatus, CarouselSlide, ContentType, ContentVisibilityMode } from "../types";
import { checkSafety } from "../lib/safetyRules";
import { SafetyCheckPanel } from "./SafetyCheckPanel";
import { pickHook, type HookCategory } from "../lib/hookLibrary";
import { pickCaption, type CaptionCategory } from "../lib/captionLibrary";
import { replaceTokens, gameLabel } from "../lib/tokenEngine";
import type { TokenMap } from "../types";

const STATUS_OPTIONS: PostStatus[] = ["draft", "ready", "scheduled", "posted", "archived"];

type DrawerTab = "overview" | "players" | "slides" | "copy_paste" | "image" | "export" | "safety";

const TAB_LABELS: Record<DrawerTab, string> = {
  overview:   "Overview",
  players:    "Game & Players",
  slides:     "Carousel Slides",
  copy_paste: "Hook & Caption",
  image:      "Image Prompts",
  export:     "Export / Copy",
  safety:     "Safety Check",
};

const STATUS_COLORS: Record<PostStatus, string> = {
  draft:     "text-zinc-400 bg-zinc-800/80 border-zinc-700",
  ready:     "text-emerald-400 bg-emerald-950/80 border-emerald-800",
  scheduled: "text-sky-400 bg-sky-950/80 border-sky-800",
  posted:    "text-zinc-500 bg-zinc-900 border-zinc-700",
  archived:  "text-zinc-600 bg-zinc-900 border-zinc-800",
};

interface PostEditorDrawerProps {
  post: SocialPost | null;
  onClose: () => void;
  onSave: (post: SocialPost) => void;
}

export function PostEditorDrawer({ post, onClose, onSave }: PostEditorDrawerProps) {
  const [edited, setEdited] = useState<SocialPost | null>(null);
  const [tab, setTab] = useState<DrawerTab>("overview");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setEdited(post);
    setTab("overview");
    // Reset scroll position when switching posts
    if (post) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
      });
    }
  }, [post?.id]);

  if (!post || !edited) return null;

  function update<K extends keyof SocialPost>(key: K, value: SocialPost[K]) {
    setEdited(prev => prev ? { ...prev, [key]: value } : null);
  }

  function handleSave() {
    if (edited) onSave(edited);
    onClose();
  }

  function handleMarkReady() {
    if (!edited) return;
    const updated = { ...edited, status: "ready" as PostStatus };
    onSave(updated);
    onClose();
  }

  const hookSafety    = checkSafety(edited.hook);
  const captionSafety = checkSafety(edited.caption);
  const shortSafety   = checkSafety(edited.shortCaption);
  const hasSafetyIssues = !hookSafety.isSafe || !captionSafety.isSafe || !shortSafety.isSafe;

  const hasMissingRequired = edited.warnings.some(w =>
    w.includes("selection required") || w.includes("before marking")
  );
  const canMarkReady = !hasSafetyIssues && !hasMissingRequired && edited.status !== "ready";

  const totalIssues = edited.warnings.length + (hasSafetyIssues ? 1 : 0);

  return (
    <>
      {/* Backdrop — only on desktop */}
      <div
        className="fixed inset-0 z-[98] bg-black/50 hidden sm:block"
        onClick={onClose}
      />

      {/* Full-screen panel */}
      <div className="fixed inset-0 z-[99] flex flex-col bg-[#050506] sm:inset-auto sm:right-0 sm:top-0 sm:bottom-0 sm:w-full sm:max-w-2xl sm:border-l sm:border-zinc-800">

        {/* ── Sticky Header ── */}
        <div className="shrink-0 sticky top-0 z-20 bg-[#050506]/95 backdrop-blur border-b border-white/[0.08]">
          <div className="flex items-start justify-between px-4 pt-4 pb-3 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={onClose}
                className="shrink-0 flex items-center gap-1 text-zinc-400 hover:text-zinc-100 transition-colors"
                aria-label="Back"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="text-xs hidden sm:inline">Back</span>
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                    {edited.contentType.replace(/_/g, " ")}
                  </span>
                  {edited.visibilityBadge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-sky-950/60 border-sky-800/60 text-sky-300">
                      {edited.visibilityBadge}
                    </span>
                  )}
                  {hasSafetyIssues && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-950/60 border-amber-800/60 text-amber-300 flex items-center gap-0.5">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Safety
                    </span>
                  )}
                  {totalIssues === 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-950/60 border-emerald-800/60 text-emerald-400 flex items-center gap-0.5">
                      <ShieldCheck className="w-2.5 h-2.5" />
                      Clean
                    </span>
                  )}
                </div>
                <h2 className="text-sm font-semibold text-zinc-100 truncate">{edited.title}</h2>
                <p className="text-[10px] text-zinc-500 mt-0.5">{edited.dayOfWeek} · {edited.date}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <select
                value={edited.status}
                onChange={e => update("status", e.target.value as PostStatus)}
                className={`text-[10px] font-medium border rounded px-2 py-1 focus:outline-none cursor-pointer
                  ${STATUS_COLORS[edited.status]}`}
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s} className="bg-zinc-900 text-zinc-300">
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
              <button
                onClick={onClose}
                className="text-zinc-500 hover:text-zinc-200 transition-colors p-1"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tab bar — horizontally scrollable */}
          <div className="flex overflow-x-auto scrollbar-hide border-t border-white/[0.05]">
            {(Object.keys(TAB_LABELS) as DrawerTab[]).map(t => {
              const isSafetyBadge = t === "safety" && hasSafetyIssues;
              return (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t);
                    requestAnimationFrame(() => {
                      scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
                    });
                  }}
                  className={`relative px-3.5 py-2.5 text-[11px] font-medium whitespace-nowrap transition-colors border-b-2 shrink-0
                    ${tab === t
                      ? "border-sky-500 text-sky-400"
                      : "text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent"}`}
                >
                  {TAB_LABELS[t]}
                  {isSafetyBadge && (
                    <span className="absolute top-1.5 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Scrollable Content ── */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-32"
          style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          {tab === "overview"   && <OverviewTab edited={edited} update={update} />}
          {tab === "players"    && <PlayersTab edited={edited} />}
          {tab === "slides"     && <SlidesTab edited={edited} />}
          {tab === "copy_paste" && <HookCaptionTab edited={edited} update={update} />}
          {tab === "image"      && <ImagePromptsTab edited={edited} update={update} />}
          {tab === "export"     && <ExportTab edited={edited} />}
          {tab === "safety"     && (
            <SafetyCheckPanel
              hookResult={hookSafety}
              captionResult={captionSafety}
              shortCaptionResult={shortSafety}
            />
          )}
        </div>

        {/* ── Sticky Footer ── */}
        <div
          className="shrink-0 sticky bottom-0 z-20 bg-[#050506]/95 backdrop-blur border-t border-white/[0.08] px-4 py-3 flex items-center justify-between gap-2"
          style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={onClose}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Discard
          </button>

          <div className="flex items-center gap-2">
            {hasSafetyIssues && (
              <span className="hidden sm:flex items-center gap-1 text-[10px] text-amber-400">
                <Shield className="w-3 h-3" />
                Safety issues
              </span>
            )}
            {hasMissingRequired && (
              <span className="hidden sm:inline text-[10px] text-amber-400">Required fields missing</span>
            )}
            {canMarkReady && (
              <button
                onClick={handleMarkReady}
                className="px-3 py-1.5 text-xs rounded border border-emerald-700 bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/60 transition-colors font-medium"
              >
                Mark Ready
              </button>
            )}
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-xs rounded bg-sky-700 hover:bg-sky-600 text-white transition-colors font-medium"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({
  edited,
  update,
}: {
  edited: SocialPost;
  update: <K extends keyof SocialPost>(key: K, value: SocialPost[K]) => void;
}) {
  const safetyOk = checkSafety(edited.hook).isSafe && checkSafety(edited.caption).isSafe;
  const missingReq = edited.warnings.some(w => w.includes("selection required") || w.includes("before marking"));

  return (
    <div className="space-y-5">
      {/* Warnings */}
      {edited.warnings.length > 0 && (
        <div className="rounded-lg bg-amber-950/30 border border-amber-800/50 p-3">
          <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1.5">
            {edited.warnings.length} Warning{edited.warnings.length !== 1 ? "s" : ""}
          </p>
          <ul className="space-y-1">
            {edited.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-300/80 flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary pills */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Slides", value: edited.carouselSlides.length },
          { label: "Players", value: edited.selectedPlayers.length },
          { label: "Tags", value: edited.hashtags.length },
          { label: safetyOk ? "Safe" : "Issues", value: safetyOk ? "OK" : edited.warnings.length, highlight: !safetyOk },
        ].map(item => (
          <div
            key={item.label}
            className={`rounded-lg border p-2.5 text-center
              ${item.highlight ? "bg-amber-950/30 border-amber-800/40" : "bg-zinc-900 border-zinc-800"}`}
          >
            <p className={`text-base font-semibold ${item.highlight ? "text-amber-400" : "text-zinc-100"}`}>
              {item.value}
            </p>
            <p className="text-[10px] text-zinc-500 mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Metadata card */}
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 grid grid-cols-2 gap-3">
        <MetaItem label="Content Type"   value={edited.contentType.replace(/_/g, " ")} />
        <MetaItem label="Platform"       value={edited.platform} />
        <MetaItem label="Round / Season" value={`R${edited.round} · ${edited.season}`} />
        <MetaItem label="Day"            value={`${edited.dayOfWeek} ${edited.date}`} />
        {edited.homeTeam && edited.awayTeam && (
          <MetaItem
            label="Game"
            value={`${edited.homeTeam} v ${edited.awayTeam}`}
            className="col-span-2"
          />
        )}
        {edited.visibilityMode && (
          <MetaItem label="Visibility" value={edited.visibilityMode.replace(/_/g, " ")} />
        )}
        {edited.scheduledAt && (
          <MetaItem label="Scheduled" value={new Date(edited.scheduledAt).toLocaleString()} className="col-span-2" />
        )}
      </div>

      {/* Editable fields */}
      <Field label="Title">
        <input
          type="text"
          value={edited.title}
          onChange={e => update("title", e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
        />
      </Field>

      <Field label="Platform">
        <select
          value={edited.platform}
          onChange={e => update("platform", e.target.value as SocialPost["platform"])}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-sky-600"
        >
          {["instagram", "facebook", "tiktok", "threads", "x"].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </Field>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={() => {
            const dup: SocialPost = {
              ...edited,
              id: crypto.randomUUID(),
              title: `${edited.title} (copy)`,
              status: "draft",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            // Notify parent of duplicate via save
            void dup;
          }}
          className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
        >
          Duplicate post
        </button>
      </div>
    </div>
  );
}

// ─── Tab: Game & Players ──────────────────────────────────────────────────────

function PlayersTab({ edited }: { edited: SocialPost }) {
  const isMatchBoard = edited.contentType === "match_stat_board";

  return (
    <div className="space-y-4">
      {/* Game info */}
      {(edited.homeTeam || edited.awayTeam) && (
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Game</p>
          <div className="grid grid-cols-2 gap-4">
            {edited.homeTeam && <MetaItem label="Home Team" value={edited.homeTeam} />}
            {edited.awayTeam && <MetaItem label="Away Team" value={edited.awayTeam} />}
            {edited.visibilityMode && (
              <MetaItem label="Visibility Mode" value={edited.visibilityMode.replace(/_/g, " ")} className="col-span-2" />
            )}
          </div>
        </div>
      )}

      {/* Players */}
      {edited.selectedPlayers.length === 0 ? (
        <div className="text-center py-10 text-zinc-500 rounded-lg border border-dashed border-zinc-800">
          <p className="text-sm mb-1">No players selected for this post.</p>
          <p className="text-xs text-zinc-600">Generate with player data loaded to populate this tab.</p>
        </div>
      ) : (
        <>
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
            Players ({edited.selectedPlayers.length})
          </p>
          <div className="space-y-2">
            {edited.selectedPlayers.map((p, i) => (
              <div key={i} className="rounded-lg bg-zinc-900 border border-zinc-800 p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{p.playerName}</p>
                    <p className="text-[10px] text-zinc-500">{p.team}</p>
                  </div>
                  <ConfidencePill tier={p.confidenceTier} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px] text-zinc-400 mb-2">
                  <span className="col-span-3 text-zinc-500">{p.statType} · Threshold: {p.thresholdLabel}</span>
                  <span>Record: <span className="text-zinc-300 font-medium">{p.recordLabel}</span></span>
                  <span>L5 Avg: <span className="text-zinc-300 font-medium">{p.l5Avg.toFixed(1)}</span></span>
                  {p.projection != null && (
                    <span>Proj: <span className="text-sky-300 font-medium">{p.projection.toFixed(1)}</span></span>
                  )}
                </div>
                {p.lastFive.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-zinc-500">Last 5:</span>
                    {p.lastFive.map((v, vi) => (
                      <span
                        key={vi}
                        className={`text-[10px] px-1.5 py-0.5 rounded border font-mono
                          ${v >= p.threshold
                            ? "bg-emerald-950/50 border-emerald-800/50 text-emerald-400"
                            : "bg-zinc-800 border-zinc-700 text-zinc-400"}`}
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                )}
                {p.includeInFreePost && (
                  <span className="inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded border bg-emerald-950/50 border-emerald-800/50 text-emerald-400">
                    Free post
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Match board breakdown */}
      {isMatchBoard && edited.carouselSlides.length > 0 && (
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Board Layout</p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {edited.carouselSlides.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between text-[10px]">
                <span className="text-zinc-400 capitalize">{s.slideType.replace(/_/g, " ")}</span>
                <span className="text-zinc-600">
                  {s.visibleRowCount != null && `${s.visibleRowCount}v`}
                  {s.blurredRowCount != null && ` ${s.blurredRowCount}b`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConfidencePill({ tier }: { tier: string }) {
  const config: Record<string, string> = {
    elite:       "bg-sky-950/60 border-sky-800/60 text-sky-400",
    strong:      "bg-emerald-950/60 border-emerald-800/60 text-emerald-400",
    watch:       "bg-amber-950/60 border-amber-800/60 text-amber-400",
    thin_sample: "bg-zinc-800 border-zinc-700 text-zinc-400",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${config[tier] ?? config.thin_sample}`}>
      {tier.replace("_", " ")}
    </span>
  );
}

// ─── Tab: Carousel Slides ─────────────────────────────────────────────────────

function SlidesTab({ edited }: { edited: SocialPost }) {
  if (edited.carouselSlides.length === 0) {
    return (
      <div className="text-center py-10 text-zinc-500 rounded-lg border border-dashed border-zinc-800">
        <p className="text-sm mb-1">No carousel slides generated.</p>
        <p className="text-xs text-zinc-600">Regenerate the post to build slides.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {edited.carouselSlides.map((slide, i) => (
        <SlideCard key={slide.id} slide={slide} index={i} />
      ))}
    </div>
  );
}

function SlideCard({ slide, index }: { slide: CarouselSlide; index: number }) {
  const slideText = buildSlideText(slide, index);

  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
      {/* Slide header */}
      <div className="flex items-start justify-between p-3 border-b border-zinc-800/60">
        <div className="min-w-0">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">
            Slide {index + 1} · {slide.slideType.replace(/_/g, " ")}
          </p>
          <p className="text-sm font-medium text-zinc-200 truncate">{slide.title}</p>
          {slide.subtitle && <p className="text-xs text-zinc-400 mt-0.5">{slide.subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {slide.visibilityMode && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-zinc-800 border-zinc-700 text-zinc-400">
              {slide.visibilityMode === "open_free_game" ? "Free" : slide.visibilityMode === "preview_blurred" ? "Preview" : "Manual"}
            </span>
          )}
          <CopyIconButton value={slideText} />
        </div>
      </div>

      {/* Row data */}
      {slide.rows && slide.rows.length > 0 && (
        <div className="divide-y divide-zinc-800/40">
          {slide.rows.map((row, ri) => (
            <div
              key={ri}
              className={`flex items-center justify-between px-3 py-2 text-[11px]
                ${row.blurred ? "text-zinc-600 italic" : "text-zinc-300"}`}
            >
              <span>{row.blurred ? "(blurred — upgrade to unlock)" : row.playerName}</span>
              {!row.blurred && (
                <span className="text-zinc-500 font-mono">{row.l5Avg.toFixed(1)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer stats */}
      {(slide.visibleRowCount != null || slide.blurredRowCount != null || slide.ctaOverlayText) && (
        <div className="px-3 py-2 border-t border-zinc-800/40 flex items-center gap-3 text-[10px] text-zinc-500">
          {slide.visibleRowCount != null && <span>{slide.visibleRowCount} visible</span>}
          {slide.blurredRowCount != null && <span>{slide.blurredRowCount} blurred</span>}
          {slide.ctaOverlayText && (
            <span className="text-sky-400/70 italic truncate">CTA: {slide.ctaOverlayText}</span>
          )}
        </div>
      )}

      {/* Image prompt preview if set */}
      {slide.imagePrompt && (
        <div className="px-3 pb-3 pt-2 border-t border-zinc-800/40">
          <p className="text-[10px] text-zinc-500 mb-1">Image prompt</p>
          <p className="text-[10px] text-zinc-500 font-mono leading-relaxed line-clamp-3">
            {slide.imagePrompt}
          </p>
        </div>
      )}
    </div>
  );
}

function buildSlideText(slide: CarouselSlide, index: number): string {
  const lines: string[] = [`SLIDE ${index + 1}: ${slide.title}`];
  if (slide.subtitle) lines.push(slide.subtitle);
  if (slide.rows && slide.rows.length > 0) {
    lines.push("");
    for (const row of slide.rows) {
      if (row.blurred) {
        lines.push("[blurred row]");
      } else {
        const parts: string[] = [row.playerName, `avg ${row.l5Avg.toFixed(1)}`];
        if (row.threshold20) parts.push(`20+: ${row.threshold20}`);
        if (row.threshold25) parts.push(`25+: ${row.threshold25}`);
        if (row.threshold1Goal) parts.push(`1g+: ${row.threshold1Goal}`);
        lines.push(parts.join(" | "));
      }
    }
  }
  if (slide.ctaOverlayText) {
    lines.push("");
    lines.push(`CTA: ${slide.ctaOverlayText}`);
  }
  return lines.join("\n");
}

// ─── Tab: Hook & Caption ──────────────────────────────────────────────────────

function HookCaptionTab({
  edited,
  update,
}: {
  edited: SocialPost;
  update: <K extends keyof SocialPost>(key: K, value: SocialPost[K]) => void;
}) {
  const hookSafety    = checkSafety(edited.hook);
  const captionSafety = checkSafety(edited.caption);

  function buildTokenMap(post: SocialPost): TokenMap {
    const p = post.selectedPlayers[0];
    return {
      round:     post.round,
      game:      post.homeTeam && post.awayTeam ? gameLabel(post.homeTeam, post.awayTeam) : undefined,
      homeTeam:  post.homeTeam,
      awayTeam:  post.awayTeam,
      player:    p?.playerName,
      team:      p?.team,
      record:    p?.recordLabel,
      threshold: p?.thresholdLabel,
      l5Avg:     p?.l5Avg?.toFixed(1),
      lastFive:  p?.lastFive?.join(" · "),
      statType:  p?.statType,
      cta:       "See the full board at neekostatistics.com.au",
    };
  }

  function hookCategoryFor(ct: ContentType, vm?: ContentVisibilityMode): HookCategory {
    if (ct === "match_stat_board") {
      if (vm === "open_free_game") return "free_game_board";
      if (vm === "preview_blurred") return "preview_game";
      return "match_board";
    }
    const map: Record<ContentType, HookCategory> = {
      match_stat_board:     "match_board",
      player_spotlight:     "player_spotlight",
      player_spotlight_duo: "player_spotlight",
      round_review:         "round_review",
      round_ahead_watch:    "round_ahead",
      product_education:    "product",
      story_extra:          "match_board",
    };
    return map[ct];
  }

  function regenerateHook() {
    const category = hookCategoryFor(edited.contentType, edited.visibilityMode);
    const exclude = new Set(edited.usedHookId ? [edited.usedHookId] : []);
    const newHook = pickHook(category, exclude);
    const resolved = replaceTokens(newHook.template, buildTokenMap(edited));
    update("hook", resolved);
    update("usedHookId", newHook.id);
    update("shortCaption", `${resolved}\n\nSee the full board at neekostatistics.com.au`);
  }

  function regenerateCaption() {
    const category = hookCategoryFor(edited.contentType, edited.visibilityMode);
    const exclude = new Set(edited.usedCaptionId ? [edited.usedCaptionId] : []);
    const newCaption = pickCaption(category as CaptionCategory, exclude);
    const resolved = replaceTokens(newCaption.template, buildTokenMap(edited));
    update("caption", resolved);
    update("usedCaptionId", newCaption.id);
  }

  function regenerateFull() {
    const category = hookCategoryFor(edited.contentType, edited.visibilityMode);
    const exHooks    = new Set(edited.usedHookId    ? [edited.usedHookId]    : []);
    const exCaptions = new Set(edited.usedCaptionId ? [edited.usedCaptionId] : []);
    const newHook    = pickHook(category, exHooks);
    const newCaption = pickCaption(category as CaptionCategory, exCaptions);
    const tokens     = buildTokenMap(edited);
    const resolvedHook    = replaceTokens(newHook.template,    tokens);
    const resolvedCaption = replaceTokens(newCaption.template, tokens);
    update("hook",           resolvedHook);
    update("caption",        resolvedCaption);
    update("shortCaption",   `${resolvedHook}\n\nSee the full board at neekostatistics.com.au`);
    update("usedHookId",     newHook.id);
    update("usedCaptionId",  newCaption.id);
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          onClick={regenerateFull}
          className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Regenerate All
        </button>
      </div>

      {/* Hook */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-zinc-400">Hook</label>
            <SafetyBadge result={hookSafety} />
          </div>
          <div className="flex items-center gap-2">
            <CopyIconButton value={edited.hook} label="Copy" />
            <button onClick={regenerateHook} className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
              <RefreshCw className="w-3 h-3" /> New
            </button>
          </div>
        </div>
        <textarea
          rows={3}
          value={edited.hook}
          onChange={e => update("hook", e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600 resize-none"
        />
        {!hookSafety.isSafe && (
          <p className="text-[10px] text-amber-400 mt-1">
            {hookSafety.flags.map(f => `"${f.word}"`).join(", ")} — flagged
          </p>
        )}
      </div>

      {/* Caption */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-zinc-400">Caption</label>
            <SafetyBadge result={captionSafety} />
          </div>
          <div className="flex items-center gap-2">
            <CopyIconButton value={edited.caption} label="Copy" />
            <button onClick={regenerateCaption} className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
              <RefreshCw className="w-3 h-3" /> New
            </button>
          </div>
        </div>
        <textarea
          rows={8}
          value={edited.caption}
          onChange={e => update("caption", e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600 resize-none"
        />
        {!captionSafety.isSafe && (
          <p className="text-[10px] text-amber-400 mt-1">
            {captionSafety.flags.map(f => `"${f.word}"`).join(", ")} — flagged
          </p>
        )}
      </div>

      {/* Short Caption */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-zinc-400">Short Caption (Story)</label>
          <CopyIconButton value={edited.shortCaption} label="Copy" />
        </div>
        <textarea
          rows={3}
          value={edited.shortCaption}
          onChange={e => update("shortCaption", e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600 resize-none"
        />
      </div>

      {/* Hashtags */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-zinc-400">Hashtags</label>
          <CopyIconButton value={edited.hashtags.join(" ")} label="Copy" />
        </div>
        <textarea
          rows={3}
          value={edited.hashtags.join(" ")}
          onChange={e => update("hashtags", e.target.value.split(/\s+/).filter(Boolean))}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600 resize-none font-mono text-xs"
        />
      </div>
    </div>
  );
}

function SafetyBadge({ result }: { result: ReturnType<typeof checkSafety> }) {
  if (result.isSafe) {
    return (
      <span className="text-[10px] px-1 py-0.5 rounded text-emerald-500 flex items-center gap-0.5">
        <ShieldCheck className="w-2.5 h-2.5" /> OK
      </span>
    );
  }
  return (
    <span className="text-[10px] px-1 py-0.5 rounded text-amber-400 flex items-center gap-0.5">
      <Shield className="w-2.5 h-2.5" /> {result.flags.length} issue{result.flags.length !== 1 ? "s" : ""}
    </span>
  );
}

// ─── Tab: Image Prompts ───────────────────────────────────────────────────────

function ImagePromptsTab({
  edited,
  update,
}: {
  edited: SocialPost;
  update: <K extends keyof SocialPost>(key: K, value: SocialPost[K]) => void;
}) {
  const slidePrompts = edited.carouselSlides.filter(s => s.imagePrompt);

  return (
    <div className="space-y-5">
      {/* Cover prompt */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-zinc-400">Cover Image Prompt</label>
          <CopyIconButton value={edited.imagePrompt} label="Copy" />
        </div>
        <textarea
          rows={5}
          value={edited.imagePrompt}
          onChange={e => update("imagePrompt", e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-sky-600 resize-none font-mono leading-relaxed"
        />
      </div>

      {/* Per-slide prompts */}
      {slidePrompts.length > 0 ? (
        <>
          <div className="h-px bg-zinc-800" />
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Per-slide Prompts</p>
          <div className="space-y-3">
            {slidePrompts.map((slide, i) => (
              <div key={slide.id} className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60">
                  <p className="text-[10px] text-zinc-400">Slide {i + 1} — {slide.title}</p>
                  <CopyIconButton value={slide.imagePrompt!} label="Copy" />
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[11px] text-zinc-400 font-mono leading-relaxed whitespace-pre-wrap">
                    {slide.imagePrompt}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-zinc-600 text-center py-4">No per-slide image prompts generated.</p>
      )}

      {/* Safety reminder */}
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Prompt Guidelines</p>
        <ul className="space-y-1 text-[10px] text-zinc-500">
          <li>No page or slide numbers in prompts</li>
          <li>No player photos on cover slides by default</li>
          <li>No gambling language (bet, odds, picks, lock, line)</li>
          <li>No bookmaker branding</li>
          <li>No tipster phrasing</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Tab: Export / Copy ───────────────────────────────────────────────────────

function ExportTab({ edited }: { edited: SocialPost }) {
  const slideText = edited.carouselSlides
    .map((s, i) => {
      const rowLines = (s.rows ?? [])
        .map(r => r.blurred ? "(blurred row)" : `${r.playerName} — avg ${r.l5Avg.toFixed(1)}`)
        .join("\n");
      return `--- Slide ${i + 1}: ${s.title} ---\n${s.subtitle ? s.subtitle + "\n" : ""}${rowLines}`;
    })
    .join("\n\n");

  const safetyOk = checkSafety(edited.hook).isSafe && checkSafety(edited.caption).isSafe;

  const packageText = [
    `POST: ${edited.title}`,
    `Round ${edited.round} · ${edited.season} · ${edited.dayOfWeek} ${edited.date}`,
    edited.homeTeam && edited.awayTeam ? `Game: ${edited.homeTeam} v ${edited.awayTeam}` : null,
    edited.visibilityBadge ? `Visibility: ${edited.visibilityBadge}` : null,
    "",
    "HOOK",
    edited.hook,
    "",
    "CAPTION",
    edited.caption,
    "",
    "SHORT CAPTION",
    edited.shortCaption,
    "",
    "HASHTAGS",
    edited.hashtags.join(" "),
    slideText ? `\nSLIDES\n${slideText}` : null,
    "",
    "IMAGE PROMPT",
    edited.imagePrompt,
    "",
    `SAFETY: ${safetyOk ? "Clean" : "Issues found — review before posting"}`,
  ].filter(line => line !== null).join("\n");

  const storyVersion = [
    edited.hook,
    "",
    edited.shortCaption,
    "",
    edited.hashtags.slice(0, 5).join(" "),
  ].join("\n");

  const fields: Array<{ label: string; value: string; multiline?: boolean }> = [
    { label: "Full Post Package", value: packageText, multiline: true },
    { label: "Hook",              value: edited.hook },
    { label: "Instagram Caption", value: edited.caption },
    { label: "Short Caption",     value: edited.shortCaption },
    { label: "Hashtags",          value: edited.hashtags.join(" ") },
    { label: "Story Version",     value: storyVersion },
    { label: "Image Prompt",      value: edited.imagePrompt },
    { label: "Carousel Text",     value: slideText || "(no slide text)" },
  ];

  return (
    <div className="space-y-4">
      {fields.map(f => (
        <CopyField key={f.label} label={f.label} value={f.value} multiline={f.multiline} />
      ))}
    </div>
  );
}

function CopyField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60">
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{label}</p>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1 text-[10px] transition-colors
            ${copied ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-200"}`}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className={`px-3 py-2.5 ${multiline ? "max-h-52 overflow-y-auto" : ""}`}>
        <p className="text-xs text-zinc-300 whitespace-pre-wrap break-words font-mono leading-relaxed">
          {value || "(empty)"}
        </p>
      </div>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function CopyIconButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1 text-[10px] transition-colors
        ${copied ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-200"}`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {label && <span>{copied ? "Copied" : label}</span>}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function MetaItem({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] text-zinc-500 mb-0.5">{label}</p>
      <p className="text-xs text-zinc-300 capitalize">{value}</p>
    </div>
  );
}
