import { StatLens } from "./getPlayers";

interface PerformanceSummaryInput {
  lens: StatLens;
  playerName: string;
  avg: number;
  min: number;
  max: number;
  gamesPlayed: number;
  volatility: number;
  hitRate80?: number;
  hitRate100?: number;
}

export function getPerformanceSummaryText({
  lens,
  playerName,
  avg,
  min,
  max,
  gamesPlayed,
  volatility,
  hitRate80 = 0,
  hitRate100 = 0,
}: PerformanceSummaryInput): string {
  if (!avg || avg === 0 || !gamesPlayed || gamesPlayed === 0) {
    return "Performance summary unavailable for this lens.";
  }

  if (lens === "fantasy") {
    return generateFantasySummary({ playerName, avg, min, max, gamesPlayed, volatility, hitRate80, hitRate100 });
  }

  if (lens === "disposals") {
    return generateDisposalsSummary({ playerName, avg, min, max, gamesPlayed, volatility });
  }

  return generateGoalsSummary({ playerName, avg, min, max, gamesPlayed, volatility });
}

interface SummaryParams {
  playerName: string;
  avg: number;
  min: number;
  max: number;
  gamesPlayed: number;
  volatility: number;
  hitRate80?: number;
  hitRate100?: number;
}

function generateFantasySummary({ playerName, avg, min, max, gamesPlayed, volatility, hitRate80 = 0, hitRate100 = 0 }: SummaryParams): string {
  const avgRounded = Math.round(avg);
  const maxRounded = Math.round(max);
  const minRounded = Math.round(min);
  const ceilingGap = max - avg;
  const floorRatio = min / avg;

  const volatilityPhrase = volatility > 25
    ? "demonstrating significant week-to-week volatility across varying match conditions"
    : volatility > 15
    ? "showing moderate scoring variance across different matchup contexts"
    : "demonstrating impressive consistency across varying match conditions";

  const ceilingPhrase = ceilingGap > 40
    ? `a scoring ceiling of ${maxRounded} highlights genuine premium upside capable of winning fantasy matchups outright`
    : ceilingGap > 25
    ? `a ceiling of ${maxRounded} points signals meaningful upside potential in favourable conditions`
    : `a ceiling of ${maxRounded} reflects reliable production without extreme fluctuations`;

  const floorPhrase = floorRatio >= 0.70
    ? `a floor of ${minRounded} confirms a strong scoring base that limits downside risk`
    : floorRatio >= 0.50
    ? `a floor of ${minRounded} suggests moderate downside exposure in difficult matchups`
    : `a floor of ${minRounded} indicates they carry real risk of low-scoring outings in tough conditions`;

  const hitRatePhrase = hitRate100 >= 50
    ? `Hitting 100+ fantasy points in ${Math.round(hitRate100)}% of games places them firmly in the elite tier`
    : hitRate80 >= 60
    ? `Crossing the 80-point threshold in ${Math.round(hitRate80)}% of appearances reflects dependable scoring output`
    : hitRate80 >= 40
    ? `Reaching 80+ points in ${Math.round(hitRate80)}% of games suggests moderate reliability with matchup-dependent upside`
    : `Hit rate data reflects a player whose output remains closely tied to game script and opponent quality`;

  const profilePhrase = avg > 110
    ? `${playerName} profiles as a premium-tier fantasy asset capable of delivering elite returns on a weekly basis`
    : avg > 95
    ? `${playerName} profiles as a strong fantasy contributor with reliable scoring potential across most fixtures`
    : avg > 80
    ? `${playerName} profiles as a solid mid-range option with the ceiling to impact competitive fantasy lineups`
    : `${playerName} profiles as a value option whose upside depends heavily on role security and matchup context`;

  const trendPhrase = volatility < 18
    ? "a consistent weekly scoring floor that rewards selection confidence"
    : "the potential for breakout performances alongside quieter outings, making matchup awareness essential";

  return `Across ${gamesPlayed} games this season, ${playerName} has produced an average of ${avgRounded} fantasy points, ${volatilityPhrase}. Their ${ceilingPhrase}, while their ${floorPhrase}. ${hitRatePhrase}, making them ${hitRate80 >= 60 ? "a reliable weekly starter" : "a situational selection"}. ${profilePhrase}, with their performance trend suggesting ${trendPhrase}.`;
}

function generateDisposalsSummary({ playerName, avg, min, max, gamesPlayed, volatility }: SummaryParams): string {
  const avgRounded = Math.round(avg);
  const ceilingGap = max - avg;

  const involvementPhrase = avg >= 30
    ? "elite ball-winning volume that establishes them as a premier accumulator"
    : avg >= 25
    ? "strong disposal numbers that reflect a key ball-winning role"
    : avg >= 20
    ? "solid touch counts that contribute meaningfully to team structure"
    : "moderate disposal volumes that reflect a secondary ball-winning role";

  const consistencyPhrase = volatility <= 10
    ? "elite consistency across every fixture"
    : volatility <= 18
    ? "reliable output regardless of opponent quality"
    : volatility <= 28
    ? "noticeable variance that tracks with game script and opponent pressure"
    : "significant fluctuations tied to defensive attention and game flow";

  const ceilingPhrase = ceilingGap >= 12
    ? `peak games reaching ${Math.round(max)} disposals highlight elite accumulation potential in open play`
    : `a ceiling of ${Math.round(max)} reflects consistent rather than explosive volume output`;

  const floorPhrase = min >= avg * 0.7
    ? `a floor of ${Math.round(min)} confirms they remain meaningfully involved even in their quieter outings`
    : `a floor of ${Math.round(min)} signals exposure when defensive plans are applied effectively`;

  const profilePhrase = avg >= 28
    ? `${playerName} is a genuine premium disposal accumulator who commands selection in most lineup configurations`
    : avg >= 22
    ? `${playerName} profiles as a reliable ball-winner whose touch counts support consistent fantasy scoring`
    : `${playerName} offers moderate disposal value with ceiling potential when given a free role`;

  return `Across ${gamesPlayed} games this season, ${playerName} has averaged ${avgRounded} disposals per match — ${involvementPhrase}. Their output reflects ${consistencyPhrase}, with their ${ceilingPhrase}. Their ${floorPhrase}. ${profilePhrase}, and their volatility profile of ${Math.round(volatility)} points suggests ${volatility <= 18 ? "a dependable accumulator suitable as a core selection" : "careful matchup assessment before selection"}.`;
}

function generateGoalsSummary({ playerName, avg, min, max, gamesPlayed, volatility }: SummaryParams): string {
  const avgFixed = avg.toFixed(1);
  const maxFixed = max.toFixed(1);
  const ceilingGap = max - avg;

  const scoringPhrase = avg >= 3.5
    ? "a dominant forward whose scoreboard presence demands defensive attention"
    : avg >= 2.5
    ? "a genuine scoring threat capable of influencing match results"
    : avg >= 1.5
    ? "a secondary scoring option who contributes regularly without being the focal point"
    : "an inside player whose goal output represents a supplementary rather than primary role";

  const ceilingPhrase = ceilingGap >= 3
    ? `spike games reaching ${maxFixed} goals confirm an elite ceiling capable of winning fantasy matchups`
    : `a ceiling of ${maxFixed} goals reflects consistent rather than explosive scoring output`;

  const consistencyPhrase = volatility <= 10
    ? "elite scoring reliability across all fixture types"
    : volatility <= 18
    ? "reliable output that holds up across varying defensive contexts"
    : "notable variance in their scoreboard contribution depending on opponent structure and game flow";

  const floorPhrase = min >= 1
    ? `rarely failing to hit the scoreboard ensures they deliver baseline fantasy value each week`
    : `goalkicking floor includes non-scoring appearances, creating week-to-week uncertainty`;

  const profilePhrase = avg >= 3
    ? `${playerName} profiles as a premium forward option whose goal output alone justifies selection`
    : avg >= 2
    ? `${playerName} is a reliable scoring threat who rewards selection when forward structure favours their role`
    : `${playerName} offers goals-based upside in the right matchup but carries selection risk in difficult contests`;

  return `Across ${gamesPlayed} games this season, ${playerName} has averaged ${avgFixed} goals per match — ${scoringPhrase}. Their ${ceilingPhrase}, while their ${consistencyPhrase} shapes their overall fantasy reliability. Importantly, ${floorPhrase}. ${profilePhrase}, with their volatility rating of ${Math.round(volatility)} indicating ${volatility <= 18 ? "confident selection potential" : "matchup-dependent fantasy value"}.`;
}
