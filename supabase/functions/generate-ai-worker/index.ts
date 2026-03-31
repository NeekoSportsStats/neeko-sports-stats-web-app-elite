import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://www.neekostats.com.au",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;

interface QueueJob {
  id: number;
  job_type: string;
  entity_type: string | null;
  entity_id: string | null;
  prompt_key: string;
  payload: Record<string, unknown> | null;
  status: string;
  attempts: number;
  created_at: string;
}

interface PromptRecord {
  system_prompt: string;
  user_prompt_template: string;
}

interface OpenAIUsage {
  total_tokens: number;
}

async function loadPrompt(
  supabase: ReturnType<typeof createClient>,
  promptKey: string
): Promise<PromptRecord | null> {
  const { data, error } = await supabase
    .schema("afl")
    .from("ai_prompts")
    .select("system_prompt, user_prompt_template")
    .eq("prompt_key", promptKey)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as PromptRecord;
}

function injectPayload(template: string | null | undefined, payload: Record<string, unknown> | null): string {
  if (!template) {
    throw new Error("Prompt user_prompt_template is null or missing — cannot build prompt");
  }

  const data = payload?.data ?? payload ?? {};
  const dataString = data && Object.keys(data as object).length > 0
    ? JSON.stringify(data, null, 2)
    : "(no payload provided)";

  const label = (payload?.recommendation_label as string | undefined)
    ?? (payload?.data as Record<string, unknown> | undefined)?.recommendation_label as string | undefined
    ?? "HOLD";

  return template
    .replace("{DATA}", dataString)
    .replace("{LABEL}", label);
}

async function callOpenAI(
  openaiKey: string,
  systemPrompt: string,
  userContent: string
): Promise<{ text: string; tokensUsed: number } | null> {
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
      temperature: 0.4,
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`OpenAI HTTP ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  const usage: OpenAIUsage = json.usage ?? { total_tokens: 0 };

  return { text, tokensUsed: usage.total_tokens };
}

function parseRankingLabel(text: string): { label: string; short: string; color: string } {
  const upper = text.toUpperCase();
  let label = "HOLD";
  let color = "yellow";

  if (upper.includes("MUST START") || upper.includes("STRONG BUY") || upper.includes("ELITE")) {
    label = "MUST START"; color = "green";
  } else if (upper.includes("BUY") || upper.includes("START")) {
    label = "BUY"; color = "green";
  } else if (upper.includes("SELL") || upper.includes("AVOID") || upper.includes("DO NOT START")) {
    label = "SELL"; color = "red";
  } else if (upper.includes("HOLD")) {
    label = "HOLD"; color = "yellow";
  } else if (upper.includes("DOWNGRADE")) {
    label = "DOWNGRADE"; color = "orange";
  }

  const short = label.split(" ")[0];
  return { label, short, color };
}

async function writeResult(
  supabase: ReturnType<typeof createClient>,
  job: QueueJob,
  result: string
): Promise<void> {
  switch (job.job_type) {
    case "ranking_recommendation": {
      const playerId = job.entity_id ? Number(job.entity_id) : null;
      if (!playerId) break;

      const inputHash = (job.payload as Record<string, unknown>)?.input_hash as string | null ?? null;

      let cleanText: string;

      try {
        const parsed = JSON.parse(result) as Record<string, string>;
        cleanText = parsed.analysis ?? parsed.recommendation_long ?? parsed.text ?? parsed.recommendation_short ?? result;
      } catch {
        cleanText = result;
      }

      cleanText = cleanText.trim();

      if (!cleanText || cleanText.length < 10) {
        cleanText = "Model analysis is currently generating.";
      }

      await supabase
        .from("ai_rankings_player_recos")
        .upsert(
          {
            player_id: playerId,
            season: 2026,
            recommendation_long: cleanText,
            input_hash: inputHash,
            generated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "player_id" }
        );
      break;
    }

    case "player_analysis": {
      const playerId = job.entity_id ? Number(job.entity_id) : null;
      if (!playerId) break;
      await supabase
        .from("ai_player_analysis")
        .upsert(
          {
            player_id: playerId,
            player_name: (job.payload as Record<string, unknown>)?.player_name ?? null,
            team: (job.payload as Record<string, unknown>)?.team ?? null,
            projection_final: (job.payload as Record<string, unknown>)?.projection_final ?? null,
            analysis: result,
            generated_at: new Date().toISOString(),
          },
          { onConflict: "player_id" }
        );
      break;
    }

    case "test":
    default:
      console.log(`[ai-worker] job_type="${job.job_type}" result preview:`, result.slice(0, 120));
      break;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token || token !== serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: jobs, error: fetchError } = await supabase
      .from("ai_generation_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No pending jobs", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jobIds = (jobs as QueueJob[]).map((j) => j.id);

    await supabase
      .from("ai_generation_queue")
      .update({ status: "processing" })
      .in("id", jobIds);

    let processed = 0;
    let failed = 0;

    const promptCache = new Map<string, PromptRecord | null>();

    for (const job of jobs as QueueJob[]) {
      const startedAt = Date.now();
      let tokensUsed = 0;
      let success = false;
      let errorMsg: string | null = null;
      let model = "gpt-4o-mini";

      try {
        if (!promptCache.has(job.prompt_key)) {
          promptCache.set(job.prompt_key, await loadPrompt(supabase, job.prompt_key));
        }
        const prompt = promptCache.get(job.prompt_key);

        if (!prompt) {
          throw new Error(`No active prompt found for key: ${job.prompt_key}`);
        }

        const userContent = injectPayload(prompt.user_prompt_template, job.payload);

        let resultText = "";
        if (openaiKey) {
          const aiResult = await callOpenAI(openaiKey, prompt.system_prompt, userContent);
          if (aiResult) {
            resultText = aiResult.text;
            tokensUsed = aiResult.tokensUsed;
          }
        } else {
          resultText = `[mock] job_type=${job.job_type} entity_id=${job.entity_id}`;
          model = "mock";
        }

        await writeResult(supabase, job, resultText);

        await supabase
          .from("ai_generation_queue")
          .update({
            status: "complete",
            processed_at: new Date().toISOString(),
            attempts: job.attempts + 1,
          })
          .eq("id", job.id);

        success = true;
        processed++;
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[ai-worker] job ${job.id} failed:`, errorMsg);

        const newAttempts = job.attempts + 1;
        const newStatus = newAttempts >= MAX_ATTEMPTS ? "failed" : "pending";

        await supabase
          .from("ai_generation_queue")
          .update({
            status: newStatus,
            attempts: newAttempts,
            processed_at: newStatus === "failed" ? new Date().toISOString() : null,
          })
          .eq("id", job.id);

        failed++;
      }

      await supabase
        .from("ai_generation_logs")
        .insert({
          queue_id: job.id,
          prompt_key: job.prompt_key,
          model,
          tokens_used: tokensUsed,
          success,
          error: errorMsg,
          created_at: new Date().toISOString(),
        });

      console.log(`[ai-worker] job ${job.id} (${job.job_type}) done in ${Date.now() - startedAt}ms — success=${success}`);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        jobs_fetched: jobs.length,
        processed,
        failed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[ai-worker] fatal error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
