/**
 * Hook to load, cache, and manage player availability records for the social planner.
 *
 * Data source: social_player_availability table (admin-managed, per round).
 * Falls back to empty (all unknown) when no data exists.
 */
import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type {
  PlayerAvailabilityRecord,
  PlayerAvailabilityStatus,
  AFLPlayerStat,
  PlannerSettings,
} from "../types";
import { EXCLUDED_STATUSES, WARNING_STATUSES } from "../types";

// ─── DB row type ──────────────────────────────────────────────────────────────

interface DbAvailabilityRow {
  id: string;
  season: number;
  round: number;
  player_id: string | null;
  player_name: string;
  team: string | null;
  status: string;
  reason: string | null;
  expected_to_play: boolean;
  source: string;
  updated_at: string;
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/** Build a lookup map keyed by normalised player name (lowercase) */
function buildLookup(records: PlayerAvailabilityRecord[]): Map<string, PlayerAvailabilityRecord> {
  const map = new Map<string, PlayerAvailabilityRecord>();
  for (const rec of records) {
    map.set(rec.playerName.toLowerCase(), rec);
    if (rec.playerId) map.set(rec.playerId, rec);
  }
  return map;
}

/** Find availability record for a player stat row */
export function lookupAvailability(
  player: { playerId: string; playerName: string },
  lookup: Map<string, PlayerAvailabilityRecord>
): PlayerAvailabilityRecord | undefined {
  return lookup.get(player.playerId) ?? lookup.get(player.playerName.toLowerCase());
}

/** Derive the effective status for a player (manual override wins) */
export function effectiveStatus(
  player: AFLPlayerStat,
  lookup: Map<string, PlayerAvailabilityRecord>
): PlayerAvailabilityStatus {
  if (player.manualAvailabilityOverride) return player.manualAvailabilityOverride;
  const rec = lookupAvailability(player, lookup);
  if (!rec) return player.availabilityStatus ?? "unknown";
  return rec.status as PlayerAvailabilityStatus;
}

/** Return true if the player should be excluded given the settings */
export function shouldExcludePlayer(
  status: PlayerAvailabilityStatus,
  settings: PlannerSettings,
  isManualOverride: boolean
): boolean {
  if (isManualOverride) return false; // admin explicitly included
  if (settings.availabilityFilterMode === "manual") return false;

  if (status === "injured"   && settings.excludeInjured)   return true;
  if (status === "suspended" && settings.excludeSuspended) return true;
  if (status === "omitted"   && settings.excludeOmitted)   return true;
  if (status === "managed"   && settings.excludeManaged)   return true;
  if (status === "inactive"  && settings.excludeInactive)  return true;

  if (settings.availabilityFilterMode === "strict") {
    // strict: only allow "available"
    return status !== "available";
  }

  // balanced: allow available + unknown + test with warnings; exclude doubtful from auto
  if (status === "doubtful" && settings.excludeDoubtfulFromAuto) return true;

  return false;
}

/** Return true if the player should show a warning badge */
export function isAvailabilityWarning(status: PlayerAvailabilityStatus): boolean {
  return WARNING_STATUSES.has(status);
}

/** Return true if the player is definitely excluded */
export function isExcludedStatus(status: PlayerAvailabilityStatus): boolean {
  return EXCLUDED_STATUSES.has(status);
}

// ─── Attach availability to player stats ─────────────────────────────────────

export function attachAvailability(
  players: AFLPlayerStat[],
  lookup: Map<string, PlayerAvailabilityRecord>
): AFLPlayerStat[] {
  return players.map(p => {
    const rec = lookupAvailability(p, lookup);
    if (!rec) return { ...p, availabilityStatus: p.availabilityStatus ?? "unknown" };
    return {
      ...p,
      availabilityStatus: rec.status as PlayerAvailabilityStatus,
      availabilityReason: rec.reason ?? undefined,
      expectedToPlay: rec.expectedToPlay,
    };
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UsePlayerAvailabilityReturn {
  records: PlayerAvailabilityRecord[];
  lookup: Map<string, PlayerAvailabilityRecord>;
  isLoading: boolean;
  error: string | null;
  injuredCount: number;
  suspendedCount: number;
  doubtfulCount: number;
  unknownCount: number;
  fetchAvailability: (round: number, season: number) => Promise<void>;
  upsertRecord: (record: Omit<PlayerAvailabilityRecord, "id">) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
}

export function usePlayerAvailability(): UsePlayerAvailabilityReturn {
  const [records, setRecords] = useState<PlayerAvailabilityRecord[]>([]);
  const [lookup, setLookup] = useState<Map<string, PlayerAvailabilityRecord>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAvailability = useCallback(async (round: number, season: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from("social_player_availability")
        .select("*")
        .eq("season", season)
        .eq("round", round)
        .order("player_name");

      if (dbError) throw dbError;

      const rows: PlayerAvailabilityRecord[] = (data as DbAvailabilityRow[] ?? []).map(r => ({
        id: r.id,
        season: r.season,
        round: r.round,
        playerId: r.player_id ?? undefined,
        playerName: r.player_name,
        team: r.team ?? undefined,
        status: r.status as PlayerAvailabilityStatus,
        reason: r.reason ?? undefined,
        expectedToPlay: r.expected_to_play,
        source: r.source,
        updatedAt: r.updated_at,
      }));

      setRecords(rows);
      setLookup(buildLookup(rows));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load availability data");
      setRecords([]);
      setLookup(new Map());
    } finally {
      setIsLoading(false);
    }
  }, []);

  const upsertRecord = useCallback(async (record: Omit<PlayerAvailabilityRecord, "id">) => {
    const { error: dbError } = await supabase
      .from("social_player_availability")
      .upsert({
        season: record.season,
        round: record.round,
        player_id: record.playerId ?? null,
        player_name: record.playerName,
        team: record.team ?? null,
        status: record.status,
        reason: record.reason ?? null,
        expected_to_play: record.expectedToPlay,
        source: record.source,
        updated_at: new Date().toISOString(),
      }, { onConflict: "player_name,season,round" });

    if (dbError) throw dbError;
    await fetchAvailability(record.round, record.season);
  }, [fetchAvailability]);

  const deleteRecord = useCallback(async (id: string) => {
    const rec = records.find(r => r.id === id);
    const { error: dbError } = await supabase
      .from("social_player_availability")
      .delete()
      .eq("id", id);

    if (dbError) throw dbError;
    if (rec) await fetchAvailability(rec.round, rec.season);
  }, [records, fetchAvailability]);

  const injuredCount   = records.filter(r => r.status === "injured").length;
  const suspendedCount = records.filter(r => r.status === "suspended").length;
  const doubtfulCount  = records.filter(r => r.status === "doubtful").length;
  const unknownCount   = records.filter(r => r.status === "unknown").length;

  return {
    records,
    lookup,
    isLoading,
    error,
    injuredCount,
    suspendedCount,
    doubtfulCount,
    unknownCount,
    fetchAvailability,
    upsertRecord,
    deleteRecord,
  };
}
