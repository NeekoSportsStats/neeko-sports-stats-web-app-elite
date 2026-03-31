/**
 * SEO Page Utilities - Shared Formatting & Display Logic
 */

export const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
};

export const formatNumber = (num: number | null | undefined): string => {
  if (num === null || num === undefined) return '—';
  return Math.round(num).toString();
};

export const formatPercentage = (num: number | null | undefined): string => {
  if (num === null || num === undefined) return '—';
  return `${Math.round(num)}%`;
};

export const getRecommendationColor = (color: string): string => {
  if (color === 'green') return 'bg-green-500/10 text-green-700 border-green-500/20';
  if (color === 'red') return 'bg-red-500/10 text-red-700 border-red-500/20';
  return 'bg-slate-500/10 text-slate-700 border-slate-500/20';
};

export const getRecommendationDisplay = (rec: string): {
  text: string;
  icon: 'up' | 'down' | 'neutral';
} => {
  if (rec === 'BUY' || rec === 'STRONG_BUY') {
    return { text: rec, icon: 'up' };
  }
  if (rec === 'SELL' || rec === 'AVOID') {
    return { text: rec, icon: 'down' };
  }
  return { text: rec, icon: 'neutral' };
};

/**
 * Safe value display - never show broken/undefined stats
 */
export const safeStatDisplay = (
  value: number | null | undefined,
  format: 'number' | 'percentage' = 'number'
): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '—';
  }

  if (format === 'percentage') {
    return formatPercentage(value);
  }

  return formatNumber(value);
};

/**
 * Get color class for value tiers
 */
export const getValueColorClass = (valueScore: number): string => {
  if (valueScore >= 8) return 'text-green-600';
  if (valueScore >= 6) return 'text-blue-600';
  if (valueScore >= 4) return 'text-slate-600';
  return 'text-orange-600';
};

/**
 * Get confidence label
 */
export const getConfidenceLabel = (confidence: number): string => {
  if (confidence >= 80) return 'Very High';
  if (confidence >= 65) return 'High';
  if (confidence >= 50) return 'Medium';
  return 'Low';
};
