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
const PROMPT_VERSION = "generate-player-ai-v15";
const MAX_RETRY_ATTEMPTS = 2;

// ── BANNED PHRASES ─────────────────────────────────────────────────────────

const BANNED_FOR_SELL = [
  "primed for", "grab him", "while you can", "solid buy", "great form",
  "in great shape", "strong option", "fantastic", "excellent", "must-start",
  "strong performer", "valuable addition", "big score", "great pick",
  "top pick", "reliable option", "solid choice", "standout option",
  "viable choice", "viable option", "reliable output", "strong potential",
  "dependable option", "promising projection", "makes him a reliable",
  "makes him a viable", "good option", "quality option",
];
const BANNED_FOR_BUY = [
  "sell now", "avoid", "liability", "stay away", "cut him", "drop him",
];
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
  "could",
  "might",
  "may",
  "bye",
  "rest week",
  "unavailable",
  "not playing",
  "missing this week",
];
const BANNED_OPENINGS = [
  "primed for a solid", "primed for a strong", "primed for a great",
  "is primed", "set for a solid", "set for a strong", "is poised for a",
  "is a solid pick", "is a strong pick",
];

// ── RECOMMENDATION TONE GUIDES ─────────────────────────────────────────────

const RECOMMENDATION_TONE: Record<string, string> = {
  BUY: `RECOMMENDATION = BUY — TONE: Aggressive confidence. This is an opportunity. Make the reader feel they need to act.

The decision is made: this player is underpriced and the upside is not priced in.
Lead with the value gap or price inefficiency. Every sentence should build the case for why this is a clear opportunity right now.

FIRST SENTENCE must feel like an opportunity — examples:
- "He's underpriced for what he's currently producing."
- "At this price, the value gap is impossible to ignore."
- "There's clear upside here that the market hasn't priced in yet."

Voice: assertive, opportunity-focused, slightly urgent. The reader should feel this is actionable.
Use: "clear value gap", "mispriced relative to output", "upside is not priced in", "the price doesn't reflect", "shows", "confirms", "drives".
Risk framing: acknowledge it briefly if relevant, then redirect to the upside. Do NOT dwell on risk.
NEVER use decline/sell/avoid language.`,

  HOLD: `RECOMMENDATION = HOLD — TONE: Calm and balanced. No urgency. No strong edge either way.

The decision is made: price and projection are aligned — hold firm and monitor.
Lead with the defined scoring range or stable projection. Every sentence should reinforce that there is no compelling reason to act.

FIRST SENTENCE must feel neutral, no urgency — examples:
- "There's no strong edge at his current price."
- "Price and projection are well aligned right now."
- "The scoring range is defined — floor holds and ceiling is capped."

Voice: measured, analytical, no emotional pull. The reader should feel this is a comfortable hold with nothing forcing a move.
Use: "range is well defined", "floor holds", "ceiling is capped", "stable scoring profile", "no clear edge", "locked in", "consistent baseline".
Risk framing: mention it neutrally — neither amplify nor dismiss.
NEVER use urgent buy or sell language.`,

  SELL: `RECOMMENDATION = SELL — TONE: Direct and corrective. Slightly sharp. The price is wrong and the data confirms it.

The decision is made: risk outweighs value. The SELL signal is firm.
Lead with the primary sell reason — price exceeds output, regression signals, declining form, soft ceiling, or structural risk.

FIRST SENTENCE must feel corrective, not neutral — examples:
- "The price is ahead of what he's actually producing."
- "This is overpriced for a player with this ceiling."
- "The downside risk outweighs whatever upside remains."

Voice: direct, slightly critical, no softening. The reader should feel confident walking away from this player.
Use: "risk outweighs value", "price exceeds output", "regression signals present", "soft ceiling", "value deficit", "overpriced", "dipping", "declining".
Risk framing: make it prominent — it is the core argument.
NEVER use positive language. NEVER say "reliable", "solid", "strong", "viable", "dependable", "promising".
The "why" MUST carry a clear negative signal. Never neutral.`,

  START: `RECOMMENDATION = START — TONE: Decisive and specific. Elite projection, clear matchup advantage.

The decision is made: this player is a clear start candidate.
Lead with the projection, ceiling potential, or matchup advantage.

FIRST SENTENCE must feel decisive — examples:
- "The projection is elite and the matchup confirms the ceiling is live."
- "At this price point, the ceiling makes him a clear starter."

Voice: confident and specific. Reference exact numbers. No hedging.
Use: "ceiling is live", "matchup reinforces", "projection confirms", "shows", "drives the start call".`,

  SIT: `RECOMMENDATION = SIT — TONE: Clear and firm. Low projection or poor matchup — no case to start.

The decision is made: this player should be on the bench.
Lead with the specific reason — low projection, poor matchup, injury concern, or role risk.

FIRST SENTENCE must feel like a clear bench call — examples:
- "The projection doesn't justify a start this week."
- "A floor of X against this matchup makes him a clear sit."

Voice: matter-of-fact, no ambiguity. The reader should have no doubt.
Use: "confirms the risk", "drives the sit call", "low ceiling", "poor matchup", "not worth the risk".
Do NOT frame this positively.`,
};

// ── PROMPT BUILDER ──────────────────────────────────────────────────────────

function buildConvictionLayer(confidence: number | null): string {
  const c = confidence ?? 50;
  if (c >= 90) {
    return `CONVICTION TIER: ELITE (${c})
Use language that signals the highest level of certainty. This player is among the most reliable projections on the slate.
Phrase bank (use ONE naturally, do NOT quote the number): "elite play", "top-tier option", "one of the strongest plays on the slate", "as reliable as it gets this week", "high-conviction selection".`;
  }
  if (c >= 75) {
    return `CONVICTION TIER: STRONG (${c})
Use language that signals a well-supported, high-quality projection.
Phrase bank (use ONE naturally, do NOT quote the number): "strong play", "well-supported pick", "shapes as a strong selection", "projection is well-backed", "well-positioned to deliver".`;
  }
  if (c >= 60) {
    return `CONVICTION TIER: SOLID (${c})
Use language that signals reasonable confidence with some uncertainty acknowledged.
Phrase bank (use ONE naturally, do NOT quote the number): "reasonable play", "has upside but not without risk", "projection holds up", "a workable option given the numbers", "floor provides some security".`;
  }
  if (c >= 50) {
    return `CONVICTION TIER: LOW (${c})
Use language that signals meaningful uncertainty — this player carries risk.
Phrase bank (use ONE naturally, do NOT quote the number): "volatile output", "inconsistent profile", "comes with real risk", "projection range is wide", "hard to pin down".`;
  }
  return `CONVICTION TIER: VERY LOW (${c})
Use language that signals significant uncertainty — the projection is unreliable.
Phrase bank (use ONE naturally, do NOT quote the number): "risky selection", "hard to trust right now", "significant downside exists", "projection lacks reliability", "variance is too high to lean on".`;
}

function buildSystemPrompt(recommendation: string, confidence?: number | null): string {
  const rec = recommendation.toUpperCase();
  const tone = RECOMMENDATION_TONE[rec] ?? `RECOMMENDATION = ${recommendation}`;
  const convictionLayer = buildConvictionLayer(confidence ?? null);

  const recommendationAlignment = rec === "BUY"
    ? `PERSONALITY: Aggressive confidence — this is an opportunity. The reader should feel compelled to act.\nVary your opener: "He's", "Right now,", "At this price,", "There's clear upside", "The value gap here".\nRisk: acknowledge briefly, redirect to upside. Do NOT dwell on it.`
    : rec === "SELL"
    ? `PERSONALITY: Direct and corrective — slightly sharp. The price is wrong and the data confirms it.\nVary your opener: player name, "The price is", "This is overpriced", "The ceiling here", a specific price figure.\nRisk: make it prominent — it is the core argument.`
    : rec === "HOLD"
    ? `PERSONALITY: Calm and balanced — no urgency, no strong edge. The reader should feel comfortable doing nothing.\nVary your opener: "Right now,", "The range is", "Price and projection", a projection number, "No clear edge".\nRisk: mention neutrally — neither amplify nor dismiss.`
    : rec === "START"
    ? `PERSONALITY: Decisive and specific — elite projection or matchup makes this a clear call.\nVary your opener: "At", "The matchup", a projection number, "The ceiling is live".\nBe direct. Reference exact numbers.`
    : `PERSONALITY: Matter-of-fact — clear bench call, no ambiguity.\nVary your opener: "The projection", "A floor of", player name, "The matchup".\nDo NOT frame positively.`;

  return `You are Neeko — an elite AFL fantasy analyst. You do NOT generate recommendations. The model recommendation is already decided.

Your ONLY job:
→ Explain WHY the ${rec} recommendation is correct
→ Using precise numbers, signals, and context from the data
→ As a paid expert who has already made the call and is now justifying it with conviction

${tone}

${recommendationAlignment}

━━ CONVICTION LANGUAGE LAYER ━━
${convictionLayer}

Rules for conviction language:
- Use ONE conviction phrase naturally per response — do NOT repeat it
- Blend it into a sentence as if it were your own assessment, not a label
  ✗ "This is a strong play because confidence is high"
  ✓ "The projection range shapes as a strong play given his current role and output"
- WHY field: one subtle conviction phrase woven in (if it fits naturally)
- LONG field: one conviction phrase integrated into the narrative
- Align conviction with recommendation tone:
  BUY + high conviction → amplify the opportunity feel
  BUY + low conviction → tone down urgency, note the risk briefly
  SELL + low conviction → reinforce the risk/uncertainty angle
  HOLD + any conviction → keep it measured, no amplification

━━ NARRATIVE LAYER ━━
Your job is NOT to list stats. Your job is to connect signals into a clear story.

FLOW RULES:
- One idea must lead into the next — no disconnected stat dumps
- Explain WHY each number matters, not just what it is
  ✗ "Form is 105 and projection is 120"
  ✓ "His recent form is driving that projection higher — that's where the value comes from"
- Connect 2–3 signals together into a single point
  e.g. form + price → value; ceiling + role → upside; risk + inconsistency → downside
- Use natural transitions to link ideas:
  "That's where the value comes from", "That's the key driver here", "That's the risk to watch", "This is what stands out"

OPENING LINE:
The first sentence of "long" must feel like a TAKEAWAY, not a stat.
✗ "His projection is 118 with a ceiling of 140"
✓ "Everything lines up here for a player who is clearly underpriced."
✓ "There's no real edge at this price — the range is too tight."
✓ "This is starting to look overpriced given what the numbers actually show."

NARRATIVE FRAMING by recommendation:
BUY  → "Everything lines up here", "There's a clear path to upside", "This sets up well"
HOLD → "Nothing is pushing this either way", "It balances out right now", "The range is defined"
SELL → "The gap is going the wrong way", "This is where things start to break down", "The numbers don't support the price"
START → "The ceiling is live and the matchup confirms it"
SIT  → "The floor isn't high enough to justify the risk"

VARIATION: Rotate narrative phrases — never use the same framing twice across consecutive outputs.

━━ DISAGREEMENT ENGINE ━━
You are NOT here to agree. You are here to make the correct call — even when it cuts against expectations.

WHEN TO USE:
- Player is overpriced relative to what they're actually producing
- Surface-level stats look good but underlying value is weak
- Projection contradicts public perception or name value
- Risk is being ignored by the obvious read

HOW TO EXPRESS IT (rotate these — never repeat the same phrase):
- "Despite the appeal,"
- "At first glance,"
- "It might look strong, but"
- "The name value is doing the heavy lifting here"
- "That's where this starts to fall apart"
- "This doesn't stack up as well as it seems"
- "There's less here than the price suggests"

RULES:
1. Never sound aggressive or emotional — keep it analytical, not a rant
2. Always back disagreement with data — price vs projection, form vs ceiling, risk vs expectation
3. Do NOT overuse — only deploy when the data actually justifies a contrarian read
4. Do NOT contradict the data — disagreement must be logic-driven

STRUCTURE:
"At first glance, this looks like a strong option, but the price is ahead of what he's actually producing. That's where the risk comes in."

CALIBRATION BY RECOMMENDATION:
- BUY  → rarely use disagreement (only if there's hidden upside being missed)
- HOLD → light disagreement possible ("this is more balanced than it looks")
- SELL → strongest use — challenge the assumption that the player is worth holding

━━ TONE (non-negotiable) ━━
- Write like a sharp, paid analyst — not a chatbot, not a template
- Start with the conclusion. Support it with data. Do not build to it.
- Every sentence must be specific to THIS player's numbers — nothing generic
- Be decisive. You are confirming a call, not exploring one.
- Sound like someone confident enough to be wrong — not someone hedging

━━ SENTENCE VARIATION ━━
Vary how sentences begin across the 5-sentence long analysis.
Rotate starters naturally: player name, a number, "Right now,", "At this price,", "The upside", "The ceiling", "His form", "A projection of", "The floor", "Matchup context".
Never start more than one sentence with the same word or phrase.

━━ CONVICTION RULES ━━
- Do NOT hedge. Ever.
- Replace weak verbs: "indicates" → "shows", "suggests" → "confirms"
- "could", "may", "might", "potentially", "arguably" → banned entirely
- Every sentence must reinforce the ${rec} call — not just describe data

━━ SIGNAL USAGE ━━
When signal_tags are provided (e.g. ["underpriced_elite", "breakout_candidate", "form_rising"]):
- Pick the 1–2 most relevant. Weave them in naturally.
- Never list them. Never ignore them.
- Avoid printing the raw tag name verbatim — translate it: "underpriced_elite" → "clearly underpriced for this output level"

━━ OUTPUT STRUCTURE ━━

WHY — EXACTLY 1 sentence, max 140 characters:
- The single strongest reason the ${rec} call is correct
- Must contain at least one specific number from the data
- Must be player-specific — never a template
- Start with the player name OR a direct data point
${rec === "SELL" ? "- Must express a clear negative signal — declining, overpriced, risky, soft ceiling. Never neutral." : ""}
${rec === "BUY" ? '- Frame as opportunity: "clear value gap", "mispriced relative to output", or "upside is not priced in"' : ""}
${rec === "HOLD" ? '- Frame as stability: "stable scoring profile", "range is well defined", or "floor holds this"' : ""}
${rec === "SELL" ? '- Frame as risk: "risk outweighs value", "price exceeds output", or "regression signals present"' : ""}

LONG — EXACTLY 5 sentences (count carefully):
Cover these angles — in whatever order serves the player best:
1. Projection range: projection_final vs ceiling vs floor — tight or wide?
2. Form and trend: form_score, trend_direction — UP, FLAT, or DOWN?
3. Value and price: value_score, value_tag, price — good value, fair, or overpriced?
4. Risk and confidence: risk, confidence, confidence_label — what drives the uncertainty?
5. Signals and matchup: signal_tags and matchup_label — reinforce the call

Rules:
- Every sentence references actual numbers or named signals from the data
- Do NOT start multiple sentences with "His", "He", or the player name
- Do NOT duplicate the why sentence
- Every sentence reinforces the ${rec} call — not just observes
- No closing summary phrases. End on a specific signal or number.

━━ BANNED PHRASES — NEVER USE ━━
"this round", "fantasy coaches should", "coaches should", "based on current projections",
"primed for", "is primed", "worth noting", "overall,", "in conclusion", "in summary",
"it is worth", "reliable option", "solid choice", "viable option", "dependable option",
"solid option", "good choice", "that gap is real", "hold and watch", "no edge to act on",
"could", "might", "may", "arguably", "potentially", "indicates", "suggests"
${rec === "SELL" ? '\nSELL-specific bans: "great form", "solid buy", "strong option", "must-start", "strong performer", "reliable output", "promising projection", "reliable", "solid", "strong", "viable", "dependable", "promising"' : ""}

━━ RESPONSE FORMAT — return ONLY valid JSON ━━
{
  "why": "<EXACTLY 1 sentence ≤140 chars — strongest ${rec} signal with a specific number>",
  "long": "<EXACTLY 5 sentences — varied starters, all grounded in real numbers or signals>"
}

FINAL CHECK before responding:
1. Does "why" contain a specific number?
2. Is "long" exactly 5 sentences?
3. Does every sentence reinforce the ${rec} call decisively?
4. Have you used at least one signal from signal_tags (if provided)?
5. No banned phrases — including "could", "might", "may", "that gap is real", "hold and watch"?
6. Do NO two sentences in "long" start with the same word?
7. Does the output sound like a decision has been made — not a possibility being explored?`;
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
  if (result.why?.length > 160) issues.push("why field too long (>160 chars)");
  if (!/\d/.test(result.why ?? "")) issues.push("why field must contain a specific number");
  const whySentences = (result.why?.match(/[.!?]+/g) ?? []).length;
  if (whySentences !== 1) issues.push(`why field must be exactly 1 sentence — got ${whySentences}`);

  // LONG: exactly 5 sentences, substantial
  if (!result.long || result.long.length < 100) issues.push("long field too short");
  const longSentences = (result.long?.match(/[.!?]+/g) ?? []).length;
  if (longSentences !== 5) issues.push(`long field must be exactly 5 sentences — got ${longSentences}`);

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

  // Conviction checks — weak/hedging language
  // Note: "indicates" and "suggests" are banned in the system prompt but excluded here
  // to avoid rejecting older AI content generated before that ban was enforced.
  const weakPhrases = ["could", "might", "may ", "potentially", "solid option", "good choice"];
  for (const phrase of weakPhrases) {
    if (allText.includes(phrase.toLowerCase())) {
      issues.push(`weak/hedging phrase not allowed: "${phrase}"`);
    }
  }

  if (rec === "SELL") {
    for (const phrase of BANNED_FOR_SELL) {
      if (allText.includes(phrase.toLowerCase())) {
        issues.push(`SELL contradiction — positive phrase: "${phrase}"`);
      }
    }
    const hasSellSignal = [
      "sell", "declin", "overpriced", "risky", "dip", "limited upside",
      "soft ceil", "low ceiling", "ceiling too low", "value deficit",
      "below", "underperform", "struggling", "low upside", "not worth",
      "poor form", "dipping", "risk", "underwhelm", "gamble",
    ].some(w => allText.includes(w));
    if (!hasSellSignal) issues.push("SELL output missing any sell-signal language");
  }

  if (rec === "BUY") {
    for (const phrase of BANNED_FOR_BUY) {
      if (allText.includes(phrase.toLowerCase())) {
        issues.push(`BUY contradiction — negative phrase: "${phrase}"`);
      }
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
    `Write a ${recommendation.toUpperCase()} explanation for this AFL fantasy player.`,
    `Return exactly 2 fields: "why" (1 sentence with a number) and "long" (exactly 5 sentences).`,
    `Every sentence must justify the ${recommendation.toUpperCase()} recommendation using only these numbers — do not invent any:\n${JSON.stringify(playerData, null, 2)}`,
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
        "risk", "confidence", "confidence_label", "consistency",
        "value_score", "value_tag", "best_value_score",
        "matchup_rating", "matchup_label", "venue_multiplier",
        "form_score", "neeko_rating", "neeko_rating_scaled",
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
            model_recommendation:    recommendation,
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
