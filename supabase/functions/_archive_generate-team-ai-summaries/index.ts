import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const executionStarted = new Date().toISOString();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: logRow } = await supabase
      .schema("afl")
      .from("ai_generation_logs")
      .insert({
        job_name: "generate-team-ai-summaries",
        job_type: "team_summary",
        status: "running",
        execution_started: executionStarted,
      })
      .select("id")
      .single();

    const logId: string | null = logRow?.id ?? null;

    const updateLog = async (status: string, recordsProcessed?: number, errorMessage?: string) => {
      if (!logId) return;
      const completedAt = new Date().toISOString();
      const durationMs = Math.round(new Date(completedAt).getTime() - new Date(executionStarted).getTime());
      await supabase
        .schema("afl")
        .from("ai_generation_logs")
        .update({
          status,
          records_processed: recordsProcessed ?? null,
          error_message: errorMessage ?? null,
          execution_completed: completedAt,
          duration_ms: durationMs,
        })
        .eq("id", logId);
    };

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      await updateLog("error", 0, "OPENAI_API_KEY not set");
      throw new Error("OPENAI_API_KEY not set");
    }

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body */ }
    const forceRegenerate = body.force === true;

    const freshSet = new Set<string>();

    if (!forceRegenerate) {
      const { data: existingRows } = await supabase
        .schema("afl")
        .from("ai_team_summaries")
        .select("team, round_number, updated_at")
        .eq("season", 2026);

      const now = Date.now();
      for (const row of existingRows ?? []) {
        if (row.updated_at) {
          const updatedTime = new Date(row.updated_at).getTime();
          const age = now - updatedTime;
          if (age < SIX_HOURS_MS && updatedTime > new Date("2001-01-01").getTime()) {
            freshSet.add(`${row.team}__${row.round_number}`);
          }
        }
      }
    }

    const { data: rows, error: fetchError } = await supabase
      .schema("afl")
      .from("v_ai_team_openai_inputs_2026_next_round")
      .select("match_id, round_number, team, opponent, final_openai_input")
      .order("team", { ascending: true })
      .limit(100);

    if (fetchError) {
      await updateLog("error", 0, fetchError.message);
      throw fetchError;
    }

    if (!rows || rows.length === 0) {
      await updateLog("success", 0);
      return new Response(
        JSON.stringify({ message: "generate-team-ai-summaries complete", processed: 0, skipped: 0, errors: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const toProcess = rows.filter(row => {
      const roundNum = row.round_number ?? 0;
      const key = `${row.team}__${roundNum}`;
      return !freshSet.has(key);
    });

    const skipped = rows.length - toProcess.length;

    const results = await Promise.allSettled(
      toProcess.map(async (row) => {
        const roundNum = row.round_number ?? 0;
        const input = row.final_openai_input as Record<string, string>;
        const systemPrompt = input.system ?? "";
        const userPrompt = input.user ?? "";

        if (!systemPrompt || !userPrompt) {
          throw new Error(`Missing prompt for team ${row.team}`);
        }

        const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o",
            temperature: 0.4,
            max_tokens: 1200,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });

        if (!openaiRes.ok) {
          const errText = await openaiRes.text();
          throw new Error(`OpenAI error for ${row.team}: ${errText}`);
        }

        const openaiData = await openaiRes.json();
        const summary = openaiData.choices?.[0]?.message?.content ?? "";

        let fantasy_verdict = "NEUTRAL";
        if (summary.includes("Elite fantasy team")) fantasy_verdict = "ELITE";
        else if (summary.includes("Strong fantasy team")) fantasy_verdict = "STRONG";
        else if (summary.includes("Reliable fantasy team")) fantasy_verdict = "RELIABLE";
        else if (summary.includes("Volatile fantasy team")) fantasy_verdict = "VOLATILE";
        else if (summary.includes("Risky fantasy team")) fantasy_verdict = "RISKY";
        else if (summary.includes("Avoid fantasy team")) fantasy_verdict = "AVOID";

        const { error: upsertError } = await supabase
          .schema("afl")
          .from("ai_team_summaries")
          .upsert(
            {
              team: row.team,
              season: 2026,
              round_number: roundNum,
              summary,
              fantasy_verdict,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "team,season,round_number" }
          );

        if (upsertError) {
          throw new Error(`Upsert error for ${row.team}: ${upsertError.message}`);
        }

        return row.team;
      })
    );

    const processed = results.filter(r => r.status === "fulfilled").length;
    const errors = results.filter(r => r.status === "rejected").length;

    for (const r of results) {
      if (r.status === "rejected") {
        console.error("Team summary error:", r.reason);
      }
    }

    await updateLog("success", processed);

    return new Response(
      JSON.stringify({
        message: "generate-team-ai-summaries complete",
        processed,
        skipped,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-team-ai-summaries fatal:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
