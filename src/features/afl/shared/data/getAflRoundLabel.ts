/**
 * AFL-specific round label resolver
 *
 * Home & Away season: Rounds 1-24
 * Finals: Rounds 25-28
 */
export function getAflRoundLabel(roundNumber: number): string {
  if (roundNumber === 0) return "Round 1 (Upcoming)";
  if (roundNumber <= 24) {
    return `Round ${roundNumber}`;
  }

  switch (roundNumber) {
    case 25:
      return "Elimination / Qualifying Finals";
    case 26:
      return "Semi Finals";
    case 27:
      return "Preliminary Finals";
    case 28:
      return "Grand Final";
    default:
      // Fallback for unexpected round numbers beyond 28
      return `Finals Week ${roundNumber - 24}`;
  }
}
