export { FREE_PLAYER_IDS_BY_TEAM, isFreePlayer as isFreePlayerById } from "./freePlayers";
import { FREE_PLAYER_IDS_BY_TEAM } from "./freePlayers";

export const FREE_PLAYER_IDS: number[] = Object.values(FREE_PLAYER_IDS_BY_TEAM).flat();

// PHASE 3: Dynamic limits now controlled by database config
// These are fallback values only - actual limits come from freemium_config table

export const FREE_TOTAL_PLAYERS_FALLBACK = 12; // Increased from 8
export const FREE_PLAYERS_PER_TEAM = 3;

export const FREE_PLAYER_NAMES: string[] = [
  "Marcus Bontempelli",
  "Nick Daicos",
  "Max Gawn",
  "Jordan Dawson",
  "Zach Merrett",
  "Connor Rozee",
  "Josh Dunkley",
  "Andrew Brayshaw",
  "Bailey Smith",
  "Harry Sheezel",
  "Christian Petracca",
  "Clayton Oliver",
  "Errol Gulden",
  "Sam Walsh",
  "Tom Green",
  "Jack Steele",
  "Lachie Neale",
  "Touk Miller",
  "Isaac Heeney",
  "Callum Mills",
];

export const FREE_TOTAL_TEAMS = 8;

export const FREE_TEAM_NAMES: string[] = [
  "Adelaide",
  "Brisbane",
  "Carlton",
  "Collingwood",
  "Essendon",
  "Fremantle",
  "Geelong",
  "Gold Coast Suns",
];

export const FREE_MATCH_IDS: number[] = [
  3345,
  3346,
];

// UI Limits - now dynamic, these are fallbacks
export const FREE_FULL_ROWS_FALLBACK = 10;
export const FREE_LOCKED_PREVIEW_ROWS_FALLBACK = 10;
export const FREE_PLAYER_ROWS = FREE_FULL_ROWS_FALLBACK;
export const FREE_TEAM_ROWS = 8;

export const FREE_MATCH_ROUNDS_VISIBLE = 5;

// AI Exposure Tiers (read from database config)
export const AI_EXPOSURE_TIERS = {
  FREE: "free_tier",
  PREMIUM: "premium_tier",
} as const;
