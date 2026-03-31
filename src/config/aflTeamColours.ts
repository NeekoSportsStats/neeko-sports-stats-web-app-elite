export const AFL_TEAM_COLOURS: Record<string, string> = {
  Adelaide:          "#002B5C",
  ADEL:              "#002B5C",
  Brisbane:          "#7C1C3B",
  BL:                "#7C1C3B",
  Carlton:           "#001489",
  CARL:              "#001489",
  Collingwood:       "#1A1A1A",
  COLL:              "#1A1A1A",
  Essendon:          "#CC0000",
  ESS:               "#CC0000",
  Fremantle:         "#2F0066",
  FRE:               "#2F0066",
  Geelong:           "#1C3D7C",
  GEEL:              "#1C3D7C",
  "Gold Coast":      "#CC0000",
  GC:                "#CC0000",
  GWS:               "#F15A22",
  Hawthorn:          "#4D2004",
  HAW:               "#4D2004",
  Melbourne:         "#0C2340",
  MELB:              "#0C2340",
  "North Melbourne": "#0057B8",
  NM:                "#0057B8",
  "Port Adelaide":   "#008A8F",
  PORT:              "#008A8F",
  Richmond:          "#FFD200",
  RICH:              "#FFD200",
  "St Kilda":        "#ED1B2E",
  STK:               "#ED1B2E",
  Sydney:            "#E1251B",
  SYD:               "#E1251B",
  "West Coast":      "#003087",
  WCE:               "#003087",
  "Western Bulldogs": "#00205B",
  WB:                "#00205B",
};

export function getTeamAccentColour(team: string | null | undefined): string | null {
  if (!team) return null;
  const key = team.trim();
  return AFL_TEAM_COLOURS[key] ?? AFL_TEAM_COLOURS[key.toUpperCase()] ?? null;
}
