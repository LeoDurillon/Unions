// Tells a usage limit from other agent errors, and when the limit resets: from the CLI's event, else its message.

/** The CLI's wordings of a usage limit, old and current ("You've hit your session limit · resets 6:20pm (UTC)"). */
export const RATE_LIMIT =
  /usage limit|rate limit|limit reached|too many requests|session limit|weekly limit|hit your limit/iu;

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HALF_DAY_HOURS = 12;
const MS_PER_DAY = 86_400_000;
/** "resets 6:20pm (UTC)", "resets 11am (UTC)". Only UTC is read: another zone's offset is unknown here. */
const RESETS_UTC = /resets (?<hour>\d{1,2})(?::(?<minute>\d{2}))?\s*(?<meridiem>am|pm)\s*\(UTC\)/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * When the limit an agent hit resets, in ms, from a `rate_limit_event` whose status is `rejected`
 * (`rate_limit_info.resetsAt`, in seconds); null for any other line.
 */
export function rejectedResetAt(event: unknown): number | null {
  if (!isRecord(event) || event.type !== 'rate_limit_event' || !isRecord(event.rate_limit_info)) {
    return null;
  }
  const { status, resetsAt } = event.rate_limit_info;
  return status === 'rejected' && typeof resetsAt === 'number' ? resetsAt * MS_PER_SECOND : null;
}

/** The reset time a limit message names ("resets 6:20pm (UTC)"), the next one after `now`; else null. */
export function resetFromMessage(message: string, now: number): number | null {
  const groups = RESETS_UTC.exec(message)?.groups;
  if (!groups) {
    return null;
  }
  const { hour: hourText = '', minute: minuteText = '0', meridiem = '' } = groups;
  const hour =
    (Number(hourText) % HALF_DAY_HOURS) + (meridiem.toLowerCase() === 'pm' ? HALF_DAY_HOURS : 0);
  const day = new Date(now);
  const at =
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) +
    (hour * MINUTES_PER_HOUR + Number(minuteText)) * MS_PER_MINUTE;
  return at > now ? at : at + MS_PER_DAY;
}
