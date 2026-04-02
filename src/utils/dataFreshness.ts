import { formatDistanceToNow } from 'date-fns';

export interface DataFreshnessStatus {
  label: string;
  isLive: boolean;
  isStale: boolean;
  isCritical: boolean;
  minutes: number;
}

export function getDataFreshness(timestamp: string | Date | null | undefined): DataFreshnessStatus {
  if (!timestamp) {
    return {
      label: 'Unknown',
      isLive: false,
      isStale: true,
      isCritical: true,
      minutes: Infinity,
    };
  }

  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 5) {
    return {
      label: 'Live',
      isLive: true,
      isStale: false,
      isCritical: false,
      minutes,
    };
  }

  if (minutes < 60) {
    return {
      label: `Updated ${minutes} min${minutes !== 1 ? 's' : ''} ago`,
      isLive: false,
      isStale: false,
      isCritical: false,
      minutes,
    };
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return {
      label: `Updated ${hours} hour${hours !== 1 ? 's' : ''} ago`,
      isLive: false,
      isStale: hours > 6,
      isCritical: false,
      minutes,
    };
  }

  const days = Math.floor(hours / 24);
  return {
    label: `Updated ${days} day${days !== 1 ? 's' : ''} ago`,
    isLive: false,
    isStale: true,
    isCritical: true,
    minutes,
  };
}

export function formatRelativeTime(timestamp: string | Date | null | undefined): string {
  if (!timestamp) return 'Unknown';

  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return formatDistanceToNow(date, { addSuffix: true });
}

export function getStaleDataWarning(timestamp: string | Date | null | undefined): string | null {
  const freshness = getDataFreshness(timestamp);

  if (freshness.isCritical) {
    return 'Data may be outdated';
  }

  return null;
}
