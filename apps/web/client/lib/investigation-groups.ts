// The investigations list's sections (This week, Last week, then by month), its short dates and its search.
const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;
/** `getDay()` gives Sunday as 0: the week starts on Monday. */
const SUNDAY = 0;

type Dated = { title: string; createdAt: number };

export type DatedGroup<T> = { label: string; items: T[] };

/** Midnight at the start of `at`'s day, in local time. */
function startOfDay(at: number): number {
  const date = new Date(at);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Midnight on the Monday of `at`'s week. */
function startOfWeek(at: number): number {
  const day = new Date(at).getDay();
  const back = day === SUNDAY ? DAYS_PER_WEEK - 1 : day - 1;
  const monday = new Date(startOfDay(at));
  monday.setDate(monday.getDate() - back);
  return monday.getTime();
}

function sectionOf(at: number, now: number): string {
  const week = startOfWeek(now);
  if (at >= week) {
    return 'This week';
  }
  if (at >= week - DAYS_PER_WEEK * DAY_MS) {
    return 'Last week';
  }
  return new Date(at).toLocaleDateString('en', { month: 'long', year: 'numeric' });
}

/** `items` newest first, cut into sections that keep that order. */
export function groupByWeek<T extends Dated>(items: readonly T[], now: number): DatedGroup<T>[] {
  const groups: DatedGroup<T>[] = [];
  for (const item of items) {
    const label = sectionOf(item.createdAt, now);
    const last = groups.at(-1);
    if (last?.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }
  return groups;
}

/** "Today", "Yesterday", "Nov 6", or "Nov 6, 2025" in another year. */
export function shortDate(at: number, now: number): string {
  const today = startOfDay(now);
  if (at >= today) {
    return 'Today';
  }
  if (at >= today - DAY_MS) {
    return 'Yesterday';
  }
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Date(at).toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** The investigations whose title holds every word typed, in any case. */
export function searchInvestigations<T extends Dated>(items: readonly T[], text: string): T[] {
  const words = text
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word !== '');
  return items.filter((item) => words.every((word) => item.title.toLowerCase().includes(word)));
}
