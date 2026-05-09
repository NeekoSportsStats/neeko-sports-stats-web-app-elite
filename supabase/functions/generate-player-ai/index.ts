import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://www.neekostats.com.au",
  "https://neekostats.com.au",
  "http://localhost:5173",
  "http://localhost:3000",
]);

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://www.neekostats.com.au";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
}

const BATCH_SIZE = 5;
const DEFAULT_MAX_PLAYERS = 20;
const PROMPT_VERSION = "generate-player-ai-v17";
const MAX_RETRY_ATTEMPTS = 2;

// ── BANNED PHRASES ─────────────────────────────────────────────────────────

const BANNED_ALWAYS = [
  "this round",
  "based on current projections",
  "fantasy coaches should",
  "coaches should consider",
  "coaches should be",
  "worth noting",
  "it is worth",
  "it's worth",
  "overall,",
  "in conclusion",
  "in summary",
  "solid option",
  "good choice",
  "bye",
  "rest week",
  "unavailable",
  "not playing",
  "missing this week",
  // advice / action words
  "will score",
  "will rise",
  "guaranteed",
  "must buy",
  "must sell",
  "trade in",
  "trade out",
  "acquire",
  "bargain",
  "enticing opportunity",
  "strong buy",
  "buy opportunity",
  "move on",
  "trade target",
  // betting / gambling language
  "bet",
  "wager",
  "gamble",
  "odds",
  "financial advice",
  // action / decisiveness language
  "lock",
];

// ── PROMPT BUILDER ──────────────────────────────────────────────────────────

function buildSystemPrompt(confidence?: number | null): string {
  const confidenceContext = (() => {
    const c = confidence ?? 50;
    if (c >= 75) return `Confidence is high (${c}) — the projection is well-supported by recent scoring history.`;
    if (c >= 55) return `Confidence is moderate (${c}) — there is some variance in the recent sample.`;
    return `Confidence is low (${c}) — the projection carries meaningful uncertainty.`;
  })();

  return `You are Neeko — an AFL statistics analyst. Your job is to describe a player's recent scoring profile, trends and stat context using the data provided.

━━ CORE FOCUS ━━
Describe what the player's actual stats show. This is a statistical summary, not a fantasy recommendation engine.

PRIMARY topics (always cover where data is available):
- Recent scoring history: last_3_avg, last_5_avg — are they trending up, down or steady?
- Season average (season_avg) compared to recent form — is recent output above or below their season baseline?
- Scoring range: ceiling and floor — how wide or narrow is the range?
- Consistency: consistency score — is the output reliable or volatile?
- Volatility or risk: risk score — does the player blow up or post consistently?
- Trend direction: trend_direction — rising, falling, or stable?
- Games played: games_played — small sample caution if fewer than 4 games

SECONDARY topics (include only as supporting context, not as the main focus):
- Model projection (projection_final) — the model's forward estimate
- Confidence label (confidence_label) — how reliable the model signal is
- Matchup context (matchup_label) — if the matchup rating is meaningfully different to neutral
- Model signal (model_label) — mention once only to explain what the data pattern supports

${confidenceContext}

━━ WHAT NOT TO FOCUS ON ━━
Do NOT make the analysis centre around:
- breakeven (you may mention it briefly as a supporting data point, but it must not drive the narrative)
- price or price movement
- value score (do not feature this prominently)
- whether to "buy", "sell", "trade", or "move on"
- fantasy trade advice of any kind
- whether the player represents a "bargain" or "opportunity"

━━ LANGUAGE RULES ━━
Preferred phrasings (use these naturally):
- "The recent scoring profile shows..."
- "Across the last 3 games..."
- "The season average of X compares to..."
- "The scoring range runs from..."
- "Output has been consistent/volatile with..."
- "The trend direction is..."
- "Confidence in the projection is..."
- "The stat trend points to..."
- "The main statistical risk is..."
- "This summary is based on recent scores, stat trends, consistency and model context."

Hedging is expected: "appears", "suggests", "indicates", "the data shows", "recent results point to".
Do NOT use: "will score", "will rise", "guaranteed", "must buy", "must sell", "trade in", "trade out", "acquire", "bargain", "enticing opportunity", "strong buy", "lock", "move on", "bet", "wager", "gamble".
Do NOT tell the reader what action to take.
Do NOT use "you should", "coaches should", "you must".

━━ TONE ━━
- Analytical and neutral — like a stats report, not a sales pitch
- Specific to this player's numbers — nothing generic
- Vary sentence starters: use player name, a number, "The recent", "Across the", "Form over", "The scoring range", "The trend"
- Never start more than one sentence with the same word

━━ OUTPUT STRUCTURE ━━

WHY — EXACTLY 1 sentence, max 180 characters:
- The single most important stat fact about this player right now
- Must contain at least one specific number from the data
- Focuses on recent scoring or trend, not on fantasy action
- Neutral in tone — describes the profile, does not advise any action

LONG — MINIMUM 5 sentences, ideally 6–7:
Cover these in whatever order serves the data best:
1. Recent scoring trend (last_3_avg, last_5_avg vs season_avg, trend_direction)
2. Scoring range and consistency (ceiling, floor, consistency, risk)
3. Season context (season_avg, games_played)
4. Model confidence and projection context (projection_final, confidence_label) — as secondary context
5. Matchup or signal context (matchup_label, model_label) — if meaningfully different to neutral

Rules:
- Every sentence references actual numbers or named signals from the data
- Do NOT start multiple sentences with "His", "He", or the player name
- Do NOT duplicate the why sentence
- No closing summary phrases like "overall" or "in conclusion"
- End on a specific stat — not a recommendation

━━ BANNED PHRASES — NEVER USE ━━
"will score", "will rise", "guaranteed", "must buy", "must sell", "trade in", "trade out",
"acquire", "bargain", "enticing opportunity", "strong buy", "lock", "this round",
"fantasy coaches should", "coaches should", "based on current projections",
"primed for", "is primed", "worth noting", "overall,", "in conclusion", "in summary",
"it is worth", "bet", "wager", "gamble", "odds", "move on", "trade target"

━━ RESPONSE FORMAT — return ONLY valid JSON ━━
{
  "why": "<EXACTLY 1 sentence ≤180 chars — a specific stat fact about recent scoring or trend>",
  "long": "<MINIMUM 5 sentences (ideally 6–7) — stats-led, varied starters, no trade advice, no buy/sell language>"
}

FINAL CHECK before responding:
1. Does "why" contain a specific number and stay under 180 characters?
2. Does "long" have at least 5 complete sentences focused on stats and trends?
3. Does the output describe what the data shows — not tell anyone what to do?
4. Is the analysis centred on recent scoring, trends and consistency — NOT on breakeven, price or trade value?
5. Are all banned phrases absent?
6. Do NO two sentences in "long" start with the same word?
7. Is there zero gambling, betting, or financial advice language?`;
}

// ── TYPES ───────────────────────────────────────────────────────────────────

interface AIResult {
  why: string;
  long: string;
}

interface PlayerRow {
  player_id: number;
  player_name: string;
  team: string;
  position: string | null;
  price: number | null;
  projection_final: number | null;
  ceiling: number | null;
  floor: number | null;
  breakeven: number | null;
  edge: number | null;
  risk: number | null;
  confidence: number | null;
  confidence_label: string | null;
  consistency: number | null;
  value_score: number | null;
  value_tag: string | null;
  best_value_score: number | null;
  matchup_rating: string | null;
  matchup_label: string | null;
  venue_multiplier: number | null;
  form_score: number | null;
  season_avg: number | null;
  last_3_avg: number | null;
  last_5_avg: number | null;
  neeko_rating: number | null;
  neeko_rating_scaled: number | null;
  games_played: number | null;
  upside_rating: number | null;
  upside_pct: number | null;
  captain_score: number | null;
  captain_rating: string | null;
  ai_recommendation: string | null;
  recommendation_strength: string | null;
  price_change: number | null;
  price_change_pct: number | null;
  signal_count: number | null;
  top_signals: string[] | null;
  trend_direction: string | null;
  input_hash: string | null;
  needs_regen: boolean;
}

interface ValidationResult {
  valid: boolean;
  issues: string[];
}

// ── OUTPUT VALIDATOR ────────────────────────────────────────────────────────

function validateOutput(result: AIResult): ValidationResult {
  const issues: string[] = [];
  const allText = `${result.why} ${result.long}`.toLowerCase();

  // WHY: exactly 1 sentence, has a number, not too long
  if (!result.why || result.why.length < 15) issues.push("why field too short or empty");
  if (result.why?.length > 200) issues.push("why field too long (>200 chars)");
  if (!/\d/.test(result.why ?? "")) issues.push("why field must contain a specific number");
  const whySentences = (result.why?.match(/[.!?]+/g) ?? []).length;
  if (whySentences !== 1) issues.push(`why field must be exactly 1 sentence — got ${whySentences}`);

  // LONG: minimum 5 sentences, substantial
  if (!result.long || result.long.length < 120) issues.push("long field too short");
  const longSentences = (result.long?.match(/[.!?]+/g) ?? []).length;
  if (longSentences < 5) issues.push(`long field must have at least 5 sentences — got ${longSentences}`);

  // No duplication between why and long
  const whyDupesLong = result.why && result.long
    ? result.long.toLowerCase().startsWith(result.why.toLowerCase().substring(0, 30))
    : false;
  if (whyDupesLong) issues.push("long field is duplicating the why field");

  // Banned phrases
  for (const phrase of BANNED_ALWAYS) {
    if (allText.includes(phrase.toLowerCase())) {
      issues.push(`banned phrase: "${phrase}"`);
    }
  }

  // Gambling/betting language
  const gamblingPhrases = ["bet ", "wager", "gamble", "financial advice"];
  for (const phrase of gamblingPhrases) {
    if (allText.includes(phrase.toLowerCase())) {
      issues.push(`gambling/betting language not allowed: "${phrase}"`);
    }
  }

  return { valid: issues.length === 0, issues };
}

// ── OPENAI CALLER WITH RETRY ────────────────────────────────────────────────

async function callOpenAIWithPrompt(
  openaiKey: string,
  systemPrompt: string,
  recommendation: string,
  playerData: Record<string, unknown>,
  attempt: number = 0,
): Promise<{ result: AIResult | null; validation: ValidationResult | null; attempts: number }> {
  const userContent = [
    `Describe the recent scoring profile and stat trends for this AFL player.`,
    `Return exactly 2 fields: "why" (1 sentence ≤180 chars with a specific number about recent form or scoring) and "long" (minimum 5 sentences focused on scoring trends, consistency and stat context).`,
    `The model signal for this player is: ${recommendation.toUpperCase()}. You may reference this once to explain what the data pattern supports, but the analysis must be centred on stats and trends — not on fantasy trade advice.`,
    `Use only the data below — do not invent numbers:\n${JSON.stringify(playerData, null, 2)}`,
  ].join("\n\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.65,
      max_tokens: 650,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`OpenAI HTTP ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content?.trim();
  console.log("[generate-player-ai] AI RESPONSE:", JSON.stringify({
    status: res.status,
    model: json.model,
    usage: json.usage,
    content_preview: content?.substring(0, 400),
    finish_reason: json.choices?.[0]?.finish_reason,
  }));
  if (!content) return { result: null, validation: null, attempts: attempt + 1 };

  let parsed: AIResult;
  try {
    const raw = JSON.parse(content);
    parsed = {
      why: raw.why ?? "",
      long: raw.long ?? raw.summary_long ?? "",
    };
  } catch {
    return { result: null, validation: { valid: false, issues: ["JSON parse error"] }, attempts: attempt + 1 };
  }

  const validation = validateOutput(parsed);

  if (!validation.valid && attempt < MAX_RETRY_ATTEMPTS) {
    const issueList = validation.issues.map((issue, n) => `${n + 1}. ${issue}`).join("\n");
    const retryMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
      { role: "assistant", content: content },
      {
        role: "user",
        content: `Your response has these issues that MUST be fixed:\n${issueList}\n\nRewrite and return corrected JSON. The analysis must focus on scoring trends and stat patterns, not on fantasy trade advice or breakeven/price.`,
      },
    ];

    const retryRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: retryMessages,
        temperature: 0.7,
        max_tokens: 650,
        response_format: { type: "json_object" },
      }),
    });

    if (retryRes.ok) {
      const retryJson = await retryRes.json();
      const retryContent = retryJson.choices?.[0]?.message?.content?.trim();
      if (retryContent) {
        try {
          const retryRaw = JSON.parse(retryContent);
          const retryParsed: AIResult = {
            why: retryRaw.why ?? "",
            long: retryRaw.long ?? retryRaw.summary_long ?? "",
          };
          const retryValidation = validateOutput(retryParsed);
          return { result: retryParsed, validation: retryValidation, attempts: attempt + 2 };
        } catch { /* fall through to original */ }
      }
    }
  }

  return { result: parsed, validation, attempts: attempt + 1 };
}

// ── MAIN HANDLER ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey      = Deno.env.get("OPENAI_API_KEY");

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "") ?? "";

    let isAuthorized = false;

    if (token.length > 10) {
      try {
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        const { data: secrets } = await adminClient
          .schema("internal" as any)
          .from("cron_secrets")
          .select("value")
          .in("key", ["cron_auth_token", "supabase_secret_key"]);
        if (secrets?.some((row: { value: string }) => row.value === token)) {
          isAuthorized = true;
        }
        console.log("[generate-player-ai] auth check — matched:", isAuthorized, "secrets_found:", secrets?.length ?? 0);
      } catch (e) {
        console.error("[generate-player-ai] auth DB lookup failed:", e instanceof Error ? e.message : String(e));
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body */ }

    const limitPlayers = Number(body?.limit_players ?? DEFAULT_MAX_PLAYERS) || DEFAULT_MAX_PLAYERS;
    const debugMode = body?.debug_ai_data === true;
    const forceAll = body?.force_all === true;
    const targetPlayerId = body?.player_id ? Number(body.player_id) : null;
    const pageOffset = body?.page_offset ? Number(body.page_offset) : 0;
    const playerIdGte = body?.player_id_gte ? Number(body.player_id_gte) : null;
    const playerIdLt  = body?.player_id_lt  ? Number(body.player_id_lt)  : null;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let query = supabase
      .from("v_ai_player_analysis_input")
      .select([
        "player_id", "player_name", "team", "position",
        "price", "projection_final", "ceiling", "floor",
        "breakeven", "edge",
        "risk", "confidence", "confidence_label", "consistency",
        "value_score", "value_tag", "best_value_score",
        "matchup_rating", "matchup_label", "venue_multiplier",
        "form_score", "season_avg", "last_3_avg", "last_5_avg",
        "neeko_rating", "neeko_rating_scaled",
        "games_played", "upside_rating", "upside_pct",
        "captain_score", "captain_rating",
        "ai_recommendation", "recommendation_strength",
        "price_change", "price_change_pct",
        "signal_count", "top_signals", "trend_direction",
        "input_hash", "needs_regen",
      ].join(","))
      .limit(limitPlayers);

    if (targetPlayerId) {
      query = query.eq("player_id", targetPlayerId);
    } else if (!forceAll) {
      query = query.eq("needs_regen", true).order("player_id", { ascending: true });
      if (playerIdGte !== null) query = query.gte("player_id", playerIdGte);
      if (playerIdLt  !== null) query = query.lt("player_id", playerIdLt);
    }

    const { data: players, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    if (!players || players.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          message: "All player analyses are up to date",
          processed: 0,
          skipped_unchanged: true,
          prompt_version: PROMPT_VERSION,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const debugData: unknown[] = [];
    let processed = 0, failed = 0, validationFailed = 0, saved = 0;
    const errors: string[] = [];
    const validationIssues: Array<{ player: string; rec: string; issues: string[] }> = [];
    const startTime = Date.now();

    for (let i = 0; i < (players as PlayerRow[]).length; i += BATCH_SIZE) {
      const batch = (players as PlayerRow[]).slice(i, i + BATCH_SIZE);

      for (const player of batch) {
        try {
          const recommendation = player.ai_recommendation ?? "HOLD";

          // Stats-grounded payload: lead with scoring/form, model fields are secondary
          const promptPayload = {
            player_name:       player.player_name,
            team:              player.team,
            position:          player.position,
            games_played:      player.games_played,
            // Scoring history — primary
            season_avg:        player.season_avg,
            last_3_avg:        player.last_3_avg,
            last_5_avg:        player.last_5_avg,
            trend_direction:   player.trend_direction,
            // Scoring range and consistency — primary
            ceiling:           player.ceiling,
            floor:             player.floor,
            consistency:       player.consistency,
            risk:              player.risk,
            form_score:        player.form_score,
            // Model context — secondary
            projection_final:  player.projection_final,
            confidence:        player.confidence,
            confidence_label:  player.confidence_label,
            matchup_label:     player.matchup_label,
            matchup_rating:    player.matchup_rating,
            model_label:       recommendation,
            // Supporting data — omit price/value/breakeven prominence
            breakeven:         player.breakeven,
          };

          if (debugMode) {
            debugData.push({ player_id: player.player_id, recommendation, prompt_payload: promptPayload });
          }

          let result: AIResult;
          let validation: ValidationResult = { valid: true, issues: [] };

          if (openaiKey) {
            const systemPrompt = buildSystemPrompt(player.confidence);
            const { result: res, validation: val, attempts } = await callOpenAIWithPrompt(openaiKey, systemPrompt, recommendation, promptPayload);
            if (!res) {
              errors.push(`${player.player_name}: null response from OpenAI`);
              failed++;
              continue;
            }
            result = res;
            validation = val ?? { valid: true, issues: [] };

            if (!validation.valid) {
              validationFailed++;
              validationIssues.push({ player: player.player_name, rec: recommendation, issues: validation.issues });
              console.warn(`[generate-player-ai] validation issues ${player.player_name} (${recommendation}) after ${attempts} attempts:`, validation.issues.join("; "));
            }
            processed++;
          } else {
            result = {
              why: `Recent form avg ${player.last_3_avg ?? player.last_5_avg ?? player.season_avg} pts across last 3 games, season avg ${player.season_avg}.`,
              long: `The recent scoring profile shows a last-3 average of ${player.last_3_avg} and last-5 average of ${player.last_5_avg}, compared to a season average of ${player.season_avg}. The scoring range runs from a floor of ${player.floor} to a ceiling of ${player.ceiling}. Consistency is ${player.consistency} with a risk score of ${player.risk}. The trend direction is ${player.trend_direction ?? "neutral"}. The model projection sits at ${player.projection_final} with ${player.confidence_label ?? "moderate"} confidence.`,
            };
            processed++;
          }

          const now = new Date().toISOString();

          const { error: rpcErr } = await supabase.rpc("upsert_player_ai_analysis", {
            p_player_id:         player.player_id,
            p_recommendation:    recommendation,
            p_summary_short:     result.why,
            p_summary_long:      result.long,
            p_color:             null,
            p_prompt_version:    PROMPT_VERSION,
            p_input_hash:        player.input_hash ?? null,
            p_stored_projection: player.projection_final ?? null,
            p_stored_price:      player.price ?? null,
          });
          if (rpcErr) throw rpcErr;

          const { error: cacheErr } = await supabase
            .schema("afl" as any)
            .from("player_rankings_cache")
            .update({
              summary_short:        result.why,
              summary_long:         result.long,
              recommendation_short: result.why,
              recommendation_why:   result.long,
              ai_summary:           result.long,
              ai_updated_at:        now,
              ai_prompt_version:    PROMPT_VERSION,
              ai_validation_passed: validation.valid,
              ai_generated_at:      now,
            })
            .eq("player_id", player.player_id);

          if (cacheErr) {
            console.warn(`[generate-player-ai] cache writeback failed ${player.player_name}:`, cacheErr.message);
          } else {
            saved++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : JSON.stringify(err);
          console.error(`[generate-player-ai] ${player.player_name} failed:`, msg);
          errors.push(`${player.player_name}: ${msg}`);
          failed++;
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const remainingStale = (players as PlayerRow[]).length - saved;

    return new Response(
      JSON.stringify({
        ok: true,
        prompt_version: PROMPT_VERSION,
        processed,
        saved,
        failed,
        validation_failed: validationFailed,
        total_attempted: (players as PlayerRow[]).length,
        remaining_stale: remainingStale,
        duration_ms: durationMs,
        errors: errors.slice(0, 10),
        validation_issues: validationIssues.slice(0, 10),
        ...(debugMode ? { debug_ai_data: debugData } : {}),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error("[generate-player-ai] fatal error:", msg);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
