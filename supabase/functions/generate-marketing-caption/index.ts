import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai@4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PlayerRow {
  player_name: string;
  team: string;
  position: string | null;
  projection_final: number | null;
  ceiling_estimate: number | null;
  floor_estimate: number | null;
  consistency_score: number | null;
  form_rating: number | null;
  matchup_rating: number | null;
  risk_rating: number | null;
  captain_score: number | null;
  neeko_rating: number | null;
  price: number | null;
  value_score: number | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (token !== serviceRoleKey) {
      const { createClient } = await import("npm:@supabase/supabase-js@2");
      const userClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      });
      const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
      if (authErr || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: profile } = await userClient
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile?.is_admin) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const { angle_name, players } = body as { angle_name: string; players: PlayerRow[] };

    if (!angle_name || !players || players.length === 0) {
      return new Response(
        JSON.stringify({ error: "angle_name and players are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const top5 = players.slice(0, 5);
    const playerLines = top5.map((p, i) => {
      const stats: string[] = [];
      if (p.projection_final != null) stats.push(`Proj ${Math.round(Number(p.projection_final))}`);
      if (p.ceiling_estimate != null) stats.push(`Ceil ${Math.round(Number(p.ceiling_estimate))}`);
      if (p.floor_estimate != null) stats.push(`Floor ${Math.round(Number(p.floor_estimate))}`);
      if (p.value_score != null) stats.push(`Value ${Number(p.value_score).toFixed(1)}`);
      if (p.captain_score != null) stats.push(`Capt ${Math.round(Number(p.captain_score))}`);
      return `${i + 1}. ${p.player_name} (${p.team}${p.position ? `, ${p.position}` : ""}) — ${stats.join(" | ")}`;
    }).join("\n");

    const systemPrompt = `You are a professional AFL Fantasy content creator for Neeko Sports Stats.
Write punchy, engaging social media captions for AFL Fantasy content.
Keep captions concise (3-5 sentences max), conversational, and action-oriented.
Always end with a call to action question for engagement.
Include exactly these hashtags at the end on their own line: #AFLFantasy #AFLFantasy2026 #FantasyFooty #AFL #NeekoSports
Return a JSON object with fields: "caption" (the main post text including hashtags) and "short_caption" (a 1-sentence teaser under 100 chars).`;

    const userPrompt = `Stat angle: "${angle_name}"

Top players by this metric:
${playerLines}

Write a social media caption for AFL Fantasy fans using these ${angle_name} stats from Neeko Sports Stats analytics.`;

    const openai = new OpenAI({ apiKey: openaiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 350,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const result = JSON.parse(raw);

    return new Response(
      JSON.stringify({
        caption: result.caption ?? "",
        short_caption: result.short_caption ?? "",
        angle_name,
        generated_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("generate-marketing-caption error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
