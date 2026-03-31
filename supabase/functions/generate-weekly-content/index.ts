import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PlayerData {
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  projection: number;
  ceiling: number;
  floor: number;
  price: number;
  prev_price: number;
  price_change: number;
  value_score: number;
  best_value_score: number;
  rank: number;
  form_score: number;
  consistency: number;
  captain_score: number;
  risk_rating: number;
  upside_pct: number;
  matchup_label: string;
  signal: string;
  ai_recommendation: string;
  recommendation_short: string;
  market_watch_category: string;
  games_played: number;
  player_status: string;
  is_bye: boolean;
  played_last_game: boolean;
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

interface ProofPlayer {
  player_id: number;
  player_name: string;
  team: string;
  fantasy_score: number;
  projection_final: number;
  accuracy_gap: number;
}

// ── WEEKLY CAPS ────────────────────────────────────────────────────────────────
const WEEKLY_CAPS: Record<string, number> = {
  Top3: 2,
  Proof: 3,
  Value: 5,
  Trap: 4,
  Breakout: 4,
};

// ── WEEKLY TEMPLATE (LOCKED) ───────────────────────────────────────────────────
// Monday:    Value, Trap, Proof
// Tuesday:   Breakout, Value, Proof
// Wednesday: Conversation, Value, Breakout
// Thursday:  Injury, Value, Trap
// Friday:    Top3, Breakout, Value
// Saturday:  Top3 (optional→Breakout), Breakout, Engagement
// Sunday:    Value, Breakout, Proof
// ─────────────────────────────────────────────────────────────────────────────

type Category =
  | "Value"
  | "Trap"
  | "Breakout"
  | "Proof"
  | "Top3"
  | "Engagement"
  | "Conversation"
  | "Injury";

interface DayConfig {
  label: string;
  display: string;
  categories: [Category, Category, Category];
  angles: [string, string, string];
  content_types: [string, string, string];
}

const DAY_CONFIGS: DayConfig[] = [
  {
    label: "monday",
    display: "Monday",
    categories: ["Value", "Trap", "Proof"],
    angles: ["hidden_edge", "trap_warning", "we_called_it"],
    content_types: ["Graphic Post", "Callout Post", "Screen Recording"],
  },
  {
    label: "tuesday",
    display: "Tuesday",
    categories: ["Breakout", "Value", "Proof"],
    angles: ["market_inefficiency", "hidden_edge", "proof"],
    content_types: ["Short-form Video", "Graphic Post", "Screen Recording"],
  },
  {
    label: "wednesday",
    display: "Wednesday",
    categories: ["Conversation", "Value", "Breakout"],
    angles: ["conversation", "breakdown", "market_inefficiency"],
    content_types: ["Conversation Post", "Educational Breakdown", "Short-form Video"],
  },
  {
    label: "thursday",
    display: "Thursday",
    categories: ["Injury", "Value", "Trap"],
    angles: ["injury_replacement", "hidden_edge", "trap_warning"],
    content_types: ["Injury Alert Post", "Graphic Post", "Callout Post"],
  },
  {
    label: "friday",
    display: "Friday",
    categories: ["Top3", "Breakout", "Value"],
    angles: ["top3_friday", "market_inefficiency", "hidden_edge"],
    content_types: ["Top 3 Post", "Short-form Video", "Graphic Post"],
  },
  {
    label: "saturday",
    display: "Saturday",
    categories: ["Top3", "Breakout", "Engagement"],
    angles: ["top3_saturday", "market_inefficiency", "conversation"],
    content_types: ["Top 3 Post", "Short-form Video", "Conversation Post"],
  },
  {
    label: "sunday",
    display: "Sunday",
    categories: ["Value", "Breakout", "Proof"],
    angles: ["hidden_edge", "market_inefficiency", "proof"],
    content_types: ["Graphic Post", "Short-form Video", "Screen Recording"],
  },
];

// ── CATEGORY PRIORITY (lower = processed first) ────────────────────────────────
const CATEGORY_PRIORITY: Record<string, number> = {
  Top3: 0,
  Proof: 1,
  Value: 2,
  Breakout: 3,
  Trap: 4,
  Engagement: 5,
  Conversation: 5,
  Injury: 5,
};

// ── FILTER THRESHOLDS ─────────────────────────────────────────────────────────
const VALUE_MIN_VALUE_SCORE = 5;
const VALUE_MAX_BUST_RISK = 6;
const TRAP_MAX_VALUE_SCORE = 4;
const TRAP_MIN_BUST_RISK = 6;
const BREAKOUT_MIN_UPSIDE = 8;
const BREAKOUT_MIN_FORM = 55;

// ── HARD BYE GUARD ─────────────────────────────────────────────────────────────
// Applied at every layer as a final safeguard
function isValidPlayer(p: PlayerData): boolean {
  if (p.is_bye) return false;
  if (p.player_status === "RETIRED" || p.player_status === "DELISTED") return false;
  return true;
}

function hardFilter(players: PlayerData[]): PlayerData[] {
  const before = players.length;
  const filtered = players.filter(isValidPlayer);
  const removed = before - filtered.length;
  if (removed > 0) {
    console.log(`[hard-filter] Removed ${removed} BYE/RETIRED/DELISTED players`);
  }
  return filtered;
}

function getWeekKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const week = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7,
  );
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function getWeekStartDate(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split("T")[0];
}

// ── TIER-BASED RANDOM SELECTION ───────────────────────────────────────────────
// Splits pool into 3 tiers and randomly picks a tier first for variety
function pickFromTiers(pool: PlayerData[]): PlayerData | undefined {
  if (pool.length === 0) return undefined;

  const tier1 = pool.slice(0, Math.min(30, pool.length));
  const tier2 = pool.slice(30, Math.min(80, pool.length));
  const tier3 = pool.slice(80, Math.min(150, pool.length));

  const rand = Math.random();
  let selectedTier: PlayerData[];

  if (rand < 0.50 || tier2.length === 0) {
    selectedTier = tier1;
  } else if (rand < 0.80 || tier3.length === 0) {
    selectedTier = tier2.length > 0 ? tier2 : tier1;
  } else {
    selectedTier = tier3.length > 0 ? tier3 : (tier2.length > 0 ? tier2 : tier1);
  }

  const pick = selectedTier[Math.floor(Math.random() * selectedTier.length)];
  console.log(`[tier-pick] tier=${rand < 0.50 ? "1(1-30)" : rand < 0.80 ? "2(31-80)" : "3(81-150)"} → ${pick?.player_name} (${pick?.team})`);
  return pick;
}

function pickRandom(pool: PlayerData[], windowSize = 10): PlayerData | undefined {
  if (pool.length === 0) return undefined;
  const window = pool.slice(0, Math.min(windowSize, pool.length));
  return window[Math.floor(Math.random() * window.length)];
}

function shuffleTopN<T>(arr: T[], n: number): T[] {
  const top = arr.slice(0, Math.min(n, arr.length));
  for (let i = top.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [top[i], top[j]] = [top[j], top[i]];
  }
  return top;
}

// ── TOP3 PLAYER SELECTION ─────────────────────────────────────────────────────
function selectTop3Players(
  pool: PlayerData[],
  globalUsedIds: Set<number>,
): Top3Player[] {
  // Try fresh players first; fall back to full pool if not enough
  let available = hardFilter(pool.filter(p => !globalUsedIds.has(p.player_id)));
  if (available.length < 3) {
    console.warn(`[top3] Only ${available.length} fresh players — relaxing to full pool`);
    available = hardFilter(pool);
  }

  const sorted = [...available].sort((a, b) => {
    if (b.projection !== a.projection) return b.projection - a.projection;
    return b.value_score - a.value_score;
  });

  const candidatePool = shuffleTopN(sorted, 15);

  const picked: PlayerData[] = [];
  const usedPositions = new Set<string>();
  const usedTeams = new Set<string>();

  for (const p of candidatePool) {
    if (picked.length >= 3) break;
    if (!usedPositions.has(p.position) && !usedTeams.has(p.team)) {
      picked.push(p);
      usedPositions.add(p.position);
      usedTeams.add(p.team);
    }
  }

  if (picked.length < 3) {
    for (const p of candidatePool) {
      if (picked.length >= 3) break;
      if (picked.some(x => x.player_id === p.player_id)) continue;
      if (!usedTeams.has(p.team)) {
        picked.push(p);
        usedTeams.add(p.team);
      }
    }
  }

  if (picked.length < 3) {
    for (const p of candidatePool) {
      if (picked.length >= 3) break;
      if (picked.some(x => x.player_id === p.player_id)) continue;
      picked.push(p);
    }
  }

  console.log(`[top3] Selected: ${picked.map(p => `${p.player_name}(${p.team})`).join(", ")}`);

  return picked.slice(0, 3).map(p => ({
    player_id: p.player_id,
    player_name: p.player_name,
    team: p.team,
    position: p.position,
    projection: p.projection,
    ceiling: p.ceiling,
    value_score: p.value_score,
  }));
}

type PostSelection = {
  player_id: number;
  player_name: string;
  team: string;
  category: Category;
  angle: string;
  content_type: string;
  player2_id: number | null;
  player2_name: string | null;
  top3_players: Top3Player[] | null;
};

// ── WEEK PLAN BUILDER ─────────────────────────────────────────────────────────
function buildWeekPlan(
  players: PlayerData[],
  proofPlayers: ProofPlayer[],
  injuredPlayers: PlayerData[] = [],
): PostSelection[] {
  // SECTION 1: Hard BYE filter applied before ANY selection logic
  const safePlayers = hardFilter(players);
  const safeInjured = injuredPlayers.filter(p => !p.is_bye && p.player_status !== "RETIRED" && p.player_status !== "DELISTED");

  console.log(`[build] Starting with ${safePlayers.length} active, ${safeInjured.length} injured`);

  const weekCounts: Record<string, number> = {};
  const globalUsedIds = new Set<number>();
  const allPosts: PostSelection[] = [];

  function incCount(cat: string) {
    weekCounts[cat] = (weekCounts[cat] ?? 0) + 1;
  }

  function atCap(cat: string): boolean {
    const cap = WEEKLY_CAPS[cat];
    if (cap == null) return false;
    return (weekCounts[cat] ?? 0) >= cap;
  }

  function fallbackCategory(cat: Category): Category {
    if (cat === "Top3") return "Breakout";
    if (cat === "Trap") return "Value";
    return "Value";
  }

  function dayAvailablePool(dayUsedIds: Set<number>): PlayerData[] {
    return hardFilter(
      safePlayers.filter(p => !globalUsedIds.has(p.player_id) && !dayUsedIds.has(p.player_id))
    );
  }

  // SECTION 2: Pool relaxation — if pool is too small, fall back progressively
  function relaxedPool(dayUsedIds: Set<number>): PlayerData[] {
    const primary = dayAvailablePool(dayUsedIds);
    if (primary.length >= 10) return primary;
    console.warn(`[pool-relax] Primary pool too small (${primary.length}), ignoring usage tracking`);
    const withoutUsage = hardFilter(safePlayers.filter(p => !dayUsedIds.has(p.player_id)));
    if (withoutUsage.length >= 5) return withoutUsage;
    console.warn(`[pool-relax] Still too small (${withoutUsage.length}), expanding to full active list`);
    return hardFilter(safePlayers);
  }

  // SECTION 1: Guaranteed fallback player — never returns null if safePlayers is non-empty
  function guaranteedFallback(dayUsedIds: Set<number>, reason: string): PlayerData {
    const pool = relaxedPool(dayUsedIds);
    const pick = pool.sort((a, b) => b.rank - a.rank)[0] ?? safePlayers[0];
    console.warn(`[fallback] No player found for ${reason} — using fallback: ${pick?.player_name ?? "NONE"}`);
    return pick;
  }

  function selectPlayerForCategory(
    cat: Category,
    dayUsedIds: Set<number>,
  ): { player: PlayerData | undefined; top3Players: Top3Player[] | null; reason: string } {
    const pool = relaxedPool(dayUsedIds);

    if (cat === "Top3") {
      const top3 = selectTop3Players(safePlayers, globalUsedIds);
      const anchor = safePlayers.find(p => p.player_id === top3[0]?.player_id);
      return { player: anchor, top3Players: top3, reason: "top3 shuffle from top 15 by projection" };
    }

    if (cat === "Proof") {
      const proofAvail = proofPlayers.filter(
        p => !globalUsedIds.has(p.player_id) && !dayUsedIds.has(p.player_id),
      );
      console.log(`[select] Proof pool_size=${proofAvail.length}`);
      if (proofAvail.length > 0) {
        const pp = proofAvail[Math.floor(Math.random() * proofAvail.length)];
        const found = safePlayers.find(p => p.player_id === pp.player_id);
        if (found) {
          console.log(`[select] Proof → ${found.player_name} (accuracy_gap=${pp.accuracy_gap}) fallback_used=false`);
          return { player: found, top3Players: null, reason: `proof: accuracy_gap=${pp.accuracy_gap}` };
        }
        const synthetic: PlayerData = {
          player_id: pp.player_id,
          player_name: pp.player_name,
          team: pp.team,
          position: "MID",
          projection: pp.projection_final,
          ceiling: pp.projection_final + 20,
          floor: pp.projection_final - 20,
          price: 500000,
          prev_price: 500000,
          price_change: 0,
          value_score: 6,
          best_value_score: 6,
          rank: 50,
          form_score: 70,
          consistency: 70,
          captain_score: 70,
          risk_rating: 3,
          upside_pct: 10,
          matchup_label: "Good",
          signal: "stable",
          ai_recommendation: "Good",
          recommendation_short: "Good pick",
          market_watch_category: "Value",
          games_played: 10,
          player_status: "",
          is_bye: false,
          played_last_game: true,
        };
        console.log(`[select] Proof synthetic → ${pp.player_name} fallback_used=false`);
        return { player: synthetic, top3Players: null, reason: "proof synthetic" };
      }
      // Fallback 1: highest consistency players (proof via form stability)
      const consistencyPool = pool
        .filter(p => p.consistency >= 65)
        .sort((a, b) => b.consistency - a.consistency);
      if (consistencyPool.length > 0) {
        const pick = pickRandom(consistencyPool, 15);
        console.warn(`[select] Proof fallback_used=true — no proof data, using high-consistency player → ${pick?.player_name}`);
        return { player: pick, top3Players: null, reason: "proof fallback: high consistency" };
      }
      // Fallback 2: highest form_score players
      const formPool = pool
        .filter(p => p.form_score >= 60)
        .sort((a, b) => b.form_score - a.form_score);
      if (formPool.length > 0) {
        const pick = pickRandom(formPool, 15);
        console.warn(`[select] Proof fallback_used=true — using high-form player → ${pick?.player_name}`);
        return { player: pick, top3Players: null, reason: "proof fallback: high form" };
      }
      // Fallback 3: top-ranked active player
      const fallback = pickRandom(pool.sort((a, b) => b.rank - a.rank), 15);
      console.warn(`[select] Proof fallback_used=true — using rank fallback → ${fallback?.player_name ?? "none"}`);
      return { player: fallback, top3Players: null, reason: "proof fallback: rank" };
    }

    // SECTION 5: Category-specific pool logic
    if (cat === "Value") {
      const sorted = pool
        .filter(p => p.value_score >= VALUE_MIN_VALUE_SCORE && p.risk_rating <= VALUE_MAX_BUST_RISK)
        .sort((a, b) => b.value_score - a.value_score);
      // Exclude obvious top 5 to avoid repetition
      const valuePool = sorted.length > 5 ? sorted.slice(5) : sorted;
      if (valuePool.length > 0) {
        const pick = pickFromTiers(valuePool);
        console.log(`[select] Value → ${pick?.player_name} (value_score=${pick?.value_score})`);
        return { player: pick, top3Players: null, reason: `value: value_score=${pick?.value_score}` };
      }
      const fallback = pickFromTiers(pool.sort((a, b) => b.rank - a.rank));
      console.log(`[select] Value fallback → ${fallback?.player_name ?? "none"}`);
      return { player: fallback, top3Players: null, reason: "value fallback" };
    }

    if (cat === "Breakout") {
      // Primary: strict upside + form + value + rank
      const boPoolPrimary = pool
        .filter(p =>
          (p.upside_pct >= BREAKOUT_MIN_UPSIDE || p.form_score >= BREAKOUT_MIN_FORM) &&
          p.value_score >= VALUE_MIN_VALUE_SCORE &&
          p.rank <= 100,
        )
        .sort((a, b) => b.upside_pct - a.upside_pct);
      console.log(`[select] Breakout pool_size=${boPoolPrimary.length}`);
      if (boPoolPrimary.length > 0) {
        const pick = pickFromTiers(boPoolPrimary);
        console.log(`[select] Breakout → ${pick?.player_name} (upside=${pick?.upside_pct}) fallback_used=false`);
        return { player: pick, top3Players: null, reason: `breakout: upside=${pick?.upside_pct}` };
      }
      // Fallback 1: relax rank constraint, keep upside/form
      const boFallback1 = pool
        .filter(p => p.upside_pct >= BREAKOUT_MIN_UPSIDE || p.form_score >= BREAKOUT_MIN_FORM)
        .sort((a, b) => b.upside_pct - a.upside_pct);
      if (boFallback1.length > 0) {
        const pick = pickFromTiers(boFallback1);
        console.warn(`[select] Breakout fallback_used=true — relaxed rank → ${pick?.player_name}`);
        return { player: pick, top3Players: null, reason: "breakout fallback: relaxed rank" };
      }
      // Fallback 2: mid-tier players trending upward (positive price change or signal)
      const boFallback2 = pool
        .filter(p => p.price_change > 0 || p.signal === "rising")
        .sort((a, b) => b.price_change - a.price_change);
      if (boFallback2.length > 0) {
        const pick = pickFromTiers(boFallback2);
        console.warn(`[select] Breakout fallback_used=true — trending upward → ${pick?.player_name}`);
        return { player: pick, top3Players: null, reason: "breakout fallback: trending up" };
      }
      // Fallback 3: rank-ordered active player
      const fallback = pickFromTiers(pool.sort((a, b) => b.rank - a.rank));
      console.warn(`[select] Breakout fallback_used=true — rank fallback → ${fallback?.player_name ?? "none"}`);
      return { player: fallback, top3Players: null, reason: "breakout fallback: rank" };
    }

    if (cat === "Trap") {
      // Primary: high bust risk + meaningful price
      const trapPool = pool
        .filter(p =>
          p.value_score <= TRAP_MAX_VALUE_SCORE &&
          p.risk_rating >= TRAP_MIN_BUST_RISK &&
          p.price >= 400000,
        )
        .sort((a, b) => b.risk_rating - a.risk_rating);
      console.log(`[select] Trap pool_size=${trapPool.length}`);
      if (trapPool.length > 0) {
        const pick = pickRandom(trapPool, 25);
        console.log(`[select] Trap → ${pick?.player_name} (risk=${pick?.risk_rating}, price=${pick?.price}) fallback_used=false`);
        return { player: pick, top3Players: null, reason: `trap: risk=${pick?.risk_rating}` };
      }
      // Fallback 1: relax price constraint
      const trapFallback1 = pool
        .filter(p => p.risk_rating >= TRAP_MIN_BUST_RISK)
        .sort((a, b) => b.risk_rating - a.risk_rating);
      if (trapFallback1.length > 0) {
        const pick = pickRandom(trapFallback1, 15);
        console.warn(`[select] Trap fallback_used=true — relaxed price → ${pick?.player_name}`);
        return { player: pick, top3Players: null, reason: "trap fallback: relaxed price" };
      }
      // Fallback 2: any player with elevated risk (>= 5)
      const trapFallback2 = pool
        .filter(p => p.risk_rating >= 5)
        .sort((a, b) => b.risk_rating - a.risk_rating);
      if (trapFallback2.length > 0) {
        const pick = pickRandom(trapFallback2, 15);
        console.warn(`[select] Trap fallback_used=true — risk>=5 → ${pick?.player_name}`);
        return { player: pick, top3Players: null, reason: "trap fallback: risk>=5" };
      }
      // Fallback 3: rank-ordered active player
      const fallback = pickFromTiers(pool.sort((a, b) => b.rank - a.rank));
      console.warn(`[select] Trap fallback_used=true — rank fallback → ${fallback?.player_name ?? "none"}`);
      return { player: fallback, top3Players: null, reason: "trap fallback: rank" };
    }

    if (cat === "Engagement" || cat === "Conversation") {
      const pick = pickFromTiers(pool.sort((a, b) => b.rank - a.rank));
      console.log(`[select] ${cat} → ${pick?.player_name ?? "none"}`);
      return { player: pick, top3Players: null, reason: cat };
    }

    if (cat === "Injury") {
      // SECTION 2: Injury logic — must be status=OUT, not BYE, and played last game
      const injuredPool = safeInjured
        .filter(p =>
          !dayUsedIds.has(p.player_id) &&
          p.player_status === "OUT" &&
          !p.is_bye &&
          p.played_last_game === true,
        )
        .sort((a, b) => b.rank - a.rank);

      if (injuredPool.length > 0) {
        const pick = pickRandom(injuredPool, injuredPool.length);
        console.log(`[select] Injury → ${pick?.player_name} (played_last_game=true, status=OUT)`);
        return { player: pick, top3Players: null, reason: "injury: status=OUT + played_last_game" };
      }

      // Fallback: any injured player (relax played_last_game constraint)
      const anyInjured = safeInjured
        .filter(p => !dayUsedIds.has(p.player_id) && p.player_status === "OUT" && !p.is_bye)
        .sort((a, b) => b.rank - a.rank);

      if (anyInjured.length > 0) {
        const pick = pickRandom(anyInjured, anyInjured.length);
        console.log(`[select] Injury fallback → ${pick?.player_name} (status=OUT, played_last_game=unknown)`);
        return { player: pick, top3Players: null, reason: "injury fallback (no played_last_game filter)" };
      }

      // SECTION 4: No injured players available — do NOT fabricate an Injury post.
      // Return undefined so the caller can convert this slot to a safe fallback category.
      console.warn(`[select] Injury: no confirmed injured players available — slot will be converted to Value`);
      return { player: undefined, top3Players: null, reason: "injury: no confirmed injured players" };
    }

    const fallback = pickFromTiers(pool.sort((a, b) => b.rank - a.rank));
    console.log(`[select] Generic fallback → ${fallback?.player_name ?? "none"}`);
    return { player: fallback, top3Players: null, reason: "generic fallback" };
  }

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const config = DAY_CONFIGS[dayIndex];
    const dayUsedIds = new Set<number>();

    console.log(`\n[build] === ${config.display} ===`);

    const resolvedCategories: Category[] = config.categories.map((cat) => {
      if (cat === "Top3" && atCap("Top3")) {
        return atCap("Breakout") ? "Value" : "Breakout";
      }
      return cat;
    });

    const slotOrder = resolvedCategories
      .map((cat, idx) => ({ cat, idx }))
      .sort((a, b) => (CATEGORY_PRIORITY[a.cat] ?? 9) - (CATEGORY_PRIORITY[b.cat] ?? 9));

    const dayResults: (PostSelection | null)[] = [null, null, null];

    for (const { cat, idx } of slotOrder) {
      const angle = config.angles[idx];
      const content_type = config.content_types[idx];

      let { player, top3Players, reason } = selectPlayerForCategory(cat, dayUsedIds);

      // SECTION 6: Strict pre-output validation — reject invalid players
      if (player && !isValidPlayer(player)) {
        console.warn(`[validate] Rejected ${player.player_name} — is_bye=${player.is_bye}, status=${player.player_status}`);
        const pool = dayAvailablePool(dayUsedIds);
        player = pickFromTiers(pool.sort((a, b) => b.rank - a.rank));
        reason = `replaced invalid player with tier pick`;
      }

      // Anti-spam: no same category 3× in a row globally
      const recentCats = allPosts.slice(-2).map(p => p.category);
      if (
        cat !== "Top3" &&
        cat !== "Proof" &&
        recentCats.length === 2 &&
        recentCats[0] === cat &&
        recentCats[1] === cat
      ) {
        const fb = fallbackCategory(cat);
        console.log(`[anti-spam] ${cat} appeared 3x in a row — falling back to ${fb}`);
        const fbResult = selectPlayerForCategory(fb, dayUsedIds);
        if (fbResult.player) {
          player = fbResult.player;
          top3Players = null;
        }
      }

      // SECTION 1: NEVER allow null player — guaranteed fallback for all non-Top3 slots
      // Exception: Injury with no confirmed injured players → convert slot to Value (never fabricate)
      if (!player && cat === "Injury") {
        console.warn(`[build] Injury slot has no confirmed injured players — converting to Value`);
        const valueResult = selectPlayerForCategory("Value", dayUsedIds);
        player = valueResult.player;
        top3Players = null;
        reason = "injury->value: no confirmed injured players";
        // Override the category stored in the post so content generation uses Value, not Injury
        const injurySlotFallback: PostSelection = {
          player_id: player?.player_id ?? 0,
          player_name: player?.player_name ?? null,
          team: player?.team ?? "",
          category: "Value",
          angle: config.angles[idx],
          content_type: config.content_types[idx],
          player2_id: null,
          player2_name: null,
          top3_players: null,
        };
        if (player) {
          globalUsedIds.add(player.player_id);
          dayUsedIds.add(player.player_id);
          incCount("Value");
          dayResults[idx] = injurySlotFallback;
          console.log(`[build] ${config.display} slot ${idx + 1}: Injury→Value → ${player.player_name} [${reason}]`);
        }
        continue;
      } else if (!player && cat !== "Top3") {
        player = guaranteedFallback(dayUsedIds, cat);
        console.warn(`[build] Last-resort fallback used → ${player?.player_name ?? "NONE"}`);
      }

      // Mark used
      if (cat === "Top3" && top3Players) {
        for (const p of top3Players) {
          globalUsedIds.add(p.player_id);
          dayUsedIds.add(p.player_id);
        }
        incCount("Top3");
      } else if (player) {
        globalUsedIds.add(player.player_id);
        dayUsedIds.add(player.player_id);
        incCount(cat);
      }

      const primary = top3Players?.[0];

      const resolvedPlayerId = primary?.player_id ?? player?.player_id ?? null;
      const resolvedPlayerName = primary?.player_name ?? player?.player_name ?? null;
      const resolvedTeam = primary?.team ?? player?.team ?? "";

      // SECTION 5 & 7: Validate player before creating post — never allow null for non-Top3
      if (cat !== "Top3" && (!resolvedPlayerId || !resolvedPlayerName)) {
        console.warn(`[build] fallback_used=true — missing player for ${cat} on ${config.display} slot ${idx + 1}. Applying global emergency fallback.`);
        const emergency = safePlayers.sort((a, b) => b.rank - a.rank)[0];
        if (!emergency) {
          console.error(`[build] FATAL — no active players available for emergency fallback`);
        } else {
          console.warn(`[build] Emergency fallback → ${emergency.player_name} (player_id=${emergency.player_id})`);
          (resolvedPlayerId as unknown as number) || (player = emergency);
          const safeId = emergency.player_id;
          const safeName = emergency.player_name;
          const safeTeam = emergency.team;
          dayResults[idx] = {
            player_id: safeId,
            player_name: safeName,
            team: safeTeam,
            category: cat,
            angle,
            content_type,
            player2_id: null,
            player2_name: null,
            top3_players: null,
          };
          console.log(`[build] Selected player:`, { category: cat, player_id: safeId, player_name: safeName, reason: "global emergency fallback" });
          console.log(`[build] ${config.display} slot ${idx + 1}: ${cat} → ${safeName} [global emergency fallback]`);
          continue;
        }
      }

      // SECTION 7: Logging
      console.log(`[build] Selected player:`, {
        category: cat,
        player_id: resolvedPlayerId,
        player_name: resolvedPlayerName,
        reason,
      });

      dayResults[idx] = {
        player_id: resolvedPlayerId,
        player_name: resolvedPlayerName,
        team: resolvedTeam,
        category: cat,
        angle,
        content_type,
        player2_id: null,
        player2_name: null,
        top3_players: top3Players ?? null,
      };

      console.log(`[build] ${config.display} slot ${idx + 1}: ${cat} → ${dayResults[idx]?.player_name} [${reason}]`);
    }

    for (const post of dayResults) {
      if (post) allPosts.push(post);
    }
  }

  return validateAndFixPlan(allPosts, safePlayers, proofPlayers);
}

// ── VALIDATION + FAILSAFE ─────────────────────────────────────────────────────
function validateAndFixPlan(
  posts: PostSelection[],
  players: PlayerData[],
  proofPlayers: ProofPlayer[],
): PostSelection[] {
  const counts: Record<string, number> = {};
  for (const p of posts) {
    counts[p.category] = (counts[p.category] ?? 0) + 1;
  }

  const top3Count = counts["Top3"] ?? 0;
  const proofCount = counts["Proof"] ?? 0;

  console.log(`[validate] top3=${top3Count} proof=${proofCount} total=${posts.length}`);
  console.log(`[validate] category distribution: ${JSON.stringify(counts)}`);

  if (top3Count > WEEKLY_CAPS["Top3"]) {
    let swapped = 0;
    const target = top3Count - WEEKLY_CAPS["Top3"];
    for (const post of posts) {
      if (swapped >= target) break;
      if (post.category === "Top3") {
        post.category = "Breakout";
        post.top3_players = null;
        post.content_type = "Short-form Video";
        post.angle = "market_inefficiency";
        swapped++;
        console.warn(`[validate] Swapped excess Top3 → Breakout`);
      }
    }
  }

  if (posts.length < 21) {
    const fillPlayer = players[0];
    if (!fillPlayer) {
      console.warn(`[validate] No fill player available — cannot pad to 21 posts`);
    } else {
      while (posts.length < 21) {
        console.warn(`[validate] Padding plan to 21 posts with ${fillPlayer.player_name}`);
        posts.push({
          player_id: fillPlayer.player_id,
          player_name: fillPlayer.player_name,
          team: fillPlayer.team,
          category: "Value",
          angle: "hidden_edge",
          content_type: "Graphic Post",
          player2_id: null,
          player2_name: null,
          top3_players: null,
        });
      }
    }
  }

  return posts.slice(0, 21);
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "public" },
    });

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;

    if (action === "get_players") {
      const aflDb = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        db: { schema: "afl" },
      });
      const { data, error } = await aflDb
        .from("player_rankings_cache")
        .select("player_id, player_name, team, position, projection_final, neeko_rating_scaled")
        .eq("is_available", true)
        .eq("is_bye", false)
        .not("projection_final", "is", null)
        .not("manual_status", "in", '("RETIRED","DELISTED","BYE")')
        .order("projection_final", { ascending: false, nullsFirst: false })
        .limit(80);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ players: data ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "toggle_lock") {
      const { post_id, locked } = body as { post_id: string; locked: boolean };
      const { error } = await db.from("weekly_content_posts").update({ locked }).eq("id", post_id);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "duplicate_post") {
      const { post } = body as { post: Record<string, unknown> };
      const { data, error } = await db
        .from("weekly_content_posts")
        .insert({
          weekly_plan_id: post.weekly_plan_id,
          day_key: post.day_key,
          slot_key: `${post.slot_key}-dup-${Date.now()}`,
          player_id: post.player_id ?? null,
          player_name: post.player_name ?? null,
          player2_id: post.player2_id ?? null,
          player2_name: post.player2_name ?? null,
          top3_players: post.top3_players ?? null,
          team: post.team ?? null,
          category: post.category,
          content_type: post.content_type,
          angle: post.angle ?? null,
          status: post.status,
          locked: false,
          hooks: post.hooks ?? null,
          voice_script: post.voice_script ?? null,
          caption_script: post.caption_script ?? null,
          visual_plan: post.visual_plan ?? null,
          ai_image_prompt: post.ai_image_prompt ?? null,
          ai_video_prompt: post.ai_video_prompt ?? null,
          creative_style: post.creative_style ?? null,
          conversion_score: post.conversion_score ?? null,
          confidence_label: post.confidence_label ?? null,
          hook_score: post.hook_score ?? null,
          hook_type: post.hook_type ?? null,
          strategy_json: post.strategy_json ?? null,
          platform_variants: post.platform_variants ?? null,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ post: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "swap_player") {
      const { post_id, player_id, player_name, team } = body as {
        post_id: string;
        player_id: number;
        player_name: string;
        team: string;
      };
      const { error } = await db
        .from("weekly_content_posts")
        .update({
          player_id,
          player_name,
          team,
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
        })
        .eq("id", post_id);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const forceRegenerate = body?.force === true;
    const focusPlayerId = body?.focus_player_id ?? null;

    const weekKey = getWeekKey();
    const weekStartDate = getWeekStartDate();

    console.log(`[plan-builder] Starting for week ${weekKey}, force=${forceRegenerate}`);

    if (!forceRegenerate) {
      const { data: existing } = await db
        .from("weekly_content_plans")
        .select("id, week_key")
        .eq("week_key", weekKey)
        .maybeSingle();

      if (existing?.id) {
        const { data: posts } = await db
          .from("weekly_content_posts")
          .select("*")
          .eq("weekly_plan_id", existing.id)
          .order("day_key")
          .order("slot_key");

        const postCount = posts?.length ?? 0;
        console.log(`[plan-builder] Found existing plan ${existing.id} with ${postCount} posts`);

        if (postCount >= 21) {
          return new Response(
            JSON.stringify({ plan_id: existing.id, week_key: weekKey, posts: posts ?? [] }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        console.log(`[plan-builder] Plan incomplete (${postCount}/21), rebuilding...`);
      }
    }

    console.log("[plan-builder] Fetching player data from afl.player_rankings_cache...");

    const aflDb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "afl" },
    });

    // Fetch active player pool — simple filters only
    const { data: rawPlayers, error: playersError } = await aflDb
      .from("player_rankings_cache")
      .select(`
        player_id, player_name, team, position,
        projection_final, ceiling, floor, price, prev_price, price_change,
        value_score, best_value_score, neeko_rating_scaled, form_score, consistency,
        captain_score, risk_rating, upside_pct, matchup_label, signal,
        ai_recommendation, recommendation_short, market_watch_category, games_played,
        is_bye, manual_status, status
      `)
      .eq("is_available", true)
      .eq("is_bye", false)
      .not("projection_final", "is", null)
      .order("neeko_rating_scaled", { ascending: false })
      .limit(150);

    // Injured player fetch — simple filters
    const { data: rawInjured } = await aflDb
      .from("player_rankings_cache")
      .select(`
        player_id, player_name, team, position,
        projection_final, ceiling, floor, price, prev_price, price_change,
        value_score, best_value_score, neeko_rating_scaled, form_score, consistency,
        captain_score, risk_rating, upside_pct, matchup_label, signal,
        ai_recommendation, recommendation_short, market_watch_category, games_played,
        is_bye, manual_status, status, last_game_date
      `)
      .eq("is_available", false)
      .eq("is_bye", false)
      .eq("status", "OUT")
      .not("projection_final", "is", null)
      .order("neeko_rating_scaled", { ascending: false })
      .limit(30);

    if (playersError) {
      console.error("[plan-builder] Player fetch error:", playersError.message);
      throw new Error(`Player fetch failed: ${playersError.message}`);
    }

    // SECTION 3: Determine played_last_game — true if last_game_date within 14 days
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const mapPlayer = (p: Record<string, unknown>): PlayerData => {
      // played_last_game: last_game_date exists and within 14 days (ignores bye rounds)
      let playedLastGame = false;
      if (p.last_game_date) {
        const lastGame = new Date(p.last_game_date as string);
        playedLastGame = lastGame >= fourteenDaysAgo;
      } else if (Number(p.games_played ?? 0) > 0) {
        // No date available — assume true if they have any games this season
        playedLastGame = true;
      }

      return {
        player_id: p.player_id as number,
        player_name: (p.player_name as string) ?? "Unknown",
        team: (p.team as string) ?? "Unknown",
        position: (p.position as string) ?? "MID",
        projection: Number(p.projection_final ?? 0),
        ceiling: Number(p.ceiling ?? 0),
        floor: Number(p.floor ?? 0),
        price: Number(p.price ?? 0),
        prev_price: Number(p.prev_price ?? 0),
        price_change: Number(p.price_change ?? 0),
        value_score: Number(p.value_score ?? 0),
        best_value_score: Number(p.best_value_score ?? 0),
        rank: Number(p.neeko_rating_scaled ?? 0),
        form_score: Number(p.form_score ?? 0),
        consistency: Number(p.consistency ?? 0),
        captain_score: Number(p.captain_score ?? 0),
        risk_rating: Number(p.risk_rating ?? 5),
        upside_pct: Number(p.upside_pct ?? 0),
        matchup_label: (p.matchup_label as string) ?? "",
        signal: (p.signal as string) ?? "",
        ai_recommendation: (p.ai_recommendation as string) ?? "",
        recommendation_short: (p.recommendation_short as string) ?? "",
        market_watch_category: (p.market_watch_category as string) ?? "",
        games_played: Number(p.games_played ?? 0),
        player_status: (p.status as string) ?? "",
        is_bye: Boolean(p.is_bye ?? false),
        played_last_game: playedLastGame,
      };
    };

    const mappedPlayers: PlayerData[] = (rawPlayers ?? []).map(p => mapPlayer(p as Record<string, unknown>));
    const mappedInjured: PlayerData[] = (rawInjured ?? []).map(p => mapPlayer(p as Record<string, unknown>));

    console.log(
      `[plan-builder] Fetched ${mappedPlayers.length} active, ${mappedInjured.length} injured. ` +
      `Injured with played_last_game=true: ${mappedInjured.filter(p => p.played_last_game).length}`,
    );

    const selectionPool = mappedPlayers;
    const proofPlayers: ProofPlayer[] = [];

    console.log(
      `[plan-builder] Pool=${selectionPool.length}, injured=${mappedInjured.length}`,
    );

    const { data: existingPlan } = await db
      .from("weekly_content_plans")
      .select("id")
      .eq("week_key", weekKey)
      .maybeSingle();

    let planId: string;

    if (existingPlan?.id) {
      planId = existingPlan.id;
      await db
        .from("weekly_content_plans")
        .update({ updated_at: new Date().toISOString(), focus_player_id: focusPlayerId })
        .eq("id", planId);
      await db
        .from("weekly_content_posts")
        .delete()
        .eq("weekly_plan_id", planId)
        .eq("locked", false);
      console.log(`[plan-builder] Cleared non-locked posts for plan ${planId}`);
    } else {
      const { data: newPlan, error: planInsertError } = await db
        .from("weekly_content_plans")
        .insert({
          week_key: weekKey,
          week_start_date: weekStartDate,
          focus_player_id: focusPlayerId,
          plan_json: { week_key: weekKey, days: [] },
          status: "building",
          generated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (planInsertError || !newPlan?.id) {
        throw new Error(`Failed to create plan: ${planInsertError?.message}`);
      }
      planId = newPlan.id;
      console.log(`[plan-builder] Created new plan ${planId}`);
    }

    const weekPosts = buildWeekPlan(selectionPool, proofPlayers, mappedInjured);

    const catCounts: Record<string, number> = {};
    for (const p of weekPosts) {
      catCounts[p.category] = (catCounts[p.category] ?? 0) + 1;
    }
    console.log("[plan-builder] Final category distribution:", JSON.stringify(catCounts));

    let insertedCount = 0;
    let skippedCount = 0;

    for (let idx = 0; idx < weekPosts.length; idx++) {
      const post = weekPosts[idx];
      const dayIndex = Math.floor(idx / 3);
      const slot = (idx % 3) + 1;
      const config = DAY_CONFIGS[dayIndex] ?? DAY_CONFIGS[6];

      // For Top3: player_id and player_name MUST come from top3Players[0]
      let resolvedPlayerId = post.player_id;
      let resolvedPlayerName = post.player_name;
      let resolvedTeam = post.team;

      if (post.category === "Top3" && Array.isArray(post.top3_players) && post.top3_players.length >= 3) {
        const anchor = post.top3_players[0];
        resolvedPlayerId = anchor.player_id ?? resolvedPlayerId;
        resolvedPlayerName = anchor.player_name ?? resolvedPlayerName;
        resolvedTeam = anchor.team ?? resolvedTeam;
        console.log(`[plan-builder] Top3 anchor → ${resolvedPlayerName} (${resolvedPlayerId})`);
      }

      // Hard validation: skip any post still missing player_id or player_name
      if (!resolvedPlayerId || !resolvedPlayerName) {
        console.warn(`[plan-builder] Skipping post — null player`, {
          category: post.category,
          day: config.label,
          slot,
          player_id: resolvedPlayerId,
          player_name: resolvedPlayerName,
        });
        skippedCount++;
        continue;
      }

      const row = {
        weekly_plan_id: planId,
        day_key: config.label,
        slot_key: String(slot),
        day_number: dayIndex,
        slot_number: slot,
        player_id: resolvedPlayerId,
        player_name: resolvedPlayerName,
        player2_id: post.player2_id,
        player2_name: post.player2_name,
        top3_players: post.top3_players ?? null,
        team: resolvedTeam || null,
        category: post.category,
        content_type: post.content_type,
        angle: post.angle,
        status: "pending",
        locked: false,
      };

      try {
        const { error: insertError } = await db.from("weekly_content_posts").insert(row);
        if (insertError) {
          console.error(`[plan-builder] Insert failed for ${config.label} slot ${slot} (${post.category}):`, insertError.message);
          skippedCount++;
        } else {
          insertedCount++;
        }
      } catch (e) {
        console.error(`[plan-builder] Insert exception for ${config.label} slot ${slot}:`, e instanceof Error ? e.message : String(e));
        skippedCount++;
      }
    }

    console.log(`[plan-builder] Inserted ${insertedCount} posts, skipped ${skippedCount}`);

    const usageRows = weekPosts
      .filter(p => p.player_id && p.player_id > 0)
      .map((post, idx) => {
        const dayIndex = Math.floor(idx / 3);
        const config = DAY_CONFIGS[dayIndex] ?? DAY_CONFIGS[6];
        return {
          player_id: post.player_id,
          player_name: post.player_name,
          category: post.category,
          week_key: weekKey,
          day_key: config.label,
          used_at: new Date().toISOString(),
        };
      });

    if (usageRows.length > 0) {
      await db.from("content_player_usage").insert(usageRows);
      console.log(`[plan-builder] Recorded ${usageRows.length} usage entries`);
    }

    await db
      .from("weekly_content_plans")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", planId);

    const { data: allPosts } = await db
      .from("weekly_content_posts")
      .select("*")
      .eq("weekly_plan_id", planId)
      .order("day_key")
      .order("slot_key");

    console.log(`[plan-builder] Done. Plan ${planId} with ${allPosts?.length ?? 0} posts`);

    return new Response(
      JSON.stringify({ plan_id: planId, week_key: weekKey, posts: allPosts ?? [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[plan-builder] Fatal error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
