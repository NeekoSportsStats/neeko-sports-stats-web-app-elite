import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PROMPT_VERSION = "generate-team-ai-summaries-v17";
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

// ── Banned phrases ────────────────────────────────────────────────────────────

const BANNED_ALWAYS = [
  "must buy", "must sell", "lock in", "lock", "bargain", "guaranteed",
  "trade in", "trade out", "acquire", "enticing opportunity",
  "bet", "wager", "gamble", "financial advice",
  "will score", "will win", "will rise", "will fall",
  "move on", "strong buy", "buy opportunity",
];

function checkBanned(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_ALWAYS.filter(phrase => lower.includes(phrase));
}

// ── Prompt builder ─────────────────────────────────────────────────────────────

interface TeamPayload {
  team: string;
  opponent: string | null;
  round_number: number;
  squad_size: number;
  top_projection: number;
  avg_projection: number;
  avg_season_avg: number;
  start_count: number;
  hold_count: number;
  sit_count: number;
  premium_count: number;
  premium_avg_proj: number;
  value_count: number;
  avoid_count: number;
  mid_count: number;
  def_count: number;
  fwd_count: number;
  ruc_count: number;
  top_player_name: string | null;
  top_player_price: number | null;
}

function buildSystemPrompt(): string {
  return `You are Neeko — an AFL statistics analyst. Your job is to describe a team's recent statistical profile and squad composition in neutral, factual terms.

CORE FOCUS:
Describe the team's actual scoring output, squad depth and statistical profile. This is a statistical summary, not a fantasy recommendation engine.

PRIMARY topics (always cover where data is available):
- Team scoring output: top projection, average projection vs season average — is the squad trending up or down?
- Scoring depth: is output concentrated in a few players or spread across the squad?
- Positional composition: MID/DEF/FWD/RUC balance — which lines are strongest or thinnest?
- High-output contributors: the top-projecting player and their scoring profile
- Squad consistency: number of players with positive vs negative model signals
- Risk concentration: how many players are carrying injury, form decline or hard-sit signals?
- Premium player depth: how are the squad's highest-priced players performing relative to projection?

SECONDARY topics (include only as supporting context, not as main focus):
- Model signal distribution (Start / Hold / Sit counts) — as a summary indicator of squad reliability
- Value tier count — as a supplementary data point only

WHAT NOT TO FOCUS ON:
Do NOT make the analysis centre around:
- breakeven (do not mention)
- price movement or price change
- whether to "trade in" or "trade out" players
- fantasy ownership advice of any kind
- which players represent "bargains" or "opportunities"
- buy/sell/hold language aimed at the reader

STYLE RULES:
- Write 5–6 sentences minimum. Do not write fewer than 4 complete sentences.
- Describe the team's profile as it currently stands. Do not instruct readers on what to do.
- Preferred phrasings:
  "The squad profile shows..."
  "Across the roster..."
  "The positional mix includes..."
  "The scoring output..."
  "The top-end contributors..."
  "Output is concentrated in / spread across..."
  "The stat trend for the squad is..."
  "The main statistical risk is..."
  "The team profile is strongest through..."
- Do not say players "will" perform a certain way.
- Do not give trade, buy, or sell instructions of any kind.
- Do not use: "must buy", "must sell", "lock", "bargain", "guaranteed", "trade in", "trade out", "acquire", "enticing", "bet", "wager", "gamble", "financial advice", "move on", "strong buy"

OUTPUT FORMAT:
Write a single paragraph of 5–6 sentences. No bullet points. No headings. No labels.

After the paragraph, on a new line, output exactly one of these profile lines (choose the most accurate based on scoring output and consistency, not fantasy trade value):
Deep scoring squad
Strong scoring squad
Balanced scoring squad
Thin scoring depth
Volatile scoring output
Risk-heavy squad`;
}

function buildUserPrompt(payload: TeamPayload): string {
  const matchContext = payload.opponent
    ? `Round ${payload.round_number} — vs ${payload.opponent}`
    : `Round ${payload.round_number}`;

  return `Team: ${payload.team}
Context: ${matchContext}

Squad data:
- Squad size: ${payload.squad_size}
- Top projected player: ${payload.top_player_name ?? "unknown"} (proj ${payload.top_projection} pts)
- Average squad projection: ${payload.avg_projection} pts
- Average season avg: ${payload.avg_season_avg} pts

Positional depth:
- MID: ${payload.mid_count} | DEF: ${payload.def_count} | FWD: ${payload.fwd_count} | RUC: ${payload.ruc_count}

Model signal distribution:
- Positive signals (Start): ${payload.start_count} | Neutral (Hold): ${payload.hold_count} | Negative (Sit): ${payload.sit_count}

Squad composition:
- Premium players (>$700k): ${payload.premium_count} (avg proj: ${payload.premium_avg_proj} pts)
- High-value output players: ${payload.value_count}
- Risk/form concerns: ${payload.avoid_count}

Describe the recent scoring profile and squad composition of ${payload.team} based on the above statistical data.`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

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

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not set");
    }

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body */ }
    const forceRegenerate = body.force === true;
    const targetTeam: string | null = typeof body.team === "string" ? body.team : null;

    // ── Fetch existing summaries to skip fresh ones ────────────────────────
    const freshSet = new Set<string>();

    if (!forceRegenerate) {
      const { data: existingRows } = await supabase
        .schema("afl" as any)
        .from("ai_team_summaries")
        .select("team, round_number, updated_at, prompt_version")
        .eq("season", 2026);

      const now = Date.now();
      for (const row of existingRows ?? []) {
        if (row.updated_at && row.prompt_version === PROMPT_VERSION) {
          const updatedTime = new Date(row.updated_at).getTime();
          const age = now - updatedTime;
          if (age < SIX_HOURS_MS) {
            freshSet.add(`${row.team}__${row.round_number}`);
          }
        }
      }
    }

    // ── Fetch team input data from rankings cache ─────────────────────────
    // Note: player_rankings_cache has no `season` column and no `is_injured` column.
    // Use `manual_status` and `is_available` to determine availability instead.
    let query = supabase
      .schema("public" as any)
      .from("player_rankings_cache")
      .select(
        "team, position_group, projection, season_avg, price, value_score, action_canonical, manual_status, is_available, is_bye, games_played, player_name"
      )
      .not("team", "is", null);

    if (targetTeam) {
      query = query.eq("team", targetTeam);
    }

    const { data: allPlayers, error: playersError } = await query;

    if (playersError) {
      throw new Error(`Failed to fetch player data: ${playersError.message}`);
    }

    if (!allPlayers || allPlayers.length === 0) {
      return new Response(
        JSON.stringify({ message: "No player data found", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch current round number ─────────────────────────────────────────
    const { data: roundData } = await supabase
      .rpc("get_latest_completed_round", { p_season: 2026 });
    const currentRound: number = (roundData as number | null) ?? 1;

    // ── Group players by team ─────────────────────────────────────────────
    const teamMap = new Map<string, typeof allPlayers>();
    for (const p of allPlayers) {
      if (!p.team) continue;
      if (!teamMap.has(p.team)) teamMap.set(p.team, []);
      teamMap.get(p.team)!.push(p);
    }

    // ── Try to get opponent data ──────────────────────────────────────────
    const { data: matchRows } = await supabase
      .schema("afl" as any)
      .from("v_ai_team_openai_inputs_2026_next_round")
      .select("team, opponent, round_number")
      .limit(36);

    const opponentMap = new Map<string, { opponent: string | null; round_number: number }>();
    for (const row of matchRows ?? []) {
      opponentMap.set(row.team, {
        opponent: row.opponent ?? null,
        round_number: row.round_number ?? currentRound,
      });
    }

    // ── Build payload and process each team ───────────────────────────────
    const teams = Array.from(teamMap.keys()).sort();
    const toProcess = teams.filter(team => {
      const matchInfo = opponentMap.get(team);
      const roundNum = matchInfo?.round_number ?? currentRound;
      const key = `${team}__${roundNum}`;
      return !freshSet.has(key);
    });

    const skipped = teams.length - toProcess.length;

    const systemPrompt = buildSystemPrompt();

    const results = await Promise.allSettled(
      toProcess.map(async (team) => {
        const players = teamMap.get(team)!;
        const matchInfo = opponentMap.get(team);
        const roundNum = matchInfo?.round_number ?? currentRound;

        const projValues = players.map(p => Number(p.projection) || 0).filter(v => v > 0);
        const topProj = projValues.length ? Math.max(...projValues) : 0;
        const avgProj = projValues.length
          ? Math.round(projValues.reduce((a, b) => a + b, 0) / projValues.length)
          : 0;
        const seasonAvgs = players.map(p => Number(p.season_avg) || 0).filter(v => v > 0);
        const avgSeasonAvg = seasonAvgs.length
          ? Math.round(seasonAvgs.reduce((a, b) => a + b, 0) / seasonAvgs.length)
          : 0;

        const topPlayerByProj = [...players].sort((a, b) => (Number(b.projection) || 0) - (Number(a.projection) || 0))[0];

        const startCount = players.filter(p => {
          const ac = (p.action_canonical ?? "").toUpperCase();
          return ac === "START" || ac === "SMASH_START";
        }).length;
        const sitCount = players.filter(p => {
          const ac = (p.action_canonical ?? "").toUpperCase();
          return ac === "SIT" || ac === "HARD_SIT";
        }).length;
        const holdCount = players.length - startCount - sitCount;

        const PREMIUM_FLOOR = 700000;
        const premiumPlayers = players.filter(p => (Number(p.price) || 0) >= PREMIUM_FLOOR);
        const premiumAvgProj = premiumPlayers.length
          ? Math.round(premiumPlayers.reduce((s, p) => s + (Number(p.projection) || 0), 0) / premiumPlayers.length)
          : 0;

        const valueCount = players.filter(p => (Number(p.value_score) || 0) >= 6).length;
        const avoidCount = players.filter(p => {
          const ac = (p.action_canonical ?? "").toUpperCase();
          const isInjured = p.manual_status === "injured" || p.is_available === false;
          return ac === "HARD_SIT" || isInjured || p.is_bye;
        }).length;

        const posCount = (pg: string) =>
          players.filter(p => (p.position_group ?? "").toUpperCase().includes(pg)).length;

        const payload: TeamPayload = {
          team,
          opponent: matchInfo?.opponent ?? null,
          round_number: roundNum,
          squad_size: players.length,
          top_projection: Math.round(topProj),
          avg_projection: avgProj,
          avg_season_avg: avgSeasonAvg,
          start_count: startCount,
          hold_count: holdCount,
          sit_count: sitCount,
          premium_count: premiumPlayers.length,
          premium_avg_proj: premiumAvgProj,
          value_count: valueCount,
          avoid_count: avoidCount,
          mid_count: posCount("MID"),
          def_count: posCount("DEF"),
          fwd_count: posCount("FWD"),
          ruc_count: posCount("RUC"),
          top_player_name: topPlayerByProj?.player_name ?? null,
          top_player_price: topPlayerByProj?.price != null ? Number(topPlayerByProj.price) : null,
        };

        const userPrompt = buildUserPrompt(payload);

        const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.35,
            max_tokens: 600,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });

        if (!openaiRes.ok) {
          const errText = await openaiRes.text();
          throw new Error(`OpenAI error for ${team}: ${errText}`);
        }

        const openaiData = await openaiRes.json();
        const rawContent: string = openaiData.choices?.[0]?.message?.content ?? "";

        // ── Validation ──────────────────────────────────────────────────
        const banned = checkBanned(rawContent);
        if (banned.length > 0) {
          console.warn(`[TeamAI] ${team}: banned phrases detected: ${banned.join(", ")} — saving with flag`);
        }

        const sentences = rawContent.split(/[.!?]+/).filter(s => s.trim().length > 10);
        if (sentences.length < 4) {
          throw new Error(`[TeamAI] ${team}: output too short (${sentences.length} sentences)`);
        }

        // ── Extract profile verdict line ─────────────────────────────────
        const lines = rawContent.split("\n").map((l: string) => l.trim()).filter(Boolean);
        const verdictLine = lines.find((l: string) =>
          l.startsWith("Deep scoring squad") ||
          l.startsWith("Strong scoring squad") ||
          l.startsWith("Balanced scoring squad") ||
          l.startsWith("Thin scoring depth") ||
          l.startsWith("Volatile scoring output") ||
          l.startsWith("Risk-heavy squad")
        );

        let fantasy_verdict: string | null = null;
        let summary = rawContent.trim();

        if (verdictLine) {
          fantasy_verdict = verdictLine;
          summary = lines
            .filter((l: string) => l !== verdictLine)
            .join(" ")
            .trim();
        }

        const { error: upsertError } = await supabase
          .schema("afl" as any)
          .from("ai_team_summaries")
          .upsert(
            {
              team,
              season: 2026,
              round_number: roundNum,
              summary,
              fantasy_verdict,
              updated_at: new Date().toISOString(),
              prompt_version: PROMPT_VERSION,
            },
            { onConflict: "team,season,round_number" }
          );

        if (upsertError) {
          throw new Error(`Upsert error for ${team}: ${upsertError.message}`);
        }

        return team;
      })
    );

    const processed = results.filter(r => r.status === "fulfilled").length;
    const errors = results.filter(r => r.status === "rejected").length;

    for (const r of results) {
      if (r.status === "rejected") {
        console.error("[TeamAI] error:", r.reason);
      }
    }

    return new Response(
      JSON.stringify({
        message: "generate-team-ai-summaries complete",
        prompt_version: PROMPT_VERSION,
        processed,
        skipped,
        errors,
        execution_started: executionStarted,
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
