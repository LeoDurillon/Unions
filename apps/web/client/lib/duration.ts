// How long something took, as the ticket panel says it: "45s", "3m 23s", "1h 22m".
const SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

/** A duration in its two largest units: "45s", "3m 23s", "4m", "1h 22m". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / SECOND));
  if (total < SECONDS_PER_MINUTE) {
    return `${total}s`;
  }
  if (total < SECONDS_PER_HOUR) {
    const minutes = Math.floor(total / SECONDS_PER_MINUTE);
    const seconds = total % SECONDS_PER_MINUTE;
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(total / SECONDS_PER_HOUR);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** How long the finished runs among `runs` took, together. */
export function runsDuration(
  runs: readonly { startedAt: number; finishedAt: number | null }[],
): number {
  return runs.reduce(
    (sum, run) => (run.finishedAt === null ? sum : sum + run.finishedAt - run.startedAt),
    0,
  );
}
