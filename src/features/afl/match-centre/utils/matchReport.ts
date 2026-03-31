export function generateMatchReport(match: {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}): string {
  const winner = match.homeScore > match.awayScore ? match.homeTeam : match.awayTeam;
  const loser = match.homeScore > match.awayScore ? match.awayTeam : match.homeTeam;
  const margin = Math.abs(match.homeScore - match.awayScore);
  const total = match.homeScore + match.awayScore;

  let dominance = "";
  if (margin >= 60) dominance = "complete dominance";
  else if (margin >= 40) dominance = "a commanding performance";
  else if (margin >= 20) dominance = "a strong victory";
  else dominance = "a hard fought contest";

  let scoring = "";
  if (total >= 200) scoring = "The match featured high scoring intensity.";
  else if (total >= 160) scoring = "Both teams generated strong scoring output.";
  else scoring = "Defensive pressure played a major role.";

  return (
    winner + " delivered " + dominance + ", defeating " + loser + " by " + margin + " points. " +
    winner + " controlled key moments and capitalised on their opportunities. " +
    scoring + " " +
    "This result reinforces their ability to convert momentum into scoreboard impact."
  );
}
