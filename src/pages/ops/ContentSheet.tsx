import { useState, useEffect, useMemo, useRef, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

let _logoDataUrl = "";
import * as ReactDOM from 'react-dom/client';
import { getFontEmbedCSS, toBlob } from "html-to-image";
import { supabase } from "@/lib/supabaseClient";

const ANTON_FONT = "'Anton', Impact, sans-serif";
function antonFit(s: string, base: number): number {
  if (s.length <= 16) return base;
  if (s.length <= 24) return Math.round(base * 0.78);
  return Math.round(base * 0.62);
}
function splitHook(hook: string): [string, string] {
  const dot = hook.indexOf('.');
  if (dot === -1 || dot === hook.length - 1) return [hook, ''];
  return [hook.slice(0, dot + 1).trim(), hook.slice(dot + 1).trim()];
}
function AntonStyle() {
  return <style dangerouslySetInnerHTML={{ __html: `@font-face { font-family: "Anton"; src: url("/fonts/Anton-Regular.woff2") format("woff2"); font-style: normal; font-weight: 400; font-display: swap; }` }} />;
}

// Generate fully-embedded font CSS once (from the locally-hosted Anton font)
// so exported PNGs render Anton without any runtime Google Fonts request.
// Cached module-level so repeated downloads reuse the same promise.
let embeddedFontCSSPromise: Promise<string> | null = null;

function getEmbeddedFontCSS(node: HTMLElement): Promise<string> {
  if (!embeddedFontCSSPromise) {
    embeddedFontCSSPromise = getFontEmbedCSS(node).catch((error) => {
      embeddedFontCSSPromise = null;
      console.warn(
        "[ContentSheet] Could not prepare embedded font CSS. Falling back to Impact.",
        error,
      );
      return "";
    });
  }
  return embeddedFontCSSPromise;
}

// Shared PNG export: prepares embedded font CSS, renders the node to a blob,
// triggers a download, and surfaces a visible error if anything fails.
// Never throws — callers can await it without their own try/catch.
async function exportNodeToPNG(
  node: HTMLElement,
  filename: string,
  setDownloading: (v: boolean) => void,
  setExportError: (msg: string | null) => void,
): Promise<void> {
  setDownloading(true);
  setExportError(null);
  document.body.style.overflow = 'hidden';
  try {
    const fontEmbedCSS = await getEmbeddedFontCSS(node);
    const blob = await toBlob(node, {
      width: 1080,
      height: 1920,
      pixelRatio: 1,
      backgroundColor: "#050505",
      fontEmbedCSS,
      style: { transform: "scale(1)", transformOrigin: "top left" },
    });
    if (!blob) {
      throw new Error("Image rendering returned no blob.");
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("[ContentSheet] PNG export failed:", error);
    setExportError("Download failed. Please try again.");
  } finally {
    document.body.style.overflow = '';
    setDownloading(false);
  }
}

// Shared carousel export: renders each stack slide to its own PNG. Reuses the
// cached embedded font CSS. Surfaces a visible error if the batch fails.
async function exportStackToPNG(
  stack: { player_name: string }[],
  renderSlide: (row: { player_name: string }, index: number, total: number) => Promise<HTMLElement>,
  setCarouselLoading: (v: boolean) => void,
  setExportError: (msg: string | null) => void,
  filenamePrefix = "neeko_slide",
): Promise<void> {
  setCarouselLoading(true);
  setExportError(null);
  document.body.style.overflow = 'hidden';
  try {
    // Prime the font CSS cache with a representative node.
    const primer = await renderSlide(stack[0], 0, stack.length);
    const fontEmbedCSS = await getEmbeddedFontCSS(primer);
    for (let i = 0; i < stack.length; i++) {
      const row = stack[i];
      const node = await renderSlide(row, i, stack.length);
      const blob = await toBlob(node, {
        width: 1080, height: 1920, pixelRatio: 1,
        backgroundColor: "#050505", fontEmbedCSS,
        style: { transform: "scale(1)", transformOrigin: "top left" },
      });
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const surname = (row.player_name.split(' ').pop() ?? row.player_name).replace(/[^a-zA-Z0-9-]/g, "");
        a.download = `${filenamePrefix}_${String(i + 1).padStart(2, "0")}_${surname}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
      await new Promise(r => setTimeout(r, 80));
    }
  } catch (error) {
    console.error("[ContentSheet] Carousel export failed:", error);
    setExportError("Carousel export failed. Please try again.");
  } finally {
    document.body.style.overflow = '';
    setCarouselLoading(false);
  }
}

// ── Shared modal building blocks ─────────────────────────────────────────────

function useBodyScrollLock(isOpen: boolean) {
  const savedScrollY = useRef(0);
  const saved = useRef<Record<string, string>>({});
  const locked = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    if (!locked.current) {
      savedScrollY.current = window.scrollY;
      saved.current = {
        position: document.body.style.position,
        top: document.body.style.top,
        left: document.body.style.left,
        right: document.body.style.right,
        width: document.body.style.width,
        overflow: document.body.style.overflow,
        htmlOverflow: document.documentElement.style.overflow,
      };
      document.body.style.position = "fixed";
      document.body.style.top = `-${savedScrollY.current}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      locked.current = true;
    }
    return () => {
      if (locked.current) {
        document.body.style.position = saved.current.position;
        document.body.style.top = saved.current.top;
        document.body.style.left = saved.current.left;
        document.body.style.right = saved.current.right;
        document.body.style.width = saved.current.width;
        document.body.style.overflow = saved.current.overflow;
        document.documentElement.style.overflow = saved.current.htmlOverflow;
        window.scrollTo(0, savedScrollY.current);
        locked.current = false;
      }
    };
  }, [isOpen]);
}

function CardModalShell({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useBodyScrollLock(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    prevFocus.current = document.activeElement as HTMLElement;
    const t = setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (el ?? panelRef.current)?.focus();
    }, 50);
    return () => {
      clearTimeout(t);
      prevFocus.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const f = panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (f.length === 0) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100dvh",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.8)",
        overscrollBehavior: "contain",
        paddingTop: "max(12px, env(safe-area-inset-top))",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        paddingLeft: "max(12px, env(safe-area-inset-left))",
        paddingRight: "max(12px, env(safe-area-inset-right))",
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="rounded-2xl border border-zinc-700 bg-zinc-900 w-full max-w-[480px]"
        style={{
          maxHeight: "100dvh",
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div className="flex items-center justify-between gap-4 p-4 sticky top-0 bg-zinc-900 border-b border-zinc-800 z-10">
          <label id={headingId} className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{title}</label>
          <button onClick={onClose} aria-label="Close dialog" className="text-zinc-400 hover:text-zinc-100 text-lg leading-none min-h-[44px] min-w-[44px] flex items-center justify-center">
            ✕
          </button>
        </div>
        <div className="p-4 space-y-4">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

function CardPreview({ children, maxWidth = 380 }: { children: ReactNode; maxWidth?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.32);

  useEffect(() => {
    function update() {
      const el = ref.current;
      if (!el) return;
      setScale(el.clientWidth / 1080);
    }
    update();
    const ro = new ResizeObserver(update);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        width: `min(100%, ${maxWidth}px)`,
        aspectRatio: "9 / 16",
        overflow: "hidden",
        borderRadius: 12,
        margin: "0 auto",
      }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: 1080, height: 1920 }}>
        {children}
      </div>
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

interface StatBoardMatch {
  game_id: number;
  week: number;
  label: string;
  game_date: string;
}

interface ThresholdHit {
  hits: number;
  rate: number;
  games: number;
}

interface StatBoardPlayer {
  player_id: number;
  player_name: string;
  team_name: string;
  opponent_team_name: string;
  match_id: number;
  match_label: string;
  is_home: boolean;
  lens: string;
  games_played: number;
  projection: number | null;
  threshold: number | null;
  hit_rate_last_10: number | null;
  last_10_values: number[] | null;
  season_threshold_hit_rates: Record<string, ThresholdHit> | null;
  season_avg: string | null;
  last_5_avg: string | null;
  last_3_avg: string | null;
  position_group: string | null;
  player_status: string;
  is_locked: boolean;
}

type FormWindow = "L5" | "L3";
type StoryType = "All" | "HitRates" | "Form" | "Prices" | "Evergreen" | "Results" | "Career" | "Board";

type BoardSummary = {
  round_number: number;
  featured: number;
  hits: number;
  misses: number;
  ungraded: number;
};

type BoardRow = {
  id: string;
  round_number: number;
  player_name: string;
  team_name: string | null;
  stat_label: string;
  lens: string;
  threshold: number;
  actual_hit: boolean | null;
  actual_value: number | null;
  notes: string | null;
  created_at: string;
  graded_at: string | null;
};

interface FormRow {
  player_name: string;
  team_name: string;
  opponent_team_name: string;
  position: string;
  lens: string;
  season_avg: number;
  last_5_avg: number;
  last_3_avg: number;
  games_played: number;
  player_status: string;
  delta: number;
  tag: "HOT" | "COLD";
  match_id: number;
  match_label: string;
}

interface RankedRow {
  player_name: string;
  team_name: string;
  opponent_team_name: string;
  match_id: number;
  match_label: string;
  lens: string;
  threshold: number;
  hits: number;
  games: number;
  rate: number;
  season_avg: number | null;
  gap: number | null;
  player_status: string;
  last_5_avg: number | null;
  last_3_avg: number | null;
  last_10_values: number[];
}

type StackRow = RankedRow | FormRow;

function stackKey(row: StackRow): string {
  if ("lens" in row && "threshold" in row) {
    return `hr|${row.player_name}|${row.lens}|${row.threshold}`;
  }
  return `form|${row.player_name}`;
}

function fantasyStackKey(row: FantasyRow): string {
  return `fantasy|${row.player_name}|${row.match_id ?? 0}`;
}

// ── Config ───────────────────────────────────────────────────────────────────

const LENSES = ["disposals", "goals", "marks", "tackles", "kicks", "fantasy"] as const;
type Lens = (typeof LENSES)[number];

const KEY_THRESHOLDS: Record<Lens, number[]> = {
  disposals: [15, 20, 25, 30],
  goals: [1, 2, 3],
  marks: [6, 8],
  tackles: [4, 6],
  kicks: [10, 15],
  fantasy: [80, 100, 120],
};

const FORM_DELTA_MIN: Record<string, number> = {
  fantasy:   10,
  disposals: 4,
  kicks:      3,
  marks:      2,
  tackles:    2,
  goals:      0.5,
};

const FORM_LENS_CAP = 8;
const FORM_LENS_ORDER: string[] = ["fantasy", "disposals", "kicks", "marks", "tackles", "goals"];

const LENS_LABELS: Record<Lens, string> = {
  disposals: "Disposals",
  goals: "Goals",
  marks: "Marks",
  tackles: "Tackles",
  kicks: "Kicks",
  fantasy: "Fantasy",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusTag(status: string): { label: string; cls: string } {
  const s = (status ?? "").toLowerCase();
  if (s === "out" || s === "injured") return { label: "OUT", cls: "bg-red-900/60 text-red-300" };
  if (s === "test") return { label: "TEST", cls: "bg-yellow-900/60 text-yellow-300" };
  return { label: "PLAYING", cls: "bg-green-900/60 text-green-300" };
}

function fmtGap(gap: number | null): string {
  if (gap === null) return "";
  const sign = gap >= 0 ? "+" : "";
  return `(${sign}${gap.toFixed(1)})`;
}

function makeBrief(r: RankedRow): string {
  const tag = statusTag(r.player_status).label;
  const opp = r.opponent_team_name ?? "—";
  const avg = r.season_avg !== null ? ` | season avg ${r.season_avg.toFixed(1)} ${fmtGap(r.gap)}` : "";
  return `${r.player_name} | ${r.team_name} v ${opp} | ${r.threshold}+ ${r.lens} | ${r.hits}/${r.games} (${r.rate}%)${avg} | ${tag}`;
}

const CTA_OPTIONS = [
  "FREE ON THE APP STORE",
  "BUILD ANY LINE · FREE",
  "SEE ALL 487 FREE",
  "LIVE BREAKEVENS · FREE",
  "2 FREE BOARDS EVERY WEEK",
  "HEAD-TO-HEAD · FREE",
  "SEARCH ANY PLAYER · FREE",
  "FREE TO DOWNLOAD",
  "TRY IT FREE",
] as const;

const SORT_OPTIONS = [
  { value: "default",       label: "Default" },
  { value: "hot",           label: "Hot 🔥" },
  { value: "cold",          label: "Cold 🧊" },
  { value: "l5",            label: "L5 Avg" },
  { value: "l3",            label: "L3 Avg" },
  { value: "value",         label: "Value 💎" },
  { value: "overrated",     label: "Overrated 📉" },
  { value: "expensive",     label: "Expensive 💸" },
  { value: "be",            label: "BE Pressure ⚠️" },
  { value: "consistency",   label: "Consistency ↓" },
  { value: "rank",          label: "Rank ↑" },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number];

// Scope SORT_OPTIONS by storyType so the dropdown only shows sorts whose
// underlying metric is visible on the active card. Hit Rates shows
// value/price/breakeven context (rankings join); Form shows recent-form
// context (last_5_avg vs season_avg). "All" shows hit-rate rows.
const HIT_RATE_SORTS: SortOption[] = SORT_OPTIONS.filter((o) =>
  o.value === "default" || o.value === "value" || o.value === "overrated" || o.value === "expensive" || o.value === "be"
);
const FORM_SORTS: SortOption[] = SORT_OPTIONS.filter((o) =>
  o.value === "default" || o.value === "hot" || o.value === "cold" || o.value === "l5" || o.value === "l3"
);
const PRICES_SORTS: SortOption[] = SORT_OPTIONS.filter((o) =>
  o.value === "default" || o.value === "value" || o.value === "be" || o.value === "expensive" || o.value === "overrated"
);
const EVERGREEN_SORTS: SortOption[] = SORT_OPTIONS.filter((o) =>
  o.value === "default" || o.value === "consistency" || o.value === "rank" || o.value === "value"
);
const RESULTS_SORTS: SortOption[] = SORT_OPTIONS.filter((o) => o.value === "default");

function sortOptionsFor(storyType: StoryType): SortOption[] {
  if (storyType === "Form") return FORM_SORTS;
  if (storyType === "Prices") return PRICES_SORTS;
  if (storyType === "Evergreen") return EVERGREEN_SORTS;
  if (storyType === "Results" || storyType === "Career") return RESULTS_SORTS;
  return HIT_RATE_SORTS;   // "HitRates" and "All"
}

// ── Head filters (3-head restructure) ────────────────────────────────────────
// The 7 story tabs collapse into 3 heads. Each head shows a different view
// and a different set of contextual sub-filters. Sort option sets are scoped
// per head; the underlying sort logic is wired in a later prompt.
type HeadFilter = "HitRates" | "Fantasy" | "Evergreen";

const HEAD_HITRATE_SORTS: { value: string; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "rate",    label: "Hit Rate ↓" },
  { value: "consist", label: "Most Consistent" },
  { value: "inconsist", label: "Least Consistent" },
  { value: "l5rise",  label: "L5 Riser" },
  { value: "l5drop",  label: "L5 Dropper" },
];
const HEAD_FANTASY_SORTS: { value: string; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "hot",     label: "Hot" },
  { value: "cold",    label: "Cold" },
  { value: "value",   label: "Best Value" },
  { value: "bepos",   label: "BE Positive" },
  { value: "beneg",   label: "BE Negative" },
  { value: "proj",    label: "Projected" },
];
const HEAD_EVERGREEN_SORTS: { value: string; label: string }[] = [
  { value: "mae",    label: "Accuracy MAE" },
  { value: "weekly", label: "Weekly Accuracy" },
  { value: "howto",  label: "How To Use" },
];

function headSortOptions(head: HeadFilter): { value: string; label: string }[] {
  if (head === "Fantasy") return HEAD_FANTASY_SORTS;
  if (head === "Evergreen") return HEAD_EVERGREEN_SORTS;
  return HEAD_HITRATE_SORTS;
}

type RankingsEntry = {
  player_id: number | null;
  team_id: number | null;
  value_score: number | null;
  price: number | null;
  breakeven: number | null;
  projection: number | null;
  season_avg: number | null;
  last_5_avg: number | null;
  games_played: number | null;
  position: string | null;
  team_name: string | null;
  matchup_label: string | null;
  status: string | null;
  consistency: number | null;
  consistency_tier: string | null;
  rank_position: number | null;
};
type RankingsLookup = Map<string, RankingsEntry>;

type PriceRow = {
  player_name: string;
  team_name: string;
  position: string;
  price: number;
  breakeven: number;
  projection: number;
  value_score: number;
  season_avg: number;
  last_5_avg: number;
  be_delta: number;        // breakeven - projection (positive = pressure)
  matchup_label: string | null;
  status: string;          // "active" | "OUT" etc
  story: "value" | "bargain" | "trap" | "expensive";
};

type PriceStory = PriceRow["story"];

type FantasyRow = {
  player_name: string;
  team_name: string;
  position: string;
  price: number;
  breakeven: number;
  projection: number;
  value_score: number;
  season_avg: number;      // fantasy points season avg
  last_5_avg: number;      // fantasy points L5 avg
  be_delta: number;        // breakeven - projection
  matchup_label: string | null;
  status: string;
  match_id: number | null;
};

const PRICE_STORY_META: Record<PriceStory, { label: string; badge: string; bg: string; text: string }> = {
  trap:      { label: "PRICE TRAP",  badge: "TRAP",      bg: "#EF4444", text: "#FFFFFF" },
  bargain:   { label: "BARGAIN",     badge: "BARGAIN",   bg: "#22C55E", text: "#FFFFFF" },
  expensive: { label: "EXPENSIVE",    badge: "EXPENSIVE", bg: "#F5C442", text: "#080808" },
  value:     { label: "VALUE PICK",   badge: "VALUE",    bg: "#3B82F6", text: "#FFFFFF" },
};

type AccuracySummary = {
  round_number: number;
  round_label: string;
  games_count: number;
  avg_mae: number;
  within_10_pct: number;
  over_projected_pct: number;
  under_projected_pct: number;
  best_call_name: string;
  best_call_projected: number;
  best_call_actual: number;
  worst_call_name: string;
  worst_call_projected: number;
  worst_call_actual: number;
};

type AccuracyExample = {
  player_name: string;
  team_name: string;
  projection: number;
  actual_score: number;
  error: number;
  accuracy_tier: string;
  round_label: string;
};

type EvergreenStory = "elite" | "risk" | "top_ranked" | "rising";

type EvergreenRow = {
  player_name: string;
  team_name: string;
  position: string;
  price: number;
  consistency: number;
  consistency_tier: string | null;
  rank_position: number;
  season_avg: number;
  last_5_avg: number;
  value_score: number;
  matchup_label: string | null;
  status: string;
  story: EvergreenStory;
};

const EVERGREEN_STORY_META: Record<EvergreenStory, { label: string; badge: string; bg: string; text: string }> = {
  elite:       { label: "ELITE CONSISTENCY", badge: "ELITE",      bg: "#22C55E", text: "#FFFFFF" },
  risk:        { label: "CONSISTENCY RISK",  badge: "RISK",       bg: "#EF4444", text: "#FFFFFF" },
  top_ranked:  { label: "TOP RANKED",        badge: "TOP 30",     bg: "#F5C442", text: "#080808" },
  rising:      { label: "RISING FORM",       badge: "RISING",     bg: "#3B82F6", text: "#FFFFFF" },
};

// Assign an evergreen story to a player. First match wins.
// elite:      consistency >= 75
// risk:       consistency < 45
// top_ranked: rank_position <= 30
// rising:     last_5_avg > season_avg * 1.10
// Players matching none are excluded upstream.
function assignEvergreenStory(row: Omit<EvergreenRow, "story">): EvergreenStory | null {
  if (row.consistency >= 75) return "elite";
  if (row.consistency < 45) return "risk";
  if (row.rank_position <= 30) return "top_ranked";
  if (row.last_5_avg > row.season_avg * 1.10) return "rising";
  return null;
}

// Assign a price story to a player. First match wins.
// trap:      be_delta >= 20 AND price >= 500000 (pricey player under projected pressure)
// bargain:   value_score in top 15%
