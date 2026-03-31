export type AflVenue = keyof typeof AFL_STADIUM_BACKGROUNDS;

export const AFL_STADIUM_BACKGROUNDS = {
  "MCG": "https://images.pexels.com/photos/1263348/pexels-photo-1263348.jpeg",
  "Marvel Stadium": "https://images.pexels.com/photos/3571098/pexels-photo-3571098.jpeg",
  "Gabba": "https://images.pexels.com/photos/1884574/pexels-photo-1884574.jpeg",
  "Adelaide Oval": "https://images.pexels.com/photos/399187/pexels-photo-399187.jpeg",
  "Optus Stadium": "https://images.pexels.com/photos/274422/pexels-photo-274422.jpeg",
  "SCG": "https://images.pexels.com/photos/2506923/pexels-photo-2506923.jpeg",
  "GMHBA Stadium": "https://images.pexels.com/photos/1618269/pexels-photo-1618269.jpeg",
  "Blundstone Arena": "https://images.pexels.com/photos/1884576/pexels-photo-1884576.jpeg",
  "Heritage Bank Stadium": "https://images.pexels.com/photos/2277981/pexels-photo-2277981.jpeg",
  "Traeger Park": "https://images.pexels.com/photos/1545743/pexels-photo-1545743.jpeg",
} as const;

export interface StadiumBackgroundResult {
  url: string;
  source: "stadium" | "team_theme" | "fallback";
  venue?: string;
}

export function resolveStadiumBackground(venue: string | null | undefined): StadiumBackgroundResult | null {
  if (!venue) return null;
  const normalised = venue.trim();
  const url = AFL_STADIUM_BACKGROUNDS[normalised as AflVenue];
  if (url) {
    return { url, source: "stadium", venue: normalised };
  }
  return null;
}
