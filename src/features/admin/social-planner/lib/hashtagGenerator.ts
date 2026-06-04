/**
 * Hashtag generator — builds platform-appropriate hashtag arrays.
 */
import type { ContentType, AFLGame, AFLPlayerStat } from "../types";

const AFL_BASE = ["#AFL", "#AFLStats", "#NeekoStats"];
const FANTASY_TAGS = ["#AFLFantasy", "#SuperCoach", "#DraftFantasy"];

export function generateHashtags(
  contentType: ContentType,
  game?: AFLGame,
  players?: AFLPlayerStat[],
  maxTags = 10
): string[] {
  const tags = new Set<string>(AFL_BASE);

  // Game-specific
  if (game) {
    tags.add(`#${teamHashtag(game.homeTeam)}`);
    tags.add(`#${teamHashtag(game.awayTeam)}`);
    if (game.round) tags.add(`#AFLRound${game.round}`);
  }

  // Content-type specific
  switch (contentType) {
    case "match_stat_board":
      tags.add("#AFLStatBoard");
      tags.add("#AFLForm");
      break;
    case "player_spotlight":
    case "player_spotlight_duo":
      tags.add("#AFLPlayerStats");
      if (players?.[0]) {
        tags.add(`#${playerHashtag(players[0].playerName)}`);
        tags.add(`#${teamHashtag(players[0].team)}`);
      }
      break;
    case "round_review":
      tags.add("#AFLRoundReview");
      tags.add("#AFLForm");
      break;
    case "round_ahead_watch":
      tags.add("#AFLFormWatch");
      break;
    case "product_education":
      tags.add("#AFLData");
      tags.add("#StatEducation");
      break;
    case "story_extra":
      tags.add("#AFLForm");
      break;
  }

  // Fantasy tags for player-focused content
  if (["player_spotlight", "player_spotlight_duo", "round_ahead_watch"].includes(contentType)) {
    FANTASY_TAGS.forEach(t => tags.add(t));
  }

  return Array.from(tags).slice(0, maxTags);
}

function teamHashtag(team: string): string {
  return team.replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, "");
}

function playerHashtag(name: string): string {
  return name.replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, "");
}
