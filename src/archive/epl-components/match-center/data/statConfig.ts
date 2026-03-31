export type StatKey =
  | "shots"
  | "goals"
  | "possession"
  | "passes"
  | "passAccuracy"
  | "tackles"
  | "fouls";

export type StatFormatter = (value: number) => string;

export type StatDefinition = {
  key: StatKey;
  label: string;
  leagueAvg: number;
  higherIsBetter: boolean;
  formatter?: StatFormatter;
};

const percentFormatter: StatFormatter = (v) => `${v}%`;
const defaultFormatter: StatFormatter = (v) => String(v);

export const EPL_MATCH_STATS: Record<StatKey, StatDefinition> = {
  shots: {
    key: "shots",
    label: "Shots",
    leagueAvg: 12,
    higherIsBetter: true,
    formatter: defaultFormatter,
  },
  goals: {
    key: "goals",
    label: "Goals",
    leagueAvg: 1.5,
    higherIsBetter: true,
    formatter: defaultFormatter,
  },
  possession: {
    key: "possession",
    label: "Possession",
    leagueAvg: 50,
    higherIsBetter: true,
    formatter: percentFormatter,
  },
  passes: {
    key: "passes",
    label: "Passes",
    leagueAvg: 420,
    higherIsBetter: true,
    formatter: defaultFormatter,
  },
  passAccuracy: {
    key: "passAccuracy",
    label: "Pass Accuracy",
    leagueAvg: 82,
    higherIsBetter: true,
    formatter: percentFormatter,
  },
  tackles: {
    key: "tackles",
    label: "Tackles",
    leagueAvg: 18,
    higherIsBetter: true,
    formatter: defaultFormatter,
  },
  fouls: {
    key: "fouls",
    label: "Fouls",
    leagueAvg: 12,
    higherIsBetter: false,
    formatter: defaultFormatter,
  },
};

export const availablePlayerStats: StatKey[] = [
  "shots",
  "goals",
  "passes",
  "tackles",
];

export const availableTeamStats: StatKey[] = [
  "shots",
  "goals",
  "possession",
  "passes",
  "passAccuracy",
  "tackles",
  "fouls",
];

export function getStatLabel(key: StatKey): string {
  return EPL_MATCH_STATS[key]?.label ?? key;
}

export function formatStatValue(key: StatKey, value: number): string {
  const stat = EPL_MATCH_STATS[key];
  return stat?.formatter ? stat.formatter(value) : String(value);
}

export function getStatConfig(key: StatKey): StatDefinition | undefined {
  return EPL_MATCH_STATS[key];
}
