import type { StatLens, PositionFilter, StatBoardPlayer } from "../types";

export type CompareMode = "board" | "fine";

export type SortKey = "hit_rate" | "l5_avg" | "projection" | "name";

export interface CurrentWeekUrlState {
  matchId: number | null;
  stat: StatLens;
  mode: CompareMode;
  line: number | null;
  position: PositionFilter;
  sort: SortKey;
  search: string;
}

export interface ComparePlayer {
  player: StatBoardPlayer;
  selectedHits: number | null;
  selectedGames: number | null;
  selectedRate: number | null;
  hasSelectedData: boolean;
}
