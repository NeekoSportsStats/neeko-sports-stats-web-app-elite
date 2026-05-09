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
const PROMPT_VERSION = "generate-player-ai-v16";
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
  // advice/action words
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
  // betting/gambling language
  "bet",
  "wager",
  "gamble",
  "odds",
  "financial advice",
];

// ── PROMPT BUILDER ──────────────────────────────────────────────────────────

function buildSystemPrompt(recommendation: string, confidence?: number | null): string {
  const rec = recommendation.toUpperCase();

  const confidenceContext = (() => {
    const c = confidence ?? 50;
    if (c >= 75) return `Confidence is high (${c}) — the projection is well-supported by recent data.`;
    if (c >= 55) return `Confidence is moderate (${c}) — there is some uncertainty in the projection.`;
    return `Confidence is low (${c}) — the projection carries meaningful variance.`;
  })();

  return `You are Neeko — an AFL fantasy data analyst. Your job is to describe a player's current profile using their stats and model signals.

━━ ROLE ━━
You write neutral, factual player context. You do NOT give advice. You do NOT tell anyone what to do with this player.
The model has already assigned a label (${rec}). You may reference that label to explain what the data shows, but you must NOT push anyone to act on it.
This is player intelligence, not a recommendation engine.

━━ WHAT TO DESCRIBE ━━
Use the data provided. Cover as many of these as the data supports:
- Projection (projection_final, ceiling, floor, breakeven) — what the model expects and the scoring range
- Recent form (form_score, last_3_avg, last_5_avg, trend_direction) — how the player has been performing
- Season average (season_avg) — how recent form compares to the full-season baseline
- Value and price (value_score, edge, price, price_change) — is the price aligned with output?
- Confidence and risk (confidence, confidence_label, risk, consistency) — how reliable is the projection?
- Matchup and signals (matchup_label, signal_tags, venue_multiplier) — contextual factors

${confidenceContext}

━━ LANGUAGE RULES ━━
Preferred phrasings (use these naturally, not as templates):
- "The current profile shows..."
- "The projection sits at..."
- "The breakeven gap explains..."
- "Recent scoring has been..."
- "The risk profile is..."
- "The model label is supported by..."
- "This should be read as a data signal, not a guarantee."
- "Form over the last 3 games..."
- "At the current price of..."

Hedging is allowed and encouraged where appropriate: "appears", "suggests", "indicates", "tends to", "the data shows", "recent results point to".
Do NOT use: "will score", "will rise", "guaranteed", "must buy", "must sell", "trade in", "trade out", "acquire", "bargain", "enticing opportunity", "lock".
Do NOT use betting or gambling language.
Do NOT give financial advice.
Do NOT tell the reader what action to take.

━━ ACTION LABEL REFERENCE ━━
The model label is: ${rec}
You may mention it once to explain what the data profile supports (e.g. "The current data profile supports the ${rec} label because...").
You must NOT use it to push action. The reader decides what to do with this information.

━━ TONE ━━
- Analytical and measured — like a data report, not a pitch
- Specific to this player's numbers — nothing generic
- Vary sentence starters: player name, a number, "The projection", "Recent form", "At this price", "The scoring range", "Form over", "The model"
- Never start more than one sentence with the same word

━━ OUTPUT STRUCTURE ━━

WHY — EXACTLY 1 sentence, max 180 characters:
- The single most descriptive stat-based summary of this player's current profile
- Must contain at least one specific number from the data
- Must be player-specific — never a template
- Neutral in tone — describes the profile, does not push action

LONG — MINIMUM 4 sentences, ideally 5–6 (never fewer than 4):
Cover these in whatever order serves the data best:
1. Projection and scoring range (projection_final, ceiling, floor)
2. Recent form vs season average (last_3_avg, last_5_avg, season_avg, form_score, trend_direction)
3. Breakeven and value context (breakeven, edge, value_score, price)
4. Confidence and risk profile (confidence, confidence_label, risk, consistency)
5. Signals and matchup context (signal_tags, matchup_label) — if available

Rules:
- Every sentence references actual numbers or named signals from the data
- Do NOT start multiple sentences with "His", "He", or the player name
- Do NOT duplicate the why sentence
- No closing summary phrases like "overall" or "in conclusion"
- End on a specific stat or signal — not a recommendation

━━ BANNED PHRASES — NEVER USE ━━
"will score", "will rise", "guaranteed", "must buy", "must sell", "trade in", "trade out",
"acquire", "bargain", "enticing opportunity", "lock", "this round", "fantasy coaches should",
"coaches should", "based on current projections", "primed for", "is primed", "worth noting",
"overall,", "in conclusion", "in summary", "it is worth", "bet", "wager", "gamble", "odds"

━━ RESPONSE FORMAT — return ONLY valid JSON ━━
{
  "why": "<EXACTLY 1 sentence ≤180 chars — neutral stat-based profile summary with a specific number>",
  "long": "<MINIMUM 4 sentences (ideally 5–6) — varied starters, grounded in real numbers or signals, no advice>"
}

FINAL CHECK before responding:
1. Does "why" contain a specific number and stay under 180 characters?
2. Does "long" have at least 4 complete sentences?
3. Does the output describe the player's data profile — not tell anyone what to do?
4. Are all banned phrases absent — including "will score", "guaranteed", "must buy", "trade in"?
5. Do NO two sentences in "long" start with the same word?
6. Is there zero gambling, betting, or financial advice language?`;
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

function validateOutput(result: AIResult, recommendation: string): ValidationResult {
  const issues: string[] = [];
  const rec = recommendation.toUpperCase();
  const allText = `${result.why} ${result.long}`.toLowerCase();

  // WHY: exactly 1 sentence, has a number, not too long
  if (!result.why || result.why.length < 15) issues.push("why field too short or empty");
  if (result.why?.length > 200) issues.push("why field too long (>200 chars)");
  if (!/\d/.test(result.why ?? "")) issues.push("why field must contain a specific number");
  const whySentences = (result.why?.match(/[.!?]+/g) ?? []).length;
  if (whySentences !== 1) issues.push(`why field must be exactly 1 sentence — got ${whySentences}`);

  // LONG: minimum 4 sentences, substantial
  if (!result.long || result.long.length < 100) issues.push("long field too short");
  const longSentences = (result.long?.match(/[.!?]+/g) ?? []).length;
  if (longSentences < 4) issues.push(`long field must have at least 4 sentences — got ${longSentences}`);

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

  // v16: advice/action words are banned regardless of recommendation
  const advicePhrases = ["will score", "will rise", "guaranteed", "must buy", "must sell", "trade in", "trade out", "acquire", "bargain", "enticing opportunity"];
  for (const phrase of advicePhrases) {
    if (allText.includes(phrase.toLowerCase())) {
      issues.push(`advice phrase not allowed in v16: "${phrase}"`);
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
    `Describe the current profile of this AFL fantasy player using their stats and model signals.`,
    `Return exactly 2 fields: "why" (1 sentence ≤180 chars with a number) and "long" (minimum 4 sentences, ideally 5–6).`,
    `The model label for this player is: ${recommendation.toUpperCase()}. You may reference this label to explain what the data shows, but do NOT give advice or tell anyone what to do.`,
    `Use only these numbers — do not invent any:\n${JSON.stringify(playerData, null, 2)}`,
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
      temperature: 0.7,
      max_tokens: 600,
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

  const validation = validateOutput(parsed, recommendation);

  if (!validation.valid && attempt < MAX_RETRY_ATTEMPTS) {
    const issueList = validation.issues.map((issue, n) => `${n + 1}. ${issue}`).join("\n");
    const retryMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
      { role: "assistant", content: content },
      {
        role: "user",
        content: `Your response has these issues that MUST be fixed:\n${issueList}\n\nRewrite and return corrected JSON. Pay special attention to the ${recommendation.toUpperCase()} tone requirements.`,
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
        temperature: 0.75,
        max_tokens: 600,
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
          const retryValidation = validateOutput(retryParsed, recommendation);
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

    // Auth: token must match a known secret stored in internal.cron_secrets
    // The service role key is NOT accepted as a direct bearer token — use a dedicated cron_auth_token instead
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
      // Fixed ID range sharding — stable regardless of how many players are regenerated
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

          const promptPayload = {
            player_name:             player.player_name,
            team:                    player.team,
            position:                player.position,
            price:                   player.price,
            price_change:            player.price_change,
            projection_final:        player.projection_final,
            ceiling:                 player.ceiling,
            floor:                   player.floor,
            breakeven:               player.breakeven,
            edge:                    player.edge,
            season_avg:              player.season_avg,
            last_3_avg:              player.last_3_avg,
            last_5_avg:              player.last_5_avg,
            consistency:             player.consistency,
            form_score:              player.form_score,
            trend_direction:         player.trend_direction,
            value_score:             player.value_score,
            value_tag:               player.value_tag,
            matchup_label:           player.matchup_label,
            matchup_rating:          player.matchup_rating,
            venue_multiplier:        player.venue_multiplier,
            risk:                    player.risk,
            confidence:              player.confidence,
            confidence_label:        player.confidence_label,
            neeko_rating_scaled:     player.neeko_rating_scaled,
            upside_pct:              player.upside_pct,
            captain_score:           player.captain_score,
            captain_rating:          player.captain_rating,
            games_played:            player.games_played,
            signal_count:            player.signal_count,
            signal_tags:             (player.top_signals ?? []).slice(0, 3),
            model_label:             recommendation,
            recommendation_strength: player.recommendation_strength,
          };

          if (debugMode) {
            debugData.push({ player_id: player.player_id, recommendation, prompt_payload: promptPayload });
          }

          let result: AIResult;
          let validation: ValidationResult = { valid: true, issues: [] };

          if (openaiKey) {
            const systemPrompt = buildSystemPrompt(recommendation, player.confidence);
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
              why: `Proj ${player.projection_final}, value ${player.value_score ?? "N/A"}, risk ${player.risk ?? "N/A"}, form ${player.form_score ?? "N/A"}.`,
              long: `Projection of ${player.projection_final} sits between ceiling ${player.ceiling} and floor ${player.floor}. Form score is ${player.form_score} with value tag ${player.value_tag}. Priced at ${player.price} with value score ${player.value_score}. Risk is ${player.risk} with confidence ${player.confidence} (${player.confidence_label}). Matchup is ${player.matchup_label ?? "neutral"} — recommendation is ${recommendation}.`,
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
