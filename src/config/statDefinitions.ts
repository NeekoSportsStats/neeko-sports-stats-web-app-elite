import type { StatLens } from "@/features/afl/stat-board/types";

export interface StatDefinition {
  key: StatLens;
  label: string;
  labelShort: string;
  /** Column name on StatBoardHistoryRow */
  historyColumn: "disposals" | "kicks" | "marks" | "tackles" | "goals" | "fantasy_score";
  /** Thresholds shown in collapsed board-row columns */
  collapsedThresholds: readonly number[];
  /** Default threshold for hit-rate calculations */
  defaultThreshold: number;
  supportsProjection: boolean;
  /** False = a zero is valid (e.g. goals). True = a zero is impossible (not applicable here). */
  zeroIsValid: boolean;
}

export const STAT_DEFINITIONS: StatDefinition[] = [
  {
    key: "disposals",
    label: "Disposals",
    labelShort: "Disp",
    historyColumn: "disposals",
    collapsedThresholds: [15, 20, 25, 30],
    defaultThreshold: 20,
    supportsProjection: true,
    zeroIsValid: false,
  },
  {
    key: "goals",
    label: "Goals",
    labelShort: "Goals",
    historyColumn: "goals",
    collapsedThresholds: [1, 2, 3, 4],
    defaultThreshold: 1,
    supportsProjection: true,
    zeroIsValid: true,
  },
  {
    key: "marks",
    label: "Marks",
    labelShort: "Marks",
    historyColumn: "marks",
    collapsedThresholds: [3, 4, 5, 6, 7],
    defaultThreshold: 4,
    supportsProjection: true,
    zeroIsValid: false,
  },
  {
    key: "tackles",
    label: "Tackles",
    labelShort: "Tkls",
    historyColumn: "tackles",
    collapsedThresholds: [3, 4, 5, 6],
    defaultThreshold: 4,
    supportsProjection: true,
    zeroIsValid: false,
  },
  {
    key: "kicks",
    label: "Kicks",
    labelShort: "Kicks",
    historyColumn: "kicks",
    collapsedThresholds: [8, 10, 12, 15, 18],
    defaultThreshold: 10,
    supportsProjection: true,
    zeroIsValid: false,
  },
  {
    key: "fantasy",
    label: "Fantasy",
    labelShort: "Fant",
    historyColumn: "fantasy_score",
    collapsedThresholds: [60, 70, 80, 90, 100],
    defaultThreshold: 75,
    supportsProjection: true,
    zeroIsValid: false,
  },
];

export function getStatDef(lens: StatLens): StatDefinition {
  return STAT_DEFINITIONS.find((d) => d.key === lens) ?? STAT_DEFINITIONS[0];
}
