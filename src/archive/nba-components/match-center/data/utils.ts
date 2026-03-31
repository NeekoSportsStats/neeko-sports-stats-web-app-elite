export const cx = (...c: Array<string | false | undefined>) =>
  c.filter(Boolean).join(" ");

/* -------------------------------------------------------------------------- */
/*                               DATE FORMATTERS                              */
/* -------------------------------------------------------------------------- */

export function formatDateShort(dateISO: string) {
  const d = new Date(dateISO + "T00:00:00");
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const day = d.toLocaleDateString(undefined, { day: "2-digit" });
  const month = d.toLocaleDateString(undefined, { month: "short" });
  return `${weekday} ${day} ${month}`;
}

/** Used in MatchDetailHeader */
export function formatDateLong(dateISO: string) {
  const d = new Date(dateISO + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatDayHeader(dateISO: string) {
  const d = new Date(dateISO + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/* -------------------------------------------------------------------------- */
/*                                NUMBER FORMAT                               */
/* -------------------------------------------------------------------------- */

export function formatCrowd(n?: number) {
  if (!n && n !== 0) return "—";
  return n.toLocaleString();
}
