// Times as the panels say them: "5 min ago" for when something happened, "1:12" for how long it runs.
const SECOND = 1000;
const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const UNITS = [
  { ms: DAY, unit: 'day' },
  { ms: HOUR, unit: 'h' },
  { ms: MINUTE, unit: 'min' },
] as const;
const PAD = 2;

/** How long ago `at` was, in its largest unit: "just now", "5 min ago", "3 days ago". */
export function timeAgo(at: number, now: number): string {
  const since = Math.max(0, now - at);
  const found = UNITS.find(({ ms }) => since >= ms);
  if (!found) {
    return 'just now';
  }
  const count = Math.floor(since / found.ms);
  const unit = found.unit === 'day' && count > 1 ? 'days' : found.unit;
  return `${count} ${unit} ago`;
}

/** A duration as a clock: "0:07", "1:12", "1:02:05". */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / SECOND));
  const hours = Math.floor(total / (HOUR / SECOND));
  const minutes = Math.floor((total % (HOUR / SECOND)) / (MINUTE / SECOND));
  const seconds = String(total % (MINUTE / SECOND)).padStart(PAD, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(PAD, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}
