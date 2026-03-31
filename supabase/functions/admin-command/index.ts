import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://www.neekostats.com.au",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function ok(result: unknown) {
  return new Response(JSON.stringify({ ok: true, result }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "") ?? "";

    if (!token) {
      return err("Unauthorized", 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let isAdmin = token === supabaseServiceKey;

    if (!isAdmin) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) {
        return err("Unauthorized", 401);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      isAdmin = profile?.is_admin === true;
    }

    if (!isAdmin) {
      return err("Forbidden: admin access required", 403);
    }

    const body = await req.json();
    const { command, payload } = body;

    if (command === "ingest_prices") {
      const { data, error } = await supabase.rpc("admin_update_fantasy_prices", {
        price_rows: payload.price_rows,
        p_round: payload.round ?? null,
      });
      if (error) throw error;
      return ok(data);

    } else if (command === "preview_prices") {
      const { data, error } = await supabase.rpc("preview_price_ingest_public", {
        p_rows: payload.rows,
      });
      if (error) throw error;
      return ok(data);

    } else if (command === "process_prices") {
      const { data, error } = await supabase.rpc("process_price_ingest_public", {
        p_rows: payload.rows,
      });
      if (error) throw error;
      return ok(data);

    } else if (command === "toggle_bye") {
      const { data, error } = await supabase.rpc("admin_toggle_team_bye", payload);
      if (error) throw error;
      return ok(data);

    } else if (command === "update_bye") {
      const { data, error } = await supabase.rpc("admin_update_team_bye", payload);
      if (error) throw error;
      return ok(data);

    } else if (command === "run_pipeline") {
      const { data, error } = await supabase.rpc("run_neeko_pipeline");
      if (error) throw error;
      return ok(data);

    } else if (command === "update_player_status") {
      const { player_id, status } = payload;
      if (!player_id) return err("Missing player_id");
      const { data, error: updateError } = await supabase.rpc("admin_update_player_status", {
        p_player_id: player_id,
        p_status: status ?? null,
      });
      if (updateError) throw updateError;
      return ok(data);

    } else if (command === "commit_price_ingest") {
      const { season, round, rows } = payload;
      if (!season || round === undefined || round === null || !rows) {
        return err("Missing required fields: season, round, rows");
      }
      console.log(`[commit_price_ingest] season=${season} round=${round} rows=${rows.length}`);
      const aflClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        db: { schema: "afl" },
      });
      const { data, error } = await aflClient.rpc("commit_price_round", {
        p_season: season,
        p_round: round,
        p_rows: rows,
      });
      if (error) {
        console.error("[commit_price_ingest] RPC error:", error);
        return err(`commit_price_round failed: ${error.message}`, 500);
      }
      console.log("[commit_price_ingest] result:", data);
      return ok(data);

    } else if (command === "save_player_name_mapping") {
      const { source_name, player_id } = payload;
      if (!source_name || !player_id) return err("Missing source_name or player_id");
      const { data, error } = await supabase.rpc("save_player_name_mapping", {
        p_source_name: source_name,
        p_player_id: player_id,
      });
      if (error) throw error;
      return ok(data);

    } else if (command === "lookup_player_name_mappings") {
      const { source_names } = payload;
      if (!source_names || !Array.isArray(source_names)) return err("Missing source_names array");
      const { data, error } = await supabase.rpc("lookup_player_name_mappings", {
        p_source_names: source_names,
      });
      if (error) throw error;
      return ok(data);

    } else if (command === "save_pending_players") {
      const { rows } = payload;
      if (!rows) return err("Missing rows");
      let saved = 0;
      for (const row of rows) {
        if (!row.source_name) continue;
        const { error } = await supabase
          .schema("afl" as never)
          .from("unmatched_player_names" as never)
          .upsert({
            source_name: row.source_name,
            normalized_source_name: row.source_name.toLowerCase().trim().replace(/[^a-z0-9\s]/g, ""),
            example_price: row.cleaned_price ?? null,
            resolved: false,
          } as never, { onConflict: "normalized_source_name" } as never);
        if (!error) saved++;
      }
      return ok({ saved, total: rows.length });

    } else if (command === "resolve_player_name") {
      const { normalized_name, player_id } = payload;
      if (!normalized_name || !player_id) return err("Missing normalized_name or player_id");
      const { data, error } = await supabase.rpc("resolve_player_name", {
        p_normalized_name: normalized_name,
        p_player_id: player_id,
      });
      if (error) throw error;
      return ok(data);

    } else if (command === "set_price_round_lock") {
      const { season, round, locked } = payload;
      if (season === undefined || round === undefined || locked === undefined) {
        return err("Missing season, round, or locked");
      }
      const { error } = await supabase
        .schema("afl" as never)
        .from("price_rounds" as never)
        .update({ is_locked: locked } as never)
        .eq("season" as never, season)
        .eq("round" as never, round);
      if (error) throw error;
      return ok({ season, round, locked });

    } else {
      return err(`Unknown command: ${command}`);
    }

  } catch (e) {
    console.error("ADMIN COMMAND ERROR:", e);
    const msg = e instanceof Error ? e.message : "Request failed";
    return err(msg, 500);
  }
});
