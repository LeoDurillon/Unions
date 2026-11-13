// A property of a tracker's item (a Notion page's property, a Jira issue's field) as a tracker tab lists it; browser-safe.

/**
 * One property: its id in the tracker, its name, its tracker type (`select`, `option`…), its value
 * as text (empty when it holds none), and whether Union can set it.
 */
export type TrackerProperty = {
  id: string;
  name: string;
  type: string;
  text: string;
  settable: boolean;
};

/** Names in a list read as `A, B`. */
export function joined(names: string[]): string {
  return names.filter((name) => name !== '').join(', ');
}

const DATE_TIME = /^(?<day>\d{4}-\d{2}-\d{2})T(?<time>\d{2}:\d{2})/u;

/** A date and time as the tracker gives it (`2026-11-12T16:15:00.000+01:00`) as `2026-11-12 16:15`; other text as is. */
export function shortDateTime(text: string): string {
  const match = DATE_TIME.exec(text);
  return match?.groups ? `${match.groups.day} ${match.groups.time}` : text;
}
