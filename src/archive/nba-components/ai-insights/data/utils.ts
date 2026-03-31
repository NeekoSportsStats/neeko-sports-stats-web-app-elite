export const cx = (...c: Array<string | false | null | undefined>) =>
  c.filter(Boolean).join(" ");

export type StatLens = "fantasy" | "points" | "rebounds" | "assists" | "threes";

export const STAT_LABEL: Record<StatLens, string> = {
  fantasy: "Fantasy",
  points: "Points",
  rebounds: "Rebounds",
  assists: "Assists",
  threes: "3-Pointers",
};

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function mean(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function stdev(arr: number[]) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

export function cv(arr: number[]) {
  const m = mean(arr);
  if (!m) return 0;
  return stdev(arr) / Math.abs(m);
}

export function quantile(sortedAsc: number[], q: number) {
  if (!sortedAsc.length) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const b = Math.floor(pos);
  const r = pos - b;
  const a = sortedAsc[b] ?? sortedAsc[0];
  const c = sortedAsc[b + 1] ?? a;
  return a + r * (c - a);
}

export function band(values: number[], lo = 0.25, hi = 0.75) {
  const v = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  return { low: quantile(v, lo), high: quantile(v, hi) };
}

export function normalize01(x: number, min: number, max: number) {
  if (max === min) return 0;
  return clamp((x - min) / (max - min), 0, 1);
}

export function fmtRange(low: number, high: number) {
  const a = Math.round(low);
  const b = Math.round(high);
  return `${a}–${b}`;
}

export function confLabel(v01: number) {
  if (v01 >= 0.82) return "Very High";
  if (v01 >= 0.68) return "High";
  if (v01 >= 0.52) return "Medium";
  return "Low";
}

export function volLabel(v01: number) {
  if (v01 >= 0.75) return "Boom/Bust";
  if (v01 >= 0.55) return "Variable";
  return "Stable";
}

export function advantageLabel(d: number) {
  if (d >= 0.08) return "Advantage";
  if (d <= -0.08) return "Disadvantage";
  return "Neutral";
}

export function safeDiv(a: number, b: number) {
  if (!b) return 0;
  return a / b;
}
