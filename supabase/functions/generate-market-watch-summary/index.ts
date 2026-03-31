import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://www.neekostats.com.au",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token || token !== serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: promptRow, error: promptErr } = await supabase
      .schema("afl")
      .from("ai_prompts")
      .select("system_prompt, user_prompt_template")
      .eq("prompt_key", "market_watch_summary")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (promptErr || !promptRow) {
      return new Response(
        JSON.stringify({ error: "Prompt not found" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: inputRows, error: inputErr } = await supabase
      .schema("afl")
      .from("v_ai_market_watch_inputs")
      .select("*");

    if (inputErr || !inputRows || inputRows.length === 0) {
      return new Response(
        JSON.stringify({ error: "No market watch input data available" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dataJson = JSON.stringify(inputRows, null, 2);
    const userPrompt = promptRow.user_prompt_template.replace("{DATA}", dataJson);

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: promptRow.system_prompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 400,
        temperature: 0.7,
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      return new Response(
        JSON.stringify({ error: "OpenAI request failed", detail: errBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiRes.json();
    const summary: string = openaiData.choices?.[0]?.message?.content?.trim() ?? "";

    if (!summary) {
      return new Response(
        JSON.stringify({ error: "Empty response from OpenAI" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: snapshotRow } = await supabase
      .schema("market")
      .from("market_watch_snapshot")
      .select("season, round_number")
      .eq("is_active", true)
      .maybeSingle();

    const season = snapshotRow?.season ?? new Date().getFullYear();
    const round_number = snapshotRow?.round_number ?? 0;

    const { error: upsertErr } = await supabase
      .schema("afl")
      .from("ai_market_watch_summary")
      .upsert(
        { season, round_number, summary, generated_at: new Date().toISOString() },
        { onConflict: "season,round_number" }
      );

    if (upsertErr) {
      return new Response(
        JSON.stringify({ error: "Failed to save summary" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, season, round_number, summary }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
