import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { MappingRow, PriceRound, CommitResult, ValidationResult, IngestSession } from "./types";

async function callAdminCommand(command: string, payload: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-command`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ command, payload }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Command failed");
  return json.result;
}

export function usePlayerOptions() {
  const [players, setPlayers] = useState<Array<{ player_id: number; player_name: string; position_group: string | null }>>([]);

  useEffect(() => {
    supabase
      .schema("afl" as never)
      .from("players" as never)
      .select("player_id,player_name,position_group")
      .eq("active" as never, true)
      .order("player_name" as never)
      .limit(1500)
      .then(({ data }) => {
        if (data) setPlayers(data as typeof players);
      });
  }, []);

  return players;
}

export function usePriceRounds(season: number = 2026) {
  const [rounds, setRounds] = useState<PriceRound[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRounds = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc("get_price_rounds", { p_season: season });
    if (data) setRounds(data as PriceRound[]);
    setLoading(false);
  }, [season]);

  useEffect(() => { fetchRounds(); }, [fetchRounds]);

  const toggleLock = useCallback(async (round: number, locked: boolean): Promise<string | null> => {
    try {
      await callAdminCommand("set_price_round_lock", { season, round, locked });
      await fetchRounds();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Failed to update lock";
    }
  }, [season, fetchRounds]);

  return { rounds, loading, fetchRounds, toggleLock };
}

export function useCommitPrices() {
  const [committing, setCommitting] = useState(false);
  const [validating, setValidating] = useState(false);

  const validateRows = useCallback(async (
    rows: MappingRow[],
    season: number,
    round: number,
  ): Promise<{ result: ValidationResult | null; error: string | null }> => {
    setValidating(true);
    try {
      const payload = rows
        .filter(r => r.player_id !== null)
        .map(r => ({
          player_id: r.player_id,
          cleaned_price: r.cleaned_price,
          player_status: r.player_status ?? null,
          source_name: r.source_name,
        }));
      const result = await callAdminCommand("validate_price_ingest", { rows: payload, season, round });
      return { result: result as ValidationResult, error: null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "Validation failed" };
    } finally {
      setValidating(false);
    }
  }, []);

  const commitPrices = useCallback(async (
    rows: MappingRow[],
    season: number,
    round: number,
    sessionId?: string | null,
  ): Promise<{ result: CommitResult | null; error: string | null }> => {
    setCommitting(true);
    try {
      const payload = rows
        .filter(r => r.player_id !== null)
        .map(r => ({
          player_id: r.player_id,
          cleaned_price: r.cleaned_price,
          player_status: r.player_status ?? null,
        }));

      const result = await callAdminCommand("commit_price_ingest", {
        rows: payload,
        season,
        round,
        session_id: sessionId ?? null,
      });
      return { result: result as CommitResult, error: null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : "Commit failed" };
    } finally {
      setCommitting(false);
    }
  }, []);

  return { committing, validating, validateRows, commitPrices };
}

export function useSavePending() {
  const [saving, setSaving] = useState(false);

  const savePending = useCallback(async (
    rows: MappingRow[],
  ): Promise<{ saved: number; total: number } | null> => {
    setSaving(true);
    try {
      const payload = rows.map(r => ({
        source_name: r.source_name,
        manual_input_name: r.manual_input_name ?? null,
        cleaned_price: r.cleaned_price,
      }));
      const result = await callAdminCommand("save_pending_players", { rows: payload });
      return result as { saved: number; total: number };
    } catch {
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  return { saving, savePending };
}

export function useSaveMapping() {
  const saveMapping = useCallback(async (
    sourceName: string,
    playerId: number,
    matchMethod: string = "manual",
  ): Promise<void> => {
    try {
      await callAdminCommand("save_player_name_mapping", {
        source_name: sourceName,
        player_id: playerId,
        match_method: matchMethod,
      });
    } catch (e) {
      console.warn("[saveMapping] failed:", e instanceof Error ? e.message : e);
    }
  }, []);

  return { saveMapping };
}

export async function resolvePlayerName(
  normalizedName: string,
  playerId: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    await callAdminCommand("resolve_player_name", {
      normalized_name: normalizedName,
      player_id: playerId,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export interface PersistedMapping {
  source_name: string;
  player_id: number;
  player_name: string;
  confidence: number;
}

export async function lookupPersistedMappings(
  sourceNames: string[],
): Promise<PersistedMapping[]> {
  if (sourceNames.length === 0) return [];
  try {
    const { data, error } = await supabase.rpc("lookup_player_name_mappings", {
      p_source_names: sourceNames,
    });
    if (error || !data) return [];
    return data as PersistedMapping[];
  } catch {
    return [];
  }
}

export function usePersistedMappings(rows: MappingRow[]) {
  const [persistedMappings, setPersistedMappings] = useState<Map<string, PersistedMapping>>(new Map());

  const sourceNamesKey = useMemo(
    () => rows.map(r => r.source_name).sort().join("|"),
    [rows],
  );

  useEffect(() => {
    if (rows.length === 0) return;
    const sourceNames = rows.map(r => r.source_name);
    lookupPersistedMappings(sourceNames).then(results => {
      const index = new Map<string, PersistedMapping>();
      for (const m of results) {
        index.set(m.source_name.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " "), m);
      }
      setPersistedMappings(index);
    });
  }, [sourceNamesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return persistedMappings;
}

export function useIngestSessions() {
  const [sessions, setSessions] = useState<IngestSession[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.rpc("get_price_ingest_sessions", { p_limit: 10 });
      if (data) setSessions(data as IngestSession[]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { sessions, loading, fetchSessions };
}
