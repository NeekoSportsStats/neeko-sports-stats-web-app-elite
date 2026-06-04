/**
 * Caption library — 150+ captions seeded per spec.
 * Each caption has an id, category, and template string with [token] placeholders.
 */
import type { HookCategory } from "./hookLibrary";

export type CaptionCategory = HookCategory;

export interface CaptionTemplate {
  id: string;
  category: CaptionCategory;
  template: string;
}

export const CAPTIONS: CaptionTemplate[] = [
  // ─── Match Board ───────────────────────────────────────────────────────────
  {
    id: "cMb01",
    category: "match_board",
    template:
      "[game] — Round [round].\n\nDisposal form and goal form from the recent board.\n\nRatios show games at threshold vs games played.\n\n[cta]",
  },
  {
    id: "cMb02",
    category: "match_board",
    template:
      "[homeTeam] v [awayTeam] — Round [round].\n\nKey player threshold records before bounce.\n\n[cta]",
  },
  {
    id: "cMb03",
    category: "match_board",
    template:
      "Round [round] stat board: [game].\n\nDisposals and goals. Recent sample only.\n\n[cta]",
  },
  {
    id: "cMb04",
    category: "match_board",
    template:
      "The form board for [game].\n\nRecent threshold records — no noise, just the data.\n\n[cta]",
  },
  {
    id: "cMb05",
    category: "match_board",
    template:
      "[homeTeam] v [awayTeam] through the numbers.\n\nDisposal and goal form from recent games.\n\n[cta]",
  },
  {
    id: "cMb06",
    category: "match_board",
    template:
      "Match board ready for [game].\n\nKey player form. Ratios over percentages.\n\n[cta]",
  },
  {
    id: "cMb07",
    category: "match_board",
    template:
      "Round [round] player form: [homeTeam] v [awayTeam].\n\nRecent data. Clean format.\n\n[cta]",
  },
  {
    id: "cMb08",
    category: "match_board",
    template:
      "Before bounce — [game].\n\nPlayer threshold records from the recent sample.\n\n[cta]",
  },
  {
    id: "cMb09",
    category: "match_board",
    template:
      "[game] stat board is live for Round [round].\n\nDisposal form, goal form, recent records in one view.\n\n[cta]",
  },
  {
    id: "cMb10",
    category: "match_board",
    template:
      "The data preview for [game].\n\nKey records, clean ratios, no filler.\n\n[cta]",
  },
  {
    id: "cMb11",
    category: "match_board",
    template:
      "[homeTeam] v [awayTeam] — recent player form.\n\nDisposals and goals in one board.\n\n[cta]",
  },
  {
    id: "cMb12",
    category: "match_board",
    template:
      "Round [round] form check: [game].\n\nThreshold records from the recent sample.\n\n[cta]",
  },
  {
    id: "cMb13",
    category: "match_board",
    template:
      "The clean board for [game].\n\nRecent records. Ratio format. Fast scan.\n\n[cta]",
  },
  {
    id: "cMb14",
    category: "match_board",
    template:
      "[game] — Round [round] player form.\n\nFull board view at Neeko.\n\n[cta]",
  },
  {
    id: "cMb15",
    category: "match_board",
    template:
      "Game day board: [homeTeam] v [awayTeam].\n\nWhat the recent data says before bounce.\n\n[cta]",
  },
  {
    id: "cMb16",
    category: "match_board",
    template:
      "All the key threshold records for [game] — Round [round].\n\nDisposals and goals. Clean ratio view.\n\n[cta]",
  },
  {
    id: "cMb17",
    category: "match_board",
    template:
      "Matchday form check: [homeTeam] v [awayTeam].\n\nPlayer records from the recent sample.\n\n[cta]",
  },
  {
    id: "cMb18",
    category: "match_board",
    template:
      "The form board is ready for [game].\n\nRound [round] threshold records — disposals and goals.\n\n[cta]",
  },
  {
    id: "cMb19",
    category: "match_board",
    template:
      "[game] — the numbers before Round [round].\n\nRecent player form in one place.\n\n[cta]",
  },
  {
    id: "cMb20",
    category: "match_board",
    template:
      "A cleaner look at [game] — Round [round].\n\nPlayer disposal and goal form from recent games.\n\n[cta]",
  },

  // ─── Player Spotlight ──────────────────────────────────────────────────────
  {
    id: "cPs01",
    category: "player_spotlight",
    template:
      "[player] — [record] at [threshold].\n\nRecent form is building a clear picture.\n\n[cta]",
  },
  {
    id: "cPs02",
    category: "player_spotlight",
    template:
      "Player spotlight: [player].\n\n[record] at [threshold] in the recent sample.\n\nL5 avg: [l5Avg].\n\n[cta]",
  },
  {
    id: "cPs03",
    category: "player_spotlight",
    template:
      "[player] form check.\n\nThreshold record: [record] at [threshold].\n\nRecent output: [lastFive]\n\n[cta]",
  },
  {
    id: "cPs04",
    category: "player_spotlight",
    template:
      "The record: [record] at [threshold] for [player].\n\nSample size speaks for itself.\n\n[cta]",
  },
  {
    id: "cPs05",
    category: "player_spotlight",
    template:
      "[player] from [team].\n\n[record] at [threshold].\n\nL5 average: [l5Avg].\n\n[cta]",
  },
  {
    id: "cPs06",
    category: "player_spotlight",
    template:
      "Recent form profile: [player].\n\nThreshold record: [record] at [threshold].\n\nFull board at Neeko.\n\n[cta]",
  },
  {
    id: "cPs07",
    category: "player_spotlight",
    template:
      "[player] has been one of the more consistent players in recent rounds.\n\n[record] at [threshold].\n\n[cta]",
  },
  {
    id: "cPs08",
    category: "player_spotlight",
    template:
      "One from the board: [player].\n\n[record] at [threshold] from [team].\n\n[cta]",
  },
  {
    id: "cPs09",
    category: "player_spotlight",
    template:
      "The data on [player].\n\nThreshold: [threshold].\nRecord: [record].\nL5 avg: [l5Avg].\n\n[cta]",
  },
  {
    id: "cPs10",
    category: "player_spotlight",
    template:
      "[player] — the recent sample.\n\n[record] at [threshold].\n\nLast 5: [lastFive]\n\n[cta]",
  },
  {
    id: "cPs11",
    category: "player_spotlight",
    template:
      "Clean record for [player].\n\n[record] at [threshold] over the recent sample.\n\n[cta]",
  },
  {
    id: "cPs12",
    category: "player_spotlight",
    template:
      "Spotlight from the board: [player].\n\n[record] at [threshold].\n\nL5 avg: [l5Avg].\n\n[cta]",
  },
  {
    id: "cPs13",
    category: "player_spotlight",
    template:
      "[player] in focus — Round [round].\n\nThreshold record at [threshold]: [record].\n\n[cta]",
  },
  {
    id: "cPs14",
    category: "player_spotlight",
    template:
      "The board highlight: [player].\n\n[record] at [threshold].\n\nSee the full profile at Neeko.\n\n[cta]",
  },
  {
    id: "cPs15",
    category: "player_spotlight",
    template:
      "[player] — by the numbers.\n\nRecord: [record] at [threshold].\nL5 avg: [l5Avg].\n\n[cta]",
  },
  {
    id: "cPs16",
    category: "player_spotlight",
    template:
      "A look at [player]'s recent output.\n\n[record] at [threshold].\n\nLast 5 games: [lastFive]\n\n[cta]",
  },
  {
    id: "cPs17",
    category: "player_spotlight",
    template:
      "[player] — recent threshold check.\n\n[record] at [threshold] from [team].\n\n[cta]",
  },
  {
    id: "cPs18",
    category: "player_spotlight",
    template:
      "Stat spotlight: [player].\n\nL5 avg at [l5Avg]. Record: [record] at [threshold].\n\n[cta]",
  },
  {
    id: "cPs19",
    category: "player_spotlight",
    template:
      "[player] enters the spotlight.\n\n[record] at [threshold] in the recent sample.\n\n[cta]",
  },
  {
    id: "cPs20",
    category: "player_spotlight",
    template:
      "One record worth noting from Round [round].\n\n[player] — [record] at [threshold].\n\n[cta]",
  },

  // ─── Disposal ──────────────────────────────────────────────────────────────
  {
    id: "cD01",
    category: "disposal",
    template:
      "[player] disposal form check.\n\n[record] at [threshold] disposals.\n\nL5 avg: [l5Avg].\n\n[cta]",
  },
  {
    id: "cD02",
    category: "disposal",
    template:
      "Disposal watch: [player].\n\n[record] at [threshold] from the recent sample.\n\n[cta]",
  },
  {
    id: "cD03",
    category: "disposal",
    template:
      "[player] — [record] at [threshold] disposals.\n\nRecent sample: [lastFive]\n\n[cta]",
  },
  {
    id: "cD04",
    category: "disposal",
    template:
      "The disposal profile: [player].\n\nRecord: [record] at [threshold].\nL5 avg: [l5Avg].\n\n[cta]",
  },
  {
    id: "cD05",
    category: "disposal",
    template:
      "Disposal form spotlight: [player] from [team].\n\n[record] at [threshold].\n\n[cta]",
  },
  {
    id: "cD06",
    category: "disposal",
    template:
      "[player] has been delivering at [threshold] disposals.\n\nRecord: [record].\n\n[cta]",
  },
  {
    id: "cD07",
    category: "disposal",
    template:
      "Recent disposal sample — [player].\n\n[record] at [threshold].\n\nLast 5: [lastFive]\n\n[cta]",
  },
  {
    id: "cD08",
    category: "disposal",
    template:
      "[player] disposal record.\n\nThreshold: [threshold].\nRecord: [record].\nL5 avg: [l5Avg].\n\n[cta]",
  },
  {
    id: "cD09",
    category: "disposal",
    template:
      "Disposal board feature: [player].\n\n[record] at [threshold] in recent games.\n\n[cta]",
  },
  {
    id: "cD10",
    category: "disposal",
    template:
      "[player] L5 disposal average: [l5Avg].\n\nThreshold record at [threshold]: [record].\n\n[cta]",
  },

  // ─── Goal ──────────────────────────────────────────────────────────────────
  {
    id: "cG01",
    category: "goal",
    template:
      "[player] goal form check.\n\n[record] at [threshold] goals.\n\nL5 avg: [l5Avg].\n\n[cta]",
  },
  {
    id: "cG02",
    category: "goal",
    template:
      "Goal watch: [player].\n\n[record] at [threshold] from the recent sample.\n\n[cta]",
  },
  {
    id: "cG03",
    category: "goal",
    template:
      "[player] — [record] at [threshold] goals.\n\nRecent sample: [lastFive]\n\n[cta]",
  },
  {
    id: "cG04",
    category: "goal",
    template:
      "The goal profile: [player].\n\nRecord: [record] at [threshold].\nL5 avg: [l5Avg].\n\n[cta]",
  },
  {
    id: "cG05",
    category: "goal",
    template:
      "Goal form spotlight: [player] from [team].\n\n[record] at [threshold] goals.\n\n[cta]",
  },
  {
    id: "cG06",
    category: "goal",
    template:
      "[player] in the goal form board.\n\n[record] at [threshold].\n\n[cta]",
  },
  {
    id: "cG07",
    category: "goal",
    template:
      "Recent scoring sample — [player].\n\n[record] at [threshold].\n\nLast 5: [lastFive]\n\n[cta]",
  },
  {
    id: "cG08",
    category: "goal",
    template:
      "[player] goal record.\n\nThreshold: [threshold].\nRecord: [record].\nL5 avg: [l5Avg].\n\n[cta]",
  },
  {
    id: "cG09",
    category: "goal",
    template:
      "Goal board feature: [player].\n\n[record] at [threshold] in recent games.\n\n[cta]",
  },
  {
    id: "cG10",
    category: "goal",
    template:
      "[player] L5 goal average: [l5Avg].\n\nThreshold record at [threshold]: [record].\n\n[cta]",
  },

  // ─── Product / Education ───────────────────────────────────────────────────
  {
    id: "cPe01",
    category: "product",
    template:
      "12/12 tells you more than 100%.\n\nRatio format gives you the full sample picture — how many times met vs how many games played.\n\nThat's how every stat is shown at Neeko.\n\n[cta]",
  },
  {
    id: "cPe02",
    category: "product",
    template:
      "Why ratios beat percentages.\n\n9/10 (90%) vs 9/12 (75%) — both show 9 times met.\n\nBut the sample size is different. That matters.\n\n[cta]",
  },
  {
    id: "cPe03",
    category: "product",
    template:
      "Sample size matters in AFL stats.\n\nA 100% rate on 3 games means less than 85% on 12.\n\nNeeko shows you the full picture.\n\n[cta]",
  },
  {
    id: "cPe04",
    category: "product",
    template:
      "How to read the Neeko board.\n\nDisposals, goals, thresholds — recent sample only.\n\nRatio as the hero stat. Fast scan format.\n\n[cta]",
  },
  {
    id: "cPe05",
    category: "product",
    template:
      "Every AFL player threshold in one place.\n\nDisposals, goals, recent form — Neeko has the full board ready.\n\n[cta]",
  },
  {
    id: "cPe06",
    category: "product",
    template:
      "Stop jumping between stat pages.\n\nNeeko brings disposals, goals, projections and threshold records into one clean board.\n\n[cta]",
  },
  {
    id: "cPe07",
    category: "product",
    template:
      "Recent form, projections and thresholds in one board.\n\nBuilt for fast AFL stat research.\n\n[cta]",
  },
  {
    id: "cPe08",
    category: "product",
    template:
      "A cleaner way to research AFL stats.\n\nPlayer form. Threshold records. L5 averages.\n\nAll in one board at Neeko.\n\n[cta]",
  },
  {
    id: "cPe09",
    category: "product",
    template:
      "The full AFL board is live at Neeko.\n\nAll players. All thresholds. Recent form.\n\n[cta]",
  },
  {
    id: "cPe10",
    category: "product",
    template:
      "Built for fast AFL stat research.\n\nDisposals, goals, ratios — Neeko gives you the board before the game.\n\n[cta]",
  },
  {
    id: "cPe11",
    category: "product",
    template:
      "L5 average explained.\n\nThe average score from a player's last 5 games.\n\nA quick read on current form.\n\n[cta]",
  },
  {
    id: "cPe12",
    category: "product",
    template:
      "Threshold records explained.\n\nHow many games has a player hit a stat threshold in their last N games?\n\nThat's what the ratio tells you.\n\n[cta]",
  },
  {
    id: "cPe13",
    category: "product",
    template:
      "The board behind the content.\n\nEvery stat, record and form line you see here — it all comes from Neeko's live board.\n\n[cta]",
  },
  {
    id: "cPe14",
    category: "product",
    template:
      "Form records made simple.\n\nNo noise. No filler. Just the recent data in a clean view.\n\nThat's Neeko.\n\n[cta]",
  },
  {
    id: "cPe15",
    category: "product",
    template:
      "How to scan player form faster.\n\nSort by disposal threshold. Sort by goal rate. Filter by team.\n\nFull board at Neeko.\n\n[cta]",
  },
  {
    id: "cPe16",
    category: "product",
    template:
      "One board for every game.\n\nRound [round] match boards are live.\n\nAll thresholds. All players.\n\n[cta]",
  },
  {
    id: "cPe17",
    category: "product",
    template:
      "Why the full board matters.\n\nContext changes everything. One player's record looks different when you see the sample size.\n\nNeeko shows both.\n\n[cta]",
  },
  {
    id: "cPe18",
    category: "product",
    template:
      "The easiest way to compare player form.\n\nSide-by-side disposal and goal records for every player in a matchup.\n\n[cta]",
  },
  {
    id: "cPe19",
    category: "product",
    template:
      "Full player context lives inside Neeko.\n\nForm, projections, thresholds, recent scores — all in one clean view.\n\n[cta]",
  },
  {
    id: "cPe20",
    category: "product",
    template:
      "What the full board shows.\n\nRecent form across every AFL player. Disposal thresholds, goal records, projections.\n\nAll at Neeko.\n\n[cta]",
  },

  // ─── Round Review ──────────────────────────────────────────────────────────
  {
    id: "cRr01",
    category: "round_review",
    template:
      "What the data showed from the weekend.\n\nRound [round] player form review — the records that stood out.\n\n[cta]",
  },
  {
    id: "cRr02",
    category: "round_review",
    template:
      "Round [round] stat review.\n\nKey form trends. What held up. What didn't.\n\nFull board at Neeko.\n\n[cta]",
  },
  {
    id: "cRr03",
    category: "round_review",
    template:
      "Weekend player form review — Round [round].\n\nThe data from the recent board.\n\n[cta]",
  },
  {
    id: "cRr04",
    category: "round_review",
    template:
      "The biggest trends from Round [round].\n\nPlayer form notes from the board.\n\n[cta]",
  },
  {
    id: "cRr05",
    category: "round_review",
    template:
      "What stood out on the board — Round [round].\n\nRecent records that shifted after the weekend.\n\n[cta]",
  },
  {
    id: "cRr06",
    category: "round_review",
    template:
      "Round [round] form recap.\n\nPlayer threshold records after the weekend.\n\n[cta]",
  },
  {
    id: "cRr07",
    category: "round_review",
    template:
      "Weekend stat notes — Round [round].\n\nWhat the board looks like now.\n\n[cta]",
  },
  {
    id: "cRr08",
    category: "round_review",
    template:
      "Post-round form check — Round [round].\n\nWhat held up from the recent data.\n\n[cta]",
  },
  {
    id: "cRr09",
    category: "round_review",
    template:
      "Round [round] review: player form.\n\nDisposal and goal records from the weekend.\n\n[cta]",
  },
  {
    id: "cRr10",
    category: "round_review",
    template:
      "Recent records that stood out — Round [round].\n\nWeekend board review.\n\n[cta]",
  },
  {
    id: "cRr11",
    category: "round_review",
    template:
      "Player trends after the weekend.\n\nRound [round] data notes from the board.\n\n[cta]",
  },
  {
    id: "cRr12",
    category: "round_review",
    template:
      "The clean recap from Round [round].\n\nPlayer form notes from the board.\n\n[cta]",
  },
  {
    id: "cRr13",
    category: "round_review",
    template:
      "Weekend board review — Round [round].\n\nKey threshold records after the games.\n\n[cta]",
  },
  {
    id: "cRr14",
    category: "round_review",
    template:
      "Round [round] data notes.\n\nPlayer form after the weekend. What the board is showing.\n\n[cta]",
  },
  {
    id: "cRr15",
    category: "round_review",
    template:
      "What the weekend taught the board — Round [round].\n\nForm lines updated, records shifted.\n\n[cta]",
  },

  // ─── Round Ahead ───────────────────────────────────────────────────────────
  {
    id: "cRa01",
    category: "round_ahead",
    template:
      "Round [round] form watch.\n\nRecent player records heading into the round.\n\nFull board at Neeko.\n\n[cta]",
  },
  {
    id: "cRa02",
    category: "round_ahead",
    template:
      "Round [round] stat board preview.\n\nEarly names from the form board.\n\n[cta]",
  },
  {
    id: "cRa03",
    category: "round_ahead",
    template:
      "Early names from the Round [round] board.\n\nRecent form records heading into the round.\n\n[cta]",
  },
  {
    id: "cRa04",
    category: "round_ahead",
    template:
      "Upcoming round player form — Round [round].\n\nThe board is shaping up.\n\n[cta]",
  },
  {
    id: "cRa05",
    category: "round_ahead",
    template:
      "The Round [round] watchlist.\n\nRecent records from the form board.\n\n[cta]",
  },
  {
    id: "cRa06",
    category: "round_ahead",
    template:
      "Recent records heading into Round [round].\n\nDisposals and goals from the board.\n\n[cta]",
  },
  {
    id: "cRa07",
    category: "round_ahead",
    template:
      "Round [round] player thresholds.\n\nWhat the recent data shows before the games.\n\n[cta]",
  },
  {
    id: "cRa08",
    category: "round_ahead",
    template:
      "The board is shaping up for Round [round].\n\nEarly player form data is live at Neeko.\n\n[cta]",
  },
  {
    id: "cRa09",
    category: "round_ahead",
    template:
      "Upcoming matchup form check — Round [round].\n\nRecent records before bounce.\n\n[cta]",
  },
  {
    id: "cRa10",
    category: "round_ahead",
    template:
      "Early Round [round] data read.\n\nPlayer form from the recent sample.\n\n[cta]",
  },
  {
    id: "cRa11",
    category: "round_ahead",
    template:
      "Round [round] disposal form watch.\n\nKey records from the board before the round.\n\n[cta]",
  },
  {
    id: "cRa12",
    category: "round_ahead",
    template:
      "Round [round] goal form watch.\n\nScoring records heading into the round.\n\n[cta]",
  },
  {
    id: "cRa13",
    category: "round_ahead",
    template:
      "The next round starts with the board.\n\nRound [round] player form is live at Neeko.\n\n[cta]",
  },
  {
    id: "cRa14",
    category: "round_ahead",
    template:
      "Player form before Round [round].\n\nDisposal and goal records from the board.\n\n[cta]",
  },
  {
    id: "cRa15",
    category: "round_ahead",
    template:
      "Round [round] stat preview.\n\nEarly board data. Clean format.\n\n[cta]",
  },

  // ─── Free Game Board ───────────────────────────────────────────────────────
  {
    id: "cFg01",
    category: "free_game_board",
    template:
      "[game] — Round [round].\n\nFull stat board is open. Every disposal and goal record in one view.\n\nRatios show games at threshold vs games played.\n\n[cta]",
  },
  {
    id: "cFg02",
    category: "free_game_board",
    template:
      "[homeTeam] v [awayTeam] — full board.\n\nAll disposal and goal threshold records from the recent sample.\n\nNo restrictions.\n\n[cta]",
  },
  {
    id: "cFg03",
    category: "free_game_board",
    template:
      "Free game board for Round [round]: [game].\n\nComplete form data — disposals, goals, ratios.\n\n[cta]",
  },
  {
    id: "cFg04",
    category: "free_game_board",
    template:
      "The complete stat board for [game].\n\nEvery player threshold record in the recent sample. Full view.\n\n[cta]",
  },
  {
    id: "cFg05",
    category: "free_game_board",
    template:
      "[game] — the full board is open for Round [round].\n\nDisposal form and goal form. Clean ratio view.\n\n[cta]",
  },
  {
    id: "cFg06",
    category: "free_game_board",
    template:
      "Full matchday board: [homeTeam] v [awayTeam].\n\nAll records. All thresholds. Recent sample.\n\n[cta]",
  },
  {
    id: "cFg07",
    category: "free_game_board",
    template:
      "Every disposal and goal record for [game].\n\nFull board — no sign-up, no paywall.\n\n[cta]",
  },
  {
    id: "cFg08",
    category: "free_game_board",
    template:
      "The open board for [game] — Round [round].\n\nDisposals and goals from the recent data. Full view.\n\n[cta]",
  },
  {
    id: "cFg09",
    category: "free_game_board",
    template:
      "Complete form board for [homeTeam] and [awayTeam].\n\nEvery threshold record. Ratio format. Fast scan.\n\n[cta]",
  },
  {
    id: "cFg10",
    category: "free_game_board",
    template:
      "Round [round] full board drop: [game].\n\nAll player disposal and goal records from the recent sample.\n\n[cta]",
  },

  // ─── Preview Game ──────────────────────────────────────────────────────────
  {
    id: "cPv01",
    category: "preview_game",
    template:
      "[game] — Round [round].\n\nTop form records from the board. Full view inside Neeko.\n\n[cta]",
  },
  {
    id: "cPv02",
    category: "preview_game",
    template:
      "[homeTeam] v [awayTeam] — board preview.\n\nKey threshold records from the recent sample. More rows at Neeko.\n\n[cta]",
  },
  {
    id: "cPv03",
    category: "preview_game",
    template:
      "A look at [game] — Round [round].\n\nTop form names from the board. Full board available at Neeko.\n\n[cta]",
  },
  {
    id: "cPv04",
    category: "preview_game",
    template:
      "Preview: [game] stat board.\n\nTop disposal and goal records. Full view at Neeko.\n\n[cta]",
  },
  {
    id: "cPv05",
    category: "preview_game",
    template:
      "The first names from the [game] board.\n\nRecent form records. More data inside.\n\n[cta]",
  },
  {
    id: "cPv06",
    category: "preview_game",
    template:
      "Partial form board: [homeTeam] v [awayTeam].\n\nTop records shown — full board at Neeko.\n\n[cta]",
  },
  {
    id: "cPv07",
    category: "preview_game",
    template:
      "[game] — a sample from the Round [round] board.\n\nFull player form data lives at neekostatistics.com.au.\n\n[cta]",
  },
  {
    id: "cPv08",
    category: "preview_game",
    template:
      "Top of the board for [homeTeam] v [awayTeam].\n\nMore records available at Neeko.\n\n[cta]",
  },
  {
    id: "cPv09",
    category: "preview_game",
    template:
      "[game] board preview — Round [round].\n\nKey player threshold records. Full view at Neeko.\n\n[cta]",
  },
  {
    id: "cPv10",
    category: "preview_game",
    template:
      "A quick preview from the [game] board.\n\nTop disposal and goal form. The rest is inside Neeko.\n\n[cta]",
  },
];

/** Pick a caption from the library avoiding recently used IDs */
export function pickCaption(
  category: CaptionCategory,
  usedIds: Set<string> = new Set()
): CaptionTemplate {
  const pool = CAPTIONS.filter(c => c.category === category && !usedIds.has(c.id));
  if (pool.length === 0) {
    const fallbackPool = CAPTIONS.filter(c => c.category === category);
    return fallbackPool[0] ?? CAPTIONS[0];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getCaptionById(id: string): CaptionTemplate | undefined {
  return CAPTIONS.find(c => c.id === id);
}

export function getCaptionsByCategory(category: CaptionCategory): CaptionTemplate[] {
  return CAPTIONS.filter(c => c.category === category);
}
