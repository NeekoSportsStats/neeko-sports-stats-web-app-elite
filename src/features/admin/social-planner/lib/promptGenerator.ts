/**
 * Prompt generator — builds AI image prompts for cover slides and player spotlights.
 * No player photos. Stadium/field/abstract backgrounds only.
 */
import type { ContentType, AFLGame, AFLPlayerStat } from "../types";

const COVER_STYLE =
  "Clean dark sports graphic, no player photos, no text overlay visible, " +
  "premium abstract AFL aesthetic, deep navy and charcoal tones, " +
  "subtle stadium lighting or field texture.";

export function generateCoverPrompt(
  contentType: ContentType,
  game?: AFLGame,
  players?: AFLPlayerStat[]
): string {
  switch (contentType) {
    case "match_stat_board":
      return game
        ? `${COVER_STYLE} Matchday cover for ${game.homeTeam} vs ${game.awayTeam}. ` +
          `Abstract split-colour design representing both teams. No players, no text.`
        : `${COVER_STYLE} Generic AFL match board cover. Abstract stadium background.`;

    case "player_spotlight":
    case "player_spotlight_duo":
      return (
        `${COVER_STYLE} Player spotlight cover. ` +
        `Geometric data visualisation style. No faces or player photos. ` +
        `Abstract shape composition. Stat-card aesthetic.`
      );

    case "round_review":
      return (
        `${COVER_STYLE} Round review cover. Weekend football energy. ` +
        `Abstract field/oval texture. No specific players or teams.`
      );

    case "round_ahead_watch":
      return (
        `${COVER_STYLE} Upcoming round preview cover. ` +
        `Forward-looking energy, abstract motion blur or stadium lights.`
      );

    case "product_education":
      return (
        `${COVER_STYLE} Product education cover. ` +
        `Clean data/stats visual, number grid aesthetic, minimal and informative.`
      );

    case "story_extra":
      return `${COVER_STYLE} Story extra cover. Bold, minimal, dark background.`;
  }
}

export function generateSlidePrompt(
  slideTitle: string,
  homeTeam?: string,
  awayTeam?: string
): string {
  const teams =
    homeTeam && awayTeam
      ? ` for ${homeTeam} vs ${awayTeam}`
      : "";
  return (
    `Clean dark sports data slide${teams}. ` +
    `Title: "${slideTitle}". ` +
    `Premium stat card style. No player photos. Dark background, crisp typography layout.`
  );
}

export function generatePlayerSpotlightPrompt(playerName: string, team: string): string {
  return (
    `Clean dark sports stat card for ${playerName} from ${team}. ` +
    `Abstract geometric style, no real player photos. ` +
    `Premium AFL analytics aesthetic. Team colour accent.`
  );
}
