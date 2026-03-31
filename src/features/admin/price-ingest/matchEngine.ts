import type { PlayerOption, MappingRow } from "./types";
import type { PersistedMapping } from "./usePriceIngest";

export type MatchStatus =
  | "auto_matched"
  | "suggested"
  | "manual_required"
  | "pending_player_record"
  | "manually_matched"
  | "manual_input";

export interface MatchResult {
  status: MatchStatus;
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
  tokens: string[];
  surname: string;
}

function parseName(sourceName: string): ParsedName | null {
  const norm = normalizeName(sourceName);
  const tokens = norm.split(" ").filter(Boolean);
  if (tokens.length < 2) return null;

  const initial = tokens[0].charAt(0);
  const surnameTokens = tokens.slice(1);
  const surname = surnameTokens.join(" ");

  if (!initial || !surname) return null;
  return { initial, tokens, surname };
}

interface ParsedPlayerName {
  initial: string;
  tokens: string[];
  surname: string;
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
    const surname = tokens.slice(1).join(" ");
    map.set(p.player_id, { initial, tokens, surname, fullNorm: norm });
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

export function matchPlayer(
  sourceName: string,
  players: PlayerOption[],
  persistedMappings?: Map<string, PersistedMapping>,
): MatchResult {
  if (persistedMappings && persistedMappings.size > 0) {
    const key = normalizeForLookup(sourceName);
    const hit = persistedMappings.get(key);
    if (hit) {
      const player = players.find(p => p.player_id === hit.player_id);
      if (player) {
        return {
          status: "auto_matched",
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
    return { status: "pending_player_record", confidence: 0, player_id: null, player_name: null, suggestions: [] };
  }

  const { initial, surname } = parsed;
  const nameMap = getPlayerNameMap(players);

  const exactBoth: PlayerOption[] = [];
  const exactSurnameOnly: PlayerOption[] = [];

  for (const p of players) {
    const pp = nameMap.get(p.player_id);
    if (!pp) continue;

    const surnameMatch = pp.surname === surname;
    const initialMatch = pp.initial === initial;

    if (surnameMatch && initialMatch) {
      exactBoth.push(p);
    } else if (surnameMatch) {
      exactSurnameOnly.push(p);
    }
  }

  if (exactBoth.length === 1) {
    return {
      status: "auto_matched",
      confidence: 95,
      player_id: exactBoth[0].player_id,
      player_name: exactBoth[0].player_name,
      suggestions: [],
    };
  }

  if (exactBoth.length > 1) {
    return { status: "suggested", confidence: 75, player_id: null, player_name: null, suggestions: exactBoth.slice(0, 6) };
  }

  if (exactSurnameOnly.length === 1) {
    return { status: "suggested", confidence: 80, player_id: null, player_name: null, suggestions: exactSurnameOnly };
  }

  if (exactSurnameOnly.length > 1) {
    return { status: "suggested", confidence: 60, player_id: null, player_name: null, suggestions: exactSurnameOnly.slice(0, 6) };
  }

  const surnamePrefix = surname.slice(0, Math.max(4, surname.length - 1));
  const partial: PlayerOption[] = [];
  for (const p of players) {
    const pp = nameMap.get(p.player_id);
    if (pp && pp.surname.startsWith(surnamePrefix) && pp.initial === initial) partial.push(p);
  }
  const partialLoose: PlayerOption[] = [];
  if (partial.length === 0) {
    for (const p of players) {
      const pp = nameMap.get(p.player_id);
      if (pp && pp.surname.startsWith(surnamePrefix)) partialLoose.push(p);
    }
  }

  const candidates = partial.length > 0 ? partial : partialLoose;
  if (candidates.length > 0) {
    return { status: "manual_required", confidence: 35, player_id: null, player_name: null, suggestions: candidates.slice(0, 6) };
  }

  return { status: "pending_player_record", confidence: 0, player_id: null, player_name: null, suggestions: [] };
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
        confidence: result.confidence,
        suggestions: result.suggestions,
      };
    }

    return {
      ...row,
      match_status: result.status,
      confidence: result.confidence,
      suggestions: result.suggestions,
    };
  });
}
