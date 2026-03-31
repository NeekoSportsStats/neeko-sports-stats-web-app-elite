import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai@4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TIER_COLORS: Record<string, string> = {
  "ELITE CAPTAIN":    "#F5C84C",
  "CAPTAIN LOCK":     "#E0B100",
  "MUST START":       "#00E676",
  "STRONG START":     "#00C853",
  "HIGH CONFIDENCE":  "#00A844",
  "SOLID PICK":       "#2196F3",
  "VALUE PLAY":       "#00B0FF",
  "FLEX OPTION":      "#9E9E9E",
  "HIGH RISK":        "#FF6D00",
  "AVOID":            "#D50000",
};

const VALID_LABELS = new Set(Object.keys(TIER_COLORS));

function clampText(text: string | null | undefined, maxWords: number): string {
  if (!text) return "";
  const words = text.trim().split(/\s+/);
  return words.slice(0, maxWords).join(" ");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const openai = new OpenAI({ apiKey: openaiKey });

    const { data: promptRow, error: promptErr } = await supabase
      .schema("afl")
      .from("ai_prompts")
      .select("system_prompt, user_prompt_template")
      .eq("prompt_key", "player_ranking_recommendation")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (promptErr || !promptRow) {
      return new Response(
        JSON.stringify({ error: "No active prompt found for player_ranking_recommendation" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: queue, error: queueErr } = await supabase
      .from("v_ai_rankings_generation_queue")
      .select("player_id, player_name, team, position, openai_input_json, updated_at");

    if (queueErr) throw queueErr;

    if (!queue || queue.length === 0) {
      return new Response(
        JSON.stringify({ message: "No players need generation", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let errors = 0;
    const samplePlayers: string[] = [];

    for (const row of queue as Array<{
      player_id: number;
      player_name: string;
      team: string;
      position: string | null;
      openai_input_json: Record<string, unknown>;
      updated_at: string | null;
    }>) {
      try {
        const payloadText = JSON.stringify(row.openai_input_json, null, 2);
        const userPrompt = (promptRow.user_prompt_template as string).replace("{{DATA}}", payloadText);

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: promptRow.system_prompt as string },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.35,
          max_tokens: 600,
          response_format: { type: "json_object" },
        });

        const raw = completion.choices[0]?.message?.content ?? "{}";
        let parsed: Record<string, string>;
        try {
          parsed = JSON.parse(raw);
        } catch {
          errors++;
          console.error(`JSON parse error for player_id ${row.player_id}:`, raw);
          continue;
        }

        const label = VALID_LABELS.has(parsed.recommendation_label)
          ? parsed.recommendation_label
          : "FLEX OPTION";

        const color = TIER_COLORS[label];
        const now = new Date().toISOString();

        await supabase
          .from("ai_rankings_player_recos")
          .upsert({
            player_id: row.player_id,
            season: 2026,
            recommendation_label: label,
            recommendation_color: color,
            recommendation_short: clampText(parsed.recommendation_short, 60),
            recommendation_long: clampText(parsed.recommendation_long, 300),
            generated_at: now,
            updated_at: now,
          }, { onConflict: "player_id" });

        processed++;
        if (samplePlayers.length < 3) samplePlayers.push(row.player_name);
      } catch (playerErr) {
        errors++;
        console.error(`Error on player_id ${row.player_id}:`, playerErr);
      }
    }

    return new Response(
      JSON.stringify({
        message: "generate-player-ranking-recos complete",
        processed,
        errors,
        total_queued: queue.length,
        sample_players: samplePlayers,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-player-ranking-recos fatal:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
