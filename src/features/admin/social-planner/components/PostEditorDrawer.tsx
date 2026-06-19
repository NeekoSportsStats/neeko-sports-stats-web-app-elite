import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Check, RefreshCw, ChevronLeft, TriangleAlert as AlertTriangle, Shield, ShieldCheck, Image, FileText, Layers, Eye, Search, Import as SortAsc, Pencil, Upload, Trash2 } from "lucide-react";
import type { SocialPost, PostStatus, CarouselSlide, ContentType, ContentVisibilityMode, AFLPlayerStat, PlayerAvailabilityStatus, SpotlightSelection, ReferenceScreenshot, ScreenshotTag, ScreenshotRefMode, EducationAsset, EducationPattern, EducationCopyTone, EducationVisualDirection } from "../types";
import { EXCLUDED_STATUSES, WARNING_STATUSES, contentModeFor } from "../types";
import type { MatchBoardPlayerRow } from "../lib/rowAggregator";
import { effectiveStatus, isAvailabilityWarning, isExcludedStatus } from "../hooks/usePlayerAvailability";
import { checkSafety } from "../lib/safetyRules";
import { rebuildMatchBoardSlidesFromRows } from "../lib/carouselBuilder";
import { buildMatchBoardRowsDirect, MATCH_BOARD_DATA_VERSION } from "../lib/postGenerator";
import { SafetyCheckPanel } from "./SafetyCheckPanel";
import { pickHook, type HookCategory } from "../lib/hookLibrary";
import { pickCaption, type CaptionCategory } from "../lib/captionLibrary";
import { replaceTokens, gameLabel } from "../lib/tokenEngine";
import type { TokenMap } from "../types";
import {
  buildFullCarouselPrompt,
  buildSlidePromptPackage,
  buildBackgroundPromptPackage,
  buildFullSlideTextPackage,
  buildFullPostPackage,
  buildSpotlightImagePrompt,
  buildSpotlightFullPackage,
  checkPromptHealth,
  type PromptMode,
} from "../lib/carouselPromptBuilder";
import { adminFineLines, socialPostStatsBoard } from "@/config/disposalThresholds";

const FINE_LINE_THRESHOLDS: readonly number[] = adminFineLines;
const STATS_BOARD_THRESHOLDS: readonly number[] = socialPostStatsBoard;
import { copyToClipboard } from "../../pages/social-planner/copyAllStats";

const STATUS_OPTIONS: PostStatus[] = ["draft", "ready", "scheduled", "posted", "archived"];

type DrawerTab = "overview" | "players" | "education_inputs" | "education_assets" | "slides" | "copy_paste" | "image" | "export" | "safety";

const TAB_LABELS: Record<DrawerTab, string> = {
  overview:          "Overview",
  players:           "Game & Players",
  education_inputs:  "Content Inputs",
  education_assets:  "Screenshots & Assets",
  slides:            "Carousel Slides",
  copy_paste:        "Hook & Caption",
  image:             "Image Prompts",
  export:            "Export / Copy",
  safety:            "Safety Check",
};

/** Which tabs to show based on content mode */
function visibleTabs(contentType: ContentType): DrawerTab[] {
  const mode = contentModeFor(contentType);
  if (mode === "product_education") {
    return ["overview", "education_inputs", "education_assets", "slides", "copy_paste", "image", "export", "safety"];
  }
  return ["overview", "players", "slides", "copy_paste", "image", "export", "safety"];
}

const STATUS_COLORS: Record<PostStatus, string> = {
  draft:     "text-zinc-400 bg-zinc-800/80 border-zinc-700",
  ready:     "text-emerald-400 bg-emerald-950/80 border-emerald-800",
  scheduled: "text-sky-400 bg-sky-950/80 border-sky-800",
  posted:    "text-zinc-500 bg-zinc-900 border-zinc-700",
  archived:  "text-zinc-600 bg-zinc-900 border-zinc-800",
};

interface PostEditorDrawerProps {
  post: SocialPost | null;
  allPlayers?: AFLPlayerStat[];
  screenshotRefMode?: ScreenshotRefMode;
  onClose: () => void;
  onSave: (post: SocialPost) => void;
}

export function PostEditorDrawer({ post, allPlayers = [], screenshotRefMode, onClose, onSave }: PostEditorDrawerProps) {
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

  // Check if any selected match board rows have excluded availability status without override
  const hasUnavailableSelectedRows = edited.matchBoardRows != null && (
    ["homeDisposals", "awayDisposals", "homeGoals", "awayGoals"] as const
  ).some(section =>
    edited.matchBoardRows![section].some(r =>
      r.selected &&
      r.availabilityStatus != null &&
      EXCLUDED_STATUSES.has(r.availabilityStatus) &&
      !r.manualAvailabilityOverride
    )
  );
  const promptHealth = checkPromptHealth(edited);
  const hasUnresolvedTokens = /\{[a-zA-Z_]+\}/.test(edited.hook + edited.caption);

  // Spotlight-specific readiness checks
  const isSpotlight = edited.contentType === "player_spotlight" || edited.contentType === "player_spotlight_duo";
  const spotlightMissingPlayer = isSpotlight && (!edited.selectedSpotlight || edited.selectedSpotlight.length === 0);
  const spotlightMissingLastFive = isSpotlight && edited.selectedSpotlight != null &&
    edited.selectedSpotlight.some(s => !s.lastFive || s.lastFive.length === 0);
  const spotlightPromptStale = isSpotlight && !!edited.spotlightPromptStale;

  const isReady = !hasMissingRequired && !hasUnavailableSelectedRows && promptHealth.isComplete && !hasUnresolvedTokens
    && !spotlightMissingPlayer && !spotlightMissingLastFive && !spotlightPromptStale
    && edited.carouselSlides.length > 0 && edited.hook.length > 0 && edited.caption.length > 0;

  const isMatchBoard = edited.contentType === "match_stat_board";
  const isMatchBoardStale = isMatchBoard && edited.match_board_data_version !== MATCH_BOARD_DATA_VERSION;

  const canMarkReady = !hasSafetyIssues && isReady && !isMatchBoardStale && edited.status !== "ready";

  return createPortal(
    <>
      {/* Backdrop — only on desktop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/50 hidden sm:block"
        onClick={onClose}
      />

      {/* Full-screen panel */}
      <div className="fixed inset-0 z-[9999] flex flex-col overflow-hidden bg-[#050506] sm:inset-auto sm:right-0 sm:top-0 sm:bottom-0 sm:w-full sm:max-w-2xl sm:border-l sm:border-zinc-800"
        style={{ height: "100dvh" }}
      >

        {/* ── Header ── */}
        <div className="shrink-0 z-20 bg-[#050506]/95 backdrop-blur border-b border-white/[0.08]">
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
                  {isMatchBoardStale && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-orange-950/60 border-orange-700/60 text-orange-300 flex items-center gap-0.5">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Stale Data
                    </span>
                  )}
                  {!hasSafetyIssues && !isReady && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-zinc-800 border-zinc-700 text-zinc-400 flex items-center gap-0.5">
                      <Shield className="w-2.5 h-2.5" />
                      Incomplete
                    </span>
                  )}
                  {!hasSafetyIssues && isReady && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-950/60 border-emerald-800/60 text-emerald-400 flex items-center gap-0.5">
                      <ShieldCheck className="w-2.5 h-2.5" />
                      Ready
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
            {visibleTabs(edited.contentType).map(t => {
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
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 pb-32"
          style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          {tab === "overview"          && <OverviewTab edited={edited} update={update} />}
          {tab === "players"           && <PlayersTab edited={edited} allPlayers={allPlayers} onUpdate={post => setEdited(post)} />}
          {tab === "education_inputs"  && <EducationInputsTab edited={edited} update={update} onRefreshSlides={() => {
            // Rebuild slides with updated education fields
            import("../lib/carouselBuilder").then(({ buildCarouselSlides }) => {
              const slot = { contentType: edited.contentType, date: edited.date, day: edited.dayOfWeek } as any;
              const tokens = { round: edited.round };
              const newSlides = buildCarouselSlides(slot, [], tokens, {} as any, edited);
              const now = new Date().toISOString();
              setEdited(prev => prev ? { ...prev, carouselSlides: newSlides, lastRefreshedAt: now, updatedAt: now } : null);
            });
          }} />}
          {tab === "education_assets"  && <EducationAssetsTab edited={edited} update={update} />}
          {tab === "slides"            && <SlidesTab edited={edited} />}
          {tab === "copy_paste"        && <HookCaptionTab edited={edited} update={update} />}
          {tab === "image"             && <ImagePromptsTab edited={edited} update={update} screenshotRefMode={screenshotRefMode} onRefreshSpotlight={() => {
            const next = { ...edited, imagePrompt: buildSpotlightImagePrompt(edited), spotlightPromptStale: false, updatedAt: new Date().toISOString() };
            setEdited(next);
          }} />}
          {tab === "export"            && <ExportTab edited={edited} screenshotRefMode={screenshotRefMode} onRefreshSpotlight={() => {
            const next = { ...edited, imagePrompt: buildSpotlightImagePrompt(edited), spotlightPromptStale: false, updatedAt: new Date().toISOString() };
            setEdited(next);
          }} />}
          {tab === "safety"            && (
            <SafetyCheckPanel
              hookResult={hookSafety}
              captionResult={captionSafety}
              shortCaptionResult={shortSafety}
            />
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="shrink-0 z-20 bg-[#050506]/95 backdrop-blur border-t border-white/[0.08] px-4 py-3 flex items-center justify-between gap-2"
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
            {!hasSafetyIssues && hasMissingRequired && (
              <span className="hidden sm:inline text-[10px] text-amber-400">Required fields missing</span>
            )}
            {!hasSafetyIssues && !hasMissingRequired && hasUnavailableSelectedRows && (
              <span className="hidden sm:inline text-[10px] text-red-400">Unavailable player selected</span>
            )}
            {!hasSafetyIssues && !hasMissingRequired && !hasUnavailableSelectedRows && !promptHealth.isComplete && (
              <span className="hidden sm:inline text-[10px] text-amber-400">Prompt incomplete</span>
            )}
            {!hasSafetyIssues && !hasMissingRequired && !hasUnavailableSelectedRows && promptHealth.isComplete && hasUnresolvedTokens && (
              <span className="hidden sm:inline text-[10px] text-amber-400">Unresolved tokens</span>
            )}
            {isSpotlight && spotlightMissingPlayer && (
              <span className="hidden sm:inline text-[10px] text-amber-400">No player selected</span>
            )}
            {isSpotlight && !spotlightMissingPlayer && spotlightMissingLastFive && (
              <span className="hidden sm:inline text-[10px] text-amber-400">Last 5 data missing</span>
            )}
            {isSpotlight && spotlightPromptStale && (
              <span className="hidden sm:inline text-[10px] text-amber-400">Prompt out of date</span>
            )}
            {isMatchBoardStale && (
              <span className="hidden sm:flex items-center gap-1 text-[10px] text-orange-400">
                <AlertTriangle className="w-3 h-3" />
                Stale data — refresh before marking ready
              </span>
            )}
            {isMatchBoardStale && allPlayers.length > 0 && (
              <button
                onClick={() => {
                  const visMode = edited.visibilityMode ?? "preview_blurred";
                  const isOpen = visMode === "open_free_game";
                  const totalLimit   = isOpen ? 10 : 8;
                  const visibleLimit = isOpen ? 10 : 3;
                  const newRows = buildMatchBoardRowsDirect(
                    edited.homeTeam ?? "",
                    edited.awayTeam ?? "",
                    allPlayers,
                    visMode,
                    totalLimit,
                    visibleLimit
                  );
                  const newSlides = rebuildMatchBoardSlidesFromRows(
                    edited.carouselSlides,
                    newRows,
                    "See the full board at neekostats.com.au"
                  );
                  const now = new Date().toISOString();
                  setEdited(prev => prev ? {
                    ...prev,
                    matchBoardRows: newRows,
                    carouselSlides: newSlides,
                    match_board_data_version: MATCH_BOARD_DATA_VERSION,
                    match_board_refreshed_at: now,
                    updatedAt: now,
                  } : null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-orange-700 bg-orange-950/60 text-orange-300 hover:bg-orange-900/60 transition-colors font-medium"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh Data
              </button>
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
    </>,
    document.body
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

function PlayersTab({
  edited,
  allPlayers,
  onUpdate,
}: {
  edited: SocialPost;
  allPlayers: AFLPlayerStat[];
  onUpdate: (post: SocialPost) => void;
}) {
  const isMatchBoard = edited.contentType === "match_stat_board";
  const isSpotlight = edited.contentType === "player_spotlight" || edited.contentType === "player_spotlight_duo";

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

      {isMatchBoard
        ? <MatchBoardAggregatedSections post={edited} allPlayers={allPlayers} onUpdate={onUpdate} />
        : isSpotlight
        ? <SpotlightPlayerSelector post={edited} allPlayers={allPlayers} onUpdate={onUpdate} />
        : <UniversalPlayerList post={edited} allPlayers={allPlayers} onUpdate={onUpdate} />
      }
    </div>
  );
}

function MatchBoardAggregatedSections({
  post,
  allPlayers,
  onUpdate,
}: {
  post: SocialPost;
  allPlayers: AFLPlayerStat[];
  onUpdate: (post: SocialPost) => void;
}) {
  // Local override rows — set when the Refresh button is clicked.
  // Takes priority over both the memo and saved post.matchBoardRows.
  const [overrideRows, setOverrideRows] = useState<SocialPost["matchBoardRows"] | null>(null);
  const [refreshed, setRefreshed] = useState(false);

  // Reset override when the post changes (different post opened)
  useEffect(() => {
    setOverrideRows(null);
    setRefreshed(false);
  }, [post.id]);

  // Auto-derive fresh rows from allPlayers when available.
  // Falls back to saved post.matchBoardRows only when allPlayers isn't loaded yet.
  const derivedRows = useMemo((): SocialPost["matchBoardRows"] => {
    if (allPlayers.length > 0 && post.homeTeam && post.awayTeam) {
      const visMode = post.visibilityMode ?? "preview_blurred";
      const isOpen = visMode === "open_free_game";
      const totalLimit   = isOpen ? 10 : 8;
      const visibleLimit = isOpen ? 10 : 3;
      if (process.env.NODE_ENV !== "production") {
        const loganGoals = allPlayers.filter(
          p => p.playerName === "Logan McDonald" && p.statType === "goals"
        );
        if (loganGoals.length > 0) {
          console.group("[SocialPlanner UI Check] MatchBoardAggregatedSections — raw allPlayers for Logan McDonald goals");
          loganGoals.forEach(r => console.log(`threshold=${r.threshold} record=${r.recordLabel} l5Avg=${r.l5Avg}`));
          console.groupEnd();
        }
      }
      return buildMatchBoardRowsDirect(
        post.homeTeam,
        post.awayTeam,
        allPlayers,
        visMode,
        totalLimit,
        visibleLimit
      );
    }
    return post.matchBoardRows;
  }, [allPlayers, post.homeTeam, post.awayTeam, post.visibilityMode, post.matchBoardRows]);

  // Effective rows: manual override > auto-derived
  const rows = overrideRows ?? derivedRows;

  function handleRefreshPlayerData(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    e.preventDefault();

    console.log("[SocialPlanner] Refresh Player Data CLICKED", {
      postId: post.id,
      title: post.title,
      contentType: post.contentType,
      homeTeam: post.homeTeam,
      awayTeam: post.awayTeam,
      allPlayersCount: allPlayers?.length ?? 0,
    });

    if (!allPlayers.length) {
      console.warn("[SocialPlanner] Cannot refresh — allPlayers is empty");
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      const rawLoganGoalRows = allPlayers.filter(
        p => p.playerName === "Logan McDonald" && p.statType === "goals"
      );
      console.log("[SocialPlanner] Logan raw allPlayers goal rows in drawer", rawLoganGoalRows);
    }

    const visMode = post.visibilityMode ?? "preview_blurred";
    const isOpen = visMode === "open_free_game";
    const totalLimit   = isOpen ? 10 : 8;
    const visibleLimit = isOpen ? 10 : 3;
    const newRows = buildMatchBoardRowsDirect(
      post.homeTeam ?? "",
      post.awayTeam ?? "",
      allPlayers,
      visMode,
      totalLimit,
      visibleLimit
    );

    const refreshedLogan = newRows.awayGoals.find(r => r.playerName === "Logan McDonald")
      ?? newRows.homeGoals.find(r => r.playerName === "Logan McDonald");
    console.log("[SocialPlanner] Refresh Player Data RESULT", {
      homeDisposals: newRows.homeDisposals.length,
      awayDisposals: newRows.awayDisposals.length,
      homeGoals: newRows.homeGoals.length,
      awayGoals: newRows.awayGoals.length,
      loganMcDonald: refreshedLogan,
    });

    // Update local display immediately — this is what makes the UI change
    setOverrideRows(newRows);
    setRefreshed(true);

    const newSlides = rebuildMatchBoardSlidesFromRows(
      post.carouselSlides,
      newRows,
      "See the full board at neekostats.com.au"
    );
    const now = new Date().toISOString();
    onUpdate({
      ...post,
      matchBoardRows: newRows,
      carouselSlides: newSlides,
      match_board_data_version: MATCH_BOARD_DATA_VERSION,
      match_board_refreshed_at: now,
      updatedAt: now,
    });
  }

  const [copiedStats, setCopiedStats] = useState(false);
  const [copiedStatsBoard, setCopiedStatsBoard] = useState(false);

  function buildMatchBoardStatsText(): string {
    if (!rows) return "(no player data)";
    const thresholds = FINE_LINE_THRESHOLDS;
    const lines: string[] = [
      `NEEKO GAME & PLAYERS EXPORT`,
      `Post: ${post.title}`,
      `Game: ${post.homeTeam ?? "?"} vs ${post.awayTeam ?? "?"}`,
      `Exported: ${new Date().toISOString()}`,
      "─".repeat(60),
      "",
    ];
    const sectionLabels: Array<{ key: keyof NonNullable<SocialPost["matchBoardRows"]>; label: string }> = [
      { key: "homeDisposals", label: `${post.homeTeam ?? "Home"} — Disposals` },
      { key: "awayDisposals", label: `${post.awayTeam ?? "Away"} — Disposals` },
      { key: "homeGoals",     label: `${post.homeTeam ?? "Home"} — Goals` },
      { key: "awayGoals",     label: `${post.awayTeam ?? "Away"} — Goals` },
    ];
    for (const { key, label } of sectionLabels) {
      const sectionRows = rows[key];
      lines.push(`### ${label}`);
      if (!sectionRows || sectionRows.length === 0) {
        lines.push("  (no qualifying players)", "");
        continue;
      }
      const isDisp = key === "homeDisposals" || key === "awayDisposals";
      for (const r of sectionRows) {
        lines.push(`  ${r.playerName} (${r.team}) — L5: ${r.l5Avg.toFixed(1)}`);
        if (isDisp && r.allThresholdHitRates) {
          const parts = thresholds.map(t => {
            const entry = r.allThresholdHitRates?.[String(t)];
            if (!entry || entry.games === 0) return `${t}+=—`;
            const rate = entry.rate > 1 ? entry.rate / 100 : entry.rate;
            return `${t}+=${entry.hits}/${entry.games} (${Math.round(rate * 100)}%)`;
          });
          lines.push(`    Lines: ${parts.join("; ")}`);
        }
        lines.push("");
      }
    }
    return lines.join("\n").trimEnd();
  }

  async function handleCopyAllStats() {
    const text = buildMatchBoardStatsText();
    await copyToClipboard(text);
    setCopiedStats(true);
    setTimeout(() => setCopiedStats(false), 2000);
  }

  function buildMatchBoardStatsBoardText(): string {
    if (!rows) return "(no player data)";
    const lines: string[] = [
      `NEEKO STATS BOARD EXPORT`,
      `Post: ${post.title}`,
      `Game: ${post.homeTeam ?? "?"} vs ${post.awayTeam ?? "?"}`,
      `Exported: ${new Date().toISOString()}`,
      "─".repeat(60),
      "",
    ];
    const sectionLabels: Array<{ key: keyof NonNullable<SocialPost["matchBoardRows"]>; label: string }> = [
      { key: "homeDisposals", label: `${post.homeTeam ?? "Home"} — Disposals` },
      { key: "awayDisposals", label: `${post.awayTeam ?? "Away"} — Disposals` },
      { key: "homeGoals",     label: `${post.homeTeam ?? "Home"} — Goals` },
      { key: "awayGoals",     label: `${post.awayTeam ?? "Away"} — Goals` },
    ];
    for (const { key, label } of sectionLabels) {
      const sectionRows = rows[key];
      lines.push(`### ${label}`);
      if (!sectionRows || sectionRows.length === 0) {
        lines.push("  (no qualifying players)", "");
        continue;
      }
      const isDisp = key === "homeDisposals" || key === "awayDisposals";
      for (const r of sectionRows) {
        const selState = r.selected ? `selected (${r.displayMode})` : "unselected";
        lines.push(`  ${r.playerName} (${r.team}) — L5: ${r.l5Avg.toFixed(1)} — ${selState}`);
        if (isDisp && r.allThresholdHitRates) {
          const parts = STATS_BOARD_THRESHOLDS.map(t => {
            const entry = r.allThresholdHitRates?.[String(t)];
            if (!entry || entry.games === 0) return `${t}+=—`;
            const rate = entry.rate > 1 ? entry.rate / 100 : entry.rate;
            return `${t}+=${entry.hits}/${entry.games} (${Math.round(rate * 100)}%)`;
          });
          lines.push(`    Lines: ${parts.join("; ")}`);
        }
        lines.push("");
      }
    }
    return lines.join("\n").trimEnd();
  }

  async function handleCopyStatsBoard() {
    const text = buildMatchBoardStatsBoardText();
    await copyToClipboard(text);
    setCopiedStatsBoard(true);
    setTimeout(() => setCopiedStatsBoard(false), 2000);
  }

  if (!rows) {
    return (
      <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 space-y-2">
        <p className="text-[10px] text-amber-400 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          No aggregated player rows — regenerate the week to load player data.
        </p>
        {allPlayers.length > 0 && (
          <button
            type="button"
            onClick={handleRefreshPlayerData}
            className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded border border-sky-700 text-sky-400 hover:text-sky-200 hover:border-sky-500 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh Player Data
          </button>
        )}
      </div>
    );
  }

  function updateSection(
    sectionKey: keyof NonNullable<SocialPost["matchBoardRows"]>,
    updatedRows: MatchBoardPlayerRow[]
  ) {
    const newMatchBoardRows = { ...rows!, [sectionKey]: updatedRows };
    // Keep override state in sync so edits made after a refresh are reflected
    if (overrideRows) setOverrideRows(newMatchBoardRows);
    const newSlides = rebuildMatchBoardSlidesFromRows(
      post.carouselSlides,
      newMatchBoardRows,
      "See the full board at neekostats.com.au"
    );
    onUpdate({
      ...post,
      matchBoardRows: newMatchBoardRows,
      carouselSlides: newSlides,
      updatedAt: new Date().toISOString(),
    });
  }

  const sections: Array<{
    key: keyof NonNullable<SocialPost["matchBoardRows"]>;
    label: string;
    statType: "disposals" | "goals";
  }> = [
    { key: "homeDisposals", label: `${post.homeTeam ?? "Home"} — Disposals`, statType: "disposals" },
    { key: "awayDisposals", label: `${post.awayTeam ?? "Away"} — Disposals`, statType: "disposals" },
    { key: "homeGoals",     label: `${post.homeTeam ?? "Home"} — Goals`,     statType: "goals" },
    { key: "awayGoals",     label: `${post.awayTeam ?? "Away"} — Goals`,     statType: "goals" },
  ];

  return (
    <div className="space-y-4">
      {/* Sticky toolbar — z-30 sits above drawer header (z-20) so pointer events are never blocked */}
      <div
        className="sticky top-0 z-30 -mx-4 px-4 py-2 bg-[#050506] border-b border-white/[0.05] flex items-center justify-between pointer-events-auto"
        style={{ backdropFilter: "blur(8px)" }}
      >
        <p className="text-[10px] text-zinc-500">
          {allPlayers.length > 0 ? "Live data" : "Saved data"}
          {allPlayers.length > 0 && (
            <span className="ml-1 text-emerald-600">· {allPlayers.filter(p => p.team === post.homeTeam || p.team === post.awayTeam).length} player rows loaded</span>
          )}
          {refreshed && (
            <span className="ml-2 text-sky-400">Refreshed</span>
          )}
        </p>
        {allPlayers.length > 0 ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyStatsBoard}
              className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded border transition-colors pointer-events-auto ${
                copiedStatsBoard
                  ? "bg-emerald-900/50 text-emerald-300 border-emerald-700/40"
                  : "border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"
              }`}
              title="Copy Stats Board prompt (15+/20+/25+/30+ only)"
            >
              {copiedStatsBoard ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              Copy Stats Board Prompt
            </button>
            <button
              type="button"
              onClick={handleCopyAllStats}
              className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded border transition-colors pointer-events-auto ${
                copiedStats
                  ? "bg-emerald-900/50 text-emerald-300 border-emerald-700/40"
                  : "border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"
              }`}
              title="Copy all player stats as plain text (for ChatGPT workflow)"
            >
              {copiedStats ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              Copy All Stats
            </button>
            <button
              type="button"
              onClick={handleRefreshPlayerData}
              className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded border border-sky-800/60 text-sky-400/80 hover:text-sky-200 hover:border-sky-600 transition-colors pointer-events-auto"
              title="Re-aggregate player data from the latest fetch — fixes stale threshold values"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh Player Data
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-zinc-600">Load player data first</span>
        )}
      </div>
      {sections.map(section => (
        <AggregatedRowSection
          key={section.key}
          label={section.label}
          statType={section.statType}
          rows={rows[section.key]}
          onRowsChange={updated => updateSection(section.key, updated)}
        />
      ))}
    </div>
  );
}

// ─── Colour grading helper ────────────────────────────────────────────────────

type RecordCellTone = "perfect" | "strong" | "solid" | "watch" | "low" | "thin_sample" | "missing";

function parseRecord(recordLabel?: string | null) {
  if (!recordLabel || recordLabel === "—") return { gamesPlayed: null, percentage: null };
  const m = recordLabel.match(/^(\d+)\/(\d+)$/);
  if (!m) return { gamesPlayed: null, percentage: null };
  const met = Number(m[1]);
  const played = Number(m[2]);
  return { gamesPlayed: played, percentage: played > 0 ? (met / played) * 100 : null };
}

function getRecordCellTone(recordLabel?: string | null): RecordCellTone {
  const { gamesPlayed, percentage } = parseRecord(recordLabel);
  if (!recordLabel || recordLabel === "—" || percentage === null || gamesPlayed === null) return "missing";
  if (gamesPlayed < 6) return "thin_sample";
  if (percentage >= 90) return "perfect";
  if (percentage >= 75) return "strong";
  if (percentage >= 60) return "solid";
  if (percentage >= 50) return "watch";
  return "low";
}

function GradeCell({ label }: { label?: string; percent?: number; gamesPlayed?: number }) {
  const tone = getRecordCellTone(label);
  const cls = tone === "thin_sample" ? "record-cell record-cell-thin_sample" : `record-cell record-cell-${tone}`;
  return <span className={cls}>{label ?? "—"}</span>;
}

/**
 * Renders a goal threshold hit-rate cell using hits/games primary display
 * with percentage in the title tooltip — same pattern as disposal cells.
 * `label` is a record string like "7/10" or undefined/absent.
 * `percent` is 0–100.
 */
function GoalHitCell({ label, percent }: { label?: string; percent?: number }) {
  if (!label || label === "—") {
    return <td className="py-1.5 px-2 text-right text-zinc-700 font-mono whitespace-nowrap tabular-nums">—</td>;
  }
  const m = label.match(/^(\d+)\/(\d+)$/);
  if (!m) {
    return <td className="py-1.5 px-2 text-right text-zinc-700 font-mono whitespace-nowrap tabular-nums">—</td>;
  }
  const games = Number(m[2]);
  if (games === 0) {
    return <td className="py-1.5 px-2 text-right text-zinc-700 font-mono whitespace-nowrap tabular-nums">—</td>;
  }
  const pct = percent != null ? Math.round(percent) : Math.round((Number(m[1]) / games) * 100);
  const colorClass =
    pct >= 80 ? "text-emerald-400" :
    pct >= 60 ? "text-sky-400" :
    pct >= 40 ? "text-amber-400" :
    "text-zinc-500";
  return (
    <td
      className={`py-1.5 px-2 text-right font-mono whitespace-nowrap tabular-nums ${colorClass}`}
      title={`${label} — ${pct}%`}
    >
      {label}
    </td>
  );
}

// ─── Availability badge ───────────────────────────────────────────────────────

const AVAIL_STATUS_CONFIG: Record<PlayerAvailabilityStatus, { label: string; cls: string }> = {
  available:  { label: "Available",  cls: "text-emerald-400 bg-emerald-950/60 border-emerald-800/60" },
  injured:    { label: "Injured",    cls: "text-red-400 bg-red-950/60 border-red-800/60" },
  suspended:  { label: "Suspended",  cls: "text-orange-400 bg-orange-950/60 border-orange-800/60" },
  omitted:    { label: "Omitted",    cls: "text-orange-400 bg-orange-950/60 border-orange-800/60" },
  managed:    { label: "Managed",    cls: "text-amber-400 bg-amber-950/60 border-amber-800/60" },
  test:       { label: "Test",       cls: "text-amber-300 bg-amber-950/60 border-amber-800/60" },
  doubtful:   { label: "Doubtful",   cls: "text-yellow-400 bg-yellow-950/60 border-yellow-800/60" },
  inactive:   { label: "Inactive",   cls: "text-zinc-400 bg-zinc-800 border-zinc-700" },
  unknown:    { label: "?",          cls: "text-zinc-500 bg-zinc-800 border-zinc-700" },
};

function AvailabilityBadge({
  status,
  reason,
}: {
  status?: PlayerAvailabilityStatus;
  reason?: string | null;
}) {
  if (!status || status === "available") return null;
  const cfg = AVAIL_STATUS_CONFIG[status] ?? AVAIL_STATUS_CONFIG.unknown;
  return (
    <span
      className={`ml-1.5 text-[8px] px-1 py-0.5 rounded border ${cfg.cls}`}
      title={reason ?? undefined}
    >
      {cfg.label}
    </span>
  );
}

// ─── Display mode labels ──────────────────────────────────────────────────────

const DISPLAY_MODE_LABELS: Record<string, string> = {
  visible:   "Visible",
  name_only: "Name only",
  blurred:   "Blur row",
  hidden:    "Hidden",
};

// ─── AggregatedRowSection ─────────────────────────────────────────────────────

type SectionFilter = "all" | "selected" | "visible" | "preview" | "unselected";
type SectionSort = "manual" | "bestRecord" | "gamesPlayed" | "l5Avg" | "playerName";
type DisposalViewMode = "stats_board" | "fine_lines";

function AggregatedRowSection({
  label,
  statType,
  rows,
  onRowsChange,
}: {
  label: string;
  statType: "disposals" | "goals";
  rows: MatchBoardPlayerRow[];
  onRowsChange: (rows: MatchBoardPlayerRow[]) => void;
}) {
  const [filter, setFilter] = useState<SectionFilter>("all");
  const [sort, setSort] = useState<SectionSort>("manual");
  const [viewMode, setViewMode] = useState<DisposalViewMode>("stats_board");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollAtEnd, setScrollAtEnd] = useState(false);
  const isDisposals = statType === "disposals";

  const activeThresholds = isDisposals
    ? (viewMode === "fine_lines" ? FINE_LINE_THRESHOLDS : STATS_BOARD_THRESHOLDS)
    : [];

  useEffect(() => {
    if (!isDisposals) return;
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setScrollAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
    check();
    el.addEventListener("scroll", check, { passive: true });
    return () => el.removeEventListener("scroll", check);
  }, [isDisposals, rows, viewMode]);

  const selectedCount = rows.filter(r => r.selected).length;

  // Build display list
  const displayRows = useMemo(() => {
    let list = [...rows];

    // Apply filter
    if (filter === "selected") list = list.filter(r => r.selected);
    else if (filter === "visible") list = list.filter(r => r.selected && r.displayMode === "visible");
    else if (filter === "preview") list = list.filter(r => r.selected && (r.displayMode === "name_only" || r.displayMode === "blurred"));
    else if (filter === "unselected") list = list.filter(r => !r.selected);
    else {
      // "all": selected first, then unselected
      const sel = list.filter(r => r.selected).sort((a, b) => a.sortOrder - b.sortOrder);
      const unsel = list.filter(r => !r.selected);
      list = [...sel, ...unsel];
    }

    // Apply sort (only to unselected; selected always by sortOrder when "manual")
    if (sort !== "manual") {
      list.sort((a, b) => {
        if (a.selected !== b.selected) return a.selected ? -1 : 1;
        switch (sort) {
          case "bestRecord":   return b.bestPercent - a.bestPercent;
          case "gamesPlayed":  return b.maxGamesPlayed - a.maxGamesPlayed;
          case "l5Avg":        return b.l5Avg - a.l5Avg;
          case "playerName":   return a.playerName.localeCompare(b.playerName);
          default:             return 0;
        }
      });
    }

    return list;
  }, [rows, filter, sort]);

  // Dev-only: log Logan McDonald goals when this section renders
  if (process.env.NODE_ENV !== "production" && statType === "goals") {
    const logan = rows.find(r => r.playerName === "Logan McDonald");
    if (logan) {
      console.group(`[SocialPlanner UI Check] Logan McDonald goals — ${label} table`);
      console.log("t1:", logan.t1, "t2:", logan.t2, "t3:", logan.t3);
      console.log("l5Avg:", logan.l5Avg, "maxGamesPlayed:", logan.maxGamesPlayed);
      console.groupEnd();
    }
  }

  function updateRow(key: string, patch: Partial<MatchBoardPlayerRow>) {
    onRowsChange(rows.map(r => r.key === key ? { ...r, ...patch } : r));
  }

  function toggleSelected(key: string) {
    const row = rows.find(r => r.key === key);
    if (!row) return;
    if (row.selected) {
      // Deselect: clear sort order
      onRowsChange(rows.map(r => r.key === key ? { ...r, selected: false, sortOrder: 0 } : r));
    } else {
      // Select: assign next sort order
      const maxOrder = Math.max(0, ...rows.filter(r => r.selected).map(r => r.sortOrder));
      onRowsChange(rows.map(r => r.key === key ? { ...r, selected: true, sortOrder: maxOrder + 1 } : r));
    }
  }

  function setDisplayMode(key: string, mode: MatchBoardPlayerRow["displayMode"]) {
    updateRow(key, { displayMode: mode });
  }

  function quickSelect(n: number) {
    onRowsChange(rows.map((r, i) => ({
      ...r,
      selected: i < n,
      sortOrder: i < n ? i : 0,
      displayMode: i < n ? r.displayMode : "visible" as const,
    })));
  }

  function clearAll() {
    onRowsChange(rows.map(r => ({ ...r, selected: false, sortOrder: 0 })));
  }

  function resetRecommended() {
    // Re-apply default based on current sort order (top 8 for free game, top 3 visible + 4-8 name_only)
    onRowsChange(rows.map((r, i) => ({
      ...r,
      selected: i < 8,
      sortOrder: i < 8 ? i : 0,
      displayMode: i < 3 ? "visible" as const : (i < 8 ? "name_only" as const : "visible" as const),
    })));
  }

  function bulkSetMode(mode: MatchBoardPlayerRow["displayMode"]) {
    onRowsChange(rows.map(r => r.selected ? { ...r, displayMode: mode } : r));
  }

  // Reorder helpers (operate on selected rows by sortOrder)
  function moveRow(key: string, direction: "up" | "down" | "top" | "bottom") {
    const selected = rows.filter(r => r.selected).sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = selected.findIndex(r => r.key === key);
    if (idx === -1) return;

    let newIdx: number;
    if (direction === "up") newIdx = Math.max(0, idx - 1);
    else if (direction === "down") newIdx = Math.min(selected.length - 1, idx + 1);
    else if (direction === "top") newIdx = 0;
    else newIdx = selected.length - 1;

    if (newIdx === idx) return;

    // Swap sortOrders
    const reordered = [...selected];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(newIdx, 0, moved);
    const keyToOrder = new Map(reordered.map((r, i) => [r.key, i]));

    onRowsChange(rows.map(r => ({
      ...r,
      sortOrder: r.selected ? (keyToOrder.get(r.key) ?? r.sortOrder) : r.sortOrder,
    })));
  }

  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-zinc-800/60 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{label}</p>
            <span className="text-[10px] text-zinc-600">{selectedCount}/{rows.length} selected</span>
          </div>
          {/* Quick select */}
          <div className="flex items-center gap-1 flex-wrap">
            {[3, 5, 8, 10].map(n => (
              <button key={n} onClick={() => quickSelect(n)}
                className="text-[9px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors">
                Top {n}
              </button>
            ))}
            <button onClick={clearAll}
              className="text-[9px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors">
              Clear
            </button>
            <button onClick={resetRecommended}
              className="text-[9px] px-1.5 py-0.5 rounded border border-sky-800/60 text-sky-400/80 hover:text-sky-200 hover:border-sky-600 transition-colors">
              Reset
            </button>
          </div>
        </div>

        {/* Bulk display mode + filters + sort */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] text-zinc-600">Bulk:</span>
          {(["visible", "name_only", "blurred", "hidden"] as const).map(mode => (
            <button key={mode} onClick={() => bulkSetMode(mode)}
              className="text-[9px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors">
              {DISPLAY_MODE_LABELS[mode]}
            </button>
          ))}
          <span className="text-[9px] text-zinc-600 ml-2">Filter:</span>
          <select value={filter} onChange={e => setFilter(e.target.value as SectionFilter)}
            className="text-[9px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-400 focus:outline-none">
            <option value="all">All</option>
            <option value="selected">Selected</option>
            <option value="visible">Visible</option>
            <option value="preview">Preview</option>
            <option value="unselected">Unselected</option>
          </select>
          <select value={sort} onChange={e => setSort(e.target.value as SectionSort)}
            className="text-[9px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-400 focus:outline-none">
            <option value="manual">Manual order</option>
            <option value="bestRecord">Best record</option>
            <option value="gamesPlayed">Games played</option>
            <option value="l5Avg">L5 avg</option>
            <option value="playerName">Player name</option>
          </select>
        </div>
        {/* View-mode segmented control — disposals only */}
        {isDisposals && (
          <div className="flex items-center gap-2">
            <div className="flex rounded border border-zinc-700 overflow-hidden text-[9px]">
              <button
                onClick={() => setViewMode("stats_board")}
                className={`px-2 py-0.5 transition-colors ${viewMode === "stats_board" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                Board Lines
              </button>
              <button
                onClick={() => setViewMode("fine_lines")}
                className={`px-2 py-0.5 border-l border-zinc-700 transition-colors ${viewMode === "fine_lines" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                Fine Lines
              </button>
            </div>
            {viewMode === "stats_board" && (
              <span className="text-[9px] text-zinc-600">Post 2 uses 15+, 20+, 25+ and 30+.</span>
            )}
            {viewMode === "fine_lines" && (
              <span className="text-[9px] text-amber-500/80">Stats Board prompt remains 15+/20+/25+/30+.</span>
            )}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-[10px] text-zinc-600 px-3 py-3">No player data for this section.</p>
      ) : (
        <div className="relative">
        <div ref={scrollRef} className="overflow-x-auto touch-pan-x overscroll-x-contain" style={{ scrollbarWidth: "thin", scrollbarColor: "rgb(63 63 70) transparent" } as React.CSSProperties}>
          <table className={`w-full text-[10px]${isDisposals ? " min-w-max" : ""}`}>
            <thead>
              <tr className="border-b border-zinc-800/40">
                <th className="px-1.5 py-1.5 text-zinc-500 font-medium w-6">On</th>
                <th className="px-1 py-1.5 text-zinc-500 font-medium w-14">Order</th>
                <th className="text-left px-2 py-1.5 text-zinc-500 font-medium sticky left-0 bg-zinc-900 z-10">Player</th>
                <th className="text-right px-2 py-1.5 text-zinc-500 font-medium">L5</th>
                {isDisposals ? (
                  activeThresholds.map(t => (
                    <th key={t} className={`text-right py-1.5 px-1 font-medium whitespace-nowrap ${
                      t % 5 === 0
                        ? viewMode === "fine_lines" ? "text-zinc-300" : "text-zinc-400"
                        : "text-zinc-600"
                    }`}>{t}+</th>
                  ))
                ) : (
                  <>
                    <th className="text-right px-2 py-1.5 text-zinc-500 font-medium">1+</th>
                    <th className="text-right px-2 py-1.5 text-zinc-500 font-medium">2+</th>
                    <th className="text-right px-2 py-1.5 text-zinc-500 font-medium">3+</th>
                  </>
                )}
                <th className="text-right px-2 py-1.5 text-zinc-500 font-medium">Display</th>
                <th className="text-right px-1.5 py-1.5 text-zinc-500 font-medium">Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/20">
              {displayRows.map(row => {
                const rowClass = row.selected
                  ? row.displayMode === "hidden"   ? "bg-zinc-800/10 text-zinc-600"
                  : row.displayMode === "blurred"  ? "bg-zinc-800/20 text-zinc-500"
                  : row.displayMode === "name_only" ? "bg-amber-950/10 text-zinc-400"
                  : "bg-zinc-800/40 text-zinc-200"
                  : "text-zinc-600 hover:bg-zinc-800/20";
                return (
                  <tr key={row.key} className={`transition-colors ${rowClass}`}>
                    {/* Select toggle */}
                    <td className="px-1.5 py-1.5 text-center">
                      <button
                        onClick={() => toggleSelected(row.key)}
                        className={`w-3.5 h-3.5 rounded border transition-colors inline-flex items-center justify-center ${
                          row.selected ? "bg-sky-600 border-sky-500" : "bg-zinc-800 border-zinc-600 hover:border-zinc-400"
                        }`}
                        title={row.selected ? "Deselect" : "Select"}
                      >
                        {row.selected && <Check className="w-2 h-2 text-white" />}
                      </button>
                    </td>
                    {/* Reorder — only for selected rows */}
                    <td className="px-1 py-1 text-center">
                      {row.selected ? (
                        <div className="flex items-center gap-0.5 justify-center">
                          <button onClick={() => moveRow(row.key, "top")} title="Move to top"
                            className="text-zinc-600 hover:text-zinc-300 transition-colors text-[8px] px-0.5">⇑</button>
                          <button onClick={() => moveRow(row.key, "up")} title="Move up"
                            className="text-zinc-500 hover:text-zinc-200 transition-colors text-[9px] px-0.5">↑</button>
                          <button onClick={() => moveRow(row.key, "down")} title="Move down"
                            className="text-zinc-500 hover:text-zinc-200 transition-colors text-[9px] px-0.5">↓</button>
                          <button onClick={() => moveRow(row.key, "bottom")} title="Move to bottom"
                            className="text-zinc-600 hover:text-zinc-300 transition-colors text-[8px] px-0.5">⇓</button>
                        </div>
                      ) : (
                        <span className="text-zinc-700">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-medium whitespace-nowrap sticky left-0 bg-zinc-900 z-10" style={{ boxShadow: "2px 0 4px -2px rgba(0,0,0,0.4)" }}>
                      {row.playerName}
                      {row.selected && (
                        <span className="ml-1 text-zinc-600 font-normal">#{row.sortOrder + 1}</span>
                      )}
                      <AvailabilityBadge status={row.availabilityStatus} reason={row.availabilityReason} />
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{row.l5Avg.toFixed(1)}</td>
                    {isDisposals ? (
                      activeThresholds.map(t => {
                        const entry = row.allThresholdHitRates?.[String(t)];
                        if (!entry || entry.games === 0) {
                          return <td key={t} className="py-1.5 px-1 text-right text-zinc-700 font-mono whitespace-nowrap">—</td>;
                        }
                        const rate = entry.rate > 1 ? entry.rate / 100 : entry.rate;
                        const pct = Math.round(rate * 100);
                        const colorClass =
                          pct >= 80 ? "text-emerald-400" :
                          pct >= 60 ? "text-sky-400" :
                          pct >= 40 ? "text-amber-400" :
                          "text-zinc-500";
                        const isMilestone = t % 5 === 0;
                        return (
                          <td key={t}
                            className={`py-1.5 px-1 text-right font-mono whitespace-nowrap ${colorClass} ${isMilestone ? "font-semibold" : "font-normal"}`}
                            title={`${entry.hits} of ${entry.games} — ${pct}%`}
                            aria-label={`${t} plus: ${entry.hits} hits from ${entry.games} games, ${pct} percent`}
                          >
                            {entry.hits}/{entry.games}
                          </td>
                        );
                      })
                    ) : (
                      <>
                        <GoalHitCell label={row.t1} percent={row.p1} />
                        <GoalHitCell label={row.t2} percent={row.p2} />
                        <GoalHitCell label={row.t3} percent={row.p3} />
                      </>
                    )}
                    {/* Display mode selector */}
                    <td className="px-2 py-1">
                      <div className="flex flex-col gap-0.5 items-end">
                        <select
                          disabled={!row.selected}
                          value={row.selected ? row.displayMode : "visible"}
                          onChange={e => setDisplayMode(row.key, e.target.value as MatchBoardPlayerRow["displayMode"])}
                          className={`text-[9px] rounded border px-1 py-0.5 focus:outline-none ${
                            !row.selected
                              ? "bg-zinc-900 border-zinc-800 text-zinc-700 cursor-not-allowed"
                              : row.displayMode === "visible"   ? "bg-zinc-800 border-zinc-600 text-zinc-200"
                              : row.displayMode === "name_only" ? "bg-amber-950/40 border-amber-700/60 text-amber-300"
                              : row.displayMode === "blurred"   ? "bg-zinc-800/60 border-zinc-600 text-zinc-400"
                              : "bg-zinc-900 border-zinc-700 text-zinc-600"
                          }`}
                        >
                          <option value="visible">Visible</option>
                          <option value="name_only">Name only</option>
                          <option value="blurred">Blur row</option>
                          <option value="hidden">Hidden</option>
                        </select>
                        {row.availabilityStatus && EXCLUDED_STATUSES.has(row.availabilityStatus) && !row.manualAvailabilityOverride && row.selected && (
                          <span className="text-[8px] text-red-400/80">Override needed</span>
                        )}
                      </div>
                    </td>
                    <td className="px-1.5 py-1.5 text-right">
                      <ConfidencePill tier={row.tier} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {isDisposals && !scrollAtEnd && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-zinc-900/90 to-transparent" />
        )}
        </div>
      )}
    </div>
  );
}

// ─── Spotlight Player Selector ────────────────────────────────────────────────

type SpotlightSortKey = "bestRecord" | "gamesPlayed" | "l5Avg" | "projection";

function buildSelectionFromStat(p: AFLPlayerStat, post: SocialPost): SpotlightSelection {
  const home = post.homeTeam ?? "";
  const away = post.awayTeam ?? "";
  const label = home && away ? `${home} vs ${away}` : post.title;
  return {
    playerId:           p.playerId,
    playerName:         p.playerName,
    team:               p.team,
    opponent:           p.opponent,
    gameId:             p.gameId,
    gameLabel:          label,
    statType:           p.statType,
    threshold:          p.threshold,
    thresholdLabel:     p.thresholdLabel,
    recordLabel:        p.recordLabel,
    l5Avg:              p.l5Avg,
    lastFive:           p.lastFive ?? [],
    projection:         p.projection,
    availabilityStatus: p.availabilityStatus,
    availabilityReason: p.availabilityReason ?? null,
  };
}

function SpotlightPlayerSelector({
  post,
  allPlayers,
  onUpdate,
}: {
  post: SocialPost;
  allPlayers: AFLPlayerStat[];
  onUpdate: (post: SocialPost) => void;
}) {
  const isDuo = post.contentType === "player_spotlight_duo";
  const maxSelect = isDuo ? 2 : 1;

  const [search, setSearch] = useState("");
  const [statFilter, setStatFilter] = useState<"any" | "disposals" | "goals">("any");
  const [thresholdFilter, setThresholdFilter] = useState<string>("any");
  const [sortKey, setSortKey] = useState<SpotlightSortKey>("bestRecord");

  // Inline edit state: which slot key is being edited, plus draft selections
  const [editingSlotKey, setEditingSlotKey] = useState<string | null>(null);
  const [editSearch, setEditSearch] = useState("");
  const [editStatFilter, setEditStatFilter] = useState<"any" | "disposals" | "goals">("any");
  const [editThreshold, setEditThreshold] = useState<string>("any");
  const [editDraft, setEditDraft] = useState<AFLPlayerStat | null>(null);

  // All unique thresholds available in the data (for the threshold picker)
  const availableThresholds = useMemo(() => {
    const seen = new Set<string>();
    for (const p of allPlayers) seen.add(p.thresholdLabel);
    return Array.from(seen).sort();
  }, [allPlayers]);

  // All rows (not deduped) — spotlight can show any threshold row per player
  const candidates = useMemo(() => {
    let list = allPlayers.filter(p => p.confidenceTier !== "thin_sample");

    if (statFilter !== "any") list = list.filter(p => p.statType === statFilter);
    if (thresholdFilter !== "any") list = list.filter(p => p.thresholdLabel === thresholdFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p => p.playerName.toLowerCase().includes(q) || p.team.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      switch (sortKey) {
        case "bestRecord":   return b.percent !== a.percent ? b.percent - a.percent : b.gamesPlayed - a.gamesPlayed;
        case "gamesPlayed":  return b.gamesPlayed !== a.gamesPlayed ? b.gamesPlayed - a.gamesPlayed : b.percent - a.percent;
        case "l5Avg":        return b.l5Avg - a.l5Avg;
        case "projection":   return (b.projection ?? 0) - (a.projection ?? 0);
      }
    });

    return list;
  }, [allPlayers, statFilter, thresholdFilter, search, sortKey]);

  // Edit mode candidates filtered by editSearch / editStatFilter / editThreshold
  const editCandidates = useMemo(() => {
    let list = allPlayers.filter(p => p.confidenceTier !== "thin_sample");
    if (editStatFilter !== "any") list = list.filter(p => p.statType === editStatFilter);
    if (editThreshold !== "any") list = list.filter(p => p.thresholdLabel === editThreshold);
    if (editSearch.trim()) {
      const q = editSearch.trim().toLowerCase();
      list = list.filter(p => p.playerName.toLowerCase().includes(q) || p.team.toLowerCase().includes(q));
    }
    list.sort((a, b) => b.percent !== a.percent ? b.percent - a.percent : b.gamesPlayed - a.gamesPlayed);
    return list.slice(0, 30);
  }, [allPlayers, editStatFilter, editThreshold, editSearch]);

  // Available thresholds filtered to current editStatFilter
  const editThresholds = useMemo(() => {
    const seen = new Set<string>();
    const source = editStatFilter !== "any"
      ? allPlayers.filter(p => p.statType === editStatFilter)
      : allPlayers;
    for (const p of source) seen.add(p.thresholdLabel);
    return Array.from(seen).sort();
  }, [allPlayers, editStatFilter]);

  // Selected spotlight keys for quick lookup
  const selectedKeys = new Set(
    (post.selectedSpotlight ?? []).map(s => `${s.playerId}:${s.statType}:${s.threshold}`)
  );

  function startEdit(slotKey: string, s: SpotlightSelection) {
    setEditingSlotKey(slotKey);
    setEditSearch(s.playerName);
    setEditStatFilter(s.statType as "disposals" | "goals");
    setEditThreshold(s.thresholdLabel ?? "any");
    // Pre-select the current stat row as draft
    const current = allPlayers.find(
      p => p.playerId === s.playerId && p.statType === s.statType && p.threshold === s.threshold
    ) ?? null;
    setEditDraft(current);
  }

  function cancelEdit() {
    setEditingSlotKey(null);
    setEditDraft(null);
    setEditSearch("");
    setEditStatFilter("any");
    setEditThreshold("any");
  }

  function applyEdit(slotKey: string) {
    if (!editDraft) return;
    const slotIndex = (post.selectedSpotlight ?? []).findIndex(
      s => `${s.playerId}:${s.statType}:${s.threshold}` === slotKey
    );
    if (slotIndex === -1) return;

    const newSel = buildSelectionFromStat(editDraft, post);
    const nextSpotlight = (post.selectedSpotlight ?? []).map((s, i) =>
      i === slotIndex ? newSel : s
    );
    const nextPlayers = (post.selectedPlayers ?? []).map((p, i) =>
      i === slotIndex ? editDraft : p
    );

    onUpdate({
      ...post,
      selectedSpotlight: nextSpotlight,
      selectedPlayers: nextPlayers,
      spotlightPromptStale: true,
      title: buildSpotlightTitle(post.contentType, nextPlayers),
      updatedAt: new Date().toISOString(),
    });
    cancelEdit();
  }

  function selectPlayer(p: AFLPlayerStat) {
    const key = `${p.playerId}:${p.statType}:${p.threshold}`;
    const sel = buildSelectionFromStat(p, post);
    let nextSpotlight: SpotlightSelection[];
    let nextPlayers: AFLPlayerStat[];

    if (selectedKeys.has(key)) {
      // Deselect
      nextSpotlight = (post.selectedSpotlight ?? []).filter(
        s => !(s.playerId === p.playerId && s.statType === p.statType && s.threshold === p.threshold)
      );
      nextPlayers = post.selectedPlayers.filter(s => s.playerId !== p.playerId);
    } else if ((post.selectedSpotlight ?? []).length >= maxSelect) {
      // Replace last
      nextSpotlight = [...(post.selectedSpotlight ?? []).slice(0, maxSelect - 1), sel];
      nextPlayers = [...post.selectedPlayers.slice(0, maxSelect - 1), p];
    } else {
      nextSpotlight = [...(post.selectedSpotlight ?? []), sel];
      nextPlayers = [...post.selectedPlayers, p];
    }

    onUpdate({
      ...post,
      selectedSpotlight: nextSpotlight,
      selectedPlayers:   nextPlayers,
      spotlightPromptStale: nextSpotlight.length > 0,
      title: buildSpotlightTitle(post.contentType, nextPlayers),
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="space-y-3">
      {/* Currently selected */}
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
          Selected ({(post.selectedSpotlight ?? []).length}/{maxSelect})
        </p>
        {(post.selectedSpotlight ?? []).length === 0 ? (
          <p className="text-[10px] text-zinc-600">No players selected — choose from candidates below.</p>
        ) : (
          <div className="space-y-1.5">
            {(post.selectedSpotlight ?? []).map(s => {
              const slotKey = `${s.playerId}:${s.statType}:${s.threshold}`;
              const isExcluded = s.availabilityStatus && EXCLUDED_STATUSES.has(s.availabilityStatus);
              const isEditing = editingSlotKey === slotKey;

              if (isEditing) {
                return (
                  <div key={slotKey} className="rounded border border-amber-700/50 bg-amber-950/20 p-2.5 space-y-2">
                    <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Edit player slot</p>

                    {/* Search + stat filter + threshold filter */}
                    <div className="flex gap-1.5 flex-wrap">
                      <div className="relative flex-1 min-w-[130px]">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
                        <input
                          type="text"
                          placeholder="Search player or team..."
                          value={editSearch}
                          onChange={e => setEditSearch(e.target.value)}
                          className="w-full pl-6 pr-2 py-1 text-[11px] bg-zinc-900 border border-zinc-700 rounded text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-amber-600"
                          autoFocus
                        />
                      </div>
                      <select
                        value={editStatFilter}
                        onChange={e => { setEditStatFilter(e.target.value as typeof editStatFilter); setEditThreshold("any"); }}
                        className="text-[11px] bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-300 focus:outline-none focus:border-amber-600"
                      >
                        <option value="any">Any stat</option>
                        <option value="disposals">Disposals</option>
                        <option value="goals">Goals</option>
                      </select>
                      <select
                        value={editThreshold}
                        onChange={e => setEditThreshold(e.target.value)}
                        className="text-[11px] bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-300 focus:outline-none focus:border-amber-600"
                      >
                        <option value="any">Any threshold</option>
                        {editThresholds.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    {/* Draft preview */}
                    {editDraft && (
                      <div className="rounded border border-sky-700/40 bg-sky-950/30 px-2.5 py-1.5">
                        <span className="text-[11px] font-medium text-sky-200">{editDraft.playerName}</span>
                        <span className="text-[10px] text-zinc-500 ml-1.5">
                          {editDraft.team} · {editDraft.statType === "disposals" ? "Disp" : "Goals"} {editDraft.thresholdLabel} · {editDraft.recordLabel}
                        </span>
                        {editDraft.lastFive && editDraft.lastFive.length > 0 && (
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-[9px] text-zinc-600">L5:</span>
                            <div className="flex gap-0.5">
                              {editDraft.lastFive.map((v, i) => (
                                <span key={i} className={`text-[9px] font-mono px-0.5 rounded ${
                                  v >= editDraft!.threshold ? "text-emerald-400 bg-emerald-950/40" : "text-zinc-500 bg-zinc-800/60"
                                }`}>{v}</span>
                              ))}
                            </div>
                            {editDraft.projection != null && (
                              <span className="text-[9px] text-sky-500">proj {editDraft.projection.toFixed(1)}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Candidate picker */}
                    {editCandidates.length > 0 && (
                      <div className="rounded border border-zinc-800 overflow-hidden max-h-48 overflow-y-auto">
                        <table className="w-full text-[10px]">
                          <tbody className="divide-y divide-zinc-800/30">
                            {editCandidates.map(p => {
                              const k = `${p.playerId}:${p.statType}:${p.threshold}`;
                              const isDraft = editDraft && `${editDraft.playerId}:${editDraft.statType}:${editDraft.threshold}` === k;
                              return (
                                <tr
                                  key={k}
                                  onClick={() => setEditDraft(p)}
                                  className={`cursor-pointer transition-colors ${isDraft ? "bg-sky-950/40" : "hover:bg-zinc-800/40"}`}
                                >
                                  <td className="px-2.5 py-1.5">
                                    <span className={`font-medium ${isDraft ? "text-sky-200" : "text-zinc-200"}`}>{p.playerName}</span>
                                    <span className="text-zinc-600 ml-1.5">{p.team}</span>
                                  </td>
                                  <td className="px-2 py-1.5 text-zinc-400 whitespace-nowrap">
                                    {p.statType === "disposals" ? "Disp" : "Goals"} {p.thresholdLabel}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{p.recordLabel}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{p.l5Avg.toFixed(1)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Apply / Cancel */}
                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        onClick={() => applyEdit(slotKey)}
                        disabled={!editDraft}
                        className="text-[11px] px-3 py-1 rounded border border-sky-700 bg-sky-900/40 text-sky-200 hover:bg-sky-800/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                      >
                        Apply
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="text-[11px] px-3 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={slotKey} className={`rounded border px-2.5 py-1.5 ${
                  isExcluded ? "bg-red-950/20 border-red-800/40" : "bg-sky-950/30 border-sky-800/40"
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className={`text-xs font-medium ${isExcluded ? "text-red-300" : "text-sky-200"}`}>
                        {s.playerName}
                      </span>
                      <span className="text-[10px] text-zinc-500 ml-1.5">
                        {s.team} · {s.statType === "disposals" ? "Disp" : "Goals"} {s.thresholdLabel} · {s.recordLabel}
                      </span>
                      <AvailabilityBadge status={s.availabilityStatus} reason={s.availabilityReason} />
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => startEdit(slotKey, s)}
                        className="text-[9px] flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:border-amber-600 hover:text-amber-300 transition-colors"
                        title="Edit player / threshold"
                      >
                        <Pencil className="w-2.5 h-2.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          const nextSpotlight = (post.selectedSpotlight ?? []).filter(
                            x => !(x.playerId === s.playerId && x.statType === s.statType && x.threshold === s.threshold)
                          );
                          const nextPlayers = post.selectedPlayers.filter(p => p.playerId !== s.playerId);
                          onUpdate({
                            ...post,
                            selectedSpotlight: nextSpotlight,
                            selectedPlayers: nextPlayers,
                            spotlightPromptStale: nextSpotlight.length > 0,
                            title: buildSpotlightTitle(post.contentType, nextPlayers),
                            updatedAt: new Date().toISOString(),
                          });
                        }}
                        className="text-[9px] text-zinc-500 hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {/* L5 data preview */}
                  {s.lastFive && s.lastFive.length > 0 ? (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[9px] text-zinc-600">L5:</span>
                      <div className="flex gap-1">
                        {s.lastFive.map((v, i) => (
                          <span key={i} className={`text-[9px] font-mono px-1 py-0.5 rounded ${
                            v >= s.threshold ? "text-emerald-400 bg-emerald-950/40" : "text-zinc-500 bg-zinc-800/60"
                          }`}>{v}</span>
                        ))}
                      </div>
                      <span className="text-[9px] text-zinc-600">avg {s.l5Avg.toFixed(1)}</span>
                      {s.projection != null && (
                        <span className="text-[9px] text-sky-500">proj {s.projection.toFixed(1)}</span>
                      )}
                    </div>
                  ) : (
                    <p className="text-[9px] text-amber-400 mt-1">No Last 5 data — prompt will be incomplete.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {post.spotlightPromptStale && (post.selectedSpotlight ?? []).length > 0 && (
          <p className="text-[9px] text-amber-400 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            Prompt out of date — refresh in Image Prompts tab.
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
          <input
            type="text"
            placeholder="Search player or team..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-6 pr-2 py-1.5 text-[11px] bg-zinc-900 border border-zinc-700 rounded text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-sky-600"
          />
        </div>
        <select
          value={statFilter}
          onChange={e => { setStatFilter(e.target.value as typeof statFilter); setThresholdFilter("any"); }}
          className="text-[11px] bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-sky-600"
        >
          <option value="any">Any stat</option>
          <option value="disposals">Disposals</option>
          <option value="goals">Goals</option>
        </select>
        <select
          value={thresholdFilter}
          onChange={e => setThresholdFilter(e.target.value)}
          className="text-[11px] bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-sky-600"
        >
          <option value="any">Any threshold</option>
          {availableThresholds.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SpotlightSortKey)}
          className="text-[11px] bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-sky-600"
        >
          <option value="bestRecord">Best record</option>
          <option value="gamesPlayed">Games played</option>
          <option value="l5Avg">L5 average</option>
          <option value="projection">Projection</option>
        </select>
      </div>

      {/* Candidate list */}
      {allPlayers.length === 0 ? (
        <div className="text-center py-8 rounded-lg border border-dashed border-zinc-800">
          <p className="text-xs text-zinc-500">No player data loaded.</p>
          <p className="text-[10px] text-zinc-600 mt-1">Generate the week to load player stats.</p>
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-center py-6 rounded-lg border border-dashed border-zinc-800">
          <p className="text-xs text-zinc-500">No players match your filters.</p>
        </div>
      ) : (
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-zinc-800/60">
                  <th className="text-left px-3 py-1.5 text-zinc-500 font-medium">Player</th>
                  <th className="text-left px-2 py-1.5 text-zinc-500 font-medium">Stat</th>
                  <th className="text-right px-2 py-1.5 text-zinc-500 font-medium">Record</th>
                  <th className="text-right px-2 py-1.5 text-zinc-500 font-medium">L5 Avg</th>
                  <th className="text-right px-2 py-1.5 text-zinc-500 font-medium">Last 5</th>
                  <th className="px-2 py-1.5 text-zinc-500 font-medium w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/20">
                {candidates.slice(0, 50).map(p => {
                  const key = `${p.playerId}:${p.statType}:${p.threshold}`;
                  const isSelected = selectedKeys.has(key);
                  const missingL5 = !p.lastFive || p.lastFive.length === 0;
                  return (
                    <tr
                      key={key}
                      className={`transition-colors ${isSelected ? "bg-sky-950/30" : "hover:bg-zinc-800/30"}`}
                    >
                      <td className="px-3 py-1.5">
                        <span className={`font-medium ${isSelected ? "text-sky-200" : "text-zinc-200"}`}>{p.playerName}</span>
                        <span className="text-zinc-600 ml-1.5">{p.team}</span>
                        <AvailabilityBadge status={p.availabilityStatus} reason={p.availabilityReason} />
                      </td>
                      <td className="px-2 py-1.5 text-zinc-400 whitespace-nowrap">
                        {p.statType === "disposals" ? "Disp" : "Goals"} {p.thresholdLabel}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{p.recordLabel}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{p.l5Avg.toFixed(1)}</td>
                      <td className="px-2 py-1.5 text-right">
                        {missingL5 ? (
                          <span className="text-amber-500 text-[9px]">no data</span>
                        ) : (
                          <div className="flex gap-0.5 justify-end">
                            {p.lastFive!.map((v, i) => (
                              <span key={i} className={`text-[9px] font-mono px-0.5 ${v >= p.threshold ? "text-emerald-400" : "text-zinc-600"}`}>{v}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          onClick={() => selectPlayer(p)}
                          className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                            isSelected
                              ? "border-sky-700 bg-sky-900/40 text-sky-300 hover:bg-red-950/40 hover:border-red-700 hover:text-red-300"
                              : "border-zinc-700 text-zinc-400 hover:border-sky-700 hover:text-sky-300 hover:bg-sky-950/20"
                          }`}
                        >
                          {isSelected ? "Remove" : "Select"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {candidates.length > 50 && (
            <p className="text-[10px] text-zinc-600 text-center py-2 border-t border-zinc-800/40">
              Showing 50 of {candidates.length} — refine your search to narrow results.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function buildSpotlightTitle(contentType: SocialPost["contentType"], players: AFLPlayerStat[]): string {
  if (contentType === "player_spotlight_duo") return "Player Duo Spotlight";
  if (players.length > 0) return `${players[0].playerName} — Form Watch`;
  return "Player Spotlight";
}

// ─── Universal Player List (editable for all non-spotlight post types) ────────

function rebuildPlayerSlides(
  post: SocialPost,
  nextPlayers: AFLPlayerStat[]
): SocialPost["carouselSlides"] {
  const slides = [...post.carouselSlides];
  // Find all player_spotlight slides (by index in player array) and update title/subtitle/rows
  let playerSlideIdx = 0;
  return slides.map(slide => {
    if (slide.slideType !== "player_spotlight") return slide;
    const p = nextPlayers[playerSlideIdx++];
    if (!p) return slide;
    return {
      ...slide,
      title: p.playerName,
      subtitle: `${p.team} · ${p.thresholdLabel} ${p.statType}: ${p.recordLabel}`,
      rows: slide.rows && slide.rows.length > 0
        ? [{ ...slide.rows[0], playerName: p.playerName, l5Avg: p.l5Avg, projection: p.projection }]
        : slide.rows,
    };
  });
}

function UniversalPlayerList({
  post,
  allPlayers,
  onUpdate,
}: {
  post: SocialPost;
  allPlayers: AFLPlayerStat[];
  onUpdate: (post: SocialPost) => void;
}) {
  const players = post.selectedPlayers;

  // Per-slot edit state, keyed by slot index
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [editSearch, setEditSearch] = useState("");
  const [editStatFilter, setEditStatFilter] = useState<"any" | "disposals" | "goals">("any");
  const [editThreshold, setEditThreshold] = useState<string>("any");
  const [editDraft, setEditDraft] = useState<AFLPlayerStat | null>(null);

  const editThresholds = useMemo(() => {
    const src = editStatFilter !== "any" ? allPlayers.filter(p => p.statType === editStatFilter) : allPlayers;
    return Array.from(new Set(src.map(p => p.thresholdLabel))).sort();
  }, [allPlayers, editStatFilter]);

  const editCandidates = useMemo(() => {
    let list = allPlayers.filter(p => p.confidenceTier !== "thin_sample");
    if (editStatFilter !== "any") list = list.filter(p => p.statType === editStatFilter);
    if (editThreshold !== "any") list = list.filter(p => p.thresholdLabel === editThreshold);
    if (editSearch.trim()) {
      const q = editSearch.trim().toLowerCase();
      list = list.filter(p => p.playerName.toLowerCase().includes(q) || p.team.toLowerCase().includes(q));
    }
    list.sort((a, b) => b.percent !== a.percent ? b.percent - a.percent : b.gamesPlayed - a.gamesPlayed);
    return list.slice(0, 30);
  }, [allPlayers, editStatFilter, editThreshold, editSearch]);

  function startEdit(idx: number) {
    const p = players[idx];
    setEditingSlot(idx);
    setEditSearch(p.playerName);
    setEditStatFilter(p.statType as "disposals" | "goals");
    setEditThreshold(p.thresholdLabel ?? "any");
    const current = allPlayers.find(
      a => a.playerId === p.playerId && a.statType === p.statType && a.threshold === p.threshold
    ) ?? p;
    setEditDraft(current);
  }

  function cancelEdit() {
    setEditingSlot(null);
    setEditDraft(null);
    setEditSearch("");
    setEditStatFilter("any");
    setEditThreshold("any");
  }

  function applyEdit(idx: number) {
    if (!editDraft) return;
    const nextPlayers = players.map((p, i) => i === idx ? editDraft : p);
    const nextSlides = rebuildPlayerSlides({ ...post, selectedPlayers: nextPlayers }, nextPlayers);
    onUpdate({
      ...post,
      selectedPlayers: nextPlayers,
      carouselSlides: nextSlides,
      updatedAt: new Date().toISOString(),
    });
    cancelEdit();
  }

  function removePlayer(idx: number) {
    const nextPlayers = players.filter((_, i) => i !== idx);
    const nextSlides = rebuildPlayerSlides({ ...post, selectedPlayers: nextPlayers }, nextPlayers);
    onUpdate({
      ...post,
      selectedPlayers: nextPlayers,
      carouselSlides: nextSlides,
      updatedAt: new Date().toISOString(),
    });
  }

  if (players.length === 0) {
    return (
      <div className="text-center py-10 text-zinc-500 rounded-lg border border-dashed border-zinc-800">
        <p className="text-sm mb-1">No players selected for this post.</p>
        <p className="text-xs text-zinc-600">Generate with player data loaded to populate this tab.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
        Players ({players.length})
        {allPlayers.length === 0 && (
          <span className="ml-2 text-zinc-600 normal-case font-normal">— load player data to enable editing</span>
        )}
      </p>

      {players.map((p, i) => {
        const isEditing = editingSlot === i;
        const isExcluded = p.availabilityStatus && EXCLUDED_STATUSES.has(p.availabilityStatus);

        if (isEditing) {
          return (
            <div key={i} className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 space-y-2">
              <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                Edit slot {i + 1} — {p.playerName}
              </p>

              <div className="flex gap-1.5 flex-wrap">
                <div className="relative flex-1 min-w-[130px]">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
                  <input
                    type="text"
                    placeholder="Search player or team..."
                    value={editSearch}
                    onChange={e => setEditSearch(e.target.value)}
                    className="w-full pl-6 pr-2 py-1.5 text-[11px] bg-zinc-900 border border-zinc-700 rounded text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-amber-600"
                    autoFocus
                  />
                </div>
                <select
                  value={editStatFilter}
                  onChange={e => { setEditStatFilter(e.target.value as typeof editStatFilter); setEditThreshold("any"); }}
                  className="text-[11px] bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-amber-600"
                >
                  <option value="any">Any stat</option>
                  <option value="disposals">Disposals</option>
                  <option value="goals">Goals</option>
                </select>
                <select
                  value={editThreshold}
                  onChange={e => setEditThreshold(e.target.value)}
                  className="text-[11px] bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-amber-600"
                >
                  <option value="any">Any threshold</option>
                  {editThresholds.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {editDraft && (
                <div className="rounded border border-sky-700/40 bg-sky-950/30 px-2.5 py-1.5">
                  <span className="text-[11px] font-medium text-sky-200">{editDraft.playerName}</span>
                  <span className="text-[10px] text-zinc-500 ml-1.5">
                    {editDraft.team} · {editDraft.statType === "disposals" ? "Disp" : "Goals"} {editDraft.thresholdLabel} · {editDraft.recordLabel}
                  </span>
                  {editDraft.lastFive && editDraft.lastFive.length > 0 && (
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="text-[9px] text-zinc-600">L5:</span>
                      <div className="flex gap-0.5">
                        {editDraft.lastFive.map((v, vi) => (
                          <span key={vi} className={`text-[9px] font-mono px-0.5 rounded ${
                            v >= editDraft!.threshold ? "text-emerald-400 bg-emerald-950/40" : "text-zinc-500 bg-zinc-800/60"
                          }`}>{v}</span>
                        ))}
                      </div>
                      {editDraft.projection != null && (
                        <span className="text-[9px] text-sky-500">proj {editDraft.projection.toFixed(1)}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {editCandidates.length > 0 && (
                <div className="rounded border border-zinc-800 overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-[10px]">
                    <tbody className="divide-y divide-zinc-800/30">
                      {editCandidates.map(c => {
                        const k = `${c.playerId}:${c.statType}:${c.threshold}`;
                        const isDraft = editDraft && `${editDraft.playerId}:${editDraft.statType}:${editDraft.threshold}` === k;
                        return (
                          <tr
                            key={k}
                            onClick={() => setEditDraft(c)}
                            className={`cursor-pointer transition-colors ${isDraft ? "bg-sky-950/40" : "hover:bg-zinc-800/40"}`}
                          >
                            <td className="px-2.5 py-1.5">
                              <span className={`font-medium ${isDraft ? "text-sky-200" : "text-zinc-200"}`}>{c.playerName}</span>
                              <span className="text-zinc-600 ml-1.5">{c.team}</span>
                            </td>
                            <td className="px-2 py-1.5 text-zinc-400 whitespace-nowrap">
                              {c.statType === "disposals" ? "Disp" : "Goals"} {c.thresholdLabel}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{c.recordLabel}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{c.l5Avg.toFixed(1)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center gap-2 pt-0.5">
                <button
                  onClick={() => applyEdit(i)}
                  disabled={!editDraft}
                  className="text-[11px] px-3 py-1.5 rounded border border-sky-700 bg-sky-900/40 text-sky-200 hover:bg-sky-800/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                >
                  Apply
                </button>
                <button
                  onClick={cancelEdit}
                  className="text-[11px] px-3 py-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          );
        }

        return (
          <div key={i} className={`rounded-lg border p-3 ${
            isExcluded ? "bg-red-950/20 border-red-800/40" : "bg-zinc-900 border-zinc-800"
          }`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className={`text-sm font-medium ${isExcluded ? "text-red-300" : "text-zinc-200"}`}>
                    {p.playerName}
                  </p>
                  <AvailabilityBadge status={p.availabilityStatus} reason={p.availabilityReason} />
                </div>
                <p className="text-[10px] text-zinc-500">{p.team}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <ConfidencePill tier={p.confidenceTier} />
                {allPlayers.length > 0 && (
                  <button
                    onClick={() => startEdit(i)}
                    className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-[9px] flex items-center justify-center gap-0.5 px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:border-amber-600 hover:text-amber-300 transition-colors"
                    title="Edit player / threshold"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                )}
                <button
                  onClick={() => removePlayer(i)}
                  className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center text-[9px] text-zinc-500 hover:text-red-400 transition-colors px-1"
                  title="Remove player"
                >
                  <span className="hidden sm:inline">Remove</span>
                  <X className="w-3 h-3 sm:hidden" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[10px] text-zinc-400 mb-2">
              <span className="col-span-3 text-zinc-500">
                {p.statType} · {p.thresholdLabel}
              </span>
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
                    className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
                      v >= p.threshold
                        ? "bg-emerald-950/50 border-emerald-800/50 text-emerald-400"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400"
                    }`}
                  >
                    {v}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Carousel Slides ─────────────────────────────────────────────────────

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
        const isDisposal = row.threshold15 != null || row.threshold20 != null;
        if (isDisposal) {
          const parts = [row.playerName, `avg ${row.l5Avg.toFixed(1)}`];
          if (row.threshold15) parts.push(`15+: ${row.threshold15}`);
          if (row.threshold20) parts.push(`20+: ${row.threshold20}`);
          if (row.threshold25) parts.push(`25+: ${row.threshold25}`);
          if (row.threshold30) parts.push(`30+: ${row.threshold30}`);
          lines.push(parts.join(" | "));
        } else {
          const parts = [row.playerName, `avg ${row.l5Avg.toFixed(1)}`];
          if (row.threshold1Goal)  parts.push(`1+: ${row.threshold1Goal}`);
          if (row.threshold2Goals) parts.push(`2+: ${row.threshold2Goals}`);
          if (row.threshold3Goals) parts.push(`3+: ${row.threshold3Goals}`);
          lines.push(parts.join(" | "));
        }
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
      cta:       "See the full board at neekostats.com.au",
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
    update("shortCaption", `${resolved}\n\nSee the full board at neekostats.com.au`);
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
    update("shortCaption",   `${resolvedHook}\n\nSee the full board at neekostats.com.au`);
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

const PROMPT_MODES: Array<{ value: PromptMode; label: string; desc: string }> = [
  { value: "full_graphic",    label: "Full Graphic",    desc: "All text, tables & stats included in prompt" },
  { value: "background_only", label: "Background Only", desc: "Clean background only — app adds text via template" },
  { value: "template_export", label: "Template Export", desc: "Slide text package for template tools" },
];

function ImagePromptsTab({
  edited,
  update,
  screenshotRefMode,
  onRefreshSpotlight,
}: {
  edited: SocialPost;
  update: <K extends keyof SocialPost>(key: K, value: SocialPost[K]) => void;
  screenshotRefMode?: ScreenshotRefMode;
  onRefreshSpotlight?: () => void;
}) {
  const [mode, setMode] = useState<PromptMode>(edited.promptMode ?? "full_graphic");
  const health = checkPromptHealth(edited);

  const fullCarouselPrompt    = buildFullCarouselPrompt(edited, screenshotRefMode);
  const slidePromptPackage    = buildSlidePromptPackage(edited, screenshotRefMode);
  const backgroundPromptPkg   = buildBackgroundPromptPackage(edited);
  const fullSlideText         = buildFullSlideTextPackage(edited);

  const slidePrompts = edited.carouselSlides.filter(s => s.imagePrompt);

  function handleModeChange(newMode: PromptMode) {
    setMode(newMode);
    update("promptMode", newMode);
  }

  const isSpotlightPost = edited.contentType === "player_spotlight" || edited.contentType === "player_spotlight_duo";
  const spotlightPrompt = isSpotlightPost ? buildSpotlightImagePrompt(edited) : null;
  const hasScreenshots = (edited.referenceScreenshots ?? []).length > 0;
  const screenshotRefActive = screenshotRefMode && screenshotRefMode !== "off";

  return (
    <div className="space-y-5">

      {/* Reference Style Assets */}
      <ReferenceScreenshotsSection edited={edited} update={update} screenshotRefMode={screenshotRefMode} />

      {/* Spotlight prompt section */}
      {isSpotlightPost && (
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60">
            <div className="flex items-center gap-2">
              <Image className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-xs font-medium text-zinc-200">Player Spotlight Prompt</span>
              {edited.spotlightPromptStale && (
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-amber-700/60 bg-amber-950/40 text-amber-400">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  Prompt out of date
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {spotlightPrompt && <CopyIconButton value={spotlightPrompt} label="Copy" />}
              {onRefreshSpotlight && (
                <button
                  onClick={onRefreshSpotlight}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-sky-700/60 bg-sky-950/40 text-sky-300 hover:bg-sky-900/60 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh AI Prompt
                </button>
              )}
            </div>
          </div>
          <div className="p-3">
            {(!edited.selectedSpotlight || edited.selectedSpotlight.length === 0) ? (
              <p className="text-[10px] text-zinc-500">No player selected — go to Game &amp; Players tab to select a player.</p>
            ) : (
              <pre className="text-[10px] text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                {spotlightPrompt}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Data health warning */}
      {!health.isComplete && (
        <div className="rounded-lg bg-amber-950/30 border border-amber-700/50 p-3">
          <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Prompt Incomplete
          </p>
          <ul className="space-y-1">
            {health.missingData.map((msg, i) => (
              <li key={i} className="text-xs text-amber-300/80">{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Prompt Mode Selector */}
      <div>
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Prompt Mode</p>
        <div className="grid grid-cols-3 gap-2">
          {PROMPT_MODES.map(m => (
            <button
              key={m.value}
              onClick={() => handleModeChange(m.value)}
              className={`rounded-lg border p-2.5 text-left transition-colors
                ${mode === m.value
                  ? "border-sky-600 bg-sky-950/40 text-sky-300"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"}`}
            >
              <p className="text-[11px] font-semibold mb-0.5">{m.label}</p>
              <p className="text-[10px] leading-tight opacity-75">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-zinc-800" />

      {/* Full Carousel Prompt */}
      {mode === "full_graphic" && (
        <>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-zinc-400" />
                <label className="text-xs font-medium text-zinc-300">Full Carousel Prompt</label>
              </div>
              <CopyIconButton value={fullCarouselPrompt} label="Copy All" />
            </div>
            <p className="text-[10px] text-zinc-500 mb-2">
              One large prompt describing all {edited.carouselSlides.length} slides together.
              Paste into Midjourney, DALL-E, or your image generator.
            </p>
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 max-h-60 overflow-y-auto">
              <pre className="text-[10px] text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap break-words">
                {fullCarouselPrompt}
              </pre>
            </div>
          </div>

          <div className="h-px bg-zinc-800" />

          {/* Slide-by-Slide Prompt Package */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-zinc-400" />
                <label className="text-xs font-medium text-zinc-300">Slide-by-Slide Prompt Package</label>
              </div>
              <CopyIconButton value={slidePromptPackage} label="Copy Package" />
            </div>
            <p className="text-[10px] text-zinc-500 mb-2">
              Separate prompts for each slide — use when generating slides individually.
            </p>
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 max-h-60 overflow-y-auto">
              <pre className="text-[10px] text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap break-words">
                {slidePromptPackage}
              </pre>
            </div>
          </div>

          <div className="h-px bg-zinc-800" />

          {/* Individual Slide Prompts */}
          {slidePrompts.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Individual Slide Prompts</p>
              <div className="space-y-3">
                {edited.carouselSlides.map((slide, i) => (
                  <IndividualSlidePromptCard key={slide.id} slide={slide} index={i} post={edited} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Background Only Prompts */}
      {mode === "background_only" && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <Image className="w-3.5 h-3.5 text-zinc-400" />
              <label className="text-xs font-medium text-zinc-300">Background Prompt Package</label>
            </div>
            <CopyIconButton value={backgroundPromptPkg} label="Copy All" />
          </div>
          <div className="rounded-lg bg-amber-950/20 border border-amber-800/30 px-3 py-2 mb-3">
            <p className="text-[10px] text-amber-300/80">
              BACKGROUND ONLY — these prompts generate clean backgrounds with no text.
              Your app or template system will overlay all text, tables and stats.
            </p>
          </div>
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 max-h-80 overflow-y-auto">
            <pre className="text-[10px] text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap break-words">
              {backgroundPromptPkg}
            </pre>
          </div>
        </div>
      )}

      {/* Template Export */}
      {mode === "template_export" && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-zinc-400" />
              <label className="text-xs font-medium text-zinc-300">Full Slide Text Package</label>
            </div>
            <CopyIconButton value={fullSlideText} label="Copy Text" />
          </div>
          <p className="text-[10px] text-zinc-500 mb-2">
            Exact text content for each slide — not an image prompt. Use with Canva, Figma, or custom templates.
          </p>
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 max-h-80 overflow-y-auto">
            <pre className="text-[10px] text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap break-words">
              {fullSlideText}
            </pre>
          </div>
        </div>
      )}

      {/* Cover image prompt (always visible) */}
      <div className="h-px bg-zinc-800" />
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-zinc-400">Cover Image Prompt</label>
          <CopyIconButton value={edited.imagePrompt} label="Copy" />
        </div>
        <textarea
          rows={4}
          value={edited.imagePrompt}
          onChange={e => update("imagePrompt", e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-sky-600 resize-none font-mono leading-relaxed"
        />
      </div>

      {/* Prompt Guidelines */}
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Prompt Guidelines</p>
        <ul className="space-y-1 text-[10px] text-zinc-500">
          <li>No page or slide numbers in any prompt</li>
          <li>No player photos on cover slides</li>
          <li>No gambling language: bet, odds, picks, lock, line, banker, multi, overs, unders</li>
          <li>No bookmaker branding or tipster phrasing</li>
          <li>Use ratios (12/12, 9/10) not percentages as main stat format</li>
          <li>Open Free Game: all rows visible, no blur</li>
          <li>Preview Blurred: top 3 visible, remainder blurred with CTA overlay</li>
        </ul>
      </div>
    </div>
  );
}

function IndividualSlidePromptCard({
  slide,
  index,
  post,
}: {
  slide: CarouselSlide;
  index: number;
  post: SocialPost;
}) {
  const slideText = buildSlideCardText(slide, index);
  const prompt    = slide.imagePrompt ?? "(no prompt generated for this slide)";

  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60">
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
            Slide {index + 1} · {slide.slideType.replace(/_/g, " ")}
          </p>
          <p className="text-xs font-medium text-zinc-200">{slide.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <CopyIconButton value={slideText} label="Text" />
          <CopyIconButton value={prompt} label="Prompt" />
        </div>
      </div>
      {/* Row preview */}
      {slide.rows && slide.rows.length > 0 && (
        <div className="px-3 py-2 border-b border-zinc-800/40 space-y-1">
          {slide.rows.map((row, ri) => (
            <div
              key={ri}
              className={`text-[10px] font-mono ${row.blurred ? "text-zinc-600 italic" : "text-zinc-400"}`}
            >
              {row.blurred
                ? "(blurred row)"
                : `${row.playerName} | avg ${row.l5Avg.toFixed(1)}`}
            </div>
          ))}
        </div>
      )}
      {/* Prompt preview */}
      {slide.imagePrompt && (
        <div className="px-3 py-2.5">
          <p className="text-[10px] text-zinc-500 mb-1">Image prompt</p>
          <p className="text-[10px] text-zinc-500 font-mono leading-relaxed line-clamp-4">
            {slide.imagePrompt}
          </p>
        </div>
      )}
    </div>
  );
}

function buildSlideCardText(slide: CarouselSlide, index: number): string {
  const lines: string[] = [`SLIDE ${index + 1}: ${slide.title}`];
  if (slide.subtitle) lines.push(slide.subtitle);
  if (slide.rows && slide.rows.length > 0) {
    lines.push("");
    for (const row of slide.rows) {
      if (row.blurred) {
        lines.push("[blurred row]");
      } else {
        const isDisposal = row.threshold15 != null || row.threshold20 != null;
        if (isDisposal) {
          const parts = [row.playerName, `avg ${row.l5Avg.toFixed(1)}`];
          if (row.threshold15) parts.push(`15+: ${row.threshold15}`);
          if (row.threshold20) parts.push(`20+: ${row.threshold20}`);
          if (row.threshold25) parts.push(`25+: ${row.threshold25}`);
          if (row.threshold30) parts.push(`30+: ${row.threshold30}`);
          lines.push(parts.join(" | "));
        } else {
          const parts = [row.playerName, `avg ${row.l5Avg.toFixed(1)}`];
          if (row.threshold1Goal)  parts.push(`1+: ${row.threshold1Goal}`);
          if (row.threshold2Goals) parts.push(`2+: ${row.threshold2Goals}`);
          if (row.threshold3Goals) parts.push(`3+: ${row.threshold3Goals}`);
          lines.push(parts.join(" | "));
        }
      }
    }
  }
  if (slide.ctaOverlayText) {
    lines.push("");
    lines.push(`CTA: ${slide.ctaOverlayText}`);
  }
  return lines.join("\n");
}

// ─── Tab: Export / Copy ───────────────────────────────────────────────────────

function ExportTab({ edited, screenshotRefMode, onRefreshSpotlight }: { edited: SocialPost; screenshotRefMode?: ScreenshotRefMode; onRefreshSpotlight?: () => void }) {
  const isSpotlightPost    = edited.contentType === "player_spotlight" || edited.contentType === "player_spotlight_duo";
  const health             = checkPromptHealth(edited);
  const fullSlideText      = buildFullSlideTextPackage(edited);
  const fullCarouselPrompt = buildFullCarouselPrompt(edited, screenshotRefMode);
  const slidePromptPkg     = buildSlidePromptPackage(edited, screenshotRefMode);
  const backgroundPkg      = buildBackgroundPromptPackage(edited);
  const fullPostPackage    = buildFullPostPackage(edited, screenshotRefMode);
  const spotlightPackage   = isSpotlightPost ? buildSpotlightFullPackage(edited, screenshotRefMode) : null;
  const spotlightPrompt    = isSpotlightPost ? buildSpotlightImagePrompt(edited) : null;

  const copyAllPackage = [
    "=== HOOK ===",
    edited.hook,
    "",
    "=== INSTAGRAM CAPTION ===",
    edited.caption,
    "",
    "=== SHORT CAPTION / STORY ===",
    edited.shortCaption,
    "",
    "=== HASHTAGS ===",
    edited.hashtags.join(" "),
    "",
    "=== FULL SLIDE TEXT ===",
    fullSlideText,
    "",
    "=== FULL CAROUSEL PROMPT ===",
    fullCarouselPrompt,
  ].join("\n");

  const fields: Array<{ label: string; value: string; multiline?: boolean; warn?: boolean }> = [
    { label: "Full Post Package",             value: fullPostPackage,    multiline: true },
    { label: "Hook",                           value: edited.hook },
    { label: "Instagram Caption",              value: edited.caption },
    { label: "Short Caption",                  value: edited.shortCaption },
    { label: "Hashtags",                       value: edited.hashtags.join(" ") },
    { label: "Full Slide Text",                value: fullSlideText,     multiline: true },
    { label: "Full Carousel Prompt",           value: fullCarouselPrompt, multiline: true, warn: !health.isComplete },
    { label: "Slide-by-Slide Prompt Package",  value: slidePromptPkg,    multiline: true },
    { label: "Background Prompt Package",      value: backgroundPkg,     multiline: true },
    { label: "Cover Image Prompt",             value: edited.imagePrompt },
  ];

  return (
    <div className="space-y-4">
      {!health.isComplete && (
        <div className="rounded-lg bg-amber-950/30 border border-amber-700/50 p-3">
          <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1">
            <AlertTriangle className="w-3 h-3 inline mr-1" />
            Incomplete prompt data
          </p>
          {health.missingData.map((msg, i) => (
            <p key={i} className="text-[10px] text-amber-300/80">• {msg}</p>
          ))}
        </div>
      )}

      {/* Spotlight section */}
      {isSpotlightPost && (
        <div className="rounded-lg bg-zinc-900 border border-sky-800/40 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60 bg-sky-950/20">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-sky-400 uppercase tracking-wider">Player Spotlight</span>
              {edited.spotlightPromptStale && (
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-amber-700/60 bg-amber-950/40 text-amber-400">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  Prompt out of date
                </span>
              )}
            </div>
            {onRefreshSpotlight && (
              <button
                onClick={onRefreshSpotlight}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-sky-700/60 bg-sky-950/40 text-sky-300 hover:bg-sky-900/60 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh AI Prompt
              </button>
            )}
          </div>
          <div className="p-3 space-y-3">
            {spotlightPrompt && (
              <CopyField label="Player Spotlight Image Prompt" value={spotlightPrompt} multiline />
            )}
            {spotlightPackage && (
              <CopyField label="Full Spotlight Package" value={spotlightPackage} multiline />
            )}
          </div>
        </div>
      )}

      {/* Copy All button */}
      <CopyField
        label="Copy Everything (Hook + Caption + Slides + Prompt)"
        value={copyAllPackage}
        multiline
        highlight
      />

      {fields.map(f => (
        <CopyField key={f.label} label={f.label} value={f.value} multiline={f.multiline} warn={f.warn} />
      ))}
    </div>
  );
}

function CopyField({ label, value, multiline = false, warn = false, highlight = false }: { label: string; value: string; multiline?: boolean; warn?: boolean; highlight?: boolean }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className={`rounded-lg border overflow-hidden ${warn ? "border-amber-800/50 bg-amber-950/20" : highlight ? "border-sky-700/60 bg-sky-950/20" : "bg-zinc-900 border-zinc-800"}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{label}</p>
          {warn && <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />}
        </div>
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

// ─── Screenshot tag display helpers ──────────────────────────────────────────

const SCREENSHOT_TAG_LABELS: Record<ScreenshotTag, string> = {
  mobile_stat_board:  "Mobile Stat Board",
  player_card:        "Player Card",
  hit_rate_table:     "Hit Rate Table",
  recent_form_strip:  "Recent Form Strip",
  product_education:  "Product Education",
  match_board:        "Match Board",
  player_spotlight:   "Player Spotlight",
};

const ALL_SCREENSHOT_TAGS: ScreenshotTag[] = [
  "mobile_stat_board", "player_card", "hit_rate_table",
  "recent_form_strip", "product_education", "match_board", "player_spotlight",
];

const REF_MODE_LABELS: Record<ScreenshotRefMode, string> = {
  off:                     "Off",
  product_education_only:  "Product Education Only",
  all_board_style:         "All Board Style",
};

const REF_MODE_DESCRIPTIONS: Record<ScreenshotRefMode, string> = {
  off:                     "Screenshot references will NOT be injected into any prompts.",
  product_education_only:  "Screenshot references injected into Product Education prompts only.",
  all_board_style:         "Screenshot references injected into all board-style and spotlight prompts.",
};

// ─── ReferenceScreenshotsSection ─────────────────────────────────────────────

function ReferenceScreenshotsSection({
  edited,
  update,
  screenshotRefMode,
}: {
  edited: SocialPost;
  update: <K extends keyof SocialPost>(key: K, value: SocialPost[K]) => void;
  screenshotRefMode?: ScreenshotRefMode;
}) {
  const screenshots = edited.referenceScreenshots ?? [];

  const [showAddForm, setShowAddForm] = useState(false);
  const [urlInput, setUrlInput]       = useState("");
  const [labelInput, setLabelInput]   = useState("");
  const [selectedTags, setSelectedTags] = useState<ScreenshotTag[]>([]);
  const [urlError, setUrlError]       = useState("");

  const refMode: ScreenshotRefMode = screenshotRefMode ?? "off";
  const isActive = refMode !== "off";

  function toggleTag(tag: ScreenshotTag) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  }

  function handleAdd() {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setUrlError("URL is required.");
      return;
    }
    try { new URL(trimmed); } catch {
      setUrlError("Enter a valid URL (https://...).");
      return;
    }
    const newShot: ReferenceScreenshot = {
      id: crypto.randomUUID(),
      url: trimmed,
      label: labelInput.trim() || undefined,
      tags: selectedTags,
      uploadedAt: new Date().toISOString(),
    };
    update("referenceScreenshots", [...screenshots, newShot]);
    setUrlInput("");
    setLabelInput("");
    setSelectedTags([]);
    setUrlError("");
    setShowAddForm(false);
  }

  function handleRemove(id: string) {
    update("referenceScreenshots", screenshots.filter(s => s.id !== id));
  }

  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <Image className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-xs font-medium text-zinc-200">Reference Style Assets</span>
          {screenshots.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
              {screenshots.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
        >
          {showAddForm ? "Cancel" : "+ Add URL"}
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Mode status badge */}
        <div className={`flex items-start gap-2 rounded-md px-2.5 py-2 border text-[10px]
          ${isActive
            ? "bg-violet-950/30 border-violet-700/40 text-violet-300"
            : "bg-zinc-800/50 border-zinc-700/50 text-zinc-500"}`}
        >
          <span className="font-semibold shrink-0">
            Ref mode: {REF_MODE_LABELS[refMode]}
          </span>
          <span className="text-zinc-400">{REF_MODE_DESCRIPTIONS[refMode]}</span>
        </div>

        {/* Existing screenshots */}
        {screenshots.length > 0 && (
          <ul className="space-y-2">
            {screenshots.map(shot => (
              <li key={shot.id} className="flex gap-2 rounded-md bg-zinc-800/60 border border-zinc-700/60 p-2">
                <img
                  src={shot.url}
                  alt={shot.label ?? "reference"}
                  className="w-14 h-14 object-cover rounded shrink-0 bg-zinc-700"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="flex-1 min-w-0">
                  {shot.label && (
                    <p className="text-[10px] font-medium text-zinc-200 truncate mb-1">{shot.label}</p>
                  )}
                  <p className="text-[9px] text-zinc-500 truncate mb-1.5 font-mono">{shot.url}</p>
                  {shot.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {shot.tags.map(tag => (
                        <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700/80 text-zinc-300 border border-zinc-600/50">
                          {SCREENSHOT_TAG_LABELS[tag]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleRemove(shot.id)}
                  className="text-zinc-600 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                  title="Remove"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {screenshots.length === 0 && !showAddForm && (
          <p className="text-[10px] text-zinc-600">
            No reference screenshots added. Add a URL to inject style reference language into AI prompts.
          </p>
        )}

        {/* Add form */}
        {showAddForm && (
          <div className="rounded-md bg-zinc-800/60 border border-zinc-700/60 p-3 space-y-2.5">
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 mb-1">Screenshot URL *</label>
              <input
                type="url"
                value={urlInput}
                onChange={e => { setUrlInput(e.target.value); setUrlError(""); }}
                placeholder="https://..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-600"
              />
              {urlError && <p className="text-[10px] text-red-400 mt-1">{urlError}</p>}
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 mb-1">Label (optional)</label>
              <input
                type="text"
                value={labelInput}
                onChange={e => setLabelInput(e.target.value)}
                placeholder="e.g. Mobile stat board dark theme"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-600"
              />
            </div>
            <div>
              <p className="text-[10px] font-medium text-zinc-400 mb-1.5">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_SCREENSHOT_TAGS.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`text-[10px] px-2 py-1 rounded border transition-colors
                      ${selectedTags.includes(tag)
                        ? "bg-violet-900/50 border-violet-600/70 text-violet-200"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"}`}
                  >
                    {SCREENSHOT_TAG_LABELS[tag]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAdd}
                className="text-[10px] px-3 py-1.5 rounded bg-violet-700 hover:bg-violet-600 text-white font-medium transition-colors"
              >
                Add Screenshot
              </button>
              <button
                onClick={() => { setShowAddForm(false); setUrlInput(""); setLabelInput(""); setSelectedTags([]); setUrlError(""); }}
                className="text-[10px] px-3 py-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Education Content Inputs ────────────────────────────────────────────

const EDUCATION_PATTERNS: { value: EducationPattern; label: string; desc: string }[] = [
  { value: "feature_walkthrough",     label: "Feature Walkthrough",     desc: "Step through a specific feature or section of the app" },
  { value: "beginner_explainer",      label: "Beginner Explainer",      desc: "Introduce someone new to how the board works" },
  { value: "power_user_tips",         label: "Power User Tips",         desc: "Advanced tips for people who already use Neeko" },
  { value: "problem_solution",        label: "Problem / Solution",      desc: "Highlight a common confusion and solve it" },
  { value: "ui_spotlight",            label: "UI Spotlight",            desc: "Showcase a specific UI element or screen" },
  { value: "single_image_poster",     label: "Single Image Poster",     desc: "One striking promo or statement graphic" },
  { value: "promo_education_hybrid",  label: "Promo + Education",       desc: "Blend product education with a call to action" },
];

const EDUCATION_TONES: { value: EducationCopyTone; label: string }[] = [
  { value: "straightforward",  label: "Straightforward" },
  { value: "premium",          label: "Premium" },
  { value: "punchy",           label: "Punchy" },
  { value: "educational",      label: "Educational" },
  { value: "expert",           label: "Expert" },
];

const EDUCATION_VISUALS: { value: EducationVisualDirection; label: string }[] = [
  { value: "app_card",              label: "App Card" },
  { value: "typographic_poster",    label: "Typographic Poster" },
  { value: "screenshot_led",        label: "Screenshot Led" },
  { value: "feature_callout",       label: "Feature Callout" },
  { value: "clean_premium_promo",   label: "Clean Premium Promo" },
  { value: "dark_board_infographic", label: "Dark Board Infographic" },
];

function EducationInputsTab({
  edited,
  update,
  onRefreshSlides,
}: {
  edited: SocialPost;
  update: <K extends keyof SocialPost>(key: K, value: SocialPost[K]) => void;
  onRefreshSlides: () => void;
}) {
  const keyConcepts = edited.keyConcepts ?? [];

  function setKeyConcepts(concepts: string[]) {
    update("keyConcepts", concepts);
  }

  function addConcept() {
    setKeyConcepts([...keyConcepts, ""]);
  }

  function updateConcept(i: number, val: string) {
    const next = [...keyConcepts];
    next[i] = val;
    setKeyConcepts(next);
  }

  function removeConcept(i: number) {
    setKeyConcepts(keyConcepts.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-3">
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          Product education posts don't require player selection. Fill in the content inputs below, then click Refresh Slides to regenerate the carousel.
        </p>
      </div>

      <Field label="Topic / Title">
        <input
          type="text"
          value={edited.educationTopic ?? ""}
          onChange={e => update("educationTopic", e.target.value)}
          placeholder="e.g. How to Read the Board"
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-600"
        />
      </Field>

      <Field label="Teaching Objective">
        <input
          type="text"
          value={edited.teachingObjective ?? ""}
          onChange={e => update("teachingObjective", e.target.value)}
          placeholder="e.g. Viewer understands what hit rates mean"
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-600"
        />
      </Field>

      <Field label="Target Audience">
        <input
          type="text"
          value={edited.targetAudience ?? ""}
          onChange={e => update("targetAudience", e.target.value)}
          placeholder="e.g. AFL fans new to stat research"
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-600"
        />
      </Field>

      <Field label="Product Area / Page">
        <input
          type="text"
          value={edited.productArea ?? ""}
          onChange={e => update("productArea", e.target.value)}
          placeholder="e.g. Match Stat Board, Player Detail, Hit Rate Table"
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-600"
        />
      </Field>

      <Field label="Key Concepts (slide bullets)">
        <div className="space-y-2">
          {keyConcepts.map((c, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={c}
                onChange={e => updateConcept(i, e.target.value)}
                placeholder={`Concept ${i + 1}`}
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-600"
              />
              <button
                type="button"
                onClick={() => removeConcept(i)}
                className="text-zinc-600 hover:text-zinc-300 transition-colors p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addConcept}
            className="text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
          >
            + Add concept
          </button>
        </div>
      </Field>

      <Field label="CTA Text">
        <input
          type="text"
          value={edited.educationCta ?? ""}
          onChange={e => update("educationCta", e.target.value)}
          placeholder="e.g. See the Full Board at Neeko"
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-600"
        />
      </Field>

      <div className="border-t border-zinc-800 pt-4">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Variation Controls</p>
        <div className="space-y-4">
          <Field label="Content Pattern">
            <div className="space-y-1.5">
              {EDUCATION_PATTERNS.map(p => (
                <label key={p.value} className="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    type="radio"
                    name="educationPattern"
                    value={p.value}
                    checked={(edited.educationPattern ?? "feature_walkthrough") === p.value}
                    onChange={() => update("educationPattern", p.value)}
                    className="mt-0.5 accent-sky-500"
                  />
                  <div>
                    <span className="text-xs text-zinc-200 group-hover:text-white transition-colors">{p.label}</span>
                    <span className="block text-[10px] text-zinc-500">{p.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </Field>

          <Field label="Copy Tone">
            <div className="flex flex-wrap gap-2">
              {EDUCATION_TONES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => update("educationCopyTone", t.value)}
                  className={`text-[11px] px-2.5 py-1.5 rounded border transition-colors
                    ${(edited.educationCopyTone ?? "educational") === t.value
                      ? "bg-sky-900/50 border-sky-600/70 text-sky-200"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Visual Direction">
            <div className="flex flex-wrap gap-2">
              {EDUCATION_VISUALS.map(v => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => update("educationVisualDirection", v.value)}
                  className={`text-[11px] px-2.5 py-1.5 rounded border transition-colors
                    ${(edited.educationVisualDirection ?? "app_card") === v.value
                      ? "bg-sky-900/50 border-sky-600/70 text-sky-200"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={() => {
            update("variationSeed", (edited.variationSeed ?? 0) + 1);
            onRefreshSlides();
          }}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded border border-sky-700 bg-sky-950/60 text-sky-300 hover:bg-sky-900/60 transition-colors font-medium"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Slides
        </button>
        {edited.lastRefreshedAt && (
          <p className="text-[10px] text-zinc-600 mt-1.5">
            Last refreshed {new Date(edited.lastRefreshedAt).toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Education Screenshots & Assets ─────────────────────────────────────

function EducationAssetsTab({
  edited,
  update,
}: {
  edited: SocialPost;
  update: <K extends keyof SocialPost>(key: K, value: SocialPost[K]) => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [urlInput, setUrlInput]       = useState("");
  const [labelInput, setLabelInput]   = useState("");
  const [pageInput, setPageInput]     = useState("");
  const [noteInput, setNoteInput]     = useState("");
  const [urlError, setUrlError]       = useState("");

  const assets = edited.educationAssets ?? [];

  function addAsset() {
    if (!urlInput.trim()) { setUrlError("URL is required"); return; }
    try { new URL(urlInput.trim()); } catch { setUrlError("Enter a valid URL"); return; }
    const newAsset: EducationAsset = {
      id: crypto.randomUUID(),
      url: urlInput.trim(),
      label: labelInput.trim() || undefined,
      pageFeature: pageInput.trim() || undefined,
      note: noteInput.trim() || undefined,
      uploadedAt: new Date().toISOString(),
    };
    update("educationAssets", [...assets, newAsset]);
    setUrlInput(""); setLabelInput(""); setPageInput(""); setNoteInput(""); setUrlError("");
    setShowAddForm(false);
  }

  function removeAsset(id: string) {
    update("educationAssets", assets.filter(a => a.id !== id));
  }

  function moveAsset(id: string, dir: -1 | 1) {
    const idx = assets.findIndex(a => a.id === id);
    if (idx < 0) return;
    const next = [...assets];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    update("educationAssets", next);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-3">
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          Add screenshot references or asset URLs to include as visual references in AI image prompts for this education post. Screenshots show the Neeko UI to guide design style.
        </p>
      </div>

      {assets.length > 0 && (
        <div className="space-y-3">
          {assets.map((asset, i) => (
            <div key={asset.id} className="rounded-lg bg-zinc-900 border border-zinc-800 p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-zinc-200 truncate">
                    {asset.label || asset.pageFeature || `Asset ${i + 1}`}
                  </p>
                  {asset.pageFeature && (
                    <p className="text-[10px] text-zinc-500">{asset.pageFeature}</p>
                  )}
                  {asset.note && (
                    <p className="text-[10px] text-zinc-500 mt-0.5">{asset.note}</p>
                  )}
                  <p className="text-[10px] text-zinc-600 mt-1 truncate">{asset.url}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => moveAsset(asset.id, -1)}
                      className="text-zinc-600 hover:text-zinc-300 transition-colors px-1 text-[10px]"
                      title="Move up"
                    >
                      ↑
                    </button>
                  )}
                  {i < assets.length - 1 && (
                    <button
                      type="button"
                      onClick={() => moveAsset(asset.id, 1)}
                      className="text-zinc-600 hover:text-zinc-300 transition-colors px-1 text-[10px]"
                      title="Move down"
                    >
                      ↓
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAsset(asset.id)}
                    className="text-zinc-600 hover:text-red-400 transition-colors p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <img
                src={asset.url}
                alt={asset.label ?? "Screenshot reference"}
                className="w-full max-h-32 object-contain rounded border border-zinc-800 bg-zinc-950"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          ))}
        </div>
      )}

      {assets.length === 0 && !showAddForm && (
        <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-center">
          <Upload className="w-5 h-5 text-zinc-600 mx-auto mb-2" />
          <p className="text-xs text-zinc-500">No assets added yet</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">Add screenshot URLs to use as style references in AI prompts</p>
        </div>
      )}

      {!showAddForm ? (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors font-medium"
        >
          <Upload className="w-3.5 h-3.5" />
          Add screenshot / asset URL
        </button>
      ) : (
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 space-y-3">
          <p className="text-[11px] font-semibold text-zinc-300">Add Asset</p>
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 mb-1">URL *</label>
            <input
              type="url"
              value={urlInput}
              onChange={e => { setUrlInput(e.target.value); setUrlError(""); }}
              placeholder="https://..."
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-600"
            />
            {urlError && <p className="text-[10px] text-red-400 mt-1">{urlError}</p>}
          </div>
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 mb-1">Label</label>
            <input
              type="text"
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              placeholder="e.g. Stat board dark theme"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-600"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 mb-1">Page / Feature</label>
            <input
              type="text"
              value={pageInput}
              onChange={e => setPageInput(e.target.value)}
              placeholder="e.g. Match Stat Board, Player Detail"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-600"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 mb-1">Note</label>
            <input
              type="text"
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              placeholder="Short note for the AI prompt context"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-600"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={addAsset}
              className="text-[10px] px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 text-white font-medium transition-colors"
            >
              Add Asset
            </button>
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setUrlInput(""); setLabelInput(""); setPageInput(""); setNoteInput(""); setUrlError(""); }}
              className="text-[10px] px-3 py-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}