import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://www.neekostats.com.au",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function timingSafeCompare(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  return crypto.subtle.timingSafeEqual(ab, bb);
}

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
    if (!token || !timingSafeCompare(token, serviceKey)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = createClient(supabaseUrl, serviceKey);

    const body         = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const season       = body.season       ?? 2026;
    const weekFilter   = body.round_number ?? null;

    const apiHeaders = {
      "x-apisports-key": apiKey,
      "Content-Type": "application/json",
    };

    // ── Fetch ALL games for the season — provider does not support filtering by week/round ──
    const apiUrl = `${apiBase}/games?league=1&season=${season}`;
    console.log(`[master-dispatcher] API call: ${apiUrl}`);
    console.log(`[master-dispatcher] season=${season} week_filter=${weekFilter ?? "ALL"}`);

    const apiRes = await fetch(apiUrl, {
      headers: apiHeaders,
      signal: AbortSignal.timeout(25000),
    });

    if (!apiRes.ok) {
      throw new Error(`Provider API error: HTTP ${apiRes.status}`);
    }

    const payload  = await apiRes.json();
    const allGames = payload?.response ?? [];

    console.log(`[master-dispatcher] Games fetched: ${allGames.length}`);

    if (allGames.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, season, week_filter: weekFilter, message: "No games returned from provider", rows_upserted: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Filter to requested week locally (week is top-level field on each game) ──
    const weekGames = weekFilter !== null
      ? allGames.filter((g: Record<string, unknown>) => Number(g.week) === Number(weekFilter))
      : allGames;

    const completedGames = weekGames.filter(
      (g: Record<string, unknown>) => (g?.status as Record<string, unknown>)?.short === "FT"
    );

    console.log(`[master-dispatcher] Week filter: ${weekFilter ?? "ALL"}`);
    console.log(`[master-dispatcher] Week games: ${weekGames.length}`);
    console.log(`[master-dispatcher] Completed games: ${completedGames.length}`);

    // ── Upsert ALL week games into raw_2026_matches (not just completed) ──────
    const matchRows: Record<string, unknown>[] = [];

    for (const g of weekGames) {
      const gameId    = (g?.game as Record<string, unknown>)?.id as number;
      const week      = Number(g.week ?? 0);
      const homeTeam  = ((g?.teams as Record<string, unknown>)?.home as Record<string, unknown>)?.name as string ?? "";
      const awayTeam  = ((g?.teams as Record<string, unknown>)?.away as Record<string, unknown>)?.name as string ?? "";
      const homeId    = ((g?.teams as Record<string, unknown>)?.home as Record<string, unknown>)?.id as number ?? null;
      const awayId    = ((g?.teams as Record<string, unknown>)?.away as Record<string, unknown>)?.id as number ?? null;
      const venue     = (g?.game as Record<string, unknown>)?.venue as string ?? null;
      const dateStr   = (g?.game as Record<string, unknown>)?.date as string ?? null;
      const statusShort = (g?.status as Record<string, unknown>)?.short as string ?? "NS";

      const internalStatus =
        statusShort === "FT"   ? "FT"   :
        statusShort === "LIVE" ? "Live" :
        "Not Started";

      // Provider field is scores.home.score / scores.away.score
      const homeScore   = ((g?.scores as Record<string, unknown>)?.home  as Record<string, unknown>)?.score   as number ?? 0;
      const awayScore   = ((g?.scores as Record<string, unknown>)?.away  as Record<string, unknown>)?.score   as number ?? 0;
      const homeGoals   = ((g?.scores as Record<string, unknown>)?.home  as Record<string, unknown>)?.goals   as number ?? 0;
      const awayGoals   = ((g?.scores as Record<string, unknown>)?.away  as Record<string, unknown>)?.goals   as number ?? 0;
      const homeBehinds = ((g?.scores as Record<string, unknown>)?.home  as Record<string, unknown>)?.behinds as number ?? 0;
      const awayBehinds = ((g?.scores as Record<string, unknown>)?.away  as Record<string, unknown>)?.behinds as number ?? 0;

      matchRows.push({
        season,
        round_number: week,
        match_id:     String(gameId),
        home_team:    homeTeam,
        away_team:    awayTeam,
        venue,
        match_date:   dateStr,
        status:       internalStatus,
        home_score:   homeScore,
        away_score:   awayScore,
        home_goals:   homeGoals,
        home_behinds: homeBehinds,
        away_goals:   awayGoals,
        away_behinds: awayBehinds,
        api_payload:  g,
        source_tag:   "api-sports-v1",
      });
    }

    const { error: upsertError } = await db
      .schema("afl")
      .from("raw_2026_matches")
      .upsert(matchRows, {
        onConflict: "season,round_number,match_id",
        ignoreDuplicates: false,
      });

    if (upsertError) {
      throw new Error(`raw_2026_matches upsert failed: ${upsertError.message}`);
    }

    console.log(`[master-dispatcher] Upserted ${matchRows.length} match rows into raw_2026_matches`);

    // ── Sync completed scores back to match_center_games_base ─────────────────
    let scoresUpdated = 0;
    for (const g of completedGames) {
      const gameId      = (g?.game as Record<string, unknown>)?.id as number;
      const homeScore   = ((g?.scores as Record<string, unknown>)?.home  as Record<string, unknown>)?.score   as number ?? 0;
      const awayScore   = ((g?.scores as Record<string, unknown>)?.away  as Record<string, unknown>)?.score   as number ?? 0;
      const homeGoals   = ((g?.scores as Record<string, unknown>)?.home  as Record<string, unknown>)?.goals   as number ?? 0;
      const awayGoals   = ((g?.scores as Record<string, unknown>)?.away  as Record<string, unknown>)?.goals   as number ?? 0;
      const homeBehinds = ((g?.scores as Record<string, unknown>)?.home  as Record<string, unknown>)?.behinds as number ?? 0;
      const awayBehinds = ((g?.scores as Record<string, unknown>)?.away  as Record<string, unknown>)?.behinds as number ?? 0;

      const { error: updateErr } = await db
        .schema("afl")
        .from("match_center_games_base")
        .update({
          status:       "FT",
          home_score:   homeScore,
          away_score:   awayScore,
          home_goals:   homeGoals,
          home_behinds: homeBehinds,
          away_goals:   awayGoals,
          away_behinds: awayBehinds,
          updated_at:   new Date().toISOString(),
        })
        .eq("match_id", gameId)
        .eq("season", season);

      if (!updateErr) scoresUpdated++;
    }

    console.log(`[master-dispatcher] Synced ${scoresUpdated} FT scores to match_center_games_base`);

    return new Response(
      JSON.stringify({
        ok:              true,
        season,
        week_filter:     weekFilter,
        games_fetched:   allGames.length,
        week_games:      weekGames.length,
        completed_games: completedGames.length,
        rows_upserted:   matchRows.length,
        scores_synced:   scoresUpdated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[master-dispatcher] Fatal: ${msg}`);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
