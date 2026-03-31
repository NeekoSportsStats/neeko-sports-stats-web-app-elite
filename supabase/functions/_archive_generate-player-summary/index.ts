import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BATCH_SIZE = 25;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const TIME_GUARD_MS = 240_000;
const OPENAI_RETRY_DELAYS = [1000, 3000];

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= OPENAI_RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, OPENAI_RETRY_DELAYS[attempt - 1]));
    }

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          temperature: 0.4,
          max_tokens: 300,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        lastErr = new Error(`HTTP ${res.status}: ${txt}`);
        continue;
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastErr ?? new Error("OpenAI call failed after retries");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  console.log("PLAYER_FN_VERSION: opening-round-players-v1");

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
        job_name: "generate-player-summary",
        job_type: "player_summary",
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

    const startTime = Date.now();
    let lastPlayerId = 0;
    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let timedOut = false;

    while (true) {
      if (Date.now() - startTime > TIME_GUARD_MS) {
        timedOut = true;
        console.log("PLAYER_FN_TIMEOUT: 240s guard hit, stopping safely");
        break;
      }

      console.log("PLAYER_BATCH", { lastPlayerId });

      const { data: rows, error: viewError } = await supabase
        .schema("afl")
        .from("v_ai_player_openai_inputs_2026_next_round")
        .select("match_id, round_number, player, team, opponent, player_id, season_context_label, final_openai_input")
        .gt("player_id", lastPlayerId)
        .order("player_id", { ascending: true })
        .limit(BATCH_SIZE);

      if (viewError) {
        await updateLog("error", totalProcessed, viewError.message);
        throw viewError;
      }
      if (!rows || rows.length === 0) break;

      const playerIds = rows.map((r: Record<string, unknown>) => r.player_id).filter(Boolean);

      const freshSet = new Set<string>();

      if (!forceRegenerate) {
        const { data: existingSummaries } = await supabase
          .schema("afl")
          .from("ai_player_summaries")
          .select("player_id, round_number, updated_at")
          .in("player_id", playerIds)
          .eq("season", 2026);

        const now = Date.now();
        for (const s of existingSummaries ?? []) {
          if (s.updated_at) {
            const age = now - new Date(s.updated_at).getTime();
            if (age < SIX_HOURS_MS) {
              freshSet.add(`${s.player_id}__${s.round_number}`);
            }
          }
        }
      }

      for (const row of rows) {
        lastPlayerId = row.player_id as number;

        const key = `${row.player_id}__${row.round_number}`;
        if (freshSet.has(key)) {
          totalSkipped++;
          continue;
        }

        try {
          const input = (row.final_openai_input ?? {}) as Record<string, unknown>;
          const payload = (input.payload ?? {}) as Record<string, Record<string, unknown>>;

          const systemPrompt = String(input.system ?? "");
          const userPrompt = String(input.user ?? "");

          if (!systemPrompt || !userPrompt) {
            console.error(`PLAYER_MISSING_PROMPT player_id=${row.player_id} player=${row.player}`);
            totalErrors++;
            continue;
          }

          let aiSummary: string;
          try {
            aiSummary = await callOpenAI(openaiKey, systemPrompt, userPrompt);
          } catch (openaiErr) {
            console.error("PLAYER_OPENAI_ERR", {
              player_id: row.player_id,
              player: row.player,
              err: openaiErr instanceof Error ? openaiErr.message : String(openaiErr),
            });
            totalErrors++;
            continue;
          }

          const form = (payload.form ?? {}) as Record<string, unknown>;
          const volatility = (payload.volatility ?? {}) as Record<string, unknown>;
          const role = (payload.role ?? {}) as Record<string, unknown>;
          const prediction = (payload.prediction ?? {}) as Record<string, unknown>;

          const seasonAvg = (form.season_avg as number | null) ?? null;
          const ceilingFantasy = (volatility.ceiling as number | null) ?? null;
          const floorFantasy = (volatility.floor as number | null) ?? null;
          const consistencyScore = (role.consistency_score as number | null) ?? null;
          const trendDirection = (prediction.trend_direction as string | null) ?? null;

          const { error: upsertError } = await supabase
            .schema("afl")
            .from("ai_player_summaries")
            .upsert(
              {
                player_id: row.player_id,
                player: row.player,
                team: row.team,
                season: 2026,
                round_number: row.round_number,
                opponent: row.opponent ?? null,
                ai_summary: aiSummary,
                season_avg: seasonAvg,
                ceiling_fantasy: ceilingFantasy,
                floor_fantasy: floorFantasy,
                consistency_score: consistencyScore,
                trend_direction: trendDirection,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "player_id,season,round_number" }
            );

          if (upsertError) {
            console.error(`PLAYER_UPSERT_ERR player_id=${row.player_id}: ${upsertError.message}`);
            totalErrors++;
            continue;
          }

          console.log("PLAYER_UPSERT_OK", { player_id: row.player_id, player: row.player });
          totalProcessed++;
        } catch (rowErr) {
          console.error("PLAYER_ROW_ERR", {
            player_id: row.player_id,
            player: row.player,
            err: rowErr instanceof Error ? rowErr.message : String(rowErr),
          });
          totalErrors++;
        }
      }
    }

    await updateLog("success", totalProcessed);

    return new Response(
      JSON.stringify({
        message: "generate-player-summary complete",
        processed: totalProcessed,
        skipped: totalSkipped,
        errors: totalErrors,
        timed_out: timedOut,
        resume_from_player_id: lastPlayerId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("PLAYER_FN_FATAL:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
