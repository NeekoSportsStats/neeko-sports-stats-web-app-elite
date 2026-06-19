import {
  type StatLens,
  DISPOSAL_THRESHOLDS,
  GOALS_THRESHOLDS,
  MARKS_THRESHOLDS,
  TACKLES_THRESHOLDS,
  KICKS_THRESHOLDS,
  FANTASY_THRESHOLDS,
} from "@/features/afl/stat-board/types";
import {
  publicExpandedPlayer,
  publicExpandedKicks,
  publicExpandedMarks,
  publicExpandedTackles,
  publicExpandedGoals,
  publicExpandedFantasy,
} from "@/config/disposalThresholds";

export interface StatDefinition {
  key: StatLens;
  label: string;
  labelShort: string;
  /** Column name on StatBoardHistoryRow */
  historyColumn: "disposals" | "kicks" | "marks" | "tackles" | "goals" | "fantasy_score";
  /** Thresholds shown in collapsed board-row columns */
  collapsedThresholds: readonly number[];
  /** Full threshold range for the expanded Season Hit Rates table */
  expandedThresholds: readonly number[];
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
    collapsedThresholds: DISPOSAL_THRESHOLDS,
    expandedThresholds: publicExpandedPlayer,
    defaultThreshold: 20,
    supportsProjection: true,
    zeroIsValid: false,
  },
  {
    key: "goals",
    label: "Goals",
    labelShort: "Goals",
    historyColumn: "goals",
    collapsedThresholds: GOALS_THRESHOLDS,
    expandedThresholds: publicExpandedGoals,
    defaultThreshold: 1,
    supportsProjection: true,
    zeroIsValid: true,
  },
  {
    key: "marks",
    label: "Marks",
    labelShort: "Marks",
    historyColumn: "marks",
    collapsedThresholds: MARKS_THRESHOLDS,
    expandedThresholds: publicExpandedMarks,
    defaultThreshold: 4,
    supportsProjection: true,
    zeroIsValid: false,
  },
  {
    key: "tackles",
    label: "Tackles",
    labelShort: "Tkls",
    historyColumn: "tackles",
    collapsedThresholds: TACKLES_THRESHOLDS,
    expandedThresholds: publicExpandedTackles,
    defaultThreshold: 4,
    supportsProjection: true,
    zeroIsValid: false,
  },
  {
    key: "kicks",
    label: "Kicks",
    labelShort: "Kicks",
    historyColumn: "kicks",
    collapsedThresholds: KICKS_THRESHOLDS,
    expandedThresholds: publicExpandedKicks,
    defaultThreshold: 10,
    supportsProjection: true,
    zeroIsValid: false,
  },
  {
    key: "fantasy",
    label: "Fantasy",
    labelShort: "Fant",
    historyColumn: "fantasy_score",
    collapsedThresholds: FANTASY_THRESHOLDS,
    expandedThresholds: publicExpandedFantasy,
    defaultThreshold: 75,
    supportsProjection: true,
    zeroIsValid: false,
  },
];

export function getStatDef(lens: StatLens): StatDefinition {
  return STAT_DEFINITIONS.find((d) => d.key === lens) ?? STAT_DEFINITIONS[0];
}
