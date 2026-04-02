import { useState, useEffect } from 'react';
import { Clock, TriangleAlert as AlertTriangle, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDataFreshness, DataFreshnessStatus } from '@/utils/dataFreshness';
import { Badge } from '@/components/ui/badge';

interface DataFreshnessIndicatorProps {
  timestamp: string | Date | null | undefined;
  label?: string;
  variant?: 'default' | 'compact' | 'badge';
  showIcon?: boolean;
  className?: string;
}

export function DataFreshnessIndicator({
  timestamp,
  label = 'Data',
  variant = 'default',
  showIcon = true,
  className,
}: DataFreshnessIndicatorProps) {
  const [freshness, setFreshness] = useState<DataFreshnessStatus>(
    getDataFreshness(timestamp)
  );

  useEffect(() => {
    const updateFreshness = () => {
      setFreshness(getDataFreshness(timestamp));
    };

    updateFreshness();
    const interval = setInterval(updateFreshness, 30000);

    return () => clearInterval(interval);
  }, [timestamp]);

  if (variant === 'badge') {
    return (
      <Badge
        variant={freshness.isLive ? 'default' : freshness.isCritical ? 'destructive' : 'secondary'}
        className={cn('gap-1.5', className)}
      >
        {showIcon && (
          freshness.isLive ? (
            <Radio className="h-3 w-3 animate-pulse" />
          ) : freshness.isCritical ? (
            <AlertTriangle className="h-3 w-3" />
          ) : (
            <Clock className="h-3 w-3" />
          )
        )}
        <span>{freshness.label}</span>
      </Badge>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 text-xs',
          freshness.isLive && 'text-green-600 dark:text-green-400',
          freshness.isCritical && 'text-red-600 dark:text-red-400',
          !freshness.isLive && !freshness.isCritical && 'text-muted-foreground',
          className
        )}
      >
        {showIcon && (
          freshness.isLive ? (
            <Radio className="h-3 w-3 animate-pulse" />
          ) : freshness.isCritical ? (
            <AlertTriangle className="h-3 w-3" />
          ) : (
            <Clock className="h-3 w-3" />
          )
        )}
        <span>{freshness.label}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-1.5',
        freshness.isLive && 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950',
        freshness.isCritical && 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950',
        !freshness.isLive && !freshness.isCritical && 'border-border bg-muted/50',
        className
      )}
    >
      {showIcon && (
        freshness.isLive ? (
          <Radio className="h-4 w-4 text-green-600 dark:text-green-400 animate-pulse" />
        ) : freshness.isCritical ? (
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
        ) : (
          <Clock className="h-4 w-4 text-muted-foreground" />
        )
      )}
      <div className="flex flex-col gap-0.5">
        {label && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {label}
          </span>
        )}
        <span
          className={cn(
            'text-xs font-medium',
            freshness.isLive && 'text-green-700 dark:text-green-300',
            freshness.isCritical && 'text-red-700 dark:text-red-300',
            !freshness.isLive && !freshness.isCritical && 'text-foreground'
          )}
        >
          {freshness.label}
        </span>
      </div>
    </div>
  );
}

interface StaleDataWarningProps {
  timestamp: string | Date | null | undefined;
  className?: string;
}

export function StaleDataWarning({ timestamp, className }: StaleDataWarningProps) {
  const freshness = getDataFreshness(timestamp);

  if (!freshness.isCritical) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950',
        className
      )}
    >
      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          Data may be outdated
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Last updated {freshness.label.toLowerCase()}
        </p>
      </div>
    </div>
  );
}

interface MultiDataFreshnessProps {
  data: {
    label: string;
    timestamp: string | Date | null | undefined;
  }[];
  className?: string;
}

export function MultiDataFreshness({ data, className }: MultiDataFreshnessProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {data.map((item, idx) => (
        <DataFreshnessIndicator
          key={idx}
          timestamp={item.timestamp}
          label={item.label}
          variant="badge"
          showIcon={false}
        />
      ))}
    </div>
  );
}
