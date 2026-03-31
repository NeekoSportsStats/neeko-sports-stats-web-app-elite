export const LEAGUE_AVAILABILITY = {
  afl: "live",
  epl: "coming-soon",
  nba: "coming-soon",
} as const;

export type LeagueStatus = "live" | "coming-soon";
