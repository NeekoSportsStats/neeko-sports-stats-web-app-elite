/**
 * Schedule engine — generates the weekly post schedule.
 *
 * Rules:
 * - Mon–Wed: 2 feed posts/day (round_review Mon, round_ahead_watch Tue/Wed)
 * - Thu: 2 posts (round_ahead_watch + match_stat_board if Thurs game)
 * - Fri: 2 posts (match_stat_board if Fri game, else player_spotlight)
 * - Sat: 2–4 posts (match_stat_board per game, up to 4 games)
 * - Sun: 2–4 posts (match_stat_board per game, up to 4 games)
 * - product_education: 1 per week, typically Wednesday
 * - story_extra: ad hoc, not scheduled automatically
 */

import type { AFLGame, ContentType, DayOfWeek, SocialPost } from "../types";

export interface ScheduleSlot {
  day: DayOfWeek;
  date: string;          // "YYYY-MM-DD"
  contentType: ContentType;
  gameId?: string;
  homeTeam?: string;
  awayTeam?: string;
  priority: number;      // lower = higher priority
}

export interface WeekSchedule {
  round: number;
  season: number;
  weekStart: string;    // Monday "YYYY-MM-DD"
  slots: ScheduleSlot[];
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

export function buildWeekSchedule(
  round: number,
  season: number,
  mondayDate: string,
  games: AFLGame[]
): WeekSchedule {
  const slots: ScheduleSlot[] = [];

  // Group games by day
  const gamesByDay: Record<DayOfWeek, AFLGame[]> = {
    Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [],
  };
  for (const game of games) {
    if (game.round === round && game.season === season) {
      gamesByDay[game.dayOfWeek].push(game);
    }
  }

  let priority = 0;

  // Monday — Round review (2 posts)
  const monDate = mondayDate;
  slots.push({ day: "Mon", date: monDate, contentType: "round_review", priority: priority++ });
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
    for (const g of thuGames.slice(0, 2)) {
      slots.push({
        day: "Thu", date: thuDate, contentType: "match_stat_board",
        gameId: g.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, priority: priority++,
      });
    }
    // Fill to 2 if only 1 game
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
    for (const g of friGames.slice(0, 2)) {
      slots.push({
        day: "Fri", date: friDate, contentType: "match_stat_board",
        gameId: g.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, priority: priority++,
      });
    }
    if (friGames.length === 1) {
      slots.push({ day: "Fri", date: friDate, contentType: "player_spotlight", priority: priority++ });
    }
  } else {
    slots.push({ day: "Fri", date: friDate, contentType: "player_spotlight", priority: priority++ });
    slots.push({ day: "Fri", date: friDate, contentType: "player_spotlight_duo", priority: priority++ });
  }

  // Saturday — match boards (up to 4)
  const satDate = offsetDate(mondayDate, 5);
  const satGames = gamesByDay["Sat"];
  const satCount = Math.min(satGames.length, 4);
  for (let i = 0; i < satCount; i++) {
    const g = satGames[i];
    slots.push({
      day: "Sat", date: satDate, contentType: "match_stat_board",
      gameId: g.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, priority: priority++,
    });
  }
  // Fill to minimum 2
  const satFillNeeded = Math.max(0, 2 - satCount);
  for (let i = 0; i < satFillNeeded; i++) {
    slots.push({ day: "Sat", date: satDate, contentType: "player_spotlight", priority: priority++ });
  }

  // Sunday — match boards (up to 4)
  const sunDate = offsetDate(mondayDate, 6);
  const sunGames = gamesByDay["Sun"];
  const sunCount = Math.min(sunGames.length, 4);
  for (let i = 0; i < sunCount; i++) {
    const g = sunGames[i];
    slots.push({
      day: "Sun", date: sunDate, contentType: "match_stat_board",
      gameId: g.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, priority: priority++,
    });
  }
  const sunFillNeeded = Math.max(0, 2 - sunCount);
  for (let i = 0; i < sunFillNeeded; i++) {
    slots.push({ day: "Sun", date: sunDate, contentType: "player_spotlight", priority: priority++ });
  }

  return {
    round,
    season,
    weekStart: mondayDate,
    slots: slots.sort((a, b) => a.priority - b.priority),
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
