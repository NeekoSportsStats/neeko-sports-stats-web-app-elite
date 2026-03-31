
import { useMemo } from "react";

export function calcStats(values: number[]) {
  const total = values.reduce((a, b) => a + b, 0);
  return {
    total,
    avg: Math.round(total / values.length),
    min: Math.min(...values),
    max: Math.max(...values),
    gms: values.length,
  };
}

export function calcHitRate(values: number[], threshold: number) {
  const hits = values.filter((v) => v >= threshold).length;
  return Math.round((hits / values.length) * 100);
}

export function useSortedRows<T>(
  rows: T[],
  selector: (r: T) => number[]
) {
  return useMemo(() => {
    return rows
      .map((r) => {
        const values = selector(r);
        const total = values.reduce((a, b) => a + b, 0);
        return { row: r, values, total };
      })
      .sort((a, b) => b.total - a.total);
  }, [rows, selector]);
}
