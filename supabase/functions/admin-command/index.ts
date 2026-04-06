import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://www.neekostats.com.au",
  "https://neekostats.com.au",
  "http://localhost:5173",
  "http://localhost:3000",
]);

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://www.neekostats.com.au";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

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

    } else if (command === "validate_price_ingest") {
      const { season, round, rows } = payload;
      if (!season || round === undefined || round === null || !rows) {
        return err("Missing required fields: season, round, rows");
      }
      const { data, error } = await supabase.rpc("validate_price_ingest_rows", {
        p_season: season,
        p_round: round,
        p_rows: rows,
      });
      if (error) throw error;
      return ok(data);

    } else if (command === "commit_price_ingest") {
      const { season, round, rows, session_id } = payload;
      if (!season || round === undefined || round === null || !rows) {
        return err("Missing required fields: season, round, rows");
      }
      if (!Array.isArray(rows) || rows.length === 0) {
        return err("rows must be a non-empty array");
      }

      // Step 1: Filter out null player_id rows and log them
      const nullIdRows = rows.filter((r: Record<string, unknown>) => r.player_id == null);
      const validRows = rows.filter((r: Record<string, unknown>) => r.player_id != null && (r.cleaned_price as number) > 0);

      if (nullIdRows.length > 0) {
        console.warn(
          `[commit_price_ingest] Skipping ${nullIdRows.length} rows with null player_id:`,
          nullIdRows.map((r: Record<string, unknown>) => ({
            source_name: r.source_name ?? "unknown",
            cleaned_price: r.cleaned_price,
          }))
        );
      }

      if (validRows.length === 0) {
        return err("No valid rows to commit — all rows are missing player_id or have zero price. Resolve unmatched players first.");
      }

      console.log(
        `[commit_price_ingest] season=${season} round=${round} total=${rows.length} valid=${validRows.length} skipped=${nullIdRows.length} session_id=${session_id ?? "none"}`
      );

      // Step 2: Attempt commit with valid rows only
      const { data, error } = await supabase.rpc("commit_price_round_with_session", {
        p_season: season,
        p_round: round,
        p_rows: validRows,
        p_session_id: session_id ?? null,
      });

      if (error) {
        console.error("[commit_price_ingest] RPC error:", {
          message: error.message,
          code: error.code,
          season,
          round,
          valid_rows: validRows.length,
          sample_row: validRows[0] ?? null,
        });
        const friendly = error.message.includes("locked")
          ? `Round ${round} is locked. Unlock it from the Round Control screen before committing.`
          : error.message.includes("not found")
          ? "One or more player IDs were not found in the database. Re-check your matches."
          : error.message.includes("duplicate")
          ? "Duplicate player detected in commit batch. Each player should appear only once."
          : `Commit failed: ${error.message}`;
        return err(friendly, 500);
      }

      if (data && !(data as Record<string, unknown>).ok) {
        const errMsg = (data as Record<string, unknown>).error as string ?? "Commit failed";
        console.error("[commit_price_ingest] logical error from RPC:", errMsg);
        return err(errMsg, 400);
      }

      console.log("[commit_price_ingest] committed successfully:", {
        ...(data as object),
        skipped_null_ids: nullIdRows.length,
      });

      EdgeRuntime.waitUntil(
        supabase.rpc("trigger_post_price_pipeline", {
          p_season: season,
          p_round: round,
        }).then(({ data: pData, error: pErr }) => {
          if (pErr) {
            console.error("[commit_price_ingest] background pipeline failed:", pErr.message);
          } else {
            console.log("[commit_price_ingest] background pipeline done:", JSON.stringify(pData));
          }
        })
      );

      return ok({
        ...(data as object),
        skipped_null_ids: nullIdRows.length,
        skipped_names: nullIdRows.map((r: Record<string, unknown>) => r.source_name ?? "unknown"),
        pipeline: "running_in_background",
      });

    } else if (command === "save_player_name_mapping") {
      const { source_name, player_id, match_method } = payload;
      if (!source_name || !player_id) {
        console.warn("[save_player_name_mapping] missing params:", { source_name, player_id });
        return err("Missing source_name or player_id");
      }
      console.log(`[save_player_name_mapping] source="${source_name}" player_id=${player_id} method=${match_method ?? "manual"}`);
      const { data, error } = await supabase.rpc("save_player_name_mapping", {
        p_source_name: source_name,
        p_player_id: player_id,
        p_match_method: match_method ?? "manual",
      });
      if (error) {
        console.error("[save_player_name_mapping] RPC error:", error.message, { source_name, player_id });
        throw error;
      }
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
      const { data, error } = await supabase.rpc("save_pending_players", {
        p_rows: rows,
      });
      if (error) throw error;
      return ok(data);

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

    } else if (command === "run_full_pipeline") {
      const { data, error } = await supabase.rpc("run_neeko_pipeline");
      if (error) throw error;
      return ok(data);

    } else if (command === "run_afl_processing") {
      const { data, error } = await supabase.rpc("run_afl_processing_core");
      if (error) throw error;
      return ok(data);

    } else if (command === "refresh_rankings") {
      const { data, error } = await supabase.rpc("populate_rankings_cache_from_source");
      if (error) throw error;
      return ok(data);

    } else if (command === "refresh_market_watch") {
      const { data, error } = await supabase.rpc("build_market_watch_snapshot");
      if (error) throw error;
      return ok(data);

    } else if (command === "refresh_edge_board") {
      const { data, error } = await supabase.rpc("fn_refresh_edge_board");
      if (error) throw error;
      return ok(data);

    } else if (command === "run_ai_worker") {
      const { data, error } = await supabase.rpc("fn_fire_ai_worker_wave_range", {
        p_limit_players: 75,
        p_player_id_gte: null,
        p_player_id_lt: null,
      });
      if (error) throw error;
      return ok(data);

    } else if (command === "enqueue_all_ai") {
      const { data, error } = await supabase.rpc("fn_enqueue_ranking_reco_jobs");
      if (error) throw error;
      return ok(data);

    } else if (command === "run_neeko_ai_pipeline") {
      const { data, error } = await supabase.rpc("run_neeko_ai_pipeline");
      if (error) throw error;
      return ok(data);

    } else if (command === "refresh_projections") {
      const { data, error } = await supabase.rpc("fn_refresh_projection_engine");
      if (error) throw error;
      return ok(data);

    } else if (command === "refresh_accuracy") {
      const { data, error } = await supabase.rpc("fn_refresh_projection_accuracy");
      if (error) throw error;
      return ok(data);

    } else if (command === "apply_fantasy_prices") {
      const { data, error } = await supabase.rpc("fn_apply_fantasy_prices");
      if (error) throw error;
      return ok(data);

    } else if (command === "run_ingestion") {
      const { data, error } = await supabase.rpc("run_afl_worker_ingestion");
      if (error) throw error;
      return ok(data);

    } else if (command === "backfill_fantasy_points") {
      const { data, error } = await supabase.rpc("fn_backfill_raw_fantasy_points");
      if (error) throw error;
      return ok(data);

    } else if (command === "clear_failed_ai_jobs") {
      const { error } = await supabase
        .from("ai_generation_queue")
        .delete()
        .eq("status", "failed");
      if (error) throw error;
      return ok({ message: "Cleared failed AI jobs" });

    } else if (command === "reset_stale_ai") {
      const { data, error } = await supabase.rpc("fn_mark_stale_ai_for_regen");
      if (error) throw error;
      return ok(data);

    } else if (command === "clear_start_sit_cache") {
      const { error } = await supabase
        .from("start_sit_cache")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
      return ok({ message: "Cleared start/sit cache" });

    } else if (command === "refresh_all_views") {
      await supabase.rpc("refresh_materialized_view", { view_name: "mv_player_projection" });
      await supabase.rpc("refresh_materialized_view", { view_name: "mv_edge_board" });
      return ok({ message: "Refreshed all materialized views" });

    } else if (command === "enqueue_reco_jobs") {
      const { data, error } = await supabase.rpc("fn_enqueue_ranking_reco_jobs");
      if (error) throw error;
      return ok(data);

    } else if (command === "generate_all_ai") {
      const { data, error } = await supabase.rpc("fn_fire_ai_worker_wave_range", {
        p_limit_players: 999,
        p_player_id_gte: null,
        p_player_id_lt: null,
      });
      if (error) throw error;
      return ok(data);

    } else if (command === "generate_market_watch_ai") {
      const { data, error } = await supabase.rpc("fn_generate_market_watch_summary");
      if (error) throw error;
      return ok(data);

    } else if (command === "generate_player_ai") {
      const { data, error } = await supabase.rpc("fn_fire_ai_worker_wave_range", {
        p_limit_players: 50,
        p_player_id_gte: null,
        p_player_id_lt: null,
      });
      if (error) throw error;
      return ok(data);

    } else if (command === "generate_ranking_ai") {
      const { data, error } = await supabase.rpc("fn_enqueue_ranking_reco_jobs");
      if (error) throw error;
      return ok(data);

    } else if (command === "ingest_player_stats") {
      const { data, error } = await supabase.rpc("fn_ingest_player_stats");
      if (error) throw error;
      return ok(data);

    } else if (command === "ingest_team_stats") {
      const { data, error } = await supabase.rpc("fn_ingest_team_stats");
      if (error) throw error;
      return ok(data);

    } else if (command === "rebuild_start_sit") {
      const { error: deleteError } = await supabase
        .from("start_sit_cache")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (deleteError) throw deleteError;
      return ok({ message: "Start/Sit cache cleared and ready for rebuild" });

    } else if (command === "run_ingest") {
      const { data, error } = await supabase.rpc("run_afl_worker_ingestion");
      if (error) throw error;
      return ok(data);

    } else {
      return err(`Unknown command: ${command}`);
    }

  } catch (e) {
    console.error("ADMIN COMMAND ERROR:", e);
    const msg = e instanceof Error ? e.message : "Request failed";
    return err(msg, 500);
  }
});
