export const nameToSlug = (name: string): string => {
  return name.toLowerCase().replace(/\s+/g, '-');
};

export const slugToName = (slug: string): string => {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const TEAM_SLUGS: Record<string, string> = {
  'Adelaide Crows': 'adelaide-crows',
  'Brisbane Lions': 'brisbane-lions',
  'Carlton Blues': 'carlton-blues',
  'Collingwood Magpies': 'collingwood-magpies',
  'Essendon Bombers': 'essendon-bombers',
  'Fremantle Dockers': 'fremantle-dockers',
  'Geelong Cats': 'geelong-cats',
  'Gold Coast Suns': 'gold-coast-suns',
  'Greater Western Sydney Giants': 'gws-giants',
  'Hawthorn Hawks': 'hawthorn-hawks',
  'Melbourne Demons': 'melbourne-demons',
  'North Melbourne Kangaroos': 'north-melbourne-kangaroos',
  'Port Adelaide Power': 'port-adelaide-power',
  'Richmond Tigers': 'richmond-tigers',
  'St Kilda Saints': 'st-kilda-saints',
  'Sydney Swans': 'sydney-swans',
  'West Coast Eagles': 'west-coast-eagles',
  'Western Bulldogs': 'western-bulldogs',
};

export const POSITION_SLUGS: Record<string, string> = {
  'DEF': 'def',
  'MID': 'mid',
  'FWD': 'fwd',
  'RUC': 'ruck',
};

export const POSITION_NAMES: Record<string, string> = {
  'DEF': 'Defenders',
  'MID': 'Midfielders',
  'FWD': 'Forwards',
  'RUC': 'Rucks',
};
