import { resolveStadiumBackground, type StadiumBackgroundResult } from "@/config/aflStadiumBackgrounds";
import { getTeamBackgroundTheme } from "@/config/teamBackgroundThemes";

export interface ResolvedBackground {
  type: "stadium_image" | "team_theme" | "none";
  imageUrl?: string;
  venue?: string;
  teamTheme?: ReturnType<typeof getTeamBackgroundTheme>;
}

export function useStadiumBackground(
  venue: string | null | undefined,
  fallbackTeam: string | null | undefined,
): ResolvedBackground {
  const stadium: StadiumBackgroundResult | null = resolveStadiumBackground(venue);

  if (stadium) {
    return {
      type: "stadium_image",
      imageUrl: stadium.url,
      venue: stadium.venue,
    };
  }

  if (fallbackTeam) {
    const theme = getTeamBackgroundTheme(fallbackTeam);
    if (theme) {
      return { type: "team_theme", teamTheme: theme };
    }
  }

  return { type: "none" };
}
