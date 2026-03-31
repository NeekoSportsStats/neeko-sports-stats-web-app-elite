export { FREE_PLAYER_IDS_BY_TEAM, isFreePlayer as isFreePlayerById } from "./freePlayers";
import { FREE_PLAYER_IDS_BY_TEAM } from "./freePlayers";

export const FREE_PLAYER_IDS: number[] = Object.values(FREE_PLAYER_IDS_BY_TEAM).flat();

export const FREE_TOTAL_PLAYERS = 20;
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

export const FREE_PLAYER_ROWS = 10;
export const FREE_TEAM_ROWS = 8;

export const FREE_MATCH_ROUNDS_VISIBLE = 5;
