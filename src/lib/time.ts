// Human-friendly time formatting.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Compact relative time: "now", "3m", "2h", "5d", then a short date. */
export function ago(ms: number, now = Date.now()): string {
  const d = Math.max(0, now - ms);
  if (d < MIN) return "now";
  if (d < HOUR) return `${Math.floor(d / MIN)}m`;
  if (d < DAY) return `${Math.floor(d / HOUR)}h`;
  if (d < 7 * DAY) return `${Math.floor(d / DAY)}d`;
  return shortDate(ms);
}

/** Longer phrase: "just now", "3m ago". */
export function agoLong(ms: number): string {
  const a = ago(ms);
  if (a === "now") return "just now";
  return /^\d+[mhd]$/.test(a) ? `${a} ago` : a;
}

export function shortDate(ms: number): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function fullDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
