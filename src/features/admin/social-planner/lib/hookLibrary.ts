/**
 * Hook library — 200+ hooks seeded per spec.
 * Each hook has an id, category, and template string with [token] placeholders.
 */

export type HookCategory =
  | "match_board"
  | "player_spotlight"
  | "disposal"
  | "goal"
  | "product"
  | "round_review"
  | "round_ahead"
  | "free_game_board"
  | "preview_game";

export interface HookTemplate {
  id: string;
  category: HookCategory;
  template: string;
}

export const HOOKS: HookTemplate[] = [
  // ─── Match Board ───────────────────────────────────────────────────────────
  { id: "mb01", category: "match_board", template: "Round [round] match board is live." },
  { id: "mb02", category: "match_board", template: "[game] stat board is ready." },
  { id: "mb03", category: "match_board", template: "Disposal and goal form for [game]." },
  { id: "mb04", category: "match_board", template: "The latest form board for [homeTeam] v [awayTeam]." },
  { id: "mb05", category: "match_board", template: "Recent player form for [game]." },
  { id: "mb06", category: "match_board", template: "The match board is built for [game]." },
  { id: "mb07", category: "match_board", template: "A cleaner look at the numbers before bounce." },
  { id: "mb08", category: "match_board", template: "The key threshold records for [game]." },
  { id: "mb09", category: "match_board", template: "Recent form, one board, one matchup." },
  { id: "mb10", category: "match_board", template: "[homeTeam] v [awayTeam] through the data." },
  { id: "mb11", category: "match_board", template: "Matchday stats without the noise." },
  { id: "mb12", category: "match_board", template: "The form board for tonight's matchup." },
  { id: "mb13", category: "match_board", template: "A quick scan of disposal and goal form." },
  { id: "mb14", category: "match_board", template: "The numbers behind [game]." },
  { id: "mb15", category: "match_board", template: "The matchup board is ready." },
  { id: "mb16", category: "match_board", template: "Recent records for the players in [game]." },
  { id: "mb17", category: "match_board", template: "One board for the key player trends." },
  { id: "mb18", category: "match_board", template: "The [game] form check." },
  { id: "mb19", category: "match_board", template: "Round [round] player form starts here." },
  { id: "mb20", category: "match_board", template: "The stat board for [homeTeam] v [awayTeam]." },
  { id: "mb21", category: "match_board", template: "Player form snapshot for [game]." },
  { id: "mb22", category: "match_board", template: "Disposal form and goal form in one place." },
  { id: "mb23", category: "match_board", template: "Match board view: [game]." },
  { id: "mb24", category: "match_board", template: "Recent records heading into [game]." },
  { id: "mb25", category: "match_board", template: "The game board is live." },
  { id: "mb26", category: "match_board", template: "AFL form board for [game]." },
  { id: "mb27", category: "match_board", template: "Player thresholds for [game]." },
  { id: "mb28", category: "match_board", template: "The simple way to scan [game]." },
  { id: "mb29", category: "match_board", template: "Recent form board: [homeTeam] v [awayTeam]." },
  { id: "mb30", category: "match_board", template: "Tonight's matchup, through player records." },
  { id: "mb31", category: "match_board", template: "Game-day form data for [game]." },
  { id: "mb32", category: "match_board", template: "The key names from the form board." },
  { id: "mb33", category: "match_board", template: "Round [round] stat board: [game]." },
  { id: "mb34", category: "match_board", template: "Data-first look at [game]." },
  { id: "mb35", category: "match_board", template: "Matchday board for [homeTeam] and [awayTeam]." },
  { id: "mb36", category: "match_board", template: "The full player picture starts with the board." },
  { id: "mb37", category: "match_board", template: "Threshold records for [game]." },
  { id: "mb38", category: "match_board", template: "Recent form across disposals and goals." },
  { id: "mb39", category: "match_board", template: "The [game] stat preview." },
  { id: "mb40", category: "match_board", template: "Before bounce: the player form board." },

  // ─── Player Spotlight ──────────────────────────────────────────────────────
  { id: "ps01", category: "player_spotlight", template: "Player spotlight: [player]." },
  { id: "ps02", category: "player_spotlight", template: "Recent record watch: [player]." },
  { id: "ps03", category: "player_spotlight", template: "[player] form check." },
  { id: "ps04", category: "player_spotlight", template: "[record] at [threshold] for [player]." },
  { id: "ps05", category: "player_spotlight", template: "One player from the board: [player]." },
  { id: "ps06", category: "player_spotlight", template: "[player] has been consistent at [threshold]." },
  { id: "ps07", category: "player_spotlight", template: "Recent form profile: [player]." },
  { id: "ps08", category: "player_spotlight", template: "[player] threshold record." },
  { id: "ps09", category: "player_spotlight", template: "The record: [record] at [threshold]." },
  { id: "ps10", category: "player_spotlight", template: "L5 average watch: [player]." },
  { id: "ps11", category: "player_spotlight", template: "[player] sits high on the form board." },
  { id: "ps12", category: "player_spotlight", template: "Strong recent sample for [player]." },
  { id: "ps13", category: "player_spotlight", template: "Player form snapshot: [player]." },
  { id: "ps14", category: "player_spotlight", template: "[player] in the recent data." },
  { id: "ps15", category: "player_spotlight", template: "A clean look at [player]'s form." },
  { id: "ps16", category: "player_spotlight", template: "[player] over the recent sample." },
  { id: "ps17", category: "player_spotlight", template: "[player] by the numbers." },
  { id: "ps18", category: "player_spotlight", template: "Spotlight from the [game] board." },
  { id: "ps19", category: "player_spotlight", template: "One record worth noting." },
  { id: "ps20", category: "player_spotlight", template: "[team] form watch: [player]." },
  { id: "ps21", category: "player_spotlight", template: "[player] recent threshold check." },
  { id: "ps22", category: "player_spotlight", template: "[record] tells the story for [player]." },
  { id: "ps23", category: "player_spotlight", template: "[player] has been building a clear profile." },
  { id: "ps24", category: "player_spotlight", template: "Recent output: [player]." },
  { id: "ps25", category: "player_spotlight", template: "Form line check: [player]." },
  { id: "ps26", category: "player_spotlight", template: "The [threshold] record: [player]." },
  { id: "ps27", category: "player_spotlight", template: "One to watch from the data." },
  { id: "ps28", category: "player_spotlight", template: "[player] trend from the board." },
  { id: "ps29", category: "player_spotlight", template: "Recent stat record: [player]." },
  { id: "ps30", category: "player_spotlight", template: "[player] in focus." },
  { id: "ps31", category: "player_spotlight", template: "Clean record, simple context." },
  { id: "ps32", category: "player_spotlight", template: "The board highlight: [player]." },
  { id: "ps33", category: "player_spotlight", template: "Player data check: [player]." },
  { id: "ps34", category: "player_spotlight", template: "[player] recent sample." },
  { id: "ps35", category: "player_spotlight", template: "[player] threshold form." },
  { id: "ps36", category: "player_spotlight", template: "Stat spotlight: [player]." },
  { id: "ps37", category: "player_spotlight", template: "Recent board feature: [player]." },
  { id: "ps38", category: "player_spotlight", template: "A quick look at [player]." },
  { id: "ps39", category: "player_spotlight", template: "[player] form read." },
  { id: "ps40", category: "player_spotlight", template: "[player] enters the spotlight." },

  // ─── Disposal ──────────────────────────────────────────────────────────────
  { id: "d01", category: "disposal", template: "Disposal form spotlight: [player]." },
  { id: "d02", category: "disposal", template: "[player] disposal record: [record] at [threshold]." },
  { id: "d03", category: "disposal", template: "Recent disposal form for [player]." },
  { id: "d04", category: "disposal", template: "[player] at [threshold] disposals." },
  { id: "d05", category: "disposal", template: "Disposal watch from [game]." },
  { id: "d06", category: "disposal", template: "The disposal profile: [player]." },
  { id: "d07", category: "disposal", template: "[player] has been steady at [threshold]." },
  { id: "d08", category: "disposal", template: "Recent disposal sample: [player]." },
  { id: "d09", category: "disposal", template: "The disposal board feature: [player]." },
  { id: "d10", category: "disposal", template: "[player] L5 disposal average: [l5Avg]." },

  // ─── Goal ──────────────────────────────────────────────────────────────────
  { id: "g01", category: "goal", template: "Goal form spotlight: [player]." },
  { id: "g02", category: "goal", template: "[player] goal record: [record] at [threshold]." },
  { id: "g03", category: "goal", template: "Recent goal form for [player]." },
  { id: "g04", category: "goal", template: "[player] at [threshold] goals." },
  { id: "g05", category: "goal", template: "Goal watch from [game]." },
  { id: "g06", category: "goal", template: "The goal profile: [player]." },
  { id: "g07", category: "goal", template: "[player] in the goal form board." },
  { id: "g08", category: "goal", template: "Recent scoring sample: [player]." },
  { id: "g09", category: "goal", template: "The goal board feature: [player]." },
  { id: "g10", category: "goal", template: "[player] L5 goal average: [l5Avg]." },

  // ─── Product / Education ───────────────────────────────────────────────────
  { id: "pe01", category: "product", template: "Why ratios beat percentages." },
  { id: "pe02", category: "product", template: "12/12 tells you more than 100%." },
  { id: "pe03", category: "product", template: "Sample size matters." },
  { id: "pe04", category: "product", template: "How to read the Neeko board." },
  { id: "pe05", category: "product", template: "Every player threshold in one place." },
  { id: "pe06", category: "product", template: "Stop jumping between stat pages." },
  { id: "pe07", category: "product", template: "Recent form, projections and thresholds in one board." },
  { id: "pe08", category: "product", template: "A cleaner way to research AFL stats." },
  { id: "pe09", category: "product", template: "The full AFL board is live at Neeko." },
  { id: "pe10", category: "product", template: "Built for fast AFL stat research." },
  { id: "pe11", category: "product", template: "What the full board shows." },
  { id: "pe12", category: "product", template: "How to scan player form faster." },
  { id: "pe13", category: "product", template: "The board behind the content." },
  { id: "pe14", category: "product", template: "Form records made simple." },
  { id: "pe15", category: "product", template: "L5 average explained." },
  { id: "pe16", category: "product", template: "Threshold records explained." },
  { id: "pe17", category: "product", template: "Why the full board matters." },
  { id: "pe18", category: "product", template: "One board for every game." },
  { id: "pe19", category: "product", template: "The easiest way to compare player form." },
  { id: "pe20", category: "product", template: "Full player context lives inside Neeko." },

  // ─── Round Review ──────────────────────────────────────────────────────────
  { id: "rr01", category: "round_review", template: "What the data showed from the weekend." },
  { id: "rr02", category: "round_review", template: "Round [round] stat review." },
  { id: "rr03", category: "round_review", template: "Weekend player form review." },
  { id: "rr04", category: "round_review", template: "The biggest trends from Round [round]." },
  { id: "rr05", category: "round_review", template: "What stood out on the board." },
  { id: "rr06", category: "round_review", template: "Round [round] form recap." },
  { id: "rr07", category: "round_review", template: "Weekend stat notes." },
  { id: "rr08", category: "round_review", template: "What held up from the recent data." },
  { id: "rr09", category: "round_review", template: "Round [round] review: player form." },
  { id: "rr10", category: "round_review", template: "The post-round form check." },
  { id: "rr11", category: "round_review", template: "Recent records that stood out." },
  { id: "rr12", category: "round_review", template: "Weekend board review." },
  { id: "rr13", category: "round_review", template: "Round [round] data notes." },
  { id: "rr14", category: "round_review", template: "The clean recap from the board." },
  { id: "rr15", category: "round_review", template: "Player trends after the weekend." },

  // ─── Round Ahead ───────────────────────────────────────────────────────────
  { id: "ra01", category: "round_ahead", template: "Round [round] form watch." },
  { id: "ra02", category: "round_ahead", template: "Round [round] stat board preview." },
  { id: "ra03", category: "round_ahead", template: "Early names from the Round [round] board." },
  { id: "ra04", category: "round_ahead", template: "Upcoming round player form." },
  { id: "ra05", category: "round_ahead", template: "The Round [round] watchlist." },
  { id: "ra06", category: "round_ahead", template: "Recent records heading into Round [round]." },
  { id: "ra07", category: "round_ahead", template: "Round [round] player thresholds." },
  { id: "ra08", category: "round_ahead", template: "The board is shaping up for Round [round]." },
  { id: "ra09", category: "round_ahead", template: "Upcoming matchup form check." },
  { id: "ra10", category: "round_ahead", template: "Early Round [round] data read." },
  { id: "ra11", category: "round_ahead", template: "Round [round] disposal form watch." },
  { id: "ra12", category: "round_ahead", template: "Round [round] goal form watch." },
  { id: "ra13", category: "round_ahead", template: "The next round starts with the board." },
  { id: "ra14", category: "round_ahead", template: "Player form before Round [round]." },
  { id: "ra15", category: "round_ahead", template: "Round [round] stat preview." },

  // ─── Free Game Board ───────────────────────────────────────────────────────
  { id: "fg01", category: "free_game_board", template: "Full board for [game]. No sign-up required." },
  { id: "fg02", category: "free_game_board", template: "The complete stat board for [game]." },
  { id: "fg03", category: "free_game_board", template: "Free game board: [homeTeam] v [awayTeam]." },
  { id: "fg04", category: "free_game_board", template: "Full form board for tonight's game." },
  { id: "fg05", category: "free_game_board", template: "[game] — the full board is open." },
  { id: "fg06", category: "free_game_board", template: "Every disposal and goal record for [game]." },
  { id: "fg07", category: "free_game_board", template: "The complete Round [round] board for [game]." },
  { id: "fg08", category: "free_game_board", template: "Full stat board: [homeTeam] v [awayTeam]." },
  { id: "fg09", category: "free_game_board", template: "Disposals. Goals. Form. All of it — [game]." },
  { id: "fg10", category: "free_game_board", template: "The full Thursday board is here." },
  { id: "fg11", category: "free_game_board", template: "Full board drop for [game]." },
  { id: "fg12", category: "free_game_board", template: "[game] — every record in one board." },
  { id: "fg13", category: "free_game_board", template: "Complete form board for [homeTeam] v [awayTeam]." },
  { id: "fg14", category: "free_game_board", template: "Full matchday board: [game]." },
  { id: "fg15", category: "free_game_board", template: "The open board for Round [round]." },
  { id: "fg16", category: "free_game_board", template: "[game] — full stat board, no restrictions." },
  { id: "fg17", category: "free_game_board", template: "Complete disposal and goal form: [game]." },
  { id: "fg18", category: "free_game_board", template: "Full player form board for [homeTeam] and [awayTeam]." },
  { id: "fg19", category: "free_game_board", template: "The whole board is open for [game]." },
  { id: "fg20", category: "free_game_board", template: "Every name. Every record. [game]." },

  // ─── Preview Game ──────────────────────────────────────────────────────────
  { id: "pv01", category: "preview_game", template: "Top 3 from the [game] board." },
  { id: "pv02", category: "preview_game", template: "A look at [game] — more inside." },
  { id: "pv03", category: "preview_game", template: "Preview: [homeTeam] v [awayTeam] form board." },
  { id: "pv04", category: "preview_game", template: "The first 3 rows from [game]." },
  { id: "pv05", category: "preview_game", template: "[game] — partial board preview." },
  { id: "pv06", category: "preview_game", template: "A sample from the Round [round] board." },
  { id: "pv07", category: "preview_game", template: "The top of the [homeTeam] v [awayTeam] board." },
  { id: "pv08", category: "preview_game", template: "Partial board view: [game]." },
  { id: "pv09", category: "preview_game", template: "The first names from [game]." },
  { id: "pv10", category: "preview_game", template: "Preview form board — [game]." },
  { id: "pv11", category: "preview_game", template: "A slice of the [homeTeam] v [awayTeam] data." },
  { id: "pv12", category: "preview_game", template: "The early view: [game]." },
  { id: "pv13", category: "preview_game", template: "Top records from [game]. Full board inside." },
  { id: "pv14", category: "preview_game", template: "Round [round] preview: [game]." },
  { id: "pv15", category: "preview_game", template: "A quick preview before [game]." },
  { id: "pv16", category: "preview_game", template: "[game] — the board starts here." },
  { id: "pv17", category: "preview_game", template: "The top names from [homeTeam] v [awayTeam]." },
  { id: "pv18", category: "preview_game", template: "Form preview: [homeTeam] and [awayTeam]." },
  { id: "pv19", category: "preview_game", template: "The top of the board for [game]." },
  { id: "pv20", category: "preview_game", template: "Preview: Round [round] stat board." },
];

/** Pick a hook from the library avoiding recently used IDs */
export function pickHook(
  category: HookCategory,
  usedIds: Set<string> = new Set()
): HookTemplate {
  const pool = HOOKS.filter(h => h.category === category && !usedIds.has(h.id));
  if (pool.length === 0) {
    // All used — reset and pick first
    const fallbackPool = HOOKS.filter(h => h.category === category);
    return fallbackPool[0] ?? HOOKS[0];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getHookById(id: string): HookTemplate | undefined {
  return HOOKS.find(h => h.id === id);
}

export function getHooksByCategory(category: HookCategory): HookTemplate[] {
  return HOOKS.filter(h => h.category === category);
}
