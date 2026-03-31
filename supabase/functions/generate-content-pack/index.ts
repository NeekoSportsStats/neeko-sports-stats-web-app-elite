import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PlayerData {
  player_id: number;
  player_name: string;
  team: string;
  position: string | null;
  projection_final: number | null;
  ceiling: number | null;
  floor: number | null;
  price: number | null;
  value_score: number | null;
  form_score: number | null;
  consistency: number | null;
  captain_score: number | null;
  risk_rating: number | null;
  upside_pct: number | null;
  neeko_rating_scaled: number | null;
  ai_recommendation: string | null;
  summary_short: string | null;
  summary_long: string | null;
  price_change: number | null;
  price_change_pct: number | null;
  signal: string | null;
}

interface ContentPack {
  video_script: string;
  image_text: string;
  caption: string;
  hooks: string[];
  visual_plan: string;
}

function fmt(n: number | null, suffix = ""): string {
  return n != null ? `${Math.round(Number(n))}${suffix}` : "—";
}
function fmtDec(n: number | null, dp = 1, suffix = ""): string {
  return n != null ? `${Number(n).toFixed(dp)}${suffix}` : "—";
}
function fmtPrice(n: number | null): string {
  return n != null ? `$${(Number(n) / 1000).toFixed(0)}k` : "—";
}

function buildSystemPrompt(): string {
  return `You are an elite AFL Fantasy strategist, performance marketer, and content creator for Neeko Sports. You do NOT create generic content. Every post must stop scroll, challenge the audience, create urgency, and make the user feel they are missing out if they don't follow Neeko.

CONTENT PHILOSOPHY:
- Every post must have a STRONG OPINION. No neutral takes. Take a side.
- Every post must feel like INSIDER KNOWLEDGE the audience doesn't have yet.
- Every post must create URGENCY, FEAR OF MISSING OUT, or CONTROVERSY.

THINK BEFORE YOU WRITE:
1. What is the mainstream AFL Fantasy opinion on this player?
2. Where is the DATA creating an edge the crowd hasn't found?
3. What would make someone feel behind if they didn't see this post?
4. What one-line contrarian take would make someone stop scrolling?

HOOK RULES — NON-NEGOTIABLE:
- Hook 1: Controversy or challenge ("Everyone is wrong about X", "Stop doing this")
- Hook 2: Data-first with specific numbers ("97 pts. $432k. Still sleeping?")
- Hook 3: Fear-of-missing-out or urgency ("This window closes after round X")
- FORBIDDEN: "Here's why...", "Did you know...", "This player is...", passive openers
- Every hook must be under 20 words and create immediate tension

VIDEO SCRIPT RULES:
- 55-80 words. Spoken = 20-30 seconds.
- Structure: Tension hook → What everyone thinks (setup) → Data pivot (the edge) → Strong take (your call) → Neeko CTA
- Use "..." for natural pauses. Use "—" for hard emphasis.
- Sound like an analyst who already made the call — not someone exploring options.
- NEVER use: "might", "could", "perhaps", "possibly", "worth watching", "great player"

CAPTION RULES:
- 2-4 punchy lines. Line 1 = strong opinion or bold claim. Lines 2-3 = specific data. Final line = CTA + hashtags.
- No fluff. No generic phrasing.

VISUAL PLAN RULES:
- Professional creative brief. Scene-by-scene with exact timing.
- Specify exact text overlays word-for-word, stats to highlight, colour scheme, animation style.
- Green (#00C853) for buy/value/breakout/captain/elite. Red/amber for trap/sell.
- Must be a single STRING — not an object.

OUTPUT: Valid JSON only. No markdown fences.`;
}

function buildUserPrompt(player: PlayerData, category: string): string {
  const pc = player.price_change != null && player.price_change !== 0
    ? `${player.price_change > 0 ? "+" : ""}$${(Math.abs(player.price_change) / 1000).toFixed(0)}k`
    : null;

  const categoryContext: Record<string, string> = {
    value:    "UNDERPRICED. The crowd hasn't caught up. Lead with the price gap and the urgency to act before the market corrects.",
    breakout: "BREAKOUT INCOMING. Strong form signals and high ceiling. Lead with the upside and what the data is detecting before the public does.",
    trap:     "DANGEROUS TRAP. This player looks safe but the data says otherwise. Lead with the warning — make the audience feel they were about to make a costly mistake.",
    captain:  "ELITE CAPTAIN PICK. Lock of the round. Lead with the projection and captain score — make it feel like a certainty, not a suggestion.",
    elite:    "ELITE PLAYER. Dominant output, top-tier metrics. Lead with their sustained dominance and why they are unmissable.",
    sell:     "SELL NOW. The value has gone. Lead with the risk signal and the cost of holding — urgency is everything here.",
  };

  return `Generate an elite content pack for this AFL Fantasy player.

APPLY THINK-BEFORE-WRITING FRAMEWORK:
- What is the mainstream opinion on ${player.player_name}?
- Where is the data creating an edge the crowd hasn't found?
- What would make someone feel behind if they missed this post?
- What one contrarian line would stop the scroll?

PLAYER DATA (use ONLY these numbers — no invented stats):
Name: ${player.player_name}
Team: ${player.team}
Position: ${player.position ?? "—"}
Category: ${category.toUpperCase()}
Projection: ${fmt(player.projection_final, " pts")}
Ceiling: ${fmt(player.ceiling, " pts")}
Floor: ${fmt(player.floor, " pts")}
Price: ${fmtPrice(player.price)}${pc ? ` (${pc} this week)` : ""}
Value Score: ${fmtDec(player.value_score, 1)}
Form Score: ${fmt(player.form_score)} / 100
Consistency: ${fmt(player.consistency)}%
Captain Score: ${fmt(player.captain_score)}
Risk Rating: ${fmt(player.risk_rating)}
Upside %: ${fmt(player.upside_pct, "%")}
Neeko Rating: ${fmtDec(player.neeko_rating_scaled, 1)}
AI Recommendation: ${player.ai_recommendation ?? "—"}
Neeko Short Take: ${player.summary_short ?? "—"}
Neeko Analysis: ${player.summary_long ?? "—"}

CATEGORY DIRECTIVE — ${category.toUpperCase()}:
${categoryContext[category] ?? "Lead with the most compelling data point and make a decisive call."}

OUTPUT — return ONLY valid JSON with exactly these 5 fields:

{
  "video_script": "55-80 words. Spoken = 20-30 seconds. Structure: tension hook → what everyone thinks → data pivot → strong take → Neeko CTA. Use '...' for pauses and '—' for emphasis. No hedging. No generic phrases. Sound like an analyst who already made the call.",
  "image_text": "3-6 words max. Bold graphic headline. ALL CAPS. Must be a strong opinion or urgent call-to-action. Examples: 'BUY BEFORE HE RISES', 'EVERYONE IS WRONG', 'LOCK HIM IN NOW', 'DANGER — AVOID'.",
  "caption": "2-4 punchy lines. Line 1: strong opinion or bold claim. Lines 2-3: 1-2 specific data points from the player data above. Final line: Neeko CTA + 3-4 hashtags (#AFLFantasy #AFLSupercoach #NeekoSports + one category-specific). No fluff.",
  "hooks": ["hook 1 — controversy or challenge style, under 20 words", "hook 2 — data-first with specific numbers from the player data, under 20 words", "hook 3 — fear-of-missing-out or urgency style, under 20 words"],
  "visual_plan": "Scene-by-scene creative brief. Scene 1 (0-3s): opening text overlay exact wording + animation. Scene 2 (3-8s): player name + team display. Scene 3 (8-18s): 2-3 stat cards with exact text. Scene 4 (18-25s): strong take text overlay. Scene 5 (25-30s): Neeko CTA. Colour scheme: green (#00C853) for value/breakout/captain/elite, red (#D32F2F)/amber (#FF8F00) for trap/sell. All on #0D0D0D dark background."
}`;
}

async function callOpenAI(
  apiKey: string,
  player: PlayerData,
  category: string,
): Promise<ContentPack> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user",   content: buildUserPrompt(player, category) },
      ],
      temperature: 0.8,
      max_tokens: 900,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`OpenAI ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty response from OpenAI");

  const parsed = JSON.parse(content);

  return {
    video_script:  parsed.video_script  ?? "",
    image_text:    parsed.image_text    ?? "",
    caption:       parsed.caption       ?? "",
    hooks:         Array.isArray(parsed.hooks) ? parsed.hooks : [],
    visual_plan:   parsed.visual_plan   ?? "",
  };
}

function buildFallbackPack(player: PlayerData, category: string): ContentPack {
  const name  = player.player_name;
  const proj  = fmt(player.projection_final, " pts");
  const ceil  = fmt(player.ceiling, " pts");
  const price = fmtPrice(player.price);
  const val   = fmtDec(player.value_score, 1);
  const form  = fmt(player.form_score);
  const cap   = fmt(player.captain_score);
  const catUpper = category.toUpperCase();
  const isPositive = ["value", "captain", "breakout", "elite"].includes(category);
  const colourScheme = isPositive ? "green (#00C853)" : "red (#D32F2F) and amber (#FF8F00)";

  const scriptByCategory: Record<string, string> = {
    value:    `The crowd hasn't found ${name} yet — and that is your advantage. Projecting ${proj} with a ceiling of ${ceil}... value score ${val}. That means elite output at a price the market hasn't priced in. When it corrects... it will be too late. Get on now. Full breakdown at Neeko Sports — link in bio.`,
    breakout: `${name} is about to break out — and the data is screaming it. Form score ${form} out of 100... ceiling of ${ceil}... upside baked in at every level. The window to get them cheap is closing fast. Don't wait for everyone else to figure it out. Neeko Sports — link in bio.`,
    trap:     `You're about to make a costly mistake with ${name}. The name looks safe... the rank seems fine... but value score ${val} at ${price} means you are overpaying. There are better options the crowd hasn't found yet. Don't follow the herd — use the data. Neeko Sports — link in bio.`,
    captain:  `${name} is the captain lock this round — and it isn't close. Projecting ${proj}... ceiling ${ceil}... captain score ${cap}. That is elite output with the consistency to back it up. Put the C on and don't look back. Full breakdown at Neeko Sports — link in bio.`,
    elite:    `${name} is one of the best players in AFL Fantasy right now — and if you don't own them... you're already behind. Projecting ${proj}... ceiling ${ceil}... Neeko rating is elite. This is sustained dominance, not a one-week spike. Neeko Sports — link in bio.`,
    sell:     `The window to sell ${name} is closing fast. Value score ${val}... the numbers no longer justify the price tag. Smart coaches are already moving on. Don't be the last one holding when the price drops. Full breakdown at Neeko Sports — link in bio.`,
  };

  const imageTextByCategory: Record<string, string> = {
    value:    "BUY BEFORE THE RISE",
    breakout: "BREAKOUT INCOMING",
    trap:     "DANGEROUS TRAP",
    captain:  "LOCK HIM IN AS C",
    elite:    "ELITE. NON-NEGOTIABLE.",
    sell:     "SELL NOW — DON'T WAIT",
  };

  const hooksPositive = [
    `The crowd hasn't found ${name} yet — that's your edge.`,
    `${proj} projected. ${val} value score. At ${price}... this is mispriced.`,
    `Stop waiting. ${name} is the best ${category} play this round.`,
  ];
  const hooksNegative = [
    `You're about to make a costly mistake bringing in ${name}.`,
    `Value score ${val} at ${price}. The data says this is a trap.`,
    `Everyone is trading in ${name} this week — which is exactly the problem.`,
  ];

  return {
    video_script: scriptByCategory[category] ?? `${catUpper}: ${name}. Projecting ${proj}, ceiling ${ceil}, value score ${val}. The data makes the call. Neeko Sports — link in bio.`,
    image_text: imageTextByCategory[category] ?? catUpper,
    caption: `${name} is the ${catUpper} call this round — and the numbers back it up.\n\n${proj} projected. Ceiling ${ceil}. Value score ${val}. ${player.summary_short ?? "The data doesn't lie."}\n\nFull breakdown at Neeko Sports — link in bio. #AFLFantasy #AFLSupercoach #NeekoSports #${catUpper.replace(/ /g, "")}`,
    hooks: isPositive ? hooksPositive : hooksNegative,
    visual_plan: `Scene 1 (0-3s): "${imageTextByCategory[category] ?? catUpper}" slams in bold on #0D0D0D — ${colourScheme} glow, fast zoom. Scene 2 (3-6s): Player name + team in large text, ${colourScheme} accent border. Scene 3 (6-15s): Three stat cards pop in — "PROJ: ${proj}", "VALUE: ${val}", "CEILING: ${ceil}" — 0.3s delay between each, sharp pop animation. Scene 4 (15-22s): Strong take text in ${colourScheme} — pulse effect. Scene 5 (22-30s): Neeko Sports logo on dark bg — "Link in bio". Font: Heavy condensed sans-serif, all caps. Motion: Hard cuts, fast zoom on open, stat pop-in.`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey      = Deno.env.get("OPENAI_API_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body */ }

    const playerId = body?.player_id ? Number(body.player_id) : null;
    const category = (body?.category as string | null) ?? "elite";

    if (!playerId) {
      return new Response(
        JSON.stringify({ error: "player_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: rows, error: fetchErr } = await supabase
      .schema("afl" as any)
      .from("player_rankings_cache")
      .select([
        "player_id","player_name","team","position",
        "projection_final","ceiling","floor","price",
        "value_score","form_score","consistency","captain_score",
        "risk_rating","upside_pct","neeko_rating_scaled",
        "ai_recommendation","summary_short","summary_long",
        "price_change","price_change_pct","signal",
      ].join(","))
      .eq("player_id", playerId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!rows) {
      return new Response(
        JSON.stringify({ error: "Player not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const player = rows as unknown as PlayerData;
    let pack: ContentPack;

    if (openaiKey) {
      pack = await callOpenAI(openaiKey, player, category);
    } else {
      pack = buildFallbackPack(player, category);
    }

    const { error: saveErr } = await supabase
      .schema("marketing" as any)
      .from("content_library")
      .upsert({
        player_id:    player.player_id,
        player_name:  player.player_name,
        category,
        content_json: pack,
        hooks_json:   pack.hooks,
        updated_at:   new Date().toISOString(),
      }, { onConflict: "player_id,category", ignoreDuplicates: false });

    if (saveErr) {
      console.warn("[generate-content-pack] library save failed:", saveErr.message);
    }

    return new Response(
      JSON.stringify({ ok: true, player_name: player.player_name, category, pack }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[generate-content-pack] error:", err instanceof Error ? err.message : JSON.stringify(err));
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
