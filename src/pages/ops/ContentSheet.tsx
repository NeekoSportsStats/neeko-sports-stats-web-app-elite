import { useState, useEffect, useMemo, useRef } from "react";
import { toBlob } from "html-to-image";
import { supabase } from "@/lib/supabaseClient";

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
type StoryType = "All" | "HitRates" | "Form" | "Prices" | "Evergreen";

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
  { value: "default",    label: "Default" },
  { value: "hot",        label: "Hot 🔥" },
  { value: "cold",       label: "Cold 🧊" },
  { value: "l5",         label: "L5 Avg" },
  { value: "l3",         label: "L3 Avg" },
  { value: "value",      label: "Value 💎" },
  { value: "overrated",  label: "Overrated 📉" },
  { value: "expensive",  label: "Expensive 💸" },
  { value: "be",         label: "BE Pressure ⚠️" },
  { value: "consistency_desc", label: "Consistency ↓" },
  { value: "rank_asc",   label: "Rank ↑" },
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
  o.value === "default" || o.value === "consistency_desc" || o.value === "rank_asc" || o.value === "value"
);

function sortOptionsFor(storyType: StoryType): SortOption[] {
  if (storyType === "Form") return FORM_SORTS;
  if (storyType === "Prices") return PRICES_SORTS;
  if (storyType === "Evergreen") return EVERGREEN_SORTS;
  return HIT_RATE_SORTS;   // "HitRates" and "All"
}

type RankingsEntry = {
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
  season_high: number | null;
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

const PRICE_STORY_META: Record<PriceStory, { label: string; badge: string; bg: string; text: string }> = {
  trap:      { label: "PRICE TRAP",  badge: "TRAP",      bg: "#EF4444", text: "#FFFFFF" },
  bargain:   { label: "BARGAIN",     badge: "BARGAIN",   bg: "#22C55E", text: "#FFFFFF" },
  expensive: { label: "EXPENSIVE",    badge: "EXPENSIVE", bg: "#F5C442", text: "#080808" },
  value:     { label: "VALUE PICK",   badge: "VALUE",    bg: "#3B82F6", text: "#FFFFFF" },
};

// Assign a price story to a player. First match wins.
// trap:      be_delta >= 20 AND price >= 500000 (pricey player under projected pressure)
// bargain:   value_score in top 15% of the qualifying pool
// expensive: price >= 750000
// value:     value_score in top 30% of the qualifying pool
// Players matching none are excluded upstream.
function assignPriceStory(
  row: Omit<PriceRow, "story">,
  p85: number,   // top 15% threshold of value_score
  p70: number    // top 30% threshold of value_score
): PriceStory | null {
  if (row.be_delta >= 20 && row.price >= 500000) return "trap";
  if (row.value_score >= p85) return "bargain";
  if (row.price >= 750000) return "expensive";
  if (row.value_score >= p70) return "value";
  return null;
}

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
  story: "elite" | "risk" | "top_ranked" | "rising";
};

type EvergreenStory = EvergreenRow["story"];

type EvergreenSubFilter = "All" | EvergreenStory;

const EVERGREEN_STORY_META: Record<EvergreenStory, { label: string; bg: string; text: string }> = {
  elite:      { label: "CONSISTENCY ELITE", bg: "#22C55E", text: "#FFFFFF" },
  risk:       { label: "CONSISTENCY RISK",  bg: "#EF4444", text: "#FFFFFF" },
  top_ranked: { label: "TOP 30 RANKED",    bg: "#F5C442", text: "#080808" },
  rising:     { label: "RISING",           bg: "#3B82F6", text: "#FFFFFF" },
};

const EVERGREEN_STORY_ORDER: EvergreenStory[] = ["elite", "top_ranked", "rising", "risk"];

//
