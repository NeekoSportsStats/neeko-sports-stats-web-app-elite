export const FREE_PLAYER_IDS_BY_TEAM: Record<string, number[]> = {
  Adelaide: [152, 300, 396],        // Jordan Dawson, Izak Rankine, Ben Keays
  Brisbane: [148, 172, 603],        // Josh Dunkley, Lachie Neale, Will Ashcroft
  Carlton: [631, 216, 714],         // Patrick Cripps, Sam Walsh, Harry McKay
  Collingwood: [272, 326, 656],     // Nick Daicos, Josh Daicos, Jordan De Goey
  Essendon: [271, 188, 459],        // Zach Merrett, Andrew McGrath, Brayden Fiorini
  Fremantle: [355, 75, 192],        // Andrew Brayshaw, Caleb Serong, Luke Jackson
  Geelong: [362, 288, 354],         // Bailey Smith, Patrick Dangerfield, Jeremy Cameron
  "Gold Coast": [251, 317, 110],    // Touk Miller, Noah Anderson, Matt Rowell
  "Greater Western Sydney": [727, 372, 517], // Tom Green, Lachie Whitfield, Stephen Coniglio
  Hawthorn: [81, 470, 76],          // Jai Newcombe, Will Day, Dylan Moore
  Melbourne: [501, 89, 285],        // Max Gawn, Jack Viney, Jacob van Rooyen
  "North Melbourne": [387, 648, 284], // Harry Sheezel, Luke Davies-Uniacke, Nick Larkey
  "Port Adelaide": [14, 331, 162],  // Connor Rozee, Zak Butters, Jason Horne-Francis
  Richmond: [383, 117, 85],         // Jacob Hopper, Tim Taranto, Dion Prestia
  "St Kilda": [650, 356, 403],      // Mattaes Phillipou, Rowan Marshall, Max King
  Sydney: [496, 233, 665],          // Errol Gulden, Isaac Heeney, Chad Warner
  "West Coast": [154, 698, 275],    // Harley Reid, Reuben Ginbey, Tim Kelly
  "Western Bulldogs": [90, 167, 260], // Marcus Bontempelli, Tim English, Adam Treloar
};

export function isFreePLayerForTeam(playerId: number, teamName: string): boolean {
  return FREE_PLAYER_IDS_BY_TEAM[teamName]?.includes(playerId) ?? false;
}

export function isFreePlayer(playerId: number): boolean {
  return Object.values(FREE_PLAYER_IDS_BY_TEAM).some((ids) => ids.includes(playerId));
}
