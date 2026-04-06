import type { PlayerOption, MappingRow, MatchStatus, MatchMethod } from "./types";
import type { PersistedMapping } from "./usePriceIngest";

export interface MatchResult {
  status: MatchStatus;
  method: MatchMethod | null;
  confidence: number;
  player_id: number | null;
  player_name: string | null;
  suggestions: PlayerOption[];
}

function normalizeName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/-/g, " ")
    .replace(/[^A-Z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForLookup(raw: string): string {
  return raw.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
}

interface ParsedName {
  initial: string;
  lastName: string;
  tokens: string[];
}

/**
 * Parses "F. Last" or "First Last" or "F Last" source formats.
 * Returns first initial + last name (handles double-barrelled surnames).
 */
export function parseName(sourceName: string): ParsedName | null {
  const norm = normalizeName(sourceName);
  const tokens = norm.split(" ").filter(Boolean);
  if (tokens.length < 2) return null;

  // Detect "F." initial-only format vs full first name
  const firstToken = tokens[0];
  const initial = firstToken.charAt(0);
  const lastNameTokens = tokens.slice(1);
  const lastName = lastNameTokens.join(" ");

  if (!initial || !lastName) return null;
  return { initial, lastName, tokens };
}

interface ParsedPlayerName {
  initial: string;
  lastName: string;
  tokens: string[];
  fullNorm: string;
}

const playerNameCache = new WeakMap<PlayerOption[], Map<number, ParsedPlayerName>>();

function getPlayerNameMap(players: PlayerOption[]): Map<number, ParsedPlayerName> {
  if (playerNameCache.has(players)) return playerNameCache.get(players)!;

  const map = new Map<number, ParsedPlayerName>();
  for (const p of players) {
    const norm = normalizeName(p.player_name);
    const tokens = norm.split(" ").filter(Boolean);
    if (tokens.length < 2) continue;
    const initial = tokens[0].charAt(0);
    const lastName = tokens.slice(1).join(" ");
    map.set(p.player_id, { initial, lastName, tokens, fullNorm: norm });
  }
  playerNameCache.set(players, map);
  return map;
}

export function buildMappingIndex(mappings: PersistedMapping[]): Map<string, PersistedMapping> {
  const index = new Map<string, PersistedMapping>();
  for (const m of mappings) {
    index.set(normalizeForLookup(m.source_name), m);
  }
  return index;
}

/**
 * Matches a source name to a player from the local player list.
 *
 * Priority order:
 * 1. Persisted memory (exact normalized match)
 * 2. Exact last_name + initial match (unique)
 * 3. Exact last_name + initial match (multiple → suggested)
 * 4. Exact last_name only (single or multiple → suggested)
 * 5. Partial last_name prefix (with or without initial match)
 * 6. pending_player_record (no candidates found)
 */
export function matchPlayer(
  sourceName: string,
  players: PlayerOption[],
  persistedMappings?: Map<string, PersistedMapping>,
): MatchResult {
  // 1. Persisted memory — highest priority
  if (persistedMappings && persistedMappings.size > 0) {
    const key = normalizeForLookup(sourceName);
    const hit = persistedMappings.get(key);
    if (hit) {
      const player = players.find(p => p.player_id === hit.player_id);
      if (player) {
        return {
          status: "auto_matched",
          method: "persisted_memory",
          confidence: 100,
          player_id: hit.player_id,
          player_name: hit.player_name,
          suggestions: [],
        };
      }
    }
  }

  const parsed = parseName(sourceName);

  if (!parsed) {
    console.warn(`[matchEngine] Could not parse name: "${sourceName}"`);
    return { status: "pending_player_record", method: null, confidence: 0, player_id: null, player_name: null, suggestions: [] };
  }

  const { initial, lastName } = parsed;
  const nameMap = getPlayerNameMap(players);

  const exactBoth: PlayerOption[] = [];
  const exactLastNameOnly: PlayerOption[] = [];

  for (const p of players) {
    const pp = nameMap.get(p.player_id);
    if (!pp) continue;

    const lastNameMatch = pp.lastName === lastName;
    const initialMatch = pp.initial === initial;

    if (lastNameMatch && initialMatch) {
      exactBoth.push(p);
    } else if (lastNameMatch) {
      exactLastNameOnly.push(p);
    }
  }

  // 2. Exact last_name + initial — unique match
  if (exactBoth.length === 1) {
    return {
      status: "auto_matched",
      method: "initial_surname_unique",
      confidence: 95,
      player_id: exactBoth[0].player_id,
      player_name: exactBoth[0].player_name,
      suggestions: [],
    };
  }

  // 3. Exact last_name + initial — multiple matches (ambiguous)
  if (exactBoth.length > 1) {
    console.warn(`[matchEngine] Ambiguous match for "${sourceName}": ${exactBoth.map(p => p.player_name).join(", ")}`);
    return { status: "suggested", method: null, confidence: 75, player_id: null, player_name: null, suggestions: exactBoth.slice(0, 6) };
  }

  // 4. Exact last_name only — single match (no initial conflict, likely correct)
  if (exactLastNameOnly.length === 1) {
    return { status: "suggested", method: null, confidence: 80, player_id: null, player_name: null, suggestions: exactLastNameOnly };
  }

  // 4b. Exact last_name only — multiple matches
  if (exactLastNameOnly.length > 1) {
    console.warn(`[matchEngine] Surname-only ambiguous for "${sourceName}": ${exactLastNameOnly.map(p => p.player_name).join(", ")}`);
    return { status: "suggested", method: null, confidence: 60, player_id: null, player_name: null, suggestions: exactLastNameOnly.slice(0, 6) };
  }

  // 5. Partial last_name prefix match
  const surnamePrefix = lastName.slice(0, Math.max(4, lastName.length - 1));
  const partial: PlayerOption[] = [];
  for (const p of players) {
    const pp = nameMap.get(p.player_id);
    if (pp && pp.lastName.startsWith(surnamePrefix) && pp.initial === initial) partial.push(p);
  }
  const partialLoose: PlayerOption[] = [];
  if (partial.length === 0) {
    for (const p of players) {
      const pp = nameMap.get(p.player_id);
      if (pp && pp.lastName.startsWith(surnamePrefix)) partialLoose.push(p);
    }
  }

  const candidates = partial.length > 0 ? partial : partialLoose;
  if (candidates.length > 0) {
    console.warn(`[matchEngine] Partial match only for "${sourceName}" (${candidates.length} candidates)`);
    return { status: "manual_required", method: null, confidence: 35, player_id: null, player_name: null, suggestions: candidates.slice(0, 6) };
  }

  // 6. No match at all
  console.warn(`[matchEngine] No match found for "${sourceName}" (last="${lastName}", initial="${initial}")`);
  return { status: "pending_player_record", method: null, confidence: 0, player_id: null, player_name: null, suggestions: [] };
}

export function applyAutoMatch(
  rows: MappingRow[],
  players: PlayerOption[],
  persistedMappings?: Map<string, PersistedMapping>,
): MappingRow[] {
  return rows.map(row => {
    if (row.match_status === "manual_input") return row;

    const result = matchPlayer(row.source_name, players, persistedMappings);

    if (result.status === "auto_matched") {
      return {
        ...row,
        player_id: result.player_id,
        player_name: result.player_name,
        match_status: result.status,
        match_method: result.method,
        confidence: result.confidence,
        suggestions: result.suggestions,
      };
    }

    return {
      ...row,
      match_status: result.status,
      match_method: result.method,
      confidence: result.confidence,
      suggestions: result.suggestions,
    };
  });
}

export function computeIngestCounts(rows: MappingRow[]) {
  const auto = rows.filter(r => r.match_status === "auto_matched").length;
  const manual = rows.filter(r => r.match_status === "manually_matched").length;
  const suggested = rows.filter(r => r.match_status === "suggested" && r.player_id === null).length;
  const manualRequired = rows.filter(r => r.match_status === "manual_required").length;
  const pendingRecord = rows.filter(r => r.match_status === "pending_player_record").length;
  const manualInput = rows.filter(r => r.match_status === "manual_input").length;
  const readyToCommit = auto + manual;
  const statusChanges = rows.filter(r => r.player_status != null && r.player_status !== "AVAILABLE").length;
  const hasPositions = rows.filter(r => r.position != null).length;
  const hasTeams = rows.filter(r => r.team != null).length;
  const hasAvgPoints = rows.filter(r => r.avg_points != null).length;
  const hasOwnership = rows.filter(r => r.ownership_pct != null).length;
  return {
    total: rows.length,
    auto,
    manual,
    suggested,
    manualRequired,
    pendingRecord,
    manualInput,
    readyToCommit,
    statusChanges,
    hasPositions,
    hasTeams,
    hasAvgPoints,
    hasOwnership,
  };
}

export function sortAndGroupRows(rows: MappingRow[]): MappingRow[] {
  const GROUP_ORDER: MatchStatus[] = [
    "pending_player_record",
    "manual_input",
    "manual_required",
    "suggested",
    "manually_matched",
    "auto_matched",
  ];
  return [...rows].sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.match_status);
    const gb = GROUP_ORDER.indexOf(b.match_status);
    if (ga !== gb) return ga - gb;
    const la = a.source_name.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
    const lb = b.source_name.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
    return la.localeCompare(lb);
  });
}
