/**
 * Schedule engine — generates the weekly post schedule.
 *
 * Rules:
 * - Mon–Wed: 2 feed posts/day (round_review Mon, round_ahead_watch Tue/Wed)
 *   Exception: if there are Monday games belonging to the current round, those
 *   produce match_stat_board slots appended AFTER Sunday (overflow section).
 * - Thu: 2 posts (round_ahead_watch + match_stat_board if Thurs game)
 * - Fri: 2 posts (match_stat_board if Fri game, else player_spotlight)
 * - Sat/Sun: one post per game (weekendPostingMode=one_per_game), or up to 4 (two_max)
 * - product_education: 1 per week, typically Wednesday
 * - story_extra: ad hoc, not scheduled automatically
 * - Overflow (Mon/Tue/etc. same-round games): match_stat_board after Sunday
 *
 * Visibility mode assignment:
 * - Thu/Fri games → open_free_game (freeGameSelectionMode="thu_fri")
 * - Sat/Sun/overflow games → preview_blurred
 * - Fallback: if no Thu/Fri games and mode="thu_fri", first freeGamesPerRound
 *   chronological games become open_free_game
 *
 * Round review timing:
 * - round_review is only marked "ready" after the last game of the round is
 *   complete (status "FT" or equivalent). If any game is still scheduled/NYP,
 *   round_review carries roundReviewPending=true.
 */

import type { AFLGame, ContentType, ContentVisibilityMode, DayOfWeek, PlannerSettings } from "../types";

export interface ScheduleSlot {
  day: DayOfWeek;
  date: string;          // "YYYY-MM-DD"
  contentType: ContentType;
  gameId?: string;
  homeTeam?: string;
  awayTeam?: string;
  priority: number;      // lower = higher priority
  visibilityMode?: ContentVisibilityMode;
  /** True for match boards that belong to the current round but fall after Sunday */
  isRoundOverflow?: boolean;
  /** True for round_review slots where the final game has not yet been completed */
  roundReviewPending?: boolean;
}

export interface WeekSchedule {
  round: number;
  season: number;
  weekStart: string;    // Monday "YYYY-MM-DD"
  slots: ScheduleSlot[];
  /** Date of the final game in the round, if known */
  finalGameDate?: string;
  /** Whether the round is complete (all games FT) */
  roundComplete?: boolean;
}

/** Returns ISO date string for day offset from a base date */
function offsetDate(base: string, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Gets the Monday of the week containing a given date */
export function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

/** Map day offset (0=Mon) to DayOfWeek label */
const DAY_LABELS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Days that are treated as normal pre-round planning days (not match days) */
const PLANNING_DAYS = new Set<DayOfWeek>(["Mon", "Tue", "Wed"]);

/**
 * Days whose games are treated as "overflow" (belong to the current round but
 * fall outside the standard Thu–Sun window). Currently Mon–Wed, but the logic
 * is generic — any day that only has overflow games will be handled.
 */
function isOverflowDay(day: DayOfWeek): boolean {
  return PLANNING_DAYS.has(day);
}

/**
 * Returns true if a game is considered "complete".
 * Canonical status values from AFLGame type: "completed".
 * Also handles raw DB values like "FT", "FULL_TIME" for robustness.
 */
function isGameComplete(game: AFLGame): boolean {
  const s = (game.status ?? "").toLowerCase();
  return s === "completed" || s === "ft" || s === "full_time" || s === "final";
}

/**
 * Determine which game IDs get open_free_game treatment this round.
 * Thu/Fri games are free by default; fallback to first N chronological games.
 */
function computeFreeGameIds(
  games: AFLGame[],
  round: number,
  season: number,
  settings: PlannerSettings
): Set<string> {
  const roundGames = games.filter(g => g.round === round && g.season === season);
  const freeIds = new Set<string>();

  if (settings.freeGameSelectionMode === "thu_fri") {
    for (const g of roundGames) {
      if (g.isThursdayGame || g.isFridayGame) {
        freeIds.add(g.id);
      }
    }
    // Fallback: no Thu/Fri games — use first N chronological
    if (freeIds.size === 0) {
      const sorted = [...roundGames].sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (const g of sorted.slice(0, settings.freeGamesPerRound)) {
        freeIds.add(g.id);
      }
    }
  } else if (settings.freeGameSelectionMode === "first_two") {
    const sorted = [...roundGames].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (const g of sorted.slice(0, settings.freeGamesPerRound)) {
      freeIds.add(g.id);
    }
  }
  // "manual" — freeIds stays empty; caller assigns manually

  return freeIds;
}

export function buildWeekSchedule(
  round: number,
  season: number,
  mondayDate: string,
  games: AFLGame[],
  settings?: PlannerSettings
): WeekSchedule {
  const slots: ScheduleSlot[] = [];

  // Determine free game IDs (requires settings; fall back gracefully)
  const freeGameIds = settings
    ? computeFreeGameIds(games, round, season, settings)
    : new Set<string>();

  const weekendMode = settings?.weekendPostingMode ?? "one_per_game";

  // Group games by day — all games for the selected round
  const gamesByDay: Record<DayOfWeek, AFLGame[]> = {
    Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [],
  };
  for (const game of games) {
    if (game.round === round && game.season === season) {
      gamesByDay[game.dayOfWeek].push(game);
    }
  }

  // Separate overflow games: planning-day games that belong to THIS round
  // (e.g. Monday public holiday games, split round overflow)
  const overflowGames: AFLGame[] = [];
  for (const day of DAY_LABELS) {
    if (isOverflowDay(day)) {
      overflowGames.push(...gamesByDay[day]);
    }
  }

  // Determine round completion state for round_review timing
  const allRoundGames = games.filter(g => g.round === round && g.season === season);
  const roundComplete = allRoundGames.length > 0 && allRoundGames.every(isGameComplete);
  const finalGameDate = allRoundGames.length > 0
    ? allRoundGames.reduce((latest, g) =>
        g.startTime > latest ? g.startTime : latest,
      allRoundGames[0].startTime
    ).split("T")[0]
    : undefined;

  let priority = 0;

  // Monday — Round review (pending if not all games complete)
  const monDate = mondayDate;
  slots.push({
    day: "Mon", date: monDate, contentType: "round_review", priority: priority++,
    roundReviewPending: !roundComplete,
  });
  slots.push({ day: "Mon", date: monDate, contentType: "player_spotlight", priority: priority++ });

  // Tuesday — Round ahead
  const tueDate = offsetDate(mondayDate, 1);
  slots.push({ day: "Tue", date: tueDate, contentType: "round_ahead_watch", priority: priority++ });
  slots.push({ day: "Tue", date: tueDate, contentType: "player_spotlight", priority: priority++ });

  // Wednesday — Round ahead + product education
  const wedDate = offsetDate(mondayDate, 2);
  slots.push({ day: "Wed", date: wedDate, contentType: "round_ahead_watch", priority: priority++ });
  slots.push({ day: "Wed", date: wedDate, contentType: "product_education", priority: priority++ });

  // Thursday — match board if game, else round_ahead + player_spotlight
  const thuDate = offsetDate(mondayDate, 3);
  const thuGames = gamesByDay["Thu"];
  if (thuGames.length > 0) {
    for (const g of thuGames) {
      slots.push({
        day: "Thu", date: thuDate, contentType: "match_stat_board",
        gameId: g.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, priority: priority++,
        visibilityMode: freeGameIds.has(g.id) ? "open_free_game" : "preview_blurred",
      });
    }
    if (thuGames.length === 1) {
      slots.push({ day: "Thu", date: thuDate, contentType: "player_spotlight", priority: priority++ });
    }
  } else {
    slots.push({ day: "Thu", date: thuDate, contentType: "round_ahead_watch", priority: priority++ });
    slots.push({ day: "Thu", date: thuDate, contentType: "player_spotlight", priority: priority++ });
  }

  // Friday — match board if game
  const friDate = offsetDate(mondayDate, 4);
  const friGames = gamesByDay["Fri"];
  if (friGames.length > 0) {
    for (const g of friGames) {
      slots.push({
        day: "Fri", date: friDate, contentType: "match_stat_board",
        gameId: g.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, priority: priority++,
        visibilityMode: freeGameIds.has(g.id) ? "open_free_game" : "preview_blurred",
      });
    }
    if (friGames.length === 1) {
      slots.push({ day: "Fri", date: friDate, contentType: "player_spotlight", priority: priority++ });
    }
  } else {
    slots.push({ day: "Fri", date: friDate, contentType: "player_spotlight", priority: priority++ });
    slots.push({ day: "Fri", date: friDate, contentType: "player_spotlight_duo", priority: priority++ });
  }

  // Saturday — one post per game (one_per_game) or up to 4 (two_max/stories_overflow)
  const satDate = offsetDate(mondayDate, 5);
  const satGames = gamesByDay["Sat"];
  const satLimit = weekendMode === "one_per_game" ? satGames.length : Math.min(satGames.length, 4);
  for (let i = 0; i < satLimit; i++) {
    const g = satGames[i];
    slots.push({
      day: "Sat", date: satDate, contentType: "match_stat_board",
      gameId: g.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, priority: priority++,
      visibilityMode: freeGameIds.has(g.id) ? "open_free_game" : "preview_blurred",
    });
  }
  // Only fill to minimum 2 when NOT in one_per_game mode
  if (weekendMode !== "one_per_game") {
    const satFillNeeded = Math.max(0, 2 - satLimit);
    for (let i = 0; i < satFillNeeded; i++) {
      slots.push({ day: "Sat", date: satDate, contentType: "player_spotlight", priority: priority++ });
    }
  }

  // Sunday — same logic
  const sunDate = offsetDate(mondayDate, 6);
  const sunGames = gamesByDay["Sun"];
  const sunLimit = weekendMode === "one_per_game" ? sunGames.length : Math.min(sunGames.length, 4);
  for (let i = 0; i < sunLimit; i++) {
    const g = sunGames[i];
    slots.push({
      day: "Sun", date: sunDate, contentType: "match_stat_board",
      gameId: g.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, priority: priority++,
      visibilityMode: freeGameIds.has(g.id) ? "open_free_game" : "preview_blurred",
    });
  }
  if (weekendMode !== "one_per_game") {
    const sunFillNeeded = Math.max(0, 2 - sunLimit);
    for (let i = 0; i < sunFillNeeded; i++) {
      slots.push({ day: "Sun", date: sunDate, contentType: "player_spotlight", priority: priority++ });
    }
  }

  // Overflow — same-round games on planning days (Mon/Tue/Wed).
  // These are placed AFTER Sunday in the queue with isRoundOverflow=true.
  // Their day label is kept as-is so the UI can render them correctly.
  // Date is computed from their actual game date (startTime).
  if (overflowGames.length > 0) {
    // Sort overflow games chronologically
    const sortedOverflow = [...overflowGames].sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );
    for (const g of sortedOverflow) {
      const gameDate = g.startTime.split("T")[0];
      slots.push({
        day: g.dayOfWeek,
        date: gameDate,
        contentType: "match_stat_board",
        gameId: g.id,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        priority: priority++,
        visibilityMode: freeGameIds.has(g.id) ? "open_free_game" : "preview_blurred",
        isRoundOverflow: true,
      });
    }
  }

  return {
    round,
    season,
    weekStart: mondayDate,
    slots: slots.sort((a, b) => a.priority - b.priority),
    finalGameDate,
    roundComplete,
  };
}

/** Get a human-readable day label for a slot */
export function slotDayLabel(slot: ScheduleSlot): string {
  const labels: Record<DayOfWeek, string> = {
    Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
    Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
  };
  return labels[slot.day];
}

/** Group schedule slots by day */
export function groupSlotsByDay(slots: ScheduleSlot[]): Record<DayOfWeek, ScheduleSlot[]> {
  const grouped: Record<DayOfWeek, ScheduleSlot[]> = {
    Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [],
  };
  for (const slot of slots) {
    grouped[slot.day].push(slot);
  }
  return grouped;
}

/** Count total posts per day */
export function postsPerDay(slots: ScheduleSlot[]): Record<DayOfWeek, number> {
  const grouped = groupSlotsByDay(slots);
  const result = {} as Record<DayOfWeek, number>;
  for (const day of DAY_LABELS) {
    result[day] = grouped[day].length;
  }
  return result;
}

/** Returns which week days have game-day match boards */
export function getGameDays(schedule: WeekSchedule): DayOfWeek[] {
  const days = new Set<DayOfWeek>();
  for (const slot of schedule.slots) {
    if (slot.contentType === "match_stat_board") {
      days.add(slot.day);
    }
  }
  return Array.from(days);
}

/** Total post count for the week */
export function totalWeekPostCount(schedule: WeekSchedule): number {
  return schedule.slots.length;
}
