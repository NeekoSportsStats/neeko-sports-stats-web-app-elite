export function getRoundLabel(roundNum: number): string {
  const map: Record<number, string> = {
    0: "OR",
    25: "FW1",
    26: "SF",
    27: "PF",
    28: "GF",
  };
  return map[roundNum] || `R${roundNum}`;
}

export function getRoundTooltip(roundNum: number): string {
  const map: Record<number, string> = {
    0: "R0 (Opening Round)",
    25: "R25 (Finals Week 1)",
    26: "R26 (Semi Finals)",
    27: "R27 (Preliminary Finals)",
    28: "R28 (Grand Final)",
  };
  return map[roundNum] || `R${roundNum}`;
}
