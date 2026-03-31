import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function r1(v: unknown): string {
  const n = toNum(v);
  return n !== null ? n.toFixed(1) : "N/A";
}

function r0(v: unknown): string {
  const n = toNum(v);
  return n !== null ? Math.round(n).toString() : "N/A";
}

function ladderLabel(pos: number | null): string {
  if (pos === null) return "mid-table";
  if (pos <= 4) return `ladder position ${pos} (top 4)`;
  if (pos <= 8) return `ladder position ${pos} (top 8)`;
  if (pos <= 12) return `ladder position ${pos} (mid-table)`;
  if (pos <= 16) return `ladder position ${pos} (lower tier)`;
  return `ladder position ${pos} (bottom tier)`;
}

function ladderBonusLabel(adj: number | null): string {
  const a = toNum(adj);
  if (a === null) return "neutral";
  if (a >= 10) return `+${a} strength (elite)`;
  if (a >= 6)  return `+${a} strength (finals contender)`;
  if (a >= 2)  return `+${a} strength (mid-table)`;
  if (a <= -4) return `${a} strength (below-average)`;
  return "neutral";
}

function formLabel(adj: number | null): string {
  const a = toNum(adj);
  if (a === null) return "neutral";
  if (a >= 4)  return `improving (+${a.toFixed(1)} recent form)`;
  if (a >= 1)  return `slightly up (+${a.toFixed(1)} recent form)`;
  if (a <= -4) return `declining (${a.toFixed(1)} recent form)`;
  if (a <= -1) return `slightly down (${a.toFixed(1)} recent form)`;
  return "stable form";
}

function winRateBonusLabel(bonus: number | null, winRate: number | null): string {
  const b = toNum(bonus);
  const w = toNum(winRate);
  if (b === null || w === null) return "average win rate";
  const pct = Math.round(w * 100);
  if (b >= 5)  return `strong win rate ${pct}% (+${b.toFixed(0)} bonus)`;
  if (b >= 2)  return `above-average win rate ${pct}%`;
  if (b <= -5) return `poor win rate ${pct}% (${b.toFixed(0)} penalty)`;
  if (b <= -2) return `below-average win rate ${pct}%`;
  return `average win rate ${pct}%`;
}

function buildPredictionExplanation(match: Record<string, unknown>): string {
  const homeTeam = String(match.home_team ?? "Home");
  const awayTeam = String(match.away_team ?? "Away");

  const homeScore   = toNum(match.projected_home_score);
  const awayScore   = toNum(match.projected_away_score);
  const margin      = toNum(match.projected_margin);
  const conf        = toNum(match.model_confidence);
  const homeProbPct = Math.round((toNum(match.win_probability_home) ?? 0.5) * 100);
  const awayProbPct = 100 - homeProbPct;

  const homeLadder   = toNum(match.home_ladder_position);
  const awayLadder   = toNum(match.away_ladder_position);
  const homeLadderAdj = toNum(match.home_ladder_adj);
  const awayLadderAdj = toNum(match.away_ladder_adj);
  const homeFormAdj  = toNum(match.home_form_adj ?? match.home_momentum);
  const awayFormAdj  = toNum(match.away_form_adj ?? match.away_momentum);
  const homeWRBonus  = toNum(match.home_win_rate_bonus);
  const awayWRBonus  = toNum(match.away_win_rate_bonus);
  const homeWR       = toNum(match.home_win_rate);
  const awayWR       = toNum(match.away_win_rate);
  const strengthDiff = toNum(match.strength_diff);

  const winningTeam = (homeScore ?? 0) >= (awayScore ?? 0) ? homeTeam : awayTeam;
  const losingTeam  = (homeScore ?? 0) >= (awayScore ?? 0) ? awayTeam : homeTeam;
  const favourite   = winningTeam;
  const marginAbs   = Math.abs(margin ?? 0);
  const matchType =
    marginAbs <= 6  ? "coin-flip contest" :
    marginAbs <= 15 ? "moderate advantage" :
    marginAbs <= 28 ? "clear favourite scenario" :
                      "dominant favourite scenario";

  const lines: string[] = [];

  lines.push(
    `${favourite} favoured by ${r1(marginAbs)} pts (${matchType}). ` +
    `Win probability: ${homeTeam} ${homeProbPct}% · ${awayTeam} ${awayProbPct}%.`
  );

  lines.push(
    `Scoring model: ${homeTeam} ${r1(match.home_points_for_avg)} pts avg ` +
    `vs ${awayTeam} defence conceding ${r1(match.home_points_against_avg)} avg. ` +
    `${awayTeam} ${r1(match.away_points_for_avg)} pts avg ` +
    `vs ${homeTeam} defence conceding ${r1(match.away_points_against_avg)} avg.`
  );

  lines.push(
    `Ladder strength: ${homeTeam} ${ladderLabel(homeLadder)} → ${ladderBonusLabel(homeLadderAdj)}. ` +
    `${awayTeam} ${ladderLabel(awayLadder)} → ${ladderBonusLabel(awayLadderAdj)}.`
  );

  lines.push(
    `Recent form: ${homeTeam} ${formLabel(homeFormAdj)} · ${awayTeam} ${formLabel(awayFormAdj)}.`
  );

  lines.push(
    `Win rate: ${homeTeam} ${winRateBonusLabel(homeWRBonus, homeWR)} · ` +
    `${awayTeam} ${winRateBonusLabel(awayWRBonus, awayWR)}.`
  );

  if (strengthDiff !== null) {
    const absSD = Math.abs(strengthDiff);
    lines.push(
      `Strength differential: ${r1(absSD)} pts in favour of ${favourite}. ` +
      `Confidence: ${r0(conf)}% — ${
        conf !== null && conf >= 80 ? "high (clear edge detected)" :
        conf !== null && conf >= 65 ? "moderate (competitive matchup)" :
        "low (near-even contest)"
      }.`
    );
  }

  lines.push(
    `Home ground bonus: +6 pts applied to ${homeTeam}. ` +
    `Model: V6 Elite (season avg 55% + opponent defence 45% + home + form + win rate + ladder + logistic probability).`
  );

  lines.push(
    `Predicted outcome: ${winningTeam} to WIN · ${losingTeam} projected to lose by ${r1(marginAbs)} pts.`
  );

  return lines.join(" ");
}

function buildPrompt(template: string, match: Record<string, unknown>, venue: string): string {
  const homeWinPct = r0((toNum(match.win_probability_home) ?? 0.5) * 100);
  const awayWinPct = r0((toNum(match.win_probability_away) ?? 0.5) * 100);

  return template
    .replace(/\{\{home_team\}\}/g,            String(match.home_team ?? ""))
    .replace(/\{\{away_team\}\}/g,            String(match.away_team ?? ""))
    .replace(/\{\{venue\}\}/g,               venue)
    .replace(/\{\{home_points_for_avg\}\}/g,  r1(match.home_points_for_avg))
    .replace(/\{\{home_points_against_avg\}\}/g, r1(match.home_points_against_avg))
    .replace(/\{\{away_points_for_avg\}\}/g,  r1(match.away_points_for_avg))
    .replace(/\{\{away_points_against_avg\}\}/g, r1(match.away_points_against_avg))
    .replace(/\{\{home_last5_avg\}\}/g,       r1(match.home_last5_for))
    .replace(/\{\{away_last5_avg\}\}/g,       r1(match.away_last5_for))
    .replace(/\{\{home_offense_rating\}\}/g,  r1(match.home_offense_rating))
    .replace(/\{\{away_offense_rating\}\}/g,  r1(match.away_offense_rating))
    .replace(/\{\{home_defense_rating\}\}/g,  r1(match.home_defense_rating))
    .replace(/\{\{away_defense_rating\}\}/g,  r1(match.away_defense_rating))
    .replace(/\{\{home_volatility\}\}/g,      r1(match.home_volatility))
    .replace(/\{\{away_volatility\}\}/g,      r1(match.away_volatility))
    .replace(/\{\{home_days_rest\}\}/g,       r0(match.home_days_rest))
    .replace(/\{\{away_days_rest\}\}/g,       r0(match.away_days_rest))
    .replace(/\{\{home_win_rate\}\}/g,        r0((toNum(match.home_win_rate) ?? 0.5) * 100))
    .replace(/\{\{away_win_rate\}\}/g,        r0((toNum(match.away_win_rate) ?? 0.5) * 100))
    .replace(/\{\{home_projected_score\}\}/g, r1(match.projected_home_score))
    .replace(/\{\{away_projected_score\}\}/g, r1(match.projected_away_score))
    .replace(/\{\{projected_margin\}\}/g,     r1(match.projected_margin))
    .replace(/\{\{win_probability_home\}\}/g, homeWinPct)
    .replace(/\{\{win_probability_away\}\}/g, awayWinPct)
    .replace(/\{\{model_confidence\}\}/g,     r1(match.model_confidence))
    .replace(/\{\{home_momentum\}\}/g,        r1(match.home_momentum ?? 0))
    .replace(/\{\{away_momentum\}\}/g,        r1(match.away_momentum ?? 0));
}

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
        job_name: "generate-match-summary",
        job_type: "match_summary",
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

    const { data: promptRows, error: promptErr } = await supabase
      .schema("afl")
      .from("ai_prompts")
      .select("system_prompt, user_prompt_template")
      .eq("prompt_key", "match_prediction")
      .eq("is_active", true)
      .limit(1);

    if (promptErr) {
      await updateLog("error", 0, `Prompt fetch failed: ${promptErr.message}`);
      throw new Error(`Prompt fetch failed: ${promptErr.message}`);
    }
    if (!promptRows || promptRows.length === 0) {
      await updateLog("error", 0, "No active match_prediction prompt found");
      throw new Error("No active match_prediction prompt found");
    }

    const systemPrompt = promptRows[0].system_prompt as string;
    const userTemplate = promptRows[0].user_prompt_template as string;

    const { data: payloadRows } = await supabase
      .schema("afl")
      .from("v_ai_match_payloads_2026_next_round")
      .select("match_id, payload");

    const venueMap: Record<number, string> = {};
    for (const p of payloadRows ?? []) {
      const venue = (p.payload as Record<string, unknown>)?.match?.venue as string | undefined;
      if (venue) venueMap[p.match_id] = venue;
    }

    const freshSet = new Set<number>();
    if (!forceRegenerate) {
      const { data: existingRows } = await supabase
        .schema("afl")
        .from("ai_match_predictions")
        .select("match_id, updated_at, ai_summary");

      const now = Date.now();
      for (const row of existingRows ?? []) {
        if (row.updated_at && row.ai_summary) {
          const age = now - new Date(row.updated_at).getTime();
          if (age < THREE_DAYS_MS) freshSet.add(row.match_id);
        }
      }
    }

    const { data: matches, error: matchErr } = await supabase
      .schema("afl")
      .from("v_match_prediction_features_true_game")
      .select("*");

    if (matchErr) {
      await updateLog("error", 0, `Features fetch failed: ${matchErr.message}`);
      throw new Error(`Features fetch failed: ${matchErr.message}`);
    }
    if (!matches || matches.length === 0) {
      await updateLog("success", 0);
      return new Response(
        JSON.stringify({ message: "No matches to process", processed: 0, skipped: 0, errors: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const match of matches) {
      if (freshSet.has(match.match_id)) {
        skipped++;
        continue;
      }

      try {
        const venue = venueMap[match.match_id] ?? "N/A";
        const userPrompt = buildPrompt(userTemplate, match as Record<string, unknown>, venue);

        const predictedHomeScore = toNum(match.projected_home_score);
        const predictedAwayScore = toNum(match.projected_away_score);
        const predictedMargin    = toNum(match.projected_margin);
        const predictedTotal     = predictedHomeScore !== null && predictedAwayScore !== null
          ? Math.round((predictedHomeScore + predictedAwayScore) * 10) / 10
          : null;
        const modelConf          = toNum(match.model_confidence);
        const confidence         = modelConf !== null ? String(Math.round(modelConf)) : null;

        const predictionExplanation = buildPredictionExplanation(match as Record<string, unknown>);

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
              { role: "user",   content: userPrompt },
            ],
          }),
        });

        if (!openaiRes.ok) {
          console.error(`OpenAI error for match ${match.match_id}: ${await openaiRes.text()}`);
          errors++;
          continue;
        }

        const openaiData = await openaiRes.json();
        const aiSummary = openaiData.choices?.[0]?.message?.content ?? "";

        const { error: upsertError } = await supabase
          .schema("afl")
          .from("ai_match_predictions")
          .upsert(
            {
              match_id:               match.match_id,
              home_team:              match.home_team,
              away_team:              match.away_team,
              round_number:           match.round_number,
              season:                 match.season,
              predicted_home_score:   predictedHomeScore,
              predicted_away_score:   predictedAwayScore,
              predicted_margin:       predictedMargin,
              predicted_total:        predictedTotal,
              prediction:             predictedMargin,
              confidence:             confidence,
              ai_summary:             aiSummary,
              prediction_explanation: predictionExplanation,
              updated_at:             new Date().toISOString(),
            },
            { onConflict: "match_id" }
          );

        if (upsertError) {
          console.error(`Upsert error for match ${match.match_id}: ${upsertError.message}`);
          errors++;
          continue;
        }

        processed++;
      } catch (rowErr) {
        console.error(`Row error for match ${match.match_id}:`, rowErr);
        errors++;
      }
    }

    await updateLog("success", processed);

    return new Response(
      JSON.stringify({ message: "generate-match-summary complete", processed, skipped, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("generate-match-summary fatal:", err);
    const errMsg = err instanceof Error
      ? err.message
      : (typeof err === "object" && err !== null)
        ? JSON.stringify(err)
        : String(err);
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
