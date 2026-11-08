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

/** How long until `at`, to the minute: "in 5 min", "in 1 h 40 min", "in 3 days"; "now" once it passed. */
export function timeUntil(at: number, now: number): string {
  const left = Math.ceil((at - now) / MINUTE) * MINUTE;
  if (left <= 0) {
    return 'now';
  }
  if (left >= DAY) {
    const days = Math.round(left / DAY);
    return `in ${days} ${days > 1 ? 'days' : 'day'}`;
  }
  const hours = Math.floor(left / HOUR);
  const minutes = Math.round((left % HOUR) / MINUTE);
  if (hours === 0) {
    return `in ${minutes} min`;
  }
  return minutes === 0 ? `in ${hours} h` : `in ${hours} h ${minutes} min`;
}

/** The time of day `at` falls on, with its weekday when it is not today: "18:22", "Tue 09:05". */
export function timeOfDay(at: number, now: number): string {
  const time = new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sameDay = new Date(at).toDateString() === new Date(now).toDateString();
  return sameDay ? time : `${new Date(at).toLocaleDateString([], { weekday: 'short' })} ${time}`;
}
