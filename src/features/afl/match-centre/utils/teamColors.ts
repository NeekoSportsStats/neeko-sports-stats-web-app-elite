export interface TeamColors {
  primary: string;
  secondary: string;
  contrast: string;
}

const AFL_TEAM_COLORS: Record<string, TeamColors> = {
  'adelaide': {
    primary: '#4A90E2',
    secondary: '#FFD100',
    contrast: '#FFFFFF',
  },
  'brisbane': {
    primary: '#F9C300',
    secondary: '#7C003E',
    contrast: '#000000',
  },
  'carlton': {
    primary: '#5B9BD5',
    secondary: '#FFFFFF',
    contrast: '#FFFFFF',
  },
  'collingwood': {
    primary: '#E8E8E8',
    secondary: '#FFFFFF',
    contrast: '#000000',
  },
  'essendon': {
    primary: '#E74C3C',
    secondary: '#000000',
    contrast: '#FFFFFF',
  },
  'fremantle': {
    primary: '#9B59B6',
    secondary: '#FFFFFF',
    contrast: '#FFFFFF',
  },
  'geelong': {
    primary: '#5DADE2',
    secondary: '#FFFFFF',
    contrast: '#FFFFFF',
  },
  'gold coast': {
    primary: '#E74C3C',
    secondary: '#FFD100',
    contrast: '#FFFFFF',
  },
  'gws': {
    primary: '#FF8C42',
    secondary: '#FFFFFF',
    contrast: '#FFFFFF',
  },
  'hawthorn': {
    primary: '#D4A373',
    secondary: '#F9C300',
    contrast: '#000000',
  },
  'melbourne': {
    primary: '#E74C3C',
    secondary: '#5B9BD5',
    contrast: '#FFFFFF',
  },
  'north melbourne': {
    primary: '#5B9BD5',
    secondary: '#FFFFFF',
    contrast: '#FFFFFF',
  },
  'port adelaide': {
    primary: '#48C9B0',
    secondary: '#000000',
    contrast: '#FFFFFF',
  },
  'richmond': {
    primary: '#FFD700',
    secondary: '#000000',
    contrast: '#000000',
  },
  'st kilda': {
    primary: '#E74C3C',
    secondary: '#000000',
    contrast: '#FFFFFF',
  },
  'sydney': {
    primary: '#FF6B9D',
    secondary: '#FFFFFF',
    contrast: '#FFFFFF',
  },
  'west coast': {
    primary: '#5B9BD5',
    secondary: '#FFD100',
    contrast: '#FFFFFF',
  },
  'western bulldogs': {
    primary: '#5B9BD5',
    secondary: '#E74C3C',
    contrast: '#FFFFFF',
  },
};

const SAFE_FALLBACKS = {
  blue: '#5B9BD5',
  gold: '#F5C84C',
  silver: '#C0C0C0',
  teal: '#48C9B0',
};

const DEFAULT_COLORS: TeamColors = {
  primary: '#F5C84C',
  secondary: '#FFFFFF',
  contrast: '#FFFFFF',
};

function normalizeTeamName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace('greater western sydney', 'gws')
    .replace('gws giants', 'gws')
    .replace('giants', 'gws')
    .replace(/\s+(tigers|blues|swans|eagles|dockers|demons|bombers|hawks|magpies|saints|kangaroos|power|cats|lions|suns|bulldogs)\s*$/i, '')
    .trim();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function colorDistance(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 1000;

  const rDiff = rgb1.r - rgb2.r;
  const gDiff = rgb1.g - rgb2.g;
  const bDiff = rgb1.b - rgb2.b;

  return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
}

function areColorsSimilar(hex1: string, hex2: string): boolean {
  return colorDistance(hex1, hex2) < 100;
}

function getRelativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const rsRGB = rgb.r / 255;
  const gsRGB = rgb.g / 255;
  const bsRGB = rgb.b / 255;

  const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
  const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
  const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hasGoodContrastOnBlack(hex: string): boolean {
  const colorLuminance = getRelativeLuminance(hex);
  const blackLuminance = 0;
  const contrastRatio = (colorLuminance + 0.05) / (blackLuminance + 0.05);
  return contrastRatio >= 3.5;
}

export function getTeamColors(teamName: string | null | undefined): TeamColors {
  const normalized = normalizeTeamName(teamName);
  return AFL_TEAM_COLORS[normalized] || DEFAULT_COLORS;
}

function ensureSafeColor(color: string, fallback: string = SAFE_FALLBACKS.gold): string {
  if (!hasGoodContrastOnBlack(color)) {
    return fallback;
  }
  return color;
}

export function getTeamPair(homeTeam: string | null | undefined, awayTeam: string | null | undefined) {
  const homeColors = getTeamColors(homeTeam);
  const awayColors = getTeamColors(awayTeam);

  let homePrimary = ensureSafeColor(homeColors.primary);
  let awayPrimary = ensureSafeColor(awayColors.primary, SAFE_FALLBACKS.teal);

  if (homePrimary === awayPrimary || areColorsSimilar(homePrimary, awayPrimary)) {
    if (awayColors.secondary !== '#FFFFFF' && !areColorsSimilar(homePrimary, awayColors.secondary)) {
      awayPrimary = ensureSafeColor(awayColors.secondary, SAFE_FALLBACKS.teal);
    } else {
      awayPrimary = SAFE_FALLBACKS.teal;
    }
  }

  return {
    home: {
      ...homeColors,
      primary: homePrimary,
    },
    away: {
      ...awayColors,
      primary: awayPrimary,
    },
  };
}
