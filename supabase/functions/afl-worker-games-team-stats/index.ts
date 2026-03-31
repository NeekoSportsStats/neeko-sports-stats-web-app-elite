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
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiBase     = Deno.env.get("AFL_API_BASE_URL")!;
    const apiKey      = Deno.env.get("AFL_API_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token || token !== serviceKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = createClient(supabaseUrl, serviceKey);

    const body        = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const season      = body.season       ?? 2026;
    const roundNumber = body.round_number ?? null;

    console.log(`[team-stats] season=${season} round_number=${roundNumber ?? "ALL"}`);

    const apiHeaders = {
      "x-apisports-key": apiKey,
      "Content-Type": "application/json",
    };

    // ── Load all 18 teams from teams_raw (IDs are stable across seasons) ──────
    const { data: teamsRaw, error: teamsErr } = await db
      .schema("afl")
      .from("teams_raw")
      .select("vendor_team_id, raw")
      .eq("season", 2025);

    if (teamsErr) throw new Error(`Failed to load teams_raw: ${teamsErr.message}`);

    const teams = (teamsRaw ?? []).map((t) => ({
      id:   t.vendor_team_id as number,
      name: (t.raw as Record<string, string>)?.name ?? String(t.vendor_team_id),
    }));

    console.log(`[team-stats] Processing ${teams.length} teams`);

    // ── Also load completed games for this round from raw_2026_matches ─────────
    // Used to get per-round opponent / venue / result context
    let matchQuery = db
      .schema("afl")
      .from("raw_2026_matches")
      .select("match_id, round_number, home_team, away_team, venue, home_score, away_score, status")
      .eq("season", season)
      .eq("status", "FT");

    if (roundNumber !== null) {
      matchQuery = matchQuery.eq("round_number", roundNumber);
    }

    const { data: completedMatches } = await matchQuery;

    // Build lookup: team name → list of match contexts for this round
    const teamMatchContext: Record<string, { match_id: string; round_number: number; opponent: string; venue: string; is_home: boolean; score: number; opponent_score: number }[]> = {};

    for (const m of completedMatches ?? []) {
      const roundNum = m.round_number as number;
      const matchId  = m.match_id as string;
      const venue    = m.venue as string ?? "";

      const homeEntry = {
        match_id:       matchId,
        round_number:   roundNum,
        opponent:       m.away_team as string,
        venue,
        is_home:        true,
        score:          m.home_score as number ?? 0,
        opponent_score: m.away_score as number ?? 0,
      };
      const awayEntry = {
        match_id:       matchId,
        round_number:   roundNum,
        opponent:       m.home_team as string,
        venue,
        is_home:        false,
        score:          m.away_score as number ?? 0,
        opponent_score: m.home_score as number ?? 0,
      };

      if (!teamMatchContext[m.home_team as string]) teamMatchContext[m.home_team as string] = [];
      if (!teamMatchContext[m.away_team as string]) teamMatchContext[m.away_team as string] = [];
      teamMatchContext[m.home_team as string].push(homeEntry);
      teamMatchContext[m.away_team as string].push(awayEntry);
    }

    let totalUpserted = 0;
    let totalErrors   = 0;
    const teamResults: { team_id: number; team: string; rows: number; error?: string }[] = [];

    // ── Fetch season stats once per team: /teams/statistics?id={team_id}&season={season} ──
    for (const team of teams) {
      try {
        const url = `${apiBase}/teams/statistics?id=${team.id}&season=${season}`;
        console.log(`[team-stats] Fetching team_id=${team.id} (${team.name}): ${url}`);

        const apiRes = await fetch(url, { headers: apiHeaders });

        if (!apiRes.ok) {
          console.error(`[team-stats] API error for team ${team.id}: HTTP ${apiRes.status}`);
          totalErrors++;
          teamResults.push({ team_id: team.id, team: team.name, rows: 0, error: `HTTP ${apiRes.status}` });
          continue;
        }

        const payload  = await apiRes.json();
        const response = payload?.response ?? null;

        if (!response) {
          console.warn(`[team-stats] No stats returned for team ${team.id}`);
          teamResults.push({ team_id: team.id, team: team.name, rows: 0 });
          continue;
        }

        // Season-level stats from /teams/statistics response
        const stats = response?.statistics ?? response ?? {};

        // Build one row per completed match context for this team this round
        const matchContexts = teamMatchContext[team.name] ?? [];

        if (matchContexts.length === 0) {
          // No completed match for this team this round — skip (season stats only useful when we have round context)
          teamResults.push({ team_id: team.id, team: team.name, rows: 0 });
          continue;
        }

        const rows: Record<string, unknown>[] = [];

        for (const ctx of matchContexts) {
          const result =
            ctx.score > ctx.opponent_score ? "W" :
            ctx.score < ctx.opponent_score ? "L" : "D";

          rows.push({
            season,
            round_number: ctx.round_number,
            match_id:     ctx.match_id,
            team:         team.name,
            opponent:     ctx.opponent,
            venue:        ctx.venue,
            is_home:      ctx.is_home,
            score:        ctx.score,
            goals:        Math.floor(ctx.score / 6),
            behinds:      ctx.score % 6,
            disposals:    stats?.disposals?.total     ?? stats?.disposals    ?? 0,
            kicks:        stats?.kicks?.total         ?? stats?.kicks        ?? 0,
            handballs:    stats?.handballs?.total     ?? stats?.handballs    ?? 0,
            marks:        stats?.marks?.total         ?? stats?.marks        ?? 0,
            tackles:      stats?.tackles?.total       ?? stats?.tackles      ?? 0,
            hitouts:      stats?.hitouts?.total       ?? stats?.hitouts      ?? 0,
            result,
            api_payload:  response,
            source_tag:   "api-sports-v1",
          });
        }

        if (rows.length > 0) {
          const { error: upsertError } = await db
            .schema("afl")
            .from("raw_2026_team_stats")
            .upsert(rows, {
              onConflict: "season,round_number,team",
              ignoreDuplicates: false,
            });

          if (upsertError) {
            console.error(`[team-stats] Upsert error for team ${team.name}: ${upsertError.message}`);
            totalErrors++;
            teamResults.push({ team_id: team.id, team: team.name, rows: rows.length, error: upsertError.message });
          } else {
            totalUpserted += rows.length;
            teamResults.push({ team_id: team.id, team: team.name, rows: rows.length });
            console.log(`[team-stats] team=${team.name} upserted ${rows.length} rows`);
          }
        } else {
          teamResults.push({ team_id: team.id, team: team.name, rows: 0 });
        }

      } catch (teamErr) {
        const msg = teamErr instanceof Error ? teamErr.message : String(teamErr);
        console.error(`[team-stats] Exception for team ${team.id}: ${msg}`);
        totalErrors++;
        teamResults.push({ team_id: team.id, team: team.name, rows: 0, error: msg });
      }
    }

    return new Response(
      JSON.stringify({
        ok:              totalErrors === 0,
        season,
        round_number:    roundNumber,
        teams_processed: teams.length,
        rows_upserted:   totalUpserted,
        errors:          totalErrors,
        teams:           teamResults,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[team-stats] Fatal: ${msg}`);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
