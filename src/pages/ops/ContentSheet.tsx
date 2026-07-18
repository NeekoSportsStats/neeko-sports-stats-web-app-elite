import { useState, useEffect, useMemo, useRef } from "react";
import * as ReactDOM from 'react-dom/client';
import { toBlob } from "html-to-image";
import { supabase } from "@/lib/supabaseClient";

const ANTON_FONT_URL = "https://fonts.googleapis.com/css2?family=Anton&display=swap";
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
  return <style dangerouslySetInnerHTML={{ __html: `@import url('${ANTON_FONT_URL}');` }} />;
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
type StoryType = "All" | "HitRates" | "Form" | "Prices" | "Evergreen" | "Results";

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
  if (storyType === "Results") return RESULTS_SORTS;
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

type HookGroup = { label: string; hooks: [string, string][] };

function flattenGroups(groups: HookGroup[]): { flat: [string, string][]; starts: number[] } {
  const flat: [string, string][] = [];
  const starts: number[] = [];
  for (const g of groups) {
    starts.push(flat.length);
    flat.push(...g.hooks);
  }
  return { flat, starts };
}

function sortRows<T extends { player_name: string; last_5_avg: number | null; last_3_avg: number | null; season_avg: number | null }>(
  rows: T[],
  sortView: string,
  rankings?: RankingsLookup | null
): T[] {
  if (sortView === "default") return rows;

  if (sortView === "value" || sortView === "overrated" || sortView === "expensive" || sortView === "be") {
    return [...rows].sort((a, b) => {
      const ar = rankings?.get(a.player_name);
      const br = rankings?.get(b.player_name);
      if (!!ar !== !!br) return ar ? -1 : 1;   // no rankings match → bottom
      if (!ar || !br) return 0;
      switch (sortView) {
        case "value": {
          const av = Number(ar.value_score), bv = Number(br.value_score);
          return bv - av;   // value_score DESC
        }
        case "overrated": {
          const score = (r: RankingsEntry): number | null =>
            r.price !== null && r.price >= 600000 && r.breakeven !== null && r.projection !== null
              ? r.breakeven - r.projection
              : null;
          const as = score(ar), bs = score(br);
          if (as === null && bs === null) return 0;
          if (as === null) return 1;    // doesn't meet price gate → below
          if (bs === null) return -1;
          return bs - as;               // (breakeven - projection) DESC
        }
        case "expensive": return Number(br.price) - Number(ar.price);          // price DESC
        case "be":        return Number(br.breakeven) - Number(ar.breakeven);  // breakeven DESC
        default:          return 0;
      }
    });
  }

  return [...rows].sort((a, b) => {
    const sa = Number(a.season_avg), sb = Number(b.season_avg);
    const la = Number(a.last_5_avg), lb = Number(b.last_5_avg);
    const ta = Number(a.last_3_avg), tb = Number(b.last_3_avg);
    switch (sortView) {
      case "hot":  return (lb - sb) - (la - sa);
      case "cold": return (la - sa) - (lb - sb);
      case "l5":   return lb - la;
      case "l3":   return tb - ta;
      default:     return 0;
    }
  });
}

function applyHitSub(t: string, r: RankedRow): string {
  const misses = r.games - r.hits;
  const surname = (r.player_name.split(" ").pop() ?? r.player_name).toUpperCase();
  return t
    .replace(/\{HITS\}/g, String(r.hits))
    .replace(/\{GAMES\}/g, String(r.games))
    .replace(/\{RATE\}/g, String(r.rate))
    .replace(/\{MISSES\}/g, String(misses))
    .replace(/\{THR\}/g, String(r.threshold))
    .replace(/\{LENS\}/g, r.lens.toUpperCase())
    .replace(/\{SURNAME\}/g, surname)
    .replace(/\{SZN\}/g, r.season_avg !== null ? r.season_avg.toFixed(1) : "—");
}

function buildHitBank(r: RankedRow): HookGroup[] {
  const split = (s: string): [string, string] => {
    const idx = s.indexOf(". ");
    if (idx !== -1) return [s.slice(0, idx + 1), s.slice(idx + 2)];
    const words = s.split(" ");
    if (words.length <= 2) return [s, ""];
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  };
  const pair = (s: string): [string, string] => {
    const [a, b] = split(s);
    return [applyHitSub(a, r).toUpperCase(), applyHitSub(b, r).toUpperCase()];
  };
  return [
    { label: "The Number", hooks: [
      pair("{HITS} OF HIS LAST {GAMES}. {THR}+ {LENS}."),
      pair("{RATE}%. {THR}+ {LENS}."),
      pair("ONLY {MISSES} MISSES. ALL SEASON."),
      pair("{HITS} FROM {GAMES}. THAT'S {RATE}%."),
      pair("{HITS}/{GAMES}. {THR}+ {LENS}."),
      pair("{RATE}% OF THE TIME. {THR}+ {LENS}."),
      pair("{MISSES} MISSES IN {GAMES} GAMES."),
      pair("HIT {HITS} TIMES. MISSED {MISSES}."),
      pair("{GAMES} GAMES. {HITS} HITS. {RATE}%."),
      pair("DONE IT {HITS} TIMES THIS SEASON."),
      pair("{RATE}%. DON'T ARGUE WITH THE DATA."),
      pair("{HITS} OUT OF {GAMES}. SEASON AVG {SZN}."),
      pair("THE NUMBER IS {RATE}%."),
      pair("{MISSES} TIMES HE DIDN'T. {HITS} TIMES HE DID."),
      pair("{GAMES} GAMES. {HITS} OVER {THR}. {MISSES} UNDER."),
      pair("{RATE}%. SEASON AVERAGE {SZN}."),
      pair("SEASON AVG {SZN}. HIT RATE {RATE}%."),
      pair("{HITS} HITS. {MISSES} MISSES. {RATE}%."),
      pair("IN {GAMES} GAMES HE'S HIT {HITS}."),
      pair("{THR}+ {LENS}. {RATE}% THIS SEASON."),
    ]},
    { label: "Quiet Confidence", hooks: [
      pair("HE DOES IT ALMOST EVERY WEEK."),
      pair("IT'S NOT A FLUKE."),
      pair("THE FORM IS THERE."),
      pair("{SURNAME} SHOWS UP."),
      pair("NEARLY EVERY WEEK."),
      pair("HE'S BEEN HERE BEFORE."),
      pair("THE NUMBERS DON'T LIE."),
      pair("CONSISTENT. ALL SEASON."),
      pair("WEEK IN. WEEK OUT."),
      pair("HE HASN'T GONE AWAY."),
      pair("THE DATA BACKS IT."),
      pair("THIS ISN'T NEW."),
      pair("IT KEEPS HAPPENING."),
      pair("SAME STORY. EVERY WEEK."),
      pair("HE'S BUILT DIFFERENT."),
      pair("THE EVIDENCE IS CLEAR."),
      pair("THIS IS WHAT HE DOES."),
      pair("NO SURPRISE HERE."),
      pair("THE TRACK RECORD IS REAL."),
      pair("{HITS} TIMES. SAME PLAYER. SAME RESULT."),
    ]},
    { label: "Hype", hooks: [
      pair("BACK IT."),
      pair("THIS WEEK? BACK IT."),
      pair("DON'T OVERTHINK IT."),
      pair("IT'S SIMPLE. {RATE}%."),
      pair("STOP LOOKING. START BACKING."),
      pair("THE CASE IS CLOSED."),
      pair("LOCK. IT. IN."),
      pair("YOUR CALL. HIS TRACK RECORD."),
      pair("RUNNING HOT. DON'T FADE HIM."),
      pair("HE'S COOKING."),
      pair("FORM OF HIS LIFE."),
      pair("LIGHTS OUT."),
      pair("UNSTOPPABLE RIGHT NOW."),
      pair("ON FIRE. ALL SEASON."),
      pair("THE NUMBERS ARE SCREAMING."),
      pair("DON'T LEAVE HIM OUT."),
      pair("HE'S THAT GUY RIGHT NOW."),
      pair("THE HOTTEST PLAYER IN THE COMP."),
      pair("ELITE. NO OTHER WORD FOR IT."),
      pair("{RATE}%. AND HE'S NOT SLOWING DOWN."),
    ]},
    { label: "Contrarian", hooks: [
      pair("EVERYONE KNOWS. FEW ACT."),
      pair("THE OBVIOUS PLAY ISN'T OBVIOUS TO EVERYONE."),
      pair("WHILE OTHERS OVERTHINK IT."),
      pair("{RATE}% AND PEOPLE ARE STILL SLEEPING."),
      pair("MOST PEOPLE WON'T ACT ON THIS."),
      pair("THE DATA SAYS YES. DOES YOUR TEAM?"),
      pair("SLEEPING ON {SURNAME} IS A MISTAKE."),
      pair("NOT FLASHY. JUST CONSISTENT."),
      pair("QUIET ACHIEVER. LOUD NUMBERS."),
      pair("NO ONE TALKS ABOUT THIS ENOUGH."),
      pair("HE'S BEEN DOING THIS FOR MONTHS."),
      pair("THE STAT EVERYONE IGNORES."),
      pair("UNDER THE RADAR. ON THE STATS."),
      pair("{RATE}%. CHECK YOUR TEAM."),
      pair("THE CASE EVERYONE'S MISSING."),
      pair("IT'S IN THE DATA. IS IT IN YOUR TEAM?"),
      pair("NOT A TREND. A TRACK RECORD."),
      pair("THE DATA FAVOURS {SURNAME}."),
      pair("THIS IS THE EDGE."),
      pair("{HITS} HITS. STILL BEING OVERLOOKED."),
    ]},
    { label: "Honest", hooks: [
      pair("JUDGE IT YOURSELF."),
      pair("WE SHOW THE DATA. YOU MAKE THE CALL."),
      pair("{MISSES} MISSES. WE COUNT THOSE TOO."),
      pair("NOT A GUARANTEE. A RATE."),
      pair("THE MISSES ARE IN THERE."),
      pair("MAKE YOUR OWN CALL."),
      pair("THE DATA IS THE DATA."),
      pair("WE POST THE MISSES TOO."),
      pair("{RATE}%. NOT 100%. NEVER 100%."),
      pair("DRAW YOUR OWN CONCLUSIONS."),
      pair("THE HONEST PICTURE."),
      pair("THIS IS WHAT THE DATA SHOWS."),
      pair("{HITS} HITS. {MISSES} MISSES. BOTH MATTER."),
      pair("NO SPIN. JUST NUMBERS."),
      pair("SEE THE FULL PICTURE."),
      pair("WE DON'T HIDE THE MISSES."),
      pair("REAL DATA. YOUR DECISION."),
      pair("THE NUMBERS. NOTHING ELSE."),
      pair("{RATE}%. WHAT YOU DO WITH IT IS UP TO YOU."),
      pair("TRANSPARENCY. THAT'S THE EDGE."),
    ]},
  ];
}

function applyFormSub(t: string, r: FormRow, formWindow: FormWindow): string {
  const surname = (r.player_name.split(" ").pop() ?? r.player_name).toUpperCase();
  const l5 = formWindow === "L3" ? r.last_3_avg.toFixed(1) : r.last_5_avg.toFixed(1);
  const delta = (r.delta >= 0 ? "+" : "") + r.delta.toFixed(1);
  return t
    .replace(/\{SURNAME\}/g, surname)
    .replace(/\{SZN\}/g, r.season_avg.toFixed(1))
    .replace(/\{L5\}/g, l5)
    .replace(/\{DELTA\}/g, delta)
    .replace(/\{LENS\}/g, r.lens.toUpperCase())
    .replace(/\{N\}/g, String(r.games_played));
}

function buildFormBank(r: FormRow, formWindow: FormWindow): HookGroup[] {
  const split = (s: string): [string, string] => {
    const idx = s.indexOf(". ");
    if (idx !== -1) return [s.slice(0, idx + 1), s.slice(idx + 2)];
    const words = s.split(" ");
    if (words.length <= 2) return [s, ""];
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  };
  const pair = (s: string): [string, string] => {
    const [a, b] = split(s);
    return [applyFormSub(a, r, formWindow).toUpperCase(), applyFormSub(b, r, formWindow).toUpperCase()];
  };
  return [
    { label: "The Number", hooks: [
      pair("{DELTA} ABOVE SEASON AVERAGE. {LENS}."),
      pair("UP {DELTA} ON HIS SEASON AVG. {LENS}."),
      pair("{L5} {LENS} AVERAGE. LAST 5 GAMES."),
      pair("SEASON AVG {SZN}. LAST 5 AVG {L5}."),
      pair("{DELTA} ABOVE HIS USUAL. {LENS}."),
      pair("RUNNING {DELTA} ABOVE AVERAGE."),
      pair("{L5} IN HIS LAST 5. SEASON AVG {SZN}."),
      pair("THE GAP IS {DELTA}. {LENS}."),
      pair("{DELTA} POINTS ABOVE HIS SEASON AVG."),
      pair("LAST 5 AVG: {L5}. SEASON AVG: {SZN}."),
      pair("{LENS}. THE FORM IS REAL. {L5} LAST 5."),
      pair("UP {DELTA} ON AVERAGE. LAST 5 GAMES."),
      pair("THE {LENS} FORM IS {L5} AVG."),
      pair("{L5} {LENS}. THAT'S {DELTA} ABOVE HIS NORM."),
      pair("IN FORM. {LENS}. {L5} LAST 5."),
      pair("THE NUMBERS SAY {L5}. SEASON SAYS {SZN}."),
      pair("{DELTA} ABOVE. {LENS}. RIGHT NOW."),
      pair("FORM AVG {L5}. SEASON AVG {SZN}."),
      pair("THE DIFFERENCE IS {DELTA}. {LENS}."),
      pair("{LENS}. LAST 5: {L5}. NORM: {SZN}."),
    ]},
    { label: "Quiet Confidence", hooks: [
      pair("HE DOES IT ALMOST EVERY WEEK."),
      pair("IT'S NOT A FLUKE."),
      pair("THE FORM IS THERE."),
      pair("{SURNAME} SHOWS UP."),
      pair("NEARLY EVERY WEEK."),
      pair("HE'S BEEN HERE BEFORE."),
      pair("THE NUMBERS DON'T LIE."),
      pair("CONSISTENT. ALL SEASON."),
      pair("WEEK IN. WEEK OUT."),
      pair("HE HASN'T GONE AWAY."),
      pair("THE DATA BACKS IT."),
      pair("THIS ISN'T NEW."),
      pair("IT KEEPS HAPPENING."),
      pair("SAME STORY. EVERY WEEK."),
      pair("HE'S BUILT DIFFERENT."),
      pair("THE EVIDENCE IS CLEAR."),
      pair("THIS IS WHAT HE DOES."),
      pair("NO SURPRISE HERE."),
      pair("THE TRACK RECORD IS REAL."),
      pair("SAME PLAYER. SAME RESULT. TIME AND AGAIN."),
    ]},
    { label: "Hype", hooks: [
      pair("BACK IT."),
      pair("THIS WEEK? BACK IT."),
      pair("DON'T OVERTHINK IT."),
      pair("IT'S SIMPLE. THE DATA IS CLEAR."),
      pair("STOP LOOKING. START BACKING."),
      pair("THE CASE IS CLOSED."),
      pair("LOCK. IT. IN."),
      pair("YOUR CALL. HIS TRACK RECORD."),
      pair("RUNNING HOT. DON'T FADE HIM."),
      pair("HE'S COOKING."),
      pair("FORM OF HIS LIFE."),
      pair("LIGHTS OUT."),
      pair("UNSTOPPABLE RIGHT NOW."),
      pair("ON FIRE. ALL SEASON."),
      pair("THE NUMBERS ARE SCREAMING."),
      pair("DON'T LEAVE HIM OUT."),
      pair("HE'S THAT GUY RIGHT NOW."),
      pair("THE HOTTEST PLAYER IN THE COMP."),
      pair("ELITE. NO OTHER WORD FOR IT."),
      pair("HOT RIGHT NOW. AND NOT SLOWING DOWN."),
    ]},
    { label: "Contrarian", hooks: [
      pair("EVERYONE KNOWS. FEW ACT."),
      pair("THE OBVIOUS PLAY ISN'T OBVIOUS TO EVERYONE."),
      pair("WHILE OTHERS OVERTHINK IT."),
      pair("PEOPLE ARE STILL SLEEPING ON THIS."),
      pair("MOST PEOPLE WON'T ACT ON THIS."),
      pair("THE DATA SAYS YES. DOES YOUR TEAM?"),
      pair("SLEEPING ON {SURNAME} IS A MISTAKE."),
      pair("NOT FLASHY. JUST CONSISTENT."),
      pair("QUIET ACHIEVER. LOUD NUMBERS."),
      pair("NO ONE TALKS ABOUT THIS ENOUGH."),
      pair("HE'S BEEN DOING THIS FOR MONTHS."),
      pair("THE STAT EVERYONE IGNORES."),
      pair("UNDER THE RADAR. ON THE STATS."),
      pair("CHECK YOUR TEAM. ARE YOU ON THIS?"),
      pair("THE CASE EVERYONE'S MISSING."),
      pair("IT'S IN THE DATA. IS IT IN YOUR TEAM?"),
      pair("NOT A TREND. A TRACK RECORD."),
      pair("THE DATA FAVOURS {SURNAME}."),
      pair("THIS IS THE EDGE."),
      pair("DOING IT WEEKLY. STILL BEING OVERLOOKED."),
    ]},
    { label: "Honest", hooks: [
      pair("FORM CAN CHANGE. THIS IS THE LAST 5."),
      pair("NOT EVERY WEEK. BUT RIGHT NOW."),
      pair("THE FORM IS THERE. JUDGE THE FULL SEASON TOO."),
      pair("LAST 5 GAMES. THAT'S ALL THIS IS."),
      pair("FORM WINDOWS SHIFT. THIS ONE'S POINTING UP."),
      pair("UP {DELTA}. MAKE OF IT WHAT YOU WILL."),
      pair("THE RECENT DATA SAYS {L5}. SEASON SAYS {SZN}."),
      pair("WE SHOW THE TREND. YOU CALL THE SHOT."),
      pair("{DELTA} ABOVE AVERAGE. THAT'S THE HONEST PICTURE."),
      pair("NOT A PREDICTION. A TREND."),
      pair("THE MISSES ARE IN THE SEASON AVG TOO."),
      pair("FORM FADES. RIGHT NOW IT'S REAL."),
      pair("THE DATA IS THE DATA. LAST 5 GAMES."),
      pair("NO SPIN. JUST RECENT NUMBERS."),
      pair("UP {DELTA}. DRAW YOUR OWN CONCLUSIONS."),
      pair("THIS IS WHAT THE LAST 5 GAMES SHOW."),
      pair("TRANSPARENT. THE TREND IS {DELTA} ABOVE NORM."),
      pair("REAL DATA. SHORT WINDOW. YOUR CALL."),
      pair("THE NUMBERS. LAST 5. NOTHING ELSE."),
      pair("{DELTA} UP. WHAT YOU DO WITH IT IS UP TO YOU."),
    ]},
  ];
}

function MiniBar({ values, threshold, avg }: { values: number[]; threshold: number; avg: number }) {
  const vals = values.slice(-10);
  if (vals.length === 0) return null;
  const barW = 64;
  const gap = 12;
  const groupW = vals.length * barW + (vals.length - 1) * gap;
  const startX = (880 - groupW) / 2;
  const maxVal = Math.max(...vals, threshold, 1);
  const thresholdY = 160 - Math.round((threshold / maxVal) * 140);
  return (
    <svg width={880} height={180} style={{ display: "block" }}>
      <line x1={0} y1={thresholdY} x2={880} y2={thresholdY} stroke="#F5C442" strokeWidth={2} strokeDasharray="6 4" />
      <text x={876} y={thresholdY - 6} textAnchor="end" fontSize={22} fill="#F5C442" fontWeight={700} fontFamily='system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'>
        avg {avg.toFixed(1)}
      </text>
      {vals.map((val, i) => {
        const barH = Math.max(20, Math.round((val / maxVal) * 140));
        const x = startX + i * (barW + gap);
        const y = 160 - barH;
        const fill = val >= threshold ? "#22C55E" : "#EF4444";
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={6} fill={fill} />
            {barH >= 30 && (
              <text x={x + barW / 2} y={y - 8} textAnchor="middle" fontSize={20} fill="#FFFFFF" fontWeight={700} fontFamily='system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'>
                {val}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function NeekoCard({ row, hook, cta }: { row: RankedRow; hook: [string, string]; cta: string }) {
  const accent = row.rate >= 90 ? "#22C55E" : "#F5C442";
  const avg = row.season_avg !== null ? row.season_avg : 0;
  return (
    <div
      id="neeko-card"
      style={{
        width: 1080,
        height: 1920,
        position: "relative",
        background:
          "radial-gradient(900px 700px at 12% 4%, rgba(28,22,9,0.92) 0%, #050505 62%), #050505",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        letterSpacing: "-0.02em",
        overflow: "hidden",
      }}
    >
      <AntonStyle />
      <div style={{ position: "absolute", left: 0, top: 150, width: 1080, textAlign: "center", fontFamily: ANTON_FONT, fontSize: antonFit(hook[0], 96), letterSpacing: "-1px", lineHeight: 1, color: "#FFFFFF" }}>{hook[0]}</div>
      {hook[1] && (
        <div style={{ position: "absolute", left: 0, top: 150 + antonFit(hook[0], 96) + 16, width: 1080, textAlign: "center", fontFamily: ANTON_FONT, fontSize: antonFit(hook[1], 96), letterSpacing: "-1px", lineHeight: 1, color: row.rate >= 75 ? "#22C55E" : "#EF4444" }}>{hook[1]}</div>
      )}
      <div style={{ position: "absolute", left: 0, top: 450, width: 1080, textAlign: "center", color: "#8A8F96", fontSize: 32 }}>
        {row.player_name} · {row.team_name} · v {row.opponent_team_name}
        {(row.player_status ?? "").toLowerCase() !== "active" && (
          <span style={{ display: "inline-block", marginLeft: 16, background: "#3F1D1D", color: "#EF4444", fontSize: 24, fontWeight: 800, borderRadius: 10, padding: "6px 16px", verticalAlign: "middle" }}>OUT</span>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          left: 100,
          top: 540,
          width: 880,
          height: 360,
          borderRadius: 30,
          background: "#0D0E11",
          border: "1px solid #202226",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 50, width: 880, textAlign: "center", color: "#8A8F96", fontSize: 30 }}>HIT RATE</div>
        <div style={{ position: "absolute", left: 0, top: 94, width: 880, textAlign: "center", color: accent, fontFamily: ANTON_FONT, fontSize: 142, fontWeight: 800, lineHeight: 1 }}>
          {row.rate}%
        </div>
        <div style={{ position: "absolute", left: 0, top: 260, width: 880, textAlign: "center", color: "#8A8F96", fontSize: 32 }}>
          {row.hits} games from {row.games} this season
        </div>
      </div>

      <div style={{ position: "absolute", left: 100, top: 920, width: 880, display: "flex", justifyContent: "center" }}>
        <MiniBar values={row.last_10_values} threshold={row.threshold} avg={avg} />
      </div>

      <div style={{ position: "absolute", left: 0, top: 1070, width: 1080, textAlign: "center", color: "#565A60", fontSize: 32 }}>
        Season average {row.season_avg !== null ? avg.toFixed(1) : "—"}
      </div>

      <div style={{ position: "absolute", left: 0, top: 1140, width: 1080, textAlign: "center" }}>
        <span
          style={{
            display: "inline-block",
            background: "#F5C442",
            borderRadius: 44,
            padding: "22px 56px",
            color: "#080808",
            fontSize: 36,
            fontWeight: 800,
          }}
        >
          {cta}
        </span>
      </div>

      <div style={{ position: "absolute", left: 0, top: 1250, width: 1080, textAlign: "center", color: "#565A60", fontSize: 26 }}>
        NEEKO STATS
      </div>
    </div>
  );
}

function FormCard({ row, formWindow, hook, cta }: { row: FormRow; formWindow: FormWindow; hook: [string, string]; cta: string }) {
  const accent = row.delta < 0 ? "#EF4444" : "#22C55E";
  const deltaStr = (row.delta >= 0 ? "+" : "") + row.delta.toFixed(1);
  const lastLabel = formWindow === "L3" ? "LAST 3" : "LAST 5";
  const lastVal = formWindow === "L3" ? row.last_3_avg.toFixed(1) : row.last_5_avg.toFixed(1);
  return (
    <div
      id="neeko-card"
      style={{
        width: 1080,
        height: 1920,
        position: "relative",
        background:
          "radial-gradient(900px 700px at 12% 4%, rgba(28,22,9,0.92) 0%, #050505 62%), #050505",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        letterSpacing: "-0.02em",
        overflow: "hidden",
      }}
    >
      <AntonStyle />
      <div style={{ position: "absolute", left: 0, top: 150, width: 1080, textAlign: "center", fontFamily: ANTON_FONT, fontSize: antonFit(hook[0], 88), letterSpacing: "-1px", lineHeight: 1, color: "#FFFFFF" }}>{hook[0]}</div>
      {hook[1] && (
        <div style={{ position: "absolute", left: 0, top: 150 + antonFit(hook[0], 88) + 16, width: 1080, textAlign: "center", fontFamily: ANTON_FONT, fontSize: antonFit(hook[1], 88), letterSpacing: "-1px", lineHeight: 1, color: row.tag === "COLD" ? "#EF4444" : "#22C55E" }}>{hook[1]}</div>
      )}
      <div style={{ position: "absolute", left: 0, top: 400, width: 1080, textAlign: "center", color: "#8A8F96", fontSize: 32 }}>
        {row.player_name} · {row.team_name} · {row.position}
        {(row.player_status ?? "").toLowerCase() !== "active" && (
          <span style={{ display: "inline-block", marginLeft: 16, background: "#3F1D1D", color: "#EF4444", fontSize: 24, fontWeight: 800, borderRadius: 10, padding: "6px 16px", verticalAlign: "middle" }}>OUT</span>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          left: 100,
          top: 480,
          width: 880,
          height: 440,
          borderRadius: 30,
          background: "#0D0E11",
          border: "1px solid #202226",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 40, width: 880, textAlign: "center", color: "#8A8F96", fontSize: 30 }}>SEASON</div>
        <div style={{ position: "absolute", left: 0, top: 80, width: 880, textAlign: "center", color: "#FFFFFF", fontFamily: ANTON_FONT, fontSize: 118, fontWeight: 800, lineHeight: 1 }}>
          {row.season_avg.toFixed(1)}
        </div>
        <div style={{ position: "absolute", left: 0, top: 230, width: 880, textAlign: "center", color: "#8A8F96", fontSize: 30 }}>{lastLabel}</div>
        <div style={{ position: "absolute", left: 0, top: 270, width: 880, textAlign: "center", color: accent, fontFamily: ANTON_FONT, fontSize: 118, fontWeight: 800, lineHeight: 1 }}>
          {lastVal}
        </div>
      </div>

      <div style={{ position: "absolute", left: 0, top: 970, width: 1080, textAlign: "center", color: accent, fontFamily: ANTON_FONT, fontSize: 96, fontWeight: 800, lineHeight: 1 }}>
        {deltaStr}
      </div>

      <div style={{ position: "absolute", left: 0, top: 1120, width: 1080, textAlign: "center" }}>
        <span
          style={{
            display: "inline-block",
            background: "#F5C442",
            borderRadius: 44,
            padding: "22px 56px",
            color: "#080808",
            fontSize: 36,
            fontWeight: 800,
          }}
        >
          {cta}
        </span>
      </div>

      <div style={{ position: "absolute", left: 0, top: 1230, width: 1080, textAlign: "center", color: "#565A60", fontSize: 26 }}>
        NEEKO STATS
      </div>
    </div>
  );
}

function FormCardModal({ row, formWindow, onClose }: { row: FormRow; formWindow: FormWindow; onClose: () => void }) {
  const groups = useMemo(() => buildFormBank(row, formWindow), [row, formWindow]);
  const { flat, starts } = useMemo(() => flattenGroups(groups), [groups]);
  const [hookIdx, setHookIdx] = useState(0);
  const [customA, setCustomA] = useState("");
  const [customB, setCustomB] = useState("");
  const [cta, setCta] = useState<string>(CTA_OPTIONS[0]);
  const [downloading, setDownloading] = useState(false);
  const isOut = (row.player_status ?? "").toLowerCase() !== "active";
  const hasCustom = customA.trim().length > 0 || customB.trim().length > 0;
  const idx = Math.min(hookIdx, flat.length - 1);
  const hook: [string, string] = isOut
    ? ["HE'S NOT PLAYING.", "THAT'S WHY."]
    : hasCustom
      ? [customA.toUpperCase(), customB.toUpperCase()]
      : (flat[idx] ?? ["", ""]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleDownload() {
    const node = document.getElementById("neeko-card");
    if (!node) return;
    setDownloading(true);
    document.body.style.overflow = 'hidden';
    try {
      const css = await fetch(ANTON_FONT_URL).then(r => r.text());
      const blob = await toBlob(node, {
        width: 1080,
        height: 1920,
        pixelRatio: 1,
        backgroundColor: "#050505",
        fontEmbedCSS: css,
        style: { transform: "scale(1)", transformOrigin: "top left" },
      });
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = `${row.player_name}_form_${formWindow}.png`.replace(/\s+/g, "_");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      document.body.style.overflow = '';
      setDownloading(false);
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div onClick={(e) => e.stopPropagation()} className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-4">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Hook</label>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <input
            value={customA}
            onChange={(e) => setCustomA(e.target.value)}
            disabled={isOut}
            placeholder="Write your own…"
            className="bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
          />
          <input
            value={customB}
            onChange={(e) => setCustomB(e.target.value)}
            disabled={isOut}
            placeholder="Write your own…"
            className="bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
          />
        </div>

        <select
          value={hookIdx}
          onChange={(e) => setHookIdx(Number(e.target.value))}
          disabled={isOut}
          className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
        >
          {groups.map((g, gi) => (
            <optgroup key={gi} label={g.label}>
              {g.hooks.map((h, i) => {
                const flatIdx = starts[gi] + i;
                return (
                  <option key={flatIdx} value={flatIdx}>
                    {h[0]} {h[1]}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>

        {isOut && (
          <p className="text-xs text-zinc-500 italic">OUT players get a fixed hook — form isn't the story, availability is.</p>
        )}

        <div style={{ width: 346, height: 615, overflow: "hidden", borderRadius: 12 }}>
          <div style={{ transform: "scale(0.28)", transformOrigin: "top left" }}>
            <FormCard row={row} formWindow={formWindow} hook={hook} cta={cta} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex-shrink-0">CTA</label>
          <select
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            className="flex-1 bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          >
            {CTA_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-semibold rounded-lg transition-colors"
        >
          {downloading ? "Rendering…" : "Download PNG"}
        </button>
      </div>
    </div>
  );
}

function buildPriceBank(r: PriceRow): HookGroup[] {
  const surname = (r.player_name.split(" ").pop() ?? r.player_name).toUpperCase();
  const meta = PRICE_STORY_META[r.story];
  const be = r.breakeven.toFixed(0);
  const proj = r.projection.toFixed(0);
  const delta = r.be_delta.toFixed(0);
  const priceK = (r.price / 1000).toFixed(0);
  const sub = (t: string) =>
    t.replace(/\{SURNAME\}/g, surname)
      .replace(/\{BE\}/g, be)
      .replace(/\{PROJ\}/g, proj)
      .replace(/\{DELTA\}/g, delta)
      .replace(/\{PRICEK\}/g, priceK);
  const split = (s: string): [string, string] => {
    const idx = s.indexOf(". ");
    if (idx !== -1) return [s.slice(0, idx + 1), s.slice(idx + 2)];
    const words = s.split(" ");
    if (words.length <= 2) return [s, ""];
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  };
  const pair = (s: string): [string, string] => {
    const [a, b] = split(s);
    return [sub(a).toUpperCase(), sub(b).toUpperCase()];
  };
  const groups: HookGroup[] = [
    { label: "The Number", hooks: [
      pair(`BE ${be}. PROJECTION ${proj}.`),
      pair(`NEEDS ${delta} MORE THAN PROJECTED.`),
      pair(`BE ${be}. PROJECTED ${proj}.`),
      pair(`PRICED AT ${priceK}K. BE ${be}.`),
      pair(`THE GAP IS ${delta}. BE ${be}.`),
      pair(`PROJECTED ${proj}. BE ${be}.`),
      pair(`${meta.label}. BE ${be}.`),
      pair(`BE ${be}. THAT'S THE NUMBER.`),
      pair(`PROJECTION ${proj}. BREAKEVEN ${be}.`),
      pair(`${priceK}K. BE ${be}. PROJ ${proj}.`),
    ]},
  ];
  if (r.story === "trap") {
    groups.push({ label: "Trap", hooks: [
      pair(`PRICE TRAP. BE ${be}.`),
      pair(`PRICED IN. PROJECTION ${proj}.`),
      pair(`THE PRICE IS LYING.`),
      pair(`DON'T PAY ${priceK}K FOR THIS.`),
      pair(`OVERPRICED. UNDERPROJECTED.`),
      pair(`THE BE IS ${be}. THE PROJ IS ${proj}.`),
      pair(`HIS PRICE IS AHEAD OF HIS FORM.`),
      pair(`YOU'D BE PAYING FOR THE NAME.`),
      pair(`BE ${be} IS A RED FLAG AT ${priceK}K.`),
      pair(`THE MARKET IS WRONG ON {SURNAME}.`),
    ]});
  } else if (r.story === "bargain") {
    groups.push({ label: "Bargain", hooks: [
      pair(`BARGAIN. BE ${be}. PROJ ${proj}.`),
      pair(`UNDERPRICED. OVERPROJECTED.`),
      pair(`${priceK}K FOR A ${proj} PROJECTION.`),
      pair(`THE VALUE IS OBVIOUS.`),
      pair(`CHEAP FOR WHAT HE'S PROJECTED.`),
      pair(`THE PRICE HASN'T CAUGHT UP.`),
      pair(`BE ${be}. HE'S PROJECTED ${proj}.`),
      pair(`PAY LESS. GET MORE.`),
      pair(`THE MARKET IS SLEEPING ON {SURNAME}.`),
      pair(`BE ${be}. THE PRICE IS WRONG.`),
    ]});
  } else if (r.story === "expensive") {
    groups.push({ label: "Expensive", hooks: [
      pair(`${priceK}K. THAT'S THE CEILING.`),
      pair(`THE PRICE IS REAL. SO IS THE BE.`),
      pair(`PREMIUM PRICE. BE ${be}.`),
      pair(`HE COSTS ${priceK}K. PROJ ${proj}.`),
      pair(`TOP SHELF. BE ${be}.`),
      pair(`YOU PAY FOR THE FLOOR.`),
      pair(`${priceK}K. PROJECTED ${proj}.`),
      pair(`THE PRICE IS THE STORY.`),
      pair(`EXPENSIVE. BUT PROJECTED ${proj}.`),
      pair(`{SURNAME} COSTS ${priceK}K.`),
    ]});
  } else {
    groups.push({ label: "Value", hooks: [
      pair(`VALUE PICK. BE ${be}. PROJ ${proj}.`),
      pair(`THE VALUE SCORE IS HIGH.`),
      pair(`UNDERPRICED FOR THE PROJECTION.`),
      pair(`BE ${be}. PROJ ${proj}. GOOD PRICE.`),
      pair(`THE NUMBERS SAY VALUE.`),
      pair(`${priceK}K. PROJ ${proj}. THAT'S VALUE.`),
      pair(`BE ${be}. THE PRICE IS FAIR.`),
      pair(`SOLID VALUE. NOT A BARGAIN.`),
      pair(`THE PROJECTION JUSTIFIES IT.`),
      pair(`{SURNAME} IS PRICED RIGHT.`),
    ]});
  }
  groups.push({ label: "Quiet Confidence", hooks: [
    pair(`BE IS JUST A NUMBER.`),
    pair(`THE PROJECTION IS THE STORY.`),
    pair(`PRICE FOLLOWS FORM.`),
    pair(`THE DATA IS THE DATA.`),
    pair(`JUDGE THE BE YOURSELF.`),
    pair(`WE SHOW THE NUMBERS.`),
    pair(`NO SPIN. JUST BE AND PROJ.`),
    pair(`THE PRICE IS WHAT IT IS.`),
    pair(`FORM DRIVES PRICE. NOT THE OTHER WAY.`),
    pair(`{SURNAME}. BE ${be}. PROJ ${proj}.`),
  ]});
  return groups;
}

function buildEvergreenBank(r: EvergreenRow): HookGroup[] {
  const surname = (r.player_name.split(" ").pop() ?? r.player_name).toUpperCase();
  const meta = EVERGREEN_STORY_META[r.story];
  const consistency = r.consistency.toFixed(0);
  const rank = String(r.rank_position);
  const sa = r.season_avg.toFixed(1);
  const l5 = r.last_5_avg.toFixed(1);
  const sub = (t: string) =>
    t.replace(/\{SURNAME\}/g, surname)
      .replace(/\{CONS\}/g, consistency)
      .replace(/\{RANK\}/g, rank)
      .replace(/\{SA\}/g, sa)
      .replace(/\{L5\}/g, l5);
  const split = (s: string): [string, string] => {
    const idx = s.indexOf(". ");
    if (idx !== -1) return [s.slice(0, idx + 1), s.slice(idx + 2)];
    const words = s.split(" ");
    if (words.length <= 2) return [s, ""];
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  };
  const pair = (s: string): [string, string] => {
    const [a, b] = split(s);
    return [sub(a).toUpperCase(), sub(b).toUpperCase()];
  };
  const groups: HookGroup[] = [
    { label: "The Number", hooks: [
      pair(`CONSISTENCY ${consistency}. RANK ${rank}.`),
      pair(`RANK ${rank}. ${consistency}% CONSISTENCY.`),
      pair(`${meta.label}. ${consistency}%.`),
      pair(`SEASON ${sa}. L5 ${l5}.`),
      pair(`CONSISTENCY ${consistency}%.`),
      pair(`RANK ${rank}. SEASON ${sa}.`),
      pair(`${consistency}%. THAT'S THE FLOOR.`),
      pair(`RANK ${rank}. CONSISTENCY ${consistency}%.`),
      pair(`SEASON ${sa}. RANK ${rank}.`),
      pair(`${consistency}%. RANK ${rank}. L5 ${l5}.`),
    ]},
  ];
  if (r.story === "elite") {
    groups.push({ label: "Elite", hooks: [
      pair(`ELITE. ${consistency}% CONSISTENCY.`),
      pair(`THE FLOOR IS THE STORY.`),
      pair(`${consistency}%. WEEK IN. WEEK OUT.`),
      pair(`HE DOESN'T DROP OFF.`),
      pair(`THE MOST CONSISTENT PLAYER.`),
      pair(`LOCK HIM IN.`),
      pair(`NO DOWNSIDE. ${consistency}%.`),
      pair(`THE SAFE PICK.`),
      pair(`EVERY WEEK. THE SAME.`),
      pair(`{SURNAME} DOESN'T MISS.`),
    ]});
  } else if (r.story === "risk") {
    groups.push({ label: "Risk", hooks: [
      pair(`CONSISTENCY RISK. ${consistency}%.`),
      pair(`THE FLOOR IS GONE.`),
      pair(`VOLATILE. ${consistency}%.`),
      pair(`HIS FORM COMES AND GOES.`),
      pair(`BUYER BEWARE.`),
      pair(`THE CEILING IS REAL. SO IS THE FLOOR.`),
      pair(`${consistency}%. UP AND DOWN.`),
      pair(`HARD TO TRUST.`),
      pair(`THE UPSIDE TEMPTS. THE FLOOR HURTS.`),
      pair(`{SURNAME} IS A GAMBLE.`),
    ]});
  } else if (r.story === "top_ranked") {
    groups.push({ label: "Top Ranked", hooks: [
      pair(`RANK ${rank}. TOP OF THE BOARD.`),
      pair(`THE BEST IN THE COMP.`),
      pair(`RANK ${rank}. THE NUMBERS DON'T LIE.`),
      pair(`HE'S THE CEILING.`),
      pair(`TOP 30. AND CLIMBING.`),
      pair(`RANK ${rank}. CONSISTENCY ${consistency}%.`),
      pair(`THE STATS ARE ELITE.`),
      pair(`RANK ${rank}. THAT'S THE STORY.`),
      pair(`TOP RANKED FOR A REASON.`),
      pair(`{SURNAME}. RANK ${rank}.`),
    ]});
  } else {
    groups.push({ label: "Rising", hooks: [
      pair(`RISING. L5 ${l5}. SEASON ${sa}.`),
      pair(`HIS FORM IS CLIMBING.`),
      pair(`L5 ${l5}. ABOVE HIS SEASON.`),
      pair(`THE TREND IS UP.`),
      pair(`GET IN BEFORE THE PRICE CATCHES UP.`),
      pair(`RISING FAST.`),
      pair(`HIS L5 IS ${l5}. SEASON ${sa}.`),
      pair(`FORM IS UP. PRICE HASN'T.`),
      pair(`THE BREAKOUT IS HERE.`),
      pair(`{SURNAME} IS RISING.`),
    ]});
  }
  groups.push({ label: "Quiet Confidence", hooks: [
    pair(`THE NUMBERS ARE THE NUMBERS.`),
    pair(`CONSISTENCY IS THE STORY.`),
    pair(`JUDGE IT YOURSELF.`),
    pair(`THE DATA IS THE DATA.`),
    pair(`WE SHOW THE NUMBERS.`),
    pair(`NO SPIN. JUST CONSISTENCY.`),
    pair(`FORM DRIVES PRICE.`),
    pair(`THE FLOOR IS REAL.`),
    pair(`WE DON'T HIDE THE BAD WEEKS.`),
    pair(`{SURNAME}. ${consistency}%. RANK ${rank}.`),
  ]});
  return groups;
}

function EvergreenCard({ row, hook, cta }: { row: EvergreenRow; hook: [string, string]; cta: string }) {
  const meta = EVERGREEN_STORY_META[row.story];
  const consColor = row.consistency >= 75 ? "#22C55E" : row.consistency >= 45 ? "#F5C442" : "#EF4444";
  return (
    <div
      id="neeko-evergreen-card"
      style={{
        width: 1080,
        height: 1920,
        position: "relative",
        background:
          "radial-gradient(900px 700px at 12% 4%, rgba(28,22,9,0.92) 0%, #050505 62%), #050505",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        letterSpacing: "-0.02em",
        overflow: "hidden",
      }}
    >
      <AntonStyle />
      <div style={{ position: "absolute", left: 0, top: 150, width: 1080, textAlign: "center", fontFamily: ANTON_FONT, fontSize: antonFit(hook[0], 88), letterSpacing: "-1px", lineHeight: 1, color: "#FFFFFF" }}>{hook[0]}</div>
      {hook[1] && (
        <div style={{ position: "absolute", left: 0, top: 150 + antonFit(hook[0], 88) + 16, width: 1080, textAlign: "center", fontFamily: ANTON_FONT, fontSize: antonFit(hook[1], 88), letterSpacing: "-1px", lineHeight: 1, color: meta.bg }}>{hook[1]}</div>
      )}

      <div style={{ position: "absolute", left: 0, top: 400, width: 1080, textAlign: "center", color: "#8A8F96", fontSize: 32 }}>
        {row.player_name} · {row.team_name} · {row.position}
      </div>

      <div style={{ position: "absolute", left: 0, top: 470, width: 1080, textAlign: "center" }}>
        <span
          style={{
            display: "inline-block",
            background: meta.bg,
            color: meta.text,
            borderRadius: 14,
            padding: "10px 28px",
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: "0.02em",
          }}
        >
          {meta.label}
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          left: 100,
          top: 560,
          width: 880,
          height: 360,
          borderRadius: 30,
          background: "#0D0E11",
          border: "1px solid #202226",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 50, width: 440, textAlign: "center", color: "#8A8F96", fontSize: 30 }}>CONSISTENCY</div>
        <div style={{ position: "absolute", left: 0, top: 94, width: 440, textAlign: "center", color: consColor, fontFamily: ANTON_FONT, fontSize: 142, fontWeight: 800, lineHeight: 1 }}>
          {Math.round(row.consistency)}%
        </div>
        <div style={{ position: "absolute", left: 440, top: 50, width: 440, textAlign: "center", color: "#8A8F96", fontSize: 30 }}>RANK</div>
        <div style={{ position: "absolute", left: 440, top: 94, width: 440, textAlign: "center", color: "#FFFFFF", fontFamily: ANTON_FONT, fontSize: 142, fontWeight: 800, lineHeight: 1 }}>
          #{Math.round(row.rank_position)}
        </div>
        <div style={{ position: "absolute", left: 0, top: 270, width: 880, textAlign: "center", color: "#8A8F96", fontSize: 30 }}>
          SEASON {row.season_avg.toFixed(1)} · L5 {row.last_5_avg.toFixed(1)}
        </div>
      </div>

      <div style={{ position: "absolute", left: 0, top: 1080, width: 1080, textAlign: "center", color: "#8A8F96", fontSize: 32 }}>
        {row.matchup_label ? `vs ${row.matchup_label}` : "BYE THIS WEEK"}
      </div>

      <div style={{ position: "absolute", left: 0, top: 1160, width: 1080, textAlign: "center" }}>
        <span
          style={{
            display: "inline-block",
            background: "#F5C442",
            borderRadius: 44,
            padding: "22px 56px",
            color: "#080808",
            fontSize: 36,
            fontWeight: 800,
          }}
        >
          {cta}
        </span>
      </div>

      <div style={{ position: "absolute", left: 0, top: 1280, width: 1080, textAlign: "center", color: "#565A60", fontSize: 26 }}>
        NEEKO STATS
      </div>
    </div>
  );
}

function EvergreenCardModal({ row, onClose }: { row: EvergreenRow; onClose: () => void }) {
  const groups = useMemo(() => buildEvergreenBank(row), [row]);
  const { flat, starts } = useMemo(() => flattenGroups(groups), [groups]);
  const [hookIdx, setHookIdx] = useState(0);
  const [customA, setCustomA] = useState("");
  const [customB, setCustomB] = useState("");
  const [cta, setCta] = useState<string>(CTA_OPTIONS[0]);
  const [downloading, setDownloading] = useState(false);
  const hasCustom = customA.trim().length > 0 || customB.trim().length > 0;
  const idx = Math.min(hookIdx, flat.length - 1);
  const hook: [string, string] = hasCustom
    ? [customA.toUpperCase(), customB.toUpperCase()]
    : (flat[idx] ?? ["", ""]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleDownload() {
    const node = document.getElementById("neeko-evergreen-card");
    if (!node) return;
    setDownloading(true);
    document.body.style.overflow = 'hidden';
    try {
      const css = await fetch(ANTON_FONT_URL).then(r => r.text());
      const blob = await toBlob(node, {
        width: 1080,
        height: 1920,
        pixelRatio: 1,
        backgroundColor: "#050505",
        fontEmbedCSS: css,
        style: { transform: "scale(1)", transformOrigin: "top left" },
      });
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = `${row.player_name}_evergreen_${row.story}.png`.replace(/\s+/g, "_");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      document.body.style.overflow = '';
      setDownloading(false);
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div onClick={(e) => e.stopPropagation()} className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Hook</label>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <input
            value={customA}
            onChange={(e) => setCustomA(e.target.value)}
            placeholder="Write your own…"
            className="bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
          <input
            value={customB}
            onChange={(e) => setCustomB(e.target.value)}
            placeholder="Write your own…"
            className="bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <select
          value={hookIdx}
          onChange={(e) => setHookIdx(Number(e.target.value))}
          className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
        >
          {groups.map((g, gi) => (
            <optgroup key={gi} label={g.label}>
              {g.hooks.map((h, i) => {
                const flatIdx = starts[gi] + i;
                return (
                  <option key={flatIdx} value={flatIdx}>
                    {h[0]} {h[1]}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>

        <div style={{ width: 346, height: 615, overflow: "hidden", borderRadius: 12 }}>
          <div style={{ transform: "scale(0.32)", transformOrigin: "top left" }}>
            <EvergreenCard row={row} hook={hook} cta={cta} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex-shrink-0">CTA</label>
          <select
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            className="flex-1 bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          >
            {CTA_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-semibold rounded-lg transition-colors"
        >
          {downloading ? "Rendering…" : "Download PNG"}
        </button>
      </div>
    </div>
  );
}

function PriceCard({ row, hook, cta }: { row: PriceRow; hook: [string, string]; cta: string }) {
  const meta = PRICE_STORY_META[row.story];
  const beDelta = Math.round(row.be_delta);
  const deltaColor = beDelta > 0 ? "#EF4444" : beDelta < 0 ? "#22C55E" : "#8A8F96";
  const deltaLine =
    beDelta > 0 ? `NEEDS ${beDelta} MORE THAN PROJECTED`
      : beDelta < 0 ? `${Math.abs(beDelta)} BELOW BREAKEVEN`
        : "EXACTLY AT BREAKEVEN";
  return (
    <div
      id="neeko-price-card"
      style={{
        width: 1080,
        height: 1920,
        position: "relative",
        background:
          "radial-gradient(900px 700px at 12% 4%, rgba(28,22,9,0.92) 0%, #050505 62%), #050505",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        letterSpacing: "-0.02em",
        overflow: "hidden",
      }}
    >
      <AntonStyle />
      <div style={{ position: "absolute", left: 0, top: 150, width: 1080, textAlign: "center", fontFamily: ANTON_FONT, fontSize: antonFit(hook[0], 88), letterSpacing: "-1px", lineHeight: 1, color: "#FFFFFF" }}>{hook[0]}</div>
      {hook[1] && (
        <div style={{ position: "absolute", left: 0, top: 150 + antonFit(hook[0], 88) + 16, width: 1080, textAlign: "center", fontFamily: ANTON_FONT, fontSize: antonFit(hook[1], 88), letterSpacing: "-1px", lineHeight: 1, color: meta.bg }}>{hook[1]}</div>
      )}

      <div style={{ position: "absolute", left: 0, top: 400, width: 1080, textAlign: "center", color: "#8A8F96", fontSize: 32 }}>
        {row.player_name} · {row.team_name} · {row.position}
      </div>

      <div style={{ position: "absolute", left: 0, top: 470, width: 1080, textAlign: "center" }}>
        <span
          style={{
            display: "inline-block",
            background: meta.bg,
            color: meta.text,
            borderRadius: 14,
            padding: "10px 28px",
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: "0.02em",
          }}
        >
          {meta.label}
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          left: 100,
          top: 560,
          width: 880,
          height: 360,
          borderRadius: 30,
          background: "#0D0E11",
          border: "1px solid #202226",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 50, width: 440, textAlign: "center", color: "#8A8F96", fontSize: 30 }}>BE</div>
        <div style={{ position: "absolute", left: 0, top: 94, width: 440, textAlign: "center", color: "#F5C442", fontFamily: ANTON_FONT, fontSize: 142, fontWeight: 800, lineHeight: 1 }}>
          {Math.round(row.breakeven)}
        </div>
        <div style={{ position: "absolute", left: 440, top: 50, width: 440, textAlign: "center", color: "#8A8F96", fontSize: 30 }}>PROJECTION</div>
        <div style={{ position: "absolute", left: 440, top: 94, width: 440, textAlign: "center", color: "#FFFFFF", fontFamily: ANTON_FONT, fontSize: 142, fontWeight: 800, lineHeight: 1 }}>
          {Math.round(row.projection)}
        </div>
        <div style={{ position: "absolute", left: 0, top: 270, width: 880, textAlign: "center", color: "#8A8F96", fontSize: 30 }}>
          ${(row.price / 1000).toFixed(0)}K · SEASON {row.season_avg.toFixed(1)} · L5 {row.last_5_avg.toFixed(1)}
        </div>
      </div>

      <div style={{ position: "absolute", left: 0, top: 970, width: 1080, textAlign: "center", color: deltaColor, fontFamily: ANTON_FONT, fontSize: 64, fontWeight: 800, lineHeight: 1 }}>
        {deltaLine}
      </div>

      <div style={{ position: "absolute", left: 0, top: 1080, width: 1080, textAlign: "center", color: "#8A8F96", fontSize: 32 }}>
        {row.matchup_label ? `vs ${row.matchup_label}` : "BYE THIS WEEK"}
      </div>

      <div style={{ position: "absolute", left: 0, top: 1160, width: 1080, textAlign: "center" }}>
        <span
          style={{
            display: "inline-block",
            background: "#F5C442",
            borderRadius: 44,
            padding: "22px 56px",
            color: "#080808",
            fontSize: 36,
            fontWeight: 800,
          }}
        >
          {cta}
        </span>
      </div>

      <div style={{ position: "absolute", left: 0, top: 1280, width: 1080, textAlign: "center", color: "#565A60", fontSize: 26 }}>
        NEEKO STATS
      </div>
    </div>
  );
}

function PriceCardModal({ row, onClose }: { row: PriceRow; onClose: () => void }) {
  const groups = useMemo(() => buildPriceBank(row), [row]);
  const { flat, starts } = useMemo(() => flattenGroups(groups), [groups]);
  const [hookIdx, setHookIdx] = useState(0);
  const [customA, setCustomA] = useState("");
  const [customB, setCustomB] = useState("");
  const [cta, setCta] = useState<string>(CTA_OPTIONS[0]);
  const [downloading, setDownloading] = useState(false);
  const hasCustom = customA.trim().length > 0 || customB.trim().length > 0;
  const idx = Math.min(hookIdx, flat.length - 1);
  const hook: [string, string] = hasCustom
    ? [customA.toUpperCase(), customB.toUpperCase()]
    : (flat[idx] ?? ["", ""]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleDownload() {
    const node = document.getElementById("neeko-price-card");
    if (!node) return;
    setDownloading(true);
    document.body.style.overflow = 'hidden';
    try {
      const css = await fetch(ANTON_FONT_URL).then(r => r.text());
      const blob = await toBlob(node, {
        width: 1080,
        height: 1920,
        pixelRatio: 1,
        backgroundColor: "#050505",
        fontEmbedCSS: css,
        style: { transform: "scale(1)", transformOrigin: "top left" },
      });
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = `${row.player_name}_price_${row.story}.png`.replace(/\s+/g, "_");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      document.body.style.overflow = '';
      setDownloading(false);
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div onClick={(e) => e.stopPropagation()} className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Hook</label>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <input
            value={customA}
            onChange={(e) => setCustomA(e.target.value)}
            placeholder="Write your own…"
            className="bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
          <input
            value={customB}
            onChange={(e) => setCustomB(e.target.value)}
            placeholder="Write your own…"
            className="bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <select
          value={hookIdx}
          onChange={(e) => setHookIdx(Number(e.target.value))}
          className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
        >
          {groups.map((g, gi) => (
            <optgroup key={gi} label={g.label}>
              {g.hooks.map((h, i) => {
                const flatIdx = starts[gi] + i;
                return (
                  <option key={flatIdx} value={flatIdx}>
                    {h[0]} {h[1]}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>

        <div style={{ width: 346, height: 615, overflow: "hidden", borderRadius: 12 }}>
          <div style={{ transform: "scale(0.32)", transformOrigin: "top left" }}>
            <PriceCard row={row} hook={hook} cta={cta} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex-shrink-0">CTA</label>
          <select
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            className="flex-1 bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          >
            {CTA_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-semibold rounded-lg transition-colors"
        >
          {downloading ? "Rendering…" : "Download PNG"}
        </button>
      </div>
    </div>
  );
}

function ResultsSummaryCard({ summary, hook, cta }: { summary: AccuracySummary; hook: [string, string]; cta: string }) {
  return (
    <div
      id="neeko-results-card"
      style={{
        width: 1080,
        height: 1920,
        position: "relative",
        background:
          "radial-gradient(900px 700px at 12% 4%, rgba(28,22,9,0.92) 0%, #050505 62%), #050505",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        letterSpacing: "-0.02em",
        overflow: "hidden",
      }}
    >
      <AntonStyle />
      <div style={{ position: "absolute", left: 0, top: 150, width: 1080, textAlign: "center", fontFamily: ANTON_FONT, fontSize: antonFit(hook[0], 88), letterSpacing: "-1px", lineHeight: 1, color: "#FFFFFF" }}>{hook[0]}</div>
      {hook[1] && (
        <div style={{ position: "absolute", left: 0, top: 150 + antonFit(hook[0], 88) + 16, width: 1080, textAlign: "center", fontFamily: ANTON_FONT, fontSize: antonFit(hook[1], 88), letterSpacing: "-1px", lineHeight: 1, color: "#F5C442" }}>{hook[1]}</div>
      )}

      <div style={{ position: "absolute", left: 0, top: 400, width: 1080, textAlign: "center", color: "#8A8F96", fontSize: 32 }}>
        ROUND RECAP · R{summary.round_number}
      </div>

      <div
        style={{
          position: "absolute",
          left: 100,
          top: 480,
          width: 880,
          height: 360,
          borderRadius: 30,
          background: "#0D0E11",
          border: "1px solid #202226",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 50, width: 293, textAlign: "center", color: "#8A8F96", fontSize: 28 }}>TRACKED</div>
        <div style={{ position: "absolute", left: 0, top: 120, width: 293, textAlign: "center", color: "#FFFFFF", fontFamily: ANTON_FONT, fontSize: 96, fontWeight: 800, lineHeight: 1 }}>
          {summary.games_count}
        </div>
        <div style={{ position: "absolute", left: 293, top: 50, width: 294, textAlign: "center", color: "#8A8F96", fontSize: 28 }}>WITHIN 10</div>
        <div style={{ position: "absolute", left: 293, top: 120, width: 294, textAlign: "center", color: "#22C55E", fontFamily: ANTON_FONT, fontSize: 96, fontWeight: 800, lineHeight: 1 }}>
          {summary.within_10_pct}%
        </div>
        <div style={{ position: "absolute", left: 587, top: 50, width: 293, textAlign: "center", color: "#8A8F96", fontSize: 28 }}>AVG ERROR</div>
        <div style={{ position: "absolute", left: 587, top: 120, width: 293, textAlign: "center", color: "#F5C442", fontFamily: ANTON_FONT, fontSize: 96, fontWeight: 800, lineHeight: 1 }}>
          {Number(summary.avg_mae).toFixed(1)}
        </div>
      </div>

      <div style={{ position: "absolute", left: 0, top: 900, width: 1080, textAlign: "center", color: "#22C55E", fontSize: 40, fontWeight: 800, lineHeight: 1.2 }}>
        ✓ {summary.best_call_name}
      </div>
      <div style={{ position: "absolute", left: 0, top: 960, width: 1080, textAlign: "center", color: "#8A8F96", fontSize: 30 }}>
        {Number(summary.best_call_projected).toFixed(0)} proj · {Number(summary.best_call_actual).toFixed(0)} actual
      </div>

      <div style={{ position: "absolute", left: 0, top: 1020, width: 1080, textAlign: "center", color: "#EF4444", fontSize: 40, fontWeight: 800, lineHeight: 1.2 }}>
        ✗ {summary.worst_call_name}
      </div>
      <div style={{ position: "absolute", left: 0, top: 1080, width: 1080, textAlign: "center", color: "#8A8F96", fontSize: 30 }}>
        {Number(summary.worst_call_projected).toFixed(0)} proj · {Number(summary.worst_call_actual).toFixed(0)} actual
      </div>

      <div style={{ position: "absolute", left: 0, top: 1160, width: 1080, textAlign: "center", color: "#A1A1AA", fontSize: 34, fontWeight: 700 }}>
        R{summary.round_number}
      </div>

      <div style={{ position: "absolute", left: 0, top: 1240, width: 1080, textAlign: "center" }}>
        <span style={{ display: "inline-block", background: "#F5C442", borderRadius: 44, padding: "22px 56px", color: "#080808", fontSize: 36, fontWeight: 800 }}>
          {cta}
        </span>
      </div>

      <div style={{ position: "absolute", left: 0, top: 1340, width: 1080, textAlign: "center", color: "#565A60", fontSize: 26 }}>
        NEEKO STATS
      </div>
    </div>
  );
}

function ResultsCardModal({ summary, onClose }: { summary: AccuracySummary; onClose: () => void }) {
  const syntheticRow = useMemo<PriceRow>(() => ({
    player_name: summary.best_call_name ?? "Neeko",
    team_name: "",
    position: "",
    price: 0,
    breakeven: 0,
    projection: Number(summary.best_call_projected) || 0,
    value_score: 0,
    season_avg: 0,
    last_5_avg: 0,
    be_delta: 0,
    matchup_label: null,
    status: "active",
    story: "value",
  }), [summary]);
  const groups = useMemo(() => buildPriceBank(syntheticRow), [syntheticRow]);
  const { flat, starts } = useMemo(() => flattenGroups(groups), [groups]);
  const [hookIdx, setHookIdx] = useState(0);
  const [customA, setCustomA] = useState("");
  const [customB, setCustomB] = useState("");
  const [cta, setCta] = useState<string>(CTA_OPTIONS[0]);
  const [downloading, setDownloading] = useState(false);
  const hasCustom = customA.trim().length > 0 || customB.trim().length > 0;
  const idx = Math.min(hookIdx, flat.length - 1);
  const hook: [string, string] = hasCustom
    ? [customA.toUpperCase(), customB.toUpperCase()]
    : (flat[idx] ?? ["", ""]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleDownload() {
    const node = document.getElementById("neeko-results-card");
    if (!node) return;
    setDownloading(true);
    document.body.style.overflow = 'hidden';
    try {
      const css = await fetch(ANTON_FONT_URL).then(r => r.text());
      const blob = await toBlob(node, {
        width: 1080,
        height: 1920,
        pixelRatio: 1,
        backgroundColor: "#050505",
        fontEmbedCSS: css,
        style: { transform: "scale(1)", transformOrigin: "top left" },
      });
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = `neeko_results_R${summary.round_number}.png`;
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      document.body.style.overflow = '';
      setDownloading(false);
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div onClick={(e) => e.stopPropagation()} className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-4">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Hook</label>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <input
            value={customA}
            onChange={(e) => setCustomA(e.target.value)}
            placeholder="Write your own…"
            className="bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
          <input
            value={customB}
            onChange={(e) => setCustomB(e.target.value)}
            placeholder="Write your own…"
            className="bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <select
          value={hookIdx}
          onChange={(e) => setHookIdx(Number(e.target.value))}
          className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
        >
          {groups.map((g, gi) => (
            <optgroup key={gi} label={g.label}>
              {g.hooks.map((h, i) => {
                const flatIdx = starts[gi] + i;
                return (
                  <option key={flatIdx} value={flatIdx}>
                    {h[0]} {h[1]}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>

        <div style={{ width: 346, height: 615, overflow: "hidden", borderRadius: 12 }}>
          <div style={{ transform: "scale(0.32)", transformOrigin: "top left" }}>
            <ResultsSummaryCard summary={summary} hook={hook} cta={cta} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex-shrink-0">CTA</label>
          <select
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            className="flex-1 bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          >
            {CTA_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-semibold rounded-lg transition-colors"
        >
          {downloading ? "Rendering…" : "Download PNG"}
        </button>
      </div>
    </div>
  );
}

function buildMultiHooks(n: number): [string, string][] {
  return [
    [`${n} PLAYERS.`, "ONE ROUND."],
    ["THE STATS NOBODY", "CHECKS."],
    [`${n} NAMES.`, "ZERO GUESSWORK."],
    ["EVERYONE LOOKS", "AT DISPOSALS."],
    ["THIS IS THE LIST.", "FREE."],
  ];
}

function CarouselSlide({ row, hook, cta, index, total }: {
  row: RankedRow | FormRow; hook: [string,string]; cta: string;
  index: number; total: number;
}) {
  const isHitRate = "threshold" in row && "rate" in row;
  return (
    <div style={{ position: "relative", width: 1080, height: 1920 }}>
      {isHitRate
        ? <NeekoCard row={row as RankedRow} hook={hook} cta={cta} />
        : <FormCard row={row as FormRow} hook={hook} cta={cta} />}
      <div style={{ position: "absolute", top: 60, right: 80,
        color: "#565A60", fontSize: 28, fontFamily: "system-ui",
        fontWeight: 600, letterSpacing: "0.05em" }}>
        {index} / {total}
      </div>
    </div>
  );
}

function MultiCard({ stack, hook, cta }: { stack: StackRow[]; hook: [string, string]; cta: string }) {
  const n = stack.length;
  const panelTop = 480;
  const rowH = 140;
  const panelHeight = 40 + n * rowH + 40;
  const panelBottom = panelTop + panelHeight;
  const ctaTop = panelBottom + 90;
  const footerTop = panelBottom + 200;
  return (
    <div
      id="neeko-multi-card"
      style={{
        width: 1080,
        height: 1920,
        position: "relative",
        background:
          "radial-gradient(900px 700px at 12% 4%, rgba(28,22,9,0.92) 0%, #050505 62%), #050505",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        letterSpacing: "-0.02em",
        overflow: "hidden",
      }}
    >
      <AntonStyle />
      <div style={{ position: "absolute", left: 0, top: 150, width: 1080, textAlign: "center", fontFamily: ANTON_FONT, fontSize: antonFit(hook[0], 96), letterSpacing: "-1px", lineHeight: 1, color: "#FFFFFF" }}>{hook[0]}</div>
      {hook[1] && (
        <div style={{ position: "absolute", left: 0, top: 150 + antonFit(hook[0], 96) + 16, width: 1080, textAlign: "center", fontFamily: ANTON_FONT, fontSize: antonFit(hook[1], 96), letterSpacing: "-1px", lineHeight: 1, color: "#F5C442" }}>{hook[1]}</div>
      )}

      <div style={{ position: "absolute", left: 80, top: panelTop, width: 920, height: panelHeight, borderRadius: 30, background: "#0D0E11", border: "1px solid #202226" }}>
        {stack.map((r, i) => {
          const isHR = "lens" in r && "threshold" in r;
          const hr = r as RankedRow;
          const fr = r as FormRow;
          const isOut = statusTag(r.player_status).label === "OUT";
          const context = isHR ? `${hr.threshold}+ ${hr.lens}` : `season ${fr.season_avg.toFixed(1)} → L5 ${fr.last_5_avg.toFixed(1)}`;
          const bigStat = isHR ? `${hr.rate}%` : `${fr.delta >= 0 ? "+" : ""}${fr.delta.toFixed(1)}`;
          const subStat = isHR ? `${hr.hits} from ${hr.games}` : `${fr.games_played} games`;
          const accent = isHR ? (hr.rate >= 90 ? "#22C55E" : "#F5C442") : (fr.delta < 0 ? "#EF4444" : "#22C55E");
          const isLast = i === n - 1;
          const y = 40 + i * rowH;
          return (
            <div key={i} style={{ position: "absolute", left: 0, top: y, width: 920, height: 130 }}>
              <div style={{ position: "absolute", left: 40, top: 16, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ color: "#FFFFFF", fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{r.player_name.toUpperCase()}</span>
                {isOut && (
                  <span style={{ display: "inline-block", background: "#3F1D1D", color: "#EF4444", fontSize: 20, borderRadius: 10, padding: "4px 12px", fontWeight: 700 }}>OUT</span>
                )}
              </div>
              <div style={{ position: "absolute", left: 40, top: 66, color: "#8A8F96", fontSize: 26 }}>{r.team_name} · {context}</div>
              <div style={{ position: "absolute", right: 40, top: 20, color: accent, fontSize: 62, fontWeight: 800, lineHeight: 1 }}>{bigStat}</div>
              <div style={{ position: "absolute", right: 40, top: 90, color: "#8A8F96", fontSize: 24 }}>{subStat}</div>
              {!isLast && <div style={{ position: "absolute", left: 40, right: 40, bottom: 0, height: 1, background: "#202226" }} />}
            </div>
          );
        })}
      </div>

      <div style={{ position: "absolute", left: 0, top: ctaTop, width: 1080, textAlign: "center" }}>
        <span style={{ display: "inline-block", background: "#F5C442", borderRadius: 44, padding: "22px 56px", color: "#080808", fontSize: 36, fontWeight: 800 }}>{cta}</span>
      </div>
      <div style={{ position: "absolute", left: 0, top: footerTop, width: 1080, textAlign: "center", color: "#565A60", fontSize: 26 }}>NEEKO STATS</div>
    </div>
  );
}

function MultiCardModal({ stack, onClose }: { stack: StackRow[]; onClose: () => void }) {
  const hooks = useMemo(() => buildMultiHooks(stack.length), [stack.length]);
  const [hookIdx, setHookIdx] = useState(0);
  const [cta, setCta] = useState<string>(CTA_OPTIONS[0]);
  const [downloading, setDownloading] = useState(false);
  const [carouselLoading, setCarouselLoading] = useState(false);
  const hook = hooks[hookIdx];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleDownload() {
    const node = document.getElementById("neeko-multi-card");
    if (!node) return;
    setDownloading(true);
    document.body.style.overflow = 'hidden';
    try {
      const css = await fetch(ANTON_FONT_URL).then(r => r.text());
      const blob = await toBlob(node, {
        width: 1080,
        height: 1920,
        pixelRatio: 1,
        backgroundColor: "#050505",
        fontEmbedCSS: css,
        style: { transform: "scale(1)", transformOrigin: "top left" },
      });
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `neeko_stack_${stack.length}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      document.body.style.overflow = '';
      setDownloading(false);
    }
  }

  async function handleCarousel() {
    setCarouselLoading(true);
    document.body.style.overflow = 'hidden';
    try {
      const css = await fetch(ANTON_FONT_URL).then(r => r.text());
      for (let i = 0; i < stack.length; i++) {
        const row = stack[i];
        const container = document.createElement('div');
        container.style.cssText =
          'position:fixed;left:-9999px;top:0;width:1080px;height:1920px;';
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        root.render(
          <CarouselSlide row={row} hook={hook} cta={cta}
            index={i + 1} total={stack.length} />
        );
        await new Promise(r => setTimeout(r, 120));
        const blob = await toBlob(container.firstChild as HTMLElement, {
          width: 1080, height: 1920, pixelRatio: 1,
          backgroundColor: "#050505", fontEmbedCSS: css,
          style: { transform: "scale(1)", transformOrigin: "top left" },
        });
        root.unmount();
        document.body.removeChild(container);
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const surname = row.player_name.split(' ').pop() ?? row.player_name;
          a.download = `neeko_slide_${i+1}_of_${stack.length}_${surname}.png`;
          a.click();
          URL.revokeObjectURL(url);
        }
        await new Promise(r => setTimeout(r, 80));
      }
    } finally {
      document.body.style.overflow = '';
      setCarouselLoading(false);
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div onClick={(e) => e.stopPropagation()} className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Hook</label>
          <select
            value={hookIdx}
            onChange={(e) => setHookIdx(Number(e.target.value))}
            className="flex-1 bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          >
            {hooks.map((h, i) => (
              <option key={i} value={i}>
                {h[0]} {h[1]}
              </option>
            ))}
          </select>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 text-lg leading-none">
            ✕
          </button>
        </div>

        <div style={{ width: 346, height: 615, overflow: "hidden", borderRadius: 12 }}>
          <div style={{ transform: "scale(0.32)", transformOrigin: "top left" }}>
            <MultiCard stack={stack} hook={hook} cta={cta} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex-shrink-0">CTA</label>
          <select
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            className="flex-1 bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          >
            {CTA_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-semibold rounded-lg transition-colors"
        >
          {downloading ? "Rendering…" : "Download PNG"}
        </button>
        <button
          onClick={handleCarousel}
          disabled={carouselLoading}
          className="w-full py-4 rounded-xl font-bold text-sm bg-zinc-800
            text-zinc-100 border border-zinc-700 hover:bg-zinc-700
            disabled:opacity-50 transition-colors"
        >
          {carouselLoading
            ? `Exporting ${stack.length} slides...`
            : `Export Carousel (${stack.length} slides)`}
        </button>
      </div>
    </div>
  );
}

function CardModal({ row, onClose }: { row: RankedRow; onClose: () => void }) {
  const groups = useMemo(() => buildHitBank(row), [row]);
  const { flat, starts } = useMemo(() => flattenGroups(groups), [groups]);
  const [hookIdx, setHookIdx] = useState(0);
  const [customA, setCustomA] = useState("");
  const [customB, setCustomB] = useState("");
  const [cta, setCta] = useState<string>(CTA_OPTIONS[0]);
  const [downloading, setDownloading] = useState(false);
  const hasCustom = customA.trim().length > 0 || customB.trim().length > 0;
  const idx = Math.min(hookIdx, flat.length - 1);
  const hook: [string, string] = hasCustom
    ? [customA.toUpperCase(), customB.toUpperCase()]
    : (flat[idx] ?? ["", ""]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleDownload() {
    const node = document.getElementById("neeko-card");
    if (!node) return;
    setDownloading(true);
    document.body.style.overflow = 'hidden';
    try {
      const css = await fetch(ANTON_FONT_URL).then(r => r.text());
      const blob = await toBlob(node, {
        width: 1080,
        height: 1920,
        pixelRatio: 1,
        backgroundColor: "#050505",
        fontEmbedCSS: css,
        style: { transform: "scale(1)", transformOrigin: "top left" },
      });
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = `${row.player_name}_${row.lens}_${row.threshold}.png`.replace(/\s+/g, "_");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      document.body.style.overflow = '';
      setDownloading(false);
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div onClick={(e) => e.stopPropagation()} className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-4">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Hook</label>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <input
            value={customA}
            onChange={(e) => setCustomA(e.target.value)}
            placeholder="Write your own…"
            className="bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
          <input
            value={customB}
            onChange={(e) => setCustomB(e.target.value)}
            placeholder="Write your own…"
            className="bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <select
          value={hookIdx}
          onChange={(e) => setHookIdx(Number(e.target.value))}
          className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
        >
          {groups.map((g, gi) => (
            <optgroup key={gi} label={g.label}>
              {g.hooks.map((h, i) => {
                const flatIdx = starts[gi] + i;
                return (
                  <option key={flatIdx} value={flatIdx}>
                    {h[0]} {h[1]}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>

        <div style={{ width: 346, height: 615, overflow: "hidden", borderRadius: 12 }}>
          <div style={{ transform: "scale(0.28)", transformOrigin: "top left" }}>
            <NeekoCard row={row} hook={hook} cta={cta} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex-shrink-0">CTA</label>
          <select
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            className="flex-1 bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          >
            {CTA_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-semibold rounded-lg transition-colors"
        >
          {downloading ? "Rendering…" : "Download PNG"}
        </button>
      </div>
    </div>
  );
}

// ── Tab ───────────────────────────────────────────────────────────────────────

export default function ContentSheet() {
  const [round, setRound] = useState<number | null>(null);
  const [currentRound, setCurrentRound] = useState<number | null>(null);
  const [fixtures, setFixtures] = useState<StatBoardMatch[]>([]);
  const [completedCalls, setCompletedCalls] = useState(0);
  const [totalCalls, setTotalCalls] = useState(0);
  const [players, setPlayers] = useState<StatBoardPlayer[]>([]);
  const [loadingFixtures, setLoadingFixtures] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storyType, setStoryType] = useState<StoryType>("All");
  const [lensFilter, setLensFilter] = useState<Lens | "All">("All");
  const [formWindow, setFormWindow] = useState<FormWindow>("L5");
  const [hideOut, setHideOut] = useState(false);
  const [thresholdFilter, setThresholdFilter] = useState<number | null>(null);
  const [matchFilter, setMatchFilter] = useState<number | null>(null);

  useEffect(() => { setThresholdFilter(null); setMatchFilter(null); }, [lensFilter]);
  const [sortView, setSortView] = useState("default");
  const visibleSortOptions = sortOptionsFor(storyType);
  // Reset sortView when storyType changes if the current sort isn't valid
  // for the new card — same reset pattern as threshold/match on lens change.
  useEffect(() => {
    if (!visibleSortOptions.some((o) => o.value === sortView)) {
      setSortView("default");
    }
  }, [storyType]);
  const [copyState, setCopyState] = useState<string | null>(null);
  const [cardRow, setCardRow] = useState<RankedRow | null>(null);
  const [formCardRow, setFormCardRow] = useState<FormRow | null>(null);
  const [priceCardRow, setPriceCardRow] = useState<PriceRow | null>(null);
  const [evergreenCardRow, setEvergreenCardRow] = useState<EvergreenRow | null>(null);
  const [resultsData, setResultsData] = useState<{
    summary: AccuracySummary | null;
    examples: AccuracyExample[];
  }>({ summary: null, examples: [] });
  const [resultsCardOpen, setResultsCardOpen] = useState(false);
  const [stack, setStack] = useState<StackRow[]>([]);
  const [multiCardOpen, setMultiCardOpen] = useState(false);
  const rankingsRef = useRef<RankingsLookup | null>(null);

  // Step 1a: resolve current round once on mount. Available rounds are
  // 1..currentRound (completed + in-progress); future rounds have no stats.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: roundData, error: roundErr } = await supabase!.rpc(
          "get_current_afl_round_safe",
          { p_season: 2026 }
        );
        if (roundErr) { setError(roundErr.message); return; }
        const r = roundData?.[0]?.current_round as number | undefined;
        if (!r) { setError("Could not resolve current round"); return; }
        if (cancelled) return;
        setCurrentRound(r);
        setRound(r);
      } finally {
        if (!cancelled) {
          // fixtures effect will clear loadingFixtures once data lands
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Step 1b: fetch fixtures whenever the selected round changes.
  // p_round must be explicit — passing null returns only the current round.
  useEffect(() => {
    if (round === null) return;
    let cancelled = false;
    setLoadingFixtures(true);
    setCompletedCalls(0);
    setTotalCalls(54);
    setResultsData({ summary: null, examples: [] });
    (async () => {
      try {
        const { data: matchData, error: matchErr } = await supabase!.rpc(
          "get_stat_board_matches",
          { p_season: 2026, p_round: round }
        );
        if (matchErr) { setError(matchErr.message); return; }
        if (cancelled) return;
        setFixtures((matchData ?? []) as StatBoardMatch[]);
      } finally {
        if (!cancelled) setLoadingFixtures(false);
      }
    })();
    return () => { cancelled = true; };
  }, [round]);

  // Available rounds: 1..currentRound. Built once currentRound is known.
  const availableRounds = useMemo(
    () => (currentRound ? Array.from({ length: currentRound }, (_, i) => currentRound - i) : []),
    [currentRound]
  );

  // Rankings enrichment: fetch once on mount, store in ref (no re-renders)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase!.rpc("get_rankings_safe", {
          p_user_id: null,
          p_is_bot: false,
          p_limit: 500,
        });
        if (cancelled || error || !data) return;
        const map: RankingsLookup = new Map();
        for (const r of data as Array<Record<string, unknown>>) {
          const name = r.player_name as string | undefined;
          if (!name) continue;
          map.set(name, {
            value_score: r.value_score !== null && r.value_score !== undefined ? Number(r.value_score) : null,
            price:       r.price !== null && r.price !== undefined ? Number(r.price) : null,
            breakeven:   r.breakeven !== null && r.breakeven !== undefined ? Number(r.breakeven) : null,
            projection:  r.projection !== null && r.projection !== undefined ? Number(r.projection) : null,
            season_avg:  r.season_avg !== null && r.season_avg !== undefined ? Number(r.season_avg) : null,
            last_5_avg:  r.last_5_avg !== null && r.last_5_avg !== undefined ? Number(r.last_5_avg) : null,
            games_played: r.games_played !== null && r.games_played !== undefined ? Number(r.games_played) : null,
            position:    (r.position as string | null) ?? null,
            team_name:   (r.team_name as string | null) ?? null,
            matchup_label: (r.matchup_label as string | null) ?? null,
            status:      (r.status as string | null) ?? null,
            consistency: r.consistency != null ? Number(r.consistency) : null,
            consistency_tier: r.consistency_tier as string | null ?? null,
            rank_position: r.rank_position != null ? Number(r.rank_position) : null,
          });
        }
        if (!cancelled) rankingsRef.current = map;
      } catch {
        // best-effort — sort falls back to no-match → bottom
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Results: fetch round accuracy summary + best-call examples when Results tab active.
  // Re-fires on round change (the [round] effect above resets resultsData to null).
  useEffect(() => {
    if (storyType !== "Results") return;
    let cancelled = false;
    (async () => {
      const [summaryRes, examplesRes] = await Promise.all([
        supabase!.rpc("get_accuracy_round_summary", { p_season: 2026, p_round: round ?? null }),
        supabase!.rpc("get_projection_accuracy_examples", { limit_n: 10 }),
      ]);
      if (cancelled) return;
      setResultsData({
        summary: (summaryRes.data?.[0] as AccuracySummary) ?? null,
        examples: (examplesRes.data as AccuracyExample[]) ?? [],
      });
    })();
    return () => { cancelled = true; };
  }, [storyType, round]);

  // Step 2: fire 54 calls (9 matches × 6 lenses), render progressively
  useEffect(() => {
    if (fixtures.length === 0) return;
    let cancelled = false;

    const total = fixtures.length * LENSES.length;
    setTotalCalls(total);
    setCompletedCalls(0);
    setPlayers([]);
    setError(null);

    (async () => {
      let done = 0;
      for (const fixture of fixtures) {
        for (const lens of LENSES) {
          if (cancelled) return;
          try {
            const { data, error: err } = await supabase!.rpc("get_stat_board_players", {
              p_season: 2026,
              p_match_id: fixture.game_id,
              p_lens: lens,
              p_limit: 500,
            });
            if (err) {
              setError(err.message);
            } else if (data) {
              const rows = (data as StatBoardPlayer[]).map((p) => ({ ...p, lens }));
              if (!cancelled) {
                setPlayers((prev) => [...prev, ...rows]);
              }
            }
          } catch {
            // per-call failure — continue remaining calls
          } finally {
            done++;
            if (!cancelled) setCompletedCalls(done);
          }
        }
      }
    })();

    return () => { cancelled = true; };
  }, [fixtures]);

  // Rank: one row per player per lens — their best (highest) qualifying threshold
  const rankedRows = useMemo<RankedRow[]>(() => {
    const stories: RankedRow[] = [];
    for (const lens of LENSES) {
      const lensPlayers = players.filter((p) => p.lens === lens);
      const headlines: RankedRow[] = [];
      for (const p of lensPlayers) {
        const sthr = p.season_threshold_hit_rates;
        if (!sthr) continue;
        const seasonAvg = p.season_avg !== null && p.season_avg !== undefined ? parseFloat(p.season_avg) : null;
        // Find the HIGHEST key threshold with rate >= 60% and games >= 8
        let best: { threshold: number; hit: ThresholdHit } | null = null;
        for (const threshold of KEY_THRESHOLDS[lens]) {
          const hit = sthr[String(threshold)];
          if (!hit) continue;
          if (hit.games < 8) continue;    // GUARD: exclude < 8 games
          if (hit.rate < 60) continue;    // must clear 60%
          if (best === null || threshold > best.threshold) {
            best = { threshold, hit };
          }
        }
        if (!best) continue; // no qualifying threshold — player does not appear
        const gap = seasonAvg !== null ? seasonAvg - best.threshold : null;
        headlines.push({
          player_name: p.player_name,
          team_name: p.team_name,
          opponent_team_name: p.opponent_team_name,
          match_id: p.match_id,
          match_label: p.match_label,
          lens,
          threshold: best.threshold,
          hits: best.hit.hits,
          games: best.hit.games,
          rate: best.hit.rate,
          season_avg: seasonAvg,
          gap,
          player_status: p.player_status,
          last_5_avg: p.last_5_avg !== null && p.last_5_avg !== undefined ? Number(p.last_5_avg) : null,
          last_3_avg: p.last_3_avg !== null && p.last_3_avg !== undefined ? Number(p.last_3_avg) : null,
          last_10_values: Array.isArray(p.last_10_values) ? p.last_10_values.map((v) => Number(v)) : [],
        });
      }
      // Rank: threshold DESC, rate DESC, games DESC; OUT demoted below PLAYING
      headlines.sort((a, b) => {
        const aOut = statusTag(a.player_status).label === "OUT";
        const bOut = statusTag(b.player_status).label === "OUT";
        if (aOut !== bOut) return aOut ? 1 : -1;
        return b.threshold - a.threshold || b.rate - a.rate || b.games - a.games;
      });
      stories.push(...headlines.slice(0, 20));
    }
    return stories;
  }, [players]);

  const availableThresholds = useMemo(() => {
    const lensRows = rankedRows.filter(
      (r) => lensFilter === "All" || r.lens === lensFilter
    );
    return Array.from(new Set(lensRows.map((r) => r.threshold))).sort((a, b) => b - a);
  }, [rankedRows, lensFilter]);

  const formRows = useMemo<FormRow[]>(() => {
    const byPlayer = new Map<string, StatBoardPlayer>();
    for (const p of players) {
      const key = `${p.player_name}__${p.lens}__${p.match_id}`;
      if (byPlayer.has(key)) continue;
      byPlayer.set(key, p);
    }
    const out: FormRow[] = [];
    for (const p of byPlayer.values()) {
      if (p.games_played < 8) continue;
      const sa = Number(p.season_avg);
      const l5 = Number(p.last_5_avg);
      const l3 = Number(p.last_3_avg);
      if (!isFinite(sa) || !isFinite(l5) || !isFinite(l3)) continue;
      const deltaL5 = l5 - sa;
      const deltaL3 = l3 - sa;
      const delta = formWindow === "L3" ? deltaL3 : deltaL5;
      const deltaMin = FORM_DELTA_MIN[p.lens] ?? 10;
      if (Math.abs(delta) < deltaMin) continue;
      out.push({
        player_name: p.player_name,
        team_name: p.team_name,
        opponent_team_name: p.opponent_team_name,
        position: (p.position_group ?? "").toUpperCase(),
        lens: p.lens,
        season_avg: sa,
        last_5_avg: l5,
        last_3_avg: l3,
        games_played: p.games_played,
        player_status: p.player_status,
        delta,
        tag: delta > 0 ? "HOT" : "COLD",
        match_id: p.match_id,
        match_label: p.match_label,
      });
    }
    // Per-lens cap: group by lens, sort each group by abs(delta) DESC,
    // take top FORM_LENS_CAP per lens, concatenate in FORM_LENS_ORDER.
    const byLens = new Map<string, FormRow[]>();
    for (const row of out) {
      if (!byLens.has(row.lens)) byLens.set(row.lens, []);
      byLens.get(row.lens)!.push(row);
    }
    const capped: FormRow[] = [];
    for (const lens of FORM_LENS_ORDER) {
      const group = byLens.get(lens);
      if (!group) continue;
      group.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      capped.push(...group.slice(0, FORM_LENS_CAP));
    }
    return capped;
  }, [players, formWindow]);

  const thresholdFilteredRows = useMemo(
    () =>
      rankedRows
        .filter((r) => lensFilter === "All" || r.lens === lensFilter)
        .filter((r) => thresholdFilter === null || r.threshold === thresholdFilter),
    [rankedRows, lensFilter, thresholdFilter]
  );

  const availableMatches = useMemo(() => {
    const seen = new Map<number, string>();
    const sources: { match_id: number; match_label: string }[] =
      storyType === "Form"
        ? formRows
        : storyType === "All"
          ? [...thresholdFilteredRows, ...formRows]
          : thresholdFilteredRows;
    for (const r of sources) {
      if (!seen.has(r.match_id)) seen.set(r.match_id, r.match_label);
    }
    return Array.from(seen, ([match_id, match_label]) => ({ match_id, match_label }));
  }, [thresholdFilteredRows, formRows, storyType]);

  const visibleRows = useMemo(
    () =>
      thresholdFilteredRows.filter((r) => matchFilter === null || r.match_id === matchFilter),
    [thresholdFilteredRows, matchFilter]
  );

  const hideOutFilter = <T extends { player_status: string }>(rows: T[]): T[] =>
    hideOut ? rows.filter((r) => (r.player_status ?? "").toLowerCase() === "active") : rows;

  const visibleHitRateRows = sortRows(hideOutFilter(visibleRows), sortView, rankingsRef.current);
  const visibleFormRows = sortRows(
    hideOutFilter(formRows.filter((r) => matchFilter === null || r.match_id === matchFilter)),
    sortView,
    rankingsRef.current
  );

  // Price rows: derive from rankingsRef on demand when Prices tab is active.
  // No new RPC — uses the rankings already fetched on mount.
  const priceRows = useMemo<PriceRow[]>(() => {
    if (storyType !== "Prices") return [];
    const map = rankingsRef.current;
    if (!map) return [];

    // Build the qualifying pool: active, >=8 games, with price + breakeven + projection.
    const pool: Omit<PriceRow, "story">[] = [];
    for (const [, r] of map) {
      if (!r) continue;
      if (r.price === null || r.breakeven === null || r.projection === null) continue;
      if (r.value_score === null) continue;
      if (r.games_played === null || r.games_played < 8) continue;
      const status = (r.status ?? "").toLowerCase();
      if (status !== "active") continue;
      pool.push({
        player_name: "",
        team_name: r.team_name ?? "",
        position: r.position ?? "",
        price: r.price,
        breakeven: r.breakeven,
        projection: r.projection,
        value_score: r.value_score,
        season_avg: r.season_avg ?? 0,
        last_5_avg: r.last_5_avg ?? 0,
        be_delta: r.breakeven - r.projection,
        matchup_label: r.matchup_label,
        status: r.status ?? "active",
      });
    }
    if (pool.length === 0) return [];

    // Top 15% / top 30% value_score thresholds (percentile of the qualifying pool).
    const sortedVals = pool.map((p) => p.value_score).sort((a, b) => a - b);
    const pct = (q: number) => sortedVals[Math.min(sortedVals.length - 1, Math.floor(sortedVals.length * q))] ?? sortedVals[sortedVals.length - 1];
    const p85 = pct(0.85);   // top 15%
    const p70 = pct(0.70);   // top 30%

    // Re-attach player_name (stored as key in map) and assign story.
    const withStory: PriceRow[] = [];
    for (const [name, r] of map) {
      if (!r) continue;
      if (r.price === null || r.breakeven === null || r.projection === null) continue;
      if (r.value_score === null) continue;
      if (r.games_played === null || r.games_played < 8) continue;
      const status = (r.status ?? "").toLowerCase();
      if (status !== "active") continue;
      const base: Omit<PriceRow, "story"> = {
        player_name: name,
        team_name: r.team_name ?? "",
        position: r.position ?? "",
        price: r.price,
        breakeven: r.breakeven,
        projection: r.projection,
        value_score: r.value_score,
        season_avg: r.season_avg ?? 0,
        last_5_avg: r.last_5_avg ?? 0,
        be_delta: r.breakeven - r.projection,
        matchup_label: r.matchup_label,
        status: r.status ?? "active",
      };
      const story = assignPriceStory(base, p85, p70);
      if (story) withStory.push({ ...base, story });
    }

    // Sort: default = be_delta DESC (highest pressure first).
    if (sortView === "value")      withStory.sort((a, b) => b.value_score - a.value_score);
    else if (sortView === "be")    withStory.sort((a, b) => b.be_delta - a.be_delta);
    else if (sortView === "expensive") withStory.sort((a, b) => b.price - a.price);
    else if (sortView === "overrated") withStory.sort((a, b) => b.be_delta - a.be_delta);
    else                           withStory.sort((a, b) => b.be_delta - a.be_delta);

    return withStory.slice(0, 50);
  }, [storyType, sortView, rankingsRef.current]);

  // Evergreen rows: derive from rankingsRef on demand when Evergreen tab is active.
  // No new RPC — uses the rankings already fetched on mount.
  const evergreenRows = useMemo<EvergreenRow[]>(() => {
    if (storyType !== "Evergreen") return [];
    const map = rankingsRef.current;
    if (!map) return [];

    // Build the qualifying pool: active, >=8 games, with consistency + rank_position.
    const pool: Omit<EvergreenRow, "story">[] = [];
    for (const [name, r] of map) {
      if (!r) continue;
      if (r.consistency === null) continue;
      if (r.rank_position === null) continue;
      if (r.price === null) continue;
      if (r.value_score === null) continue;
      if (r.games_played === null || r.games_played < 8) continue;
      const status = (r.status ?? "").toLowerCase();
      if (status !== "active") continue;
      pool.push({
        player_name: name,
        team_name: r.team_name ?? "",
        position: r.position ?? "",
        price: r.price,
        consistency: r.consistency,
        consistency_tier: r.consistency_tier,
        rank_position: r.rank_position,
        season_avg: r.season_avg ?? 0,
        last_5_avg: r.last_5_avg ?? 0,
        value_score: r.value_score,
        matchup_label: r.matchup_label,
        status: r.status ?? "active",
      });
    }
    if (pool.length === 0) return [];

    // Assign story, group, cap 15 per group.
    const groups = new Map<EvergreenStory, EvergreenRow[]>();
    for (const s of ["elite", "risk", "top_ranked", "rising"] as EvergreenStory[]) groups.set(s, []);
    for (const base of pool) {
      const story = assignEvergreenStory(base);
      if (!story) continue;
      groups.get(story)!.push({ ...base, story });
    }
    for (const [, list] of groups) list.sort((a, b) => b.consistency - a.consistency);
    const capped: EvergreenRow[] = [];
    for (const s of ["elite", "risk", "top_ranked", "rising"] as EvergreenStory[]) {
      capped.push(...(groups.get(s) ?? []).slice(0, 15));
    }

    // Sort: default = consistency DESC. Other sorts handled by the dropdown.
    if (sortView === "consistency")      capped.sort((a, b) => b.consistency - a.consistency);
    else if (sortView === "rank")        capped.sort((a, b) => a.rank_position - b.rank_position);
    else if (sortView === "value")       capped.sort((a, b) => b.value_score - a.value_score);
    else                                  capped.sort((a, b) => b.consistency - a.consistency);

    return capped;
  }, [storyType, sortView, rankingsRef.current]);

  const groupedEvergreenRows = useMemo(() => {
    const order: EvergreenStory[] = ["elite", "top_ranked", "rising", "risk"];
    const m = new Map<EvergreenStory, EvergreenRow[]>();
    for (const s of order) m.set(s, []);
    for (const r of evergreenRows) m.get(r.story)!.push(r);
    return m;
  }, [evergreenRows]);

  const groupedPriceRows = useMemo(() => {
    const order: PriceStory[] = ["trap", "bargain", "expensive", "value"];
    const map = new Map<PriceStory, PriceRow[]>();
    for (const s of order) map.set(s, []);
    for (const r of priceRows) map.get(r.story)!.push(r);
    return map;
  }, [priceRows]);

  function copyBrief(r: RankedRow) {
    navigator.clipboard.writeText(makeBrief(r)).then(() => {
      setCopyState(r.player_name + r.threshold);
      setTimeout(() => setCopyState(null), 1500);
    });
  }

  function copyAll() {
    const text = visibleRows.map(makeBrief).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopyState("ALL");
      setTimeout(() => setCopyState(null), 1500);
    });
  }

  function toggleStack(row: StackRow) {
    const k = stackKey(row);
    setStack((prev) => {
      if (prev.some((r) => stackKey(r) === k)) return prev.filter((r) => stackKey(r) !== k);
      if (prev.length >= 6) return prev;
      return [...prev, row];
    });
  }

  const stackFull = stack.length >= 6;

  // Group visible rows by lens for display
  const grouped = useMemo(() => {
    const map = new Map<Lens, RankedRow[]>();
    for (const r of visibleHitRateRows) {
      if (!map.has(r.lens as Lens)) map.set(r.lens as Lens, []);
      map.get(r.lens as Lens)!.push(r);
    }
    return map;
  }, [visibleHitRateRows]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loadingFixtures && storyType !== "Results") {
    return <div className="py-20 text-center text-xs text-zinc-500">Loading fixtures…</div>;
  }
  if (error && storyType !== "Results") {
    return <div className="py-10 text-center text-xs text-red-400">{error}</div>;
  }
  if (fixtures.length === 0 && storyType !== "Results") {
    return <div className="py-10 text-center text-xs text-zinc-500">No fixtures found for round {round}.</div>;
  }

  const allDone = completedCalls >= totalCalls && totalCalls > 0;

  return (
    <div className="space-y-5">
      {/* Progress bar */}
      <div className="flex items-center gap-3 bg-zinc-900 rounded-lg px-4 py-3">
        <div className="text-sm font-semibold text-zinc-200">
          {completedCalls} of {totalCalls}
        </div>
        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-zinc-400 transition-all duration-300"
            style={{ width: `${totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0}%` }}
          />
        </div>
        <div className="text-xs text-zinc-500">
          {allDone ? "Complete" : "Fetching…"}
        </div>
      </div>

      {/* Filter bar — STORY / LENS / WINDOW + Hide OUT */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mr-1">Story</span>
          {(["All", "HitRates", "Form", "Prices", "Evergreen", "Results"] as StoryType[]).map((s) => (
            <button
              key={s}
              onClick={() => setStoryType(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                storyType === s
                  ? "bg-zinc-700 text-zinc-100"
                  : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {s === "HitRates" ? "Hit Rates" : s}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-2">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Round</label>
            <select
              value={round ?? currentRound ?? 19}
              onChange={(e) => setRound(Number(e.target.value))}
              disabled={availableRounds.length === 0 || loadingFixtures}
              className="bg-zinc-800 text-zinc-100 text-xs rounded-lg px-2 py-1.5 border border-zinc-700 focus:outline-none focus:border-zinc-500 disabled:opacity-40"
            >
              {availableRounds.map((r) => (
                <option key={r} value={r}>
                  {r === currentRound ? `R${r} (current)` : `R${r}`}
                </option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Sort</label>
              <select
                value={sortView}
                onChange={(e) => setSortView(e.target.value)}
                className="bg-zinc-800 text-zinc-100 text-xs rounded-lg px-2 py-1.5 border border-zinc-700 focus:outline-none focus:border-zinc-500"
              >
                {visibleSortOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideOut}
                onChange={(e) => setHideOut(e.target.checked)}
                className="accent-zinc-500"
              />
              Hide OUT
            </label>
          </div>
        </div>

        {storyType !== "Form" && storyType !== "Prices" && storyType !== "Evergreen" && storyType !== "Results" && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mr-1">Lens</span>
            <button
              onClick={() => setLensFilter("All")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                lensFilter === "All"
                  ? "bg-zinc-700 text-zinc-100"
                  : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              All
            </button>
            {LENSES.map((lens) => (
              <button
                key={lens}
                onClick={() => setLensFilter(lens)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  lensFilter === lens
                    ? "bg-zinc-700 text-zinc-100"
                    : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {LENS_LABELS[lens]}
              </button>
            ))}
            <button
              onClick={copyAll}
              disabled={visibleHitRateRows.length === 0}
              className="ml-auto px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-200 transition-colors"
            >
              {copyState === "ALL" ? "Copied!" : "⧉ Copy All"}
            </button>
          </div>
        )}

        {storyType !== "Form" && storyType !== "Prices" && storyType !== "Evergreen" && storyType !== "Results" && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mr-1">Threshold</span>
            <button
              onClick={() => setThresholdFilter(null)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                thresholdFilter === null
                  ? "bg-zinc-700 text-zinc-100"
                  : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              All
            </button>
            {availableThresholds.map((t) => (
              <button
                key={t}
                onClick={() => setThresholdFilter(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  thresholdFilter === t
                    ? "bg-zinc-700 text-zinc-100"
                    : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t}+
              </button>
            ))}
          </div>
        )}

        {storyType !== "Prices" && storyType !== "Evergreen" && storyType !== "Results" && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mr-1">Match</span>
            <button
              onClick={() => setMatchFilter(null)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                matchFilter === null
                  ? "bg-zinc-700 text-zinc-100"
                  : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              All
            </button>
            {availableMatches.map((m) => (
              <button
                key={m.match_id}
                onClick={() => setMatchFilter(m.match_id)}
                title={m.match_label}
                className={`max-w-[180px] truncate px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  matchFilter === m.match_id
                    ? "bg-zinc-700 text-zinc-100"
                    : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {m.match_label}
              </button>
            ))}
          </div>
        )}

        {storyType === "Form" && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mr-1">Window</span>
            {(["L5", "L3"] as FormWindow[]).map((w) => (
              <button
                key={w}
                onClick={() => setFormWindow(w)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  formWindow === w
                    ? "bg-zinc-700 text-zinc-100"
                    : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stack bar */}
      {stack.length > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-2 flex-wrap bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">STACK {stack.length}/6</span>
          {stack.map((r) => {
            const k = stackKey(r);
            const surname = (r.player_name.split(" ").pop() ?? r.player_name).toUpperCase();
            return (
              <button
                key={k}
                onClick={() => setStack((prev) => prev.filter((s) => stackKey(s) !== k))}
                className="text-xs px-2 py-1 rounded-full bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                {surname} ×
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setStack([])}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => setMultiCardOpen(true)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-400 text-black transition-colors"
            >
              Build Card →
            </button>
          </div>
        </div>
      )}

      {/* Rows */}
      {storyType === "Form" ? (
        visibleFormRows.length === 0 ? (
          <div className="py-10 text-center text-xs text-zinc-500">
            No form movers with ≥10 games and |Δ| ≥ 12 {formWindow}.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
              Form · {formWindow} (top {visibleFormRows.length})
            </div>
            {visibleFormRows.map((r, i) => {
              const status = statusTag(r.player_status);
              const copied = copyState === r.player_name + "form" + i;
              const inStack = stack.some((s) => stackKey(s) === stackKey(r));
              const lastVal = formWindow === "L3" ? r.last_3_avg.toFixed(1) : r.last_5_avg.toFixed(1);
              const lastLbl = formWindow === "L3" ? "L3" : "L5";
              const deltaStr = (r.delta >= 0 ? "+" : "") + r.delta.toFixed(1);
              const tagCls = r.tag === "HOT" ? "bg-green-900/60 text-green-300" : "bg-red-900/60 text-red-300";
              return (
                <div
                  key={`form-${r.player_name}-${i}`}
                  className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-lg px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 font-medium truncate">
                      {r.player_name}{" "}
                      <span className="text-zinc-500 font-normal">· {r.team_name} v {r.opponent_team_name ?? "—"}</span>
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      season {r.season_avg.toFixed(1)} → {lastLbl} {lastVal}
                    </div>
                    <div className="text-xs text-zinc-300 mt-0.5">
                      {deltaStr}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${tagCls}`}>
                    {r.tag}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${status.cls}`}>
                    {status.label}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${r.player_name} | ${r.team_name} v ${r.opponent_team_name ?? "—"} | season ${r.season_avg.toFixed(1)} → ${lastLbl} ${lastVal} | ${deltaStr} | ${r.tag} | ${status.label}`
                      ).then(() => {
                        setCopyState(r.player_name + "form" + i);
                        setTimeout(() => setCopyState(null), 1500);
                      });
                    }}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
                    title="Copy brief"
                  >
                    {copied ? "Copied!" : "⧉"}
                  </button>
                  <button
                    onClick={() => toggleStack(r)}
                    disabled={!inStack && stackFull}
                    className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors flex-shrink-0"
                    title={inStack ? "Remove from stack" : "Add to stack"}
                  >
                    {inStack ? "−" : "+"}
                  </button>
                  <button
                    onClick={() => setFormCardRow(r)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
                    title="Export PNG"
                  >
                    PNG
                  </button>
                </div>
              );
            })}
          </div>
        )
      ) : visibleHitRateRows.length === 0 && allDone ? (
        <div className="py-10 text-center text-xs text-zinc-500">
          No players with ≥10 games at key thresholds.
        </div>
      ) : storyType === "Prices" ? null : storyType === "Evergreen" ? null : (
        <div className="space-y-6">
          {LENSES.filter((l) => lensFilter === "All" || lensFilter === l).map((lens) => {
            const rows = grouped.get(lens);
            if (!rows || rows.length === 0) return null;
            return (
              <div key={lens} className="space-y-2">
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  {LENS_LABELS[lens]}
                </div>
                {rows.map((r, i) => {
                  const tag = statusTag(r.player_status);
                  const copied = copyState === r.player_name + r.threshold;
                  const inStack = stack.some((s) => stackKey(s) === stackKey(r));
                  return (
                    <div
                      key={`${lens}-${r.player_name}-${r.threshold}-${i}`}
                      className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-lg px-4 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-200 font-medium truncate">
                          {r.player_name}{" "}
                          <span className="text-zinc-500 font-normal">· {r.team_name} v {r.opponent_team_name ?? "—"}</span>
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          {r.threshold}+ {r.lens}
                        </div>
                        <div className="text-xs text-zinc-300 mt-0.5">
                          {r.hits}/{r.games} · {r.rate}%
                        </div>
                        {r.season_avg !== null && (
                          <div className="text-xs text-zinc-500 mt-0.5">
                            season avg {r.season_avg.toFixed(1)} {fmtGap(r.gap)}
                          </div>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${tag.cls}`}>
                        {tag.label}
                      </span>
                      <button
                        onClick={() => copyBrief(r)}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
                        title="Copy brief"
                      >
                        {copied ? "Copied!" : "⧉"}
                      </button>
                      <button
                        onClick={() => toggleStack(r)}
                        disabled={!inStack && stackFull}
                        className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors flex-shrink-0"
                        title={inStack ? "Remove from stack" : "Add to stack"}
                      >
                        {inStack ? "−" : "+"}
                      </button>
                      <button
                        onClick={() => setCardRow(r)}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
                        title="Export PNG"
                      >
                        PNG
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {cardRow && <CardModal row={cardRow} onClose={() => setCardRow(null)} />}
      {formCardRow && (
        <FormCardModal row={formCardRow} formWindow={formWindow} onClose={() => setFormCardRow(null)} />
      )}
      {multiCardOpen && stack.length > 0 && (
        <MultiCardModal stack={stack} onClose={() => setMultiCardOpen(false)} />
      )}

      {storyType === "Results" && (
        <div className="space-y-4">
          {resultsData.summary === null ? (
            <div className="py-10 flex items-center justify-center">
              <div className="h-6 w-6 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <button
                onClick={() => setResultsCardOpen(true)}
                className="w-full px-4 py-3 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg transition-colors"
              >
                Download Summary Card · R{resultsData.summary.round_number}
              </button>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  Best calls (R{resultsData.summary.round_number})
                </div>
                <div className="grid grid-cols-6 gap-2 px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  <div>Player</div>
                  <div>Team</div>
                  <div className="text-right">Projected</div>
                  <div className="text-right">Actual</div>
                  <div className="text-right">Error</div>
                  <div className="text-right">Tier</div>
                </div>
                {[...resultsData.examples]
                  .sort((a, b) => Number(a.error) - Number(b.error))
                  .map((ex, i) => (
                    <div
                      key={`${ex.player_name}-${i}`}
                      className="grid grid-cols-6 gap-2 px-3 py-2 text-xs text-zinc-200 bg-zinc-900/60 border border-zinc-800 rounded-lg"
                    >
                      <div className="truncate">{ex.player_name}</div>
                      <div className="truncate text-zinc-400">{ex.team_name}</div>
                      <div className="text-right">{Number(ex.projection).toFixed(0)}</div>
                      <div className="text-right">{Number(ex.actual_score).toFixed(0)}</div>
                      <div className="text-right">{Number(ex.error).toFixed(1)}</div>
                      <div className="text-right">{ex.accuracy_tier}</div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}

      {storyType === "Prices" && (
        <div className="space-y-6">
          {priceRows.length === 0 && (
            <div className="py-10 text-center text-xs text-zinc-500">
              No price stories for the current rankings pool.
            </div>
          )}
          {(["trap", "bargain", "expensive", "value"] as PriceStory[]).map((story) => {
            const rows = groupedPriceRows.get(story);
            if (!rows || rows.length === 0) return null;
            const meta = PRICE_STORY_META[story];
            return (
              <div key={story} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: meta.bg }}>
                  {meta.label}
                </div>
                {rows.map((r, i) => (
                  <div
                    key={`${r.player_name}-${story}-${i}`}
                    className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-lg px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-200 font-medium truncate">
                        {r.player_name}{" "}
                        <span className="text-zinc-500 font-normal">· {r.team_name} · {r.position}</span>
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        ${(r.price / 1000).toFixed(0)}K · BE {Math.round(r.breakeven)} · Proj {Math.round(r.projection)}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        Δ {r.be_delta > 0 ? "+" : ""}{Math.round(r.be_delta)} · Sz {r.season_avg.toFixed(1)} · L5 {r.last_5_avg.toFixed(1)}
                      </div>
                    </div>
                    <span
                      className="text-xs px-2 py-0.5 rounded font-medium"
                      style={{ background: meta.bg, color: meta.text }}
                    >
                      {meta.badge}
                    </span>
                    <button
                      onClick={() => setPriceCardRow(r)}
                      className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
                      title="Export PNG"
                    >
                      PNG
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {priceCardRow && (
        <PriceCardModal row={priceCardRow} onClose={() => setPriceCardRow(null)} />
      )}

      {storyType === "Evergreen" && (
        <div className="space-y-6">
          {evergreenRows.length === 0 && (
            <div className="py-10 text-center text-xs text-zinc-500">
              No evergreen stories for the current rankings pool.
            </div>
          )}
          {(["elite", "top_ranked", "rising", "risk"] as EvergreenStory[]).map((story) => {
            const rows = groupedEvergreenRows.get(story);
            if (!rows || rows.length === 0) return null;
            const meta = EVERGREEN_STORY_META[story];
            return (
              <div key={story} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: meta.bg }}>
                  {meta.label}
                </div>
                {rows.map((r, i) => (
                  <div
                    key={`${r.player_name}-${story}-${i}`}
                    className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-lg px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-200 font-medium truncate">
                        {r.player_name}{" "}
                        <span className="text-zinc-500 font-normal">· {r.team_name} · {r.position}</span>
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {Math.round(r.consistency)}% · RANK #{Math.round(r.rank_position)} · ${(r.price / 1000).toFixed(0)}K
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        Sz {r.season_avg.toFixed(1)} · L5 {r.last_5_avg.toFixed(1)} · VS {r.value_score.toFixed(0)}
                      </div>
                    </div>
                    <span
                      className="text-xs px-2 py-0.5 rounded font-medium"
                      style={{ background: meta.bg, color: meta.text }}
                    >
                      {meta.badge}
                    </span>
                    <button
                      onClick={() => setEvergreenCardRow(r)}
                      className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
                      title="Export PNG"
                    >
                      PNG
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {evergreenCardRow && (
        <EvergreenCardModal row={evergreenCardRow} onClose={() => setEvergreenCardRow(null)} />
      )}

      {resultsCardOpen && resultsData.summary && (
        <ResultsCardModal summary={resultsData.summary} onClose={() => setResultsCardOpen(false)} />
      )}
    </div>
  );
}
