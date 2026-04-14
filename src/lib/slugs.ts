export const nameToSlug = (name: string): string => {
  return name.toLowerCase().replace(/\s+/g, '-');
};

export const playerToSlug = (name: string, team?: string): string => {
  const baseSlug = nameToSlug(name);
  if (!team) return baseSlug;

  const teamSlug = TEAM_SLUGS[team] || nameToSlug(team);
  const teamSuffix = teamSlug.replace(/^(.*?)-.*/, '$1');

  return `${baseSlug}-${teamSuffix}`;
};

export const slugToName = (slug: string): string => {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const TEAM_SUFFIXES = new Set(
  Object.values(TEAM_SLUGS).map(s => s.replace(/^(.*?)-.*/, '$1'))
);

export const slugToPlayerName = (slug: string): string => {
  const parts = slug.split('-');
  const lastPart = parts[parts.length - 1];
  const stripped = TEAM_SUFFIXES.has(lastPart) ? parts.slice(0, -1) : parts;
  return stripped
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

export const TEAM_SLUG_TO_NAME: Record<string, string> = {
  'adelaide-crows': 'Adelaide Crows',
  'brisbane-lions': 'Brisbane Lions',
  'carlton-blues': 'Carlton Blues',
  'collingwood-magpies': 'Collingwood Magpies',
  'essendon-bombers': 'Essendon Bombers',
  'fremantle-dockers': 'Fremantle Dockers',
  'geelong-cats': 'Geelong Cats',
  'gold-coast-suns': 'Gold Coast Suns',
  'gws-giants': 'Greater Western Sydney Giants',
  'hawthorn-hawks': 'Hawthorn Hawks',
  'melbourne-demons': 'Melbourne Demons',
  'north-melbourne-kangaroos': 'North Melbourne Kangaroos',
  'port-adelaide-power': 'Port Adelaide Power',
  'richmond-tigers': 'Richmond Tigers',
  'st-kilda-saints': 'St Kilda Saints',
  'sydney-swans': 'Sydney Swans',
  'west-coast-eagles': 'West Coast Eagles',
  'western-bulldogs': 'Western Bulldogs',
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

export const POSITION_SLUG_TO_CODE: Record<string, string> = {
  'def': 'DEF',
  'mid': 'MID',
  'fwd': 'FWD',
  'ruck': 'RUC',
};
