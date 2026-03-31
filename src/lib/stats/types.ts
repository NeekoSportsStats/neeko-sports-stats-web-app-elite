export type SportKey = "afl" | "epl" | "nba";

export type AFLStatKey = "fantasy" | "disposals" | "goals";

export type EPLStatKey = "fantasy" | "goals" | "assists" | "shots" | "shotsOnTarget" | "xg";

export type NBAStatKey = "fantasy" | "points" | "rebounds" | "assists" | "threes";

export type StatKey = AFLStatKey | EPLStatKey | NBAStatKey;

export type StatConfig<TStat extends string = StatKey> = {
  league: string;

  seasons: {
    past: string;
    current: string;
  };

  availableStats: readonly TStat[];

  defaultStat: TStat;

  labels: Record<TStat, string>;

  units: Record<TStat, string>;

  descriptions: Record<TStat, string>;

  playerThresholds: Record<TStat, readonly number[]>;

  teamThresholds: Record<TStat, readonly number[]>;

  sportMeta: {
    totalRounds?: number;
    currentRound?: number;
    roundLabels?: string[];
    periods?: string[];
    scoringRules?: string;
  };

  positions: readonly string[];

  momentum: {
    description: string;
    window: number;
  };

  ceiling: {
    description: string;
    method: "max" | "p90";
  };

  volatility: {
    description: string;
    method: "stdev";
  };

  prediction?: {
    enabled: boolean;
    horizon: number;
  };
};
